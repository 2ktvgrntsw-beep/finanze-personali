// finanziamenti.js — Elenco e gestione finanziamenti (con split quota utente).

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, fmtData, todayISO } from '../core/utils.js';
import { statoPrestito, saveFinanziamento, deleteFinanziamento } from '../services/prestitiService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

export const renderFinanziamenti = async (root) => {
  document.getElementById('view-title').textContent = 'Finanziamenti';
  const fins = state.finanziamenti.filter(f => f.attivo !== false);

  let html = '';
  for (const f of fins) {
    const s = statoPrestito(f, []);
    if (!s) continue;
    html += `
      <div class="card" data-fin="${f.id}" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div><div style="font-size:16px;font-weight:700">${escapeHtml(f.nome)}</div><div class="meta">${f.quota_utente < 100 ? `tua quota ${f.quota_utente}%` : ''} ${s.ratePagate}/${s.rateTotali} rate</div></div>
          <div style="text-align:right"><div class="num" style="font-weight:800;color:var(--down)">−${fmtEUR(s.residuo * (f.quota_utente || 100) / 100)}</div><div class="meta num">rata ${fmtEUR(s.quotaUtente)}</div></div>
        </div>
        <div class="bar red"><span style="width:${s.pctCompletamento}%"></span></div>
      </div>`;
  }

  root.innerHTML = (html || '<div class="empty"><div class="big-ic">📄</div>Nessun finanziamento attivo</div>') +
    `<div style="margin-top:16px"><button class="btn btn-primary" id="nuovo">➕ Nuovo finanziamento</button></div>`;

  root.querySelectorAll('[data-fin]').forEach(el => el.addEventListener('click', () => _edit(root, el.dataset.fin)));
  root.querySelector('#nuovo').addEventListener('click', () => _edit(root, null));
};

const _edit = (root, id) => {
  const f = id ? state.finanziamenti.find(x => x.id === id) : { nome: '', importo_iniziale: 0, tasso: 0, durata_mesi: 0, rata: 0, data_inizio: todayISO(), quota_utente: 100 };
  const fld = (label, fid, val, type = 'number', step = '0.01') => `<label class="meta">${label}</label><input type="${type}" ${type === 'number' ? `step="${step}"` : ''} id="${fid}" value="${escapeHtml(String(val))}" style="width:100%;padding:12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:15px;margin:6px 0 10px">`;
  apriSheet(id ? escapeHtml(f.nome) : 'Nuovo finanziamento', `
    ${fld('Nome', 'f-nome', f.nome, 'text')}
    ${fld('Importo iniziale (€)', 'f-imp', f.importo_iniziale)}
    ${fld('Tasso annuo (%)', 'f-tasso', f.tasso)}
    ${fld('Durata (mesi)', 'f-durata', f.durata_mesi, 'number', '1')}
    ${fld('Rata (€)', 'f-rata', f.rata)}
    ${fld('Data inizio', 'f-data', f.data_inizio, 'date')}
    ${fld('Tua quota (%)', 'f-quota', f.quota_utente, 'number', '1')}
    <div class="btn-row">
      ${id ? '<button class="btn btn-danger" id="f-del">Elimina</button>' : ''}
      <button class="btn btn-primary" id="f-ok">Salva</button>
    </div>
  `, (body, chiudi) => {
    body.querySelector('#f-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#f-nome').value.trim();
      if (!nome) { toast('Inserisci un nome'); return; }
      await saveFinanziamento({
        id: f.id, nome, importo_iniziale: parseFloat(body.querySelector('#f-imp').value) || 0,
        tasso: parseFloat(body.querySelector('#f-tasso').value) || 0, durata_mesi: parseInt(body.querySelector('#f-durata').value) || 0,
        rata: parseFloat(body.querySelector('#f-rata').value) || 0, data_inizio: body.querySelector('#f-data').value,
        quota_utente: parseFloat(body.querySelector('#f-quota').value) || 100,
      });
      chiudi(); toast('Salvato'); renderFinanziamenti(root);
    });
    const del = body.querySelector('#f-del');
    if (del) del.addEventListener('click', async () => { if (confirm('Eliminare?')) { await deleteFinanziamento(f.id); chiudi(); toast('Eliminato'); renderFinanziamenti(root); } });
  });
};
