import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'nato_catalog';

// Assumed context for this process: one long-running Node server, one local
// mongod, short catalog reads, and few writes on requests. Expected concurrency
// is a demonstration browser, not a cluster. The driver default (100
// connections) would hold about 1 MB each on the server without being used.
// The pool stays small, with one connection already ready and a short timeout
// if mongod does not answer.
const client = new MongoClient(uri, {
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTimeMS: 600_000,
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 30_000,
});

let database;

export function uriOscurata() {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}

export function nomeDatabase() {
  return dbName;
}

export async function connetti() {
  if (database) return database;
  await client.connect();
  database = client.db(dbName);
  return database;
}

export function getDb() {
  if (!database) {
    throw new Error('MongoDB is not connected.');
  }
  return database;
}

export async function chiudi() {
  await client.close();
  database = undefined;
}
