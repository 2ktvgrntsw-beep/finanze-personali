// impostazioni.js — gestione conti, tag, categorie, backup, reset.
//
// REFACTORING v1.3:
// 1) Il form "Aggiungi conto" ora chiede anche la tipologia (Liquidità/Risparmio/
//    Investimenti/Asset/Debiti), necessaria per la sezione Patrimonio.
// 2) Le categorie si "archiviano" invece di eliminarsi di default (vedi
//    categorieService.js per il perché); l'eliminazione vera resta disponibile
//    ma è un'azione secondaria, meno in evidenza.
// 3) Aggiunti collegamenti rapidi a Mutuo e Finanziamenti (nuove sezioni v1.3).

import { state, refreshAll } from '../state.js';
import { dbAdd, dbClear, STORE_NAMES } from '../db.js';
import { saveConto, deleteConto, TIPOLOGIE_CONTO } from '../services/contiService.js';
import { saveTag, deleteTag } from '../services/tagService.js';
import { saveCategoria, archiviaCategoria, riattivaCategoria, deleteCategoria } from '../services/categorieService.js';
import { ultimoBackup, registraBackup } from '../services/backupService.js';
import { exportFullExcel } from '../services/excelService.js';
import { fmtDate, escapeHtml, toast } from '../utils.js';
import { navigate } from '../router.js';

const LABEL_TIPOLOGIA = { liquidita: 'Liquidità', risparmio: 'Risparmio', investimenti: 'Investimenti', asset: 'Asset', debiti: 'Debiti' };

export const renderImpostazioni = async (root) => {
  const last = await ultimoBackup();

  root.innerHTML = `
    <div class="card">
      <h2>Patrimonio</h2>
      <div class="btn-row">
        <button class="btn btn-secondary" id="go-mutuo">Mutuo</button>
        <button class="btn btn-secondary" id="go-finanziamenti">Finanziamenti</button>
        <button class="btn btn-secondary" id="go-investimenti">Investimenti</button>
        <button class="btn btn-secondary" id="go-riconciliazione">Riconciliazione</button>
      </div>
    </div>

    <div class="card">
      <h2>Analisi</h2>
      <div class="btn-row">
        <button class="btn btn-secondary" id="go-statistiche">Statistiche</button>
        <button class="btn btn-secondary" id="go-tag">Analisi Tag</button>
        <button class="btn btn-secondary" id="go-budget">Budget</button>
        <button class="btn btn-secondary" id="go-ricorrenti">Ricorrenti</button>
      </div>
    </div>

    <div class="card">
      <h2>Conti</h2>
      <div id="lista-conti"></div>
      <form id="f-conto" style="margin-top:10px">
        <div class="form-group"><input name="nome" placeholder="Nome conto" required /></div>
        <div class="form-group">
          <select name="tipologia">${TIPOLOGIE_CONTO.map(t => `<option value="${t}">${LABEL_TIPOLOGIA[t]}</option>`).join('')}</select>
        </div>
        <div class="form-group"><input name="saldo_iniziale" type="number" step="0.01" placeholder="Saldo iniziale" /></div>
        <button class="btn btn-primary" type="submit">+ Aggiungi conto</button>
      </form>
    </div>

    <div class="card">
      <h2>Tag</h2>
      <div id="lista-tag"></div>
      <form id="f-tag" style="margin-top:10px">
        <div class="form-group"><input name="nome" placeholder="Nome tag" required /></div>
        <button class="btn btn-primary" type="submit">+ Aggiungi tag</button>
      </form>
    </div>

    <div class="card">
      <h2>Categorie</h2>
      <div id="lista-cat" style="max-height:300px;overflow:auto"></div>
      <form id="f-cat" style="margin-top:10px">
        <div class="form-group"><input name="macrocategoria" placeholder="Macrocategoria" required /></div>
        <div class="form-group"><input name="categoria" placeholder="Categoria" required /></div>
        <div class="form-group"><input name="sottocategoria" placeholder="Sottocategoria (opz.)" /></div>
        <button class="btn btn-primary" type="submit">+ Aggiungi categoria</button>
      </form>
    </div>

    <div class="card">
      <h2>Backup</h2>
      <p>Ultimo backup: <strong>${last ? fmtDate(last.data_backup) : '—'}</strong></p>
      <div class="form-group">
        <label>Frequenza backup automatico</label>
        <select id="freq-backup">${['disattivato', '7', '15', '30', '90'].map(f => `<option value="${f}" ${state.impostazioni['backup_frequenza'] === f ? 'selected' : ''}>${f === 'disattivato' ? 'Disattivato' : f + ' giorni'}</option>`).join('')}</select>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="bk-now">Esegui backup ora</button>
        <button class="btn btn-secondary" id="ie">Import/Export</button>
      </div>
      <p class="meta" style="font-size:12px;color:var(--muted);margin-top:8px">Nome backup: <strong>backup_GG-MM-AAAA.xlsx</strong> (senza orario).<br>Nota: se fai due backup nello stesso giorno, il nuovo può sovrascrivere il precedente.</p>
    </div>

    <div class="card"><h2>⚠️ Reset</h2><button class="btn btn-danger" id="reset">Cancella tutti i dati</button></div>
  `;

  const refresh = () => {
    root.querySelector('#lista-conti').innerHTML = state.conti.map(c => `
      <div class="mov-item">
        <div class="mov-left"><div class="desc">${escapeHtml(c.nome)}</div><div class="meta">${LABEL_TIPOLOGIA[c.tipologia] || 'Liquidità'} · Saldo iniziale: ${c.saldo_iniziale}</div></div>
        <button class="btn btn-danger" style="padding:4px 10px" data-conto="${c.id}">×</button>
      </div>`).join('') || '<div class="empty">Nessun conto</div>';

    root.querySelector('#lista-tag').innerHTML = state.tag.map(t => `
      <div class="mov-item"><div class="mov-left"><div class="desc">${escapeHtml(t.nome)}</div></div><button class="btn btn-danger" style="padding:4px 10px" data-tag="${t.id}">×</button></div>`).join('') || '<div class="empty">Nessun tag</div>';

    root.querySelector('#lista-cat').innerHTML = state.categorie.map(c => `
      <div class="mov-item">
        <div class="mov-left"><div class="desc" style="${c.attiva === false ? 'opacity:.5;text-decoration:line-through' : ''}">${escapeHtml(c.macrocategoria)} › ${escapeHtml(c.categoria)} ${c.sottocategoria ? '› ' + escapeHtml(c.sottocategoria) : ''}</div></div>
        <div class="btn-row" style="width:auto;gap:4px">
          ${c.attiva === false
            ? `<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" data-riattiva="${c.id}">Riattiva</button>`
            : `<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" data-archivia="${c.id}">Archivia</button>`}
          <button class="btn btn-danger" style="padding:4px 10px" data-cat="${c.id}">×</button>
        </div>
      </div>`).join('') || '<div class="empty">Nessuna categoria</div>';

    root.querySelectorAll('[data-conto]').forEach(b => b.addEventListener('click', async () => { await deleteConto(b.dataset.conto); refresh(); }));
    root.querySelectorAll('[data-tag]').forEach(b => b.addEventListener('click', async () => { await deleteTag(b.dataset.tag); refresh(); }));
    root.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Eliminare definitivamente questa categoria? Se ha movimenti storici, valuta "Archivia" invece.')) { await deleteCategoria(b.dataset.cat); refresh(); }
    }));
    root.querySelectorAll('[data-archivia]').forEach(b => b.addEventListener('click', async () => { await archiviaCategoria(b.dataset.archivia); refresh(); }));
    root.querySelectorAll('[data-riattiva]').forEach(b => b.addEventListener('click', async () => { await riattivaCategoria(b.dataset.riattiva); refresh(); }));
  };

  root.querySelector('#f-conto').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveConto(Object.fromEntries(new FormData(e.target).entries()));
    e.target.reset();
    refresh();
  });
  root.querySelector('#f-tag').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTag(Object.fromEntries(new FormData(e.target).entries()));
    e.target.reset();
    refresh();
  });
  root.querySelector('#f-cat').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCategoria(Object.fromEntries(new FormData(e.target).entries()));
    e.target.reset();
    refresh();
  });

  root.querySelector('#freq-backup').addEventListener('change', async (e) => {
    await dbAdd('impostazioni', { chiave: 'backup_frequenza', valore: e.target.value });
    await refreshAll();
    toast('Salvato');
  });
  root.querySelector('#bk-now').addEventListener('click', async () => { await exportFullExcel(); await registraBackup('manuale'); toast('Backup completato'); });
  root.querySelector('#ie').addEventListener('click', () => navigate('importexport'));
  root.querySelector('#go-mutuo').addEventListener('click', () => navigate('mutuo'));
  root.querySelector('#go-finanziamenti').addEventListener('click', () => navigate('finanziamenti'));
  root.querySelector('#go-investimenti').addEventListener('click', () => navigate('investimenti'));
  root.querySelector('#go-riconciliazione').addEventListener('click', () => navigate('riconciliazione'));
  root.querySelector('#go-statistiche').addEventListener('click', () => navigate('statistiche'));
  root.querySelector('#go-tag').addEventListener('click', () => navigate('tag'));
  root.querySelector('#go-budget').addEventListener('click', () => navigate('budget'));
  root.querySelector('#go-ricorrenti').addEventListener('click', () => navigate('ricorrenti'));

  root.querySelector('#reset').addEventListener('click', async () => {
    if (!confirm('Cancellare TUTTI i dati?')) return;
    for (const s of STORE_NAMES) await dbClear(s);
    await refreshAll();
    toast('Database resettato');
    navigate('dashboard');
  });

  refresh();
};
