// conti.js — Elenco e gestione conti (raggruppati per tipologia).

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, todayISO } from '../core/utils.js';
import { saldoStimato, saveConto, deleteConto, TIPI_CONTO, LABEL_TIPO } from '../services/contiService.js';
import { apriSheet, apriDataNativa, montaTastierino } from './shared.js';
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
  const tmp = { data_saldo: c.data_saldo || todayISO(), possessoData: c.possessoData || '' };
  apriSheet(id ? escapeHtml(c.nome) : 'Nuovo conto', `
    <label class="meta">Nome</label>
    <input id="c-nome" value="${escapeHtml(c.nome)}" class="sheet-input">
    <label class="meta">Tipo</label>
    <select id="c-tipo" class="sheet-input">
      ${TIPI_CONTO.map(t => `<option value="${t}" ${c.tipo === t ? 'selected' : ''}>${LABEL_TIPO[t]}</option>`).join('')}
    </select>
    <label class="meta">Saldo / Valore (€)</label>
    <input type="text" inputmode="decimal" id="c-saldo" value="${String(c.saldo_iniziale).replace('.', ',')}" class="sheet-input">
    <label class="meta">Data del saldo</label>
    <button type="button" id="c-data-btn" class="sheet-input" style="text-align:left;cursor:pointer">${_fmtD(tmp.data_saldo)}</button>
    <div id="c-possesso-wrap" style="${c.tipo === 'asset' ? '' : 'display:none'}">
      <label class="meta">Posseduto dal (per il grafico patrimonio)</label>
      <button type="button" id="c-possesso-btn" class="sheet-input" style="text-align:left;cursor:pointer">${tmp.possessoData ? _fmtD(tmp.possessoData) : 'Non impostato'}</button>
    </div>
    <div class="btn-row">
      ${id ? '<button class="btn btn-danger" id="c-del">Elimina</button>' : ''}
      <button class="btn btn-primary" id="c-ok">Salva</button>
    </div>
  `, (body, chiudi) => {
    // data nativa
    body.querySelector('#c-data-btn').addEventListener('click', () => apriDataNativa(tmp.data_saldo, (nd) => { tmp.data_saldo = nd; body.querySelector('#c-data-btn').textContent = _fmtD(nd); }));
    const possBtn = body.querySelector('#c-possesso-btn');
    if (possBtn) possBtn.addEventListener('click', () => apriDataNativa(tmp.possessoData || todayISO(), (nd) => { tmp.possessoData = nd; possBtn.textContent = _fmtD(nd); }));
    // mostra/nascondi possesso in base al tipo
    body.querySelector('#c-tipo').addEventListener('change', (e) => {
      body.querySelector('#c-possesso-wrap').style.display = e.target.value === 'asset' ? '' : 'none';
    });

    body.querySelector('#c-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#c-nome').value.trim();
      if (!nome) { toast('Inserisci un nome'); return; }
      await saveConto({
        id: c.id, nome, tipo: body.querySelector('#c-tipo').value,
        saldo_iniziale: parseFloat(String(body.querySelector('#c-saldo').value).replace(',', '.')) || 0,
        data_saldo: tmp.data_saldo, possessoData: tmp.possessoData || null,
      });
      chiudi(); toast('Salvato'); renderConti(root);
    });
    const del = body.querySelector('#c-del');
    if (del) del.addEventListener('click', async () => { if (confirm('Eliminare il conto? I movimenti restano.')) { await deleteConto(c.id); chiudi(); toast('Eliminato'); renderConti(root); } });
  });
};

const _fmtD = (iso) => { if (!iso) return ''; const [a, m, g] = iso.split('-'); return `${g}/${m}/${a}`; };
