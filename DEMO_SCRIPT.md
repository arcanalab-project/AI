# Demo script (15–20 min)

Project at 1440×900 or 1920×1080. Tab **The lesson**, then **The live app**.

Compatible identities for the match: **Giulia Conti** (Milano) ↔ **Luca Bianchi** (Milano). That is not random.

## 0. Reset (1 min)

1. Open the app.
2. Tab **The live app** → **Prepare Giulia ↔ Luca scenario**.
3. If you need a clean environment: **Reset lesson dataset** and/or **Reset MVP dataset** (confirmation: it states exactly which `datasetId` is reseeded).

## 1. Profile (scenes 1–2, ~3 min)

1. Tab **The lesson**. Giulia is in the center.
2. Scene 1: “What data do we need to build this screen?” The fields emerge. Click name, city, photos, interests: mapping strip UI → table → document path.
3. Next. Scene 2: **9 tables vs 1 document** for the same Giulia. `users`, `cities`, `user_education`, `user_photos`, `user_interests`, `user_settings`, `user_gender_preferences`, `subscriptions`, `subscription_history`. PK/FK on every table. Click a field: table + document path light up. Not a 3-table toy. Swipes are not the lesson.

## 2. Preferences and subscription (scenes 3–4, ~3 min)

1. Scene 3: edit distance, age range, notifications, visibility. Save. The profile stays Giulia; the settings change.
2. Open **Behind the scenes**: real SQL on `user_settings`.
3. Scene 4: Premium/Gold/Free plan, demo payment status, dates, auto-renew. Current plan is `subscriptions` (1:1). Free history is `subscription_history`.

## 3. SQL retrieve (scene 5, ~2 min)

1. **Run real SQL**.
2. One row, photos and interests in JSON. The “naive cartesian” count is explained; it is not the result used by the UI.
3. Show that SQLite is the lesson engine, not a speed test against Atlas.

## 4. Document (scenes 6–7, ~4 min)

1. Scene 6: tables still visible. **Animate rows → document**, then **MongoDB read**. One expandable JSON document — not nine collections.
2. Same content: `photos[]`, `interests[]`, `settings`, `subscription`, `location` GeoJSON `[lng, lat]`. History is not in the user document.
3. Scene 7: three buttons — hobbies, pronouns, organizer. Before/after. Francesca (and others) stay without the new fields. The UI does not break.

## 5. Quiz (scene 8, ~2 min)

Three questions: embed vs reference, unbounded arrays, multi-document atomicity. Reveal after the classroom discussion.

## 6. Live app (remaining time)

1. Tab **The live app**. Badge: Atlas live / embedded / offline.
2. Demo identity **Giulia**. **Profile**: edit bio or hobbies → Save. **Refresh** (F5): the data is still there.
3. **Preferences**: tighten the distance and check that Rome (Marco) disappears; Milano/Monza remain.
4. **Discovery**: Pass/Like. Repeated like: no duplicates (inspector: idempotent-hit).
5. Switch identity → **Luca** → Like Giulia. Switch → **Giulia** → Like Luca. One match.
6. Open the match, send a message. Switch again: the other side sees the thread. Order persisted.
7. **Behind the scenes** on the last real action (like/match/update), same structure as the lesson.
8. Optional: **Events** — create an event; bounded summary on the profile, documents in `bootcamp_events`.

Close: one person, two models, an app that persists.
