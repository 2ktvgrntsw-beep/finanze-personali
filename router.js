// suggerimentiService.js — Motore di suggerimento descrizione -> classificazione.
// Impara da ogni movimento inserito (e dallo storico al seed). Quando l'utente scrive
// 2-3 lettere nella descrizione, propone la classificazione (macro/cat/sub/conto) usata
// più spesso per descrizioni simili. Distingue descrizione (libera) da classificazione.

import { dbAdd, dbGet } from '../core/db.js';
import { state } from '../core/store.js';
import { _normDesc } from '../core/seed.js';

// Apprende (o rinforza) l'associazione descrizione -> classificazione da un movimento.
export const apprendiDaMovimento = async (m) => {
  const chiave = _normDesc(m.desc);
  if (!chiave) return;
  const esistente = await dbGet('suggerimenti', chiave);
  const classificazione = { macro: m.macro, cat: m.cat, sub: m.sub, conto: m.conto, tipo: m.tipo };

  if (!esistente) {
    await dbAdd('suggerimenti', { chiave, desc: m.desc, classificazione, occorrenze: 1 });
  } else {
    // rinforza: se la classificazione coincide aumenta il contatore, altrimenti
    // aggiorna verso l'ultima usata (l'utente potrebbe aver cambiato abitudine)
    const stessa = JSON.stringify(esistente.classificazione) === JSON.stringify(classificazione);
    await dbAdd('suggerimenti', {
      chiave,
      desc: m.desc,
      classificazione: stessa ? esistente.classificazione : classificazione,
      occorrenze: (esistente.occorrenze || 1) + 1,
    });
  }
};

// Restituisce fino a `limite` suggerimenti per il testo digitato.
// Ogni suggerimento: { desc, classificazione, occorrenze }.
export const suggerisciPerTesto = (testo, limite = 5) => {
  const q = _normDesc(testo);
  if (q.length < 2) return [];
  const out = state.suggerimenti
    .filter(s => s.chiave.includes(q))
    .sort((a, b) => {
      // priorità: chi inizia col testo, poi più frequente
      const aStart = a.chiave.startsWith(q) ? 0 : 1;
      const bStart = b.chiave.startsWith(q) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return (b.occorrenze || 0) - (a.occorrenze || 0);
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
