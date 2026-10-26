# Bastion, fondazione dati e ricerca

Da leggere in circa 5 minuti. Ritmo calmo, intorno alle 140 parole al minuto.
Le righe fra parentesi quadre non si leggono: servono solo a tenere il tempo.

---

[0:00 — Apertura]

In cinque minuti tengo insieme tre cose. Che cos'è Bastion. Perché MongoDB è la fondazione dati. E come ci si cerca dentro, compresi i PDF, con una ricerca ibrida e con i filtri.

Bastion è il sistema con cui si entra nel corpus. Si carica un documento, si fa una domanda, si restringe il perimetro, si riapre la fonte. MongoDB è il posto in cui quel corpus vive. Il dato su cui si lavora e il dato su cui si cerca sono lo stesso dato. Se restano allineati, la ricerca dice il vero.

[0:40 — Bastion]

Chi usa Bastion vede pratiche, fascicoli, allegati, risposte. Sotto quella superficie la fondazione è una sola. Contenuto, campi strutturati, testo e significato stanno insieme, con la stessa provenienza e con le stesse regole su chi può leggere.

Il modello a documenti regge ciò che in questi sistemi cambia forma. Una pratica di quest'anno ha un campo in più. Un allegato porta un tipo, una data, una classificazione, un ufficio. MongoDB tiene tutto nello stesso documento, senza costringere il corpus in uno schema rigido e senza spargerlo su archivi diversi.

Un aggiornamento è un aggiornamento. Vale per il dato operativo, per il testo indicizzato e per il vettore. La sicurezza resta sul dato: chi può leggerlo può cercarlo, dentro il perimetro che gli è stato dato.

[1:40 — Upload dei PDF]

L'upload dei PDF percorre la stessa strada del resto dei dati.

Si carica il file. Se il testo è selezionabile, lo estraiamo. Se è una scansione, passa da un riconoscimento del testo, l'OCR: una pagina illeggibile resta fuori dalla ricerca. Poi lo spezziamo in brani abbastanza corti da essere citabili, con una piccola sovrapposizione, così un concetto tagliato tra due pagine resta trovabile.

Ogni brano diventa un documento come gli altri. Lo scriviamo, lo indicizziamo per le parole e gli calcoliamo l'embedding, nella stessa ingestione di un dato nato già strutturato. Porta il testo, il vettore, e i metadati che non vanno persi: nome del file, numero di pagina, data, tipo, lingua, ente, classificazione, fascicolo, stato. Il PDF originale resta agganciato al brano. Dalla risposta si torna alla pagina, con la fonte ancora attaccata.

Quando il file viene sostituito, i brani vecchi escono e arrivano i nuovi. In ricerca resta la versione corrente. Da quel momento il PDF è corpus: stesse query, stessi filtri, stesse regole di vita degli altri dati.

[3:05 — Ricerca ibrida]

La ricerca è ibrida perché le domande vere chiedono due cose diverse, insieme.

La prima è la parola esatta. Un codice, un nominativo, un numero di articolo, una sigla. Lì lavora il full-text: deve trovare quella stringa, con una rilevanza prevedibile. Un vicino di significato, in quel caso, è un errore.

La seconda è il senso. La persona descrive la stessa cosa con altre parole. Lì lavora la ricerca vettoriale, sui brani di testo, PDF compresi. Recupera ciò che è vicino nel significato anche quando le parole non coincidono.

Le due graduatorie si fondono in un'unica lista. Il full-text tiene la precisione. Il vettore tiene le parafrasi. In un corpus documentale servono entrambi, sullo stesso contenuto, nello stesso momento.

[4:05 — Filtri]

I filtri entrano prima di questa classifica, sulla ricerca lessicale e su quella semantica.

Tipo di documento, intervallo di date, fonte, organizzazione, lingua, stato, livello di riservatezza. E qualunque campo strutturato abbiamo deciso di tenere interrogabile: numero di protocollo, anno, mittente. Lo stesso vincolo restringe entrambi i percorsi. Il vettore cerca solo dentro i documenti ammessi. Il full-text fa lo stesso. Un brano vicino nel significato, ma di un altro ufficio, archiviato, o non visibile a quella persona, resta fuori.

In un sistema regolato il filtro è parte della rilevanza. Una risposta buona nel significato e fuori dal perimetro è una risposta sbagliata.

[4:40 — Chiusura]

Bastion è il modo in cui si usa il corpus. MongoDB è la fondazione: un solo posto per il dato, il testo e il significato. I PDF si caricano, si processano e si interrogano come il resto. La ricerca è ibrida, e i filtri valgono prima del ranking.

Se poi c'è un modello, è l'ultimo passo. La qualità sta in quello che recuperiamo: dalla fonte giusta, alla pagina giusta, nel perimetro giusto.
