// One tactical-drone document per publishing country. The shape matches the
// canonical sample: a live slice plus a short ground track. eventCount is a
// counter. The document never stores the underlying event history.

const ORIGINE = '2026-11-10T08:19:01.705Z';

const PROFILI = {
  DEU: { x: 575221, y: 4251824, z: 120.8, heading: 45, speed: 17.9, battery: 78, nodo: 'de' },
  FRA: { x: 576480, y: 4252680, z: 132.4, heading: 82, speed: 16.4, battery: 81, nodo: 'fa' },
  ITA: { x: 573960, y: 4251040, z: 109.5, heading: 128, speed: 18.6, battery: 74, nodo: '1a' },
  TUR: { x: 577240, y: 4253520, z: 141.2, heading: 214, speed: 15.8, battery: 83, nodo: '7a' },
};

function arrotonda(valore, cifre = 1) {
  const scala = 10 ** cifre;
  return Math.round(valore * scala) / scala;
}

function limita(valore, minimo, massimo) {
  return Math.min(massimo, Math.max(minimo, valore));
}

function nodi(marca) {
  const coda = `3f02cd87${marca}`;
  return {
    flight: `6f18095c-9702-46d4-a17b-${coda}01`,
    engine: `6f18095c-9702-46d4-a17b-${coda}02`,
    radar: `6f18095c-9702-46d4-a17b-${coda}03`,
    thermal: `6f18095c-9702-46d4-a17b-${coda}04`,
  };
}

function posizione(x, y, z) {
  return {
    x: arrotonda(x, 1),
    y: arrotonda(y, 1),
    z: arrotonda(z, 1),
    coordinateSystem: 'LOCATION_COORDINATE_SYSTEM_UTM_M',
    datum: 'LOCATION_DATUM_WGS84_E',
  };
}

function rilevamento({ callsign, objectId, reportId, x, y, confidence, updatedAt, sourceNodeId }) {
  return {
    objectId,
    reportId,
    classificationPath: ['Land Vehicle', '>2 wheels - Light', 'Commercial'],
    location: posizione(x, y, 0),
    confidence: arrotonda(confidence, 3),
    sourceNodeId,
    sourceName: 'Ground Radar ASM',
    updatedAt,
  };
}

export function documentoDrone({ callsign, prodottoId }) {
  const profilo = PROFILI[callsign];
  if (!profilo) throw new Error(`Unknown drone callsign ${callsign}`);
  const idNodo = nodi(profilo.nodo);
  const objectId = `01J9Z7R3D2J8JQH5XK6M3S8${callsign}`;
  const groundDetections = [];
  for (let indice = 0; indice < 12; indice += 1) {
    groundDetections.push(rilevamento({
      callsign,
      objectId,
      reportId: `${callsign}-TRACK-${String(indice + 1).padStart(2, '0')}`,
      x: profilo.x - 180 + indice * 14,
      y: profilo.y - 70 - indice * 6,
      confidence: 0.84 + (indice % 5) * 0.02,
      updatedAt: ORIGINE,
      sourceNodeId: idNodo.radar,
    }));
  }
  const ultimo = groundDetections[groundDetections.length - 1];
  return {
    _id: callsign,
    prodottoId,
    eventCount: 17178,
    flight: {
      position: posizione(profilo.x, profilo.y, profilo.z),
      groundSpeedMps: profilo.speed,
      headingDeg: profilo.heading,
      verticalSpeedMps: 0.2,
      batteryPct: profilo.battery,
      mode: 'Reconnaissance',
      updatedAt: ORIGINE,
    },
    mission: {
      missionId: `ISR-${callsign}`,
      name: 'Area reconnaissance',
      status: 'ON TASK',
    },
    payload: {
      thermal: {
        ambientC: arrotonda(23.5 + (callsign.charCodeAt(0) % 3) * 0.4),
        groundSurfaceC: arrotonda(33 + (callsign.charCodeAt(2) % 4) * 0.3),
        humidityPct: 46,
        updatedAt: ORIGINE,
      },
      groundDetections,
      lastDetection: {
        ...ultimo,
        reportId: `${callsign}-LAST`,
        confidence: arrotonda(Math.min(0.97, ultimo.confidence + 0.02), 3),
      },
    },
    platform: {
      type: 'UAV Rotary Wing',
      callsign,
    },
    propulsion: {
      motorRpm: 6525,
      motorTemperatureC: 68.5,
      vibrationMmS: 1.8,
      health: 'NOMINAL',
      updatedAt: ORIGINE,
    },
    sourceFormats: ['SAPIENT ICD v7 readable JSON example shape', 'IoT JSON'],
    sourceMap: {
      [idNodo.flight]: { source: 'Flight Status ASM', platformId: callsign },
      [idNodo.engine]: { source: 'Propulsion Status ASM', platformId: callsign },
      [idNodo.radar]: { source: 'Ground Radar ASM', platformId: callsign },
      [idNodo.thermal]: { source: 'Thermal IoT payload', platformId: callsign },
    },
    synthetic: true,
    updatedAt: ORIGINE,
    lastEventId: `${callsign}-EVT-17178`,
    lastMessageType: 'IoT JSON',
    lastSource: 'Thermal IoT payload',
    sourceState: {
      flight: { source: 'Flight Status ASM', format: 'SAPIENT StatusReport', lastEventId: `${callsign}-FLT-17178`, updatedAt: ORIGINE },
      engine: { source: 'Propulsion Status ASM', format: 'SAPIENT StatusReport', lastEventId: `${callsign}-ENG-17178`, updatedAt: ORIGINE },
      detection: { source: 'Ground Radar ASM', format: 'SAPIENT DetectionReport', lastEventId: `${callsign}-DET-17178`, updatedAt: ORIGINE },
      thermal: { source: 'Thermal IoT payload', format: 'IoT JSON', lastEventId: `${callsign}-EVT-17178`, updatedAt: ORIGINE },
    },
  };
}

export function avanzaDrone(drone, istante = new Date()) {
  const iso = istante.toISOString();
  const conteggio = Number(drone.eventCount) + 1;
  const heading = arrotonda((Number(drone.flight.headingDeg) + 3) % 360, 1);
  const speed = arrotonda(limita(Number(drone.flight.groundSpeedMps) + (conteggio % 2 === 0 ? 0.3 : -0.2), 14, 22), 1);
  const rad = (heading * Math.PI) / 180;
  const x = Number(drone.flight.position.x) + Math.sin(rad) * speed * 2;
  const y = Number(drone.flight.position.y) + Math.cos(rad) * speed * 2;
  let z = Number(drone.flight.position.z) + (conteggio % 2 === 0 ? 0.4 : -0.3);
  z = limita(z, 90, 160);
  let battery = arrotonda(Number(drone.flight.batteryPct) - 0.4, 1);
  if (battery < 61) battery = 78;
  const ambient = arrotonda(limita(Number(drone.payload.thermal.ambientC) + (conteggio % 2 === 0 ? 0.1 : -0.1), 18, 32), 1);
  const ground = arrotonda(limita(Number(drone.payload.thermal.groundSurfaceC) + 0.2, 28, 42), 1);
  const humidity = arrotonda(limita(Number(drone.payload.thermal.humidityPct) + (conteggio % 3 === 0 ? 1 : -1), 35, 70), 0);
  const rpm = 6400 + (conteggio % 40) * 10;
  const motor = arrotonda(limita(Number(drone.propulsion.motorTemperatureC) + (conteggio % 2 === 0 ? 0.2 : -0.1), 60, 79), 1);
  const pista = drone.payload.groundDetections.map((punto) => ({
    ...punto,
    location: { ...punto.location },
    classificationPath: [...punto.classificationPath],
  }));
  const precedente = pista[pista.length - 1];
  const objectId = precedente.objectId;
  const successivo = rilevamento({
    callsign: drone.platform.callsign,
    objectId,
    reportId: `${drone.platform.callsign}-TRACK-${conteggio}`,
    x: Number(precedente.location.x) + 14,
    y: Number(precedente.location.y) - 6,
    confidence: limita(Number(precedente.confidence) + (conteggio % 2 === 0 ? 0.01 : -0.01), 0.8, 0.97),
    updatedAt: iso,
    sourceNodeId: precedente.sourceNodeId,
  });
  pista.push(successivo);
  while (pista.length > 12) pista.shift();
  const callsign = drone.platform.callsign;
  return {
    eventCount: conteggio,
    flight: {
      ...drone.flight,
      position: posizione(x, y, z),
      groundSpeedMps: speed,
      headingDeg: heading,
      verticalSpeedMps: arrotonda(conteggio % 2 === 0 ? 0.3 : -0.2, 1),
      batteryPct: battery,
      updatedAt: iso,
    },
    payload: {
      thermal: {
        ambientC: ambient,
        groundSurfaceC: ground,
        humidityPct: humidity,
        updatedAt: iso,
      },
      groundDetections: pista,
      lastDetection: {
        ...successivo,
        reportId: `${callsign}-LAST-${conteggio}`,
        confidence: arrotonda(Math.min(0.97, successivo.confidence + 0.01), 3),
      },
    },
    propulsion: {
      ...drone.propulsion,
      motorRpm: rpm,
      motorTemperatureC: motor,
      vibrationMmS: arrotonda(1.4 + (conteggio % 5) * 0.1, 1),
      health: 'NOMINAL',
      updatedAt: iso,
    },
    updatedAt: iso,
    lastEventId: `${callsign}-EVT-${conteggio}`,
    lastMessageType: 'IoT JSON',
    lastSource: 'Thermal IoT payload',
    sourceState: {
      flight: { ...drone.sourceState.flight, lastEventId: `${callsign}-FLT-${conteggio}`, updatedAt: iso },
      engine: { ...drone.sourceState.engine, lastEventId: `${callsign}-ENG-${conteggio}`, updatedAt: iso },
      detection: { ...drone.sourceState.detection, lastEventId: `${callsign}-DET-${conteggio}`, updatedAt: iso },
      thermal: { ...drone.sourceState.thermal, lastEventId: `${callsign}-EVT-${conteggio}`, updatedAt: iso },
    },
  };
}

export function pubblicaDrone(documento) {
  return {
    id: documento._id,
    prodottoId: documento.prodottoId,
    eventCount: documento.eventCount,
    flight: documento.flight,
    mission: documento.mission,
    payload: documento.payload,
    platform: documento.platform,
    propulsion: documento.propulsion,
    sourceFormats: documento.sourceFormats,
    sourceMap: documento.sourceMap,
    sourceState: documento.sourceState,
    synthetic: documento.synthetic,
    updatedAt: documento.updatedAt,
    lastEventId: documento.lastEventId,
    lastMessageType: documento.lastMessageType,
    lastSource: documento.lastSource,
  };
}
