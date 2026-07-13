// panieriService.js — Panieri di voci per l'analisi pluriennale.
// Un paniere è un insieme di voci {macro, cat?, sub?} (es. "Auto" = macro Trasporti
// > Carburante + Assicurazione + Bollo). Le somme considerano le SPESE.
// REGOLA ANTI-DOPPIO CONTEGGIO: ogni movimento è attribuito alla PRIMA voce del
// paniere che lo matcha, nell'ordine di selezione. Così un paniere con
// "Trasporti" (macro intera) + "Trasporti > Carburante" non conta due volte.

import { state } from '../core/store.js';
import { round2 } from '../core/utils.js';

// palette ciclica per i segmenti del grafico (coerente col design cockpit)
export const COLORI_PANIERE = ['#2E9BFF', '#22E39A', '#7B6CFF', '#FFB020', '#5FC3FF', '#FF3B5C', '#9D8FFF', '#C9D3E3'];

export const etichettaVoce = (v) =>
  [v.macro, v.cat, v.sub].filter(Boolean).join(' › ');

// il movimento appartiene alla voce? (macro obbligatoria, cat/sub se presenti)
const _matchVoce = (m, v) => {
  if (m.macro !== v.macro) return false;
  if (v.cat && m.cat !== v.cat) return false;
  if (v.sub && m.sub !== v.sub) return false;
  return true;
};

// indice della prima voce che matcha (-1 = fuori paniere)
const _voceDi = (m, voci) => {
  for (let i = 0; i < voci.length; i++) if (_matchVoce(m, voci[i])) return i;
  return -1;
};

// Somma del paniere per un anno: { tot, perVoce: [x0, x1, ...], nMov }
export const sommaPaniere = (voci, anno) => {
  const perVoce = voci.map(() => 0);
  let nMov = 0;
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    if (!m.data.startsWith(String(anno))) continue;
    const i = _voceDi(m, voci);
    if (i === -1) continue;
    perVoce[i] += m.imp; nMov++;
  }
  return { tot: round2(perVoce.reduce((a, b) => a + b, 0)), perVoce: perVoce.map(round2), nMov };
};

// Serie pluriennale del paniere, pronta per le barre impilate:
// [{ anno, label, valori: {v0: x, v1: y, ...}, tot }] in ordine cronologico.
export const seriePaniereAnnuale = (voci) => {
  const perAnno = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    const i = _voceDi(m, voci);
    if (i === -1) continue;
    const anno = m.data.slice(0, 4);
    if (!perAnno[anno]) perAnno[anno] = voci.map(() => 0);
    perAnno[anno][i] += m.imp;
  }
  return Object.keys(perAnno).sort().map(anno => {
    const valori = {};
    perAnno[anno].forEach((v, i) => { valori['v' + i] = round2(v); });
    return { anno, label: `'${anno.slice(2)}`, valori, tot: round2(perAnno[anno].reduce((a, b) => a + b, 0)) };
  });
};

// segmenti per _barreImpilate a partire dalle voci del paniere
export const segmentiPaniere = (voci) => voci.map((v, i) => ({
  k: 'v' + i,
  nome: etichettaVoce(v),
  colore: COLORI_PANIERE[i % COLORI_PANIERE.length],
}));
