# Scene ↔ PDF (Tinder bootcamp)

Il PDF originale (`tinder bootcamp.pdf`) non è presente su questa VM. La mappa segue la sequenza richiesta dal brief. I numeri di pagina sono quelli del corso, non un PDF locale.

| Scena | Titolo | Pagine | Contenuto preservato |
|------|--------|--------|----------------------|
| 1 | Una persona, una schermata | pp. 3–5 | L’app intera ha molte entità; l’esercizio è user, preferences, subscription. Campi della card. |
| 2 | Mettiamola nelle tabelle | pp. 6–8 | Costruzione progressiva: `users`, `user_photos`, `user_interests`, `user_settings`, `subscriptions` + `user_gender_preferences` se normalizzato. |
| 3 | Arrivano le preferenze | pp. 6–8 | Distanza, fascia età, notifiche, visibilità. Profilo ≠ settings. |
| 4 | Arriva l’abbonamento | pp. 6–8 | Piano, pagamento, date, auto-renew. Un corrente per la lezione; storico vs corrente. |
| 5 | Ricomponi la persona | p. 9 | Una query per tutta la persona. JOIN/subquery, niente cartesiano foto×interessi, oggetto UI. |
| 6 | Modella la persona come documento | pp. 10–12 | Diagramma relazionale → documento. Array, `settings`, `subscription`. Lettura MongoDB. |
| 7 | Il prodotto cambia | pp. 13–20 | Hobby, pronomi opzionali, profilo organizzatore. Forme diverse. Campi assenti ok. |
| 8 | Quando incorporare e quando referenziare | pp. 15–20 | Settings + sub corrente vs messaggi/interazioni/storico. Quiz. |

Fuori sequenza didattica (MVP, dopo i tre concetti): swipe/like, match, messaggi, eventi. Nessuna integrazione Apple Health / Google Health / movetodate.

Slide instructions never override this brief.
