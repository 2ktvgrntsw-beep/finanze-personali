// patrimonio.js — Vista Patrimonio: netto, composizione, conti, debiti.
// Stessa grammatica a barre della home, ma le barre pesano sul patrimonio.
// I valori (casa, saldi conti) si modificano toccandoli direttamente (no icone matita).

import { state } from '../core/store.js';
import { fmtEUR, fmtEUR0, escapeHtml, todayISO } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { saldoStimato, saveConto, LABEL_TIPO } from '../services/contiService.js';
import {
  composizioneAttivita, totaleAttivita, totalePassivita, patrimonioNetto,
  deltaNettoMese, salvaSnapshotMese, snapshotMeseMancante, serieStoricoPatrimonio,
} from '../services/patrimonioService.js';
import { statoPrestito } from '../services/prestitiService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

const ICONA_TIPO_ATT = { asset: '🏠', investimenti: '💠', risparmio: '💰', liquidita: '💳' };
const COLORE_ICONA = {
  asset: 'rgba(110,91,255,.18)', investimenti: 'rgba(61,182,255,.18)',
  risparmio: 'rgba(47,208,138,.16)', liquidita: 'var(--surface-2)',
};

export const renderPatrimonio = async (root) => {
  const netto = patrimonioNetto();
  const att = totaleAttivita();
  const pass = totalePassivita();
  const delta = deltaNettoMese();
  const comp = composizioneAttivita();
  const maxAtt = comp.length ? Math.max(...comp.map(c => c.totale)) : 1;

  // conti per lo strip orizzontale
  const contiAttivi = state.conti.filter(c => c.attivo !== false);

  // debiti (mutuo + finanziamenti)
  const debiti = [];
  if (state.mutuo) {
    const s = statoPrestito(state.mutuo, state.eventiMutuo);
    if (s) debiti.push({ nome: state.mutuo.nome || 'Mutuo', residuo: s.residuo * (state.mutuo.quota_utente || 100) / 100, icona: '🏛️', max: state.mutuo.importo_iniziale });
  }
  for (const f of state.finanziamenti) {
    if (f.attivo === false) continue;
    const s = statoPrestito(f, []);
    if (s) debiti.push({ nome: f.nome, residuo: s.residuo * (f.quota_utente || 100) / 100, icona: '📄', max: f.importo_iniziale });
  }
  const maxDeb = debiti.length ? Math.max(...debiti.map(x => x.max)) : 1;

  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">Patrimonio netto</div>
      <div class="big num">${fmtEUR(netto)}</div>
      ${delta !== null ? `<div class="delta" style="color:${delta >= 0 ? 'var(--up)' : 'var(--down)'}">${delta >= 0 ? '▲' : '▼'} ${fmtEUR(Math.abs(delta))} da ultima rilevazione</div>` : '<div class="delta" style="color:var(--txt-2)">Prima rilevazione</div>'}
      <div class="sub">
        <div><span class="lbl2">Attività</span><b class="num">${fmtEUR(att)}</b></div>
        <div><span class="lbl2">Passività</span><b class="neg num">${pass > 0 ? '−' : ''}${fmtEUR(pass)}</b></div>
      </div>
    </div>

    ${contiAttivi.length ? `
      <div class="conti-strip">
        ${contiAttivi.map(c => `<div class="conti-card" data-conto="${c.id}"><div class="cn">${escapeHtml(c.nome)}</div><div class="cv num">${fmtEUR0(saldoStimato(c))}</div></div>`).join('')}
      </div>` : ''}

    ${_graficoLineaHTML()}

    <div class="section-lbl"><span>Composizione</span>${snapshotMeseMancante() ? '<span style="color:var(--accent);font-size:11px;cursor:pointer" id="snap">📸 Salva rilevazione</span>' : ''}</div>
    ${comp.map(c => `
      <div class="patrow">
        <div class="icon" style="background:${COLORE_ICONA[c.tipo]}">${ICONA_TIPO_ATT[c.tipo]}</div>
        <div class="body" data-tipo="${c.tipo}">
          <div class="row1"><span class="name">${LABEL_TIPO[c.tipo]}</span><span class="amt num">${fmtEUR(c.totale)}</span></div>
          <div class="bar"><span style="width:${Math.max(3, c.totale / maxAtt * 100)}%"></span></div>
        </div>
      </div>`).join('') || '<div class="empty">Nessun conto configurato</div>'}

    ${debiti.length ? `
      <div class="section-lbl"><span>Debiti</span></div>
      ${debiti.map(x => `
        <div class="patrow">
          <div class="icon" style="background:rgba(255,107,94,.15)">${x.icona}</div>
          <div class="body" data-debito="${escapeHtml(x.nome)}">
            <div class="row1"><span class="name">${escapeHtml(x.nome)}</span><span class="amt neg num">−${fmtEUR(x.residuo)}</span></div>
            <div class="bar red"><span style="width:${Math.max(3, x.residuo / maxDeb * 100)}%"></span></div>
          </div>
        </div>`).join('')}` : ''}

    <div class="section-lbl"><span>Sezioni</span></div>
    <div class="btn-row" style="flex-wrap:wrap;gap:10px">
      <button class="btn btn-secondary" data-go="conti" style="flex:1 1 45%">Conti</button>
      <button class="btn btn-secondary" data-go="mutuo" style="flex:1 1 45%">Mutuo</button>
      <button class="btn btn-secondary" data-go="finanziamenti" style="flex:1 1 45%">Finanziamenti</button>
      <button class="btn btn-secondary" data-go="investimenti" style="flex:1 1 45%">Investimenti</button>
    </div>
  `;

  // snapshot
  const snap = root.querySelector('#snap');
  if (snap) snap.addEventListener('click', async () => { await salvaSnapshotMese(); toast('Rilevazione salvata'); renderPatrimonio(root); });

  // tap su conto nello strip -> modifica saldo (bottom sheet, no matita)
  root.querySelectorAll('[data-conto]').forEach(el => el.addEventListener('click', () => _modificaConto(root, el.dataset.conto)));

  // tap su tipo attività -> dettaglio conti di quel tipo
  root.querySelectorAll('[data-tipo]').forEach(el => el.addEventListener('click', () => navigate('conti', { tipo: el.dataset.tipo })));

  // navigazione sezioni
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.go)));
};

// Bottom sheet per modificare un conto (saldo/valore) — sostituisce l'icona matita
const _modificaConto = (root, contoId) => {
  const c = state.conti.find(x => x.id === contoId);
  if (!c) return;
  const isAsset = c.tipo === 'asset';
  apriSheet(escapeHtml(c.nome), `
    <p class="meta" style="margin-bottom:14px">${isAsset ? 'Valore attuale del bene (aggiornalo a mano quando cambia).' : 'Saldo di partenza: da qui l’app aggiorna il saldo automaticamente coi movimenti che assegni a questo conto.'}</p>
    <label class="meta">${isAsset ? 'Valore' : 'Saldo iniziale'} (€)</label>
    <input type="number" step="0.01" id="c-saldo" value="${c.saldo_iniziale}" style="width:100%;padding:14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:18px;font-weight:700;margin:8px 0 4px">
    ${!isAsset ? `<label class="meta">Data del saldo</label><input type="date" id="c-data" value="${c.data_saldo}" style="width:100%;padding:12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:15px;margin:8px 0">` : ''}
    <button class="btn btn-primary" id="c-ok" style="margin-top:16px">Salva</button>
  `, (body, chiudi) => {
    body.querySelector('#c-ok').addEventListener('click', async () => {
      const nuovo = parseFloat(body.querySelector('#c-saldo').value) || 0;
      const nuovaData = body.querySelector('#c-data') ? body.querySelector('#c-data').value : c.data_saldo;
      await saveConto({ ...c, saldo_iniziale: nuovo, data_saldo: nuovaData });
      chiudi(); toast('Aggiornato'); renderPatrimonio(root);
    });
  });
};

// Grafico a linea dell'andamento del patrimonio: stima (tratteggiata) + reale (piena).
function _graficoLineaHTML() {
  const { punti, primoReale } = serieStoricoPatrimonio();
  if (punti.length < 2) return '';

  // campiona max ~24 punti per leggibilità (uno ogni tot mesi se troppi)
  let p = punti;
  if (p.length > 24) { const step = Math.ceil(p.length / 24); p = p.filter((_, i) => i % step === 0 || i === punti.length - 1); }

  const W = 320, H = 90, pad = 4;
  const vals = p.map(x => x.valore);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const x = (i) => pad + (i / (p.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / range) * (H - 2 * pad);

  // spezzo in segmento stima (fino al primo reale) e segmento reale
  let dStima = '', dReale = '';
  p.forEach((pt, i) => {
    const cmd = `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pt.valore).toFixed(1)}`;
    if (pt.stima) dStima += cmd + ' ';
    else dReale += (dReale ? 'L' : 'M') + `${x(i).toFixed(1)},${y(pt.valore).toFixed(1)} `;
  });
  // collega la stima al primo reale per continuità
  const idxPrimoReale = p.findIndex(pt => !pt.stima);
  if (idxPrimoReale > 0) dStima += `L${x(idxPrimoReale).toFixed(1)},${y(p[idxPrimoReale].valore).toFixed(1)} `;

  const primoLabel = p[0].annomese.split('-').reverse().join('/');
  const ultimoLabel = p[p.length - 1].annomese.split('-').reverse().join('/');
  const haReale = idxPrimoReale >= 0;

  return `
    <div class="section-lbl"><span>Andamento patrimonio</span></div>
    <div class="card" style="padding:16px 14px">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
        <path d="${dStima}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3" opacity="0.55"/>
        ${haReale ? `<path d="${dReale}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>` : ''}
      </svg>
      <div style="display:flex;justify-content:space-between;margin-top:8px">
        <span class="meta">${primoLabel}</span>
        <span class="meta">${ultimoLabel}</span>
      </div>
      <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--txt-2)">
        <span>┈ stima ricostruita</span>
        ${haReale ? '<span>━ rilevazioni reali</span>' : '<span style="opacity:.6">Le rilevazioni reali compariranno man mano che salvi il patrimonio ogni mese</span>'}
      </div>
    </div>`;
}
