// energiaBollette.js — Schermate di dettaglio della sezione Energia:
// form inserimento/modifica bolletta, dettaglio singola bolletta, storico completo.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, round2 } from '../core/utils.js';
import { navigate, currentRoute } from '../core/router.js';
import { toast } from '../core/utils.js';
import { safeWrite, dbAdd, dbDelete } from '../core/db.js';
import { refreshAll } from '../core/store.js';
import { conferma } from './shared.js';
import {
  bollettaById, kpiBolletta, composizioneBolletta, componiBolletta, giorniTra,
  fornitoriUsati, bolletteComplete, aggregatoAnno, anniDisponibili, mese3, bolletteOrdinate,
} from '../services/energiaService.js';
import { _rigaBollettaHTML } from './energia.js';

const FULMINE = '<svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>';

// ═══════════════════════════════════════════════════════════════════════════
// FORM — inserimento / modifica bolletta
// ═══════════════════════════════════════════════════════════════════════════
export const renderBollettaForm = async (root) => {
  const params = currentRoute().params || {};
  const esistente = params.id ? bollettaById(params.id) : null;
  document.getElementById('view-title').textContent = esistente ? 'Modifica bolletta' : 'Nuova bolletta';

  const b = esistente || { tariffa: 'Bioraria' };
  const fornitori = fornitoriUsati();
  const val = (v) => v == null ? '' : String(v).replace('.', ',');

  root.innerHTML = `
    <div class="card">
      <div class="fld"><label>Fornitore</label>
        <input id="f-forn" list="forn-list" value="${escapeHtml(b.fornitore || '')}" placeholder="Es. Enel, ENGIE…" class="sheet-input" autocomplete="off">
        <datalist id="forn-list">${fornitori.map(f => `<option value="${escapeHtml(f)}">`).join('')}</datalist>
      </div>
      <div class="fld"><label>Offerta <span class="opt">(facoltativo)</span></label>
        <input id="f-off" value="${escapeHtml(b.offerta || '')}" placeholder="Nome dell'offerta" class="sheet-input">
      </div>
      <div class="frow">
        <div class="fld"><label>Periodo dal</label><input type="date" id="f-dal" value="${b.dal || ''}" class="sheet-input"></div>
        <div class="fld"><label>al</label><input type="date" id="f-al" value="${b.al || ''}" class="sheet-input"></div>
      </div>
      <div class="fld"><label>Tipo tariffa</label>
        <div class="seg-tab" id="f-tariffa">
          <button data-t="Bioraria" class="${b.tariffa !== 'Monoraria' ? 'on' : ''}">Bioraria (F1/F2/F3)</button>
          <button data-t="Monoraria" class="${b.tariffa === 'Monoraria' ? 'on' : ''}">Monoraria</button>
        </div>
      </div>
      <div class="fld" id="f-fasce-wrap">
        <label>Consumo per fascia (kWh)</label>
        <div class="fasce-in">
          <div class="fi"><label>F1</label><input type="text" inputmode="numeric" id="f-f1" value="${val(b.kwhF1)}" class="sheet-input"></div>
          <div class="fi"><label>F2</label><input type="text" inputmode="numeric" id="f-f2" value="${val(b.kwhF2)}" class="sheet-input"></div>
          <div class="fi"><label>F3</label><input type="text" inputmode="numeric" id="f-f3" value="${val(b.kwhF3)}" class="sheet-input"></div>
        </div>
      </div>
      <div class="fld" id="f-tot-wrap" style="display:none">
        <label>Consumo totale (kWh)</label>
        <input type="text" inputmode="numeric" id="f-kwhtot" value="${val(b.kwhTot)}" class="sheet-input">
      </div>
      <div class="fld"><label>Totale bolletta (€)</label>
        <input type="text" inputmode="decimal" id="f-tot" value="${val(b.totale)}" placeholder="0,00" class="sheet-input">
      </div>
    </div>

    <div class="section-lbl"><span>Dettaglio costi <span class="opt">· facoltativo, per grafici più precisi</span></span></div>
    <div class="card">
      <div class="frow">
        <div class="fld"><label>Materia energia (€)</label><input type="text" inputmode="decimal" id="f-materia" value="${val(b.materia)}" class="sheet-input" style="color:var(--blue-2)"></div>
        <div class="fld"><label>Trasporto (€)</label><input type="text" inputmode="decimal" id="f-trasp" value="${val(b.trasporto)}" class="sheet-input"></div>
      </div>
      <div class="frow">
        <div class="fld"><label>Oneri (€)</label><input type="text" inputmode="decimal" id="f-oneri" value="${val(b.oneri)}" class="sheet-input"></div>
        <div class="fld"><label>Accise (€)</label><input type="text" inputmode="decimal" id="f-accise" value="${val(b.accise)}" class="sheet-input"></div>
      </div>
      <div class="frow">
        <div class="fld"><label>IVA (€)</label><input type="text" inputmode="decimal" id="f-iva" value="${val(b.iva)}" class="sheet-input"></div>
        <div class="fld"><label>Canone TV (€)</label><input type="text" inputmode="decimal" id="f-canone" value="${val(b.canone)}" class="sheet-input"></div>
      </div>
      <div class="fld"><label>Altri importi (€, anche negativi per sconti)</label><input type="text" inputmode="decimal" id="f-altri" value="${val(b.altri)}" class="sheet-input"></div>
    </div>

    <div style="margin-top:18px"><button class="btn btn-primary" id="f-salva">${esistente ? 'Salva modifiche' : 'Salva bolletta'}</button></div>
    <p class="meta" style="text-align:center;margin-top:12px;line-height:1.5">Da questi dati l'app calcola in automatico<br><b style="color:var(--up)">€/kWh · €/giorno · ripartizione fasce · prezzo materia</b></p>
  `;

  // toggle tariffa: mostra fasce (bioraria) o totale (monoraria)
  let tariffa = b.tariffa === 'Monoraria' ? 'Monoraria' : 'Bioraria';
  const applicaTariffa = () => {
    root.querySelector('#f-fasce-wrap').style.display = tariffa === 'Monoraria' ? 'none' : 'block';
    root.querySelector('#f-tot-wrap').style.display = tariffa === 'Monoraria' ? 'block' : 'none';
  };
  applicaTariffa();
  root.querySelector('#f-tariffa').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-t]'); if (!btn) return;
    tariffa = btn.dataset.t;
    root.querySelectorAll('#f-tariffa button').forEach(x => x.classList.toggle('on', x === btn));
    applicaTariffa();
  });

  root.querySelector('#f-salva').addEventListener('click', async () => {
    const numF = (id) => { const v = root.querySelector(id).value.trim().replace(',', '.'); return v === '' ? null : parseFloat(v); };
    const intF = (id) => { const v = root.querySelector(id).value.trim(); return v === '' ? 0 : parseInt(v) || 0; };
    const forn = root.querySelector('#f-forn').value.trim();
    const dal = root.querySelector('#f-dal').value, al = root.querySelector('#f-al').value;
    const totale = numF('#f-tot');

    if (!forn) { toast('Inserisci il fornitore'); return; }
    if (!dal || !al) { toast('Inserisci il periodo'); return; }
    if (al < dal) { toast('Il periodo "al" deve essere dopo "dal"'); return; }
    if (!totale || totale <= 0) { toast('Inserisci il totale della bolletta'); return; }

    const dati = {
      numero: esistente?.numero || null,
      fornitore: forn, offerta: root.querySelector('#f-off').value.trim(),
      dal, al, tariffa,
      kwhF1: intF('#f-f1'), kwhF2: intF('#f-f2'), kwhF3: intF('#f-f3'),
      kwhTot: tariffa === 'Monoraria' ? intF('#f-kwhtot') : 0,
      totale,
      materia: numF('#f-materia'), trasporto: numF('#f-trasp'),
      oneri: numF('#f-oneri'), accise: numF('#f-accise'), iva: numF('#f-iva'),
      canone: numF('#f-canone'), altri: numF('#f-altri'),
    };
    if (dati.kwhTot === 0 && dati.kwhF1 + dati.kwhF2 + dati.kwhF3 === 0) { toast('Inserisci il consumo in kWh'); return; }

    const obj = componiBolletta(dati, esistente?.id);
    const ok = await safeWrite(async () => { await dbAdd('bollette', obj); await refreshAll(); }, esistente ? 'Modifiche non salvate' : 'Bolletta non salvata');
    if (!ok) return;
    toast(esistente ? 'Bolletta aggiornata' : 'Bolletta salvata');
    navigate('energia');
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// DETTAGLIO — singola bolletta
// ═══════════════════════════════════════════════════════════════════════════
export const renderBollettaDettaglio = async (root) => {
  const params = currentRoute().params || {};
  const b = bollettaById(params.id);
  document.getElementById('view-title').textContent = 'Bolletta';
  if (!b) { root.innerHTML = '<div class="empty" style="padding:40px">Bolletta non trovata</div>'; return; }

  const k = kpiBolletta(b);
  const comp = composizioneBolletta(b);
  const totFasce = (b.kwhF1 || 0) + (b.kwhF2 || 0) + (b.kwhF3 || 0);
  const pc = (v) => totFasce ? Math.round(v / totFasce * 100) : 0;
  const [y1, m1, g1] = b.dal.split('-'); const [y2, m2, g2] = b.al.split('-');

  root.innerHTML = `
    <div class="det-hero">
      <div class="forn"><b>${escapeHtml(b.fornitore)}</b>${b.offerta ? ' · ' + escapeHtml(b.offerta) : ''}</div>
      <div class="imp num">${fmtEUR(b.totale)}</div>
      <div class="per">${g1} ${mese3(+m1)} – ${g2} ${mese3(+m2)} ${y2} · ${b.giorni} giorni${b.tariffa ? ' · ' + escapeHtml(b.tariffa) : ''}</div>
    </div>

    <div class="det-grid">
      <div class="det-cell"><div class="k">Consumo</div><div class="v num">${b.kwhTot}<span style="font-size:11px"> kWh</span></div></div>
      <div class="det-cell"><div class="k">€/kWh medio</div><div class="v num">${k ? k.eurKwh.toFixed(3) : '—'}</div></div>
      <div class="det-cell"><div class="k">€/giorno</div><div class="v num">${k && k.eurGiorno != null ? k.eurGiorno.toFixed(2) : '—'}</div></div>
    </div>

    ${totFasce > 0 ? `
    <div class="section-lbl"><span>Consumo per fascia</span></div>
    <div class="efasce">
      <div class="efascia"><div class="dot" style="background:#1C3A6E"></div><div class="nm">F1 giorno</div><div class="pc num">${b.kwhF1 || 0}</div><div class="kw">${pc(b.kwhF1 || 0)}%</div></div>
      <div class="efascia"><div class="dot" style="background:#2E9BFF"></div><div class="nm">F2 sera</div><div class="pc num">${b.kwhF2 || 0}</div><div class="kw">${pc(b.kwhF2 || 0)}%</div></div>
      <div class="efascia"><div class="dot" style="background:#7B6CFF"></div><div class="nm">F3 notte</div><div class="pc num">${b.kwhF3 || 0}</div><div class="kw">${pc(b.kwhF3 || 0)}%</div></div>
    </div>` : ''}

    ${comp.length ? `
    <div class="section-lbl"><span>Composizione della spesa</span></div>
    <div class="card">
      ${comp.map(v => `<div class="ecomp-row">
        <div class="ecomp-nm">${escapeHtml(v.nome)}</div>
        <div class="ecomp-bar"><div class="ecomp-fill" style="width:${v.pct}%;background:${v.colore}"></div></div>
        <div class="ecomp-val num">${v.val.toFixed(2)}</div>
      </div>`).join('')}
    </div>` : ''}

    ${b.note ? `<div class="enote">${escapeHtml(b.note)}</div>` : ''}

    <div class="det-actions">
      <button class="btn btn-secondary" id="d-mod">Modifica</button>
      <button class="btn btn-danger" id="d-del">Elimina</button>
    </div>
  `;

  root.querySelector('#d-mod').addEventListener('click', () => navigate('bolletta-nuova', { id: b.id }));
  root.querySelector('#d-del').addEventListener('click', async () => {
    if (!(await conferma('Eliminare questa bolletta?', { danger: true, ok: 'Elimina' }))) return;
    const ok = await safeWrite(async () => { await dbDelete('bollette', b.id); await refreshAll(); }, 'Bolletta non eliminata');
    if (!ok) return;
    toast('Bolletta eliminata'); navigate('energia');
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// STORICO — tutte le bollette, raggruppate per anno, con filtro fornitore
// ═══════════════════════════════════════════════════════════════════════════
let _filtroForn = null;

export const renderBolletteStorico = async (root) => {
  document.getElementById('view-title').textContent = 'Storico';
  const anni = anniDisponibili();
  const fornitori = fornitoriUsati();

  const bollFiltrate = (anno) => bolletteComplete()
    .filter(b => b.al.startsWith(anno))
    .filter(b => !_filtroForn || b.fornitore === _filtroForn);

  root.innerHTML = `
    <div class="efilters" id="efilters">
      <div class="echip ${!_filtroForn ? 'on' : ''}" data-forn="">Tutti</div>
      ${fornitori.map(f => `<div class="echip ${_filtroForn === f ? 'on' : ''}" data-forn="${escapeHtml(f)}">${escapeHtml(f)}</div>`).join('')}
    </div>
    ${anni.map(anno => {
      const boll = bollFiltrate(anno);
      if (!boll.length) return '';
      const spesa = boll.reduce((s, b) => s + b.totale, 0);
      const cons = boll.reduce((s, b) => s + b.kwhTot, 0);
      return `<div class="eyear-group">
        <div class="eyear-head"><span class="yy">${anno}</span><span class="yt num">${fmtEUR(spesa)} · ${cons.toLocaleString('it-IT')} kWh</span></div>
        <div class="card" style="padding:0">${boll.map(b => _rigaBollettaHTML(b)).join('<div class="divider"></div>')}</div>
      </div>`;
    }).join('')}
  `;

  root.querySelector('#efilters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-forn]'); if (!chip) return;
    _filtroForn = chip.dataset.forn || null;
    renderBolletteStorico(root);
  });
  root.querySelectorAll('[data-bolletta]').forEach(el =>
    el.addEventListener('click', () => navigate('bolletta-dettaglio', { id: el.dataset.bolletta })));
};
