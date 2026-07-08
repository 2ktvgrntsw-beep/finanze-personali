// seedBollette.js — Caricamento iniziale dello storico bollette energia elettrica.
// Inietta le 50 bollette precaricate (dall'Excel dell'utente) al primo avvio della
// sezione Energia. Idempotente via flag in 'meta': gira una sola volta, anche su
// database già esistenti (l'utente aveva già i suoi movimenti prima di questa sezione).

import { BOLLETTE_SEED } from './bolletteSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbCount } from './db.js';

const FLAG = 'seed_bollette_completato';

export const seedBolletteSeNecessario = async () => {
  const gia = await dbGet('meta', FLAG);
  if (gia && gia.valore === true) return false;   // già seminato

  // sicurezza extra: se per qualche ragione ci sono già bollette, non duplico
  const n = await dbCount('bollette');
  if (n > 0) {
    await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
    return false;
  }

  await dbBulkPut('bollette', BOLLETTE_SEED);
  await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
  return true;
};
