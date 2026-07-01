// ricorrentiService.js — Ricorrenze e regole automatiche (accantonamenti).
// Una "ricorrenza" genera automaticamente movimenti alle scadenze. Le "regole
// automatiche" sono ricorrenze speciali per gli accantonamenti (es. 20€/giorno su
// deposito, PAC settimanale, ricarica a soglia) — parametrizzabili e modificabili.

import { dbAdd, dbDelete } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid, round2, todayISO } from '../core/utils.js';
import { saveMovimento } from './movimentiService.js';
import { saldoStimato } from './contiService.js';

export const FREQUENZE = ['giornaliera', 'settimanale', 'mensile', 'annuale'];

// --- CRUD ricorrenti ---
export const saveRicorrente = async (r) => {
  const dataInizio = r.dataInizio || r.prossima || todayISO();
  const obj = {
    id: r.id || uid(),
    nome: r.nome || r.desc || 'Ricorrenza',
    tipo: r.tipo || 'spesa',
    frequenza: r.frequenza || 'mensile',
    giorno: r.giorno || null,          // giorno del mese (mensile) o della settimana (settimanale)
    imp: round2(r.imp || 0),
    macro: r.macro || '', cat: r.cat || '', sub: r.sub || '',
    conto: r.conto || '', contoDest: r.contoDest || '',
    tag: r.tag || [],
    desc: r.desc || '',
    // per le regole a soglia
    modalita: r.modalita || 'fisso',   // 'fisso' | 'soglia'
    soglia: r.soglia || null,
    isRegola: r.isRegola === true,     // true = regola automatica (accantonamento)
    attiva: r.attiva !== false,
    // inizio / fine
    dataInizio,
    fineTipo: r.fineTipo || 'mai',     // 'mai' | 'data' | 'conteggio'
    fineData: r.fineData || null,      // se fineTipo === 'data'
    fineConteggio: r.fineConteggio || null,  // se fineTipo === 'conteggio' (numero di occorrenze)
    generati: r.generati || 0,         // quante occorrenze già generate (per il conteggio)
    ultimaGenerazione: r.ultimaGenerazione || null,
    prossima: r.prossima || dataInizio,
  };
  await dbAdd('ricorrenti', obj);
  await refreshAll();
  return obj;
};

export const deleteRicorrente = async (id) => { await dbDelete('ricorrenti', id); await refreshAll(); };

// Calcola la data della prossima occorrenza dopo una certa data
const prossimaData = (dataISO, frequenza) => {
  const d = new Date(dataISO + 'T00:00:00');
  if (frequenza === 'giornaliera') d.setDate(d.getDate() + 1);
  else if (frequenza === 'settimanale') d.setDate(d.getDate() + 7);
  else if (frequenza === 'mensile') d.setMonth(d.getMonth() + 1);
  else if (frequenza === 'annuale') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

// Genera i movimenti per tutte le ricorrenze scadute fino a oggi.
// Rispetta la data di fine (per data o per numero di occorrenze). I movimenti vengono
// creati SOLO quando la scadenza è effettivamente arrivata (<= oggi), mai in anticipo.
export const generaScaduti = async () => {
  const oggi = todayISO();
  let generati = 0;

  for (const r of state.ricorrenti) {
    if (r.attiva === false) continue;
    let cursore = r.prossima || r.ultimaGenerazione || r.dataInizio || oggi;
    let contatore = r.generati || 0;
    let guard = 0;

    while (cursore <= oggi && guard < 1000) {
      guard++;
      // controllo fine per DATA
      if (r.fineTipo === 'data' && r.fineData && cursore > r.fineData) break;
      // controllo fine per CONTEGGIO
      if (r.fineTipo === 'conteggio' && r.fineConteggio && contatore >= r.fineConteggio) break;

      let importo = r.imp;
      // Regola a soglia: importo = quanto serve per riportare il conto alla soglia
      if (r.modalita === 'soglia' && r.soglia && r.contoDest) {
        const dest = state.conti.find(c => c.nome === r.contoDest);
        if (dest) {
          const attuale = saldoStimato(dest);
          importo = round2(Math.max(0, r.soglia - attuale));
        }
      }

      if (importo > 0) {
        await saveMovimento({
          data: cursore, tipo: r.tipo, imp: importo,
          macro: r.macro, cat: r.cat, sub: r.sub,
          conto: r.conto, contoDest: r.contoDest, tag: r.tag,
          desc: r.desc || r.nome, note: 'Generato da ricorrenza', origine: 'ricorrenza',
        });
        generati++;
        contatore++;
      }
      cursore = prossimaData(cursore, r.frequenza);
    }
    // aggiorna la prossima scadenza e il contatore della ricorrenza
    await dbAdd('ricorrenti', { ...r, prossima: cursore, generati: contatore, ultimaGenerazione: oggi });
  }

  if (generati > 0) await refreshAll();
  return generati;
};

// Totale "impegnato" al mese (normalizza tutte le frequenze a valore mensile)
export const impegnatoMensile = () => {
  let tot = 0;
  for (const r of state.ricorrenti) {
    if (r.attiva === false) continue;
    if (r.tipo === 'entrata') continue;   // conto solo uscite/accantonamenti
    let mensile = r.imp;
    if (r.frequenza === 'giornaliera') mensile = r.imp * 30;
    else if (r.frequenza === 'settimanale') mensile = r.imp * 4.33;
    else if (r.frequenza === 'annuale') mensile = r.imp / 12;
    tot += mensile;
  }
  return round2(tot);
};

export const ricorrentiAttive = () => state.ricorrenti.filter(r => r.attiva !== false)
  .sort((a, b) => b.imp - a.imp);

// Aggiorna i movimenti PASSATI generati da una ricorrenza (opzione "anche le passate").
// Li riconosce per corrispondenza di classificazione (macro/cat/sub/tipo) e descrizione.
export const aggiornaMovimentiDaRicorrenza = async (ricorrenza, patch) => {
  const { dbBulkPut } = await import('../core/db.js');
  const daAggiornare = state.movimenti.filter(m =>
    m.tipo === ricorrenza.tipo &&
    m.macro === ricorrenza.macro &&
    m.cat === (ricorrenza.cat || '') &&
    m.sub === (ricorrenza.sub || '') &&
    (ricorrenza.desc ? m.desc === ricorrenza.desc : true)
  ).map(m => ({
    ...m,
    imp: patch.imp !== undefined ? round2(patch.imp) : m.imp,
    desc: patch.desc !== undefined ? patch.desc : m.desc,
  }));
  if (daAggiornare.length) await dbBulkPut('movimenti', daAggiornare);
  await refreshAll();
  return daAggiornare.length;
};

