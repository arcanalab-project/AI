import { computeAge } from "./age";
import { haversineKm } from "./geo";
import type { Gender, PersonFixture } from "./types";

export type DiscoveryViewer = {
  profileId: string;
  location: [number, number];
  settings: PersonFixture["settings"];
};

export type DiscoveryCandidate = {
  profileId: string;
  gender: Gender;
  birthDate: string;
  location: [number, number];
  settings: PersonFixture["settings"];
};

export type DiscoveryDecision = {
  include: boolean;
  reasons: string[];
  distanceKm?: number;
  age?: number;
};

/**
 * Filter semantics (applied together, AND):
 * - exclude self
 * - exclude hidden (profileVisibility !== public)
 * - exclude paused accounts
 * - exclude already judged (like or pass from viewer)
 * - age(candidate) in [viewer.minDesiredAge, viewer.maxDesiredAge]
 * - candidate.gender in viewer.genderPreferences
 * - distance(viewer, candidate) <= viewer.discoveryDistanceKm
 *
 * Geospatial query in MongoDB uses 2dsphere + $geoWithin/$centerSphere.
 * This function is the same predicate for tests and for explaining the inspector.
 */
export function evaluateCandidate(
  viewer: DiscoveryViewer,
  candidate: DiscoveryCandidate,
  judgedIds: Set<string>,
  asOf?: Date,
): DiscoveryDecision {
  const reasons: string[] = [];
  if (candidate.profileId === viewer.profileId) reasons.push("self");
  if (candidate.settings.profileVisibility !== "public") reasons.push("hidden");
  if (candidate.settings.pausedAccount) reasons.push("paused");
  if (judgedIds.has(candidate.profileId)) reasons.push("already_judged");
  const age = computeAge(candidate.birthDate, asOf);
  if (age < viewer.settings.minDesiredAge || age > viewer.settings.maxDesiredAge) {
    reasons.push("age");
  }
  if (!viewer.settings.genderPreferences.includes(candidate.gender)) {
    reasons.push("gender");
  }
  const distanceKm = haversineKm(viewer.location, candidate.location);
  if (distanceKm > viewer.settings.discoveryDistanceKm) reasons.push("distance");
  return { include: reasons.length === 0, reasons, distanceKm, age };
}

export function mongoDiscoveryFilter(viewer: {
  profileId: string;
  coordinates: [number, number];
  settings: PersonFixture["settings"];
  judgedIds: string[];
}) {
  const maxRad = viewer.settings.discoveryDistanceKm / 6378.1;
  return {
    datasetId: "mvp",
    profileId: { $ne: viewer.profileId, $nin: viewer.judgedIds },
    gender: { $in: viewer.settings.genderPreferences },
    "settings.profileVisibility": "public",
    "settings.pausedAccount": false,
    location: {
      $geoWithin: {
        $centerSphere: [viewer.coordinates, maxRad],
      },
    },
  };
}
