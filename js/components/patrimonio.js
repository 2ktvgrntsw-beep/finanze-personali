// patrimonio.js — Vista Patrimonio: netto, composizione, conti, debiti.
// Stessa grammatica a barre della home, ma le barre pesano sul patrimonio.
// I valori (casa, saldi conti) si modificano toccandoli direttamente (no icone matita).

import { state } from '../core/store.js';
import { dbGet, dbAdd, dbDelete, safeWrite } from '../core/db.js';
import { contoDiTrasferimento, eInvestimento, strumentoDiTrasferimento } from '../services/attribuzioneInvestimenti.js';
import { costruisciSparkline, agganciaSparkline } from '../core/sparkline.js';
import { fmtEUR, fmtEUR0, escapeHtml, todayISO, nomeMese } from '../core/utils.js';
import { iconaMacro, UI_SVG } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { saldoStimato, saveConto, LABEL_TIPO } from '../services/contiService.js';
import {
  totaleAttivita, totalePassivita, patrimonioNetto, composizioneAttivita, patrimonioLiquido,
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
let _obiettivoLiquido = null;      // obiettivo di patrimonio liquido per l'anno in corso (€)
const CHIAVE_OBIETTIVO = 'obiettivo_liquido';
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
  // carico l'obiettivo di patrimonio liquido salvato
  try {
    const rec = await dbGet('meta', CHIAVE_OBIETTIVO);
    if (rec && typeof rec.valore === 'number') _obiettivoLiquido = rec.valore;
    if (rec && rec.anno && rec.anno !== new Date().getFullYear()) _obiettivoLiquido = null; // obiettivo di un altro anno: azzero
  } catch { /* nessun obiettivo */ }
  const esclusi = [..._tipiEsclusi];
  const netto = patrimonioNetto(esclusi);
  const att = totaleAttivita(esclusi);
  const pass = totalePassivita(esclusi);

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

  // card obiettivo patrimonio liquido (anno in corso)
  const liquidoAttuale = patrimonioLiquido();
  const annoCorrente = new Date().getFullYear();
  const cardObiettivo = _obiettivoLiquidoHTML(liquidoAttuale, annoCorrente);

  root.innerHTML = `
    <div class="net-card">
      <div class="net-icons">
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

    ${cardObiettivo}

    ${_contiCollassabiliHTML()}

    ${snapshotMeseMancante() && !filtroAttivo ? '<div style="text-align:center;margin:10px 0"><button class="btn btn-secondary" id="snap" style="width:auto;display:inline-flex;padding:9px 16px;font-size:13px">Salva rilevazione di oggi</button></div>' : ''}

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

  // toggle finestrella filtro categorie — il pulsante ora è nell'HEADER, a sinistra del titolo
  const fBtn = document.getElementById('btn-filtro-pat');
  const fBox = root.querySelector('#net-filtro');
  if (fBtn) {
    fBtn.classList.toggle('on', _filtroPatAperto || _tipiEsclusi.size > 0);
    // rimpiazzo il listener clonando per non accumulare handler tra i re-render
    const fresh = fBtn.cloneNode(true);
    fBtn.parentNode.replaceChild(fresh, fBtn);
    fresh.style.display = 'flex';
    fresh.addEventListener('click', () => {
      _filtroPatAperto = !_filtroPatAperto;
      if (fBox) fBox.classList.toggle('open', _filtroPatAperto);
      fresh.classList.toggle('on', _filtroPatAperto || _tipiEsclusi.size > 0);
    });
  }

  // checkbox categorie: includi/escludi dal totale + grafico
  root.querySelectorAll('[data-tipo-filtro]').forEach(cb => cb.addEventListener('change', () => {
    const t = cb.dataset.tipoFiltro;
    if (cb.checked) _tipiEsclusi.delete(t); else _tipiEsclusi.add(t);
    _filtroPatAperto = true;   // tieni aperta la finestrella
    renderPatrimonio(root);
  }));

  // aggancio grafico interattivo (se aperto)
  if (_graficoPatAperto) _agganciaGraficoPat(root);

  // obiettivo liquido: apri lo sheet per impostarlo/modificarlo
  const setObBtn = root.querySelector('#set-obiettivo');
  if (setObBtn) setObBtn.addEventListener('click', () => _impostaObiettivo(root));
};

// interattività del grafico patrimonio: delega al modulo condiviso sparkline.js
const _agganciaGraficoPat = (root) => {
  agganciaSparkline(root.querySelector('.spark-pat'), fmtEUR);
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
      const ok = await safeWrite(() => saveConto({ ...c, saldo_iniziale: nuovo, data_saldo: nuovaData, possessoData: possesso }), 'Valore non aggiornato');
      if (!ok) return;
      chiudi(); toast('Aggiornato'); renderPatrimonio(root);
    });
  });
};

// Sezione conti collassabile per tipo. Nel gruppo Investimenti mostra anche gli
// strumenti (PAC, Crypto, Azioni sciolte) ricavati dai trasferimenti. I conti sono
// riordinabili (campo 'ordine').
// Sheet per impostare/modificare l'obiettivo di patrimonio liquido dell'anno.
const _impostaObiettivo = (root) => {
  const anno = new Date().getFullYear();
  const valoreCorrente = _obiettivoLiquido != null ? String(_obiettivoLiquido).replace('.', ',') : '';
  apriSheet(`Obiettivo liquido ${anno}`, `
    <p class="meta" style="margin-bottom:10px;line-height:1.5">Quanto vuoi avere in liquidità, risparmio e investimenti entro fine ${anno}? (esclusi i beni come la casa)</p>
    <label class="meta">Obiettivo (€)</label>
    <input type="text" inputmode="decimal" id="ob-val" value="${valoreCorrente}" placeholder="Es. 50000" class="sheet-input">
    <div class="btn-row">
      ${_obiettivoLiquido != null ? '<button class="btn btn-danger" id="ob-del">Rimuovi</button>' : ''}
      <button class="btn btn-primary" id="ob-ok">Salva</button>
    </div>
  `, (body, chiudi) => {
    body.querySelector('#ob-ok').addEventListener('click', async () => {
      const val = parseFloat(String(body.querySelector('#ob-val').value).replace(',', '.'));
      if (!val || val <= 0) { toast('Inserisci un importo valido'); return; }
      const ok = await safeWrite(() => dbAdd('meta', { chiave: CHIAVE_OBIETTIVO, valore: val, anno }), 'Obiettivo non salvato');
      if (!ok) return;
      _obiettivoLiquido = val;
      chiudi(); toast('Obiettivo salvato'); renderPatrimonio(root);
    });
    const del = body.querySelector('#ob-del');
    if (del) del.addEventListener('click', async () => {
      const ok = await safeWrite(() => dbDelete('meta', CHIAVE_OBIETTIVO), 'Obiettivo non rimosso');
      if (!ok) return;
      _obiettivoLiquido = null;
      chiudi(); toast('Obiettivo rimosso'); renderPatrimonio(root);
    });
  });
};

// Card OBIETTIVO patrimonio liquido per l'anno in corso: confronto tra il liquido
// attuale (liquidità+risparmio+investimenti) e l'obiettivo impostato dall'utente.
function _obiettivoLiquidoHTML(liquidoAttuale, anno) {
  if (_obiettivoLiquido == null) {
    // nessun obiettivo: invito a impostarlo
    return `<div class="card obiettivo-card">
      <div class="obiettivo-head">
        <div class="obiettivo-tit">Obiettivo liquido ${anno}</div>
        <button class="obiettivo-set" id="set-obiettivo">Imposta</button>
      </div>
      <div class="obiettivo-vuoto">Imposta un traguardo di patrimonio liquido per quest'anno e segui i progressi.</div>
      <div class="obiettivo-attuale">Liquido attuale: <b class="num">${fmtEUR(liquidoAttuale)}</b></div>
    </div>`;
  }
  const pct = _obiettivoLiquido > 0 ? Math.min(100, (liquidoAttuale / _obiettivoLiquido) * 100) : 0;
  const raggiunto = liquidoAttuale >= _obiettivoLiquido;
  const manca = Math.max(0, _obiettivoLiquido - liquidoAttuale);
  return `<div class="card obiettivo-card">
    <div class="obiettivo-head">
      <div class="obiettivo-tit">Obiettivo liquido ${anno}</div>
      <button class="obiettivo-set" id="set-obiettivo">Modifica</button>
    </div>
    <div class="obiettivo-cifre">
      <div><span class="lbl2">Attuale</span><b class="num">${fmtEUR(liquidoAttuale)}</b></div>
      <div style="text-align:right"><span class="lbl2">Obiettivo</span><b class="num">${fmtEUR(_obiettivoLiquido)}</b></div>
    </div>
    <div class="obiettivo-barra"><div class="obiettivo-fill ${raggiunto ? 'done' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="obiettivo-foot">
      ${raggiunto
        ? `<span class="obiettivo-ok">🎉 Obiettivo raggiunto! (${pct.toFixed(0)}%)</span>`
        : `<span>${pct.toFixed(0)}% raggiunto</span><span class="obiettivo-manca">mancano ${fmtEUR(manca)}</span>`}
    </div>
  </div>`;
}

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
    // L'attribuzione conto/strumento usa la FONTE UNICA (attribuzioneInvestimenti.js),
    // condivisa con la pagina di dettaglio: così i numeri non possono divergere.
    let strumentiPerConto = {};
    if (tipo === 'investimenti' && aperto) {
      for (const m of state.movimenti) {
        if (!eInvestimento(m, state.conti)) continue;
        const conto = contoDiTrasferimento(m, state.conti);
        if (!conto) continue;  // non attribuibile: lo salto (evita "Altro" rumoroso)
        const strum = strumentoDiTrasferimento(m, conto);
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

  // decimation: max ~40 punti per non appesantire il path
  let p = punti;
  if (p.length > 40) { const step = Math.ceil(p.length / 40); p = p.filter((_, i) => i % step === 0 || i === punti.length - 1); }

  const fmtMese = (am) => { const [y, m] = am.split('-'); return nomeMese(parseInt(m) - 1).slice(0, 3) + " '" + y.slice(2); };
  const datiGrafico = p.map(pt => ({ label: fmtMese(pt.annomese), valore: pt.valore }));
  const { svg, dataAttr } = costruisciSparkline(datiGrafico, {
    vw: 320, vh: 150, padX: 12, padTop: 16, padBot: 30,
    idLinea: 'patline', idArea: 'patarea',
    coloreLinea0: '#2E9BFF', coloreLinea1: '#22E39A',   // blu -> verde (identità Patrimonio)
    larghezzaLinea: 2.4, mostraEtichette: true, mostraUltimoPunto: true,
  });
  return `<div class="card spark-card" style="margin:0">
    <div class="spark-title">Andamento patrimonio</div>
    <div class="spark spark-pat" ${dataAttr}>
      ${svg}
      <div class="spark-vline"></div>
      <div class="spark-tip"></div>
    </div>
  </div>`;
}
