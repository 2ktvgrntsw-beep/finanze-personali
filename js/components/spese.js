// spese.js — Home "Spese": la schermata che si apre ogni giorno.
// Vista per periodo (Settimana/Mese/Anno) delle spese per categoria, con drill-down.

import { state, movimentiDelMese } from '../core/store.js';
import { fmtEUR, fmtEUR0, fmtPct, nomeMese, annomese, todayISO, toISO, toAnnomese, escapeHtml } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { costruisciSparkline, agganciaSparkline } from '../core/sparkline.js';
import {
  totaliPeriodo, aggregaPerLivello, baselineSpeseMensile, soloSpese,
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
  // sempre a -95% di un mese intero, e leggerlo come un risultato e' fuorviante in un
  // verso quanto lo era la vecchia media in quello opposto. Quindi il riferimento
  // viene ridotto in proporzione ai giorni trascorsi: "in linea" significa che stai
  // andando al passo del tuo mese tipico.
  const meseInCorso = _periodo === 'mese' && _meseCorrente === annomese(todayISO());
  const giorno = new Date().getDate();
  const giorniMese = new Date(parseInt(anno), parseInt(mese), 0).getDate();
  const quotaTempo = meseInCorso ? giorno / giorniMese : 1;

  // Nei primissimi giorni il rapporto e' troppo nervoso per dire qualcosa: una spesa
  // sola il giorno 2 vale il 60% del ritmo. Meglio tacere e lasciar parlare la barra.
  let deltaHTML = '';
  if (_periodo === 'mese' && !(meseInCorso && giorno < 4)) {
    const media = baselineSpeseMensile(_meseCorrente);
    const d = calcolaDelta(tot.spese, media * quotaTempo);
    if (d) deltaHTML = `<div class="delta ${d.classe} num">${meseInCorso ? d.testo.replace('mese tipico', 'ritmo abituale') : d.testo}</div>`;
  }

  // barra "dove sto col mese": solo il filo con la tacca, niente testi (compatta)
  let paceHTML = '';
  if (meseInCorso) {
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
    const am = toAnnomese(d);
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
  const punti = d.mesi.map(o => ({ label: o.label, valore: o.val }));
  const { svg, dataAttr } = costruisciSparkline(punti, {
    vw: 300, vh: 96, padX: 10, padTop: 14, padBot: 26,
    idLinea: 'spkl', idArea: 'spka',
    coloreLinea0: '#2E9BFF', coloreLinea1: '#7B6CFF',   // blu -> viola (identità Spese)
    larghezzaLinea: 2.2,
    mostraEtichette: true, mostraDots: true, mostraUltimoPunto: false,
  });
  return `<div class="card spark-card">
    <div class="spark-title">Andamento spese · ultimi 6 mesi</div>
    <div class="spark" ${dataAttr}>
      ${svg}
      <div class="spark-vline"></div>
      <div class="spark-tip"></div>
    </div>
  </div>`;
};

// interattività: tocco/trascinamento sul grafico mostra mese + spesa
const _agganciaSparkline = (root) => {
  agganciaSparkline(root.querySelector('.spark'), fmtEUR);
};

// esportati per il drill-down (condivide il periodo corrente)
export const periodoCorrente = () => ({ periodo: _periodo, mese: _meseCorrente });
