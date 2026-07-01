// prestitiService.js — Mutuo e finanziamenti: piano di ammortamento e stato attuale.
// Ammortamento alla francese (rata costante). Il residuo debito serve al Patrimonio;
// la rata mensile appare come spesa nella home.

import { dbAdd, dbDelete, dbBulkPut } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid, round2 } from '../core/utils.js';

// Calcola il piano di ammortamento completo di un prestito (mutuo o finanziamento).
export const calcolaPiano = (p, eventi = []) => {
  const rate = [];
  const tassoMensile = (p.tasso / 100) / 12;
  let residuo = p.importo_iniziale;
  const start = new Date(p.data_inizio + 'T00:00:00');

  // eventi di estinzione parziale indicizzati per data
  const estinzioni = eventi.filter(e => e.tipo === 'estinzione_parziale');

  for (let i = 1; i <= p.durata_mesi && residuo > 0.005; i++) {
    const dataRata = new Date(start); dataRata.setMonth(dataRata.getMonth() + i);
    const interessi = tassoMensile > 0 ? residuo * tassoMensile : 0;
    let capitale = p.rata - interessi;
    if (capitale > residuo) capitale = residuo;
    residuo = residuo - capitale;

    // applica estinzioni avvenute in questo mese
    for (const est of estinzioni) {
      const de = new Date(est.data + 'T00:00:00');
      if (de.getFullYear() === dataRata.getFullYear() && de.getMonth() === dataRata.getMonth()) {
        residuo = Math.max(0, residuo - (est.importo || 0));
      }
    }

    const oggi = new Date();
    rate.push({
      n: i,
      data: dataRata.toISOString().slice(0, 10),
      rata: round2(p.rata),
      quotaCapitale: round2(capitale),
      quotaInteressi: round2(interessi),
      residuo: round2(residuo),
      pagata: dataRata <= oggi,
    });
  }
  return rate;
};

// Stato attuale sintetico del prestito
export const statoPrestito = (p, eventi = []) => {
  if (!p || !p.importo_iniziale) return null;
  const piano = calcolaPiano(p, eventi);
  if (!piano.length) return null;
  const oggi = new Date();
  const pagate = piano.filter(r => r.pagata);
  const prossima = piano.find(r => !r.pagata);
  const residuo = pagate.length ? pagate[pagate.length - 1].residuo : p.importo_iniziale;
  const restituito = round2(p.importo_iniziale - residuo);
  const pct = Math.round((restituito / p.importo_iniziale) * 100);

  return {
    piano,
    rata: round2(p.rata),
    quotaUtente: round2(p.rata * (p.quota_utente || 100) / 100),
    residuo: round2(residuo),
    restituito,
    ratePagate: pagate.length,
    rateTotali: piano.length,
    prossimaData: prossima ? prossima.data : null,
    dataFine: piano[piano.length - 1].data,
    pctCompletamento: pct,
  };
};

// Somma dei debiti residui (mutuo + finanziamenti) per il patrimonio
export const debitoTotaleResiduo = () => {
  let tot = 0;
  if (state.mutuo) {
    const s = statoPrestito(state.mutuo, state.eventiMutuo);
    if (s) tot += s.residuo * (state.mutuo.quota_utente || 100) / 100;
  }
  for (const f of state.finanziamenti) {
    if (f.attivo === false) continue;
    const s = statoPrestito(f, []);
    if (s) tot += s.residuo * (f.quota_utente || 100) / 100;
  }
  return round2(tot);
};

// --- Salvataggi ---
export const saveMutuo = async (m) => {
  await dbAdd('mutuo', { id: 'mutuo-principale', ...m });
  await refreshAll();
};
export const saveFinanziamento = async (f) => {
  const obj = { id: f.id || 'fin-' + uid(), ...f, attivo: f.attivo !== false };
  await dbAdd('finanziamenti', obj);
  await refreshAll();
  return obj;
};
export const deleteFinanziamento = async (id) => { await dbDelete('finanziamenti', id); await refreshAll(); };

export const saveEventoMutuo = async (ev) => {
  await dbAdd('eventiMutuo', { id: ev.id || uid(), ...ev });
  await refreshAll();
};
export const deleteEventoMutuo = async (id) => { await dbDelete('eventiMutuo', id); await refreshAll(); };
export const eventiMutuo = () => state.eventiMutuo.filter(e => e.riferimento === 'mutuo-principale' || !e.riferimento);
