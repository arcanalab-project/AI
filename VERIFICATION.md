# Verification

Eseguito su questa VM (2026-10-09). Materiali Mac assenti; palette MongoDB 2026 e sequenza del brief.

## Automated

- `npm test` — fixture adulti, GeoJSON lng/lat, uguaglianza SQL↔canonical (foto/interessi/settings/sub), no cartesiano, like idempotenti, like reciproci → un match, filtri discovery (self/hidden/paused/giudicato/età/genere/distanza).
- `npm run typecheck`
- `npm run lint` (se fallisce su warning non bloccanti, annotato sotto)
- `npm run build`

## Flows (app)

- Tab **La lezione**: 8 scene, Avanti/Indietro, progress, fullscreen, click campo → mapping tabella + path documento.
- SQL reale eseguita da `node:sqlite`, una riga, foto/interessi aggregati.
- Documento lesson: lettura `bootcamp_users` se Mongo è su, altrimenti sintesi SQL etichettata.
- Tab **L’app live**: switch identità demo, discovery, like/pass, match unico, messaggi, edit profilo/prefs/sub con successo solo dopo risposta server, reset con conferma e dataset esplicito.
- Persistenza: seed `datasetId=mvp|lesson` su `bootcamp_*` only.

## Projection

Layout pensato per 1440×900 e 1920×1080 (lezione). Live usabile su viewport stretta (stack). Contrasto navy/green, focus visibile, frecce scena non rubano gli input.

## Blocchi noti

- `MONGODB_URI` non era nel repo/env di questa VM. Senza URI: lezione SQL ok; live usa MongoMemoryServer (etichettato **non Atlas**) oppure errore offline concreto.
- Font Special Gothic del path Mac assente; usati pacchetti Fontsource Special Gothic + Source Code Pro.
- PDF e PPTX assenti: sequenza e palette dal brief, non dal file originale.
