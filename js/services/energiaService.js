// energiaService.js — Logica di dominio della sezione Energia.
// Separata dalla presentazione (come gli altri service): calcola KPI, aggregazioni
// per anno, ripartizione fasce, serie prezzo. Il componente energia.js la consuma.

import { state } from '../core/store.js';
import { round2 } from '../core/utils.js';

// Tutte le bollette ordinate dalla più recente alla più vecchia.
export const bolletteOrdinate = () => state.bollette.slice().sort((a, b) => (b.al || '').localeCompare(a.al || ''));

// Solo le bollette complete (con consumo e totale validi), ordinate.
export const bolletteComplete = () => bolletteOrdinate().filter(b => b.completa && b.kwhTot > 0 && b.totale != null);

// L'ultima bolletta completa (per l'hero).
export const ultimaBolletta = () => bolletteComplete()[0] || null;

// Anno di una bolletta (dall'anno di fine periodo).
const annoDi = (b) => (b.al || '').slice(0, 4);

// KPI derivati da una singola bolletta.
export const kpiBolletta = (b) => {
  if (!b || !b.kwhTot) return null;
  return {
    eurKwh: round2(b.totale / b.kwhTot),          // prezzo medio "tutto compreso"
    eurGiorno: b.giorni ? round2(b.totale / b.giorni) : null,
    materiaKwh: b.materia != null ? round2(b.materia / b.kwhTot) : null,  // prezzo su cui incidi
  };
};

// Aggregato per un anno: spesa totale, consumo, media, ripartizione fasce.
export const aggregatoAnno = (anno) => {
  const boll = bolletteComplete().filter(b => annoDi(b) === String(anno));
  if (!boll.length) return null;
  const spesa = boll.reduce((s, b) => s + b.totale, 0);
  const consumo = boll.reduce((s, b) => s + b.kwhTot, 0);
  const giorni = boll.reduce((s, b) => s + (b.giorni || 0), 0);
  const f1 = boll.reduce((s, b) => s + (b.kwhF1 || 0), 0);
  const f2 = boll.reduce((s, b) => s + (b.kwhF2 || 0), 0);
  const f3 = boll.reduce((s, b) => s + (b.kwhF3 || 0), 0);
  return {
    anno: String(anno), bollette: boll.length,
    spesa: round2(spesa), consumo,
    eurKwh: consumo ? round2(spesa / consumo) : 0,
    eurGiorno: giorni ? round2(spesa / giorni) : 0,
    fasce: { f1, f2, f3, tot: f1 + f2 + f3 },
  };
};

// Elenco degli anni disponibili (dal più recente).
export const anniDisponibili = () => {
  const anni = new Set(bolletteComplete().map(annoDi));
  return [...anni].sort((a, b) => b.localeCompare(a));
};

// Variazione percentuale anno su anno per un dato KPI ('spesa'|'consumo'|'eurKwh'|'eurGiorno').
export const variazioneAnno = (anno, campo) => {
  const cur = aggregatoAnno(anno), prev = aggregatoAnno(String(Number(anno) - 1));
  if (!cur || !prev || !prev[campo]) return null;
  return round2(((cur[campo] - prev[campo]) / prev[campo]) * 100);
};

// Serie temporale del prezzo (per la spike-line). tipo: 'materia' | 'totale'.
// Ritorna [{ label, valore, fornitore }] dalla più vecchia alla più recente.
// FILTRO OUTLIER: le bollette anomale (es. l'attivazione 2018 da 19 giorni con
// conguagli: 0,767 €/kWh contro una mediana di ~0,13) schiaccerebbero tutto il
// grafico rendendolo illeggibile. Escludo i punti oltre 3× la mediana: il picco
// crisi 2022 (0,34) resta ben visibile, l'anomalia amministrativa no.
export const seriePrezzo = (tipo = 'materia') => {
  const boll = bolletteComplete().slice().reverse();  // cronologico
  const out = [];
  for (const b of boll) {
    let v = null;
    if (tipo === 'materia' && b.materia != null) v = b.materia / b.kwhTot;
    else if (tipo === 'totale') v = b.totale / b.kwhTot;
    if (v == null) continue;
    const [y, m] = b.al.split('-');
    out.push({ label: `${m}/${y.slice(2)}`, valore: round2v3(v), fornitore: b.fornitore });
  }
  if (out.length < 4) return out;
  const ordinati = out.map(p => p.valore).sort((a, b) => a - b);
  const mediana = ordinati[Math.floor(ordinati.length / 2)];
  return out.filter(p => p.valore <= mediana * 3);
};

// arrotonda a 3 decimali (i prezzi €/kWh hanno bisogno del terzo decimale)
const round2v3 = (v) => Math.round(v * 1000) / 1000;

// Serie consumo per fasce di un anno (per le barre impilate).
// Ritorna [{ label, f1, f2, f3, tot }] in ordine cronologico.
export const serieFasce = (anno) => {
  const boll = bolletteComplete().filter(b => annoDi(b) === String(anno)).slice().reverse();
  return boll.map(b => {
    const [, m] = b.al.split('-');
    return { label: mese3(parseInt(m)), f1: b.kwhF1 || 0, f2: b.kwhF2 || 0, f3: b.kwhF3 || 0, tot: b.kwhTot };
  });
};

// Ripartizione fasce media sulle ultime N bollette (per i riquadri).
export const ripartizioneFasce = (nUltime = 6) => {
  const boll = bolletteComplete().slice(0, nUltime);
  const f1 = boll.reduce((s, b) => s + (b.kwhF1 || 0), 0);
  const f2 = boll.reduce((s, b) => s + (b.kwhF2 || 0), 0);
  const f3 = boll.reduce((s, b) => s + (b.kwhF3 || 0), 0);
  const tot = f1 + f2 + f3 || 1;
  return {
    f1, f2, f3, tot,
    p1: Math.round(f1 / tot * 100), p2: Math.round(f2 / tot * 100), p3: Math.round(f3 / tot * 100),
  };
};

// Composizione della spesa di una bolletta (per il dettaglio).
export const composizioneBolletta = (b) => {
  const altro = _altroDi(b);
  const voci = [
    { nome: 'Materia energia', val: b.materia, colore: '#2E9BFF' },
    { nome: 'Trasporto/contatore', val: b.trasporto, colore: '#5FC3FF' },
    { nome: 'IVA', val: b.iva, colore: '#7B6CFF' },
    { nome: 'Oneri di sistema', val: b.oneri, colore: '#9D8FFF' },
    { nome: 'Accise', val: b.accise, colore: '#22E39A' },
    { nome: 'Canone TV', val: b.canone, colore: '#8B96AB' },
    { nome: 'Altro/sconti', val: Math.abs(altro) >= 0.01 ? altro : null, colore: '#535E72' },
  ].filter(v => v.val != null && v.val !== 0);
  const somma = voci.reduce((s, v) => s + Math.max(0, v.val), 0) || 1;
  return voci.map(v => ({ ...v, pct: Math.round(Math.max(0, v.val) / somma * 100) }));
};

// Statistiche globali (per eventuali insight).
export const statisticheGlobali = () => {
  const boll = bolletteComplete();
  return {
    nBollette: state.bollette.length,
    spesaTotale: round2(boll.reduce((s, b) => s + b.totale, 0)),
    consumoTotale: boll.reduce((s, b) => s + b.kwhTot, 0),
    fornitori: [...new Set(boll.map(b => b.fornitore))],
  };
};

const MESI3 = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export const mese3 = (m) => MESI3[m - 1] || '';

// Trova una bolletta per id.
export const bollettaById = (id) => state.bollette.find(b => b.id === id) || null;

// Numero di giorni tra due date ISO (inclusivo del giorno finale).
export const giorniTra = (dal, al) => {
  const d1 = new Date(dal), d2 = new Date(al);
  return Math.round((d2 - d1) / 86400000) + 1;
};

// Costruisce l'oggetto bolletta normalizzato dai dati del form (per il salvataggio).
// I KPI (€/kWh ecc.) NON si salvano: sono derivati e ricalcolati dal service.
export const componiBolletta = (d, idEsistente) => {
  const kwhF1 = d.kwhF1 || 0, kwhF2 = d.kwhF2 || 0, kwhF3 = d.kwhF3 || 0;
  const kwhTot = d.tariffa === 'Monoraria' && d.kwhTot ? d.kwhTot : (kwhF1 + kwhF2 + kwhF3);
  return {
    id: idEsistente || `${d.dal}_MAN_${Date.now().toString(36)}`,
    numero: d.numero || null,
    dal: d.dal, al: d.al,
    giorni: giorniTra(d.dal, d.al),
    fornitore: d.fornitore, offerta: d.offerta || null, tariffa: d.tariffa || 'Bioraria',
    kwhTot, kwhF1, kwhF2, kwhF3,
    totale: round2(d.totale),
    materia: d.materia != null ? round2(d.materia) : null,
    trasporto: d.trasporto != null ? round2(d.trasporto) : null,
    oneri: d.oneri != null ? round2(d.oneri) : null,
    accise: d.accise != null ? round2(d.accise) : null,
    iva: d.iva != null ? round2(d.iva) : null,
    canone: d.canone != null ? round2(d.canone) : null,
    bonus: null,
    altri: d.altri != null ? round2(d.altri) : null,
    completa: true,
    note: d.note || null,
    origine: 'manuale',
  };
};

// Elenco fornitori già usati (per l'autocompletamento nel form).
export const fornitoriUsati = () => [...new Set(state.bollette.map(b => b.fornitore).filter(Boolean))].sort();

// ─────────────────────────────────────────────────────────────────────────────
// Aggregazioni per la dashboard (grafici anno per anno, heatmap, fornitori)
// ─────────────────────────────────────────────────────────────────────────────

// Consumo per fasce ANNO PER ANNO (per le barre impilate della home).
// Ritorna [{ anno, f1, f2, f3, tot }] in ordine cronologico.
export const serieFasceAnnuale = () => {
  return anniDisponibili().slice().reverse().map(anno => {
    const agg = aggregatoAnno(anno);
    return { anno, f1: agg.fasce.f1, f2: agg.fasce.f2, f3: agg.fasce.f3, tot: agg.consumo };
  });
};

// Distribuisce i kWh di ogni bolletta sui mesi del periodo, in proporzione ai
// giorni: una bolletta bimestrale Apr–Mag da 323 kWh contribuisce a Aprile e a
// Maggio per la quota di giorni di ciascun mese. Serve a heatmap e viste mensili,
// perché le bollette non coincidono coi mesi di calendario.
const _distribuisciSuiMesi = (b, prendi) => {
  const out = [];   // [{ anno, mese(1-12), quota }]
  const val = prendi(b);
  if (val == null || !b.dal || !b.al) return out;
  const d1 = new Date(b.dal + 'T00:00:00'), d2 = new Date(b.al + 'T00:00:00');
  const totGiorni = Math.round((d2 - d1) / 86400000) + 1;
  if (totGiorni <= 0) return out;
  let cur = new Date(d1);
  while (cur <= d2) {
    const anno = cur.getFullYear(), mese = cur.getMonth();
    const fineMese = new Date(anno, mese + 1, 0);
    const fine = fineMese < d2 ? fineMese : d2;
    const giorniNelMese = Math.round((fine - cur) / 86400000) + 1;
    out.push({ anno: String(anno), mese: mese + 1, quota: val * giorniNelMese / totGiorni });
    cur = new Date(anno, mese + 1, 1);
  }
  return out;
};

// Heatmap consumi: matrice { anni: [..], celle: { 'anno-mese': kWh }, max }.
// kWh mensili ottenuti ripartendo le bollette sui mesi (vedi sopra).
export const heatmapConsumi = () => {
  const celle = {};
  for (const b of bolletteComplete()) {
    for (const q of _distribuisciSuiMesi(b, x => x.kwhTot)) {
      const k = `${q.anno}-${q.mese}`;
      celle[k] = (celle[k] || 0) + q.quota;
    }
  }
  Object.keys(celle).forEach(k => { celle[k] = Math.round(celle[k]); });
  const anni = anniDisponibili().slice().reverse();
  const max = Math.max(1, ...Object.values(celle));
  return { anni, celle, max };
};

// Voci di costo di una bolletta (chiave, etichetta, colore) — ordine e palette
// unici per scomposizioni e dettaglio. 'altro' è DERIVATA: totale − voci note
// (ingloba bonus/sconti, altri importi e ricalcoli), così la somma dei segmenti
// coincide SEMPRE con la spesa reale e i totali quadrano con le card.
export const VOCI_COSTO = [
  { k: 'materia', nome: 'Materia energia', colore: '#2E9BFF' },
  { k: 'trasporto', nome: 'Trasporto', colore: '#5FC3FF' },
  { k: 'oneri', nome: 'Oneri', colore: '#9D8FFF' },
  { k: 'accise', nome: 'Accise', colore: '#22E39A' },
  { k: 'iva', nome: 'IVA', colore: '#7B6CFF' },
  { k: 'canone', nome: 'Canone TV', colore: '#8B96AB' },
  { k: 'altro', nome: 'Altro', colore: '#535E72' },
];

// 'altro' della singola bolletta = totale − tutte le voci note (canone incluso).
// Include bonus (negativi), altri importi e residui di arrotondamento.
const _altroDi = (b) => {
  const note = (b.materia || 0) + (b.trasporto || 0) + (b.oneri || 0) + (b.accise || 0) + (b.iva || 0) + (b.canone || 0);
  return round2((b.totale || 0) - note);
};
const _voceDi = (b, k) => k === 'altro' ? _altroDi(b) : (b[k] || 0);

// Scomposizione delle voci di costo ANNO PER ANNO (barre impilate in €).
// tot = SPESA REALE dell'anno (somma bollette): quadra con le card KPI.
export const scomposizioneCostiAnnuale = () => {
  return anniDisponibili().slice().reverse().map(anno => {
    const boll = bolletteComplete().filter(b => (b.al || '').startsWith(anno));
    const r = { anno };
    for (const { k } of VOCI_COSTO) r[k] = round2(boll.reduce((s, b) => s + _voceDi(b, k), 0));
    r.tot = round2(boll.reduce((s, b) => s + b.totale, 0));
    return r;
  });
};

// Scomposizione voci di costo MESE PER MESE di un anno (per la pagina Riepilogo).
// Le bollette a cavallo di due mesi vengono ripartite in proporzione ai giorni.
export const scomposizioneCostiMensile = (anno) => {
  const mesi = Array.from({ length: 12 }, (_, i) => {
    const r = { mese: i + 1, label: mese3(i + 1), tot: 0 };
    for (const { k } of VOCI_COSTO) r[k] = 0;
    return r;
  });
  for (const b of bolletteComplete()) {
    for (const { k } of VOCI_COSTO) {
      for (const q of _distribuisciSuiMesi(b, x => _voceDi(x, k))) {
        if (q.anno === String(anno)) mesi[q.mese - 1][k] += q.quota;
      }
    }
  }
  for (const m of mesi) {
    for (const { k } of VOCI_COSTO) m[k] = round2(m[k]);
    m.tot = round2(VOCI_COSTO.reduce((s, { k }) => s + m[k], 0));
  }
  return mesi.filter(m => m.tot > 0);
};

// Consumo per fasce MESE PER MESE di un anno (per la pagina Riepilogo),
// con ripartizione a giorni delle bollette a cavallo.
export const serieFasceMensile = (anno) => {
  const mesi = Array.from({ length: 12 }, (_, i) => ({ mese: i + 1, label: mese3(i + 1), f1: 0, f2: 0, f3: 0, tot: 0 }));
  for (const b of bolletteComplete()) {
    for (const [campo, dest] of [['kwhF1', 'f1'], ['kwhF2', 'f2'], ['kwhF3', 'f3']]) {
      for (const q of _distribuisciSuiMesi(b, x => x[campo])) {
        if (q.anno === String(anno)) mesi[q.mese - 1][dest] += q.quota;
      }
    }
  }
  for (const m of mesi) {
    m.f1 = Math.round(m.f1); m.f2 = Math.round(m.f2); m.f3 = Math.round(m.f3);
    m.tot = m.f1 + m.f2 + m.f3;
  }
  return mesi.filter(m => m.tot > 0);
};

// Confronto fornitori: €/kWh medio (tutto compreso), consumo, spesa, periodo.
// Ordinato dal più economico. Per decidere se il fornitore attuale conviene.
export const confrontoFornitori = () => {
  const per = {};
  for (const b of bolletteComplete()) {
    const f = b.fornitore || '?';
    per[f] = per[f] || { fornitore: f, spesa: 0, kwh: 0, n: 0, dal: b.al, al: b.al };
    per[f].spesa += b.totale; per[f].kwh += b.kwhTot; per[f].n++;
    if (b.dal < per[f].dal) per[f].dal = b.dal;
    if (b.al > per[f].al) per[f].al = b.al;
  }
  return Object.values(per)
    .filter(f => f.kwh > 0)
    .map(f => ({ ...f, spesa: round2(f.spesa), eurKwh: Math.round(f.spesa / f.kwh * 1000) / 1000 }))
    .sort((a, b) => a.eurKwh - b.eurKwh);
};
