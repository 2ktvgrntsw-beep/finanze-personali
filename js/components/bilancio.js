// bilancio.js — Quanto entra, quanto esce, quanto resta. Una riga per anno.
//
// Disegno concordato (v3.39):
//  - in alto il risparmiato degli anni completi;
//  - un grafico del TASSO di risparmio anno per anno (tocca una barra = apri l'anno);
//  - una tabella compatta: Anno · Entrate · Spese · Risparmio · %;
//  - sotto, il dettaglio dell'anno scelto "a cascata", scorribile con ‹ ›:
//      Entrate − Bisogni − Desideri = Risparmiato
//      dove è finito: capitale mutuo · accantonato e investito · rimasto sui conti.
// Qui bisogni e desideri NON contengono la quota capitale del mutuo (che è risparmio
// e sta sotto): è la stessa scelta dello "Speso" di questa pagina.
// Le vecchie barre orizzontali di lunghezza diversa sono sparite: confrontavano due
// cose insieme (quanto è entrato e come è stato diviso) e non se ne leggeva bene nessuna.

import { fmtEUR, fmtEUR0, escapeHtml, nomeMese } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { bilancioAnnuale, bilancioComplessivo, candidatiUnaTantum, TAG_UNA_TANTUM, SOGLIA_SCARTO_MESE } from '../services/bilancioService.js';
import { applicaTagBulk } from '../services/movimentiService.js';

let _annoBil = null;      // anno aperto nel dettaglio
let _mostraCand = false;  // elenco dei candidati 'una tantum'

const _segnoEUR = (n) => (n < 0 ? '−' : '') + fmtEUR0(Math.abs(n));
const _pct = (t) => t == null ? '—' : (t < 0 ? '−' : '') + Math.abs(Math.round(t)) + '%';

export const renderBilancio = async (root) => {
  document.getElementById('view-title').textContent = 'Bilancio';
  const righe = bilancioAnnuale().filter(r => r.entrate > 0 || r.speso > 0);   // dal più recente
  if (!righe.length) { root.innerHTML = '<div class="empty">Nessun dato</div>'; return; }
  if (!_annoBil || !righe.some(r => r.anno === _annoBil)) _annoBil = righe[0].anno;
  const tot = bilancioComplessivo();
  const cand = candidatiUnaTantum();
  const r = righe.find(x => x.anno === _annoBil);
  const idx = righe.indexOf(r);

  // grafico del tasso: dal più vecchio al più recente
  const asc = righe.slice().reverse();
  const maxT = Math.max(10, ...asc.map(x => Math.abs(x.tasso || 0)));
  const negativi = asc.some(x => (x.tasso || 0) < 0);
  const hPos = negativi ? 82 : 100;   // spazio per le barre sotto lo zero
  const grafico = `
    <div class="card">
      <div class="meta">Tasso di risparmio · tocca un anno</div>
      <div class="bil-ch" style="height:${negativi ? 120 : 104}px">
        ${asc.map(x => {
          const t = x.tasso || 0;
          const h = Math.abs(t) / maxT * hPos;
          return `<div class="bil-col ${x.anno === _annoBil ? 'on' : ''}" data-anno="${x.anno}">
            <span class="num bil-col-v" style="color:${t < 0 ? 'var(--down)' : 'var(--txt-2)'}">${_pct(x.tasso)}</span>
            <div class="bil-col-area" style="height:${hPos}%"><div class="bil-col-bar" style="height:${t > 0 ? h / hPos * 100 : 0}%;opacity:${x.parziale ? .5 : 1}"></div></div>
            ${negativi ? `<div class="bil-col-neg" style="height:${100 - hPos}%"><div style="height:${t < 0 ? Math.min(100, h / (100 - hPos) * 100) : 0}%;background:var(--down);border-radius:0 0 3px 3px"></div></div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="bil-ch-lbl">${asc.map(x => `<span class="meta">${x.anno.slice(2)}</span>`).join('')}</div>
    </div>`;

  const tabella = `
    <div class="card" style="padding:6px 10px">
      <div class="bil-tr h"><span>Anno</span><span>Entrate</span><span>Spese</span><span>Risparmio</span><span>%</span></div>
      ${righe.map(x => `
        <div class="bil-tr ${x.anno === _annoBil ? 'on' : ''}" data-anno="${x.anno}">
          <span>${x.anno}${x.parziale ? '<i>in corso</i>' : ''}</span>
          <span class="num">${fmtEUR0(x.entrate)}</span>
          <span class="num">${fmtEUR0(x.speso)}</span>
          <span class="num" style="color:${x.risparmiato < 0 ? 'var(--down)' : 'var(--up)'}">${_segnoEUR(x.risparmiato)}</span>
          <span class="num" style="color:${(x.tasso || 0) < 0 ? 'var(--down)' : 'var(--up)'};font-weight:700">${_pct(x.tasso)}</span>
        </div>`).join('')}
    </div>`;

  const larg = (v) => Math.max(0, v) / Math.max(r.entrate, r.speso, 1) * 100;
  const riga = (lbl, v, col, extra = '') => `
    <div class="bil-cr" ${extra}><span>${lbl}</span><b class="num" style="color:${col}">${_segnoEUR(v)}</b></div>
    <div class="bil-cbar" style="width:${larg(v)}%;background:${col}"></div>`;
  const dettaglio = `
    <div class="card" id="bil-det">
      <div class="bil-nav">
        <button class="hbtn" data-nav="1" ${idx === righe.length - 1 ? 'disabled' : ''} aria-label="Anno precedente">‹</button>
        <div style="text-align:center"><div style="font-size:17px;font-weight:700">${r.anno}${r.parziale ? ' · in corso' : ''}</div>
          <div class="meta">${r.parziale ? 'gennaio–' + nomeMese(r.finoAlMese - 1).toLowerCase() : 'anno completo'}</div></div>
        <button class="hbtn" data-nav="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Anno successivo">›</button>
      </div>
      ${riga('Entrate', r.entrate, 'var(--up)')}
      ${riga('− Bisogni', r.bisogni, 'var(--bisogni)')}
      ${riga('− Desideri', r.desideri, 'var(--desideri)', `data-desideri="${r.anno}" role="button" style="cursor:pointer"`)}
      ${r.nonClassificato > 0.5 ? riga('− Da classificare', r.nonClassificato, 'var(--txt-3)') : ''}
      <div class="bil-cr bil-tot"><span>= Risparmiato</span><b class="num" style="color:${r.risparmiato < 0 ? 'var(--down)' : 'var(--txt)'}">${_segnoEUR(r.risparmiato)} · ${_pct(r.tasso)}</b></div>
      ${r.straordinari.length ? `<div class="meta" style="margin:2px 0 4px">Senza le ${r.straordinari.length} una tantum: ${_pct(r.tassoOrdinario)}</div>` : ''}

      <div class="meta" style="margin:12px 0 2px">Dove è finito</div>
      <div class="bil-cr"><span><span class="nat-dot" style="background:var(--capitale)"></span>Capitale mutuo</span><span class="num">${fmtEUR0(r.capitaleDebito)}</span></div>
      <div class="bil-cr"><span><span class="nat-dot" style="background:var(--transfer)"></span>Accantonato e investito</span><span class="num">${fmtEUR0(r.accantonato)}</span></div>
      <div class="bil-cr"><span><span class="nat-dot" style="background:${r.rimasto < 0 ? 'var(--down)' : 'var(--up)'}"></span>Rimasto sui conti</span><span class="num" style="color:${r.rimasto < 0 ? 'var(--down)' : 'var(--up)'}">${_segnoEUR(r.rimasto)}</span></div>
      ${r.inRosso ? `<div class="fr-sub" style="margin:6px 0 2px;color:var(--warn)">${r.risparmiato < 0
        ? `Hai speso più di quanto è entrato: con la quota capitale del mutuo, ${fmtEUR(Math.abs(r.rimasto))} sono usciti dalla liquidità che avevi già.`
        : `Hai messo da parte più di quanto hai risparmiato: ${fmtEUR(Math.abs(r.rimasto))} sono usciti dalla liquidità che avevi già.`}</div>` : ''}

      <p class="meta" style="margin:10px 0 0;line-height:1.5">Bisogni e desideri senza la quota capitale del mutuo: quella non è spesa, riduce il debito, e la trovi qui sopra. Tocca "Desideri" per aprire quell'anno in Bisogni e desideri.</p>
      ${r.rateDebito ? `<div class="fr-sub" style="margin:6px 0 0">Rate del mutuo registrate: ${fmtEUR(r.rateDebito)}, di cui ${fmtEUR(r.interessiDebito)} di interessi (spesa) e ${fmtEUR(r.capitaleDebito)} di capitale.</div>` : ''}
      ${r.rateMancanti ? `<div class="fr-sub" style="margin:6px 0 0;color:var(--warn)">Il piano prevede ${r.rateMancanti} ${r.rateMancanti > 1 ? 'rate' : 'rata'} in più di quante ne trovo fra i movimenti: ${r.rateMancanti === 1 ? 'non compare' : 'non compaiono'} qui.</div>` : ''}
      ${r.straordinari.length ? `
        <div class="fr-sub" style="margin:8px 0 2px"><b>Una tantum di quest'anno</b></div>
        ${r.straordinari.map(x => `<div class="fr-sub" style="margin:0 0 4px">${x.data} · ${escapeHtml(x.desc || '(senza descrizione)')} · <b style="color:var(--${x.tipo === 'entrata' ? 'up' : 'down'})">${fmtEUR(x.imp)}</b></div>`).join('')}` : ''}
      ${r.mesiConCedolino ? (() => {
        const nomeM = (am) => `${nomeMese(Number(am.slice(5)) - 1).toLowerCase()}${am.slice(0, 4) !== r.anno ? ' ' + am.slice(0, 4) : ''}`;
        const fuori = r.riscontroFuori;
        return `<div class="eprice-note" style="margin:8px 0 0">
          <b>Riscontro con le buste paga</b>: ${fuori.length ? 'qualche mese non torna.' : `i ${r.mesiConCedolino} mesi con cedolino tornano (scarto entro ${SOGLIA_SCARTO_MESE} €).`}
          ${fuori.map(g => `<div style="margin-top:4px">${g.mesi.map(nomeM).join('–')}: registrati ${fmtEUR(g.registrato)} · cedolino ${fmtEUR(g.cedolino)} · <b style="color:var(--warn)">${g.scarto > 0 ? '+' : '−'}${fmtEUR(Math.abs(g.scarto))}</b>${g.mesi.length > 1 ? ' <span style="color:var(--txt-3)">(accredito a cavallo dei mesi)</span>' : ''}</div>`).join('')}
          <div style="margin-top:6px;color:var(--txt-3)">Cedolino = netto + addebiti in busta. ${r.extraStipendio ? `Buoni pasto e welfare (${fmtEUR(r.extraStipendio)}) non sono nel netto e restano fuori dal confronto.` : ''}</div>
        </div>`;
      })() : ''}
    </div>`;

  root.innerHTML = `
    ${tot ? `<div class="net-card" style="margin-top:8px">
      <div class="lbl2">Risparmiato in ${tot.anni} anni completi</div>
      <div class="num" style="font-size:30px;font-weight:750">${fmtEUR0(tot.risparmiato)}</div>
      <div class="meta" style="margin-top:4px">${Math.round(tot.tasso)}% di quanto è entrato · ${tot.dal}-${tot.al}</div>
    </div>` : ''}
    ${grafico}
    ${tabella}
    ${dettaglio}

    <div class="section-lbl"><span>Una tantum</span>${cand.length ? `<span class="act" id="bil-cand">${cand.length} da marcare ›</span>` : ''}</div>
    <div class="card">
      <div class="meta">Una spesa o un'entrata straordinaria falsa il confronto fra gli anni. Marcale col tag <b>${TAG_UNA_TANTUM}</b> e il bilancio le mostrerà a parte (e il tetto dei desideri non le conta fra le entrate).</div>
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

  const scorriAlDettaglio = () => { const d = root.querySelector('#bil-det'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  root.querySelectorAll('[data-anno]').forEach(el => el.addEventListener('click', () => {
    _annoBil = el.dataset.anno; renderBilancio(root).then(scorriAlDettaglio);
  }));
  root.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => {
    const n = idx + Number(el.dataset.nav);
    if (n < 0 || n >= righe.length) return;
    _annoBil = righe[n].anno; renderBilancio(root).then(scorriAlDettaglio);
  }));
  const des = root.querySelector('[data-desideri]');
  if (des) des.addEventListener('click', () => navigate('bisogni', { anno: des.dataset.desideri }));
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
