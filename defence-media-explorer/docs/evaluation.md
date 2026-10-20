# Evaluation notes

This note records what was exercised while building the product. It does not report retrieval quality.

## What was checked in code

Backend unit tests cover metadata filters, reciprocal rank fusion, search clauses, time windows, EXIF handling, hashing, media detection, generation swap, grouping, retries, deletion, and the error catalogue. Pipeline tests use local synthetic bytes and fake providers. They do not call Atlas and they do not call Voyage or OpenAI.

The message check compares the five locale files key for key, including every API error code, and formats one UTC instant in `Europe/Rome` plus a grouped number and plural strings in each locale. The January instant used there is 15:00 UTC and displays as 16:00 in Rome for every locale, which is the check that time zone does not follow interface language.

Atlas index creation was run once before this pass. The recorded result was server 8.0.34, database `defence_media_explorer`, vector and text indexes READY and queryable, dimensions 1024, and the temporary probe removed. That confirms the index definitions were accepted. It is not a relevance test.

## What was not measured

Voyage embeddings, OpenAI vision, OpenAI transcription, semantic retrieval, hybrid retrieval, cross-language retrieval, and rerank were not scored. There is no labelled query set and no precision or latency figure in this repository. Cross-language quality is not claimed. Full-text search does not translate, and semantic cross-language behaviour cannot be stated without Voyage credentials and a real corpus.

Do not read a partial asset, a tone fixture, or an empty result list as a measurement of model quality. A tone WAV is not speech-recognition evidence.

## Compose

`docker-compose.yml` was checked as YAML. It includes the API, worker, frontend, Redis, and MinIO, and it does not include a MongoDB service. Docker is not installed in the environment where this note was written, so the stack was not started with Compose.
