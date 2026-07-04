// patrimonio.js — Vista Patrimonio: netto, composizione, conti, debiti.
// Stessa grammatica a barre della home, ma le barre pesano sul patrimonio.
// I valori (casa, saldi conti) si modificano toccandoli direttamente (no icone matita).

import { state } from '../core/store.js';
import { fmtEUR, fmtEUR0, escapeHtml, todayISO } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { saldoStimato, saveConto, LABEL_TIPO } from '../services/contiService.js';
import {
  totaleAttivita, totalePassivita, patrimonioNetto,
  salvaSnapshotMese, snapshotMeseMancante, serieStoricoPatrimonio,
} from '../services/patrimonioService.js';
import { statoPrestito } from '../services/prestitiService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

const ICONA_TIPO_ATT = { asset: '🏠', investimenti: '💠', risparmio: '💰', liquidita: '💳' };
const COLORE_ICONA = {
  asset: 'rgba(110,91,255,.18)', investimenti: 'rgba(61,182,255,.18)',
  risparmio: 'rgba(47,208,138,.16)', liquidita: 'var(--surface-2)',
};

// stato dei gruppi conti aperti (default: tutti chiusi per compattezza)
const _gruppiAperti = new Set();

export const renderPatrimonio = async (root) => {
  const netto = patrimonioNetto();
  const att = totaleAttivita();
  const pass = totalePassivita();

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
      <div class="sub">
        <div><span class="lbl2">Attività</span><b class="num">${fmtEUR(att)}</b></div>
        <div><span class="lbl2">Passività</span><b class="neg num">${pass > 0 ? '−' : ''}${fmtEUR(pass)}</b></div>
      </div>
    </div>

    ${_contiCollassabiliHTML()}

    ${_graficoLineaHTML()}
    ${snapshotMeseMancante() ? '<div style="text-align:center;margin:10px 0"><button class="btn btn-secondary" id="snap" style="width:auto;display:inline-flex;padding:9px 16px;font-size:13px">📸 Salva rilevazione di oggi</button></div>' : ''}

    ${debiti.length ? `
      <div class="section-lbl"><span>Debiti</span></div>
      ${debiti.map(x => `
        <div class="patrow">
          <div class="icon" style="background:rgba(255,107,94,.15)">${x.icona}</div>
          <div class="body" data-debito="${escapeHtml(x.nome)}">
            <div class="row1"><span class="name">${escapeHtml(x.nome)}</span><span class="amt neg num">−${fmtEUR(x.residuo)}</span></div>
            <div class="bar red"><span style="width:${Math.max(1.5, x.residuo / maxDeb * 100)}%"></span></div>
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

  // gruppi conti collassabili
  root.querySelectorAll('[data-gruppo]').forEach(el => el.addEventListener('click', () => {
    const tipo = el.dataset.gruppo;
    if (_gruppiAperti.has(tipo)) _gruppiAperti.delete(tipo); else _gruppiAperti.add(tipo);
    renderPatrimonio(root);
  }));
  // tap su singolo conto -> modifica
  root.querySelectorAll('[data-conto]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); _modificaConto(root, el.dataset.conto); }));

  // tap su strumento di investimento -> movimenti di quello strumento
  root.querySelectorAll('[data-strumento]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); navigate('movimenti', { tipo: 'trasferimento', sub: el.dataset.strumento, periodo: 'anno', mese: new Date().toISOString().slice(0, 7) }); }));

  // riordino conti
  const rio = root.querySelector('#riordina-conti');
  if (rio) rio.addEventListener('click', () => _riordinaConti(root));

  // tap su tipo attività -> dettaglio conti di quel tipo
  root.querySelectorAll('[data-tipo]').forEach(el => el.addEventListener('click', () => navigate('conti', { tipo: el.dataset.tipo })));

  // navigazione sezioni
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.go)));

  // tocco sui punti del grafico patrimonio -> mostra la cifra
  const tip = root.querySelector('#pat-tip');
  root.querySelectorAll('.pt-dot').forEach(dot => {
    const mostra = () => { if (tip) tip.textContent = dot.dataset.info; };
    dot.addEventListener('click', mostra);
    dot.addEventListener('touchstart', mostra, { passive: true });
    dot.addEventListener('mouseenter', mostra);
  });
};

// Riordino conti col TRASCINAMENTO: tieni premuto sul ≡ e sposta la riga.
// Al rilascio la riga si sistema; "Fatto" salva l'ordine reale delle righe.
const _riordinaConti = (root) => {
  const conti = state.conti.filter(c => c.attivo !== false)
    .slice().sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));

  apriSheet('Riordina conti', '', (body, chiudi) => {
    body.innerHTML = `
      <p class="meta" style="margin-bottom:12px">Tieni premuto su ≡ e trascina per riordinare.</p>
      <div id="rio-lista">${conti.map(c => `
        <div class="rio-riga" data-id="${c.id}">
          <div class="ic">${ICONA_TIPO_ATT[c.tipo] || '💳'}</div>
          <div class="body"><div class="d1">${escapeHtml(c.nome)}</div><div class="d2">${LABEL_TIPO[c.tipo] || c.tipo}</div></div>
          <div class="rio-handle">≡</div>
        </div>`).join('')}</div>
      <button class="btn btn-primary" id="rio-ok" style="margin-top:16px">Fatto</button>`;

    const lista = body.querySelector('#rio-lista');
    let dragging = null;

    lista.querySelectorAll('.rio-handle').forEach(h => {
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = h.closest('.rio-riga');
        dragging.classList.add('dragging');
        h.setPointerCapture(e.pointerId);
      });
      h.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        e.preventDefault();
        // trova la riga sotto il dito e sposta la riga trascinata prima/dopo
        const righe = [...lista.querySelectorAll('.rio-riga:not(.dragging)')];
        const sotto = righe.find(r => {
          const b = r.getBoundingClientRect();
          return e.clientY >= b.top && e.clientY <= b.bottom;
        });
        if (sotto) {
          const b = sotto.getBoundingClientRect();
          if (e.clientY < b.top + b.height / 2) lista.insertBefore(dragging, sotto);
          else lista.insertBefore(dragging, sotto.nextSibling);
        }
      });
      const fine = () => { if (dragging) { dragging.classList.remove('dragging'); dragging = null; } };
      h.addEventListener('pointerup', fine);
      h.addEventListener('pointercancel', fine);
    });

    body.querySelector('#rio-ok').addEventListener('click', async () => {
      // l'ordine è quello REALE delle righe nel DOM al momento del tocco
      const ids = [...lista.querySelectorAll('.rio-riga')].map(el => el.dataset.id);
      for (let i = 0; i < ids.length; i++) {
        const c = state.conti.find(x => x.id === ids[i]);
        if (c) await saveConto({ ...c, ordine: i });
      }
      chiudi(); toast('Ordine salvato'); renderPatrimonio(root);
    });
  });
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
    ${!isAsset ? `<label class="meta">Data del saldo</label><input type="date" id="c-data" value="${c.data_saldo}" class="sheet-input">` : ''}
    ${isAsset ? `<label class="meta">Posseduto dal</label><input type="date" id="c-possesso" value="${c.possessoData || c.data_saldo || ''}" class="sheet-input"><p class="meta" style="font-size:11px;margin-bottom:8px">Da questa data il bene compare nel grafico dell'andamento patrimonio.</p>` : ''}
    <button class="btn btn-primary" id="c-ok" style="margin-top:16px">Salva</button>
  `, (body, chiudi) => {
    body.querySelector('#c-ok').addEventListener('click', async () => {
      const nuovo = parseFloat(body.querySelector('#c-saldo').value) || 0;
      const nuovaData = body.querySelector('#c-data') ? body.querySelector('#c-data').value : c.data_saldo;
      const possesso = body.querySelector('#c-possesso') ? body.querySelector('#c-possesso').value : c.possessoData;
      await saveConto({ ...c, saldo_iniziale: nuovo, data_saldo: nuovaData, possessoData: possesso });
      chiudi(); toast('Aggiornato'); renderPatrimonio(root);
    });
  });
};

// Sezione conti collassabile per tipo. Nel gruppo Investimenti mostra anche gli
// strumenti (PAC, Crypto, Azioni sciolte) ricavati dai trasferimenti. I conti sono
// riordinabili (campo 'ordine').
function _contiCollassabiliHTML() {
  const perTipo = contiPerTipoLocale();
  const ordine = ['liquidita', 'risparmio', 'investimenti', 'asset'];
  const LABEL = { liquidita: 'Liquidità', risparmio: 'Risparmio', investimenti: 'Investimenti', asset: 'Beni / Asset' };
  let html = '<div class="section-lbl"><span>I tuoi conti</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="riordina-conti">Riordina</span></div>';
  for (const tipo of ordine) {
    let conti = perTipo[tipo] || [];
    if (!conti.length) continue;
    // ordina per campo 'ordine' (se impostato), altrimenti lascia l'ordine naturale
    conti = conti.slice().sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));
    const tot = conti.reduce((s, c) => s + saldoStimato(c), 0);
    const aperto = _gruppiAperti.has(tipo);

    // per gli investimenti: strumenti dai trasferimenti (sub), incluse le azioni sciolte
    let strumentiHTML = '';
    if (tipo === 'investimenti' && aperto) {
      const perStrumento = {};
      for (const m of state.movimenti) {
        if (m.tipo !== 'trasferimento') continue;
        const dest = state.conti.find(c => c.nome === m.contoDest);
        const isInv = dest ? dest.tipo === 'investimenti' : m.macro === 'Investimenti';
        if (!isInv) continue;
        const k = m.sub || 'Altro';
        perStrumento[k] = (perStrumento[k] || 0) + m.imp;
      }
      const strumenti = Object.entries(perStrumento).sort((a, b) => b[1] - a[1]);
      if (strumenti.length) {
        strumentiHTML = `<div class="strumenti-sub"><div class="strumenti-lbl">Strumenti (versato)</div>` +
          strumenti.map(([nome, tot]) => `
            <div class="conto-riga" data-strumento="${escapeHtml(nome)}">
              <div class="conto-nome" style="font-size:13.5px;color:var(--txt-2)">📈 ${escapeHtml(nome)}</div>
              <div class="conto-saldo num" style="color:var(--transfer)">${fmtEUR(tot)}</div>
              <div class="conto-chev">›</div>
            </div>`).join('') + `</div>`;
      }
    }

    html += `
      <div class="gruppo-conti">
        <div class="gruppo-head" data-gruppo="${tipo}">
          <div class="gruppo-ic" style="background:${COLORE_ICONA[tipo]}">${ICONA_TIPO_ATT[tipo]}</div>
          <div class="gruppo-nome">${LABEL[tipo]} <span class="meta">· ${conti.length}</span></div>
          <div class="gruppo-tot num">${fmtEUR(tot)}</div>
          <div class="gruppo-chev">${aperto ? '⌄' : '›'}</div>
        </div>
        ${aperto ? conti.map(c => `
          <div class="conto-riga" data-conto="${c.id}">
            <div class="conto-nome">${escapeHtml(c.nome)}</div>
            <div class="conto-saldo num">${fmtEUR(saldoStimato(c))}</div>
            <div class="conto-chev">›</div>
          </div>`).join('') : ''}
        ${strumentiHTML}
      </div>`;
  }
  return html;
}

// helper locale (evita import circolari)
function contiPerTipoLocale() {
  const out = {};
  for (const c of state.conti) if (c.attivo !== false) (out[c.tipo] = out[c.tipo] || []).push(c);
  return out;
}

// Grafico a linea del patrimonio: assi €, stima (tratteggiata) + reale (piena), tocco per cifra.
function _graficoLineaHTML() {
  const { punti, primoReale } = serieStoricoPatrimonio();
  if (punti.length < 2) return '';

  let p = punti;
  if (p.length > 24) { const step = Math.ceil(p.length / 24); p = p.filter((_, i) => i % step === 0 || i === punti.length - 1); }

  const W = 320, H = 100, padL = 4, padR = 4, padT = 8, padB = 8;
  const vals = p.map(x => x.valore);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const x = (i) => padL + (i / (p.length - 1)) * (W - padL - padR);
  const y = (v) => H - padB - ((v - min) / range) * (H - padT - padB);

  let dStima = '', dReale = '';
  p.forEach((pt, i) => {
    const cmd = `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pt.valore).toFixed(1)}`;
    if (pt.stima) dStima += cmd + ' ';
    else dReale += (dReale ? 'L' : 'M') + `${x(i).toFixed(1)},${y(pt.valore).toFixed(1)} `;
  });
  const idxPrimoReale = p.findIndex(pt => !pt.stima);
  if (idxPrimoReale > 0) dStima += `L${x(idxPrimoReale).toFixed(1)},${y(p[idxPrimoReale].valore).toFixed(1)} `;

  const primoLabel = p[0].annomese.split('-').reverse().join('/');
  const ultimoLabel = p[p.length - 1].annomese.split('-').reverse().join('/');
  const haReale = idxPrimoReale >= 0;

  // riferimenti € sull'asse (max e min)
  const fmtK = (v) => Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k€' : Math.round(v) + '€';

  // punti tappabili (cerchi invisibili con titolo)
  const dots = p.map((pt, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(pt.valore).toFixed(1)}" r="8" fill="transparent" class="pt-dot" data-info="${pt.annomese.split('-').reverse().join('/')}: ${fmtEUR(pt.valore)}${pt.stima ? ' (stima)' : ''}"/>`).join('');

  return `
    <div class="section-lbl"><span>Andamento patrimonio</span></div>
    <div class="card" style="padding:16px 14px">
      <div style="display:flex">
        <div style="display:flex;flex-direction:column;justify-content:space-between;font-size:9px;color:var(--txt-3);padding:8px 6px 8px 0;text-align:right">
          <span>${fmtK(max)}</span><span>${fmtK((max + min) / 2)}</span><span>${fmtK(min)}</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" id="pat-svg">
          <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="var(--line)" stroke-width="0.5"/>
          <line x1="${padL}" y1="${H / 2}" x2="${W - padR}" y2="${H / 2}" stroke="var(--line)" stroke-width="0.5"/>
          <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--line)" stroke-width="0.5"/>
          <path d="${dStima}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3" opacity="0.55"/>
          ${haReale ? `<path d="${dReale}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>` : ''}
          ${dots}
        </svg>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;padding-left:28px"><span class="meta">${primoLabel}</span><span class="meta">${ultimoLabel}</span></div>
      <div id="pat-tip" class="meta" style="text-align:center;margin-top:8px;min-height:16px;color:var(--accent);font-weight:600"></div>
      <div style="display:flex;gap:16px;margin-top:6px;font-size:11px;color:var(--txt-2)">
        <span>┈ stima</span>
        ${haReale ? '<span>━ rilevazioni reali</span>' : '<span style="opacity:.6">tocca un punto per la cifra · le rilevazioni reali si aggiungono salvando il patrimonio</span>'}
      </div>
    </div>`;
}
