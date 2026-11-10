const state = {
  actor: localStorage.getItem('catalogo-attore') || 'NLD',
  fornitori: [],
};

let silenzioso = false;
let occupato = false;

const STATI = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  revoked: 'Revoked',
};

const COLONNE = {
  label: 'Contact',
  station: 'Station',
  port: 'Port',
  node: 'Node',
  site: 'Site',
  sector: 'Sector',
  area: 'Area',
  route: 'Route',
  beacon: 'Beacon',
  scene: 'Scene',
  observed: 'Observed',
  type: 'Type',
  category: 'Category',
  status: 'Status',
  condition: 'Condition',
  latitude: 'Latitude',
  longitude: 'Longitude',
  speedKnots: 'Speed (knots)',
  confidence: 'Confidence',
  windKnots: 'Wind (knots)',
  visibilityKm: 'Visibility (km)',
  seaState: 'Sea state',
  arrivals: 'Arrivals',
  departures: 'Departures',
  transits: 'Transits',
  tracks: 'Tracks',
  altitude: 'Altitude (feet)',
  aircraftAltitude: 'Altitude',
  coverage: 'Coverage',
  levelMeters: 'Level (m)',
  notice: 'Notice',
  note: 'Note',
};

const ORDINE = Object.keys(COLONNE);

function esc(valore) {
  return String(valore ?? '').replace(/[&<>"']/g, (carattere) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[carattere]));
}

function messaggio(testo) {
  document.querySelector('#messaggio').textContent = testo || '';
}

function dataLunga(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(data);
}

function formattaValore(chiave, valore) {
  if (valore == null || valore === '') return '—';
  if (chiave === 'confidence' && typeof valore === 'number') {
    return new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 }).format(valore);
  }
  if (chiave === 'observed') {
    const data = new Date(valore);
    if (!Number.isNaN(data.getTime())) {
      return `${new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(data)} UTC`;
    }
  }
  if (typeof valore === 'number') {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(valore);
  }
  return String(valore);
}

function classeLivello(livello) {
  return livello === 'open' ? 'aperto' : 'riservato';
}

function etichettaLivello(livello) {
  return livello === 'open' ? 'Open' : 'Restricted';
}

async function api(percorso, opzioni = {}) {
  const risposta = await fetch(percorso, {
    ...opzioni,
    headers: {
      'Content-Type': 'application/json',
      'X-Actor-Code': state.actor,
      ...(opzioni.headers || {}),
    },
  });
  const corpo = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    const errore = new Error(corpo.errore || 'Request failed.');
    errore.status = risposta.status;
    errore.body = corpo;
    throw errore;
  }
  return corpo;
}

function riempiSelettore() {
  const select = document.querySelector('#selettore-attore');
  const html = state.fornitori
    .map((voce) => `<option value="${esc(voce.codice)}">${esc(voce.bandiera)} ${esc(voce.nome)}</option>`)
    .join('');
  silenzioso = true;
  if (select.dataset.pronto !== html) {
    select.innerHTML = html;
    select.dataset.pronto = html;
  }
  select.value = state.actor;
  silenzioso = false;
}

function go(percorso) {
  if (percorso && percorso !== location.pathname) {
    history.pushState(null, '', percorso);
    window.scrollTo(0, 0);
  }
  return render();
}

function impostaAttore(codice, percorso) {
  state.actor = codice;
  localStorage.setItem('catalogo-attore', codice);
  const select = document.querySelector('#selettore-attore');
  if (select) select.value = codice;
  return go(percorso || location.pathname);
}

let tokenRender = 0;
let timerLive = 0;

function fermaLive() {
  if (timerLive) clearInterval(timerLive);
  timerLive = 0;
}

function avviaLive() {
  fermaLive();
  if (!document.querySelector('[data-live-prodotto]')) return;
  timerLive = setInterval(() => {
    aggiornaLive().catch(() => {});
  }, 2000);
}

async function aggiornaLive() {
  const nodi = [...document.querySelectorAll('[data-live-prodotto]')];
  if (!nodi.length) {
    fermaLive();
    return;
  }
  await Promise.all(nodi.map(async (nodo) => {
    const dati = await api(`/api/droni/${nodo.getAttribute('data-live-prodotto')}`);
    const corpo = nodo.querySelector('.fetta-corpo');
    if (corpo) corpo.innerHTML = htmlFetta(dati.drone);
  }));
}

async function render() {
  const token = ++tokenRender;
  fermaLive();
  const contenuto = document.querySelector('#contenuto');
  contenuto.innerHTML = '<p class="caricamento">Loading…</p>';
  try {
    const html = await vista(location.pathname);
    if (token !== tokenRender) return;
    contenuto.innerHTML = html;
    document.querySelector('#selettore-attore').value = state.actor;
    segnaNavigazione();
    avviaLive();
  } catch (errore) {
    if (token !== tokenRender) return;
    contenuto.innerHTML = `<p class="errore">${esc(errore.message)}</p>`;
  }
}

async function vista(percorso) {
  if (percorso === '/' || percorso === '') return vistaHome();
  let corrispondenza;
  if ((corrispondenza = percorso.match(/^\/nazioni\/([A-Za-z]{3})$/))) {
    return vistaNazione(corrispondenza[1].toUpperCase());
  }
  if ((corrispondenza = percorso.match(/^\/prodotti\/([a-z0-9-]+)\/uso$/))) {
    return vistaUso(corrispondenza[1]);
  }
  if ((corrispondenza = percorso.match(/^\/prodotti\/([a-z0-9-]+)$/))) {
    return vistaProdotto(corrispondenza[1]);
  }
  if (percorso === '/richieste') return vistaRichieste();
  document.title = 'Page not found — NATO headquarters';
  return `<section class="blocco" style="padding:1rem"><h1>Page not found</h1><p><a href="/" data-link>Back to headquarters</a></p></section>`;
}

function segnaNavigazione() {
  const percorso = location.pathname;
  document.querySelectorAll('.nav a').forEach((link) => {
    const href = link.getAttribute('href');
    const attivo = href === '/richieste'
      ? percorso === '/richieste'
      : percorso !== '/richieste';
    if (attivo) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function formattaNumero(valore, cifre = 1) {
  const numero = Number(valore);
  if (!Number.isFinite(numero)) return '—';
  return new Intl.NumberFormat('en', {
    maximumFractionDigits: cifre,
    minimumFractionDigits: cifre === 0 ? 0 : 0,
  }).format(numero);
}

function svgTraccia(punti) {
  const xs = punti.map((punto) => punto.location.x);
  const ys = punti.map((punto) => punto.location.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const larghezza = 640;
  const altezza = 160;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const x = (valore) => ((valore - minX) / spanX) * (larghezza - 36) + 18;
  const y = (valore) => ((maxY - valore) / spanY) * (altezza - 36) + 18;
  const linea = punti.map((punto, indice) => `${indice === 0 ? 'M' : 'L'}${x(punto.location.x).toFixed(1)} ${y(punto.location.y).toFixed(1)}`).join(' ');
  const ultimo = punti[punti.length - 1];
  return `<div class="mappa-wrap"><svg class="mappa traccia" viewBox="0 0 ${larghezza} ${altezza}" role="img" aria-label="Short ground track of one land vehicle">
    <rect width="${larghezza}" height="${altezza}" fill="#e6e8ed"></rect>
    <path d="${linea}" fill="none" stroke="#0033A0" stroke-width="2"></path>
    <circle cx="${x(ultimo.location.x).toFixed(1)}" cy="${y(ultimo.location.y).toFixed(1)}" r="5"></circle>
  </svg></div>`;
}

function htmlFetta(drone) {
  const volo = drone.flight;
  const termico = drone.payload.thermal;
  const ultimo = drone.payload.lastDetection;
  const classe = (ultimo.classificationPath || []).join(' / ');
  return `<div class="statistiche">
      <div><strong data-batteria>${esc(formattaNumero(volo.batteryPct))}</strong>battery %</div>
      <div><strong>${esc(formattaNumero(volo.groundSpeedMps))}</strong>speed m/s</div>
      <div><strong>${esc(formattaNumero(volo.headingDeg))}</strong>heading °</div>
      <div><strong>${esc(formattaNumero(volo.position.z))}</strong>altitude m</div>
      <div><strong>${esc(drone.mission.status)}</strong>mission</div>
      <div><strong>${esc(drone.propulsion.health)}</strong>propulsion</div>
      <div><strong data-eventi>${esc(formattaNumero(drone.eventCount, 0))}</strong>events counted</div>
    </div>
    <p data-utm="${esc(formattaNumero(volo.position.x, 1))},${esc(formattaNumero(volo.position.y, 1))}">Aircraft UTM ${esc(formattaNumero(volo.position.x, 1))}, ${esc(formattaNumero(volo.position.y, 1))} · callsign ${esc(drone.platform.callsign)}</p>
    <p class="ruolo">Thermal</p>
    <p>Ambient ${esc(formattaNumero(termico.ambientC))} °C · ground ${esc(formattaNumero(termico.groundSurfaceC))} °C · humidity ${esc(formattaNumero(termico.humidityPct, 0))}%</p>
    <p class="ruolo">Last detection</p>
    <p>${esc(classe)} · confidence ${esc(formattaNumero(ultimo.confidence, 2))} · UTM ${esc(formattaNumero(ultimo.location.x, 1))}, ${esc(formattaNumero(ultimo.location.y, 1))}</p>
    <p class="ruolo">Ground track · ${esc(String(drone.payload.groundDetections.length))} points · one vehicle ${esc(ultimo.objectId)}</p>
    ${svgTraccia(drone.payload.groundDetections)}`;
}

function pannelloLive(drone, prodotto, origine) {
  if (!drone || !prodotto) return '';
  const fonte = origine === 'shared'
    ? `Shared from ${prodotto.fornitore.bandiera} ${prodotto.fornitore.nome}`
    : `Published by ${prodotto.fornitore.bandiera} ${prodotto.fornitore.nome}`;
  return `<section class="fetta" data-live-prodotto="${esc(prodotto.id)}">
    <p class="ruolo">Live tactical drone · ${esc(drone.platform.callsign)} · ${fonte}</p>
    <h2>${esc(prodotto.titolo)}</h2>
    <p>${esc(prodotto.fornitore.nome)} remains the owner. This is the same live feed wherever it is shown.</p>
    <div class="fetta-corpo">${htmlFetta(drone)}</div>
  </section>`;
}

async function vistaHome() {
  const [nazioni, catalogo] = await Promise.all([
    api('/api/fornitori'),
    api('/api/prodotti'),
  ]);
  state.fornitori = nazioni.fornitori;
  riempiSelettore();
  document.title = 'NATO headquarters — Federated catalog';
  const schede = nazioni.fornitori.map((nazione) => {
    const conteggi = nazione.conteggi || { totale: 0, aperti: 0, riservati: 0 };
    const conteggio = conteggi.totale === 0
      ? '<span class="badge neutro">Publishes nothing</span>'
      : `<span class="badge neutro">${conteggi.totale} ${conteggi.totale === 1 ? 'product' : 'products'}</span>
         <span class="badge aperto">${conteggi.aperti} open</span>
         <span class="badge riservato">${conteggi.riservati} restricted</span>`;
    return `<article class="scheda nazione">
      <a href="/nazioni/${esc(nazione.codice)}" data-link>
        <span class="bandiera" aria-hidden="true">${esc(nazione.bandiera)}</span>
        <h2>${esc(nazione.nome)}</h2>
        <p class="conteggi">${conteggio}</p>
      </a>
    </article>`;
  }).join('');
  const righe = catalogo.prodotti.map((prodotto) => `<a class="riga" href="/prodotti/${esc(prodotto.id)}" data-link>
      <span class="badge ${classeLivello(prodotto.livello)}">${etichettaLivello(prodotto.livello)}</span>
      <strong>${esc(prodotto.titolo)}</strong>
      <em>${esc(prodotto.fornitore.bandiera)} ${esc(prodotto.fornitore.nome)} · ${esc(prodotto.dominio)}</em>
      <span>${esc(prodotto.sintesi)}</span>
    </a>`).join('');
  return `<section>
    <p class="sopra">NATO headquarters</p>
    <h1>Every member, and everything it published</h1>
    <p class="lede">Each country publishes its own products and remains the owner. Open a country to see what it published and what was shared with it. On a drone, Share with sends that live feed to any other NATO country.</p>
    <h2>Member countries</h2>
    <div class="griglia">${schede}</div>
    <h2>Every published product</h2>
    <div class="elenco-prodotti">${righe}</div>
  </section>`;
}

async function vistaNazione(codice) {
  const dati = await api(`/api/fornitori/${codice}`);
  const nazione = dati.fornitore;
  document.title = `${nazione.nome} — NATO headquarters`;
  const perId = new Map(dati.prodotti.map((prodotto) => [prodotto.id, prodotto]));
  const live = (dati.droni || []).map((drone) => pannelloLive(drone, perId.get(drone.prodottoId), 'published')).join('');
  const righe = dati.prodotti
    .slice()
    .sort((a, b) => a.titolo.localeCompare(b.titolo, 'en'))
    .map((prodotto) => `<a class="riga" href="/prodotti/${esc(prodotto.id)}" data-link>
        <span class="badge ${classeLivello(prodotto.livello)}">${etichettaLivello(prodotto.livello)}</span>
        <strong>${esc(prodotto.titolo)}</strong>
        <em>Published by ${esc(nazione.nome)} · ${esc(prodotto.dominio)}</em>
        <span>${esc(prodotto.sintesi)}</span>
      </a>`).join('');
  const pubblicati = righe || '<p class="vuoto">This nation has not published a dataset.</p>';
  const ricevuti = (dati.ricevuti || []).map((voce) => `<article class="ricevuto">
      <p class="ruolo">Source · ${esc(voce.prodotto.fornitore.bandiera)} ${esc(voce.prodotto.fornitore.nome)}</p>
      <h3>${esc(voce.prodotto.titolo)}</h3>
      <p>Shared from ${esc(voce.prodotto.fornitore.nome)}. ${esc(voce.prodotto.fornitore.nome)} remains the owner. ${esc(nazione.nome)} did not publish this product.</p>
      ${pannelloLive(voce.drone, voce.prodotto, 'shared')}
    </article>`).join('');
  const sezioneRicevuti = ricevuti
    ? `<h2>Shared with ${esc(nazione.nome)}</h2>${ricevuti}`
    : `<h2>Shared with ${esc(nazione.nome)}</h2><p class="vuoto">Nothing has been shared with ${esc(nazione.nome)}.</p>`;
  return `<section>
    <p class="briciole"><a href="/" data-link>Headquarters</a> / ${esc(nazione.nome)}</p>
    <p class="bandiera" aria-hidden="true">${esc(nazione.bandiera)}</p>
    <p class="ruolo">Data provider · ${esc(nazione.profilo.nomeUfficiale)}</p>
    <h1>${esc(nazione.nome)}</h1>
    <div class="profilo">
      <div>
        <p class="lede">${esc(nazione.profilo.sintesi)}</p>
        <dl>
          <dt>Capital</dt><dd>${esc(nazione.profilo.capitale)}</dd>
          <dt>Data office</dt><dd>${esc(nazione.profilo.ufficioDati)}</dd>
          <dt>Contact</dt><dd><a href="mailto:${esc(nazione.profilo.email)}">${esc(nazione.profilo.email)}</a></dd>
          <dt>Products</dt><dd>${nazione.conteggi.totale}, of which ${nazione.conteggi.aperti} open and ${nazione.conteggi.riservati} restricted</dd>
        </dl>
      </div>
      <blockquote class="citazione">
        <p>${esc(nazione.sovranita.dichiarazione)}</p>
        <span class="badge neutro">Jurisdiction ${esc(nazione.sovranita.giurisdizione)}</span>
      </blockquote>
    </div>
    ${live}
    <h2>Published by ${esc(nazione.nome)}</h2>
    <div class="elenco-prodotti">${pubblicati}</div>
    ${sezioneRicevuti}
  </section>`;
}

function campiTabella(campi) {
  const righe = campi.map((campo) => {
    const nome = COLONNE[campo.nome] || campo.nome;
    const unitaGiaNelNome = campo.unita && nome.toLowerCase().includes(campo.unita.toLowerCase());
    const unita = campo.unita && !unitaGiaNelNome ? ` <span class="badge neutro">${esc(campo.unita)}</span>` : '';
    return `<tr><td>${esc(nome)}${unita}</td><td>${esc(campo.descrizione)}</td></tr>`;
  }).join('');
  return `<table class="campi"><thead><tr><th>Field</th><th>Description</th></tr></thead><tbody>${righe}</tbody></table>`;
}

function pannelloAccesso(prodotto, accesso) {
  const politica = prodotto.politicaAccesso;
  const nome = prodotto.fornitore.nome;
  const finalita = politica.finalitaAmmesse.map((voce) => `<li>${esc(voce)}</li>`).join('');
  let corpo;
  if (politica.livello === 'open') {
    corpo = `<p>Open dataset published by ${esc(nome)}. Use it with no request.</p>
      <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Use the dataset</a></p>`;
  } else if (state.actor === prodotto.fornitore.codice) {
    corpo = `<p>You are the owner. The extract stays yours: you can read it and decide requests from other nations.</p>
      <div class="azioni-riga">
        <a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Open your extract</a>
        <a class="bottone secondario" href="/richieste" data-link>See requests</a>
      </div>`;
  } else if (accesso.motivo === 'share') {
    corpo = `<p>Headquarters shared this product with you. ${esc(nome)} remains the publisher.</p>
      <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Open the shared feed</a></p>`;
  } else if (!accesso.richiesta || accesso.richiesta.stato === 'denied' || accesso.richiesta.stato === 'revoked') {
    const precedente = accesso.richiesta
      ? `<p>Previous status: ${esc(STATI[accesso.richiesta.stato] || accesso.richiesta.stato)}. ${esc(accesso.richiesta.decisione?.nota || '')}</p>`
      : '<p>You have no request for this product yet. The extract stays closed.</p>';
    corpo = `${precedente}
      <form data-form="richiesta" data-prodotto="${esc(prodotto.id)}">
        <label>Purpose of the request
          <textarea name="finalita" required minlength="12" maxlength="500" placeholder="Why ${esc(nome)} should grant you use, and for what purpose."></textarea>
        </label>
        <button type="submit">Request access from ${esc(nome)}</button>
      </form>`;
  } else if (accesso.richiesta.stato === 'pending') {
    corpo = `<p>Request sent on ${esc(dataLunga(accesso.richiesta.richiestaIl))}. ${esc(nome)} has not decided yet. Stated purpose: ${esc(accesso.richiesta.finalita)}</p>
      <p>The extract is not released until the owner approves.</p>
      <button type="button" data-attore="${esc(prodotto.fornitore.codice)}" data-vai="/richieste">Open ${esc(nome)}’s queue</button>`;
  } else {
    corpo = `<p>Access granted by ${esc(nome)}. The grant can be revoked: if the owner closes it, use stops.</p>
      <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Use the dataset</a></p>`;
  }
  return `<aside class="pannello">
    <p class="ruolo">Access policy</p>
    <h2>${etichettaLivello(politica.livello)}</h2>
    <p>${esc(politica.condizioni)}</p>
    <p><strong>Allowed purposes</strong></p>
    <ul>${finalita}</ul>
    <p><strong>Redistribution.</strong> ${esc(politica.ridistribuzione)}</p>
    <p><strong>Retention.</strong> ${esc(politica.conservazione)}</p>
    <p class="nota-estratto">The records are not on this dossier. They sit in a separate extract, and the server reads it only after the policy check.</p>
    ${corpo}
  </aside>`;
}

function moduloCondivisione(prodotto, condivisioni) {
  if (prodotto.tipo !== 'drone') return '';
  const altri = state.fornitori.filter((nazione) => nazione.codice !== prodotto.fornitore.codice);
  const opzioni = altri
    .map((nazione) => `<option value="${esc(nazione.codice)}">${esc(nazione.bandiera)} ${esc(nazione.nome)}</option>`)
    .join('');
  const elenco = (condivisioni || []).length
    ? `<ul>${condivisioni.map((voce) => `<li>Shared with ${esc(voce.nomeDestinatario)}. ${esc(voce.nomeProprietario)} remains the owner.</li>`).join('')}</ul>`
    : '<p>Not shared yet.</p>';
  return `<section class="condividi">
    <h2>Share with</h2>
    <p>${esc(prodotto.fornitore.nome)} remains the owner. Choose one of the other ${altri.length} NATO countries.</p>
    ${elenco}
    <form data-form="condivisione" data-prodotto="${esc(prodotto.id)}">
      <label>Share with
        <select name="destinatarioId" required aria-label="Share with">
          <option value="">Choose a country</option>
          ${opzioni}
        </select>
      </label>
      <button type="submit">Confirm</button>
    </form>
  </section>`;
}

async function vistaProdotto(id) {
  const dati = await api(`/api/prodotti/${id}`);
  const prodotto = dati.prodotto;
  const meta = prodotto.metadati;
  document.title = `${prodotto.titolo} — Federated catalog`;
  const fine = meta.fineTemporale ? esc(meta.fineTemporale) : 'ongoing';
  return `<article class="dossier">
    <p class="briciole"><a href="/" data-link>Headquarters</a> / <a href="/nazioni/${esc(prodotto.fornitore.codice)}" data-link>${esc(prodotto.fornitore.bandiera)} ${esc(prodotto.fornitore.nome)}</a></p>
    <p class="dominio">${esc(prodotto.dominio)}</p>
    <h1>${esc(prodotto.titolo)}</h1>
    <p class="lede">${esc(prodotto.sintesi)}</p>
    <div class="griglia-dossier">
      <section>
        <h2>Metadata</h2>
        <dl>
          <dt>Provider</dt><dd>${esc(prodotto.fornitore.nome)}</dd>
          <dt>Published</dt><dd>${esc(dataLunga(prodotto.pubblicatoIl))}</dd>
          <dt>Format</dt><dd>${esc(meta.formato)}</dd>
          <dt>Update</dt><dd>${esc(meta.frequenzaAggiornamento)}</dd>
          <dt>Coverage</dt><dd>${esc(meta.coperturaSpaziale)}</dd>
          <dt>Period</dt><dd>${esc(meta.inizioTemporale)} — ${fine}</dd>
          <dt>Source language</dt><dd>${esc(meta.lingua)}</dd>
          <dt>Steward</dt><dd>${esc(meta.responsabile)}</dd>
          <dt>Quality</dt><dd>${esc(meta.qualita)}</dd>
        </dl>
        <h3>Fields</h3>
        ${campiTabella(meta.campi)}
      </section>
      <div>
        ${moduloCondivisione(prodotto, dati.condivisioni)}
        ${pannelloAccesso(prodotto, dati.accesso)}
      </div>
    </div>
  </article>`;
}

function mappa(record) {
  const punti = record.filter((voce) => Number.isFinite(voce.latitude) && Number.isFinite(voce.longitude));
  if (punti.length === 0) return '';
  const latitudini = punti.map((voce) => voce.latitude);
  const longitudini = punti.map((voce) => voce.longitude);
  const minLat = Math.min(...latitudini) - 0.28;
  const maxLat = Math.max(...latitudini) + 0.28;
  const minLon = Math.min(...longitudini) - 0.4;
  const maxLon = Math.max(...longitudini) + 0.4;
  const larghezza = 760;
  const altezza = 420;
  const x = (lon) => ((lon - minLon) / (maxLon - minLon)) * (larghezza - 70) + 36;
  const y = (lat) => ((maxLat - lat) / (maxLat - minLat)) * (altezza - 64) + 28;
  const segni = punti.map((voce) => {
    const sx = x(voce.longitude);
    const sy = y(voce.latitude);
    const sigla = String(voce.label || '').split('-').pop();
    return `<g><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"></circle><text x="${(sx + 9).toFixed(1)}" y="${(sy - 8).toFixed(1)}">${esc(sigla)}</text></g>`;
  }).join('');
  return `<div class="mappa-wrap"><svg class="mappa" viewBox="0 0 ${larghezza} ${altezza}" role="img" aria-label="Position of the authorized contacts">
    <rect width="${larghezza}" height="${altezza}" fill="#e6e8ed"></rect>
    <text x="24" y="28">Extract area</text>
    ${segni}
  </svg></div>`;
}

function tabellaRecord(record) {
  const chiavi = [];
  for (const voce of record) {
    for (const chiave of Object.keys(voce)) {
      if (!chiavi.includes(chiave)) chiavi.push(chiave);
    }
  }
  chiavi.sort((a, b) => {
    const ia = ORDINE.indexOf(a);
    const ib = ORDINE.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const testa = chiavi.map((chiave) => `<th>${esc(COLONNE[chiave] || chiave)}</th>`).join('');
  const righe = record.map((voce) => `<tr>${chiavi.map((chiave) => `<td>${esc(formattaValore(chiave, voce[chiave]))}</td>`).join('')}</tr>`).join('');
  return `<div class="tabella-wrap"><table class="tabella"><thead><tr>${testa}</tr></thead><tbody>${righe}</tbody></table></div>`;
}

function testoUso(dati) {
  const motivo = dati.accesso.motivo;
  if (motivo === 'open') {
    return 'Open dataset: direct use, with no access request.';
  }
  if (motivo === 'owner') {
    return 'You are reading an extract from your own country. It stays under your sovereignty, and no grant to another nation is recorded.';
  }
  if (motivo === 'share') {
    return `Headquarters shared this feed with you. ${dati.prodotto.fornitore.nome} remains the publisher.`;
  }
  return `Active grant from ${dati.prodotto.fornitore.nome}. The owner can revoke it from the request queue: these records are then no longer delivered.`;
}

function paginaDrone(dati) {
  return `<article>
    <p class="briciole"><a href="/prodotti/${esc(dati.prodotto.id)}" data-link>Product dossier</a></p>
    <p class="dominio">Using the feed · publisher ${esc(dati.prodotto.fornitore.bandiera)} ${esc(dati.prodotto.fornitore.nome)}</p>
    <h1>${esc(dati.prodotto.titolo)}</h1>
    <p class="lede">${esc(testoUso(dati))}</p>
    ${pannelloLive(dati.drone, dati.prodotto)}
  </article>`;
}

function paginaUso(dati) {
  if (dati.drone) return paginaDrone(dati);
  const record = dati.estratto.record || [];
  const superficie = record.filter((voce) => voce.type === 'surface').length;
  const sotto = record.filter((voce) => voce.type === 'subsurface').length;
  const mappaHtml = dati.estratto.vista === 'map' ? mappa(record) : '';
  const statistiche = dati.estratto.vista === 'map' && superficie + sotto > 0
    ? `<div class="statistiche">
        <div><strong>${record.length}</strong>contacts in the extract</div>
        <div><strong>${superficie}</strong>surface</div>
        <div><strong>${sotto}</strong>subsurface</div>
      </div>`
    : `<div class="statistiche"><div><strong>${record.length}</strong>records in the extract</div></div>`;
  return `<article>
    <p class="briciole"><a href="/prodotti/${esc(dati.prodotto.id)}" data-link>Product dossier</a></p>
    <p class="dominio">Using the extract · ${esc(dati.prodotto.fornitore.bandiera)} ${esc(dati.prodotto.fornitore.nome)}</p>
    <h1>${esc(dati.prodotto.titolo)}</h1>
    <p class="lede">${esc(testoUso(dati))}</p>
    <p>${esc(dati.estratto.descrizione)}</p>
    ${statistiche}
    ${mappaHtml}
    ${tabellaRecord(record)}
  </article>`;
}

async function vistaUso(id) {
  document.title = 'Using the extract — Federated catalog';
  try {
    const dati = await api(`/api/prodotti/${id}/uso`);
    document.title = `Use · ${dati.prodotto.titolo} — Federated catalog`;
    return paginaUso(dati);
  } catch (errore) {
    if (errore.status === 403 && errore.body?.prodotto) {
      const prodotto = errore.body.prodotto;
      document.title = `Extract closed · ${prodotto.titolo} — Federated catalog`;
      return `<section class="chiuso">
        <p class="briciole"><a href="/prodotti/${esc(prodotto.id)}" data-link>Back to the metadata</a></p>
        <p class="dominio">${esc(prodotto.fornitore.bandiera)} ${esc(prodotto.fornitore.nome)}</p>
        <h1>Extract not released</h1>
        <p>${esc(errore.message)}</p>
        <p>The dossier, with metadata and policy, stays readable. The records do not.</p>
        <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}" data-link>Open the dossier</a></p>
      </section>`;
    }
    throw errore;
  }
}

function cartaRichiesta(richiesta, ruolo) {
  let comandi = '';
  if (ruolo === 'in-arrivo' && richiesta.stato === 'pending') {
    comandi = `<form data-form="decisione" data-id="${esc(richiesta.id)}">
      <label>Note for ${esc(richiesta.nomeRichiedente)}
        <textarea name="nota" maxlength="500" placeholder="Optional if you approve. Required, and clear, if you deny."></textarea>
      </label>
      <div class="azioni-riga">
        <button type="submit" data-esito="approved">Approve</button>
        <button type="submit" class="secondario" data-esito="denied">Deny</button>
      </div>
    </form>`;
  } else if (ruolo === 'in-arrivo' && richiesta.stato === 'approved') {
    comandi = `<form data-form="revoca" data-id="${esc(richiesta.id)}">
      <label>Reason for revocation
        <textarea name="nota" required minlength="8" maxlength="500" placeholder="Why you are closing the grant."></textarea>
      </label>
      <button type="submit" class="pericolo">Revoke the grant</button>
    </form>`;
  }
  const decisione = richiesta.decisione
    ? `<p>Decision on ${esc(dataLunga(richiesta.decisione.il))}: ${esc(richiesta.decisione.nota || 'no note')}</p>`
    : '';
  return `<article class="carta-richiesta">
    <span class="badge ${richiesta.stato === 'approved' ? 'aperto' : richiesta.stato === 'pending' ? 'neutro' : 'riservato'}">${esc(STATI[richiesta.stato] || richiesta.stato)}</span>
    <h3>${esc(richiesta.titoloProdotto)}</h3>
    <p>${ruolo === 'in-arrivo' ? `From ${esc(richiesta.nomeRichiedente)}` : `To ${esc(richiesta.nomeProprietario)}`} · ${esc(dataLunga(richiesta.richiestaIl))}</p>
    <p>${esc(richiesta.finalita)}</p>
    ${decisione}
    ${comandi}
  </article>`;
}

async function vistaRichieste() {
  const dati = await api('/api/richieste');
  const attore = state.fornitori.find((voce) => voce.codice === state.actor);
  document.title = 'Requests — Federated catalog';
  const inArrivo = dati.inArrivo.length
    ? dati.inArrivo.map((voce) => cartaRichiesta(voce, 'in-arrivo')).join('')
    : '<p>No incoming requests. When another nation asks for one of your restricted datasets, the decision appears here.</p>';
  const inviate = dati.inviate.length
    ? dati.inviate.map((voce) => cartaRichiesta(voce, 'inviate')).join('')
    : '<p>You have not sent any requests.</p>';
  return `<section>
    <p class="ruolo">${esc(attore ? `${attore.bandiera} ${attore.nome}` : state.actor)}</p>
    <h1>Access requests</h1>
    <p class="lede">Incoming requests are yours to decide, because the products are yours. Outgoing requests are the ones you sent to other nations: the owner updates the status.</p>
    <div class="griglia-richieste">
      <section><h2>Incoming</h2>${inArrivo}</section>
      <section><h2>Outgoing</h2>${inviate}</section>
    </div>
  </section>`;
}

async function conOccupazione(lavoro) {
  if (occupato) return;
  occupato = true;
  try {
    await lavoro();
  } finally {
    occupato = false;
  }
}

document.addEventListener('click', (evento) => {
  const link = evento.target.closest('a[data-link]');
  if (link) {
    evento.preventDefault();
    go(link.getAttribute('href'));
    return;
  }
  const ripristino = evento.target.closest('[data-azione="ripristina"]');
  if (ripristino) {
    evento.preventDefault();
    if (!window.confirm('Reset the catalog data? Requests and shares will be deleted.')) return;
    conOccupazione(async () => {
      await api('/api/demo/ripristino', { method: 'POST', body: '{}' });
      messaggio('Catalog data restored. Requests and shares start over.');
      await go('/');
    }).catch((errore) => messaggio(errore.message));
    return;
  }
  const scorciatoia = evento.target.closest('[data-vai]');
  if (scorciatoia && scorciatoia.tagName !== 'FORM') {
    evento.preventDefault();
    if (scorciatoia.dataset.attore) impostaAttore(scorciatoia.dataset.attore, scorciatoia.dataset.vai);
    else go(scorciatoia.dataset.vai);
  }
});

document.addEventListener('submit', (evento) => {
  const form = evento.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.form === 'condivisione') {
    evento.preventDefault();
    const destinatarioId = String(new FormData(form).get('destinatarioId') || '').trim();
    conOccupazione(async () => {
      const dati = await api(`/api/prodotti/${form.dataset.prodotto}/condivisioni`, {
        method: 'POST',
        body: JSON.stringify({ destinatarioId }),
      });
      messaggio(`Shared with ${dati.condivisione.nomeDestinatario}. ${dati.condivisione.nomeProprietario} remains the owner.`);
      await render();
    }).catch((errore) => messaggio(errore.message));
    return;
  }
  if (form.dataset.form === 'richiesta') {
    evento.preventDefault();
    const finalita = String(new FormData(form).get('finalita') || '').trim();
    conOccupazione(async () => {
      await api(`/api/prodotti/${form.dataset.prodotto}/richieste`, {
        method: 'POST',
        body: JSON.stringify({ finalita }),
      });
      messaggio('Request sent. The owning nation makes the decision.');
      await render();
    }).catch((errore) => messaggio(errore.message));
    return;
  }
  if (form.dataset.form === 'decisione' || form.dataset.form === 'revoca') {
    evento.preventDefault();
    const esito = form.dataset.form === 'revoca' ? 'revoked' : evento.submitter?.dataset.esito;
    const nota = String(new FormData(form).get('nota') || '').trim();
    if (!esito) {
      messaggio('Choose whether to approve or deny.');
      return;
    }
    conOccupazione(async () => {
      await api(`/api/richieste/${form.dataset.id}/decisione`, {
        method: 'POST',
        body: JSON.stringify({ esito, nota }),
      });
      const testi = {
        approved: 'Grant recorded. The requester can use the extract.',
        denied: 'Request denied. The extract stays closed.',
        revoked: 'Grant revoked. Use stops at once.',
      };
      messaggio(testi[esito]);
      await render();
    }).catch((errore) => messaggio(errore.message));
  }
});

window.addEventListener('popstate', () => {
  render();
});

document.querySelector('#selettore-attore').addEventListener('change', (evento) => {
  if (silenzioso) return;
  impostaAttore(evento.target.value);
});

async function avvia() {
  try {
    const dati = await api('/api/fornitori');
    state.fornitori = dati.fornitori;
    if (!state.fornitori.some((voce) => voce.codice === state.actor)) {
      state.actor = 'NLD';
      localStorage.setItem('catalogo-attore', 'NLD');
    }
    riempiSelettore();
    await render();
  } catch (errore) {
    document.querySelector('#contenuto').innerHTML = `<p class="errore">The catalog cannot reach MongoDB. Start the database and reload the page. ${esc(errore.message)}</p>`;
  }
}

avvia();
