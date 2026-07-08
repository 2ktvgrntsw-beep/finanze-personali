// energia.js — Sezione Energia: monitoraggio spesa e consumo di energia elettrica.
// Home con hero ultima bolletta, KPI, barre fasce per anno, spike-line prezzo,
// ripartizione fasce e storico recente. Slegata dalle spese (store dedicato).

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { costruisciSparkline, agganciaSparkline } from '../core/sparkline.js';
import {
  ultimaBolletta, kpiBolletta, aggregatoAnno, anniDisponibili, variazioneAnno,
  seriePrezzo, serieFasce, ripartizioneFasce, bolletteComplete, statisticheGlobali, mese3,
} from '../services/energiaService.js';

const FULMINE = '<svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>';

// stato modulo
let _annoFasce = null;         // anno selezionato per le barre fasce
let _annoKpi = null;           // anno selezionato per le card KPI
let _tipoPrezzo = 'materia';   // 'materia' | 'totale' per la spike-line

const _fmtPeriodo = (dal, al) => {
  const [, m1, g1] = dal.split('-'); const [, m2, g2] = al.split('-');
  return `${g1}/${m1}–${g2}/${m2}`;
};
const _fmtVar = (v) => v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
const _clsVar = (v, inverti = false) => {
  if (v == null) return '';
  const negativoBuono = !inverti;   // per spesa/consumo/prezzo: scendere è positivo (verde)
  const buono = negativoBuono ? v < 0 : v > 0;
  return buono ? 'down' : 'up';     // .down=verde .up=rosso (coerente con l'app)
};

export const renderEnergia = async (root) => {
  document.getElementById('view-title').textContent = 'Energia';

  const boll = bolletteComplete();
  if (!boll.length) {
    root.innerHTML = `<div class="card" style="text-align:center;padding:40px 20px">
      <div class="big-ic">${FULMINE}</div>
      <p class="meta" style="margin:12px 0 18px">Non hai ancora nessuna bolletta registrata.</p>
      <button class="btn btn-primary" id="add-boll" style="width:auto;display:inline-flex;padding:11px 20px">Aggiungi la prima bolletta</button>
    </div>`;
    root.querySelector('#add-boll').addEventListener('click', () => navigate('bolletta-nuova'));
    return;
  }

  const anni = anniDisponibili();
  if (_annoFasce == null || !anni.includes(_annoFasce)) _annoFasce = anni[0];
  if (_annoKpi == null || !anni.includes(_annoKpi)) _annoKpi = anni[0];

  const u = ultimaBolletta();
  const k = kpiBolletta(u);

  const rip = ripartizioneFasce(6);
  const stats = statisticheGlobali();

  root.innerHTML = `
    <!-- HERO ultima bolletta -->
    <div class="net-card energia-hero">
      <div class="net-row">
        <div class="ehero-forn">Ultima bolletta · <b>${escapeHtml(u.fornitore)}</b>${u.offerta ? `<br><span class="meta">${escapeHtml(u.offerta)}</span>` : ''}</div>
        ${u.tariffa ? `<span class="ebadge">${escapeHtml(u.tariffa)}</span>` : ''}
      </div>
      <div class="ehero-imp num">${fmtEUR(u.totale)}</div>
      <div class="ehero-meta">
        <div><div class="k">Periodo</div><div class="v num">${_fmtPeriodo(u.dal, u.al)}</div></div>
        <div><div class="k">Consumo</div><div class="v num">${u.kwhTot} kWh</div></div>
        <div><div class="k">€/kWh</div><div class="v num">${k.eurKwh.toFixed(3)}</div></div>
      </div>
    </div>

    <!-- SELETTORE ANNO per le card KPI -->
    <div class="section-lbl" style="margin-top:14px"><span>Riepilogo anno</span>
      <div class="eyear" id="ekpi-year">
        <button id="ekpi-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="ekpi-lbl">${_annoKpi}</span>
        <button id="ekpi-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <!-- KPI (aggiornate dal selettore, delta vs anno precedente) -->
    <div class="ekpis" id="ekpis"></div>

    <!-- BARRE FASCE per anno -->
    <div class="section-lbl"><span>Consumo per fasce</span>
      <div class="eyear" id="eyear">
        <button id="eyear-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="eyear-lbl">${_annoFasce}</span>
        <button id="eyear-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="card">
      <div class="elegend">
        <span><i style="background:#1C3A6E"></i>F1 giorno</span>
        <span><i style="background:#2E9BFF"></i>F2 sera</span>
        <span><i style="background:#7B6CFF"></i>F3 notte</span>
      </div>
      <div class="estack" id="estack"></div>
    </div>

    <!-- SPIKE-LINE prezzo -->
    <div class="section-lbl"><span>Prezzo energia nel tempo</span>
      <div class="eprice-toggle" id="eprice-toggle">
        <button data-p="materia" class="${_tipoPrezzo === 'materia' ? 'on' : ''}">Materia</button>
        <button data-p="totale" class="${_tipoPrezzo === 'totale' ? 'on' : ''}">Totale</button>
      </div>
    </div>
    <div class="card">
      <div id="eprice-chart"></div>
      <div class="eprice-note">${_tipoPrezzo === 'materia'
        ? 'Prezzo <b>materia energia</b> (€/kWh): la voce su cui incidi cambiando fornitore. Il resto (trasporto, oneri, imposte) è fisso.'
        : 'Prezzo <b>totale</b> (€/kWh): tutto compreso, comprese le voci fisse di sistema.'}</div>
    </div>

    <!-- RIPARTIZIONE fasce media -->
    <div class="section-lbl"><span>Ripartizione media</span></div>
    <div class="efasce">
      <div class="efascia"><div class="dot" style="background:#1C3A6E"></div><div class="nm">F1</div><div class="pc num">${rip.p1}%</div><div class="kw num">${rip.f1} kWh</div></div>
      <div class="efascia"><div class="dot" style="background:#2E9BFF"></div><div class="nm">F2</div><div class="pc num">${rip.p2}%</div><div class="kw num">${rip.f2} kWh</div></div>
      <div class="efascia"><div class="dot" style="background:#7B6CFF"></div><div class="nm">F3</div><div class="pc num">${rip.p3}%</div><div class="kw num">${rip.f3} kWh</div></div>
    </div>

    <!-- STORICO recente -->
    <div class="section-lbl"><span>Storico bollette</span><span class="act" id="vedi-storico">Tutte (${state.bollette.length}) ›</span></div>
    <div class="card" style="padding:0">
      ${boll.slice(0, 4).map(b => _rigaBollettaHTML(b)).join('<div class="divider"></div>')}
    </div>

    <div style="text-align:center;margin-top:18px">
      <button class="btn btn-primary" id="add-boll" style="width:auto;display:inline-flex;padding:12px 22px;gap:8px">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2.2"><path d="M12 5v14M5 12h14"/></svg>
        Aggiungi bolletta
      </button>
    </div>
  `;

  _renderKpi(root);
  _renderBarreFasce(root);
  _renderSpike(root);

  // navigazione anno per le card KPI (mutazione locale, niente re-render pagina)
  root.querySelector('#ekpi-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i < anni.length - 1) { _annoKpi = anni[i + 1]; root.querySelector('#ekpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });
  root.querySelector('#ekpi-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i > 0) { _annoKpi = anni[i - 1]; root.querySelector('#ekpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });

  // navigazione anni (barre)
  root.querySelector('#eyear-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoFasce);
    if (i < anni.length - 1) { _annoFasce = anni[i + 1]; root.querySelector('#eyear-lbl').textContent = _annoFasce; _renderBarreFasce(root); }
  });
  root.querySelector('#eyear-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoFasce);
    if (i > 0) { _annoFasce = anni[i - 1]; root.querySelector('#eyear-lbl').textContent = _annoFasce; _renderBarreFasce(root); }
  });

  // toggle prezzo materia/totale
  root.querySelector('#eprice-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-p]'); if (!btn) return;
    _tipoPrezzo = btn.dataset.p;
    renderEnergia(root);
  });

  // storico + aggiungi + righe
  root.querySelector('#vedi-storico').addEventListener('click', () => navigate('bollette-storico'));
  root.querySelector('#add-boll').addEventListener('click', () => navigate('bolletta-nuova'));
  root.querySelectorAll('[data-bolletta]').forEach(el =>
    el.addEventListener('click', () => navigate('bolletta-dettaglio', { id: el.dataset.bolletta })));
};

// riga bolletta riutilizzabile (home + storico)
export const _rigaBollettaHTML = (b) => {
  const [y1, m1] = b.dal.split('-'); const [y2, m2] = b.al.split('-');
  const periodo = y1 === y2 ? `${mese3(+m1)} – ${mese3(+m2)} ${y2}` : `${mese3(+m1)} ${y1} – ${mese3(+m2)} ${y2}`;
  return `<div class="eboll" data-bolletta="${escapeHtml(b.id)}">
    <div class="eboll-ic">${FULMINE}</div>
    <div class="eboll-body">
      <div class="eboll-r1"><span class="eboll-nm">${periodo}</span><span class="eboll-imp num">${fmtEUR(b.totale)}</span></div>
      <div class="eboll-r2"><span class="eboll-sub">${escapeHtml(b.fornitore)}</span><span class="eboll-kwh num">${b.kwhTot} kWh</span></div>
    </div>
    <div class="eboll-chev">›</div>
  </div>`;
};

// Card KPI dell'anno selezionato, con variazioni rispetto all'anno precedente.
const _renderKpi = (root) => {
  const agg = aggregatoAnno(_annoKpi);
  const cont = root.querySelector('#ekpis');
  if (!agg) { cont.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:20px 0">Nessuna bolletta nel ${_annoKpi}</div>`; return; }
  const prec = Number(_annoKpi) - 1;
  const vGiorno = variazioneAnno(_annoKpi, 'eurGiorno');
  const vPrezzo = variazioneAnno(_annoKpi, 'eurKwh');
  const vSpesa = variazioneAnno(_annoKpi, 'spesa');
  const vCons = variazioneAnno(_annoKpi, 'consumo');
  cont.innerHTML = `
    <div class="ekpi"><div class="k">Costo/giorno</div><div class="v num">${fmtEUR(agg.eurGiorno)}</div>${vGiorno != null ? `<div class="d ${_clsVar(vGiorno)}">${_fmtVar(vGiorno)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Prezzo medio</div><div class="v num">${agg.eurKwh.toFixed(3)}<small> €/kWh</small></div>${vPrezzo != null ? `<div class="d ${_clsVar(vPrezzo)}">${_fmtVar(vPrezzo)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Spesa ${_annoKpi}</div><div class="v num">${fmtEUR(agg.spesa)}</div>${vSpesa != null ? `<div class="d ${_clsVar(vSpesa)}">${_fmtVar(vSpesa)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Consumo ${_annoKpi}</div><div class="v num">${agg.consumo.toLocaleString('it-IT')}<small> kWh</small></div>${vCons != null ? `<div class="d ${_clsVar(vCons)}">${_fmtVar(vCons)} vs ${prec}</div>` : ''}</div>`;
};

const _renderBarreFasce = (root) => {
  const dati = serieFasce(_annoFasce);
  const cont = root.querySelector('#estack');
  if (!dati.length) { cont.innerHTML = '<div class="empty" style="padding:30px 0">Nessun dato per il ' + _annoFasce + '</div>'; return; }
  const maxT = Math.max(...dati.map(d => d.tot), 1);
  cont.innerHTML = dati.map((d, i) => {
    const H = (d.tot / maxT * 100).toFixed(1);
    const h1 = d.tot ? (d.f1 / d.tot * 100).toFixed(1) : 0;
    const h2 = d.tot ? (d.f2 / d.tot * 100).toFixed(1) : 0;
    const h3 = d.tot ? (d.f3 / d.tot * 100).toFixed(1) : 0;
    return `<div class="escol" data-fasce-idx="${i}">
      <div class="estot num">${d.tot}</div>
      <div class="ebar-wrap" style="height:${H}%">
        <div class="ebar-seg" style="height:${h1}%;background:#1C3A6E"></div>
        <div class="ebar-seg" style="height:${h2}%;background:#2E9BFF"></div>
        <div class="ebar-seg" style="height:${h3}%;background:#7B6CFF"></div>
      </div>
      <div class="eslbl">${escapeHtml(d.label)}</div>
    </div>`;
  }).join('') + `<div class="efasce-tip" id="efasce-tip"></div>`;

  // tap su una barra -> popup con i valori assoluti delle tre fasce
  const tip = cont.querySelector('#efasce-tip');
  let tipAperto = -1;
  cont.querySelectorAll('[data-fasce-idx]').forEach(col => {
    col.addEventListener('click', () => {
      const i = parseInt(col.dataset.fasceIdx);
      if (tipAperto === i) { tip.classList.remove('on'); tipAperto = -1; return; }  // secondo tap: chiude
      tipAperto = i;
      const d = dati[i];
      tip.innerHTML = `<div class="et-title">${escapeHtml(d.label)} · <span class="num">${d.tot} kWh</span></div>
        <div class="et-row"><i style="background:#1C3A6E"></i>F1 giorno <b class="num">${d.f1} kWh</b></div>
        <div class="et-row"><i style="background:#2E9BFF"></i>F2 sera <b class="num">${d.f2} kWh</b></div>
        <div class="et-row"><i style="background:#7B6CFF"></i>F3 notte <b class="num">${d.f3} kWh</b></div>`;
      // posiziono sopra la colonna toccata, con flip se troppo a destra
      const colRect = col.getBoundingClientRect();
      const contRect = cont.getBoundingClientRect();
      const centro = colRect.left - contRect.left + colRect.width / 2;
      tip.classList.add('on');
      const tw = tip.offsetWidth;
      let left = centro - tw / 2;
      left = Math.max(0, Math.min(contRect.width - tw, left));
      tip.style.left = left + 'px';
    });
  });
};

const _renderSpike = (root) => {
  const serie = seriePrezzo(_tipoPrezzo);
  const cont = root.querySelector('#eprice-chart');
  if (serie.length < 2) { cont.innerHTML = '<div class="empty" style="padding:20px 0">Storico insufficiente</div>'; return; }
  const punti = serie.map(s => ({ label: s.label, valore: s.valore }));
  const { svg, dataAttr } = costruisciSparkline(punti, {
    vw: 320, vh: 130, padX: 10, padTop: 14, padBot: 26,
    idLinea: 'enprice', idArea: 'enpricea',
    coloreLinea0: '#2E9BFF', coloreLinea1: '#22E39A',
    larghezzaLinea: 2.2, mostraEtichette: true, mostraUltimoPunto: true,
  });
  cont.innerHTML = `<div class="spark spark-energia" ${dataAttr}>${svg}<div class="spark-vline"></div><div class="spark-tip"></div></div>`;
  agganciaSparkline(cont.querySelector('.spark'), (v) => v.toFixed(3) + ' €/kWh');
};
