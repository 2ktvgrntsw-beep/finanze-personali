// analisi.js — Sezione Analisi: anni (navigabili), tag, investimenti.

import { state } from '../core/store.js';
import { fmtEUR, fmtEUR0, escapeHtml, nomeMese } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate, buildHash } from '../core/router.js';
import { spesePerAnno, investitoPerMese, aggregaPerLivello, soloSpese } from '../services/movimentiService.js';
import { saldoStimato } from '../services/contiService.js';

let _tab = 'anni';
let _annoSel = String(new Date().getFullYear());
let _invDim = 'strumento';   // 'strumento' | 'piattaforma'

export const renderAnalisi = async (root) => {
  root.innerHTML = `
    <div class="seg">
      <button data-t="anni" class="${_tab === 'anni' ? 'on' : ''}">Anni</button>
      <button data-t="tag" class="${_tab === 'tag' ? 'on' : ''}">Tag</button>
      <button data-t="investimenti" class="${_tab === 'investimenti' ? 'on' : ''}">Investimenti</button>
    </div>
    <div id="analisi-body"></div>
  `;
  root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { _tab = b.dataset.t; renderAnalisi(root); }));
  const body = root.querySelector('#analisi-body');
  if (_tab === 'anni') _renderAnni(body);
  else if (_tab === 'tag') _renderTag(body);
  else _renderInvestimenti(body);
};

const _renderAnni = (body) => {
  const dati = spesePerAnno();
  if (!dati.length) { body.innerHTML = '<div class="empty">Nessun dato</div>'; return; }
  const max = Math.max(...dati.map(d => d.totale));
  const anniDisponibili = dati.map(d => d.anno);
  if (!anniDisponibili.includes(_annoSel)) _annoSel = anniDisponibili[anniDisponibili.length - 1];

  const idxSel = anniDisponibili.indexOf(_annoSel);
  const prevAnno = idxSel > 0 ? anniDisponibili[idxSel - 1] : null;
  const nextAnno = idxSel < anniDisponibili.length - 1 ? anniDisponibili[idxSel + 1] : null;

  // dati anno selezionato
  const movAnno = state.movimenti.filter(m => m.data.startsWith(_annoSel));
  const totAnno = soloSpese(movAnno).reduce((s, m) => s + m.imp, 0);
  const righe = aggregaPerLivello(movAnno, 'macro').slice(0, 8);
  const maxCat = righe.length ? righe[0].totale : 1;

  // delta vs anno precedente
  let deltaHTML = '';
  if (idxSel > 0) {
    const prec = dati[idxSel - 1].totale, cur = dati[idxSel].totale;
    if (prec > 0) { const pct = Math.round((cur - prec) / prec * 100); deltaHTML = `<div class="delta ${pct > 0 ? 'worse' : 'better'} num" style="margin-top:4px">${pct > 0 ? '+' : ''}${pct}% vs ${dati[idxSel - 1].anno}</div>`; }
  }

  const isCorrente = _annoSel === String(new Date().getFullYear());
  const mesiTrascorsi = isCorrente ? (new Date().getMonth() + 1) : 12;

  body.innerHTML = `
    <div class="month-nav">
      <button class="arr" id="a-prev" ${prevAnno ? '' : 'disabled'}>‹</button>
      <div class="m">${_annoSel}</div>
      <button class="arr" id="a-next" ${nextAnno ? '' : 'disabled'}>›</button>
    </div>
    <div class="triple">
      <div class="cell"><div class="lbl">Spese ${_annoSel}</div><div class="val sp num">${fmtEUR(totAnno)}</div>${deltaHTML}</div>
      <div class="cell"><div class="lbl">Media/mese</div><div class="val sa num">${fmtEUR0(totAnno / mesiTrascorsi)}</div></div>
      <div class="cell"><div class="lbl">Movimenti</div><div class="val sa num">${soloSpese(movAnno).length}</div></div>
    </div>
    <div class="yearchart"><div class="yc-bars">${dati.map(d => `
      <div class="yb ${d.anno === _annoSel ? 'on' : ''}" data-anno="${d.anno}">
        <div class="col" style="height:${Math.max(3, d.totale / max * 100)}%"></div>
        <span>'${d.anno.slice(2)}</span>
      </div>`).join('')}</div></div>
    <div class="section-lbl"><span>Categorie ${_annoSel}</span></div>
    ${righe.map(r => `
      <div class="catrow">
        <div class="icon" data-href="${buildHash('movimenti', { macro: r.chiave, periodo: 'anno', mese: _annoSel + '-01' })}">${iconaMacro(r.chiave)}</div>
        <div class="body" data-href="${buildHash('drill', { macro: r.chiave, periodo: 'anno', mese: _annoSel + '-01' })}">
          <div class="row1"><span class="name">${escapeHtml(r.chiave)}</span><span class="right"><span class="amt num">${fmtEUR(r.totale)}</span></span></div>
          <div class="bar"><span style="width:${Math.max(3, r.totale / maxCat * 100)}%"></span></div>
        </div>
        <div class="chev" data-href="${buildHash('drill', { macro: r.chiave, periodo: 'anno', mese: _annoSel + '-01' })}">›</div>
      </div>`).join('')}
  `;

  const p = body.querySelector('#a-prev'), n = body.querySelector('#a-next');
  if (p && prevAnno) p.addEventListener('click', () => { _annoSel = prevAnno; renderAnalisi(document.getElementById('app-root')); });
  if (n && nextAnno) n.addEventListener('click', () => { _annoSel = nextAnno; renderAnalisi(document.getElementById('app-root')); });
  body.querySelectorAll('[data-anno]').forEach(el => el.addEventListener('click', () => { _annoSel = el.dataset.anno; renderAnalisi(document.getElementById('app-root')); }));
  body.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); location.hash = el.dataset.href; }));
};

const _renderTag = (body) => {
  const perTag = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    for (const t of (m.tag || [])) { perTag[t] = perTag[t] || { tag: t, totale: 0, count: 0 }; perTag[t].totale += m.imp; perTag[t].count++; }
  }
  const righe = Object.values(perTag).sort((a, b) => b.totale - a.totale);
  if (!righe.length) { body.innerHTML = `<div class="empty"><div class="big-ic">#️⃣</div>Non hai ancora usato i tag.<br><br>Aggiungi un tag quando inserisci una spesa, o applica tag in blocco allo storico dalle Impostazioni. Poi qui vedrai quanto spendi per ogni tag (viaggi, progetti, persone…).</div>`; return; }
  const max = righe[0].totale;
  body.innerHTML = `<div class="section-lbl" style="margin-top:8px"><span>Spese per tag</span></div>
    ${righe.map(r => `
      <div class="catrow">
        <div class="icon" data-href="${buildHash('ricerca', { q: r.tag })}">#</div>
        <div class="body" data-href="${buildHash('ricerca', { q: r.tag })}">
          <div class="row1"><span class="name">${escapeHtml(r.tag)}</span><span class="right"><span class="amt num">${fmtEUR(r.totale)}</span><span class="pct num">${r.count}</span></span></div>
          <div class="bar"><span style="width:${Math.max(3, r.totale / max * 100)}%"></span></div>
        </div>
      </div>`).join('')}`;
  body.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', () => location.hash = el.dataset.href));
};

const _renderInvestimenti = (body) => {
  const datiMese = investitoPerMese();
  if (!datiMese.length) { body.innerHTML = '<div class="empty"><div class="big-ic">💠</div>Nessun investimento registrato</div>'; return; }

  // grafico per anno (navigabile)
  const perAnno = {};
  for (const d of datiMese) { const a = d.mese.slice(0, 4); perAnno[a] = (perAnno[a] || 0) + d.totale; }
  const anni = Object.keys(perAnno).sort();
  if (!anni.includes(_annoSel)) _annoSel = anni[anni.length - 1];
  const maxAnno = Math.max(...Object.values(perAnno));
  const totale = datiMese.reduce((s, d) => s + d.totale, 0);

  const idxSel = anni.indexOf(_annoSel);
  const prevAnno = idxSel > 0 ? anni[idxSel - 1] : null;
  const nextAnno = idxSel < anni.length - 1 ? anni[idxSel + 1] : null;

  // drill per strumento o piattaforma (dimensione selezionabile)
  const perDim = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'trasferimento') continue;
    const dest = state.conti.find(c => c.nome === m.contoDest);
    const isInv = dest ? dest.tipo === 'investimenti' : m.macro === 'Investimenti';
    if (!isInv) continue;
    if (!m.data.startsWith(_annoSel)) continue;    // solo anno selezionato
    const chiave = _invDim === 'piattaforma' ? (m.contoDest || 'Altro') : (m.sub || m.cat || 'Altro');
    perDim[chiave] = (perDim[chiave] || 0) + m.imp;
  }
  const dimRighe = Object.entries(perDim).map(([nome, tot]) => ({ nome, tot })).sort((a, b) => b.tot - a.tot);
  const maxDim = dimRighe.length ? dimRighe[0].tot : 1;
  const totAnnoInv = Object.values(perDim).reduce((s, v) => s + v, 0);

  body.innerHTML = `
    <div class="net-card" style="margin-top:12px">
      <div class="lbl">Totale investito (versato)</div>
      <div class="big num">${fmtEUR(totale)}</div>
      <div class="delta" style="color:var(--transfer)">su ${datiMese.length} mesi con versamenti</div>
    </div>
    <div class="yearchart">
      <div class="yc-bars">${anni.map(a => `<div class="yb ${a === _annoSel ? 'on' : ''}" data-anno="${a}"><div class="col" style="height:${Math.max(3, perAnno[a] / maxAnno * 100)}%;${a === _annoSel ? '' : 'background:var(--surface-3)'}"></div><span>'${a.slice(2)}</span></div>`).join('')}</div>
    </div>

    <div class="month-nav">
      <button class="arr" id="i-prev" ${prevAnno ? '' : 'disabled'}>‹</button>
      <div class="m">${_annoSel} · ${fmtEUR(totAnnoInv)}</div>
      <button class="arr" id="i-next" ${nextAnno ? '' : 'disabled'}>›</button>
    </div>

    <div class="seg" style="margin-top:6px">
      <button data-dim="strumento" class="${_invDim === 'strumento' ? 'on' : ''}">Per strumento</button>
      <button data-dim="piattaforma" class="${_invDim === 'piattaforma' ? 'on' : ''}">Per piattaforma</button>
    </div>

    ${dimRighe.length ? dimRighe.map(r => {
      const filtro = _invDim === 'piattaforma' ? { tipo: 'trasferimento', conto: '', periodo: 'anno', mese: _annoSel + '-01', contoDest: r.nome } : { tipo: 'trasferimento', sub: r.nome, periodo: 'anno', mese: _annoSel + '-01' };
      return `
      <div class="catrow">
        <div class="icon" data-href="${buildHash('movimenti', filtro)}" style="background:rgba(61,182,255,.18)">💠</div>
        <div class="body" data-href="${buildHash('movimenti', filtro)}">
          <div class="row1"><span class="name">${escapeHtml(r.nome)}</span><span class="amt num" style="color:var(--transfer)">${fmtEUR(r.tot)}</span></div>
          <div class="bar"><span style="width:${Math.max(3, r.tot / maxDim * 100)}%;background:var(--transfer)"></span></div>
        </div>
        <div class="chev" data-href="${buildHash('movimenti', filtro)}">›</div>
      </div>`;
    }).join('') : `<div class="empty" style="padding:24px">Nessun versamento nel ${_annoSel}</div>`}
  `;

  const p = body.querySelector('#i-prev'), n = body.querySelector('#i-next');
  if (p && prevAnno) p.addEventListener('click', () => { _annoSel = prevAnno; renderAnalisi(document.getElementById('app-root')); });
  if (n && nextAnno) n.addEventListener('click', () => { _annoSel = nextAnno; renderAnalisi(document.getElementById('app-root')); });
  body.querySelectorAll('[data-anno]').forEach(el => el.addEventListener('click', () => { _annoSel = el.dataset.anno; renderAnalisi(document.getElementById('app-root')); }));
  body.querySelectorAll('[data-dim]').forEach(el => el.addEventListener('click', () => { _invDim = el.dataset.dim; renderAnalisi(document.getElementById('app-root')); }));
  body.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); location.hash = el.dataset.href; }));
};
