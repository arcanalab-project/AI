import type { FieldCategory } from "./types";

export type FieldDef = {
  id: string;
  label: string;
  category: FieldCategory;
  sql: { table: string; column: string; relation?: string };
  mongo: string;
  slide?: string;
  optional?: boolean;
};

export const FIELDS: FieldDef[] = [
  {
    id: "displayName",
    label: "Nome",
    category: "identity",
    sql: { table: "users", column: "display_name" },
    mongo: "displayName",
    slide: "users.display_name",
  },
  {
    id: "gender",
    label: "Genere",
    category: "identity",
    sql: { table: "users", column: "gender" },
    mongo: "gender",
  },
  {
    id: "birthDate",
    label: "Data di nascita / età",
    category: "identity",
    sql: { table: "users", column: "birth_date" },
    mongo: "birthDate",
  },
  {
    id: "heightCm",
    label: "Altezza",
    category: "identity",
    sql: { table: "users", column: "height_cm" },
    mongo: "heightCm",
  },
  {
    id: "bodyType",
    label: "Costituzione",
    category: "identity",
    sql: { table: "users", column: "body_type" },
    mongo: "bodyType",
    optional: true,
  },
  {
    id: "profession",
    label: "Professione",
    category: "identity",
    sql: { table: "users", column: "profession" },
    mongo: "profession",
    optional: true,
  },
  {
    id: "education",
    label: "Formazione",
    category: "identity",
    sql: { table: "users", column: "education" },
    mongo: "education",
    optional: true,
  },
  {
    id: "city",
    label: "Città",
    category: "identity",
    sql: { table: "users", column: "city" },
    mongo: "city",
  },
  {
    id: "bio",
    label: "Bio",
    category: "identity",
    sql: { table: "users", column: "bio" },
    mongo: "bio",
  },
  {
    id: "photos",
    label: "Foto",
    category: "photos",
    sql: { table: "user_photos", column: "url", relation: "users 1:N user_photos" },
    mongo: "photos[]",
  },
  {
    id: "interests",
    label: "Interessi",
    category: "interests",
    sql: { table: "user_interests", column: "interest", relation: "users 1:N user_interests" },
    mongo: "interests[]",
  },
  {
    id: "notifications",
    label: "Notifiche",
    category: "settings",
    sql: { table: "user_settings", column: "notifications_enabled", relation: "users 1:1 user_settings" },
    mongo: "settings.notificationsEnabled",
  },
  {
    id: "discoveryDistance",
    label: "Distanza discovery",
    category: "settings",
    sql: { table: "user_settings", column: "discovery_distance_km", relation: "users 1:1 user_settings" },
    mongo: "settings.discoveryDistanceKm",
    slide: "user_settings.discovery_distance_km",
  },
  {
    id: "ageRange",
    label: "Fascia di età",
    category: "settings",
    sql: { table: "user_settings", column: "min_desired_age", relation: "users 1:1 user_settings" },
    mongo: "settings.minDesiredAge / settings.maxDesiredAge",
  },
  {
    id: "genderPreferences",
    label: "Generi cercati",
    category: "settings",
    sql: {
      table: "user_gender_preferences",
      column: "gender",
      relation: "users 1:N user_gender_preferences",
    },
    mongo: "settings.genderPreferences[]",
  },
  {
    id: "visibility",
    label: "Visibilità",
    category: "settings",
    sql: { table: "user_settings", column: "profile_visibility" },
    mongo: "settings.profileVisibility",
  },
  {
    id: "paused",
    label: "Account in pausa",
    category: "settings",
    sql: { table: "user_settings", column: "paused_account" },
    mongo: "settings.pausedAccount",
  },
  {
    id: "plan",
    label: "Piano",
    category: "subscription",
    sql: { table: "subscriptions", column: "plan", relation: "users 1:N subscriptions (corrente: is_current=1)" },
    mongo: "subscription.plan",
  },
  {
    id: "paymentStatus",
    label: "Pagamento",
    category: "subscription",
    sql: { table: "subscriptions", column: "payment_status" },
    mongo: "subscription.paymentStatus",
  },
  {
    id: "subDates",
    label: "Date abbonamento",
    category: "subscription",
    sql: { table: "subscriptions", column: "start_date" },
    mongo: "subscription.startDate / subscription.endDate",
  },
  {
    id: "autoRenew",
    label: "Rinnovo automatico",
    category: "subscription",
    sql: { table: "subscriptions", column: "auto_renew" },
    mongo: "subscription.autoRenew",
  },
  {
    id: "hobbies",
    label: "Hobby",
    category: "evolution",
    sql: { table: "user_hobbies", column: "hobby", relation: "users 1:N user_hobbies" },
    mongo: "hobbies[]",
    optional: true,
  },
  {
    id: "pronouns",
    label: "Pronomi",
    category: "evolution",
    sql: { table: "users", column: "pronouns" },
    mongo: "pronouns",
    optional: true,
  },
  {
    id: "profileType",
    label: "Tipo profilo",
    category: "evolution",
    sql: { table: "users", column: "profile_type" },
    mongo: "profileType",
    optional: true,
  },
];

export const CATEGORY_COLORS: Record<FieldCategory, { bg: string; fg: string; name: string }> = {
  identity: { bg: "#001E2B", fg: "#FFFFFF", name: "Profilo" },
  photos: { bg: "#E3FCF7", fg: "#023430", name: "Foto" },
  interests: { bg: "#F9EBFF", fg: "#001E2B", name: "Interessi" },
  settings: { bg: "#E9FF99", fg: "#001E2B", name: "Preferenze" },
  subscription: { bg: "#00ED64", fg: "#001E2B", name: "Abbonamento" },
  evolution: { bg: "#00684A", fg: "#FFFFFF", name: "Evoluzione" },
};

export function fieldById(id: string): FieldDef | undefined {
  return FIELDS.find((f) => f.id === id);
}
