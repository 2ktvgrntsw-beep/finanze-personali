// analisi.js — Analisi approfondita.
// Tre modi di guardare, protagonista "una categoria nel tempo":
//  1. Categoria nel tempo (film): scegli una categoria, la segui anno per anno (a barre),
//     con drill nei sotto-livelli. È la vista principale.
//  2. Un anno (fotografia): scegli un anno, vedi tutte le categorie.
//  3. Tag: confronto tra tag (pronto per quando ci saranno).

import { state } from '../core/store.js';
import { fmtEUR, fmtEUR0, escapeHtml, nomeMese, annoDi } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate, buildHash } from '../core/router.js';
import { abilitaSwipeIndietro } from './shared.js';
import { spesePerAnno, aggregaPerLivello, soloSpese } from '../services/movimentiService.js';
import { listaMacro, categoriaHaSub } from '../services/categorieService.js';

let _tab = 'categoria';   // 'categoria' | 'anno' | 'tag'
let _annoSel = String(new Date().getFullYear());
// stato drill per la vista "categoria nel tempo"
let _cMacro = '', _cCat = '', _cSub = '', _cAnno = '';
let _tagSel = new Set();   // tag selezionati per l'analisi incrociata

export const renderAnalisi = async (root, params = {}) => {
  // Il drill di categoria viaggia nell'HASH: così il breadcrumb sta nell'header
  // e lo swipe-back dal bordo di iOS funziona.
  _cMacro = params.macro || '';
  _cCat = params.cat || '';
  _cSub = params.sub || '';
  // senza drill attivo, l'header torna pulito (titolo e back nascosti)
  if (!_cMacro) {
    const vt0 = document.getElementById('view-title');
    const bb0 = document.getElementById('btn-back');
    if (vt0) vt0.style.display = 'none';
    if (bb0) bb0.style.display = 'none';
  }
  // tab Categoria/Anno/Tag NELL'HEADER (come Settimana/Mese/Anno nelle altre pagine)
  const headSeg = document.getElementById('head-seg');
  if (headSeg) {
    headSeg.innerHTML = `<div class="seg">
      <button data-t="categoria" class="${_tab === 'categoria' ? 'on' : ''}">Categoria</button>
      <button data-t="anno" class="${_tab === 'anno' ? 'on' : ''}">Anno</button>
      <button data-t="tag" class="${_tab === 'tag' ? 'on' : ''}">Tag</button>
    </div>`;
    headSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      _tab = b.dataset.t;
      // il cambio tab esce dall'eventuale drill (hash pulito)
      if (_cMacro) { location.hash = buildHash('analisi', {}); return; }
      renderAnalisi(root);
    }));
  }
  root.innerHTML = `<div id="analisi-body"></div>`;
  const body = root.querySelector('#analisi-body');
  if (_tab === 'categoria') _renderCategoriaTempo(body, root);
  else if (_tab === 'anno') _renderAnno(body, root);
  else _renderTag(body, root);
};

// ---- VISTA PROTAGONISTA: una categoria nel tempo ----
const _renderCategoriaTempo = (body, root) => {
  const macros = listaMacro();

  // se non ho ancora scelto una macro, mostro la griglia di scelta
  if (!_cMacro) {
    body.innerHTML = `
      <p class="meta" style="margin:14px 4px">Scegli una categoria e guarda come è cambiata negli anni.</p>
      <div class="cat-grid" style="margin-top:6px">
        ${macros.map(m => `<div class="cat-cell" data-macro="${escapeHtml(m)}"><div class="ci">${iconaMacro(m)}</div><span>${escapeHtml(m)}</span></div>`).join('')}
      </div>`;
    body.querySelectorAll('[data-macro]').forEach(el => el.addEventListener('click', () => { location.hash = buildHash('analisi', { macro: el.dataset.macro }); }));
    return;
  }

  // livello corrente
  const livello = _cSub ? 'movimenti' : _cCat ? 'sub' : 'cat';
  const filtroDesc = [_cMacro, _cCat, _cSub].filter(Boolean).join(' › ');

  // determina il tipo di movimento prevalente per questa macro:
  // così "Entrate" mostra le entrate e "Investimenti" i trasferimenti (non solo le spese).
  const tipiNellaMacro = {};
  for (const m of state.movimenti) {
    if (m.macro !== _cMacro) continue;
    tipiNellaMacro[m.tipo] = (tipiNellaMacro[m.tipo] || 0) + 1;
  }
  const tipoMacro = Object.entries(tipiNellaMacro).sort((a, b) => b[1] - a[1])[0]?.[0] || 'spesa';
  const filtraTipo = (m) => m.tipo === tipoMacro;

  // totale per anno del ramo selezionato
  const perAnno = {};
  for (const m of state.movimenti) {
    if (!filtraTipo(m)) continue;
    if (m.macro !== _cMacro) continue;
    if (_cCat && m.cat !== _cCat) continue;
    if (_cSub && m.sub !== _cSub) continue;
    const a = annoDi(m.data);
    perAnno[a] = (perAnno[a] || 0) + m.imp;
  }
  const anni = Object.keys(perAnno).sort();
  const maxVal = anni.length ? Math.max(...anni.map(a => perAnno[a])) : 1;
  const totale = Object.values(perAnno).reduce((s, v) => s + v, 0);
  const mediaAnnua = anni.length ? totale / anni.length : 0;

  // anno selezionato (default: l'ultimo disponibile). Navigabile con le frecce.
  if (!_cAnno || !anni.includes(_cAnno)) _cAnno = anni.length ? anni[anni.length - 1] : String(new Date().getFullYear());
  const idxAnno = anni.indexOf(_cAnno);
  const prevAnno = idxAnno > 0 ? anni[idxAnno - 1] : null;
  const nextAnno = idxAnno >= 0 && idxAnno < anni.length - 1 ? anni[idxAnno + 1] : null;
  const totaleAnno = perAnno[_cAnno] || 0;
  // etichetta e colore in base al TIPO della macro: le entrate sono verdi,
  // gli investimenti azzurri, le spese rosse. Il delta segue la logica giusta:
  // per le entrate crescere è positivo, per le spese è negativo.
  const lblTipo = tipoMacro === 'entrata' ? 'Entrate' : tipoMacro === 'trasferimento' ? 'Investito' : 'Spesa';
  const clsTipo = tipoMacro === 'entrata' ? 'en' : tipoMacro === 'trasferimento' ? 'tr' : 'sp';
  const colTipo = tipoMacro === 'entrata' ? 'var(--up)' : tipoMacro === 'trasferimento' ? 'var(--transfer)' : 'var(--accent)';
  let deltaAnno = '';
  if (prevAnno && perAnno[prevAnno] > 0) {
    const pct = Math.round((totaleAnno - perAnno[prevAnno]) / perAnno[prevAnno] * 100);
    const buono = tipoMacro === 'spesa' ? pct <= 0 : pct >= 0;
    deltaAnno = `<div class="delta ${buono ? 'better' : 'worse'} num" style="margin-top:3px">${pct > 0 ? '+' : ''}${pct}% vs ${prevAnno}</div>`;
  }

  // sotto-voci per il drill — filtrate sull'ANNO SELEZIONATO (si aggiornano con le frecce)
  let sottoVoci = [];
  if (livello === 'cat') {
    const agg = {};
    for (const m of state.movimenti.filter(m => filtraTipo(m) && m.macro === _cMacro && annoDi(m.data) === _cAnno)) {
      const k = m.cat || '(senza)'; agg[k] = (agg[k] || 0) + m.imp;
    }
    sottoVoci = Object.entries(agg).map(([nome, tot]) => ({ nome, tot })).sort((a, b) => b.tot - a.tot);
  } else if (livello === 'sub') {
    const agg = {};
    for (const m of state.movimenti.filter(m => filtraTipo(m) && m.macro === _cMacro && m.cat === _cCat && annoDi(m.data) === _cAnno)) {
      const k = m.sub || '(senza)'; agg[k] = (agg[k] || 0) + m.imp;
    }
    sottoVoci = Object.entries(agg).map(([nome, tot]) => ({ nome, tot })).sort((a, b) => b.tot - a.tot);
  }
  const maxSotto = sottoVoci.length ? sottoVoci[0].tot : 1;

  // header PULITO (solo i tab centrati): il nome della categoria vive DENTRO
  // la card delle statistiche, col percorso cliccabile per risalire di livello.
  const vt = document.getElementById('view-title');
  const bb = document.getElementById('btn-back');
  if (vt) { vt.style.display = 'none'; vt.onclick = null; }
  if (bb) bb.style.display = 'none';
  const suDiLivello = () => {
    if (_cSub) location.hash = buildHash('analisi', { macro: _cMacro, cat: _cCat });
    else if (_cCat) location.hash = buildHash('analisi', { macro: _cMacro });
    else location.hash = buildHash('analisi', {});
  };

  body.innerHTML = `
    <div class="month-nav" style="margin:8px 0 4px">
      <button class="arr" id="ca-prev" ${prevAnno ? '' : 'disabled'}>‹</button>
      <div class="m">${_cAnno}</div>
      <button class="arr" id="ca-next" ${nextAnno ? '' : 'disabled'}>›</button>
    </div>

    <div class="triple" style="flex-direction:column;padding:0">
      <div class="card-crumb" id="card-crumb">
        <span class="cc-path">‹ ${_cCat ? escapeHtml(_cMacro) + (_cSub ? ' › ' + escapeHtml(_cCat) : '') : 'Analisi'}</span>
        <span class="cc-nome">${escapeHtml(_cSub || _cCat || _cMacro)}</span>
      </div>
      <div style="display:flex;width:100%">
      <div class="cell"><div class="lbl">${lblTipo} ${_cAnno}</div><div class="val ${clsTipo} num">${fmtEUR(totaleAnno)}</div>${deltaAnno}</div>
      <div class="cell"><div class="lbl">Media/anno</div><div class="val sa num">${fmtEUR0(mediaAnnua)}</div></div>
      <div class="cell"><div class="lbl">Totale ${anni.length} anni</div><div class="val sa num">${fmtEUR0(totale)}</div></div>
      </div>
    </div>

    <div class="yearchart">
      <div class="yc-bars">${anni.map(a => `
        <div class="yb ${a === _cAnno ? 'on' : ''}" data-anno-bar="${a}" title="${a}: ${fmtEUR(perAnno[a])}">
          <div class="col" style="height:${Math.max(3, perAnno[a] / maxVal * 100)}%${a === _cAnno && tipoMacro !== 'spesa' ? ';background:' + colTipo : ''}"></div>
          <span>'${a.slice(2)}</span>
        </div>`).join('')}</div>
      <div id="cat-tip" class="meta" style="text-align:center;margin-top:10px;min-height:16px;color:${colTipo};font-weight:600">${_cAnno}: ${fmtEUR(totaleAnno)}</div>
    </div>

    ${sottoVoci.length && livello !== 'movimenti' ? `
      <div class="section-lbl"><span>${livello === 'cat' ? 'Dettaglio' : 'Sottocategorie'} ${_cAnno} (tocca per approfondire)</span></div>
      ${sottoVoci.map(s => `
        <div class="catrow">
          <div class="icon" data-drill="${escapeHtml(s.nome)}">${iconaMacro(_cMacro)}</div>
          <div class="body" data-drill="${escapeHtml(s.nome)}">
            <div class="row1"><span class="name">${escapeHtml(s.nome)}</span><span class="amt num">${fmtEUR(s.tot)}</span></div>
            <div class="bar"><span style="width:${Math.max(3, s.tot / maxSotto * 100)}%"></span></div>
          </div>
          <div class="chev">›</div>
        </div>`).join('')}` : ''}

    <div style="margin-top:18px"><button class="btn btn-secondary" id="vedi-mov">Vedi i movimenti di ${escapeHtml(_cSub || _cCat || _cMacro)} nel ${_cAnno}</button></div>
  `;

  // navigazione anni con le frecce
  const cap = body.querySelector('#ca-prev'), can = body.querySelector('#ca-next');
  const ancora = { macro: _cMacro, cat: _cCat, sub: _cSub };   // conserva il drill nei re-render
  if (cap && prevAnno) cap.addEventListener('click', () => { _cAnno = prevAnno; renderAnalisi(root, ancora); });
  if (can && nextAnno) can.addEventListener('click', () => { _cAnno = nextAnno; renderAnalisi(root, ancora); });

  // percorso nella card: TAP per risalire di livello; SWIPE destro fa lo stesso
  body.querySelector('#card-crumb').addEventListener('click', suDiLivello);
  abilitaSwipeIndietro(body, suDiLivello);
  // tocco barra anno -> seleziona quell'anno
  body.querySelectorAll('[data-anno-bar]').forEach(el => el.addEventListener('click', () => { _cAnno = el.dataset.annoBar; renderAnalisi(root, ancora); }));
  // drill nelle sotto-voci: naviga via hash (cronologia + swipe-back iOS)
  body.querySelectorAll('[data-drill]').forEach(el => el.addEventListener('click', () => {
    const v = el.dataset.drill === '(senza)' ? '' : el.dataset.drill;
    if (livello === 'cat') location.hash = buildHash('analisi', { macro: _cMacro, cat: v });
    else if (livello === 'sub') location.hash = buildHash('analisi', { macro: _cMacro, cat: _cCat, sub: v });
  }));
  // vedi movimenti dell'anno selezionato
  body.querySelector('#vedi-mov').addEventListener('click', () => navigate('movimenti', { macro: _cMacro, cat: _cCat, sub: _cSub, periodo: 'anno', mese: _cAnno + '-01' }));
};

// ---- VISTA: un anno, tutte le categorie ----
const _renderAnno = (body, root) => {
  const dati = spesePerAnno();
  if (!dati.length) { body.innerHTML = '<div class="empty">Nessun dato</div>'; return; }
  const anniDisp = dati.map(d => d.anno);
  if (!anniDisp.includes(_annoSel)) _annoSel = anniDisp[anniDisp.length - 1];
  const idx = anniDisp.indexOf(_annoSel);
  const prev = idx > 0 ? anniDisp[idx - 1] : null;
  const next = idx < anniDisp.length - 1 ? anniDisp[idx + 1] : null;
  const max = Math.max(...dati.map(d => d.totale));

  const movAnno = state.movimenti.filter(m => m.data.startsWith(_annoSel));
  const totAnno = soloSpese(movAnno).reduce((s, m) => s + m.imp, 0);
  const righe = aggregaPerLivello(movAnno, 'macro');
  const maxCat = righe.length ? righe[0].totale : 1;
  const isCorrente = _annoSel === String(new Date().getFullYear());
  const mesiTrascorsi = isCorrente ? (new Date().getMonth() + 1) : 12;

  let deltaHTML = '';
  if (idx > 0) {
    const prec = dati[idx - 1].totale, cur = dati[idx].totale;
    if (prec > 0) { const pct = Math.round((cur - prec) / prec * 100); deltaHTML = `<div class="delta ${pct > 0 ? 'worse' : 'better'} num" style="margin-top:4px">${pct > 0 ? '+' : ''}${pct}% vs ${dati[idx - 1].anno}</div>`; }
  }

  body.innerHTML = `
    <div class="month-nav">
      <button class="arr" id="y-prev" ${prev ? '' : 'disabled'}>‹</button>
      <div class="m">${_annoSel}</div>
      <button class="arr" id="y-next" ${next ? '' : 'disabled'}>›</button>
    </div>
    <div class="triple">
      <div class="cell"><div class="lbl">Spese ${_annoSel}</div><div class="val sp num">${fmtEUR(totAnno)}</div>${deltaHTML}</div>
      <div class="cell"><div class="lbl">Media/mese</div><div class="val sa num">${fmtEUR0(totAnno / mesiTrascorsi)}</div></div>
      <div class="cell"><div class="lbl">Movimenti</div><div class="val sa num">${soloSpese(movAnno).length}</div></div>
    </div>
    <div class="yearchart"><div class="yc-bars">${dati.map(d => `
      <div class="yb ${d.anno === _annoSel ? 'on' : ''}" data-anno="${d.anno}"><div class="col" style="height:${Math.max(3, d.totale / max * 100)}%"></div><span>'${d.anno.slice(2)}</span></div>`).join('')}</div></div>
    <div class="section-lbl"><span>Categorie ${_annoSel}</span></div>
    ${righe.map(r => `
      <div class="catrow">
        <div class="icon" data-href="${buildHash('movimenti', { macro: r.chiave, periodo: 'anno', mese: _annoSel + '-01' })}">${iconaMacro(r.chiave)}</div>
        <div class="body" data-href="${buildHash('drill', { macro: r.chiave, periodo: 'anno', mese: _annoSel + '-01' })}">
          <div class="row1"><span class="name">${escapeHtml(r.chiave)}</span><span class="amt num">${fmtEUR(r.totale)}</span></div>
          <div class="bar"><span style="width:${Math.max(3, r.totale / maxCat * 100)}%"></span></div>
        </div>
        <div class="chev" data-href="${buildHash('drill', { macro: r.chiave, periodo: 'anno', mese: _annoSel + '-01' })}">›</div>
      </div>`).join('')}
  `;
  const p = body.querySelector('#y-prev'), n = body.querySelector('#y-next');
  if (p && prev) p.addEventListener('click', () => { _annoSel = prev; renderAnalisi(root); });
  if (n && next) n.addEventListener('click', () => { _annoSel = next; renderAnalisi(root); });
  body.querySelectorAll('[data-anno]').forEach(el => el.addEventListener('click', () => { _annoSel = el.dataset.anno; renderAnalisi(root); }));
  body.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); location.hash = el.dataset.href; }));
};

// ---- VISTA: tag ----
const _renderTag = (body, root) => {
  // ANALISI PER TAG POTENZIATA: selezioni uno o PIÙ tag (incrocio in AND) e vedi
  // totale, andamento per anno, spaccato per categoria e i movimenti del set.
  // I tag attraversano le categorie: aggregano quello che le categorie separano.
  const perTag = {};
  for (const m of state.movimenti) {
    for (const t of (m.tag || [])) { perTag[t] = perTag[t] || { tag: t, count: 0 }; perTag[t].count++; }
  }
  const tuttiTag = Object.values(perTag).sort((a, b) => b.count - a.count);
  if (!tuttiTag.length) { body.innerHTML = `<div class="empty"><div class="big-ic">#️⃣</div>Non hai ancora usato i tag.<br><br>Aggiungi un tag quando inserisci una spesa (anche più di uno, separati da virgola), o applica tag in blocco dalla Ricerca. Poi qui potrai incrociarli: viaggi, progetti, persone…</div>`; return; }

  // rimuovi dalla selezione eventuali tag scomparsi
  for (const t of [..._tagSel]) if (!perTag[t]) _tagSel.delete(t);

  // movimenti del set: TUTTI i tag selezionati presenti (AND)
  const sel = [..._tagSel];
  const movSet = sel.length ? state.movimenti.filter(m => sel.every(t => (m.tag || []).includes(t))) : [];
  const spese = movSet.filter(m => m.tipo === 'spesa');
  const totSpese = spese.reduce((s, m) => s + m.imp, 0);

  let dettaglio = '';
  if (sel.length) {
    // per anno
    const perAnno = {};
    for (const m of spese) { const a = m.data.slice(0, 4); perAnno[a] = (perAnno[a] || 0) + m.imp; }
    const anni = Object.keys(perAnno).sort();
    const maxA = anni.length ? Math.max(...anni.map(a => perAnno[a])) : 1;
    // per categoria
    const perMacro = {};
    for (const m of spese) { const k = m.macro || '(senza)'; perMacro[k] = (perMacro[k] || 0) + m.imp; }
    const cats = Object.entries(perMacro).sort((a, b) => b[1] - a[1]);
    const maxC = cats.length ? cats[0][1] : 1;

    dettaglio = `
      <div class="triple">
        <div class="cell"><div class="lbl">Spese ${sel.length > 1 ? 'incrociate' : ''}</div><div class="val sp num">${fmtEUR(totSpese)}</div></div>
        <div class="cell"><div class="lbl">Movimenti</div><div class="val sa num">${movSet.length}</div></div>
        <div class="cell"><div class="lbl">Anni</div><div class="val sa num">${anni.length}</div></div>
      </div>
      ${anni.length > 1 ? `<div class="yearchart"><div class="yc-bars">${anni.map(a => `
        <div class="yb"><div class="col" style="height:${Math.max(3, perAnno[a] / maxA * 100)}%"></div><span>'${a.slice(2)}</span></div>`).join('')}</div></div>` : ''}
      <div class="section-lbl"><span>Per categoria</span></div>
      ${cats.map(([nome, tot]) => `
        <div class="catrow"><div class="icon">${iconaMacro(nome)}</div>
          <div class="body"><div class="row1"><span class="name">${escapeHtml(nome)}</span><span class="amt num">${fmtEUR(tot)}</span></div>
          <div class="bar"><span style="width:${Math.max(3, tot / maxC * 100)}%"></span></div></div>
        </div>`).join('')}
      <div class="section-lbl"><span>Movimenti (${movSet.length})</span></div>
      ${movSet.slice(0, 40).map(m => `
        <div class="mov" style="cursor:default"><div class="ic">${iconaMacro(m.macro || '')}</div>
          <div class="body"><div class="d1">${escapeHtml(m.desc || m.macro)}</div><div class="d2">${m.data.split('-').reverse().join('/')} · ${escapeHtml(m.macro || '')}</div></div>
          <div class="amt ${m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr'} num">${m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ '}${fmtEUR(m.imp)}</div>
        </div>`).join('')}
      ${movSet.length > 40 ? `<p class="meta" style="text-align:center">…e altri ${movSet.length - 40}</p>` : ''}`;
  }

  body.innerHTML = `
    <p class="meta" style="margin:10px 4px 8px">Tocca uno o più tag per incrociarli: vedrai solo i movimenti che li hanno <b>tutti</b>.</p>
    <div class="chip-row" style="flex-wrap:wrap;margin-bottom:6px">
      ${tuttiTag.map(t => `<div class="chip ${_tagSel.has(t.tag) ? 'on' : ''}" data-tsel="${escapeHtml(t.tag)}">#${escapeHtml(t.tag)} <span style="opacity:.6">${t.count}</span></div>`).join('')}
    </div>
    ${sel.length ? `<div style="text-align:right;margin-bottom:4px"><span class="meta" id="tag-reset" style="color:var(--down);cursor:pointer">✕ azzera selezione</span></div>` : ''}
    ${dettaglio || '<div class="empty" style="padding:30px 20px">Seleziona un tag per vedere l\'analisi</div>'}
  `;

  body.querySelectorAll('[data-tsel]').forEach(el => el.addEventListener('click', () => {
    const t = el.dataset.tsel;
    if (_tagSel.has(t)) _tagSel.delete(t); else _tagSel.add(t);
    renderAnalisi(root);
  }));
  const tr = body.querySelector('#tag-reset');
  if (tr) tr.addEventListener('click', () => { _tagSel.clear(); renderAnalisi(root); });
};

