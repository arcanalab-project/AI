const state = {
  actor: localStorage.getItem('catalogo-attore') || 'NLD',
  fornitori: [],
  storia: null,
};

let silenzioso = false;
let occupato = false;

const STATI = {
  in_attesa: 'Pending',
  approvata: 'Approved',
  respinta: 'Denied',
  revocata: 'Revoked',
};

const COLONNE = {
  etichetta: 'Contact',
  stazione: 'Station',
  porto: 'Port',
  nodo: 'Node',
  sito: 'Site',
  settore: 'Sector',
  area: 'Area',
  tratto: 'Route',
  beacon: 'Beacon',
  scena: 'Scene',
  osservato: 'Observed',
  tipo: 'Type',
  categoria: 'Category',
  stato: 'Status',
  condizione: 'Condition',
  latitude: 'Latitude',
  longitude: 'Longitude',
  velocitaNodi: 'Speed (knots)',
  affidabilita: 'Confidence',
  ventoNodi: 'Wind (knots)',
  visibilitaKm: 'Visibility (km)',
  statoMare: 'Sea state',
  arrivi: 'Arrivals',
  partenze: 'Departures',
  transiti: 'Transits',
  traccia: 'Tracks',
  quota: 'Altitude (feet)',
  copertura: 'Coverage',
  livelloMetri: 'Level (m)',
  avviso: 'Notice',
  annotazione: 'Note',
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
  if (chiave === 'affidabilita' && typeof valore === 'number') {
    return new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 }).format(valore);
  }
  if (chiave === 'osservato') {
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
  return livello === 'aperto' ? 'aperto' : 'riservato';
}

function etichettaLivello(livello) {
  return livello === 'aperto' ? 'Open' : 'Restricted';
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

async function render() {
  const token = ++tokenRender;
  const contenuto = document.querySelector('#contenuto');
  contenuto.innerHTML = '<p class="caricamento">Loading…</p>';
  try {
    await caricaStoria();
    const html = await vista(location.pathname);
    if (token !== tokenRender) return;
    contenuto.innerHTML = html;
    document.querySelector('#selettore-attore').value = state.actor;
    dipingiStoria();
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
  document.title = 'Page not found — Federated catalog';
  return `<section class="blocco" style="padding:1rem"><h1>Page not found</h1><p><a href="/" data-link>Back to nations</a></p></section>`;
}

async function vistaHome() {
  const dati = await api('/api/fornitori');
  state.fornitori = dati.fornitori;
  riempiSelettore();
  document.title = 'Data-providing nations — Federated catalog';
  const schede = dati.fornitori.map((nazione) => {
    const evidenza = nazione.codice === 'DEU' ? ' evidenza' : '';
    const conteggi = nazione.conteggi || { totale: 0, aperti: 0, riservati: 0 };
    return `<article class="scheda${evidenza}">
      <a href="/nazioni/${esc(nazione.codice)}" data-link>
        <span class="bandiera" aria-hidden="true">${esc(nazione.bandiera)}</span>
        <p class="ruolo">Data provider</p>
        <h2>${esc(nazione.nome)}</h2>
        <p class="sintesi">${esc(nazione.profilo.sintesi)}</p>
        <p class="conteggi">
          <span class="badge neutro">${conteggi.totale} products</span>
          <span class="badge aperto">${conteggi.aperti} open</span>
          <span class="badge riservato">${conteggi.riservati} restricted</span>
        </p>
      </a>
    </article>`;
  }).join('');
  return `<section>
    <p class="sopra">Discovery across nations</p>
    <h1>Countries are providers, not products</h1>
    <p class="lede">Each participating nation has its own profile and publishes several data products. You discover metadata and access policies. The data stays with the publisher: an open dataset can be used at once, a restricted one only after the owner approves a request.</p>
    <ul class="principi">
      <li><strong>Federated discovery</strong> Metadata is consulted across nations. The extract does not travel with the dossier.</li>
      <li><strong>National sovereignty</strong> The owner decides on restricted data, and can revoke a grant already given.</li>
      <li><strong>Controlled sharing</strong> The server releases records only when the policy, at that moment, allows it.</li>
    </ul>
    <h2>Nations in the catalog</h2>
    <div class="griglia">${schede}</div>
  </section>`;
}

async function vistaNazione(codice) {
  const dati = await api(`/api/fornitori/${codice}`);
  const nazione = dati.fornitore;
  document.title = `${nazione.nome} — Federated catalog`;
  const storiaId = state.storia?.prodottoId;
  const righe = dati.prodotti
    .slice()
    .sort((a, b) => {
      if (a.id === storiaId) return -1;
      if (b.id === storiaId) return 1;
      return a.titolo.localeCompare(b.titolo, 'en');
    })
    .map((prodotto) => {
      const evidenza = prodotto.id === storiaId ? ' evidenza' : '';
      const nastro = prodotto.id === storiaId ? ' · demo path' : '';
      return `<a class="riga${evidenza}" href="/prodotti/${esc(prodotto.id)}" data-link>
        <span class="badge ${classeLivello(prodotto.livello)}">${etichettaLivello(prodotto.livello)}</span>
        <strong>${esc(prodotto.titolo)}</strong>
        <em>${esc(prodotto.dominio)}${esc(nastro)}</em>
        <span>${esc(prodotto.sintesi)}</span>
      </a>`;
    }).join('');
  return `<section>
    <p class="briciole"><a href="/" data-link>Nations</a> / ${esc(nazione.nome)}</p>
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
    <h2>Published products</h2>
    <div class="elenco-prodotti">${righe}</div>
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
  if (politica.livello === 'aperto') {
    corpo = `<p>Open dataset published by ${esc(nome)}. Use it with no request.</p>
      <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Use the dataset</a></p>`;
  } else if (state.actor === prodotto.fornitore.codice) {
    corpo = `<p>You are the owner. The extract stays yours: you can read it and decide requests from other nations.</p>
      <div class="azioni-riga">
        <a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Open your extract</a>
        <a class="bottone secondario" href="/richieste" data-link>See requests</a>
      </div>`;
  } else if (!accesso.richiesta || accesso.richiesta.stato === 'respinta' || accesso.richiesta.stato === 'revocata') {
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
  } else if (accesso.richiesta.stato === 'in_attesa') {
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

async function vistaProdotto(id) {
  const dati = await api(`/api/prodotti/${id}`);
  const prodotto = dati.prodotto;
  const meta = prodotto.metadati;
  document.title = `${prodotto.titolo} — Federated catalog`;
  const fine = meta.fineTemporale ? esc(meta.fineTemporale) : 'ongoing';
  return `<article class="dossier">
    <p class="briciole"><a href="/" data-link>Nations</a> / <a href="/nazioni/${esc(prodotto.fornitore.codice)}" data-link>${esc(prodotto.fornitore.bandiera)} ${esc(prodotto.fornitore.nome)}</a></p>
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
      ${pannelloAccesso(prodotto, dati.accesso)}
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
    const sigla = String(voce.etichetta || '').split('-').pop();
    return `<g><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"></circle><text x="${(sx + 9).toFixed(1)}" y="${(sy - 8).toFixed(1)}">${esc(sigla)}</text></g>`;
  }).join('');
  return `<div class="mappa-wrap"><svg class="mappa" viewBox="0 0 ${larghezza} ${altezza}" role="img" aria-label="Position of the authorized contacts">
    <rect width="${larghezza}" height="${altezza}" fill="#e7eef2"></rect>
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
  if (motivo === 'aperto') {
    return 'Open dataset: direct use, with no access request.';
  }
  if (motivo === 'proprietario') {
    return 'You are reading an extract from your own country. It stays under your sovereignty, and no grant to another nation is recorded.';
  }
  return `Active grant from ${dati.prodotto.fornitore.nome}. The owner can revoke it from the request queue: these records are then no longer delivered.`;
}

function paginaUso(dati) {
  const record = dati.estratto.record || [];
  const superficie = record.filter((voce) => voce.tipo === 'surface').length;
  const sotto = record.filter((voce) => voce.tipo === 'subsurface').length;
  const mappaHtml = dati.estratto.vista === 'mappa' ? mappa(record) : '';
  const statistiche = dati.estratto.vista === 'mappa' && superficie + sotto > 0
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
  const evidenza = richiesta.prodottoId === state.storia?.prodottoId && (richiesta.richiedenteId === 'NLD' || richiesta.proprietarioId === 'DEU')
    ? ' evidenza'
    : '';
  const nastro = evidenza ? '<span class="badge neutro">Guided path</span>' : '';
  let comandi = '';
  if (ruolo === 'in-arrivo' && richiesta.stato === 'in_attesa') {
    comandi = `<form data-form="decisione" data-id="${esc(richiesta.id)}">
      <label>Note for ${esc(richiesta.nomeRichiedente)}
        <textarea name="nota" maxlength="500" placeholder="Optional if you approve. Required, and clear, if you deny."></textarea>
      </label>
      <div class="azioni-riga">
        <button type="submit" data-esito="approvata">Approve</button>
        <button type="submit" class="secondario" data-esito="respinta">Deny</button>
      </div>
    </form>`;
  } else if (ruolo === 'in-arrivo' && richiesta.stato === 'approvata') {
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
  return `<article class="carta-richiesta${evidenza}">
    <span class="badge ${richiesta.stato === 'approvata' ? 'aperto' : richiesta.stato === 'in_attesa' ? 'neutro' : 'riservato'}">${esc(STATI[richiesta.stato] || richiesta.stato)}</span>
    ${nastro}
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

function passiStoria(storia) {
  const stato = storia.richiesta?.stato || null;
  const passi = [
    { titolo: 'Discovery', testo: 'The German metadata is in the catalog.', fase: 'fatto' },
    { titolo: 'Request', testo: 'The Netherlands asks to use it.', fase: 'corso' },
    { titolo: 'Decision', testo: 'Germany approves or denies.', fase: 'attesa' },
    { titolo: 'Use', testo: 'The extract opens only after a yes.', fase: 'attesa' },
  ];
  if (stato === 'in_attesa') {
    passi[1] = { titolo: 'Request', testo: 'Sent, waiting on the owner.', fase: 'fatto' };
    passi[2] = { titolo: 'Decision', testo: 'It is Germany’s turn.', fase: 'corso' };
  } else if (stato === 'approvata') {
    passi[1] = { titolo: 'Request', testo: 'Sent by the Netherlands.', fase: 'fatto' };
    passi[2] = { titolo: 'Decision', testo: 'Germany has granted access.', fase: 'fatto' };
    passi[3] = { titolo: 'Use', testo: 'The Netherlands can open the extract.', fase: 'corso' };
  } else if (stato === 'respinta') {
    passi[1] = { titolo: 'Request', testo: 'A new request can be sent.', fase: 'corso' };
    passi[2] = { titolo: 'Decision', testo: 'Germany denied it.', fase: 'fatto' };
  } else if (stato === 'revocata') {
    passi[1] = { titolo: 'Request', testo: 'The grant no longer holds.', fase: 'corso' };
    passi[2] = { titolo: 'Decision', testo: 'Germany revoked it.', fase: 'fatto' };
    passi[3] = { titolo: 'Use', testo: 'The extract is closed again.', fase: 'attesa' };
  }
  return passi;
}

function azioneStoria(storia) {
  const stato = storia.richiesta?.stato || null;
  const id = storia.prodottoId;
  const richiedente = storia.richiedente.codice;
  const proprietario = storia.proprietario.codice;
  if (!stato || stato === 'respinta' || stato === 'revocata') {
    if (state.actor !== richiedente) {
      return { etichetta: 'Act as the Netherlands', attore: richiedente, vai: `/prodotti/${id}` };
    }
    return { etichetta: 'Open the German sensors', vai: `/prodotti/${id}` };
  }
  if (stato === 'in_attesa') {
    if (state.actor !== proprietario) {
      return { etichetta: 'Switch to Germany to decide', attore: proprietario, vai: '/richieste' };
    }
    return { etichetta: 'Open incoming requests', vai: '/richieste' };
  }
  if (stato === 'approvata') {
    if (state.actor !== richiedente) {
      return { etichetta: 'Return to the Netherlands', attore: richiedente, vai: `/prodotti/${id}/uso` };
    }
    return { etichetta: 'Use the sensor data', vai: `/prodotti/${id}/uso` };
  }
  return { etichetta: 'Open the product', vai: `/prodotti/${id}` };
}

async function caricaStoria() {
  try {
    state.storia = await api('/api/storia');
  } catch (errore) {
    state.storia = null;
  }
}

function dipingiStoria() {
  const sezione = document.querySelector('#storia');
  const storia = state.storia;
  if (!storia) {
    sezione.innerHTML = '';
    return;
  }
  const passi = passiStoria(storia).map((passo) => `<li class="${passo.fase}" ${passo.fase === 'corso' ? 'aria-current="step"' : ''}><strong>${esc(passo.titolo)}</strong><span>${esc(passo.testo)}</span></li>`).join('');
  const azione = azioneStoria(storia);
  const attributi = `${azione.attore ? `data-attore="${esc(azione.attore)}" ` : ''}data-vai="${esc(azione.vai)}"`;
  const nota = storia.richiesta?.decisione?.nota
    ? `<p>Germany’s note: ${esc(storia.richiesta.decisione.nota)}</p>`
    : '';
  sezione.innerHTML = `<div class="storia-interno">
    <div>
      <p class="sopra">Demo story</p>
      <h2>From Germany to the Netherlands</h2>
      <p>Germany publishes contacts from the southern Baltic sensor network. The Netherlands discovers them, requests access, and, after Germany agrees, uses them here.</p>
      ${nota}
    </div>
    <ol class="passi">${passi}</ol>
    <button type="button" class="azione" ${attributi}>${esc(azione.etichetta)}</button>
  </div>`;
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
    if (!window.confirm('Reset the demonstration data? Requests already entered will be deleted.')) return;
    conOccupazione(async () => {
      await api('/api/demo/ripristino', { method: 'POST', body: '{}' });
      messaggio('Demonstration data restored. The Germany → Netherlands story starts over.');
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
    const esito = form.dataset.form === 'revoca' ? 'revocata' : evento.submitter?.dataset.esito;
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
        approvata: 'Grant recorded. The requester can use the extract.',
        respinta: 'Request denied. The extract stays closed.',
        revocata: 'Grant revoked. Use stops at once.',
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
