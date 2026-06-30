// categorieService.js — gestione macrocategoria/categoria/sottocategoria.
//
// REFACTORING v1.3: aggiunto il concetto di categoria "archiviata" (suggerimento
// discusso in fase di revisione progetto). Con 10 anni di storico, alcune categorie
// usate nel 2018 potrebbero non servire più oggi: cancellarle romperebbe i filtri
// sullo storico (i vecchi movimenti continuerebbero a riferirle). Archiviare invece
// di cancellare significa: non più proposta nei form di nuovo movimento, ma ancora
// visibile e filtrabile in Storico/Statistiche.

import { dbAdd, dbDelete } from '../db.js';
import { uid } from '../utils.js';
import { refreshAll, state } from '../state.js';

export const saveCategoria = async ({ id, macrocategoria, categoria, sottocategoria, attiva = true }) => {
  const obj = { id: id || uid(), macrocategoria: macrocategoria || '', categoria: categoria || '', sottocategoria: sottocategoria || '', attiva };
  await dbAdd('categorie', obj);
  await refreshAll();
  return obj;
};

// archiviaCategoria: non cancella, imposta solo attiva=false. I movimenti storici
// che la usano restano intatti e continuano a comparire nei filtri.
export const archiviaCategoria = async (id) => {
  const c = state.categorie.find(x => x.id === id);
  if (!c) return null;
  return saveCategoria({ ...c, attiva: false });
};

export const riattivaCategoria = async (id) => {
  const c = state.categorie.find(x => x.id === id);
  if (!c) return null;
  return saveCategoria({ ...c, attiva: true });
};

// deleteCategoria resta disponibile per chi vuole davvero eliminare (es. categoria
// creata per errore e mai usata in nessun movimento), ma archiviaCategoria è la
// via consigliata per categorie con storico.
export const deleteCategoria = async (id) => {
  await dbDelete('categorie', id);
  await refreshAll();
};

// Le funzioni getMacrocategorie/getCategorieByMacro/getSottocategorieByCat sono usate
// per popolare i form: di default mostrano solo le voci attive (attiva !== false),
// così le categorie archiviate spariscono dai nuovi inserimenti ma non dal DB.
export const getMacrocategorie = (includiArchiviate = false) =>
  [...new Set(state.categorie.filter(c => includiArchiviate || c.attiva !== false).map(c => c.macrocategoria).filter(Boolean))].sort();

export const getCategorieByMacro = (macro, includiArchiviate = false) =>
  [...new Set(state.categorie.filter(c => c.macrocategoria === macro && (includiArchiviate || c.attiva !== false)).map(c => c.categoria).filter(Boolean))].sort();

export const getSottocategorieByCat = (macro, cat, includiArchiviate = false) =>
  [...new Set(state.categorie.filter(c => c.macrocategoria === macro && c.categoria === cat && (includiArchiviate || c.attiva !== false)).map(c => c.sottocategoria).filter(Boolean))].sort();
