// dettaglioInvestimento.js — Scheda di approfondimento di un conto/strumento di
// investimento: versato totale + grafico dell'andamento del versato nel tempo
// (cumulato), grande e interattivo al tocco, in stile Cockpit.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, nomeMese } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { contoDiTrasferimento, eInvestimento } from '../services/attribuzioneInvestimenti.js';

// Somma cumulata dei versamenti verso il conto/strumento dato, per mese.
// Predicato: il movimento appartiene al conto/strumento dato? (fonte unica per il conto)
const _appartiene = (m, nome, isStrumento) => {
  if (isStrumento) {
    const nomeLow = (nome || '').toLowerCase();
    return (m.sub && m.sub === nome) || (m.cat && m.cat === nome) ||
           (`${m.sub || ''} ${m.cat || ''} ${m.desc || ''}`.toLowerCase().includes(nomeLow));
  }
  return contoDiTrasferimento(m, state.conti) === nome;
};

// I dati storici hanno contoDest vuoto: l'attribuzione al conto usa la FONTE UNICA
// (attribuzioneInvestimenti.js), condivisa con la pagina Patrimonio, così i numeri
// coincidono. Per lo "strumento" (PAC Fideuram, Crypto...) il match resta su sub/cat/desc.
const _andamentoVersato = (nome, isStrumento) => {
  const movs = state.movimenti
    .filter(m => eInvestimento(m, state.conti) && _appartiene(m, nome, isStrumento))
    .sort((a, b) => a.data.localeCompare(b.data));
  if (!movs.length) return [];
  const perMese = {};
  for (const m of movs) {
    const am = m.data.slice(0, 7);
    perMese[am] = (perMese[am] || 0) + m.imp;
  }
  const mesi = Object.keys(perMese).sort();
  const primo = mesi[0], ultimo = mesi[mesi.length - 1];
  const [y0, m0] = primo.split('-').map(Number);
  const [y1, m1] = ultimo.split('-').map(Number);
  const out = [];
  let cum = 0, y = y0, mm = m0;
  while (y < y1 || (y === y1 && mm <= m1)) {
    const am = `${y}-${String(mm).padStart(2, '0')}`;
    cum += perMese[am] || 0;
    out.push({ label: nomeMese(mm - 1).slice(0, 3) + " '" + String(y).slice(2), mese: am, val: cum });
    mm++; if (mm > 12) { mm = 1; y++; }
  }
  return out;
};

const _graficoGrande = (punti) => {
  if (punti.length < 2) return '<div class="empty">Storico insufficiente per il grafico</div>';
  const VW = 320, VH = 150, padX = 12, padTop = 16, padBot = 30;
  const vals = punti.map(p => p.val);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const nx = i => padX + (i / (punti.length - 1)) * (VW - padX * 2);
  const ny = v => VH - padBot - ((v - min) / range) * (VH - padTop - padBot);
  const pts = punti.map((p, i) => [nx(i), ny(p.val)]);
  let line = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${VH - padBot} L${pts[0][0].toFixed(1)} ${VH - padBot} Z`;
  const last = pts[pts.length - 1];
  // etichette: prima, metà, ultima (evita affollamento)
  const idxLbl = [0, Math.floor(punti.length / 2), punti.length - 1];
  const labels = idxLbl.map(i => `<text x="${nx(i).toFixed(1)}" y="${VH - 8}" text-anchor="${i === 0 ? 'start' : i === punti.length - 1 ? 'end' : 'middle'}" font-family="Rajdhani" font-size="11" font-weight="600" fill="#535E72">${punti[i].label}</text>`).join('');
  const dataJson = escapeHtml(JSON.stringify(punti.map(p => ({ l: p.label, v: p.val }))));
  return `<div class="spark spark-big" data-spark='${dataJson}'>
    <svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="invl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2E9BFF"/><stop offset="1" stop-color="#22E39A"/></linearGradient>
        <linearGradient id="inva" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(46,155,255,.28)"/><stop offset="1" stop-color="rgba(46,155,255,0)"/></linearGradient>
      </defs>
      <path d="${area}" fill="url(#inva)"/>
      <path d="${line}" fill="none" stroke="url(#invl)" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="#22E39A"/>
      ${labels}
    </svg>
    <div class="spark-vline"></div>
    <div class="spark-tip"></div>
  </div>`;
};

export const renderDettaglioInvestimento = async (root, params = {}) => {
  const nome = params.conto || params.strumento || '';
  const isStrumento = !!params.strumento;
  document.getElementById('view-title').textContent = nome || 'Investimento';
  const punti = _andamentoVersato(nome, isStrumento);
  const versato = punti.length ? punti[punti.length - 1].val : 0;
  const nVersamenti = state.movimenti.filter(m => eInvestimento(m, state.conti) && _appartiene(m, nome, isStrumento)).length;

  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">${escapeHtml(nome)} · versato</div>
      <div class="big num">${fmtEUR(versato)}</div>
      <div class="sub">
        <div><span class="lbl2">Versamenti</span><b class="num">${nVersamenti}</b></div>
        <div><span class="lbl2">Dal</span><b style="font-size:13px">${punti.length ? punti[0].label : '—'}</b></div>
      </div>
    </div>

    <div class="card spark-card" style="margin-top:14px">
      <div class="spark-title">Andamento versato nel tempo</div>
      ${_graficoGrande(punti)}
    </div>

    <p class="meta" style="text-align:center;margin-top:14px;line-height:1.5">
      Questo è il capitale <b>versato</b> cumulato. Il valore di mercato aggiornato
      lo trovi nell'app della piattaforma.
    </p>

    <button class="btn btn-secondary" id="vedi-mov" style="margin-top:14px">Vedi i versamenti</button>
  `;

  root.querySelector('#vedi-mov').addEventListener('click', () => navigate('movimenti', {
    tipo: 'trasferimento', periodo: 'anno', mese: new Date().toISOString().slice(0, 7),
  }));

  // interattività grafico
  const spark = root.querySelector('.spark');
  if (spark) {
    let dati; try { dati = JSON.parse(spark.dataset.spark); } catch { dati = null; }
    if (dati) {
      const tip = spark.querySelector('.spark-tip');
      const vline = spark.querySelector('.spark-vline');
      const show = (clientX) => {
        const r = spark.getBoundingClientRect();
        let rel = (clientX - r.left) / r.width; rel = Math.max(0, Math.min(1, rel));
        const idx = Math.round(rel * (dati.length - 1));
        const o = dati[idx];
        const posPct = (idx / (dati.length - 1)) * 100;
        tip.textContent = `${o.l} · ${fmtEUR(o.v)}`;
        tip.style.left = posPct + '%'; tip.classList.add('on');
        if (vline) { vline.style.left = posPct + '%'; vline.classList.add('on'); }
      };
      const hide = () => { tip.classList.remove('on'); if (vline) vline.classList.remove('on'); };
      spark.addEventListener('touchstart', (e) => show(e.touches[0].clientX), { passive: true });
      spark.addEventListener('touchmove', (e) => show(e.touches[0].clientX), { passive: true });
      spark.addEventListener('touchend', hide, { passive: true });
      spark.addEventListener('mousemove', (e) => show(e.clientX));
      spark.addEventListener('mouseleave', hide);
    }
  }
};
