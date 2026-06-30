// storico.js — elenco movimenti con filtri, ricerca e Bulk Tag Tool (v1.3).
//
// REFACTORING v1.3:
// 1) Bulk Tag Tool (nuovo): un pulsante attiva una modalità di selezione multipla
//    (checkbox su ogni riga); l'utente seleziona N movimenti e applica un tag a
//    tutti insieme con applicaTagBulk() di movimentiService.js — utile per taggare
//    retroattivamente, es. tutte le spese di una vacanza già registrate.
// 2) Filtro multi-tag (nuovo): oltre al singolo tag della v1.2, si può selezionare
//    più di un tag con modalità AND (tutti presenti) o OR (almeno uno presente),
//    come da documento di progetto (es. Vacanza 2024 + Cena).
// 3) La logica di filtro/ordinamento è separata in calcolaListaOrdinata(), pura,
//    dal codice che costruisce l'HTML.

import { state } from '../state.js';
import { filtraMovimenti, applicaTagBulk } from '../services/movimentiService.js';
import { fmtEUR, fmtDate, escapeHtml, debounce } from '../utils.js';
import { getMacrocategorie } from '../services/categorieService.js';
import { toast } from '../utils.js';

function calcolaListaOrdinata(filtri, ordinamento) {
  let arr = filtraMovimenti(filtri);
  const [campo, dir] = ordinamento.split('-');
  arr.sort((a, b) => {
    const va = campo === 'data' ? a.data : a.importo;
    const vb = campo === 'data' ? b.data : b.importo;
    return dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });
  return arr;
}

function rigaMovimento(m, modalitaSelezione, selezionati) {
  const checkbox = modalitaSelezione
    ? `<input type="checkbox" class="chk-mov" data-id="${m.id}" ${selezionati.has(m.id) ? 'checked' : ''} style="margin-right:10px;width:20px;height:20px" />`
    : '';
  const contenuto = `
    <div class="mov-left">
      <div class="desc">${escapeHtml(m.descrizione || '(no descrizione)')}</div>
      <div class="meta">${fmtDate(m.data)} · ${escapeHtml(m.categoria || (m.tipo === 'trasferimento' ? 'Trasferimento' : ''))} ${m.conto ? '· ' + escapeHtml(m.conto) : ''}${m.tipo === 'trasferimento' && m.conto_destinazione ? ' → ' + escapeHtml(m.conto_destinazione) : ''}</div>
    </div>
    <div class="mov-right ${m.tipo}">${m.tipo === 'spesa' ? '-' : (m.tipo === 'trasferimento' ? '⇄' : '+')}${fmtEUR(m.importo)}</div>
  `;
  return modalitaSelezione
    ? `<div class="mov-item" style="display:flex;align-items:center">${checkbox}<div style="flex:1;display:flex;justify-content:space-between">${contenuto}</div></div>`
    : `<a href="#/nuovo?id=${m.id}" style="text-decoration:none;color:inherit"><div class="mov-item">${contenuto}</div></a>`;
}

export const renderStorico = async (root) => {
  let filtri = {};
  let ordinamento = 'data-desc';
  let modalitaSelezione = false;
  const selezionati = new Set();

  const anni = [...new Set(state.movimenti.map(m => new Date(m.data).getFullYear()).filter(y => !isNaN(y)))].sort((a, b) => b - a);

  root.innerHTML = `
    <div class="card">
      <div class="filters">
        <input type="text" id="f-testo" placeholder="🔎 Cerca..." />
        <select id="f-anno"><option value="">Tutti gli anni</option>${anni.map(a => `<option>${a}</option>`).join('')}</select>
        <select id="f-mese"><option value="">Tutti i mesi</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select>
        <select id="f-tipo"><option value="">Tutti</option><option value="entrata">Entrate</option><option value="spesa">Spese</option><option value="trasferimento">Trasferimenti</option></select>
        <select id="f-macro"><option value="">Tutte macrocat.</option>${getMacrocategorie().map(m => `<option>${escapeHtml(m)}</option>`).join('')}</select>
        <select id="f-conto"><option value="">Tutti i conti</option>${state.conti.map(c => `<option>${escapeHtml(c.nome)}</option>`).join('')}</select>
        <select id="f-ord"><option value="data-desc">Data ↓</option><option value="data-asc">Data ↑</option><option value="importo-desc">Importo ↓</option><option value="importo-asc">Importo ↑</option></select>
      </div>
      <div class="form-group" style="margin-top:10px">
        <label>Tag (selezione multipla)</label>
        <select id="f-tags" multiple size="3" style="height:auto">${state.tag.map(t => `<option value="${escapeHtml(t.nome)}">${escapeHtml(t.nome)}</option>`).join('')}</select>
        <div class="btn-row" style="margin-top:6px">
          <button type="button" class="btn btn-secondary" id="tag-and" style="font-size:12px;padding:6px 10px">Modalità: TUTTI i tag (AND)</button>
          <button type="button" class="btn btn-secondary" id="tag-or" style="font-size:12px;padding:6px 10px">Modalità: ALMENO UNO (OR)</button>
        </div>
      </div>
    </div>

    <div class="card" style="display:flex;justify-content:space-between;align-items:center">
      <button class="btn btn-secondary" id="toggle-bulk" style="width:auto">🏷️ Bulk Tag Tool</button>
      <span class="meta" id="conteggio-risultati"></span>
    </div>
    <div class="card" id="bulk-bar" style="display:none">
      <div class="form-group"><label>Applica tag a <span id="n-selezionati">0</span> movimenti selezionati</label>
        <select id="bulk-tag-select"><option value="">– scegli tag –</option>${state.tag.map(t => `<option>${escapeHtml(t.nome)}</option>`).join('')}</select>
      </div>
      <button class="btn btn-primary" id="bulk-applica">Applica tag ai selezionati</button>
    </div>

    <div class="card" id="lista"></div>
  `;

  const lista = root.querySelector('#lista');
  const tagModeBtns = { and: root.querySelector('#tag-and'), or: root.querySelector('#tag-or') };
  let tagMode = 'AND';

  const aggiornaTagModeUI = () => {
    tagModeBtns.and.style.opacity = tagMode === 'AND' ? '1' : '0.5';
    tagModeBtns.or.style.opacity = tagMode === 'OR' ? '1' : '0.5';
  };
  aggiornaTagModeUI();

  const aggiorna = () => {
    const arr = calcolaListaOrdinata(filtri, ordinamento);
    root.querySelector('#conteggio-risultati').textContent = `${arr.length} movimenti`;

    if (!arr.length) { lista.innerHTML = '<div class="empty">Nessun movimento</div>'; return; }

    const visibili = arr.slice(0, 500);
    lista.innerHTML = visibili.map(m => rigaMovimento(m, modalitaSelezione, selezionati)).join('')
      + (arr.length > 500 ? `<div class="empty">Mostrati 500 di ${arr.length}. Affina i filtri.</div>` : '');

    if (modalitaSelezione) {
      lista.querySelectorAll('.chk-mov').forEach(chk => chk.addEventListener('change', () => {
        if (chk.checked) selezionati.add(chk.dataset.id); else selezionati.delete(chk.dataset.id);
        root.querySelector('#n-selezionati').textContent = selezionati.size;
      }));
    }
  };

  const update = debounce(() => {
    const tagsSelezionati = Array.from(root.querySelector('#f-tags').selectedOptions).map(o => o.value);
    filtri = {
      testo: root.querySelector('#f-testo').value,
      anno: root.querySelector('#f-anno').value || null,
      mese: root.querySelector('#f-mese').value || null,
      tipo: root.querySelector('#f-tipo').value || null,
      macrocategoria: root.querySelector('#f-macro').value || null,
      conto: root.querySelector('#f-conto').value || null,
      tags: tagsSelezionati.length ? tagsSelezionati : null,
      tagMode,
    };
    ordinamento = root.querySelector('#f-ord').value;
    aggiorna();
  }, 150);

  root.querySelectorAll('.filters input, .filters select, #f-tags').forEach(el => el.addEventListener('input', update));
  tagModeBtns.and.addEventListener('click', () => { tagMode = 'AND'; aggiornaTagModeUI(); update(); });
  tagModeBtns.or.addEventListener('click', () => { tagMode = 'OR'; aggiornaTagModeUI(); update(); });

  root.querySelector('#toggle-bulk').addEventListener('click', () => {
    modalitaSelezione = !modalitaSelezione;
    selezionati.clear();
    root.querySelector('#bulk-bar').style.display = modalitaSelezione ? 'block' : 'none';
    root.querySelector('#n-selezionati').textContent = '0';
    aggiorna();
  });

  root.querySelector('#bulk-applica').addEventListener('click', async () => {
    const tag = root.querySelector('#bulk-tag-select').value;
    if (!tag) { toast('Seleziona un tag'); return; }
    if (!selezionati.size) { toast('Nessun movimento selezionato'); return; }
    const btn = root.querySelector('#bulk-applica');
    btn.disabled = true; btn.textContent = 'Applico tag…';
    await applicaTagBulk(Array.from(selezionati), tag);
    toast(`Tag "${tag}" applicato a ${selezionati.size} movimenti`);
    modalitaSelezione = false;
    selezionati.clear();
    root.querySelector('#bulk-bar').style.display = 'none';
    aggiorna();
  });

  aggiorna();
};
