// ricorrenti.js — gestione movimenti ricorrenti (CRUD + attiva/disattiva).
// Nessuna modifica funzionale sostanziale rispetto alla v1.2: solo riformattazione
// e uso coerente di uid() importato da utils invece che generato altrove.

import { state } from '../state.js';
import { saveRicorrente, deleteRicorrente, prossimaGenerazione } from '../services/ricorrentiService.js';
import { getMacrocategorie } from '../services/categorieService.js';
import { todayISO, fmtEUR, fmtDate, toast, escapeHtml, uid } from '../utils.js';

export const renderRicorrenti = async (root) => {
  root.innerHTML = `<div class="card"><button class="btn btn-primary" id="nuovo">+ Nuova ricorrenza</button></div><div id="lista"></div>`;

  const renderLista = () => {
    const lista = root.querySelector('#lista');
    if (!state.ricorrenti.length) { lista.innerHTML = '<div class="card empty">Nessuna ricorrenza</div>'; return; }

    lista.innerHTML = state.ricorrenti.map(r => {
      const prossima = prossimaGenerazione(r);
      return `
        <div class="card">
          <div class="mov-item">
            <div class="mov-left">
              <div class="desc">${escapeHtml(r.descrizione || '—')}</div>
              <div class="meta">${escapeHtml(r.frequenza)} · ${escapeHtml(r.categoria || '')}</div>
              <div class="meta">Prossima: ${prossima ? fmtDate(prossima) : '—'}</div>
            </div>
            <div class="mov-right ${r.tipo}">${r.tipo === 'spesa' ? '-' : '+'}${fmtEUR(r.importo)}</div>
          </div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn btn-secondary" data-edit="${r.id}">Modifica</button>
            <button class="btn btn-secondary" data-toggle="${r.id}">${r.attiva ? 'Disattiva' : 'Attiva'}</button>
            <button class="btn btn-danger" data-del="${r.id}">Elimina</button>
          </div>
        </div>`;
    }).join('');

    lista.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.edit)));
    lista.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const r = state.ricorrenti.find(x => x.id === b.dataset.toggle);
      await saveRicorrente({ ...r, attiva: !r.attiva });
      renderLista();
    }));
    lista.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Eliminare la ricorrenza?')) { await deleteRicorrente(b.dataset.del); renderLista(); }
    }));
  };

  const openForm = (id = null) => {
    const r = id ? state.ricorrenti.find(x => x.id === id) : {};
    const html = `
      <div class="modal-bg" id="modal"><div class="modal">
        <h3>${id ? 'Modifica' : 'Nuova'} ricorrenza</h3>
        <form id="form-ric">
          <div class="form-group"><label>Descrizione</label><input name="descrizione" value="${escapeHtml(r.descrizione || '')}" required /></div>
          <div class="form-group"><label>Tipo</label>
            <select name="tipo"><option value="spesa" ${r.tipo === 'spesa' ? 'selected' : ''}>Spesa</option><option value="entrata" ${r.tipo === 'entrata' ? 'selected' : ''}>Entrata</option></select>
          </div>
          <div class="form-group"><label>Importo</label><input type="number" step="0.01" name="importo" value="${r.importo || ''}" required /></div>
          <div class="form-group"><label>Frequenza</label>
            <select name="frequenza">${['giornaliera', 'settimanale', 'mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale', 'personalizzata'].map(f => `<option ${r.frequenza === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>Data inizio</label><input type="date" name="data_inizio" value="${r.data_inizio || todayISO()}" required /></div>
          <div class="form-group"><label>Data fine</label><input type="date" name="data_fine" value="${r.data_fine || ''}" /></div>
          <div class="form-group"><label>Macrocategoria</label><select name="macrocategoria"><option value="">–</option>${getMacrocategorie().map(m => `<option ${r.macrocategoria === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Categoria</label><input name="categoria" value="${escapeHtml(r.categoria || '')}" /></div>
          <div class="form-group"><label>Conto</label><select name="conto"><option value="">–</option>${state.conti.map(c => `<option ${r.conto === c.nome ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Tag (virgola)</label><input name="tag" value="${(r.tag || []).join(', ')}" /></div>
          <div class="btn-row"><button type="button" class="btn btn-secondary" id="annulla">Annulla</button><button type="submit" class="btn btn-primary">Salva</button></div>
        </form>
      </div></div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('modal');
    modal.querySelector('#annulla').addEventListener('click', () => modal.remove());
    modal.querySelector('#form-ric').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      fd.tag = (fd.tag || '').split(',').map(s => s.trim()).filter(Boolean);
      fd.id = id || uid();
      fd.attiva = id ? r.attiva : true;
      await saveRicorrente(fd);
      modal.remove();
      toast('Ricorrenza salvata');
      renderLista();
    });
  };

  root.querySelector('#nuovo').addEventListener('click', () => openForm());
  renderLista();
};
