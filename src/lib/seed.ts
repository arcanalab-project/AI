import { PEOPLE, toMongoUser } from "./canonical";
import { computeAge } from "./age";
import { COLLECTIONS, coll, getDb, inspectExistingCollections, isBootcampCollection } from "./mongo";
import { mongoUserValidator } from "./validation";
import { resetLessonSql } from "./sqlite";
import type { DatasetId } from "./types";

async function ensureIndexes() {
  const users = await coll(COLLECTIONS.users);
  const interactions = await coll(COLLECTIONS.interactions);
  const matches = await coll(COLLECTIONS.matches);
  const messages = await coll(COLLECTIONS.messages);
  const events = await coll(COLLECTIONS.events);

  await users.createIndex({ datasetId: 1, profileId: 1 }, { unique: true, name: "uniq_dataset_profile" });
  await users.createIndex({ location: "2dsphere" }, { name: "geo_location" });
  await users.createIndex(
    { datasetId: 1, "settings.pausedAccount": 1, "settings.profileVisibility": 1 },
    { name: "discovery_visibility" },
  );

  await interactions.createIndex(
    { datasetId: 1, fromProfileId: 1, toProfileId: 1 },
    { unique: true, name: "uniq_directional_interaction" },
  );

  await matches.createIndex(
    { datasetId: 1, pairKey: 1 },
    { unique: true, name: "uniq_normalized_pair" },
  );

  await messages.createIndex(
    { datasetId: 1, matchId: 1, createdAt: 1, _id: 1 },
    { name: "messages_pagination" },
  );

  await events.createIndex({ datasetId: 1, organizerProfileId: 1 }, { name: "events_organizer" });
}

async function ensureValidation() {
  const db = await getDb();
  const names = await inspectExistingCollections();
  if (!names.includes(COLLECTIONS.users)) {
    await db.createCollection(COLLECTIONS.users, {
      validator: mongoUserValidator,
      validationLevel: "moderate",
      validationAction: "error",
    });
  } else {
    try {
      await db.command({
        collMod: COLLECTIONS.users,
        validator: mongoUserValidator,
        validationLevel: "moderate",
        validationAction: "error",
      });
    } catch {
      // Pre-existing collection may already have a different validator; do not block the demo.
    }
  }
}

export async function seedDataset(datasetId: DatasetId, options?: { reset?: boolean }) {
  const existing = await inspectExistingCollections();
  const foreign = existing.filter((n) => !isBootcampCollection(n));
  if (options?.reset) {
    await resetDataset(datasetId);
  }
  await ensureValidation();
  await ensureIndexes();

  const users = await coll(COLLECTIONS.users);
  const events = await coll(COLLECTIONS.events);
  for (const person of PEOPLE) {
    const doc = toMongoUser(person, datasetId);
    if (datasetId === "lesson") {
      delete doc.hobbies;
      delete doc.pronouns;
      if (person.profileId === "giulia") {
        delete doc.profileType;
        delete doc.eventSummary;
      }
    }
    await users.replaceOne(
      { datasetId, profileId: person.profileId },
      { ...doc, updatedAt: new Date().toISOString() },
      { upsert: true },
    );
    if (person.events?.length && datasetId === "mvp") {
      for (const ev of person.events) {
        await events.replaceOne(
          { datasetId, id: ev.id },
          {
            datasetId,
            id: ev.id,
            organizerProfileId: person.profileId,
            title: ev.title,
            city: ev.city,
            startsAt: ev.startsAt,
            description: ev.description,
          },
          { upsert: true },
        );
      }
    }
  }
  return {
    datasetId,
    people: PEOPLE.length,
    skippedNonDemoCollections: foreign,
    reset: Boolean(options?.reset),
  };
}

export async function resetDataset(datasetId: DatasetId) {
  const names = Object.values(COLLECTIONS);
  const counts: Record<string, number> = {};
  for (const name of names) {
    const c = await coll(name);
    const res = await c.deleteMany({ datasetId });
    counts[name] = res.deletedCount;
  }
  if (datasetId === "lesson") resetLessonSql();
  return { datasetId, deleted: counts, note: "Only bootcamp_* documents with this datasetId. TIN database not dropped." };
}

export async function ensureSeeded() {
  resetLessonSql();
  try {
    const users = await coll(COLLECTIONS.users);
    const mvp = await users.countDocuments({ datasetId: "mvp" });
    const lesson = await users.countDocuments({ datasetId: "lesson" });
    if (mvp < PEOPLE.length) await seedDataset("mvp");
    if (lesson < 1) await seedDataset("lesson");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function publicUser(doc: Record<string, unknown>) {
  const birthDate = String(doc.birthDate);
  return {
    profileId: doc.profileId,
    displayName: doc.displayName,
    gender: doc.gender,
    birthDate,
    age: typeof doc.age === "number" ? doc.age : computeAge(birthDate),
    heightCm: doc.heightCm,
    bodyType: doc.bodyType ?? null,
    profession: doc.profession ?? null,
    education: doc.education ?? null,
    city: doc.city,
    location: doc.location,
    bio: doc.bio,
    photos: doc.photos,
    interests: doc.interests,
    hobbies: doc.hobbies ?? null,
    pronouns: doc.pronouns ?? null,
    profileType: doc.profileType ?? "standard",
    settings: doc.settings,
    subscription: doc.subscription,
    eventSummary: doc.eventSummary ?? [],
    schemaVersion: doc.schemaVersion,
  };
}
