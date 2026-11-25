// spese.js — Home "Spese": la schermata che si apre ogni giorno.
// Vista per periodo (Settimana/Mese/Anno) delle spese per categoria, con drill-down.

import { state, movimentiDelMese } from '../core/store.js';
import { fmtEUR, fmtEUR0, fmtPct, nomeMese, annomese, todayISO, toISO, escapeHtml } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import {
  totaliPeriodo, aggregaPerLivello, baselineSpeseMensile, soloSpese,
} from '../services/movimentiService.js';
import { calcolaDelta } from './shared.js';
import { ritmoMese, ritmoAnno } from '../services/ritmoService.js';

// stato locale della schermata (periodo selezionato)
let _periodo = 'mese';                 // 'settimana' | 'mese' | 'anno'
let _meseCorrente = annomese(todayISO());
let _graficoAperto = false;            // grafico del ritmo: nascosto di default, si apre col pulsante nella card (come fino alla 3.44)

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
  const da = toISO(sette), a = toISO(oggi);
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

  // Delta rispetto al mese tipico (solo in vista mese).
  //
  // Nel mese IN CORSO il confronto e' col RITMO, non col totale: il 2 del mese sei
  // sempre a -95% di un mese intero. Il riferimento e' quanto spendi di solito ENTRO
  // QUESTO GIORNO del mese (ritmoService), non una quota lineare del mese tipico: se
  // il mutuo parte il 1°, il mese tipico e' gia' alto il giorno 2, e la retta faceva
  // sembrare ogni inizio mese uno sforamento. A mese chiuso il riferimento coincide
  // col mese tipico di sempre (mediana degli ultimi 12 mesi).
  const meseInCorso = _periodo === 'mese' && _meseCorrente === annomese(todayISO());
  const giorno = new Date().getDate();
  // grafico del ritmo: per il mese e (dalla 3.47) per l'anno; la settimana non ce l'ha
  const ritmo = _periodo === 'mese' ? ritmoMese(_meseCorrente) : _periodo === 'anno' ? ritmoAnno(anno) : null;

  // Nei primissimi giorni il rapporto e' troppo nervoso per dire qualcosa: una spesa
  // sola il giorno 2 vale il 60% del ritmo. Meglio tacere e lasciar parlare il grafico.
  let deltaHTML = '';
  if (_periodo === 'mese' && ritmo.giorno && !(meseInCorso && giorno < 4)) {
    const d = calcolaDelta(tot.spese, ritmo.tipicoAOggi);
    if (d) deltaHTML = `<div class="delta ${d.classe} num">${meseInCorso ? d.testo.replace('mese tipico', 'ritmo abituale') : d.testo}</div>`;
  }

  // barra "dove sto col mese": solo il filo con la tacca, niente testi (compatta)
  let paceHTML = '';
  if (meseInCorso) {
    const giorniMese = new Date(parseInt(anno), parseInt(mese), 0).getDate();
    const pctTempo = Math.round(giorno / giorniMese * 100);
    const media = baselineSpeseMensile(_meseCorrente);
    const pctSpeso = media > 0 ? Math.round(tot.spese / media * 100) : 0;
    // La barra NON si ferma al 100%. Tapparla li' voleva dire spegnere l'informazione
    // proprio nel mese in cui stai sforando: adesso oltre il mese tipico continua a
    // crescere (fino a 200%, poi satura) e cambia colore, cosi' si vede di quanto.
    const oltre = pctSpeso > 100;
    const largh = Math.min(pctSpeso, 200) / 2;   // 200% = barra piena
    paceHTML = `
      <div class="pace pace-slim ${oltre ? 'over' : ''}" title="Speso ${pctSpeso}% del mese tipico · giorno ${giorno}/${giorniMese}">
        <div class="track"><span class="fill" style="width:${oltre ? largh : pctSpeso / 2}%"></span><span class="marker" style="left:${pctTempo / 2}%"></span></div>
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
      ${ritmo ? `<button class="spark-toggle" id="spark-toggle" title="Ritmo ${_periodo === 'anno' ? "dell'anno" : 'del mese'}" aria-label="Mostra il ritmo ${_periodo === 'anno' ? "dell'anno" : 'del mese'}" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M4 18l5-6 4 4 6-8"/><path d="M3 21h18"/></svg></button>` : ''}
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

    ${ritmo ? `<div class="spark-wrap ${_graficoAperto ? 'open' : ''}" id="spark-wrap">${_periodo === 'anno' ? _ritmoCard(ritmo, anno, String(parseInt(anno) - 1)) : _ritmoCard(ritmo, nomeMese(parseInt(mese) - 1), nomeMese((parseInt(mese) + 10) % 12))}</div>` : ''}

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

  // grafico del ritmo: tocco/trascinamento mostra il giorno
  if (ritmo) _agganciaRitmo(root.querySelector('.ritmo-card'), ritmo);

  // pulsante nella card spese: apre/chiude il grafico del ritmo
  const sparkToggle = root.querySelector('#spark-toggle');
  const sparkWrap = root.querySelector('#spark-wrap');
  if (sparkToggle && sparkWrap) {
    const aggiorna = () => {
      sparkWrap.classList.toggle('open', _graficoAperto);
      sparkToggle.classList.toggle('on', _graficoAperto);
      sparkToggle.setAttribute('aria-expanded', String(_graficoAperto));
    };
    aggiorna();
    sparkToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      _graficoAperto = !_graficoAperto;
      aggiorna();
    });
  }
};

// ═══ RITMO DEL MESE ═══
// Spesa accumulata giorno per giorno contro la fascia del mese tipico (ritmoService).
// Sostituisce l'andamento degli ultimi 6 mesi (fino alla 3.44), che disegnava il mese
// in corso come se fosse finito: a metà mese mostrava un crollo che non c'era, in
// contraddizione col "+x% vs ritmo abituale" del riquadro sopra.
const G = { W: 320, H: 168, L: 34, R: 10, T: 12, B: 24 };
const _k = (n) => n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'k' : String(Math.round(n));
const _scala = (r) => {
  const yMax = Math.max(1, ...r.cumulato, ...r.p75, ...(r.precedente || []), r.proiezione) * 1.08;
  return {
    yMax,
    x: (d) => G.L + (r.giorni > 1 ? (d - 1) / (r.giorni - 1) : 0) * (G.W - G.L - G.R),
    y: (v) => G.T + (1 - v / yMax) * (G.H - G.T - G.B),
  };
};

// Passo "tondo" della griglia (1, 2 o 5 × 10^n) per avere 3-4 righe a qualunque scala:
// un mese arriva a qualche migliaio di euro, un anno a decine di migliaia.
const _passoGriglia = (yMax) => {
  const grezzo = Math.max(1, yMax / 3.5), pot = 10 ** Math.floor(Math.log10(grezzo)), f = grezzo / pot;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pot;
};

// `nome`/`nomePrec`: 'Giugno'/'Maggio' per un mese, '2026'/'2025' per un anno.
const _ritmoCard = (r, nomeM, nomePrec) => {
  if (!r.giorno || !r.nRif) return '';   // periodo futuro o nessuno storico: niente da confrontare
  const { yMax, x, y } = _scala(r);
  const linea = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const fascia = linea(r.p75) + ' ' + r.p25.map((v, i) => [i, v]).reverse()
    .map(([i, v]) => `L${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ') + ' Z';
  const passo = _passoGriglia(yMax);
  let griglia = '';
  for (let v = 0; v < yMax; v += passo) {
    griglia += `<line x1="${G.L}" x2="${G.W - G.R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="rg"/>`
      + `<text x="${G.L - 6}" y="${(y(v) + 3.5).toFixed(1)}" class="ry">${_k(v)}</text>`;
  }
  // asse: giorni 1-10-20-fine per il mese; iniziali dei mesi (al giorno 1 di ciascuno) per l'anno
  const ticks = r.anno
    ? _inizioMesi(r.periodo).map((d, i) => `<text x="${x(d).toFixed(1)}" y="${G.H - 6}" class="rx">${'GFMAMGLASOND'[i]}</text>`).join('')
    : [1, 10, 20, r.giorni].map(d => `<text x="${x(d).toFixed(1)}" y="${G.H - 6}" class="rx">${d}</text>`).join('');
  const xs = x(r.giorno), ys = y(r.speso);
  const sopra = r.speso > r.tipicoAOggi;
  const proiez = r.chiuso ? '' : `<path d="M${xs.toFixed(1)} ${ys.toFixed(1)} L${x(r.giorni).toFixed(1)} ${y(r.proiezione).toFixed(1)}" class="rp"/>`
    + `<circle cx="${x(r.giorni).toFixed(1)}" cy="${y(r.proiezione).toFixed(1)}" r="3" class="rpd"/>`;
  const oggi = r.chiuso ? '' : `<line x1="${xs.toFixed(1)}" x2="${xs.toFixed(1)}" y1="${G.T}" y2="${G.H - G.B}" class="ro"/>`;
  const titolo = r.chiuso
    ? `${nomeM} chiuso a <b class="num">${fmtEUR0(r.speso)}</b>`
    : `A questo ritmo chiudi ${r.anno ? 'il ' + nomeM : nomeM.toLowerCase()} intorno a <b class="num">${fmtEUR0(Math.round(r.proiezione / (r.anno ? 100 : 10)) * (r.anno ? 100 : 10))}</b>`;
  const sotto = `di solito ${fmtEUR0(r.tipicoFine)}`
    + (r.chiuso ? '' : ` · finora ${fmtEUR0(r.speso)}, di solito a oggi ${fmtEUR0(r.tipicoAOggi)}`)
    + (r.unaTantum > 0 ? ` · di cui ${fmtEUR0(r.unaTantum)} una tantum` : '');
  return `<div class="card ritmo-card">
    <div class="ritmo-tit">${titolo}</div>
    <div class="ritmo-sub num">${sotto}</div>
    <div class="ritmo-graf">
      <svg viewBox="0 0 ${G.W} ${G.H}" class="ritmo-svg" role="img" aria-label="Spesa accumulata ${r.anno ? "nell'anno" : 'nel mese'} confrontata con il solito">
        ${griglia}
        <path d="${fascia}" class="rf"/>
        <path d="${linea(r.tipico)}" class="rt"/>
        ${r.precedente ? `<path d="${linea(r.precedente)}" class="rpr"/>` : ''}
        ${oggi}${proiez}
        <path d="${linea(r.cumulato)}" class="rc ${sopra ? 'sopra' : ''}"/>
        <circle cx="${xs.toFixed(1)}" cy="${ys.toFixed(1)}" r="4" class="rcd ${sopra ? 'sopra' : ''}"/>
        <line class="rsel" x1="0" x2="0" y1="${G.T}" y2="${G.H - G.B}"/>
        ${ticks}
      </svg>
      <div class="ritmo-tip"></div>
    </div>
    <div class="ritmo-leg">
      <span><i class="lc ${sopra ? 'sopra' : ''}"></i>${nomeM}</span>
      <span><i class="lt"></i>di solito</span>
      ${r.precedente ? `<span><i class="lpr"></i>${nomePrec.toLowerCase()}</span>` : ''}
    </div>
  </div>`;
};

// Giorno dell'anno (1-366) in cui comincia ciascun mese: posizioni delle iniziali sull'asse.
const _inizioMesi = (anno) => Array.from({ length: 12 }, (_, i) =>
  Math.round((Date.UTC(Number(anno), i, 1) - Date.UTC(Number(anno), 0, 1)) / 86400000) + 1);

// Etichetta del giorno d del periodo: '13/06' per un mese, '13 giu' per un anno.
const _etichettaGiorno = (r, d) => {
  if (!r.anno) return `${d}/${r.periodo.slice(5, 7)}`;
  const dt = new Date(Date.UTC(Number(r.periodo), 0, d));
  return `${dt.getUTCDate()} ${nomeMese(dt.getUTCMonth()).slice(0, 3).toLowerCase()}`;
};

// Tocco o trascinamento sul grafico: linea sul giorno e riquadro con speso fino a lì,
// speso quel giorno e il solito a quel punto del periodo.
const _agganciaRitmo = (card, r) => {
  const svg = card && card.querySelector('.ritmo-svg');
  if (!svg) return;
  const tip = card.querySelector('.ritmo-tip'), sel = svg.querySelector('.rsel');
  const { x } = _scala(r);
  const mostra = (ev) => {
    const box = svg.getBoundingClientRect();
    const vx = (ev.clientX - box.left) / box.width * G.W;
    const d = Math.max(1, Math.min(r.giorni, Math.round((vx - G.L) / (G.W - G.L - G.R) * (r.giorni - 1)) + 1));
    const px = x(d);
    sel.setAttribute('x1', px); sel.setAttribute('x2', px); sel.classList.add('on');
    const nel = d <= r.giorno;
    const tot = nel ? r.cumulato[d - 1] : null;
    const delGiorno = nel ? tot - (d > 1 ? r.cumulato[d - 2] : 0) : null;
    tip.innerHTML = `<b>${_etichettaGiorno(r, d)}</b>`
      + (nel ? `<span>finora <b class="num">${fmtEUR0(tot)}</b>${delGiorno > 0 ? ` · quel giorno ${fmtEUR0(delGiorno)}` : ''}</span>` : '')
      + `<span>di solito <b class="num">${fmtEUR0(r.tipico[d - 1])}</b></span>`;
    tip.style.left = `${Math.min(78, Math.max(22, px / G.W * 100))}%`;
    tip.classList.add('on');
  };
  const nascondi = () => { tip.classList.remove('on'); sel.classList.remove('on'); };
  // Il riquadro resta finché non ritocchi il grafico: tocco = compare, trascinamento =
  // segue il dito, un altro tocco (senza trascinare) = scompare. Fino alla 3.47 un timer
  // lo chiudeva 1,8 s dopo aver alzato il dito, e su iPhone anche un accenno di scroll
  // (pointercancel) lo chiudeva subito: non si faceva in tempo a leggerlo.
  let premuto = false, eraAperto = false, mosso = false, x0 = 0;
  svg.addEventListener('pointerdown', (e) => {
    premuto = true; mosso = false; x0 = e.clientX;
    eraAperto = tip.classList.contains('on');
    if (!eraAperto) mostra(e);
    svg.setPointerCapture?.(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!premuto) return;
    if (!mosso && Math.abs(e.clientX - x0) < 6) return;   // tremolio del dito: non è un trascinamento
    mosso = true;
    mostra(e);
  });
  svg.addEventListener('pointerup', () => {
    if (premuto && eraAperto && !mosso) nascondi();
    premuto = false;
  });
  svg.addEventListener('pointercancel', () => { premuto = false; });   // la pagina scorre: il riquadro resta
};

// esportati per il drill-down (condivide il periodo corrente)
export const periodoCorrente = () => ({ periodo: _periodo, mese: _meseCorrente });
