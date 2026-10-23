// investimenti.js — Panoramica investimenti: versato per conto e strumento.
// Traccia solo il VERSATO (non il controvalore di mercato, che l'utente vede nelle
// app delle piattaforme). Tre operazioni: Versa · Sposta · Disinvesti. Il risultato
// realizzato nasce da solo da Sposta e Disinvesti (e dalle plusvalenze storiche).

import { UI_SVG } from '../core/icons.js';
import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, fmtDataBreve } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { apriSheet } from './shared.js';
import {
  versato, strumentiDelConto, versatoConto, storiaDi, risultatiRealizzati, realizzatoAnno, realizzatoTotale, contoDiStrumento,
} from '../services/strumentiService.js';
import { apriVersa, apriSposta, apriDisinvesti } from './operazioniInvestimento.js';

const _segno = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtEUR(Math.abs(n));

export const renderInvestimenti = async (root) => {
  document.getElementById('view-title').textContent = 'Investimenti';
  const rerender = () => renderInvestimenti(root);

  const contiInv = state.conti.filter(c => c.attivo !== false && c.tipo === 'investimenti')
    .sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));
  const totale = contiInv.reduce((s, c) => s + versatoConto(c), 0);
  const anno = new Date().getFullYear();
  const realAnno = realizzatoAnno(anno), realTot = realizzatoTotale();
  const nOpAnno = risultatiRealizzati().filter(r => r.data.startsWith(String(anno))).length;
  const chiusi = state.strumenti.filter(s => s.chiuso && contoDiStrumento(s));
  const nAttivi = state.strumenti.filter(s => !s.chiuso && contoDiStrumento(s) && contoDiStrumento(s).attivo !== false).length;

  const rigaStrumento = (s) => {
    const ultima = storiaDi(s)[0];
    const sub = ultima ? `ultimo: ${fmtDataBreve(ultima.data)}/${ultima.data.slice(2, 4)} · ${_segno(ultima.v)}` : 'nessun movimento';
    return `
      <div class="conto-riga strumento-riga" data-strumento="${s.id}">
        <div class="conto-nome">${escapeHtml(s.nome)}<div class="meta" style="font-size:11.5px;margin-top:2px">${sub}</div></div>
        <div class="conto-saldo num">${fmtEUR(versato(s))}</div>
        <div class="conto-chev">›</div>
      </div>`;
  };

  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">Versato totale</div>
      <div class="big num">${fmtEUR(totale)}</div>
      <div class="sub">
        <div><span class="lbl2">Strumenti</span><b class="num">${nAttivi}</b></div>
        <div><span class="lbl2">Realizzato ${anno}</span><b class="num">${_segno(realAnno)}</b></div>
      </div>
    </div>

    <div class="btn-row" style="margin:14px 0 4px">
      <button class="btn btn-primary" id="op-versa">Versa</button>
      <button class="btn btn-secondary" id="op-sposta">Sposta</button>
      <button class="btn btn-secondary" id="op-disinv">Disinvesti</button>
    </div>

    ${contiInv.map(c => {
      const aperti = strumentiDelConto(c, { anche_chiusi: false });
      return `
      <div class="section-lbl"><span>${escapeHtml(c.nome)}</span><span class="num">${fmtEUR(versatoConto(c))}</span></div>
      <div class="card" style="padding:4px 14px">
        ${aperti.length ? aperti.sort((a, b) => versato(b) - versato(a)).map(rigaStrumento).join('') : '<div class="empty" style="padding:8px 0">Nessuno strumento aperto</div>'}
      </div>`;
    }).join('') || '<div class="empty">Nessun conto di investimento</div>'}

    <div class="section-lbl"><span>Risultato realizzato</span></div>
    <div class="card" style="padding:4px 14px">
      <div class="conto-riga" data-realizzato="1">
        <div class="conto-nome">${anno}<div class="meta" style="font-size:11.5px;margin-top:2px">${nOpAnno} ${nOpAnno === 1 ? 'operazione' : 'operazioni'}</div></div>
        <div class="conto-saldo num">${_segno(realAnno)}</div><div class="conto-chev">›</div>
      </div>
      <div class="conto-riga" data-realizzato="1">
        <div class="conto-nome">Da sempre</div>
        <div class="conto-saldo num">${_segno(realTot)}</div><div class="conto-chev">›</div>
      </div>
    </div>

    ${chiusi.length ? `
      <div class="section-lbl"><span>Chiusi</span></div>
      <div class="card" style="padding:4px 14px">
        ${chiusi.map(s => `
          <div class="conto-riga strumento-riga" data-strumento="${s.id}">
            <div class="conto-nome" style="color:var(--txt-2)">${escapeHtml(s.nome)}<div class="meta" style="font-size:11.5px;margin-top:2px">${escapeHtml(contoDiStrumento(s).nome)}</div></div>
            <div class="conto-saldo num" style="color:var(--txt-2)">${fmtEUR(versato(s))}</div><div class="conto-chev">›</div>
          </div>`).join('')}
      </div>` : ''}

    <p class="meta" style="margin:12px 4px">Qui vedi quanto hai <b>versato</b>. Il valore di mercato aggiornato lo trovi nelle app delle piattaforme.</p>
    <div class="btn-row" style="flex-wrap:wrap">
      <button class="btn btn-secondary" id="go-gestione" style="flex:1 1 45%">Conti e strumenti</button>
      <button class="btn btn-secondary" id="go-analisi" style="flex:1 1 45%">Investito nel tempo</button>
    </div>
  `;

  root.querySelector('#op-versa').addEventListener('click', () => apriVersa(null, rerender));
  root.querySelector('#op-sposta').addEventListener('click', () => apriSposta(null, rerender));
  root.querySelector('#op-disinv').addEventListener('click', () => apriDisinvesti(null, rerender));
  root.querySelectorAll('[data-strumento]').forEach(el => el.addEventListener('click', () => navigate('dettaglio-investimento', { strumento: el.dataset.strumento })));
  root.querySelectorAll('[data-realizzato]').forEach(el => el.addEventListener('click', apriRealizzato));
  root.querySelector('#go-gestione').addEventListener('click', () => navigate('conti'));
  root.querySelector('#go-analisi').addEventListener('click', () => navigate('analisi', { macro: 'Investimenti' }));
};

// Elenco delle operazioni che hanno prodotto un risultato realizzato
export const apriRealizzato = () => {
  const lista = risultatiRealizzati();
  apriSheet('Risultato realizzato', `
    ${lista.length ? lista.map(r => `
      <div class="mov" style="cursor:default">
        <div class="ic">${UI_SVG.investimento}</div>
        <div class="body"><div class="d1">${escapeHtml(r.desc)}${r.strumento ? ` · ${escapeHtml(r.strumento)}` : ''}</div><div class="d2">${r.data.split('-').reverse().join('/')}</div></div>
        <div class="amt num" style="color:${r.ris >= 0 ? 'var(--up)' : 'var(--down)'}">${_segno(r.ris)}</div>
      </div>`).join('') : '<div class="empty">Nessuna operazione</div>'}
    <p class="meta" style="margin-top:12px;line-height:1.5">Nasce da solo da <b>Sposta</b> e <b>Disinvesti</b>: è la differenza tra quanto arriva o incassi e il versato che esce. Non è un'entrata: il patrimonio sale perché la liquidità cresce più di quanto cala il versato.</p>
  `);
};
