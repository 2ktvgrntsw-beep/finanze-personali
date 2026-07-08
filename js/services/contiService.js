// contiService.js — Gestione conti e calcolo saldi.
// Il saldo di un conto = saldo_iniziale (a una certa data) + tutti i movimenti su quel
// conto successivi. Così l'utente imposta il saldo una volta e l'app lo aggiorna da sé
// man mano che assegna spese/entrate/trasferimenti a quel conto.

import { dbAdd, dbDelete } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid, round2 } from '../core/utils.js';

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
    await saveConto({ nome: 'Conto principale', tipo: 'liquidita', saldo_iniziale: 0, data_saldo: new Date().toISOString().slice(0, 10) });
  }
};
