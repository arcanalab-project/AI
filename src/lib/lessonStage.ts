import { listOfflineTables } from "./lessonOffline";
import { SCENES } from "./scenes";

export type ColumnRole = "business" | "technical";

export type StageColumn = {
  key: string;
  role: ColumnRole;
  focus: boolean;
};

export type StageTable = {
  name: string;
  pk: string;
  fk?: string;
  rows: Record<string, unknown>[];
  columns: StageColumn[];
};

export type StageDoc = {
  who: string;
  value: Record<string, unknown>;
};

export type HighlightSpec = {
  id: string;
  label: string;
  tables: { name: string; columns: string[] }[];
  paths: string[];
  link?: string;
};

export type LessonStage = {
  scene: number;
  tables: StageTable[];
  documents: StageDoc[];
  countsLabel: string;
  takeaway: string;
  teacherNote: string;
  highlights: HighlightSpec[];
  changedColumns: { table: string; column: string }[];
  changedPaths: string[];
  operations?: { relational: string; document: string; application: string };
  history?: { rows: Record<string, unknown>[]; note: string };
  eventCompare?: { summary: Record<string, unknown>; full: Record<string, unknown>; onlyOnEvent: string[] };
  simulatedSql: string;
  simulatedFind: string;
  technicalNote: string;
  revision: number;
};

type Flags = { hobbies: boolean; pronouns: boolean; organizer: boolean };

const GIULIA = 1;
const FRANCESCA = 9;

function asRecord(row: Record<string, unknown> | undefined): Record<string, unknown> {
  return row ?? {};
}

function cityName(tables: ReturnType<typeof listOfflineTables>): string {
  return String(tables.cities[0]?.name ?? "");
}

function photosOf(tables: ReturnType<typeof listOfflineTables>) {
  return tables.user_photos.map((p) => ({
    url: p.url,
    caption: p.caption ?? null,
  }));
}

function interestsOf(tables: ReturnType<typeof listOfflineTables>) {
  return tables.user_interests.map((r) => String(r.interest));
}

function settingsOf(tables: ReturnType<typeof listOfflineTables>) {
  const s = asRecord(tables.user_settings[0]);
  return {
    notificationsEnabled: Boolean(s.notifications_enabled),
    discoveryDistanceKm: Number(s.discovery_distance_km),
    minDesiredAge: Number(s.min_desired_age),
    maxDesiredAge: Number(s.max_desired_age),
    genderPreferences: tables.user_gender_preferences.map((g) => String(g.gender)),
    profileVisibility: String(s.profile_visibility),
    pausedAccount: Boolean(s.paused_account),
  };
}

function planOf(tables: ReturnType<typeof listOfflineTables>) {
  const s = asRecord(tables.subscriptions[0]);
  return {
    plan: s.plan,
    paymentStatus: s.payment_status,
    startDate: s.start_date,
    endDate: s.end_date,
    autoRenew: Boolean(s.auto_renew),
  };
}

function profileDoc(
  tables: ReturnType<typeof listOfflineTables>,
  scene: number,
  extras: { pronouns?: boolean; hobbies?: boolean },
): Record<string, unknown> {
  const user = asRecord(tables.users[0]);
  const doc: Record<string, unknown> = {
    displayName: user.display_name,
    gender: user.gender,
    birthDate: user.birth_date,
    city: cityName(tables),
    bio: user.bio,
  };
  if (scene >= 2) {
    doc.photos = photosOf(tables);
    doc.interests = interestsOf(tables);
  }
  if (scene >= 3) doc.settings = settingsOf(tables);
  if (scene >= 4) doc.subscription = planOf(tables);
  if (extras.pronouns && user.pronouns) doc.pronouns = user.pronouns;
  if (extras.hobbies) {
    doc.hobbies = tables.user_hobbies.map((h) => String(h.hobby));
  }
  return doc;
}

function usersTable(ids: number[], withPronouns: boolean): StageTable {
  const rows = ids.map((id) => {
    const tables = listOfflineTables(id);
    const user = asRecord(tables.users[0]);
    const row: Record<string, unknown> = {
      id: user.id,
      display_name: user.display_name,
      gender: user.gender,
      birth_date: user.birth_date,
      city: cityName(tables),
      bio: user.bio,
    };
    if (withPronouns) row.pronouns = user.pronouns ?? null;
    return row;
  });
  const columns: StageColumn[] = [
    { key: "id", role: "technical", focus: false },
    { key: "display_name", role: "business", focus: true },
    { key: "gender", role: "business", focus: true },
    { key: "birth_date", role: "business", focus: true },
    { key: "city", role: "business", focus: true },
    { key: "bio", role: "business", focus: true },
  ];
  if (withPronouns) columns.push({ key: "pronouns", role: "business", focus: true });
  return {
    name: "users",
    pk: "id",
    rows,
    columns,
  };
}

function countLabel(tables: StageTable[], documents: StageDoc[]): string {
  const tableCount = tables.length;
  const rowCount = tables.reduce((n, t) => n + t.rows.length, 0);
  const docs = documents.length;
  return `${tableCount} ${tableCount === 1 ? "table" : "tables"} · ${rowCount} ${rowCount === 1 ? "row" : "rows"} · ${docs} ${docs === 1 ? "document" : "documents"}`;
}

function baseHighlights(scene: number, extras: { pronouns: boolean; hobbies: boolean }): HighlightSpec[] {
  const list: HighlightSpec[] = [
    {
      id: "displayName",
      label: "Name · users.display_name · displayName",
      tables: [{ name: "users", columns: ["display_name"] }],
      paths: ["displayName"],
    },
    {
      id: "gender",
      label: "Gender · users.gender · gender",
      tables: [{ name: "users", columns: ["gender"] }],
      paths: ["gender"],
    },
    {
      id: "birthDate",
      label: "Birth date · users.birth_date · birthDate",
      tables: [{ name: "users", columns: ["birth_date"] }],
      paths: ["birthDate"],
    },
    {
      id: "city",
      label: "City · users.city · city",
      tables: [{ name: "users", columns: ["city"] }],
      paths: ["city"],
    },
    {
      id: "bio",
      label: "Bio · users.bio · bio",
      tables: [{ name: "users", columns: ["bio"] }],
      paths: ["bio"],
    },
  ];
  if (scene >= 2) {
    list.push(
      {
        id: "photos",
        label: "Photos · user_photos.user_id references users.id · photos[]",
        tables: [
          { name: "users", columns: ["id"] },
          { name: "user_photos", columns: ["user_id", "url", "caption"] },
        ],
        paths: ["photos"],
        link: "user_photos.user_id references users.id — a reference to another row",
      },
      {
        id: "interests",
        label: "Interests · user_interests.user_id references users.id · interests[]",
        tables: [
          { name: "users", columns: ["id"] },
          { name: "user_interests", columns: ["user_id", "interest"] },
        ],
        paths: ["interests"],
        link: "user_interests.user_id references users.id — a reference to another row",
      },
    );
  }
  if (scene >= 3) {
    list.push(
      {
        id: "notifications",
        label: "Notifications · user_settings.notifications_enabled · settings.notificationsEnabled",
        tables: [{ name: "user_settings", columns: ["notifications_enabled"] }],
        paths: ["settings.notificationsEnabled"],
      },
      {
        id: "distance",
        label: "Distance · user_settings.discovery_distance_km · settings.discoveryDistanceKm",
        tables: [{ name: "user_settings", columns: ["discovery_distance_km"] }],
        paths: ["settings.discoveryDistanceKm"],
      },
      {
        id: "ageRange",
        label: "Age range · user_settings min/max · settings.minDesiredAge / maxDesiredAge",
        tables: [{ name: "user_settings", columns: ["min_desired_age", "max_desired_age"] }],
        paths: ["settings.minDesiredAge", "settings.maxDesiredAge"],
      },
      {
        id: "genders",
        label: "Genders sought · user_gender_preferences.gender · settings.genderPreferences[]",
        tables: [
          { name: "users", columns: ["id"] },
          { name: "user_gender_preferences", columns: ["user_id", "gender"] },
        ],
        paths: ["settings.genderPreferences"],
        link: "user_gender_preferences.user_id references users.id",
      },
    );
  }
  if (scene >= 4) {
    list.push({
      id: "plan",
      label: "Current plan · subscriptions.plan · subscription.plan",
      tables: [{ name: "subscriptions", columns: ["plan", "payment_status", "start_date", "end_date", "auto_renew"] }],
      paths: ["subscription"],
    });
  }
  if (extras.pronouns) {
    list.push({
      id: "pronouns",
      label: "Pronouns · users.pronouns · pronouns",
      tables: [{ name: "users", columns: ["pronouns"] }],
      paths: ["pronouns"],
    });
  }
  if (extras.hobbies) {
    list.push({
      id: "hobbies",
      label: "Hobbies · user_hobbies.hobby · hobbies[]",
      tables: [
        { name: "users", columns: ["id"] },
        { name: "user_hobbies", columns: ["user_id", "hobby"] },
      ],
      paths: ["hobbies"],
      link: "user_hobbies.user_id references users.id",
    });
  }
  return list;
}

export function projectLesson(
  scene: number,
  options: { revealExtension?: boolean; showOrganizer?: boolean; revision?: number } = {},
): LessonStage {
  const reveal = Boolean(options.revealExtension);
  const meta = SCENES[scene - 1];
  const giulia = listOfflineTables(GIULIA);
  const flags = giulia.flags as Flags;
  const showPronouns = flags.pronouns && (scene > 6 || (scene === 6 && reveal));
  const showHobbies = flags.hobbies && (scene > 7 || (scene === 7 && reveal));
  const people = scene === 6 || scene === 7 ? [GIULIA, FRANCESCA] : [GIULIA];

  const tables: StageTable[] = [usersTable(people, showPronouns)];

  if (scene >= 2) {
    tables.push({
      name: "user_photos",
      pk: "id",
      fk: "user_id → users.id",
      rows: people.flatMap((id) => listOfflineTables(id).user_photos),
      columns: [
        { key: "id", role: "technical", focus: false },
        { key: "user_id", role: "technical", focus: true },
        { key: "url", role: "business", focus: true },
        { key: "caption", role: "business", focus: true },
        { key: "sort_order", role: "technical", focus: false },
      ],
    });
    tables.push({
      name: "user_interests",
      pk: "id",
      fk: "user_id → users.id",
      rows: people.flatMap((id) => listOfflineTables(id).user_interests),
      columns: [
        { key: "id", role: "technical", focus: false },
        { key: "user_id", role: "technical", focus: true },
        { key: "interest", role: "business", focus: true },
      ],
    });
  }

  if (scene >= 3) {
    tables.push({
      name: "user_settings",
      pk: "user_id",
      fk: "user_id → users.id",
      rows: people.map((id) => {
        const row = asRecord(listOfflineTables(id).user_settings[0]);
        return {
          user_id: row.user_id,
          notifications_enabled: Boolean(row.notifications_enabled),
          discovery_distance_km: row.discovery_distance_km,
          min_desired_age: row.min_desired_age,
          max_desired_age: row.max_desired_age,
          profile_visibility: row.profile_visibility,
          paused_account: Boolean(row.paused_account),
        };
      }),
      columns: [
        { key: "user_id", role: "technical", focus: true },
        { key: "notifications_enabled", role: "business", focus: true },
        { key: "discovery_distance_km", role: "business", focus: true },
        { key: "min_desired_age", role: "business", focus: true },
        { key: "max_desired_age", role: "business", focus: true },
        { key: "profile_visibility", role: "business", focus: false },
        { key: "paused_account", role: "business", focus: false },
      ],
    });
    tables.push({
      name: "user_gender_preferences",
      pk: "id",
      fk: "user_id → users.id",
      rows: people.flatMap((id) =>
        listOfflineTables(id).user_gender_preferences.map((g) => ({
          id: g.id,
          user_id: g.user_id,
          gender: g.gender,
        })),
      ),
      columns: [
        { key: "id", role: "technical", focus: false },
        { key: "user_id", role: "technical", focus: true },
        { key: "gender", role: "business", focus: true },
      ],
    });
  }

  if (scene >= 4) {
    tables.push({
      name: "subscriptions",
      pk: "id",
      fk: "user_id → users.id",
      rows: people.map((id) => {
        const row = asRecord(listOfflineTables(id).subscriptions[0]);
        return {
          id: row.id,
          user_id: row.user_id,
          plan: row.plan,
          payment_status: row.payment_status,
          start_date: row.start_date,
          end_date: row.end_date,
          auto_renew: Boolean(row.auto_renew),
        };
      }),
      columns: [
        { key: "id", role: "technical", focus: false },
        { key: "user_id", role: "technical", focus: true },
        { key: "plan", role: "business", focus: true },
        { key: "payment_status", role: "business", focus: true },
        { key: "start_date", role: "business", focus: true },
        { key: "end_date", role: "business", focus: true },
        { key: "auto_renew", role: "business", focus: true },
      ],
    });
  }

  if (showHobbies) {
    tables.push({
      name: "user_hobbies",
      pk: "id",
      fk: "user_id → users.id",
      rows: listOfflineTables(GIULIA).user_hobbies.map((h) => ({
        id: h.id,
        user_id: h.user_id,
        hobby: h.hobby,
      })),
      columns: [
        { key: "id", role: "technical", focus: false },
        { key: "user_id", role: "technical", focus: true },
        { key: "hobby", role: "business", focus: true },
      ],
    });
  }

  const documents: StageDoc[] = people.map((id) => {
    const pack = listOfflineTables(id);
    const doc = profileDoc(pack, scene, {
      pronouns: showPronouns && Boolean(asRecord(pack.users[0]).pronouns),
      hobbies: showHobbies && id === GIULIA,
    });
    const name = String(asRecord(pack.users[0]).display_name ?? "");
    return { who: name, value: doc };
  });

  const changedColumns: LessonStage["changedColumns"] = [];
  const changedPaths: string[] = [];
  if (scene === 6 && showPronouns) {
    changedColumns.push({ table: "users", column: "pronouns" });
    changedPaths.push("pronouns");
  }
  if (scene === 7 && showHobbies) {
    changedColumns.push({ table: "user_hobbies", column: "hobby" }, { table: "user_hobbies", column: "user_id" });
    changedPaths.push("hobbies");
  }

  let operations: LessonStage["operations"];
  if (scene === 6) {
    operations = {
      relational: "Add a nullable pronouns column on users. Update Giulia's row. Francesca's row stays NULL. The read adds that column. A new column does not by itself take the database offline.",
      document: "Set pronouns on Giulia's document. Leave the field off Francesca's document. Validation allows the field to be missing.",
      application: "The card shows pronouns when the value is present and hides the line when it is null or absent.",
    };
  }
  if (scene === 7) {
    operations = {
      relational: "Create user_hobbies (a new table), then insert Giulia's rows. Interests stay as they are. Creating a table is a schema change, not automatic downtime. The read joins or subqueries the new table.",
      document: "Add a hobbies array on Giulia's document. Francesca's document has no hobbies field. Validation should mark the array optional. This is a new structure, not another interest tag.",
      application: "The card renders hobbies only when the list exists. Profiles saved earlier keep working.",
    };
  }

  let history: LessonStage["history"];
  let eventCompare: LessonStage["eventCompare"];
  if (scene === 8) {
    history = {
      rows: giulia.subscription_history.map((h) => ({
        plan: h.plan,
        start_date: h.start_date,
        end_date: h.end_date,
        payment_status: h.payment_status,
      })),
      note: "Plan history grows over time. It is not inside the profile document, and it is not part of the profile count above.",
    };
    eventCompare = {
      summary: { id: "evt-brera", title: "Aperitivo in Brera", startsAt: "2026-10-24T19:00:00+02:00" },
      full: {
        id: "evt-brera",
        title: "Aperitivo in Brera",
        city: "Milano",
        startsAt: "2026-10-24T19:00:00+02:00",
        description: "A short event hosted by an organizer profile.",
      },
      onlyOnEvent: ["city", "description"],
    };
  }

  const simulatedSql =
    scene < 2
      ? "SELECT display_name, gender, birth_date, city, bio FROM users WHERE id = 1;"
      : scene < 5
        ? "SELECT the tables introduced so far for user 1. Each new scene adds tables; earlier scenes do not read them."
        : `SELECT u.display_name, u.gender, u.birth_date, u.bio,
  (SELECT json_group_array(url) FROM user_photos WHERE user_id = u.id) AS photos,
  (SELECT json_group_array(interest) FROM user_interests WHERE user_id = u.id) AS interests
FROM users u WHERE u.id = 1;
-- One statement. Not one query per table.
-- Joining photos to interests in the FROM clause would repeat Giulia:
-- ${giulia.user_photos.length} photos × ${giulia.user_interests.length} interests = ${giulia.user_photos.length * giulia.user_interests.length} rows.
-- That is row shape, not a speed claim.`;

  const simulatedFind = `db.users.findOne({ profileId: "giulia" })
// Lesson projection. Not an Atlas round-trip unless a server read is shown separately.`;

  return {
    scene,
    tables,
    documents,
    countsLabel: countLabel(tables, documents),
    takeaway: meta?.takeaway ?? "",
    teacherNote: meta?.teacherNote ?? "",
    highlights: baseHighlights(scene, { pronouns: showPronouns, hobbies: showHobbies }),
    changedColumns,
    changedPaths,
    operations,
    history,
    eventCompare,
    simulatedSql,
    simulatedFind,
    technicalNote:
      "The two panels are a simulated lesson built from one canonical profile. Age on the card is derived. Identifiers (id, user_id) are technical. A closed log is not a live Atlas query.",
    revision: options.revision ?? 0,
  };
}

function norm(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(norm);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = norm((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Business facts visible for Giulia, from the document and from the tables. */
export function giuliaBusiness(stage: LessonStage): { fromDocument: unknown; fromTables: unknown } {
  const doc = stage.documents[0]?.value ?? {};
  const fromDocument = norm(doc);
  const byName = Object.fromEntries(stage.tables.map((t) => [t.name, t]));
  const user = (byName.users?.rows ?? []).find((r) => r.id === GIULIA) ?? {};
  const rebuilt: Record<string, unknown> = {
    displayName: user.display_name,
    gender: user.gender,
    birthDate: user.birth_date,
    city: user.city,
    bio: user.bio,
  };
  if ("pronouns" in doc) rebuilt.pronouns = user.pronouns;
  if (byName.user_photos && "photos" in doc) {
    rebuilt.photos = byName.user_photos.rows
      .filter((r) => r.user_id === GIULIA)
      .map((r) => ({ url: r.url, caption: r.caption ?? null }));
  }
  if (byName.user_interests && "interests" in doc) {
    rebuilt.interests = byName.user_interests.rows
      .filter((r) => r.user_id === GIULIA)
      .map((r) => String(r.interest));
  }
  if (byName.user_settings && doc.settings) {
    const s = byName.user_settings.rows.find((r) => r.user_id === GIULIA) ?? {};
    const genders = (byName.user_gender_preferences?.rows ?? [])
      .filter((r) => r.user_id === GIULIA)
      .map((r) => String(r.gender));
    rebuilt.settings = {
      notificationsEnabled: Boolean(s.notifications_enabled),
      discoveryDistanceKm: Number(s.discovery_distance_km),
      minDesiredAge: Number(s.min_desired_age),
      maxDesiredAge: Number(s.max_desired_age),
      genderPreferences: genders,
      profileVisibility: s.profile_visibility,
      pausedAccount: Boolean(s.paused_account),
    };
  }
  if (byName.subscriptions && doc.subscription) {
    const s = byName.subscriptions.rows.find((r) => r.user_id === GIULIA) ?? {};
    rebuilt.subscription = {
      plan: s.plan,
      paymentStatus: s.payment_status,
      startDate: s.start_date,
      endDate: s.end_date,
      autoRenew: Boolean(s.auto_renew),
    };
  }
  if (byName.user_hobbies && "hobbies" in doc) {
    rebuilt.hobbies = byName.user_hobbies.rows
      .filter((r) => r.user_id === GIULIA)
      .map((r) => String(r.hobby));
  }
  return { fromDocument, fromTables: norm(rebuilt) };
}

export function visibleTableNames(stage: LessonStage): string[] {
  return stage.tables.map((t) => t.name);
}
