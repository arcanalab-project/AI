# Defence Media Explorer

Search, upload, and review an archive of video, images, audio, and text. The interface is Next.js. The API is FastAPI. One Python worker does ingestion. Originals and derivatives are GridFS files in MongoDB Atlas, database `defence_media_explorer`, on the cluster referred to in this project as federazionecup. Metadata, extracted text, segments, embeddings, and jobs stay in ordinary collections in that same database.

The product lives in this directory because the repository root README is a different document.

## One-time setup

Install these on the machine that will run the demo:

- Python 3.11 or newer
- Node.js 20 or newer (npm comes with it)
- FFmpeg, including ffprobe. On macOS: `brew install ffmpeg`

Edit `.env` in this directory. It is tracked. Fill the empty credential lines there.

| Name | What to put |
| --- | --- |
| `MONGODB_URI` | Connection string for the federazionecup cluster. Put it in `.env`. |
| `MONGODB_DATABASE` | `defence_media_explorer` |
| `SESSION_SECRET` | At least 16 characters. Signs the session cookie. |
| `DEMO_ADMIN_EMAIL` | Empty by default. The API seeds an admin only when this and the password are both set on the API process. |
| `DEMO_ADMIN_PASSWORD` | Empty by default. At least 10 characters, with a letter and a digit. The interface does not invent one and does not write one here. |
| `VOYAGE_API_KEY` | Required for embeddings and semantic search. |
| `OPENAI_API_KEY` | Leave empty to keep vision and transcription unavailable. Ingestion can still finish as partial. |

`TRANSCRIPTION_MODEL` stays `whisper-1` because segment timestamps are required.

Create the Atlas indexes once, from this directory, after `.env` is set:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
python scripts/create_atlas_indexes.py
python scripts/create_atlas_indexes.py --verify
```

The verify pass inserts a probe and deletes it. Do not run two ensures at the same time. `./scripts/dev.sh` also checks that the vector and text indexes exist, and creates them when it can.

## Run the demo

From this directory:

```bash
./scripts/dev.sh
```

That command checks Python, Node.js, and FFmpeg, creates `.venv` if needed, installs the existing dependency files, checks Atlas and the search indexes, then starts the API, the ingestion worker, and the frontend. Their logs share the terminal. Ctrl+C stops all three.

Open `http://localhost:3000`.

The browser calls `/api` on that origin. Next.js rewrites it to `API_INTERNAL_URL`, which defaults to `http://localhost:8000`.

A worker on this Mac means new uploads are processed only while `./scripts/dev.sh` is running. Query embeddings are computed by the API during search and are not queued.

Sign in with the demo admin from `.env` when those two values are set. Upload a file, watch Processing until it finishes, search for it, and play the matching segment.

## What the script does not install

Docker, MinIO, Redis, and Celery are not used. Do not start a local MongoDB. The database is Atlas.

## Checks

```bash
cd backend && python3 -m pytest
cd frontend && npm run test:messages && npx tsc --noEmit
python scripts/generate_fixtures.py
```

## Layout

| Path | Contents |
| --- | --- |
| `backend/app` | API, search, pipeline, providers, GridFS store |
| `frontend` | Next.js UI and the five message catalogues |
| `docs` | Architecture, decisions, data model, data flow, index JSON, sample documents, demo script, evaluation |
| `fixtures/synthetic` | Original diagrams, a short generated clip, a tone, a note |
| `scripts/dev.sh` | Starts the API, the worker, and the frontend |
| `scripts/create_atlas_indexes.py` | Idempotent index ensure for this database only |

## Behaviour worth knowing

- The upload request returns when the file is in GridFS and the job exists. Processing happens only in the worker.
- Playback is `GET /api/media/gridfs/{id}` and honours HTTP Range, so seek works.
- The collection `segments` is the `asset_segments` contract: one searchable unit per document. It is not a second collection.
- Hybrid search uses `$rankFusion` on MongoDB 8. If that stage is rejected, the API fuses ranks itself. It never adds the two engines' raw scores.
- An empty query browses and returns a complete count. A text query returns a retrieved window, not a complete count of every match.
- Date sort after a ranked query sorts that window and returns the warning `SORT_WINDOW`.
- `indexingState: persisted` means the document was written. It does not mean the search index is queryable.
- The interface language does not translate or re-embed source media. The time zone is separate and is shown on date filters.
- Limits have defaults in `.env.example`: `MAX_UPLOAD_MB` (1024), `MAX_MEDIA_DURATION_SECONDS`, `MAX_TEMP_DISK_MB`, `INGESTION_CONCURRENCY`, and the `JOB_*` lease settings.
- Assets that still point at the previous object store are counted on the health report and are not deleted.

Details and the reasons for these choices are in `docs/decisions.md`, `docs/architecture.md`, `docs/data-model.md`, and `docs/data-flow.md`.

## Limitations

- No Voyage key: `./scripts/dev.sh` stops before startup. Semantic search needs that key.
- `ENABLE_TEXT_EMBEDDINGS` defaults to false. `voyage-4-large` is a separate vector field and index, combined only by rank fusion.
- No OpenAI key: frame descriptions, OCR, and transcription are unavailable. Segments can still be stored as partial. The job ends in `partial` or `failed` with `PROVIDER_NOT_CONFIGURED`. It does not stay queued.
- No worker: the upload card and the Processing page say the worker is not running.
- Full-text search does not translate. Cross-language quality is not claimed. See `docs/evaluation.md`.
- EXIF without a time-zone offset stays an unknown capture date.
- Sampled frames can miss an event shorter than the gap between frames.
- A tone fixture is not speech. Do not treat it as a transcription test.
- `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` are empty until an operator sets them. There is no built-in demo password.
- Files already stored only as object-storage keys are not migrated by this version. Health reports how many. Reprocess stops with `LEGACY_OBJECT_STORAGE` and leaves the asset in place.

## Troubleshooting

| What you see | What it means |
| --- | --- |
| `./scripts/dev.sh` prints a missing command | Install Python, Node.js, or FFmpeg, then run it again. |
| Preflight says Atlas did not answer | The connection string or Atlas network access needs attention. The database name stays `defence_media_explorer`. |
| Preflight says a search index is not queryable yet | Atlas is still building it. Upload can start. Search waits. |
| Sign-in says the email or password was not accepted | The admin was not seeded, or the password does not match. Both demo variables must be set on the API process before startup, and the password must meet the length rule. |
| Health: embeddings unavailable | `VOYAGE_API_KEY` is empty. |
| Health: vision or transcription unavailable | `OPENAI_API_KEY` is empty. Leave it empty or set it. Do not expect synthetic vectors or transcripts. |
| Health: queue or media files unavailable | Atlas is not reachable. |
| Processing says the worker is not running | `./scripts/dev.sh` is not running, or the worker process exited. The upload card stops with `WORKER_NOT_RUNNING` after a short wait. |
| Search returns index not ready | The vector or text index exists in Atlas but is not queryable yet. A successful document write does not change that. |
| `LEGACY_OBJECT_STORAGE` | That asset still points at the previous object store. It was not deleted. |
| `UPLOAD_TOO_LARGE` | The file is above `MAX_UPLOAD_MB` (1024 by default). |
| Duplicate asset | The same SHA-256 is already in the workspace. |
| Language switched and the archive text looks the same | That is intended. Only the interface is translated. |

Interactive API documentation is served by FastAPI at `http://127.0.0.1:8000/docs` when the API is running.
