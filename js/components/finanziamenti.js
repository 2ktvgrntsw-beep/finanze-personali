// finanziamenti.js (NUOVO v1.3) — elenco finanziamenti attivi + wizard di creazione.
// Il wizard permette di aggiungere un nuovo finanziamento (es. un nuovo elettrodomestico
// a rate) direttamente dall'app, senza dover più modificare l'Excel a mano come accadeva
// finora (richiesta esplicita dal documento di progetto).

import { state } from '../state.js';
import { fmtEUR, fmtDate, escapeHtml, todayISO } from '../utils.js';
import { finanziamentiAttivi, statoFinanziamentoOggi, saveFinanziamento, deleteFinanziamento } from '../services/finanziamentiService.js';
import { toast } from '../utils.js';

function apriWizardNuovoFinanziamento(onSalvato) {
  const html = `
    <div class="modal-bg" id="modal"><div class="modal">
      <h3>Nuovo finanziamento</h3>
      <form id="form-fin">
        <div class="form-group"><label>Nome / descrizione</label><input name="nome" placeholder="es. Lavatrice" required /></div>
        <div class="form-group"><label>Importo totale (€)</label><input type="number" step="0.01" name="importo_iniziale" required /></div>
        <div class="form-group"><label>Tasso annuo (%)</label><input type="number" step="0.01" name="tasso" value="0" /></div>
        <div class="form-group"><label>Durata (mesi)</label><input type="number" name="durata_mesi" required /></div>
        <div class="form-group"><label>Rata mensile (€)</label><input type="number" step="0.01" name="rata_mensile" required /></div>
        <div class="form-group"><label>Data inizio</label><input type="date" name="data_inizio" value="${todayISO()}" required /></div>
        <div class="form-group"><label>Tua quota (%)</label><input type="number" name="quota_utente_percentuale" value="100" /><p class="meta">Es. 50 se diviso a metà con qualcun altro</p></div>
        <div class="btn-row"><button type="button" class="btn btn-secondary" id="annulla">Annulla</button><button type="submit" class="btn btn-primary">Salva</button></div>
      </form>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('modal');
  modal.querySelector('#annulla').addEventListener('click', () => modal.remove());
  modal.querySelector('#form-fin').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveFinanziamento(Object.fromEntries(new FormData(e.target).entries()));
    modal.remove();
    toast('Finanziamento aggiunto');
    onSalvato();
  });
}

export const renderFinanziamenti = async (root) => {
  const attivi = finanziamentiAttivi();

  root.innerHTML = `
    <div class="card"><button class="btn btn-primary" id="nuovo-fin">+ Nuovo finanziamento</button></div>
    <div id="lista-fin"></div>
  `;

  const renderLista = () => {
    const lista = root.querySelector('#lista-fin');
    if (!attivi.length) { lista.innerHTML = '<div class="card empty">Nessun finanziamento attivo</div>'; return; }

    lista.innerHTML = attivi.map(f => {
      const stato = statoFinanziamentoOggi(f);
      if (!stato) return '';
      return `
        <div class="card">
          <h2>${escapeHtml(f.nome)}</h2>
          <div class="mov-item"><div class="mov-left"><div class="desc">Rata mensile (totale)</div></div><div class="mov-right">${fmtEUR(stato.rataMensile)}</div></div>
          ${f.quota_utente_percentuale < 100 ? `<div class="mov-item"><div class="mov-left"><div class="desc">Tua quota (${f.quota_utente_percentuale}%)</div></div><div class="mov-right spesa">${fmtEUR(stato.quotaUtente)}</div></div>` : ''}
          <div class="mov-item"><div class="mov-left"><div class="desc">Residuo</div></div><div class="mov-right">${fmtEUR(stato.residuo)}</div></div>
          <div class="mov-item"><div class="mov-left"><div class="desc">Rate pagate</div></div><div class="mov-right">${stato.ratePagate} / ${stato.rateTotali}</div></div>
          <div class="mov-item"><div class="mov-left"><div class="desc">Prossima rata</div></div><div class="mov-right">${stato.prossimaRataData ? fmtDate(stato.prossimaRataData) : '—'}</div></div>
          <div class="bar" style="margin-top:10px"><div style="width:${stato.percentualeCompletamento}%"></div></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn btn-danger" data-del="${f.id}">Elimina</button></div>
        </div>`;
    }).join('');

    lista.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Eliminare questo finanziamento?')) { await deleteFinanziamento(b.dataset.del); renderFinanziamenti(root); }
    }));
  };

  root.querySelector('#nuovo-fin').addEventListener('click', () => apriWizardNuovoFinanziamento(() => renderFinanziamenti(root)));
  renderLista();
};
