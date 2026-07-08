// selezioneMultipla.js — Selezione multipla di operazioni + modifica massiva.
// Modulo CONDIVISO: usato da ricerca, elenco movimenti e (via navigazione) analisi.
// Prima questa logica viveva solo dentro ricerca.js; estrarla evita di duplicarla
// su ogni elenco e garantisce che il comportamento sia identico ovunque.
//
// Uso in un componente con una lista di movimenti:
//   const sel = creaSelezione(() => rerenderDellaLista());
//   ... nel render di ogni riga: aggiungi classe/checkbox se sel.attiva()
//   ... long-press su una riga -> sel.avvia(id); tap in modo selezione -> sel.toggle(id)
//   ... toolbar: sel.toolbarHTML(totaleVisibili)
//   ... bind pulsanti toolbar: sel.bindToolbar(root, idsVisibili)

import { state } from '../core/store.js';
import { escapeHtml, toast } from '../core/utils.js';
import { apriSheet, apriSelettoreCategoria, conferma } from './shared.js';
import { modificaMassiva, applicaTagBulk, deleteMovimento } from '../services/movimentiService.js';
import { safeWrite } from '../core/db.js';
import { UI_SVG } from '../core/icons.js';

// Crea un controller di selezione. `onChange` viene chiamato quando serve
// ri-renderizzare la lista (dopo un toggle, un avvio/uscita selezione, o una modifica).
export const creaSelezione = (onChange) => {
  let attiva = false;
  const scelti = new Set();

  const api = {
    attiva: () => attiva,
    ha: (id) => scelti.has(id),
    size: () => scelti.size,
    ids: () => Array.from(scelti),

    // avvia la modalità selezione con un primo elemento (da long-press)
    avvia(id) {
      attiva = true;
      if (id) scelti.add(id);
      onChange();
    },
    // aggiunge/toglie un elemento (tap quando la modalità è attiva)
    toggle(id) {
      if (scelti.has(id)) scelti.delete(id); else scelti.add(id);
      if (scelti.size === 0) attiva = false;   // svuotata: esco dalla modalità
      onChange();
    },
    esci() { attiva = false; scelti.clear(); onChange(); },
    esciSilenzioso() { attiva = false; scelti.clear(); },   // reset senza ri-render (all'ingresso pagina)
    selezionaTutti(ids) {
      if (ids.every(id => scelti.has(id))) scelti.clear();   // già tutti -> deseleziona
      else ids.forEach(id => scelti.add(id));
      onChange();
    },

    // barra in cima alla lista quando la modalità è attiva
    toolbarHTML() {
      return `<div class="sel-toolbar">
        <button class="sel-esci" id="sel-esci" aria-label="Annulla selezione">${UI_SVG.x || '✕'}</button>
        <span class="sel-count">${scelti.size} selezionati</span>
        <div class="sel-actions">
          <button class="sel-tutti" id="sel-tutti">Tutti</button>
          <button class="sel-modifica" id="sel-modifica" ${scelti.size ? '' : 'disabled'}>Modifica</button>
        </div>
      </div>`;
    },

    // collega i pulsanti della toolbar. `idsVisibili` = tutti gli id attualmente in lista.
    bindToolbar(root, idsVisibili) {
      const esci = root.querySelector('#sel-esci');
      if (esci) esci.addEventListener('click', () => api.esci());
      const tutti = root.querySelector('#sel-tutti');
      if (tutti) tutti.addEventListener('click', () => api.selezionaTutti(idsVisibili));
      const mod = root.querySelector('#sel-modifica');
      if (mod) mod.addEventListener('click', () => {
        if (!scelti.size) { toast('Seleziona almeno un\'operazione'); return; }
        _apriModificaMassiva(api, onChange);
      });
    },
  };
  return api;
};

// Sheet: scegli QUALE campo modificare in blocco. Riusa i servizi esistenti.
const _apriModificaMassiva = (sel, refresh) => {
  const n = sel.size();
  const finito = (msg) => { toast(msg); sel.esci(); };
  apriSheet(`Modifica ${n} operazioni`, `
    <p class="conferma-testo" style="margin-bottom:14px">Scegli cosa modificare sulle operazioni selezionate.</p>
    <button class="btn btn-secondary mm-btn" id="mm-cat">${UI_SVG.tag} Categoria</button>
    <button class="btn btn-secondary mm-btn" id="mm-conto">${UI_SVG.conto} Conto</button>
    <button class="btn btn-secondary mm-btn" id="mm-desc">${UI_SVG.descrizione} Descrizione</button>
    <button class="btn btn-secondary mm-btn" id="mm-tag">${UI_SVG.hashtag} Aggiungi tag</button>
    <button class="btn btn-secondary mm-btn" id="mm-tipo">${UI_SVG.ripeti || ''} Tipo operazione</button>
    <button class="btn btn-danger mm-btn" id="mm-del">Elimina le ${n} operazioni</button>
  `, (body, chiudi) => {
    const ids = sel.ids();

    body.querySelector('#mm-cat').addEventListener('click', () => {
      chiudi();
      apriSelettoreCategoria(async (s) => {
        const k = await modificaMassiva(ids, { macro: s.macro, cat: s.cat, sub: s.sub });
        finito(`Categoria aggiornata su ${k} operazioni`); refresh();
      });
    });

    body.querySelector('#mm-conto').addEventListener('click', () => {
      chiudi(); _scegliConto('Sposta su quale conto?', async (conto) => {
        const k = await modificaMassiva(ids, { conto });
        finito(`Conto aggiornato su ${k} operazioni`); refresh();
      });
    });

    body.querySelector('#mm-desc').addEventListener('click', () => {
      chiudi();
      apriSheet('Nuova descrizione', `<input id="mm-desc-inp" placeholder="Descrizione" class="sheet-input"><button class="btn btn-primary" id="mm-desc-ok" style="margin-top:10px">Applica</button>`, (b2, c2) => {
        b2.querySelector('#mm-desc-ok').addEventListener('click', async () => {
          const desc = b2.querySelector('#mm-desc-inp').value.trim();
          if (!desc) return;
          const k = await modificaMassiva(ids, { desc });
          c2(); finito(`Descrizione aggiornata su ${k} operazioni`); refresh();
        });
      });
    });

    body.querySelector('#mm-tag').addEventListener('click', () => {
      chiudi();
      apriSheet('Aggiungi tag', `<input id="mm-tag-inp" placeholder="Nome tag" class="sheet-input"><button class="btn btn-primary" id="mm-tag-ok" style="margin-top:10px">Applica</button>`, (b2, c2) => {
        b2.querySelector('#mm-tag-ok').addEventListener('click', async () => {
          const tag = b2.querySelector('#mm-tag-inp').value.trim();
          if (!tag) return;
          const k = await applicaTagBulk(ids, tag);
          c2(); finito(`Tag applicato a ${k} operazioni`); refresh();
        });
      });
    });

    body.querySelector('#mm-tipo').addEventListener('click', () => {
      chiudi();
      apriSheet('Cambia tipo', `
        <button class="btn btn-secondary mm-btn" id="t-spesa">Spesa</button>
        <button class="btn btn-secondary mm-btn" id="t-entrata">Entrata</button>
        <button class="btn btn-secondary mm-btn" id="t-trasf">Trasferimento</button>
      `, (b2, c2) => {
        const applica = async (tipo) => { const k = await modificaMassiva(ids, { tipo }); c2(); finito(`Tipo aggiornato su ${k} operazioni`); refresh(); };
        b2.querySelector('#t-spesa').addEventListener('click', () => applica('spesa'));
        b2.querySelector('#t-entrata').addEventListener('click', () => applica('entrata'));
        b2.querySelector('#t-trasf').addEventListener('click', () => applica('trasferimento'));
      });
    });

    body.querySelector('#mm-del').addEventListener('click', async () => {
      chiudi();
      if (!(await conferma(`Eliminare le ${ids.length} operazioni selezionate? L'azione non è reversibile.`, { danger: true, ok: 'Elimina tutte' }))) return;
      const ok = await safeWrite(async () => { for (const id of ids) await deleteMovimento(id); }, 'Eliminazione non riuscita');
      if (!ok) return;
      finito(`${ids.length} operazioni eliminate`); refresh();
    });
  });
};

const _scegliConto = (titolo, onPick) => {
  const conti = state.conti.filter(c => c.attivo !== false);
  apriSheet(titolo, '', (body, chiudi) => {
    body.innerHTML = conti.map(c => `<div class="mov" data-c="${escapeHtml(c.nome)}"><div class="ic">${UI_SVG.conto}</div><div class="body"><div class="d1">${escapeHtml(c.nome)}</div><div class="d2">${escapeHtml(c.tipo)}</div></div></div>`).join('');
    body.querySelectorAll('[data-c]').forEach(el => el.addEventListener('click', () => { const nome = el.dataset.c; chiudi(); onPick(nome); }));
  });
};
