// tagService.js — gestione tag (dimensione trasversale alle categorie).
// Nessuna modifica funzionale rispetto alla v1.2: solo riformattazione per leggibilità.

import { dbAdd, dbDelete } from '../db.js';
import { uid } from '../utils.js';
import { refreshAll, state } from '../state.js';

export const saveTag = async ({ id, nome, descrizione = '' }) => {
  const obj = { id: id || uid(), nome, descrizione };
  await dbAdd('tag', obj);
  await refreshAll();
  return obj;
};

export const deleteTag = async (id) => {
  await dbDelete('tag', id);
  await refreshAll();
};

// Totale movimenti (spese) per ciascun tag — usato dalla Vista Analisi Tag (v1.3).
export const totaliPerTag = () => {
  const tot = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    for (const t of (m.tag || [])) tot[t] = (tot[t] || 0) + m.importo;
  }
  return tot;
};
