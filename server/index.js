import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes.js';
import { connetti, nomeDatabase, uriOscurata } from './db.js';
import { ensureSchema } from './schema.js';
import { seminaSeVuoto } from './seed.js';
import { avviaAggiornamentoDroni } from './live.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(directory, '..', 'public');
const port = Number(process.env.PORT || 3000);
const host = process.env.BIND_HOST || '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use('/api', api);
app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

try {
  const db = await connetti();
  await ensureSchema(db);
  const seminato = await seminaSeVuoto(db);
  avviaAggiornamentoDroni(db);
  app.listen(port, host, () => {
    const seme = seminato ? ' Initial seed inserted.' : '';
    console.log(`Catalog at http://localhost:${port} — MongoDB ${uriOscurata()} / ${nomeDatabase()}.${seme}`);
  });
} catch (err) {
  console.error(err);
  if (err.errInfo) console.error(JSON.stringify(err.errInfo, null, 2));
  process.exit(1);
}
