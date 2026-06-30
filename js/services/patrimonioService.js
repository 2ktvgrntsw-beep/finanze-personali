// patrimonioService.js (NUOVO v1.3) — calcolo del patrimonio netto e gestione
// dello snapshot mensile.
//
// Formula (confermata nel documento di progetto):
// PATRIMONIO NETTO = (Liquidità + Risparmio + Investimenti + Asset) − Debiti
//
// Snapshot mensile: suggerimento discusso e confermato in fase di revisione progetto.
// Salvare una "foto" del patrimonio netto una volta al mese costa pochissimo (un
// piccolo record), ma permette in futuro di rispondere a "quanto sono cresciuto in
// 3 anni" leggendo direttamente lo storico, invece di dover ricalcolare a ritroso
// da migliaia di movimenti — cosa che in molti casi non sarebbe nemmeno possibile
// con precisione (es. se nel frattempo è cambiato il valore stimato della casa).

import { dbAdd, dbAll } from '../db.js';
import { uid, round2, todayISO } from '../utils.js';
import { refreshAll, state } from '../state.js';
import { contiPerTipologia } from './contiService.js';
import { statoMutuoOggi } from './mutuoService.js';
import { totaleResiduoFinanziamenti } from './finanziamentiService.js';

// Saldo stimato di un singolo conto: saldo iniziale (o saldo importato) + somma dei
// movimenti che lo riguardano da quella data in poi. Per i trasferimenti, il conto
// di origine viene scalato e quello di destinazione accreditato.
export const saldoStimatoConto = (conto) => {
  let saldo = Number(conto.saldo_iniziale) || 0;
  const dataRif = conto.data_saldo || '1970-01-01';

  for (const m of state.movimenti) {
    if (m.data < dataRif) continue;
    if (m.tipo === 'trasferimento') {
      if (m.conto_origine === conto.nome) saldo -= m.importo;
      if (m.conto_destinazione === conto.nome) saldo += m.importo;
    } else if (m.conto === conto.nome) {
      saldo += (m.tipo === 'entrata') ? m.importo : -m.importo;
    }
  }
  return round2(saldo);
};

// Breakdown completo: per ogni tipologia di conto, somma dei saldi stimati.
// Le tipologie 'asset' (es. valore casa) e 'debiti' (mutuo/finanziamenti) sono
// trattate a parte, perché non derivano da movimenti ma da valori dichiarati/calcolati.
export const calcolaPatrimonio = () => {
  const perTipologia = contiPerTipologia();

  const liquidita = perTipologia.liquidita.reduce((t, c) => t + saldoStimatoConto(c), 0);
  const risparmio = perTipologia.risparmio.reduce((t, c) => t + saldoStimatoConto(c), 0);
  const investimenti = perTipologia.investimenti.reduce((t, c) => t + saldoStimatoConto(c), 0);
  // Gli "asset" (es. Casa) tipicamente non hanno movimenti: il loro valore è il saldo_iniziale,
  // aggiornato manualmente circa una volta l'anno (come confermato in fase di revisione).
  const asset = perTipologia.asset.reduce((t, c) => t + (Number(c.saldo_iniziale) || 0), 0);

  const statoMutuo = state.mutuo ? statoMutuoOggi(state.mutuo, state.eventiStraordinari.filter(e => e.riferimento_id === 'mutuo-principale')) : null;
  const residuoMutuo = statoMutuo ? statoMutuo.residuoCapitale : 0;
  const residuoFinanziamenti = totaleResiduoFinanziamenti();

  const totaleAttivita = round2(liquidita + risparmio + investimenti + asset);
  const totalePassivita = round2(residuoMutuo + residuoFinanziamenti);
  const patrimonioNetto = round2(totaleAttivita - totalePassivita);

  return {
    liquidita: round2(liquidita),
    risparmio: round2(risparmio),
    investimenti: round2(investimenti),
    asset: round2(asset),
    totaleAttivita,
    mutuoResiduo: round2(residuoMutuo),
    finanziamentiResiduo: round2(residuoFinanziamenti),
    totalePassivita,
    patrimonioNetto,
  };
};

// Salva uno snapshot del patrimonio per la data odierna (o quella indicata).
// Se esiste già uno snapshot per lo stesso mese, lo sovrascrive invece di duplicarlo
// (un solo punto dato per mese è sufficiente per il grafico storico).
export const salvaSnapshotPatrimonio = async (data = todayISO()) => {
  const meseKey = data.slice(0, 7); // 'AAAA-MM'
  const esistente = state.patrimonioSnapshot.find(s => s.data.slice(0, 7) === meseKey);
  const calcolo = calcolaPatrimonio();

  const obj = {
    id: esistente?.id || uid(),
    data,
    patrimonioNetto: calcolo.patrimonioNetto,
    totaleAttivita: calcolo.totaleAttivita,
    totalePassivita: calcolo.totalePassivita,
  };
  await dbAdd('patrimonio_snapshot', obj);
  await refreshAll();
  return obj;
};

// Serie storica per il grafico "Patrimonio nel tempo", ordinata per data.
export const serieStoricaPatrimonio = () =>
  [...state.patrimonioSnapshot].sort((a, b) => a.data.localeCompare(b.data));

// Verifica se serve uno snapshot per il mese corrente (utile per proporlo
// automaticamente all'utente, es. al primo accesso del mese, invece di affidarsi
// solo alla routine mensile manuale).
export const snapshotMeseCorrenteMancante = () => {
  const meseCorrente = todayISO().slice(0, 7);
  return !state.patrimonioSnapshot.some(s => s.data.slice(0, 7) === meseCorrente);
};
