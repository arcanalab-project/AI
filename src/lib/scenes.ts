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
    conclusion: "One dating-app person is already many sections: profile, photos, interests, city, preferences, plan. Swipes and messages wait; this card is the lesson.",
    solution:
      "At minimum: id, display name, gender (including unspecified), birth date + age, height, city, photos, interests. Then optionals: body type, profession, education, bio. That is already more than one table’s worth of facts.",
    pdfPages: "pp. 3–5",
  },
  {
    id: 2,
    title: "Put her in tables",
    question: "Why isn’t a single users table enough?",
    action: "Count the tables. Follow PK/FK. This is one normalized model of Giulia — not the only possible RDBMS design.",
    conclusion: "Nine tables hold the same person you see on the card. The document on the right is still one object. Table count is not query count.",
    solution:
      "users, cities, user_education, user_photos (1:N), user_interests (1:N), user_settings (1:1), user_gender_preferences (1:N), subscriptions (current 1:1), subscription_history (1:N). Gender prefs is a table, not a CSV. Reconstituting the card means assembling those rows.",
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
      "Current plan: subscriptions (1:1). Past Free: subscription_history (1:N). MongoDB embeds only the current plan in the user document; history is a different need.",
    pdfPages: "pp. 6–8",
  },
  {
    id: 5,
    title: "Reassemble the person",
    question: "How do I retrieve the full person with one query, without a cartesian explosion?",
    action: "Run the real SQL. Compare the tabular result with the UI object.",
    conclusion: "Nine tables, one person. Joining two 1:N relations multiplies rows. That is a modeling cost, not a claim that SQL is slow.",
    solution:
      "A JOIN users ⋈ photos ⋈ interests produces a cartesian product. Table count ≠ query count: here subqueries with json_group_array (PostgreSQL: json_agg) return one row per person.",
    pdfPages: "p. 9",
  },
  {
    id: 6,
    title: "Model the person as a document",
    question: "If the data is read together, why not store it together?",
    action: "Nine tables on the left, one expandable JSON document on the right. Same Giulia. Nested objects and arrays — not nine collections.",
    conclusion: "The document matches the application object. One person, one document. That is a modeling choice, not a claim that SQL is slow.",
    solution:
      "findOne on bootcamp_users. Photos and interests are bounded arrays; settings and the current subscription are nested objects. City coordinates become GeoJSON [longitude, latitude]. History stays out of the user document.",
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
