// seedBollette.js — Storico bollette energia elettrica precaricato (sezione Energia).
//
// LE BOLLETTE PRECARICATE SONO DATO DI APP: arrivano dall'Excel dell'utente, impacchettate
// nel codice. La fonte di verità è quindi il seed, con le stesse due eccezioni delle buste
// paga (vedi seedStipendi.js):
//   - una bolletta CORRETTA A MANO (origine 'manuale', stesso id del seed) è intoccabile;
//   - una bolletta precaricata CANCELLATA dall'utente non torna: il suo id finisce in una
//     lista in 'meta' e il seed la salta.
//
// Fino alla 3.43 il controllo era un flag "già fatto" più un campione: (1) una correzione
// ai dati del seed non arrivava mai su un telefono che aveva già seminato, perché il flag
// era già acceso; (2) quando la riscrittura scattava (flag assente, o campione senza
// canone RAI, es. dopo il ripristino di un backup vecchio) riscriveva TUTTE le 50
// bollette, comprese quelle corrette a mano. Peggio: se l'utente svuotava il canone
// proprio della bolletta campione, il campione risultava "vecchio" e la riscrittura
// partiva a ogni avvio.
//
// Adesso il confronto è record per record, sul contenuto: si riscrivono solo le bollette
// di seed mancanti o diverse dal seed, mai quelle manuali o cancellate. Nessuna
// cancellazione automatica: una bolletta non del seed non viene mai toccata.

import { BOLLETTE_SEED } from './bolletteSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbAll } from './db.js';

const FLAG_IMPRONTA = 'seed_bollette_impronta';
const FLAG_CANCELLATE = 'seed_bollette_cancellate';   // id del seed cancellati dall'utente
const FLAG_VECCHIO = 'seed_bollette_completato';      // flag del sistema fino alla 3.43

// Serializzazione canonica (chiavi ordinate): due record con gli stessi valori danno la
// stessa stringa anche se le chiavi sono in ordine diverso.
const canonico = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {}));

// Impronta del contenuto atteso (hash djb2 sulle bollette ordinate per id): cambia da
// sola quando cambia anche un solo campo del seed.
export const improntaBollette = (bollette) => {
  const testo = [...bollette].sort((a, b) => (a.id < b.id ? -1 : 1)).map(canonico).join('\n');
  let h = 5381;
  for (let i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) | 0;
  return `${bollette.length}|${(h >>> 0).toString(36)}`;
};

const eManuale = (b) => b.origine === 'manuale';

// Decisione pura, senza database: dato quello che c'è, il seed e gli id cancellati
// dall'utente, dice quali bollette scrivere. Separata per poterla provare nei test.
export const pianoSeedBollette = (presenti, seed, cancellate = []) => {
  const perId = new Map(presenti.map(b => [b.id, b]));
  const esclusi = new Set(cancellate);
  for (const b of presenti) if (eManuale(b)) esclusi.add(b.id);

  const daSeminare = seed.filter(b => !esclusi.has(b.id));
  const daScrivere = daSeminare.filter(b => {
    const p = perId.get(b.id);
    return !p || canonico(p) !== canonico(b);
  });
  return {
    allineato: daScrivere.length === 0,
    daScrivere,
    attesa: improntaBollette(daSeminare),
    nManuali: presenti.filter(eManuale).length,
  };
};

// Passaggio dal vecchio sistema: chi aveva già seminato e poi ha cancellato una
// bolletta precaricata non deve vedersela ricomparire. Al primo avvio della 3.44 le
// bollette del seed assenti dal database contano come cancellate dall'utente.
export const cancellateIniziali = (presenti, seed, avevaGiaSeminato) => {
  if (!avevaGiaSeminato) return [];
  const ids = new Set(presenti.map(b => b.id));
  return seed.filter(b => !ids.has(b.id)).map(b => b.id);
};

const leggiCancellate = async () => {
  const rec = await dbGet('meta', FLAG_CANCELLATE);
  return rec && Array.isArray(rec.valore) ? rec.valore : null;
};

// Da chiamare quando l'utente elimina una bolletta: se era del seed, il seed non deve
// riproporla al prossimo avvio.
export const registraBollettaCancellata = async (id) => {
  if (!BOLLETTE_SEED.some(b => b.id === id)) return;
  const attuali = (await leggiCancellate()) || [];
  if (attuali.includes(id)) return;
  await dbAdd('meta', { chiave: FLAG_CANCELLATE, valore: [...attuali, id], data: new Date().toISOString() });
};

export const seedBolletteSeNecessario = async () => {
  const presenti = await dbAll('bollette');

  let cancellate = await leggiCancellate();
  if (cancellate === null) {
    const vecchio = await dbGet('meta', FLAG_VECCHIO);
    cancellate = cancellateIniziali(presenti, BOLLETTE_SEED, !!(vecchio && vecchio.valore));
    await dbAdd('meta', { chiave: FLAG_CANCELLATE, valore: cancellate, data: new Date().toISOString() });
  }

  const { allineato, daScrivere, attesa } = pianoSeedBollette(presenti, BOLLETTE_SEED, cancellate);
  if (!allineato) await dbBulkPut('bollette', daScrivere);

  const salvata = await dbGet('meta', FLAG_IMPRONTA);
  if (!salvata || salvata.valore !== attesa) {
    await dbAdd('meta', { chiave: FLAG_IMPRONTA, valore: attesa, data: new Date().toISOString() });
  }
  return !allineato;
};
