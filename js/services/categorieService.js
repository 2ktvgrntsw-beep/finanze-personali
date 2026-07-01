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
