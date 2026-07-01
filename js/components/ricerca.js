// ricerca.js — Ricerca full-text con totale aggregato del risultato.

import { fmtEUR, escapeHtml, fmtDataEstesa } from '../core/utils.js';
import { iconaMacro, iconaTipo } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { cercaMovimenti } from '../services/movimentiService.js';

export const renderRicerca = async (root, params = {}) => {
  document.getElementById('view-title').textContent = 'Cerca';

  root.innerHTML = `
    <div class="searchbar">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="q" placeholder="Descrizione, importo, categoria, tag, conto..." value="${escapeHtml(params.q || '')}" autocomplete="off" autofocus>
    </div>
    <div id="ris"></div>
  `;

  const inp = root.querySelector('#q');
  const box = root.querySelector('#ris');

  const esegui = () => {
    const { risultati, totale, count } = cercaMovimenti(inp.value);
    if (!inp.value.trim()) { box.innerHTML = '<div class="empty">Scrivi qualcosa per cercare tra tutti i tuoi movimenti</div>'; return; }
    if (!count) { box.innerHTML = '<div class="empty"><div class="big-ic">🔍</div>Nessun risultato</div>'; return; }
    box.innerHTML = `
      <div class="search-summary"><div class="n">${count} movimenti · totale spese</div><div class="big num">${fmtEUR(totale)}</div></div>
      <div style="margin-top:8px">
        ${risultati.slice(0, 200).map(m => {
          const segno = m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ ';
          const cls = m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr';
          const icona = m.macro ? iconaMacro(m.macro) : iconaTipo(m.tipo);
          const sotto = [m.macro, m.cat].filter(Boolean).join(' · ') || m.tipo;
          return `<div class="mov" data-mov="${m.id}"><div class="ic">${icona}</div><div class="body"><div class="d1">${escapeHtml(m.desc || sotto)}</div><div class="d2">${fmtDataEstesa(m.data)} · ${escapeHtml(sotto)}</div></div><div class="amt ${cls} num">${segno}${fmtEUR(m.imp)}</div></div>`;
        }).join('')}
      </div>`;
    box.querySelectorAll('[data-mov]').forEach(el => el.addEventListener('click', () => navigate('modifica', { id: el.dataset.mov })));
  };

  inp.addEventListener('input', esegui);
  esegui();
  setTimeout(() => inp.focus(), 100);
};
