import { NextResponse } from "next/server";
import { canonicalPerson, lessonCorePerson, PEOPLE, toMongoUser } from "@/lib/canonical";
import { FIELDS } from "@/lib/fields";
import { setLastInspector, timed } from "@/lib/inspector";
import { NAIVE_JOIN_SQL, RETRIEVE_PERSON_SQL, MONGO_FIND_ONE } from "@/lib/lessonQuery";
import { COLLECTIONS, coll, getConnectionState, sanitizeError } from "@/lib/mongo";
import { SCENES } from "@/lib/scenes";
import {
  evolveLesson,
  getLessonDb,
  lessonFlags,
  listTables,
  naiveJoinCount,
  retrievePerson,
  sqlPersonDocument,
  updateLessonSettings,
  updateLessonSubscription,
  resetLessonSql,
} from "@/lib/sqlite";
import { settingsPatchSchema, subscriptionPatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function syncLessonMongo() {
  try {
    const users = await coll(COLLECTIONS.users);
    const doc = sqlPersonDocument(1);
    const base = lessonCorePerson(canonicalPerson());
    await users.replaceOne(
      { datasetId: "lesson", profileId: "giulia" },
      {
        ...toMongoUser(base, "lesson"),
        ...doc,
        datasetId: "lesson",
        profileId: "giulia",
        sqlId: 1,
        updatedAt: new Date().toISOString(),
      },
      { upsert: true },
    );
  } catch {
    // Atlas/embedded may be offline; SQL lesson still works.
  }
}

export async function GET(req: Request) {
  getLessonDb();
  const { searchParams } = new URL(req.url);
  const op = searchParams.get("op") ?? "state";
  try {
    if (op === "tables") {
      return NextResponse.json({ tables: listTables(1), fields: FIELDS, scenes: SCENES });
    }
    if (op === "sql") {
      const { value, inspector } = await timed(
        "Retrieve the full person from SQLite with aggregate subqueries",
        "SQLite",
        "users + user_photos + user_interests + user_settings + subscriptions",
        { sql: RETRIEVE_PERSON_SQL, params: [1] },
        () => retrievePerson(1),
        {
          note: "Real engine: node:sqlite. This is not a benchmark vs Atlas. The naive JOIN query is not executed as the lesson result.",
        },
      );
      return NextResponse.json({
        sql: RETRIEVE_PERSON_SQL,
        naiveSql: NAIVE_JOIN_SQL,
        naiveRowCount: naiveJoinCount(1).length,
        ...value,
        inspector,
      });
    }
    if (op === "document") {
      const connection = await getConnectionState();
      let real: unknown = null;
      let inspector;
      if (connection.mode !== "offline") {
        try {
          const users = await coll(COLLECTIONS.users);
          const run = await timed(
            "Real read of Giulia’s document from bootcamp_users",
            "MongoDB",
            "bootcamp_users",
            MONGO_FIND_ONE,
            () => users.findOne({ datasetId: "lesson", profileId: "giulia" }),
          );
          real = run.value;
          inspector = run.inspector;
        } catch (err) {
          inspector = setLastInspector({
            description: "MongoDB read not available",
            engine: "MongoDB",
            target: "bootcamp_users",
            operation: MONGO_FIND_ONE,
            outcome: "error",
            result: sanitizeError(err),
            measured: false,
          });
        }
      }
      const synthesized = sqlPersonDocument(1);
      return NextResponse.json({
        connection,
        document: real ?? synthesized,
        source: real ? connection.mode : "sqlite-synthesized",
        synthesized,
        inspector: inspector ?? {
          description: "Document synthesized from SQLite (Atlas not connected)",
          engine: "SQLite",
          target: "users…",
          operation: { transform: "sqlPersonDocument" },
          outcome: "offline-fallback",
          measured: false,
          note: "This is not an Atlas read. Distinguish animation/fixture from a real execution.",
        },
      });
    }
    const tables = listTables(1);
    const retrieved = retrievePerson(1);
    return NextResponse.json({
      person: canonicalPerson(),
      core: lessonCorePerson(),
      tables,
      retrieved: retrieved.row,
      documentPreview: sqlPersonDocument(1),
      flags: lessonFlags(),
      fields: FIELDS,
      scenes: SCENES,
      people: PEOPLE.map((p) => ({
        id: p.id,
        profileId: p.profileId,
        displayName: p.displayName,
        city: p.city,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  getLessonDb();
  const body = await req.json();
  const action = body.action as string;
  try {
    if (action === "reset") {
      resetLessonSql();
      try {
        const { seedDataset } = await import("@/lib/seed");
        await seedDataset("lesson", { reset: true });
      } catch {
        /* offline */
      }
      return NextResponse.json({
        ok: true,
        dataset: "lesson",
        note: "Restored only the lesson dataset (lesson SQLite + bootcamp_* lesson). The mvp dataset and non-demo collections stay intact.",
        tables: listTables(1),
      });
    }
    if (action === "settings") {
      const patch = settingsPatchSchema.parse(body.patch);
      const { value, inspector } = await timed(
        "Update Giulia’s preferences (lesson dataset)",
        "SQLite",
        "user_settings / user_gender_preferences",
        { update: patch },
        () => updateLessonSettings(1, patch),
      );
      await syncLessonMongo();
      return NextResponse.json({ settings: value, tables: listTables(1), inspector });
    }
    if (action === "subscription") {
      const patch = subscriptionPatchSchema.parse(body.patch);
      const { value, inspector } = await timed(
        "Update Giulia’s current subscription",
        "SQLite",
        "subscriptions",
        { update: patch, predicate: "is_current = 1" },
        () => updateLessonSubscription(1, patch),
      );
      await syncLessonMongo();
      return NextResponse.json({ subscription: value, tables: listTables(1), inspector });
    }
    if (action === "evolve") {
      const feature = body.feature as "hobbies" | "pronouns" | "organizer";
      const before = sqlPersonDocument(1);
      const result = evolveLesson(feature);
      await syncLessonMongo();
      const after = sqlPersonDocument(1);
      const inspector = setLastInspector({
        description: `Product evolution: ${feature}`,
        engine: "SQLite",
        target: feature === "hobbies" ? "user_hobbies" : "users",
        operation:
          feature === "hobbies"
            ? { sql: "CREATE TABLE user_hobbies; INSERT …" }
            : feature === "pronouns"
              ? { sql: "ALTER TABLE users ADD COLUMN pronouns" }
              : { sql: "ALTER TABLE users ADD COLUMN profile_type; CREATE TABLE events" },
        outcome: "ok",
        before,
        after,
        measured: false,
        note: "ALTER TABLE does not imply downtime (in PostgreSQL a nullable ADD COLUMN is often a catalog change). MongoDB accepts documents without the new field; the UI must handle them. Francesca stays without hobbies/pronouns.",
      });
      return NextResponse.json({ ...result, before, after, inspector });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 400 });
  }
}
