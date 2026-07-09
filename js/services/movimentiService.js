// movimentiService.js — CRUD movimenti + aggregazioni per la home e il drill-down.

import { dbAdd, dbDelete, dbBulkPut } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid, round2, annomese, annoDi } from '../core/utils.js';
import { apprendiDaMovimento } from './suggerimentiService.js';

// --- CRUD ---
export const saveMovimento = async (m) => {
  const obj = {
    id: m.id || uid(),
    data: m.data,
    annomese: annomese(m.data),
    tipo: m.tipo || 'spesa',
    macro: m.macro || '',
    cat: m.cat || '',
    sub: m.sub || '',
    conto: m.conto || '',
    contoDest: m.contoDest || '',
    tag: Array.isArray(m.tag) ? m.tag : [],
    desc: m.desc || '',
    note: m.note || '',
    imp: round2(m.imp),
    origine: m.origine || 'utente',
  };
  await dbAdd('movimenti', obj);
  // l'app impara da ogni inserimento (descrizione -> classificazione)
  if (obj.desc && obj.origine === 'utente') await apprendiDaMovimento(obj);
  await refreshAll();
  return obj;
};

export const deleteMovimento = async (id) => {
  await dbDelete('movimenti', id);
  await refreshAll();
};

// Applica una modifica ai movimenti passati che corrispondono a una ricorrenza
// (riconosciuti per descrizione + importo, o sottocategoria + importo per le rate).
// Usato dalla modifica ricorrente con ambito "anche le passate".
export const applicaModificaAmbito = async (ricorrenza, modifiche, ambito) => {
  if (ambito !== 'tutte') return 0;
  const desc = (ricorrenza.desc || ricorrenza.nome || '').toLowerCase();
  const sub = ricorrenza.sub || '';
  const impVecchio = ricorrenza.imp;

  const daAggiornare = state.movimenti.filter(m => {
    const matchDesc = desc && (m.desc || '').toLowerCase() === desc;
    const matchSub = sub && m.sub === sub && Math.abs(m.imp - impVecchio) < 0.02;
    return matchDesc || matchSub;
  }).map(m => { const n = { ...m, ...modifiche }; n.annomese = annomese(n.data); return n; });

  if (daAggiornare.length) { await dbBulkPut('movimenti', daAggiornare); await refreshAll(); }
  return daAggiornare.length;
};

// Modifica massiva: applica un set di modifiche a una lista di id di movimenti.
// Usata dalla selezione multipla nella ricerca. Ogni campo in `modifiche` sovrascrive.
export const modificaMassiva = async (ids, modifiche) => {
  const set = new Set(ids);
  const daAggiornare = state.movimenti.filter(m => set.has(m.id)).map(m => {
    const nuovo = { ...m };
    for (const [k, v] of Object.entries(modifiche)) {
      if (v !== undefined && v !== null && v !== '') nuovo[k] = v;
    }
    nuovo.annomese = annomese(nuovo.data);
    return nuovo;
  });
  if (daAggiornare.length) { await dbBulkPut('movimenti', daAggiornare); await refreshAll(); }
  return daAggiornare.length;
};

// Modifica massiva multi-campo: applica a tutti gli id selezionati i campi indicati.
// patch può contenere: tipo, macro, cat, sub, conto, contoDest, desc, e tagAdd (tag da aggiungere).
export const modificaBulk = async (ids, patch) => {
  const set = new Set(ids);
  const daAggiornare = state.movimenti.filter(m => set.has(m.id)).map(m => {
    const nuovo = { ...m };
    if (patch.tipo !== undefined) nuovo.tipo = patch.tipo;
    if (patch.macro !== undefined) { nuovo.macro = patch.macro; nuovo.cat = patch.cat || ''; nuovo.sub = patch.sub || ''; }
    if (patch.conto !== undefined) nuovo.conto = patch.conto;
    if (patch.contoDest !== undefined) nuovo.contoDest = patch.contoDest;
    if (patch.desc !== undefined && patch.desc !== '') nuovo.desc = patch.desc;
    if (patch.tagAdd) nuovo.tag = Array.from(new Set([...(m.tag || []), patch.tagAdd]));
    return nuovo;
  });
  await dbBulkPut('movimenti', daAggiornare);
  await refreshAll();
  return daAggiornare.length;
};

// Applica un tag in blocco a una lista di movimenti (wrapper di modificaBulk).
// Usato dalla ricerca (selezione multipla) e dalle impostazioni (bulk tag retroattivo).
export const applicaTagBulk = async (ids, tagNome) => {
  if (!tagNome) return 0;
  return modificaBulk(ids, { tagAdd: tagNome });
};

// --- Filtri di base ---
// Le spese "vere" per la home escludono i trasferimenti (che non sono spese).
export const soloSpese = (movs) => movs.filter(m => m.tipo === 'spesa');
export const soloEntrate = (movs) => movs.filter(m => m.tipo === 'entrata');
export const soloTrasferimenti = (movs) => movs.filter(m => m.tipo === 'trasferimento');

// --- Totali di periodo ---
export const totaliPeriodo = (movs) => {
  let spese = 0, entrate = 0, investito = 0;
  for (const m of movs) {
    if (m.tipo === 'spesa') spese += m.imp;
    else if (m.tipo === 'entrata') entrate += m.imp;
    else if (m.tipo === 'trasferimento') {
      // conta come "investito/accantonato" se la destinazione è un conto risparmio/investimenti
      const dest = state.conti.find(c => c.nome === m.contoDest);
      if (dest && (dest.tipo === 'investimenti' || dest.tipo === 'risparmio')) investito += m.imp;
    }
  }
  return { spese: round2(spese), entrate: round2(entrate), saldo: round2(entrate - spese), investito: round2(investito) };
};

// --- Aggregazione per livello (drill-down) ---
// livello: 'macro' | 'cat' | 'sub'. filtro opzionale { macro, cat }.
// Ritorna righe { chiave, totale, count } ordinate per totale desc.
export const aggregaPerLivello = (movs, livello, filtro = {}) => {
  let spese = soloSpese(movs);
  if (filtro.macro) spese = spese.filter(m => m.macro === filtro.macro);
  if (filtro.cat) spese = spese.filter(m => m.cat === filtro.cat);

  const campo = livello === 'macro' ? 'macro' : livello === 'cat' ? 'cat' : 'sub';
  const agg = {};
  for (const m of spese) {
    const k = m[campo] || '(senza)';
    agg[k] = agg[k] || { chiave: k, totale: 0, count: 0 };
    agg[k].totale += m.imp;
    agg[k].count++;
  }
  const righe = Object.values(agg).map(r => ({ ...r, totale: round2(r.totale) }));
  righe.sort((a, b) => b.totale - a.totale);
  const tot = righe.reduce((s, r) => s + r.totale, 0);
  righe.forEach(r => r.pct = tot > 0 ? (r.totale / tot * 100) : 0);
  return righe;
};

// Movimenti di una specifica voce (per l'accesso diretto via icona)
export const movimentiDiVoce = (movs, filtro = {}) => {
  let out = movs;
  if (filtro.tipo) out = out.filter(m => m.tipo === filtro.tipo);
  if (filtro.macro) out = out.filter(m => m.macro === filtro.macro);
  if (filtro.cat) out = out.filter(m => m.cat === filtro.cat);
  if (filtro.sub) out = out.filter(m => m.sub === filtro.sub);
  return out.sort((a, b) => b.data.localeCompare(a.data));
};

// --- Media mensile spese (per i delta "vs media") ---
export const mediaSpeseMensile = (meseCorrente) => {
  const perMese = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    if (m.annomese === meseCorrente) continue;      // escludo il mese in corso
    perMese[m.annomese] = (perMese[m.annomese] || 0) + m.imp;
  }
  const valori = Object.values(perMese);
  if (!valori.length) return 0;
  return round2(valori.reduce((s, v) => s + v, 0) / valori.length);
};

// --- Spese per anno (vista Anno) ---
export const spesePerAnno = () => {
  const perAnno = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    const a = annoDi(m.data);
    perAnno[a] = (perAnno[a] || 0) + m.imp;
  }
  return Object.entries(perAnno)
    .map(([anno, tot]) => ({ anno, totale: round2(tot) }))
    .sort((a, b) => a.anno.localeCompare(b.anno));
};

// --- Investito per mese (vista investimenti nel tempo) ---
export const investitoPerMese = () => {
  const perMese = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'trasferimento') continue;
    const dest = state.conti.find(c => c.nome === m.contoDest);
    const isInv = dest ? (dest.tipo === 'investimenti') : (m.macro === 'Investimenti');
    if (!isInv) continue;
    perMese[m.annomese] = (perMese[m.annomese] || 0) + m.imp;
  }
  return Object.entries(perMese)
    .map(([mese, tot]) => ({ mese, totale: round2(tot) }))
    .sort((a, b) => a.mese.localeCompare(b.mese));
};

// --- Ricerca full-text con totale aggregato ---
// Ricerca potenziata: testo libero + FILTRI (tipo, macro, conto, intervallo date,
// intervallo importi). Ritorna totali SEPARATI per tipo, così la somma è sempre
// leggibile anche con risultati misti (spese+entrate insieme confondevano).
// Il confronto testuale IGNORA GLI ACCENTI: "caffe" trova "Caffè".
const _norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const cercaMovimenti = (query, filtri = {}) => {
  const q = _norm((query || '').trim());
  const haFiltri = filtri.tipo || filtri.macro || filtri.cat || filtri.sub || filtri.conto || filtri.da || filtri.a || filtri.min != null || filtri.max != null;
  if (!q && !haFiltri) return { risultati: [], totali: { spese: 0, entrate: 0, trasf: 0 }, count: 0 };

  // Termini di ricerca: separati da virgola = logica OR (trova chi contiene ANCHE SOLO uno).
  // "hotel, volo, marocco" -> match se il movimento contiene hotel OPPURE volo OPPURE marocco.
  // Senza virgole si comporta come prima: un unico termine.
  const termini = q ? q.split(',').map(t => t.trim()).filter(Boolean) : [];

  // Un termine matcha un movimento se compare nella DESCRIZIONE all'INIZIO di una
  // parola. Solo descrizione: per categoria/conto/periodo ci sono i Filtri, e cercare
  // ovunque falsava i risultati (cercando "spesa" arrivava tutta la macro Spese).
  // Inizio parola: "volo" trova "Volo Ryanair" ma NON "tavolo"; "dm" trova "DM"
  // ma non le parole che lo contengono in mezzo. Funziona anche con termini di più
  // parole ("spesa co" trova "Spesa Conad").
  // Un termine interamente numerico matcha anche l'importo esatto.
  const terminMatch = (m, t) => {
    if (m.desc) {
      const d = _norm(m.desc);
      let i = d.indexOf(t);
      while (i !== -1) {
        if (i === 0 || !/[a-z0-9]/.test(d[i - 1])) return true;   // confine di parola prima
        i = d.indexOf(t, i + 1);
      }
    }
    const num = parseFloat(t.replace(',', '.'));
    if (!isNaN(num) && /^[\d.,]+$/.test(t) && Math.abs(m.imp - num) < 0.005) return true;
    return false;
  };

  const risultati = state.movimenti.filter(m => {
    // filtri strutturati (tutti in AND)
    if (filtri.tipo && m.tipo !== filtri.tipo) return false;
    if (filtri.macro && m.macro !== filtri.macro) return false;
    if (filtri.cat && m.cat !== filtri.cat) return false;
    // sub: '__vuota__' = solo movimenti SENZA sottocategoria; altrimenti match esatto
    if (filtri.sub === '__vuota__') { if (m.sub) return false; }
    else if (filtri.sub && m.sub !== filtri.sub) return false;
    if (filtri.conto && m.conto !== filtri.conto) return false;
    if (filtri.da && m.data < filtri.da) return false;
    if (filtri.a && m.data > filtri.a) return false;
    if (filtri.min != null && m.imp < filtri.min) return false;
    if (filtri.max != null && m.imp > filtri.max) return false;
    // testo libero: basta che UNO dei termini matchi (OR)
    if (!termini.length) return true;
    return termini.some(t => terminMatch(m, t));
  }).sort((a, b) => b.data.localeCompare(a.data));

  const totali = {
    spese: round2(risultati.filter(m => m.tipo === 'spesa').reduce((s, m) => s + m.imp, 0)),
    entrate: round2(risultati.filter(m => m.tipo === 'entrata').reduce((s, m) => s + m.imp, 0)),
    trasf: round2(risultati.filter(m => m.tipo === 'trasferimento').reduce((s, m) => s + m.imp, 0)),
  };
  return { risultati, totali, count: risultati.length };
};
