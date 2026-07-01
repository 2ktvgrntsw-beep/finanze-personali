// impostazioni.js — Impostazioni: backup/recovery Excel, bulk tag, gestione dati.

import { state, refreshAll } from '../core/store.js';
import { escapeHtml, fmtEUR, fmtDataEstesa } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { esportaBackup, importaBackup } from '../services/excelService.js';
import { applicaTagBulk, cercaMovimenti } from '../services/movimentiService.js';
import { STORE_NAMES } from '../core/db.js';
import { dbClear } from '../core/db.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

export const renderImpostazioni = async (root) => {
  document.getElementById('view-title').textContent = 'Impostazioni';

  const nMov = state.movimenti.length;
  const nConti = state.conti.length;
  const nTag = state.tag.length;

  root.innerHTML = `
    <div class="section-lbl"><span>Backup e ripristino</span></div>
    <div class="card">
      <p class="meta" style="margin-bottom:14px">I tuoi dati sono salvati solo su questo dispositivo. Esporta un backup Excel per sicurezza o per trasferirli.</p>
      <button class="btn btn-primary" id="export" style="margin-bottom:10px">⬇️ Esporta backup Excel</button>
      <button class="btn btn-secondary" id="import-btn">⬆️ Importa da backup (recovery)</button>
      <input type="file" id="import-file" accept=".xlsx,.xls" style="display:none">
    </div>

    <div class="section-lbl"><span>Tag</span></div>
    <div class="card">
      <p class="meta" style="margin-bottom:14px">Applica un tag in blocco a più movimenti passati (es. tutte le spese di un viaggio).</p>
      <button class="btn btn-secondary" id="bulk-tag">🏷️ Applica tag in blocco</button>
    </div>

    <div class="section-lbl"><span>Gestione</span></div>
    <div class="card" style="padding:0">
      <div class="patrow" id="go-conti" style="cursor:pointer"><div class="icon" style="background:var(--surface-2)">💳</div><div class="body"><div class="row1"><span class="name">Conti</span><span class="meta num">${nConti}</span></div></div><div class="chev">›</div></div>
      <div class="divider"></div>
      <div class="patrow" id="go-cat" style="cursor:pointer"><div class="icon" style="background:var(--surface-2)">🗂️</div><div class="body"><div class="row1"><span class="name">Categorie</span><span class="meta num">${state.categorie.length}</span></div></div><div class="chev">›</div></div>
    </div>

    <div class="section-lbl"><span>Informazioni</span></div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;padding:5px 0"><span class="meta">Movimenti</span><span class="num">${nMov}</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0"><span class="meta">Tag</span><span class="num">${nTag}</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0"><span class="meta">Versione</span><span>2.0</span></div>
    </div>

    <div style="margin-top:20px"><button class="btn btn-danger" id="reset">Azzera tutti i dati</button></div>
    <p class="meta" style="text-align:center;margin-top:16px;opacity:.6">Finanze Personali · offline · nessun dato lascia il dispositivo</p>
  `;

  // export
  root.querySelector('#export').addEventListener('click', () => { try { esportaBackup(); toast('Backup esportato'); } catch (e) { toast('Errore export'); console.error(e); } });

  // import
  const fileInp = root.querySelector('#import-file');
  root.querySelector('#import-btn').addEventListener('click', () => fileInp.click());
  fileInp.addEventListener('change', async () => {
    if (!fileInp.files.length) return;
    if (!confirm('Il ripristino SOSTITUISCE i dati attuali con quelli del backup. Continuare?')) { fileInp.value = ''; return; }
    try {
      const r = await importaBackup(fileInp.files[0]);
      toast(`Ripristinati ${r.movimenti} movimenti`);
      navigate('spese');
    } catch (e) { toast('Errore import'); console.error(e); }
    fileInp.value = '';
  });

  // bulk tag
  root.querySelector('#bulk-tag').addEventListener('click', () => _bulkTag(root));

  // navigazione
  root.querySelector('#go-conti').addEventListener('click', () => navigate('conti'));
  root.querySelector('#go-cat').addEventListener('click', () => navigate('categorie'));

  // reset
  root.querySelector('#reset').addEventListener('click', async () => {
    if (!confirm('Sicuro? Verranno eliminati TUTTI i dati in modo irreversibile.')) return;
    if (!confirm('Ultima conferma: azzerare tutto?')) return;
    for (const s of STORE_NAMES) await dbClear(s);
    await refreshAll();
    toast('Dati azzerati');
    location.reload();
  });
};

// Bulk tag: cerca -> seleziona risultati -> applica tag
const _bulkTag = (root) => {
  apriSheet('Applica tag in blocco', `
    <label class="meta">1. Cerca i movimenti (descrizione, categoria...)</label>
    <div class="searchbar" style="margin:8px 0 12px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="bt-q" placeholder="Es. Palermo, hotel..." autocomplete="off"></div>
    <div id="bt-ris" style="max-height:300px;overflow-y:auto"></div>
    <label class="meta" style="margin-top:12px;display:block">2. Tag da applicare</label>
    <input id="bt-tag" placeholder="Es. SiciliaLuglio2025" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
    <button class="btn btn-primary" id="bt-ok">Applica a tutti i selezionati</button>
  `, (body, chiudi) => {
    const q = body.querySelector('#bt-q');
    const ris = body.querySelector('#bt-ris');
    let selezionati = new Set();

    const cerca = () => {
      const { risultati } = cercaMovimenti(q.value);
      if (!q.value.trim()) { ris.innerHTML = '<div class="meta" style="padding:8px">Scrivi per cercare</div>'; return; }
      ris.innerHTML = risultati.slice(0, 100).map(m => `
        <div class="mov" data-id="${m.id}" style="cursor:pointer">
          <div class="ic" style="font-size:14px">${selezionati.has(m.id) ? '✅' : '⬜'}</div>
          <div class="body"><div class="d1">${escapeHtml(m.desc || m.cat)}</div><div class="d2">${fmtDataEstesa(m.data)} · ${fmtEUR(m.imp)}</div></div>
        </div>`).join('');
      ris.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (selezionati.has(id)) selezionati.delete(id); else selezionati.add(id);
        cerca();
      }));
    };
    q.addEventListener('input', cerca);
    cerca();

    body.querySelector('#bt-ok').addEventListener('click', async () => {
      const tag = body.querySelector('#bt-tag').value.trim();
      if (!tag) { toast('Inserisci un tag'); return; }
      if (!selezionati.size) { toast('Seleziona almeno un movimento'); return; }
      const n = await applicaTagBulk(Array.from(selezionati), tag);
      chiudi(); toast(`Tag applicato a ${n} movimenti`);
    });
  });
};
