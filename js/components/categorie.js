// categorie.js — Anagrafica categorie: elenco a sezioni espandibili con GESTIONE
// COMPLETA: rinomina (propagata a movimenti/ricorrenze/rate), eliminazione con
// conteggio movimenti e riassegnazione opzionale, aggiunta.

import { state } from '../core/store.js';
import { escapeHtml, fmtEUR } from '../core/utils.js';
import {
  listaMacro, categorieDi, sottocategorieDi, saveCategoria,
  contaMovimentiNodo, rinominaNodo, eliminaNodo,
} from '../services/categorieService.js';
import { navigate } from '../core/router.js';
import { apriSheet, apriSelettoreCategoria } from './shared.js';
import { toast } from '../core/utils.js';

const _aperte = new Set();      // macro espanse
const _aperteCat = new Set();   // categorie espanse ("macro|cat")

export const renderCategorie = async (root) => {
  document.getElementById('view-title').textContent = 'Categorie';
  const macros = listaMacro();

  root.innerHTML = `
    <p class="meta" style="margin:12px 4px">Tocca per aprire l'albero, ✎ per rinominare o eliminare. Le rinomine aggiornano anche i movimenti passati.</p>
    ${macros.map(macro => {
      const cats = categorieDi(macro);
      const aperta = _aperte.has(macro);
      return `
        <div class="cat-accordion">
          <div class="cat-acc-head" data-macro="${escapeHtml(macro)}">
            <div class="cat-acc-title">${escapeHtml(macro)}</div>
            <div class="cat-acc-meta">${cats.length} categorie</div>
            <div class="cat-gest" data-gest-macro="${escapeHtml(macro)}">✎</div>
            <div class="cat-acc-chev">${aperta ? '⌄' : '›'}</div>
          </div>
          ${aperta ? `<div class="cat-acc-body">
            ${cats.length ? cats.map(cat => {
              const subs = sottocategorieDi(macro, cat);
              const kCat = macro + '|' + cat;
              const catAperta = _aperteCat.has(kCat);
              return `
                <div class="cat-riga" data-togglecat="${escapeHtml(kCat)}">
                  <div class="cat-riga-nome" style="flex:1">${escapeHtml(cat)}${subs.length ? ` <span class="meta">· ${subs.length} sub</span>` : ''}</div>
                  <div class="cat-gest" data-gest-cat="${escapeHtml(kCat)}">✎</div>
                  ${subs.length ? `<div class="cat-acc-chev">${catAperta ? '⌄' : '›'}</div>` : '<div class="cat-acc-chev" style="opacity:.25">·</div>'}
                </div>
                ${catAperta && subs.length ? subs.map(s => `
                  <div class="cat-riga cat-riga-sub">
                    <div class="cat-riga-nome" style="flex:1;color:var(--txt-2)">${escapeHtml(s)}</div>
                    <div class="cat-gest" data-gest-sub="${escapeHtml(macro)}|${escapeHtml(cat)}|${escapeHtml(s)}">✎</div>
                    <div class="cat-acc-chev" style="opacity:0">·</div>
                  </div>`).join('') : ''}`;
            }).join('') : '<div class="meta" style="padding:12px 16px">Nessuna categoria</div>'}
          </div>` : ''}
        </div>`;
    }).join('')}
    <div style="margin-top:20px"><button class="btn btn-primary" id="nuova">➕ Nuova categoria</button></div>
  `;

  root.querySelectorAll('[data-macro]').forEach(el => el.addEventListener('click', () => {
    const m = el.dataset.macro;
    if (_aperte.has(m)) _aperte.delete(m); else _aperte.add(m);
    renderCategorie(root);
  }));
  root.querySelectorAll('[data-togglecat]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.togglecat;
    if (_aperteCat.has(k)) _aperteCat.delete(k); else _aperteCat.add(k);
    renderCategorie(root);
  }));
  root.querySelectorAll('[data-gest-macro]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation(); _gestisciNodo(root, 'macro', el.dataset.gestMacro, '', '');
  }));
  root.querySelectorAll('[data-gest-cat]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation(); const [ma, ca] = el.dataset.gestCat.split('|'); _gestisciNodo(root, 'cat', ma, ca, '');
  }));
  root.querySelectorAll('[data-gest-sub]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation(); const [ma, ca, su] = el.dataset.gestSub.split('|'); _gestisciNodo(root, 'sub', ma, ca, su);
  }));
  root.querySelector('#nuova').addEventListener('click', () => _nuovaCategoria(root, macros));
};

// Sheet di gestione di un nodo (macro/cat/sub): rinomina propagata, elimina con scelte
const _gestisciNodo = (root, livello, macro, cat, sub) => {
  const nome = livello === 'macro' ? macro : livello === 'cat' ? cat : sub;
  const nMov = contaMovimentiNodo(macro, livello !== 'macro' ? cat : '', livello === 'sub' ? sub : '');
  const lblLiv = livello === 'macro' ? 'macrocategoria' : livello === 'cat' ? 'categoria' : 'sottocategoria';

  apriSheet(`${nome}`, `
    <p class="meta" style="margin-bottom:14px">${lblLiv.charAt(0).toUpperCase() + lblLiv.slice(1)} · <b>${nMov}</b> movimenti la usano</p>

    <label class="meta">Rinomina</label>
    <input id="g-nome" value="${escapeHtml(nome)}" class="sheet-input">
    <button class="btn btn-primary" id="g-rinomina" style="margin-bottom:16px">Rinomina (aggiorna anche i ${nMov} movimenti)</button>

    <div class="divider" style="margin:6px 0 14px"></div>
    <label class="meta">Elimina</label>
    ${nMov > 0 ? `
      <p class="meta" style="font-size:12px;margin:4px 0 10px;color:var(--down)">⚠️ Questa ${lblLiv} è usata da ${nMov} movimenti. Scegli cosa farne:</p>
      <button class="btn btn-secondary" id="g-del-riassegna" style="margin-bottom:8px">Elimina e riassegna i movimenti a un'altra categoria…</button>
      <button class="btn btn-danger" id="g-del-lascia">Elimina, lasciando i movimenti come sono</button>
      <p class="meta" style="font-size:11px;margin-top:6px;opacity:.8">Lasciandoli, i movimenti conservano l'etichetta attuale e restano visibili ovunque: sparisce solo dal selettore per i nuovi inserimenti.</p>
    ` : `
      <button class="btn btn-danger" id="g-del-lascia">Elimina (nessun movimento la usa)</button>
    `}
  `, (body, chiudi) => {
    body.querySelector('#g-rinomina').addEventListener('click', async () => {
      const nuovo = body.querySelector('#g-nome').value.trim();
      if (!nuovo || nuovo === nome) { toast('Inserisci un nome diverso'); return; }
      try {
        const n = await rinominaNodo(livello, macro, cat, sub, nuovo, true);
        chiudi(); toast(`Rinominata · ${n} movimenti aggiornati`); renderCategorie(root);
      } catch (e) { toast(e.message); }
    });

    body.querySelector('#g-del-lascia').addEventListener('click', async () => {
      if (!confirm(nMov > 0
        ? `Eliminare "${nome}" dall'anagrafica? I ${nMov} movimenti NON verranno toccati.`
        : `Eliminare "${nome}"?`)) return;
      await eliminaNodo(livello, macro, cat, sub, null);
      chiudi(); toast('Eliminata'); renderCategorie(root);
    });

    const delRi = body.querySelector('#g-del-riassegna');
    if (delRi) delRi.addEventListener('click', () => {
      chiudi();
      apriSelettoreCategoria(async (sel) => {
        if (!confirm(`Riassegnare ${nMov} movimenti a "${[sel.macro, sel.cat, sel.sub].filter(Boolean).join(' › ')}" ed eliminare "${nome}"?`)) return;
        const n = await eliminaNodo(livello, macro, cat, sub, sel);
        toast(`Eliminata · ${n} movimenti riassegnati`); renderCategorie(root);
      });
    });
  });
};

const _nuovaCategoria = (root, macros) => {
  apriSheet('Nuova categoria', `
    <label class="meta">Macrocategoria</label>
    <input id="nc-macro" list="macro-list" placeholder="Es. Casa" class="sheet-input">
    <datalist id="macro-list">${macros.map(m => `<option>${escapeHtml(m)}</option>`).join('')}</datalist>
    <label class="meta">Categoria</label>
    <input id="nc-cat" placeholder="Es. Bollette" class="sheet-input">
    <label class="meta">Sottocategoria (opzionale)</label>
    <input id="nc-sub" placeholder="Es. Luce" class="sheet-input">
    <button class="btn btn-primary" id="nc-ok" style="margin-top:8px">Aggiungi</button>
  `, (body, chiudi) => {
    body.querySelector('#nc-ok').addEventListener('click', async () => {
      const macro = body.querySelector('#nc-macro').value.trim();
      const cat = body.querySelector('#nc-cat').value.trim();
      const sub = body.querySelector('#nc-sub').value.trim();
      if (!macro) { toast('Inserisci la macrocategoria'); return; }
      await saveCategoria({ macro, cat, sub });
      _aperte.add(macro);
      chiudi(); toast('Categoria aggiunta'); renderCategorie(root);
    });
  });
};
