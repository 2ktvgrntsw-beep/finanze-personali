// ricerca.js — Ricerca full-text con totale aggregato + selezione multipla e
// modifica massiva di qualsiasi campo (categoria, conto, da/a conto, descrizione, tag).

import { fmtEUR, escapeHtml, fmtDataEstesaAnno } from '../core/utils.js';
import { iconaMacro, iconaTipo, UI_SVG } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { state } from '../core/store.js';
import { cercaMovimenti } from '../services/movimentiService.js';
import { categorieDi, sottocategorieDi } from '../services/categorieService.js';
import { creaSelezione } from './selezioneMultipla.js';

let _ultimiRisultati = [];
let _sel = null;        // controller selezione multipla condiviso
let _preserva = false;  // true quando si apre una modifica dai risultati: al ritorno
                        // (history.back) la ricerca NON va azzerata
// STATO PERSISTENTE: query e filtri sopravvivono alla navigazione — tornando
// dalla modifica di un movimento ritrovi la ricerca esattamente com'era.
let _q = '';
let _filtri = { tipo: '', macro: '', cat: '', sub: '', conto: '', da: '', a: '', min: '', max: '' };
let _filtriAperti = false;

export const renderRicerca = async (root, params = {}) => {
  document.getElementById('view-title').textContent = 'Cerca';
  if (_sel) _sel.esciSilenzioso();

  // La ricerca riparte PULITA a ogni ingresso: query e filtri non devono
  // sopravvivere al cambio pagina. DUE eccezioni: (a) parametri passati
  // esplicitamente (es. arrivo da Analisi con categoria preimpostata);
  // (b) ritorno da una modifica aperta DAI RISULTATI (Annulla/Salva fanno
  // history.back): lì query e filtri devono restare come l'utente li aveva.
  if (_preserva) {
    _preserva = false;   // consumo il flag: vale per un solo ritorno
  } else {
    const arrivaConFiltri = params.macro !== undefined || params.cat !== undefined ||
      params.sub !== undefined || params.da !== undefined || params.a !== undefined ||
      params.tipo !== undefined || params.conto !== undefined;

    if (params.q) _q = params.q; else if (!arrivaConFiltri) _q = '';

    if (arrivaConFiltri) {
      _filtri = {
        tipo: params.tipo || '', macro: params.macro || '', cat: params.cat || '', sub: params.sub || '',
        conto: params.conto || '', da: params.da || '', a: params.a || '', min: '', max: '',
      };
      _filtriAperti = false;
    } else {
      // nessun parametro: azzero i filtri della sessione precedente
      _filtri = { tipo: '', macro: '', cat: '', sub: '', conto: '', da: '', a: '', min: '', max: '' };
      _filtriAperti = false;
    }
  }

  const nFiltri = Object.values(_filtri).filter(v => v !== '').length;
  const macros = [...new Set(state.movimenti.map(m => m.macro).filter(Boolean))].sort();
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);

  root.innerHTML = `
    <div class="searchbar">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="q" placeholder="Cerca nella descrizione (virgola per più termini)" value="${escapeHtml(_q)}" autocomplete="off">
      <button id="q-clear" class="q-clear" aria-label="Cancella ricerca" style="display:${_q ? 'flex' : 'none'}">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <button id="toggle-filtri" class="filtri-btn ${nFiltri ? 'on' : ''}">Filtri${nFiltri ? ' · ' + nFiltri : ''}</button>
    </div>
    <div id="pannello-filtri" style="display:${_filtriAperti ? 'block' : 'none'}" class="card filtri-card">
      <div class="filtri-riga">
        <label class="meta">Tipo</label>
        <div class="chip-row">
          ${[['', 'Tutti'], ['spesa', 'Spese'], ['entrata', 'Entrate'], ['trasferimento', 'Accant.']].map(([v, l]) =>
            `<div class="chip ${_filtri.tipo === v ? 'on' : ''}" data-ftipo="${v}">${l}</div>`).join('')}
        </div>
      </div>
      <div class="filtri-riga filtri-2col">
        <div><label class="meta">Macro-categoria</label>
          <select id="f-macro" class="sheet-input">
            <option value="">Tutte</option>
            ${macros.map(m => `<option ${_filtri.macro === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
          </select></div>
        <div><label class="meta">Conto</label>
          <select id="f-conto" class="sheet-input">
            <option value="">Tutti</option>
            ${conti.map(c => `<option ${_filtri.conto === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select></div>
      </div>
      <div class="filtri-riga filtri-2col">
        <div><label class="meta">Categoria</label>
          <select id="f-cat" class="sheet-input" ${_filtri.macro ? '' : 'disabled'}>
            <option value="">Tutte</option>
            ${_filtri.macro ? categorieDi(_filtri.macro).map(c => `<option ${_filtri.cat === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('') : ''}
          </select></div>
        <div><label class="meta">Sottocategoria</label>
          <select id="f-sub" class="sheet-input" ${_filtri.cat ? '' : 'disabled'}>
            <option value="">Tutte</option>
            <option value="__vuota__" ${_filtri.sub === '__vuota__' ? 'selected' : ''}>— Senza sottocategoria —</option>
            ${_filtri.macro && _filtri.cat ? sottocategorieDi(_filtri.macro, _filtri.cat).map(s => `<option ${_filtri.sub === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('') : ''}
          </select></div>
      </div>
      <div class="filtri-riga filtri-2col">
        <div><label class="meta">Dal</label><input type="date" id="f-da" value="${_filtri.da}" class="sheet-input"></div>
        <div><label class="meta">Al</label><input type="date" id="f-a" value="${_filtri.a}" class="sheet-input"></div>
      </div>
      <div class="filtri-riga filtri-2col">
        <div><label class="meta">Importo min €</label><input type="text" inputmode="decimal" id="f-min" value="${_filtri.min}" class="sheet-input" placeholder="—"></div>
        <div><label class="meta">Importo max €</label><input type="text" inputmode="decimal" id="f-max" value="${_filtri.max}" class="sheet-input" placeholder="—"></div>
      </div>
      <button class="btn btn-ghost" id="f-reset" style="margin-top:6px;font-size:13px">Azzera filtri</button>
    </div>
    <div id="ris"></div>
  `;

  const inp = root.querySelector('#q');
  const box = root.querySelector('#ris');

  const filtriNumerici = () => ({
    ..._filtri,
    min: _filtri.min !== '' ? parseFloat(String(_filtri.min).replace(',', '.')) : null,
    max: _filtri.max !== '' ? parseFloat(String(_filtri.max).replace(',', '.')) : null,
  });

  const clearBtn = root.querySelector('#q-clear');

  // controller selezione multipla: onChange ri-esegue la ricerca (che ridisegna la lista).
  // setOnChange a OGNI render: esegui() cattura il DOM corrente (inp, box) e senza
  // ri-aggancio il tasto Seleziona smetterebbe di funzionare dalla seconda visita.
  if (!_sel) _sel = creaSelezione(() => esegui());
  else _sel.setOnChange(() => esegui());

  const esegui = () => {
    _q = inp.value;
    if (clearBtn) clearBtn.style.display = _q ? 'flex' : 'none';
    const { risultati, totali, count } = cercaMovimenti(_q, filtriNumerici());
    _ultimiRisultati = risultati;
    const attivi = Object.values(_filtri).some(v => v !== '');
    if (!_q.trim() && !attivi) { box.innerHTML = '<div class="empty">Scrivi qualcosa o apri i Filtri per cercare tra tutti i tuoi movimenti</div>'; return; }
    if (!count) { box.innerHTML = `<div class="empty"><div class="big-ic">${UI_SVG.lente}</div>Nessun risultato</div>`; return; }

    // totali SEPARATI per tipo: la somma è sempre leggibile anche con risultati misti
    const pezzi = [];
    if (totali.spese > 0) pezzi.push(`<span class="sp num">−${fmtEUR(totali.spese)}</span> spese`);
    if (totali.entrate > 0) pezzi.push(`<span class="en num">+${fmtEUR(totali.entrate)}</span> entrate`);
    if (totali.trasf > 0) pezzi.push(`<span class="tr num">⇄ ${fmtEUR(totali.trasf)}</span> accantonati`);

    const selMode = _sel && _sel.attiva();
    const toolbar = selMode
      ? _sel.toolbarHTML()
      : `<div class="search-summary"><div class="summary-head"><div class="n">${count} movimenti trovati</div>${count ? `<button class="sel-mini" id="attiva-sel" aria-label="Seleziona risultati"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 12l2.2 2.2L15.5 9.5"/></svg></button>` : ''}</div><div style="font-size:14.5px;line-height:1.7">${pezzi.join(' · ') || '—'}</div></div>`;

    box.innerHTML = toolbar + '<div>' + risultati.slice(0, 300).map(m => {
      const segno = m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ ';
      const cls = m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr';
      const icona = m.macro ? iconaMacro(m.macro) : iconaTipo(m.tipo);
      const classif = [m.macro, m.cat, m.sub].filter(Boolean).join(' › ') || m.tipo;
      const isSel = selMode && _sel.ha(m.id);
      return `<div class="mov tipo-${m.tipo} ${selMode ? 'selectable' : ''} ${isSel ? 'sel' : ''}" data-mov="${m.id}">
        ${selMode ? `<div class="selbox">${isSel ? '✓' : ''}</div>` : ''}
        <div class="ic">${icona}</div>
        <div class="body"><div class="d1">${escapeHtml(m.desc || classif)}</div><div class="d2"><span class="cls">${escapeHtml(classif)}</span> <span class="cnt">· ${fmtDataEstesaAnno(m.data)}${m.conto ? ' · ' + escapeHtml(m.conto) : ''}</span></div></div>
        <div class="amt ${cls} num">${segno}${fmtEUR(m.imp)}</div>
      </div>`;
    }).join('') + '</div>';

    // interazioni righe: tap (modifica o toggle selezione) + long-press (avvia selezione)
    box.querySelectorAll('[data-mov]').forEach(el => {
      const id = el.dataset.mov;
      let longTimer = null, longFired = false;
      const clearLong = () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } };
      const start = () => {
        longFired = false;
        if (!_sel.attiva()) longTimer = setTimeout(() => {
          longFired = true;
          if (navigator.vibrate) navigator.vibrate(15);
          _sel.avvia(id);
        }, 500);
      };
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchend', clearLong);
      el.addEventListener('touchmove', clearLong, { passive: true });
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', clearLong);
      el.addEventListener('mouseleave', clearLong);
      el.addEventListener('click', () => {
        if (longFired) return;
        if (_sel.attiva()) { _sel.toggle(id); return; }
        _preserva = true;   // al ritorno (Annulla/Salva -> back) la ricerca resta
        navigate('modifica', { id });
      });
    });

    const attiva = box.querySelector('#attiva-sel');
    if (attiva) attiva.addEventListener('click', () => _sel.avvia());
    if (selMode) _sel.bindToolbar(box, risultati.map(m => m.id));
  };

  inp.addEventListener('input', esegui);

  // X per cancellare rapidamente la ricerca
  if (clearBtn) clearBtn.addEventListener('click', () => {
    inp.value = '';
    _q = '';
    esegui();
    inp.focus();
  });

  // pannello filtri
  root.querySelector('#toggle-filtri').addEventListener('click', () => {
    _filtriAperti = !_filtriAperti;
    root.querySelector('#pannello-filtri').style.display = _filtriAperti ? 'block' : 'none';
  });
  root.querySelectorAll('[data-ftipo]').forEach(el => el.addEventListener('click', () => {
    _filtri.tipo = el.dataset.ftipo;
    root.querySelectorAll('[data-ftipo]').forEach(x => x.classList.toggle('on', x.dataset.ftipo === _filtri.tipo));
    esegui();
  }));
  const bindFiltro = (sel, campo) => {
    const el = root.querySelector(sel);
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { _filtri[campo] = el.value; esegui(); });
  };
  // macro: cambia -> azzera cat/sub e ri-renderizza (per popolare i menu a cascata)
  const elMacro = root.querySelector('#f-macro');
  if (elMacro) elMacro.addEventListener('change', () => {
    _filtri.macro = elMacro.value; _filtri.cat = ''; _filtri.sub = '';
    renderRicerca(root);
  });
  // cat: cambia -> azzera sub e ri-renderizza
  const elCat = root.querySelector('#f-cat');
  if (elCat) elCat.addEventListener('change', () => {
    _filtri.cat = elCat.value; _filtri.sub = '';
    renderRicerca(root);
  });
  bindFiltro('#f-sub', 'sub'); bindFiltro('#f-conto', 'conto');
  bindFiltro('#f-da', 'da'); bindFiltro('#f-a', 'a');
  bindFiltro('#f-min', 'min'); bindFiltro('#f-max', 'max');
  root.querySelector('#f-reset').addEventListener('click', () => {
    _filtri = { tipo: '', macro: '', cat: '', sub: '', conto: '', da: '', a: '', min: '', max: '' };
    renderRicerca(root);
  });

  esegui();
  // il focus solo quando parti da zero: tornando dalla modifica NON ruba la vista dei risultati
  if (!_q && !Object.values(_filtri).some(v => v !== '')) setTimeout(() => inp.focus(), 100);
};
