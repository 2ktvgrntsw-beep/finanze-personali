// investimenti.js — Panoramica investimenti (versato per piattaforma/strumento).
// Traccia solo il versato (non il controvalore di mercato, che l'utente vede nelle app
// native). Le piattaforme sono i conti di tipo 'investimenti'; gli strumenti sono le
// sottocategorie usate nei trasferimenti di investimento.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { saldoStimato } from '../services/contiService.js';

export const renderInvestimenti = async (root) => {
  document.getElementById('view-title').textContent = 'Investimenti';

  const contiInv = state.conti.filter(c => c.attivo !== false && c.tipo === 'investimenti');
  const totale = contiInv.reduce((s, c) => s + saldoStimato(c), 0);
  const maxC = contiInv.length ? Math.max(...contiInv.map(c => saldoStimato(c))) : 1;

  // versato per strumento (sottocategoria dei trasferimenti di investimento)
  const perStrumento = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'trasferimento') continue;
    const dest = state.conti.find(c => c.nome === m.contoDest);
    const isInv = dest ? dest.tipo === 'investimenti' : m.macro === 'Investimenti';
    if (!isInv) continue;
    const k = m.sub || m.cat || 'Altro';
    perStrumento[k] = (perStrumento[k] || 0) + m.imp;
  }
  const strumenti = Object.entries(perStrumento).map(([nome, tot]) => ({ nome, tot })).sort((a, b) => b.tot - a.tot);
  const maxS = strumenti.length ? strumenti[0].tot : 1;

  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">Totale investito (versato)</div>
      <div class="big num">${fmtEUR(totale)}</div>
      <div class="delta" style="color:var(--transfer)">${contiInv.length} piattaforme</div>
    </div>
    <p class="meta" style="margin:12px 4px">Qui vedi quanto hai <b>versato</b>. Il valore di mercato aggiornato lo trovi nelle app delle singole piattaforme.</p>

    <div class="section-lbl"><span>Per piattaforma</span></div>
    ${contiInv.map(c => `
      <div class="patrow">
        <div class="icon" style="background:rgba(61,182,255,.18)">💠</div>
        <div class="body" data-conto="${c.id}">
          <div class="row1"><span class="name">${escapeHtml(c.nome)}</span><span class="amt num">${fmtEUR(saldoStimato(c))}</span></div>
          <div class="bar"><span style="width:${Math.max(1.5, saldoStimato(c) / maxC * 100)}%;background:var(--transfer)"></span></div>
        </div>
      </div>`).join('') || '<div class="empty">Nessuna piattaforma di investimento</div>'}

    ${strumenti.length ? `
      <div class="section-lbl"><span>Per strumento</span></div>
      ${strumenti.map(s => `
        <div class="patrow">
          <div class="icon" style="background:rgba(61,182,255,.12)">📈</div>
          <div class="body" data-strumento="${escapeHtml(s.nome)}">
            <div class="row1"><span class="name">${escapeHtml(s.nome)}</span><span class="amt num">${fmtEUR(s.tot)}</span></div>
            <div class="bar"><span style="width:${Math.max(1.5, s.tot / maxS * 100)}%;background:var(--transfer)"></span></div>
          </div>
        </div>`).join('')}` : ''}

    <div style="margin-top:20px"><button class="btn btn-secondary" id="go-analisi">Vedi investito nel tempo</button></div>
  `;

  root.querySelectorAll('[data-strumento]').forEach(el => el.addEventListener('click', () => navigate('movimenti', { tipo: 'trasferimento', sub: el.dataset.strumento })));
  root.querySelector('#go-analisi').addEventListener('click', () => navigate('analisi'));
};
