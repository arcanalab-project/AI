export type Scene = {
  id: number;
  title: string;
  question: string;
  takeaway: string;
  teacherNote: string;
};

export const SCENES: Scene[] = [
  {
    id: 1,
    title: "The profile",
    question: "What does one profile look like in a table and in a document?",
    takeaway: "The same few facts can sit in one row or in one document. Age is calculated from the birth date; it is not stored.",
    teacherNote:
      "Perimeter: name, gender, birth date, city, bio. One table, users. Identifiers such as id are technical, not business facts. Do not show photos, preferences, or the plan yet.",
  },
  {
    id: 2,
    title: "Photos and interests",
    question: "What happens when one person has many photos and many interests?",
    takeaway: "Several rows point at the person. The document keeps those values in arrays on the same document.",
    teacherNote:
      "PK means row identifier. FK means a reference to another row. user_photos.user_id and user_interests.user_id reference users.id. This is one normalized model, not the only one, and not a reason to add extra tables.",
  },
  {
    id: 3,
    title: "Preferences",
    question: "Where do discovery preferences go?",
    takeaway: "Preferences are how she wants to be found. They are not more biography. They appear only from this scene on.",
    teacherNote:
      "user_settings is one row per person. Genders sought are several rows, because one person can look for more than one gender. That is a list, not a comma-separated cell.",
  },
  {
    id: 4,
    title: "The current plan",
    question: "Where does the plan she has today belong?",
    takeaway: "The current plan is part of the profile you read with the card. Older plans are a growing list and stay out of this comparison.",
    teacherNote:
      "subscriptions here is the current plan only. subscription_history is withheld until the embed-or-reference scene. Do not count history in this scene.",
  },
  {
    id: 5,
    title: "Retrieve the profile",
    question: "How does each model hand the same profile to the app?",
    takeaway: "One assembled read on each side. The card uses the same business fields. This is not a speed test.",
    teacherNote:
      "SQL does not need one query per table. A join of two one-to-many lists multiplies rows; subqueries or aggregations avoid that. That is shape, not a claim that SQL is slow. The document read is one find. Age is still derived in the application.",
  },
  {
    id: 6,
    title: "An optional field",
    question: "The product asks for pronouns. What changes?",
    takeaway: "Pronouns are one new optional value. Giulia has them. Francesca does not. The app must accept both.",
    teacherNote:
      "SQL: a nullable column on users. Every row has the column; Francesca's value is NULL. Document: Giulia gains a field; Francesca's document omits it. Same business fact, different way to store 'not set'. Adding a column does not by itself mean downtime.",
  },
  {
    id: 7,
    title: "A new structure",
    question: "The product asks for hobbies. Why not just add them to interests?",
    takeaway: "Interests already mean match tags. Hobbies are a different list, so they get a new structure. Some profiles omit it.",
    teacherNote:
      "Relational: a new user_hobbies table, not a dumped extra column on interests. Document: a new hobbies array, optional in validation. The organizer example is optional: a short summary on the person is not the full event.",
  },
  {
    id: 8,
    title: "Embed or reference",
    question: "What stays on the profile, and what should live beside it?",
    takeaway: "Keep bounded data you read with the card. Reference data that grows or has its own fields.",
    teacherNote:
      "Current plan stays with the profile. Plan history does not: it grows, and it is not inside the profile document. An event summary is not the event; description and city stay on the event. Messages and likes are the same kind of choice. Single-document atomicity does not cover a like and a match in two places.",
  },
];
