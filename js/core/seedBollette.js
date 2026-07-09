// seedBollette.js — Caricamento iniziale dello storico bollette energia elettrica.
// Inietta le 50 bollette precaricate (dall'Excel dell'utente) al primo avvio della
// sezione Energia. Idempotente via flag in 'meta': gira una sola volta, anche su
// database già esistenti (l'utente aveva già i suoi movimenti prima di questa sezione).

import { BOLLETTE_SEED } from './bolletteSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbCount } from './db.js';

const FLAG = 'seed_bollette_completato';
const FLAG_V2 = 'seed_bollette_v2';   // v2: aggiunti canone RAI, bonus, altri importi

export const seedBolletteSeNecessario = async () => {
  const gia = await dbGet('meta', FLAG);
  if (gia && gia.valore === true) {
    // MIGRAZIONE v2: chi ha già il seed v1 in pancia riceve i campi canone/bonus/altri.
    // Sovrascrivo SOLO le bollette del seed (stessi id); quelle inserite a mano restano intatte.
    const v2 = await dbGet('meta', FLAG_V2);
    if (!v2 || v2.valore !== true) {
      await dbBulkPut('bollette', BOLLETTE_SEED);
      await dbAdd('meta', { chiave: FLAG_V2, valore: true, data: new Date().toISOString() });
      return true;
    }
    return false;
  }

  // sicurezza extra: se per qualche ragione ci sono già bollette, non duplico
  const n = await dbCount('bollette');
  if (n > 0) {
    await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
    return false;
  }

  await dbBulkPut('bollette', BOLLETTE_SEED);
  await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
  await dbAdd('meta', { chiave: FLAG_V2, valore: true, data: new Date().toISOString() });
  return true;
};
