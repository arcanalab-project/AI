import { ObjectId } from 'mongodb';

export class ErroreHttp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function leggiAttore(db, req, { obbligatorio = true } = {}) {
  const codice = String(req.get('x-actor-code') || '').trim().toUpperCase();
  if (!codice) {
    if (!obbligatorio) return null;
    throw new ErroreHttp(400, 'Seleziona la nazione con cui operi.');
  }
  const fornitore = await db.collection('fornitori').findOne(
    { _id: codice },
    { projection: { _id: 1, nome: 1, bandiera: 1 } },
  );
  if (!fornitore) {
    throw new ErroreHttp(400, 'Nazione sconosciuta.');
  }
  return fornitore;
}

export function pubblicaRichiesta(richiesta) {
  if (!richiesta) return null;
  return {
    id: richiesta._id.toString(),
    prodottoId: richiesta.prodottoId,
    titoloProdotto: richiesta.titoloProdotto,
    proprietarioId: richiesta.proprietarioId,
    nomeProprietario: richiesta.nomeProprietario,
    richiedenteId: richiesta.richiedenteId,
    nomeRichiedente: richiesta.nomeRichiedente,
    finalita: richiesta.finalita,
    stato: richiesta.stato,
    richiestaIl: richiesta.richiestaIl.toISOString(),
    decisione: richiesta.decisione
      ? {
          il: richiesta.decisione.il.toISOString(),
          da: richiesta.decisione.da,
          nota: richiesta.decisione.nota || '',
        }
      : null,
  };
}

export async function ultimaRichiesta(db, richiedenteId, prodottoId) {
  return db.collection('richiesteAccesso').find(
    { richiedenteId, prodottoId },
  ).sort({ richiestaIl: -1 }).limit(1).next();
}

export async function statoAccesso(db, prodotto, attore) {
  if (!attore) {
    return { consentito: false, motivo: 'attore-mancante', richiesta: null };
  }
  if (prodotto.politicaAccesso.livello === 'aperto') {
    return { consentito: true, motivo: 'aperto', richiesta: null };
  }
  if (attore._id === prodotto.fornitoreId) {
    return { consentito: true, motivo: 'proprietario', richiesta: null };
  }
  const approvata = await db.collection('richiesteAccesso').findOne({
    richiedenteId: attore._id,
    prodottoId: prodotto._id,
    stato: 'approvata',
  });
  if (approvata) {
    return { consentito: true, motivo: 'concessione', richiesta: pubblicaRichiesta(approvata) };
  }
  const ultima = await ultimaRichiesta(db, attore._id, prodotto._id);
  return {
    consentito: false,
    motivo: ultima ? ultima.stato : 'nessuna-richiesta',
    richiesta: pubblicaRichiesta(ultima),
  };
}

export function idRichiesta(valore) {
  if (!ObjectId.isValid(valore)) {
    throw new ErroreHttp(400, 'Identificativo della richiesta non valido.');
  }
  return new ObjectId(valore);
}
