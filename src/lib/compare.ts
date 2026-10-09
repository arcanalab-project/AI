import { comparableCore } from "./canonical";
import type { PersonFixture, PersonFixture as P } from "./types";

export function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function personContentEqual(a: P, b: P): boolean {
  return jsonEqual(comparableCore(a), comparableCore(b));
}

export function sqlRowToComparable(row: Record<string, unknown>) {
  const photos = parseJsonArray(row.photos).map((p) => {
    const o = p as { url: string; sort_order: number };
    return { url: o.url, sortOrder: o.sort_order };
  });
  const interests = parseJsonArray(row.interests).map(String).sort();
  const genderPreferences = parseJsonArray(row.gender_preferences).map(String).sort();
  return {
    id: Number(row.id),
    displayName: row.display_name,
    gender: row.gender,
    birthDate: row.birth_date,
    heightCm: Number(row.height_cm),
    bodyType: row.body_type ?? null,
    profession: row.profession ?? null,
    education: row.education ?? null,
    city: row.city,
    bio: row.bio,
    photos,
    interests,
    settings: {
      notificationsEnabled: Boolean(row.notifications_enabled),
      discoveryDistanceKm: Number(row.discovery_distance_km),
      minDesiredAge: Number(row.min_desired_age),
      maxDesiredAge: Number(row.max_desired_age),
      profileVisibility: row.profile_visibility,
      pausedAccount: Boolean(row.paused_account),
      genderPreferences,
    },
    subscription: {
      id: row.subscription_id,
      plan: row.plan,
      paymentStatus: row.payment_status,
      startDate: row.start_date,
      endDate: row.end_date,
      autoRenew: Boolean(row.auto_renew),
    },
  };
}

export function mongoDocToComparable(doc: Record<string, unknown>) {
  const settings = doc.settings as PersonFixture["settings"];
  const subscription = doc.subscription as PersonFixture["subscription"];
  const photos = (doc.photos as PersonFixture["photos"]).map((p) => ({
    url: p.url,
    sortOrder: p.sortOrder,
  }));
  return {
    id: Number(doc.sqlId),
    displayName: doc.displayName,
    gender: doc.gender,
    birthDate: doc.birthDate,
    heightCm: Number(doc.heightCm),
    bodyType: (doc.bodyType as string | undefined) ?? null,
    profession: (doc.profession as string | undefined) ?? null,
    education: (doc.education as string | undefined) ?? null,
    city: doc.city,
    bio: doc.bio,
    photos,
    interests: [...(doc.interests as string[])].sort(),
    settings: {
      notificationsEnabled: settings.notificationsEnabled,
      discoveryDistanceKm: settings.discoveryDistanceKm,
      minDesiredAge: settings.minDesiredAge,
      maxDesiredAge: settings.maxDesiredAge,
      profileVisibility: settings.profileVisibility,
      pausedAccount: settings.pausedAccount,
      genderPreferences: [...settings.genderPreferences].sort(),
    },
    subscription: {
      id: subscription.id,
      plan: subscription.plan,
      paymentStatus: subscription.paymentStatus,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      autoRenew: subscription.autoRenew,
    },
  };
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
