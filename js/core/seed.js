// seed.js — Caricamento iniziale dello storico precaricato.
// Al PRIMO avvio dell'app (database vuoto), inietta nel DB tutto lo storico di Lorenzo
// già preparato in build (data/storico.js): 5.625 movimenti, conti, categorie, mutuo,
// finanziamenti. Idempotente: un flag in 'meta' garantisce che avvenga una sola volta,
// così ai riavvii successivi i dati non vengono duplicati.

import { STORICO } from '../../data/storico.js';
import { dbBulkPut, dbAdd, dbGet } from './db.js';
import { uid, annomese, round2 } from './utils.js';

const FLAG = 'seed_storico_completato';

export const seedStoricoSeNecessario = async () => {
  const gia = await dbGet('meta', FLAG);
  if (gia && gia.valore === true) return false;   // già seminato

  // --- Movimenti: aggiungo annomese (per l'indice) e normalizzo i campi ---
  const movimenti = STORICO.movimenti.map(m => ({
    id: m.id || uid(),
    data: m.data,
    annomese: annomese(m.data),
    tipo: m.tipo,                      // 'spesa' | 'entrata' | 'trasferimento'
    macro: m.macro || '',
    cat: m.cat || '',
    sub: m.sub || '',
    conto: m.conto || '',
    contoDest: m.contoDest || '',      // per i trasferimenti (destinazione)
    tag: Array.isArray(m.tag) ? m.tag : [],
    desc: m.desc || '',
    note: m.note || '',
    imp: round2(m.imp),
    origine: 'storico',                // marcati come provenienti dallo storico
  }));
  await dbBulkPut('movimenti', movimenti);

  // --- Conti ---
  const conti = STORICO.conti.map(c => ({
    id: uid(),
    nome: c.nome,
    tipo: c.tipo,                      // liquidita|risparmio|investimenti|asset|debiti
    saldo_iniziale: round2(c.saldo_iniziale),
    data_saldo: c.data_saldo,
    note: c.note || '',
    attivo: true,
  }));
  await dbBulkPut('conti', conti);

  // --- Categorie (gerarchia macro/cat/sub) ---
  const categorie = STORICO.categorie.map(c => ({
    id: uid(),
    macro: c.macro,
    cat: c.cat || '',
    sub: c.sub || '',
    attiva: true,
  }));
  await dbBulkPut('categorie', categorie);

  // --- Tag (se presenti; nello storico di Lorenzo sono 0, si popoleranno con l'uso) ---
  if (STORICO.tag && STORICO.tag.length) {
    const tags = STORICO.tag.map(nome => ({ id: uid(), nome, colore: '' }));
    await dbBulkPut('tag', tags);
  }

  // --- Mutuo ---
  if (STORICO.mutuo && STORICO.mutuo.importo_iniziale) {
    await dbAdd('mutuo', { id: 'mutuo-principale', ...STORICO.mutuo });
  }

  // --- Finanziamenti ---
  if (STORICO.finanziamenti && STORICO.finanziamenti.length) {
    const fin = STORICO.finanziamenti.map((f, i) => ({ id: 'fin-' + i, ...f, attivo: true }));
    await dbBulkPut('finanziamenti', fin);
  }

  // --- Suggerimenti pre-addestrati: dallo storico costruisco la mappa
  //     descrizione(normalizzata) -> classificazione più frequente ---
  await _addestraSuggerimenti(movimenti);

  await dbAdd('meta', { chiave: FLAG, valore: true, data: new Date().toISOString() });
  return true;
};

// Costruisce i suggerimenti: per ogni descrizione ricorrente, memorizza la
// classificazione (macro/cat/sub/conto) usata più spesso. Così dal primo giorno
// scrivendo "Conad" l'app propone già la categoria giusta.
const _addestraSuggerimenti = async (movimenti) => {
  const mappa = {};   // chiave normalizzata -> { conteggi per combinazione }
  for (const m of movimenti) {
    const chiave = _normDesc(m.desc);
    if (!chiave) continue;
    const combo = JSON.stringify({ macro: m.macro, cat: m.cat, sub: m.sub, conto: m.conto, tipo: m.tipo });
    mappa[chiave] = mappa[chiave] || { desc: m.desc, combos: {} };
    mappa[chiave].combos[combo] = (mappa[chiave].combos[combo] || 0) + 1;
  }

  const items = Object.entries(mappa).map(([chiave, v]) => {
    // scelgo la combinazione più frequente
    let best = null, bestN = 0;
    for (const [combo, n] of Object.entries(v.combos)) {
      if (n > bestN) { bestN = n; best = combo; }
    }
    return { chiave, desc: v.desc, classificazione: JSON.parse(best), occorrenze: bestN };
  });

  await dbBulkPut('suggerimenti', items);
};

export const _normDesc = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
