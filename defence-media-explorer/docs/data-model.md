# Data model

Database: `defence_media_explorer` on the Atlas cluster referred to as federazionecup. The application refuses the `admin`, `local`, and `config` databases. It does not create a second application database and it does not drop other databases.

Collections:

| Collection | Holds |
| --- | --- |
| `assets` | One original file. The object ref stores bucket, key, version when the store returns one, checksum, MIME type, and size. `capturedAt` and `uploadedAt` stay separate. Unknown capture time stays unknown. `processingStatus` is the lifecycle status. |
| `segments` | The `asset_segments` contract: one searchable unit per document (text chunk, image, video clip, or timestamped transcript segment). The live collection name stays `segments` because the Atlas vector index `segments_vector_v1` and text index `segments_text_v1` already point at it. There is no second `asset_segments` collection. |
| `ingestion_jobs` | The ingestion queue. Status, stage, progress, attempts, `nextRunAt`, `workerId`, `leaseUntil`, `heartbeatAt`, ownership token, checkpoints, and structured errors. |
| `collections` | Named groups used as a filter. |
| `saved_searches` | A person's query, mode, filters, and sort. |
| `users` | Email, password hash, role, locale, time zone, workspace. |
| `audit_events` | Login, upload, update, delete, and saved-search actions. |

Roles are `viewer`, `uploader`, and `admin`.

## Segment

`segments` is the `asset_segments` contract. Each document is one image, one video clip, one audio passage, one text chunk, or one timestamped transcript segment. It carries `assetId`, a stable `segmentId` (also stored as `segmentKey` for the unique upsert), segment type, `startMs` / `endMs` or character offsets, extracted text or transcript, derivative object refs, the embedding, the embedding model and dimensions, `preprocessingVersion`, and processing status. Video and audio windows keep `startMs` and `endMs` on the original timeline.

`segmentKey` is unique. A replayed job upserts that key, so at-least-once delivery does not publish a second copy. The API still addresses a segment by its MongoDB `_id` in search results and in the player link. The full embedding array is not returned to the browser.

Fields the vector index can filter include workspace, media type, segment type, collection, source, source language, processing status, review state, pipeline version, embedding model, capture-date-unknown, capture time, upload time, tags, and categories.

Fields Atlas Search reads include title, descriptions, transcript, OCR text, tags, categories, and `searchText`. `searchText` is analyzed with `lucene.standard` and with English, French, German, Spanish, and Italian multi-fields. The definition checked into `docs/atlas-indexes.json` is generated from the Python definitions.

`embedding` is a float array of the configured dimension when a provider wrote one. Sample documents in this repository leave it null. The technical API returns at most eight preview values and never the full array.

`indexingState` is `not_written` until the pipeline commits, then `persisted`. See the decisions note: persisted is not the same as queryable.

## Asset capture

`capturedAt` is UTC or null. `captureDateUnknown` is true when no trustworthy capture instant exists. `captureDateMode` records whether a person typed it, marked it unknown, or asked the pipeline to read the file.

## Jobs

`ingestion_jobs` is the queue. A job stays `inactive` until the original object is in storage and its checksum is known. The worker then claims it.

Statuses move through `uploaded`, `validating`, `extracting`, `enriching`, `embedding`, and `indexing`, and finish as `ready`, `partial`, or `failed`. `retrying` means a transient error is waiting for `nextRunAt`. `partial` means a provider or a derivative was missing and the gap was recorded. `failed` is terminal and carries `{ code, params }` from the stable error list.

A claim is one `findOneAndUpdate`. The worker holds `ownershipToken` until `leaseUntil`. Heartbeats and completion match that token and a lease that has not expired. An expired lease can be claimed by another worker. Checkpoints on the job let the next attempt skip stages that already finished. Writes are upserts on `segmentKey`. A worker that loses the lease does not mark the job complete, and segment rows stamped with its token are removed. The worker does not keep a MongoDB transaction open across FFmpeg or provider calls.

`indexingState: persisted` means the segment document was written. It does not mean the Atlas Search or Vector Search index is queryable yet.
