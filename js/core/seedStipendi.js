// seedStipendi.js — Caricamento iniziale dello storico buste paga (sezione Stipendi).
// Inietta le buste precaricate (dai quattro archivi datore) alla prima apertura della
// sezione. Idempotente via flag in 'meta': gira una sola volta, anche su database già
// esistenti (l'utente aveva movimenti e bollette da prima che questa sezione esistesse).

import { STIPENDI_SEED } from './stipendiSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbCount } from './db.js';

const FLAG = 'seed_stipendi_completato';

export const seedStipendiSeNecessario = async () => {
  const gia = await dbGet('meta', FLAG);
  const n = await dbCount('stipendi');

  if (gia && gia.valore === true) {
    // AUTO-REPAIR basato sui DATI (non solo sul flag): se lo store è vuoto ma il seed
    // risulta già completato (es. ripristino di un backup vecchio che ha svuotato lo
    // store senza ripopolarlo), reinietto le buste. Copre il caso della sezione nuova.
    if (n === 0) { await dbBulkPut('stipendi', STIPENDI_SEED); return true; }
    return false;
  }

  // Sicurezza extra: se per qualche ragione ci sono già buste (es. import da backup),
  // NON duplico: mi limito a marcare il flag.
  if (n > 0) {
    await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
    return false;
  }

  await dbBulkPut('stipendi', STIPENDI_SEED);
  await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
  return true;
};
