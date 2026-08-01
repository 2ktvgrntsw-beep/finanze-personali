// stipendiService.js — Logica di dominio della sezione Stipendi.
// Separata dalla presentazione (come gli altri service): calcola KPI, aggregazioni
// per anno e per datore, serie storiche. Il componente stipendi.js la consuma.
//
// NOTA SUI DATI: 'netto' è ESATTO ovunque. 'lordo'/'trattenute' sono gonfiati nei
// mesi con Anticipo/Recupero (alcuni mesi Marposs e Schneider): le viste che
// contano davvero (netto per anno, netto medio, heatmap) usano il netto; la
// scomposizione del lordo è offerta come vista secondaria, con avviso.

import { state } from '../core/store.js';
import { round2 } from '../core/utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Datori: ordine cronologico e colori scelti dall'utente (identità aziendale).
//  Marposs = blu Marposs · SASIB = rosso Coesia · Bonfiglioli = grigio chiaro ·
//  Schneider = verde acceso (Schneider green).
// ─────────────────────────────────────────────────────────────────────────────
export const DATORI = [
  { nome: 'Marposs', colore: '#1E56D6' },
  { nome: 'SASIB', colore: '#E2001A' },
  { nome: 'Bonfiglioli', colore: '#AEB7C4' },
  { nome: 'Schneider', colore: '#3DCD58' },
];
const _COL = Object.fromEntries(DATORI.map(d => [d.nome, d.colore]));
export const coloreDatore = (nome) => _COL[nome] || '#8B96AB';
export const ordineDatore = (nome) => { const i = DATORI.findIndex(d => d.nome === nome); return i < 0 ? 99 : i; };

// Tutte le buste ordinate dalla più recente alla più vecchia (per id 'YYYY-MM').
export const stipendiOrdinati = () => state.stipendi.slice().sort((a, b) => (b.id || '').localeCompare(a.id || ''));

// L'ultima busta (per l'hero).
export const ultimoStipendio = () => stipendiOrdinati()[0] || null;

// Trova una busta per id.
export const stipendioById = (id) => state.stipendi.find(s => s.id === id) || null;

// Elenco degli anni disponibili (dal più recente).
export const anniDisponibili = () => {
  const anni = new Set(state.stipendi.map(s => String(s.anno)));
  return [...anni].sort((a, b) => b.localeCompare(a));
};

// Buste di un anno, in ordine cronologico crescente (mese).
export const stipendiAnno = (anno) =>
  state.stipendi.filter(s => String(s.anno) === String(anno)).sort((a, b) => a.mese - b.mese);

// Aggregato per un anno: totali + netto per datore.
export const aggregatoAnno = (anno) => {
  const buste = stipendiAnno(anno);
  if (!buste.length) return null;
  const somma = (campo) => round2(buste.reduce((s, b) => s + (b[campo] || 0), 0));
  const netto = somma('netto');
  const lordo = somma('lordo');
  const trattenute = somma('trattenute');
  // netto per datore (per barre impilate e transizioni di lavoro)
  const perDatore = {};
  for (const b of buste) perDatore[b.datore] = round2((perDatore[b.datore] || 0) + (b.netto || 0));
  // datore prevalente dell'anno (per la pastiglia colore)
  const datorePrevalente = Object.entries(perDatore).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    anno: String(anno), mesi: buste.length,
    netto, lordo, trattenute,
    tfr: somma('tfr_a_fondo_pensione'),
    cometa: somma('cometa_dipendente'),
    premi: somma('premi_detassati'),
    rimborso: somma('rimborso_fiscale_escluso'),
    nettoMedio: round2(netto / buste.length),
    aliquotaEff: lordo ? round2(trattenute / lordo * 100) : 0,   // % trattenute sul lordo
    perDatore, datorePrevalente,
  };
};

// Variazione % anno su anno per un KPI ('netto'|'lordo'|'trattenute'|'nettoMedio'|'aliquotaEff'...).
export const variazioneAnno = (anno, campo) => {
  const cur = aggregatoAnno(anno), prev = aggregatoAnno(String(Number(anno) - 1));
  if (!cur || !prev || !prev[campo]) return null;
  return round2(((cur[campo] - prev[campo]) / prev[campo]) * 100);
};

// ─────────────────────────────────────────────────────────────────────────────
// Serie per i grafici della dashboard
// ─────────────────────────────────────────────────────────────────────────────

// Netto ANNO PER ANNO, ripartito per datore (barre impilate: mostra le transizioni).
// Ritorna [{ anno, valori:{Marposs,SASIB,...}, tot }] in ordine cronologico.
export const nettoPerAnnoPerDatore = () => {
  return anniDisponibili().slice().reverse().map(anno => {
    const agg = aggregatoAnno(anno);
    const valori = {};
    for (const d of DATORI) valori[d.nome] = agg.perDatore[d.nome] || 0;
    return { anno, valori, tot: agg.netto };
  });
};

// Scomposizione del LORDO anno per anno: netto in tasca + fisco/contributi + Cometa.
// I tre segmenti sommano al lordo (netto + trattenute; e trattenute = fisco/contributi
// + Cometa dipendente). Vista secondaria: nei mesi 'anticipo' il lordo è gonfiato.
export const composizioneLordoAnnuale = () => {
  return anniDisponibili().slice().reverse().map(anno => {
    const buste = stipendiAnno(anno);
    const netto = round2(buste.reduce((s, b) => s + (b.netto || 0), 0));
    const cometa = round2(buste.reduce((s, b) => s + (b.cometa_dipendente || 0), 0));
    const trattenute = round2(buste.reduce((s, b) => s + (b.trattenute || 0), 0));
    const fisco = round2(trattenute - cometa);
    const tot = round2(netto + trattenute);
    return { anno, valori: { netto, fisco, cometa }, tot };
  });
};

// Netto MESE PER MESE di un anno (barre proporzionali, colore per datore).
// Ritorna [{ mese, label, netto, datore, valori }] cronologico. 'valori' ha una sola
// chiave = datore del mese, così _barreImpilate colora la barra col colore aziendale.
export const nettoMensile = (anno) => {
  return stipendiAnno(anno).map(b => ({
    mese: b.mese, label: MESI3[b.mese - 1], netto: round2(b.netto), datore: b.datore,
    valori: { [b.datore]: round2(b.netto) }, tot: round2(b.netto),
  }));
};

// Scomposizione del lordo MESE PER MESE di un anno.
export const composizioneLordoMensile = (anno) => {
  return stipendiAnno(anno).map(b => {
    const netto = round2(b.netto || 0);
    const cometa = round2(b.cometa_dipendente || 0);
    const trattenute = round2(b.trattenute || 0);
    const fisco = round2(trattenute - cometa);
    return { mese: b.mese, label: MESI3[b.mese - 1], valori: { netto, fisco, cometa }, tot: round2(netto + trattenute) };
  });
};

// Serie del NETTO nel tempo (per la spike-line), cronologica.
export const serieNetto = () => stipendiOrdinati().slice().reverse().map(b => ({
  label: `${MESI3[b.mese - 1]} '${String(b.anno).slice(2)}`, valore: round2(b.netto), datore: b.datore,
}));

// Confronto DATORI: netto totale, mesi, netto medio, periodo. Ordinato per periodo.
export const confrontoDatori = () => {
  const per = {};
  for (const b of state.stipendi) {
    const d = b.datore || '?';
    per[d] = per[d] || { datore: d, nettoTot: 0, lordoTot: 0, mesi: 0, dal: b.id, al: b.id };
    per[d].nettoTot += (b.netto || 0);
    per[d].lordoTot += (b.lordo || 0);
    per[d].mesi++;
    if (b.id < per[d].dal) per[d].dal = b.id;
    if (b.id > per[d].al) per[d].al = b.id;
  }
  return Object.values(per)
    .map(f => ({
      ...f,
      nettoTot: round2(f.nettoTot),
      lordoTot: round2(f.lordoTot),
      nettoMedio: round2(f.nettoTot / f.mesi),
      colore: coloreDatore(f.datore),
    }))
    .sort((a, b) => a.dal.localeCompare(b.dal));
};

// Heatmap netto mese × anno. Celle colorate col colore del datore, intensità = netto.
// Ritorna { anni:[..], celle:{ 'anno-mese': {netto,datore} }, max }.
export const heatmapNetto = () => {
  const celle = {};
  let max = 1;
  for (const b of state.stipendi) {
    const k = `${b.anno}-${b.mese}`;
    // se in un mese ci fossero due datori (transizione) tengo il netto sommato e il datore prevalente
    if (celle[k]) {
      celle[k].netto = round2(celle[k].netto + (b.netto || 0));
      if ((b.netto || 0) > celle[k]._top) { celle[k]._top = b.netto || 0; celle[k].datore = b.datore; }
    } else {
      celle[k] = { netto: round2(b.netto || 0), datore: b.datore, _top: b.netto || 0 };
    }
    if (celle[k].netto > max) max = celle[k].netto;
  }
  const anni = anniDisponibili().slice().reverse();
  return { anni, celle, max };
};

// Statistiche globali (per l'eventuale riga riepilogo).
export const statisticheGlobali = () => {
  const st = state.stipendi;
  return {
    nBuste: st.length,
    nettoTotale: round2(st.reduce((s, b) => s + (b.netto || 0), 0)),
    lordoTotale: round2(st.reduce((s, b) => s + (b.lordo || 0), 0)),
    tfrTotale: round2(st.reduce((s, b) => s + (b.tfr_a_fondo_pensione || 0), 0)),
    datori: [...new Set(st.map(b => b.datore))],
  };
};

export const MESI3 = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export const mese3 = (m) => MESI3[m - 1] || '';
