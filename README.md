# TIN — Finding Love in Data

Interactive demo for the **Match your data** bootcamp: two tabs, **The lesson** (SQL → MongoDB document) and **The live app** (MVP persisted on MongoDB, database `TIN`).

UI in English. Model names in English. Course titles in English.

## Stack

Next.js 15 + TypeScript + Tailwind · official MongoDB driver · in-process SQLite (`node:sqlite`) **only for the SQL lesson**. It is not a second product database and not a benchmark vs Atlas.

## Start

```bash
npm install
cp .env.example .env.local
# put MONGODB_URI (server-side). Do not put it in the frontend.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `MONGODB_URI` the SQL lesson still works. The live app tries an embedded development MongoDB and clearly shows **offline / embedded / Atlas live**.

### Seed and reset

- Idempotent seed on start: `bootcamp_*` collections in DB `TIN`.
- In the UI: **Prepare Giulia ↔ Luca scenario**, **Reset MVP dataset**, **Reset lesson dataset** (with confirmation). Reset deletes only the chosen `datasetId` in `bootcamp_*`. **It does not drop the database.**

Or:

```bash
curl -X POST http://localhost:3000/api/live -H 'content-type: application/json' -d '{"action":"seed","dataset":"mvp"}'
curl -X POST http://localhost:3000/api/live -H 'content-type: application/json' -d '{"action":"reset","dataset":"mvp"}'
```

### Test and build

```bash
npm test
npm run typecheck
npm run build
```

## Data

14 synthetic adult profiles, local photos in `public/avatars/`. Single fixture: `src/lib/canonical.ts` → SQL tables and MongoDB documents with the same ids and values.

Collections: `bootcamp_users`, `bootcamp_interactions`, `bootcamp_matches`, `bootcamp_messages`, `bootcamp_events`. Separate `lesson` and `mvp` datasets.

## Name mapping

SQL `snake_case`, documents `camelCase`. Explicit table in `src/lib/naming.ts` (e.g. `user_settings.discovery_distance_km` → `settings.discoveryDistanceKm`).

GeoJSON: `coordinates: [longitude, latitude]`.

## Demo documentation

- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — 15–20 minutes
- [`SCENE_PDF_MAP.md`](SCENE_PDF_MAP.md) — scenes ↔ PDF pages
- [`VERIFICATION.md`](VERIFICATION.md) — checks run

## URI safety

`MONGODB_URI` lives only in `.env.local` / the server environment. It is not serialized in APIs, the inspector, or logs.
