import { computeAge, DEMO_AS_OF } from "./age";
import { assertLngLat } from "./geo";
import type { PersonFixture } from "./types";

export const CANONICAL_PROFILE_ID = "giulia";
export const MATCH_DEMO_PROFILE_ID = "luca";
export const LESSON_USER_ID = 1;

const CITIES = {
  Milano: [9.19, 45.4642] as [number, number],
  Roma: [12.4964, 41.9028] as [number, number],
  Torino: [7.6869, 45.0703] as [number, number],
  Bologna: [11.3426, 44.4949] as [number, number],
  Firenze: [11.2558, 43.7696] as [number, number],
  Napoli: [14.2681, 40.8518] as [number, number],
  Verona: [10.9916, 45.4384] as [number, number],
  Genova: [8.9463, 44.4056] as [number, number],
  Padova: [11.8768, 45.4064] as [number, number],
  Bergamo: [9.6773, 45.6983] as [number, number],
  Monza: [9.2736, 45.5845] as [number, number],
  Como: [9.0852, 45.8081] as [number, number],
};

function photos(id: string, n: number, captions: string[] = []): PersonFixture["photos"] {
  return Array.from({ length: n }, (_, i) => ({
    url: `/avatars/${id}-${i + 1}.svg`,
    sortOrder: i,
    caption: captions[i],
  }));
}

function point(city: keyof typeof CITIES) {
  const coordinates = CITIES[city];
  assertLngLat(coordinates, city);
  return { type: "Point" as const, coordinates };
}

/**
 * Single source of truth. SQL rows and MongoDB documents are derived from here.
 * IDs and values must match across representations.
 */
export const PEOPLE: PersonFixture[] = [
  {
    id: 1,
    profileId: "giulia",
    displayName: "Giulia Conti",
    gender: "woman",
    birthDate: "1997-03-14",
    heightCm: 168,
    bodyType: "athletic",
    profession: "Photographer",
    education: "Accademia di Brera",
    city: "Milano",
    location: point("Milano"),
    bio: "I look for real conversations, natural light, and risotto done properly.",
    photos: photos("giulia", 3, ["Navigli", "Studio", "Lake"]),
    interests: ["photography", "travel", "cooking"],
    hobbies: ["climbing", "jazz"],
    pronouns: "she/her",
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 40,
      minDesiredAge: 26,
      maxDesiredAge: 38,
      genderPreferences: ["man"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-giulia-current",
      plan: "Premium",
      paymentMethod: "Visa ••4242",
      paymentStatus: "Success",
      startDate: "2026-07-01",
      endDate: "2026-12-31",
      autoRenew: true,
    },
    subscriptionHistory: [
      {
        id: "sub-giulia-past",
        plan: "Free",
        paymentMethod: "None",
        paymentStatus: "Success",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        autoRenew: false,
      },
    ],
    schemaVersion: 2,
  },
  {
    id: 2,
    profileId: "luca",
    displayName: "Luca Bianchi",
    gender: "man",
    birthDate: "1994-06-22",
    heightCm: 182,
    bodyType: "average",
    profession: "Architect",
    education: "Politecnico di Milano",
    city: "Milano",
    location: point("Milano"),
    bio: "I design spaces and walk cities. An exhibition, a trek, then dinner.",
    photos: photos("luca", 3, ["Duomo", "Construction site", "Trail"]),
    interests: ["architecture", "hiking", "cinema"],
    hobbies: ["sailing"],
    pronouns: "he/him",
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 40,
      minDesiredAge: 24,
      maxDesiredAge: 36,
      genderPreferences: ["woman"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-luca-current",
      plan: "Gold",
      paymentMethod: "Mastercard ••4444",
      paymentStatus: "Success",
      startDate: "2026-05-01",
      endDate: "2026-11-01",
      autoRenew: true,
    },
    schemaVersion: 2,
  },
  {
    id: 3,
    profileId: "sofia",
    displayName: "Sofia Ricci",
    gender: "woman",
    birthDate: "1999-11-02",
    heightCm: 165,
    profession: "Designer",
    education: "NABA",
    city: "Milano",
    location: point("Milano"),
    bio: "Type, grids, and endless playlists. I get lost in museums.",
    photos: photos("sofia", 3),
    interests: ["design", "museums", "running"],
    hobbies: ["ceramics"],
    pronouns: "she/her",
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 25,
      minDesiredAge: 25,
      maxDesiredAge: 40,
      genderPreferences: ["man", "nonbinary"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-sofia-current",
      plan: "Free",
      paymentMethod: "None",
      paymentStatus: "Success",
      startDate: "2026-09-01",
      endDate: "2027-09-01",
      autoRenew: false,
    },
    schemaVersion: 2,
  },
  {
    id: 4,
    profileId: "marco",
    displayName: "Marco Ferrari",
    gender: "man",
    birthDate: "1992-01-18",
    heightCm: 178,
    bodyType: "athletic",
    profession: "Developer",
    education: "Sapienza",
    city: "Roma",
    location: point("Roma"),
    bio: "Backend by day, carbonara by night. Rome is already an algorithm.",
    photos: photos("marco", 2),
    interests: ["coding", "cooking", "football"],
    profileType: "standard",
    settings: {
      notificationsEnabled: false,
      discoveryDistanceKm: 30,
      minDesiredAge: 25,
      maxDesiredAge: 40,
      genderPreferences: ["woman"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-marco-current",
      plan: "Premium",
      paymentMethod: "Visa ••1212",
      paymentStatus: "Pending",
      startDate: "2026-10-01",
      endDate: "2027-01-01",
      autoRenew: true,
    },
    schemaVersion: 1,
  },
  {
    id: 5,
    profileId: "elena",
    displayName: "Elena Marino",
    gender: "woman",
    birthDate: "1995-08-09",
    heightCm: 170,
    profession: "Researcher",
    city: "Torino",
    location: point("Torino"),
    bio: "Lab, mountains, thick books. Hidden profile for the filter demo.",
    photos: photos("elena", 2),
    interests: ["science", "mountains", "books"],
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 80,
      minDesiredAge: 28,
      maxDesiredAge: 42,
      genderPreferences: ["man"],
      profileVisibility: "hidden",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-elena-current",
      plan: "Free",
      paymentMethod: "None",
      paymentStatus: "Success",
      startDate: "2026-03-01",
      endDate: "2027-03-01",
      autoRenew: false,
    },
    schemaVersion: 1,
  },
  {
    id: 6,
    profileId: "davide",
    displayName: "Davide Greco",
    gender: "man",
    birthDate: "1990-12-01",
    heightCm: 185,
    bodyType: "average",
    profession: "Chef",
    city: "Bologna",
    location: point("Bologna"),
    bio: "Tortellini and soul playlists. Paused account: I must not appear in discovery.",
    photos: photos("davide", 2),
    interests: ["cooking", "music", "markets"],
    profileType: "standard",
    settings: {
      notificationsEnabled: false,
      discoveryDistanceKm: 15,
      minDesiredAge: 25,
      maxDesiredAge: 40,
      genderPreferences: ["woman", "nonbinary"],
      profileVisibility: "public",
      pausedAccount: true,
    },
    subscription: {
      id: "sub-davide-current",
      plan: "Gold",
      paymentMethod: "Visa ••9999",
      paymentStatus: "Failed",
      startDate: "2026-08-01",
      endDate: "2026-11-01",
      autoRenew: true,
    },
    schemaVersion: 1,
  },
  {
    id: 7,
    profileId: "chiara",
    displayName: "Chiara Romano",
    gender: "nonbinary",
    birthDate: "1998-04-27",
    heightCm: 172,
    profession: "Illustrator",
    education: "ISIA",
    city: "Firenze",
    location: point("Firenze"),
    bio: "I draw bodies and cities. Pronouns she/they.",
    photos: photos("chiara", 2),
    interests: ["illustration", "vintage", "gardens"],
    hobbies: ["printmaking"],
    pronouns: "she/they",
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 50,
      minDesiredAge: 23,
      maxDesiredAge: 40,
      genderPreferences: ["woman", "man", "nonbinary"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-chiara-current",
      plan: "Premium",
      paymentMethod: "Mastercard ••2222",
      paymentStatus: "Success",
      startDate: "2026-06-15",
      endDate: "2026-12-15",
      autoRenew: true,
    },
    schemaVersion: 2,
  },
  {
    id: 8,
    profileId: "alessandro",
    displayName: "Alessandro Costa",
    gender: "man",
    birthDate: "1988-07-15",
    heightCm: 180,
    bodyType: "average",
    profession: "Event organizer",
    education: "Federico II",
    city: "Napoli",
    location: point("Napoli"),
    bio: "I bring people and places together. The gulf helps.",
    photos: photos("alessandro", 3, ["Waterfront", "Event", "Coffee"]),
    interests: ["events", "music", "sea"],
    hobbies: ["DJ sets"],
    pronouns: "he/him",
    profileType: "eventOrganizer",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 60,
      minDesiredAge: 27,
      maxDesiredAge: 42,
      genderPreferences: ["woman"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-alessandro-current",
      plan: "Gold",
      paymentMethod: "Visa ••7777",
      paymentStatus: "Success",
      startDate: "2026-04-01",
      endDate: "2027-04-01",
      autoRenew: true,
    },
    events: [
      {
        id: "evt-aperitivo-napoli",
        title: "Aperitivo: data and love",
        city: "Napoli",
        startsAt: "2026-10-18T18:30:00+02:00",
        description: "A drink, two stories, zero pitch. For people who work with data.",
      },
    ],
    schemaVersion: 2,
  },
  {
    id: 9,
    profileId: "francesca",
    displayName: "Francesca Esposito",
    gender: "woman",
    birthDate: "1996-02-20",
    heightCm: 166,
    city: "Verona",
    location: point("Verona"),
    bio: "Arena, river, quiet. “Old schema” profile: no optionals.",
    photos: photos("francesca", 1),
    interests: ["theater", "wine"],
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 35,
      minDesiredAge: 27,
      maxDesiredAge: 39,
      genderPreferences: ["man"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-francesca-current",
      plan: "Free",
      paymentMethod: "None",
      paymentStatus: "Success",
      startDate: "2026-02-20",
      endDate: "2027-02-20",
      autoRenew: false,
    },
    schemaVersion: 1,
  },
  {
    id: 10,
    profileId: "matteo",
    displayName: "Matteo Lombardi",
    gender: "man",
    birthDate: "1993-09-30",
    heightCm: 176,
    profession: "Journalist",
    city: "Genova",
    location: point("Genova"),
    bio: "Harbor, palazzi, deadlines. I write about cities that change.",
    photos: photos("matteo", 2),
    interests: ["writing", "sea", "politics"],
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 45,
      minDesiredAge: 25,
      maxDesiredAge: 38,
      genderPreferences: ["woman", "nonbinary"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-matteo-current",
      plan: "Premium",
      paymentMethod: "Visa ••3333",
      paymentStatus: "Success",
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      autoRenew: false,
    },
    schemaVersion: 1,
  },
  {
    id: 11,
    profileId: "iris",
    displayName: "Iris Bianco",
    gender: "unspecified",
    birthDate: "2000-05-11",
    heightCm: 169,
    profession: "Physics student",
    city: "Padova",
    location: point("Padova"),
    bio: "Gender unspecified, curiosity yes. Coffee and observatories.",
    photos: photos("iris", 2),
    interests: ["physics", "coffee", "bikes"],
    pronouns: "none",
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 20,
      minDesiredAge: 22,
      maxDesiredAge: 35,
      genderPreferences: ["woman", "man", "nonbinary", "unspecified"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-iris-current",
      plan: "Free",
      paymentMethod: "None",
      paymentStatus: "Success",
      startDate: "2026-05-11",
      endDate: "2027-05-11",
      autoRenew: false,
    },
    schemaVersion: 2,
  },
  {
    id: 12,
    profileId: "noemi",
    displayName: "Noemi Conti",
    gender: "woman",
    birthDate: "1991-10-08",
    heightCm: 163,
    bodyType: "petite",
    profession: "Teacher",
    education: "Università di Bergamo",
    city: "Bergamo",
    location: point("Bergamo"),
    bio: "Upper town and long pauses. ~45 km from Milan: useful for distance filters.",
    photos: photos("noemi", 2),
    interests: ["teaching", "hiking", "cinema"],
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 55,
      minDesiredAge: 29,
      maxDesiredAge: 45,
      genderPreferences: ["man"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-noemi-current",
      plan: "Premium",
      paymentMethod: "Mastercard ••8888",
      paymentStatus: "Success",
      startDate: "2026-01-10",
      endDate: "2026-10-10",
      autoRenew: true,
    },
    schemaVersion: 1,
  },
  {
    id: 13,
    profileId: "samuele",
    displayName: "Samuele Riva",
    gender: "man",
    birthDate: "1997-01-05",
    heightCm: 181,
    profession: "Product manager",
    city: "Monza",
    location: point("Monza"),
    bio: "Monza is close: if the distance filter is tight, I stay in the deck.",
    photos: photos("samuele", 2),
    interests: ["product", "f1", "cooking"],
    hobbies: ["running"],
    pronouns: "he/him",
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 30,
      minDesiredAge: 24,
      maxDesiredAge: 36,
      genderPreferences: ["woman"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-samuele-current",
      plan: "Free",
      paymentMethod: "None",
      paymentStatus: "Success",
      startDate: "2026-08-20",
      endDate: "2027-08-20",
      autoRenew: false,
    },
    schemaVersion: 2,
  },
  {
    id: 14,
    profileId: "viola",
    displayName: "Viola Fontana",
    gender: "woman",
    birthDate: "1994-12-19",
    heightCm: 174,
    profession: "Violinist",
    education: "Conservatorio di Como",
    city: "Como",
    location: point("Como"),
    bio: "Lake and rehearsals. About 40 km from Milan.",
    photos: photos("viola", 2),
    interests: ["music", "lake", "travel"],
    profileType: "standard",
    settings: {
      notificationsEnabled: true,
      discoveryDistanceKm: 50,
      minDesiredAge: 26,
      maxDesiredAge: 40,
      genderPreferences: ["man", "nonbinary"],
      profileVisibility: "public",
      pausedAccount: false,
    },
    subscription: {
      id: "sub-viola-current",
      plan: "Gold",
      paymentMethod: "Visa ••5656",
      paymentStatus: "Success",
      startDate: "2026-03-01",
      endDate: "2026-12-01",
      autoRenew: true,
    },
    schemaVersion: 1,
  },
];

export function personByProfileId(profileId: string): PersonFixture {
  const p = PEOPLE.find((x) => x.profileId === profileId);
  if (!p) throw new Error(`Unknown profile ${profileId}`);
  return p;
}

export function canonicalPerson(): PersonFixture {
  return personByProfileId(CANONICAL_PROFILE_ID);
}

export function withComputedAge(person: PersonFixture, asOf?: string | Date) {
  return { ...person, age: computeAge(person.birthDate, asOf ?? new Date()) };
}

export function adultGuard(asOf = DEMO_AS_OF): void {
  for (const p of PEOPLE) {
    const age = computeAge(p.birthDate, asOf);
    if (age < 21) {
      throw new Error(`${p.displayName} is under 21 (${age})`);
    }
  }
}

adultGuard();

/** Lesson scenes 1–6 omit evolved optional fields even if the fixture has them. */
export function lessonCorePerson(person: PersonFixture = canonicalPerson()): PersonFixture {
  const clone: PersonFixture = {
    ...person,
    photos: person.photos.map((p) => ({ ...p })),
    interests: [...person.interests],
    settings: { ...person.settings, genderPreferences: [...person.settings.genderPreferences] },
    subscription: { ...person.subscription },
    schemaVersion: 1,
    profileType: "standard",
  };
  delete clone.hobbies;
  delete clone.pronouns;
  delete clone.events;
  delete clone.bodyType;
  // keep bodyType/profession/education for Giulia in core — they are slide fields, not scene-7
  clone.bodyType = person.bodyType;
  return clone;
}

export function toMongoUser(person: PersonFixture, datasetId: "lesson" | "mvp") {
  const age = computeAge(person.birthDate);
  const doc: Record<string, unknown> = {
    datasetId,
    profileId: person.profileId,
    sqlId: person.id,
    displayName: person.displayName,
    gender: person.gender,
    birthDate: person.birthDate,
    age,
    heightCm: person.heightCm,
    city: person.city,
    location: person.location,
    bio: person.bio,
    photos: person.photos,
    interests: person.interests,
    settings: person.settings,
    subscription: person.subscription,
    schemaVersion: person.schemaVersion,
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-10-09T10:00:00.000Z",
  };
  if (person.bodyType) doc.bodyType = person.bodyType;
  if (person.profession) doc.profession = person.profession;
  if (person.education) doc.education = person.education;
  if (person.hobbies?.length) doc.hobbies = person.hobbies;
  if (person.pronouns) doc.pronouns = person.pronouns;
  if (person.profileType !== "standard") doc.profileType = person.profileType;
  if (person.events?.length) {
    doc.eventSummary = person.events.slice(0, 3).map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
    }));
  }
  return doc;
}

export function comparableCore(person: PersonFixture) {
  return {
    id: person.id,
    profileId: person.profileId,
    displayName: person.displayName,
    gender: person.gender,
    birthDate: person.birthDate,
    heightCm: person.heightCm,
    bodyType: person.bodyType ?? null,
    profession: person.profession ?? null,
    education: person.education ?? null,
    city: person.city,
    location: person.location,
    bio: person.bio,
    photos: person.photos.map((p) => ({ url: p.url, sortOrder: p.sortOrder })),
    interests: [...person.interests].sort(),
    settings: {
      ...person.settings,
      genderPreferences: [...person.settings.genderPreferences].sort(),
    },
    subscription: {
      id: person.subscription.id,
      plan: person.subscription.plan,
      paymentStatus: person.subscription.paymentStatus,
      startDate: person.subscription.startDate,
      endDate: person.subscription.endDate,
      autoRenew: person.subscription.autoRenew,
    },
  };
}
