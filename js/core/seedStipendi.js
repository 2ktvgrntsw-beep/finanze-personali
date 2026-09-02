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
//
// CON UNA ECCEZIONE, e vale più della regola: una busta CORRETTA A MANO è intoccabile.
// Chi l'ha corretta ha guardato il cedolino e sa qualcosa che il seed non sa.
// Fino alla 3.35 non era così, ed era un guaio silenzioso: la busta modificata teneva
// lo stesso id del seed, quindi rientrava nel confronto, l'impronta non tornava mai, e
// a ogni avvio il seed la riscriveva cancellando la correzione — backup o no, perché il
// danno avveniva DOPO il ripristino. Adesso le buste manuali escono da entrambi i lati
// del confronto e dalla scrittura: il seed le salta, e nemmeno un aggiornamento dei dati
// di app le tocca più. È il prezzo giusto — una correzione esplicita batte il seed.

import { STIPENDI_SEED } from './stipendiSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbAll, dbDelete } from './db.js';

const FLAG_IMPRONTA = 'seed_stipendi_impronta';
const round2 = (n) => Math.round(n * 100) / 100;

// Impronta dei dati attesi: cambia da sola quando cambia il contenuto del seed.
export const improntaDi = (buste) => {
  const somma = (c) => round2(buste.reduce((s, b) => s + (b[c] || 0), 0));
  return `${buste.length}|${somma('netto')}|${somma('lordo')}|${somma('cometa_azienda')}`;
};

// Decisione pura, senza database: dato quello che c'è e quello che il seed vorrebbe,
// dice cosa scrivere e cosa cancellare. Separata apposta per poterla provare nei test —
// IndexedDB nei test non c'è, e questa è la parte dove si sbaglia.
export const pianoSeed = (presenti, seed) => {
  // le buste corrette a mano non si toccano: né si riscrivono, né entrano nei confronti
  const manuali = new Set(presenti.filter(b => b.manuale).map(b => b.id));
  const daSeminare = seed.filter(b => !manuali.has(b.id));
  const attesa = improntaDi(daSeminare);

  const idSeed = new Set(daSeminare.map(b => b.id));
  const diSeed = presenti.filter(b => idSeed.has(b.id) && !b.manuale);
  const nonManuali = presenti.filter(b => !b.manuale);

  // allineato = le buste di seed presenti sono esattamente quelle attese, e non ce ne
  // sono altre non manuali in giro (residui di seed vecchi)
  const allineato = improntaDi(diSeed) === attesa && diSeed.length === nonManuali.length;

  // record obsoleti: non manuali, non nel seed corrente, ma su un periodo che il seed
  // copre (tipicamente vecchi id senza datore, che nei mesi di passaggio si
  // sovrascrivevano a vicenda)
  const copertoDalSeed = new Set(daSeminare.map(b => `${b.anno}-${b.mese}-${b.datore}`));
  const obsoleti = allineato ? [] : presenti.filter(b =>
    !idSeed.has(b.id) && !b.manuale && copertoDalSeed.has(`${b.anno}-${b.mese}-${b.datore}`));

  return { allineato, daSeminare, obsoleti, attesa, nManuali: manuali.size };
};

export const seedStipendiSeNecessario = async () => {
  const presenti = await dbAll('stipendi');
  const { allineato, daSeminare, obsoleti, attesa } = pianoSeed(presenti, STIPENDI_SEED);

  if (allineato) {
    const salvata = await dbGet('meta', FLAG_IMPRONTA);
    if (!salvata || salvata.valore !== attesa) {
      await dbAdd('meta', { chiave: FLAG_IMPRONTA, valore: attesa, data: new Date().toISOString() });
    }
    return false;
  }

  // Disallineato: riscrivo le buste di seed in un colpo solo (le manuali non ci sono).
  await dbBulkPut('stipendi', daSeminare);
  // Poi elimino i residui del seed precedente. Le buste dell'utente restano.
  for (const b of obsoleti) await dbDelete('stipendi', b.id);

  await dbAdd('meta', { chiave: FLAG_IMPRONTA, valore: attesa, data: new Date().toISOString() });
  return true;
};
