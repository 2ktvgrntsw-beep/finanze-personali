// ricerca.js — Ricerca full-text con totale aggregato + selezione multipla e
// modifica massiva di qualsiasi campo (categoria, conto, da/a conto, descrizione, tag).

import { fmtEUR, escapeHtml, fmtDataEstesa } from '../core/utils.js';
import { iconaMacro, iconaTipo, UI_SVG } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { state } from '../core/store.js';
import { cercaMovimenti, modificaMassiva, applicaTagBulk } from '../services/movimentiService.js';
import { categorieDi, sottocategorieDi } from '../services/categorieService.js';
import { apriSelettoreCategoria, apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

let _selezione = new Set();
let _modoSelezione = false;
let _ultimiRisultati = [];
// STATO PERSISTENTE: query e filtri sopravvivono alla navigazione — tornando
// dalla modifica di un movimento ritrovi la ricerca esattamente com'era.
let _q = '';
let _filtri = { tipo: '', macro: '', cat: '', sub: '', conto: '', da: '', a: '', min: '', max: '' };
let _filtriAperti = false;

export const renderRicerca = async (root, params = {}) => {
  document.getElementById('view-title').textContent = 'Cerca';
  _selezione = new Set();
  _modoSelezione = false;
  if (params.q) _q = params.q;
  // filtri preimpostati (es. arrivo da Analisi): applico e apro il pannello
  if (params.macro !== undefined || params.cat !== undefined || params.sub !== undefined || params.da !== undefined || params.a !== undefined || params.tipo !== undefined) {
    _filtri = {
      tipo: params.tipo || '', macro: params.macro || '', cat: params.cat || '', sub: params.sub || '',
      conto: params.conto || '', da: params.da || '', a: params.a || '', min: '', max: '',
    };
    _filtriAperti = false;
  }

  const nFiltri = Object.values(_filtri).filter(v => v !== '').length;
  const macros = [...new Set(state.movimenti.map(m => m.macro).filter(Boolean))].sort();
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);

  root.innerHTML = `
    <div class="searchbar">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="q" placeholder="Descrizione, importo, categoria, tag, conto..." value="${escapeHtml(_q)}" autocomplete="off">
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

  const esegui = () => {
    _q = inp.value;
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

    const toolbar = _modoSelezione ? `
      <div class="sel-toolbar">
        <span class="sel-count">${_selezione.size} selezionati</span>
        <div class="sel-actions">
          <button class="sel-tutti" id="sel-tutti">Tutti</button>
          <button class="sel-modifica" id="sel-modifica">Modifica</button>
        </div>
      </div>` : `
      <div class="search-summary"><div class="n">${count} movimenti trovati</div><div style="font-size:14.5px;line-height:1.7">${pezzi.join(' · ') || '—'}</div></div>
      <div style="text-align:right;margin:8px 0"><button class="btn btn-secondary" id="attiva-sel" style="width:auto;display:inline-flex;padding:8px 14px;font-size:13px">Seleziona</button></div>`;

    box.innerHTML = toolbar + '<div>' + risultati.slice(0, 300).map(m => {
      const segno = m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ ';
      const cls = m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr';
      const icona = m.macro ? iconaMacro(m.macro) : iconaTipo(m.tipo);
      const classif = [m.macro, m.cat, m.sub].filter(Boolean).join(' › ') || m.tipo;
      const sotto = classif;
      const sel = _selezione.has(m.id);
      return `<div class="mov tipo-${m.tipo} ${_modoSelezione ? 'selectable' : ''} ${sel ? 'sel' : ''}" data-mov="${m.id}">
        ${_modoSelezione ? `<div class="selbox">${sel ? '✓' : ''}</div>` : ''}
        <div class="ic">${icona}</div>
        <div class="body"><div class="d1">${escapeHtml(m.desc || classif)}</div><div class="d2"><span class="cls">${escapeHtml(classif)}</span> <span class="cnt">· ${fmtDataEstesa(m.data)}${m.conto ? ' · ' + escapeHtml(m.conto) : ''}</span></div></div>
        <div class="amt ${cls} num">${segno}${fmtEUR(m.imp)}</div>
      </div>`;
    }).join('') + '</div>';

    // gestione click
    box.querySelectorAll('[data-mov]').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.mov;
      if (_modoSelezione) {
        if (_selezione.has(id)) _selezione.delete(id); else _selezione.add(id);
        esegui();
      } else {
        navigate('modifica', { id });
      }
    }));

    const attiva = box.querySelector('#attiva-sel');
    if (attiva) attiva.addEventListener('click', () => { _modoSelezione = true; esegui(); });
    const selTutti = box.querySelector('#sel-tutti');
    if (selTutti) selTutti.addEventListener('click', () => {
      if (_selezione.size === risultati.length) _selezione.clear();
      else risultati.forEach(m => _selezione.add(m.id));
      esegui();
    });
    const selMod = box.querySelector('#sel-modifica');
    if (selMod) selMod.addEventListener('click', () => {
      if (!_selezione.size) { toast('Seleziona almeno un movimento'); return; }
      _apriModificaMassiva(root, esegui);
    });
  };

  inp.addEventListener('input', esegui);

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

// Sheet per scegliere QUALE campo modificare in blocco
const _apriModificaMassiva = (root, refresh) => {
  const n = _selezione.size;
  apriSheet(`Modifica ${n} operazioni`, `
    <p class="meta" style="margin-bottom:14px">Scegli cosa modificare su tutte le operazioni selezionate.</p>
    <button class="btn btn-secondary" id="mm-cat" style="margin-bottom:8px">🏷️ Categoria</button>
    <button class="btn btn-secondary" id="mm-conto" style="margin-bottom:8px">💳 Conto</button>
    <button class="btn btn-secondary" id="mm-trasf" style="margin-bottom:8px">⇄ Da conto → A conto (trasferimenti)</button>
    <button class="btn btn-secondary" id="mm-desc" style="margin-bottom:8px">💬 Descrizione</button>
    <button class="btn btn-secondary" id="mm-tag" style="margin-bottom:8px">#️⃣ Aggiungi tag</button>
    <button class="btn btn-secondary" id="mm-tipo" style="margin-bottom:8px">🔀 Tipo (spesa/entrata/trasferimento)</button>
  `, (body, chiudi) => {
    const ids = Array.from(_selezione);

    body.querySelector('#mm-cat').addEventListener('click', () => {
      chiudi();
      apriSelettoreCategoria(async (sel) => {
        const n = await modificaMassiva(ids, { macro: sel.macro, cat: sel.cat, sub: sel.sub });
        toast(`Categoria aggiornata su ${n} operazioni`); _selezione.clear(); _modoSelezione = false; refresh();
      });
    });

    body.querySelector('#mm-conto').addEventListener('click', () => {
      chiudi(); _scegliConto(root, 'Conto', async (conto) => {
        const n = await modificaMassiva(ids, { conto });
        toast(`Conto aggiornato su ${n} operazioni`); _selezione.clear(); _modoSelezione = false; refresh();
      });
    });

    body.querySelector('#mm-trasf').addEventListener('click', () => {
      chiudi(); _scegliConto(root, 'Da conto', async (conto) => {
        _scegliConto(root, 'A conto', async (contoDest) => {
          const n = await modificaMassiva(ids, { tipo: 'trasferimento', conto, contoDest });
          toast(`${n} operazioni convertite in trasferimento`); _selezione.clear(); _modoSelezione = false; refresh();
        });
      });
    });

    body.querySelector('#mm-desc').addEventListener('click', () => {
      chiudi();
      apriSheet('Nuova descrizione', `<input id="mm-desc-inp" placeholder="Descrizione" class="sheet-input"><button class="btn btn-primary" id="mm-desc-ok">Applica</button>`, (b2, c2) => {
        b2.querySelector('#mm-desc-ok').addEventListener('click', async () => {
          const desc = b2.querySelector('#mm-desc-inp').value.trim();
          if (!desc) return;
          const n = await modificaMassiva(ids, { desc });
          c2(); toast(`Descrizione aggiornata su ${n} operazioni`); _selezione.clear(); _modoSelezione = false; refresh();
        });
      });
    });

    body.querySelector('#mm-tag').addEventListener('click', () => {
      chiudi();
      apriSheet('Aggiungi tag', `<input id="mm-tag-inp" placeholder="Nome tag" class="sheet-input"><button class="btn btn-primary" id="mm-tag-ok">Applica</button>`, (b2, c2) => {
        b2.querySelector('#mm-tag-ok').addEventListener('click', async () => {
          const tag = b2.querySelector('#mm-tag-inp').value.trim();
          if (!tag) return;
          const n = await applicaTagBulk(ids, tag);
          c2(); toast(`Tag applicato a ${n} operazioni`); _selezione.clear(); _modoSelezione = false; refresh();
        });
      });
    });

    body.querySelector('#mm-tipo').addEventListener('click', () => {
      chiudi();
      apriSheet('Cambia tipo', `
        <button class="btn btn-secondary" id="t-spesa" style="margin-bottom:8px">Spesa</button>
        <button class="btn btn-secondary" id="t-entrata" style="margin-bottom:8px">Entrata</button>
        <button class="btn btn-secondary" id="t-trasf">Trasferimento</button>
      `, (b2, c2) => {
        const applica = async (tipo) => { const n = await modificaMassiva(ids, { tipo }); c2(); toast(`Tipo aggiornato su ${n} operazioni`); _selezione.clear(); _modoSelezione = false; refresh(); };
        b2.querySelector('#t-spesa').addEventListener('click', () => applica('spesa'));
        b2.querySelector('#t-entrata').addEventListener('click', () => applica('entrata'));
        b2.querySelector('#t-trasf').addEventListener('click', () => applica('trasferimento'));
      });
    });
  });
};

const _scegliConto = (root, titolo, onPick) => {
  const conti = state.conti.filter(c => c.attivo !== false);
  apriSheet(titolo, '', (body, chiudi) => {
    body.innerHTML = conti.map(c => `<div class="mov" data-c="${escapeHtml(c.nome)}"><div class="ic">💳</div><div class="body"><div class="d1">${escapeHtml(c.nome)}</div><div class="d2">${c.tipo}</div></div></div>`).join('');
    body.querySelectorAll('[data-c]').forEach(el => el.addEventListener('click', () => { const nome = el.dataset.c; chiudi(); onPick(nome); }));
  });
};
