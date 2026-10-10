import { DatabaseSync } from "node:sqlite";
import { PEOPLE, lessonCorePerson, personByProfileId } from "./canonical";
import { RETRIEVE_PERSON_SQL } from "./lessonQuery";
import type { PersonFixture, Settings, Subscription } from "./types";

const globalSql = globalThis as unknown as {
  tinLessonDb?: DatabaseSync;
  tinLessonEvolved?: { hobbies: boolean; pronouns: boolean; organizer: boolean };
};

export function lessonFlags() {
  if (!globalSql.tinLessonEvolved) {
    globalSql.tinLessonEvolved = { hobbies: false, pronouns: false, organizer: false };
  }
  return globalSql.tinLessonEvolved;
}

export function getLessonDb(): DatabaseSync {
  if (!globalSql.tinLessonDb) {
    globalSql.tinLessonDb = new DatabaseSync(":memory:");
    resetLessonSql();
  }
  return globalSql.tinLessonDb;
}

export function resetLessonSql() {
  const db = globalSql.tinLessonDb ?? new DatabaseSync(":memory:");
  globalSql.tinLessonDb = db;
  globalSql.tinLessonEvolved = { hobbies: false, pronouns: false, organizer: false };
  db.exec(`
    PRAGMA foreign_keys = ON;
    DROP TABLE IF EXISTS user_hobbies;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS user_gender_preferences;
    DROP TABLE IF EXISTS subscription_history;
    DROP TABLE IF EXISTS subscriptions;
    DROP TABLE IF EXISTS user_settings;
    DROP TABLE IF EXISTS user_education;
    DROP TABLE IF EXISTS user_interests;
    DROP TABLE IF EXISTS user_photos;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS cities;
  `);
  db.exec(`
    CREATE TABLE cities (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      lng REAL NOT NULL,
      lat REAL NOT NULL
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      display_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      height_cm INTEGER NOT NULL,
      body_type TEXT,
      profession TEXT,
      city_id INTEGER NOT NULL REFERENCES cities(id),
      bio TEXT NOT NULL
    );
    CREATE TABLE user_education (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      school TEXT NOT NULL
    );
    CREATE TABLE user_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      caption TEXT
    );
    CREATE TABLE user_interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      interest TEXT NOT NULL
    );
    CREATE TABLE user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      notifications_enabled INTEGER NOT NULL,
      discovery_distance_km INTEGER NOT NULL,
      min_desired_age INTEGER NOT NULL,
      max_desired_age INTEGER NOT NULL,
      profile_visibility TEXT NOT NULL,
      paused_account INTEGER NOT NULL
    );
    CREATE TABLE user_gender_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      gender TEXT NOT NULL
    );
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      plan TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      auto_renew INTEGER NOT NULL
    );
    CREATE TABLE subscription_history (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      plan TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      auto_renew INTEGER NOT NULL
    );
  `);

  const cityIds = new Map<string, number>();
  const insertCity = db.prepare(`INSERT INTO cities (id, name, lng, lat) VALUES (?, ?, ?, ?)`);
  let citySeq = 1;
  for (const p of PEOPLE) {
    if (cityIds.has(p.city)) continue;
    insertCity.run(citySeq, p.city, p.location.coordinates[0], p.location.coordinates[1]);
    cityIds.set(p.city, citySeq);
    citySeq += 1;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (id, display_name, gender, birth_date, height_cm, body_type, profession, city_id, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEducation = db.prepare(`INSERT INTO user_education (user_id, school) VALUES (?, ?)`);
  const insertPhoto = db.prepare(
    `INSERT INTO user_photos (user_id, url, sort_order, caption) VALUES (?, ?, ?, ?)`,
  );
  const insertInterest = db.prepare(`INSERT INTO user_interests (user_id, interest) VALUES (?, ?)`);
  const insertSettings = db.prepare(`
    INSERT INTO user_settings (user_id, notifications_enabled, discovery_distance_km, min_desired_age, max_desired_age, profile_visibility, paused_account)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertGender = db.prepare(
    `INSERT INTO user_gender_preferences (user_id, gender) VALUES (?, ?)`,
  );
  const insertSub = db.prepare(`
    INSERT INTO subscriptions (id, user_id, plan, payment_method, payment_status, start_date, end_date, auto_renew)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHist = db.prepare(`
    INSERT INTO subscription_history (id, user_id, plan, payment_method, payment_status, start_date, end_date, auto_renew)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const raw of PEOPLE) {
    const p = raw.profileId === "giulia" ? lessonCorePerson(raw) : stripLessonExtras(raw);
    insertUser.run(
      p.id,
      p.displayName,
      p.gender,
      p.birthDate,
      p.heightCm,
      p.bodyType ?? null,
      p.profession ?? null,
      cityIds.get(p.city) as number,
      p.bio,
    );
    if (p.education) insertEducation.run(p.id, p.education);
    for (const photo of p.photos) {
      insertPhoto.run(p.id, photo.url, photo.sortOrder, photo.caption ?? null);
    }
    for (const interest of p.interests) insertInterest.run(p.id, interest);
    const s = p.settings;
    insertSettings.run(
      p.id,
      s.notificationsEnabled ? 1 : 0,
      s.discoveryDistanceKm,
      s.minDesiredAge,
      s.maxDesiredAge,
      s.profileVisibility,
      s.pausedAccount ? 1 : 0,
    );
    for (const g of s.genderPreferences) insertGender.run(p.id, g);
    if (p.subscriptionHistory) {
      for (const h of p.subscriptionHistory) {
        insertHist.run(
          h.id,
          p.id,
          h.plan,
          h.paymentMethod,
          h.paymentStatus,
          h.startDate,
          h.endDate,
          h.autoRenew ? 1 : 0,
        );
      }
    }
    insertSub.run(
      p.subscription.id,
      p.id,
      p.subscription.plan,
      p.subscription.paymentMethod,
      p.subscription.paymentStatus,
      p.subscription.startDate,
      p.subscription.endDate,
      p.subscription.autoRenew ? 1 : 0,
    );
  }
}

function stripLessonExtras(p: PersonFixture): PersonFixture {
  const clone = { ...p };
  delete clone.hobbies;
  delete clone.pronouns;
  delete clone.events;
  clone.profileType = "standard";
  return clone;
}

export function listTables(userId = 1) {
  const db = getLessonDb();
  const users = db.prepare(`SELECT * FROM users WHERE id = ?`).all(userId) as { city_id?: number }[];
  const cityId = users[0]?.city_id;
  const cities = cityId
    ? db.prepare(`SELECT * FROM cities WHERE id = ?`).all(cityId)
    : [];
  const education = db.prepare(`SELECT * FROM user_education WHERE user_id = ?`).all(userId);
  const photos = db.prepare(`SELECT * FROM user_photos WHERE user_id = ? ORDER BY sort_order`).all(userId);
  const interests = db.prepare(`SELECT * FROM user_interests WHERE user_id = ?`).all(userId);
  const settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).all(userId);
  const genders = db.prepare(`SELECT * FROM user_gender_preferences WHERE user_id = ?`).all(userId);
  const subscriptions = db.prepare(`SELECT * FROM subscriptions WHERE user_id = ?`).all(userId);
  const subscription_history = db
    .prepare(`SELECT * FROM subscription_history WHERE user_id = ? ORDER BY start_date`)
    .all(userId);
  let hobbies: Record<string, unknown>[] = [];
  let events: Record<string, unknown>[] = [];
  const flags = lessonFlags();
  if (flags.hobbies) {
    try {
      hobbies = db.prepare(`SELECT * FROM user_hobbies WHERE user_id = ?`).all(userId);
    } catch {
      hobbies = [];
    }
  }
  if (flags.organizer) {
    try {
      events = db.prepare(`SELECT * FROM events WHERE organizer_id = ?`).all(userId);
    } catch {
      events = [];
    }
  }
  const user = users[0] ?? {};
  return {
    users,
    cities,
    user_education: education,
    user_photos: photos,
    user_interests: interests,
    user_settings: settings,
    user_gender_preferences: genders,
    subscriptions,
    subscription_history,
    user_hobbies: hobbies,
    events,
    columns: {
      users: Object.keys(user),
    },
    flags,
  };
}

export function retrievePerson(userId = 1) {
  const db = getLessonDb();
  const started = Date.now();
  const row = db.prepare(RETRIEVE_PERSON_SQL).get(userId) as Record<string, unknown> | undefined;
  const elapsedMs = Date.now() - started;
  if (!row) throw new Error("Person not found");
  const photos = JSON.parse(String(row.photos ?? "[]")) as unknown[];
  const interests = JSON.parse(String(row.interests ?? "[]")) as unknown[];
  const genderPreferences = JSON.parse(String(row.gender_preferences ?? "[]")) as unknown[];
  const naive = db
    .prepare(
      `SELECT COUNT(*) AS n FROM users u
       JOIN user_photos p ON p.user_id = u.id
       JOIN user_interests i ON i.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(userId);
  return {
    row: { ...row, photos, interests, gender_preferences: genderPreferences } as Record<string, unknown>,
    elapsedMs,
    measured: true,
    cartesianIfNaive: Number(naive?.n ?? 0),
    photoCount: photos.length,
    interestCount: interests.length,
  };
}

export function naiveJoinCount(userId = 1) {
  const db = getLessonDb();
  const rows = db
    .prepare(
      `SELECT u.display_name, p.url, i.interest
       FROM users u
       JOIN user_photos p ON p.user_id = u.id
       JOIN user_interests i ON i.user_id = u.id
       WHERE u.id = ?`,
    )
    .all(userId);
  return rows;
}

export function updateLessonSettings(userId: number, patch: Partial<Settings>) {
  const db = getLessonDb();
  const current = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(userId);
  if (!current) throw new Error("settings missing");
  const next = {
    notifications_enabled:
      patch.notificationsEnabled === undefined
        ? current.notifications_enabled
        : patch.notificationsEnabled
          ? 1
          : 0,
    discovery_distance_km: patch.discoveryDistanceKm ?? current.discovery_distance_km,
    min_desired_age: patch.minDesiredAge ?? current.min_desired_age,
    max_desired_age: patch.maxDesiredAge ?? current.max_desired_age,
    profile_visibility: patch.profileVisibility ?? current.profile_visibility,
    paused_account:
      patch.pausedAccount === undefined ? current.paused_account : patch.pausedAccount ? 1 : 0,
  };
  db.prepare(
    `UPDATE user_settings SET notifications_enabled=?, discovery_distance_km=?, min_desired_age=?, max_desired_age=?, profile_visibility=?, paused_account=? WHERE user_id=?`,
  ).run(
    next.notifications_enabled,
    next.discovery_distance_km,
    next.min_desired_age,
    next.max_desired_age,
    next.profile_visibility,
    next.paused_account,
    userId,
  );
  if (patch.genderPreferences) {
    db.prepare(`DELETE FROM user_gender_preferences WHERE user_id = ?`).run(userId);
    const ins = db.prepare(`INSERT INTO user_gender_preferences (user_id, gender) VALUES (?, ?)`);
    for (const g of patch.genderPreferences) ins.run(userId, g);
  }
  return db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(userId);
}

export function updateLessonSubscription(userId: number, patch: Partial<Subscription>) {
  const db = getLessonDb();
  const current = db.prepare(`SELECT * FROM subscriptions WHERE user_id = ?`).get(userId);
  if (!current) throw new Error("current subscription missing");
  db.prepare(
    `UPDATE subscriptions SET plan=?, payment_method=?, payment_status=?, start_date=?, end_date=?, auto_renew=? WHERE id=?`,
  ).run(
    patch.plan ?? current.plan,
    patch.paymentMethod ?? current.payment_method,
    patch.paymentStatus ?? current.payment_status,
    patch.startDate ?? current.start_date,
    patch.endDate ?? current.end_date,
    patch.autoRenew === undefined ? current.auto_renew : patch.autoRenew ? 1 : 0,
    current.id,
  );
  return db.prepare(`SELECT * FROM subscriptions WHERE id = ?`).get(current.id);
}

export function evolveLesson(feature: "hobbies" | "pronouns" | "organizer") {
  const db = getLessonDb();
  const flags = lessonFlags();
  const giulia = personByProfileId("giulia");
  if (feature === "hobbies") {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_hobbies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        hobby TEXT NOT NULL
      );
    `);
    db.prepare(`DELETE FROM user_hobbies WHERE user_id = 1`).run();
    const ins = db.prepare(`INSERT INTO user_hobbies (user_id, hobby) VALUES (?, ?)`);
    for (const h of giulia.hobbies ?? []) ins.run(1, h);
    flags.hobbies = true;
  }
  if (feature === "pronouns") {
    const cols = db.prepare(`PRAGMA table_info(users)`).all();
    if (!cols.some((c) => c.name === "pronouns")) {
      db.exec(`ALTER TABLE users ADD COLUMN pronouns TEXT`);
    }
    db.prepare(`UPDATE users SET pronouns = ? WHERE id = 1`).run(giulia.pronouns ?? "she/her");
    flags.pronouns = true;
  }
  if (feature === "organizer") {
    const cols = db.prepare(`PRAGMA table_info(users)`).all();
    if (!cols.some((c) => c.name === "profile_type")) {
      db.exec(`ALTER TABLE users ADD COLUMN profile_type TEXT DEFAULT 'standard'`);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        organizer_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        city TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        description TEXT
      );
    `);
    db.prepare(`UPDATE users SET profile_type = 'eventOrganizer' WHERE id = 1`).run();
    db.prepare(`DELETE FROM events WHERE id = 'evt-lesson-giulia'`).run();
    db.prepare(
      `INSERT INTO events (id, organizer_id, title, city, starts_at, description) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "evt-lesson-giulia",
      1,
      "Speed data: aperitivo in Brera",
      "Milano",
      "2026-10-24T19:00:00+02:00",
      "Nine tables, nine stories, one MongoDB document.",
    );
    flags.organizer = true;
  }
  return { flags: { ...flags }, tables: listTables(1) };
}

export function sqlPersonDocument(userId = 1) {
  const retrieved = retrievePerson(userId);
  const row = retrieved.row as Record<string, unknown>;
  const flags = lessonFlags();
  const db = getLessonDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) ?? {};
  const doc: Record<string, unknown> = {
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
  if (flags.pronouns && user.pronouns) doc.pronouns = user.pronouns;
  if (flags.hobbies) {
    doc.hobbies = db.prepare(`SELECT hobby FROM user_hobbies WHERE user_id = ?`).all(userId).map((r) => r.hobby);
  }
  if (flags.organizer) {
    doc.profileType = user.profile_type ?? "eventOrganizer";
    doc.eventSummary = db
      .prepare(`SELECT id, title, starts_at AS startsAt FROM events WHERE organizer_id = ?`)
      .all(userId);
  }
  return doc;
}
