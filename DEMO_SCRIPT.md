# Demo script (15–20 min)

Proiezione 1440×900 o 1920×1080. Tab **La lezione**, poi **L’app live**.

Identità compatibili per il match: **Giulia Conti** (Milano) ↔ **Luca Bianchi** (Milano). Non è casuale.

## 0. Reset (1 min)

1. Apri l’app.
2. Tab **L’app live** → **Prepara scenario Giulia ↔ Luca**.
3. Se serve un ambiente pulito: **Reset dataset lezione** e/o **Reset dataset MVP** (conferma: indica esattamente quale `datasetId` viene riseeded).

## 1. Profilo (scene 1–2, ~3 min)

1. Tab **La lezione**. Giulia è al centro.
2. Scena 1: «Quali dati servono per costruire questa schermata?» I campi emergono. Clicca nome, città, foto, interessi: strip di mapping UI → tabella → path documento.
3. Avanti. Scena 2: tabelle `users`, `user_photos`, `user_interests`, `user_settings`, `user_gender_preferences`, `subscriptions`. PK/FK, 1:1 vs 1:N. La tabella extra dei generi non è un CSV.

## 2. Preferenze e abbonamento (scene 3–4, ~3 min)

1. Scena 3: modifica distanza, fascia età, notifiche, visibilità. Salva. Il profilo resta Giulia; cambiano le settings.
2. Apri **Dietro le quinte**: SQL reale su `user_settings`.
3. Scena 4: piano Premium/Gold/Free, stato pagamento demo, date, auto-renew. Una riga corrente; lo storico Free resta `is_current=0`.

## 3. SQL retrieve (scena 5, ~2 min)

1. **Esegui SQL reale**.
2. Una riga, foto e interessi in JSON. Il conteggio «cartesiano ingenuo» è spiegato, non è il risultato usato dalla UI.
3. Mostra che SQLite è il motore della lezione, non un test di velocità contro Atlas.

## 4. Documento (scene 6–7, ~4 min)

1. Scena 6: **Anima righe → documento**, poi **Lettura MongoDB**.
2. Stesso contenuto: `photos[]`, `interests[]`, `settings`, `subscription`. GeoJSON `[lng, lat]`.
3. Scena 7: tre pulsanti — hobby, pronomi, organizzatore. Before/after. Francesca (e altri) restano senza i nuovi campi. La UI non si rompe.

## 5. Quiz (scena 8, ~2 min)

Tre domande: embed vs reference, unbounded arrays, atomicità multi-documento. Rivela dopo la discussione.

## 6. App live (restante tempo)

1. Tab **L’app live**. Badge: Atlas live / embedded / offline.
2. Identità demo **Giulia**. **Profilo**: modifica bio o hobby → Salva. **Refresh** (F5): i dati ci sono ancora.
3. **Preferenze**: stringi la distanza e verifica che Roma (Marco) sparisca; Milano/Monza restano.
4. **Discovery**: Pass/Like. Like ripetuto: niente duplicati (inspector: idempotent-hit).
5. Switch identità → **Luca** → Like a Giulia. Switch → **Giulia** → Like a Luca. Un solo match.
6. Apri il match, invia un messaggio. Switch di nuovo: l’altro lato vede il thread. Ordine persistito.
7. **Dietro le quinte** sull’ultima azione reale (like/match/update), stessa struttura della lezione.
8. Opzionale: **Eventi** — crea un evento; summary limitato sul profilo, documenti in `bootcamp_events`.

Fine: una persona, due modelli, un’app che persiste.
