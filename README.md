# TIN — Finding Love in Data

Demo interattiva per il bootcamp **Match your data**: due tab, **La lezione** (SQL → documento MongoDB) e **L’app live** (MVP persistito su MongoDB, database `TIN`).

UI in italiano. Nomi di modello in inglese. Titoli corso in inglese dove servono alla continuità.

## Stack

Next.js 15 + TypeScript + Tailwind · driver ufficiale MongoDB · SQLite in-process (`node:sqlite`) **solo per la lezione SQL**. Non è un secondo database di prodotto e non è un benchmark vs Atlas.

## Avvio

```bash
npm install
cp .env.example .env.local
# inserisci MONGODB_URI (server-side). Non metterla nel frontend.
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

Senza `MONGODB_URI` la lezione SQL funziona comunque. L’app live prova un MongoDB embedded di sviluppo e mostra chiaramente **offline / embedded / Atlas live**.

### Seed e reset

- Seed idempotente all’avvio: collection `bootcamp_*` nel DB `TIN`.
- In UI: **Prepara scenario Giulia ↔ Luca**, **Reset dataset MVP**, **Reset dataset lezione** (con conferma). Il reset cancella solo `datasetId` scelto in `bootcamp_*`. **Non droppa il database.**

Oppure:

```bash
curl -X POST http://localhost:3000/api/live -H 'content-type: application/json' -d '{"action":"seed","dataset":"mvp"}'
curl -X POST http://localhost:3000/api/live -H 'content-type: application/json' -d '{"action":"reset","dataset":"mvp"}'
```

### Test e build

```bash
npm test
npm run typecheck
npm run build
```

## Dati

14 profili adulti sintetici, foto locali in `public/avatars/`. Fixture unica: `src/lib/canonical.ts` → tabelle SQL e documenti MongoDB con gli stessi id e valori.

Collection: `bootcamp_users`, `bootcamp_interactions`, `bootcamp_matches`, `bootcamp_messages`, `bootcamp_events`. Dataset `lesson` e `mvp` separati.

## Mapping nomi

SQL `snake_case`, documenti `camelCase`. Tabella esplicita in `src/lib/naming.ts` (es. `user_settings.discovery_distance_km` → `settings.discoveryDistanceKm`).

GeoJSON: `coordinates: [longitude, latitude]`.

## Documentazione demo

- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — 15–20 minuti
- [`SCENE_PDF_MAP.md`](SCENE_PDF_MAP.md) — scene ↔ pagine PDF
- [`VERIFICATION.md`](VERIFICATION.md) — check eseguiti

## Sicurezza URI

`MONGODB_URI` vive solo in `.env.local` / ambiente server. Non viene serializzata nelle API, nell’inspector, né nei log.
