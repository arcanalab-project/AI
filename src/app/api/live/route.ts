import { NextResponse } from "next/server";
import { getLastInspector, setLastInspector, timed } from "@/lib/inspector";
import {
  createEvent,
  discover,
  getUser,
  like,
  listEvents,
  listIdentities,
  listMatches,
  listMessages,
  patchUser,
  prepareMatchScenario,
  sendMessage,
} from "@/lib/live";
import { getConnectionState, sanitizeError } from "@/lib/mongo";
import { resetDataset, seedDataset } from "@/lib/seed";
import {
  eventSchema,
  likeSchema,
  messageSchema,
  profilePatchSchema,
  settingsPatchSchema,
  subscriptionPatchSchema,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const op = searchParams.get("op") ?? "me";
  const profileId = searchParams.get("profileId") ?? "giulia";
  try {
    if (op === "identities") {
      return NextResponse.json({ identities: await listIdentities() });
    }
    if (op === "me") {
      const user = await getUser(profileId);
      return NextResponse.json({ user, connection: await getConnectionState() });
    }
    if (op === "discovery") {
      const { value, inspector } = await timed(
        `Discovery per ${profileId}`,
        "MongoDB",
        "bootcamp_users",
        { find: "geo + filtri" },
        () => discover(profileId),
      );
      inspector.operation = value.filter;
      inspector.result = {
        count: value.cards.length,
        ids: value.cards.map((c) => String(c.profileId)),
        semantics: value.semantics,
      };
      inspector.elapsedMs = value.elapsedMs;
      return NextResponse.json({ ...value, inspector });
    }
    if (op === "matches") {
      return NextResponse.json({ matches: await listMatches(profileId) });
    }
    if (op === "messages") {
      const matchId = searchParams.get("matchId");
      if (!matchId) return NextResponse.json({ error: "matchId richiesto" }, { status: 400 });
      const messages = await listMessages(matchId);
      return NextResponse.json({ messages });
    }
    if (op === "events") {
      return NextResponse.json({
        events: await listEvents(searchParams.get("organizer") ?? undefined),
      });
    }
    if (op === "inspector") {
      return NextResponse.json({ inspector: getLastInspector() });
    }
    return NextResponse.json({ error: "op sconosciuta" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err), connection: await getConnectionState() },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const action = body.action as string;
  try {
    if (action === "seed") {
      const dataset = body.dataset === "lesson" ? "lesson" : "mvp";
      const result = await seedDataset(dataset);
      const inspector = setLastInspector({
        description: `Seed idempotente dataset ${dataset}`,
        engine: "MongoDB",
        target: "bootcamp_*",
        operation: { replaceOne: "upsert per profileId" },
        outcome: "ok",
        result,
        measured: false,
        note: "Non tocca collection fuori da bootcamp_*.",
      });
      return NextResponse.json({ result, inspector });
    }
    if (action === "reset") {
      const dataset = body.dataset === "lesson" ? "lesson" : "mvp";
      const deleted = await resetDataset(dataset);
      const seeded = await seedDataset(dataset);
      const inspector = setLastInspector({
        description: `Reset dataset ${dataset}`,
        engine: "MongoDB",
        target: "bootcamp_* WHERE datasetId",
        operation: { deleteMany: { datasetId: dataset }, then: "seed" },
        outcome: "ok",
        result: { deleted, seeded },
        measured: false,
        note: `Ripristinato esattamente il dataset «${dataset}». Il database TIN non è stato droppato.`,
      });
      return NextResponse.json({ deleted, seeded, inspector });
    }
    if (action === "prepare") {
      const result = await prepareMatchScenario();
      return NextResponse.json({
        result,
        inspector: setLastInspector({
          description: "Prepara scenario match Giulia ↔ Luca",
          engine: "MongoDB",
          target: "bootcamp_users / interactions / matches / messages",
          operation: { restore: ["giulia", "luca"], deletePair: "giulia|luca" },
          outcome: "ok",
          result,
          measured: false,
        }),
      });
    }
    if (action === "profile") {
      const profileId = String(body.profileId);
      const patch = profilePatchSchema.parse(body.patch);
      const { value, inspector } = await timed(
        `Salvo il profilo ${profileId}`,
        "MongoDB",
        "bootcamp_users",
        { updateOne: { datasetId: "mvp", profileId }, $set: patch },
        () => patchUser(profileId, patch),
      );
      return NextResponse.json({ user: value, inspector });
    }
    if (action === "settings") {
      const profileId = String(body.profileId);
      const patch = settingsPatchSchema.parse(body.patch);
      const { value, inspector } = await timed(
        `Salvo le preferenze di ${profileId}`,
        "MongoDB",
        "bootcamp_users.settings",
        { updateOne: { "settings.*": patch } },
        () => patchUser(profileId, { settings: patch }),
      );
      return NextResponse.json({ user: value, inspector });
    }
    if (action === "subscription") {
      const profileId = String(body.profileId);
      const patch = subscriptionPatchSchema.parse(body.patch);
      const { value, inspector } = await timed(
        `Salvo l'abbonamento demo di ${profileId}`,
        "MongoDB",
        "bootcamp_users.subscription",
        { updateOne: { "subscription.*": patch } },
        () => patchUser(profileId, { subscription: patch }),
      );
      return NextResponse.json({ user: value, inspector });
    }
    if (action === "like") {
      const parsed = likeSchema.parse(body);
      const result = await like(parsed.fromProfileId, parsed.toProfileId, parsed.type);
      const inspector = setLastInspector({
        description:
          parsed.type === "like"
            ? `${parsed.fromProfileId} mette like a ${parsed.toProfileId}`
            : `${parsed.fromProfileId} passa ${parsed.toProfileId}`,
        engine: "MongoDB",
        target: "bootcamp_interactions (+ bootcamp_matches se reciproco)",
        operation: {
          updateOne: {
            filter: {
              datasetId: "mvp",
              fromProfileId: parsed.fromProfileId,
              toProfileId: parsed.toProfileId,
            },
            upsert: true,
            unique: "datasetId+from+to",
            then: "se like reciproco, upsert match con pairKey ordinato",
          },
        },
        outcome: result.created ? "created" : "idempotent-hit",
        result: {
          match: result.match,
          matchCreated: result.matchCreated,
          note: result.note,
        },
        elapsedMs: result.elapsedMs,
        measured: true,
        note: "Unicità + upsert: i like concorrenti non perdono il match e non duplicano.",
      });
      return NextResponse.json({ ...result, inspector });
    }
    if (action === "message") {
      const parsed = messageSchema.parse(body);
      const result = await sendMessage(parsed.matchId, parsed.fromProfileId, parsed.body);
      const inspector = setLastInspector({
        description: `Messaggio in match ${parsed.matchId}`,
        engine: "MongoDB",
        target: "bootcamp_messages",
        operation: { insertOne: { matchId: parsed.matchId, fromProfileId: parsed.fromProfileId } },
        outcome: "ok",
        result: { _id: result._id, createdAt: result.createdAt },
        elapsedMs: result.elapsedMs,
        measured: true,
      });
      return NextResponse.json({ message: result, inspector });
    }
    if (action === "event") {
      const parsed = eventSchema.parse(body);
      const { value, inspector } = await timed(
        "Creo un evento (referenziato, non unbounded nell'user)",
        "MongoDB",
        "bootcamp_events",
        { insertOne: parsed, user: "$push eventSummary $slice 3" },
        () => createEvent(parsed),
      );
      return NextResponse.json({ event: value, inspector });
    }
    return NextResponse.json({ error: "Azione sconosciuta" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 400 });
  }
}
