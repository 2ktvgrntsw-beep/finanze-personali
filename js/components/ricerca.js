// ricerca.js — Ricerca full-text con totale aggregato + selezione multipla e
// modifica massiva di qualsiasi campo (categoria, conto, da/a conto, descrizione, tag).

import { fmtEUR, escapeHtml, fmtDataEstesa } from '../core/utils.js';
import { iconaMacro, iconaTipo } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { state } from '../core/store.js';
import { cercaMovimenti, modificaMassiva, applicaTagBulk } from '../services/movimentiService.js';
import { apriSelettoreCategoria, apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

let _selezione = new Set();
let _modoSelezione = false;
let _ultimiRisultati = [];

export const renderRicerca = async (root, params = {}) => {
  document.getElementById('view-title').textContent = 'Cerca';
  _selezione = new Set();
  _modoSelezione = false;

  root.innerHTML = `
    <div class="searchbar">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="q" placeholder="Descrizione, importo, categoria, tag, conto..." value="${escapeHtml(params.q || '')}" autocomplete="off">
    </div>
    <div id="ris"></div>
  `;

  const inp = root.querySelector('#q');
  const box = root.querySelector('#ris');

  const esegui = () => {
    const { risultati, totale, count } = cercaMovimenti(inp.value);
    _ultimiRisultati = risultati;
    if (!inp.value.trim()) { box.innerHTML = '<div class="empty">Scrivi qualcosa per cercare tra tutti i tuoi movimenti</div>'; return; }
    if (!count) { box.innerHTML = '<div class="empty"><div class="big-ic">🔍</div>Nessun risultato</div>'; return; }

    const toolbar = _modoSelezione ? `
      <div class="sel-toolbar">
        <span class="sel-count">${_selezione.size} selezionati</span>
        <div class="sel-actions">
          <button class="sel-tutti" id="sel-tutti">Tutti</button>
          <button class="sel-modifica" id="sel-modifica">Modifica</button>
        </div>
      </div>` : `
      <div class="search-summary"><div class="n">${count} movimenti · totale spese</div><div class="big num">${fmtEUR(totale)}</div></div>
      <div style="text-align:right;margin:8px 0"><button class="btn btn-secondary" id="attiva-sel" style="width:auto;display:inline-flex;padding:8px 14px;font-size:13px">Seleziona</button></div>`;

    box.innerHTML = toolbar + '<div>' + risultati.slice(0, 300).map(m => {
      const segno = m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ ';
      const cls = m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr';
      const icona = m.macro ? iconaMacro(m.macro) : iconaTipo(m.tipo);
      const sotto = [m.macro, m.cat].filter(Boolean).join(' · ') || m.tipo;
      const sel = _selezione.has(m.id);
      return `<div class="mov ${_modoSelezione ? 'selectable' : ''} ${sel ? 'sel' : ''}" data-mov="${m.id}">
        ${_modoSelezione ? `<div class="selbox">${sel ? '✓' : ''}</div>` : ''}
        <div class="ic">${icona}</div>
        <div class="body"><div class="d1">${escapeHtml(m.desc || sotto)}</div><div class="d2">${fmtDataEstesa(m.data)} · ${escapeHtml(sotto)}</div></div>
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
  esegui();
  if (!params.q) setTimeout(() => inp.focus(), 100);
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
