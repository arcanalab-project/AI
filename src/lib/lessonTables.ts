import type { FieldCategory } from "./types";

export type LessonTableSpec = {
  name: string;
  cardinality: "1" | "1:1" | "N:1" | "1:N";
  pk: string;
  fk?: string;
  category: FieldCategory;
  section: string;
  core: boolean;
};

/** One specific normalized model of this dating-app person — not the only possible RDBMS design. */
export const LESSON_TABLES: LessonTableSpec[] = [
  {
    name: "users",
    cardinality: "1",
    pk: "id",
    fk: "city_id → cities.id",
    category: "identity",
    section: "Profile",
    core: true,
  },
  {
    name: "cities",
    cardinality: "N:1",
    pk: "id",
    category: "identity",
    section: "Location",
    core: true,
  },
  {
    name: "user_education",
    cardinality: "1:1",
    pk: "user_id",
    fk: "user_id → users.id",
    category: "identity",
    section: "Education",
    core: true,
  },
  {
    name: "user_photos",
    cardinality: "1:N",
    pk: "id",
    fk: "user_id → users.id",
    category: "photos",
    section: "Photos",
    core: true,
  },
  {
    name: "user_interests",
    cardinality: "1:N",
    pk: "id",
    fk: "user_id → users.id",
    category: "interests",
    section: "Interests",
    core: true,
  },
  {
    name: "user_settings",
    cardinality: "1:1",
    pk: "user_id",
    fk: "user_id → users.id",
    category: "settings",
    section: "Preferences",
    core: true,
  },
  {
    name: "user_gender_preferences",
    cardinality: "1:N",
    pk: "id",
    fk: "user_id → users.id",
    category: "settings",
    section: "Preferences",
    core: true,
  },
  {
    name: "subscriptions",
    cardinality: "1:1",
    pk: "id",
    fk: "user_id → users.id",
    category: "subscription",
    section: "Current plan",
    core: true,
  },
  {
    name: "subscription_history",
    cardinality: "1:N",
    pk: "id",
    fk: "user_id → users.id",
    category: "subscription",
    section: "Plan history",
    core: true,
  },
  {
    name: "user_hobbies",
    cardinality: "1:N",
    pk: "id",
    fk: "user_id → users.id",
    category: "evolution",
    section: "Hobbies",
    core: false,
  },
  {
    name: "events",
    cardinality: "1:N",
    pk: "id",
    fk: "organizer_id → users.id",
    category: "evolution",
    section: "Events",
    core: false,
  },
];

export const CORE_LESSON_TABLES = LESSON_TABLES.filter((t) => t.core);

export function tableCount(tables: Record<string, unknown>, coreOnly = true): {
  tables: number;
  rows: number;
} {
  const specs = coreOnly ? CORE_LESSON_TABLES : LESSON_TABLES;
  let nTables = 0;
  let nRows = 0;
  for (const spec of specs) {
    const rows = tables[spec.name];
    if (!Array.isArray(rows)) continue;
    if (rows.length === 0 && !spec.core) continue;
    if (rows.length === 0 && spec.core) {
      nTables += 1;
      continue;
    }
    nTables += 1;
    nRows += rows.length;
  }
  return { tables: nTables, rows: nRows };
}
