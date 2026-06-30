// movimentiService.js — CRUD e query sui movimenti.
//
// REFACTORING v1.3:
// 1) tipo movimento ora può essere 'spesa' | 'entrata' | 'trasferimento' (nuovo).
//    Un trasferimento ha conto_origine + conto_destinazione invece di un singolo conto,
//    e non impatta il calcolo di entrate/uscite (sposta soldi, non li crea né li consuma).
// 2) saveMovimento accetta un'opzione { skipRefresh } per i casi di scrittura massiva
//    (import Excel, generazione ricorrenti): chi orchestra il batch chiama refreshAll()
//    una sola volta alla fine, invece che una volta per riga.

import { dbAdd, dbDelete, dbGet } from '../db.js';
import { uid, todayISO } from '../utils.js';
import { refreshAll, state, movimentiAnno } from '../state.js';

export const saveMovimento = async (m, { skipRefresh = false } = {}) => {
  const now = new Date().toISOString();
  const isTrasferimento = m.tipo === 'trasferimento';

  const obj = {
    id: m.id || uid(),
    data: m.data || todayISO(),
    tipo: m.tipo,
    macrocategoria: m.macrocategoria || '',
    categoria: m.categoria || '',
    sottocategoria: m.sottocategoria || '',
    // Spesa/Entrata usano "conto"; Trasferimento usa origine+destinazione.
    // Si mantiene anche "conto" = conto_origine per i trasferimenti, così tutto
    // il codice esistente che filtra per state.movimenti.conto continua a funzionare.
    conto: isTrasferimento ? (m.conto_origine || '') : (m.conto || ''),
    conto_origine: isTrasferimento ? (m.conto_origine || '') : null,
    conto_destinazione: isTrasferimento ? (m.conto_destinazione || '') : null,
    tag: Array.isArray(m.tag) ? m.tag : (m.tag ? [m.tag] : []),
    descrizione: m.descrizione || '',
    note: m.note || '',
    importo: Math.abs(Number(m.importo) || 0),
    ricorrente_id: m.ricorrente_id || null,
    is_eccezione_ricorrenza: !!m.is_eccezione_ricorrenza,
    data_creazione: m.data_creazione || now,
    data_modifica: now,
    origine: m.origine || 'manuale',
  };

  await dbAdd('movimenti', obj);
  if (!skipRefresh) await refreshAll();
  return obj;
};

export const deleteMovimento = async (id) => {
  await dbDelete('movimenti', id);
  await refreshAll();
};

export const duplicateMovimento = async (id) => {
  const orig = await dbGet('movimenti', id);
  if (!orig) return null;
  const copy = { ...orig, id: uid(), data: todayISO(), data_creazione: new Date().toISOString(), origine: 'manuale', ricorrente_id: null };
  return saveMovimento(copy);
};

export const suggerimentiFrequenti = (limit = 5) => {
  const counts = {};
  state.movimenti.forEach(m => {
    const key = (m.descrizione || '').trim().toLowerCase();
    if (!key) return;
    counts[key] = counts[key] || { count: 0, sample: m };
    counts[key].count++;
  });
  return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, limit).map(x => x.sample);
};

// filtraMovimenti: se è specificato solo l'anno (caso più comune in Dashboard/Statistiche),
// si parte dall'indice precalcolato invece che dall'intero array — più veloce su 5.000+ righe.
// Con altri filtri combinati si applica comunque .filter() sul sottoinsieme già ridotto.
export const filtraMovimenti = (filtri = {}) => {
  const base = filtri.anno ? movimentiAnno(filtri.anno) : state.movimenti;

  return base.filter(m => {
    if (filtri.anno && Number(String(m.data).slice(0, 4)) !== Number(filtri.anno)) return false;
    if (filtri.mese && (new Date(m.data).getMonth() + 1) !== Number(filtri.mese)) return false;
    if (filtri.tipo && m.tipo !== filtri.tipo) return false;
    if (filtri.macrocategoria && m.macrocategoria !== filtri.macrocategoria) return false;
    if (filtri.categoria && m.categoria !== filtri.categoria) return false;
    if (filtri.sottocategoria && m.sottocategoria !== filtri.sottocategoria) return false;
    if (filtri.conto && m.conto !== filtri.conto) return false;
    if (filtri.tag && !(m.tag || []).includes(filtri.tag)) return false;
    if (filtri.tags && filtri.tags.length) {
      const ok = filtri.tagMode === 'OR'
        ? filtri.tags.some(t => (m.tag || []).includes(t))
        : filtri.tags.every(t => (m.tag || []).includes(t)); // default AND
      if (!ok) return false;
    }
    if (filtri.testo) {
      const t = filtri.testo.toLowerCase();
      const blob = [m.descrizione, m.note, m.categoria, m.sottocategoria, ...(m.tag || [])].join(' ').toLowerCase();
      if (!blob.includes(t)) return false;
    }
    return true;
  });
};

// Applica un tag a più movimenti in un colpo solo (Bulk Tag Tool, v1.3).
// Una sola lettura dello stato, scritture in sequenza ma senza refreshAll intermedi.
export const applicaTagBulk = async (movimentiIds, tagDaAggiungere) => {
  for (const id of movimentiIds) {
    const m = state.movimenti.find(x => x.id === id);
    if (!m) continue;
    const nuoviTag = Array.from(new Set([...(m.tag || []), tagDaAggiungere]));
    await saveMovimento({ ...m, tag: nuoviTag }, { skipRefresh: true });
  }
  await refreshAll();
};
