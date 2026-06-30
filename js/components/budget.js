// budget.js — creazione e monitoraggio budget per categoria.
// Nessuna modifica funzionale rispetto alla v1.2: solo riformattazione per leggibilità.
// calcolaSpesoBudget (in budgetService.js) è già stata ottimizzata per usare l'indice
// per-anno, quindi questo componente beneficia del refactoring senza modifiche proprie.

import { state } from '../state.js';
import { saveBudget, deleteBudget, calcolaSpesoBudget } from '../services/budgetService.js';
import { getMacrocategorie } from '../services/categorieService.js';
import { fmtEUR, escapeHtml, toast } from '../utils.js';

export const renderBudget = async (root) => {
  const anno = new Date().getFullYear();

  root.innerHTML = `
    <form id="form-b" class="card">
      <h2>Nuovo budget</h2>
      <div class="form-group"><label>Anno</label><input type="number" name="anno" value="${anno}" required /></div>
      <div class="form-group"><label>Mese (vuoto = annuale)</label><input type="number" name="mese" min="1" max="12" /></div>
      <div class="form-group"><label>Macrocategoria</label><select name="macrocategoria"><option value="">–</option>${getMacrocategorie().map(m => `<option>${escapeHtml(m)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Categoria</label><input name="categoria" /></div>
      <div class="form-group"><label>Importo budget</label><input type="number" step="0.01" name="importo_budget" required /></div>
      <button class="btn btn-primary" type="submit">Salva</button>
    </form>
    <div id="lista"></div>
  `;

  const refresh = () => {
    const lista = root.querySelector('#lista');
    if (!state.budget.length) { lista.innerHTML = '<div class="card empty">Nessun budget</div>'; return; }

    lista.innerHTML = state.budget.map(b => {
      const speso = calcolaSpesoBudget(b);
      const perc = b.importo_budget > 0 ? Math.min(100, (speso / b.importo_budget) * 100) : 0;
      const sforato = speso > b.importo_budget;
      return `
        <div class="card">
          <div style="display:flex;justify-content:space-between">
            <strong>${b.anno}${b.mese ? '/' + b.mese : ''} · ${escapeHtml(b.categoria || b.macrocategoria || 'Generale')}</strong>
            <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" data-del="${b.id}">×</button>
          </div>
          <div class="bar ${sforato ? 'over' : ''}"><div style="width:${perc}%"></div></div>
          <div class="meta" style="display:flex;justify-content:space-between;margin-top:6px;font-size:13px">
            <span>Speso: <strong>${fmtEUR(speso)}</strong></span>
            <span>Budget: ${fmtEUR(b.importo_budget)}</span>
            <span>Residuo: <strong>${fmtEUR(b.importo_budget - speso)}</strong></span>
          </div>
          <div class="meta">${perc.toFixed(1)}% utilizzato</div>
        </div>`;
    }).join('');

    lista.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { await deleteBudget(b.dataset.del); refresh(); }));
  };

  root.querySelector('#form-b').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveBudget(Object.fromEntries(new FormData(e.target).entries()));
    e.target.reset();
    toast('Budget salvato');
    refresh();
  });

  refresh();
};
