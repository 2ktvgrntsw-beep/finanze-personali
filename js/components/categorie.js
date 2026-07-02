// categorie.js — Anagrafica categorie ripensata: elenco a sezioni espandibili
// (accordion) senza griglia di icone, con conteggio movimenti per categoria e
// accesso rapido ai movimenti di ciascuna. Coerente con i gruppi del Patrimonio.

import { state } from '../core/store.js';
import { escapeHtml, fmtEUR } from '../core/utils.js';
import { listaMacro, categorieDi, sottocategorieDi, saveCategoria } from '../services/categorieService.js';
import { navigate } from '../core/router.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

const _aperte = new Set();   // macro espanse

export const renderCategorie = async (root) => {
  document.getElementById('view-title').textContent = 'Categorie';
  const macros = listaMacro();

  // totali e conteggi per macro/categoria (dalle spese)
  const spesaMacro = {}, countMacro = {}, spesaCat = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    spesaMacro[m.macro] = (spesaMacro[m.macro] || 0) + m.imp;
    countMacro[m.macro] = (countMacro[m.macro] || 0) + 1;
    const k = m.macro + '||' + (m.cat || '');
    spesaCat[k] = (spesaCat[k] || 0) + m.imp;
  }

  root.innerHTML = `
    <p class="meta" style="margin:12px 4px">Le tue categorie, raggruppate. Tocca una macrocategoria per vedere cosa contiene.</p>
    ${macros.map(macro => {
      const cats = categorieDi(macro);
      const aperta = _aperte.has(macro);
      const tot = spesaMacro[macro] || 0;
      const cnt = countMacro[macro] || 0;
      return `
        <div class="cat-accordion">
          <div class="cat-acc-head" data-macro="${escapeHtml(macro)}">
            <div class="cat-acc-title">${escapeHtml(macro)}</div>
            <div class="cat-acc-meta">${cats.length} cat · ${cnt} mov</div>
            <div class="cat-acc-tot num">${fmtEUR(tot)}</div>
            <div class="cat-acc-chev">${aperta ? '⌄' : '›'}</div>
          </div>
          ${aperta ? `<div class="cat-acc-body">
            ${cats.length ? cats.map(cat => {
              const subs = sottocategorieDi(macro, cat);
              const sc = spesaCat[macro + '||' + cat] || 0;
              return `
                <div class="cat-riga" data-cat="${escapeHtml(macro)}|${escapeHtml(cat)}">
                  <div style="flex:1">
                    <div class="cat-riga-nome">${escapeHtml(cat)}</div>
                    ${subs.length ? `<div class="cat-riga-subs">${subs.map(escapeHtml).join(' · ')}</div>` : ''}
                  </div>
                  <div class="num" style="font-size:13px;color:var(--txt-2)">${fmtEUR(sc)}</div>
                  <div class="cat-acc-chev">›</div>
                </div>`;
            }).join('') : '<div class="meta" style="padding:12px 16px">Nessuna categoria</div>'}
          </div>` : ''}
        </div>`;
    }).join('')}
    <div style="margin-top:20px"><button class="btn btn-primary" id="nuova">➕ Nuova categoria</button></div>
  `;

  // espandi/collassa macro
  root.querySelectorAll('[data-macro]').forEach(el => el.addEventListener('click', () => {
    const m = el.dataset.macro;
    if (_aperte.has(m)) _aperte.delete(m); else _aperte.add(m);
    renderCategorie(root);
  }));

  // tap su categoria -> movimenti di quella categoria (anno corrente)
  root.querySelectorAll('[data-cat]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [macro, cat] = el.dataset.cat.split('|');
    navigate('movimenti', { macro, cat, periodo: 'anno', mese: new Date().toISOString().slice(0, 7) });
  }));

  root.querySelector('#nuova').addEventListener('click', () => _nuovaCategoria(root, macros));
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
