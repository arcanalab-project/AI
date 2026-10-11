# Demo script (10 minutes)

Project the lesson at 1366×768 or 1920×1080. Stay on **The lesson** until the last minute. Back, Next, and Reset scene stay on screen. Teacher notes and technical details stay closed unless you open them.

## 1. One profile (scene 1, ~1 min)

Giulia is the compact card. Age is labeled derived. One table, `users`, and one JSON document: name, gender, birth date, city, bio. Click **Name**. The card chip, the `display_name` cell, and `"displayName"` in the JSON light up together.

## 2. Many rows, one array (scene 2, ~2 min)

Next. Photos and interests appear. Click **Photos**. Say: `id` is the row identifier; `user_photos.user_id` is a reference to `users.id`. The document holds `photos[]`. Interests work the same way. Preferences and the plan are not on screen yet.

## 3. Preferences, then the plan (scenes 3–4, ~2 min)

Scene 3 adds settings only now. Scene 4 adds the current plan only. The count line is calculated from the tables you see. Plan history is not in either panel.

## 4. The same read (scene 5, ~1 min)

Both panels are the profile so far. One sentence: each model can hand the app the same business fields. Open **Technical details** only if someone asks. It says this is not one query per table, and not a speed test.

## 5. Pronouns, then hobbies (scenes 6–7, ~3 min)

Scene 6: **New request → Before → Apply change → After**. After: Giulia has `she/her`. Francesca’s document omits pronouns; her table cell is NULL. Reset scene and apply again: still one value, not a duplicate.

Scene 7: hobbies are a new list, not more interests. Apply. Giulia gains `hobbies[]` and `user_hobbies`. Francesca keeps interests and has no hobbies. Optional organizer note stays closed unless you have time.

## 6. What not to embed (scene 8, ~1 min)

The current plan stays in the profile. Plan history is under the tables, outside the count. The event summary is not the event: city and description stay on the event document. If you applied hobbies, they stay on the profile. Reset scene 7 before this slide if you want the count without that new table.

If the class is on the static host, **The live app** says live commands are off. Do not demo likes there. On a Node host with a database, the live tab is a separate product demo.
