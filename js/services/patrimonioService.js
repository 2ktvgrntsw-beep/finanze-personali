// patrimonioService.js — Calcolo del patrimonio netto e della sua composizione.

import { dbAdd } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid, round2, annomese, todayISO } from '../core/utils.js';
import { saldoStimato, contiPerTipo } from './contiService.js';
import { debitoTotaleResiduo } from './prestitiService.js';

// Composizione delle attività per tipologia (liquidita/risparmio/investimenti/asset)
export const composizioneAttivita = () => {
  const perTipo = contiPerTipo();
  const out = [];
  for (const tipo of ['asset', 'investimenti', 'risparmio', 'liquidita']) {
    const conti = perTipo[tipo] || [];
    if (!conti.length) continue;
    const totale = round2(conti.reduce((s, c) => s + saldoStimato(c), 0));
    out.push({ tipo, totale, conti });
  }
  return out;
};

export const totaleAttivita = () => composizioneAttivita().reduce((s, r) => s + r.totale, 0);
export const totalePassivita = () => debitoTotaleResiduo();

export const patrimonioNetto = () => round2(totaleAttivita() - totalePassivita());

// --- Snapshot mensili (per il delta e lo storico patrimoniale) ---
export const salvaSnapshotMese = async () => {
  const am = annomese(todayISO());
  const netto = patrimonioNetto();
  await dbAdd('snapshot', {
    id: am,                    // uno per mese (sovrascrive se rieseguito nello stesso mese)
    annomese: am,
    data: todayISO(),
    netto,
    attivita: round2(totaleAttivita()),
    passivita: round2(totalePassivita()),
  });
  await refreshAll();
};

export const snapshotMeseMancante = () => {
  const am = annomese(todayISO());
  return !state.snapshot.some(s => s.annomese === am);
};

// Delta del netto rispetto allo snapshot del mese precedente (se esiste)
export const deltaNettoMese = () => {
  if (!state.snapshot.length) return null;
  const ordinati = [...state.snapshot].sort((a, b) => a.annomese.localeCompare(b.annomese));
  const ultimo = ordinati[ordinati.length - 1];
  const nettoAttuale = patrimonioNetto();
  return round2(nettoAttuale - ultimo.netto);
};
