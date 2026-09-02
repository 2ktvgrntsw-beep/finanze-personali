// bilancio.js — Quanto entra, quanto esce, quanto resta. Una riga per anno.
//
// Pagina a se' e non quarta scheda di Analisi: le altre tre guardano tutte le SPESE,
// questa mette insieme i due lati del conto. Ci si arriva dal pulsante in fondo alla
// schermata iniziale di Analisi, sotto i panieri.

import { fmtEUR, fmtEUR0, escapeHtml, nomeMese } from '../core/utils.js';
import { bilancioAnnuale, bilancioComplessivo, candidatiUnaTantum, TAG_UNA_TANTUM } from '../services/bilancioService.js';
import { applicaTagBulk } from '../services/movimentiService.js';

// ═══════════════════════════════════════════════════════════════════════════
// BILANCIO — quanto entra, quanto esce, quanto resta. Una riga per anno.
//
// Barre ORIZZONTALI, una per anno, impilate verticalmente: su un telefono e' l'unico
// modo di mettere dieci anni sotto gli occhi insieme e confrontarli senza scorrere.
// La lunghezza della barra e' proporzionale alle ENTRATE dell'anno (quindi si vede
// anche come sono cresciute), e i tre segmenti dicono dove sono finite.
// Se in un anno e' uscito piu' di quanto e' entrato, la barra supera la tacca bianca
// che segna il livello delle entrate: si vede a colpo d'occhio di quanto.
// ═══════════════════════════════════════════════════════════════════════════
let _annoBil = null;      // anno aperto nel dettaglio
let _mostraCand = false;  // elenco dei candidati 'una tantum'

const SEG_BIL = [
  { k: 'speso', nome: 'Speso', colore: 'var(--down)' },
  { k: 'capitaleDebito', nome: 'Capitale mutuo', colore: '#7B6CFF' },
  { k: 'accantonato', nome: 'Accantonato', colore: 'var(--transfer)' },
  { k: 'rimasto', nome: 'Rimasto liquido', colore: 'var(--up)' },
];

export const renderBilancio = async (root) => {
  document.getElementById('view-title').textContent = 'Bilancio';
  const righe = bilancioAnnuale().filter(r => r.entrate > 0 || r.speso > 0);
  if (!righe.length) { root.innerHTML = '<div class="empty">Nessun dato</div>'; return; }
  const tot = bilancioComplessivo();
  const cand = candidatiUnaTantum();
  // scala comune a tutti gli anni: il massimo fra entrate e uscite di ogni anno
  const scala = Math.max(...righe.map(r => Math.max(r.entrate, r.speso + r.capitaleDebito + r.accantonato)), 1);
  const pc = (v) => Math.max(0, v) / scala * 100;

  const rigaHTML = (r) => {
    const aperta = _annoBil === r.anno;
    const larghSpeso = pc(r.speso), larghCap = pc(r.capitaleDebito), larghAcc = pc(r.accantonato), larghRim = pc(r.rimasto);
    return `
      <div class="bilrow ${aperta ? 'on' : ''}" data-bil="${r.anno}">
        <div class="bilhead">
          <span class="anno num">${r.anno}${r.parziale ? '<i>in corso</i>' : ''}</span>
          <span class="entr num">${fmtEUR0(r.entrate)} <span class="u">entrati</span></span>
          <span class="tasso num ${r.tasso >= 0 ? 'ok' : 'ko'}">${r.tasso == null ? '—' : (r.tasso >= 0 ? '' : '−') + Math.abs(Math.round(r.tasso)) + '%'}</span>
        </div>
        <div class="biltrack">
          <span class="seg sp" style="width:${larghSpeso}%"></span>
          <span class="seg cp" style="width:${larghCap}%"></span>
          <span class="seg ac" style="width:${larghAcc}%"></span>
          <span class="seg li" style="width:${larghRim}%"></span>
          ${r.inRosso ? `<span class="bilmk" style="left:${pc(r.entrate)}%" title="livello delle entrate: oltre questa tacca stai attingendo alla liquidità"></span>` : ''}
        </div>
      </div>
      <div class="bilbody ${aperta ? 'on' : ''}">
        <div class="paniere-anno-riga"><span class="num anno">Entrate</span><b class="num">${fmtEUR(r.entrate)}</b><span class="delta num" style="color:var(--txt-3)">${r.parziale ? 'gen-' + nomeMese(r.finoAlMese - 1).slice(0, 3).toLowerCase() : r.nMov + ' movimenti'}</span></div>
        <div class="paniere-anno-riga"><span class="num anno">Speso</span><b class="num" style="color:var(--down)">${fmtEUR(r.speso)}</b><span class="delta num" style="color:var(--txt-3)">${Math.round(r.speso / (r.entrate || 1) * 100)}% delle entrate</span></div>
        ${r.rateDebito ? `
        <div class="paniere-anno-riga"><span class="num anno">Capitale mutuo</span><b class="num" style="color:#7B6CFF">${fmtEUR(r.capitaleDebito)}</b><span class="delta num" style="color:var(--txt-3)">non è spesa: riduce il debito</span></div>
        <div class="fr-sub" style="margin:-4px 0 8px">Delle rate registrate (${fmtEUR(r.rateDebito)}) solo ${fmtEUR(r.interessiDebito)} di interessi sono un costo: restano dentro "Speso". Il capitale resta tuo, ma dentro la casa — torna liquido solo vendendo.</div>` : ''}
        ${r.rateMancanti ? `<div class="fr-sub" style="margin:-2px 0 8px;color:var(--warn)">Il piano prevede ${r.rateMancanti} rata${r.rateMancanti > 1 ? 'e' : ''} in più di quante ne trovo nel registro: ${r.rateMancanti === 1 ? 'una rata non è stata inserita' : 'quelle rate non sono state inserite'} fra i movimenti, quindi qui non ${r.rateMancanti === 1 ? 'compare' : 'compaiono'}.</div>` : ''}
        <div class="paniere-anno-riga"><span class="num anno">Accantonato</span><b class="num" style="color:var(--transfer)">${fmtEUR(r.accantonato)}</b><span class="delta num" style="color:var(--txt-3)">su conti risparmio/investimenti</span></div>
        <div class="paniere-anno-riga"><span class="num anno">Rimasto</span><b class="num" style="color:var(--${r.inRosso ? 'down' : 'up'})">${r.inRosso ? '−' : ''}${fmtEUR(Math.abs(r.rimasto))}</b><span class="delta num" style="color:var(--txt-3)">liquidità</span></div>
        ${r.inRosso ? `<div class="fr-sub" style="margin:4px 0 2px;color:var(--warn)">In quest'anno è uscito dal conto più di quanto è entrato: hai accantonato ${fmtEUR(r.accantonato)} attingendo per ${fmtEUR(Math.abs(r.rimasto))} alla liquidità che avevi già. Non è un buco — il tasso di risparmio resta ${r.tasso == null ? '—' : Math.round(r.tasso) + '%'}, perché misura quanto NON hai speso — ma il conto corrente si è alleggerito.</div>` : ''}
        ${r.straordinari.length ? `
          <div class="fr-sub" style="margin:6px 0 2px"><b>Una tantum di quest'anno</b> — il tasso senza queste sarebbe <b>${r.tassoOrdinario == null ? '—' : Math.round(r.tassoOrdinario) + '%'}</b></div>
          ${r.straordinari.map(x => `<div class="fr-sub" style="margin:0 0 4px">${x.data} · ${escapeHtml(x.desc || '(senza descrizione)')} · <b style="color:var(--${x.tipo === 'entrata' ? 'up' : 'down'})">${fmtEUR(x.imp)}</b></div>`).join('')}
        ` : ''}
        ${r.nettoBuste ? `<div class="eprice-note" style="margin:6px 0 8px">Riscontro con le buste paga: qui risultano <b>${fmtEUR(r.stipendiRegistrati)}</b> di stipendi registrati contro <b>${fmtEUR(r.nettoBuste)}</b> di netto sui cedolini${Math.abs(r.scartoBuste) > 50 ? `, <span style="color:var(--warn)">${fmtEUR(Math.abs(r.scartoBuste))} di scarto</span>: probabilmente qualche movimento non è stato registrato` : ' — combaciano'}.</div>` : ''}
      </div>`;
  };

  root.innerHTML = `
    <div class="net-card" style="margin-top:8px">
      <div class="lbl2">Risparmiato in ${tot.anni} anni completi</div>
      <div class="num" style="font-size:30px;font-weight:750">${fmtEUR0(tot.risparmiato)}</div>
      <div class="meta" style="margin-top:4px">${Math.round(tot.tasso)}% di quanto è entrato · ${tot.dal}-${tot.al}</div>
    </div>

    <div class="elegend" style="margin:12px 2px 2px">${SEG_BIL.map(s =>
      `<span><i style="background:${s.colore}"></i>${s.nome}</span>`).join('')}</div>
    <div class="meta" style="margin:0 4px 8px">Barra lunga quanto le entrate dell'anno. La tacca bianca segna dove le uscite le hanno superate. Tocca una riga per il dettaglio.</div>

    <div class="bilchart">${righe.map(rigaHTML).join('')}</div>

    <div class="section-lbl"><span>Una tantum</span>${cand.length ? `<span class="act" id="bil-cand">${cand.length} da marcare ›</span>` : ''}</div>
    <div class="card">
      <div class="meta">Una spesa o un'entrata straordinaria falsa il confronto fra gli anni: il 2023 con la vendita e il saldo dell'auto sembra insieme eccezionale e disastroso. Marcale col tag <b>${TAG_UNA_TANTUM}</b> e il bilancio le mostrerà a parte.</div>
      ${_mostraCand && cand.length ? `
        <div style="margin-top:10px">${cand.map(c => `
          <label class="fr-sub" style="display:flex;align-items:center;gap:10px;margin:0 0 8px">
            <input type="checkbox" class="bil-cb" value="${escapeHtml(c.id)}">
            <span style="flex:1">${c.data} · ${escapeHtml(c.desc || c.cat)} <span style="color:var(--txt-3)">${escapeHtml(c.macro)}</span></span>
            <b class="num" style="color:var(--${c.tipo === 'entrata' ? 'up' : 'down'})">${fmtEUR(c.imp)}</b>
          </label>`).join('')}
        </div>
        <button class="btn btn-primary" id="bil-applica" style="margin-top:6px">Marca come una tantum</button>` : ''}
    </div>
  `;

  root.querySelectorAll('[data-bil]').forEach(el => el.addEventListener('click', () => {
    _annoBil = _annoBil === el.dataset.bil ? null : el.dataset.bil;
    renderBilancio(root);
  }));
  const bc = root.querySelector('#bil-cand');
  if (bc) bc.addEventListener('click', () => { _mostraCand = !_mostraCand; renderBilancio(root); });
  const ba = root.querySelector('#bil-applica');
  if (ba) ba.addEventListener('click', async () => {
    const ids = [...root.querySelectorAll('.bil-cb:checked')].map(cb => cb.value);
    if (!ids.length) return;
    ba.disabled = true;
    await applicaTagBulk(ids, TAG_UNA_TANTUM);
    _mostraCand = false;
    renderBilancio(root);
  });
};
