export type Scene = {
  id: number;
  title: string;
  question: string;
  action: string;
  conclusion: string;
  solution: string;
  pdfPages: string;
};

export const SCENES: Scene[] = [
  {
    id: 1,
    title: "One person, one screen",
    question: "What data do we need to build this screen?",
    action: "Click the profile fields: they appear one at a time, with name and type.",
    conclusion: "A “simple” screen is already an aggregate: identity, photos, interests, city.",
    solution:
      "At minimum: id, display name, gender (including unspecified), birth date + age, height, city, photos, interests. Then optionals: body type, profession, education, bio.",
    pdfPages: "pp. 3–5",
  },
  {
    id: 2,
    title: "Put her in tables",
    question: "Why isn’t a single users table enough?",
    action: "Watch PK, FK, and cardinality. Compare 1:1 (settings) and 1:N (photos, interests).",
    conclusion: "The relational model normalizes. This is not the only way to use an RDBMS: it is an explicit model for this lesson.",
    solution:
      "users (1) → user_photos (N), user_interests (N), user_settings (1), user_gender_preferences (N), subscriptions (N). The extra gender-prefs table avoids a CSV and keeps a multi-value preference queryable.",
    pdfPages: "pp. 6–8",
  },
  {
    id: 3,
    title: "Preferences arrive",
    question: "What belongs on the profile, and what belongs in settings?",
    action: "Edit distance, age range, notifications, and visibility. The person in the center stays the same.",
    conclusion: "Preferences drive discovery; they are not biographical attributes.",
    solution:
      "Profile = who she is. Settings = how she wants to be found and who she is looking for. In SQL they live in user_settings (1:1) + user_gender_preferences (1:N).",
    pdfPages: "pp. 6–8",
  },
  {
    id: 4,
    title: "The subscription arrives",
    question: "A user has a plan. Is that the same as having a payment history?",
    action: "Change plan, payment status, dates, and auto-renew. For the lesson we show one current subscription.",
    conclusion: "Current and history have different needs: history grows; the current plan is read with the profile.",
    solution:
      "subscriptions table with is_current. History stays as rows; MongoDB will embed only the current one in the user document.",
    pdfPages: "pp. 6–8",
  },
  {
    id: 5,
    title: "Reassemble the person",
    question: "How do I retrieve the full person with one query, without a cartesian explosion?",
    action: "Run the real SQL. Compare the tabular result with the UI object.",
    conclusion: "JOINs on 1:N collections multiply rows. Photos × interests must not explode.",
    solution:
      "A JOIN users ⋈ photos ⋈ interests produces a cartesian product. Here we use subqueries with json_group_array (equivalent to json_agg in PostgreSQL) so the engine returns one row per person.",
    pdfPages: "p. 9",
  },
  {
    id: 6,
    title: "Model the person as a document",
    question: "If the data is read together, why not store it together?",
    action: "Animate rows into nested objects and arrays, then read the real MongoDB document.",
    conclusion: "The document matches the application object. One read, the same shape as the UI.",
    solution:
      "findOne on bootcamp_users. Photos and interests are bounded arrays; settings and the current subscription are nested objects. GeoJSON: coordinates = [longitude, latitude].",
    pdfPages: "pp. 10–12",
  },
  {
    id: 7,
    title: "The product changes",
    question: "Hobbies, pronouns, organizer profile: what happens to both models?",
    action: "Three buttons. Look at before/after. Some documents stay without the new fields.",
    conclusion: "MongoDB is flexible, not magic: you still need design, validation, and a UI that tolerates missing fields. In SQL, ALTER does not always imply downtime.",
    solution:
      "SQL: CREATE TABLE / ALTER TABLE. MongoDB: optional new fields on some docs. The app must handle missing hobbies/pronouns. Adding a feature touches frontend and backend in both approaches.",
    pdfPages: "pp. 13–20",
  },
  {
    id: 8,
    title: "When to embed and when to reference",
    question: "Why settings yes, and messages no?",
    action: "Three lightning questions. Reveal the answer after the classroom discussion.",
    conclusion: "Embed what is bounded and read with the profile. Reference what grows without bound or has its own lifecycle.",
    solution:
      "1) Settings and the current subscription: 1:1 / 1:current, read with the card. 2) Messages, likes, event history: unbounded → dedicated collections. 3) Single-document atomicity does not automatically cover like+match across documents; you need uniqueness and idempotent ops. Avoiding JOIN on this aggregate ≠ MongoDB cannot do relations or $lookup.",
    pdfPages: "pp. 15–20 + data modeling",
  },
];
