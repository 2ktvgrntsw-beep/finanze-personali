// seedStipendi.js — Caricamento iniziale dello storico buste paga (sezione Stipendi).
// Inietta le buste precaricate (dai quattro archivi datore) alla prima apertura della
// sezione. Lo storico è PRECARICATO e non modificabile dall'utente: la fonte di verità
// è il seed. Per questo, oltre al flag "una tantum", c'è una MIGRAZIONE per versione dei
// dati: quando il contenuto del seed cambia (es. arricchimento fiscale), le buste vengono
// rigenerate anche su database già esistenti.

import { STIPENDI_SEED } from './stipendiSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbCount, dbClear } from './db.js';

const FLAG = 'seed_stipendi_completato';
const FLAG_VER = 'seed_stipendi_versione';
// Bump a ogni cambio del CONTENUTO del seed:
//  1 = versione iniziale (v3.10)
//  2 = v3.12: dettaglio fiscale INPS/IRPEF/addizionali/Cometa azienda per tutti i datori,
//      flag anticipo/cessazione, viste sul lordo depurate dai mesi speciali.
const VERSIONE_DATI = 2;

export const seedStipendiSeNecessario = async () => {
  const verRec = await dbGet('meta', FLAG_VER);
  const verCorrente = verRec ? verRec.valore : 0;
  const n = await dbCount('stipendi');

  // MIGRAZIONE: se il seed è più recente di quello iniettato, sostituisco le buste.
  // (Nessun dato utente si perde: qui non ci sono buste inserite a mano, solo lo storico.)
  if (verCorrente < VERSIONE_DATI) {
    await dbClear('stipendi');
    await dbBulkPut('stipendi', STIPENDI_SEED);
    await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
    await dbAdd('meta', { chiave: FLAG_VER, valore: VERSIONE_DATI, data: new Date().toISOString() });
    return true;
  }

  // AUTO-REPAIR basato sui DATI: se lo store è vuoto ma la versione risulta aggiornata
  // (es. ripristino di un backup che ha svuotato lo store), reinietto le buste.
  if (n === 0) {
    await dbBulkPut('stipendi', STIPENDI_SEED);
    await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
    return true;
  }
  return false;
};
