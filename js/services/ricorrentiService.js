// ricorrentiService.js — movimenti ricorrenti (stipendio, mutuo, abbonamenti...) con eccezioni.
//
// REFACTORING v1.3, due interventi:
// 1) generaRicorrentiScaduti: in v1.2 ogni saveMovimento() dentro il ciclo while
//    triggerava un refreshAll() completo. Se ad ogni avvio app ci sono più ricorrenze
//    scadute da generare (es. dopo settimane senza aprire l'app), si ripete lo stesso
//    problema di N refreshAll già visto nell'import Excel. Ora si usa skipRefresh e
//    un solo refreshAll() alla fine di tutta la generazione.
// 2) proiezione30gg: la versione v1.2 si basava SOLO sui movimenti ricorrenti
//    programmati, risultando sistematicamente troppo ottimistica (non conta la spesa
//    "imprevista" che in realtà è statisticamente prevedibile — punto discusso e
//    confermato in fase di revisione progetto). Si aggiunge una stima basata sulla
//    media mobile delle spese NON ricorrenti negli ultimi 3 mesi, mostrata separata
//    dalla proiezione "certa" da ricorrenze, così l'utente vede entrambe le cifre
//    invece di una sola proiezione fuorviante.

import { dbAdd, dbDelete, dbAll } from '../db.js';
import { uid, todayISO, advanceDate } from '../utils.js';
import { refreshAll, state } from '../state.js';
import { saveMovimento } from './movimentiService.js';

export const saveRicorrente = async (r) => {
  const obj = {
    id: r.id || uid(),
    tipo: r.tipo,
    macrocategoria: r.macrocategoria || '',
    categoria: r.categoria || '',
    sottocategoria: r.sottocategoria || '',
    conto: r.conto || '',
    tag: Array.isArray(r.tag) ? r.tag : (r.tag ? [r.tag] : []),
    descrizione: r.descrizione || '',
    note: r.note || '',
    importo: Math.abs(Number(r.importo) || 0),
    frequenza: r.frequenza || 'mensile',
    data_inizio: r.data_inizio || todayISO(),
    data_fine: r.data_fine || null,
    attiva: r.attiva !== false,
    ultima_generazione: r.ultima_generazione || null,
    custom: r.custom || null,
  };
  await dbAdd('ricorrenti', obj);
  await refreshAll();
  return obj;
};

export const deleteRicorrente = async (id) => {
  await dbDelete('ricorrenti', id);
  await refreshAll();
};

export const prossimaGenerazione = (r) => {
  if (!r.attiva) return null;
  let next = r.ultima_generazione ? advanceDate(r.ultima_generazione, r.frequenza, r.custom) : r.data_inizio;
  if (r.data_fine && next > r.data_fine) return null;
  return next;
};

export const generaRicorrentiScaduti = async () => {
  const ric = await dbAll('ricorrenti');
  const oggi = todayISO();
  let creati = 0;
  const ricorrentiDaAggiornare = [];

  for (const r of ric) {
    if (!r.attiva) continue;
    let next = r.ultima_generazione ? advanceDate(r.ultima_generazione, r.frequenza, r.custom) : r.data_inizio;

    while (next && next <= oggi && (!r.data_fine || next <= r.data_fine)) {
      await saveMovimento({
        data: next, tipo: r.tipo, macrocategoria: r.macrocategoria, categoria: r.categoria,
        sottocategoria: r.sottocategoria, conto: r.conto, tag: r.tag, descrizione: r.descrizione,
        note: r.note, importo: r.importo, ricorrente_id: r.id, origine: 'ricorrente',
      }, { skipRefresh: true }); // niente refreshAll per ogni singola occorrenza generata
      r.ultima_generazione = next;
      creati++;
      next = advanceDate(next, r.frequenza, r.custom);
    }
    ricorrentiDaAggiornare.push(r);
  }

  // Salva gli aggiornamenti di ultima_generazione (anche questi senza refresh intermedio)
  for (const r of ricorrentiDaAggiornare) await dbAdd('ricorrenti', r);

  if (creati > 0) await refreshAll(); // un solo refresh finale, qualunque sia il numero di occorrenze generate
  return creati;
};

// Proiezione "certa": solo ciò che è già programmato come ricorrente nei prossimi 30 giorni.
const proiezioneRicorrenti30gg = async () => {
  const ric = await dbAll('ricorrenti');
  const lim = new Date(); lim.setDate(lim.getDate() + 30);
  const limStr = lim.toISOString().slice(0, 10);
  let entrate = 0, spese = 0;

  for (const r of ric) {
    if (!r.attiva) continue;
    let next = r.ultima_generazione ? advanceDate(r.ultima_generazione, r.frequenza, r.custom) : r.data_inizio;
    while (next && next <= limStr && (!r.data_fine || next <= r.data_fine)) {
      if (r.tipo === 'entrata') entrate += r.importo; else if (r.tipo === 'spesa') spese += r.importo;
      next = advanceDate(next, r.frequenza, r.custom);
    }
  }
  return { entrate, spese, saldo: entrate - spese };
};

// Stima delle spese "non ricorrenti" attese nei prossimi 30 giorni, basata sulla
// media mensile delle spese non ricorrenti negli ultimi 3 mesi completi. Non è una
// previsione esatta (non può esserlo), ma è più realistica del considerarle pari a zero.
const stimaSpeseImpreviste30gg = () => {
  const oggi = new Date();
  const treMesiFa = new Date(oggi.getFullYear(), oggi.getMonth() - 3, oggi.getDate());
  const treMesiFaISO = treMesiFa.toISOString().slice(0, 10);
  const oggiISO = oggi.toISOString().slice(0, 10);

  const speseNonRicorrenti = state.movimenti.filter(m =>
    m.tipo === 'spesa' && !m.ricorrente_id && m.data >= treMesiFaISO && m.data <= oggiISO
  );

  const totale = speseNonRicorrenti.reduce((a, m) => a + m.importo, 0);
  // Media mensile su 3 mesi, poi riportata a 30 giorni (approssimazione sufficiente:
  // l'obiettivo è dare un ordine di grandezza realistico, non un valore esatto).
  return totale / 3;
};

// API esposta ai componenti: combina proiezione certa (ricorrenti) e stima (media mobile),
// restituendo entrambe separate così la UI può mostrarle distintamente.
export const proiezione30gg = async () => {
  const certa = await proiezioneRicorrenti30gg();
  const speseStimate = stimaSpeseImpreviste30gg();
  return {
    ...certa,
    speseStimateNonRicorrenti: speseStimate,
    saldoStimatoTotale: certa.saldo - speseStimate,
  };
};
