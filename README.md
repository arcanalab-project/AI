# Federated data catalog

The portal is the NATO headquarters dashboard. Every current member is a provider, not a product. A member may publish several datasets, or none. Portugal publishes none. Discovery is shared. A restricted extract leaves only when the owner approves, when headquarters shares a drone feed with that nation, or when the viewer is the publisher. Sharing does not change the publisher.

The interface is in English. The catalog reads and writes MongoDB.

## Run

The portal listens only on `127.0.0.1`, port `3000`. It uses MongoDB already listening at `mongodb://localhost:27017`, database `nato_catalog`.

```bash
npm install
npm start
```

Open http://localhost:3000

On startup, an empty catalog is seeded. `npm run seed` rewrites that seed from scratch.

Variables:

- `MONGODB_URI` — default `mongodb://localhost:27017`
- `MONGODB_DB` — default `nato_catalog`
- `PORT` — default `3000`
- `BIND_HOST` — default `127.0.0.1`. The container sets `0.0.0.0` so the Service can reach it.

## Kubernetes

```bash
docker build -t nato-catalog:latest .
kubectl apply -f k8s/nato-catalog.yaml
kubectl -n nato-catalog port-forward svc/nato-catalog 3000:3000
```

Open http://localhost:3000. The catalog reaches MongoDB at `mongodb://mongo:27017/nato_catalog`.

One process, short queries, one local mongod: the pool stays small on purpose (`maxPoolSize` 10, `minPoolSize` 1). See `server/db.js`.

## Story

Germany publishes “Contacts from the southern Baltic sensor network”, a restricted product. The Netherlands discovers it, reads the metadata, and requests access. Germany approves. The Netherlands uses the extract on the use page (map and table). The German weather bulletin is open and can be used with no request.

Italy, France, Turkey, and Germany each also publish one live tactical-drone feed. The document is the current slice and a short ground track of about 12 points. `eventCount` is a counter. The server nudges the feed on an interval. On a drone, **Share with** picks any other NATO country. That country then shows the same live feed. The publisher remains the owner. Portugal starts with no publications.

The headquarters manager uses the portal directly. **Share with** on a published product picks any other NATO country. A shared drone stays one live feed, shown for the publisher and for the country it was shared with. The publisher remains the owner. “Reset catalog data” clears shares and reloads the seed.

## Model

Six collections, with JSON Schema validation:

- `fornitori` — one document per current NATO member: profile and sovereignty statement
- `prodotti` — title, domain, metadata, and access policy on the same document, because the dossier shows them together. The provider’s name is copied onto the product. A tactical drone sets `tipo` to `drone`
- `estratti` — the records of an ordinary product, in a separate collection: discovery does not read them, and the server releases them only after the policy check
- `droni` — one live document per tactical drone (Germany, France, Italy, Turkey), including flight, mission, payload, platform, propulsion, source formats, source map, and source state. The ground track stays short. `eventCount` is not an event log
- `richiesteAccesso` — requests with their own state (pending, approved, denied, revoked). Title and names are copied onto the request for the queues
- `condivisioni` — a headquarters share: product, publisher, and recipient. The publisher stays the owner

Indexes: products by provider; requests by owner and status; requests by requester and product; drones by product; shares by recipient and product.

---

⸻

Production AI is not a demo

Lessons learned building real GenAI systems with MongoDB

Most GenAI demos work.

Most production GenAI systems struggle.

The difference is not the model.
It’s everything around it: data, retrieval, consistency, latency, and failure modes.

After working on real-world AI systems built on large document corpora, search-heavy workloads, and public-sector constraints, a few patterns became impossible to ignore.

⸻

What breaks when AI goes to production

Once users, data volume, and uptime expectations enter the picture:
	•	Prompt engineering stops being the main problem
	•	Vector search alone stops being sufficient
	•	Latency becomes architectural, not accidental
	•	Observability becomes mandatory, not optional

In production, retrieval quality defines output quality.
The model is just the last step.

⸻

Why hybrid search matters

Pure semantic search is powerful, but incomplete.

Real systems need:
	•	exact matching on structured fields
	•	full-text relevance
	•	semantic similarity
	•	predictable ranking behavior

Hybrid search (full-text + vector) is not a “nice to have”.
It’s the only approach that survives heterogeneous data and real users.

⸻

Data architecture beats clever prompts

Most GenAI failures I see are rooted in data design:
	•	embeddings stored without lifecycle rules
	•	documents modeled for ingestion, not retrieval
	•	no separation between operational and AI concerns
	•	no clear ownership of search relevance

Once these mistakes are baked in, scaling becomes painful.

⸻

Why MongoDB works well here

MongoDB fits production AI systems because it naturally supports:
	•	operational + AI workloads in the same platform
	•	hybrid search (text + vector)
	•	flexible document modeling for evolving schemas
	•	predictable performance under mixed access patterns

Not because it’s trendy, but because it reduces architectural friction.

⸻

Not a tutorial, a field report

This is not a step-by-step guide.
It’s a synthesis of mistakes, trade-offs, and lessons learned from systems that had to stay up, stay fast, and stay correct.

If you are building GenAI systems meant to live longer than a demo, these constraints will find you sooner or later.

⸻

Further reading

I expand these ideas in more detail here:

Production AI with MongoDB￼

⸻

Author

Mario Noioso
Advisory Solution Architect
Data, AI, and the Real World

