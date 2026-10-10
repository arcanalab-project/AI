/**
 * One naming convention in code:
 * - SQL / relational: snake_case
 * - MongoDB documents / application objects: camelCase
 *
 * Slide paths (when they differ) are listed here so the lesson can show both.
 */
export const FIELD_NAME_MAP = [
  {
    concept: "Discovery distance",
    slideSql: "user_settings.discovery_distance_km",
    sql: "user_settings.discovery_distance_km",
    mongo: "settings.discoveryDistanceKm",
    app: "settings.discoveryDistanceKm",
  },
  {
    concept: "Minimum desired age",
    slideSql: "user_settings.min_desired_age",
    sql: "user_settings.min_desired_age",
    mongo: "settings.minDesiredAge",
    app: "settings.minDesiredAge",
  },
  {
    concept: "Maximum desired age",
    slideSql: "user_settings.max_desired_age",
    sql: "user_settings.max_desired_age",
    mongo: "settings.maxDesiredAge",
    app: "settings.maxDesiredAge",
  },
  {
    concept: "Notifications",
    slideSql: "user_settings.notifications_enabled",
    sql: "user_settings.notifications_enabled",
    mongo: "settings.notificationsEnabled",
    app: "settings.notificationsEnabled",
  },
  {
    concept: "Profile visibility",
    slideSql: "user_settings.profile_visibility",
    sql: "user_settings.profile_visibility",
    mongo: "settings.profileVisibility",
    app: "settings.profileVisibility",
  },
  {
    concept: "Paused account",
    slideSql: "user_settings.paused_account",
    sql: "user_settings.paused_account",
    mongo: "settings.pausedAccount",
    app: "settings.pausedAccount",
  },
  {
    concept: "Gender preferences",
    slideSql: "user_gender_preferences.gender (1:N)",
    sql: "user_gender_preferences.gender",
    mongo: "settings.genderPreferences[]",
    app: "settings.genderPreferences",
  },
  {
    concept: "Display name",
    slideSql: "users.display_name",
    sql: "users.display_name",
    mongo: "displayName",
    app: "displayName",
  },
  {
    concept: "Birth date",
    slideSql: "users.birth_date",
    sql: "users.birth_date",
    mongo: "birthDate",
    app: "birthDate",
  },
  {
    concept: "Height",
    slideSql: "users.height_cm",
    sql: "users.height_cm",
    mongo: "heightCm",
    app: "heightCm",
  },
  {
    concept: "Photos",
    slideSql: "user_photos.url",
    sql: "user_photos.url",
    mongo: "photos[].url",
    app: "photos",
  },
  {
    concept: "Interests",
    slideSql: "user_interests.interest",
    sql: "user_interests.interest",
    mongo: "interests[]",
    app: "interests",
  },
  {
    concept: "Subscription plan",
    slideSql: "subscriptions.plan",
    sql: "subscriptions.plan",
    mongo: "subscription.plan",
    app: "subscription.plan",
  },
] as const;
