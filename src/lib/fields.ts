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
    label: "Name",
    category: "identity",
    sql: { table: "users", column: "display_name" },
    mongo: "displayName",
    slide: "users.display_name",
  },
  {
    id: "gender",
    label: "Gender",
    category: "identity",
    sql: { table: "users", column: "gender" },
    mongo: "gender",
  },
  {
    id: "birthDate",
    label: "Birth date / age",
    category: "identity",
    sql: { table: "users", column: "birth_date" },
    mongo: "birthDate",
  },
  {
    id: "heightCm",
    label: "Height",
    category: "identity",
    sql: { table: "users", column: "height_cm" },
    mongo: "heightCm",
  },
  {
    id: "bodyType",
    label: "Body type",
    category: "identity",
    sql: { table: "users", column: "body_type" },
    mongo: "bodyType",
    optional: true,
  },
  {
    id: "profession",
    label: "Profession",
    category: "identity",
    sql: { table: "users", column: "profession" },
    mongo: "profession",
    optional: true,
  },
  {
    id: "education",
    label: "Education",
    category: "identity",
    sql: { table: "user_education", column: "school", relation: "users 1:1 user_education" },
    mongo: "education",
    optional: true,
  },
  {
    id: "city",
    label: "City",
    category: "identity",
    sql: { table: "cities", column: "name", relation: "users N:1 cities" },
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
    label: "Photos",
    category: "photos",
    sql: { table: "user_photos", column: "url", relation: "users 1:N user_photos" },
    mongo: "photos[]",
  },
  {
    id: "interests",
    label: "Interests",
    category: "interests",
    sql: { table: "user_interests", column: "interest", relation: "users 1:N user_interests" },
    mongo: "interests[]",
  },
  {
    id: "notifications",
    label: "Notifications",
    category: "settings",
    sql: { table: "user_settings", column: "notifications_enabled", relation: "users 1:1 user_settings" },
    mongo: "settings.notificationsEnabled",
  },
  {
    id: "discoveryDistance",
    label: "Discovery distance",
    category: "settings",
    sql: { table: "user_settings", column: "discovery_distance_km", relation: "users 1:1 user_settings" },
    mongo: "settings.discoveryDistanceKm",
    slide: "user_settings.discovery_distance_km",
  },
  {
    id: "ageRange",
    label: "Age range",
    category: "settings",
    sql: { table: "user_settings", column: "min_desired_age", relation: "users 1:1 user_settings" },
    mongo: "settings.minDesiredAge / settings.maxDesiredAge",
  },
  {
    id: "genderPreferences",
    label: "Genders sought",
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
    label: "Visibility",
    category: "settings",
    sql: { table: "user_settings", column: "profile_visibility" },
    mongo: "settings.profileVisibility",
  },
  {
    id: "paused",
    label: "Paused account",
    category: "settings",
    sql: { table: "user_settings", column: "paused_account" },
    mongo: "settings.pausedAccount",
  },
  {
    id: "plan",
    label: "Plan",
    category: "subscription",
    sql: { table: "subscriptions", column: "plan", relation: "users 1:1 subscriptions (current)" },
    mongo: "subscription.plan",
  },
  {
    id: "paymentStatus",
    label: "Payment",
    category: "subscription",
    sql: { table: "subscriptions", column: "payment_status" },
    mongo: "subscription.paymentStatus",
  },
  {
    id: "subDates",
    label: "Subscription dates",
    category: "subscription",
    sql: { table: "subscriptions", column: "start_date" },
    mongo: "subscription.startDate / subscription.endDate",
  },
  {
    id: "autoRenew",
    label: "Auto-renew",
    category: "subscription",
    sql: { table: "subscriptions", column: "auto_renew" },
    mongo: "subscription.autoRenew",
  },
  {
    id: "hobbies",
    label: "Hobbies",
    category: "evolution",
    sql: { table: "user_hobbies", column: "hobby", relation: "users 1:N user_hobbies" },
    mongo: "hobbies[]",
    optional: true,
  },
  {
    id: "pronouns",
    label: "Pronouns",
    category: "evolution",
    sql: { table: "users", column: "pronouns" },
    mongo: "pronouns",
    optional: true,
  },
  {
    id: "profileType",
    label: "Profile type",
    category: "evolution",
    sql: { table: "users", column: "profile_type" },
    mongo: "profileType",
    optional: true,
  },
];

export const CATEGORY_COLORS: Record<FieldCategory, { bg: string; fg: string; name: string }> = {
  identity: { bg: "#001E2B", fg: "#FFFFFF", name: "Profile" },
  photos: { bg: "#E3FCF7", fg: "#023430", name: "Photos" },
  interests: { bg: "#F9EBFF", fg: "#001E2B", name: "Interests" },
  settings: { bg: "#E9FF99", fg: "#001E2B", name: "Preferences" },
  subscription: { bg: "#00ED64", fg: "#001E2B", name: "Subscription" },
  evolution: { bg: "#00684A", fg: "#FFFFFF", name: "Evolution" },
};

export function fieldById(id: string): FieldDef | undefined {
  return FIELDS.find((f) => f.id === id);
}
