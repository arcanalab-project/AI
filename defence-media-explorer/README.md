# Defence Media Explorer

Search, upload, and review an archive of video, images, audio, and text. The interface is Next.js. The API is FastAPI. Bytes are in S3-compatible storage. Documents and embeddings are in MongoDB Atlas, database `defence_media_explorer`, on the cluster referred to in this project as federazionecup.

The product lives in this directory because the repository root README is a different document.

## What you need

- Python 3.12, Node.js 22, ffmpeg and ffprobe
- An Atlas database named `defence_media_explorer` (not `admin`, `local`, or `config`)
- Redis and MinIO when you want the queue and object storage
- Optional: a Voyage API key for embeddings and rerank, an OpenAI API key for vision and `whisper-1` transcription

Missing Voyage or OpenAI keys stay missing. Those capabilities are reported as unavailable. The app does not fill them with mock vectors or mock text.

## Credentials

Copy `.env.example` to `.env` and fill it in on the machine that runs the API. Do not commit `.env`.

| Name | What to put |
| --- | --- |
| `MONGODB_URI` | Connection string for the federazionecup cluster. Never paste it into source, docs, or tickets. |
| `MONGODB_DATABASE` | `defence_media_explorer` |
| `SESSION_SECRET` | At least 16 characters. Signs the session cookie. |
| `DEMO_ADMIN_EMAIL` | Empty by default. The API seeds an admin only when this and the password are both set on the API process. |
| `DEMO_ADMIN_PASSWORD` | Empty by default. At least 10 characters, with a letter and a digit. The interface does not invent one and does not write one here. |
| `VOYAGE_API_KEY` | Leave empty to keep embeddings and rerank unavailable. |
| `OPENAI_API_KEY` | Leave empty to keep vision and transcription unavailable. |
| `S3_ENDPOINT` | Address the API and worker use. Inside Compose: `http://minio:9000`. |
| `S3_PUBLIC_ENDPOINT` | Address in signed URLs the browser opens. On a laptop: `http://localhost:9000`. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | MinIO credentials. Compose defaults exist only for local MinIO. |

`TRANSCRIPTION_MODEL` stays `whisper-1` because segment timestamps are required.

## Run it locally

From `defence-media-explorer`, with `.env` in this directory:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
```

Terminal 1, API:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Terminal 2, worker (Redis must be reachable at `REDIS_URL`):

```bash
cd backend
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO
```

Terminal 3, interface:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The browser calls `/api` on that origin. Next.js rewrites it to `API_INTERNAL_URL`, which defaults to `http://localhost:8000`.

Create the Atlas indexes once, from this directory, after `.env` is set:

```bash
python scripts/create_atlas_indexes.py
python scripts/create_atlas_indexes.py --verify
```

The verify pass inserts a probe and deletes it. Do not run two ensures at the same time.

Outside Compose, point `REDIS_URL` at a Redis you started yourself, and point `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` at MinIO. If those are down, health says so and uploads fail with a named error. Search of documents already in Atlas can still run.

## Run it with Compose

Compose starts Redis, MinIO, the API, the worker, and the frontend. It does not start MongoDB. Atlas stays outside the stack.

```bash
docker compose up --build
```

`S3_ENDPOINT` inside the API and worker is overridden to `http://minio:9000`. Set `S3_PUBLIC_ENDPOINT` to the MinIO address the browser can reach. `infra/minio-cors.json` is applied by the `minio-init` service.

This environment did not have Docker, so Compose was validated as YAML only and was not executed.

## Checks

```bash
cd backend && python3 -m pytest
cd frontend && npm run test:messages && npx tsc --noEmit
python scripts/generate_fixtures.py
```

## Layout

| Path | Contents |
| --- | --- |
| `backend/app` | API, search, pipeline, providers, storage |
| `frontend` | Next.js UI and the five message catalogues |
| `docs` | Architecture, decisions, data model, data flow, index JSON, sample documents, demo script, evaluation |
| `fixtures/synthetic` | Original diagrams, a short generated clip, a tone, a note |
| `scripts/create_atlas_indexes.py` | Idempotent index ensure for this database only |
| `docker-compose.yml` | API, worker, frontend, Redis, MinIO |

## Behaviour worth knowing

- Hybrid search uses `$rankFusion` on MongoDB 8. If that stage is rejected, the API fuses ranks itself. It never adds the two engines' raw scores.
- An empty query browses and returns a complete count. A text query returns a retrieved window, not a complete count of every match.
- Date sort after a ranked query sorts that window and returns the warning `SORT_WINDOW`.
- `indexingState: persisted` means the document was written. It does not mean the search index is queryable.
- The interface language does not translate or re-embed source media. The time zone is separate and is shown on date filters.
- Files up to 64 MB upload through the API. Larger files use presigned multipart upload. Mutations send `X-DME-Request: 1` to the API only.

Details and the reasons for these choices are in `docs/decisions.md`, `docs/architecture.md`, `docs/data-model.md`, and `docs/data-flow.md`.

## Limitations

- No Voyage key: semantic search, similar segments, native video embeddings, sampled-frame embeddings, and rerank are unavailable.
- `ENABLE_TEXT_EMBEDDINGS` defaults to false. `voyage-4-large` is a separate vector field and index, combined only by rank fusion.
- No OpenAI key: frame descriptions, OCR, and transcription are unavailable. Segments can still be stored as partial.
- Full-text search does not translate. Cross-language quality is not claimed. See `docs/evaluation.md`.
- EXIF without a time-zone offset stays an unknown capture date.
- Sampled frames can miss an event shorter than the gap between frames.
- A tone fixture is not speech. Do not treat it as a transcription test.
- `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` are empty until an operator sets them. There is no built-in demo password.
- Docker Compose was not executed where Docker is not installed.

## Troubleshooting

| What you see | What it means |
| --- | --- |
| Sign-in says the email or password was not accepted | The admin was not seeded, or the password does not match. Both demo variables must be set on the API process before startup, and the password must meet the length rule. |
| Health: embeddings, vision, or transcription unavailable | The corresponding key is empty. Leave it empty or set it. Do not expect synthetic vectors. |
| Health: queue unavailable | Redis is not reachable at `REDIS_URL`. Uploads will record `QUEUE_UNAVAILABLE`. |
| Health: object storage unavailable | S3 endpoint or keys are missing. |
| Playback or storyboard images do not load | `S3_PUBLIC_ENDPOINT` is probably the in-cluster hostname. Signed URLs must use an address the browser can open. Check MinIO CORS. |
| Search returns index not ready | The vector or text index exists in Atlas but is not queryable yet. A successful document write does not change that. |
| `UPLOAD_TOO_LARGE` or a stuck multipart upload | Direct upload stops at 64 MB. Above that, the browser must PUT each presigned part and then call complete. Parts go to MinIO, not to the API. |
| Duplicate asset | The same SHA-256 is already in the workspace. |
| Language switched and the archive text looks the same | That is intended. Only the interface is translated. |

Interactive API documentation is served by FastAPI at `http://localhost:8000/docs` when the API is running.
