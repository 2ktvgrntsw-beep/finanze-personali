// seedConsumiMensili.js — Carica i consumi elettrici mensili REALI.
// Stessa logica del seed buste paga: confronto per IMPRONTA, non un flag "già fatto",
// così un aggiornamento dei dati arriva anche su un telefono che ha già seminato.
// I mesi aggiunti leggendo un PDF dall'app sono marcati 'manuale' e non vengono toccati.

import { CONSUMI_MENSILI_SEED } from './consumiMensiliSeedData.js';
import { dbBulkPut, dbAdd, dbGet, dbAll } from './db.js';

const FLAG = 'seed_consumi_mensili_impronta';
const improntaDi = (a) => `${a.length}|${a.reduce((s, x) => s + (x.kwh || 0), 0)}`;

export const seedConsumiMensiliSeNecessario = async () => {
  const attesa = improntaDi(CONSUMI_MENSILI_SEED);
  const presenti = await dbAll('consumiMensili');
  const idSeed = new Set(CONSUMI_MENSILI_SEED.map(x => x.id));
  const diSeed = presenti.filter(x => idSeed.has(x.id) && !x.manuale);

  if (improntaDi(diSeed) === attesa) {
    const salvata = await dbGet('meta', FLAG);
    if (!salvata || salvata.valore !== attesa) {
      await dbAdd('meta', { chiave: FLAG, valore: attesa, data: new Date().toISOString() });
    }
    return false;
  }
  // non sovrascrivo i mesi che l'utente ha importato o corretto a mano
  const manuali = new Set(presenti.filter(x => x.manuale).map(x => x.id));
  await dbBulkPut('consumiMensili', CONSUMI_MENSILI_SEED.filter(x => !manuali.has(x.id)));
  await dbAdd('meta', { chiave: FLAG, valore: attesa, data: new Date().toISOString() });
  return true;
};
