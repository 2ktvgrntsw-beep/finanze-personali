// mutuo.js (NUOVO v1.3) — scheda riassuntiva del mutuo.
// Se il mutuo non è ancora configurato (es. prima dell'import Excel), mostra un form
// di creazione minimo invece della scheda.

import { state } from '../state.js';
import { fmtEUR, fmtDate, escapeHtml, todayISO } from '../utils.js';
import { statoMutuoOggi, saveMutuo, saveEventoStraordinario, eventiPerRiferimento, deleteEventoStraordinario } from '../services/mutuoService.js';
import { toast } from '../utils.js';
import { navigate } from '../router.js';

const LABEL_EVENTO = {
  estinzione_parziale: 'Estinzione parziale',
  anticipo_rata: 'Anticipo rata',
  variazione_assicurazione: 'Variazione assicurazione',
  rinegoziazione_tasso: 'Rinegoziazione tasso',
};

function formNuovoMutuo(root) {
  root.innerHTML = `
    <div class="card">
      <h2>Configura il tuo mutuo</h2>
      <p class="meta" style="margin-bottom:14px">Nessun dato mutuo trovato. Inseriscilo qui, oppure importalo dall'Excel (foglio "Mutuo") da Import/Export.</p>
      <form id="form-mutuo">
        <div class="form-group"><label>Banca</label><input name="banca" placeholder="es. Credem" /></div>
        <div class="form-group"><label>Importo iniziale (€)</label><input type="number" step="0.01" name="importo_iniziale" required /></div>
        <div class="form-group"><label>Tasso annuo (%)</label><input type="number" step="0.01" name="tasso" required /></div>
        <div class="form-group"><label>Durata (mesi)</label><input type="number" name="durata_mesi" required /></div>
        <div class="form-group"><label>Rata mensile (€)</label><input type="number" step="0.01" name="rata_mensile" required /></div>
        <div class="form-group"><label>Data inizio</label><input type="date" name="data_inizio" required /></div>
        <div class="form-group"><label>Tua quota (%)</label><input type="number" name="quota_utente_percentuale" value="100" /></div>
        <button class="btn btn-primary" type="submit">Salva mutuo</button>
      </form>
    </div>
  `;
  root.querySelector('#form-mutuo').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveMutuo(Object.fromEntries(new FormData(e.target).entries()));
    toast('Mutuo salvato');
    renderMutuo(root);
  });
}

function formEventoStraordinario(onSalvato) {
  const html = `
    <div class="modal-bg" id="modal"><div class="modal">
      <h3>Nuovo evento straordinario</h3>
      <form id="form-evento">
        <div class="form-group"><label>Tipo evento</label>
          <select name="tipo" id="sel-tipo-evento">
            <option value="estinzione_parziale">Estinzione parziale</option>
            <option value="anticipo_rata">Anticipo rata</option>
            <option value="variazione_assicurazione">Variazione assicurazione</option>
            <option value="rinegoziazione_tasso">Rinegoziazione tasso</option>
          </select>
        </div>
        <div class="form-group"><label>Data</label><input type="date" name="data" value="${todayISO()}" required /></div>
        <div id="campo-dinamico"></div>
        <div class="form-group"><label>Note</label><input name="note" placeholder="opzionale" /></div>
        <div class="btn-row"><button type="button" class="btn btn-secondary" id="annulla">Annulla</button><button type="submit" class="btn btn-primary">Salva</button></div>
      </form>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  const modal = document.getElementById('modal');
  const selTipo = modal.querySelector('#sel-tipo-evento');
  const campoDinamico = modal.querySelector('#campo-dinamico');

  const aggiornaCampo = () => {
    campoDinamico.innerHTML = selTipo.value === 'rinegoziazione_tasso'
      ? `<div class="form-group"><label>Nuovo tasso annuo (%)</label><input type="number" step="0.01" name="nuovo_tasso" required /></div>`
      : `<div class="form-group"><label>Importo (€)</label><input type="number" step="0.01" name="importo" required /></div>`;
  };
  selTipo.addEventListener('change', aggiornaCampo);
  aggiornaCampo();

  modal.querySelector('#annulla').addEventListener('click', () => modal.remove());
  modal.querySelector('#form-evento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    await saveEventoStraordinario({ ...fd, riferimento_id: 'mutuo-principale' });
    modal.remove();
    toast('Evento registrato');
    onSalvato();
  });
}

export const renderMutuo = async (root) => {
  if (!state.mutuo) { formNuovoMutuo(root); return; }

  const eventi = eventiPerRiferimento('mutuo-principale');
  const stato = statoMutuoOggi(state.mutuo, eventi);
  if (!stato) { formNuovoMutuo(root); return; }

  root.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(state.mutuo.banca || 'Mutuo')}</h2>
      <div class="kpi"><div class="label">Rata mensile</div><div class="value">${fmtEUR(stato.rataMensile)}</div></div>
      ${state.mutuo.quota_utente_percentuale < 100 ? `<p class="meta">La tua quota (${state.mutuo.quota_utente_percentuale}%): <strong>${fmtEUR(stato.quotaUtente)}</strong></p>` : ''}
    </div>

    <div class="card">
      <div class="mov-item"><div class="mov-left"><div class="desc">Importo iniziale</div></div><div class="mov-right">${fmtEUR(state.mutuo.importo_iniziale)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Residuo capitale</div></div><div class="mov-right spesa">${fmtEUR(stato.residuoCapitale)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Restituito finora</div></div><div class="mov-right entrata">${fmtEUR(stato.restituitoFinora)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Tasso</div></div><div class="mov-right">${state.mutuo.tasso}% fisso</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Durata</div></div><div class="mov-right">${state.mutuo.durata_mesi} rate</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Rate pagate</div></div><div class="mov-right">${stato.ratePagate} / ${stato.rateTotali}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Inizio mutuo</div></div><div class="mov-right">${fmtDate(state.mutuo.data_inizio)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Prossima rata</div></div><div class="mov-right">${stato.prossimaRataData ? fmtDate(stato.prossimaRataData) : '—'}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Fine prevista</div></div><div class="mov-right">${stato.dataFinePrevista ? fmtDate(stato.dataFinePrevista) : '—'}</div></div>
      <div class="bar" style="margin-top:10px"><div style="width:${stato.percentualeCompletamento}%"></div></div>
      <div class="meta" style="margin-top:6px">${stato.percentualeCompletamento}% completato</div>
    </div>

    <div class="card">
      <div class="btn-row">
        <button class="btn btn-secondary" id="go-piano">Vedi piano di ammortamento</button>
      </div>
    </div>

    <div class="card">
      <h2>Eventi straordinari</h2>
      <div id="lista-eventi">${eventi.length ? eventi.map(ev => `
        <div class="mov-item">
          <div class="mov-left"><div class="desc">${LABEL_EVENTO[ev.tipo] || ev.tipo}</div><div class="meta">${fmtDate(ev.data)}${ev.note ? ' · ' + escapeHtml(ev.note) : ''}</div></div>
          <div class="mov-right">
            ${ev.tipo === 'rinegoziazione_tasso' ? `${ev.nuovo_tasso}%` : fmtEUR(ev.importo)}
            <button class="btn btn-danger" style="padding:2px 8px;font-size:11px;margin-left:8px" data-del-evento="${ev.id}">×</button>
          </div>
        </div>`).join('') : '<div class="empty">Nessun evento registrato</div>'}</div>
      <button class="btn btn-primary" id="nuovo-evento" style="margin-top:10px">+ Registra evento straordinario</button>
    </div>
  `;

  root.querySelector('#go-piano').addEventListener('click', () => { location.hash = '#/piano-ammortamento'; });
  root.querySelector('#nuovo-evento').addEventListener('click', () => formEventoStraordinario(() => renderMutuo(root)));
  root.querySelectorAll('[data-del-evento]').forEach(b => b.addEventListener('click', async () => {
    if (confirm('Eliminare questo evento? Il piano di ammortamento verrà ricalcolato senza di esso.')) {
      await deleteEventoStraordinario(b.dataset.delEvento);
      renderMutuo(root);
    }
  }));
};
