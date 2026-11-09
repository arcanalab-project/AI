# Catalogo federato dei dati

Le nazioni sono fornitori, non prodotti. Ognuna ha un profilo e pubblica più dataset. Ogni dataset ha metadati e una politica di accesso. La scoperta è condivisa; l’estratto riservato esce solo se il proprietario approva, e si chiude se revoca.

L’interfaccia è in italiano. Il catalogo legge e scrive MongoDB (niente file e niente memoria come archivio).

## Avvio

Serve un MongoDB in ascolto. Esempio in locale, senza systemd:

```bash
mkdir -p data/mongo
mongod --dbpath data/mongo --bind_ip 127.0.0.1 --port 27001 --fork --logpath data/mongod.log
npm install
npm start
```

Apri http://127.0.0.1:3000

All’avvio, se il catalogo è vuoto, viene inserito il seme. `npm run seed` lo riscrive da zero.

Variabili:

- `MONGODB_URI` — default `mongodb://127.0.0.1:27001`
- `MONGODB_DB` — default `nato_catalog`
- `PORT` — default `3000`

Un solo processo, query brevi, un mongod locale: il pool è volutamente piccolo (`maxPoolSize` 10, `minPoolSize` 1). Vedi `server/db.js`.

## Storia

La Germania pubblica «Contatti della rete sensori nel Baltico meridionale», prodotto riservato. I Paesi Bassi lo scoprono, leggono i metadati, chiedono accesso. La Germania approva. I Paesi Bassi usano l’estratto nella pagina di uso (mappa e tabella). Il bollettino meteo tedesco è aperto e si usa senza richiesta.

In alto, «Operi come» cambia la nazione. Il percorso è anche nel riquadro «Dalla Germania ai Paesi Bassi». «Ripristina i dati dimostrativi» cancella le richieste e rimette il seme.

## Modello

Quattro collezioni, con validazione JSON Schema:

- `fornitori` — profilo della nazione e dichiarazione di sovranità
- `prodotti` — titolo, dominio, metadati e politica di accesso nello stesso documento, perché la scheda li mostra insieme. Il nome del fornitore è copiato sul prodotto
- `estratti` — i record, uno per prodotto, in una collezione a parte: la scoperta non deve leggerli e il server li consegna solo dopo il controllo della politica
- `richiesteAccesso` — richieste illimitate, con stato proprio (in attesa, approvata, respinta, revocata). Titolo e nomi sono copiati sulla richiesta per le code

Indici: prodotti per fornitore; richieste per proprietario e stato; richieste per richiedente e prodotto.

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

