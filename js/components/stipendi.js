// stipendi.js — Sezione Stipendi: storico buste paga sui quattro datori.
// HOME: hero ultima busta, KPI per anno (titolo cliccabile -> riepilogo mensile),
// netto anno per anno ripartito per datore, netto nel tempo (spike-line),
// scomposizione del lordo, heatmap netto mese × anno, confronto datori, storico.
// RIEPILOGO ANNO: stesse card + netto e scomposizione lordo MESE per MESE.
// DETTAGLIO BUSTA: scomposizione completa + voci notevoli.
//
// Riusa _barreImpilate() di energia.js (barre proporzionali con dettaglio a tap):
// stessa resa e stesse interazioni della sezione Energia, zero logica duplicata.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { _barreImpilate } from './energia.js';
import {
  DATORI, coloreDatore, ultimoStipendio, stipendioById, anniDisponibili,
  aggregatoAnno, variazioneAnno, nettoPerAnnoPerDatore, composizioneLordoAnnuale,
  nettoMensile, composizioneLordoMensile, confrontoDatori, heatmapNetto,
  versamentoFondoAnnuale, versamentoFondoTotale, SEG_FONDO,
  mese3, MESI3,
} from '../services/stipendiService.js';

const BUSTA = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M8 13h5"/></svg>';

// segmenti per le barre impilate
const SEG_DATORI = DATORI.map(d => ({ k: d.nome, nome: d.nome, colore: d.colore }));
const SEG_LORDO = [
  { k: 'netto', nome: 'Netto in tasca', colore: '#22E39A' },
  { k: 'fisco', nome: 'Fisco e contributi', colore: '#FF3B5C' },
  { k: 'cometa', nome: 'Cometa (previdenza)', colore: '#7B6CFF' },
];

// stato modulo
let _annoKpi = null;    // anno selezionato per le card KPI (home)
let _annoRiep = null;   // anno selezionato nella pagina Riepilogo

const _fmtVar = (v) => v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
// per il netto: salire = bene (verde). per l'aliquota/trattenute: salire = male (rosso).
const _clsUp = (v) => v == null ? '' : (v >= 0 ? 'up' : 'down');
const _clsDown = (v) => v == null ? '' : (v <= 0 ? 'up' : 'down');
const _leg = (segmenti) => `<div class="elegend">${segmenti.map(s =>
  `<span><i style="background:${s.colore}"></i>${escapeHtml(s.nome)}</span>`).join('')}</div>`;

// ═══════════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendi = async (root) => {
  document.getElementById('view-title').textContent = 'Stipendi';

  if (!state.stipendi.length) {
    root.innerHTML = `<div class="card" style="text-align:center;padding:40px 20px">
      <p class="meta" style="margin:12px 0">Nessuna busta paga in archivio.</p>
    </div>`;
    return;
  }

  const anni = anniDisponibili();
  if (_annoKpi == null || !anni.includes(_annoKpi)) _annoKpi = anni[0];

  const u = ultimoStipendio();
  const colU = coloreDatore(u.datore);

  root.innerHTML = `
    <!-- HERO ultima busta -->
    <div class="net-card energia-hero" style="border-top:3px solid ${colU}">
      <div class="net-row">
        <div class="ehero-forn"><span class="stip-dot" style="background:${colU}"></span> Ultima busta · <b>${escapeHtml(u.datore)}</b><br><span class="meta">${escapeHtml(u.periodo)}</span></div>
        ${u.tredicesima_inclusa ? `<span class="ebadge">13ª inclusa</span>` : ''}
      </div>
      <div class="ehero-imp num">${fmtEUR(u.netto)}</div>
      <div class="ehero-meta">
        <div><div class="k">Lordo</div><div class="v num">${fmtEUR(u.lordo)}</div></div>
        <div><div class="k">Trattenute</div><div class="v num">${fmtEUR(u.trattenute)}</div></div>
        <div><div class="k">TFR a fondo</div><div class="v num">${fmtEUR(u.tfr_a_fondo_pensione)}</div></div>
      </div>
    </div>

    <!-- RIEPILOGO ANNO (titolo cliccabile -> pagina dettaglio mensile) -->
    <div class="section-lbl" style="margin-top:14px">
      <span class="lbl-link" id="apri-riepilogo" role="button">Riepilogo anno <span class="lbl-chev">›</span></span>
      <div class="eyear" id="skpi-year">
        <button id="skpi-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="skpi-lbl">${_annoKpi}</span>
        <button id="skpi-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="ekpis" id="skpis"></div>

    <!-- NETTO ANNO PER ANNO (ripartito per datore) -->
    <div class="section-lbl"><span>Netto percepito · anno per anno</span></div>
    <div class="card">
      ${_leg(SEG_DATORI)}
      <div class="estack" id="g-netto"></div>
    </div>

    <!-- FONDO PENSIONE versato -->
    <div class="section-lbl"><span>Fondo pensione · versato per anno</span></div>
    <div class="card">
      ${_leg(SEG_FONDO)}
      <div class="estack" id="g-fondo"></div>
      <div class="eprice-note" style="margin-top:8px">${_fondoTotHTML()}</div>
    </div>

    <!-- SCOMPOSIZIONE LORDO anno per anno -->
    <div class="section-lbl"><span>Dove va il lordo · anno per anno</span></div>
    <div class="card">
      ${_leg(SEG_LORDO)}
      <div class="estack" id="g-lordo"></div>
      <div class="eprice-note" style="margin-top:8px">Netto + fisco/contributi + Cometa = lordo. Sono esclusi i mesi di anticipo/recupero e le buste di cessazione, dove competenze e trattenute sono gonfiate da partite che si compensano: falserebbero il quadro. Il netto invece li include sempre.</div>
    </div>

    <!-- HEATMAP netto -->
    <div class="section-lbl"><span>Netto mese × anno</span></div>
    <div class="card" style="padding:14px 10px">
      <div id="s-heatmap"></div>
    </div>

    <!-- CONFRONTO DATORI -->
    <div class="section-lbl"><span>Confronto datori</span></div>
    <div class="card" id="s-datori"></div>

    <!-- STORICO -->
    <div class="section-lbl"><span>Storico buste</span><span class="act" id="vedi-tutte">Tutte (${state.stipendi.length}) ›</span></div>
    <div class="card" style="padding:0" id="s-storico">
      ${stipendiRecenti(4).map(b => _rigaStipendioHTML(b)).join('<div class="divider"></div>')}
    </div>
  `;

  _renderKpi(root);
  _barreImpilate(
    root.querySelector('#g-netto'),
    nettoPerAnnoPerDatore().map(d => ({ label: `'${d.anno.slice(2)}`, valori: d.valori, tot: d.tot })),
    SEG_DATORI, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'),
  );
  _barreImpilate(
    root.querySelector('#g-fondo'),
    versamentoFondoAnnuale().map(d => ({ label: `'${d.anno.slice(2)}`, valori: d.valori, tot: d.tot })),
    SEG_FONDO, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'),
  );
  _barreImpilate(
    root.querySelector('#g-lordo'),
    composizioneLordoAnnuale().map(d => ({ label: `'${d.anno.slice(2)}`, valori: d.valori, tot: d.tot })),
    SEG_LORDO, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'),
  );
  _renderHeatmap(root.querySelector('#s-heatmap'));
  _renderDatori(root.querySelector('#s-datori'), u.datore);

  // riepilogo anno cliccabile -> pagina mensile
  root.querySelector('#apri-riepilogo').addEventListener('click', () => { _annoRiep = _annoKpi; navigate('stipendi-anno'); });

  // navigazione anno card KPI (mutazione locale)
  root.querySelector('#skpi-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i < anni.length - 1) { _annoKpi = anni[i + 1]; root.querySelector('#skpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });
  root.querySelector('#skpi-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i > 0) { _annoKpi = anni[i - 1]; root.querySelector('#skpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });

  const vt = root.querySelector('#vedi-tutte');
  if (vt) vt.addEventListener('click', () => navigate('stipendi-storico'));

  root.querySelectorAll('[data-stip]').forEach(el =>
    el.addEventListener('click', () => navigate('stipendio-dettaglio', { id: el.dataset.stip })));
};

// riga riepilogo totale versato al fondo (sotto le barre)
const _fondoTotHTML = () => {
  const t = versamentoFondoTotale();
  return `Totale versato al fondo: <b class="num">${fmtEUR(t.tot)}</b> — TFR ${fmtEUR(t.tfr)} · mio ${fmtEUR(t.dip)} · datore ${fmtEUR(t.az)}. Sono versamenti reali: inclusi tutti i mesi.`;
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA STORICO (tutte le buste, per anno)
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendiStorico = async (root) => {
  document.getElementById('view-title').textContent = 'Storico buste';
  const anni = anniDisponibili();
  root.innerHTML = anni.map(anno => {
    const buste = state.stipendi.filter(s => String(s.anno) === anno).sort((a, b) => b.mese - a.mese);
    const tot = buste.reduce((s, b) => s + (b.netto || 0), 0);
    return `<div class="section-lbl"><span>${anno}</span><span class="meta num">${fmtEUR(tot)}</span></div>
      <div class="card" style="padding:0">${buste.map(b => _rigaStipendioHTML(b)).join('<div class="divider"></div>')}</div>`;
  }).join('');
  root.querySelectorAll('[data-stip]').forEach(el =>
    el.addEventListener('click', () => navigate('stipendio-dettaglio', { id: el.dataset.stip })));
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA RIEPILOGO ANNO
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendiAnno = async (root) => {
  const anni = anniDisponibili();
  if (_annoRiep == null || !anni.includes(_annoRiep)) _annoRiep = anni[0];
  document.getElementById('view-title').textContent = `Stipendi ${_annoRiep}`;

  root.innerHTML = `
    <div class="section-lbl" style="margin-top:4px"><span>Riepilogo anno</span>
      <div class="eyear">
        <button id="sr-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="sr-lbl">${_annoRiep}</span>
        <button id="sr-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="ekpis" id="sr-kpis"></div>

    <div class="section-lbl"><span>Netto · mese per mese</span></div>
    <div class="card">
      ${_leg(SEG_DATORI)}
      <div class="estack" id="sr-netto"></div>
    </div>

    <div class="section-lbl"><span>Dove va il lordo · mese per mese</span></div>
    <div class="card">
      ${_leg(SEG_LORDO)}
      <div class="estack" id="sr-lordo"></div>
    </div>

    <div class="section-lbl"><span>Buste del ${_annoRiep}</span></div>
    <div class="card" style="padding:0" id="sr-buste"></div>
  `;

  const disegna = () => {
    document.getElementById('view-title').textContent = `Stipendi ${_annoRiep}`;
    root.querySelector('#sr-lbl').textContent = _annoRiep;
    _renderKpiIn(root.querySelector('#sr-kpis'), _annoRiep);
    _barreImpilate(root.querySelector('#sr-netto'),
      nettoMensile(_annoRiep).map(d => ({ label: d.label, valori: d.valori, tot: d.tot })),
      SEG_DATORI, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'));
    _barreImpilate(root.querySelector('#sr-lordo'),
      composizioneLordoMensile(_annoRiep).map(d => ({ label: d.label, valori: d.valori, tot: d.tot })),
      SEG_LORDO, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'));
    const buste = state.stipendi.filter(s => String(s.anno) === String(_annoRiep)).sort((a, b) => b.mese - a.mese);
    root.querySelector('#sr-buste').innerHTML = buste.map(b => _rigaStipendioHTML(b)).join('<div class="divider"></div>');
    root.querySelectorAll('#sr-buste [data-stip]').forEach(el =>
      el.addEventListener('click', () => navigate('stipendio-dettaglio', { id: el.dataset.stip })));
  };
  disegna();

  root.querySelector('#sr-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoRiep);
    if (i < anni.length - 1) { _annoRiep = anni[i + 1]; disegna(); }
  });
  root.querySelector('#sr-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoRiep);
    if (i > 0) { _annoRiep = anni[i - 1]; disegna(); }
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA DETTAGLIO BUSTA
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendioDettaglio = async (root, params) => {
  const b = stipendioById(params.id);
  if (!b) { root.innerHTML = '<div class="empty" style="padding:40px 0">Busta non trovata.</div>'; return; }
  const col = coloreDatore(b.datore);
  document.getElementById('view-title').textContent = b.periodo;

  const cometa = b.cometa_dipendente || 0;
  const fisco = Math.max(0, (b.trattenute || 0) - cometa);
  const comp = [
    { nome: 'Netto in tasca', val: b.netto, colore: '#22E39A' },
    { nome: 'Fisco e contributi', val: fisco, colore: '#FF3B5C' },
    { nome: 'Cometa (previdenza)', val: cometa, colore: '#7B6CFF' },
  ].filter(v => v.val > 0);
  const somma = comp.reduce((s, v) => s + v.val, 0) || 1;

  // righe di dettaglio (mostro solo quelle valorizzate)
  const righe = [
    ['Lordo (competenze)', b.lordo],
    ['Trattenute totali', b.trattenute],
    ['— di cui fisco e contributi', fisco],
    ['— di cui Cometa dipendente', cometa],
    ['Netto', b.netto],
    ['TFR a fondo pensione', b.tfr_a_fondo_pensione],
    ['Premi detassati', b.premi_detassati],
    ['Rimborso 730 (escluso dal netto)', b.rimborso_fiscale_escluso],
    // dettaglio fiscale extra (solo Marposs/SASIB)
    ['Contributi INPS', b.contributi_inps],
    ['IRPEF netta', b.irpef_netta],
    ['Addizionale regionale', b.addizionale_regionale],
    ['Addizionale comunale', b.addizionale_comunale],
    ['Cometa azienda', b.cometa_azienda],
  ].filter(([, v]) => v != null && v !== 0);

  root.innerHTML = `
    <div class="net-card" style="border-top:3px solid ${col}">
      <div class="net-row">
        <div><span class="stip-dot" style="background:${col}"></span> <b>${escapeHtml(b.datore)}</b> · <span class="meta">${escapeHtml(b.periodo)}</span></div>
        ${b.tredicesima_inclusa ? `<span class="ebadge">13ª inclusa</span>` : ''}
      </div>
      <div class="ehero-imp num" style="margin-top:6px">${fmtEUR(b.netto)}</div>
      <div class="meta" style="margin-top:2px">netto incassato</div>
    </div>

    ${(b.anticipo || b.cessazione) ? `<div class="card" style="border-left:3px solid var(--warn)">
      <div class="meta">${b.anticipo
        ? 'Mese con <b>anticipo/recupero</b>: lordo e trattenute sono gonfiati da partite che si compensano nel netto. Il netto è quello reale; questo mese è escluso dai grafici sul lordo.'
        : 'Busta di <b>cessazione</b>: include liquidazione ferie/PAR e conguagli. Importi atipici; esclusa dai grafici sul lordo, ma il netto è reale.'}</div>
    </div>` : ''}

    <div class="section-lbl"><span>Composizione del lordo</span></div>
    <div class="card">
      <div class="stip-compbar">${comp.map(v => `<div style="width:${(v.val / somma * 100).toFixed(1)}%;background:${v.colore}"></div>`).join('')}</div>
      <div class="elegend" style="margin-top:10px">${comp.map(v => `<span><i style="background:${v.colore}"></i>${escapeHtml(v.nome)} <b class="num">${fmtEUR(v.val)}</b></span>`).join('')}</div>
    </div>

    <div class="section-lbl"><span>Dettaglio importi</span></div>
    <div class="card" style="padding:4px 0">
      ${righe.map(([k, v]) => `<div class="stip-drow"><span>${escapeHtml(k)}</span><span class="num">${fmtEUR(v)}</span></div>`).join('')}
    </div>

    ${(b.voci_notevoli && b.voci_notevoli.length) ? `
      <div class="section-lbl"><span>Note</span></div>
      <div class="card">
        <ul class="stip-note">${b.voci_notevoli.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
      </div>` : ''}
  `;
};

// ═══════════════════════════════════════════════════════════════════════════
// pezzi riutilizzabili
// ═══════════════════════════════════════════════════════════════════════════
const stipendiRecenti = (n) => state.stipendi.slice().sort((a, b) => (b.id || '').localeCompare(a.id || '')).slice(0, n);

const _rigaStipendioHTML = (b) => {
  const col = coloreDatore(b.datore);
  return `<div class="eboll" data-stip="${escapeHtml(b.id)}">
    <div class="eboll-ic" style="color:${col}">${BUSTA}</div>
    <div class="eboll-body">
      <div class="eboll-r1"><span class="eboll-nm">${escapeHtml(b.periodo)}</span><span class="eboll-imp num">${fmtEUR(b.netto)}</span></div>
      <div class="eboll-r2"><span class="eboll-sub"><span class="stip-dot" style="background:${col}"></span> ${escapeHtml(b.datore)}${b.tredicesima_inclusa ? ' · 13ª' : ''}</span><span class="eboll-kwh num">lordo ${fmtEUR(b.lordo)}</span></div>
    </div>
    <div class="eboll-chev">›</div>
  </div>`;
};

// Card KPI di un anno dentro un contenitore.
const _renderKpiIn = (cont, anno) => {
  const agg = aggregatoAnno(anno);
  if (!agg) { cont.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:20px 0">Nessuna busta nel ${anno}</div>`; return; }
  const prec = Number(anno) - 1;
  const vN = variazioneAnno(anno, 'netto'), vM = variazioneAnno(anno, 'nettoMedio');
  const vL = variazioneAnno(anno, 'lordo'), vA = variazioneAnno(anno, 'aliquotaEff');
  const parziale = agg.mesi < 12 ? `<small> · ${agg.mesi} mesi</small>` : '';
  cont.innerHTML = `
    <div class="ekpi"><div class="k">Netto ${anno}</div><div class="v num">${fmtEUR(agg.netto)}${parziale}</div>${vN != null ? `<div class="d ${_clsUp(vN)}">${_fmtVar(vN)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Netto medio/mese</div><div class="v num">${fmtEUR(agg.nettoMedio)}</div>${vM != null ? `<div class="d ${_clsUp(vM)}">${_fmtVar(vM)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Lordo ${anno}</div><div class="v num">${fmtEUR(agg.lordo)}</div>${vL != null ? `<div class="d ${_clsUp(vL)}">${_fmtVar(vL)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Trattenute sul lordo</div><div class="v num">${agg.aliquotaEff.toFixed(1)}<small> %</small></div>${vA != null ? `<div class="d ${_clsDown(vA)}">${_fmtVar(vA)} vs ${prec}</div>` : ''}</div>`;
};
const _renderKpi = (root) => _renderKpiIn(root.querySelector('#skpis'), _annoKpi);

// Heatmap netto mese × anno: colore = datore, intensità = netto (0.14 → 0.95).
const _renderHeatmap = (cont) => {
  const { anni, celle, max } = heatmapNetto();
  const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const testata = `<div class="hm-lbl"></div>` + anni.map(a => `<div class="hm-head num">'${a.slice(2)}</div>`).join('');
  const righe = Array.from({ length: 12 }, (_, m) => {
    const mese = m + 1;
    return `<div class="hm-lbl">${mese3(mese)}</div>` + anni.map(a => {
      const c = celle[`${a}-${mese}`];
      if (c == null) return `<div class="hm-cell vuota"></div>`;
      const t = Math.min(1, c.netto / max);
      const [r, g, bl] = hex2rgb(coloreDatore(c.datore));
      const alpha = (0.14 + t * 0.81).toFixed(2);
      const euro = Math.round(c.netto).toLocaleString('it-IT');
      return `<div class="hm-cell num" style="background:rgba(${r},${g},${bl},${alpha});color:${t > 0.5 ? '#fff' : 'var(--txt-2)'};font-size:9px">${euro}</div>`;
    }).join('');
  }).join('');
  cont.innerHTML = `<div class="hm-grid" style="grid-template-columns:34px repeat(${anni.length},1fr)">${testata}${righe}</div>
    <div class="eprice-note" style="margin-top:10px;padding:0 4px">Netto mensile (€). Il colore indica il datore, l'intensità l'importo.</div>`;
};

// Confronto datori: netto medio mensile, dal primo all'ultimo mese, colore aziendale.
const _renderDatori = (cont, datoreAttuale) => {
  const dati = confrontoDatori();
  if (!dati.length) { cont.innerHTML = '<div class="empty">Nessun dato</div>'; return; }
  const maxN = Math.max(...dati.map(d => d.nettoMedio));
  cont.innerHTML = dati.map(f => {
    const w = (f.nettoMedio / maxN * 100).toFixed(0);
    const attuale = f.datore === datoreAttuale;
    const [y1, m1] = f.dal.split('-'); const [y2, m2] = f.al.split('-');
    return `<div class="fr-row">
      <div class="fr-head">
        <span class="fr-nome"><span class="stip-dot" style="background:${f.colore}"></span> ${escapeHtml(f.datore)}${attuale ? ' <span class="fr-badge">attuale</span>' : ''}</span>
        <span class="fr-val num">${fmtEUR(f.nettoMedio)}/mese</span>
      </div>
      <div class="fr-bar"><div class="fr-fill" style="width:${w}%;background:${f.colore}"></div></div>
      <div class="fr-sub">${mese3(+m1)} '${y1.slice(2)} – ${mese3(+m2)} '${y2.slice(2)} · ${f.mesi} buste · netto totale ${fmtEUR(f.nettoTot)}</div>
    </div>`;
  }).join('') + `<div class="eprice-note" style="margin-top:6px">La barra è il <b>netto medio mensile</b>; "netto totale" è tutto il netto realmente incassato con quel datore nell'intero periodo (mesi di passaggio, conguagli e tredicesime inclusi, perché sono denaro reale).</div>`;
};
