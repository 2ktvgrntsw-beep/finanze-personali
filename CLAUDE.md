# CLAUDE.md — Finanze Personali (PWA)

Guida per chi (umano o agente) modifica questo repository. Leggerla per intero
prima di toccare il codice.

## Cos'è

PWA di finanze personali **offline-first e privata**: nessun server, nessun build
step, nessun bundler, nessun `package.json`. HTML + CSS + moduli ES nativi serviti
come file statici (GitHub Pages, branch `main`, cartella root). Tutti i dati
dell'utente vivono in **IndexedDB** sul dispositivo (uso principale: iPhone,
"Aggiungi a Home"). Lingua del codice, dei commenti e dell'interfaccia: italiano.

Dipendenze esterne: solo **SheetJS** (`xlsx 0.18.5`) da cdnjs, caricato in
`index.html` per backup/import Excel e messo in cache dal service worker
(stale-while-revalidate, cache `<CACHE_VERSION>-cdn`). Il parsing dei PDF
(bollette, buste paga) è fatto in casa, senza librerie.

## Architettura

Flusso di avvio (`js/app.js` → `boot()`):

1. `openDB()` — apre/aggiorna IndexedDB (`js/core/db.js`, `DB_VERSION` + dichiarazione
   centralizzata `STORES`; l'upgrade crea solo store/indici mancanti, mai distruttivo).
2. Seed dei dati di app: `seedStoricoSeNecessario`, `seedBolletteSeNecessario`,
   `seedConsumiMensiliSeNecessario`, `seedStipendiSeNecessario`.
3. `refreshAll()` — carica tutto in memoria in `state` (`js/core/store.js`) e
   ricostruisce gli indici derivati (`_idxMovByMese`, `_idxContoByNome`).
4. Rilevamento perdita dati + eventuale ripristino dal backup automatico interno.
5. Allineamenti idempotenti: conto di default, prestiti → ricorrenze, ricorrenze scadute.
6. Migrazioni una tantum (strumenti, plusvalenze, natura) in `try/catch`: un errore
   non deve impedire l'avvio.
7. Chrome (header + bottom nav), registrazione rotte, `initRouter()`.
8. Backup automatico interno (non bloccante) e registrazione del service worker.

Livelli (dipendenze solo verso il basso):

- **components/** — schermate. Ognuna esporta `renderXxx(root, params)`, scrive
  HTML in `root` e legge da `state` / chiama i service. Niente calcoli di dominio qui.
- **services/** — logica di dominio pura (calcoli, aggregazioni, CRUD). Testabile
  in Node riempiendo `state` a mano, senza IndexedDB.
- **core/** — infrastruttura: DB, stato, router, utility, icone, seed e dati seed.

Routing: hash-based, `#/nome?chiave=valore` (`js/core/router.js`). Rotta sconosciuta
→ `spese`. `_updateChrome()` decide header/nav per ogni rotta (liste
`ROTTE_PRINCIPALI` e `senzaPiu`): una nuova schermata va registrata in
`registraRotte()` in `app.js` e, se serve, aggiunta a quelle liste.

Scritture su DB: usare `safeWrite(op, messaggio)` di `db.js` per le scritture
avviate dall'utente (una scrittura fallita in silenzio è il bug peggiore).

## Struttura delle cartelle

```
index.html            entry point (carica SheetJS da CDN e js/app.js come modulo)
manifest.json         manifest PWA (icone con ?v=216)
service-worker.js     cache offline: CACHE_VERSION + array ASSETS
css/styles.css        tema unico
data/storico.js       storico movimenti/conti/categorie precaricato (seed iniziale)
icons/                icone PWA 192/512
js/app.js             bootstrap, rotte, chrome
js/core/
  db.js               IndexedDB: STORES, DB_VERSION, dbAdd/dbGet/dbAll/dbBulkPut, safeWrite
  store.js            state in memoria, refreshAll, subscribe, indici
  router.js           routing hash, aggiornamento header/nav
  utils.js            formattazione €, date locali (toISO, todayISO, annomese...), uid, toast
  version.js          APP_VERSION (unica fonte di verità della versione)
  icons.js, sparkline.js
  seed*.js            logica di seed/migrazione dei dati di app
  *SeedData.js        dati seed (stipendi, bollette, consumi mensili)
  dichiarazioni.js    730 per anno, scaglioni IRPEF storici, plafond previdenza
  fiscoUfficiale.js   dati fiscali ufficiali (CU)
js/services/          logica di dominio (movimenti, conti, patrimonio, prestiti,
                      ricorrenti, bilancio, fisco, natura, strumenti, stipendi,
                      energia, panieri, suggerimenti, backup, excel, pdf*)
js/components/        schermate + shared.js (sheet, conferma, tastierino, riga movimento...)
tests/unit.mjs        test di logica pura in Node
```

Moduli condivisi da riusare prima di scrivere codice nuovo: `core/utils.js`
(formati e date), `components/shared.js` (UI comune), e le "fonti uniche" dichiarate
nei service, ad es. `strumentiService.js` (il versato),
`attribuzioneInvestimenti.js` (attribuzione dei trasferimenti di investimento),
`naturaService.js` (bisogni/desideri), `bilancioService.js` (tasso di risparmio).

## Comandi

Avviare l'app in locale (serve HTTP: i moduli ES non funzionano da `file://`):

```bash
python3 -m http.server 8000
```

poi aprire `http://localhost:8000/`. Attenzione al service worker in cache-first:
durante lo sviluppo usare una finestra anonima o "Bypass for network" nei DevTools,
altrimenti si vede il codice vecchio.

Test di logica pura (versioni, date, fisco, bilancio, ammortamenti, seed, asset SW):

```bash
node tests/unit.mjs
```

Collaudo Playwright nel browser vero (~10 s, nessuna installazione: usa la
libreria `playwright` e il Chromium già presenti; non eseguire `playwright install`):

```bash
node tests/e2e.mjs
```

Lo script avvia da sé un server statico sulla radice del repo, apre l'app su un
profilo pulito (viewport iPhone, fuso Europe/Rome) con internet bloccato e
verifica:
- ogni file in `ASSETS` del service worker risponde 200;
- il primo avvio carica storico, buste paga, bollette, consumi e conti senza
  errori JavaScript;
- il secondo avvio non duplica nessun record (seed e migrazioni idempotenti);
- ogni rotta registrata in `app.js` si apre senza eccezioni, senza schermata
  vuota e senza `NaN`/`undefined` a video (le schermate di dettaglio ricevono id
  presi dai dati veri);
- con il service worker attivo l'app riparte senza rete.

Rotte e asset sono letti dai sorgenti: una nuova schermata registrata in
`registraRotte()` viene collaudata automaticamente. Se richiede parametri,
aggiungerli alla tabella `PARAMETRI` in `tests/e2e.mjs`.

Prima di ogni consegna devono passare **entrambi**: `node tests/unit.mjs` e la
suite Playwright.

## Regole di rilascio

1. **Versione sempre allineata.** A ogni consegna incrementare INSIEME
   `APP_VERSION` in `js/core/version.js` (es. `'3.43'`) e `CACHE_VERSION` in
   `service-worker.js` (es. `'finanze-v3.43.0'`). Se non cambia `CACHE_VERSION` i
   telefoni continuano a servire il codice vecchio dalla cache e il rilascio
   "non avviene". Il primo test di `tests/unit.mjs` verifica la coerenza.
   Il bump serve quando cambia qualcosa che arriva sul telefono (file in `ASSETS`);
   una consegna che tocca solo test o documentazione non lo richiede.

2. **Ogni nuovo file va in `ASSETS`.** Qualsiasi nuovo file servito (JS, CSS, dati,
   icone) va aggiunto all'array `ASSETS` di `service-worker.js`, altrimenti offline
   l'app si rompe. Se si rinomina o elimina un file, aggiornare anche `ASSETS`.

3. **Niente logica di business duplicata.** Se un calcolo serve in due punti, va
   estratto in un modulo condiviso (un service in `js/services/` o `core/utils.js`)
   e importato da entrambi. I componenti non ricalcolano ciò che un service già
   calcola. Prima di scrivere una funzione, cercare se esiste già.

4. **Migrazione dei dati basata su fingerprint (impronta).** I dati di app che
   arrivano col codice (seed) devono raggiungere anche i dispositivi che li hanno
   già seminati. Un flag "già fatto" in `meta` NON basta: l'aggiornamento non
   arriverebbe mai. Schema da seguire (vedi `seedStipendi.js`, `seedBollette.js`
   e `seedConsumiMensili.js`):
   - calcolare un'impronta del contenuto atteso (es. numero record + somme dei campi
     chiave) che cambia da sola quando cambiano i dati seed;
   - a ogni avvio confrontarla con l'impronta dei dati presenti; se differisce,
     riallineare con un unico `dbBulkPut` e solo DOPO eliminare i record obsoleti
     (mai uno stato con lo store vuoto);
   - i record corretti a mano dall'utente (`manuale: true`, o `origine: 'manuale'`
     per le bollette) escono da entrambi i lati del confronto e non vengono mai
     sovrascritti;
   - i record del seed cancellati dall'utente vanno ricordati (lista in `meta`, vedi
     `registraBollettaCancellata`), altrimenti il seed li fa ricomparire;
   - salvare l'impronta in `meta`; tenere la decisione in una funzione pura
     (come `pianoSeed`) e coprirla con test in `tests/unit.mjs`.

   **Prima chiedersi di chi è il dato.** L'impronta vale solo per i dati che
   restano *dell'app* (buste paga, bollette, consumi precaricati). NON va usata per
   i dati che dopo il primo caricamento sono diventati *dell'utente*, che li
   modifica, cancella e riclassifica: lo storico movimenti (`seed.js`), gli strumenti
   di investimento e la classificazione bisogni/desideri. Lì l'impronta riporterebbe
   in vita record cancellati e annullerebbe le correzioni. Per loro: flag "una
   tantum" per la sistemazione iniziale e, se un giorno serve correggere un dato,
   una **correzione mirata** (per id, una volta sola, con il suo flag e il suo test).
   Per cambi di schema IndexedDB: incrementare `DB_VERSION` e aggiungere lo store
   in `STORES` (l'upgrade è additivo) e, se serve, in `refreshAll()`/`state` e nel
   backup/export.

5. **Mai push su `main`.** Lavorare sempre su un branch dedicato e consegnare
   aprendo una pull request verso `main`: il merge lo fa l'utente.

6. **Un commit per consegna, test verdi prima di consegnare.** Ogni consegna è un
   singolo commit che contiene modifiche + bump di versione. Non consegnare con
   `node tests/unit.mjs` o la suite Playwright in rosso. Per ogni bug corretto
   aggiungere un test di regressione.

7. **Note di consegna chiare.** Ogni consegna ha note (nel messaggio di commit e
   nel riepilogo all'utente) con: versione, cosa cambia per l'utente, e per **ogni
   bug corretto la causa** (perché succedeva, non solo il sintomo) e come è stato
   risolto. Esempio: "Le rate del mutuo finivano nel mese precedente: `toISOString()`
   converte in UTC e in Italia la mezzanotte locale cade nel giorno prima. Ora le
   date passano da `toISO()` (giorno locale)."

## Trappole note

- **Date:** mai `toISOString().slice(...)` per costruire date (fuso UTC → giorno
  sbagliato). Usare `toISO`, `todayISO`, `toAnnomese` di `core/utils.js`. Un test
  scansiona i sorgenti e fallisce se ricompare.
- **Backup Excel simmetrico:** tutto ciò che si esporta deve potersi reimportare
  (`excelService.js`). Un nuovo store/campo va gestito in export e import.
- **Il backup non include i flag di `meta`:** dopo un ripristino le migrazioni
  devono basarsi sui dati (impronta), non sui flag.
- **Scaglioni IRPEF storici:** ogni anno usa i suoi (`scaglioniDi(anno)`).
- **Cache del service worker:** cache-first sugli asset locali; senza bump di
  `CACHE_VERSION` nessuna modifica arriva sul telefono.
