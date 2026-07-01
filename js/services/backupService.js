// backupService.js — Backup automatico interno + rilevamento perdita dati.
// A ogni avvio salva una copia compatta di tutti i dati in uno store separato ('meta',
// chiave dedicata). Se all'avvio i dati principali risultano vuoti MA esiste una copia,
// propone il ripristino. Copre bug/corruzioni/azzeramenti; NON copre lo "sfratto" di iOS
// (che cancella tutto il contenitore) — per quello serve il backup Excel.

import { dbAll, dbAdd, dbGet, dbBulkPut, dbClear } from '../core/db.js';
import { refreshAll } from '../core/store.js';

const CHIAVE_BACKUP = '_backup_auto';
const CHIAVE_ULTIMO_EXCEL = '_ultimo_backup_excel';
const STORE_DATI = ['movimenti', 'conti', 'categorie', 'tag', 'ricorrenti', 'mutuo', 'finanziamenti', 'eventiMutuo'];

// Salva una copia interna di tutti i dati (chiamata a ogni avvio, dopo il refresh).
export const salvaBackupAuto = async () => {
  const dati = {};
  for (const s of STORE_DATI) dati[s] = await dbAll(s);
  const totMov = (dati.movimenti || []).length;
  // non sovrascrivere un backup buono con uno vuoto (se per qualche motivo i dati sono spariti)
  if (totMov === 0) {
    const esistente = await dbGet('meta', CHIAVE_BACKUP);
    if (esistente && esistente.valore && esistente.valore.contatori && esistente.valore.contatori.movimenti > 0) {
      return; // preserva il backup precedente (che ha dati)
    }
  }
  await dbAdd('meta', {
    chiave: CHIAVE_BACKUP,
    valore: {
      data: new Date().toISOString(),
      contatori: Object.fromEntries(Object.entries(dati).map(([k, v]) => [k, v.length])),
      dati,
    },
  });
};

// Verifica se serve proporre un ripristino: dati principali vuoti ma backup con dati.
export const rilevaPerdita = async () => {
  const movimenti = await dbAll('movimenti');
  if (movimenti.length > 0) return null;   // dati presenti, nessuna perdita
  const backup = await dbGet('meta', CHIAVE_BACKUP);
  if (backup && backup.valore && backup.valore.contatori && backup.valore.contatori.movimenti > 0) {
    return { data: backup.valore.data, contatori: backup.valore.contatori };
  }
  return null;
};

// Ripristina dal backup interno.
export const ripristinaBackupAuto = async () => {
  const backup = await dbGet('meta', CHIAVE_BACKUP);
  if (!backup || !backup.valore || !backup.valore.dati) return false;
  const dati = backup.valore.dati;
  for (const s of STORE_DATI) {
    await dbClear(s);
    if (dati[s] && dati[s].length) await dbBulkPut(s, dati[s]);
  }
  await refreshAll();
  return true;
};

// --- Promemoria backup Excel ---
export const registraBackupExcelFatto = async () => {
  await dbAdd('meta', { chiave: CHIAVE_ULTIMO_EXCEL, valore: new Date().toISOString() });
};

// Giorni dall'ultimo backup Excel (null se mai fatto).
export const giorniDaUltimoBackupExcel = async () => {
  const rec = await dbGet('meta', CHIAVE_ULTIMO_EXCEL);
  if (!rec || !rec.valore) return null;
  const diff = Date.now() - new Date(rec.valore).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
