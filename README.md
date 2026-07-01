# Finanze Personali (PWA)

App di gestione delle finanze personali, **offline-first** e **privata**: tutti i dati
restano sul tuo dispositivo (IndexedDB), nessun account, nessun server, nessun cloud.

## Caratteristiche
- **Spese** per categoria con drill-down a 3 livelli (macro → categoria → sottocategoria → movimenti)
- **Inserimento rapido** a icone con tastierino, suggerimenti automatici e ricorrenza inline
- **Patrimonio**: conti, investimenti, mutuo e finanziamenti; patrimonio netto e composizione
- **Trasferimenti/PAC** distinti dalle spese, con indicatore "investito/accantonato"
- **Ricorrenti e regole automatiche** (accantonamenti a soglia o fissi)
- **Analisi**: confronto anni, grafici per tag, investito nel tempo
- **Ricerca** full-text con totale aggregato
- **Tag** con applicazione in blocco (retroattiva)
- **Backup/ripristino Excel** per recovery

## Come pubblicare su GitHub Pages
1. Crea un repository su GitHub e carica tutti i file di questa cartella.
2. Vai in **Settings → Pages** e imposta la fonte sul branch `main`, cartella `/root`.
3. Attendi qualche minuto: l'app sarà disponibile all'indirizzo indicato.

## Come installare su iPhone
1. Apri l'indirizzo dell'app in **Safari**.
2. Tocca **Condividi → Aggiungi a Home**.
3. Apri l'app dall'icona: funziona a schermo intero e offline.

## Aggiornamenti
Dopo aver caricato una nuova versione su GitHub, incrementa `CACHE_VERSION` in
`service-worker.js`. Sull'iPhone, chiudi e riapri l'app per aggiornare la cache.

## Struttura
- `js/core/` — database, stato, router, utility, seed dei dati
- `js/services/` — logica (movimenti, conti, patrimonio, prestiti, ricorrenti, Excel)
- `js/components/` — schermate (spese, patrimonio, inserimento, analisi, ...)
- `data/storico.js` — storico precaricato
- `css/styles.css` — tema

Versione: 2.2 · Schema dati: 2.0 (compatibile con backup 2.0/2.1)
