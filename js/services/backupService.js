// backupService.js — promemoria e registrazione backup periodici.
// Nessuna modifica funzionale rispetto alla v1.2: solo riformattazione per leggibilità.

import { dbAdd, dbAll } from '../db.js';
import { uid, todayDDMMYYYY, toast } from '../utils.js';
import { exportFullExcel } from './excelService.js';
import { state } from '../state.js';

const FREQ_GIORNI = { '7': 7, '15': 15, '30': 30, '90': 90 };

export const registraBackup = async (tipo = 'manuale') => {
  const id = uid();
  await dbAdd('backup', { id, data_backup: new Date().toISOString(), tipo_backup: tipo });
  await dbAdd('impostazioni', { chiave: 'ultimo_backup', valore: new Date().toISOString() });
  return id;
};

export const ultimoBackup = async () => {
  const all = await dbAll('backup');
  if (!all.length) return null;
  return all.sort((a, b) => b.data_backup.localeCompare(a.data_backup))[0];
};

export const verificaBackupScaduto = async () => {
  const freq = state.impostazioni['backup_frequenza'] || 'disattivato';
  if (freq === 'disattivato') return false;

  const giorni = FREQ_GIORNI[freq] || 30;
  const last = await ultimoBackup();
  if (!last) { toast('⚠️ Esegui il primo backup'); return true; }

  const diff = (Date.now() - new Date(last.data_backup).getTime()) / 86400000;
  if (diff >= giorni) { toast(`⚠️ Backup scaduto (${Math.floor(diff)} gg)`); return true; }
  return false;
};

export const eseguiBackupAutomatico = async () => {
  await exportFullExcel(`backup_${todayDDMMYYYY()}.xlsx`);
  await registraBackup('automatico');
};
