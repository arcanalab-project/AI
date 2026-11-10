// Model (what is shown together is stored together).
//
// fornitori — the nation is a provider, not a product.
// prodotti — a provider publishes many. Metadata and the access policy are
//   1:1 with the product and always open on the same dossier: they live on
//   the same document. The provider’s name is copied onto the product
//   (an extended reference) so a list does not need a join.
// estratti — 1:1 with the product, but in another collection: an access
//   boundary, not a discovery field. The public dossier does not read it.
// richiesteAccesso — they grow without a ceiling and change state on their
//   own (approve, deny, revoke). They are not nested in the product.
//   Title and names are copied onto the request for the incoming and outgoing queues.

async function ensureCollection(db, name, jsonSchema) {
  const exists = (await db.listCollections({ name }).toArray()).length > 0;
  const options = {
    validator: { $jsonSchema: jsonSchema },
    validationLevel: 'strict',
    validationAction: 'error',
  };
  if (!exists) {
    await db.createCollection(name, options);
    return;
  }
  await db.command({ collMod: name, ...options });
}

const stringa = { bsonType: 'string', minLength: 1, maxLength: 400 };
const testo = { bsonType: 'string', minLength: 1, maxLength: 2000 };

const fornitoreSchema = {
  bsonType: 'object',
  required: ['_id', 'schemaVersion', 'codice', 'nome', 'bandiera', 'profilo', 'sovranita'],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'string', minLength: 3, maxLength: 3 },
    schemaVersion: { bsonType: 'int', minimum: 1 },
    codice: { bsonType: 'string', minLength: 3, maxLength: 3 },
    nome: stringa,
    bandiera: stringa,
    profilo: {
      bsonType: 'object',
      required: ['nomeUfficiale', 'capitale', 'sintesi', 'ufficioDati', 'email'],
      additionalProperties: false,
      properties: {
        nomeUfficiale: stringa,
        capitale: stringa,
        sintesi: testo,
        ufficioDati: stringa,
        email: { bsonType: 'string', minLength: 3, maxLength: 120 },
      },
    },
    sovranita: {
      bsonType: 'object',
      required: ['dichiarazione', 'giurisdizione'],
      additionalProperties: false,
      properties: {
        dichiarazione: testo,
        giurisdizione: { bsonType: 'string', minLength: 2, maxLength: 2 },
      },
    },
  },
};

const prodottoSchema = {
  bsonType: 'object',
  required: [
    '_id',
    'schemaVersion',
    'fornitoreId',
    'fornitore',
    'titolo',
    'sintesi',
    'dominio',
    'metadati',
    'politicaAccesso',
    'pubblicatoIl',
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'string', minLength: 3, maxLength: 80 },
    schemaVersion: { bsonType: 'int', minimum: 1 },
    fornitoreId: { bsonType: 'string', minLength: 3, maxLength: 3 },
    fornitore: {
      bsonType: 'object',
      required: ['codice', 'nome', 'bandiera'],
      additionalProperties: false,
      properties: {
        codice: { bsonType: 'string', minLength: 3, maxLength: 3 },
        nome: stringa,
        bandiera: stringa,
      },
    },
    titolo: stringa,
    sintesi: testo,
    dominio: stringa,
    tipo: { enum: ['dataset', 'drone'] },
    metadati: {
      bsonType: 'object',
      required: [
        'formato',
        'frequenzaAggiornamento',
        'coperturaSpaziale',
        'inizioTemporale',
        'lingua',
        'responsabile',
        'qualita',
        'campi',
      ],
      additionalProperties: false,
      properties: {
        formato: stringa,
        frequenzaAggiornamento: stringa,
        coperturaSpaziale: testo,
        inizioTemporale: { bsonType: 'string', minLength: 10, maxLength: 10 },
        fineTemporale: { bsonType: ['string', 'null'], maxLength: 10 },
        lingua: { bsonType: 'string', minLength: 2, maxLength: 12 },
        responsabile: stringa,
        qualita: testo,
        campi: {
          bsonType: 'array',
          minItems: 2,
          maxItems: 12,
          items: {
            bsonType: 'object',
            required: ['nome', 'descrizione'],
            additionalProperties: false,
            properties: {
              nome: stringa,
              descrizione: testo,
              unita: { bsonType: 'string', maxLength: 40 },
            },
          },
        },
      },
    },
    politicaAccesso: {
      bsonType: 'object',
      required: [
        'livello',
        'ilProprietarioDecide',
        'finalitaAmmesse',
        'ridistribuzione',
        'conservazione',
        'condizioni',
      ],
      additionalProperties: false,
      properties: {
        livello: { enum: ['open', 'restricted'] },
        ilProprietarioDecide: { bsonType: 'bool' },
        finalitaAmmesse: {
          bsonType: 'array',
          minItems: 1,
          maxItems: 6,
          items: stringa,
        },
        ridistribuzione: testo,
        conservazione: testo,
        condizioni: testo,
      },
    },
    pubblicatoIl: { bsonType: 'date' },
  },
};

const estrattoSchema = {
  bsonType: 'object',
  required: ['_id', 'schemaVersion', 'prodottoId', 'descrizione', 'vista', 'record'],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'string', minLength: 3, maxLength: 80 },
    schemaVersion: { bsonType: 'int', minimum: 1 },
    prodottoId: { bsonType: 'string', minLength: 3, maxLength: 80 },
    descrizione: testo,
    vista: { enum: ['map', 'table'] },
    record: {
      bsonType: 'array',
      minItems: 1,
      maxItems: 40,
      items: { bsonType: 'object' },
    },
  },
};

const richiestaSchema = {
  bsonType: 'object',
  required: [
    'schemaVersion',
    'prodottoId',
    'titoloProdotto',
    'proprietarioId',
    'nomeProprietario',
    'richiedenteId',
    'nomeRichiedente',
    'finalita',
    'stato',
    'richiestaIl',
    'decisione',
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'objectId' },
    schemaVersion: { bsonType: 'int', minimum: 1 },
    prodottoId: { bsonType: 'string', minLength: 3, maxLength: 80 },
    titoloProdotto: stringa,
    proprietarioId: { bsonType: 'string', minLength: 3, maxLength: 3 },
    nomeProprietario: stringa,
    richiedenteId: { bsonType: 'string', minLength: 3, maxLength: 3 },
    nomeRichiedente: stringa,
    finalita: { bsonType: 'string', minLength: 12, maxLength: 500 },
    stato: { enum: ['pending', 'approved', 'denied', 'revoked'] },
    richiestaIl: { bsonType: 'date' },
    decisione: {
      bsonType: ['object', 'null'],
      required: ['il', 'da', 'nota'],
      additionalProperties: false,
      properties: {
        il: { bsonType: 'date' },
        da: { bsonType: 'string', minLength: 3, maxLength: 3 },
        nota: { bsonType: 'string', maxLength: 500 },
      },
    },
  },
};

const numero = { bsonType: 'number' };
const istante = { bsonType: 'string', minLength: 10, maxLength: 40 };

const posizioneSchema = {
  bsonType: 'object',
  required: ['x', 'y', 'z', 'coordinateSystem', 'datum'],
  additionalProperties: false,
  properties: {
    x: numero,
    y: numero,
    z: numero,
    coordinateSystem: { bsonType: 'string' },
    datum: { bsonType: 'string' },
  },
};

const rilevamentoSchema = {
  bsonType: 'object',
  required: ['objectId', 'reportId', 'classificationPath', 'location', 'confidence', 'sourceNodeId', 'sourceName', 'updatedAt'],
  additionalProperties: false,
  properties: {
    objectId: stringa,
    reportId: stringa,
    classificationPath: { bsonType: 'array', minItems: 1, maxItems: 6, items: stringa },
    location: posizioneSchema,
    confidence: { bsonType: 'number', minimum: 0, maximum: 1 },
    sourceNodeId: stringa,
    sourceName: stringa,
    updatedAt: istante,
  },
};

const droneSchema = {
  bsonType: 'object',
  required: [
    '_id',
    'prodottoId',
    'eventCount',
    'flight',
    'mission',
    'payload',
    'platform',
    'propulsion',
    'sourceFormats',
    'sourceMap',
    'sourceState',
    'synthetic',
    'updatedAt',
    'lastEventId',
    'lastMessageType',
    'lastSource',
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'string', minLength: 3, maxLength: 8 },
    prodottoId: { bsonType: 'string', minLength: 3, maxLength: 80 },
    eventCount: { bsonType: 'number', minimum: 0 },
    flight: {
      bsonType: 'object',
      required: ['position', 'groundSpeedMps', 'headingDeg', 'verticalSpeedMps', 'batteryPct', 'mode', 'updatedAt'],
      additionalProperties: false,
      properties: {
        position: posizioneSchema,
        groundSpeedMps: numero,
        headingDeg: numero,
        verticalSpeedMps: numero,
        batteryPct: numero,
        mode: stringa,
        updatedAt: istante,
      },
    },
    mission: {
      bsonType: 'object',
      required: ['missionId', 'name', 'status'],
      additionalProperties: false,
      properties: {
        missionId: stringa,
        name: stringa,
        status: stringa,
      },
    },
    payload: {
      bsonType: 'object',
      required: ['thermal', 'groundDetections', 'lastDetection'],
      additionalProperties: false,
      properties: {
        thermal: {
          bsonType: 'object',
          required: ['ambientC', 'groundSurfaceC', 'humidityPct', 'updatedAt'],
          additionalProperties: false,
          properties: {
            ambientC: numero,
            groundSurfaceC: numero,
            humidityPct: numero,
            updatedAt: istante,
          },
        },
        groundDetections: {
          bsonType: 'array',
          minItems: 1,
          maxItems: 12,
          items: rilevamentoSchema,
        },
        lastDetection: rilevamentoSchema,
      },
    },
    platform: {
      bsonType: 'object',
      required: ['type', 'callsign'],
      additionalProperties: false,
      properties: {
        type: stringa,
        callsign: stringa,
      },
    },
    propulsion: {
      bsonType: 'object',
      required: ['motorRpm', 'motorTemperatureC', 'vibrationMmS', 'health', 'updatedAt'],
      additionalProperties: false,
      properties: {
        motorRpm: numero,
        motorTemperatureC: numero,
        vibrationMmS: numero,
        health: stringa,
        updatedAt: istante,
      },
    },
    sourceFormats: { bsonType: 'array', minItems: 1, maxItems: 6, items: stringa },
    sourceMap: {
      bsonType: 'object',
      minProperties: 1,
      additionalProperties: {
        bsonType: 'object',
        required: ['source', 'platformId'],
        additionalProperties: false,
        properties: {
          source: stringa,
          platformId: stringa,
        },
      },
    },
    sourceState: {
      bsonType: 'object',
      required: ['flight', 'engine', 'detection', 'thermal'],
      additionalProperties: false,
      properties: {
        flight: { bsonType: 'object' },
        engine: { bsonType: 'object' },
        detection: { bsonType: 'object' },
        thermal: { bsonType: 'object' },
      },
    },
    synthetic: { bsonType: 'bool' },
    updatedAt: istante,
    lastEventId: stringa,
    lastMessageType: stringa,
    lastSource: stringa,
  },
};

const condivisioneSchema = {
  bsonType: 'object',
  required: [
    '_id',
    'schemaVersion',
    'prodottoId',
    'titoloProdotto',
    'proprietarioId',
    'nomeProprietario',
    'destinatarioId',
    'nomeDestinatario',
    'condivisoIl',
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'string', minLength: 3, maxLength: 90 },
    schemaVersion: { bsonType: 'int', minimum: 1 },
    prodottoId: { bsonType: 'string', minLength: 3, maxLength: 80 },
    titoloProdotto: stringa,
    proprietarioId: { bsonType: 'string', minLength: 3, maxLength: 3 },
    nomeProprietario: stringa,
    destinatarioId: { bsonType: 'string', minLength: 3, maxLength: 3 },
    nomeDestinatario: stringa,
    condivisoIl: { bsonType: 'date' },
  },
};

export async function ensureSchema(db) {
  await ensureCollection(db, 'fornitori', fornitoreSchema);
  await ensureCollection(db, 'prodotti', prodottoSchema);
  await ensureCollection(db, 'estratti', estrattoSchema);
  await ensureCollection(db, 'richiesteAccesso', richiestaSchema);
  await ensureCollection(db, 'droni', droneSchema);
  await ensureCollection(db, 'condivisioni', condivisioneSchema);

  // Indexes match the real queries: nation dossier, owner queue, and the
  // request history of a requester/product pair. No overlapping indexes
  // added only "just in case".
  await db.collection('prodotti').createIndex({ fornitoreId: 1 }, { name: 'fornitoreId' });
  await db.collection('richiesteAccesso').createIndex(
    { proprietarioId: 1, stato: 1, richiestaIl: -1 },
    { name: 'proprietario_stato_data' },
  );
  await db.collection('richiesteAccesso').createIndex(
    { richiedenteId: 1, prodottoId: 1, richiestaIl: -1 },
    { name: 'richiedente_prodotto_data' },
  );
  await db.collection('droni').createIndex({ prodottoId: 1 }, { unique: true, name: 'prodottoId' });
  await db.collection('condivisioni').createIndex(
    { destinatarioId: 1, prodottoId: 1 },
    { unique: true, name: 'destinatario_prodotto' },
  );
}
