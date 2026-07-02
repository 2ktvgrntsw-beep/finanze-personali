// utils.js — Funzioni di utilità pure, riusabili in tutta l'app.

// --- ID ---
let _counter = 0;
export const uid = () => 'x' + Date.now().toString(36) + (_counter++).toString(36) + Math.random().toString(36).slice(2, 6);

// --- Numeri ---
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const _eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtEUR = (n) => _eur.format(Number(n) || 0);

// Versione compatta senza decimali per numeri grandi (es. card patrimonio): 1.247€
const _eur0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
export const fmtEUR0 = (n) => _eur0.format(Math.round(Number(n) || 0)) + '€';

export const fmtPct = (n) => (Math.round((Number(n) || 0) * 10) / 10).toString().replace('.', ',') + '%';

// --- Date ---
// Parser SEMPRE europeo (gg/mm/aaaa): nessuna ambiguità con il formato USA.
export const parseDataEU = (v) => {
  if (!v) return todayISO();
  if (v instanceof Date) return isNaN(v) ? todayISO() : toISO(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);           // già ISO
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);  // gg/mm/aaaa
  if (m) {
    const g = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0');
    const aa = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${aa}-${mm}-${g}`;
  }
  const d = new Date(s);
  return isNaN(d) ? todayISO() : toISO(d);
};

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => toISO(new Date());

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export const nomeMese = (m) => MESI[m] || '';
export const fmtData = (iso) => { const [a, m, g] = iso.split('-'); return `${parseInt(g)} ${MESI[parseInt(m) - 1]} ${a}`; };
export const fmtDataBreve = (iso) => { const [a, m, g] = iso.split('-'); return `${parseInt(g)}/${m}`; };
export const fmtDataEstesa = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return `${GIORNI[d.getDay()]} ${parseInt(iso.split('-')[2])} ${MESI[d.getMonth()]}`;
};
export const annomese = (iso) => iso.slice(0, 7);            // '2026-06'
export const annoDi = (iso) => iso.slice(0, 4);

// --- HTML ---
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- Toast ---
let _toastTimer = null;
export const toast = (msg) => {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
};

// --- Varie ---
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const gruppoPer = (arr, keyFn) => arr.reduce((acc, x) => { const k = keyFn(x); (acc[k] = acc[k] || []).push(x); return acc; }, {});
