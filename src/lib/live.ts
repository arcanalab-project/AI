import { ObjectId, type Filter, type Document } from "mongodb";
import { computeAge } from "./age";
import { PEOPLE, personByProfileId, toMongoUser } from "./canonical";
import { mongoDiscoveryFilter } from "./discovery";
import { recordInteraction } from "./matches";
import { COLLECTIONS, coll } from "./mongo";
import { publicUser } from "./seed";
import type { Gender, PersonFixture } from "./types";

const DATASET = "mvp" as const;

export async function getUser(profileId: string) {
  const users = await coll(COLLECTIONS.users);
  const doc = await users.findOne({ datasetId: DATASET, profileId });
  if (!doc) throw new Error(`Profilo ${profileId} non trovato nel dataset mvp`);
  return publicUser(doc as unknown as Record<string, unknown>);
}

export async function listIdentities() {
  const users = await coll(COLLECTIONS.users);
  const docs = await users
    .find({ datasetId: DATASET })
    .project({ profileId: 1, displayName: 1, city: 1, gender: 1, birthDate: 1 })
    .toArray();
  return docs.map((d) => ({
    profileId: d.profileId,
    displayName: d.displayName,
    city: d.city,
    gender: d.gender,
    age: computeAge(String(d.birthDate)),
  }));
}

export async function patchUser(
  profileId: string,
  patch: Record<string, unknown>,
) {
  const users = await coll(COLLECTIONS.users);
  const current = await users.findOne({ datasetId: DATASET, profileId });
  if (!current) throw new Error("Profilo non trovato");
  const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  const $unset: Record<string, string> = {};
  const assign = [
    "displayName",
    "gender",
    "birthDate",
    "heightCm",
    "city",
    "bio",
    "interests",
    "profileType",
  ];
  for (const key of assign) {
    if (patch[key] !== undefined) $set[key] = patch[key];
  }
  for (const key of ["bodyType", "profession", "education", "pronouns", "hobbies"]) {
    if (patch[key] === null) $unset[key] = "";
    else if (patch[key] !== undefined) $set[key] = patch[key];
  }
  if (patch.birthDate) $set.age = computeAge(String(patch.birthDate));
  const settingsPatch = patch.settings as Record<string, unknown> | undefined;
  if (settingsPatch) {
    for (const [k, v] of Object.entries(settingsPatch)) {
      $set[`settings.${k}`] = v;
    }
  }
  const subPatch = patch.subscription as Record<string, unknown> | undefined;
  if (subPatch) {
    for (const [k, v] of Object.entries(subPatch)) {
      $set[`subscription.${k}`] = v;
    }
  }
  const update: Document = { $set };
  if (Object.keys($unset).length) update.$unset = $unset;
  await users.updateOne({ datasetId: DATASET, profileId }, update);
  return getUser(profileId);
}

export async function discover(profileId: string) {
  const me = (await coll(COLLECTIONS.users)).findOne({ datasetId: DATASET, profileId });
  const viewerDoc = await me;
  if (!viewerDoc) throw new Error("Identità demo non trovata");
  const settings = viewerDoc.settings as PersonFixture["settings"];
  const location = viewerDoc.location as { coordinates: [number, number] };
  const interactions = await coll(COLLECTIONS.interactions);
  const judged = await interactions
    .find({ datasetId: DATASET, fromProfileId: profileId })
    .project({ toProfileId: 1 })
    .toArray();
  const judgedIds = judged.map((j) => String(j.toProfileId));
  const filter = mongoDiscoveryFilter({
    profileId,
    coordinates: location.coordinates,
    settings,
    judgedIds,
  });
  const users = await coll(COLLECTIONS.users);
  const started = Date.now();
  const raw = await users.find(filter as Filter<Document>).limit(20).toArray();
  const elapsedMs = Date.now() - started;
  const minAge = settings.minDesiredAge;
  const maxAge = settings.maxDesiredAge;
  const cards = raw
    .map((d) => publicUser(d as unknown as Record<string, unknown>))
    .filter((c) => c.age >= minAge && c.age <= maxAge);
  return {
    cards,
    filter,
    elapsedMs,
    measured: true,
    semantics: {
      distance: `<= ${settings.discoveryDistanceKm} km via 2dsphere $geoWithin $centerSphere`,
      age: `${minAge}–${maxAge} (calcolata da birthDate, applicata dopo la query geo)`,
      gender: settings.genderPreferences,
      exclude: ["self", "hidden", "paused", "already_judged"],
    },
  };
}

export async function like(fromProfileId: string, toProfileId: string, type: "like" | "pass") {
  const interactions = await coll(COLLECTIONS.interactions);
  const matches = await coll(COLLECTIONS.matches);
  const started = Date.now();
  const result = await recordInteraction(
    interactions as never,
    matches as never,
    { datasetId: DATASET, fromProfileId, toProfileId, type },
  );
  return { ...result, elapsedMs: Date.now() - started, measured: true };
}

export async function listMatches(profileId: string) {
  const matches = await coll(COLLECTIONS.matches);
  const rows = await matches
    .find({ datasetId: DATASET, userIds: profileId })
    .sort({ createdAt: -1 })
    .toArray();
  const users = await coll(COLLECTIONS.users);
  const out = [];
  for (const m of rows) {
    const otherId = (m.userIds as string[]).find((id) => id !== profileId);
    const other = otherId
      ? await users.findOne({ datasetId: DATASET, profileId: otherId })
      : null;
    out.push({
      matchId: String(m._id),
      pairKey: m.pairKey,
      other: other ? publicUser(other as unknown as Record<string, unknown>) : null,
      createdAt: m.createdAt,
    });
  }
  return out;
}

export async function listMessages(matchId: string, limit = 30, before?: string) {
  const messages = await coll(COLLECTIONS.messages);
  const query: Document = { datasetId: DATASET, matchId };
  if (before) query.createdAt = { $lt: new Date(before) };
  const rows = await messages.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return rows.reverse();
}

export async function sendMessage(matchId: string, fromProfileId: string, body: string) {
  const matches = await coll(COLLECTIONS.matches);
  const match = ObjectId.isValid(matchId)
    ? await matches.findOne({ _id: new ObjectId(matchId), datasetId: DATASET })
    : await matches.findOne({ pairKey: matchId, datasetId: DATASET });
  if (!match) throw new Error("Match non trovato");
  const userIds = match.userIds as string[];
  if (!userIds.includes(fromProfileId)) throw new Error("Non sei parte di questo match");
  const messages = await coll(COLLECTIONS.messages);
  const doc = {
    datasetId: DATASET,
    matchId: String(match._id),
    fromProfileId,
    body,
    createdAt: new Date(),
  };
  const started = Date.now();
  const ins = await messages.insertOne(doc);
  return { ...doc, _id: ins.insertedId, elapsedMs: Date.now() - started, measured: true };
}

export async function listEvents(organizerProfileId?: string) {
  const events = await coll(COLLECTIONS.events);
  const query: Document = { datasetId: DATASET };
  if (organizerProfileId) query.organizerProfileId = organizerProfileId;
  return events.find(query).sort({ startsAt: 1 }).toArray();
}

export async function createEvent(input: {
  organizerProfileId: string;
  title: string;
  city: string;
  startsAt: string;
  description: string;
}) {
  const users = await coll(COLLECTIONS.users);
  const organizer = await users.findOne({ datasetId: DATASET, profileId: input.organizerProfileId });
  if (!organizer) throw new Error("Organizzatore non trovato");
  const events = await coll(COLLECTIONS.events);
  const id = `evt-${Date.now()}`;
  const doc = { datasetId: DATASET, id, ...input };
  await events.insertOne(doc);
  await users.updateOne(
    { datasetId: DATASET, profileId: input.organizerProfileId },
    {
      $set: { profileType: "eventOrganizer", updatedAt: new Date().toISOString() },
      $push: {
        eventSummary: {
          $each: [{ id, title: input.title, startsAt: input.startsAt }],
          $slice: 3,
        },
      } as Document,
    },
  );
  return doc;
}

export async function prepareMatchScenario() {
  const giulia = personByProfileId("giulia");
  const luca = personByProfileId("luca");
  const users = await coll(COLLECTIONS.users);
  await users.replaceOne(
    { datasetId: DATASET, profileId: "giulia" },
    toMongoUser(giulia, DATASET),
    { upsert: true },
  );
  await users.replaceOne(
    { datasetId: DATASET, profileId: "luca" },
    toMongoUser(luca, DATASET),
    { upsert: true },
  );
  const interactions = await coll(COLLECTIONS.interactions);
  await interactions.deleteMany({
    datasetId: DATASET,
    $or: [
      { fromProfileId: "giulia", toProfileId: "luca" },
      { fromProfileId: "luca", toProfileId: "giulia" },
    ],
  });
  const matches = await coll(COLLECTIONS.matches);
  const found = await matches.findOne({ datasetId: DATASET, pairKey: "giulia|luca" });
  if (found) {
    const messages = await coll(COLLECTIONS.messages);
    await messages.deleteMany({ datasetId: DATASET, matchId: String(found._id) });
  }
  await matches.deleteMany({ datasetId: DATASET, pairKey: "giulia|luca" });
  return {
    note: "Ripristinati Giulia e Luca nel dataset mvp, cancellati like/match/messaggi tra loro. Altri profili intatti.",
    identities: ["giulia", "luca"],
  };
}

export { PEOPLE };
export type { Gender };
