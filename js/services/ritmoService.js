// ritmoService.js — Il ritmo di spesa del mese e dell'anno, giorno per giorno.
//
// Risponde a "come sto andando rispetto al solito?" confrontando la spesa accumulata
// giorno per giorno con quella dei periodi passati ALLO STESSO PUNTO DEL PERIODO.
// Non una retta: se il mutuo parte il 1°, il mese tipico è già alto il giorno 2, e il
// confronto lineare (media × giorni/30) ti farebbe sembrare in sforamento ogni inizio mese.
//
// Il periodo è un mese ('AAAA-MM') o un anno ('AAAA'); la logica è la stessa.
//  · mese tipico = MEDIANA degli ultimi 12 mesi chiusi, come baselineSpeseMensile: a
//    fine mese le due coincidono, quindi grafico e riquadro non possono contraddirsi;
//  · anno tipico = MEDIANA degli ultimi 5 anni chiusi e completi (il primo anno di dati,
//    se non parte da gennaio, è un anno a metà e non fa da riferimento).
//
// LE UNA TANTUM (tag 'una tantum', lo stesso del Bilancio) restano nella linea del
// periodo che stai guardando — sono soldi usciti davvero, e il totale deve coincidere col
// riquadro sopra — ma escono dai periodi di RIFERIMENTO: il "solito" deve descrivere come
// vivi, non l'anno in cui hai saldato l'auto. Per la stessa ragione la proiezione non le
// ripete: quello che di solito resta da spendere non contiene un altro saldo.

import { state, movimentiDelMese } from '../core/store.js';
import { round2, todayISO } from '../core/utils.js';
import { eUnaTantum } from './movimentiService.js';

const FINESTRA_MESI = 12;
const FINESTRA_ANNI = 5;

const eAnno = (p) => p.length === 4;
const bisestile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
export const giorniDelMese = (am) => { const [a, m] = am.split('-').map(Number); return new Date(a, m, 0).getDate(); };
export const giorniDel = (p) => (eAnno(p) ? (bisestile(Number(p)) ? 366 : 365) : giorniDelMese(p));
const mesePrima = (am) => { const [a, m] = am.split('-').map(Number); const d = new Date(a, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const periodoPrima = (p) => (eAnno(p) ? String(Number(p) - 1) : mesePrima(p));
const periodoDi = (data, p) => (eAnno(p) ? data.slice(0, 4) : data.slice(0, 7));

// Giorno della data dentro il periodo: 1-31 per un mese, 1-366 per un anno (in UTC,
// così il cambio dell'ora legale non sposta nessun giorno).
const giornoDi = (data, p) => {
  if (!eAnno(p)) return parseInt(data.slice(8, 10), 10);
  const [a, m, g] = data.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, g) - Date.UTC(a, 0, 1)) / 86400000) + 1;
};
const movimentiDel = (p) => (eAnno(p)
  ? Array.from({ length: 12 }, (_, i) => movimentiDelMese(`${p}-${String(i + 1).padStart(2, '0')}`)).flat()
  : movimentiDelMese(p));

const quantile = (ordinati, q) => {
  if (!ordinati.length) return 0;
  const pos = (ordinati.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return ordinati[lo] + (ordinati[hi] - ordinati[lo]) * (pos - lo);
};

// Spesa accumulata giorno per giorno: [i] = speso dal 1° giorno del periodo al giorno i+1.
// `finoA`: le spese datate dopo quel giorno (già inserite, es. un addebito programmato)
// contano su quel giorno, così il totale coincide sempre con quello del riquadro sopra.
export const cumulatoPeriodo = (p, filtro = () => true, finoA = Infinity) => {
  const g = giorniDel(p), perGiorno = new Array(g).fill(0);
  for (const m of movimentiDel(p)) {
    if (m.tipo !== 'spesa' || !filtro(m)) continue;
    perGiorno[Math.min(giornoDi(m.data, p), finoA) - 1] += m.imp;
  }
  let s = 0;
  return perGiorno.map(v => (s += v));
};
export const cumulatoMese = cumulatoPeriodo;

// Valore del cumulato di un altro periodo allo stesso PUNTO (giorno 15 di 30 -> giorno
// 14 di 28): così febbraio e i mesi da 31 giorni, o gli anni bisestili, si confrontano
// alla pari.
const allineato = (cum, giorno, giorniRif) =>
  cum[Math.min(cum.length, Math.max(1, Math.round(giorno * cum.length / giorniRif))) - 1];

// Periodi di riferimento: gli ultimi 12 mesi (o 5 anni) CHIUSI prima di p con almeno una
// spesa. Per gli anni resta fuori il primo, se i dati non partono da gennaio.
const periodiRiferimento = (p) => {
  const visti = new Set();
  let primo = null;
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    if (!primo || m.data < primo) primo = m.data;
    const q = periodoDi(m.data, p);
    if (q < p) visti.add(q);
  }
  let lista = [...visti].sort();
  if (eAnno(p) && primo && primo.slice(5, 10) > '01-31') lista = lista.filter(a => a !== primo.slice(0, 4));
  return lista.slice(-(eAnno(p) ? FINESTRA_ANNI : FINESTRA_MESI));
};

// Giorno "oggi" dentro il periodo: quello corrente se il periodo è in corso, l'ultimo
// se è passato, 0 se è futuro.
export const giornoDentro = (p, oggi = todayISO()) => {
  const attuale = periodoDi(oggi, p);
  if (p < attuale) return giorniDel(p);
  if (p > attuale) return 0;
  return giornoDi(oggi, p);
};

const ordinario = (m) => !eUnaTantum(m);

export const ritmoPeriodo = (p, oggi = todayISO()) => {
  const giorni = giorniDel(p);
  const giorno = giornoDentro(p, oggi);
  const cumulato = giorno ? cumulatoPeriodo(p, undefined, giorno).slice(0, giorno) : [];
  const unaTantum = giorno ? round2(cumulatoPeriodo(p, eUnaTantum, giorno)[giorno - 1]) : 0;
  const rif = periodiRiferimento(p).map(q => cumulatoPeriodo(q, ordinario));
  const tipico = [], p25 = [], p75 = [];
  for (let d = 1; d <= giorni; d++) {
    const v = rif.map(c => allineato(c, d, giorni)).sort((a, b) => a - b);
    tipico.push(round2(quantile(v, 0.5))); p25.push(round2(quantile(v, 0.25))); p75.push(round2(quantile(v, 0.75)));
  }
  const precC = cumulatoPeriodo(periodoPrima(p), ordinario);
  const precedente = precC[precC.length - 1] > 0
    ? Array.from({ length: giorni }, (_, i) => allineato(precC, i + 1, giorni)) : null;

  const speso = giorno ? cumulato[giorno - 1] : 0;
  const tipicoAOggi = giorno ? tipico[giorno - 1] : 0;
  const tipicoFine = tipico[giorni - 1] || 0;
  // proiezione: quello che hai speso + quello che di solito spendi da qui a fine periodo
  const proiezione = round2(speso + Math.max(0, tipicoFine - tipicoAOggi));
  return { periodo: p, anno: eAnno(p), giorni, giorno, cumulato, tipico, p25, p75, precedente,
    speso: round2(speso), unaTantum, tipicoAOggi, tipicoFine, proiezione,
    nRif: rif.length, nMesiRif: rif.length, chiuso: giorno === giorni };
};

export const ritmoMese = (am, oggi) => ritmoPeriodo(am, oggi);
export const ritmoAnno = (anno, oggi) => ritmoPeriodo(String(anno), oggi);
