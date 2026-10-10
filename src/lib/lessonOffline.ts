import { canonicalPerson, lessonCorePerson, PEOPLE, personByProfileId } from "./canonical";
import { computeAge } from "./age";
import { FIELDS } from "./fields";
import { timed } from "./inspector";
import { MONGO_FIND_ONE, NAIVE_JOIN_SQL, RETRIEVE_PERSON_SQL } from "./lessonQuery";
import { SCENES } from "./scenes";
import { settingsPatchSchema, subscriptionPatchSchema } from "./validation";
import type { Settings, Subscription } from "./types";

type Row = Record<string, unknown>;

type Flags = { hobbies: boolean; pronouns: boolean; organizer: boolean };

type Store = {
  cities: Row[];
  users: Row[];
  user_education: Row[];
  user_photos: Row[];
  user_interests: Row[];
  user_settings: Row[];
  user_gender_preferences: Row[];
  subscriptions: Row[];
  subscription_history: Row[];
  user_hobbies: Row[];
  events: Row[];
  flags: Flags;
  seq: { photo: number; interest: number; gender: number; hobby: number; city: number };
};

const BROWSER_NOTE =
  "Browser lesson engine: the same nine-table model as the SQLite lesson, running in memory. Not node:sqlite and not Atlas. Table count is not query count.";

let store: Store | null = null;

function flags(): Flags {
  ensure();
  return store!.flags;
}

export function resetOfflineLesson() {
  store = {
    cities: [],
    users: [],
    user_education: [],
    user_photos: [],
    user_interests: [],
    user_settings: [],
    user_gender_preferences: [],
    subscriptions: [],
    subscription_history: [],
    user_hobbies: [],
    events: [],
    flags: { hobbies: false, pronouns: false, organizer: false },
    seq: { photo: 1, interest: 1, gender: 1, hobby: 1, city: 1 },
  };

  const cityIds = new Map<string, number>();
  for (const p of PEOPLE) {
    if (cityIds.has(p.city)) continue;
    const id = store.seq.city++;
    cityIds.set(p.city, id);
    store.cities.push({
      id,
      name: p.city,
      lng: p.location.coordinates[0],
      lat: p.location.coordinates[1],
    });
  }

  for (const raw of PEOPLE) {
    const p = raw.profileId === "giulia" ? lessonCorePerson(raw) : stripLessonExtras(raw);
    const cityId = cityIds.get(p.city) as number;
    store.users.push({
      id: p.id,
      display_name: p.displayName,
      gender: p.gender,
      birth_date: p.birthDate,
      height_cm: p.heightCm,
      body_type: p.bodyType ?? null,
      profession: p.profession ?? null,
      city_id: cityId,
      bio: p.bio,
    });
    if (p.education) store.user_education.push({ user_id: p.id, school: p.education });
    for (const photo of p.photos) {
      store.user_photos.push({
        id: store.seq.photo++,
        user_id: p.id,
        url: photo.url,
        sort_order: photo.sortOrder,
        caption: photo.caption ?? null,
      });
    }
    for (const interest of p.interests) {
      store.user_interests.push({
        id: store.seq.interest++,
        user_id: p.id,
        interest,
      });
    }
    const s = p.settings;
    store.user_settings.push({
      user_id: p.id,
      notifications_enabled: s.notificationsEnabled ? 1 : 0,
      discovery_distance_km: s.discoveryDistanceKm,
      min_desired_age: s.minDesiredAge,
      max_desired_age: s.maxDesiredAge,
      profile_visibility: s.profileVisibility,
      paused_account: s.pausedAccount ? 1 : 0,
    });
    for (const g of s.genderPreferences) {
      store.user_gender_preferences.push({
        id: store.seq.gender++,
        user_id: p.id,
        gender: g,
      });
    }
    if (p.subscriptionHistory) {
      for (const h of p.subscriptionHistory) {
        store.subscription_history.push({
          id: h.id,
          user_id: p.id,
          plan: h.plan,
          payment_method: h.paymentMethod,
          payment_status: h.paymentStatus,
          start_date: h.startDate,
          end_date: h.endDate,
          auto_renew: h.autoRenew ? 1 : 0,
        });
      }
    }
    store.subscriptions.push({
      id: p.subscription.id,
      user_id: p.id,
      plan: p.subscription.plan,
      payment_method: p.subscription.paymentMethod,
      payment_status: p.subscription.paymentStatus,
      start_date: p.subscription.startDate,
      end_date: p.subscription.endDate,
      auto_renew: p.subscription.autoRenew ? 1 : 0,
    });
  }
}

function stripLessonExtras(p: (typeof PEOPLE)[number]) {
  const clone = { ...p };
  delete clone.hobbies;
  delete clone.pronouns;
  delete clone.events;
  clone.profileType = "standard";
  return clone;
}

function ensure() {
  if (!store) resetOfflineLesson();
}

function forUser<T extends Row>(rows: T[], userId: number, key = "user_id") {
  return rows.filter((r) => r[key] === userId);
}

export function listOfflineTables(userId = 1) {
  ensure();
  const s = store!;
  const users = forUser(s.users, userId, "id");
  const cityId = users[0]?.city_id;
  const cities = cityId == null ? [] : s.cities.filter((c) => c.id === cityId);
  const photos = forUser(s.user_photos, userId).sort(
    (a, b) => Number(a.sort_order) - Number(b.sort_order),
  );
  const history = forUser(s.subscription_history, userId).sort((a, b) =>
    String(a.start_date).localeCompare(String(b.start_date)),
  );
  const f = flags();
  return {
    users,
    cities,
    user_education: forUser(s.user_education, userId),
    user_photos: photos,
    user_interests: forUser(s.user_interests, userId),
    user_settings: forUser(s.user_settings, userId),
    user_gender_preferences: forUser(s.user_gender_preferences, userId),
    subscriptions: forUser(s.subscriptions, userId),
    subscription_history: history,
    user_hobbies: f.hobbies ? forUser(s.user_hobbies, userId) : [],
    events: f.organizer ? forUser(s.events, userId, "organizer_id") : [],
    columns: { users: users[0] ? Object.keys(users[0]) : [] },
    flags: { ...f },
  };
}

export function retrieveOfflinePerson(userId = 1) {
  ensure();
  const started = Date.now();
  const tables = listOfflineTables(userId);
  const user = tables.users[0];
  if (!user) throw new Error("Person not found");
  const city = tables.cities[0] ?? {};
  const education = tables.user_education[0];
  const settings = tables.user_settings[0] ?? {};
  const sub = tables.subscriptions[0] ?? {};
  const photos = tables.user_photos.map((p) => ({
    url: p.url,
    sort_order: p.sort_order,
    caption: p.caption,
  }));
  const interests = tables.user_interests.map((i) => i.interest);
  const genderPreferences = tables.user_gender_preferences.map((g) => g.gender);
  const row: Row = {
    id: user.id,
    display_name: user.display_name,
    gender: user.gender,
    birth_date: user.birth_date,
    age: computeAge(String(user.birth_date)),
    height_cm: user.height_cm,
    body_type: user.body_type,
    profession: user.profession,
    education: education?.school ?? null,
    city: city.name,
    city_lng: city.lng,
    city_lat: city.lat,
    bio: user.bio,
    notifications_enabled: settings.notifications_enabled,
    discovery_distance_km: settings.discovery_distance_km,
    min_desired_age: settings.min_desired_age,
    max_desired_age: settings.max_desired_age,
    profile_visibility: settings.profile_visibility,
    paused_account: settings.paused_account,
    subscription_id: sub.id,
    plan: sub.plan,
    payment_method: sub.payment_method,
    payment_status: sub.payment_status,
    start_date: sub.start_date,
    end_date: sub.end_date,
    auto_renew: sub.auto_renew,
    photos,
    interests,
    gender_preferences: genderPreferences,
  };
  return {
    row,
    elapsedMs: Date.now() - started,
    measured: true,
    cartesianIfNaive: photos.length * interests.length,
    photoCount: photos.length,
    interestCount: interests.length,
  };
}

export function naiveOfflineJoinCount(userId = 1) {
  const tables = listOfflineTables(userId);
  const rows: Row[] = [];
  for (const p of tables.user_photos) {
    for (const i of tables.user_interests) {
      rows.push({
        display_name: tables.users[0]?.display_name,
        url: p.url,
        interest: i.interest,
      });
    }
  }
  return rows;
}

export function offlinePersonDocument(userId = 1) {
  const retrieved = retrieveOfflinePerson(userId);
  const row = retrieved.row;
  const f = flags();
  const user = store!.users.find((u) => u.id === userId) ?? {};
  const doc: Row = {
    profileId: PEOPLE.find((p) => p.id === userId)?.profileId,
    displayName: row.display_name,
    gender: row.gender,
    birthDate: row.birth_date,
    age: row.age,
    heightCm: row.height_cm,
    bodyType: row.body_type ?? undefined,
    profession: row.profession ?? undefined,
    education: row.education ?? undefined,
    city: row.city,
    location: {
      type: "Point",
      coordinates: [row.city_lng, row.city_lat],
    },
    bio: row.bio,
    photos: row.photos,
    interests: row.interests,
    settings: {
      notificationsEnabled: Boolean(row.notifications_enabled),
      discoveryDistanceKm: row.discovery_distance_km,
      minDesiredAge: row.min_desired_age,
      maxDesiredAge: row.max_desired_age,
      genderPreferences: row.gender_preferences,
      profileVisibility: row.profile_visibility,
      pausedAccount: Boolean(row.paused_account),
    },
    subscription: {
      id: row.subscription_id,
      plan: row.plan,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      startDate: row.start_date,
      endDate: row.end_date,
      autoRenew: Boolean(row.auto_renew),
    },
  };
  if (f.pronouns && user.pronouns) doc.pronouns = user.pronouns;
  if (f.hobbies) {
    doc.hobbies = forUser(store!.user_hobbies, userId).map((r) => r.hobby);
  }
  if (f.organizer) {
    doc.profileType = user.profile_type ?? "eventOrganizer";
    doc.eventSummary = forUser(store!.events, userId, "organizer_id").map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
    }));
  }
  return doc;
}

export function updateOfflineSettings(userId: number, patch: Partial<Settings>) {
  ensure();
  const current = store!.user_settings.find((r) => r.user_id === userId);
  if (!current) throw new Error("settings missing");
  if (patch.notificationsEnabled !== undefined) {
    current.notifications_enabled = patch.notificationsEnabled ? 1 : 0;
  }
  if (patch.discoveryDistanceKm !== undefined) current.discovery_distance_km = patch.discoveryDistanceKm;
  if (patch.minDesiredAge !== undefined) current.min_desired_age = patch.minDesiredAge;
  if (patch.maxDesiredAge !== undefined) current.max_desired_age = patch.maxDesiredAge;
  if (patch.profileVisibility !== undefined) current.profile_visibility = patch.profileVisibility;
  if (patch.pausedAccount !== undefined) current.paused_account = patch.pausedAccount ? 1 : 0;
  if (patch.genderPreferences) {
    store!.user_gender_preferences = store!.user_gender_preferences.filter((g) => g.user_id !== userId);
    for (const g of patch.genderPreferences) {
      store!.user_gender_preferences.push({
        id: store!.seq.gender++,
        user_id: userId,
        gender: g,
      });
    }
  }
  return { ...current };
}

export function updateOfflineSubscription(userId: number, patch: Partial<Subscription>) {
  ensure();
  const current = store!.subscriptions.find((r) => r.user_id === userId);
  if (!current) throw new Error("current subscription missing");
  if (patch.plan !== undefined) current.plan = patch.plan;
  if (patch.paymentMethod !== undefined) current.payment_method = patch.paymentMethod;
  if (patch.paymentStatus !== undefined) current.payment_status = patch.paymentStatus;
  if (patch.startDate !== undefined) current.start_date = patch.startDate;
  if (patch.endDate !== undefined) current.end_date = patch.endDate;
  if (patch.autoRenew !== undefined) current.auto_renew = patch.autoRenew ? 1 : 0;
  return { ...current };
}

export function evolveOfflineLesson(feature: "hobbies" | "pronouns" | "organizer") {
  ensure();
  const f = flags();
  const giulia = personByProfileId("giulia");
  const user = store!.users.find((u) => u.id === 1);
  if (feature === "hobbies") {
    store!.user_hobbies = store!.user_hobbies.filter((h) => h.user_id !== 1);
    for (const hobby of giulia.hobbies ?? []) {
      store!.user_hobbies.push({ id: store!.seq.hobby++, user_id: 1, hobby });
    }
    f.hobbies = true;
  }
  if (feature === "pronouns" && user) {
    user.pronouns = giulia.pronouns ?? "she/her";
    f.pronouns = true;
  }
  if (feature === "organizer" && user) {
    user.profile_type = "eventOrganizer";
    store!.events = store!.events.filter((e) => e.id !== "evt-lesson-giulia");
    store!.events.push({
      id: "evt-lesson-giulia",
      organizer_id: 1,
      title: "Speed data: aperitivo in Brera",
      city: "Milano",
      starts_at: "2026-10-24T19:00:00+02:00",
      description: "Nine tables, nine stories, one MongoDB document.",
    });
    f.organizer = true;
  }
  return { flags: { ...f }, tables: listOfflineTables(1) };
}

export function offlineLessonGet(op = "state") {
  ensure();
  if (op === "tables") {
    return { tables: listOfflineTables(1), fields: FIELDS, scenes: SCENES };
  }
  if (op === "sql") {
    const value = retrieveOfflinePerson(1);
    return {
      sql: RETRIEVE_PERSON_SQL,
      naiveSql: NAIVE_JOIN_SQL,
      naiveRowCount: naiveOfflineJoinCount(1).length,
      ...value,
      inspector: {
        description: "Retrieve the full person from the nine-table lesson model",
        engine: "SQLite" as const,
        target: "users + user_photos + user_interests + user_settings + subscriptions",
        operation: { sql: RETRIEVE_PERSON_SQL, params: [1] },
        outcome: "ok",
        result: value.row,
        elapsedMs: value.elapsedMs,
        measured: true,
        note: BROWSER_NOTE,
      },
    };
  }
  if (op === "document") {
    const synthesized = offlinePersonDocument(1);
    return {
      connection: {
        mode: "offline" as const,
        db: "TIN",
        error: "No MongoDB on this static host. Document assembled from the nine-table lesson model.",
      },
      document: synthesized,
      source: "browser-synthesized",
      synthesized,
      inspector: {
        description: "Document synthesized in the browser (Atlas not connected)",
        engine: "SQLite" as const,
        target: "users…",
        operation: MONGO_FIND_ONE,
        outcome: "offline-fallback",
        measured: false,
        note: "This is not an Atlas read. Same Giulia, one JSON document vs nine tables.",
      },
    };
  }
  const retrieved = retrieveOfflinePerson(1);
  return {
    person: canonicalPerson(),
    core: lessonCorePerson(),
    tables: listOfflineTables(1),
    retrieved: retrieved.row,
    documentPreview: offlinePersonDocument(1),
    flags: flags(),
    fields: FIELDS,
    scenes: SCENES,
    engine: "browser",
    people: PEOPLE.map((p) => ({
      id: p.id,
      profileId: p.profileId,
      displayName: p.displayName,
      city: p.city,
    })),
  };
}

export async function offlineLessonPost(action: string, extra: Record<string, unknown> = {}) {
  ensure();
  if (action === "reset") {
    resetOfflineLesson();
    return {
      ok: true,
      dataset: "lesson",
      note: "Restored the in-browser lesson dataset. Live MVP is not on this static host.",
      tables: listOfflineTables(1),
    };
  }
  if (action === "settings") {
    const patch = settingsPatchSchema.parse(extra.patch);
    const { value, inspector } = await timed(
      "Update Giulia’s preferences (browser lesson)",
      "SQLite",
      "user_settings / user_gender_preferences",
      { update: patch },
      () => updateOfflineSettings(1, patch),
      { note: BROWSER_NOTE },
    );
    return { settings: value, tables: listOfflineTables(1), inspector };
  }
  if (action === "subscription") {
    const patch = subscriptionPatchSchema.parse(extra.patch);
    const { value, inspector } = await timed(
      "Update Giulia’s current subscription (browser lesson)",
      "SQLite",
      "subscriptions",
      { update: patch, predicate: "current 1:1" },
      () => updateOfflineSubscription(1, patch),
      { note: BROWSER_NOTE },
    );
    return { subscription: value, tables: listOfflineTables(1), inspector };
  }
  if (action === "evolve") {
    const feature = extra.feature as "hobbies" | "pronouns" | "organizer";
    const before = offlinePersonDocument(1);
    const result = evolveOfflineLesson(feature);
    const after = offlinePersonDocument(1);
    return {
      ...result,
      before,
      after,
      inspector: {
        description: `Product evolution: ${feature}`,
        engine: "SQLite" as const,
        target: feature === "hobbies" ? "user_hobbies" : "users",
        operation: { transform: feature, engine: "browser" },
        outcome: "ok",
        before,
        after,
        measured: false,
        note: BROWSER_NOTE,
      },
    };
  }
  throw new Error("Unknown action");
}
