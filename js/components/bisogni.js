// bisogni.js — Bisogni e desideri (pagina a sé, ci si arriva dalla card in Analisi).
//
// Ordine della pagina (scelto da Lorenzo, 3.40):
//  1. bisogni/desideri del periodo, col grafico per mese nella stessa card (tocca un
//     mese e la card mostra quello);
//  2. il tetto: desideri in % delle ENTRATE (al netto delle una tantum), col grafico
//     degli anni e la linea del tetto nella stessa card;
//  3. elenco dei bisogni e "da classificare";
//  4. in fondo "Dove tagliare": i desideri per voce, col confronto col periodo prima.
// La rata del mutuo qui conta INTERA (è la spesa che esce dal conto); nel Bilancio
// invece la quota capitale è risparmio e sta a parte. Scelta voluta, detta in pagina.
//
//   #/bisogni            ultimi 12 mesi completi
//   #/bisogni?anno=2025  un anno (l'anno in corso: da gennaio a oggi)

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, nomeMese, toast, todayISO } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { apriSheet } from './shared.js';
import {
  aggregaNatura, daClassificare, impostaNaturaCategoria, SEP, vociTra, tettoDesideri, impostaTettoDesideri,
} from '../services/naturaService.js';
import { bilancioAnnuale, quotaDesideriSuEntrate } from '../services/bilancioService.js';

export const COL_NATURA = { B: 'var(--bisogni)', D: 'var(--desideri)', N: 'var(--txt-3)' };

let _periodo = '12m';     // '12m' | 'AAAA'
let _mese = null;         // indice del mese toccato nel grafico (solo la card in alto)
const _aperte = { D: false, B: false };

const _pad = (n) => String(n).padStart(2, '0');
const _eur0 = (n) => fmtEUR(Math.round(n)).replace(/,00(?=\s|$)/, '');
const _ultimoGiorno = (y, m) => new Date(y, m, 0).getDate();

// Il periodo scelto e quello con cui confrontarlo (stessa durata, un anno prima)
const _periodi = () => {
  const oggi = new Date();
  if (_periodo === '12m') {
    let y = oggi.getFullYear(), m = oggi.getMonth();   // mese precedente (1-12)
    if (m === 0) { m = 12; y--; }
    const mesi = [];
    let yy = y, mm = m;
    for (let i = 0; i < 12; i++) { mesi.unshift(`${yy}-${_pad(mm)}`); mm--; if (mm === 0) { mm = 12; yy--; } }
    const da = `${mesi[0]}-01`, a = `${y}-${_pad(m)}-${_ultimoGiorno(y, m)}`;
    const daP = `${Number(da.slice(0, 4)) - 1}${da.slice(4)}`, aP = `${y - 1}-${_pad(m)}-${_ultimoGiorno(y - 1, m)}`;
    return { mesi, da, a, daP, aP, nMesi: 12, etichetta: `${_lblMese(mesi[0])} – ${_lblMese(mesi[11])}`, etichettaPrima: '12 mesi prima' };
  }
  const y = Number(_periodo);
  const corrente = y === oggi.getFullYear();
  const meseFine = corrente ? oggi.getMonth() + 1 : 12;
  const mesi = Array.from({ length: meseFine }, (_, i) => `${y}-${_pad(i + 1)}`);
  const a = corrente ? todayISO() : `${y}-12-31`;
  const aP = corrente ? `${y - 1}${a.slice(4)}` : `${y - 1}-12-31`;
  return {
    mesi, da: `${y}-01-01`, a, daP: `${y - 1}-01-01`, aP, nMesi: meseFine,
    etichetta: corrente ? `${y} · da gennaio a oggi` : String(y),
    etichettaPrima: corrente ? `gen–${nomeMese(meseFine - 1).slice(0, 3).toLowerCase()} ${y - 1}` : String(y - 1),
  };
};
const _lblMese = (am) => { const [y, m] = am.split('-'); return `${nomeMese(+m - 1).slice(0, 3)} ${y.slice(2)}`; };
const _anni = () => [...new Set(state.movimenti.filter(m => m.tipo === 'spesa').map(m => m.data.slice(0, 4)))].sort().reverse();

export const renderBisogni = async (root, params = {}) => {
  document.getElementById('view-title').textContent = 'Bisogni e desideri';
  if (params.anno) { _periodo = String(params.anno); _mese = null; }
  _disegna(root);
};

const _disegna = (root) => {
  const P = _periodi();
  const agg = aggregaNatura(P.mesi);
  const ora = vociTra(P.da, P.a), prima = vociTra(P.daP, P.aP);
  const tetto = tettoDesideri();
  const quota = quotaDesideriSuEntrate(P.da, P.a);
  const sel = _mese !== null && _mese < P.mesi.length ? _mese : null;

  // card in alto: periodo intero o mese toccato
  const B = sel === null ? ora.B : agg.B[sel], D = sel === null ? ora.D : agg.D[sel], N = sel === null ? ora.N : agg.N[sel];
  const T = B + D + N;
  const pct = (x) => T ? Math.round(x / T * 100) : 0;
  const max = Math.max(1, ...P.mesi.map((_, i) => agg.B[i] + agg.D[i] + agg.N[i]));

  // liste "dove tagliare": voce, totale, €/mese, scarto col periodo prima
  const primaPer = new Map(prima.voci.map(v => [v.chiave, v.imp]));
  const lista = (nat) => {
    const voci = ora.voci.filter(v => v.nat === nat).sort((a, b) => b.imp - a.imp);
    // anche le voci sparite (c'erano prima, ora zero): sono un taglio riuscito
    for (const v of prima.voci) if (v.nat === nat && !ora.voci.some(x => x.chiave === v.chiave)) voci.push({ ...v, imp: 0 });
    return voci;
  };
  const rigaVoce = (v) => {
    const p = primaPer.get(v.chiave) || 0;
    const delta = Math.round(v.imp - p);
    const colDelta = delta > 0 ? 'var(--down)' : delta < 0 ? 'var(--up)' : 'var(--txt-3)';
    return `<div class="conto-riga" data-voce="${escapeHtml(v.chiave)}">
      <div class="conto-nome">${escapeHtml(v.etichetta)}<div class="meta" style="font-size:11.5px;margin-top:2px">${escapeHtml(v.macro)} · ${_eur0(v.imp / P.nMesi)}/mese</div></div>
      <div class="conto-saldo num" style="text-align:right">${_eur0(v.imp)}<div class="num" style="font-size:11.5px;font-weight:600;color:${colDelta}">${delta > 0 ? '+' : delta < 0 ? '−' : ''}${delta ? _eur0(Math.abs(delta)) : '='}</div></div>
    </div>`;
  };
  const blocco = (nat, titolo) => {
    const voci = lista(nat);
    if (!voci.length) return '';
    const mostra = _aperte[nat] ? voci : voci.slice(0, 5);
    return `
      <div class="section-lbl"><span>${titolo}</span><span>vs ${escapeHtml(P.etichettaPrima)}</span></div>
      <div class="card" style="padding:4px 14px">
        ${mostra.map(rigaVoce).join('')}
        ${voci.length > 5 ? `<div class="conto-riga" data-apri="${nat}"><div class="conto-nome" style="color:var(--accent)">${_aperte[nat] ? 'Mostra meno' : `Mostra tutte le ${voci.length} voci`}</div></div>` : ''}
      </div>`;
  };

  // quota desideri sulle entrate, anno per anno (anni parziali più chiari)
  const anni = bilancioAnnuale().filter(r => r.entrateOrdinarie > 0).sort((a, b) => a.anno.localeCompare(b.anno));
  const primoAnno = state.movimenti.reduce((m, x) => (x.data < m ? x.data : m), '9999');
  const quote = anni.map(r => ({ anno: r.anno, pct: r.desideri / r.entrateOrdinarie * 100, parziale: r.parziale || r.anno === primoAnno.slice(0, 4) && primoAnno.slice(5, 7) !== '01' }));
  const maxQ = Math.max(tetto || 0, ...quote.map(q => q.pct), 1) * 1.1;

  // card tetto
  const pq = quota.pct;
  const sopra = tetto != null && pq != null && pq > tetto;
  const scala = Math.max(pq || 0, tetto || 0, 10) * 1.25;
  const cardTetto = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span class="meta">Desideri sulle entrate · ${escapeHtml(P.etichetta)}</span>
        <span class="act" id="tetto-mod" style="color:var(--accent);font-size:12px;cursor:pointer">${tetto ? 'Modifica tetto' : 'Imposta tetto'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:6px">
        <span class="num" style="font-size:24px;font-weight:700;color:${sopra ? 'var(--down)' : 'var(--txt)'}">${pq == null ? '—' : Math.round(pq) + '%'}</span>
        <span class="meta">${tetto ? `tetto ${Math.round(tetto)}%` : 'nessun tetto impostato'}</span>
      </div>
      <div style="position:relative;height:8px;border-radius:4px;background:var(--surface-3);margin:8px 0 6px;overflow:hidden">
        <div style="width:${pq ? Math.min(100, pq / scala * 100) : 0}%;height:100%;background:var(--desideri)"></div>
        ${tetto ? `<div style="position:absolute;top:0;bottom:0;left:${tetto / scala * 100}%;width:2px;background:var(--txt)"></div>` : ''}
      </div>
      <div class="meta">${_eur0(quota.desideri)} di desideri su ${_eur0(quota.entrate)} di entrate${tetto ? (sopra ? ` · <span style="color:var(--down)">${_eur0(quota.desideri - quota.entrate * tetto / 100)} sopra il tetto</span>` : ` · margine ${_eur0(quota.entrate * tetto / 100 - quota.desideri)}`) : ''}</div>
      <div class="meta" style="font-size:11px;margin-top:4px;opacity:.8">Entrate senza le una tantum (le vendite e simili marcate nel Bilancio).</div>
      <div class="meta" style="margin:16px 0 10px">Desideri negli anni · % delle entrate</div>
      <div style="position:relative;display:flex;align-items:flex-end;gap:5px;height:120px">
        ${tetto ? `<div style="position:absolute;left:0;right:0;bottom:${tetto / maxQ * 100}%;border-top:1.5px dashed var(--txt-2)"></div>` : ''}
        ${quote.map(q => `<div data-anno="${q.anno}" style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer">
          <span class="num" style="font-size:10px;color:${tetto && q.pct > tetto ? 'var(--down)' : 'var(--txt-2)'}">${Math.round(q.pct)}</span>
          <div style="width:100%;height:${q.pct / maxQ * 100}%;background:var(--desideri);border-radius:3px 3px 0 0;opacity:${q.parziale ? .5 : 1};${_periodo === q.anno ? 'outline:1.5px solid var(--txt);outline-offset:1px;' : ''}"></div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:5px;margin-top:4px">${quote.map(q => `<span class="meta" style="flex:1;text-align:center;font-size:10px">${q.anno.slice(2)}</span>`).join('')}</div>
      <div class="meta" style="margin-top:8px">${tetto ? 'La linea tratteggiata è il tetto. ' : ''}Più chiari gli anni parziali. Tocca un anno per aprirlo.</div>
    </div>`;

  const daClass = daClassificare();
  root.innerHTML = `
    <div class="chip-row" style="margin:12px 0 10px">
      <div class="chip ${_periodo === '12m' ? 'on' : ''}" data-periodo="12m">Ultimi 12 mesi</div>
      ${_anni().map(a => `<div class="chip ${_periodo === a ? 'on' : ''}" data-periodo="${a}">${a}</div>`).join('')}
    </div>

    <div class="card">
      <div class="meta">${sel !== null ? _lblMese(P.mesi[sel]) : escapeHtml(P.etichetta)} · spese ${_eur0(T)}</div>
      <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin:12px 0 10px;background:var(--surface-2)">
        <div style="width:${T ? B / T * 100 : 0}%;background:var(--bisogni)"></div>
        <div style="width:${T ? D / T * 100 : 0}%;background:var(--desideri)"></div>
        <div style="flex:1;background:${N ? 'var(--txt-3)' : 'transparent'}"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        <div><div class="meta"><span class="nat-dot" style="background:var(--bisogni)"></span>Bisogni</div>
          <div class="num" style="font-size:21px;font-weight:700">${_eur0(B)}</div>
          <div class="meta">${pct(B)}%${sel === null ? ` · ${_eur0(B / P.nMesi)}/mese` : ''}</div></div>
        <div><div class="meta"><span class="nat-dot" style="background:var(--desideri)"></span>Desideri</div>
          <div class="num" style="font-size:21px;font-weight:700">${_eur0(D)}</div>
          <div class="meta">${pct(D)}%${sel === null ? ` · ${_eur0(D / P.nMesi)}/mese` : ''}</div></div>
      </div>
      ${N ? `<div class="meta" style="margin-top:10px">Da classificare: <b class="num">${_eur0(N)}</b></div>` : ''}
      <div class="meta" style="margin-top:16px">Per mese · tocca una barra${sel !== null ? ', di nuovo per tornare al periodo' : ''}</div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin-top:10px">
        ${P.mesi.map((am, i) => `<div data-bar="${i}" style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;cursor:pointer;border-radius:3px;${sel === i ? 'outline:1.5px solid var(--accent);outline-offset:2px;' : ''}">
          <div style="height:${agg.N[i] / max * 100}%;background:var(--txt-3)"></div>
          <div style="height:${agg.D[i] / max * 100}%;background:var(--desideri)"></div>
          <div style="height:${agg.B[i] / max * 100}%;background:var(--bisogni)"></div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:4px;margin-top:4px">${P.mesi.map(am => `<span class="meta" style="flex:1;text-align:center;font-size:10.5px">${nomeMese(+am.slice(5) - 1).slice(0, 1).toUpperCase()}</span>`).join('')}</div>
    </div>

    ${cardTetto}

    ${blocco('B', 'Bisogni')}

    ${daClass.length ? `
      <div class="section-lbl"><span>Da classificare</span></div>
      <div class="card" style="padding:4px 14px">
        ${daClass.map(c => `<div class="conto-riga" data-classifica="${escapeHtml(c.macro)}${SEP}${escapeHtml(c.cat)}"><div class="conto-nome">${escapeHtml(c.cat)}<div class="meta" style="font-size:11.5px;margin-top:2px">${escapeHtml(c.macro)}</div></div><div class="conto-saldo num">${_eur0(c.imp)}</div><div class="conto-chev">›</div></div>`).join('')}
      </div>` : ''}

    ${blocco('D', 'Dove tagliare')}

    <p class="meta" style="margin:10px 4px;line-height:1.5">Qui la rata del mutuo conta intera, perché è quello che esce dal conto. Nel Bilancio la sua quota capitale è risparmio e sta a parte, per questo i bisogni lì risultano più bassi.</p>
    <button class="btn btn-secondary" id="vai-categorie">Cambia le etichette in Categorie</button>
  `;

  const r = () => _disegna(root);
  root.querySelectorAll('[data-periodo]').forEach(el => el.addEventListener('click', () => { _periodo = el.dataset.periodo; _mese = null; r(); }));
  root.querySelectorAll('[data-anno]').forEach(el => el.addEventListener('click', () => { _periodo = el.dataset.anno; _mese = null; r(); window.scrollTo(0, 0); }));
  root.querySelectorAll('[data-bar]').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.bar; _mese = _mese === i ? null : i; r(); }));
  root.querySelectorAll('[data-apri]').forEach(el => el.addEventListener('click', () => { _aperte[el.dataset.apri] = !_aperte[el.dataset.apri]; r(); }));
  root.querySelectorAll('[data-voce]').forEach(el => el.addEventListener('click', () => {
    const [macro, cat, sub] = el.dataset.voce.split(SEP);
    navigate('movimenti', { macro, cat, sub: sub || undefined, da: P.da, a: P.a });
  }));
  root.querySelectorAll('[data-classifica]').forEach(el => el.addEventListener('click', () => {
    const [macro, cat] = el.dataset.classifica.split(SEP);
    scegliNatura(cat, async (v) => { await impostaNaturaCategoria(macro, cat, v); toast('Classificata'); r(); });
  }));
  root.querySelector('#tetto-mod').addEventListener('click', () => _apriTetto(r));
  root.querySelector('#vai-categorie').addEventListener('click', () => navigate('categorie'));
};

const _apriTetto = (dopo) => {
  const t = tettoDesideri();
  apriSheet('Tetto dei desideri', `
    <p class="meta" style="margin-bottom:10px;line-height:1.5">Quanta parte delle entrate vuoi al massimo spendere in desideri? Le entrate si contano senza le una tantum.</p>
    <label class="meta">Tetto (% delle entrate)</label>
    <input type="text" inputmode="decimal" id="tt-val" value="${t ? String(t).replace('.', ',') : ''}" placeholder="Es. 30" class="sheet-input">
    <div class="btn-row">
      ${t ? '<button class="btn btn-danger" id="tt-del">Rimuovi</button>' : ''}
      <button class="btn btn-primary" id="tt-ok">Salva</button>
    </div>
  `, (body, chiudi) => {
    body.querySelector('#tt-ok').addEventListener('click', async () => {
      const v = parseFloat(String(body.querySelector('#tt-val').value).replace(',', '.'));
      try { await impostaTettoDesideri(v); } catch (e) { toast(e.message); return; }
      chiudi(); toast('Tetto salvato'); dopo();
    });
    const del = body.querySelector('#tt-del');
    if (del) del.addEventListener('click', async () => { await impostaTettoDesideri(null); chiudi(); toast('Tetto rimosso'); dopo(); });
  });
};

// Sheet di scelta Bisogno / Desiderio (usato anche da Categorie)
export const scegliNatura = (titolo, onScelta) => {
  apriSheet(titolo, `
    <p class="meta" style="margin-bottom:12px">È un bisogno o un desiderio? Vale per tutte le spese della categoria.</p>
    <div class="btn-row">
      <button class="btn btn-secondary" data-n="B" style="border-color:var(--bisogni)">Bisogno</button>
      <button class="btn btn-secondary" data-n="D" style="border-color:var(--desideri)">Desiderio</button>
    </div>
  `, (b, chiudi) => {
    b.querySelectorAll('[data-n]').forEach(x => x.addEventListener('click', async () => { chiudi(); await onScelta(x.dataset.n); }));
  });
};
