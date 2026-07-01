// excelService.js — Backup ed export/import Excel per recovery.
// L'app funziona interamente offline con i dati in IndexedDB; questo modulo serve a
// (1) esportare un backup completo su file .xlsx e (2) reimportarlo in caso di perdita
// dati o cambio dispositivo. Non è più il canale di caricamento iniziale (quello è lo
// storico precaricato), ma resta la rete di sicurezza.

import { state, refreshAll } from '../core/store.js';
import { dbBulkPut, dbClear } from '../core/db.js';
import { uid, round2, annomese, parseDataEU, toast } from '../core/utils.js';

const XLSX = () => window.XLSX;

// --- EXPORT (backup completo) ---
export const esportaBackup = () => {
  const wb = XLSX().utils.book_new();

  // Movimenti
  const movRows = state.movimenti.map(m => ({
    Data: m.data, Tipo: m.tipo, Macro: m.macro, Categoria: m.cat, Sottocategoria: m.sub,
    Conto: m.conto, ContoDest: m.contoDest, Tag: (m.tag || []).join(', '),
    Descrizione: m.desc, Note: m.note, Importo: m.imp,
  }));
  XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(movRows), 'Movimenti');

  // Conti
  const contiRows = state.conti.map(c => ({
    Nome: c.nome, Tipo: c.tipo, SaldoIniziale: c.saldo_iniziale, DataSaldo: c.data_saldo, Note: c.note,
  }));
  XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(contiRows), 'Conti');

  // Categorie
  const catRows = state.categorie.map(c => ({ Macro: c.macro, Categoria: c.cat, Sottocategoria: c.sub }));
  XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(catRows), 'Categorie');

  // Tag
  XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(state.tag.map(t => ({ Nome: t.nome }))), 'Tag');

  // Ricorrenti
  const recRows = state.ricorrenti.map(r => ({
    Nome: r.nome, Tipo: r.tipo, Frequenza: r.frequenza, Giorno: r.giorno, Importo: r.imp,
    Macro: r.macro, Categoria: r.cat, Sottocategoria: r.sub, Conto: r.conto, ContoDest: r.contoDest,
    Modalita: r.modalita, Soglia: r.soglia, IsRegola: r.isRegola, Attiva: r.attiva,
  }));
  XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(recRows), 'Ricorrenti');

  // Mutuo
  if (state.mutuo) {
    const m = state.mutuo;
    const mutuoRows = Object.entries({
      Nome: m.nome, Banca: m.banca, ImportoIniziale: m.importo_iniziale, Tasso: m.tasso,
      DurataMesi: m.durata_mesi, Rata: m.rata, DataInizio: m.data_inizio, GiornoAddebito: m.giorno_addebito,
      QuotaUtente: m.quota_utente, Conto: m.conto,
    }).map(([Campo, Valore]) => ({ Campo, Valore }));
    XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(mutuoRows), 'Mutuo');
  }

  // Finanziamenti
  const finRows = state.finanziamenti.map(f => ({
    Nome: f.nome, ImportoIniziale: f.importo_iniziale, Tasso: f.tasso, DurataMesi: f.durata_mesi,
    Rata: f.rata, DataInizio: f.data_inizio, QuotaUtente: f.quota_utente, Conto: f.conto,
  }));
  XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(finRows), 'Finanziamenti');

  // Meta (versione schema, per compatibilità futura)
  XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet([{ SchemaVersione: '2.0', Data: new Date().toISOString() }]), '_Meta');

  const oggi = new Date();
  const nome = `backup_finanze_${String(oggi.getDate()).padStart(2, '0')}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${oggi.getFullYear()}.xlsx`;
  XLSX().writeFile(wb, nome);
};

// --- IMPORT (recovery) ---
// Sostituisce i dati attuali con quelli del backup. Chiede conferma a monte (nel componente).
export const importaBackup = async (file) => {
  const buf = await file.arrayBuffer();
  const wb = XLSX().read(buf, { type: 'array' });

  const leggi = (nome) => {
    const ws = wb.Sheets[nome];
    return ws ? XLSX().utils.sheet_to_json(ws, { defval: '' }) : [];
  };

  // Svuota gli store principali prima di reimportare
  for (const s of ['movimenti', 'conti', 'categorie', 'tag', 'ricorrenti', 'mutuo', 'finanziamenti']) {
    await dbClear(s);
  }

  // Movimenti
  const movs = leggi('Movimenti').map((r, i) => {
    const data = parseDataEU(r.Data);
    return {
      id: 'imp' + i, data, annomese: annomese(data),
      tipo: (r.Tipo || 'spesa').toLowerCase(),
      macro: r.Macro || '', cat: r.Categoria || '', sub: r.Sottocategoria || '',
      conto: r.Conto || '', contoDest: r.ContoDest || '',
      tag: r.Tag ? String(r.Tag).split(',').map(s => s.trim()).filter(Boolean) : [],
      desc: r.Descrizione || '', note: r.Note || '',
      imp: round2(parseFloat(String(r.Importo).replace(',', '.')) || 0),
      origine: 'backup',
    };
  });
  await dbBulkPut('movimenti', movs);

  // Conti
  const conti = leggi('Conti').map(r => ({
    id: uid(), nome: r.Nome, tipo: r.Tipo || 'liquidita',
    saldo_iniziale: round2(parseFloat(String(r.SaldoIniziale).replace(',', '.')) || 0),
    data_saldo: parseDataEU(r.DataSaldo), note: r.Note || '', attivo: true,
  }));
  await dbBulkPut('conti', conti);

  // Categorie
  const cats = leggi('Categorie').map(r => ({ id: uid(), macro: r.Macro || '', cat: r.Categoria || '', sub: r.Sottocategoria || '', attiva: true }));
  await dbBulkPut('categorie', cats);

  // Tag
  const tags = leggi('Tag').map(r => ({ id: uid(), nome: r.Nome, colore: '' })).filter(t => t.nome);
  await dbBulkPut('tag', tags);

  await refreshAll();
  return { movimenti: movs.length, conti: conti.length };
};
