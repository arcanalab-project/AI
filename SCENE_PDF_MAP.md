# Scene ↔ PDF (Tinder bootcamp)

The original PDF (`tinder bootcamp.pdf`) is not on this VM. The map follows the sequence required by the brief. Page numbers are the course pages, not a local PDF.

| Scene | Title | Pages | Preserved content |
|------|--------|--------|----------------------|
| 1 | One person, one screen | pp. 3–5 | The full app has many entities; the exercise is user, preferences, subscription. Card fields. |
| 2 | Put her in tables | pp. 6–8 | Nine tables for one person: `users`, `cities`, `user_education`, `user_photos`, `user_interests`, `user_settings`, `user_gender_preferences`, `subscriptions`, `subscription_history`. Contrast vs 1 document. |
| 3 | Preferences arrive | pp. 6–8 | Distance, age range, notifications, visibility. Profile ≠ settings. |
| 4 | The subscription arrives | pp. 6–8 | Plan, payment, dates, auto-renew. Current `subscriptions` vs `subscription_history`. |
| 5 | Reassemble the person | p. 9 | One query for the whole person. JOIN/subquery, no photo×interest cartesian, UI object. |
| 6 | Model the person as a document | pp. 10–12 | Relational diagram → document. Arrays, `settings`, `subscription`. MongoDB read. |
| 7 | The product changes | pp. 13–20 | Hobbies, optional pronouns, organizer profile. Different shapes. Missing fields are ok. |
| 8 | When to embed and when to reference | pp. 15–20 | Settings + current sub vs messages/interactions/history. Quiz. |

Outside the teaching sequence (MVP, after the three concepts): swipe/like, match, messages, events. No Apple Health / Google Health / movetodate integration.

Slide instructions never override this brief.
