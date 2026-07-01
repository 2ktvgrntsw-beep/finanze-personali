// store.js — Stato centrale dell'app in memoria.
// Tiene una copia in RAM dei dati (per letture veloci senza colpire IndexedDB a ogni
// render) e indici pre-calcolati. Un semplice sistema di sottoscrizione permette alle
// schermate di re-renderizzarsi quando i dati cambiano.

import { dbAll } from './db.js';
import { annomese } from './utils.js';

export const state = {
  movimenti: [],
  conti: [],
  categorie: [],
  tag: [],
  ricorrenti: [],
  regole: [],
  snapshot: [],
  mutuo: null,
  finanziamenti: [],
  eventiMutuo: [],
  suggerimenti: [],
  // indici derivati (ricalcolati a ogni refresh)
  _idxMovByMese: {},      // '2026-06' -> [movimenti]
  _idxContoByNome: {},    // nome conto -> conto
};

// --- Sottoscrizioni (pattern observer minimale) ---
const _subs = new Set();
export const subscribe = (fn) => { _subs.add(fn); return () => _subs.delete(fn); };
const _notify = () => _subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

// Ricarica tutto lo stato da IndexedDB e ricostruisce gli indici.
export const refreshAll = async () => {
  const [movimenti, conti, categorie, tag, ricorrenti, regole, snapshot, mutuoArr, finanziamenti, eventiMutuo, suggerimenti] =
    await Promise.all([
      dbAll('movimenti'), dbAll('conti'), dbAll('categorie'), dbAll('tag'),
      dbAll('ricorrenti'), dbAll('regole'), dbAll('snapshot'), dbAll('mutuo'),
      dbAll('finanziamenti'), dbAll('eventiMutuo'), dbAll('suggerimenti'),
    ]);

  state.movimenti = movimenti;
  state.conti = conti;
  state.categorie = categorie;
  state.tag = tag;
  state.ricorrenti = ricorrenti;
  state.regole = regole;
  state.snapshot = snapshot;
  state.mutuo = mutuoArr[0] || null;
  state.finanziamenti = finanziamenti;
  state.eventiMutuo = eventiMutuo;
  state.suggerimenti = suggerimenti;

  _buildIndexes();
  _notify();
};

const _buildIndexes = () => {
  const byMese = {};
  for (const m of state.movimenti) {
    const k = annomese(m.data);
    (byMese[k] = byMese[k] || []).push(m);
  }
  state._idxMovByMese = byMese;

  const byNome = {};
  for (const c of state.conti) byNome[c.nome] = c;
  state._idxContoByNome = byNome;
};

// Helper di lettura comuni
export const movimentiDelMese = (am) => state._idxMovByMese[am] || [];
export const contoByNome = (nome) => state._idxContoByNome[nome] || null;
export const mesiDisponibili = () => Object.keys(state._idxMovByMese).sort();
