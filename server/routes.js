import { Router } from 'express';
import { Int32 } from 'mongodb';
import { getDb } from './db.js';
import { ripristinaSeme } from './seed.js';
import { STORIA } from './seed-data.js';
import {
  ErroreHttp,
  idRichiesta,
  leggiAttore,
  pubblicaCondivisione,
  pubblicaRichiesta,
  statoAccesso,
  ultimaRichiesta,
} from './access.js';
import { pubblicaDrone } from './drone.js';

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
    tipo: prodotto.tipo || 'dataset',
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
            $sum: { $cond: [{ $eq: ['$politicaAccesso.livello', 'open'] }, 1, 0] },
          },
          riservati: {
            $sum: { $cond: [{ $eq: ['$politicaAccesso.livello', 'restricted'] }, 1, 0] },
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
  fornitori.sort((a, b) => a.nome.localeCompare(b.nome, 'en'));
  res.json({
    fornitori: fornitori.map((fornitore) => pubblicaFornitore(fornitore, conteggi.get(fornitore.codice))),
  });
}));

api.get('/fornitori/:codice', wrap(async (req, res) => {
  const db = getDb();
  const codice = String(req.params.codice || '').toUpperCase();
  const fornitore = await db.collection('fornitori').findOne({ _id: codice });
  if (!fornitore) throw new ErroreHttp(404, 'Nation not found.');
  const prodotti = await db.collection('prodotti').find({ fornitoreId: codice }).toArray();
  prodotti.sort((a, b) => a.titolo.localeCompare(b.titolo, 'en'));
  const aperti = prodotti.filter((prodotto) => prodotto.politicaAccesso.livello === 'open').length;
  const idPubblicati = prodotti.map((prodotto) => prodotto._id);
  const [droni, ricevute, uscite] = await Promise.all([
    db.collection('droni').find({ prodottoId: { $in: idPubblicati } }).toArray(),
    db.collection('condivisioni').find({ destinatarioId: codice }).toArray(),
    db.collection('condivisioni').find({ proprietarioId: codice }).toArray(),
  ]);
  const idRicevuti = ricevute.map((voce) => voce.prodottoId);
  const [prodottiRicevuti, droniRicevuti] = await Promise.all([
    idRicevuti.length
      ? db.collection('prodotti').find({ _id: { $in: idRicevuti } }).toArray()
      : [],
    idRicevuti.length
      ? db.collection('droni').find({ prodottoId: { $in: idRicevuti } }).toArray()
      : [],
  ]);
  const perProdotto = new Map(prodottiRicevuti.map((prodotto) => [prodotto._id, prodotto]));
  const dronePerProdotto = new Map(droniRicevuti.map((drone) => [drone.prodottoId, drone]));
  res.json({
    fornitore: pubblicaFornitore(fornitore, {
      totale: prodotti.length,
      aperti,
      riservati: prodotti.length - aperti,
    }),
    prodotti: prodotti.map(pubblicaProdottoBreve),
    droni: droni.map(pubblicaDrone),
    uscite: uscite.map(pubblicaCondivisione),
    ricevuti: ricevute.map((voce) => {
      const prodotto = perProdotto.get(voce.prodottoId);
      const drone = dronePerProdotto.get(voce.prodottoId);
      return {
        condivisione: pubblicaCondivisione(voce),
        prodotto: prodotto ? pubblicaProdottoBreve(prodotto) : null,
        drone: drone ? pubblicaDrone(drone) : null,
      };
    }).filter((voce) => voce.prodotto),
  });
}));

api.get('/prodotti', wrap(async (req, res) => {
  const db = getDb();
  const prodotti = await db.collection('prodotti').find().toArray();
  prodotti.sort((a, b) => a.fornitore.nome.localeCompare(b.fornitore.nome, 'en')
    || a.titolo.localeCompare(b.titolo, 'en'));
  res.json({ prodotti: prodotti.map(pubblicaProdottoBreve) });
}));

api.get('/droni/:id', wrap(async (req, res) => {
  const db = getDb();
  const drone = await db.collection('droni').findOne({ prodottoId: req.params.id });
  if (!drone) throw new ErroreHttp(404, 'Drone feed not found.');
  const prodotto = await db.collection('prodotti').findOne({ _id: drone.prodottoId });
  res.json({
    drone: pubblicaDrone(drone),
    prodotto: prodotto ? pubblicaProdottoBreve(prodotto) : null,
  });
}));

api.get('/storia', wrap(async (req, res) => {
  const db = getDb();
  const [prodotto, richiedente] = await Promise.all([
    db.collection('prodotti').findOne({ _id: STORIA.prodottoId }),
    db.collection('fornitori').findOne({ _id: STORIA.richiedenteId }),
  ]);
  if (!prodotto || !richiedente) {
    throw new ErroreHttp(404, 'The story product is not in the catalog.');
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
  const attore = await leggiAttore(db, req, { obbligatorio: false });
  const prodotto = await db.collection('prodotti').findOne({ _id: req.params.id });
  if (!prodotto) throw new ErroreHttp(404, 'Product not found.');
  const accesso = await statoAccesso(db, prodotto, attore);
  if (!accesso.consentito) {
    res.status(403).json({
      errore: 'Extract not released. The dataset is restricted and the owner has no active grant.',
      prodotto: pubblicaProdottoBreve(prodotto),
      accesso,
    });
    return;
  }
  const drone = await db.collection('droni').findOne({ prodottoId: prodotto._id });
  if (drone) {
    res.json({
      prodotto: pubblicaProdottoBreve(prodotto),
      accesso,
      drone: pubblicaDrone(drone),
    });
    return;
  }
  const estratto = await db.collection('estratti').findOne({ _id: prodotto._id });
  if (!estratto) throw new ErroreHttp(404, 'Extract not found.');
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
  if (!prodotto) throw new ErroreHttp(404, 'Product not found.');
  const attore = await leggiAttore(db, req, { obbligatorio: false });
  const accesso = await statoAccesso(db, prodotto, attore);
  const condivisioni = await db.collection('condivisioni').find({ prodottoId: prodotto._id }).toArray();
  res.json({
    prodotto: pubblicaProdotto(prodotto),
    accesso,
    condivisioni: condivisioni.map(pubblicaCondivisione),
  });
}));

api.post('/prodotti/:id/condivisioni', wrap(async (req, res) => {
  const db = getDb();
  const prodotto = await db.collection('prodotti').findOne({ _id: req.params.id });
  if (!prodotto) throw new ErroreHttp(404, 'Product not found.');
  const destinatarioId = String(req.body?.destinatarioId || '').trim().toUpperCase();
  const destinatario = await db.collection('fornitori').findOne({ _id: destinatarioId });
  if (!destinatario) throw new ErroreHttp(400, 'Choose a recipient country.');
  if (destinatario._id === prodotto.fornitoreId) {
    throw new ErroreHttp(400, 'The publisher already holds this product. Choose another country.');
  }
  const _id = `${prodotto._id}:${destinatario._id}`;
  const esistente = await db.collection('condivisioni').findOne({ _id });
  if (esistente) {
    res.json({
      condivisione: pubblicaCondivisione(esistente),
      giaPresente: true,
    });
    return;
  }
  const documento = {
    _id,
    schemaVersion: new Int32(1),
    prodottoId: prodotto._id,
    titoloProdotto: prodotto.titolo,
    proprietarioId: prodotto.fornitoreId,
    nomeProprietario: prodotto.fornitore.nome,
    destinatarioId: destinatario._id,
    nomeDestinatario: destinatario.nome,
    condivisoIl: new Date(),
  };
  await db.collection('condivisioni').insertOne(documento);
  res.status(201).json({ condivisione: pubblicaCondivisione(documento) });
}));

api.post('/prodotti/:id/richieste', wrap(async (req, res) => {
  const db = getDb();
  const attore = await leggiAttore(db, req);
  const prodotto = await db.collection('prodotti').findOne({ _id: req.params.id });
  if (!prodotto) throw new ErroreHttp(404, 'Product not found.');
  if (prodotto.politicaAccesso.livello === 'open') {
    throw new ErroreHttp(400, 'This dataset is open: use it directly, with no request.');
  }
  if (attore._id === prodotto.fornitoreId) {
    throw new ErroreHttp(400, 'The owner does not request access to their own product.');
  }
  const finalita = String(req.body?.finalita || '').trim();
  if (finalita.length < 12 || finalita.length > 500) {
    throw new ErroreHttp(400, 'Describe the purpose clearly, in 12 to 500 characters.');
  }
  const attiva = await db.collection('richiesteAccesso').findOne({
    richiedenteId: attore._id,
    prodottoId: prodotto._id,
    stato: { $in: ['pending', 'approved'] },
  });
  if (attiva) {
    const testo = attiva.stato === 'approved'
      ? 'You already have an active grant for this product.'
      : 'A request is already waiting for a decision.';
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
    stato: 'pending',
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
  if (!['approved', 'denied', 'revoked'].includes(esito)) {
    throw new ErroreHttp(400, 'That decision is not valid.');
  }
  if ((esito === 'denied' || esito === 'revoked') && nota.length < 8) {
    throw new ErroreHttp(400, 'Write a note of at least 8 characters: the requesting nation needs to know why.');
  }
  if (nota.length > 500) {
    throw new ErroreHttp(400, 'The note is longer than 500 characters.');
  }
  const _id = idRichiesta(req.params.id);
  const richiesta = await db.collection('richiesteAccesso').findOne({ _id });
  if (!richiesta) throw new ErroreHttp(404, 'Request not found.');
  if (richiesta.proprietarioId !== attore._id) {
    throw new ErroreHttp(403, 'Only the owning nation can decide this request.');
  }
  const consentite = {
    pending: ['approved', 'denied'],
    approved: ['revoked'],
  };
  if (!consentite[richiesta.stato]?.includes(esito)) {
    throw new ErroreHttp(409, 'This request can no longer receive that decision.');
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
  res.status(404).json({ errore: 'Resource not found.' });
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
    res.status(400).json({ errore: 'The document does not match the catalog schema.' });
    return;
  }
  console.error(err);
  res.status(500).json({ errore: 'Catalog error.' });
});
