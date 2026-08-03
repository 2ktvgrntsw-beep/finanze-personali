// seedStipendi.js — Storico buste paga precaricato (sezione Stipendi).
//
// LO STORICO È DATO DI APP, NON DATO UTENTE: le buste arrivano dagli archivi dei quattro
// datori, non le digita l'utente. La fonte di verità è quindi il seed.
//
// Perché un controllo per IMPRONTA e non un semplice flag "già fatto": col flag, un
// aggiornamento dei dati (dettaglio fiscale, lordo depurato) NON arrivava mai su un
// telefono che aveva già seminato una volta. E se una vecchia istanza dell'app resta
// aperta mentre la nuova rigenera, può reiniettare i dati vecchi nella finestra fra
// "svuoto" e "riscrivo". Qui l'impronta (n. buste + netto + lordo + Cometa azienda) è
// confrontata a ogni avvio: se non combacia, riallineo. La scrittura è un unico bulk
// (put = aggiorna o crea) e la pulizia dei record obsoleti avviene DOPO: non esiste mai
// un istante con lo store vuoto.

import { STIPENDI_SEED } from './stipendiSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbAll, dbDelete } from './db.js';

const FLAG_IMPRONTA = 'seed_stipendi_impronta';
const round2 = (n) => Math.round(n * 100) / 100;

// Impronta dei dati attesi: cambia da sola quando cambia il contenuto del seed.
const improntaDi = (buste) => {
  const somma = (c) => round2(buste.reduce((s, b) => s + (b[c] || 0), 0));
  return `${buste.length}|${somma('netto')}|${somma('lordo')}|${somma('cometa_azienda')}`;
};

export const seedStipendiSeNecessario = async () => {
  const attesa = improntaDi(STIPENDI_SEED);
  const presenti = await dbAll('stipendi');

  // Confronto solo le buste DI SEED: quelle aggiunte a mano dall'utente non devono
  // far scattare un riallineamento continuo.
  const idSeed = new Set(STIPENDI_SEED.map(b => b.id));
  const diSeed = presenti.filter(b => idSeed.has(b.id));

  if (improntaDi(diSeed) === attesa && diSeed.length === presenti.filter(b => !b.manuale).length) {
    const salvata = await dbGet('meta', FLAG_IMPRONTA);
    if (!salvata || salvata.valore !== attesa) {
      await dbAdd('meta', { chiave: FLAG_IMPRONTA, valore: attesa, data: new Date().toISOString() });
    }
    return false;
  }

  // Disallineato: riscrivo le buste di seed in un colpo solo.
  await dbBulkPut('stipendi', STIPENDI_SEED);

  // Poi elimino i record obsoleti del seed precedente (es. vecchi id senza datore, che
  // nei mesi di passaggio si sovrascrivevano a vicenda). Le buste inserite dall'utente
  // restano: le riconosco perché coprono periodi che il seed non contiene.
  const copertoDalSeed = new Set(STIPENDI_SEED.map(b => `${b.anno}-${b.mese}-${b.datore}`));
  for (const b of presenti) {
    if (idSeed.has(b.id) || b.manuale) continue;
    if (copertoDalSeed.has(`${b.anno}-${b.mese}-${b.datore}`)) await dbDelete('stipendi', b.id);
  }

  await dbAdd('meta', { chiave: FLAG_IMPRONTA, valore: attesa, data: new Date().toISOString() });
  return true;
};
