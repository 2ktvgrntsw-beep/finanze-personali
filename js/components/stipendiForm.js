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
import { salvaStipendio, eliminaStipendio, DATORI, MESI_ESTESI, CAMPI_FISCALI_FACOLTATIVI } from '../services/stipendiService.js';

let d = null;
let _base = null;   // la busta com'era prima della modifica: i campi che il form non mostra restano

const bozza = () => {
  const oggi = new Date();
  return {
    id: null, anno: oggi.getFullYear(), mese: oggi.getMonth() + 1,
    datore: DATORI[DATORI.length - 1]?.nome || '',
    netto: '', trattenute: '', tfr_a_fondo_pensione: '', cometa_dipendente: '', cometa_azienda: '',
    contributi_inps: '', irpef_netta: '', addizionale_regionale: '', addizionale_comunale: '',
    imponibile_inps: '', imponibile_irpef: '', irpef_lorda: '', detrazioni: '',
    premi_detassati: '', imposta_sostitutiva: '',
    addebiti_netti: '', rimborso_730: '', partite_di_giro: 0, tredicesima_inclusa: false, cessazione: false,
  };
};

export const renderStipendioForm = async (root, params = {}) => {
  const esistente = params.id ? state.stipendi.find(s => s.id === params.id) : null;
  d = esistente ? { ...bozza(), ...esistente } : bozza();
  _base = esistente || null;
  _daPdf = new Set();
  document.getElementById('view-title').textContent = esistente ? 'Modifica busta' : 'Nuova busta paga';
  _render(root);
};

const _n = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')) || 0);
const _lordo = () => Math.round((_n(d.netto) + _n(d.trattenute)) * 100) / 100;
let _daPdf = new Set();
// numeri salvati → "4179,00"; quello che stai scrivendo resta com'è
const _mostra = (v) => v === '' || v == null ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v);     // campi compilati dall'ultimo PDF letto: li evidenzio

// Una riga del form: etichetta (e nota sotto, piccola) a sinistra, importo a destra.
// Prima etichetta e campo stavano nella stessa riga alta 46px: le etichette lunghe
// andavano a capo e si sovrapponevano alla riga sotto.
const _campo = (chiave, etichetta, nota = '') => `
  <label class="bp-campo">
    <span class="bp-lbl">${etichetta}${nota ? `<small>${nota}</small>` : ''}</span>
    <input class="bp-in num ${_daPdf.has(chiave) ? 'pdf' : ''}" data-k="${chiave}" inputmode="decimal" placeholder="—"
           value="${_mostra(d[chiave])}" autocomplete="off">
  </label>`;

const _scelta = (id, etichetta, opzioni) => `
  <label class="bp-campo">
    <span class="bp-lbl">${etichetta}</span>
    <select id="${id}" class="bp-in bp-sel">${opzioni}</select>
  </label>`;

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
        imponibili, IRPEF, addizionali, TFR e Cometa. Le buste vecchie scansionate non sono
        leggibili: in quel caso compila a mano.
      </div>
    </div>

    <div class="section-lbl"><span>Periodo</span></div>
    <div class="card bp-card">
      ${_scelta('f-mese', 'Mese', MESI_ESTESI.map((m, i) => `<option value="${i + 1}" ${+d.mese === i + 1 ? 'selected' : ''}>${m}</option>`).join(''))}
      ${_scelta('f-anno', 'Anno', anni.map(a => `<option value="${a}" ${+d.anno === a ? 'selected' : ''}>${a}</option>`).join(''))}
      ${_scelta('f-datore', 'Datore', DATORI.map(x => `<option value="${escapeHtml(x.nome)}" ${d.datore === x.nome ? 'selected' : ''}>${escapeHtml(x.nome)}</option>`).join(''))}
    </div>

    <div class="section-lbl"><span>Importi principali</span></div>
    <div class="card bp-card">
      ${_campo('netto', 'Netto in busta', 'quello che hai incassato')}
      ${_campo('trattenute', 'Totale trattenute', 'senza partite di giro')}
      ${_campo('addebiti_netti', 'di cui addebiti in busta', 'auto, mensa, ticket: spese tue, non tasse')}
      <div class="bp-nota">Lordo calcolato: <b class="num" id="f-lordo">${fmtEUR(_lordo())}</b> · netto + trattenute, come sulla busta</div>
    </div>

    <div class="section-lbl"><span>Previdenza</span></div>
    <div class="card bp-card">
      ${_campo('tfr_a_fondo_pensione', 'TFR versato al fondo')}
      ${_campo('cometa_dipendente', 'Cometa — quota tua')}
      ${_campo('cometa_azienda', 'Cometa — quota datore')}
    </div>

    <div class="section-lbl"><span>Contributi e IRPEF</span></div>
    <div class="card bp-card">
      ${_campo('imponibile_inps', 'Imponibile INPS')}
      ${_campo('contributi_inps', 'Contributi INPS', 'IVS + CIGS')}
      ${_campo('imponibile_irpef', 'Imponibile IRPEF')}
      ${_campo('irpef_lorda', 'IRPEF lorda')}
      ${_campo('detrazioni', 'Detrazioni', 'se ci sono sulla busta')}
      ${_campo('irpef_netta', 'IRPEF trattenuta', 'voce "Ritenute IRPEF"')}
      ${_campo('addizionale_regionale', 'Addizionale regionale')}
      ${_campo('addizionale_comunale', 'Addizionale comunale', 'saldo + acconto')}
    </div>

    <div class="section-lbl"><span>Premi e rimborsi</span></div>
    <div class="card bp-card">
      ${_campo('premi_detassati', 'Premi detassati', 'premio di risultato')}
      ${_campo('imposta_sostitutiva', 'Imposta sostitutiva sui premi')}
      ${_campo('rimborso_730', 'Rimborso 730 ricevuto', 'credito: non è stipendio')}
    </div>

    <div class="card bp-card">
      <label class="bp-campo"><span class="bp-lbl">Include la tredicesima</span>
        <input type="checkbox" id="f-13" ${d.tredicesima_inclusa ? 'checked' : ''}></label>
      <label class="bp-campo"><span class="bp-lbl">Busta di fine rapporto</span>
        <input type="checkbox" id="f-cess" ${d.cessazione ? 'checked' : ''}></label>
    </div>

    <div class="btn-row" style="margin-top:16px">
      ${d.id ? '<button class="btn btn-danger" id="f-del">Elimina</button>' : ''}
      <button class="btn btn-primary" id="f-salva">${d.id ? 'Salva modifiche' : 'Salva busta'}</button>
    </div>
  `;

  root.querySelectorAll('[data-k]').forEach(el =>
    el.addEventListener('input', () => { d[el.dataset.k] = el.value; el.classList.remove('pdf'); _aggiornaLordo(root); }));
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
  const el = root.querySelector('#f-lordo');
  if (el) el.textContent = fmtEUR(_lordo());
};

const _importa = async (root, file) => {
  const esito = root.querySelector('#pdf-esito');
  esito.textContent = 'Leggo il PDF…';
  try {
    const { dati } = await estraiBustaDaPDF(file);
    const letti = [];
    _daPdf = new Set();
    for (const [k, v] of Object.entries(dati)) {
      if (v == null) continue;
      if (k === 'anno' || k === 'mese') { d[k] = v; letti.push(k === 'anno' ? 'anno' : 'mese'); continue; }
      if (k === 'datore') { if (DATORI.some(x => x.nome === v)) { d.datore = v; letti.push('datore'); } continue; }
      if (k === 'lordo') continue;                        // il lordo si ricava da netto+trattenute
      if (typeof v === 'boolean') { d[k] = v; continue; }
      d[k] = v; _daPdf.add(k); letti.push(k.replace(/_/g, ' '));
    }
    _render(root);
    const e2 = root.querySelector('#pdf-esito');
    e2.innerHTML = `Letti dal PDF: <b>${letti.length} campi</b> (${escapeHtml(letti.slice(0, 6).join(', '))}${letti.length > 6 ? '…' : ''}).
      I campi letti sono evidenziati: controllali prima di salvare. Quello che non ho letto con certezza è rimasto vuoto e puoi scriverlo tu.`;
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

  const facoltativi = {};
  for (const k of CAMPI_FISCALI_FACOLTATIVI) facoltativi[k] = d[k] === '' || d[k] == null ? null : _n(d[k]);
  const ok = await safeWrite(() => salvaStipendio({
    base: _base,
    anno: +d.anno, mese: +d.mese, datore: d.datore,
    netto: _n(d.netto), trattenute: _n(d.trattenute),
    partite_di_giro: _n(d.partite_di_giro),
    rimborso_730: _n(d.rimborso_730),
    rimborso_730_anno: d.rimborso_730_anno || null,
    addebiti_netti: _n(d.addebiti_netti),
    tfr_a_fondo_pensione: _n(d.tfr_a_fondo_pensione),
    cometa_dipendente: _n(d.cometa_dipendente),
    cometa_azienda: _n(d.cometa_azienda),
    premi_detassati: _n(d.premi_detassati),
    ...facoltativi,
    tredicesima_inclusa: d.tredicesima_inclusa, cessazione: d.cessazione,
  }), 'Busta non salvata');
  if (!ok) return;
  toast(d.id ? 'Busta aggiornata' : 'Busta salvata');
  navigate('stipendi');
};
