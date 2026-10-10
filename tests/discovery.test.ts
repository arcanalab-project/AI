import { describe, expect, it } from "vitest";
import { evaluateCandidate } from "@/lib/discovery";
import { personByProfileId } from "@/lib/canonical";
import { DEMO_AS_OF } from "@/lib/age";

function viewerOf(id: string) {
  const p = personByProfileId(id);
  return { profileId: p.profileId, location: p.location.coordinates, settings: p.settings };
}
function candOf(id: string) {
  const p = personByProfileId(id);
  return {
    profileId: p.profileId,
    gender: p.gender,
    birthDate: p.birthDate,
    location: p.location.coordinates,
    settings: p.settings,
  };
}

describe("discovery filters", () => {
  it("excludes self, hidden Elena, paused Davide", () => {
    const v = viewerOf("giulia");
    expect(evaluateCandidate(v, candOf("giulia"), new Set(), new Date(DEMO_AS_OF)).include).toBe(false);
    expect(evaluateCandidate(v, candOf("elena"), new Set(), new Date(DEMO_AS_OF)).reasons).toContain("hidden");
    expect(evaluateCandidate(v, candOf("davide"), new Set(), new Date(DEMO_AS_OF)).reasons).toContain("paused");
  });

  it("excludes already judged", () => {
    const r = evaluateCandidate(viewerOf("giulia"), candOf("luca"), new Set(["luca"]), new Date(DEMO_AS_OF));
    expect(r.reasons).toContain("already_judged");
  });

  it("keeps Luca for Giulia (same city, gender, age)", () => {
    const r = evaluateCandidate(viewerOf("giulia"), candOf("luca"), new Set(), new Date(DEMO_AS_OF));
    expect(r.include).toBe(true);
  });

  it("filters Roma by distance from Milano", () => {
    const r = evaluateCandidate(viewerOf("giulia"), candOf("marco"), new Set(), new Date(DEMO_AS_OF));
    expect(r.reasons).toContain("distance");
    expect(r.distanceKm ?? 0).toBeGreaterThan(40);
  });
});
