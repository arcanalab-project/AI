# Verification

Checked on this VM on 2026-10-11, against the progressive lesson (Giulia, English UI).

## Automated

- `npm test` — 30/30, including `tests/lessonStage.test.ts` (scene perimeter, business-fact parity, optional pronouns, hobbies without duplicates, history kept out of the profile document).
- `npx tsc --noEmit`
- `npx eslint` on the lesson view, JSON formatter, stage projection, live view, and app shell (`--max-warnings 0`)

## Browser

Headless Chrome, `http://127.0.0.1:3001`, viewports 1366×768 and 1920×1080. The page itself does not scroll; each panel scrolls inside its own box. Back, Next, and Reset scene stay on screen. Teacher notes and technical details start closed.

- Scene 1: only `users`, one JSON object, no photos, settings, or plan. Count `1 table · 1 row · 1 document`.
- Name lights the card, the `display_name` cell, and the `"displayName"` JSON path together.
- Scene 2: photos and interests only. Photos lights `users.id`, `user_photos.user_id`, and `photos[]`, with the reference sentence. The card shows the photo count.
- Scene 3: settings are in view. Subscriptions are not.
- Scene 4: current plan is in view on both panels. Count `6 tables · 10 rows · 1 document`. No `subscription_history` in the panels.
- Scene 5: same perimeter. Technical details stay closed.
- Scene 6: New request → Before → Apply change → After. Giulia’s table cell is `she/her`. Francesca’s cell is NULL and her document omits `pronouns`. Before still hides the column after apply. Applying twice leaves one `she/her` cell. Reset scene returns to New request and removes the value.
- Scene 7: hobbies are a new table and array, still distinct from interests. Two hobby cells, not four, after a second apply. Francesca has no hobbies array. The organizer note stays closed.
- Scene 8 after hobbies were applied: history sits under the tables, outside the profile count (`7 tables · 12 rows · 1 document`). A fresh scene 8, with no extension applied, is `6 tables · 10 rows · 1 document`. The event block shows city and description only on the event document.
- Back from scene 8 to scene 1 hides photos, hobbies, and pronouns again.
- No on-screen “nine tables” copy.
- With `/api/*` forced to 404: the live tab shows “Live commands are off. This host has no database API.” and “Live data is unavailable on this host.” Identity, prepare, both resets, and the Discovery / Profile / Preferences / Subscription / Events tabs are disabled.

## Not checked

- Republication of https://tin-bootcamp.surge.sh/. `GET /` is still 200, and the published JavaScript still contains “nine tables” and does not contain the scene title “The profile”. This VM has no Surge session.
- A live Atlas write. No `MONGODB_URI` is configured here.
- No timing comparison between the local lesson store and Atlas.
