// excelService.js — import/export da/verso file Excel.
//
// REFACTORING v1.3 — FIX DI PERFORMANCE PRINCIPALE:
// la v1.2 importava i movimenti chiamando saveMovimento() riga per riga, cioè
// N transazioni IndexedDB + N refreshAll() (= N x 7 letture complete del database)
// per N righe. Su 5.625 movimenti erano oltre 39.000 operazioni sequenziali, abbastanza
// per bloccare percettibilmente l'app su Safari iOS durante il primo import.
// Qui importaMovimenti() costruisce tutti gli oggetti in memoria (funzione pura,
// nessun accesso a DB), poi scrive tutto con UNA dbBulkPut() e chiama refreshAll()
// UNA sola volta alla fine.

import { dbAdd, dbBulkPut, dbGet } from '../db.js';
import { uid, todayDDMMYYYY, toast, parseDataIntelligente, round2 } from '../utils.js';
import { refreshAll, state } from '../state.js';

// Mapping di default per il file "Gestione Finanze Personali.xlsx" di Lorenzo.
// v1.3: aggiunte le colonne Conto e Tag, presenti nell'Excel v2 ma non lette in v1.2
// (era il punto critico segnalato e confermato in fase di validazione del progetto).
export const MAPPING_LORENZO = {
  movimenti: {
    data: 'Data',
    tipo: 'Tipo Movimento',
    importo: 'Importo',
    macrocategoria: 'Macro Categoria',
    categoria: 'Categorie',
    sottocategoria: 'Sottocategoria',
    descrizione: 'Descrizione',
    conto: 'Conto',   // v1.3: prima era '' (non importato)
    tag: 'Tag',       // v1.3: prima era '' (non importato)
    note: 'Note',
  },
  categorie: { macrocategoria: 'Macro Categoria', categoria: 'Categoria', sottocategoria: 'Sottocategoria' },
};

export const getSuggestedSheets = (sheetNames) => {
  const out = { movimenti: null, categorie: null, contiIniziali: null, mutuo: null, finanziamenti: null };
  for (const n of sheetNames) {
    const l = n.toLowerCase();
    if (!out.movimenti && /movimenti/.test(l)) out.movimenti = n;
    if (!out.categorie && /anagrafica/.test(l)) out.categorie = n;
    if (!out.contiIniziali && /conti.?iniziali/.test(l)) out.contiIniziali = n;
    if (!out.mutuo && /^mutuo$/.test(l)) out.mutuo = n;
    if (!out.finanziamenti && /finanziament/.test(l)) out.finanziamenti = n;
  }
  if (!out.movimenti) out.movimenti = sheetNames.find(n => /movim|transaz|operaz/i.test(n)) || null;
  if (!out.categorie) out.categorie = sheetNames.find(n => /anagrafic|categor/i.test(n)) || null;
  return out;
};

export const autoDetectMapping = (sheetNames, fogli) => {
  const s = getSuggestedSheets(sheetNames);
  if (!s.movimenti || !s.categorie) return null;
  const mov = fogli[s.movimenti] || [];
  const cat = fogli[s.categorie] || [];
  if (!mov.length || !cat.length) return null;
  const movCols = Object.keys(mov[0]), catCols = Object.keys(cat[0]);
  const okMov = ['Data', 'Importo', 'Tipo Movimento'].every(c => movCols.includes(c));
  const okCat = ['Macro Categoria', 'Categoria'].every(c => catCols.includes(c));
  return (okMov && okCat) ? { sheets: s, mapping: MAPPING_LORENZO } : null;
};

export const leggiExcel = (file) => new Promise((res, rej) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const fogli = {};
      wb.SheetNames.forEach(name => { fogli[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }); });
      res({ wb, fogli, sheetNames: wb.SheetNames });
    } catch (err) { rej(err); }
  };
  reader.onerror = rej;
  reader.readAsArrayBuffer(file);
});

export const salvaMapping = async (config) => dbAdd('mapping_excel', { id: 'default', configurazione: config });
export const getMapping = async () => (await dbGet('mapping_excel', 'default'))?.configurazione || null;

const determinaTipo = (raw, importo) => {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('trasfer')) return 'trasferimento';
  if (s.includes('entrat')) return 'entrata';
  if (s.includes('uscit') || s.includes('spes')) return 'spesa';
  return importo < 0 ? 'spesa' : 'entrata';
};

export const importaCategorie = async (rows, mapping) => {
  const seen = new Set(), items = [];
  for (const r of rows) {
    const mc = String(r[mapping.macrocategoria] || '').trim();
    const c = String(r[mapping.categoria] || '').trim();
    const sc = String(r[mapping.sottocategoria] || '').trim();
    if (!mc && !c) continue;
    const key = `${mc}|${c}|${sc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ id: uid(), macrocategoria: mc, categoria: c, sottocategoria: sc, attiva: true });
  }
  if (items.length) await dbBulkPut('categorie', items);
  await refreshAll();
  return items.length;
};

// importaMovimenti — riscritta per il fix di performance descritto in testa al file.
// FASE 1 (pura, in memoria): trasforma ogni riga Excel in un oggetto movimento pronto.
// FASE 2 (un solo accesso DB): dbBulkPut su tutto l'array in una transazione sola.
// FASE 3: un solo refreshAll() finale.
export const importaMovimenti = async (rows, mapping) => {
  const now = new Date().toISOString();
  const pronti = [];

  for (const row of rows) {
    const impRaw = row[mapping.importo];
    const imp = parseFloat(String(impRaw).replace(',', '.')) || 0;
    if (!imp) continue;

    const tipo = determinaTipo(row[mapping.tipo], imp);
    const isTrasferimento = tipo === 'trasferimento';
    const contoRaw = mapping.conto ? (row[mapping.conto] || '') : '';

    pronti.push({
      id: uid(),
      data: parseDataIntelligente(row[mapping.data]), // sempre interpretata come gg/mm/aaaa
      tipo,
      macrocategoria: row[mapping.macrocategoria] || '',
      categoria: row[mapping.categoria] || '',
      sottocategoria: row[mapping.sottocategoria] || '',
      conto: contoRaw,
      conto_origine: isTrasferimento ? contoRaw : null,
      conto_destinazione: null, // l'Excel storico non distingue origine/destinazione per i vecchi trasferimenti
      tag: mapping.tag ? String(row[mapping.tag] || '').split(',').map(s => s.trim()).filter(Boolean) : [],
      descrizione: row[mapping.descrizione] || '',
      note: mapping.note ? (row[mapping.note] || '') : '',
      importo: round2(Math.abs(imp)),
      ricorrente_id: null,
      is_eccezione_ricorrenza: false,
      data_creazione: now,
      data_modifica: now,
      origine: 'import',
    });
  }

  if (pronti.length) await dbBulkPut('movimenti', pronti);
  await dbAdd('impostazioni', { chiave: 'ultimo_import', valore: now });
  await refreshAll();
  return pronti.length;
};

// --- Import dati v1.3: Conti Iniziali, Mutuo, Finanziamenti --------------------------
// Questi fogli hanno un formato diverso da Movimenti (poche righe, struttura chiave/valore
// o una riga per conto), quindi si leggono con funzioni dedicate invece che col wizard
// di mapping colonne pensato per lo storico movimenti.
//
// NOTA: i nomi di colonna/chiave qui sotto sono stati verificati sul file Excel v2 reale
// (Gestione_Finanze_Personali_v2_corretto.xlsx) durante lo sviluppo, non assunti a priori.

// La colonna "Tipo" del foglio Conti Iniziali contiene etichette leggibili in italiano,
// da tradurre negli identificatori tecnici usati internamente da contiService.js
// (TIPOLOGIE_CONTO: liquidita, risparmio, investimenti, asset, debiti).
// IMPORTANTE: l'Excel reale usa 'Investimento' al SINGOLARE per la colonna Tipo
// (verificato leggendo il file riga per riga durante il test di import simulato —
// un mismatch singolare/plurale qui avrebbe silenziosamente classificato Revolut
// Investimenti, Satispay Investimenti, Binance e Fideuram come liquidità invece che
// investimenti, viziando il calcolo del patrimonio per circa 35.000€).
const MAPPA_TIPOLOGIA_CONTO = {
  'liquidità': 'liquidita', 'liquidita': 'liquidita',
  'risparmio': 'risparmio',
  'investimento': 'investimenti', 'investimenti': 'investimenti', // Excel usa il singolare
  'asset': 'asset',
  'debiti': 'debiti', 'debito': 'debiti',
};

const normalizzaTipologia = (raw) => MAPPA_TIPOLOGIA_CONTO[String(raw || '').trim().toLowerCase()] || 'liquidita';

export const importaContiIniziali = async (rows) => {
  // Colonne reali confermate: Nome Conto | Tipo | Saldo | Data Saldo | Note
  const items = rows.filter(r => r['Nome Conto']).map(r => ({
    id: uid(),
    nome: r['Nome Conto'] || '',
    tipologia: normalizzaTipologia(r['Tipo']),
    saldo_iniziale: round2(parseFloat(String(r['Saldo'] ?? 0).replace(',', '.')) || 0),
    data_saldo: parseDataIntelligente(r['Data Saldo']),
    descrizione: r['Note'] || '',
    attivo: true,
  }));
  if (items.length) await dbBulkPut('conti', items);
  await refreshAll();
  return items.length;
};

// Foglio "Mutuo" in formato chiave/valore a due colonne (Campo, Valore). Colonna chiave
// confermata: 'Campo' / 'Valore' (non genericamente "le prime due colonne", per
// robustezza nel caso l'ordine delle colonne cambi in futuro).
function leggiChiaveValore(rows) {
  const kv = {};
  rows.forEach(r => {
    const campo = r['Campo'] ?? Object.values(r)[0];
    const valore = r['Valore'] ?? Object.values(r)[1];
    if (campo != null) kv[String(campo).trim()] = valore;
  });
  return kv;
}

export const importaMutuo = async (rows) => {
  if (!rows.length) return false;
  const kv = leggiChiaveValore(rows);

  const obj = {
    id: 'mutuo-principale',
    importo_iniziale: round2(parseFloat(String(kv['Importo Iniziale'] ?? 0).replace(',', '.')) || 0),
    tasso: parseFloat(String(kv['Tasso Annuo %'] ?? 0).replace(',', '.')) || 0,
    durata_mesi: parseInt(kv['Durata Mesi'] ?? 0, 10) || 0,
    rata_mensile: round2(parseFloat(String(kv['Rata Mensile'] ?? 0).replace(',', '.')) || 0),
    data_inizio: parseDataIntelligente(kv['Data Inizio']),
    banca: kv['Banca'] || '',
    quota_utente_percentuale: parseFloat(kv['Tua Percentuale'] ?? 100) || 100,
  };
  await dbAdd('mutuo', obj);
  await refreshAll();
  return true;
};

// Il foglio "Finanziamenti" nell'Excel v2 ha la STESSA struttura chiave/valore del
// foglio "Mutuo" (Campo, Valore), non righe multiple come ipotizzato inizialmente.
// In v1.3 l'app gestisce un singolo finanziamento alla volta da questo foglio
// (id fisso 'finanziamento-importato'); finanziamenti aggiuntivi si creano dal
// wizard "+ Nuovo finanziamento" nell'app, che invece genera id distinti.
export const importaFinanziamenti = async (rows) => {
  if (!rows.length) return 0;
  const kv = leggiChiaveValore(rows);
  if (!kv['Nome']) return 0;

  const obj = {
    id: 'finanziamento-importato',
    nome: kv['Nome'] || '',
    importo_iniziale: round2(parseFloat(String(kv['Importo Iniziale'] ?? 0).replace(',', '.')) || 0),
    tasso: parseFloat(String(kv['Tasso Annuo %'] ?? 0).replace(',', '.')) || 0,
    rata_mensile: round2(parseFloat(String(kv['Rata Mensile'] ?? 0).replace(',', '.')) || 0),
    durata_mesi: parseInt(kv['Durata Mesi'] ?? 0, 10) || 0,
    data_inizio: parseDataIntelligente(kv['Data Inizio']),
    quota_utente_percentuale: parseFloat(kv['Tua Percentuale'] ?? 100) || 100,
    attivo: true,
  };
  await dbBulkPut('finanziamenti', [obj]);
  await refreshAll();
  return 1;
};

// --- Export ----------------------------------------------------------------------

export const exportFullExcel = async (filename = `backup_${todayDDMMYYYY()}.xlsx`) => {
  const wb = XLSX.utils.book_new();
  const sheets = {
    Movimenti: state.movimenti.map(m => ({ ...m, tag: (m.tag || []).join(', ') })),
    Categorie: state.categorie,
    Conti: state.conti,
    Tag: state.tag,
    Ricorrenti: state.ricorrenti.map(r => ({ ...r, tag: (r.tag || []).join(', ') })),
    Budget: state.budget,
    Mutuo: state.mutuo ? [state.mutuo] : [],
    Finanziamenti: state.finanziamenti,
  };
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  // Versione struttura dati salvata nel file stesso: utile in futuro per sapere
  // a colpo d'occhio se un vecchio backup è compatibile con lo schema corrente
  // prima di reimportarlo (suggerimento discusso in fase di revisione progetto).
  const meta = XLSX.utils.json_to_sheet([{ chiave: 'versione_schema', valore: '1.3' }, { chiave: 'data_export', valore: new Date().toISOString() }]);
  XLSX.utils.book_append_sheet(wb, meta, '_Meta');

  XLSX.writeFile(wb, filename);
  toast('Export completato');
};

export const exportIncrementale = async () => {
  const last = state.impostazioni['ultimo_import'] || '1970-01-01';
  const rows = state.movimenti.filter(m => m.data_creazione > last);
  if (!rows.length) { toast('Nessun nuovo movimento'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.map(m => ({ ...m, tag: (m.tag || []).join(', ') })));
  XLSX.utils.book_append_sheet(wb, ws, 'Nuovi');
  XLSX.writeFile(wb, `incrementale_${todayDDMMYYYY()}.xlsx`);
  toast(`Esportati ${rows.length} movimenti`);
};
