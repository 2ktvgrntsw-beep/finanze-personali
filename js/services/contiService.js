// contiService.js — gestione conti.
//
// REFACTORING v1.3: aggiunto il campo "tipologia", necessario per la nuova schermata
// Patrimonio/Conti che raggruppa i conti in 5 categorie (come da documento di progetto):
// liquidita, risparmio, investimenti, asset, debiti. In v1.2 i conti non avevano
// classificazione: erano una lista piatta. Qui il default è 'liquidita' per restare
// compatibile con i conti già creati in v1.2 (un Conto Corrente, tipicamente).

import { dbAdd, dbDelete } from '../db.js';
import { uid } from '../utils.js';
import { refreshAll, state } from '../state.js';

export const TIPOLOGIE_CONTO = ['liquidita', 'risparmio', 'investimenti', 'asset', 'debiti'];

export const saveConto = async ({ id, nome, descrizione = '', saldo_iniziale = 0, tipologia = 'liquidita', attivo = true }) => {
  const obj = {
    id: id || uid(),
    nome,
    descrizione,
    saldo_iniziale: Number(saldo_iniziale) || 0,
    tipologia: TIPOLOGIE_CONTO.includes(tipologia) ? tipologia : 'liquidita',
    attivo,
  };
  await dbAdd('conti', obj);
  await refreshAll();
  return obj;
};

export const deleteConto = async (id) => {
  await dbDelete('conti', id);
  await refreshAll();
};

export const ensureContoDefault = async () => {
  if (state.conti.length === 0) {
    await saveConto({ nome: 'Conto Principale', descrizione: 'Conto creato automaticamente al primo avvio', saldo_iniziale: 0, tipologia: 'liquidita' });
    return true;
  }
  return false;
};

// Raggruppa i conti per tipologia, nell'ordine usato dalla schermata Patrimonio.
// Utile sia per la UI sia per il calcolo del patrimonio netto (vedi patrimonioService.js).
export const contiPerTipologia = () => {
  const out = Object.fromEntries(TIPOLOGIE_CONTO.map(t => [t, []]));
  for (const c of state.conti) {
    const t = TIPOLOGIE_CONTO.includes(c.tipologia) ? c.tipologia : 'liquidita';
    out[t].push(c);
  }
  return out;
};
