# Data model

Database: `defence_media_explorer` on the Atlas cluster referred to as federazionecup. The application refuses the `admin`, `local`, and `config` databases. It does not create a second application database and it does not drop other databases.

Collections:

| Collection | Holds |
| --- | --- |
| `assets` | One original file, its metadata, processing status, and derivative pointers. |
| `segments` | Retrieval units. Embeddings live here, not on a side collection. |
| `ingestion_jobs` | Pipeline attempts, generation, and errors as codes. |
| `collections` | Named groups used as a filter. |
| `saved_searches` | A person's query, mode, filters, and sort. |
| `users` | Email, password hash, role, locale, time zone, workspace. |
| `audit_events` | Login, upload, update, delete, and saved-search actions. |

Roles are `viewer`, `uploader`, and `admin`.

## Segment

A segment is an image, a video clip, an audio passage, or a text chunk. Video and audio windows keep `startMs` and `endMs` on the original timeline. Text chunks keep character offsets.

Fields the vector index can filter include workspace, media type, segment type, collection, source, source language, processing status, review state, pipeline version, embedding model, capture-date-unknown, capture time, upload time, tags, and categories.

Fields Atlas Search reads include title, descriptions, transcript, OCR text, tags, categories, and `searchText`. `searchText` is analyzed with `lucene.standard` and with English, French, German, Spanish, and Italian multi-fields. The definition checked into `docs/atlas-indexes.json` is generated from the Python definitions.

`embedding` is a float array of the configured dimension when a provider wrote one. Sample documents in this repository leave it null. The technical API returns at most eight preview values and never the full array.

`indexingState` is `not_written` until the pipeline commits, then `persisted`. See the decisions note: persisted is not the same as queryable.

## Asset capture

`capturedAt` is UTC or null. `captureDateUnknown` is true when no trustworthy capture instant exists. `captureDateMode` records whether a person typed it, marked it unknown, or asked the pipeline to read the file.

## Jobs

Statuses move through `uploaded`, `validating`, `extracting`, `enriching`, `embedding`, and `indexing`, and finish as `ready`, `partial`, or `failed`. `partial` means a provider or a derivative was missing and the gap was recorded. `failed` carries `{ code, params }` from the stable error list.
