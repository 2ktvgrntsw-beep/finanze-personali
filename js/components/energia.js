// energia.js — Sezione Energia: monitoraggio spesa e consumo di energia elettrica.
// HOME: hero ultima bolletta, KPI per anno (titolo cliccabile -> pagina Riepilogo),
// fasce anno per anno, ripartizione media, spike-line prezzo, scomposizione costi
// per anno, heatmap mese x anno, confronto fornitori, storico recente.
// RIEPILOGO ANNO: stesse card + fasce e scomposizione costi MESE per MESE.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { costruisciSparkline, agganciaSparkline } from '../core/sparkline.js';
import {
  ultimaBolletta, kpiBolletta, aggregatoAnno, anniDisponibili, variazioneAnno,
  seriePrezzo, ripartizioneFasce, bolletteComplete, mese3,
  serieFasceAnnuale, heatmapConsumi, scomposizioneCostiAnnuale,
  scomposizioneCostiMensile, serieFasceMensile, confrontoFornitori, VOCI_COSTO,
} from '../services/energiaService.js';

const FULMINE = '<svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>';
const FASCE = [
  { k: 'f1', nome: 'F1 giorno', colore: '#1C3A6E' },
  { k: 'f2', nome: 'F2 sera', colore: '#2E9BFF' },
  { k: 'f3', nome: 'F3 notte', colore: '#7B6CFF' },
];

// stato modulo
let _annoKpi = null;           // anno selezionato per le card KPI (home)
let _annoRiep = null;          // anno selezionato nella pagina Riepilogo
let _tipoPrezzo = 'materia';   // 'materia' | 'totale' per la spike-line

const _fmtPeriodo = (dal, al) => {
  const [, m1, g1] = dal.split('-'); const [, m2, g2] = al.split('-');
  return `${g1}/${m1}–${g2}/${m2}`;
};
const _fmtVar = (v) => v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
const _clsVar = (v) => v == null ? '' : (v < 0 ? 'down' : 'up');   // scendere = verde

// ═══════════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════════
export const renderEnergia = async (root) => {
  document.getElementById('view-title').textContent = 'Energia';

  const boll = bolletteComplete();
  if (!boll.length) {
    root.innerHTML = `<div class="card" style="text-align:center;padding:40px 20px">
      <p class="meta" style="margin:12px 0 18px">Non hai ancora nessuna bolletta registrata.</p>
      <button class="btn btn-primary" id="add-boll" style="width:auto;display:inline-flex;padding:11px 20px">Aggiungi la prima bolletta</button>
    </div>`;
    root.querySelector('#add-boll').addEventListener('click', () => navigate('bolletta-nuova'));
    return;
  }

  const anni = anniDisponibili();
  if (_annoKpi == null || !anni.includes(_annoKpi)) _annoKpi = anni[0];

  const u = ultimaBolletta();
  const k = kpiBolletta(u);
  const rip = ripartizioneFasce(6);

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

    <!-- RIEPILOGO ANNO (titolo cliccabile -> pagina dettaglio mensile) -->
    <div class="section-lbl" style="margin-top:14px">
      <span class="lbl-link" id="apri-riepilogo" role="button">Riepilogo anno <span class="lbl-chev">›</span></span>
      <div class="eyear" id="ekpi-year">
        <button id="ekpi-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="ekpi-lbl">${_annoKpi}</span>
        <button id="ekpi-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="ekpis" id="ekpis"></div>

    <!-- FASCE ANNO PER ANNO -->
    <div class="section-lbl"><span>Consumo per fasce · anno per anno</span></div>
    <div class="card">
      ${_legendaHTML(FASCE)}
      <div class="estack" id="g-fasce"></div>
    </div>

    <!-- RIPARTIZIONE media -->
    <div class="section-lbl"><span>Ripartizione media</span></div>
    <div class="efasce">
      ${FASCE.map((f, i) => `<div class="efascia"><div class="dot" style="background:${f.colore}"></div><div class="nm">${f.nome.split(' ')[0]}</div><div class="pc num">${[rip.p1, rip.p2, rip.p3][i]}%</div><div class="kw num">${[rip.f1, rip.f2, rip.f3][i]} kWh</div></div>`).join('')}
    </div>

    <!-- PREZZO nel tempo -->
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

    <!-- SCOMPOSIZIONE COSTI anno per anno -->
    <div class="section-lbl"><span>Voci di costo · anno per anno</span></div>
    <div class="card">
      ${_legendaHTML(VOCI_COSTO)}
      <div class="estack" id="g-costi"></div>
    </div>

    <!-- HEATMAP consumi -->
    <div class="section-lbl"><span>Consumi mese × anno</span></div>
    <div class="card" style="padding:14px 10px">
      <div id="g-heatmap"></div>
    </div>

    <!-- CONFRONTO FORNITORI -->
    <div class="section-lbl"><span>Confronto fornitori</span></div>
    <div class="card" id="g-fornitori"></div>

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
  _barreImpilate(root.querySelector('#g-fasce'), serieFasceAnnuale().map(d => ({ label: `'${d.anno.slice(2)}`, valori: d, tot: d.tot })), FASCE, v => `${Math.round(v)} kWh`, v => v.toLocaleString('it-IT'));
  _renderSpike(root);
  _barreImpilate(root.querySelector('#g-costi'), scomposizioneCostiAnnuale().map(d => ({ label: `'${d.anno.slice(2)}`, valori: d, tot: d.tot })), VOCI_COSTO, v => fmtEUR(v), v => Math.round(v));
  _renderHeatmap(root.querySelector('#g-heatmap'));
  _renderFornitori(root.querySelector('#g-fornitori'), u.fornitore);

  // riepilogo anno cliccabile -> pagina mensile
  root.querySelector('#apri-riepilogo').addEventListener('click', () => {
    _annoRiep = _annoKpi;
    navigate('energia-anno');
  });

  // navigazione anno card KPI (mutazione locale)
  root.querySelector('#ekpi-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i < anni.length - 1) { _annoKpi = anni[i + 1]; root.querySelector('#ekpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });
  root.querySelector('#ekpi-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i > 0) { _annoKpi = anni[i - 1]; root.querySelector('#ekpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });

  root.querySelector('#eprice-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-p]'); if (!btn) return;
    _tipoPrezzo = btn.dataset.p;
    renderEnergia(root);
  });

  root.querySelector('#vedi-storico').addEventListener('click', () => navigate('bollette-storico'));
  root.querySelector('#add-boll').addEventListener('click', () => navigate('bolletta-nuova'));
  root.querySelectorAll('[data-bolletta]').forEach(el =>
    el.addEventListener('click', () => navigate('bolletta-dettaglio', { id: el.dataset.bolletta })));
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA RIEPILOGO ANNO (da click su "Riepilogo anno")
// ═══════════════════════════════════════════════════════════════════════════
export const renderEnergiaAnno = async (root) => {
  const anni = anniDisponibili();
  if (_annoRiep == null || !anni.includes(_annoRiep)) _annoRiep = anni[0];
  document.getElementById('view-title').textContent = `Riepilogo ${_annoRiep}`;

  root.innerHTML = `
    <div class="section-lbl" style="margin-top:4px"><span>Riepilogo anno</span>
      <div class="eyear">
        <button id="er-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="er-lbl">${_annoRiep}</span>
        <button id="er-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="ekpis" id="er-kpis"></div>

    <div class="section-lbl"><span>Consumo per fasce · mese per mese</span></div>
    <div class="card">
      ${_legendaHTML(FASCE)}
      <div class="estack" id="er-fasce"></div>
      <div class="eprice-note" style="margin-top:8px">Le bollette a cavallo di due mesi sono ripartite in proporzione ai giorni.</div>
    </div>

    <div class="section-lbl"><span>Voci di costo · mese per mese</span></div>
    <div class="card">
      ${_legendaHTML(VOCI_COSTO)}
      <div class="estack" id="er-costi"></div>
    </div>
  `;

  const disegna = () => {
    document.getElementById('view-title').textContent = `Riepilogo ${_annoRiep}`;
    root.querySelector('#er-lbl').textContent = _annoRiep;
    _renderKpiIn(root.querySelector('#er-kpis'), _annoRiep);
    _barreImpilate(root.querySelector('#er-fasce'), serieFasceMensile(_annoRiep).map(d => ({ label: d.label, valori: d, tot: d.tot })), FASCE, v => `${Math.round(v)} kWh`, v => v.toLocaleString('it-IT'));
    _barreImpilate(root.querySelector('#er-costi'), scomposizioneCostiMensile(_annoRiep).map(d => ({ label: d.label, valori: d, tot: d.tot })), VOCI_COSTO, v => fmtEUR(v), v => Math.round(v));
  };
  disegna();

  root.querySelector('#er-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoRiep);
    if (i < anni.length - 1) { _annoRiep = anni[i + 1]; disegna(); }
  });
  root.querySelector('#er-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoRiep);
    if (i > 0) { _annoRiep = anni[i - 1]; disegna(); }
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// riga bolletta riutilizzabile (home + storico)
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// helper grafici
// ═══════════════════════════════════════════════════════════════════════════
const _legendaHTML = (segmenti) => `<div class="elegend">${segmenti.map(s =>
  `<span><i style="background:${s.colore}"></i>${escapeHtml(s.nome)}</span>`).join('')}</div>`;

// Barre impilate GENERICHE, altezze PROPORZIONALI al totale. La selezione di una
// barra (tap) evidenzia la colonna e mostra il dettaglio in un PANNELLO FISSO
// sotto il grafico: niente popup che copre le barre.
// dati: [{ label, valori: {k: v}, tot }] · segmenti: [{ k, nome, colore }]
const _barreImpilate = (cont, dati, segmenti, fmtTip, fmtTot) => {
  if (!dati.length) { cont.innerHTML = '<div class="empty" style="padding:30px 0">Nessun dato</div>'; return; }
  const maxT = Math.max(...dati.map(d => d.tot), 1);
  const AREA = 118;   // px disponibili per la barra più alta
  cont.innerHTML = `<div class="ebars-area">` + dati.map((d, i) => {
    const hPx = Math.max(4, Math.round(d.tot / maxT * AREA));
    const positivi = segmenti.map(s => Math.max(0, d.valori[s.k] || 0));
    const sommaPos = positivi.reduce((a, b) => a + b, 0) || 1;
    return `<div class="escol" data-bar-idx="${i}">
      <div class="estot num">${fmtTot(d.tot)}</div>
      <div class="ebar-wrap" style="height:${hPx}px">
        ${segmenti.map((s, j) => `<div class="ebar-seg" style="height:${(positivi[j] / sommaPos * 100).toFixed(1)}%;background:${s.colore}"></div>`).join('')}
      </div>
      <div class="eslbl">${escapeHtml(d.label)}</div>
    </div>`;
  }).join('') + `</div><div class="ebar-detail"><span class="hint">Tocca una barra per il dettaglio</span></div>`;

  const area = cont.querySelector('.ebars-area');
  const detail = cont.querySelector('.ebar-detail');
  let aperto = -1;
  const seleziona = (i) => {
    if (aperto === i) {   // secondo tap: deseleziona
      aperto = -1;
      area.classList.remove('has-sel');
      area.querySelectorAll('.escol').forEach(c => c.classList.remove('sel'));
      detail.innerHTML = '<span class="hint">Tocca una barra per il dettaglio</span>';
      return;
    }
    aperto = i;
    area.classList.add('has-sel');
    area.querySelectorAll('.escol').forEach((c, j) => c.classList.toggle('sel', j === i));
    const d = dati[i];
    detail.innerHTML = `<div class="ed-title">${escapeHtml(d.label)} · <b class="num">${fmtTip(d.tot)}</b></div>
      <div class="ed-rows">${segmenti.map(s => {
        const v = d.valori[s.k] || 0;
        if (Math.abs(v) < 0.005) return '';
        return `<span class="ed-item"><i style="background:${s.colore}"></i>${escapeHtml(s.nome)} <b class="num">${fmtTip(v)}</b></span>`;
      }).join('')}</div>`;
  };
  area.querySelectorAll('[data-bar-idx]').forEach(col =>
    col.addEventListener('click', () => seleziona(parseInt(col.dataset.barIdx))));
};

// Card KPI di un anno dentro un contenitore.
const _renderKpiIn = (cont, anno) => {
  const agg = aggregatoAnno(anno);
  if (!agg) { cont.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:20px 0">Nessuna bolletta nel ${anno}</div>`; return; }
  const prec = Number(anno) - 1;
  const vG = variazioneAnno(anno, 'eurGiorno'), vP = variazioneAnno(anno, 'eurKwh');
  const vS = variazioneAnno(anno, 'spesa'), vC = variazioneAnno(anno, 'consumo');
  cont.innerHTML = `
    <div class="ekpi"><div class="k">Costo/giorno</div><div class="v num">${fmtEUR(agg.eurGiorno)}</div>${vG != null ? `<div class="d ${_clsVar(vG)}">${_fmtVar(vG)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Prezzo medio</div><div class="v num">${agg.eurKwh.toFixed(3)}<small> €/kWh</small></div>${vP != null ? `<div class="d ${_clsVar(vP)}">${_fmtVar(vP)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Spesa ${anno}</div><div class="v num">${fmtEUR(agg.spesa)}</div>${vS != null ? `<div class="d ${_clsVar(vS)}">${_fmtVar(vS)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Consumo ${anno}</div><div class="v num">${agg.consumo.toLocaleString('it-IT')}<small> kWh</small></div>${vC != null ? `<div class="d ${_clsVar(vC)}">${_fmtVar(vC)} vs ${prec}</div>` : ''}</div>`;
};
const _renderKpi = (root) => _renderKpiIn(root.querySelector('#ekpis'), _annoKpi);

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

// Heatmap consumi mese x anno: scala TERMICA ambra -> rosso (più caldo = più
// consumo, come una mappa di calore vera). Fuori palette Cockpit di proposito:
// qui il colore È l'informazione.
const _renderHeatmap = (cont) => {
  const { anni, celle, max } = heatmapConsumi();
  const C1 = [255, 176, 32], C2 = [255, 59, 92];   // ambra -> rosso neon
  const colore = (t) => {
    const c = C1.map((a, i) => Math.round(a + (C2[i] - a) * t));
    const alpha = 0.14 + t * 0.8;
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(2)})`;
  };
  const testata = `<div class="hm-lbl"></div>` + anni.map(a => `<div class="hm-head num">'${a.slice(2)}</div>`).join('');
  const righe = Array.from({ length: 12 }, (_, m) => {
    const mese = m + 1;
    return `<div class="hm-lbl">${mese3(mese)}</div>` + anni.map(a => {
      const v = celle[`${a}-${mese}`];
      if (v == null) return `<div class="hm-cell vuota"></div>`;
      const t = Math.min(1, v / max);
      return `<div class="hm-cell num" style="background:${colore(t)};color:${t > 0.45 ? '#fff' : 'var(--txt-2)'}">${v}</div>`;
    }).join('');
  }).join('');
  cont.innerHTML = `<div class="hm-grid" style="grid-template-columns:34px repeat(${anni.length},1fr)">${testata}${righe}</div>
    <div class="eprice-note" style="margin-top:10px;padding:0 4px">kWh mensili · le bollette a cavallo di due mesi sono ripartite in proporzione ai giorni.</div>`;
};

// Confronto fornitori: €/kWh medio tutto compreso, dal più economico.
const _renderFornitori = (cont, fornAttuale) => {
  const forn = confrontoFornitori();
  if (!forn.length) { cont.innerHTML = '<div class="empty">Nessun dato</div>'; return; }
  const maxP = Math.max(...forn.map(f => f.eurKwh));
  cont.innerHTML = forn.map((f, i) => {
    const w = (f.eurKwh / maxP * 100).toFixed(0);
    const attuale = f.fornitore === fornAttuale;
    const migliore = i === 0;
    return `<div class="fr-row">
      <div class="fr-head">
        <span class="fr-nome">${escapeHtml(f.fornitore)}${attuale ? ' <span class="fr-badge">attuale</span>' : ''}</span>
        <span class="fr-val num">${f.eurKwh.toFixed(3)} €/kWh</span>
      </div>
      <div class="fr-bar"><div class="fr-fill" style="width:${w}%;background:${migliore ? 'linear-gradient(90deg,#22E39A,#5FC3FF)' : 'linear-gradient(90deg,#1C7BE0,#2E9BFF)'}"></div></div>
      <div class="fr-sub">'${f.dal.slice(2, 4)}–'${f.al.slice(2, 4)} · ${f.n} bollette · ${f.kwh.toLocaleString('it-IT')} kWh · ${fmtEUR(f.spesa)}</div>
    </div>`;
  }).join('') + `<div class="eprice-note" style="margin-top:6px">Prezzo medio tutto compreso (bolletta ÷ kWh) sull'intero periodo con quel fornitore. Attenzione: epoche diverse hanno prezzi di mercato diversi.</div>`;
};
