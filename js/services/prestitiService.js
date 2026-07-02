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

  const [sy, sm, sg] = p.data_inizio.split('-').map(Number);
  // giorno delle rate successive alla prima: il giorno di addebito se impostato,
  // altrimenti il giorno della data di inizio (la prima rata cade sempre alla data di inizio)
  const giornoRata = p.giorno_addebito || sg;

  for (let i = 1; i <= p.durata_mesi && residuo > 0.005; i++) {
    // ogni rata è calcolata DALLA DATA DI INIZIO (mese di partenza + i-1), preservando
    // il giorno voluto, o l'ultimo giorno del mese se non esiste (31 -> 28 feb).
    const mesiTot = sm - 1 + (i - 1);
    const anno = sy + Math.floor(mesiTot / 12);
    const mese = (mesiTot % 12) + 1;
    const maxG = new Date(anno, mese, 0).getDate();
    const giorno = i === 1 ? sg : giornoRata;
    const dataRata = new Date(anno, mese - 1, Math.min(giorno, maxG));
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
  const obj = { id: 'mutuo-principale', ...m };
  await dbAdd('mutuo', obj);
  await refreshAll();
  await sincronizzaRicorrenzaPrestito(obj, 'mutuo');
  return obj;
};
export const saveFinanziamento = async (f) => {
  const obj = { id: f.id || 'fin-' + uid(), ...f, attivo: f.attivo !== false };
  await dbAdd('finanziamenti', obj);
  await refreshAll();
  await sincronizzaRicorrenzaPrestito(obj, 'finanziamento');
  return obj;
};
export const deleteFinanziamento = async (id) => {
  await dbDelete('finanziamenti', id);
  // rimuovi anche la ricorrenza collegata
  const { dbAll: _all, dbDelete: _del } = await import('../core/db.js');
  const ric = await _all('ricorrenti');
  for (const r of ric) if (r.origineMutuo === id) await _del('ricorrenti', r.id);
  await refreshAll();
};

// Crea/aggiorna la ricorrenza della rata di un prestito.
// REGOLA D'ORO: genera movimenti solo dal presente in avanti. Il passato è già coperto
// dai movimenti reali nello storico (riconosciuti tramite sottocategoria, es. "Rata Mutuo").
export const sincronizzaRicorrenzaPrestito = async (prestito, tipo) => {
  const { dbAll: _all, dbAdd: _add, dbDelete: _del } = await import('../core/db.js');
  const rif = tipo === 'mutuo' ? 'mutuo-principale' : prestito.id;

  // trova una eventuale ricorrenza già collegata (per id di origine).
  const tutte = await _all('ricorrenti');
  const esistente = tutte.find(r => r.origineMutuo === rif);

  // se il prestito non deve generare ricorrenza, rimuovi quella collegata e basta
  if (prestito.generaRicorrenza === false) {
    if (esistente) { await _del('ricorrenti', esistente.id); await refreshAll(); }
    return;
  }

  const piano = calcolaPiano(prestito, tipo === 'mutuo' ? (await _all('eventiMutuo')) : []);
  const oggiISO = new Date().toISOString().slice(0, 10);
  const prossimaRata = piano.find(r => r.data >= oggiISO);
  if (!prossimaRata) {
    // prestito concluso: la ricorrenza muore
    if (esistente) await _del('ricorrenti', esistente.id);
    await refreshAll();
    return;
  }

  const rec = {
    id: esistente ? esistente.id : uid(),
    nome: prestito.descMovimento || prestito.nome,
    tipo: 'spesa',
    frequenza: 'mensile',
    giorno: prestito.giorno_addebito || null,
    imp: round2(prestito.rata * (prestito.quota_utente || 100) / 100),   // rata per la TUA quota
    macro: prestito.macro || 'Casa',
    cat: prestito.cat || '',
    sub: prestito.sub || (tipo === 'mutuo' ? 'Rata Mutuo' : ''),
    conto: prestito.conto || '',
    contoDest: '',
    tag: [],
    desc: prestito.descMovimento || '',
    modalita: 'fisso', soglia: null, isRegola: false,
    attiva: true,
    // PRESERVA lo stato di generazione se la ricorrenza esisteva già: altrimenti
    // ad ogni salvataggio rigenererebbe i movimenti già creati (doppioni).
    dataInizio: esistente ? esistente.dataInizio : prossimaRata.data,
    prossima: esistente ? esistente.prossima : prossimaRata.data,
    fineTipo: 'data',
    fineData: piano[piano.length - 1].data,
    fineConteggio: null,
    generati: esistente ? (esistente.generati || 0) : 0,
    origineMutuo: rif,
  };
  await _add('ricorrenti', rec);
  await refreshAll();
};

export const saveEventoMutuo = async (ev) => {
  await dbAdd('eventiMutuo', { id: ev.id || uid(), ...ev });
  await refreshAll();
};
export const deleteEventoMutuo = async (id) => { await dbDelete('eventiMutuo', id); await refreshAll(); };
export const eventiMutuo = () => state.eventiMutuo.filter(e => e.riferimento === 'mutuo-principale' || !e.riferimento);

// Sincronizza le ricorrenze delle rate di TUTTI i prestiti (mutuo + finanziamenti).
// Chiamata all'avvio dell'app. Usa sincronizzaRicorrenzaPrestito, che rispetta la
// regola d'oro (solo dal presente in avanti, niente doppioni col passato).
export const sincronizzaPrestiti = async () => {
  // DEDUP DI SICUREZZA: se per un bug passato un prestito ha più ricorrenze
  // collegate (stesso origineMutuo), tengo la prima ed elimino le altre.
  const { dbAll: _all, dbDelete: _del } = await import('../core/db.js');
  const tutte = await _all('ricorrenti');
  const viste = new Map();
  for (const r of tutte) {
    if (!r.origineMutuo) continue;
    if (viste.has(r.origineMutuo)) await _del('ricorrenti', r.id);
    else viste.set(r.origineMutuo, r.id);
  }

  if (state.mutuo && state.mutuo.importo_iniziale && state.mutuo.generaRicorrenza !== false) {
    await sincronizzaRicorrenzaPrestito(state.mutuo, 'mutuo');
  }
  for (const f of state.finanziamenti) {
    if (f.attivo === false || !f.importo_iniziale || f.generaRicorrenza === false) continue;
    await sincronizzaRicorrenzaPrestito(f, 'finanziamento');
  }
};
