// categorieService.js — Gestione anagrafica categorie (gerarchia macro/cat/sub).

import { dbAdd, dbDelete } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid } from '../core/utils.js';

export const saveCategoria = async (c) => {
  const obj = { id: c.id || uid(), macro: c.macro, cat: c.cat || '', sub: c.sub || '', attiva: c.attiva !== false };
  await dbAdd('categorie', obj);
  await refreshAll();
  return obj;
};
export const deleteCategoria = async (id) => { await dbDelete('categorie', id); await refreshAll(); };

// Elenco macrocategorie distinte (attive)
export const listaMacro = () => {
  const set = new Set();
  for (const c of state.categorie) if (c.attiva !== false && c.macro) set.add(c.macro);
  return Array.from(set).sort();
};

// Categorie (2° livello) di una macro
export const categorieDi = (macro) => {
  const set = new Set();
  for (const c of state.categorie) if (c.macro === macro && c.cat) set.add(c.cat);
  return Array.from(set).sort();
};

// Sottocategorie (3° livello) di una categoria
export const sottocategorieDi = (macro, cat) => {
  const set = new Set();
  for (const c of state.categorie) if (c.macro === macro && c.cat === cat && c.sub) set.add(c.sub);
  return Array.from(set).sort();
};

// Verifica se una macro ha categorie / una categoria ha sottocategorie (per drill adattivo)
export const macroHaCategorie = (macro) => categorieDi(macro).length > 0;
export const categoriaHaSub = (macro, cat) => sottocategorieDi(macro, cat).length > 0;

// ═══════════════════════════════════════════════════════════════════════════
// GESTIONE COMPLETA: rinomina e cancellazione con PROPAGAZIONE.
// Principio: i movimenti portano le etichette scritte dentro (denormalizzate),
// quindi toccare l'anagrafica non li corrompe MAI. Ma per evitare divergenze
// (vecchio nome nei movimenti storici, nuovo nei futuri), la rinomina propaga
// a: movimenti, ricorrenze, classificazione rate di mutuo e finanziamenti.
// ═══════════════════════════════════════════════════════════════════════════
import { dbBulkPut, dbAll } from '../core/db.js';

// Quanti movimenti usano questo nodo (macro / macro+cat / macro+cat+sub)
export const contaMovimentiNodo = (macro, cat = '', sub = '') => {
  return state.movimenti.filter(m =>
    m.macro === macro && (!cat || m.cat === cat) && (!sub || m.sub === sub)
  ).length;
};

const _matchNodo = (x, macro, cat, sub) =>
  x.macro === macro && (!cat || x.cat === cat) && (!sub || x.sub === sub);

// Applica una patch ({macro} | {cat} | {sub}) a tutto ciò che usa il nodo:
// movimenti, ricorrenti, mutuo, finanziamenti. Ritorna il n. di movimenti toccati.
const _propaga = async (macro, cat, sub, patch) => {
  // movimenti
  const movs = state.movimenti.filter(m => _matchNodo(m, macro, cat, sub))
    .map(m => ({ ...m, ...patch }));
  if (movs.length) await dbBulkPut('movimenti', movs);

  // ricorrenti
  const rics = state.ricorrenti.filter(r => _matchNodo(r, macro, cat, sub))
    .map(r => ({ ...r, ...patch }));
  if (rics.length) await dbBulkPut('ricorrenti', rics);

  // mutuo e finanziamenti (classificazione rate generate)
  if (state.mutuo && _matchNodo(state.mutuo, macro, cat, sub)) {
    await dbAdd('mutuo', { ...state.mutuo, ...patch });
  }
  const fins = state.finanziamenti.filter(f => _matchNodo(f, macro, cat, sub))
    .map(f => ({ ...f, ...patch }));
  if (fins.length) await dbBulkPut('finanziamenti', fins);

  return movs.length;
};

// RINOMINA un nodo. livello: 'macro' | 'cat' | 'sub'.
// Aggiorna l'anagrafica e, se propagaMovimenti=true, tutto ciò che lo usa.
export const rinominaNodo = async (livello, macro, cat, sub, nuovoNome, propagaMovimenti = true) => {
  nuovoNome = (nuovoNome || '').trim();
  if (!nuovoNome) throw new Error('Il nuovo nome non può essere vuoto');

  // anagrafica: aggiorna tutte le righe del nodo
  const righe = state.categorie.filter(c => {
    if (livello === 'macro') return c.macro === macro;
    if (livello === 'cat') return c.macro === macro && c.cat === cat;
    return c.macro === macro && c.cat === cat && c.sub === sub;
  }).map(c => ({ ...c, [livello === 'macro' ? 'macro' : livello === 'cat' ? 'cat' : 'sub']: nuovoNome }));
  if (righe.length) await dbBulkPut('categorie', righe);

  // propagazione a movimenti/ricorrenti/prestiti
  let toccati = 0;
  if (propagaMovimenti) {
    const patch = livello === 'macro' ? { macro: nuovoNome } : livello === 'cat' ? { cat: nuovoNome } : { sub: nuovoNome };
    toccati = await _propaga(
      macro,
      livello === 'macro' ? '' : cat,
      livello === 'sub' ? sub : '',
      patch
    );
  }
  await refreshAll();
  return toccati;
};

// ELIMINA un nodo dall'anagrafica. I movimenti NON vengono toccati (restano
// con la loro etichetta, nessun dato si perde) — a meno che non venga passata
// una riassegnazione: in quel caso i movimenti vengono spostati sul nuovo nodo.
export const eliminaNodo = async (livello, macro, cat, sub, riassegnaA = null) => {
  // eventuale riassegnazione dei movimenti PRIMA di togliere l'anagrafica
  let riassegnati = 0;
  if (riassegnaA) {
    const patch = { macro: riassegnaA.macro, cat: riassegnaA.cat || '', sub: riassegnaA.sub || '' };
    riassegnati = await _propaga(
      macro,
      livello === 'macro' ? '' : cat,
      livello === 'sub' ? sub : '',
      patch
    );
  }
  // rimuovi le righe di anagrafica del nodo
  const daEliminare = state.categorie.filter(c => {
    if (livello === 'macro') return c.macro === macro;
    if (livello === 'cat') return c.macro === macro && c.cat === cat;
    return c.macro === macro && c.cat === cat && c.sub === sub;
  });
  for (const r of daEliminare) await dbDelete('categorie', r.id);
  await refreshAll();
  return riassegnati;
};
