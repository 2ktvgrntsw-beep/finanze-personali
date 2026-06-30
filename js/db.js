// db.js — accesso a IndexedDB. Un solo punto di verità per nome/versione DB e store.
// NOTA REFACTORING v1.3: DB_VERSION passa da 1 a 2 per aggiungere i nuovi store
// (mutuo, finanziamenti, eventi_straordinari, patrimonio_snapshot) senza perdere dati esistenti.

const DB_NAME = 'FinanzePersonaliDB';
const DB_VERSION = 2;

// Ogni store: key = campo usato come keyPath, indices = [nomeIndice, campo] per query veloci.
const STORES = {
  // --- store storici (v1.0 - v1.2), invariati ---
  movimenti:     { key: 'id', indices: [['data','data'],['tipo','tipo'],['categoria','categoria'],['conto','conto'],['ricorrente_id','ricorrente_id']] },
  categorie:     { key: 'id', indices: [['macrocategoria','macrocategoria'],['categoria','categoria'],['attiva','attiva']] },
  conti:         { key: 'id', indices: [['nome','nome'],['tipologia','tipologia']] },
  tag:           { key: 'id', indices: [['nome','nome']] },
  ricorrenti:    { key: 'id', indices: [['attiva','attiva']] },
  budget:        { key: 'id', indices: [['anno','anno'],['mese','mese']] },
  impostazioni:  { key: 'chiave' },
  mapping_excel: { key: 'id' },
  backup:        { key: 'id', indices: [['data_backup','data_backup']] },

  // --- nuovi store v1.3 ---
  mutuo:               { key: 'id' },                                    // dati strutturali mutuo (singolo record)
  finanziamenti:       { key: 'id', indices: [['attivo','attivo']] },    // lista finanziamenti
  eventi_straordinari: { key: 'id', indices: [['riferimento_id','riferimento_id'],['data','data']] }, // estinzioni/anticipi/rinegoziazioni
  patrimonio_snapshot: { key: 'id', indices: [['data','data']] },        // foto mensile del patrimonio netto (per grafico storico)
};

let _db = null;

export const openDB = () => new Promise((resolve, reject) => {
  if (_db) return resolve(_db);
  const req = indexedDB.open(DB_NAME, DB_VERSION);

  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    // Crea solo gli store che non esistono ancora: chi aggiorna da v1.2 a v1.3
    // mantiene intatti movimenti/categorie/conti/ecc. e riceve solo i nuovi store.
    for (const [name, cfg] of Object.entries(STORES)) {
      if (db.objectStoreNames.contains(name)) continue;
      const s = db.createObjectStore(name, { keyPath: cfg.key });
      (cfg.indices || []).forEach(([idxName, field]) => s.createIndex(idxName, field));
    }
  };

  req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
  req.onerror = (e) => reject(e.target.error);
});

const tx = async (store, mode = 'readonly') =>
  (await openDB()).transaction(store, mode).objectStore(store);

export const dbAdd = async (store, val) => new Promise(async (res, rej) => {
  const s = await tx(store, 'readwrite');
  const r = s.put(val);
  r.onsuccess = () => res(val);
  r.onerror = () => rej(r.error);
});

export const dbGet = async (store, key) => new Promise(async (res, rej) => {
  const s = await tx(store);
  const r = s.get(key);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export const dbAll = async (store) => new Promise(async (res, rej) => {
  const s = await tx(store);
  const r = s.getAll();
  r.onsuccess = () => res(r.result || []);
  r.onerror = () => rej(r.error);
});

export const dbDelete = async (store, key) => new Promise(async (res, rej) => {
  const s = await tx(store, 'readwrite');
  const r = s.delete(key);
  r.onsuccess = () => res(true);
  r.onerror = () => rej(r.error);
}).catch(() => true);

export const dbClear = async (store) => new Promise(async (res, rej) => {
  const s = await tx(store, 'readwrite');
  const r = s.clear();
  r.onsuccess = () => res(true);
  r.onerror = () => rej(r.error);
});

// dbBulkPut: scrive N record in UNA SOLA transazione invece di N transazioni separate.
// Questo è il fix principale di performance per l'import Excel (5.000+ righe):
// la v1.2 chiamava dbAdd() riga per riga (N transazioni), qui se ne usa una sola.
export const dbBulkPut = async (store, items) => {
  if (!items.length) return 0;
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    items.forEach(it => s.put(it));
    t.oncomplete = () => res(items.length);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
};

// Alias retrocompatibile: il vecchio nome usato in v1.2 puntava già a "tutto in una
// transazione" nella firma, ma non lo era nell'uso (vedi importaMovimenti). Si tiene
// l'alias per non rompere eventuali importazioni esterne dello stesso simbolo.
export const dbBulkAdd = dbBulkPut;

export const STORE_NAMES = Object.keys(STORES);
