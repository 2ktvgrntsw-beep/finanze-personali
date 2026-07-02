// excelService.js — Backup ed export/import Excel COMPLETO per recovery.
// Regola fondamentale: tutto ciò che si esporta si deve poter reimportare (simmetria).
// Copre: movimenti, conti, categorie, tag, ricorrenti, mutuo, finanziamenti, eventi,
// e le impostazioni (meta). Un backup che perde pezzi non è un backup.

import { state, refreshAll } from '../core/store.js';
import { dbBulkPut, dbClear, dbAll, dbAdd } from '../core/db.js';
import { uid, round2, annomese, parseDataEU } from '../core/utils.js';

const XLSX = () => window.XLSX;
const b = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'VERO' || v === 'SI';

// --- EXPORT (backup completo) ---
export const esportaBackup = async () => {
  const wb = XLSX().utils.book_new();
  const sheet = (nome, rows) => XLSX().utils.book_append_sheet(wb, XLSX().utils.json_to_sheet(rows.length ? rows : [{}]), nome);

  // Movimenti
  sheet('Movimenti', state.movimenti.map(m => ({
    Data: m.data, Tipo: m.tipo, Macro: m.macro, Categoria: m.cat, Sottocategoria: m.sub,
    Conto: m.conto, ContoDest: m.contoDest, Tag: (m.tag || []).join(', '),
    Descrizione: m.desc, Note: m.note, Importo: m.imp, Origine: m.origine || 'utente',
  })));

  // Conti (con dataPossesso per gli asset)
  sheet('Conti', state.conti.map(c => ({
    Nome: c.nome, Tipo: c.tipo, SaldoIniziale: c.saldo_iniziale, DataSaldo: c.data_saldo,
    DataPossesso: c.possessoData || '', Note: c.note, Attivo: c.attivo !== false,
  })));

  // Categorie
  sheet('Categorie', state.categorie.map(c => ({ Macro: c.macro, Categoria: c.cat, Sottocategoria: c.sub })));

  // Tag
  sheet('Tag', state.tag.map(t => ({ Nome: t.nome, Colore: t.colore || '' })));

  // Ricorrenti (TUTTI i campi, incluse date inizio/fine)
  sheet('Ricorrenti', state.ricorrenti.map(r => ({
    Nome: r.nome, Tipo: r.tipo, Frequenza: r.frequenza, Giorno: r.giorno || '', Importo: r.imp,
    Macro: r.macro, Categoria: r.cat, Sottocategoria: r.sub, Conto: r.conto, ContoDest: r.contoDest,
    Tag: (r.tag || []).join(', '), Descrizione: r.desc,
    Modalita: r.modalita, Soglia: r.soglia || '', IsRegola: r.isRegola === true,
    Attiva: r.attiva !== false, DataInizio: r.dataInizio || '', Prossima: r.prossima || '',
    FineTipo: r.fineTipo || 'mai', FineData: r.fineData || '', FineConteggio: r.fineConteggio || '',
    Generati: r.generati || 0, Origine: r.origine || '',
  })));

  // Mutuo
  if (state.mutuo) {
    const m = state.mutuo;
    sheet('Mutuo', Object.entries({
      Nome: m.nome, Banca: m.banca, ImportoIniziale: m.importo_iniziale, Tasso: m.tasso,
      DurataMesi: m.durata_mesi, Rata: m.rata, DataInizio: m.data_inizio, GiornoAddebito: m.giorno_addebito,
      QuotaUtente: m.quota_utente, Conto: m.conto, Macro: m.macro || 'Casa', Categoria: m.cat || '',
      Sottocategoria: m.sub || 'Rata Mutuo', GeneraRicorrenza: m.generaRicorrenza !== false,
    }).map(([Campo, Valore]) => ({ Campo, Valore })));
  }

  // Finanziamenti (uno per riga, con classificazione)
  sheet('Finanziamenti', state.finanziamenti.map(f => ({
    Nome: f.nome, ImportoIniziale: f.importo_iniziale, Tasso: f.tasso, DurataMesi: f.durata_mesi,
    Rata: f.rata, DataInizio: f.data_inizio, GiornoAddebito: f.giorno_addebito || 1, QuotaUtente: f.quota_utente,
    Conto: f.conto || '', Macro: f.macro || 'Casa', Categoria: f.cat || '', Sottocategoria: f.sub || '',
    GeneraRicorrenza: f.generaRicorrenza !== false, Attivo: f.attivo !== false,
  })));

  // Eventi mutuo (estinzioni)
  sheet('EventiMutuo', state.eventiMutuo.map(e => ({
    Tipo: e.tipo, Importo: e.importo, Data: e.data, Riferimento: e.riferimento || 'mutuo-principale',
  })));

  // Meta / impostazioni (backup automatico, versione, ecc.)
  // Meta / impostazioni — ESCLUSO il backup automatico interno ('_backup_auto'):
  // contiene tutti i dati serializzati e supererebbe il limite di 32.767 caratteri
  // per cella di Excel, facendo fallire l'intero export. Escludo per sicurezza anche
  // qualsiasi altro valore anomalo oltre i 30.000 caratteri.
  const meta = await dbAll('meta');
  const metaRows = meta
    .filter(x => x.chiave !== '_backup_auto')
    .map(x => ({ Chiave: x.chiave, Valore: typeof x.valore === 'object' ? JSON.stringify(x.valore) : String(x.valore ?? '') }))
    .filter(x => x.Valore.length < 30000);
  sheet('_Meta', metaRows);

  const oggi = new Date();
  const nome = `backup_finanze_${String(oggi.getDate()).padStart(2, '0')}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${oggi.getFullYear()}.xlsx`;
  XLSX().writeFile(wb, nome);
};

// --- IMPORT (recovery completo, RESILIENTE tra versioni) ---
// Regola di robustezza: uno store viene azzerato e reimportato SOLO se il foglio
// corrispondente esiste nel file (con almeno una riga utile). Se il backup proviene
// da una versione precedente che non aveva quel foglio, i dati attuali di quello
// store vengono PRESERVATI invece di essere cancellati.
export const importaBackup = async (file) => {
  const buf = await file.arrayBuffer();
  const wb = XLSX().read(buf, { type: 'array' });
  const leggi = (nome) => { const ws = wb.Sheets[nome]; return ws ? XLSX().utils.sheet_to_json(ws, { defval: '' }) : []; };
  // un foglio "esiste davvero" se è presente e ha almeno una riga con contenuto
  const haFoglio = (nome) => {
    const righe = leggi(nome);
    return righe.length > 0 && righe.some(r => Object.values(r).some(v => v !== '' && v !== null && v !== undefined));
  };

  // Azzera in modo CONDIZIONALE: solo gli store coperti dal file
  const mappaFogli = {
    movimenti: 'Movimenti', conti: 'Conti', categorie: 'Categorie', tag: 'Tag',
    ricorrenti: 'Ricorrenti', mutuo: 'Mutuo', finanziamenti: 'Finanziamenti', eventiMutuo: 'EventiMutuo',
  };
  const preservati = [];
  for (const [store, foglio] of Object.entries(mappaFogli)) {
    if (haFoglio(foglio)) await dbClear(store);
    else preservati.push(store);
  }

  // Movimenti
  const movs = leggi('Movimenti').map((r, i) => {
    const data = parseDataEU(r.Data);
    return {
      id: 'imp' + i, data, annomese: annomese(data), tipo: (r.Tipo || 'spesa').toLowerCase(),
      macro: r.Macro || '', cat: r.Categoria || '', sub: r.Sottocategoria || '',
      conto: r.Conto || '', contoDest: r.ContoDest || '',
      tag: r.Tag ? String(r.Tag).split(',').map(s => s.trim()).filter(Boolean) : [],
      desc: r.Descrizione || '', note: r.Note || '',
      imp: round2(parseFloat(String(r.Importo).replace(',', '.')) || 0), origine: r.Origine || 'backup',
    };
  });
  await dbBulkPut('movimenti', movs);

  // Conti
  await dbBulkPut('conti', leggi('Conti').map(r => ({
    id: uid(), nome: r.Nome, tipo: r.Tipo || 'liquidita',
    saldo_iniziale: round2(parseFloat(String(r.SaldoIniziale).replace(',', '.')) || 0),
    data_saldo: parseDataEU(r.DataSaldo), possessoData: r.DataPossesso ? parseDataEU(r.DataPossesso) : '',
    note: r.Note || '', attivo: r.Attivo === '' ? true : b(r.Attivo),
  })).filter(c => c.nome));

  // Categorie
  await dbBulkPut('categorie', leggi('Categorie').map(r => ({ id: uid(), macro: r.Macro || '', cat: r.Categoria || '', sub: r.Sottocategoria || '', attiva: true })).filter(c => c.macro));

  // Tag
  await dbBulkPut('tag', leggi('Tag').map(r => ({ id: uid(), nome: r.Nome, colore: r.Colore || '' })).filter(t => t.nome));

  // Ricorrenti (TUTTI i campi)
  await dbBulkPut('ricorrenti', leggi('Ricorrenti').map(r => ({
    id: uid(), nome: r.Nome || 'Ricorrenza', tipo: (r.Tipo || 'spesa').toLowerCase(),
    frequenza: r.Frequenza || 'mensile', giorno: r.Giorno || null,
    imp: round2(parseFloat(String(r.Importo).replace(',', '.')) || 0),
    macro: r.Macro || '', cat: r.Categoria || '', sub: r.Sottocategoria || '',
    conto: r.Conto || '', contoDest: r.ContoDest || '',
    tag: r.Tag ? String(r.Tag).split(',').map(s => s.trim()).filter(Boolean) : [],
    desc: r.Descrizione || '', modalita: r.Modalita || 'fisso',
    soglia: r.Soglia !== '' ? round2(parseFloat(String(r.Soglia).replace(',', '.'))) : null,
    isRegola: b(r.IsRegola), attiva: r.Attiva === '' ? true : b(r.Attiva),
    dataInizio: r.DataInizio ? parseDataEU(r.DataInizio) : '', prossima: r.Prossima ? parseDataEU(r.Prossima) : '',
    fineTipo: r.FineTipo || 'mai', fineData: r.FineData ? parseDataEU(r.FineData) : null,
    fineConteggio: r.FineConteggio !== '' ? parseInt(r.FineConteggio) : null,
    generati: parseInt(r.Generati) || 0, origine: r.Origine || '',
  })).filter(r => r.nome));

  // Mutuo (formato chiave/valore)
  const mutuoRows = leggi('Mutuo');
  if (mutuoRows.length) {
    const kv = {}; mutuoRows.forEach(r => { if (r.Campo) kv[r.Campo] = r.Valore; });
    if (kv.ImportoIniziale) {
      await dbAdd('mutuo', {
        id: 'mutuo-principale', nome: kv.Nome || 'Mutuo', banca: kv.Banca || '',
        importo_iniziale: round2(parseFloat(String(kv.ImportoIniziale).replace(',', '.')) || 0),
        tasso: parseFloat(String(kv.Tasso).replace(',', '.')) || 0, durata_mesi: parseInt(kv.DurataMesi) || 0,
        rata: round2(parseFloat(String(kv.Rata).replace(',', '.')) || 0), data_inizio: parseDataEU(kv.DataInizio),
        giorno_addebito: parseInt(kv.GiornoAddebito) || 1, quota_utente: parseFloat(kv.QuotaUtente) || 100,
        conto: kv.Conto || '', macro: kv.Macro || 'Casa', cat: kv.Categoria || '', sub: kv.Sottocategoria || 'Rata Mutuo',
        generaRicorrenza: kv.GeneraRicorrenza === '' ? true : b(kv.GeneraRicorrenza),
      });
    }
  }

  // Finanziamenti
  await dbBulkPut('finanziamenti', leggi('Finanziamenti').map((r, i) => ({
    id: 'fin-imp-' + i, nome: r.Nome,
    importo_iniziale: round2(parseFloat(String(r.ImportoIniziale).replace(',', '.')) || 0),
    tasso: parseFloat(String(r.Tasso).replace(',', '.')) || 0, durata_mesi: parseInt(r.DurataMesi) || 0,
    rata: round2(parseFloat(String(r.Rata).replace(',', '.')) || 0), data_inizio: parseDataEU(r.DataInizio),
    giorno_addebito: parseInt(r.GiornoAddebito) || 1, quota_utente: parseFloat(r.QuotaUtente) || 100,
    conto: r.Conto || '', macro: r.Macro || 'Casa', cat: r.Categoria || '', sub: r.Sottocategoria || '',
    generaRicorrenza: r.GeneraRicorrenza === '' ? true : b(r.GeneraRicorrenza), attivo: r.Attivo === '' ? true : b(r.Attivo),
  })).filter(f => f.nome));

  // Eventi mutuo
  await dbBulkPut('eventiMutuo', leggi('EventiMutuo').map(r => ({
    id: uid(), tipo: r.Tipo || 'estinzione_parziale',
    importo: round2(parseFloat(String(r.Importo).replace(',', '.')) || 0),
    data: parseDataEU(r.Data), riferimento: r.Riferimento || 'mutuo-principale',
  })).filter(e => e.importo > 0));

  await refreshAll();
  return { movimenti: movs.length, preservati };
};
