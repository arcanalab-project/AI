import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27001';
const dbName = process.env.MONGODB_DB || 'nato_catalog';

// Contesto assunto per questo processo: un solo server Node di lunga durata,
// un mongod locale, letture brevi di catalogo e poche scritture sulle richieste.
// La concorrenza attesa è quella di un browser dimostrativo, non di un cluster.
// Il default del driver (100 connessioni) terrebbe circa 1 MB ciascuna sul
// server senza servirne l'uso. Il pool resta piccolo, con una connessione già
// pronta e un timeout breve se mongod non risponde.
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
    throw new Error('MongoDB non è connesso.');
  }
  return database;
}

export async function chiudi() {
  await client.close();
  database = undefined;
}
