// ritmoService.js — Il ritmo di spesa del mese, giorno per giorno.
//
// Risponde a "questo mese come sto andando rispetto al solito?" confrontando la spesa
// accumulata giorno per giorno con quella dei mesi passati ALLO STESSO PUNTO DEL MESE.
// Non una retta: se il mutuo parte il 1°, il mese tipico è già alto il giorno 2, e il
// confronto lineare (media × giorni/30) ti farebbe sembrare in sforamento ogni inizio mese.
//
// Il mese tipico è la MEDIANA degli ultimi 12 mesi chiusi, come baselineSpeseMensile:
// a fine mese le due coincidono, quindi grafico e riquadro non possono contraddirsi.

import { state, movimentiDelMese } from '../core/store.js';
import { round2, todayISO } from '../core/utils.js';

const FINESTRA_MESI = 12;

export const giorniDelMese = (am) => { const [a, m] = am.split('-').map(Number); return new Date(a, m, 0).getDate(); };
const mesePrima = (am) => { const [a, m] = am.split('-').map(Number); const d = new Date(a, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const quantile = (ordinati, q) => {
  if (!ordinati.length) return 0;
  const pos = (ordinati.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return ordinati[lo] + (ordinati[hi] - ordinati[lo]) * (pos - lo);
};

// Spesa accumulata giorno per giorno: [i] = speso dal 1° al giorno i+1.
// `finoA`: le spese datate dopo quel giorno (già inserite, es. un addebito programmato)
// contano su quel giorno, così il totale coincide sempre con quello del riquadro sopra.
export const cumulatoMese = (am, filtro = () => true, finoA = Infinity) => {
  const g = giorniDelMese(am), perGiorno = new Array(g).fill(0);
  for (const m of movimentiDelMese(am)) {
    if (m.tipo !== 'spesa' || !filtro(m)) continue;
    perGiorno[Math.min(parseInt(m.data.slice(8, 10), 10), finoA) - 1] += m.imp;
  }
  let s = 0;
  return perGiorno.map(v => (s += v));
};

// Valore del cumulato di un altro mese allo stesso PUNTO del mese (giorno 15 di 30 ->
// giorno 14 di 28): così febbraio e i mesi da 31 giorni si confrontano alla pari.
const allineato = (cum, giorno, giorniRif) =>
  cum[Math.min(cum.length, Math.max(1, Math.round(giorno * cum.length / giorniRif))) - 1];

// Mesi di riferimento: gli ultimi 12 mesi CHIUSI (prima di meseRif) con almeno una spesa.
const mesiRiferimento = (meseRif) => {
  const mesi = new Set();
  for (const m of state.movimenti) if (m.tipo === 'spesa' && m.annomese < meseRif) mesi.add(m.annomese);
  return [...mesi].sort().slice(-FINESTRA_MESI);
};

// Giorno "oggi" dentro meseRif: il giorno corrente se è il mese in corso, l'ultimo
// giorno se è un mese passato, 0 se è un mese futuro.
export const giornoDentro = (meseRif, oggi = todayISO()) => {
  const am = oggi.slice(0, 7);
  if (meseRif < am) return giorniDelMese(meseRif);
  if (meseRif > am) return 0;
  return parseInt(oggi.slice(8, 10), 10);
};

export const ritmoMese = (meseRif, oggi = todayISO()) => {
  const giorni = giorniDelMese(meseRif);
  const giorno = giornoDentro(meseRif, oggi);
  const cumulato = giorno ? cumulatoMese(meseRif, undefined, giorno).slice(0, giorno) : [];
  const rif = mesiRiferimento(meseRif).map(am => cumulatoMese(am));
  const tipico = [], p25 = [], p75 = [];
  for (let d = 1; d <= giorni; d++) {
    const v = rif.map(c => allineato(c, d, giorni)).sort((a, b) => a - b);
    tipico.push(round2(quantile(v, 0.5))); p25.push(round2(quantile(v, 0.25))); p75.push(round2(quantile(v, 0.75)));
  }
  const precC = cumulatoMese(mesePrima(meseRif));
  const precedente = precC[precC.length - 1] > 0
    ? Array.from({ length: giorni }, (_, i) => allineato(precC, i + 1, giorni)) : null;

  const speso = giorno ? cumulato[giorno - 1] : 0;
  const tipicoAOggi = giorno ? tipico[giorno - 1] : 0;
  const tipicoFine = tipico[giorni - 1] || 0;
  // proiezione: quello che hai speso + quello che di solito spendi da qui a fine mese
  const proiezione = round2(speso + Math.max(0, tipicoFine - tipicoAOggi));
  return { giorni, giorno, cumulato, tipico, p25, p75, precedente, speso: round2(speso),
    tipicoAOggi, tipicoFine, proiezione, nMesiRif: rif.length, chiuso: giorno === giorni };
};
