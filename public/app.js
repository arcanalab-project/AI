const state = {
  actor: localStorage.getItem('catalogo-attore') || 'NLD',
  fornitori: [],
  storia: null,
};

let silenzioso = false;
let occupato = false;

const STATI = {
  in_attesa: 'In attesa',
  approvata: 'Approvata',
  respinta: 'Respinta',
  revocata: 'Revocata',
};

const COLONNE = {
  etichetta: 'Contatto',
  stazione: 'Stazione',
  porto: 'Porto',
  nodo: 'Nodo',
  sito: 'Sito',
  settore: 'Settore',
  area: 'Area',
  tratto: 'Tratto',
  beacon: 'Beacon',
  scena: 'Scena',
  osservato: 'Osservato',
  tipo: 'Tipo',
  categoria: 'Categoria',
  stato: 'Stato',
  condizione: 'Condizione',
  latitude: 'Latitudine',
  longitude: 'Longitudine',
  velocitaNodi: 'Velocità (nodi)',
  affidabilita: 'Affidabilità',
  ventoNodi: 'Vento (nodi)',
  visibilitaKm: 'Visibilità (km)',
  statoMare: 'Stato del mare',
  arrivi: 'Arrivi',
  partenze: 'Partenze',
  transiti: 'Transiti',
  traccia: 'Tracce',
  quota: 'Quota (piedi)',
  copertura: 'Copertura',
  livelloMetri: 'Livello (m)',
  avviso: 'Avviso',
  annotazione: 'Nota',
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
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'UTC' }).format(data);
}

function formattaValore(chiave, valore) {
  if (valore == null || valore === '') return '—';
  if (chiave === 'affidabilita' && typeof valore === 'number') {
    return new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 0 }).format(valore);
  }
  if (chiave === 'osservato') {
    const data = new Date(valore);
    if (!Number.isNaN(data.getTime())) {
      return `${new Intl.DateTimeFormat('it-IT', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(data)} UTC`;
    }
  }
  if (typeof valore === 'number') {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(valore);
  }
  return String(valore);
}

function classeLivello(livello) {
  return livello === 'aperto' ? 'aperto' : 'riservato';
}

function etichettaLivello(livello) {
  return livello === 'aperto' ? 'Aperto' : 'Riservato';
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
    const errore = new Error(corpo.errore || 'Richiesta non riuscita.');
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
  contenuto.innerHTML = '<p class="caricamento">Caricamento…</p>';
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
  document.title = 'Pagina non trovata — Catalogo federato';
  return `<section class="blocco" style="padding:1rem"><h1>Pagina non trovata</h1><p><a href="/" data-link>Torna alle nazioni</a></p></section>`;
}

async function vistaHome() {
  const dati = await api('/api/fornitori');
  state.fornitori = dati.fornitori;
  riempiSelettore();
  document.title = 'Nazioni fornitrici — Catalogo federato';
  const schede = dati.fornitori.map((nazione) => {
    const evidenza = nazione.codice === 'DEU' ? ' evidenza' : '';
    const conteggi = nazione.conteggi || { totale: 0, aperti: 0, riservati: 0 };
    return `<article class="scheda${evidenza}">
      <a href="/nazioni/${esc(nazione.codice)}" data-link>
        <span class="bandiera" aria-hidden="true">${esc(nazione.bandiera)}</span>
        <p class="ruolo">Fornitore di dati</p>
        <h2>${esc(nazione.nome)}</h2>
        <p class="sintesi">${esc(nazione.profilo.sintesi)}</p>
        <p class="conteggi">
          <span class="badge neutro">${conteggi.totale} prodotti</span>
          <span class="badge aperto">${conteggi.aperti} aperti</span>
          <span class="badge riservato">${conteggi.riservati} riservati</span>
        </p>
      </a>
    </article>`;
  }).join('');
  return `<section>
    <p class="sopra">Scoperta tra nazioni</p>
    <h1>I paesi sono fornitori, non prodotti</h1>
    <p class="lede">Ogni nazione partecipante ha un profilo proprio e pubblica più prodotti di dati. Si scoprono metadati e politiche di accesso. Il dato resta di chi lo pubblica: un dataset aperto si usa subito, uno riservato solo se il proprietario approva la richiesta.</p>
    <ul class="principi">
      <li><strong>Scoperta federata</strong> I metadati si consultano tra le nazioni. L’estratto non viaggia con la scheda.</li>
      <li><strong>Sovranità nazionale</strong> Sul riservato decide il proprietario, che può anche revocare una concessione già data.</li>
      <li><strong>Condivisione controllata</strong> Il server rilascia i record solo se la politica, in quel momento, lo consente.</li>
    </ul>
    <h2>Nazioni nel catalogo</h2>
    <div class="griglia">${schede}</div>
  </section>`;
}

async function vistaNazione(codice) {
  const dati = await api(`/api/fornitori/${codice}`);
  const nazione = dati.fornitore;
  document.title = `${nazione.nome} — Catalogo federato`;
  const storiaId = state.storia?.prodottoId;
  const righe = dati.prodotti
    .slice()
    .sort((a, b) => {
      if (a.id === storiaId) return -1;
      if (b.id === storiaId) return 1;
      return a.titolo.localeCompare(b.titolo, 'it');
    })
    .map((prodotto) => {
      const evidenza = prodotto.id === storiaId ? ' evidenza' : '';
      const nastro = prodotto.id === storiaId ? ' · percorso demo' : '';
      return `<a class="riga${evidenza}" href="/prodotti/${esc(prodotto.id)}" data-link>
        <span class="badge ${classeLivello(prodotto.livello)}">${etichettaLivello(prodotto.livello)}</span>
        <strong>${esc(prodotto.titolo)}</strong>
        <em>${esc(prodotto.dominio)}${esc(nastro)}</em>
        <span>${esc(prodotto.sintesi)}</span>
      </a>`;
    }).join('');
  return `<section>
    <p class="briciole"><a href="/" data-link>Nazioni</a> / ${esc(nazione.nome)}</p>
    <p class="bandiera" aria-hidden="true">${esc(nazione.bandiera)}</p>
    <p class="ruolo">Fornitore di dati · ${esc(nazione.profilo.nomeUfficiale)}</p>
    <h1>${esc(nazione.nome)}</h1>
    <div class="profilo">
      <div>
        <p class="lede">${esc(nazione.profilo.sintesi)}</p>
        <dl>
          <dt>Capitale</dt><dd>${esc(nazione.profilo.capitale)}</dd>
          <dt>Ufficio dati</dt><dd>${esc(nazione.profilo.ufficioDati)}</dd>
          <dt>Contatto</dt><dd><a href="mailto:${esc(nazione.profilo.email)}">${esc(nazione.profilo.email)}</a></dd>
          <dt>Prodotti</dt><dd>${nazione.conteggi.totale}, di cui ${nazione.conteggi.aperti} aperti e ${nazione.conteggi.riservati} riservati</dd>
        </dl>
      </div>
      <blockquote class="citazione">
        <p>${esc(nazione.sovranita.dichiarazione)}</p>
        <span class="badge neutro">Giurisdizione ${esc(nazione.sovranita.giurisdizione)}</span>
      </blockquote>
    </div>
    <h2>Prodotti pubblicati</h2>
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
  return `<table class="campi"><thead><tr><th>Campo</th><th>Descrizione</th></tr></thead><tbody>${righe}</tbody></table>`;
}

function pannelloAccesso(prodotto, accesso) {
  const politica = prodotto.politicaAccesso;
  const nome = prodotto.fornitore.nome;
  const finalita = politica.finalitaAmmesse.map((voce) => `<li>${esc(voce)}</li>`).join('');
  let corpo;
  if (politica.livello === 'aperto') {
    corpo = `<p>Dataset aperto pubblicato da ${esc(nome)}. Si usa senza richiesta.</p>
      <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Usa il dataset</a></p>`;
  } else if (state.actor === prodotto.fornitore.codice) {
    corpo = `<p>Sei il proprietario. L’estratto resta tuo: puoi consultarlo e decidere le richieste delle altre nazioni.</p>
      <div class="azioni-riga">
        <a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Apri il tuo estratto</a>
        <a class="bottone secondario" href="/richieste" data-link>Vedi le richieste</a>
      </div>`;
  } else if (!accesso.richiesta || accesso.richiesta.stato === 'respinta' || accesso.richiesta.stato === 'revocata') {
    const precedente = accesso.richiesta
      ? `<p>Stato precedente: ${esc(STATI[accesso.richiesta.stato] || accesso.richiesta.stato)}. ${esc(accesso.richiesta.decisione?.nota || '')}</p>`
      : '<p>Non hai ancora una richiesta su questo prodotto. L’estratto resta chiuso.</p>';
    corpo = `${precedente}
      <form data-form="richiesta" data-prodotto="${esc(prodotto.id)}">
        <label>Finalità della richiesta
          <textarea name="finalita" required minlength="12" maxlength="500" placeholder="Perché ${esc(nome)} dovrebbe concederti l’uso, e per quale scopo."></textarea>
        </label>
        <button type="submit">Richiedi accesso a ${esc(nome)}</button>
      </form>`;
  } else if (accesso.richiesta.stato === 'in_attesa') {
    corpo = `<p>Richiesta inviata il ${esc(dataLunga(accesso.richiesta.richiestaIl))}. ${esc(nome)} non ha ancora deciso. Finalità dichiarata: ${esc(accesso.richiesta.finalita)}</p>
      <p>L’estratto non viene rilasciato finché il proprietario non approva.</p>
      <button type="button" data-attore="${esc(prodotto.fornitore.codice)}" data-vai="/richieste">Apri la coda di ${esc(nome)}</button>`;
  } else {
    corpo = `<p>Accesso concesso da ${esc(nome)}. La concessione è revocabile: se il proprietario la chiude, l’uso si interrompe.</p>
      <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}/uso" data-link>Usa il dataset</a></p>`;
  }
  return `<aside class="pannello">
    <p class="ruolo">Politica di accesso</p>
    <h2>${etichettaLivello(politica.livello)}</h2>
    <p>${esc(politica.condizioni)}</p>
    <p><strong>Finalità ammesse</strong></p>
    <ul>${finalita}</ul>
    <p><strong>Ridistribuzione.</strong> ${esc(politica.ridistribuzione)}</p>
    <p><strong>Conservazione.</strong> ${esc(politica.conservazione)}</p>
    <p class="nota-estratto">I record non sono in questa scheda. Stanno in un estratto separato e il server lo legge solo dopo il controllo della politica.</p>
    ${corpo}
  </aside>`;
}

async function vistaProdotto(id) {
  const dati = await api(`/api/prodotti/${id}`);
  const prodotto = dati.prodotto;
  const meta = prodotto.metadati;
  document.title = `${prodotto.titolo} — Catalogo federato`;
  const fine = meta.fineTemporale ? esc(meta.fineTemporale) : 'in corso';
  return `<article class="dossier">
    <p class="briciole"><a href="/" data-link>Nazioni</a> / <a href="/nazioni/${esc(prodotto.fornitore.codice)}" data-link>${esc(prodotto.fornitore.bandiera)} ${esc(prodotto.fornitore.nome)}</a></p>
    <p class="dominio">${esc(prodotto.dominio)}</p>
    <h1>${esc(prodotto.titolo)}</h1>
    <p class="lede">${esc(prodotto.sintesi)}</p>
    <div class="griglia-dossier">
      <section>
        <h2>Metadati</h2>
        <dl>
          <dt>Fornitore</dt><dd>${esc(prodotto.fornitore.nome)}</dd>
          <dt>Pubblicato il</dt><dd>${esc(dataLunga(prodotto.pubblicatoIl))}</dd>
          <dt>Formato</dt><dd>${esc(meta.formato)}</dd>
          <dt>Aggiornamento</dt><dd>${esc(meta.frequenzaAggiornamento)}</dd>
          <dt>Copertura</dt><dd>${esc(meta.coperturaSpaziale)}</dd>
          <dt>Periodo</dt><dd>${esc(meta.inizioTemporale)} — ${fine}</dd>
          <dt>Lingua d’origine</dt><dd>${esc(meta.lingua)}</dd>
          <dt>Responsabile</dt><dd>${esc(meta.responsabile)}</dd>
          <dt>Qualità</dt><dd>${esc(meta.qualita)}</dd>
        </dl>
        <h3>Campi</h3>
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
  return `<div class="mappa-wrap"><svg class="mappa" viewBox="0 0 ${larghezza} ${altezza}" role="img" aria-label="Posizione dei contatti autorizzati">
    <rect width="${larghezza}" height="${altezza}" fill="#e7eef2"></rect>
    <text x="24" y="28">Area dell’estratto</text>
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
    return 'Dataset aperto: uso diretto, senza richiesta di accesso.';
  }
  if (motivo === 'proprietario') {
    return 'Stai consultando un estratto del tuo paese. Resta sotto la tua sovranità e non risulta una concessione verso terzi.';
  }
  return `Concessione attiva di ${dati.prodotto.fornitore.nome}. Il proprietario può revocarla dalla coda delle richieste: a quel punto questi record non vengono più consegnati.`;
}

function paginaUso(dati) {
  const record = dati.estratto.record || [];
  const superficie = record.filter((voce) => voce.tipo === 'superficie').length;
  const sotto = record.filter((voce) => voce.tipo === 'subacqueo').length;
  const mappaHtml = dati.estratto.vista === 'mappa' ? mappa(record) : '';
  const statistiche = dati.estratto.vista === 'mappa'
    ? `<div class="statistiche">
        <div><strong>${record.length}</strong>contatti nell’estratto</div>
        <div><strong>${superficie}</strong>di superficie</div>
        <div><strong>${sotto}</strong>subacquei</div>
      </div>`
    : `<div class="statistiche"><div><strong>${record.length}</strong>record nell’estratto</div></div>`;
  return `<article>
    <p class="briciole"><a href="/prodotti/${esc(dati.prodotto.id)}" data-link>Scheda del prodotto</a></p>
    <p class="dominio">Uso dell’estratto · ${esc(dati.prodotto.fornitore.bandiera)} ${esc(dati.prodotto.fornitore.nome)}</p>
    <h1>${esc(dati.prodotto.titolo)}</h1>
    <p class="lede">${esc(testoUso(dati))}</p>
    <p>${esc(dati.estratto.descrizione)}</p>
    ${statistiche}
    ${mappaHtml}
    ${tabellaRecord(record)}
  </article>`;
}

async function vistaUso(id) {
  document.title = 'Uso dell’estratto — Catalogo federato';
  try {
    const dati = await api(`/api/prodotti/${id}/uso`);
    document.title = `Uso · ${dati.prodotto.titolo} — Catalogo federato`;
    return paginaUso(dati);
  } catch (errore) {
    if (errore.status === 403 && errore.body?.prodotto) {
      const prodotto = errore.body.prodotto;
      document.title = `Estratto chiuso · ${prodotto.titolo} — Catalogo federato`;
      return `<section class="chiuso">
        <p class="briciole"><a href="/prodotti/${esc(prodotto.id)}" data-link>Torna ai metadati</a></p>
        <p class="dominio">${esc(prodotto.fornitore.bandiera)} ${esc(prodotto.fornitore.nome)}</p>
        <h1>Estratto non rilasciato</h1>
        <p>${esc(errore.message)}</p>
        <p>La scheda con metadati e politica resta consultabile. I record no.</p>
        <p><a class="bottone" href="/prodotti/${esc(prodotto.id)}" data-link>Apri la scheda</a></p>
      </section>`;
    }
    throw errore;
  }
}

function cartaRichiesta(richiesta, ruolo) {
  const evidenza = richiesta.prodottoId === state.storia?.prodottoId && (richiesta.richiedenteId === 'NLD' || richiesta.proprietarioId === 'DEU')
    ? ' evidenza'
    : '';
  const nastro = evidenza ? '<span class="badge neutro">Percorso guidato</span>' : '';
  let comandi = '';
  if (ruolo === 'in-arrivo' && richiesta.stato === 'in_attesa') {
    comandi = `<form data-form="decisione" data-id="${esc(richiesta.id)}">
      <label>Nota per ${esc(richiesta.nomeRichiedente)}
        <textarea name="nota" maxlength="500" placeholder="Facoltativa se approvi. Obbligatoria, e chiara, se respingi."></textarea>
      </label>
      <div class="azioni-riga">
        <button type="submit" data-esito="approvata">Approva</button>
        <button type="submit" class="secondario" data-esito="respinta">Respingi</button>
      </div>
    </form>`;
  } else if (ruolo === 'in-arrivo' && richiesta.stato === 'approvata') {
    comandi = `<form data-form="revoca" data-id="${esc(richiesta.id)}">
      <label>Motivo della revoca
        <textarea name="nota" required minlength="8" maxlength="500" placeholder="Perché chiudi la concessione."></textarea>
      </label>
      <button type="submit" class="pericolo">Revoca la concessione</button>
    </form>`;
  }
  const decisione = richiesta.decisione
    ? `<p>Decisione del ${esc(dataLunga(richiesta.decisione.il))}: ${esc(richiesta.decisione.nota || 'nessuna nota')}</p>`
    : '';
  return `<article class="carta-richiesta${evidenza}">
    <span class="badge ${richiesta.stato === 'approvata' ? 'aperto' : richiesta.stato === 'in_attesa' ? 'neutro' : 'riservato'}">${esc(STATI[richiesta.stato] || richiesta.stato)}</span>
    ${nastro}
    <h3>${esc(richiesta.titoloProdotto)}</h3>
    <p>${ruolo === 'in-arrivo' ? `Da ${esc(richiesta.nomeRichiedente)}` : `Verso ${esc(richiesta.nomeProprietario)}`} · ${esc(dataLunga(richiesta.richiestaIl))}</p>
    <p>${esc(richiesta.finalita)}</p>
    ${decisione}
    ${comandi}
  </article>`;
}

async function vistaRichieste() {
  const dati = await api('/api/richieste');
  const attore = state.fornitori.find((voce) => voce.codice === state.actor);
  document.title = 'Richieste — Catalogo federato';
  const inArrivo = dati.inArrivo.length
    ? dati.inArrivo.map((voce) => cartaRichiesta(voce, 'in-arrivo')).join('')
    : '<p>Nessuna richiesta in arrivo. Quando un’altra nazione chiede un tuo dataset riservato, la decisione compare qui.</p>';
  const inviate = dati.inviate.length
    ? dati.inviate.map((voce) => cartaRichiesta(voce, 'inviate')).join('')
    : '<p>Non hai richieste inviate.</p>';
  return `<section>
    <p class="ruolo">${esc(attore ? `${attore.bandiera} ${attore.nome}` : state.actor)}</p>
    <h1>Richieste di accesso</h1>
    <p class="lede">In arrivo decidi tu, perché i prodotti sono tuoi. Inviate sono le richieste che hai rivolto ad altre nazioni: lo stato lo aggiorna il proprietario.</p>
    <div class="griglia-richieste">
      <section><h2>In arrivo</h2>${inArrivo}</section>
      <section><h2>Inviate</h2>${inviate}</section>
    </div>
  </section>`;
}

function passiStoria(storia) {
  const stato = storia.richiesta?.stato || null;
  const passi = [
    { titolo: 'Scoperta', testo: 'I metadati tedeschi sono nel catalogo.', fase: 'fatto' },
    { titolo: 'Richiesta', testo: 'I Paesi Bassi chiedono l’uso.', fase: 'corso' },
    { titolo: 'Decisione', testo: 'La Germania approva o respinge.', fase: 'attesa' },
    { titolo: 'Uso', testo: 'L’estratto si apre solo dopo il sì.', fase: 'attesa' },
  ];
  if (stato === 'in_attesa') {
    passi[1] = { titolo: 'Richiesta', testo: 'Inviata, in attesa del proprietario.', fase: 'fatto' };
    passi[2] = { titolo: 'Decisione', testo: 'Tocca alla Germania.', fase: 'corso' };
  } else if (stato === 'approvata') {
    passi[1] = { titolo: 'Richiesta', testo: 'Inviata dai Paesi Bassi.', fase: 'fatto' };
    passi[2] = { titolo: 'Decisione', testo: 'La Germania ha concesso l’accesso.', fase: 'fatto' };
    passi[3] = { titolo: 'Uso', testo: 'I Paesi Bassi possono aprire l’estratto.', fase: 'corso' };
  } else if (stato === 'respinta') {
    passi[1] = { titolo: 'Richiesta', testo: 'Si può chiedere di nuovo.', fase: 'corso' };
    passi[2] = { titolo: 'Decisione', testo: 'La Germania ha respinto.', fase: 'fatto' };
  } else if (stato === 'revocata') {
    passi[1] = { titolo: 'Richiesta', testo: 'La concessione non vale più.', fase: 'corso' };
    passi[2] = { titolo: 'Decisione', testo: 'La Germania ha revocato.', fase: 'fatto' };
    passi[3] = { titolo: 'Uso', testo: 'Estratto di nuovo chiuso.', fase: 'attesa' };
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
      return { etichetta: 'Opera come i Paesi Bassi', attore: richiedente, vai: `/prodotti/${id}` };
    }
    return { etichetta: 'Apri i sensori tedeschi', vai: `/prodotti/${id}` };
  }
  if (stato === 'in_attesa') {
    if (state.actor !== proprietario) {
      return { etichetta: 'Passa alla Germania per decidere', attore: proprietario, vai: '/richieste' };
    }
    return { etichetta: 'Apri le richieste in arrivo', vai: '/richieste' };
  }
  if (stato === 'approvata') {
    if (state.actor !== richiedente) {
      return { etichetta: 'Torna ai Paesi Bassi', attore: richiedente, vai: `/prodotti/${id}/uso` };
    }
    return { etichetta: 'Usa i dati dei sensori', vai: `/prodotti/${id}/uso` };
  }
  return { etichetta: 'Apri il prodotto', vai: `/prodotti/${id}` };
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
    ? `<p>Nota della Germania: ${esc(storia.richiesta.decisione.nota)}</p>`
    : '';
  sezione.innerHTML = `<div class="storia-interno">
    <div>
      <p class="sopra">Storia dimostrativa</p>
      <h2>Dalla Germania ai Paesi Bassi</h2>
      <p>La Germania pubblica i contatti dei sensori nel Baltico meridionale. I Paesi Bassi li scoprono, chiedono accesso e, dopo il sì tedesco, li usano qui.</p>
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
    if (!window.confirm('Ripristinare i dati dimostrativi? Le richieste inserite verranno cancellate.')) return;
    conOccupazione(async () => {
      await api('/api/demo/ripristino', { method: 'POST', body: '{}' });
      messaggio('Dati dimostrativi ripristinati. La storia Germania → Paesi Bassi riparte dall’inizio.');
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
      messaggio('Richiesta inviata. La decisione spetta alla nazione proprietaria.');
      await render();
    }).catch((errore) => messaggio(errore.message));
    return;
  }
  if (form.dataset.form === 'decisione' || form.dataset.form === 'revoca') {
    evento.preventDefault();
    const esito = form.dataset.form === 'revoca' ? 'revocata' : evento.submitter?.dataset.esito;
    const nota = String(new FormData(form).get('nota') || '').trim();
    if (!esito) {
      messaggio('Scegli se approvare o respingere.');
      return;
    }
    conOccupazione(async () => {
      await api(`/api/richieste/${form.dataset.id}/decisione`, {
        method: 'POST',
        body: JSON.stringify({ esito, nota }),
      });
      const testi = {
        approvata: 'Concessione registrata. Il richiedente può usare l’estratto.',
        respinta: 'Richiesta respinta. L’estratto resta chiuso.',
        revocata: 'Concessione revocata. L’uso si interrompe subito.',
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
    document.querySelector('#contenuto').innerHTML = `<p class="errore">Il catalogo non raggiunge MongoDB. Avvia il database e ricarica la pagina. ${esc(errore.message)}</p>`;
  }
}

avvia();
