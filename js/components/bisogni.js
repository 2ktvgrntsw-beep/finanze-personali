// bisogni.js — Analisi › Bisogni: quanto delle spese va in bisogni e quanto in desideri.
// La natura sta sulle categorie (Altro › Categorie); qui solo la lettura, più la
// possibilità di classificare al volo una categoria ancora senza etichetta.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, nomeMese, toast } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { apriSheet } from './shared.js';
import { aggregaNatura, daClassificare, impostaNaturaCategoria, SEP } from '../services/naturaService.js';

const COL = { B: '#1D9E75', D: '#D85A30', N: '#8B96AB' };
let _periodo = '12m';     // '12m' | 'AAAA'
let _mese = null;         // indice del mese selezionato nel grafico (null = tutto il periodo)

const _pad = (n) => String(n).padStart(2, '0');
// ultimi 12 mesi COMPLETI (il mese in corso è parziale e falserebbe le quote)
const _mesiPeriodo = () => {
  if (_periodo !== '12m') return Array.from({ length: 12 }, (_, i) => `${_periodo}-${_pad(i + 1)}`);
  const oggi = new Date();
  let y = oggi.getFullYear(), m = oggi.getMonth();   // mese precedente (1-12)
  if (m === 0) { m = 12; y--; }
  const out = [];
  for (let i = 0; i < 12; i++) { out.unshift(`${y}-${_pad(m)}`); m--; if (m === 0) { m = 12; y--; } }
  return out;
};
const _anni = () => [...new Set(state.movimenti.filter(m => m.tipo === 'spesa').map(m => m.data.slice(0, 4)))].sort().reverse();
const _lblMese = (am) => { const [y, m] = am.split('-'); return `${nomeMese(+m - 1).slice(0, 3)} ${y.slice(2)}`; };
const _eur0 = (n) => fmtEUR(Math.round(n)).replace(/,00(?=\s|$)/, '');

export const renderBisogni = (body) => {
  const mesi = _mesiPeriodo();
  const agg = aggregaNatura(mesi);
  const sel = _mese !== null && _mese < mesi.length ? _mese : null;
  const somma = (a) => a.reduce((s, x) => s + x, 0);
  const B = sel === null ? somma(agg.B) : agg.B[sel];
  const D = sel === null ? somma(agg.D) : agg.D[sel];
  const N = sel === null ? somma(agg.N) : agg.N[sel];
  const T = B + D + N;
  const pct = (x) => T ? Math.round(x / T * 100) : 0;
  const nMesiConDati = mesi.filter((_, i) => agg.B[i] + agg.D[i] + agg.N[i] > 0).length || 1;
  const max = Math.max(1, ...mesi.map((_, i) => agg.B[i] + agg.D[i] + agg.N[i]));
  const vociDi = (k) => sel === null ? agg.voci[k] : agg.perMeseVoci[k][sel];
  const top = (k) => {
    const e = Object.entries(vociDi(k)).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
    if (!e.length) return '<div class="empty" style="padding:8px 0">Nessuna spesa</div>';
    const riga = ([chiave, v]) => `<div class="conto-riga" style="cursor:default"><div class="conto-nome">${escapeHtml(chiave.split(SEP)[1])}<div class="meta" style="font-size:11.5px;margin-top:2px">${escapeHtml(chiave.split(SEP)[0])}</div></div><div class="conto-saldo num">${_eur0(v)}</div></div>`;
    const resto = e.slice(5);
    return e.slice(0, 5).map(riga).join('') + (resto.length
      ? `<div class="conto-riga" style="cursor:default"><div class="conto-nome meta">altre ${resto.length} voci</div><div class="conto-saldo num meta">${_eur0(resto.reduce((s, x) => s + x[1], 0))}</div></div>` : '');
  };
  const lblPeriodo = sel !== null ? _lblMese(mesi[sel]) : _periodo === '12m' ? `${_lblMese(mesi[0])} – ${_lblMese(mesi[11])}` : _periodo;
  const daClass = daClassificare();

  body.innerHTML = `
    <div class="chip-row" style="margin:12px 0 10px">
      <div class="chip ${_periodo === '12m' ? 'on' : ''}" data-periodo="12m">Ultimi 12 mesi</div>
      ${_anni().map(a => `<div class="chip ${_periodo === a ? 'on' : ''}" data-periodo="${a}">${a}</div>`).join('')}
    </div>

    <div class="card">
      <div class="meta">${lblPeriodo} · spese ${_eur0(T)}</div>
      <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin:12px 0 10px;background:var(--surface-2)">
        <div style="width:${T ? B / T * 100 : 0}%;background:${COL.B}"></div>
        <div style="width:${T ? D / T * 100 : 0}%;background:${COL.D}"></div>
        <div style="flex:1;background:${N ? COL.N : 'transparent'}"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        <div><div class="meta"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COL.B};margin-right:5px"></span>Bisogni</div>
          <div class="num" style="font-size:21px;font-weight:700">${_eur0(B)}</div>
          <div class="meta">${pct(B)}%${sel === null ? ` · ${_eur0(B / nMesiConDati)}/mese` : ''}</div></div>
        <div><div class="meta"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COL.D};margin-right:5px"></span>Desideri</div>
          <div class="num" style="font-size:21px;font-weight:700">${_eur0(D)}</div>
          <div class="meta">${pct(D)}%${sel === null ? ` · ${_eur0(D / nMesiConDati)}/mese` : ''}</div></div>
      </div>
      ${N ? `<div class="meta" style="margin-top:10px">Da classificare: <b class="num">${_eur0(N)}</b> (${pct(N)}%)</div>` : ''}
    </div>

    <div class="card">
      <div class="meta">Per mese · tocca una barra${sel !== null ? ', di nuovo per tornare al periodo' : ''}</div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin-top:10px">
        ${mesi.map((am, i) => `<div data-bar="${i}" style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;cursor:pointer;border-radius:3px;${sel === i ? 'outline:1.5px solid var(--accent);outline-offset:2px;' : ''}">
          <div style="height:${agg.N[i] / max * 100}%;background:${COL.N}"></div>
          <div style="height:${agg.D[i] / max * 100}%;background:${COL.D}"></div>
          <div style="height:${agg.B[i] / max * 100}%;background:${COL.B}"></div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:4px;margin-top:4px">${mesi.map(am => `<span class="meta" style="flex:1;text-align:center;font-size:10.5px">${nomeMese(+am.slice(5) - 1).slice(0, 1).toUpperCase()}</span>`).join('')}</div>
    </div>

    ${daClass.length ? `
      <div class="section-lbl"><span>Da classificare</span></div>
      <div class="card" style="padding:4px 14px">
        ${daClass.map(c => `<div class="conto-riga" data-classifica="${escapeHtml(c.macro)}${SEP}${escapeHtml(c.cat)}"><div class="conto-nome">${escapeHtml(c.cat)}<div class="meta" style="font-size:11.5px;margin-top:2px">${escapeHtml(c.macro)}</div></div><div class="conto-saldo num">${_eur0(c.imp)}</div><div class="conto-chev">›</div></div>`).join('')}
      </div>` : ''}

    <div class="section-lbl"><span>Desideri principali</span></div>
    <div class="card" style="padding:4px 14px">${top('D')}</div>
    <div class="section-lbl"><span>Bisogni principali</span></div>
    <div class="card" style="padding:4px 14px">${top('B')}</div>

    <button class="btn btn-secondary" id="vai-categorie" style="margin-top:6px">Cambia le etichette in Categorie</button>
  `;

  body.querySelectorAll('[data-periodo]').forEach(el => el.addEventListener('click', () => { _periodo = el.dataset.periodo; _mese = null; renderBisogni(body); }));
  body.querySelectorAll('[data-bar]').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.bar; _mese = _mese === i ? null : i; renderBisogni(body); }));
  body.querySelectorAll('[data-classifica]').forEach(el => el.addEventListener('click', () => {
    const [macro, cat] = el.dataset.classifica.split(SEP);
    scegliNatura(`${cat}`, async (v) => { await impostaNaturaCategoria(macro, cat, v); toast('Classificata'); renderBisogni(body); });
  }));
  body.querySelector('#vai-categorie').addEventListener('click', () => navigate('categorie'));
};

// Sheet di scelta Bisogno / Desiderio
export const scegliNatura = (titolo, onScelta) => {
  apriSheet(titolo, `
    <p class="meta" style="margin-bottom:12px">È un bisogno o un desiderio? Vale per tutte le spese della categoria.</p>
    <div class="btn-row">
      <button class="btn btn-secondary" data-n="B" style="border-color:${COL.B}">Bisogno</button>
      <button class="btn btn-secondary" data-n="D" style="border-color:${COL.D}">Desiderio</button>
    </div>
  `, (b, chiudi) => {
    b.querySelectorAll('[data-n]').forEach(x => x.addEventListener('click', async () => { chiudi(); await onScelta(x.dataset.n); }));
  });
};
