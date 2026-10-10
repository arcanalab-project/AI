export const NAIVE_JOIN_SQL = `-- EXPLANATION — NOT executed by the lesson engine.
-- A JOIN on two 1:N relations produces a cartesian product:
-- 3 photos × 3 interests = 9 rows for the same person.
SELECT u.display_name, p.url, i.interest
FROM users u
JOIN user_photos p ON p.user_id = u.id
JOIN user_interests i ON i.user_id = u.id
WHERE u.id = ?;`;

export const RETRIEVE_PERSON_SQL = `-- SQLite (lesson). PostgreSQL equivalent: json_agg / json_build_object.
-- Photos and interests come from aggregate subqueries: one row, no cartesian.
SELECT
  u.id,
  u.display_name,
  u.gender,
  u.birth_date,
  CAST((julianday('now') - julianday(u.birth_date)) / 365.25 AS INTEGER) AS age,
  u.height_cm,
  u.body_type,
  u.profession,
  u.education,
  u.city,
  u.city_lng,
  u.city_lat,
  u.bio,
  s.notifications_enabled,
  s.discovery_distance_km,
  s.min_desired_age,
  s.max_desired_age,
  s.profile_visibility,
  s.paused_account,
  sub.id AS subscription_id,
  sub.plan,
  sub.payment_method,
  sub.payment_status,
  sub.start_date,
  sub.end_date,
  sub.auto_renew,
  (SELECT json_group_array(json_object(
      'url', p.url,
      'sort_order', p.sort_order,
      'caption', p.caption
    ))
   FROM (
     SELECT url, sort_order, caption FROM user_photos
     WHERE user_id = u.id
     ORDER BY sort_order
   ) p) AS photos,
  (SELECT json_group_array(i.interest)
   FROM user_interests i
   WHERE i.user_id = u.id) AS interests,
  (SELECT json_group_array(g.gender)
   FROM user_gender_preferences g
   WHERE g.user_id = u.id) AS gender_preferences
FROM users u
LEFT JOIN user_settings s ON s.user_id = u.id
LEFT JOIN subscriptions sub ON sub.user_id = u.id AND sub.is_current = 1
WHERE u.id = ?;`;

export const MONGO_FIND_ONE = {
  find: "bootcamp_users",
  filter: { datasetId: "lesson", profileId: "giulia" },
};
