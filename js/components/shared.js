// shared.js — Componenti UI riutilizzabili (bottom sheet, righe, selettori).

import { escapeHtml, fmtEUR, fmtDataEstesa } from '../core/utils.js';
import { iconaMacro, iconaTipo } from '../core/icons.js';
import { listaMacro, categorieDi, sottocategorieDi } from '../services/categorieService.js';

// --- Bottom sheet generico ---
export const apriSheet = (titolo, contenutoHTML, onMount) => {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><h3>${escapeHtml(titolo)}</h3><div class="sheet-body">${contenutoHTML}</div></div>`;
  document.body.appendChild(bg);
  const chiudi = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) chiudi(); });
  if (onMount) onMount(bg.querySelector('.sheet-body'), chiudi);
  return chiudi;
};

// --- Riga movimento (usata in liste e ricerca) ---
export const rigaMovimentoHTML = (m) => {
  const segno = m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ ';
  const cls = m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr';
  const icona = m.macro ? iconaMacro(m.macro) : iconaTipo(m.tipo);
  const sotto = [m.macro, m.cat].filter(Boolean).join(' · ') || m.tipo;
  const contoTxt = m.conto ? ' · ' + escapeHtml(m.conto) : '';
  return `
    <div class="mov" data-mov="${m.id}">
      <div class="ic">${icona}</div>
      <div class="body">
        <div class="d1">${escapeHtml(m.desc || sotto)}</div>
        <div class="d2">${escapeHtml(sotto)}${contoTxt}</div>
      </div>
      <div class="amt ${cls} num">${segno}${fmtEUR(m.imp)}</div>
    </div>`;
};

// --- Selettore categoria a griglia di icone (macro -> cat -> sub) ---
// onSelect riceve { macro, cat, sub }
export const apriSelettoreCategoria = (onSelect) => {
  let sel = { macro: '', cat: '', sub: '' };

  const render = (body, chiudi) => {
    const macros = listaMacro();
    const cats = sel.macro ? categorieDi(sel.macro) : [];
    const subs = (sel.macro && sel.cat) ? sottocategorieDi(sel.macro, sel.cat) : [];

    const grid = (items, tipo, selezionato) => `
      <div class="cat-grid">
        ${items.map(it => `
          <div class="cat-cell ${selezionato === it ? 'sel' : ''}" data-tipo="${tipo}" data-val="${escapeHtml(it)}">
            <div class="ci">${tipo === 'macro' ? iconaMacro(it) : '🏷️'}</div>
            <span>${escapeHtml(it)}</span>
          </div>`).join('')}
      </div>`;

    body.innerHTML = `
      <div class="section-lbl" style="padding-top:0">Macrocategoria</div>
      ${grid(macros, 'macro', sel.macro)}
      ${sel.macro && cats.length ? `<div class="section-lbl">Categoria di "${escapeHtml(sel.macro)}"</div>${grid(cats, 'cat', sel.cat)}` : ''}
      ${sel.cat && subs.length ? `<div class="section-lbl">Sottocategoria (opzionale)</div>${grid(subs, 'sub', sel.sub)}` : ''}
      <button class="btn btn-primary" id="conferma-cat" style="margin-top:18px">${sel.macro ? 'Conferma' : 'Scegli una macrocategoria'}</button>
    `;

    body.querySelectorAll('.cat-cell').forEach(cell => cell.addEventListener('click', () => {
      const tipo = cell.dataset.tipo, val = cell.dataset.val;
      if (tipo === 'macro') { sel = { macro: val, cat: '', sub: '' }; }
      else if (tipo === 'cat') { sel = { ...sel, cat: val, sub: '' }; }
      else { sel = { ...sel, sub: sel.sub === val ? '' : val }; }
      render(body, chiudi);
    }));

    body.querySelector('#conferma-cat').addEventListener('click', () => {
      if (!sel.macro) return;
      onSelect(sel);
      chiudi();
    });
  };

  apriSheet('Scegli categoria', '', render);
};

// --- Helper delta: confronta valore vs riferimento, ritorna { testo, classe } ---
export const calcolaDelta = (valore, riferimento, invertiColore = false) => {
  if (!riferimento || riferimento === 0) return null;
  const pct = Math.round(((valore - riferimento) / riferimento) * 100);
  if (Math.abs(pct) < 3) return { testo: 'in linea con la media', classe: 'flat' };
  const su = pct > 0;
  // per le spese, "su" è peggio (rosso); invertiColore per casi dove su è meglio
  const peggio = invertiColore ? !su : su;
  return {
    testo: `${su ? '+' : ''}${pct}% vs media`,
    classe: peggio ? 'worse' : 'better',
  };
};
