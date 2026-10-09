import { describe, expect, it, beforeAll } from "vitest";
import { getLessonDb, naiveJoinCount, resetLessonSql, retrievePerson } from "@/lib/sqlite";
import { personByProfileId, toMongoUser } from "@/lib/canonical";
import { mongoDocToComparable, sqlRowToComparable } from "@/lib/compare";

describe("lesson SQL", () => {
  beforeAll(() => {
    resetLessonSql();
    getLessonDb();
  });

  it("retrieves one row for Giulia without cartesian explosion", () => {
    const got = retrievePerson(1);
    expect(got.row).toBeTruthy();
    expect(Array.isArray(got.row.photos)).toBe(true);
    expect(Array.isArray(got.row.interests)).toBe(true);
    expect((got.row.photos as unknown[]).length).toBeGreaterThan(1);
    expect((got.row.interests as unknown[]).length).toBeGreaterThan(1);
    const naive = naiveJoinCount(1);
    expect(naive.length).toBe(
      (got.row.photos as unknown[]).length * (got.row.interests as unknown[]).length,
    );
    expect(naive.length).toBeGreaterThan(1);
    expect(got.measured).toBe(true);
  });

  it("matches canonical fixture content for photos, interests, settings, subscription", () => {
    const got = retrievePerson(1);
    const comparable = sqlRowToComparable(got.row as Record<string, unknown>);
    const giulia = personByProfileId("giulia");
    expect(comparable.displayName).toBe(giulia.displayName);
    expect(comparable.photos.map((p) => p.url).sort()).toEqual(giulia.photos.map((p) => p.url).sort());
    expect(comparable.interests).toEqual([...giulia.interests].sort());
    expect(comparable.settings.discoveryDistanceKm).toBe(giulia.settings.discoveryDistanceKm);
    expect(comparable.subscription.plan).toBe(giulia.subscription.plan);
    expect(comparable.subscription.id).toBe(giulia.subscription.id);
  });

  it("SQL retrieve matches Mongo document builder on equal content", () => {
    const sql = sqlRowToComparable(retrievePerson(1).row as Record<string, unknown>);
    const mongo = mongoDocToComparable(
      toMongoUser(personByProfileId("giulia"), "mvp") as Record<string, unknown>,
    );
    expect(sql.displayName).toBe(mongo.displayName);
    expect(sql.photos).toEqual(mongo.photos);
    expect(sql.interests).toEqual(mongo.interests);
    expect(sql.settings.genderPreferences).toEqual(mongo.settings.genderPreferences);
    expect(sql.subscription.plan).toBe(mongo.subscription.plan);
    expect(sql.bodyType).toBe(mongo.bodyType);
  });
});
