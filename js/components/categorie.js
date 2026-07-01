// categorie.js — Gestione anagrafica categorie (macro/cat/sub).

import { state } from '../core/store.js';
import { escapeHtml } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { listaMacro, categorieDi, sottocategorieDi, saveCategoria } from '../services/categorieService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

export const renderCategorie = async (root) => {
  document.getElementById('view-title').textContent = 'Categorie';
  const macros = listaMacro();

  root.innerHTML = `
    ${macros.map(macro => {
      const cats = categorieDi(macro);
      return `
        <div class="section-lbl"><span>${iconaMacro(macro)} ${escapeHtml(macro)}</span></div>
        <div class="card" style="padding:0">
          ${cats.length ? cats.map((cat, i) => {
            const subs = sottocategorieDi(macro, cat);
            return `<div class="patrow" style="padding:12px 16px"><div class="body"><div class="row1"><span class="name" style="font-size:14px">${escapeHtml(cat)}</span></div>${subs.length ? `<div class="sub">${subs.map(escapeHtml).join(' · ')}</div>` : ''}</div></div>${i < cats.length - 1 ? '<div class="divider"></div>' : ''}`;
          }).join('') : '<div class="meta" style="padding:14px">Nessuna categoria</div>'}
        </div>`;
    }).join('')}
    <div style="margin-top:20px"><button class="btn btn-primary" id="nuova">➕ Nuova categoria</button></div>
  `;

  root.querySelector('#nuova').addEventListener('click', () => {
    apriSheet('Nuova categoria', `
      <label class="meta">Macrocategoria</label>
      <input id="nc-macro" list="macro-list" placeholder="Es. Casa" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
      <datalist id="macro-list">${macros.map(m => `<option>${escapeHtml(m)}</option>`).join('')}</datalist>
      <label class="meta">Categoria</label>
      <input id="nc-cat" placeholder="Es. Bollette" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
      <label class="meta">Sottocategoria (opzionale)</label>
      <input id="nc-sub" placeholder="Es. Luce" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
      <button class="btn btn-primary" id="nc-ok">Aggiungi</button>
    `, (body, chiudi) => {
      body.querySelector('#nc-ok').addEventListener('click', async () => {
        const macro = body.querySelector('#nc-macro').value.trim();
        const cat = body.querySelector('#nc-cat').value.trim();
        const sub = body.querySelector('#nc-sub').value.trim();
        if (!macro) { toast('Inserisci la macrocategoria'); return; }
        await saveCategoria({ macro, cat, sub });
        chiudi(); toast('Categoria aggiunta'); renderCategorie(root);
      });
    });
  });
};
