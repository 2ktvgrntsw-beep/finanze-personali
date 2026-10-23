// naturaService.js — Bisogni e desideri.
//
// Ogni CATEGORIA di spesa è un bisogno ('B') o un desiderio ('D'). Le sottocategorie
// ereditano dalla categoria; una sottocategoria può fare ECCEZIONE solo se l'utente
// lo sceglie. Nessuna eccezione sulla singola spesa (scelta dell'utente): ogni spesa
// prende la natura della sua categoria/sottocategoria.
//
// Persistenza: store 'natura' (incluso nel backup), chiave 'Macro›Cat' per la
// categoria e 'Macro›Cat›Sub' per l'eccezione. Le rinomine di categoria spostano le
// chiavi (vedi rinominaChiaviNatura, chiamata da categorieService).

import { dbAdd, dbDelete, dbGet, dbBulkPut } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { round2, todayISO } from '../core/utils.js';

export const SEP = '›';
const FLAG = 'natura_v1';
export const chiaveCat = (macro, cat) => `${macro}${SEP}${cat}`;
export const chiaveSub = (macro, cat, sub) => `${macro}${SEP}${cat}${SEP}${sub}`;

// Macro che non sono spese: lì bisogno/desiderio non ha senso
const MACRO_NON_SPESA = ['Entrate', 'Investimenti'];
export const macroDiSpesa = (macro) => !!macro && !MACRO_NON_SPESA.includes(macro);

// Natura effettiva: eccezione della sottocategoria, altrimenti la categoria.
// null = da classificare.
export const naturaDi = (macro, cat, sub = '') => {
  if (sub) { const e = state.natura[chiaveSub(macro, cat, sub)]; if (e) return e; }
  return state.natura[chiaveCat(macro, cat)] || null;
};
export const naturaCategoria = (macro, cat) => state.natura[chiaveCat(macro, cat)] || null;
export const eccezioneSub = (macro, cat, sub) => state.natura[chiaveSub(macro, cat, sub)] || null;

export const impostaNaturaCategoria = async (macro, cat, valore) => {
  await dbAdd('natura', { chiave: chiaveCat(macro, cat), valore });
  // un'eccezione uguale alla nuova natura della categoria non è più un'eccezione
  const prefisso = chiaveCat(macro, cat) + SEP;
  for (const [k, v] of Object.entries(state.natura)) {
    if (k.startsWith(prefisso) && v === valore) await dbDelete('natura', k);
  }
  await refreshAll();
};

// Tocco su una sottocategoria: alterna tra "come la categoria" ed "eccezione opposta"
export const alternaEccezioneSub = async (macro, cat, sub) => {
  const k = chiaveSub(macro, cat, sub);
  const base = naturaCategoria(macro, cat);
  const attuale = state.natura[k] || base;
  const nuova = attuale === 'B' ? 'D' : 'B';
  if (base && nuova === base) await dbDelete('natura', k);
  else await dbAdd('natura', { chiave: k, valore: nuova });
  await refreshAll();
};

// Rinomina di un nodo categoria: le chiavi seguono il nome
export const rinominaChiaviNatura = async (livello, macro, cat, sub, nuovoNome) => {
  const parti = (k) => k.split(SEP);
  const mosse = [];
  for (const [k, v] of Object.entries(state.natura)) {
    const [m, c, s] = parti(k);
    if (m !== macro) continue;
    let nk = null;
    if (livello === 'macro') nk = [nuovoNome, c, s].filter(x => x !== undefined).join(SEP);
    else if (livello === 'cat' && c === cat) nk = [m, nuovoNome, s].filter(x => x !== undefined).join(SEP);
    else if (livello === 'sub' && c === cat && s === sub) nk = chiaveSub(m, c, nuovoNome);
    if (nk && nk !== k) mosse.push([k, nk, v]);
  }
  for (const [k, nk, v] of mosse) { await dbDelete('natura', k); await dbAdd('natura', { chiave: nk, valore: v }); }
};

// Eliminazione di un nodo: via anche le sue chiavi (con riassegnazione i movimenti
// prendono la natura della categoria di arrivo, che ha già la sua)
export const eliminaChiaviNatura = async (livello, macro, cat, sub) => {
  for (const k of Object.keys(state.natura)) {
    const [m, c, s] = k.split(SEP);
    if (m !== macro) continue;
    if (livello === 'macro' || (livello === 'cat' && c === cat) || (livello === 'sub' && c === cat && s === sub)) await dbDelete('natura', k);
  }
};

// ─── aggregazione per l'Analisi ─────────────────────────────────────────────
// mesi: elenco 'AAAA-MM' del periodo. Ritorna i totali per mese e per voce.
export const aggregaNatura = (mesi) => {
  const idx = new Map(mesi.map((m, i) => [m, i]));
  const B = mesi.map(() => 0), D = mesi.map(() => 0), N = mesi.map(() => 0);
  const voci = { B: {}, D: {}, N: {} };
  const perMeseVoci = { B: mesi.map(() => ({})), D: mesi.map(() => ({})), N: mesi.map(() => ({})) };
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    const i = idx.get((m.annomese || m.data.slice(0, 7)));
    if (i === undefined) continue;
    const nat = naturaDi(m.macro, m.cat, m.sub) || 'N';
    (nat === 'B' ? B : nat === 'D' ? D : N)[i] += m.imp;
    // voce: la categoria, oppure "categoria › sub" se la sub è un'eccezione
    const voce = (m.sub && eccezioneSub(m.macro, m.cat, m.sub)) ? `${m.cat} › ${m.sub}` : (m.cat || m.macro);
    const chiave = `${m.macro}${SEP}${voce}`;
    voci[nat][chiave] = (voci[nat][chiave] || 0) + m.imp;
    perMeseVoci[nat][i][chiave] = (perMeseVoci[nat][i][chiave] || 0) + m.imp;
  }
  const r = (a) => a.map(round2);
  return { B: r(B), D: r(D), N: r(N), voci, perMeseVoci };
};

// Categorie di spesa (macro, cat) usate nei movimenti ma senza natura
export const daClassificare = () => {
  const out = new Map();
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa' || !macroDiSpesa(m.macro) || !m.cat) continue;
    if (naturaDi(m.macro, m.cat, m.sub)) continue;
    const k = chiaveCat(m.macro, m.cat);
    out.set(k, { macro: m.macro, cat: m.cat, imp: round2((out.get(k)?.imp || 0) + m.imp) });
  }
  return [...out.values()].sort((a, b) => b.imp - a.imp);
};

// ─── classificazione iniziale (una tantum) ──────────────────────────────────
// Quella concordata con l'utente. Tutto ciò che non è nell'elenco dei bisogni è
// un desiderio; le sottocategorie elencate fanno eccezione.
const BISOGNI = [
  'Casa›Affitto/Mutuo', 'Casa›Spese Condominiali', 'Casa›Tasse', 'Casa›Spesa Alimentare', 'Casa›Utenze',
  'Casa›Manutenzione Casa', 'Assicurazioni›Casa', 'Assicurazioni›Vita/Salute', 'Assicurazioni›Auto',
  'Salute›Farmaci', 'Salute›Visite Mediche', 'Trasporti›Rate Auto', 'Trasporti›Manutenzione Auto',
  'Trasporti›Parcheggio', 'Trasporti›Trasporti Pubblici', 'Trasporti›Carburante', 'Trasporti›Bollo',
  'Animali Domestici›Cibo per Animali', 'Animali Domestici›Articoli per Animali', 'Animali Domestici›Veterinario',
];
const ECCEZIONI = {
  'Casa›Utenze›Abbonamenti TV': 'D', 'Casa›Utenze›Pulizie': 'D',
  'Casa›Articoli per la Casa›Beni di Consumo': 'B', 'Casa›Articoli per la Casa›Elettrodomestici': 'B',
  'Salute›Cure personali›Barbiere': 'B',
};

export const migraNaturaSeNecessario = async () => {
  if (await dbGet('meta', FLAG)) return 0;
  if (Object.keys(state.natura).length) { await dbAdd('meta', { chiave: FLAG, valore: todayISO() }); return 0; }
  const coppie = new Set();
  for (const c of state.categorie) if (macroDiSpesa(c.macro) && c.cat) coppie.add(chiaveCat(c.macro, c.cat));
  for (const m of state.movimenti) if (m.tipo === 'spesa' && macroDiSpesa(m.macro) && m.cat) coppie.add(chiaveCat(m.macro, m.cat));
  if (!coppie.size) { await dbAdd('meta', { chiave: FLAG, valore: todayISO() }); return 0; }
  const righe = [...coppie].map(k => ({ chiave: k, valore: BISOGNI.includes(k) ? 'B' : 'D' }));
  for (const [k, v] of Object.entries(ECCEZIONI)) {
    const cat = k.split(SEP).slice(0, 2).join(SEP);
    if (coppie.has(cat)) righe.push({ chiave: k, valore: v });
  }
  await dbBulkPut('natura', righe);
  await dbAdd('meta', { chiave: FLAG, valore: todayISO() });
  await refreshAll();
  return righe.length;
};
