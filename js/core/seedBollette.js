// seedBollette.js — Caricamento iniziale dello storico bollette energia elettrica.
// Inietta le 50 bollette precaricate (dall'Excel dell'utente) al primo avvio della
// sezione Energia. Idempotente via flag in 'meta': gira una sola volta, anche su
// database già esistenti (l'utente aveva già i suoi movimenti prima di questa sezione).

import { BOLLETTE_SEED } from './bolletteSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbCount } from './db.js';

const FLAG = 'seed_bollette_completato';
const FLAG_V2 = 'seed_bollette_v2';   // v2: aggiunti canone RAI, bonus, altri importi

// Bolletta campione del seed che HA il canone: se nel DB ne esiste una versione
// SENZA, i dati sono rimasti alla v1 (es. ripristino di un backup fatto con una
// versione precedente: il backup non include i flag di migrazione) e vanno riallineati.
const _campioneV2 = () => BOLLETTE_SEED.find(b => b.canone != null);

export const seedBolletteSeNecessario = async () => {
  const gia = await dbGet('meta', FLAG);
  if (gia && gia.valore === true) {
    // MIGRAZIONE v2 basata sui DATI (non solo sul flag): sovrascrivo le bollette
    // del seed con la versione completa se il campione in DB risulta ancora v1.
    // Copre anche il caso "backup vecchio ripristinato dopo l'aggiornamento".
    const v2 = await dbGet('meta', FLAG_V2);
    const campione = _campioneV2();
    const inDb = campione ? await dbGet('bollette', campione.id) : null;
    const datiVecchi = inDb && inDb.canone == null;
    if (!v2 || v2.valore !== true || datiVecchi) {
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
