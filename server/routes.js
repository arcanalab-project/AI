import { Router } from 'express';
import { Int32 } from 'mongodb';
import { getDb } from './db.js';
import { ripristinaSeme } from './seed.js';
import { STORIA } from './seed-data.js';
import {
  ErroreHttp,
  idRichiesta,
  leggiAttore,
  pubblicaRichiesta,
  statoAccesso,
  ultimaRichiesta,
} from './access.js';

export const api = Router();

api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function pubblicaFornitore(fornitore, conteggi) {
  return {
    codice: fornitore.codice,
    nome: fornitore.nome,
    bandiera: fornitore.bandiera,
    profilo: fornitore.profilo,
    sovranita: fornitore.sovranita,
    conteggi: conteggi || { totale: 0, aperti: 0, riservati: 0 },
  };
}

function pubblicaProdottoBreve(prodotto) {
  return {
    id: prodotto._id,
    titolo: prodotto.titolo,
    sintesi: prodotto.sintesi,
    dominio: prodotto.dominio,
    livello: prodotto.politicaAccesso.livello,
    pubblicatoIl: prodotto.pubblicatoIl.toISOString(),
    fornitore: prodotto.fornitore,
  };
}

function pubblicaProdotto(prodotto) {
  return {
    ...pubblicaProdottoBreve(prodotto),
    metadati: prodotto.metadati,
    politicaAccesso: prodotto.politicaAccesso,
  };
}

api.get('/salute', wrap(async (req, res) => {
  const db = getDb();
  await db.command({ ping: 1 });
  res.json({ ok: true, database: db.databaseName });
}));

api.get('/fornitori', wrap(async (req, res) => {
  const db = getDb();
  const [fornitori, gruppi] = await Promise.all([
    db.collection('fornitori').find().toArray(),
    db.collection('prodotti').aggregate([
      {
        $group: {
          _id: '$fornitoreId',
          totale: { $sum: 1 },
          aperti: {
            $sum: { $cond: [{ $eq: ['$politicaAccesso.livello', 'aperto'] }, 1, 0] },
          },
          riservati: {
            $sum: { $cond: [{ $eq: ['$politicaAccesso.livello', 'riservato'] }, 1, 0] },
          },
        },
      },
    ]).toArray(),
  ]);
  const conteggi = new Map(gruppi.map((gruppo) => [gruppo._id, {
    totale: gruppo.totale,
    aperti: gruppo.aperti,
    riservati: gruppo.riservati,
  }]));
  fornitori.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  res.json({
    fornitori: fornitori.map((fornitore) => pubblicaFornitore(fornitore, conteggi.get(fornitore.codice))),
  });
}));

api.get('/fornitori/:codice', wrap(async (req, res) => {
  const db = getDb();
  const codice = String(req.params.codice || '').toUpperCase();
  const fornitore = await db.collection('fornitori').findOne({ _id: codice });
  if (!fornitore) throw new ErroreHttp(404, 'Nazione non trovata.');
  const prodotti = await db.collection('prodotti').find({ fornitoreId: codice }).toArray();
  prodotti.sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  const aperti = prodotti.filter((prodotto) => prodotto.politicaAccesso.livello === 'aperto').length;
  res.json({
    fornitore: pubblicaFornitore(fornitore, {
      totale: prodotti.length,
      aperti,
      riservati: prodotti.length - aperti,
    }),
    prodotti: prodotti.map(pubblicaProdottoBreve),
  });
}));

api.get('/storia', wrap(async (req, res) => {
  const db = getDb();
  const [prodotto, richiedente] = await Promise.all([
    db.collection('prodotti').findOne({ _id: STORIA.prodottoId }),
    db.collection('fornitori').findOne({ _id: STORIA.richiedenteId }),
  ]);
  if (!prodotto || !richiedente) {
    throw new ErroreHttp(404, 'Il prodotto della storia non è nel catalogo.');
  }
  const richiesta = await ultimaRichiesta(db, STORIA.richiedenteId, STORIA.prodottoId);
  res.json({
    prodottoId: prodotto._id,
    titolo: prodotto.titolo,
    proprietario: prodotto.fornitore,
    richiedente: {
      codice: richiedente.codice,
      nome: richiedente.nome,
      bandiera: richiedente.bandiera,
    },
    richiesta: pubblicaRichiesta(richiesta),
  });
}));

api.get('/prodotti/:id/uso', wrap(async (req, res) => {
  const db = getDb();
  const attore = await leggiAttore(db, req);
  const prodotto = await db.collection('prodotti').findOne({ _id: req.params.id });
  if (!prodotto) throw new ErroreHttp(404, 'Prodotto non trovato.');
  const accesso = await statoAccesso(db, prodotto, attore);
  if (!accesso.consentito) {
    res.status(403).json({
      errore: 'Estratto non rilasciato. Il dataset è riservato e non c’è una concessione attiva del proprietario.',
      prodotto: pubblicaProdottoBreve(prodotto),
      accesso,
    });
    return;
  }
  const estratto = await db.collection('estratti').findOne({ _id: prodotto._id });
  if (!estratto) throw new ErroreHttp(404, 'Estratto non trovato.');
  res.json({
    prodotto: pubblicaProdottoBreve(prodotto),
    accesso,
    estratto: {
      descrizione: estratto.descrizione,
      vista: estratto.vista,
      record: estratto.record,
    },
  });
}));

api.get('/prodotti/:id', wrap(async (req, res) => {
  const db = getDb();
  const prodotto = await db.collection('prodotti').findOne({ _id: req.params.id });
  if (!prodotto) throw new ErroreHttp(404, 'Prodotto non trovato.');
  const attore = await leggiAttore(db, req, { obbligatorio: false });
  const accesso = await statoAccesso(db, prodotto, attore);
  res.json({ prodotto: pubblicaProdotto(prodotto), accesso });
}));

api.post('/prodotti/:id/richieste', wrap(async (req, res) => {
  const db = getDb();
  const attore = await leggiAttore(db, req);
  const prodotto = await db.collection('prodotti').findOne({ _id: req.params.id });
  if (!prodotto) throw new ErroreHttp(404, 'Prodotto non trovato.');
  if (prodotto.politicaAccesso.livello === 'aperto') {
    throw new ErroreHttp(400, 'Il dataset è aperto: si usa direttamente, senza richiesta.');
  }
  if (attore._id === prodotto.fornitoreId) {
    throw new ErroreHttp(400, 'Il proprietario non chiede accesso a un proprio prodotto.');
  }
  const finalita = String(req.body?.finalita || '').trim();
  if (finalita.length < 12 || finalita.length > 500) {
    throw new ErroreHttp(400, 'Descrivi la finalità in modo chiaro, tra 12 e 500 caratteri.');
  }
  const attiva = await db.collection('richiesteAccesso').findOne({
    richiedenteId: attore._id,
    prodottoId: prodotto._id,
    stato: { $in: ['in_attesa', 'approvata'] },
  });
  if (attiva) {
    const testo = attiva.stato === 'approvata'
      ? 'Hai già una concessione attiva su questo prodotto.'
      : 'C’è già una richiesta in attesa di decisione.';
    throw new ErroreHttp(409, testo);
  }
  const documento = {
    schemaVersion: new Int32(1),
    prodottoId: prodotto._id,
    titoloProdotto: prodotto.titolo,
    proprietarioId: prodotto.fornitoreId,
    nomeProprietario: prodotto.fornitore.nome,
    richiedenteId: attore._id,
    nomeRichiedente: attore.nome,
    finalita,
    stato: 'in_attesa',
    richiestaIl: new Date(),
    decisione: null,
  };
  const inserita = await db.collection('richiesteAccesso').insertOne(documento);
  const salvata = await db.collection('richiesteAccesso').findOne({ _id: inserita.insertedId });
  res.status(201).json({ richiesta: pubblicaRichiesta(salvata) });
}));

api.get('/richieste', wrap(async (req, res) => {
  const db = getDb();
  const attore = await leggiAttore(db, req);
  const [inArrivo, inviate] = await Promise.all([
    db.collection('richiesteAccesso')
      .find({ proprietarioId: attore._id })
      .sort({ richiestaIl: -1 })
      .toArray(),
    db.collection('richiesteAccesso')
      .find({ richiedenteId: attore._id })
      .sort({ richiestaIl: -1 })
      .toArray(),
  ]);
  res.json({
    inArrivo: inArrivo.map(pubblicaRichiesta),
    inviate: inviate.map(pubblicaRichiesta),
  });
}));

api.post('/richieste/:id/decisione', wrap(async (req, res) => {
  const db = getDb();
  const attore = await leggiAttore(db, req);
  const esito = req.body?.esito;
  const nota = String(req.body?.nota || '').trim();
  if (!['approvata', 'respinta', 'revocata'].includes(esito)) {
    throw new ErroreHttp(400, 'La decisione non è valida.');
  }
  if ((esito === 'respinta' || esito === 'revocata') && nota.length < 8) {
    throw new ErroreHttp(400, 'Scrivi una nota di almeno 8 caratteri: chi ha chiesto l’accesso deve sapere perché.');
  }
  if (nota.length > 500) {
    throw new ErroreHttp(400, 'La nota supera i 500 caratteri.');
  }
  const _id = idRichiesta(req.params.id);
  const richiesta = await db.collection('richiesteAccesso').findOne({ _id });
  if (!richiesta) throw new ErroreHttp(404, 'Richiesta non trovata.');
  if (richiesta.proprietarioId !== attore._id) {
    throw new ErroreHttp(403, 'Solo la nazione proprietaria può decidere su questa richiesta.');
  }
  const consentite = {
    in_attesa: ['approvata', 'respinta'],
    approvata: ['revocata'],
  };
  if (!consentite[richiesta.stato]?.includes(esito)) {
    throw new ErroreHttp(409, 'Questa richiesta non può più ricevere quella decisione.');
  }
  await db.collection('richiesteAccesso').updateOne(
    { _id },
    { $set: { stato: esito, decisione: { il: new Date(), da: attore._id, nota } } },
  );
  const aggiornata = await db.collection('richiesteAccesso').findOne({ _id });
  res.json({ richiesta: pubblicaRichiesta(aggiornata) });
}));

api.post('/demo/ripristino', wrap(async (req, res) => {
  await ripristinaSeme(getDb());
  res.json({ ok: true });
}));

api.use((req, res) => {
  res.status(404).json({ errore: 'Risorsa non trovata.' });
});

api.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ErroreHttp || err.status) {
    res.status(err.status).json({ errore: err.message });
    return;
  }
  if (err.code === 121) {
    console.error(JSON.stringify(err.errInfo, null, 2));
    res.status(400).json({ errore: 'Il documento non rispetta lo schema del catalogo.' });
    return;
  }
  console.error(err);
  res.status(500).json({ errore: 'Errore del catalogo.' });
});
