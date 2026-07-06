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
let _sparkAperto = false;              // grafico andamento spese: nascosto di default, apribile dall'icona

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
  const _intensita = (pct) => pct >= 30 ? 'hi' : pct >= 15 ? 'md' : pct >= 7 ? 'lo' : 'xlo';
  const righeHTML = righe.length ? righe.map(r => `
    <div class="catrow">
      <div class="icon" data-macro-mov="${escapeHtml(r.chiave)}">${iconaMacro(r.chiave)}</div>
      <div class="body" data-macro-drill="${escapeHtml(r.chiave)}">
        <div class="row1">
          <span class="name">${escapeHtml(r.chiave)}</span>
          <span class="right"><span class="amt num">${fmtEUR(r.totale)}</span><span class="pct num">${fmtPct(r.pct)}</span></span>
        </div>
        <div class="bar ${_intensita(r.pct)}"><span style="width:${Math.max(1.5, r.totale / maxTot * 100)}%"></span></div>
      </div>
      <div class="chev" data-macro-drill="${escapeHtml(r.chiave)}">›</div>
    </div>`).join('') : '<div class="empty">Nessuna spesa in questo periodo</div>';

  root.innerHTML = `
    ${_periodo !== 'settimana' ? `
      <div class="month-nav">
        <button class="arr" id="prev">‹</button>
        <div class="m">${labelPeriodo}</div>
        <button class="arr" id="next">›</button>
      </div>` : `<div class="month-nav"><div class="m">${labelPeriodo}</div></div>`}

    <div class="hero-spese">
      ${_periodo === 'mese' ? '<button class="spark-toggle" id="spark-toggle" title="Andamento spese" aria-label="Mostra andamento"><svg viewBox="0 0 24 24"><path d="M4 18l5-6 4 4 6-8"/><path d="M3 21h18"/></svg></button>' : ''}
      <div class="cell-spese-main" data-tot="spesa" style="cursor:pointer">
        <div class="cap">${_periodo === 'anno' ? 'Spese ' + anno : _periodo === 'mese' ? 'Spese di ' + nomeMese(parseInt(mese) - 1).toLowerCase() : 'Spese'}</div>
        <div class="big-spese num">${fmtEUR(tot.spese)}</div>
        ${deltaHTML}
      </div>
      <div class="metrics-row">
        <div class="metric" data-tot="entrata" style="cursor:pointer"><div class="lbl">Entrate</div><div class="val en num">${fmtEUR(tot.entrate)}</div></div>
        <div class="metric"><div class="lbl">Saldo</div><div class="val sa num">${tot.saldo < 0 ? '−' : ''}${fmtEUR(Math.abs(tot.saldo))}</div></div>
        <div class="metric" data-tot="trasferimento" style="cursor:pointer"><div class="lbl">Accant.</div><div class="val tr num">${fmtEUR(tot.investito || 0)}</div></div>
      </div>
    </div>

    ${_periodo === 'mese' ? `<div class="spark-wrap ${_sparkAperto ? 'open' : ''}" id="spark-wrap">${_sparklineCard(_meseCorrente)}</div>` : ''}

    ${paceHTML}


    <div class="section-lbl"><span>Per categoria</span></div>
    ${righeHTML}
  `;

  // --- eventi ---
  // selettore periodo NELL'HEADER (compatto, come la vecchia app)
  const headSeg = document.getElementById('head-seg');
  if (headSeg) {
    headSeg.innerHTML = `<div class="seg">
      <button data-p="settimana" class="${_periodo === 'settimana' ? 'on' : ''}">Sett.</button>
      <button data-p="mese" class="${_periodo === 'mese' ? 'on' : ''}">Mese</button>
      <button data-p="anno" class="${_periodo === 'anno' ? 'on' : ''}">Anno</button>
    </div>`;
    headSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      _periodo = b.dataset.p; renderSpese(root);
    }));
  }

  const vaiPrec = () => {
    _meseCorrente = _periodo === 'anno' ? `${parseInt(anno) - 1}-${mese}` : mesePrec(_meseCorrente);
    renderSpese(root);
  };
  const vaiSucc = () => {
    _meseCorrente = _periodo === 'anno' ? `${parseInt(anno) + 1}-${mese}` : meseSucc(_meseCorrente);
    renderSpese(root);
  };
  const prev = root.querySelector('#prev'), next = root.querySelector('#next');
  if (prev) prev.addEventListener('click', vaiPrec);
  if (next) next.addEventListener('click', vaiSucc);

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

  // sparkline interattivo: attacca il tocco (solo se presente, cioè in vista mese)
  _agganciaSparkline(root);

  // toggle grafico andamento (icona nella card spese)
  const sparkToggle = root.querySelector('#spark-toggle');
  const sparkWrap = root.querySelector('#spark-wrap');
  if (sparkToggle && sparkWrap) {
    sparkToggle.classList.toggle('on', _sparkAperto);
    sparkToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      _sparkAperto = !_sparkAperto;
      sparkWrap.classList.toggle('open', _sparkAperto);
      sparkToggle.classList.toggle('on', _sparkAperto);
    });
  }

};

// ═══ SPARKLINE spese ultimi 6 mesi (additivo, puramente visivo) ═══
// Ritorna { mesi:[{label,mese,val}], min, max } per gli ultimi 6 mesi fino a quello dato.
const _datiSparkline = (meseRif) => {
  const [y, m] = meseRif.split('-').map(Number);
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const am = annomese(d.toISOString().slice(0, 10));
    const t = totaliPeriodo(movimentiDelMese(am));
    const idxMese = parseInt(am.slice(5, 7), 10) - 1;
    out.push({ label: nomeMese(idxMese).slice(0, 3), mese: am, val: t.spese || 0 });
  }
  const vals = out.map(o => o.val);
  return { mesi: out, min: Math.min(...vals), max: Math.max(...vals) };
};

const _sparklineCard = (meseRif) => {
  const d = _datiSparkline(meseRif);
  if (d.max <= 0) return '';   // niente dati, niente grafico
  const VW = 300, VH = 96, padX = 10, padTop = 14, padBot = 26;
  const range = d.max - d.min || 1;
  const nx = i => padX + (i / (d.mesi.length - 1)) * (VW - padX * 2);
  const ny = v => VH - padBot - ((v - d.min) / range) * (VH - padTop - padBot);
  const pts = d.mesi.map((o, i) => [nx(i), ny(o.val)]);
  // smoothing catmull-rom -> bezier
  let line = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${VH - padBot} L${pts[0][0].toFixed(1)} ${VH - padBot} Z`;
  // punti + etichette mesi
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${i === pts.length - 1 ? '#5FC3FF' : '#2E9BFF'}"/>`).join('');
  const ancora = (i) => i === 0 ? 'start' : i === d.mesi.length - 1 ? 'end' : 'middle';
  const labels = d.mesi.map((o, i) => `<text x="${nx(i).toFixed(1)}" y="${VH - 8}" text-anchor="${ancora(i)}" font-family="Rajdhani" font-size="11" font-weight="600" fill="${i === d.mesi.length - 1 ? '#5FC3FF' : '#535E72'}">${o.label}</text>`).join('');
  const dataJson = escapeHtml(JSON.stringify(d.mesi.map(o => ({ l: o.label, v: o.val }))));
  return `<div class="card spark-card">
    <div class="spark-title">Andamento spese · ultimi 6 mesi</div>
    <div class="spark" data-spark='${dataJson}' data-vw="${VW}" data-padx="${padX}">
      <svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="spkl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2E9BFF"/><stop offset="1" stop-color="#7B6CFF"/></linearGradient>
          <linearGradient id="spka" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(46,155,255,.28)"/><stop offset="1" stop-color="rgba(46,155,255,0)"/></linearGradient>
        </defs>
        <path d="${area}" fill="url(#spka)"/>
        <path d="${line}" fill="none" stroke="url(#spkl)" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
        ${dots}
        ${labels}
      </svg>
      <div class="spark-vline"></div>
      <div class="spark-tip"></div>
    </div>
  </div>`;
};

// interattività: tocco/trascinamento sul grafico mostra mese + spesa
const _agganciaSparkline = (root) => {
  const spark = root.querySelector('.spark');
  if (!spark) return;
  let dati;
  try { dati = JSON.parse(spark.dataset.spark); } catch { return; }
  const tip = spark.querySelector('.spark-tip');
  const vline = spark.querySelector('.spark-vline');
  const VW = parseFloat(spark.dataset.vw) || 300;
  const padX = parseFloat(spark.dataset.padx) || 10;
  // posizione X reale del punto idx, in % del contenitore (tiene conto del padding del viewBox)
  const puntoPct = (idx) => {
    const xSvg = padX + (idx / (dati.length - 1)) * (VW - padX * 2);
    return (xSvg / VW) * 100;
  };
  const show = (clientX) => {
    const r = spark.getBoundingClientRect();
    let rel = (clientX - r.left) / r.width;
    rel = Math.max(0, Math.min(1, rel));
    // converto la posizione del dito (in % contenitore) nell'indice più vicino tenendo conto del padding
    const xSvg = rel * VW;
    const relInner = (xSvg - padX) / (VW - padX * 2);
    const idx = Math.max(0, Math.min(dati.length - 1, Math.round(relInner * (dati.length - 1))));
    const o = dati[idx];
    const posPct = puntoPct(idx);
    tip.textContent = `${o.l} · ${fmtEUR(o.v)}`;
    tip.style.left = posPct + '%';
    tip.classList.add('on');
    if (vline) { vline.style.left = posPct + '%'; vline.classList.add('on'); }
  };
  const hide = () => { tip.classList.remove('on'); if (vline) vline.classList.remove('on'); };
  spark.addEventListener('touchstart', (e) => { show(e.touches[0].clientX); }, { passive: true });
  spark.addEventListener('touchmove', (e) => { show(e.touches[0].clientX); }, { passive: true });
  spark.addEventListener('touchend', hide, { passive: true });
  spark.addEventListener('mousemove', (e) => show(e.clientX));
  spark.addEventListener('mouseleave', hide);
};

// esportati per il drill-down (condivide il periodo corrente)
export const periodoCorrente = () => ({ periodo: _periodo, mese: _meseCorrente });
