# Verification

Eseguito su questa VM (2026-10-09). Materiali Mac assenti; palette MongoDB 2026 e sequenza del brief.

## Automated

- `npm test` — fixture adulti, GeoJSON lng/lat, uguaglianza SQL↔canonical (foto/interessi/settings/sub), no cartesiano, like idempotenti, like reciproci → un match, filtri discovery (self/hidden/paused/giudicato/età/genere/distanza).
- `npm run typecheck`
- `npm run lint` (se fallisce su warning non bloccanti, annotato sotto)
- `npm run build`

## Flows (app)

Eseguiti via API su `http://localhost:3000` e via browser (computer-use):

- Home 200. `/api/status`: mode `embedded` (MongoMemoryServer, etichettato non-Atlas), seed ok, collection `bootcamp_*`.
- SQL: 1 riga, 3 foto, 3 interessi, cartesiano ingenuo 9, nome Giulia Conti.
- Documento: `source=embedded`, GeoJSON `[9.19, 45.4642]`.
- Discovery Giulia: `luca`, `samuele`; esclusi self, Marco (distanza), Elena (hidden), Davide (paused).
- Like Giulia→Luca created; repeat idempotent; Luca→Giulia `matchCreated` su `giulia|luca`.
- Messaggio persistito; GET thread = 1.
- PATCH bio confermato dal GET successivo.
- Evolve hobbies flag true.
- Browser: tab lezione scene 1–5, click mapping, SQL button; tab live identity switcher, like, match Luca, inspector filtro 2dsphere.

## Projection

Layout pensato per 1440×900 e 1920×1080 (lezione). Live usabile su viewport stretta (stack). Contrasto navy/green, focus visibile, frecce scena non rubano gli input.

## Blocchi noti

- `MONGODB_URI` non era nel repo/env di questa VM. Senza URI: lezione SQL ok; live usa MongoMemoryServer (etichettato **non Atlas**) oppure errore offline concreto.
- Font Special Gothic del path Mac assente; usati pacchetti Fontsource Special Gothic + Source Code Pro.
- PDF e PPTX assenti: sequenza e palette dal brief, non dal file originale.
