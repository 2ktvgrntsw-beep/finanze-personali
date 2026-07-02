// drill.js — Drill-down adattivo nelle categorie, con navigazione tra i periodi.
// Params: macro (obbligatorio), cat (opzionale), periodo, mese.
// A ogni livello: navigatore mese/anno con frecce (per confrontare i periodi al volo)
// e card [Totale] [vs media] [vs precedente], come nella home.

import { state, movimentiDelMese } from '../core/store.js';
import { fmtEUR, fmtPct, nomeMese, escapeHtml } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate, buildHash } from '../core/router.js';
import { aggregaPerLivello, soloSpese } from '../services/movimentiService.js';
import { categoriaHaSub } from '../services/categorieService.js';

const movimentiPeriodo = (periodo, mese) => {
  if (periodo === 'anno') return state.movimenti.filter(m => m.data.startsWith(mese.slice(0, 4)));
  if (periodo === 'settimana') {
    const oggi = new Date(); const s = new Date(); s.setDate(oggi.getDate() - 6);
    return state.movimenti.filter(m => m.data >= s.toISOString().slice(0, 10));
  }
  return movimentiDelMese(mese);
};

export const renderDrill = async (root, params) => {
  const { macro, cat, periodo = 'mese', mese } = params;
  const movs = movimentiPeriodo(periodo, mese);
  const [anno, meseNum] = mese.split('-');

  // livello corrente: se ho cat -> mostro sub; altrimenti -> mostro cat
  const livello = cat ? 'sub' : 'cat';
  const filtro = cat ? { macro, cat } : { macro };
  const righe = aggregaPerLivello(movs, livello, filtro);

  // totali del ramo corrente nel periodo selezionato
  let ramo = soloSpese(movs).filter(m => m.macro === macro);
  if (cat) ramo = ramo.filter(m => m.cat === cat);
  const totRamo = ramo.reduce((s, m) => s + m.imp, 0);

  // ── vs media e vs precedente, calcolati sullo STESSO ramo su tutto lo storico ──
  const perPeriodo = {};
  for (const m of soloSpese(state.movimenti)) {
    if (m.macro !== macro) continue;
    if (cat && m.cat !== cat) continue;
    const k = periodo === 'anno' ? m.data.slice(0, 4) : (m.annomese || m.data.slice(0, 7));
    perPeriodo[k] = (perPeriodo[k] || 0) + m.imp;
  }
  const chiaveCorrente = periodo === 'anno' ? anno : mese;
  const altre = Object.keys(perPeriodo).filter(k => k !== chiaveCorrente);
  const media = altre.length ? altre.reduce((s, k) => s + perPeriodo[k], 0) / altre.length : 0;
  let chiavePrec;
  if (periodo === 'anno') chiavePrec = String(parseInt(anno) - 1);
  else { const d = new Date(parseInt(anno), parseInt(meseNum) - 2, 1); chiavePrec = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  const valPrec = perPeriodo[chiavePrec] || 0;

  const deltaCell = (rif, lbl) => {
    if (periodo === 'settimana' || rif <= 0) return `<div class="cell"><div class="lbl">${lbl}</div><div class="val sa num">—</div></div>`;
    const pct = Math.round((totRamo - rif) / rif * 100);
    return `<div class="cell"><div class="lbl">${lbl}</div><div class="val num ${pct <= 0 ? 'en' : 'sp'}">${pct > 0 ? '+' : ''}${pct}%</div></div>`;
  };

  // percorso per il titolo
  const percorso = cat ? `${macro} ›` : '';
  const titolo = cat || macro;
  document.getElementById('view-title').innerHTML = `${percorso ? `<span class="crumb">${escapeHtml(percorso)}</span>` : ''}${escapeHtml(titolo)}`;

  const maxTot = righe.length ? righe[0].totale : 1;

  const righeHTML = righe.length ? righe.map(r => {
    const chiave = r.chiave === '(senza)' ? '' : r.chiave;
    const foglia = livello === 'sub' || (livello === 'cat' && !categoriaHaSub(macro, chiave));
    const drillTarget = foglia
      ? buildHash('movimenti', { macro, cat: livello === 'cat' ? chiave : cat, sub: livello === 'sub' ? chiave : '', periodo, mese })
      : buildHash('drill', { macro, cat: chiave, periodo, mese });
    const movTarget = buildHash('movimenti', {
      macro, cat: livello === 'cat' ? chiave : cat, sub: livello === 'sub' ? chiave : '', periodo, mese,
    });
    return `
      <div class="catrow">
        <div class="icon" data-href="${movTarget}">${livello === 'cat' ? iconaMacro(macro) : '🏷️'}</div>
        <div class="body" data-href="${drillTarget}">
          <div class="row1">
            <span class="name">${escapeHtml(r.chiave)}</span>
            <span class="right"><span class="amt num">${fmtEUR(r.totale)}</span><span class="pct num">${fmtPct(r.pct)}</span></span>
          </div>
          <div class="bar"><span style="width:${Math.max(3, r.totale / maxTot * 100)}%"></span></div>
        </div>
        <div class="chev" data-href="${drillTarget}">›</div>
      </div>`;
  }).join('') : '<div class="empty">Nessuna spesa in questo ramo</div>';

  const labelPeriodo = periodo === 'anno' ? anno : periodo === 'mese' ? `${nomeMese(parseInt(meseNum) - 1)} ${anno}` : 'Ultimi 7 giorni';

  root.innerHTML = `
    <div class="mov-sticky">
      ${periodo !== 'settimana' ? `
        <div class="month-nav" style="margin:4px 0">
          <button class="arr" id="d-prev">‹</button>
          <div class="m">${labelPeriodo}</div>
          <button class="arr" id="d-next">›</button>
        </div>` : `<div class="month-nav" style="margin:4px 0"><div class="m">${labelPeriodo}</div></div>`}
      <div class="triple" style="margin:6px 0 4px">
        <div class="cell"><div class="lbl">Spese</div><div class="val sp num">${fmtEUR(totRamo)}</div></div>
        ${deltaCell(media, 'vs media')}
        ${deltaCell(valPrec, periodo === 'anno' ? 'vs anno prec.' : 'vs mese prec.')}
      </div>
    </div>
    <div class="section-lbl"><span>${cat ? 'Sottocategorie di ' + escapeHtml(cat) : 'Categorie di ' + escapeHtml(macro)}</span></div>
    ${righeHTML}
    <div style="margin-top:20px">
      <button class="btn btn-secondary" data-href="${buildHash('movimenti', { macro, cat: cat || '', periodo, mese })}">Vedi tutti i movimenti di ${escapeHtml(cat || macro)}</button>
    </div>
  `;

  // frecce: cambiano il periodo restando nello STESSO ramo (via hash, così il back funziona)
  const sposta = (delta) => {
    let nuovoMese;
    if (periodo === 'anno') nuovoMese = `${parseInt(anno) + delta}-${meseNum}`;
    else { const d = new Date(parseInt(anno), parseInt(meseNum) - 1 + delta, 1); nuovoMese = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    location.hash = buildHash('drill', { macro, cat: cat || '', periodo, mese: nuovoMese });
  };
  const dp = root.querySelector('#d-prev'), dn = root.querySelector('#d-next');
  if (dp) dp.addEventListener('click', () => sposta(-1));
  if (dn) dn.addEventListener('click', () => sposta(1));

  // navigazione via data-href
  root.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    location.hash = el.dataset.href;
  }));
};
