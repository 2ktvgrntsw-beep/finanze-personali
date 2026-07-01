// conti.js — Elenco e gestione conti (raggruppati per tipologia).

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, todayISO } from '../core/utils.js';
import { saldoStimato, saveConto, deleteConto, TIPI_CONTO, LABEL_TIPO } from '../services/contiService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

export const renderConti = async (root, params = {}) => {
  document.getElementById('view-title').textContent = params.tipo ? LABEL_TIPO[params.tipo] || 'Conti' : 'Conti';

  const tipi = params.tipo ? [params.tipo] : TIPI_CONTO;
  let html = '';
  for (const tipo of tipi) {
    const conti = state.conti.filter(c => c.attivo !== false && c.tipo === tipo);
    if (!conti.length) continue;
    const tot = conti.reduce((s, c) => s + saldoStimato(c), 0);
    html += `<div class="section-lbl"><span>${LABEL_TIPO[tipo]}</span><span class="num">${fmtEUR(tot)}</span></div>`;
    html += conti.map(c => `
      <div class="patrow" data-conto="${c.id}">
        <div class="icon" style="background:var(--surface-2)">💳</div>
        <div class="body">
          <div class="row1"><span class="name">${escapeHtml(c.nome)}</span><span class="amt num">${fmtEUR(saldoStimato(c))}</span></div>
          <div class="sub">${c.tipo === 'asset' ? 'Valore manuale' : 'Saldo iniziale ' + fmtEUR(c.saldo_iniziale)} · tocca per modificare</div>
        </div>
        <div class="chev">›</div>
      </div>`).join('');
  }

  root.innerHTML = (html || '<div class="empty">Nessun conto</div>') +
    `<div style="margin-top:20px"><button class="btn btn-primary" id="nuovo-conto">➕ Nuovo conto</button></div>`;

  root.querySelectorAll('[data-conto]').forEach(el => el.addEventListener('click', () => _editConto(root, el.dataset.conto)));
  root.querySelector('#nuovo-conto').addEventListener('click', () => _editConto(root, null));
};

const _editConto = (root, id) => {
  const c = id ? state.conti.find(x => x.id === id) : { nome: '', tipo: 'liquidita', saldo_iniziale: 0, data_saldo: todayISO() };
  apriSheet(id ? escapeHtml(c.nome) : 'Nuovo conto', `
    <label class="meta">Nome</label>
    <input id="c-nome" value="${escapeHtml(c.nome)}" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
    <label class="meta">Tipo</label>
    <select id="c-tipo" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
      ${TIPI_CONTO.map(t => `<option value="${t}" ${c.tipo === t ? 'selected' : ''}>${LABEL_TIPO[t]}</option>`).join('')}
    </select>
    <label class="meta">Saldo / Valore (€)</label>
    <input type="number" step="0.01" id="c-saldo" value="${c.saldo_iniziale}" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
    <label class="meta">Data del saldo</label>
    <input type="date" id="c-data" value="${c.data_saldo}" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:15px;margin:8px 0 12px">
    <div class="btn-row">
      ${id ? '<button class="btn btn-danger" id="c-del">Elimina</button>' : ''}
      <button class="btn btn-primary" id="c-ok">Salva</button>
    </div>
  `, (body, chiudi) => {
    body.querySelector('#c-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#c-nome').value.trim();
      if (!nome) { toast('Inserisci un nome'); return; }
      await saveConto({
        id: c.id, nome, tipo: body.querySelector('#c-tipo').value,
        saldo_iniziale: parseFloat(body.querySelector('#c-saldo').value) || 0,
        data_saldo: body.querySelector('#c-data').value,
      });
      chiudi(); toast('Salvato'); renderConti(root);
    });
    const del = body.querySelector('#c-del');
    if (del) del.addEventListener('click', async () => { if (confirm('Eliminare il conto? I movimenti restano.')) { await deleteConto(c.id); chiudi(); toast('Eliminato'); renderConti(root); } });
  });
};
