// analisi.js — Sezione Analisi: anni, tag, investimenti nel tempo.
// Sfrutta lo storico decennale per confronti anno-su-anno e aggregazioni per tag
// (il valore aggiunto rispetto alle app standard).

import { state } from '../core/store.js';
import { fmtEUR, fmtEUR0, escapeHtml, nomeMese } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { spesePerAnno, investitoPerMese, aggregaPerLivello, soloSpese } from '../services/movimentiService.js';

let _tab = 'anni';   // 'anni' | 'tag' | 'investimenti'

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
  const annoCorrente = String(new Date().getFullYear());

  // confronto ultimo anno completo vs precedente
  const barsHTML = dati.map(d => `
    <div class="yb ${d.anno === annoCorrente ? 'on' : ''}" data-anno="${d.anno}">
      <div class="col" style="height:${Math.max(3, d.totale / max * 100)}%"></div>
      <span>'${d.anno.slice(2)}</span>
    </div>`).join('');

  // top categorie dell'anno corrente
  const movAnno = state.movimenti.filter(m => m.data.startsWith(annoCorrente));
  const totAnno = soloSpese(movAnno).reduce((s, m) => s + m.imp, 0);
  const righe = aggregaPerLivello(movAnno, 'macro').slice(0, 6);
  const maxCat = righe.length ? righe[0].totale : 1;

  // delta vs anno precedente
  const idx = dati.findIndex(d => d.anno === annoCorrente);
  let deltaHTML = '';
  if (idx > 0) {
    const prec = dati[idx - 1].totale, cur = dati[idx].totale;
    if (prec > 0) {
      const pct = Math.round((cur - prec) / prec * 100);
      deltaHTML = `<div class="delta ${pct > 0 ? 'worse' : 'better'} num" style="margin-top:4px">${pct > 0 ? '+' : ''}${pct}% vs ${dati[idx - 1].anno}</div>`;
    }
  }

  body.innerHTML = `
    <div class="triple" style="margin-top:16px">
      <div class="cell"><div class="lbl">Spese ${annoCorrente}</div><div class="val sp num">${fmtEUR(totAnno)}</div>${deltaHTML}</div>
      <div class="cell"><div class="lbl">Media/mese</div><div class="val sa num">${fmtEUR0(totAnno / (new Date().getMonth() + 1))}</div></div>
      <div class="cell"><div class="lbl">Anni tracciati</div><div class="val sa num">${dati.length}</div></div>
    </div>
    <div class="yearchart"><div class="yc-bars">${barsHTML}</div></div>
    <div class="section-lbl"><span>Top categorie ${annoCorrente}</span></div>
    ${righe.map(r => `
      <div class="catrow">
        <div class="icon" data-macro="${escapeHtml(r.chiave)}">${iconaMacro(r.chiave)}</div>
        <div class="body" data-macro="${escapeHtml(r.chiave)}">
          <div class="row1"><span class="name">${escapeHtml(r.chiave)}</span><span class="right"><span class="amt num">${fmtEUR(r.totale)}</span></span></div>
          <div class="bar"><span style="width:${Math.max(3, r.totale / maxCat * 100)}%"></span></div>
        </div>
      </div>`).join('')}
  `;

  body.querySelectorAll('[data-anno]').forEach(el => el.addEventListener('click', () => {
    navigate('spese');   // la home gestisce la vista anno
  }));
  body.querySelectorAll('[data-macro]').forEach(el => el.addEventListener('click', () => navigate('movimenti', { macro: el.dataset.macro })));
};

const _renderTag = (body) => {
  // aggrega le spese per tag
  const perTag = {};
  for (const m of state.movimenti) {
    if (m.tipo !== 'spesa') continue;
    for (const t of (m.tag || [])) {
      perTag[t] = perTag[t] || { tag: t, totale: 0, count: 0 };
      perTag[t].totale += m.imp; perTag[t].count++;
    }
  }
  const righe = Object.values(perTag).sort((a, b) => b.totale - a.totale);

  if (!righe.length) {
    body.innerHTML = `<div class="empty"><div class="big-ic">#️⃣</div>Non hai ancora usato i tag.<br><br>Aggiungi un tag quando inserisci una spesa, oppure applica tag in blocco allo storico dalle Impostazioni. Poi qui vedrai quanto spendi per ogni tag (viaggi, progetti, persone…).</div>`;
    return;
  }
  const max = righe[0].totale;
  body.innerHTML = `
    <div class="section-lbl" style="margin-top:8px"><span>Spese per tag</span></div>
    ${righe.map(r => `
      <div class="catrow">
        <div class="icon">#</div>
        <div class="body" data-tag="${escapeHtml(r.tag)}">
          <div class="row1"><span class="name">${escapeHtml(r.tag)}</span><span class="right"><span class="amt num">${fmtEUR(r.totale)}</span><span class="pct num">${r.count}</span></span></div>
          <div class="bar"><span style="width:${Math.max(3, r.totale / max * 100)}%"></span></div>
        </div>
      </div>`).join('')}
  `;
  body.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => navigate('ricerca', { q: el.dataset.tag })));
};

const _renderInvestimenti = (body) => {
  const dati = investitoPerMese();
  if (!dati.length) { body.innerHTML = '<div class="empty"><div class="big-ic">💠</div>Nessun investimento registrato</div>'; return; }

  // raggruppa per anno per il grafico
  const perAnno = {};
  for (const d of dati) { const a = d.mese.slice(0, 4); perAnno[a] = (perAnno[a] || 0) + d.totale; }
  const anni = Object.entries(perAnno).sort((a, b) => a[0].localeCompare(b[0]));
  const maxAnno = Math.max(...anni.map(([, v]) => v));
  const totale = dati.reduce((s, d) => s + d.totale, 0);

  // ultimi 12 mesi
  const ultimi = dati.slice(-12);
  const maxMese = Math.max(...ultimi.map(d => d.totale));

  body.innerHTML = `
    <div class="net-card" style="margin-top:16px">
      <div class="lbl">Totale investito/accantonato</div>
      <div class="big num">${fmtEUR(totale)}</div>
      <div class="delta" style="color:var(--transfer)">su ${dati.length} mesi con versamenti</div>
    </div>
    <div class="yearchart">
      <div class="yc-bars">${anni.map(([a, v]) => `<div class="yb ${a === String(new Date().getFullYear()) ? 'on' : ''}"><div class="col" style="height:${Math.max(3, v / maxAnno * 100)}%;background:${a === String(new Date().getFullYear()) ? '' : 'var(--surface-3)'}"></div><span>'${a.slice(2)}</span></div>`).join('')}</div>
    </div>
    <div class="section-lbl"><span>Ultimi mesi</span></div>
    ${ultimi.slice().reverse().map(d => {
      const [a, m] = d.mese.split('-');
      return `<div class="catrow"><div class="icon" style="background:rgba(61,182,255,.18)">💠</div><div class="body"><div class="row1"><span class="name">${nomeMese(parseInt(m) - 1)} ${a}</span><span class="amt num" style="color:var(--transfer)">${fmtEUR(d.totale)}</span></div><div class="bar"><span style="width:${Math.max(3, d.totale / maxMese * 100)}%;background:var(--transfer)"></span></div></div></div>`;
    }).join('')}
  `;
};
