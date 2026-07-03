// shared.js — Componenti UI riutilizzabili (bottom sheet, righe, selettori).

import { escapeHtml, fmtEUR, fmtDataEstesa } from '../core/utils.js';
import { iconaMacro, iconaTipo } from '../core/icons.js';
import { listaMacro, categorieDi, sottocategorieDi } from '../services/categorieService.js';

// --- Bottom sheet generico ---
export const apriSheet = (titolo, contenutoHTML, onMount) => {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">
    <div class="sheet-head"><h3>${escapeHtml(titolo)}</h3><button class="sheet-close" aria-label="Chiudi">✕</button></div>
    <div class="sheet-body">${contenutoHTML}</div>
  </div>`;
  document.body.appendChild(bg);
  const chiudi = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) chiudi(); });
  bg.querySelector('.sheet-close').addEventListener('click', chiudi);
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
      if (tipo === 'macro') {
        sel = { macro: val, cat: '', sub: '' };
        // se la macro non ha categorie, la scelta è già completa: chiudo
        if (categorieDi(val).length === 0) { onSelect(sel); chiudi(); return; }
      } else if (tipo === 'cat') {
        sel = { ...sel, cat: val, sub: '' };
        // se la categoria non ha sottocategorie, chiudo (niente livello inutile)
        if (sottocategorieDi(sel.macro, val).length === 0) { onSelect(sel); chiudi(); return; }
      } else {
        // scelta della sottocategoria = scelta completa: chiudo subito
        sel = { ...sel, sub: val };
        onSelect(sel); chiudi(); return;
      }
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

// --- Selettore data NATIVO iOS ---
// Usa <input type="date"> del sistema: ruote fluide, giorni corretti per ogni mese,
// scorrimento in entrambi i versi. Molto meglio di una ruota custom.
// Ritorna la data scelta (ISO) via callback onChange.
export const apriDataNativa = (dataAttuale, onChange) => {
  // crea un input date invisibile e lo attiva: iOS mostra il suo picker nativo
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.value = dataAttuale || new Date().toISOString().slice(0, 10);
  inp.style.position = 'fixed';
  inp.style.opacity = '0';
  inp.style.left = '-9999px';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => { if (inp.value) onChange(inp.value); inp.remove(); });
  inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 300));
  // showPicker() è il modo moderno; fallback su focus/click
  try { inp.showPicker(); } catch (e) { inp.focus(); inp.click(); }
};

// Riga data che apre il picker nativo al tocco (helper per i form)
export const rigaDataNativa = (labelData, dataISO, containerEl, onChange) => {
  containerEl.addEventListener('click', () => apriDataNativa(dataISO, onChange));
};

// --- Tastierino numerico riutilizzabile ---
// Monta un tastierino nel container e chiama onChange(stringaImporto) a ogni tasto.
// onDone() quando si preme OK. Da usare in tutte le maschere con importi.
export const montaTastierino = (container, valoreIniziale, onChange, onDone) => {
  let str = valoreIniziale || '0';
  const tasti = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '00'];
  container.innerHTML = `<div class="numpad numpad-inline">
    ${tasti.map(t => `<button type="button" data-k="${t}">${t}</button>`).join('')
      .replace('<button type="button" data-k="9">9</button>', '<button type="button" data-k="9">9</button><button type="button" class="sub" data-k="C">C</button>')
      .replace('<button type="button" data-k="6">6</button>', '<button type="button" data-k="6">6</button><button type="button" class="sub" data-k="back">⌫</button>')
      .replace('<button type="button" data-k="3">3</button>', '<button type="button" data-k="3">3</button><button type="button" class="ok" data-k="ok" style="grid-row:span 2">OK</button>')}
  </div>`;
  container.querySelectorAll('.numpad button').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (k === 'C') str = '0';
    else if (k === 'back') str = str.length > 1 ? str.slice(0, -1) : '0';
    else if (k === 'ok') { container.innerHTML = ''; if (onDone) onDone(str); return; }
    else if (k === ',') { if (!str.includes(',')) str += ','; }
    else { str = str === '0' ? k : str + k; }
    onChange(str);
  }));
};

// --- Swipe orizzontale per cambiare periodo (mese prec/succ) ---
// IDEMPOTENTE: i listener si attaccano UNA sola volta per elemento; i re-render
// aggiornano solo le callback (altrimenti si accumulano e uno swipe salta N mesi).
export const abilitaSwipePeriodo = (el, onPrev, onNext) => {
  el._swipeCb = { onPrev, onNext };
  if (el._swipeAttivo) return;
  el._swipeAttivo = true;
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = y0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;   // troppo corto o verticale
    if (dx < 0) el._swipeCb.onNext(); else el._swipeCb.onPrev();
  }, { passive: true });
};
