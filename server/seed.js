import { connetti, getDb } from './db.js';
import { ensureSchema } from './schema.js';
import { costruisciSeme } from './seed-data.js';

export async function seminaSeVuoto(db) {
  const presenti = await db.collection('fornitori').countDocuments();
  if (presenti > 0) return false;
  await scriviSeme(db);
  return true;
}

export async function ripristinaSeme(db) {
  await db.collection('richiesteAccesso').deleteMany({});
  await db.collection('estratti').deleteMany({});
  await db.collection('prodotti').deleteMany({});
  await db.collection('fornitori').deleteMany({});
  await scriviSeme(db);
}

async function scriviSeme(db) {
  const seme = costruisciSeme();
  await db.collection('fornitori').insertMany(seme.fornitori);
  await db.collection('prodotti').insertMany(seme.prodotti);
  await db.collection('estratti').insertMany(seme.estratti);
}

const eseguitoDiretto = process.argv[1] && process.argv[1].endsWith('seed.js');

if (eseguitoDiretto) {
  try {
    const db = await connetti();
    await ensureSchema(db);
    await ripristinaSeme(getDb());
    const conteggi = {
      fornitori: await db.collection('fornitori').countDocuments(),
      prodotti: await db.collection('prodotti').countDocuments(),
      estratti: await db.collection('estratti').countDocuments(),
    };
    console.log(JSON.stringify(conteggi));
    process.exit(0);
  } catch (err) {
    console.error(err);
    if (err.errInfo) console.error(JSON.stringify(err.errInfo, null, 2));
    process.exit(1);
  }
}
