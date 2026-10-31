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
import { apriSheet, apriSelettoreCategoria, conferma } from './shared.js';
import { UI_SVG } from '../core/icons.js';
import { safeWrite } from '../core/db.js';
import { toast } from '../core/utils.js';
import { macroDiSpesa, naturaCategoria, eccezioneSub, impostaNaturaCategoria, alternaEccezioneSub } from '../services/naturaService.js';
import { scegliNatura } from './bisogni.js';

// etichetta bisogno/desiderio (solo per le macro di spesa)
const _pill = (v, attrs) => {
  const stile = v === 'B' ? 'background:rgba(123,108,255,.18);color:#9D8FFF'
    : v === 'D' ? 'background:rgba(255,59,92,.14);color:#FF6B80'
    : 'background:rgba(245,166,35,.16);color:var(--warn)';
  const testo = v === 'B' ? 'Bisogno' : v === 'D' ? 'Desiderio' : 'Da classificare';
  return `<span class="natura-pill" ${attrs} role="button" style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:8px;white-space:nowrap;cursor:pointer;${stile}">${testo}</span>`;
};

const _aperte = new Set();      // macro espanse
const _aperteCat = new Set();   // categorie espanse ("macro|cat")

export const renderCategorie = async (root) => {
  document.getElementById('view-title').textContent = 'Categorie';
  const macros = listaMacro();

  root.innerHTML = `
    <p class="meta" style="margin:12px 4px">Tocca per aprire l'albero, la matita per rinominare o eliminare. Le rinomine aggiornano anche i movimenti passati.</p>
    <p class="meta" style="margin:0 4px 12px">Tocca <b>Bisogno</b>/<b>Desiderio</b> per cambiarlo. Le sottocategorie seguono la categoria; toccane una per farne un'eccezione.</p>
    ${macros.map(macro => {
      const cats = categorieDi(macro);
      const aperta = _aperte.has(macro);
      return `
        <div class="cat-accordion">
          <div class="cat-acc-head" data-macro="${escapeHtml(macro)}">
            <div class="cat-acc-title">${escapeHtml(macro)}</div>
            <div class="cat-acc-meta">${cats.length} categorie</div>
            <div class="cat-gest" data-gest-macro="${escapeHtml(macro)}" role="button" aria-label="Gestisci ${escapeHtml(macro)}">${UI_SVG.matita}</div>
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
                  ${macroDiSpesa(macro) ? _pill(naturaCategoria(macro, cat), `data-nat-cat="${escapeHtml(kCat)}"`) : ''}
                  <div class="cat-gest" data-gest-cat="${escapeHtml(kCat)}" role="button" aria-label="Gestisci categoria">${UI_SVG.matita}</div>
                  ${subs.length ? `<div class="cat-acc-chev">${catAperta ? '⌄' : '›'}</div>` : '<div class="cat-acc-chev" style="opacity:.25">·</div>'}
                </div>
                ${catAperta && subs.length ? subs.map(s => `
                  <div class="cat-riga cat-riga-sub">
                    <div class="cat-riga-nome" style="flex:1;color:var(--txt-2)">${escapeHtml(s)}</div>
                    ${macroDiSpesa(macro) && naturaCategoria(macro, cat) ? (eccezioneSub(macro, cat, s)
                      ? _pill(eccezioneSub(macro, cat, s), `data-nat-sub="${escapeHtml(macro)}|${escapeHtml(cat)}|${escapeHtml(s)}"`)
                      : `<span class="natura-pill meta" data-nat-sub="${escapeHtml(macro)}|${escapeHtml(cat)}|${escapeHtml(s)}" role="button" style="font-size:11px;cursor:pointer;white-space:nowrap">come categoria</span>`) : ''}
                    <div class="cat-gest" data-gest-sub="${escapeHtml(macro)}|${escapeHtml(cat)}|${escapeHtml(s)}" role="button" aria-label="Gestisci sottocategoria">${UI_SVG.matita}</div>
                    <div class="cat-acc-chev" style="opacity:0">·</div>
                  </div>`).join('') : ''}`;
            }).join('') : '<div class="meta" style="padding:12px 16px">Nessuna categoria</div>'}
          </div>` : ''}
        </div>`;
    }).join('')}
    <div style="margin-top:20px"><button class="btn btn-primary" id="nuova">Nuova categoria</button></div>
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
  // bisogno/desiderio: categoria (alterna, o sceglie se da classificare) ed eccezioni
  root.querySelectorAll('[data-nat-cat]').forEach(el => el.addEventListener('click', async (e) => {
    e.stopPropagation();
    const [ma, ca] = el.dataset.natCat.split('|');
    const attuale = naturaCategoria(ma, ca);
    if (!attuale) { scegliNatura(ca, async (v) => { await impostaNaturaCategoria(ma, ca, v); renderCategorie(root); }); return; }
    await impostaNaturaCategoria(ma, ca, attuale === 'B' ? 'D' : 'B');
    renderCategorie(root);
  }));
  root.querySelectorAll('[data-nat-sub]').forEach(el => el.addEventListener('click', async (e) => {
    e.stopPropagation();
    const [ma, ca, su] = el.dataset.natSub.split('|');
    await alternaEccezioneSub(ma, ca, su);
    renderCategorie(root);
  }));
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
      <p class="meta" style="font-size:12px;margin:4px 0 10px;color:var(--down)">Questa ${lblLiv} è usata da ${nMov} movimenti. Scegli cosa farne:</p>
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
      const msg = nMov > 0
        ? `Eliminare "${nome}" dall'anagrafica? I ${nMov} movimenti NON verranno toccati.`
        : `Eliminare "${nome}"?`;
      if (!(await conferma(msg, { danger: true, ok: 'Elimina' }))) return;
      await eliminaNodo(livello, macro, cat, sub, null);
      chiudi(); toast('Eliminata'); renderCategorie(root);
    });

    const delRi = body.querySelector('#g-del-riassegna');
    if (delRi) delRi.addEventListener('click', () => {
      chiudi();
      apriSelettoreCategoria(async (sel) => {
        if (!(await conferma(`Riassegnare ${nMov} movimenti a "${[sel.macro, sel.cat, sel.sub].filter(Boolean).join(' › ')}" ed eliminare "${nome}"?`, { ok: 'Riassegna ed elimina', danger: true }))) return;
        const n = await eliminaNodo(livello, macro, cat, sub, sel);
        toast(`Eliminata · ${n} movimenti riassegnati`); renderCategorie(root);
      });
    });
  });
};

const _nuovaCategoria = (root, macros) => {
  apriSheet('Nuova categoria', `
    <label class="meta">Macrocategoria</label>
    <input id="nc-macro" list="macro-list" placeholder="Es. Casa" class="sheet-input" autocomplete="off">
    <datalist id="macro-list">${macros.map(m => `<option>${escapeHtml(m)}</option>`).join('')}</datalist>
    <label class="meta">Categoria</label>
    <input id="nc-cat" list="cat-list" placeholder="Es. Bollette" class="sheet-input" autocomplete="off">
    <datalist id="cat-list"></datalist>
    <label class="meta">Sottocategoria (opzionale)</label>
    <input id="nc-sub" list="sub-list" placeholder="Es. Luce" class="sheet-input" autocomplete="off">
    <datalist id="sub-list"></datalist>
    <div id="nc-nat-wrap" style="display:none">
      <label class="meta">È un bisogno o un desiderio?</label>
      <div class="btn-row" style="margin:6px 0 4px">
        <button class="btn btn-secondary" data-nc-nat="B">Bisogno</button>
        <button class="btn btn-secondary" data-nc-nat="D">Desiderio</button>
      </div>
    </div>
    <button class="btn btn-primary" id="nc-ok" style="margin-top:8px">Aggiungi</button>
  `, (body, chiudi) => {
    const inMacro = body.querySelector('#nc-macro');
    const inCat = body.querySelector('#nc-cat');
    const dlCat = body.querySelector('#cat-list');
    const dlSub = body.querySelector('#sub-list');
    // cascata: le opzioni di categoria dipendono dalla macro digitata
    const aggiornaCat = () => {
      const m = inMacro.value.trim();
      const cats = m ? categorieDi(m) : [];
      dlCat.innerHTML = cats.map(c => `<option>${escapeHtml(c)}</option>`).join('');
      aggiornaSub();
    };
    // le sub dipendono da macro + categoria digitate
    const aggiornaSub = () => {
      const m = inMacro.value.trim(), c = inCat.value.trim();
      const subs = (m && c) ? sottocategorieDi(m, c) : [];
      dlSub.innerHTML = subs.map(s => `<option>${escapeHtml(s)}</option>`).join('');
    };
    inMacro.addEventListener('input', aggiornaCat);
    inMacro.addEventListener('change', aggiornaCat);
    inCat.addEventListener('input', aggiornaSub);
    inCat.addEventListener('change', aggiornaSub);
    // bisogno/desiderio: richiesto per una CATEGORIA NUOVA di una macro di spesa
    let natura = null;
    const natWrap = body.querySelector('#nc-nat-wrap');
    const serveNatura = () => {
      const m = inMacro.value.trim(), c = inCat.value.trim();
      return !!(m && c && macroDiSpesa(m) && !naturaCategoria(m, c));
    };
    const aggiornaNat = () => { natWrap.style.display = serveNatura() ? '' : 'none'; };
    [inMacro, inCat].forEach(x => { x.addEventListener('input', aggiornaNat); x.addEventListener('change', aggiornaNat); });
    body.querySelectorAll('[data-nc-nat]').forEach(b => b.addEventListener('click', () => {
      natura = b.dataset.ncNat;
      body.querySelectorAll('[data-nc-nat]').forEach(x => x.classList.toggle('btn-primary', x === b));
      body.querySelectorAll('[data-nc-nat]').forEach(x => x.classList.toggle('btn-secondary', x !== b));
    }));

    body.querySelector('#nc-ok').addEventListener('click', async () => {
      const macro = inMacro.value.trim();
      const cat = inCat.value.trim();
      const sub = body.querySelector('#nc-sub').value.trim();
      if (!macro) { toast('Inserisci la macrocategoria'); return; }
      const chiedeNatura = serveNatura();
      if (chiedeNatura && !natura) { toast('Scegli se è un bisogno o un desiderio'); return; }
      const ok = await safeWrite(async () => {
        await saveCategoria({ macro, cat, sub });
        if (chiedeNatura) await impostaNaturaCategoria(macro, cat, natura);
      }, 'Categoria non salvata');
      if (!ok) return;
      _aperte.add(macro);
      chiudi(); toast('Categoria aggiunta'); renderCategorie(root);
    });
  });
};
