// db.js — Layer di accesso a IndexedDB.
// Progettato per essere solido e scalabile: ogni "tabella" (store) è dichiarata una
// volta, e l'upgrade è versionato così che futuri aggiornamenti dello schema possano
// aggiungere store/indici senza perdere i dati esistenti dell'utente.

const DB_NAME = 'FinanzePersonaliDB';
const DB_VERSION = 2;   // v2: aggiunto lo store 'bollette' (sezione Energia)

// Dichiarazione centralizzata degli store. Aggiungere qui una nuova voce è tutto
// ciò che serve per introdurre una nuova "tabella" in futuro.
const STORES = {
  movimenti:      { keyPath: 'id', indexes: [
                      { name: 'data', keyPath: 'data' },
                      { name: 'tipo', keyPath: 'tipo' },
                      { name: 'macro', keyPath: 'macro' },
                      { name: 'conto', keyPath: 'conto' },
                      { name: 'annomese', keyPath: 'annomese' },
                  ]},
  conti:          { keyPath: 'id' },
  categorie:      { keyPath: 'id' },
  tag:            { keyPath: 'id' },
  ricorrenti:     { keyPath: 'id' },
  regole:         { keyPath: 'id' },          // regole automatiche (accantonamenti)
  snapshot:       { keyPath: 'id' },          // rilevazioni mensili patrimonio
  mutuo:          { keyPath: 'id' },
  finanziamenti:  { keyPath: 'id' },
  eventiMutuo:    { keyPath: 'id' },          // estinzioni, rinegoziazioni ecc.
  suggerimenti:   { keyPath: 'chiave' },      // motore suggerimenti descrizione->classificazione
  meta:           { keyPath: 'chiave' },      // flag di sistema (es. seed completato)
  bollette:       { keyPath: 'id', indexes: [ // bollette energia elettrica (sezione Energia)
                      { name: 'al', keyPath: 'al' },
                      { name: 'fornitore', keyPath: 'fornitore' },
                  ]},
};

let _db = null;

export const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);

  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    for (const [name, cfg] of Object.entries(STORES)) {
      let store;
      if (!db.objectStoreNames.contains(name)) {
        store = db.createObjectStore(name, { keyPath: cfg.keyPath });
      } else {
        store = e.target.transaction.objectStore(name);
      }
      // Crea gli indici mancanti (idempotente: non li ricrea se già presenti)
      (cfg.indexes || []).forEach(ix => {
        if (!store.indexNames.contains(ix.name)) {
          store.createIndex(ix.name, ix.keyPath, { unique: false });
        }
      });
    }
  };

  req.onsuccess = () => { _db = req.result; resolve(_db); };
  req.onerror = () => reject(req.error);
});

const tx = (store, mode = 'readonly') => _db.transaction(store, mode).objectStore(store);

export const dbAdd = (store, val) => new Promise((res, rej) => {
  const r = tx(store, 'readwrite').put(val);
  r.onsuccess = () => res(val); r.onerror = () => rej(r.error);
});

export const dbGet = (store, key) => new Promise((res, rej) => {
  const r = tx(store).get(key);
  r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
});

export const dbAll = (store) => new Promise((res, rej) => {
  const r = tx(store).getAll();
  r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
});

export const dbCount = (store) => new Promise((res, rej) => {
  const r = tx(store).count();
  r.onsuccess = () => res(r.result || 0); r.onerror = () => rej(r.error);
});

export const dbDelete = (store, key) => new Promise((res, rej) => {
  const r = tx(store, 'readwrite').delete(key);
  r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
});

export const dbClear = (store) => new Promise((res, rej) => {
  const r = tx(store, 'readwrite').clear();
  r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
});

// Bulk put in un'unica transazione: essenziale per caricare i 5.625 movimenti
// dello storico in modo veloce senza bloccare l'interfaccia (una transazione sola,
// non 5.625 transazioni separate).
export const dbBulkPut = (store, items) => new Promise((res, rej) => {
  if (!items || !items.length) return res(0);
  const t = _db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  let n = 0;
  for (const it of items) { os.put(it); n++; }
  t.oncomplete = () => res(n);
  t.onerror = () => rej(t.error);
});

export const STORE_NAMES = Object.keys(STORES);
export const closeDB = () => { if (_db) { _db.close(); _db = null; } };

// ─────────────────────────────────────────────────────────────────────────────
// safeWrite — wrapper per operazioni di SCRITTURA con gestione errori uniforme.
//
// In un'app di finanze una scrittura fallita in silenzio è il bug peggiore: l'utente
// crede di aver salvato un dato che non c'è. IndexedDB può fallire per quota piena,
// storage sfrattato da iOS a metà sessione, transazione abortita da un altro tab.
//
// Uso:
//   const ok = await safeWrite(() => saveMovimento(m), 'Movimento non salvato');
//   if (!ok) return;   // l'utente ha già ricevuto il feedback
//
// Ritorna true se l'operazione è riuscita, false se è fallita (l'errore è già stato
// loggato e notificato). Non rilancia: il chiamante decide cosa fare col booleano.
// ─────────────────────────────────────────────────────────────────────────────
let _onWriteError = (msg, err) => console.error('[safeWrite]', msg, err);

// Permette all'app (che ha accesso al DOM/toast) di iniettare il notificatore utente.
export const setWriteErrorHandler = (fn) => { if (typeof fn === 'function') _onWriteError = fn; };

export const safeWrite = async (operazione, messaggioErrore = 'Salvataggio non riuscito') => {
  try {
    await operazione();
    return true;
  } catch (err) {
    _onWriteError(messaggioErrore, err);
    return false;
  }
};
