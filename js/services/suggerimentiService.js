// suggerimentiService.js — Motore di suggerimento descrizione -> classificazione.
// Impara da ogni movimento inserito (e dallo storico al seed). Quando l'utente scrive
// 2-3 lettere nella descrizione, propone la classificazione (macro/cat/sub/conto) usata
// più spesso per descrizioni simili. Distingue descrizione (libera) da classificazione.

import { dbAdd, dbGet, dbBulkPut, dbDelete } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { _normDesc } from '../core/seed.js';

// Apprende (o rinforza) l'associazione descrizione -> classificazione da un movimento.
export const apprendiDaMovimento = async (m) => {
  const chiave = _normDesc(m.desc);
  if (!chiave) return;
  const esistente = await dbGet('suggerimenti', chiave);
  const classificazione = { macro: m.macro, cat: m.cat, sub: m.sub, conto: m.conto, tipo: m.tipo };

  if (!esistente) {
    await dbAdd('suggerimenti', { chiave, desc: m.desc, classificazione, occorrenze: 1, ultimoUso: new Date().toISOString() });
  } else {
    // rinforza: se la classificazione coincide aumenta il contatore, altrimenti
    // aggiorna verso l'ultima usata (l'utente potrebbe aver cambiato abitudine)
    const stessa = JSON.stringify(esistente.classificazione) === JSON.stringify(classificazione);
    await dbAdd('suggerimenti', {
      chiave,
      desc: m.desc,
      classificazione: stessa ? esistente.classificazione : classificazione,
      occorrenze: (esistente.occorrenze || 1) + 1,
      ultimoUso: new Date().toISOString(),
    });
  }
};

// Restituisce fino a `limite` suggerimenti per il testo digitato.
// Ogni suggerimento: { desc, classificazione, occorrenze }.
export const suggerisciPerTesto = (testo, limite = 5) => {
  const q = _normDesc(testo);
  if (q.length < 2) return [];
  // Punteggio = frequenza + bonus di RECENZA: le descrizioni che hai usato di recente
  // emergono sopra le migliaia di voci dello storico (che hanno occorrenze altissime e
  // altrimenti riempirebbero da sole la tendina, facendola sembrare "solo vecchio archivio").
  const ORA = Date.now();
  const _giorni = (iso) => iso ? (ORA - new Date(iso).getTime()) / 86400000 : Infinity;
  const _score = (s) => {
    const g = _giorni(s.ultimoUso);
    const bonus = g <= 45 ? 80 : g <= 180 ? 25 : 0;
    return (s.occorrenze || 0) + bonus;
  };
  const out = state.suggerimenti
    .filter(s => s.chiave.includes(q))
    .sort((a, b) => {
      // priorità: chi inizia col testo, poi punteggio (frequenza + recenza)
      const aStart = a.chiave.startsWith(q) ? 0 : 1;
      const bStart = b.chiave.startsWith(q) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return _score(b) - _score(a);
    })
    .slice(0, limite);
  return out;
};

// --- Suggerimento tag (auto-completamento) ---
export const suggerisciTag = (testo, limite = 8) => {
  const q = (testo || '').trim().toLowerCase();
  // unione: anagrafica tag + tag REALMENTE USATI nei movimenti (ordinati per frequenza).
  // Prima pescava solo dall'anagrafica (popolata solo dall'inserimento massivo):
  // i tag inseriti a mano nei movimenti non venivano mai suggeriti.
  const freq = {};
  for (const t of state.tag) freq[t.nome] = (freq[t.nome] || 0) + 1;
  for (const m of state.movimenti) {
    if (Array.isArray(m.tag)) for (const t of m.tag) if (t) freq[t] = (freq[t] || 0) + 1;
  }
  const nomi = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  if (!q) return nomi.slice(0, limite);
  return nomi.filter(n => n.toLowerCase().includes(q)).slice(0, limite);
};

// ─────────────────────────────────────────────────────────────────────────────
// RIALLINEAMENTO: ricostruisce i suggerimenti dai movimenti COME SONO ADESSO.
//
// I suggerimenti sono una cache: si costruiscono dai movimenti e vivono in un archivio
// separato, perché ricalcolarli ad ogni battuta su migliaia di righe sarebbe lento. Il
// rovescio è che possono invecchiare: se correggi la classificazione di cento movimenti,
// la cache continuerebbe a proporre quella vecchia. Questa funzione la riallinea alla
// realtà, e va chiamata dopo ogni modifica massiva della classificazione.
//
// Conserva 'ultimoUso' dove c'era: è l'informazione di recenza, che dai movimenti non si
// ricava e che serve a far emergere ciò che hai usato di recente.
// ─────────────────────────────────────────────────────────────────────────────
export const riallineaSuggerimenti = async () => {
  const precedenti = new Map(state.suggerimenti.map(s => [s.chiave, s]));
  const mappa = {};
  for (const m of state.movimenti) {
    const chiave = _normDesc(m.desc);
    if (!chiave) continue;
    const combo = JSON.stringify({ macro: m.macro, cat: m.cat, sub: m.sub, conto: m.conto, tipo: m.tipo });
    mappa[chiave] = mappa[chiave] || { desc: m.desc, combos: {}, ultimaData: '' };
    mappa[chiave].combos[combo] = (mappa[chiave].combos[combo] || 0) + 1;
    if (m.data > mappa[chiave].ultimaData) { mappa[chiave].ultimaData = m.data; mappa[chiave].desc = m.desc; }
  }
  const items = Object.entries(mappa).map(([chiave, v]) => {
    let best = null, bestN = 0;
    for (const [combo, n] of Object.entries(v.combos)) if (n > bestN) { bestN = n; best = combo; }
    const pre = precedenti.get(chiave);
    return {
      chiave, desc: v.desc, classificazione: JSON.parse(best), occorrenze: bestN,
      ultimoUso: (pre && pre.ultimoUso) || (v.ultimaData ? v.ultimaData + 'T12:00:00.000Z' : undefined),
    };
  });
  // le voci non più presenti in nessun movimento vanno tolte, non lasciate a invecchiare
  const vive = new Set(items.map(i => i.chiave));
  for (const s of state.suggerimenti) if (!vive.has(s.chiave)) await dbDelete('suggerimenti', s.chiave);
  await dbBulkPut('suggerimenti', items);
  await refreshAll();
  return items.length;
};
