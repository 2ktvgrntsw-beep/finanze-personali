// drill.js — Drill-down adattivo nelle categorie.
// Params: macro (obbligatorio), cat (opzionale), periodo, mese.
// Comportamento adattivo: se una categoria non ha sottocategorie, l'icona/barra
// portano direttamente ai movimenti (salta il livello inesistente).

import { state, movimentiDelMese } from '../core/store.js';
import { fmtEUR, fmtPct, nomeMese, escapeHtml } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate, buildHash } from '../core/router.js';
import { aggregaPerLivello, soloSpese, totaliPeriodo } from '../services/movimentiService.js';
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

  // livello corrente: se ho cat -> mostro sub; altrimenti -> mostro cat
  const livello = cat ? 'sub' : 'cat';
  const filtro = cat ? { macro, cat } : { macro };
  const righe = aggregaPerLivello(movs, livello, filtro);

  // totali del ramo corrente
  let ramo = soloSpese(movs).filter(m => m.macro === macro);
  if (cat) ramo = ramo.filter(m => m.cat === cat);
  const totRamo = ramo.reduce((s, m) => s + m.imp, 0);

  // percorso per il titolo
  const percorso = cat ? `${macro} ›` : '';
  const titolo = cat || macro;

  // aggiorna header title (con crumb)
  document.getElementById('view-title').innerHTML = `${percorso ? `<span class="crumb">${escapeHtml(percorso)}</span>` : ''}${escapeHtml(titolo)}`;

  const maxTot = righe.length ? righe[0].totale : 1;

  const righeHTML = righe.length ? righe.map(r => {
    const chiave = r.chiave === '(senza)' ? '' : r.chiave;
    // al livello 'sub', o quando la categoria non ha sub, il tap porta ai movimenti
    const foglia = livello === 'sub' || (livello === 'cat' && !categoriaHaSub(macro, chiave));
    const drillTarget = foglia
      ? buildHash('movimenti', { macro, cat: livello === 'cat' ? chiave : cat, sub: livello === 'sub' ? chiave : '', periodo, mese })
      : buildHash('drill', { macro, cat: chiave, periodo, mese });
    const movTarget = buildHash('movimenti', {
      macro,
      cat: livello === 'cat' ? chiave : cat,
      sub: livello === 'sub' ? chiave : '',
      periodo, mese,
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

  const labelPeriodo = periodo === 'anno' ? mese.slice(0, 4) : periodo === 'mese' ? `${nomeMese(parseInt(mese.split('-')[1]) - 1)} ${mese.split('-')[0]}` : 'Ultimi 7 giorni';

  root.innerHTML = `
    <div class="triple" style="margin-top:8px">
      <div class="cell"><div class="lbl">Spese</div><div class="val sp num">${fmtEUR(totRamo)}</div></div>
      <div class="cell"><div class="lbl">Periodo</div><div class="val sa" style="font-size:14px">${labelPeriodo}</div></div>
      <div class="cell"><div class="lbl">Movimenti</div><div class="val sa num">${ramo.length}</div></div>
    </div>
    <div class="section-lbl"><span>${cat ? 'Sottocategorie di ' + escapeHtml(cat) : 'Categorie di ' + escapeHtml(macro)}</span></div>
    ${righeHTML}
    <div style="margin-top:20px">
      <button class="btn btn-secondary" data-href="${buildHash('movimenti', { macro, cat: cat || '', periodo, mese })}">Vedi tutti i movimenti di ${escapeHtml(cat || macro)}</button>
    </div>
  `;

  // navigazione via data-href
  root.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    location.hash = el.dataset.href;
  }));
};
