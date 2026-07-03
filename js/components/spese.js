// spese.js — Home "Spese": la schermata che si apre ogni giorno.
// Vista per periodo (Settimana/Mese/Anno) delle spese per categoria, con drill-down.

import { state, movimentiDelMese } from '../core/store.js';
import { fmtEUR, fmtEUR0, fmtPct, nomeMese, annomese, todayISO, escapeHtml, clamp } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import {
  totaliPeriodo, aggregaPerLivello, mediaSpeseMensile, soloSpese,
} from '../services/movimentiService.js';
import { calcolaDelta } from './shared.js';

// stato locale della schermata (periodo selezionato)
let _periodo = 'mese';                 // 'settimana' | 'mese' | 'anno'
let _meseCorrente = annomese(todayISO());

const mesePrec = (am) => { const [a, m] = am.split('-').map(Number); const d = new Date(a, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const meseSucc = (am) => { const [a, m] = am.split('-').map(Number); const d = new Date(a, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// Movimenti del periodo attualmente selezionato
const movimentiPeriodo = () => {
  if (_periodo === 'mese') return movimentiDelMese(_meseCorrente);
  if (_periodo === 'anno') {
    const anno = _meseCorrente.slice(0, 4);
    return state.movimenti.filter(m => m.data.startsWith(anno));
  }
  // settimana: ultimi 7 giorni da oggi
  const oggi = new Date(); const sette = new Date(); sette.setDate(oggi.getDate() - 6);
  const da = sette.toISOString().slice(0, 10), a = oggi.toISOString().slice(0, 10);
  return state.movimenti.filter(m => m.data >= da && m.data <= a);
};

export const renderSpese = async (root) => {
  const movs = movimentiPeriodo();
  const tot = totaliPeriodo(movs);

  // etichetta periodo
  const [anno, mese] = _meseCorrente.split('-');
  const labelPeriodo = _periodo === 'anno' ? anno
    : _periodo === 'mese' ? `${nomeMese(parseInt(mese) - 1)} ${anno}`
    : 'Ultimi 7 giorni';

  // delta spese vs media mensile (solo in vista mese)
  let deltaHTML = '';
  if (_periodo === 'mese') {
    const media = mediaSpeseMensile(_meseCorrente);
    const d = calcolaDelta(tot.spese, media);
    if (d) deltaHTML = `<div class="delta ${d.classe} num">${d.testo}</div>`;
  }

  // barra "dove sto col mese": solo il filo con la tacca, niente testi (compatta)
  let paceHTML = '';
  if (_periodo === 'mese' && _meseCorrente === annomese(todayISO())) {
    const giorno = new Date().getDate();
    const giorniMese = new Date(parseInt(anno), parseInt(mese), 0).getDate();
    const pctTempo = Math.round(giorno / giorniMese * 100);
    const media = mediaSpeseMensile(_meseCorrente);
    const pctSpeso = media > 0 ? clamp(Math.round(tot.spese / media * 100), 0, 100) : 0;
    paceHTML = `
      <div class="pace pace-slim" title="Speso ${pctSpeso}% del solito · giorno ${giorno}/${giorniMese}">
        <div class="track"><span class="fill" style="width:${pctSpeso}%"></span><span class="marker" style="left:${pctTempo}%"></span></div>
      </div>`;
  }

  // lista categorie a barre
  const righe = aggregaPerLivello(movs, 'macro');
  const maxTot = righe.length ? righe[0].totale : 1;
  const righeHTML = righe.length ? righe.map(r => `
    <div class="catrow">
      <div class="icon" data-macro-mov="${escapeHtml(r.chiave)}">${iconaMacro(r.chiave)}</div>
      <div class="body" data-macro-drill="${escapeHtml(r.chiave)}">
        <div class="row1">
          <span class="name">${escapeHtml(r.chiave)}</span>
          <span class="right"><span class="amt num">${fmtEUR(r.totale)}</span><span class="pct num">${fmtPct(r.pct)}</span></span>
        </div>
        <div class="bar"><span style="width:${Math.max(3, r.totale / maxTot * 100)}%"></span></div>
      </div>
      <div class="chev" data-macro-drill="${escapeHtml(r.chiave)}">›</div>
    </div>`).join('') : '<div class="empty">Nessuna spesa in questo periodo</div>';

  root.innerHTML = `
    <div class="seg">
      <button data-p="settimana" class="${_periodo === 'settimana' ? 'on' : ''}">Settimana</button>
      <button data-p="mese" class="${_periodo === 'mese' ? 'on' : ''}">Mese</button>
      <button data-p="anno" class="${_periodo === 'anno' ? 'on' : ''}">Anno</button>
    </div>

    ${_periodo !== 'settimana' ? `
      <div class="month-nav">
        <button class="arr" id="prev">‹</button>
        <div class="m">${labelPeriodo}</div>
        <button class="arr" id="next">›</button>
      </div>` : `<div class="month-nav"><div class="m">${labelPeriodo}</div></div>`}

    <div class="triple quad">
      <div class="cell" data-tot="spesa" style="cursor:pointer"><div class="lbl">Spese</div><div class="val sp num">${fmtEUR(tot.spese)}</div>${deltaHTML}</div>
      <div class="cell" data-tot="entrata" style="cursor:pointer"><div class="lbl">Entrate</div><div class="val en num">${fmtEUR(tot.entrate)}</div></div>
      <div class="cell"><div class="lbl">Saldo</div><div class="val sa num">${tot.saldo < 0 ? '−' : ''}${fmtEUR(Math.abs(tot.saldo))}</div></div>
      <div class="cell" data-tot="trasferimento" style="cursor:pointer"><div class="lbl">Accant.</div><div class="val tr num">${fmtEUR(tot.investito || 0)}</div></div>
    </div>

    ${paceHTML}


    <div class="section-lbl"><span>Per categoria</span></div>
    ${righeHTML}
  `;

  // --- eventi ---
  root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    _periodo = b.dataset.p; renderSpese(root);
  }));
  const prev = root.querySelector('#prev'), next = root.querySelector('#next');
  if (prev) prev.addEventListener('click', () => {
    _meseCorrente = _periodo === 'anno'
      ? `${parseInt(anno) - 1}-${mese}` : mesePrec(_meseCorrente);
    renderSpese(root);
  });
  if (next) next.addEventListener('click', () => {
    _meseCorrente = _periodo === 'anno'
      ? `${parseInt(anno) + 1}-${mese}` : meseSucc(_meseCorrente);
    renderSpese(root);
  });

  // doppio tap-target: icona -> movimenti diretti; barra/corpo -> scendi di livello
  root.querySelectorAll('[data-macro-mov]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    navigate('movimenti', { macro: el.dataset.macroMov, periodo: _periodo, mese: _meseCorrente });
  }));
  root.querySelectorAll('[data-macro-drill]').forEach(el => el.addEventListener('click', () => {
    navigate('drill', { macro: el.dataset.macroDrill, periodo: _periodo, mese: _meseCorrente });
  }));

  // totaloni cliccabili: rosso -> movimenti spese, verde -> movimenti entrate (del periodo)
  root.querySelectorAll('[data-tot]').forEach(el => el.addEventListener('click', () => {
    navigate('movimenti', { tipo: el.dataset.tot, periodo: _periodo, mese: _meseCorrente });
  }));

};

// esportati per il drill-down (condivide il periodo corrente)
export const periodoCorrente = () => ({ periodo: _periodo, mese: _meseCorrente });
