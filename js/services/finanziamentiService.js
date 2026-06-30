// finanziamentiService.js (NUOVO v1.3) — gestione finanziamenti con quota a carico
// parziale (split), es. l'elettrodomestico a tasso zero diviso 50% con la compagna.
//
// Riusa calcolaPianoAmmortamento di mutuoService.js: un finanziamento è concettualmente
// un mutuo più piccolo e più breve, con lo stesso meccanismo di rata costante.

import { dbAdd, dbDelete } from '../db.js';
import { uid, round2 } from '../utils.js';
import { refreshAll, state } from '../state.js';
import { calcolaPianoAmmortamento } from './mutuoService.js';

export const saveFinanziamento = async (f) => {
  const obj = {
    id: f.id || uid(),
    nome: f.nome || '',
    importo_iniziale: round2(Number(f.importo_iniziale) || 0),
    tasso: Number(f.tasso) || 0, // spesso 0 per i finanziamenti "tasso zero"
    rata_mensile: round2(Number(f.rata_mensile) || 0),
    durata_mesi: parseInt(f.durata_mesi, 10) || 0,
    data_inizio: f.data_inizio,
    quota_utente_percentuale: Number(f.quota_utente_percentuale ?? 100),
    attivo: f.attivo !== false,
  };
  await dbAdd('finanziamenti', obj);
  await refreshAll();
  return obj;
};

export const deleteFinanziamento = async (id) => {
  await dbDelete('finanziamenti', id);
  await refreshAll();
};

export const finanziamentiAttivi = () => state.finanziamenti.filter(f => f.attivo !== false);

// Stato sintetico di un finanziamento "a oggi" — stessa forma di statoMutuoOggi,
// con l'aggiunta esplicita della quota a carico dell'utente (lo split è il punto
// centrale per i finanziamenti condivisi, mentre per il mutuo è secondario).
export const statoFinanziamentoOggi = (finanziamento) => {
  const eventiFinanziamento = state.eventiStraordinari.filter(e => e.riferimento_id === finanziamento.id);
  const piano = calcolaPianoAmmortamento(finanziamento, eventiFinanziamento);
  if (!piano.length) return null;

  const ratePagate = piano.filter(r => r.pagata);
  const ultimaPagata = ratePagate[ratePagate.length - 1];
  const residuo = ultimaPagata ? ultimaPagata.residuo : finanziamento.importo_iniziale;
  const prossima = piano.find(r => !r.pagata);
  const quotaUtentePerc = (finanziamento.quota_utente_percentuale ?? 100) / 100;

  return {
    rataMensile: prossima?.rata ?? finanziamento.rata_mensile,
    quotaUtente: round2((prossima?.rata ?? finanziamento.rata_mensile) * quotaUtentePerc),
    residuo,
    residuoQuotaUtente: round2(residuo * quotaUtentePerc),
    ratePagate: ratePagate.length,
    rateTotali: piano.length,
    percentualeCompletamento: round2((ratePagate.length / piano.length) * 100),
    prossimaRataData: prossima?.data ?? null,
  };
};

// Totale residuo di tutti i finanziamenti attivi (quota intera, non solo utente):
// usato nel calcolo delle Passività per il patrimonio netto.
export const totaleResiduoFinanziamenti = () =>
  finanziamentiAttivi().reduce((tot, f) => {
    const stato = statoFinanziamentoOggi(f);
    return tot + (stato ? stato.residuo : f.importo_iniziale);
  }, 0);
