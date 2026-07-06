// patrimonio.js — Vista Patrimonio: netto, composizione, conti, debiti.
// Stessa grammatica a barre della home, ma le barre pesano sul patrimonio.
// I valori (casa, saldi conti) si modificano toccandoli direttamente (no icone matita).

import { state } from '../core/store.js';
import { dbGet, dbAdd } from '../core/db.js';
import { fmtEUR, fmtEUR0, escapeHtml, todayISO, nomeMese } from '../core/utils.js';
import { iconaMacro, UI_SVG } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { saldoStimato, saveConto, LABEL_TIPO } from '../services/contiService.js';
import {
  totaleAttivita, totalePassivita, patrimonioNetto, composizioneAttivita,
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
const _contiEspansi = new Set();   // conti investimento con strumenti annidati aperti
let _graficoPatAperto = false;     // grafico andamento: nascosto di default, apribile da icona
let _filtroPatAperto = false;      // finestrella filtro categorie del totale
const _tipiEsclusi = new Set();    // tipi esclusi dal totale/grafico (es. 'asset' per togliere la casa)
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
  const esclusi = [..._tipiEsclusi];
  const netto = patrimonioNetto(esclusi);
  const att = totaleAttivita(esclusi);
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

  const NOMI_TIPO = { liquidita: 'Liquidità', risparmio: 'Risparmio', investimenti: 'Investimenti', asset: 'Beni / Asset' };
  const tipiDisponibili = composizioneAttivita().map(r => r.tipo);
  const filtroAttivo = _tipiEsclusi.size > 0;

  root.innerHTML = `
    <div class="net-card">
      <div class="net-icons">
        <button class="net-ic ${filtroAttivo ? 'on' : ''}" id="filtro-pat" aria-label="Filtra categorie" title="Filtra">
          <svg viewBox="0 0 24 24"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>
        </button>
        <button class="net-ic ${_graficoPatAperto ? 'on' : ''}" id="grafico-pat" aria-label="Andamento" title="Andamento">
          <svg viewBox="0 0 24 24"><path d="M4 18l5-6 4 4 6-8"/><path d="M3 21h18"/></svg>
        </button>
      </div>
      <div class="lbl">Patrimonio netto${filtroAttivo ? ' · filtrato' : ''}</div>
      <div class="big num">${fmtEUR(netto)}</div>
      <div class="sub">
        <div><span class="lbl2">Attività</span><b class="num">${fmtEUR(att)}</b></div>
        <div><span class="lbl2">Passività</span><b class="neg num">${pass > 0 ? '−' : ''}${fmtEUR(pass)}</b></div>
      </div>
      <div class="net-filtro ${_filtroPatAperto ? 'open' : ''}" id="net-filtro">
        <div class="net-filtro-tit">Includi nel totale</div>
        ${tipiDisponibili.map(t => `
          <label class="net-filtro-riga">
            <span>${NOMI_TIPO[t] || t}</span>
            <input type="checkbox" data-tipo-filtro="${t}" ${_tipiEsclusi.has(t) ? '' : 'checked'}>
          </label>`).join('')}
      </div>
    </div>

    <div class="grafico-pat-wrap ${_graficoPatAperto ? 'open' : ''}" id="grafico-pat-wrap">
      ${_graficoLineaHTML(esclusi)}
    </div>

    ${_contiCollassabiliHTML()}

    ${snapshotMeseMancante() && !filtroAttivo ? '<div style="text-align:center;margin:10px 0"><button class="btn btn-secondary" id="snap" style="width:auto;display:inline-flex;padding:9px 16px;font-size:13px">📸 Salva rilevazione di oggi</button></div>' : ''}

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
    // conto investimento CON strumenti -> espande/collassa l'annidamento
    if (el.dataset.espandi) {
      if (_contiEspansi.has(el.dataset.espandi)) _contiEspansi.delete(el.dataset.espandi);
      else _contiEspansi.add(el.dataset.espandi);
      renderPatrimonio(root);
      return;
    }
    // conto investimento SENZA strumenti annidati -> dettaglio con grafico; altri -> modifica saldo
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

  // toggle grafico andamento patrimonio (icona nella net-card)
  const gBtn = root.querySelector('#grafico-pat');
  const gWrap = root.querySelector('#grafico-pat-wrap');
  if (gBtn && gWrap) gBtn.addEventListener('click', () => {
    _graficoPatAperto = !_graficoPatAperto;
    gWrap.classList.toggle('open', _graficoPatAperto);
    gBtn.classList.toggle('on', _graficoPatAperto);
    if (_graficoPatAperto) _agganciaGraficoPat(root);
  });

  // toggle finestrella filtro categorie
  const fBtn = root.querySelector('#filtro-pat');
  const fBox = root.querySelector('#net-filtro');
  if (fBtn && fBox) fBtn.addEventListener('click', () => {
    _filtroPatAperto = !_filtroPatAperto;
    fBox.classList.toggle('open', _filtroPatAperto);
    fBtn.classList.toggle('on', _filtroPatAperto || _tipiEsclusi.size > 0);
  });

  // checkbox categorie: includi/escludi dal totale + grafico
  root.querySelectorAll('[data-tipo-filtro]').forEach(cb => cb.addEventListener('change', () => {
    const t = cb.dataset.tipoFiltro;
    if (cb.checked) _tipiEsclusi.delete(t); else _tipiEsclusi.add(t);
    _filtroPatAperto = true;   // tieni aperta la finestrella
    renderPatrimonio(root);
  }));

  // aggancio grafico interattivo (se aperto)
  if (_graficoPatAperto) _agganciaGraficoPat(root);
};

// interattività del grafico patrimonio (vline + tooltip che seguono i punti)
const _agganciaGraficoPat = (root) => {
  const spark = root.querySelector('.spark-pat');
  if (!spark) return;
  let dati; try { dati = JSON.parse(spark.dataset.spark); } catch { return; }
  const tip = spark.querySelector('.spark-tip');
  const vline = spark.querySelector('.spark-vline');
  const VW = parseFloat(spark.dataset.vw) || 320;
  const padX = parseFloat(spark.dataset.padx) || 12;
  const puntoPct = (idx) => ((padX + (idx / (dati.length - 1)) * (VW - padX * 2)) / VW) * 100;
  const show = (clientX) => {
    const r = spark.getBoundingClientRect();
    let rel = (clientX - r.left) / r.width; rel = Math.max(0, Math.min(1, rel));
    const relInner = (rel * VW - padX) / (VW - padX * 2);
    const idx = Math.max(0, Math.min(dati.length - 1, Math.round(relInner * (dati.length - 1))));
    const o = dati[idx];
    const posPct = puntoPct(idx);
    tip.textContent = `${o.l} · ${fmtEUR(o.v)}`;
    tip.style.left = posPct + '%'; tip.classList.add('on');
    if (vline) { vline.style.left = posPct + '%'; vline.classList.add('on'); }
  };
  const hide = () => { tip.classList.remove('on'); if (vline) vline.classList.remove('on'); };
  spark.addEventListener('touchstart', (e) => show(e.touches[0].clientX), { passive: true });
  spark.addEventListener('touchmove', (e) => show(e.touches[0].clientX), { passive: true });
  spark.addEventListener('touchend', hide, { passive: true });
  spark.addEventListener('mousemove', (e) => show(e.clientX));
  spark.addEventListener('mouseleave', hide);
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
        ${aperto ? conti.map(c => {
          const haStrum = tipo === 'investimenti' && !!strumentiPerConto[c.nome];
          const espanso = _contiEspansi.has(c.nome);
          return `
          <div class="conto-riga${haStrum ? ' conto-espandibile' : ''}" data-conto="${c.id}"${haStrum ? ` data-espandi="${escapeHtml(c.nome)}"` : ''}>
            <div class="conto-nome">${escapeHtml(c.nome)}</div>
            <div class="conto-saldo num">${fmtEUR(saldoStimato(c))}</div>
            <div class="conto-chev${haStrum && espanso ? ' giu' : ''}">›</div>
          </div>
          ${haStrum && espanso ? strumentiDi(c.nome) : ''}`;
        }).join('') : ''}
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
function _graficoLineaHTML(esclusi = []) {
  const { punti } = serieStoricoPatrimonio(esclusi);
  if (punti.length < 2) return '<div class="card" style="padding:16px"><div class="empty">Storico insufficiente</div></div>';

  let p = punti;
  if (p.length > 40) { const step = Math.ceil(p.length / 40); p = p.filter((_, i) => i % step === 0 || i === punti.length - 1); }

  const VW = 320, VH = 150, padX = 12, padTop = 16, padBot = 30;
  const vals = p.map(x => x.valore);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const nx = i => padX + (i / (p.length - 1)) * (VW - padX * 2);
  const ny = v => VH - padBot - ((v - min) / range) * (VH - padTop - padBot);
  const pts = p.map((pt, i) => [nx(i), ny(pt.valore)]);

  let line = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${VH - padBot} L${pts[0][0].toFixed(1)} ${VH - padBot} Z`;
  const last = pts[pts.length - 1];
  const fmtK = (v) => Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v) + '';

  // etichette: prima, metà, ultima
  const idxLbl = [0, Math.floor(p.length / 2), p.length - 1];
  const ancora = (i) => i === 0 ? 'start' : i === p.length - 1 ? 'end' : 'middle';
  const fmtMese = (am) => { const [y, m] = am.split('-'); return nomeMese(parseInt(m) - 1).slice(0, 3) + " '" + y.slice(2); };
  const labels = idxLbl.map(i => `<text x="${nx(i).toFixed(1)}" y="${VH - 8}" text-anchor="${ancora(i)}" font-family="Rajdhani" font-size="11" font-weight="600" fill="#535E72">${fmtMese(p[i].annomese)}</text>`).join('');

  const dataJson = escapeHtml(JSON.stringify(p.map(pt => ({ l: fmtMese(pt.annomese), v: pt.valore }))));
  return `<div class="card spark-card" style="margin:0">
    <div class="spark-title">Andamento patrimonio</div>
    <div class="spark spark-pat" data-spark='${dataJson}' data-vw="${VW}" data-padx="${padX}">
      <svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="patline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2E9BFF"/><stop offset="1" stop-color="#22E39A"/></linearGradient>
          <linearGradient id="patarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(46,155,255,.28)"/><stop offset="1" stop-color="rgba(46,155,255,0)"/></linearGradient>
        </defs>
        <path d="${area}" fill="url(#patarea)"/>
        <path d="${line}" fill="none" stroke="url(#patline)" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="#22E39A"/>
        ${labels}
      </svg>
      <div class="spark-vline"></div>
      <div class="spark-tip"></div>
    </div>
  </div>`;
}
