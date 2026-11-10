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
    throw new ErroreHttp(400, 'Select the nation you are acting as.');
  }
  const fornitore = await db.collection('fornitori').findOne(
    { _id: codice },
    { projection: { _id: 1, nome: 1, bandiera: 1 } },
  );
  if (!fornitore) {
    throw new ErroreHttp(400, 'Unknown nation.');
  }
  return fornitore;
}

export function pubblicaCondivisione(condivisione) {
  if (!condivisione) return null;
  return {
    id: condivisione._id,
    prodottoId: condivisione.prodottoId,
    titoloProdotto: condivisione.titoloProdotto,
    proprietarioId: condivisione.proprietarioId,
    nomeProprietario: condivisione.nomeProprietario,
    destinatarioId: condivisione.destinatarioId,
    nomeDestinatario: condivisione.nomeDestinatario,
    condivisoIl: condivisione.condivisoIl.toISOString(),
  };
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
    return { consentito: false, motivo: 'missing-actor', richiesta: null };
  }
  if (prodotto.politicaAccesso.livello === 'open') {
    return { consentito: true, motivo: 'open', richiesta: null };
  }
  if (attore._id === prodotto.fornitoreId) {
    return { consentito: true, motivo: 'owner', richiesta: null };
  }
  const approvata = await db.collection('richiesteAccesso').findOne({
    richiedenteId: attore._id,
    prodottoId: prodotto._id,
    stato: 'approved',
  });
  if (approvata) {
    return { consentito: true, motivo: 'grant', richiesta: pubblicaRichiesta(approvata) };
  }
  const condivisa = await db.collection('condivisioni').findOne({
    destinatarioId: attore._id,
    prodottoId: prodotto._id,
  });
  if (condivisa) {
    const ultimaCondivisa = await ultimaRichiesta(db, attore._id, prodotto._id);
    return {
      consentito: true,
      motivo: 'share',
      richiesta: pubblicaRichiesta(ultimaCondivisa),
      condivisione: pubblicaCondivisione(condivisa),
    };
  }
  const ultima = await ultimaRichiesta(db, attore._id, prodotto._id);
  return {
    consentito: false,
    motivo: ultima ? ultima.stato : 'no-request',
    richiesta: pubblicaRichiesta(ultima),
  };
}

export function idRichiesta(valore) {
  if (!ObjectId.isValid(valore)) {
    throw new ErroreHttp(400, 'The request identifier is not valid.');
  }
  return new ObjectId(valore);
}
