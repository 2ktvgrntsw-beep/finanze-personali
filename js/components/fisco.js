// fisco.js — Sezione Fisco: imposte, dichiarazioni, deduzioni e detrazioni.
//
// Vive da sola (Altro → Sezioni) e non dentro Stipendi, dove stava prima insieme a
// buste e fondo pensione: quattro argomenti diversi nella stessa sezione erano troppi.
// I dati però restano gli stessi — buste in state.stipendi, 730 in dichiarazioni.js —
// quindi le due sezioni si aggiornano insieme senza doversi passare niente.
//
// UNA REGOLA DI LETTURA, ovunque in questa sezione: la riga mostra l'anno e UN numero,
// quello che conta. Tutto il resto si apre al tocco. Le tabelle fiscali piene di sigle
// (IRPEF, add. reg., add. com., sost.) sono illeggibili su un telefono e nessuno le
// consulta davvero: meglio una colonna sola e il dettaglio a richiesta, per esteso.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml } from '../core/utils.js';
import { navigate } from '../core/router.js';
import {
  fiscoTotale, fiscoAnnuale, verificaFiscale, saldoDichiarazioni, waterfallAnno,
  rimborsoAtteso, cassaRealeAnnuale, SEG_FISCO,
} from '../services/stipendiService.js';
import { deduzioniAnno, detrazioniAnnuali, attesoAnno } from '../services/fiscoService.js';
import { DICHIARAZIONI } from '../core/dichiarazioni.js';

// Riga d'anno che si apre al tocco: un solo numero visibile, il resto dentro.
const _riga = (chiave, anno, valore, corpo, aperta, nota) => `
  <div class="yrow ${aperta ? 'on' : ''}" data-y="${chiave}">
    <span class="anno num">${anno}</span>
    ${nota ? `<span class="meta">${nota}</span>` : ''}
    <span class="val num">${valore}</span>
    <span class="ch">›</span>
  </div>
  <div class="ybody ${aperta ? 'on' : ''}" data-ybody="${chiave}">${corpo}</div>`;

const _r = (nome, val, forte) => `<div class="r"><span>${nome}</span>${forte ? `<b>${val}</b>` : `<span>${val}</span>`}</div>`;

// Un gestore solo, in delega: vale anche per i blocchi ridisegnati.
const _legaRighe = (root, aperti, ridisegna) => {
  root.addEventListener('click', (e) => {
    const h = e.target.closest('[data-y]');
    if (!h) return;
    const k = h.dataset.y;
    aperti[k] = !aperti[k];
    h.classList.toggle('on', aperti[k]);
    root.querySelector(`[data-ybody="${k}"]`)?.classList.toggle('on', aperti[k]);
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// HOME FISCO — quanto hai pagato, e per ogni anno quanto era davvero dovuto.
// ═══════════════════════════════════════════════════════════════════════════
const _apertiFisco = {};

export const renderFisco = async (root) => {
  document.getElementById('view-title').textContent = 'Fisco';
  const t = fiscoTotale();
  const quota = (v) => t.pagato ? Math.round(v / t.pagato * 100) : 0;
  const atteso = rimborsoAtteso();

  const righe = verificaFiscale().filter(v => v.fonte === '730').map(v => {
    const corpo = `
      ${_r('Imposta dovuta secondo il 730', fmtEUR(v.impostaNetta), true)}
      ${_r('Trattenuta in busta dal datore', fmtEUR(v.irpefTrattenuta))}
      ${_r(v.eccedenza >= 0 ? 'Trattenuto in più' : 'Trattenuto in meno',
    `${v.eccedenza >= 0 ? '+' : '−'}${fmtEUR(Math.abs(v.eccedenza))}`, true)}
      ${v.rimborso ? _r(`Restituito in busta nel ${v.presentata}`, fmtEUR(v.rimborso)) : ''}
      ${_r('Aliquota reale sul reddito complessivo', v.aliquotaReale.toFixed(1) + '%')}
      ${_r('Reddito complessivo', fmtEUR(v.redditoComplessivo))}
      ${v.piuDatori ? '<div class="fr-sub" style="margin:6px 0 0">Due datori in quest\'anno: ognuno ha tassato la propria fetta al margine, e la progressività si è ricomposta solo in dichiarazione.</div>' : ''}
      ${Math.abs(v.scartoArchivio) > 1 ? `<div class="fr-sub" style="margin:6px 0 0;color:var(--warn)">L'archivio buste somma ${fmtEUR(v.sommaIrpef)} di IRPEF contro i ${fmtEUR(v.irpefTrattenuta)} certificati: ${fmtEUR(Math.abs(v.scartoArchivio))} di scarto.</div>` : ''}
      ${(v.daVerificare || []).map(x => `<div class="fr-sub" style="margin:6px 0 0;color:var(--warn)">${escapeHtml(x)}</div>`).join('')}`;
    return _riga(`f${v.anno}`, v.anno, fmtEUR(v.impostaNetta), corpo, !!_apertiFisco[`f${v.anno}`]);
  }).join('');

  root.innerHTML = `
    <div class="net-card" style="margin-top:4px">
      <div class="lbl2">Imposte pagate sul lavoro</div>
      <div class="num" style="font-size:30px;font-weight:750">${fmtEUR(t.pagato)}</div>
      <div class="meta" style="margin-top:4px">di cui <b style="color:var(--up)">${fmtEUR(t.rimborso)}</b> tornati indietro col 730 (${Math.round(t.quotaRestituita)}%)</div>
    </div>

    ${atteso ? `<div class="card eboll" id="fis-atteso" style="cursor:pointer;border-left:3px solid var(--up)">
      <div class="body" style="flex:1">
        <div class="lbl2">Rimborso 730 in arrivo</div>
        <div class="num" style="font-size:20px;font-weight:750;color:var(--up)">${fmtEUR(atteso.residuo)}</div>
        <div class="meta" style="margin-top:4px">dal 730 sui redditi ${atteso.anno} · accreditato in busta nel corso del ${atteso.presentata}</div>
      </div>
      <div class="eboll-chev">›</div>
    </div>` : ''}

    <div class="section-lbl"><span>Cosa hai pagato</span></div>
    <div class="card">
      ${[['IRPEF', t.irpef, SEG_FISCO[0].colore],
    ['Addizionale regionale', t.addReg, SEG_FISCO[1].colore],
    ['Addizionale comunale', t.addCom, SEG_FISCO[2].colore],
    ['Imposta sostitutiva sui premi', t.sost, '#FF8A3D'],
    ['IRPEF a tassazione separata', t.sep, '#E2001A']]
    .filter(x => x[1]).map(([nome, val, col]) => `
        <div class="fr-row">
          <div class="fr-head">
            <span class="fr-nome"><span class="stip-dot" style="background:${col}"></span> ${nome}</span>
            <span class="fr-val num">${fmtEUR(val)}</span>
          </div>
          <div class="fr-bar"><div class="fr-fill" style="width:${quota(val)}%;background:${col}"></div></div>
          <div class="fr-sub">${quota(val)}% delle imposte pagate</div>
        </div>`).join('')}
    </div>

    <div class="section-lbl"><span>Trattenuto e dovuto</span><span class="act" id="fis-dich">Dichiarazioni ›</span></div>
    <div class="card" style="padding:2px 14px 6px">
      ${righe}
      <div class="eprice-note" style="margin:8px 0 6px">La colonna è l'imposta <b>davvero dovuta</b> secondo il 730, non quella trattenuta. Tocca un anno per vedere quanto ti è stato preso e quanto è tornato indietro.</div>
    </div>
  `;

  _legaRighe(root, _apertiFisco);
  root.querySelector('#fis-dich')?.addEventListener('click', () => navigate('fisco-dichiarazioni'));
  root.querySelector('#fis-atteso')?.addEventListener('click', () => navigate('fisco-dichiarazioni'));
};

// ═══════════════════════════════════════════════════════════════════════════
// DICHIARAZIONI — il percorso del 730, deduzioni, detrazioni, imposte e rimborsi.
// ═══════════════════════════════════════════════════════════════════════════
let _annoDich = null;
const _apertiDich = { passi: false, cassa: false };

export const renderFiscoDichiarazioni = async (root) => {
  document.getElementById('view-title').textContent = 'Dichiarazioni';
  const anni = DICHIARAZIONI.map(d => d.anno).sort((a, b) => b - a);
  if (_annoDich == null || !anni.includes(_annoDich)) _annoDich = anni[0];
  const s = saldoDichiarazioni();
  const att = attesoAnno(new Date().getFullYear());
  const cassa = cassaRealeAnnuale().slice().reverse();

  // ── imposte e rimborsi, una tabella sola ────────────────────────────────
  const perAnno = fiscoAnnuale().slice().reverse();
  const tabImposte = perAnno.map(a => {
    const corpo = `
      ${_r('IRPEF', fmtEUR(a.irpef), true)}
      ${a.addReg ? _r('Addizionale regionale', fmtEUR(a.addReg)) : ''}
      ${a.addCom ? _r('Addizionale comunale', fmtEUR(a.addCom)) : ''}
      ${a.sost ? _r('Imposta sostitutiva sui premi', fmtEUR(a.sost)) : ''}
      ${a.sep ? _r('IRPEF a tassazione separata', fmtEUR(a.sep)) : ''}
      ${_r('Totale pagato nell\'anno', fmtEUR(a.pagato), true)}
      ${a.rimborso ? _r('Rimborso 730 incassato', '+' + fmtEUR(a.rimborso), true) : ''}
      ${a.rimborso ? `<div class="fr-sub" style="margin:6px 0 0">Il rimborso incassato in un anno è quasi sempre il conguaglio dei redditi dell'anno <b>precedente</b>${a.annoImposta ? `: questo si riferisce al ${a.annoImposta}` : ''}. Non confrontarlo con l'IRPEF della stessa riga.</div>` : ''}`;
    return _riga(`i${a.anno}`, a.anno, fmtEUR(a.pagato), corpo, !!_apertiDich[`i${a.anno}`],
      a.rimborso ? `<span style="color:var(--up)">+${fmtEUR(a.rimborso)} rimborsati</span>` : '');
  }).join('');

  // ── detrazioni anno per anno ────────────────────────────────────────────
  const tabDetr = detrazioniAnnuali().map(d => {
    const corpo = `
      ${d.voci.map(v => `<div class="r"><span><span class="stip-dot" style="background:${v.colore}"></span> ${v.nome}</span><b>${fmtEUR(v.val)}</b></div>`).join('')}
      ${d.resto ? _r('Altri crediti d\'imposta', fmtEUR(d.resto)) : ''}
      <div class="fr-sub" style="margin:6px 0 0">Su ${fmtEUR(d.impostaLorda)} di imposta lorda: senza queste detrazioni avresti pagato ${fmtEUR(d.totale)} in più, cioè il ${d.quotaSuLorda}% in più.</div>`;
    return _riga(`d${d.anno}`, d.anno, fmtEUR(d.totale), corpo, !!_apertiDich[`d${d.anno}`]);
  }).join('');

  root.innerHTML = `
    <div class="net-card" style="margin-top:4px">
      <div class="lbl2">Trattenuto più del dovuto in ${s.anni} anni</div>
      <div class="num" style="font-size:30px;font-weight:750">${fmtEUR(s.eccedenzaTotale)}</div>
      <div class="meta" style="margin-top:4px">tutti restituiti col 730 · media ${fmtEUR(s.mediaAnnua)} l'anno</div>
    </div>

    <div class="section-lbl">
      <span>Dal reddito al saldo</span>
      <div class="eyear" id="dich-year">
        <button id="dich-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="dich-lbl">${_annoDich}</span>
        <button id="dich-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="card" id="dich-anno"></div>

    <div class="section-lbl"><span>Deduzioni <span id="dich-anno-ded"></span></span></div>
    <div class="card" id="dich-ded"></div>

    <div class="section-lbl"><span>Detrazioni · anno per anno</span></div>
    <div class="card" style="padding:2px 14px 6px">${tabDetr}</div>

    ${att ? `
    <div class="section-lbl"><span>Atteso nel ${att.anno}</span></div>
    <div class="card">
      <div class="fr-head" style="padding-bottom:6px">
        <span class="fr-nome" style="font-weight:700">Detrazioni già maturate</span>
        <span class="fr-val num" style="font-size:17px;font-weight:750;color:var(--up)">${fmtEUR(att.totale)}</span>
      </div>
      ${att.voci.map(v => `<div class="r"><span>${escapeHtml(v.tipo)} ${v.annoSpesa} <span style="color:var(--txt-3)">· rata ${v.rata} di ${v.su}</span></span><b>${fmtEUR(v.importo)}</b></div>`).join('')}
      <div class="fr-sub" style="margin:8px 0 2px">Sono rate di bonus già acquisiti: arrivano comunque, che tu faccia altro o no. ${att.dichiarato ? '' : `Il 730 del ${att.anno} non esiste ancora, quindi questa è la somma delle rate note, non un dato certificato. `}Nel ${att.anno + 1} la cifra scende a ${fmtEUR(att.prossimoAnno)} — <b>${fmtEUR(att.scalino)} in meno</b> — perché finisce la rata grossa dell'intervento del ${att.voci[0] ? att.voci[0].annoSpesa : ''}. L'ultima rata cade nel ${att.ultimoAnno}.</div>
    </div>` : ''}

    <div class="section-lbl"><span>Imposte e rimborsi · anno per anno</span></div>
    <div class="card" style="padding:2px 14px 6px">${tabImposte}</div>

    <div class="section-lbl"><span>Cassa reale</span></div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="dich-head ${_apertiDich.cassa ? 'on' : ''}" data-dich="cassa">
        <div class="b">
          <div class="r1"><span class="nm">Entrato nel ${cassa[0].anno}</span><span class="imp num">${fmtEUR(cassa[0].tot)}</span></div>
          <div class="r2">netto dalle buste più il rimborso 730 incassato nell'anno solare</div>
        </div>
        <div class="dich-chev">›</div>
      </div>
      <div class="dich-body ${_apertiDich.cassa ? 'on' : ''}" data-dichbody="cassa">
        ${cassa.map(c => `
          <div class="paniere-anno-riga">
            <span class="num anno">${c.anno}${c.parziale ? ` <span class="meta">${c.mesi} buste</span>` : ''}</span>
            <b class="num">${fmtEUR(c.tot)}</b>
            <span class="delta ${c.rimborsoIncassato ? 'ok' : ''} num">${c.rimborsoIncassato ? '+' + fmtEUR(c.rimborsoIncassato) : '—'}</span>
          </div>`).join('')}
        <div class="eprice-note" style="margin:6px 0 10px">Il rimborso non è retribuzione e resta fuori dal netto delle buste, ma in banca ci arriva: qui le due cose sono rimesse insieme.</div>
      </div>
    </div>
  `;

  // ── blocco anno: tre righe sempre visibili, il resto a scomparsa ─────────
  const disAnno = () => {
    const w = waterfallAnno(_annoDich);
    const cont = root.querySelector('#dich-anno');
    const max = Math.max(...w.passi.map(p => Math.abs(p.val)), 1);
    const col = { base: '#2E9BFF', giu: '#FF3B5C', tappa: '#8B96AB', saldo: '#22E39A' };
    const riga = (p) => `
      <div class="fr-row">
        <div class="fr-head">
          <span class="fr-nome"><span class="stip-dot" style="background:${col[p.tipo]}"></span> ${escapeHtml(p.nome)}</span>
          <span class="fr-val num" style="${p.val < 0 ? 'color:var(--down)' : ''}">${p.val < 0 ? '−' : ''}${fmtEUR(Math.abs(p.val))}</span>
        </div>
        <div class="fr-bar"><div class="fr-fill" style="width:${Math.round(Math.abs(p.val) / max * 100)}%;background:${col[p.tipo]}"></div></div>
      </div>`;
    const chiave = ['complessivo', 'netta', 'rit'];
    const sintesi = w.passi.filter(p => chiave.includes(p.k));
    const resto = w.passi.filter(p => !chiave.includes(p.k));
    cont.innerHTML = sintesi.map(riga).join('') + `
      <div class="fr-head" style="padding-top:8px">
        <span class="fr-nome" style="font-weight:700">${w.credito ? 'A credito' : 'A debito'}<span class="meta" style="font-weight:500"> · aliquota reale ${w.aliquotaReale.toFixed(1)}%</span></span>
        <span class="fr-val num" style="font-size:16px;font-weight:750;color:var(--${w.credito ? 'up' : 'down'})">${fmtEUR(Math.abs(w.passi.find(p => p.k === 'saldo').val))}</span>
      </div>
      <div class="dich-head ${_apertiDich.passi ? 'on' : ''}" data-dich="passi" style="padding:8px 0 4px">
        <div class="b"><div class="r2">Tutti i passaggi del 730</div></div>
        <div class="dich-chev">›</div>
      </div>
      <div class="dich-body ${_apertiDich.passi ? 'on' : ''}" data-dichbody="passi" style="padding:6px 0 0">
        ${resto.map(riga).join('')}
        <div class="eprice-note" style="margin:6px 0 4px">${w.credito
    ? `Il credito è stato rimborsato in busta nel ${w.presentata}: ${fmtEUR(w.rimborso)}. La differenza rispetto al saldo IRPEF sono i conguagli sulle addizionali.`
    : 'Anno chiuso a debito.'}</div>
      </div>`;

    // deduzioni dello stesso anno
    const d = deduzioniAnno(_annoDich);
    root.querySelector('#dich-anno-ded').textContent = `· ${_annoDich}`;
    const cd = root.querySelector('#dich-ded');
    cd.innerHTML = !d || !d.voci.length
      ? '<div class="empty">Nessuna deduzione in quest\'anno</div>'
      : d.voci.map(v => `
          <div class="fr-row">
            <div class="fr-head">
              <span class="fr-nome">${v.nome}</span>
              <span class="fr-val num">${fmtEUR(v.val)}</span>
            </div>
            <div class="fr-sub">${v.nota}</div>
          </div>`).join('') + `
        <div class="fr-head" style="padding-top:6px">
          <span class="fr-nome" style="font-weight:700">Totale dedotto</span>
          <span class="fr-val num" style="font-weight:750">${fmtEUR(d.totale)}</span>
        </div>
        <div class="eprice-note" style="margin:6px 0 2px">Una deduzione abbassa il reddito su cui si calcola l'imposta, quindi vale quanto la tua aliquota marginale: al ${d.aliquotaMarginale}% questi ${fmtEUR(d.totale)} ti hanno fatto risparmiare circa <b>${fmtEUR(d.risparmioStimato)}</b> di IRPEF. È così che il reddito complessivo di ${fmtEUR(d.redditoComplessivo)} diventa imponibile di ${fmtEUR(d.imponibile)}.
        Il dettaglio della previdenza complementare — plafond, recupero da prima occupazione — sta in <b>Stipendi › Fondo pensione</b>.</div>`;
  };

  root.addEventListener('click', (e) => {
    const h = e.target.closest('[data-dich]');
    if (h) {
      const k = h.dataset.dich;
      _apertiDich[k] = !_apertiDich[k];
      h.classList.toggle('on', _apertiDich[k]);
      root.querySelector(`[data-dichbody="${k}"]`)?.classList.toggle('on', _apertiDich[k]);
      return;
    }
    const y = e.target.closest('[data-y]');
    if (!y) return;
    const k = y.dataset.y;
    _apertiDich[k] = !_apertiDich[k];
    y.classList.toggle('on', _apertiDich[k]);
    root.querySelector(`[data-ybody="${k}"]`)?.classList.toggle('on', _apertiDich[k]);
  });

  disAnno();
  root.querySelector('#dich-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoDich);
    if (i < anni.length - 1) { _annoDich = anni[i + 1]; root.querySelector('#dich-lbl').textContent = _annoDich; disAnno(); }
  });
  root.querySelector('#dich-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoDich);
    if (i > 0) { _annoDich = anni[i - 1]; root.querySelector('#dich-lbl').textContent = _annoDich; disAnno(); }
  });
};
