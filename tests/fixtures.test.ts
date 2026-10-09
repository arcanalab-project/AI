import { describe, expect, it } from "vitest";
import {
  PEOPLE,
  comparableCore,
  lessonCorePerson,
  personByProfileId,
  toMongoUser,
} from "@/lib/canonical";
import { computeAge, DEMO_AS_OF } from "@/lib/age";
import { assertLngLat } from "@/lib/geo";
import { personContentEqual } from "@/lib/compare";

describe("canonical fixture", () => {
  it("has at least 12 adult profiles", () => {
    expect(PEOPLE.length).toBeGreaterThanOrEqual(12);
    for (const p of PEOPLE) {
      expect(computeAge(p.birthDate, DEMO_AS_OF)).toBeGreaterThanOrEqual(21);
    }
  });

  it("uses GeoJSON [longitude, latitude] consistent with the city", () => {
    for (const p of PEOPLE) {
      expect(p.location.type).toBe("Point");
      assertLngLat(p.location.coordinates, p.city);
    }
    const mi = personByProfileId("giulia").location.coordinates;
    expect(mi[0]).toBeCloseTo(9.19, 2);
    expect(mi[1]).toBeCloseTo(45.46, 1);
  });

  it("keeps SQL id and Mongo profileId aligned", () => {
    const ids = new Set(PEOPLE.map((p) => p.id));
    const profiles = new Set(PEOPLE.map((p) => p.profileId));
    expect(ids.size).toBe(PEOPLE.length);
    expect(profiles.size).toBe(PEOPLE.length);
    const doc = toMongoUser(personByProfileId("giulia"), "mvp");
    expect(doc.sqlId).toBe(1);
    expect(doc.profileId).toBe("giulia");
  });

  it("omits optional fields on Francesca", () => {
    const f = personByProfileId("francesca");
    expect(f.bodyType).toBeUndefined();
    expect(f.profession).toBeUndefined();
    expect(f.hobbies).toBeUndefined();
    expect(f.pronouns).toBeUndefined();
    const doc = toMongoUser(f, "mvp");
    expect(doc.hobbies).toBeUndefined();
    expect(doc.pronouns).toBeUndefined();
    expect(doc.bodyType).toBeUndefined();
  });

  it("does not duplicate preferences on the document", () => {
    const doc = toMongoUser(personByProfileId("giulia"), "mvp") as Record<string, unknown>;
    expect(doc.settings).toBeDefined();
    expect(doc.discoveryDistanceKm).toBeUndefined();
    expect(doc.minDesiredAge).toBeUndefined();
  });

  it("lesson core strips evolved fields but keeps identity", () => {
    const core = lessonCorePerson();
    expect(core.hobbies).toBeUndefined();
    expect(core.pronouns).toBeUndefined();
    expect(core.displayName).toBe("Giulia Conti");
    expect(core.photos.length).toBeGreaterThan(1);
    expect(core.interests.length).toBeGreaterThan(1);
  });

  it("comparable core is stable", () => {
    const a = personByProfileId("giulia");
    expect(personContentEqual(a, a)).toBe(true);
    expect(comparableCore(a).interests).toEqual(["cucina", "fotografia", "viaggi"]);
  });
});
