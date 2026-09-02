// stipendiForm.js — Aggiungi/modifica busta paga: import PDF (Zucchetti) o inserimento
// manuale. Il PDF precompila i campi che riesce a leggere con certezza; tutto il resto
// resta vuoto e lo completi tu. Prima di salvare vedi sempre i numeri: nessun campo
// viene riempito con valori "stimati".

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, toast } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { safeWrite } from '../core/db.js';
import { conferma } from './shared.js';
import { estraiBustaDaPDF } from '../services/pdfBustaPaga.js';
import { salvaStipendio, eliminaStipendio, DATORI, MESI_ESTESI } from '../services/stipendiService.js';

let d = null;

const bozza = () => {
  const oggi = new Date();
  return {
    id: null, anno: oggi.getFullYear(), mese: oggi.getMonth() + 1,
    datore: DATORI[DATORI.length - 1]?.nome || '',
    netto: '', trattenute: '', tfr_a_fondo_pensione: '', cometa_dipendente: '', cometa_azienda: '',
    contributi_inps: '', irpef_netta: '', addizionale_regionale: '', addizionale_comunale: '',
    addebiti_netti: '', partite_di_giro: 0, tredicesima_inclusa: false, cessazione: false,
  };
};

export const renderStipendioForm = async (root, params = {}) => {
  const esistente = params.id ? state.stipendi.find(s => s.id === params.id) : null;
  d = esistente ? { ...bozza(), ...esistente } : bozza();
  document.getElementById('view-title').textContent = esistente ? 'Modifica busta' : 'Nuova busta paga';
  _render(root);
};

const _n = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')) || 0);
const _lordo = () => Math.round((_n(d.netto) + _n(d.trattenute)) * 100) / 100;

const _campo = (chiave, etichetta, nota = '') => `
  <div class="frow">
    <div class="fval" style="flex:1">
      <label class="meta" style="display:block">${etichetta}${nota ? ` <span style="color:var(--txt-3)">${nota}</span>` : ''}</label>
      <input class="ffld" data-k="${chiave}" inputmode="decimal" placeholder="—"
             value="${d[chiave] === '' || d[chiave] == null ? '' : d[chiave]}" autocomplete="off">
    </div>
  </div>`;

const _render = (root) => {
  const anni = [];
  for (let a = new Date().getFullYear() + 1; a >= 2016; a--) anni.push(a);
  root.innerHTML = `
    <div class="card" style="margin-top:4px">
      <div class="section-lbl" style="margin:0 0 8px"><span>Da PDF</span></div>
      <button class="btn btn-secondary" id="pick-pdf">Carica il PDF della busta</button>
      <input type="file" id="pdf-file" accept="application/pdf" hidden>
      <div class="eprice-note" style="margin-top:8px" id="pdf-esito">
        Formato Zucchetti (Schneider, Bonfiglioli). Leggo netto, trattenute, contributi,
        IRPEF, addizionali, TFR e Cometa. Le buste vecchie scansionate non sono leggibili:
        in quel caso compila a mano.
      </div>
    </div>

    <div class="section-lbl"><span>Periodo</span></div>
    <div class="card">
      <div class="frow">
        <div class="fval" style="flex:1">
          <label class="meta" style="display:block">Mese</label>
          <select id="f-mese" class="sheet-input">
            ${MESI_ESTESI.map((m, i) => `<option value="${i + 1}" ${d.mese === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="fval" style="flex:1">
          <label class="meta" style="display:block">Anno</label>
          <select id="f-anno" class="sheet-input">
            ${anni.map(a => `<option value="${a}" ${+d.anno === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="frow">
        <div class="fval" style="flex:1">
          <label class="meta" style="display:block">Datore</label>
          <select id="f-datore" class="sheet-input">
            ${DATORI.map(x => `<option value="${escapeHtml(x.nome)}" ${d.datore === x.nome ? 'selected' : ''}>${escapeHtml(x.nome)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="section-lbl"><span>Importi principali</span></div>
    <div class="card">
      ${_campo('netto', 'Netto in busta', '(quello che hai incassato)')}
      ${_campo('trattenute', 'Totale trattenute', '(senza partite di giro)')}
      ${_campo('addebiti_netti', 'di cui addebiti in busta', '(auto, mensa, ticket: spese tue, non tasse)')}
      <div class="eprice-note">Lordo calcolato: <b class="num">${fmtEUR(_lordo())}</b> — netto + trattenute, come sulla busta.</div>
    </div>

    <div class="section-lbl"><span>Previdenza</span></div>
    <div class="card">
      ${_campo('tfr_a_fondo_pensione', 'TFR versato al fondo')}
      ${_campo('cometa_dipendente', 'Cometa — quota tua')}
      ${_campo('cometa_azienda', 'Cometa — quota datore')}
    </div>

    <div class="section-lbl"><span>Fisco e contributi <span style="color:var(--txt-3)">(facoltativi)</span></span></div>
    <div class="card">
      ${_campo('contributi_inps', 'Contributi INPS')}
      ${_campo('irpef_netta', 'IRPEF')}
      ${_campo('addizionale_regionale', 'Addizionale regionale')}
      ${_campo('addizionale_comunale', 'Addizionale comunale')}
    </div>

    <div class="card">
      <div class="frow"><label class="meta" style="flex:1">Include la tredicesima</label>
        <input type="checkbox" id="f-13" ${d.tredicesima_inclusa ? 'checked' : ''}></div>
      <div class="frow"><label class="meta" style="flex:1">Busta di fine rapporto</label>
        <input type="checkbox" id="f-cess" ${d.cessazione ? 'checked' : ''}></div>
    </div>

    <div class="btn-row" style="margin-top:16px">
      ${d.id ? '<button class="btn btn-danger" id="f-del">Elimina</button>' : ''}
      <button class="btn btn-primary" id="f-salva">${d.id ? 'Salva modifiche' : 'Salva busta'}</button>
    </div>
  `;

  root.querySelectorAll('[data-k]').forEach(el =>
    el.addEventListener('input', () => { d[el.dataset.k] = el.value; _aggiornaLordo(root); }));
  root.querySelector('#f-mese').addEventListener('change', e => { d.mese = +e.target.value; });
  root.querySelector('#f-anno').addEventListener('change', e => { d.anno = +e.target.value; });
  root.querySelector('#f-datore').addEventListener('change', e => { d.datore = e.target.value; });
  root.querySelector('#f-13').addEventListener('change', e => { d.tredicesima_inclusa = e.target.checked; });
  root.querySelector('#f-cess').addEventListener('change', e => { d.cessazione = e.target.checked; });

  const file = root.querySelector('#pdf-file');
  root.querySelector('#pick-pdf').addEventListener('click', () => file.click());
  file.addEventListener('change', () => { if (file.files[0]) _importa(root, file.files[0]); });

  root.querySelector('#f-salva').addEventListener('click', () => _salva(root));
  const del = root.querySelector('#f-del');
  if (del) del.addEventListener('click', async () => {
    if (!(await conferma('Eliminare questa busta?', { danger: true, ok: 'Elimina' }))) return;
    const ok = await safeWrite(() => eliminaStipendio(d.id), 'Busta non eliminata');
    if (!ok) return;
    toast('Busta eliminata'); navigate('stipendi');
  });
};

const _aggiornaLordo = (root) => {
  const nota = root.querySelector('.eprice-note b');
  if (nota) nota.textContent = fmtEUR(_lordo());
};

const _importa = async (root, file) => {
  const esito = root.querySelector('#pdf-esito');
  esito.textContent = 'Leggo il PDF…';
  try {
    const { dati } = await estraiBustaDaPDF(file);
    const letti = [];
    for (const [k, v] of Object.entries(dati)) {
      if (v == null) continue;
      if (k === 'anno' || k === 'mese') { d[k] = v; letti.push(k === 'anno' ? 'anno' : 'mese'); continue; }
      if (k === 'datore') { if (DATORI.some(x => x.nome === v)) { d.datore = v; letti.push('datore'); } continue; }
      if (k === 'lordo') continue;                        // il lordo si ricava da netto+trattenute
      if (typeof v === 'boolean') { d[k] = v; continue; }
      d[k] = v; letti.push(k.replace(/_/g, ' '));
    }
    _render(root);
    const e2 = root.querySelector('#pdf-esito');
    e2.innerHTML = `Letti dal PDF: <b>${letti.length} campi</b> (${escapeHtml(letti.slice(0, 6).join(', '))}${letti.length > 6 ? '…' : ''}).
      Controlla i numeri qui sotto prima di salvare: quello che non ho letto con certezza è rimasto vuoto.`;
    toast('PDF letto');
  } catch (err) {
    esito.innerHTML = `Non ce l'ho fatta: ${escapeHtml(err.message)}<br>Puoi compilare i campi a mano qui sotto.`;
  }
};

const _salva = async (root) => {
  if (!d.datore) { toast('Scegli il datore'); return; }
  if (_n(d.netto) <= 0) { toast('Inserisci il netto della busta'); return; }
  const doppione = state.stipendi.find(s =>
    s.anno === +d.anno && s.mese === +d.mese && s.datore === d.datore && s.id !== d.id);
  if (doppione && !(await conferma(
    `Esiste già una busta di ${MESI_ESTESI[d.mese - 1]} ${d.anno} per ${d.datore}. Vuoi sostituirla?`,
    { ok: 'Sostituisci' }))) return;

  const ok = await safeWrite(() => salvaStipendio({
    anno: +d.anno, mese: +d.mese, datore: d.datore,
    netto: _n(d.netto), trattenute: _n(d.trattenute),
    partite_di_giro: _n(d.partite_di_giro),
    addebiti_netti: _n(d.addebiti_netti),
    tfr_a_fondo_pensione: _n(d.tfr_a_fondo_pensione),
    cometa_dipendente: _n(d.cometa_dipendente),
    cometa_azienda: _n(d.cometa_azienda),
    contributi_inps: d.contributi_inps === '' ? null : _n(d.contributi_inps),
    irpef_netta: d.irpef_netta === '' ? null : _n(d.irpef_netta),
    addizionale_regionale: d.addizionale_regionale === '' ? null : _n(d.addizionale_regionale),
    addizionale_comunale: d.addizionale_comunale === '' ? null : _n(d.addizionale_comunale),
    tredicesima_inclusa: d.tredicesima_inclusa, cessazione: d.cessazione,
  }), 'Busta non salvata');
  if (!ok) return;
  toast(d.id ? 'Busta aggiornata' : 'Busta salvata');
  navigate('stipendi');
};
