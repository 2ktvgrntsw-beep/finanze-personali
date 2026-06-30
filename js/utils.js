// utils.js — funzioni di utilità pure, senza dipendenze da DB o DOM (tranne toast).

export const fmtEUR = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);

// Mostra sempre gg/mm/aaaa, come richiesto. Il dato è salvato internamente in ISO
// (aaaa-mm-gg) perché si ordina e si confronta correttamente come stringa; qui si
// formatta solo per la visualizzazione.
export const fmtDate = (d) => {
  const date = (d instanceof Date) ? d : new Date(d);
  return isNaN(date) ? '—' : date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const todayDDMMYYYY = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const debounce = (fn, ms = 250) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

export const toast = (msg) => {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
};

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// --- Parser data: SEMPRE formato europeo gg/mm/aaaa ---------------------------------
// FIX v1.3 (bug noto v1.2): la versione precedente, quando sia giorno che mese erano
// entrambi ≤12 (es. "07/01/2026"), assumeva per default l'ordine USA mese/giorno.
// È la causa diretta dell'errore di data sui Conti Iniziali corretto manualmente
// prima dello sviluppo di questa versione. Ora l'ordine è SEMPRE giorno/mese/anno,
// senza eccezioni e senza euristiche: a parità di ambiguità si decide per l'Italia,
// non per gli Stati Uniti.
export const parseDataIntelligente = (v) => {
  if (!v) return todayISO();

  if (v instanceof Date) return isNaN(v) ? todayISO() : v.toISOString().slice(0, 10);

  const s = String(v).trim();

  // Formato ISO aaaa-mm-gg (es. da export Excel con date già normalizzate)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // Formato europeo gg/mm/aaaa (o gg-mm-aaaa, gg.mm.aaaa) — SEMPRE giorno prima del mese.
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const yy = m[3].length === 2 ? ('20' + m[3]) : m[3];
    return `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Ultimo tentativo: lasciare interpretare al motore JS (es. "25 dicembre 2026" non gestito,
  // ma utile per formati che il parser sopra non riconosce comunque).
  const d = new Date(s);
  return isNaN(d) ? todayISO() : d.toISOString().slice(0, 10);
};

export const advanceDate = (dateStr, frequenza, custom = null) => {
  const d = new Date(dateStr);
  switch (frequenza) {
    case 'giornaliera': d.setDate(d.getDate() + 1); break;
    case 'settimanale': d.setDate(d.getDate() + 7); break;
    case 'mensile': d.setMonth(d.getMonth() + 1); break;
    case 'bimestrale': d.setMonth(d.getMonth() + 2); break;
    case 'trimestrale': d.setMonth(d.getMonth() + 3); break;
    case 'semestrale': d.setMonth(d.getMonth() + 6); break;
    case 'annuale': d.setFullYear(d.getFullYear() + 1); break;
    case 'personalizzata':
      if (custom?.giorni) d.setDate(d.getDate() + Number(custom.giorni));
      else d.setMonth(d.getMonth() + 1);
      break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
};

// --- Helper nuovi per la v1.3 (mutuo / patrimonio) -----------------------------------

// Differenza in mesi interi tra due date ISO (aaaa-mm-gg), usata per calcolare
// quante rate di mutuo/finanziamento sono trascorse da una data di inizio.
export const diffMesi = (dataInizioISO, dataFineISO) => {
  const a = new Date(dataInizioISO), b = new Date(dataFineISO);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

// Arrotonda a 2 decimali evitando i classici errori di floating point (0.1 + 0.2 ...),
// utile nei calcoli di piano di ammortamento dove gli arrotondamenti si accumulano.
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
