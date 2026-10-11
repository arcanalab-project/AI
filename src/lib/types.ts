export const DATASETS = ["lesson", "mvp"] as const;
export type DatasetId = (typeof DATASETS)[number];

export const GENDERS = ["woman", "man", "nonbinary", "unspecified"] as const;
export type Gender = (typeof GENDERS)[number];

export const PLANS = ["Free", "Premium", "Gold"] as const;
export type Plan = (typeof PLANS)[number];

export const PAYMENT_STATUSES = ["Success", "Failed", "Pending"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PROFILE_TYPES = ["standard", "eventOrganizer"] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];

export const VISIBILITIES = ["public", "hidden"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type GeoPoint = {
  type: "Point";
  coordinates: [number, number]; // GeoJSON: [longitude, latitude]
};

export type Photo = {
  url: string;
  sortOrder: number;
  caption?: string;
};

export type Settings = {
  notificationsEnabled: boolean;
  discoveryDistanceKm: number;
  minDesiredAge: number;
  maxDesiredAge: number;
  genderPreferences: Gender[];
  profileVisibility: Visibility;
  pausedAccount: boolean;
};

export type Subscription = {
  id: string;
  plan: Plan;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
};

export type EventRecord = {
  id: string;
  title: string;
  city: string;
  startsAt: string;
  description: string;
};

export type PersonFixture = {
  id: number;
  profileId: string;
  displayName: string;
  gender: Gender;
  birthDate: string;
  heightCm: number;
  bodyType?: string;
  profession?: string;
  education?: string;
  city: string;
  location: GeoPoint;
  bio: string;
  photos: Photo[];
  interests: string[];
  hobbies?: string[];
  pronouns?: string;
  profileType: ProfileType;
  settings: Settings;
  subscription: Subscription;
  subscriptionHistory?: Subscription[];
  events?: EventRecord[];
  schemaVersion: number;
};

export type InspectorRecord = {
  description: string;
  engine: "SQLite" | "MongoDB";
  target: string;
  operation: unknown;
  outcome: string;
  result?: unknown;
  before?: unknown;
  after?: unknown;
  elapsedMs?: number;
  measured: boolean;
  explanatory?: boolean;
  note?: string;
};

export type ConnectionState = {
  mode: "atlas" | "embedded" | "offline";
  db: string;
  host?: string;
  error?: string;
  collections?: string[];
  /** Set when MONGODB_URI is absent and the known cluster was probed. */
  atlas?: "online-auth-required" | "unreachable";
};

export type FieldCategory =
  | "identity"
  | "photos"
  | "interests"
  | "settings"
  | "subscription"
  | "evolution";
