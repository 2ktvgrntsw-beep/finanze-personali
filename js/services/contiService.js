// contiService.js — Gestione conti e calcolo saldi.
// Il saldo di un conto = saldo_iniziale (a una certa data) + tutti i movimenti su quel
// conto successivi. Così l'utente imposta il saldo una volta e l'app lo aggiorna da sé
// man mano che assegna spese/entrate/trasferimenti a quel conto.

import { dbAdd, dbDelete, dbBulkPut } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid, round2, todayISO } from '../core/utils.js';
import { versatoConto, strumentiDelConto } from './strumentiService.js';

export const TIPI_CONTO = ['liquidita', 'risparmio', 'investimenti', 'asset', 'debiti'];
export const LABEL_TIPO = {
  liquidita: 'Liquidità', risparmio: 'Risparmio', investimenti: 'Investimenti',
  asset: 'Asset', debiti: 'Debiti',
};

export const saveConto = async (c) => {
  const obj = {
    id: c.id || uid(),
    nome: c.nome,
    tipo: c.tipo || 'liquidita',
    saldo_iniziale: round2(c.saldo_iniziale || 0),
    data_saldo: c.data_saldo,
    possessoData: c.possessoData || null,   // data di ingresso nel patrimonio (per asset)
    ordine: c.ordine ?? null,                // ordine di visualizzazione (riordino manuale)
    note: c.note || '',
    attivo: c.attivo !== false,
  };
  await dbAdd('conti', obj);
  await refreshAll();
  return obj;
};

export const deleteConto = async (id) => { await dbDelete('conti', id); await refreshAll(); };

// Saldo stimato: parte dal saldo iniziale e applica i movimenti dalla data_saldo in poi.
// Per gli asset (es. casa) il saldo è semplicemente il valore dichiarato.
export const saldoStimato = (conto) => {
  if (conto.tipo === 'asset') return round2(conto.saldo_iniziale);
  // conti investimento: il versato è la somma dei loro strumenti (fonte unica,
  // strumentiService). Prima degli strumenti (migrazione non ancora fatta) vale
  // il vecchio calcolo da saldo iniziale + movimenti.
  if (conto.tipo === 'investimenti' && state.strumenti.some(s => s.contoId === conto.id)) return versatoConto(conto);

  let saldo = conto.saldo_iniziale || 0;
  const dataRif = conto.data_saldo || '1970-01-01';
  for (const m of state.movimenti) {
    if (m.data < dataRif) continue;
    if (m.tipo === 'spesa' && m.conto === conto.nome) saldo -= m.imp;
    else if (m.tipo === 'entrata' && m.conto === conto.nome) saldo += m.imp;
    else if (m.tipo === 'trasferimento') {
      if (m.conto === conto.nome) saldo -= m.imp;         // esce dall'origine
      if (m.contoDest === conto.nome) saldo += m.imp;      // entra nella destinazione
    }
  }
  return round2(saldo);
};

export const contiPerTipo = () => {
  const out = {}; TIPI_CONTO.forEach(t => out[t] = []);
  for (const c of state.conti) if (c.attivo !== false) (out[c.tipo] = out[c.tipo] || []).push(c);
  return out;
};

export const contiLiquidiEnominali = () => state.conti.filter(c => c.attivo !== false && (c.tipo === 'liquidita' || c.tipo === 'risparmio'));

// Assicura almeno un conto se il DB fosse vuoto (fallback di sicurezza)
export const ensureContoDefault = async () => {
  if (state.conti.length === 0) {
    await saveConto({ nome: 'Conto principale', tipo: 'liquidita', saldo_iniziale: 0, data_saldo: todayISO() });
  }
};

// ─── gestione conti: rinomina a cascata, archivio, eliminazione protetta ─────
// I movimenti (e ricorrenze, prestiti, suggerimenti) puntano al conto per NOME:
// rinominare senza propagare lasciava i movimenti orfani del vecchio nome.

// Quanti movimenti usano il conto (come origine o destinazione)
export const movimentiDelConto = (conto) => state.movimenti.filter(m => m.conto === conto.nome || m.contoDest === conto.nome).length;

export const rinominaConto = async (id, nuovoNome) => {
  const c = state.conti.find(x => x.id === id);
  nuovoNome = (nuovoNome || '').trim();
  if (!c) throw new Error('Conto non trovato');
  if (!nuovoNome) throw new Error('Il nome non può essere vuoto');
  if (nuovoNome === c.nome) return 0;
  if (state.conti.some(x => x.id !== id && x.nome.toLowerCase() === nuovoNome.toLowerCase())) throw new Error('Esiste già un conto con questo nome');
  const vecchio = c.nome;
  const sost = (o, campi) => {
    let cambiato = false; const n = { ...o };
    for (const k of campi) if (n[k] === vecchio) { n[k] = nuovoNome; cambiato = true; }
    return cambiato ? n : null;
  };
  const movs = state.movimenti.map(m => sost(m, ['conto', 'contoDest'])).filter(Boolean);
  const rics = state.ricorrenti.map(r => sost(r, ['conto', 'contoDest'])).filter(Boolean);
  const regole = state.regole.map(r => sost(r, ['conto', 'contoDest'])).filter(Boolean);
  const fins = state.finanziamenti.map(f => sost(f, ['conto'])).filter(Boolean);
  const sugg = state.suggerimenti
    .filter(s => s.classificazione && s.classificazione.conto === vecchio)
    .map(s => ({ ...s, classificazione: { ...s.classificazione, conto: nuovoNome } }));
  await dbAdd('conti', { ...c, nome: nuovoNome });
  if (movs.length) await dbBulkPut('movimenti', movs);
  if (rics.length) await dbBulkPut('ricorrenti', rics);
  if (regole.length) await dbBulkPut('regole', regole);
  if (fins.length) await dbBulkPut('finanziamenti', fins);
  if (sugg.length) await dbBulkPut('suggerimenti', sugg);
  if (state.mutuo && state.mutuo.conto === vecchio) await dbAdd('mutuo', { ...state.mutuo, conto: nuovoNome });
  await refreshAll();
  return movs.length;
};

// Archiviare = togliere dalle liste mantenendo lo storico. Solo a saldo zero:
// un conto archiviato esce dal patrimonio, e con dei soldi dentro il totale mentirebbe.
export const puoArchiviare = (conto) => conto.tipo === 'asset' || Math.abs(saldoStimato(conto)) < 0.005;
export const impostaArchiviato = async (id, archiviato) => {
  const c = state.conti.find(x => x.id === id);
  if (!c) return;
  if (archiviato && !puoArchiviare(c)) throw new Error('Porta prima il saldo a zero: un conto archiviato esce dal patrimonio');
  await dbAdd('conti', { ...c, attivo: !archiviato });
  await refreshAll();
};

// Eliminare è possibile solo se nessun movimento (o strumento) lo usa
export const puoEliminare = (conto) => movimentiDelConto(conto) === 0 && strumentiDelConto(conto).length === 0 &&
  !state.ricorrenti.some(r => r.conto === conto.nome || r.contoDest === conto.nome);
export const eliminaContoSicuro = async (id) => {
  const c = state.conti.find(x => x.id === id);
  if (!c) return;
  if (!puoEliminare(c)) throw new Error('Il conto è usato da movimenti o ricorrenze: puoi solo archiviarlo');
  await deleteConto(id);
};
