// sparkline.js — FONTE UNICA per i grafici sparkline dell'app.
//
// PERCHÉ ESISTE: la logica di costruzione (smoothing catmull-rom->bezier, path area,
// punti, etichette) e di interattività (linea verticale + tooltip che seguono il dito)
// era copincollata in spese.js, patrimonio.js e dettaglioInvestimento.js — ~70 righe
// × 3, con varianti divergenti. Un bug corretto in un file non si propagava agli altri
// (è già successo con la precisione della barra). Qui la logica è UNA, testabile.
//
// Uso:
//   const { svg, dataAttr } = costruisciSparkline(punti, opzioni);
//   // ...inserisci `svg` nel markup, con data-attr `dataAttr` sul contenitore .spark
//   agganciaSparkline(elementoSpark, fmtValore);
//
// `punti`: array di { label, valore }.
// `opzioni`: { vw, vh, padX, padTop, padBot, gradiente, mostraEtichette, mostraDots,
//              coloreLinea, coloreArea, colorePunto }.

import { escapeHtml } from './utils.js';

const DEFAULT = {
  vw: 320, vh: 150, padX: 12, padTop: 16, padBot: 30,
  idLinea: 'spkLine', idArea: 'spkArea',
  coloreLinea0: '#2E9BFF', coloreLinea1: '#22E39A',
  coloreArea: 'rgba(46,155,255,.28)',
  colorePunto: '#22E39A',
  larghezzaLinea: 2.4,
  mostraEtichette: true,   // etichette mesi sull'asse
  mostraDots: false,       // pallino su ogni punto (oltre all'ultimo)
  mostraUltimoPunto: true, // pallino sull'ultimo punto
};

// Costruisce il path della linea (smoothing catmull-rom -> bezier) e dell'area sotto.
const _paths = (pts, vh, padBot) => {
  if (pts.length < 2) return { line: '', area: '' };
  let line = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${vh - padBot} L${pts[0][0].toFixed(1)} ${vh - padBot} Z`;
  return { line, area };
};

// Ritorna { svg, dataAttr } — svg pronto da inserire, dataAttr da mettere sul .spark
// (contiene i dati serializzati e la geometria per l'interattività).
export const costruisciSparkline = (punti, opzioni = {}) => {
  const o = { ...DEFAULT, ...opzioni };
  if (!punti || punti.length < 2) return { svg: '', dataAttr: '' };

  const vals = punti.map(p => p.valore);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const nx = i => o.padX + (i / (punti.length - 1)) * (o.vw - o.padX * 2);
  const ny = v => o.vh - o.padBot - ((v - min) / range) * (o.vh - o.padTop - o.padBot);
  const pts = punti.map((p, i) => [nx(i), ny(p.valore)]);

  const { line, area } = _paths(pts, o.vh, o.padBot);
  const last = pts[pts.length - 1];

  // dots: opzionali su tutti i punti; l'ultimo sempre evidenziato se richiesto
  let dots = '';
  if (o.mostraDots) {
    dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${i === pts.length - 1 ? o.coloreLinea1 : o.coloreLinea0}"/>`).join('');
  } else if (o.mostraUltimoPunto) {
    dots = `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${o.colorePunto}"/>`;
  }

  // etichette: prima (start), metà (middle), ultima (end) — o tutte se poche
  let labels = '';
  if (o.mostraEtichette) {
    const idxs = punti.length <= 6
      ? punti.map((_, i) => i)
      : [0, Math.floor(punti.length / 2), punti.length - 1];
    const ancora = (i) => i === 0 ? 'start' : i === punti.length - 1 ? 'end' : 'middle';
    labels = idxs.map(i => `<text x="${nx(i).toFixed(1)}" y="${o.vh - 8}" text-anchor="${ancora(i)}" font-family="Rajdhani" font-size="11" font-weight="600" fill="${i === punti.length - 1 ? '#5FC3FF' : '#535E72'}">${escapeHtml(punti[i].label)}</text>`).join('');
  }

  const svg = `<svg viewBox="0 0 ${o.vw} ${o.vh}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="${o.idLinea}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${o.coloreLinea0}"/><stop offset="1" stop-color="${o.coloreLinea1}"/></linearGradient>
      <linearGradient id="${o.idArea}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.coloreArea}"/><stop offset="1" stop-color="rgba(46,155,255,0)"/></linearGradient>
    </defs>
    <path d="${area}" fill="url(#${o.idArea})"/>
    <path d="${line}" fill="none" stroke="url(#${o.idLinea})" stroke-width="${o.larghezzaLinea}" vector-effect="non-scaling-stroke"/>
    ${dots}
    ${labels}
  </svg>`;

  const dataJson = escapeHtml(JSON.stringify(punti.map(p => ({ l: p.label, v: p.valore }))));
  const dataAttr = `data-spark='${dataJson}' data-vw="${o.vw}" data-padx="${o.padX}"`;

  return { svg, dataAttr };
};

// Aggancia l'interattività (linea verticale + tooltip che seguono il dito/mouse) a un
// elemento .spark che contiene lo svg, una .spark-vline e una .spark-tip.
// `fmtValore(v)` formatta il numero nel tooltip (es. fmtEUR).
export const agganciaSparkline = (spark, fmtValore) => {
  if (!spark) return;
  let dati;
  try { dati = JSON.parse(spark.dataset.spark); } catch { return; }
  if (!dati || dati.length < 2) return;

  const tip = spark.querySelector('.spark-tip');
  const vline = spark.querySelector('.spark-vline');
  const VW = parseFloat(spark.dataset.vw) || DEFAULT.vw;
  const padX = parseFloat(spark.dataset.padx) || DEFAULT.padX;

  // posizione X del punto idx, in % del contenitore (tiene conto del padding del viewBox)
  const puntoPct = (idx) => ((padX + (idx / (dati.length - 1)) * (VW - padX * 2)) / VW) * 100;

  const show = (clientX) => {
    const r = spark.getBoundingClientRect();
    let rel = (clientX - r.left) / r.width;
    rel = Math.max(0, Math.min(1, rel));
    const relInner = (rel * VW - padX) / (VW - padX * 2);
    const idx = Math.max(0, Math.min(dati.length - 1, Math.round(relInner * (dati.length - 1))));
    const o = dati[idx];
    const posPct = puntoPct(idx);
    if (tip) {
      tip.textContent = `${o.l} · ${fmtValore(o.v)}`;
      tip.style.left = posPct + '%';
      // il tip sta ACCANTO alla barra: a destra di norma, a sinistra oltre metà grafico
      tip.classList.toggle('flip', posPct > 55);
      tip.classList.add('on');
    }
    if (vline) { vline.style.left = posPct + '%'; vline.classList.add('on'); }
  };
  const hide = () => { if (tip) tip.classList.remove('on'); if (vline) vline.classList.remove('on'); };

  spark.addEventListener('touchstart', (e) => show(e.touches[0].clientX), { passive: true });
  spark.addEventListener('touchmove', (e) => show(e.touches[0].clientX), { passive: true });
  spark.addEventListener('touchend', hide, { passive: true });
  spark.addEventListener('mousemove', (e) => show(e.clientX));
  spark.addEventListener('mouseleave', hide);
};
