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

// --- Backup JSON (formato di recovery PRIMARIO) ---
// Nessuna libreria esterna, nessun limite di cella, nessuna perdita di tipo:
// il file .json contiene tutti gli store così come sono. È il formato più
// affidabile per il ripristino; l'Excel resta per la consultazione umana.
export const esportaJSON = async () => {
  const dati = { _formato: 'finanze-backup', _versione: 1, _data: new Date().toISOString() };
  for (const s of STORE_DATI) dati[s] = await dbAll(s);
  const blob = new Blob([JSON.stringify(dati)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const oggi = new Date();
  a.href = url;
  a.download = `backup_finanze_${String(oggi.getDate()).padStart(2, '0')}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${oggi.getFullYear()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

// Import JSON, RESILIENTE come l'import Excel: azzera e reimporta solo gli store
// presenti nel file (con dati); gli altri vengono preservati.
export const importaJSON = async (file) => {
  const testo = await file.text();
  const dati = JSON.parse(testo);
  if (dati._formato !== 'finanze-backup') throw new Error('File non riconosciuto come backup Finanze');
  const preservati = [];
  for (const s of STORE_DATI) {
    const righe = dati[s];
    if (Array.isArray(righe) && righe.length > 0) {
      await dbClear(s);
      await dbBulkPut(s, righe);
    } else {
      preservati.push(s);
    }
  }
  await refreshAll();
  return { movimenti: (dati.movimenti || []).length, preservati };
};
