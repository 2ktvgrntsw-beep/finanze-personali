// patrimonio.js — Vista Patrimonio: netto, composizione, conti, debiti.
// Stessa grammatica a barre della home, ma le barre pesano sul patrimonio.
// I valori (casa, saldi conti) si modificano toccandoli direttamente (no icone matita).

import { state } from '../core/store.js';
import { dbGet, dbAdd } from '../core/db.js';
import { fmtEUR, fmtEUR0, escapeHtml, todayISO } from '../core/utils.js';
import { iconaMacro, UI_SVG } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { saldoStimato, saveConto, LABEL_TIPO } from '../services/contiService.js';
import {
  totaleAttivita, totalePassivita, patrimonioNetto,
  salvaSnapshotMese, snapshotMeseMancante, serieStoricoPatrimonio,
} from '../services/patrimonioService.js';
import { statoPrestito } from '../services/prestitiService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

const ICONA_TIPO_ATT = { asset: UI_SVG.casa || iconaMacro('Casa'), investimenti: UI_SVG.investimento, risparmio: UI_SVG.risparmio, liquidita: UI_SVG.conto };
const COLORE_ICONA = {
  asset: 'rgba(110,91,255,.18)', investimenti: 'rgba(61,182,255,.18)',
  risparmio: 'rgba(47,208,138,.16)', liquidita: 'var(--surface-2)',
};

// stato dei gruppi conti aperti (default: tutti chiusi per compattezza)
const _gruppiAperti = new Set();
// ordine dei 4 gruppi patrimoniali (persistito in meta); default sotto
const ORDINE_DEFAULT = ['liquidita', 'risparmio', 'investimenti', 'asset'];
let _ordineGruppi = ORDINE_DEFAULT.slice();
const CHIAVE_ORDINE = 'ordine_gruppi_patrimonio';

export const renderPatrimonio = async (root) => {
  // carico l'ordine gruppi salvato (una volta)
  try {
    const rec = await dbGet('meta', CHIAVE_ORDINE);
    if (rec && Array.isArray(rec.valore) && rec.valore.length === 4) _ordineGruppi = rec.valore;
  } catch { /* default */ }
  const netto = patrimonioNetto();
  const att = totaleAttivita();
  const pass = totalePassivita();

  // conti per lo strip orizzontale
  const contiAttivi = state.conti.filter(c => c.attivo !== false);

  // debiti (mutuo + finanziamenti)
  const debiti = [];
  if (state.mutuo) {
    const s = statoPrestito(state.mutuo, state.eventiMutuo);
    if (s) debiti.push({ nome: state.mutuo.nome || 'Mutuo', residuo: s.residuo * (state.mutuo.quota_utente || 100) / 100, icona: UI_SVG.casa || iconaMacro('Casa'), max: state.mutuo.importo_iniziale });
  }
  for (const f of state.finanziamenti) {
    if (f.attivo === false) continue;
    const s = statoPrestito(f, []);
    if (s) debiti.push({ nome: f.nome, residuo: s.residuo * (f.quota_utente || 100) / 100, icona: UI_SVG.excel, max: f.importo_iniziale });
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
  root.querySelectorAll('[data-conto]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const c = state.conti.find(x => x.id === el.dataset.conto);
    // conti di investimento -> pagina dettaglio con grafico; altri -> modifica saldo
    if (c && c.tipo === 'investimenti') navigate('dettaglio-investimento', { conto: c.nome });
    else _modificaConto(root, el.dataset.conto);
  }));

  // tap su strumento di investimento -> pagina dettaglio con grafico andamento
  root.querySelectorAll('[data-strumento]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); navigate('dettaglio-investimento', { strumento: el.dataset.strumento }); }));

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

// Riordino dei 4 GRUPPI patrimoniali (liquidità, risparmio, investimenti, asset).
// Frecce su/giù: affidabili su mobile, salvate in meta.
const _riordinaConti = (root) => {
  const NOMI = { liquidita: 'Liquidità', risparmio: 'Risparmio', investimenti: 'Investimenti', asset: 'Beni / Asset' };
  let ordine = _ordineGruppi.slice();

  apriSheet('Riordina gruppi', '', (body, chiudi) => {
    const disegna = () => {
      body.innerHTML = `
        <p class="meta" style="margin-bottom:12px">Usa le frecce per cambiare l'ordine dei gruppi in Patrimonio.</p>
        <div id="rio-lista">${ordine.map((tipo, i) => `
          <div class="rio-riga">
            <div class="ic">${ICONA_TIPO_ATT[tipo] || UI_SVG.conto}</div>
            <div class="body"><div class="d1">${NOMI[tipo]}</div></div>
            <div class="rio-frecce">
              <button class="rio-su" data-i="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
              <button class="rio-giu" data-i="${i}" ${i === ordine.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
          </div>`).join('')}</div>
        <button class="btn btn-primary" id="rio-ok" style="margin-top:16px">Fatto</button>`;

      body.querySelectorAll('.rio-su').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.i; if (i > 0) { [ordine[i - 1], ordine[i]] = [ordine[i], ordine[i - 1]]; disegna(); }
      }));
      body.querySelectorAll('.rio-giu').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.i; if (i < ordine.length - 1) { [ordine[i + 1], ordine[i]] = [ordine[i], ordine[i + 1]]; disegna(); }
      }));
      body.querySelector('#rio-ok').addEventListener('click', async () => {
        _ordineGruppi = ordine.slice();
        try { await dbAdd('meta', { chiave: CHIAVE_ORDINE, valore: _ordineGruppi }); } catch { /* ignore */ }
        chiudi(); toast('Ordine salvato'); renderPatrimonio(root);
      });
    };
    disegna();
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
  const ordine = _ordineGruppi;
  const LABEL = { liquidita: 'Liquidità', risparmio: 'Risparmio', investimenti: 'Investimenti', asset: 'Beni / Asset' };
  let html = '<div class="section-lbl"><span>I tuoi conti</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="riordina-conti">Riordina</span></div>';
  for (const tipo of ordine) {
    let conti = perTipo[tipo] || [];
    if (!conti.length) continue;
    // ordina per campo 'ordine' (se impostato), altrimenti lascia l'ordine naturale
    conti = conti.slice().sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));
    const tot = conti.reduce((s, c) => s + saldoStimato(c), 0);
    const aperto = _gruppiAperti.has(tipo);

    // per gli investimenti: strumenti annidati SOTTO il conto di riferimento.
    // I dati storici non hanno contoDest popolato, quindi inferiamo il conto dal
    // sub/cat/descrizione (es. "PAC Fideuram" -> Fideuram, "Crypto" -> Binance).
    let strumentiPerConto = {};
    if (tipo === 'investimenti' && aperto) {
      const nomiConti = conti.map(c => c.nome);
      const inferisciConto = (m) => {
        const testo = `${m.sub || ''} ${m.cat || ''} ${m.desc || ''}`.toLowerCase();
        // match diretto col nome di un conto (o una sua parola chiave)
        for (const nome of nomiConti) {
          const chiave = nome.replace(/investimenti/i, '').trim().toLowerCase();
          if (chiave && testo.includes(chiave)) return nome;
        }
        // crypto -> Binance se esiste
        if (/crypto|binance|bitcoin|btc/.test(testo)) {
          const binance = nomiConti.find(n => /binance/i.test(n));
          if (binance) return binance;
        }
        return null;
      };
      for (const m of state.movimenti) {
        if (m.tipo !== 'trasferimento') continue;
        const isInv = m.macro === 'Investimenti' || (state.conti.find(c => c.nome === m.contoDest)?.tipo === 'investimenti');
        if (!isInv) continue;
        const conto = (m.contoDest && nomiConti.includes(m.contoDest)) ? m.contoDest : inferisciConto(m);
        if (!conto) continue;  // non attribuibile: lo salto (evita "Altro" rumoroso)
        const strum = m.sub || m.cat || m.desc || conto;
        strumentiPerConto[conto] = strumentiPerConto[conto] || {};
        strumentiPerConto[conto][strum] = (strumentiPerConto[conto][strum] || 0) + m.imp;
      }
    }
    const strumentiDi = (contoNome) => {
      const s = strumentiPerConto[contoNome];
      if (!s) return '';
      const lista = Object.entries(s).sort((a, b) => b[1] - a[1]);
      if (!lista.length) return '';
      return `<div class="strumenti-annidati">` + lista.map(([nome, v]) => `
        <div class="conto-riga strumento-riga" data-strumento="${escapeHtml(nome)}">
          <div class="conto-nome">${escapeHtml(nome)}</div>
          <div class="conto-saldo num">${fmtEUR(v)}</div>
          <div class="conto-chev">›</div>
        </div>`).join('') + `</div>`;
    };

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
          </div>
          ${tipo === 'investimenti' ? strumentiDi(c.nome) : ''}`).join('') : ''}
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

  // area sfumata sotto la linea completa (stima+reale), stile sparkline home
  let dArea = '';
  p.forEach((pt, i) => { dArea += (i === 0 ? 'M' : 'L') + `${x(i).toFixed(1)},${y(pt.valore).toFixed(1)} `; });
  dArea += `L${x(p.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;

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
          <defs>
            <linearGradient id="patline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2E9BFF"/><stop offset="1" stop-color="#22E39A"/></linearGradient>
            <linearGradient id="patarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(46,155,255,.26)"/><stop offset="1" stop-color="rgba(46,155,255,0)"/></linearGradient>
          </defs>
          <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="var(--line)" stroke-width="0.5"/>
          <line x1="${padL}" y1="${H / 2}" x2="${W - padR}" y2="${H / 2}" stroke="var(--line)" stroke-width="0.5"/>
          <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--line)" stroke-width="0.5"/>
          <path d="${dArea}" fill="url(#patarea)"/>
          <path d="${dStima}" fill="none" stroke="url(#patline)" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
          ${haReale ? `<path d="${dReale}" fill="none" stroke="url(#patline)" stroke-width="2.5"/>` : ''}
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
