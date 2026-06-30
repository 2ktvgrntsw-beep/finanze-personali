// state.js — stato globale in memoria, sincronizzato con IndexedDB.
//
// REFACTORING v1.3: oltre agli array "piatti" (uguali alla v1.2, per compatibilità
// con tutto il codice esistente che fa state.movimenti.filter(...)), si mantiene
// anche un indice per-anno e per-anno/mese (state.indici), calcolato una sola volta
// ad ogni refreshAll() invece che ricalcolato a ogni render. Dashboard, Statistiche
// e Patrimonio possono usare l'indice quando serve velocità; il codice esistente
// che usa solo gli array continua a funzionare senza modifiche.

import { dbAll } from './db.js';

export const state = {
  movimenti: [],
  categorie: [],
  conti: [],
  tag: [],
  ricorrenti: [],
  budget: [],
  impostazioni: {},
  // --- nuovi domini v1.3 ---
  mutuo: null,
  finanziamenti: [],
  eventiStraordinari: [],
  patrimonioSnapshot: [],
  // --- indici derivati, ricalcolati ad ogni refreshAll() ---
  indici: { movimentiPerAnno: new Map(), movimentiPerAnnoMese: new Map() },
};

const listeners = new Set();
export const onChange = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
export const notify = () => listeners.forEach(cb => cb(state));

// Costruisce gli indici a partire dall'array movimenti. Costo: un solo passaggio
// O(n) dopo ogni refresh, invece di un O(n) ripetuto ad ogni filtro in ogni componente.
function buildIndici(movimenti) {
  const perAnno = new Map();
  const perAnnoMese = new Map();
  for (const m of movimenti) {
    const anno = Number(String(m.data).slice(0, 4));
    if (!Number.isFinite(anno)) continue;
    const meseKey = String(m.data).slice(0, 7); // 'AAAA-MM'

    if (!perAnno.has(anno)) perAnno.set(anno, []);
    perAnno.get(anno).push(m);

    if (!perAnnoMese.has(meseKey)) perAnnoMese.set(meseKey, []);
    perAnnoMese.get(meseKey).push(m);
  }
  return { movimentiPerAnno: perAnno, movimentiPerAnnoMese: perAnnoMese };
}

export const refreshAll = async () => {
  const [mov, cat, con, tag, ric, bud, imp, mutuoRows, fin, eventi, snap] = await Promise.all([
    dbAll('movimenti'),
    dbAll('categorie'),
    dbAll('conti'),
    dbAll('tag'),
    dbAll('ricorrenti'),
    dbAll('budget'),
    dbAll('impostazioni'),
    dbAll('mutuo'),
    dbAll('finanziamenti'),
    dbAll('eventi_straordinari'),
    dbAll('patrimonio_snapshot'),
  ]);

  state.movimenti = mov;
  state.categorie = cat;
  state.conti = con;
  state.tag = tag;
  state.ricorrenti = ric;
  state.budget = bud;
  state.impostazioni = Object.fromEntries(imp.map(i => [i.chiave, i.valore]));
  state.mutuo = mutuoRows[0] || null; // un solo mutuo gestito in v1.3
  state.finanziamenti = fin;
  state.eventiStraordinari = eventi;
  state.patrimonioSnapshot = snap;
  state.indici = buildIndici(mov);

  notify();
};

// Helper di lettura via indice: per uso interno ai service che vogliono
// evitare di scandire tutto l'array quando serve solo un anno o un mese.
export const movimentiAnno = (anno) => state.indici.movimentiPerAnno.get(Number(anno)) || [];
export const movimentiAnnoMese = (annoMeseStr) => state.indici.movimentiPerAnnoMese.get(annoMeseStr) || [];
