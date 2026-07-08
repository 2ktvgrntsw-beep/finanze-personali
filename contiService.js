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
  const voci = [
    { nome: 'Materia energia', val: b.materia, colore: '#2E9BFF' },
    { nome: 'Trasporto/contatore', val: b.trasporto, colore: '#5FC3FF' },
    { nome: 'IVA', val: b.iva, colore: '#7B6CFF' },
    { nome: 'Oneri di sistema', val: b.oneri, colore: '#9D8FFF' },
    { nome: 'Accise', val: b.accise, colore: '#22E39A' },
  ].filter(v => v.val != null && v.val > 0);
  const somma = voci.reduce((s, v) => s + v.val, 0) || 1;
  return voci.map(v => ({ ...v, pct: Math.round(v.val / somma * 100) }));
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
    completa: true,
    note: d.note || null,
    origine: 'manuale',
  };
};

// Elenco fornitori già usati (per l'autocompletamento nel form).
export const fornitoriUsati = () => [...new Set(state.bollette.map(b => b.fornitore).filter(Boolean))].sort();
