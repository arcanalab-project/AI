/**
 * One naming convention in code:
 * - SQL / relational: snake_case
 * - MongoDB documents / application objects: camelCase
 *
 * Slide paths (when they differ) are listed here so the lesson can show both.
 */
export const FIELD_NAME_MAP = [
  {
    concept: "Distanza di discovery",
    slideSql: "user_settings.discovery_distance_km",
    sql: "user_settings.discovery_distance_km",
    mongo: "settings.discoveryDistanceKm",
    app: "settings.discoveryDistanceKm",
  },
  {
    concept: "Età minima desiderata",
    slideSql: "user_settings.min_desired_age",
    sql: "user_settings.min_desired_age",
    mongo: "settings.minDesiredAge",
    app: "settings.minDesiredAge",
  },
  {
    concept: "Età massima desiderata",
    slideSql: "user_settings.max_desired_age",
    sql: "user_settings.max_desired_age",
    mongo: "settings.maxDesiredAge",
    app: "settings.maxDesiredAge",
  },
  {
    concept: "Notifiche",
    slideSql: "user_settings.notifications_enabled",
    sql: "user_settings.notifications_enabled",
    mongo: "settings.notificationsEnabled",
    app: "settings.notificationsEnabled",
  },
  {
    concept: "Visibilità profilo",
    slideSql: "user_settings.profile_visibility",
    sql: "user_settings.profile_visibility",
    mongo: "settings.profileVisibility",
    app: "settings.profileVisibility",
  },
  {
    concept: "Account in pausa",
    slideSql: "user_settings.paused_account",
    sql: "user_settings.paused_account",
    mongo: "settings.pausedAccount",
    app: "settings.pausedAccount",
  },
  {
    concept: "Preferenze di genere",
    slideSql: "user_gender_preferences.gender (1:N)",
    sql: "user_gender_preferences.gender",
    mongo: "settings.genderPreferences[]",
    app: "settings.genderPreferences",
  },
  {
    concept: "Nome visualizzato",
    slideSql: "users.display_name",
    sql: "users.display_name",
    mongo: "displayName",
    app: "displayName",
  },
  {
    concept: "Data di nascita",
    slideSql: "users.birth_date",
    sql: "users.birth_date",
    mongo: "birthDate",
    app: "birthDate",
  },
  {
    concept: "Altezza",
    slideSql: "users.height_cm",
    sql: "users.height_cm",
    mongo: "heightCm",
    app: "heightCm",
  },
  {
    concept: "Foto",
    slideSql: "user_photos.url",
    sql: "user_photos.url",
    mongo: "photos[].url",
    app: "photos",
  },
  {
    concept: "Interessi",
    slideSql: "user_interests.interest",
    sql: "user_interests.interest",
    mongo: "interests[]",
    app: "interests",
  },
  {
    concept: "Piano abbonamento",
    slideSql: "subscriptions.plan",
    sql: "subscriptions.plan",
    mongo: "subscription.plan",
    app: "subscription.plan",
  },
] as const;
