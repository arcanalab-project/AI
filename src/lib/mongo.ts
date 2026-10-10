import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import type { ConnectionState, DatasetId } from "./types";

const DB_NAME = process.env.MONGODB_DB || "TIN";
const ATLAS_HOST = "federazionecup.7qr2i.mongodb.net";

type MongoGlobal = {
  tinClient?: MongoClient;
  tinMemory?: { uri: string; stop?: () => Promise<void> };
  tinState?: ConnectionState;
};

const g = globalThis as unknown as MongoGlobal;

export const COLLECTIONS = {
  users: "bootcamp_users",
  interactions: "bootcamp_interactions",
  matches: "bootcamp_matches",
  messages: "bootcamp_messages",
  events: "bootcamp_events",
} as const;

export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, "mongodb://***@");
}

function uriHost(uri: string): string | undefined {
  try {
    const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, "http://");
    const cleaned = withoutScheme.replace(/:[^@/]+@/, "@");
    return new URL(cleaned).host;
  } catch {
    return undefined;
  }
}

export async function getConnectionState(): Promise<ConnectionState> {
  try {
    const db = await getDb();
    const collections = (await db.listCollections().toArray()).map((c) => c.name);
    return {
      ...(g.tinState ?? { mode: "offline", db: DB_NAME }),
      collections,
      error: undefined,
    };
  } catch (err) {
    return {
      mode: "offline",
      db: DB_NAME,
      error: sanitizeError(err),
    };
  }
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}

export async function getClient(): Promise<MongoClient> {
  if (g.tinClient) return g.tinClient;
  const uri = process.env.MONGODB_URI?.trim();
  if (uri) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      appName: "tin-bootcamp",
    });
    await client.connect();
    await client.db(DB_NAME).command({ ping: 1 });
    g.tinClient = client;
    g.tinState = {
      mode: "atlas",
      db: DB_NAME,
      host: uriHost(uri) ?? ATLAS_HOST,
    };
    return client;
  }

  if (process.env.TIN_ALLOW_EMBEDDED_MONGO === "0") {
    throw new Error(
      "MONGODB_URI missing. Set it in .env.local (server-side) to Atlas federazionecup.7qr2i.mongodb.net, database TIN.",
    );
  }

  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mongod = await MongoMemoryServer.create({
      instance: { dbName: DB_NAME },
    });
    const memUri = mongod.getUri();
    const client = new MongoClient(memUri, { appName: "tin-bootcamp-embedded" });
    await client.connect();
    g.tinClient = client;
    g.tinMemory = { uri: memUri, stop: async () => { await mongod.stop(); } };
    g.tinState = {
      mode: "embedded",
      db: DB_NAME,
      host: "localhost (MongoMemoryServer — NOT Atlas)",
    };
    return client;
  } catch (err) {
    throw new Error(
      `Atlas not connected: MONGODB_URI missing. Embedded fallback failed: ${sanitizeError(err)}`,
    );
  }
}

export async function coll<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export function isBootcampCollection(name: string): boolean {
  return name.startsWith("bootcamp_");
}

export async function inspectExistingCollections(): Promise<string[]> {
  const db = await getDb();
  return (await db.listCollections().toArray()).map((c) => c.name);
}

export { DB_NAME };
export type { DatasetId };
