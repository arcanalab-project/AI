import { describe, expect, it, beforeEach } from "vitest";
import { CORE_LESSON_TABLES } from "@/lib/lessonTables";
import {
  evolveOfflineLesson,
  listOfflineTables,
  naiveOfflineJoinCount,
  offlinePersonDocument,
  resetOfflineLesson,
  retrieveOfflinePerson,
  updateOfflineSettings,
} from "@/lib/lessonOffline";
import { personByProfileId } from "@/lib/canonical";

describe("browser lesson engine", () => {
  beforeEach(() => {
    resetOfflineLesson();
  });

  it("spreads Giulia across nine core tables", () => {
    const tables = listOfflineTables(1) as Record<string, unknown>;
    for (const spec of CORE_LESSON_TABLES) {
      expect(Array.isArray(tables[spec.name])).toBe(true);
      expect((tables[spec.name] as unknown[]).length).toBeGreaterThan(0);
    }
    expect((tables.user_photos as unknown[]).length).toBe(3);
    expect((tables.user_interests as unknown[]).length).toBe(3);
    expect((tables.subscription_history as unknown[]).length).toBeGreaterThan(0);
    expect((tables.cities as { name: string }[])[0].name).toBe("Milano");
  });

  it("retrieves one row without cartesian explosion", () => {
    const got = retrieveOfflinePerson(1);
    const naive = naiveOfflineJoinCount(1);
    expect(naive.length).toBe(
      (got.row.photos as unknown[]).length * (got.row.interests as unknown[]).length,
    );
    expect(got.cartesianIfNaive).toBe(9);
    expect(got.row.display_name).toBe("Giulia Conti");
  });

  it("assembles one JSON document from the tables", () => {
    const giulia = personByProfileId("giulia");
    const doc = offlinePersonDocument(1);
    expect(doc.displayName).toBe(giulia.displayName);
    expect(doc.city).toBe("Milano");
    expect((doc.photos as unknown[]).length).toBe(3);
    expect(doc.hobbies).toBeUndefined();
  });

  it("evolves hobbies onto Giulia only", () => {
    evolveOfflineLesson("hobbies");
    const doc = offlinePersonDocument(1);
    expect(doc.hobbies).toEqual(["climbing", "jazz"]);
    const tables = listOfflineTables(1);
    expect(tables.user_hobbies.length).toBe(2);
  });

  it("updates preferences in user_settings", () => {
    updateOfflineSettings(1, { discoveryDistanceKm: 12, genderPreferences: ["woman", "man"] });
    const tables = listOfflineTables(1);
    expect(tables.user_settings[0].discovery_distance_km).toBe(12);
    expect(tables.user_gender_preferences.map((g) => g.gender)).toEqual(["woman", "man"]);
  });
});
