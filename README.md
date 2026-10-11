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

The lesson introduces Giulia’s data scene by scene: one profile table, then photos and interests, then preferences, then the current plan. Counts follow whatever is on screen. Plan history stays out of the profile document until the last scene. This is one model, not a speed claim.

Collections: `bootcamp_users`, `bootcamp_interactions`, `bootcamp_matches`, `bootcamp_messages`, `bootcamp_events`. Separate `lesson` and `mvp` datasets.

## Name mapping

SQL `snake_case`, documents `camelCase`. Explicit table in `src/lib/naming.ts` (e.g. `user_settings.discovery_distance_km` → `settings.discoveryDistanceKm`).

GeoJSON: `coordinates: [longitude, latitude]`.

## Demo documentation

- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — 10 minutes
- [`SCENE_PDF_MAP.md`](SCENE_PDF_MAP.md) — scenes ↔ PDF pages
- [`VERIFICATION.md`](VERIFICATION.md) — checks run

## URI safety

`MONGODB_URI` lives only in `.env.local` / the server environment. It is not serialized in APIs, the inspector, or logs.

## Public deploy (students)

The **lesson** tab runs in the browser with no install. On a static host the live tab disables its commands and says the database API is absent.

The **live** tab needs a Node host. Set **server-side** `MONGODB_URI` and `MONGODB_DB=TIN`. Never put the URI in `NEXT_PUBLIC_*`, the client bundle, logs, or the student URL.

### Student URL (lesson, no install)

**Open this:** https://tin-bootcamp.surge.sh/

That URL is HTTPS and needs no install. It still serves the previous static build: this environment has no Surge login, so the progressive lesson was not republished. Republish the `out/` folder from `npm run build:static` to `tin-bootcamp.surge.sh` before class. On that host the live tab stays off until a Node server is connected.

Do **not** use `raw.githack.com` — in a real browser it shows a phishing-confirmation / challenge page (curl can still return 200). jsDelivr serves the HTML as `text/plain`, so the app does not run.

GitHub Pages (`https://arcanalab-project.github.io/AI/`) is still off. Mario, with org admin: repo **Settings → Pages → Source: GitHub Actions**. This GitHub App token cannot enable it (`Resource not accessible by integration`). After that click, Pages can become the canonical URL. Until then, send the class the Surge link above.

### Node host with optional Atlas (lesson + live)

Connect this GitHub repo to one of:

1. **Vercel** (preferred): [vercel.com/new](https://vercel.com/new) → import `arcanalab-project/AI` → env `MONGODB_URI` (secret) and `MONGODB_DB=TIN` → Deploy. Needs `VERCEL_TOKEN` or Mario logged into the Vercel CLI / dashboard.
2. **Render**: this repo has `render.yaml`. Connect the repo, set `MONGODB_URI`.
3. **Fly.io**: `fly launch` using `Dockerfile` + `fly.toml`. Needs `FLY_API_TOKEN`.
4. **Railway**: Nixpacks/`Dockerfile`. Needs `RAILWAY_TOKEN`.

```bash
npx vercel --prod   # after `npx vercel login` or VERCEL_TOKEN
```
