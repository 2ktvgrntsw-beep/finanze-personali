// budgetService.js — gestione budget mensili/annuali per categoria.
// REFACTORING v1.3: calcolaSpesoBudget parte dall'indice per-anno (state.indici)
// invece di scandire tutti i movimenti ad ogni budget visualizzato — con 5.000+
// righe e più budget attivi in contemporanea, la differenza si sente nello Storico/Budget.

import { dbAdd, dbDelete } from '../db.js';
import { uid } from '../utils.js';
import { refreshAll, movimentiAnno } from '../state.js';

export const saveBudget = async (b) => {
  const obj = {
    id: b.id || uid(),
    anno: Number(b.anno),
    mese: b.mese ? Number(b.mese) : null,
    macrocategoria: b.macrocategoria || '',
    categoria: b.categoria || '',
    importo_budget: Number(b.importo_budget) || 0,
  };
  await dbAdd('budget', obj);
  await refreshAll();
  return obj;
};

export const deleteBudget = async (id) => {
  await dbDelete('budget', id);
  await refreshAll();
};

export const calcolaSpesoBudget = (b) =>
  movimentiAnno(b.anno)
    .filter(m => m.tipo === 'spesa')
    .filter(m => {
      if (b.mese && (new Date(m.data).getMonth() + 1) !== b.mese) return false;
      if (b.categoria) return m.categoria === b.categoria;
      if (b.macrocategoria) return m.macrocategoria === b.macrocategoria;
      return true;
    })
    .reduce((a, m) => a + m.importo, 0);
