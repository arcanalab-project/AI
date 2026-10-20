# Data flow

## Upload

1. The browser keeps the draft in a module store: files plus title, description, collection, source, tags, source language, and capture mode (`user`, `unknown`, or `file`).
2. A file of 64 MB or less is posted as multipart form data to `POST /api/assets/direct` with `X-DME-Request: 1`. Upload progress comes from the request body. Processing progress comes later from the job status.
3. A larger file calls `POST /api/assets/uploads`, receives part URLs, PUTs each part to object storage without the API header, and posts `{ etag, partNumber }` to `POST /api/assets/uploads/{id}/complete`.
4. The API detects the type from the header and the extension, rejects a hash already stored in the workspace, writes the original, and only then inserts an activated `ingestion_jobs` document. A multipart upload creates the asset while parts are still arriving, and does not activate a job until the original object is complete and hashed.
5. A separate Python worker claims the job. The API process does not run FFmpeg, transcription, or embedding. Query embeddings for interactive search are built in the API and are not put on this queue.

## Pipeline

1. Validate with ffprobe or Pillow. Duration limits apply. EXIF without an offset does not become a capture time.
2. Extract windows, thumbnails, storyboard frames, and a playback derivative when the original is not already playable H.264 MP4.
3. If OpenAI vision is configured, describe frames. If not, record `PROVIDER_NOT_CONFIGURED` and continue.
4. If OpenAI transcription is configured and the media has audio, transcribe with `whisper-1` so timestamps exist. A silent or tone-only file is not described as speech.
5. If Voyage is configured, embed with `voyage-multimodal-3.5`. Images send the picture. Video sends the clip, then ordered frames with timestamps if native video cannot be sent. Audio and text send the transcript or chunk. OCR stays on the document for full-text search. A video transcript is also its own document in the same space. The request sets `output_dimension` and float output, then checks the length. If Voyage is not configured, no vector is written. `ENABLE_TEXT_EMBEDDINGS` is false by default; when true, `voyage-4-large` is written only to `textEmbedding`.
6. Insert the new generation of segment documents with `indexingState: persisted`, source id, segment id, modality, model, dimensions, preprocessing version, and timestamps. Drop the other generation according to the swap rules, including a text-model change when that channel is on.
7. Atlas updates its search indexes asynchronously. Search availability is the index `queryable` flag, not this write.

## Search

1. The page writes the query, mode, sort, and filters into the URL, including the active time zone.
2. `POST /api/search` builds one metadata filter for browse, `$search`, and `$vectorSearch`.
3. Empty query: count and page the matching segments. `countKind` is `matching_segments`, and `completeMatchCount` is that count.
4. Semantic: embed the query with `voyage-multimodal-3.5` (`input_type` query) and run `$vectorSearch` on `embedding`. Missing Voyage returns `PROVIDER_NOT_CONFIGURED`. When the text channel is enabled, a `voyage-4-large` query vector searches `textEmbedding` and the ranks are fused. The raw scores are not compared.
5. Full-text: `$search` on `segments_text_v1`. Language multi-fields are extra clauses. The standard field does not translate.
6. Hybrid: `$rankFusion` when the server is MongoDB 8 and accepts the stage; otherwise backend reciprocal rank fusion. The response `fusion` field says which path ran.
7. Optional text rerank runs only when `ENABLE_RERANK` is true and Voyage is configured. It does not see pixels. A failure is a warning, not a fabricated order.
8. Sorting by date after a ranked query sorts inside the retrieved window and adds the warning `SORT_WINDOW`.
9. Nearby video hits are grouped. Cards include `nearbyCount`. The interface does not turn rank into a percentage.

## Sign-in

`DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` are empty unless an operator sets them on the API process. When both are set, startup inserts that admin once if the email is absent. The interface does not invent a password and does not write one into `.env`. Password rules: at least 10 characters, one letter, and one digit.
