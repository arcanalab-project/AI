export type Scene = {
  id: number;
  title: string;
  question: string;
  action: string;
  conclusion: string;
  solution: string;
  pdfPages: string;
};

export const SCENES: Scene[] = [
  {
    id: 1,
    title: "Una persona, una schermata",
    question: "Quali dati servono per costruire questa schermata?",
    action: "Clicca i campi del profilo: emergono uno alla volta, con nome e tipo.",
    conclusion: "Una schermata “semplice” è già un aggregato: identità, foto, interessi, città.",
    solution:
      "Al minimo: id, nome, genere (incluso non specificato), nascita+età, altezza, città, foto, interessi. Poi i facoltativi: costituzione, professione, formazione, bio.",
    pdfPages: "pp. 3–5",
  },
  {
    id: 2,
    title: "Mettiamola nelle tabelle",
    question: "Perché non basta una sola tabella users?",
    action: "Osserva PK, FK e cardinalità. Confronta 1:1 (settings) e 1:N (foto, interessi).",
    conclusion: "Il modello relazionale normalizza. Non è l’unico modo di usare un RDBMS: è un modello esplicito per questa lezione.",
    solution:
      "users (1) → user_photos (N), user_interests (N), user_settings (1), user_gender_preferences (N), subscriptions (N). La tabella extra dei generi evita un CSV e rende la preferenza multi-valore interrogabile.",
    pdfPages: "pp. 6–8",
  },
  {
    id: 3,
    title: "Arrivano le preferenze",
    question: "Cosa appartiene al profilo e cosa alle impostazioni?",
    action: "Modifica distanza, fascia di età, notifiche e visibilità. Il profilo al centro resta la stessa persona.",
    conclusion: "Le preferenze guidano la discovery; non sono attributi anagrafici.",
    solution:
      "Profilo = chi è. Settings = come vuole essere trovata e chi cerca. In SQL vivono in user_settings (1:1) + user_gender_preferences (1:N).",
    pdfPages: "pp. 6–8",
  },
  {
    id: 4,
    title: "Arriva l’abbonamento",
    question: "Un utente ha un piano. È lo stesso che avere una storia di pagamenti?",
    action: "Cambia piano, stato di pagamento, date e rinnovo. In lezione mostriamo un solo abbonamento corrente.",
    conclusion: "Corrente e storico hanno bisogni diversi: lo storico cresce, il corrente si legge con il profilo.",
    solution:
      "Tabella subscriptions con is_current. Lo storico resta in righe; MongoDB incorporerà solo il corrente nel documento user.",
    pdfPages: "pp. 6–8",
  },
  {
    id: 5,
    title: "Ricomponi la persona",
    question: "Come recupero tutta la persona con una query, senza esplosione cartesiana?",
    action: "Esegui la SQL reale. Confronta il risultato tabellare con l’oggetto UI.",
    conclusion: "JOIN su collezioni 1:N moltiplicano le righe. Foto × interessi non devono esplodere.",
    solution:
      "Un JOIN users ⋈ photos ⋈ interests produce un prodotto cartesiano. Qui usiamo subquery con json_group_array (equivalente a json_agg in PostgreSQL) così il motore restituisce una riga per persona.",
    pdfPages: "p. 9",
  },
  {
    id: 6,
    title: "Modella la persona come documento",
    question: "Se i dati si leggono insieme, perché non salvarli insieme?",
    action: "Anima le righe verso oggetti e array nidificati, poi leggi il documento MongoDB reale.",
    conclusion: "Il documento ricalca l’oggetto applicazione. Una lettura, la stessa forma della UI.",
    solution:
      "findOne su bootcamp_users. Foto e interessi sono array limitati; settings e subscription corrente sono oggetti nidificati. GeoJSON: coordinates = [longitudine, latitudine].",
    pdfPages: "pp. 10–12",
  },
  {
    id: 7,
    title: "Il prodotto cambia",
    question: "Hobby, pronomi, profilo organizzatore: cosa succede ai due modelli?",
    action: "Tre pulsanti. Guarda before/after. Alcuni documenti restano senza i nuovi campi.",
    conclusion: "MongoDB è flessibile, non magico: serve design, validazione e UI che tollera i campi assenti. Anche in SQL una ALTER non implica sempre un downtime.",
    solution:
      "SQL: CREATE TABLE / ALTER TABLE. MongoDB: nuovi campi opzionali su alcuni doc. L’app deve gestire assenza di hobbies/pronouns. Aggiungere una feature tocca frontend e backend in entrambi gli approcci.",
    pdfPages: "pp. 13–20",
  },
  {
    id: 8,
    title: "Quando incorporare e quando referenziare",
    question: "Perché settings sì e i messaggi no?",
    action: "Tre domande lampo. Rivela la soluzione dopo la discussione in aula.",
    conclusion: "Si incorpora ciò che è limitato e si legge con il profilo. Si referenzia ciò che cresce senza bound o ha ciclo di vita proprio.",
    solution:
      "1) Settings e abbonamento corrente: 1:1 / 1:current, si leggono con la card. 2) Messaggi, like, storico eventi: unbounded → collection dedicate. 3) Atomicità del documento non si estende in automatico a like+match multi-documento; servono unicità e operazioni idempotenti. Evitare JOIN su questo aggregato ≠ MongoDB non sa fare relazioni o $lookup.",
    pdfPages: "pp. 15–20 + data modeling",
  },
];
