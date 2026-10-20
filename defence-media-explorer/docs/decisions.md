# Decisions

## App directory

The application lives in `defence-media-explorer/`. The repository root README is an unrelated document and is not the product README.

## Transcription model

Segment timestamps are required, so the initial transcription model is `whisper-1`. `gpt-transcribe` is the general file-transcription recommendation, but it is not the timestamped path this archive uses. Change `TRANSCRIPTION_MODEL` only on purpose.

## Capture dates

`captureDateMode` is `user`, `unknown`, or `file`. A person-entered instant is interpreted in the selected time zone and stored in UTC. `unknown` stores no capture instant and sets `captureDateUnknown`. `file` reads EXIF when the image carries a usable instant. EXIF without an offset stays unknown rather than being guessed as the upload time. Unknown capture dates can be included, excluded, or requested alone. They are not treated as the upload time.

## Text index

The Atlas Search index uses `lucene.standard` as the base analyzer so a mixed-language archive is not forced through one stemmer. `searchText` also has English, French, German, Spanish, and Italian multi-fields. Full-text search does not translate. A query in one language does not become the other four. Cross-language match is a semantic question, and it is not claimed here.

## Hybrid ranking

MongoDB 8 can run `$rankFusion` over the vector pipeline and the text pipeline. If this deployment rejects that stage, the API loads both lists and fuses them with reciprocal rank fusion (`k` from `RRF_K`, default 60). Duplicate ids inside one list take the first rank only. Raw engine scores are never added.

## Media routing

`voyage-multimodal-3.5` at 1024 dimensions is the shared space. Ingestion picks the input from the media type: image pixels, a native video clip, ordered frames with timestamps when native video cannot be sent, or the transcript or text chunk. OCR stays on `ocrText` for full-text search and is not part of the image vector. Speech on a video is transcribed and stored as its own transcript document in the same space. The clip vector stays a video vector. `input_type` is `document` when the segment is stored and `query` when the question is embedded. The pinned `voyageai` 0.3.5 client does not send video or `output_dimension` on its multimodal method, so that call uses the multimodal HTTP API. The returned length is checked. A mismatch fails the segment.

## Optional text channel

`ENABLE_TEXT_EMBEDDINGS` defaults to false. When it is true, `voyage-4-large` embeddings are stored on `textEmbedding` and searched through `segments_text_vector_v1`. Query vectors for that index use `voyage-4-large`. Rank fusion combines that list with the multimodal list. The two vectors are never written to the same field, and their raw scores are never added or compared.

## Video embeddings

Voyage native video is requested when the clip is within the provider limits used by the pipeline. If that path fails, the pipeline embeds sampled frames and records the strategy `sampled_frames`. Sampled frames can miss an event shorter than the gap between frames. That caveat is stored in the technical explanation, not papered over.

## Embedding shape

The client requests `output_dimension` and `output_dtype` float. The returned length is checked against `EMBEDDING_DIMENSIONS` and against the vector index. A mismatch is an error, not a silent resize. Supported lengths are 256, 512, 1024, and 2048. This deployment asks for 1024.

## Same-origin API

The browser calls `/api` on the Next.js origin. `next.config.ts` rewrites that prefix to `API_INTERNAL_URL` (the API container, or `http://localhost:8000` outside Compose). Session cookies stay on the page origin.

## Partial results

Missing Voyage or OpenAI credentials stay missing. The pipeline writes the segments it can and marks them partial, with `PROVIDER_NOT_CONFIGURED` where a provider was required. It does not substitute mock embeddings, mock descriptions, or mock transcripts.

## Indexing state and search availability

`indexingState` is what the application persisted. Atlas builds `segments_vector_v1` and `segments_text_v1` on its own schedule. A document can be persisted while an index is still building or not queryable. Health reports `queryable` from the index status. The interface says this in Settings and on the technical panel.

## Generation swap

Reprocess writes the next generation, then deletes the other generations. If the new vectors use a different model, dimension, or pipeline version, the previous generation is removed before the new documents are inserted, so a query does not mix incompatible vectors. Otherwise the new documents are inserted first and the old generation is removed afterwards.

## Object storage endpoints

`S3_ENDPOINT` is the address the API and the worker use. Inside Compose that is the MinIO service. `S3_PUBLIC_ENDPOINT` is the address placed in signed URLs the browser can open. Signing with the internal hostname makes the browser request fail even when the signature is valid. `infra/minio-cors.json` allows the frontend origin to PUT and GET. The multipart client does not send `X-DME-Request` to MinIO.

## Ingestion queue

Redis and Celery are not part of the running system. `ingestion_jobs` is the queue: atomic claim, a renewable lease, heartbeats that must still own the job, recovery after the lease expires, bounded retries with exponential backoff and jitter, and a terminal `failed` state. Transient provider failures retry. Permanent failures, including a model or dimension mismatch, do not. Stage checkpoints are stored on the job so a recovered attempt can reuse completed work. Segment writes upsert `segmentKey`.

The worker is `python -m app.workers` from the backend directory. That is also the Compose command. Running more than one process does not require a different queue.

## Interface language

Changing locale changes labels, dates, numbers, and plurals. It does not translate source media, rewrite `searchText`, or re-embed segments. Full-text search still does not translate the query. The time zone is a separate setting.
