// tagService.js — Anagrafica dei tag: elenco, rinomina e eliminazione PROPAGATE.
//
// COME SONO SALVATI I TAG. Per NOME, dentro ogni record che li usa: `m.tag` sui
// movimenti e `r.tag` sulle ricorrenze (che li ricopiano sui movimenti che generano).
// Lo store 'tag' è solo un'anagrafica di comodo (seed, import Excel): la verità sta
// sui record. Per questo fino alla 3.48 un tag non si poteva modificare da nessuna
// parte — non c'era un posto unico da cambiare. Rinominare o eliminare un tag vuol
// dire riscrivere tutti i record che lo portano, in un'unica scrittura per store.
//
// UNIRE = RINOMINARE SU UN NOME CHE ESISTE GIÀ. Un movimento che aveva entrambi i
// tag ne tiene uno solo (niente doppioni), nella posizione del primo.
//
// 'una tantum' È UN TAG CON UN SIGNIFICATO: Bilancio, grafico del ritmo e mese
// tipico lo riconoscono per nome (eUnaTantum). Rinominarlo spegnerebbe quella
// funzione in silenzio, quindi non si può; eliminarlo sì, ma l'interfaccia avvisa.

import { dbBulkPut, dbDelete } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { TAG_UNA_TANTUM } from './movimentiService.js';

export const normalizzaTag = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const eTagUnaTantum = (nome) => normalizzaTag(nome).toLowerCase() === TAG_UNA_TANTUM;

// Elenco di tutti i tag esistenti, da movimenti, ricorrenze e anagrafica, con quanti
// movimenti e ricorrenze li usano e l'ultima data d'uso. Ordinati per uso.
export const elencoTag = () => {
  const voci = new Map();
  const voce = (nome) => {
    if (!voci.has(nome)) voci.set(nome, { nome, movimenti: 0, ricorrenze: 0, ultimo: '' });
    return voci.get(nome);
  };
  for (const t of state.tag) if (t.nome) voce(t.nome);
  for (const m of state.movimenti) {
    for (const t of m.tag || []) {
      if (!t) continue;
      const v = voce(t);
      v.movimenti++;
      if (m.data > v.ultimo) v.ultimo = m.data;
    }
  }
  for (const r of state.ricorrenti) for (const t of r.tag || []) if (t) voce(t).ricorrenze++;
  return [...voci.values()].sort((a, b) => b.movimenti - a.movimenti || a.nome.localeCompare(b.nome, 'it'));
};

// Controllo di una rinomina, senza database. Ritorna il messaggio d'errore o null.
export const controllaRinomina = (vecchio, nuovo) => {
  const n = normalizzaTag(nuovo);
  if (!n) return 'Il nome del tag non può essere vuoto';
  if (n.includes(',')) return 'Il nome non può contenere virgole: nell\'inserimento la virgola separa i tag';
  if (n === vecchio) return 'Inserisci un nome diverso';
  if (eTagUnaTantum(vecchio)) return '"una tantum" non si può rinominare: Bilancio e grafici lo riconoscono per nome';
  return null;
};

// Decisione pura: dati dei record (movimenti o ricorrenze), dice quali riscrivere e
// come. `nuovo` = null elimina il tag. I record senza quel tag non compaiono.
export const pianoTag = (records, vecchio, nuovo) => records
  .filter(r => (r.tag || []).includes(vecchio))
  .map(r => {
    const tag = [];
    for (const t of r.tag) {
      const v = t === vecchio ? nuovo : t;
      if (v && !tag.includes(v)) tag.push(v);
    }
    return { ...r, tag };
  });

const _applica = async (vecchio, nuovo) => {
  const movimenti = pianoTag(state.movimenti, vecchio, nuovo);
  const ricorrenze = pianoTag(state.ricorrenti, vecchio, nuovo);
  if (movimenti.length) await dbBulkPut('movimenti', movimenti);
  if (ricorrenze.length) await dbBulkPut('ricorrenti', ricorrenze);
  // anagrafica: il vecchio nome sparisce; se il nuovo non c'è ancora, prende il suo posto
  const vecchi = state.tag.filter(t => t.nome === vecchio);
  const nuovoGiaPresente = nuovo && state.tag.some(t => t.nome === nuovo);
  for (const [i, t] of vecchi.entries()) {
    if (nuovo && !nuovoGiaPresente && i === 0) await dbBulkPut('tag', [{ ...t, nome: nuovo }]);
    else await dbDelete('tag', t.id);
  }
  await refreshAll();
  return { movimenti: movimenti.length, ricorrenze: ricorrenze.length };
};

// Rinomina (o unisce, se `nuovo` esiste già) su tutti i movimenti e le ricorrenze.
export const rinominaTag = async (vecchio, nuovo) => {
  const errore = controllaRinomina(vecchio, nuovo);
  if (errore) throw new Error(errore);
  const n = normalizzaTag(nuovo);
  const unito = elencoTag().some(t => t.nome === n);
  return { ...(await _applica(vecchio, n)), unito };
};

// Toglie il tag da tutti i movimenti e le ricorrenze (i movimenti restano).
export const eliminaTag = async (nome) => _applica(nome, null);
