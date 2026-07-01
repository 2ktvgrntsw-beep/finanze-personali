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

// Serie storica del patrimonio per il grafico a linea.
// Combina due fonti, distinte visivamente:
//  - STIMA: ricostruita a ritroso dai movimenti (entrate - uscite), a partire dal netto
//    attuale, per avere una linea storica già popolata fin dal primo giorno.
//  - REALE: gli snapshot mensili effettivamente salvati dall'utente ("rilevazioni").
// Ritorna { punti: [{annomese, valore, stima}], primoReale }.
export const serieStoricoPatrimonio = () => {
  const nettoOggi = patrimonioNetto();

  // flusso netto (entrate - spese; i trasferimenti sono interni e non cambiano il netto)
  // per mese, dai movimenti
  const flussoMese = {};
  for (const m of state.movimenti) {
    const am = m.annomese || m.data.slice(0, 7);
    if (m.tipo === 'entrata') flussoMese[am] = (flussoMese[am] || 0) + m.imp;
    else if (m.tipo === 'spesa') flussoMese[am] = (flussoMese[am] || 0) - m.imp;
  }
  const mesi = Object.keys(flussoMese).sort();
  if (!mesi.length) return { punti: [], primoReale: null };

  // ricostruzione a ritroso: parto da oggi e sottraggo i flussi mese per mese
  const meseCorrente = new Date().toISOString().slice(0, 7);
  const stima = {};
  let valore = nettoOggi;
  // assicura che il mese corrente sia incluso
  const tuttiMesi = Array.from(new Set([...mesi, meseCorrente])).sort();
  for (let i = tuttiMesi.length - 1; i >= 0; i--) {
    const am = tuttiMesi[i];
    stima[am] = round2(valore);
    // togliendo il flusso di questo mese ottengo il valore di fine mese precedente
    valore = valore - (flussoMese[am] || 0);
  }

  // snapshot reali
  const realeByMese = {};
  for (const s of state.snapshot) realeByMese[s.annomese] = s.netto;
  const primoReale = Object.keys(realeByMese).sort()[0] || null;

  // costruisci i punti: usa il reale dove esiste, altrimenti la stima
  const punti = tuttiMesi.map(am => ({
    annomese: am,
    valore: realeByMese[am] !== undefined ? realeByMese[am] : stima[am],
    stima: realeByMese[am] === undefined,
  }));

  return { punti, primoReale };
};
