# Verification

Run on this VM (2026-10-09). Mac materials missing; MongoDB 2026 palette and brief sequence.

## Automated

- `npm test` — adult fixtures, GeoJSON lng/lat, SQL↔canonical equality (photos/interests/settings/sub), no cartesian, idempotent likes, reciprocal likes → one match, discovery filters (self/hidden/paused/judged/age/gender/distance).
- `npm run typecheck`
- `npm run lint` (if it fails on non-blocking warnings, annotated below)
- `npm run build`

## Flows (app)

Run via API on `http://localhost:3000` and via browser (computer-use):

- Home 200. `/api/status`: mode `embedded` (MongoMemoryServer, labeled not-Atlas), seed ok, collections `bootcamp_*`.
- SQL: 1 row, 3 photos, 3 interests, naive cartesian 9, name Giulia Conti.
- Document: `source=embedded`, GeoJSON `[9.19, 45.4642]`.
- Discovery Giulia: `luca`, `samuele`; excluded self, Marco (distance), Elena (hidden), Davide (paused).
- Like Giulia→Luca created; repeat idempotent; Luca→Giulia `matchCreated` on `giulia|luca`.
- Message persisted; GET thread = 1.
- PATCH bio confirmed by the following GET.
- Evolve hobbies flag true.
- Browser: lesson tab scenes 1–5, mapping click, SQL button; live tab identity switcher, like, match Luca, inspector 2dsphere filter.

## Projection

Layout designed for 1440×900 and 1920×1080 (lesson). Live usable on a narrow viewport (stack). Navy/green contrast, visible focus, scene arrows do not steal inputs.

## Known blockers

- `MONGODB_URI` was not in this VM’s repo/env. Without URI: SQL lesson ok; live uses MongoMemoryServer (labeled **not Atlas**) or a concrete offline error.
- Special Gothic font from the Mac path missing; Fontsource Special Gothic + Source Code Pro packages used.
- PDF and PPTX missing: sequence and palette from the brief, not from the original file.
