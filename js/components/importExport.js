// importExport.js — wizard di import Excel + pulsanti export.
//
// REFACTORING v1.3:
// 1) FIX BUG: in v1.2 la stringa toast('Errore durante l'import') aveva un apostrofo
//    non escapato dentro apici singoli, che rompeva la sintassi JavaScript del file
//    (errore di parsing, non solo un refuso innocuo). Corretto qui sotto.
// 2) Dopo l'import principale di movimenti/categorie, se l'Excel contiene anche i
//    fogli "Conti Iniziali", "Mutuo", "Finanziamenti" (Excel v2), questi vengono
//    proposti come import aggiuntivo opzionale — non più nel wizard di mapping
//    colonne (pensato per lo storico movimenti, struttura diversa) ma con import
//    diretto, dato che la struttura di questi fogli è nota e fissa.

import { leggiExcel, salvaMapping, getMapping, importaMovimenti, importaCategorie, exportFullExcel, exportIncrementale, autoDetectMapping, getSuggestedSheets, importaContiIniziali, importaMutuo, importaFinanziamenti } from '../services/excelService.js';
import { toast, escapeHtml } from '../utils.js';

const CAMPI = ['data', 'tipo', 'importo', 'macrocategoria', 'categoria', 'sottocategoria', 'conto', 'tag', 'descrizione', 'note'];

export const renderImportExport = async (root) => {
  root.innerHTML = `
    <div class="card">
      <h2>Import Excel</h2>
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px">Seleziona il tuo file <strong>Gestione Finanze Personali.xlsx</strong>: l'app riconosce automaticamente i fogli <strong>Movimenti</strong> e <strong>Anagrafica</strong>, oltre ai fogli <strong>Conti Iniziali</strong>, <strong>Mutuo</strong> e <strong>Finanziamenti</strong> se presenti.</p>
      <input type="file" id="file-in" accept=".xlsx,.xls" />
      <div id="wizard"></div>
    </div>
    <div class="card">
      <h2>Export</h2>
      <div class="btn-row"><button class="btn btn-primary" id="exp-full">Export completo</button><button class="btn btn-secondary" id="exp-incr">Solo nuovi</button></div>
    </div>
  `;

  root.querySelector('#exp-full').addEventListener('click', () => exportFullExcel());
  root.querySelector('#exp-incr').addEventListener('click', () => exportIncrementale());

  root.querySelector('#file-in').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const wizard = root.querySelector('#wizard');
    wizard.innerHTML = '<div class="empty">Lettura file in corso…</div>';
    try {
      const { fogli, sheetNames } = await leggiExcel(file);
      const auto = autoDetectMapping(sheetNames, fogli);
      if (auto) { renderAutoBanner(wizard, auto, fogli, sheetNames); return; }
      const mappingSalvato = await getMapping();
      buildWizard(wizard, fogli, sheetNames, mappingSalvato);
    } catch (err) {
      console.error(err);
      wizard.innerHTML = '<div class="empty">⚠️ Errore lettura file Excel</div>';
      toast('Errore lettura file');
    }
  });
};

// Dopo l'import principale (movimenti + categorie), propone l'import dei fogli v1.3
// se presenti nel file caricato. Non bloccante: se l'utente salta, può sempre tornare
// più tardi con un nuovo file che li contenga.
function renderImportV13Opzionale(container, fogli, sheetNames) {
  const suggeriti = getSuggestedSheets(sheetNames);
  const disponibili = [];
  if (suggeriti.contiIniziali && fogli[suggeriti.contiIniziali]?.length) disponibili.push({ key: 'contiIniziali', label: 'Conti Iniziali', sheet: suggeriti.contiIniziali });
  if (suggeriti.mutuo && fogli[suggeriti.mutuo]?.length) disponibili.push({ key: 'mutuo', label: 'Mutuo', sheet: suggeriti.mutuo });
  if (suggeriti.finanziamenti && fogli[suggeriti.finanziamenti]?.length) disponibili.push({ key: 'finanziamenti', label: 'Finanziamenti', sheet: suggeriti.finanziamenti });

  if (!disponibili.length) return;

  const box = document.createElement('div');
  box.className = 'banner-info';
  box.style.marginTop = '14px';
  box.innerHTML = `📊 Trovati anche dati patrimoniali (v1.3): ${disponibili.map(d => escapeHtml(d.label)).join(', ')}.<br>
    <button class="btn btn-secondary" id="import-v13" style="margin-top:10px;width:auto">Importa anche questi dati</button>`;
  container.appendChild(box);

  box.querySelector('#import-v13').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = 'Importazione…';
    try {
      let messaggi = [];
      for (const d of disponibili) {
        if (d.key === 'contiIniziali') { const n = await importaContiIniziali(fogli[d.sheet]); messaggi.push(`${n} conti iniziali`); }
        if (d.key === 'mutuo') { await importaMutuo(fogli[d.sheet]); messaggi.push('dati mutuo'); }
        if (d.key === 'finanziamenti') { const n = await importaFinanziamenti(fogli[d.sheet]); messaggi.push(`${n} finanziamenti`); }
      }
      toast(`✅ Importati: ${messaggi.join(', ')}`);
      box.remove();
    } catch (err) {
      console.error(err);
      toast('Errore durante l\'import dei dati patrimoniali');
      ev.target.disabled = false;
      ev.target.textContent = 'Riprova';
    }
  });
}

function renderAutoBanner(wizard, auto, fogli, sheetNames) {
  const sMov = auto.sheets.movimenti, sCat = auto.sheets.categorie;
  const nMov = (fogli[sMov] || []).length, nCat = (fogli[sCat] || []).length;

  wizard.innerHTML = `
    <div class="banner-success" style="margin-top:14px">
      ✨ File riconosciuto: <strong>Gestione Finanze Personali.xlsx</strong><br>
      <small>Foglio movimenti: "${escapeHtml(sMov)}" (${nMov} righe)<br>Foglio anagrafica: "${escapeHtml(sCat)}" (${nCat} righe)</small>
    </div>
    <button class="btn btn-primary" id="auto-import">🚀 Importa con mapping pre-configurato</button>
    <p style="text-align:center;margin-top:10px"><a href="#" id="manual-cfg" style="font-size:13px;color:var(--primary)">…oppure configura manualmente</a></p>
  `;

  wizard.querySelector('#auto-import').addEventListener('click', async () => {
    const btn = wizard.querySelector('#auto-import');
    btn.disabled = true;
    btn.textContent = '⏳ Importazione in corso…';
    try {
      const nC = await importaCategorie(fogli[sCat], auto.mapping.categorie);
      const nM = await importaMovimenti(fogli[sMov], auto.mapping.movimenti);
      await salvaMapping(auto.mapping);
      toast(`✅ Import completato: ${nM} movimenti, ${nC} categorie`);
      renderImportV13Opzionale(wizard, fogli, sheetNames);
      setTimeout(() => { location.hash = '#/storico'; }, 1500);
    } catch (err) {
      console.error(err);
      toast('Errore durante l\'import'); // FIX: apostrofo correttamente escapato
      btn.disabled = false;
      btn.textContent = '🚀 Riprova import';
    }
  });

  wizard.querySelector('#manual-cfg').addEventListener('click', async (e) => {
    e.preventDefault();
    buildWizard(wizard, fogli, Object.keys(fogli), await getMapping());
  });
}

function buildWizard(wizard, fogli, sheetNames, mappingSalvato) {
  const suggested = getSuggestedSheets(sheetNames);
  const guessMov = suggested.movimenti || sheetNames[0];
  const guessCat = suggested.categorie || '';

  wizard.innerHTML = `
    <hr style="margin:16px 0;border:0;border-top:1px solid var(--border)">
    <div class="form-group"><label>Foglio movimenti</label><select id="sheet-mov">${sheetNames.map(n => `<option ${n === guessMov ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Foglio categorie (opzionale)</label><select id="sheet-cat"><option value="">– nessuno –</option>${sheetNames.map(n => `<option ${n === guessCat ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></div>
    <button class="btn btn-primary" id="next-1">Avanti →</button>
    <div id="step2"></div>
  `;

  wizard.querySelector('#next-1').addEventListener('click', () => {
    const sheetMov = wizard.querySelector('#sheet-mov').value;
    const sheetCat = wizard.querySelector('#sheet-cat').value;
    const rowsMov = fogli[sheetMov] || [];
    const rowsCat = sheetCat ? (fogli[sheetCat] || []) : [];
    if (!rowsMov.length) { toast('Il foglio movimenti è vuoto'); return; }

    const cols = Object.keys(rowsMov[0]);
    const map = (mappingSalvato && mappingSalvato.movimenti) || {};
    const mapCat = (mappingSalvato && mappingSalvato.categorie) || {};
    const step2 = wizard.querySelector('#step2');

    step2.innerHTML = `
      <hr style="margin:16px 0;border:0;border-top:1px solid var(--border)">
      <h3 style="margin:0 0 10px">Mappatura colonne movimenti</h3>
      ${CAMPI.map(c => `<div class="form-group"><label>${c}</label><select data-campo="${c}"><option value="">– non mappato –</option>${cols.map(x => `<option value="${escapeHtml(x)}" ${map[c] === x ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('')}</select></div>`).join('')}
      ${rowsCat.length ? `<h3 style="margin:16px 0 10px">Mappatura colonne categorie</h3>${['macrocategoria', 'categoria', 'sottocategoria'].map(c => `<div class="form-group"><label>${c}</label><select data-cat="${c}"><option value="">– non mappato –</option>${Object.keys(rowsCat[0]).map(x => `<option value="${escapeHtml(x)}" ${mapCat[c] === x ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('')}</select></div>`).join('')}` : ''}
      <button class="btn btn-primary" id="conferma-import">Importa</button>
    `;

    step2.querySelector('#conferma-import').addEventListener('click', async () => {
      const mapping = { movimenti: {}, categorie: {} };
      step2.querySelectorAll('[data-campo]').forEach(s => { mapping.movimenti[s.dataset.campo] = s.value; });
      step2.querySelectorAll('[data-cat]').forEach(s => { mapping.categorie[s.dataset.cat] = s.value; });

      if (!mapping.movimenti.data || !mapping.movimenti.importo) { toast('Devi mappare almeno Data e Importo'); return; }

      await salvaMapping(mapping);
      let nC = 0;
      if (rowsCat.length && (mapping.categorie.macrocategoria || mapping.categorie.categoria)) nC = await importaCategorie(rowsCat, mapping.categorie);
      const nM = await importaMovimenti(rowsMov, mapping.movimenti);
      toast(`Import: ${nM} movimenti, ${nC} categorie`);
      renderImportV13Opzionale(wizard, fogli, Object.keys(fogli));
      setTimeout(() => { location.hash = '#/storico'; }, 1200);
    });
  });
}
