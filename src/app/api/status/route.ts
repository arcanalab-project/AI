import { NextResponse } from "next/server";
import { getConnectionState, sanitizeError } from "@/lib/mongo";
import { ensureSeeded } from "@/lib/seed";
import { getLessonDb } from "@/lib/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getLessonDb();
  let seed: unknown = null;
  try {
    seed = await ensureSeeded();
  } catch (err) {
    seed = { ok: false, error: sanitizeError(err) };
  }
  const connection = await getConnectionState();
  return NextResponse.json({
    connection,
    seed,
    datasets: ["lesson", "mvp"],
    collections: [
      "bootcamp_users",
      "bootcamp_interactions",
      "bootcamp_matches",
      "bootcamp_messages",
      "bootcamp_events",
    ],
  });
}
