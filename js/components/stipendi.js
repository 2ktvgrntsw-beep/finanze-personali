// stipendi.js — Sezione Stipendi: storico buste paga sui quattro datori.
// HOME: hero ultima busta, KPI per anno (titolo cliccabile -> riepilogo mensile),
// netto anno per anno ripartito per datore, netto nel tempo (spike-line),
// scomposizione del lordo, heatmap netto mese × anno, confronto datori, storico.
// RIEPILOGO ANNO: stesse card + netto e scomposizione lordo MESE per MESE.
// DETTAGLIO BUSTA: scomposizione completa + voci notevoli.
//
// Riusa _barreImpilate() di energia.js (barre proporzionali con dettaglio a tap):
// stessa resa e stesse interazioni della sezione Energia, zero logica duplicata.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { _barreImpilate } from './energia.js';
import { COMETA, montante, rendimento } from '../core/cometaEstrattoConto.js';
import {
  DATORI, coloreDatore, ultimoStipendio, stipendioById, anniDisponibili,
  aggregatoAnno, variazioneAnno, nettoPerAnnoPerDatore, composizioneLordoAnnuale,
  nettoMensile, composizioneLordoMensile, confrontoDatori, heatmapNetto,
  versamentoFondoAnnuale, versamentoFondoTotale, SEG_FONDO,
  dettaglioFondoAnnuale, dettaglioFondoPerDatore,
  fiscoAnnuale, fiscoTotale, elencoRimborsi, SEG_FISCO, dettaglioTrattenute, verificaFiscale, SEG_LORDO,
  nettoGuadagnato,
  waterfallAnno, saldoDichiarazioni, plafondFondo, creditiFuturi, cassaRealeAnnuale, rimborsoAtteso,
  mese3, MESI3,
} from '../services/stipendiService.js';
import { DICHIARAZIONI, INTERVENTI_PLURIENNALI } from '../core/dichiarazioni.js';

const BUSTA = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M8 13h5"/></svg>';

// segmenti per le barre impilate
const SEG_DATORI = DATORI.map(d => ({ k: d.nome, nome: d.nome, colore: d.colore }));

// stato modulo
let _annoKpi = null;    // anno selezionato per le card KPI (home)
let _annoRiep = null;   // anno selezionato nella pagina Riepilogo

const _fmtVar = (v) => v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
// per il netto: salire = bene (verde). per l'aliquota/trattenute: salire = male (rosso).
const _clsUp = (v) => v == null ? '' : (v >= 0 ? 'up' : 'down');
const _clsDown = (v) => v == null ? '' : (v <= 0 ? 'up' : 'down');
const _leg = (segmenti) => `<div class="elegend">${segmenti.map(s =>
  `<span><i style="background:${s.colore}"></i>${escapeHtml(s.nome)}</span>`).join('')}</div>`;

// ═══════════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendi = async (root) => {
  document.getElementById('view-title').textContent = 'Stipendi';

  if (!state.stipendi.length) {
    root.innerHTML = `<div class="card" style="text-align:center;padding:40px 20px">
      <p class="meta" style="margin:12px 0">Nessuna busta paga in archivio.</p>
    </div>`;
    return;
  }

  const anni = anniDisponibili();
  if (_annoKpi == null || !anni.includes(_annoKpi)) _annoKpi = anni[0];

  const u = ultimoStipendio();
  const colU = coloreDatore(u.datore);

  root.innerHTML = `
    <!-- HERO ultima busta -->
    <div class="net-card energia-hero" style="border-top:3px solid ${colU}">
      <div class="net-row">
        <div class="ehero-forn"><span class="stip-dot" style="background:${colU}"></span> Ultima busta · <b>${escapeHtml(u.datore)}</b><br><span class="meta">${escapeHtml(u.periodo)}</span></div>
        ${u.tredicesima_inclusa ? `<span class="ebadge">13ª inclusa</span>` : ''}
      </div>
      <div class="ehero-imp num">${fmtEUR(nettoGuadagnato(u))}</div>
      <div class="ehero-meta">
        <div><div class="k">Lordo</div><div class="v num">${fmtEUR(u.lordo)}</div></div>
        <div><div class="k">Trattenute</div><div class="v num">${fmtEUR(u.trattenute)}</div></div>
        <div><div class="k">TFR a fondo</div><div class="v num">${fmtEUR(u.tfr_a_fondo_pensione)}</div></div>
      </div>
    </div>

    <!-- RIEPILOGO ANNO (titolo cliccabile -> pagina dettaglio mensile) -->
    <div class="section-lbl" style="margin-top:14px">
      <span class="lbl-link" id="apri-riepilogo" role="button">Riepilogo anno <span class="lbl-chev">›</span></span>
      <div class="eyear" id="skpi-year">
        <button id="skpi-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="skpi-lbl">${_annoKpi}</span>
        <button id="skpi-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="ekpis" id="skpis"></div>

    <!-- NETTO ANNO PER ANNO (ripartito per datore) -->
    <!-- FISCO: pagato vs restituito -->
    <div class="section-lbl"><span>Netto percepito · anno per anno</span></div>
    <div class="card">
      ${_leg(SEG_DATORI)}
      <div class="estack" id="g-netto"></div>
    </div>

    <div class="section-lbl"><span>Fondo pensione</span></div>
    <div class="card eboll" id="vedi-fondo" style="cursor:pointer">
      <div class="eboll-body">
        <div class="eboll-r1"><span class="eboll-nm">Versato a Cometa</span><span class="eboll-imp num">${fmtEUR(versamentoFondoTotale().tot)}</span></div>
        <div class="eboll-r2"><span class="eboll-sub">${(() => { const t = versamentoFondoTotale(); return `TFR ${fmtEUR(t.tfr)} · tuo ${fmtEUR(t.dip)} · datore ${fmtEUR(t.az)}`; })()}</span></div>
      </div>
      <div class="eboll-chev">›</div>
    </div>

    <div class="section-lbl"><span>Fisco</span></div>
    <div class="card eboll" id="vedi-fisco" style="cursor:pointer">
      <div class="body" style="flex:1">
        <div class="lbl2">Imposte pagate sul lavoro</div>
        <div class="num" style="font-size:24px;font-weight:750">${fmtEUR(fiscoTotale().pagato)}</div>
        <div class="meta" style="margin-top:4px">di cui <b style="color:var(--up)">${fmtEUR(fiscoTotale().rimborso)}</b> restituiti col 730 (${fiscoTotale().quotaRestituita}%)</div>
      </div>
      <div class="eboll-chev">›</div>
    </div>
    ${(() => {
      // Soldi in viaggio: il 730 dice che devono arrivare, le buste dicono che non sono
      // ancora arrivati. E' l'unica cosa della sezione Dichiarazioni che merita la home.
      const a = rimborsoAtteso();
      return a ? `<div class="card eboll" id="vedi-dich-home" style="cursor:pointer;border-left:3px solid var(--up)">
        <div class="body" style="flex:1">
          <div class="lbl2">Rimborso 730 in arrivo</div>
          <div class="num" style="font-size:20px;font-weight:750;color:var(--up)">${fmtEUR(a.residuo)}</div>
          <div class="meta" style="margin-top:4px">dal 730 sui redditi ${a.anno} · accreditato in busta nel corso del ${a.presentata}</div>
        </div>
        <div class="eboll-chev">›</div>
      </div>` : '';
    })()}

    <!-- SCOMPOSIZIONE LORDO anno per anno -->
    <div class="section-lbl"><span>Dove va il lordo · anno per anno</span></div>
    <div class="card">
      ${_leg(SEG_LORDO)}
      <div class="estack" id="g-lordo"></div>
    </div>

    <!-- HEATMAP netto -->
    <div class="section-lbl"><span>Netto mese × anno</span></div>
    <div class="card" style="padding:14px 10px">
      <div id="s-heatmap"></div>
    </div>

    <!-- CONFRONTO DATORI -->
    <div class="section-lbl"><span>Confronto datori</span></div>
    <div class="card" id="s-datori"></div>

    <!-- STORICO -->
    <div class="section-lbl"><span>Storico buste</span><span class="act" id="vedi-tutte">Tutte (${state.stipendi.length}) ›</span></div>
    <div class="card" style="padding:0" id="s-storico">
      ${stipendiRecenti(4).map(b => _rigaStipendioHTML(b)).join('<div class="divider"></div>')}
    </div>

    <button class="btn btn-primary btn-lg" id="nuova-busta" style="margin:18px auto 8px;display:block">+ Aggiungi busta paga</button>
  `;

  _renderKpi(root);
  _barreImpilate(
    root.querySelector('#g-netto'),
    nettoPerAnnoPerDatore().map(d => ({ label: `'${String(d.anno).slice(2)}`, valori: d.valori, tot: d.tot })),
    SEG_DATORI, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'),
  );
  _barreImpilate(
    root.querySelector('#g-lordo'),
    composizioneLordoAnnuale().map(d => ({ label: `'${d.anno.slice(2)}`, valori: d.valori, tot: d.tot })),
    SEG_LORDO, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'),
  );
  _renderHeatmap(root.querySelector('#s-heatmap'));
  _renderDatori(root.querySelector('#s-datori'), u.datore);

  // riepilogo anno cliccabile -> pagina mensile
  root.querySelector('#apri-riepilogo').addEventListener('click', () => { _annoRiep = _annoKpi; navigate('stipendi-anno'); });

  // navigazione anno card KPI (mutazione locale)
  root.querySelector('#skpi-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i < anni.length - 1) { _annoKpi = anni[i + 1]; root.querySelector('#skpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });
  root.querySelector('#skpi-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoKpi);
    if (i > 0) { _annoKpi = anni[i - 1]; root.querySelector('#skpi-lbl').textContent = _annoKpi; _renderKpi(root); }
  });

  const nb = root.querySelector('#nuova-busta');
  if (nb) nb.addEventListener('click', () => navigate('stipendio-nuovo'));
  const vfi = root.querySelector('#vedi-fisco');
  if (vfi) vfi.addEventListener('click', () => navigate('stipendi-fisco'));
  const vdh = root.querySelector('#vedi-dich-home');
  if (vdh) vdh.addEventListener('click', () => navigate('stipendi-dichiarazioni'));
  const vf = root.querySelector('#vedi-fondo');
  if (vf) vf.addEventListener('click', () => navigate('stipendi-fondo'));
  const vt = root.querySelector('#vedi-tutte');
  if (vt) vt.addEventListener('click', () => navigate('stipendi-storico'));

  root.querySelectorAll('[data-stip]').forEach(el =>
    el.addEventListener('click', () => navigate('stipendio-dettaglio', { id: el.dataset.stip })));
};

const _fiscoTotHTML = () => {
  const t = fiscoTotale();
  return `Imposte pagate: <b class="num">${fmtEUR(t.pagato)}</b> — restituite col 730 <b class="num">${fmtEUR(t.rimborso)}</b> (${t.quotaRestituita}%). Rimaste allo Stato: ${fmtEUR(t.netto)}.`;
};

// riga riepilogo totale versato al fondo (sotto le barre)
const _fondoTotHTML = () => {
  const t = versamentoFondoTotale();
  return `Totale versato al fondo: <b class="num">${fmtEUR(t.tot)}</b> — TFR ${fmtEUR(t.tfr)} · mio ${fmtEUR(t.dip)} · datore ${fmtEUR(t.az)}. Sono versamenti reali: inclusi tutti i mesi.`;
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA FISCO: quanto hai pagato di imposte e quanto ti è tornato indietro
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendiFisco = async (root) => {
  document.getElementById('view-title').textContent = 'Fisco e rimborsi';
  const t = fiscoTotale();
  const perAnno = fiscoAnnuale();
  const rimborsi = elencoRimborsi();
  const quota = (v) => t.pagato ? Math.round(v / t.pagato * 100) : 0;

  root.innerHTML = `
    <div class="net-card" style="margin-top:4px">
      <div class="lbl2">Imposte pagate sul lavoro</div>
      <div class="num" style="font-size:30px;font-weight:750">${fmtEUR(t.pagato)}</div>
      <div class="meta" style="margin-top:4px">di cui <b style="color:var(--up)">${fmtEUR(t.rimborso)}</b> tornati indietro col 730 (${t.quotaRestituita}%)</div>
    </div>

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

    <div class="section-lbl"><span>Trattenuto e dovuto</span><span class="act" id="vedi-dich">Dichiarazioni ›</span></div>
    <div class="card" style="padding:4px 14px">
      ${verificaFiscale().map(v => v.fonte !== '730' ? `
        <div class="paniere-anno-riga">
          <span class="num anno">${v.anno} <span class="meta">${escapeHtml(v.datori.join(' + '))}</span></span>
          <b class="num">${v.irpefTrattenuta == null ? '—' : fmtEUR(v.irpefTrattenuta)}</b>
          <span class="delta num">730 non ancora presentato</span>
        </div>` : `
        <div class="paniere-anno-riga">
          <span class="num anno">${v.anno} <span class="meta">${escapeHtml(v.datori.join(' + '))}</span></span>
          <b class="num">${fmtEUR(v.impostaNetta)}</b>
          <span class="delta ${v.eccedenza > 100 ? 'ko' : 'ok'} num">${v.eccedenza > 0 ? '+' + fmtEUR(v.eccedenza) : 'in linea'}</span>
        </div>
        <div class="fr-sub" style="margin:-4px 0 8px">dovuta ${fmtEUR(v.impostaNetta)} · trattenuta ${fmtEUR(v.irpefTrattenuta)}${v.eccedenza > 0 ? ` · restituiti ${fmtEUR(v.rimborso)} nel ${v.presentata}` : ''} · aliquota reale ${v.aliquotaReale.toFixed(1)}%${v.piuDatori ? ' · due datori' : ''}${Math.abs(v.scartoArchivio) > 1 ? ` · <span style="color:var(--warn)">somma buste ${fmtEUR(v.sommaIrpef)}</span>` : ''}</div>
      `).join('')}
      <div class="eprice-note" style="margin:4px 0 10px">La colonna centrale è l'imposta <b>davvero dovuta</b> secondo il 730, non quella trattenuta. A destra quanto il datore ha trattenuto in più: non è un errore suo — applica gli scaglioni al solo stipendio e non conosce le tue detrazioni edilizie — ma sono soldi che restano fermi all'erario fino al rimborso dell'anno dopo.</div>
    </div>

    <div class="section-lbl"><span>Rimborsi 730 ricevuti</span></div>
    <div class="card" style="padding:4px 14px">
      ${rimborsi.length ? rimborsi.map(r => `
        <div class="paniere-anno-riga">
          <span class="num anno">${MESI3[r.mese - 1]} ${r.anno}</span>
          <b class="num" style="color:var(--up)">+${fmtEUR(r.importo)}</b>
        </div>
        <div class="fr-sub" style="margin:-4px 0 8px">${escapeHtml(r.datore)}${r.annoImposta ? ` · conguaglio dell'anno d'imposta ${r.annoImposta}` : ''}</div>
      `).join('') : '<div class="empty">Nessun rimborso registrato</div>'}
    </div>

    <div class="section-lbl"><span>Anno per anno</span></div>
    <div class="card" style="padding:4px 14px" data-noline>
      ${perAnno.map(a => `
        <div class="paniere-anno-riga">
          <span class="num anno">${a.anno}</span>
          <b class="num">${fmtEUR(a.pagato)}</b>
          <span class="delta ${a.rimborso ? 'ok' : ''} num">${a.rimborso ? '+' + fmtEUR(a.rimborso) : '—'}</span>
        </div>
        <div class="fr-sub" style="margin:-4px 0 8px">IRPEF ${fmtEUR(a.irpef)}${a.addReg ? ` · reg. ${fmtEUR(a.addReg)}` : ''}${a.addCom ? ` · com. ${fmtEUR(a.addCom)}` : ''}${a.rimborso ? ` · rimborso ricevuto ${fmtEUR(a.rimborso)}` : ''}</div>
      `).join('')}
    </div>

    <div class="card">
      <div class="meta">La colonna a destra è il <b>rimborso incassato in quell'anno</b>: il 730 restituisce
      quasi sempre imposte dell'anno precedente, quindi non confrontarlo con l'IRPEF della stessa riga.
      Dove la busta lo dichiara, sotto il rimborso trovi l'anno d'imposta a cui si riferisce.
      Il rimborso è un credito che ti viene accreditato in busta: non riduce le trattenute del mese,
      per questo lo tengo separato.</div>
    </div>
  `;

  root.querySelector('#vedi-dich')?.addEventListener('click', () => navigate('stipendi-dichiarazioni'));
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA DICHIARAZIONI (730)
//
// Su un telefono una pagina lunga non si consulta: si scorre e si perde. Quindi qui
// ogni blocco si presenta con UNA riga — il numero che conta e la frase che lo spiega —
// e si apre al tocco. Chiusa, la pagina sta in una schermata; aperta, dice tutto.
// Lo stesso schema della sezione Categorie, per non inventare un'interazione nuova.
// ═══════════════════════════════════════════════════════════════════════════
let _annoDich = null;
let _apertiDich = { fondo: false, crediti: false, cassa: false, passi: false };

const _blocco = (k, nome, imp, sotto, corpo, colore) => `
  <div class="card" style="padding:0;overflow:hidden">
    <div class="dich-head ${_apertiDich[k] ? 'on' : ''}" data-dich="${k}">
      <div class="b">
        <div class="r1"><span class="nm">${nome}</span><span class="imp num"${colore ? ` style="color:${colore}"` : ''}>${imp}</span></div>
        <div class="r2">${sotto}</div>
      </div>
      <div class="dich-chev">›</div>
    </div>
    <div class="dich-body ${_apertiDich[k] ? 'on' : ''}" data-dichbody="${k}">${corpo}</div>
  </div>`;

export const renderStipendiDichiarazioni = async (root) => {
  document.getElementById('view-title').textContent = 'Dichiarazioni';
  const anni = DICHIARAZIONI.map(d => d.anno).sort((a, b) => b - a);
  if (_annoDich == null || !anni.includes(_annoDich)) _annoDich = anni[0];
  const s = saldoDichiarazioni();
  const pf = plafondFondo();
  const ultimoPf = pf.serie[pf.serie.length - 1];
  const cred = creditiFuturi(anni[0] + 1);
  const cassa = cassaRealeAnnuale().slice().reverse();
  const scalino = cred.righe.length > 1 ? cred.righe[0].tot - cred.righe[1].tot : 0;

  // ── FONDO PENSIONE: corpo ────────────────────────────────────────────────
  const corpoFondo = `
    <div class="fr-row">
      <div class="fr-head">
        <span class="fr-nome">Plafond arretrato da prima occupazione</span>
        <span class="fr-val num" style="color:var(--up)">${fmtEUR(pf.residuo)}</span>
      </div>
      <div class="fr-sub">Nei primi cinque anni di adesione a Cometa (${pf.primiCinqueAnni[0]}-${pf.primiCinqueAnni[4]}) hai dedotto ${fmtEUR(pf.dedottoNeiPrimiCinque)} sui ${fmtEUR(pf.tettoOrdinario * 5)} possibili. Quel margine non è perso: si recupera fino al ${pf.scadenza}, al massimo ${fmtEUR(pf.incrementoAnnuo)} l'anno.</div>
    </div>
    <div class="fr-row">
      <div class="fr-head">
        <span class="fr-nome">Tetto deducibile quest'anno</span>
        <span class="fr-val num">${fmtEUR(pf.tettoAnnuo)}</span>
      </div>
      <div class="fr-sub">${fmtEUR(pf.tettoOrdinario)} di tetto ordinario + ${fmtEUR(pf.incrementoAnnuo)} di recupero. L'incremento non è mai stato chiesto: dal ${pf.primiCinqueAnni[4] + 1} in poi il rigo E28 del 730 è vuoto.</div>
    </div>
    <div class="section-lbl" style="margin:10px 0 6px"><span>Contributi dedotti · anno per anno</span></div>
    ${pf.serie.slice().reverse().map(r => `
      <div class="paniere-anno-riga">
        <span class="num anno">${r.anno}</span>
        <b class="num">${fmtEUR(r.dedotto)}</b>
        <span class="delta num" style="color:var(--txt-3)">${r.quota}% del tetto</span>
      </div>
      ${r.primaOccupazione ? `<div class="fr-sub" style="margin:-4px 0 8px">di cui ${fmtEUR(r.primaOccupazione)} come prima occupazione</div>` : ''}
    `).join('')}
    <div class="eprice-note" style="margin:6px 0 10px">Sono i contributi versati a Cometa — la tua quota più quella del datore — che il 730 porta in deduzione dal reddito. Il TFR conferito non entra nel conto: non è deducibile e non consuma il tetto.</div>`;

  // ── CREDITI FUTURI: corpo ────────────────────────────────────────────────
  const corpoCrediti = `
    ${cred.righe.map(r => `
      <div class="paniere-anno-riga">
        <span class="num anno">${r.anno}</span>
        <b class="num">${fmtEUR(r.tot)}</b>
        <span class="delta num" style="color:var(--txt-3)">${r.voci.length} ${r.voci.length === 1 ? 'rata' : 'rate'}</span>
      </div>`).join('')}
    <div class="eprice-note" style="margin:6px 0 10px">Rate di bonus edilizi e arredo già maturate: lo sconto arriva comunque, fino al ${cred.ultimoAnno}. Il salto è nel ${cred.righe[1] ? cred.righe[1].anno : ''}: finisce la rata grossa dell'intervento del 2017 e l'imposta netta risale di circa ${fmtEUR(scalino)} l'anno.</div>`;

  // ── CASSA REALE: corpo ───────────────────────────────────────────────────
  const corpoCassa = `
    ${cassa.map(c => `
      <div class="paniere-anno-riga">
        <span class="num anno">${c.anno}${c.parziale ? ' <span class="meta">' + c.mesi + ' buste</span>' : ''}</span>
        <b class="num">${fmtEUR(c.tot)}</b>
        <span class="delta ${c.rimborsoIncassato ? 'ok' : ''} num">${c.rimborsoIncassato ? '+' + fmtEUR(c.rimborsoIncassato) : '—'}</span>
      </div>
      ${!c.rimborsoIncassato && c.rimborsoPrevisto ? `<div class="fr-sub" style="margin:-4px 0 8px">atteso ${fmtEUR(c.rimborsoPrevisto)} dal 730 sui redditi ${c.annoImpostaRimborso}</div>` : ''}
    `).join('')}
    <div class="eprice-note" style="margin:6px 0 10px">Il rimborso non è retribuzione e resta fuori dal netto, ma in banca ci arriva: qui le due cose sono rimesse insieme per dire quanto è entrato davvero in un anno solare.</div>`;

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

    <div class="section-lbl"><span>Fondo pensione · deduzione</span></div>
    ${_blocco('fondo', `Dedotto nel ${ultimoPf.anno}`, fmtEUR(ultimoPf.dedotto),
      `${ultimoPf.quota}% del tetto · ${fmtEUR(ultimoPf.nonUsato)} di contributi che potevi ancora dedurre`,
      corpoFondo)}

    <div class="section-lbl"><span>Detrazioni edilizie già acquisite</span></div>
    ${_blocco('crediti', 'Ancora da incassare', fmtEUR(cred.residuoTotale),
      `${fmtEUR(cred.righe[0].tot)} nel ${cred.righe[0].anno}, poi scende · ultima rata nel ${cred.ultimoAnno}`,
      corpoCrediti, 'var(--up)')}

    <div class="section-lbl"><span>Cassa reale · netto più rimborsi</span></div>
    ${_blocco('cassa', `Entrato nel ${cassa[0].anno}`, fmtEUR(cassa[0].tot),
      `${cassa[0].parziale ? `anno in corso, ${cassa[0].mesi} buste · ` : ''}netto ${fmtEUR(cassa[0].netto)}${cassa[0].rimborsoIncassato ? ` · rimborso 730 ${fmtEUR(cassa[0].rimborsoIncassato)}` : (cassa[0].rimborsoPrevisto ? ` · attesi ${fmtEUR(cassa[0].rimborsoPrevisto)} dal 730` : '')}`,
      corpoCassa)}
  `;

  // ── blocco ANNO: tre righe sempre visibili, il resto a scomparsa ─────────
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
    // le tre righe che rispondono alla domanda "quanto ho guadagnato, quanto dovevo,
    // quanto mi hanno preso": il resto del percorso e' dettaglio, e sta sotto.
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
  };

  // Un gestore solo, in delega sulla pagina: cosi' vale anche per i blocchi che
  // vengono ridisegnati quando si cambia anno, senza riagganciare niente.
  root.addEventListener('click', (e) => {
    const h = e.target.closest('[data-dich]');
    if (!h) return;
    const k = h.dataset.dich;
    _apertiDich[k] = !_apertiDich[k];
    h.classList.toggle('on', _apertiDich[k]);
    root.querySelector(`[data-dichbody="${k}"]`)?.classList.toggle('on', _apertiDich[k]);
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

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA FONDO PENSIONE (Cometa + TFR): dettaglio per anno e per datore
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendiFondo = async (root) => {
  document.getElementById('view-title').textContent = 'Fondo pensione';
  const t = versamentoFondoTotale();
  const perAnno = dettaglioFondoAnnuale();
  const perDatore = dettaglioFondoPerDatore();
  const quota = (v) => t.tot ? Math.round(v / t.tot * 100) : 0;
  // Il versato lo sanno le buste, il DEDOTTO lo sa solo il 730: le due pagine si parlano.
  const pf = plafondFondo();
  const ultimoPf = pf.serie[pf.serie.length - 1];

  root.innerHTML = `
    <div class="net-card" style="margin-top:4px">
      <div class="lbl2">Totale versato a Cometa</div>
      <div class="num" style="font-size:30px;font-weight:750">${fmtEUR(t.tot)}</div>
      <div class="meta" style="margin-top:4px">${state.stipendi.length} buste · dal 2016 a oggi</div>
    </div>

    <div class="card eboll" id="fondo-vedi-dich" style="cursor:pointer">
      <div class="body" style="flex:1">
        <div class="lbl2">Dedotto dal reddito nel ${ultimoPf.anno} (dal 730)</div>
        <div class="num" style="font-size:20px;font-weight:750">${fmtEUR(ultimoPf.dedotto)} <span class="meta" style="font-weight:500">su ${fmtEUR(pf.tettoOrdinario)}</span></div>
        <div class="meta" style="margin-top:4px">${fmtEUR(ultimoPf.nonUsato)} di contributi che potevi ancora dedurre · con il recupero da prima occupazione il tetto salirebbe a ${fmtEUR(pf.tettoAnnuo)}</div>
      </div>
      <div class="eboll-chev">›</div>
    </div>

    <div class="card" style="border-left:3px solid var(--up)">
      <div class="lbl2">Quanto vale oggi (estratto conto Cometa)</div>
      <div class="num" style="font-size:26px;font-weight:750">${fmtEUR(montante())}</div>
      <div class="meta" style="margin-top:4px">${COMETA.quote.toLocaleString('it-IT')} quote × ${fmtEUR(COMETA.valoreQuota)} al ${COMETA.aggiornatoAl.split('-').reverse().join('/')} —
      <b style="color:var(--up)">${rendimento().valore >= 0 ? '+' : ''}${fmtEUR(rendimento().valore)} (${rendimento().perc}%)</b> rispetto al versato.
      Comparto Crescita da giugno 2022, prima Monetario Plus.</div>
    </div>

    <div class="section-lbl"><span>Da dove arriva</span></div>
    <div class="card">
      ${[['TFR devoluto', t.tfr, SEG_FONDO[0].colore, 'Il tuo TFR versato al fondo invece che in azienda'],
         ['Cometa — quota tua', t.dip, SEG_FONDO[1].colore, 'Trattenuta dalla busta (4% dell\'imponibile)'],
         ['Cometa — quota datore', t.az, SEG_FONDO[2].colore, 'Versata dall\'azienda, non esce dalla tua busta']]
        .map(([nome, val, col, nota]) => `
        <div class="fr-row">
          <div class="fr-head">
            <span class="fr-nome"><span class="stip-dot" style="background:${col}"></span> ${nome}</span>
            <span class="fr-val num">${fmtEUR(val)}</span>
          </div>
          <div class="fr-bar"><div class="fr-fill" style="width:${quota(val)}%;background:${col}"></div></div>
          <div class="fr-sub">${quota(val)}% del totale · ${nota}</div>
        </div>`).join('')}
    </div>

    <div class="section-lbl"><span>Chi ha versato</span></div>
    <div class="card" style="padding:4px 14px" data-noline>
      ${perDatore.map(f => `
        <div class="paniere-anno-riga">
          <span class="fr-nome"><span class="stip-dot" style="background:${f.colore}"></span> ${escapeHtml(f.datore)}</span>
          <b class="num">${fmtEUR(f.tot)}</b>
        </div>
        <div class="fr-sub" style="margin:-4px 0 8px">TFR ${fmtEUR(f.tfr)} · tua ${fmtEUR(f.dip)} · datore ${fmtEUR(f.az)}</div>
      `).join('')}
    </div>

    <div class="section-lbl"><span>Versato anno per anno</span></div>
    <div class="card">
      ${_leg(SEG_FONDO)}
      <div class="estack" id="g-fondo-anno"></div>
    </div>

    <div class="section-lbl"><span>Dettaglio per anno</span></div>
    <div class="card" style="padding:4px 14px" data-noline>
      ${perAnno.map(a => `
        <div class="paniere-anno-riga">
          <span class="num anno">${a.anno}</span>
          <b class="num">${fmtEUR(a.tot)}</b>
          <span class="delta num" style="color:var(--txt-3)">${a.mesi} buste</span>
        </div>
        <div class="fr-sub" style="margin:-4px 0 8px">TFR ${fmtEUR(a.tfr)} · tua ${fmtEUR(a.dip)} · datore ${fmtEUR(a.az)}</div>
      `).join('')}
    </div>

    <div class="card">
      <div class="meta">Quello che vedi qui è il <b>versato</b>, non il valore attuale della posizione:
      Cometa investe i contributi, quindi il montante sul tuo estratto conto sarà diverso (di solito più alto).
      Il TFR e la quota tua escono dalla busta; la quota del datore è un'aggiunta che non passa dal netto.</div>
    </div>
  `;

  _barreImpilate(
    root.querySelector('#g-fondo-anno'),
    versamentoFondoAnnuale().map(d => ({ label: `'${String(d.anno).slice(2)}`, valori: d.valori, tot: d.tot })),
    SEG_FONDO, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'),
  );
  root.querySelector('#fondo-vedi-dich')?.addEventListener('click', () => navigate('stipendi-dichiarazioni'));
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA STORICO (tutte le buste, per anno)
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendiStorico = async (root) => {
  document.getElementById('view-title').textContent = 'Storico buste';
  const anni = anniDisponibili();
  root.innerHTML = anni.map(anno => {
    const buste = state.stipendi.filter(s => String(s.anno) === anno).sort((a, b) => b.mese - a.mese);
    const tot = buste.reduce((s, b) => s + nettoGuadagnato(b), 0);
    return `<div class="section-lbl"><span>${anno}</span><span class="meta num">${fmtEUR(tot)}</span></div>
      <div class="card" style="padding:0">${buste.map(b => _rigaStipendioHTML(b)).join('<div class="divider"></div>')}</div>`;
  }).join('');
  root.querySelectorAll('[data-stip]').forEach(el =>
    el.addEventListener('click', () => navigate('stipendio-dettaglio', { id: el.dataset.stip })));
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA RIEPILOGO ANNO
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendiAnno = async (root) => {
  const anni = anniDisponibili();
  if (_annoRiep == null || !anni.includes(_annoRiep)) _annoRiep = anni[0];
  document.getElementById('view-title').textContent = `Stipendi ${_annoRiep}`;

  root.innerHTML = `
    <div class="section-lbl" style="margin-top:4px"><span>Riepilogo anno</span>
      <div class="eyear">
        <button id="sr-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="sr-lbl">${_annoRiep}</span>
        <button id="sr-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div class="ekpis" id="sr-kpis"></div>

    <div class="section-lbl"><span>Netto · mese per mese</span></div>
    <div class="card">
      ${_leg(SEG_DATORI)}
      <div class="estack" id="sr-netto"></div>
    </div>

    <div class="section-lbl"><span>Dove va il lordo · mese per mese</span></div>
    <div class="card">
      ${_leg(SEG_LORDO)}
      <div class="estack" id="sr-lordo"></div>
    </div>

    <div class="section-lbl"><span>Buste del ${_annoRiep}</span></div>
    <div class="card" style="padding:0" id="sr-buste"></div>
  `;

  const disegna = () => {
    document.getElementById('view-title').textContent = `Stipendi ${_annoRiep}`;
    root.querySelector('#sr-lbl').textContent = _annoRiep;
    _renderKpiIn(root.querySelector('#sr-kpis'), _annoRiep);
    _barreImpilate(root.querySelector('#sr-netto'),
      nettoMensile(_annoRiep).map(d => ({ label: d.label, valori: d.valori, tot: d.tot })),
      SEG_DATORI, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'));
    _barreImpilate(root.querySelector('#sr-lordo'),
      composizioneLordoMensile(_annoRiep).map(d => ({ label: d.label, valori: d.valori, tot: d.tot })),
      SEG_LORDO, v => fmtEUR(v), v => Math.round(v).toLocaleString('it-IT'));
    const buste = state.stipendi.filter(s => String(s.anno) === String(_annoRiep)).sort((a, b) => b.mese - a.mese);
    root.querySelector('#sr-buste').innerHTML = buste.map(b => _rigaStipendioHTML(b)).join('<div class="divider"></div>');
    root.querySelectorAll('#sr-buste [data-stip]').forEach(el =>
      el.addEventListener('click', () => navigate('stipendio-dettaglio', { id: el.dataset.stip })));
  };
  disegna();

  root.querySelector('#sr-prev').addEventListener('click', () => {
    const i = anni.indexOf(_annoRiep);
    if (i < anni.length - 1) { _annoRiep = anni[i + 1]; disegna(); }
  });
  root.querySelector('#sr-next').addEventListener('click', () => {
    const i = anni.indexOf(_annoRiep);
    if (i > 0) { _annoRiep = anni[i - 1]; disegna(); }
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA DETTAGLIO BUSTA
// ═══════════════════════════════════════════════════════════════════════════
export const renderStipendioDettaglio = async (root, params) => {
  const b = stipendioById(params.id);
  if (!b) { root.innerHTML = '<div class="empty" style="padding:40px 0">Busta non trovata.</div>'; return; }
  const col = coloreDatore(b.datore);
  document.getElementById('view-title').textContent = b.periodo;

  const cometa = b.cometa_dipendente || 0;
  const fisco = Math.max(0, (b.trattenute || 0) - cometa - (b.addebiti_netti || 0));
  const comp = [
    { nome: 'Netto guadagnato', val: nettoGuadagnato(b), colore: '#22E39A' },
    { nome: 'Fisco e contributi', val: fisco, colore: '#FF3B5C' },
    { nome: 'Cometa (previdenza)', val: cometa, colore: '#7B6CFF' },
  ].filter(v => v.val > 0);
  const somma = comp.reduce((s, v) => s + v.val, 0) || 1;

  // righe di dettaglio (mostro solo quelle valorizzate)
  const righe = [
    ['Lordo (competenze)', b.lordo],
    ['Trattenute totali', b.trattenute],
    ['— di cui fisco e contributi', fisco],
    ['— di cui Cometa dipendente', cometa],
    ['Netto guadagnato', nettoGuadagnato(b)],
    ['— di cui addebiti in busta (auto, mensa)', b.addebiti_netti],
    ['TFR a fondo pensione', b.tfr_a_fondo_pensione],
    ['Premi detassati', b.premi_detassati],
    ['Rimborso 730 (escluso dal netto)', b.rimborso_fiscale_escluso],
    // dettaglio fiscale extra (solo Marposs/SASIB)
    ['Contributi INPS', b.contributi_inps],
    ['IRPEF netta', b.irpef_netta],
    ['Addizionale regionale', b.addizionale_regionale],
    ['Addizionale comunale', b.addizionale_comunale],
    ['Cometa azienda', b.cometa_azienda],
  ].filter(([, v]) => v != null && v !== 0);

  root.innerHTML = `
    <div class="net-card" style="border-top:3px solid ${col}">
      <div class="net-row">
        <div><span class="stip-dot" style="background:${col}"></span> <b>${escapeHtml(b.datore)}</b> · <span class="meta">${escapeHtml(b.periodo)}</span></div>
        ${b.tredicesima_inclusa ? `<span class="ebadge">13ª inclusa</span>` : ''}
      </div>
      <div class="ehero-imp num" style="margin-top:6px">${fmtEUR(nettoGuadagnato(b))}</div>
      <div class="meta" style="margin-top:2px">netto guadagnato${b.addebiti_netti ? ` · ${fmtEUR(b.addebiti_netti)} di addebiti in busta` : ''}</div>
    </div>

    ${(b.partite_di_giro > 0 || b.cessazione) ? `<div class="card" style="border-left:3px solid var(--warn)">
      <div class="meta">${b.cessazione ? 'Busta di <b>fine rapporto</b>: comprende liquidazione ferie/permessi e conguagli. È contata nei totali come tutte le altre.<br>' : ''}${b.partite_di_giro > 0
        ? `In questa busta ci sono <b>${fmtEUR(b.partite_di_giro)}</b> di partite di giro (recupero anticipo / assenze retribuite): comparivano sia fra le competenze sia fra le trattenute e si annullavano. Le ho tolte da entrambi i lati, così il lordo è quello vero. Il netto non è stato toccato.` : ''}</div>
    </div>` : ''}

    <div class="section-lbl"><span>Le tue trattenute, voce per voce</span></div>
    <div class="card" style="padding:4px 14px">
      ${(() => {
        const t = dettaglioTrattenute(b);
        const righe = t.voci.map(v => `
          <div class="paniere-anno-riga">
            <span class="fr-nome"><span class="stip-dot" style="background:${v.colore}"></span> ${v.nome}</span>
            <b class="num">${fmtEUR(v.val)}</b>
          </div>`).join('');
        const res = Math.abs(t.residuo) > 0.02 ? `
          <div class="paniere-anno-riga">
            <span class="fr-nome"><span class="stip-dot" style="background:#5A6274"></span> Non dettagliato</span>
            <b class="num">${fmtEUR(t.residuo)}</b>
          </div>` : '';
        return (righe || res) ? righe + res + `
          <div class="divider"></div>
          <div class="paniere-anno-riga"><span class="fr-nome"><b>Totale trattenute</b></span><b class="num">${fmtEUR(t.totale)}</b></div>`
          : '<div class="empty" style="padding:8px 0">Dettaglio non disponibile per questa busta</div>';
      })()}
    </div>
    ${b.fonte === 'trascritto' ? `<div class="eprice-note" style="margin-top:-4px">Busta trascritta da archivio: il PDF originale è una scansione, non rileggibile voce per voce.</div>` : ''}

    ${(b.imponibile_inps || b.imponibile_irpef || b.irpef_lorda) ? `
    <div class="section-lbl"><span>Imponibili e imposta</span></div>
    <div class="card" style="padding:4px 14px">
      ${b.imponibile_inps ? `<div class="paniere-anno-riga"><span class="fr-nome">Imponibile INPS</span><b class="num">${fmtEUR(b.imponibile_inps)}</b></div>` : ''}
      ${b.imponibile_irpef ? `<div class="paniere-anno-riga"><span class="fr-nome">Imponibile IRPEF</span><b class="num">${fmtEUR(b.imponibile_irpef)}</b></div>` : ''}
      ${b.irpef_lorda ? `<div class="paniere-anno-riga"><span class="fr-nome">IRPEF lorda</span><b class="num">${fmtEUR(b.irpef_lorda)}</b></div>` : ''}
      ${b.detrazioni ? `<div class="paniere-anno-riga"><span class="fr-nome">Detrazioni</span><b class="num" style="color:var(--up)">−${fmtEUR(b.detrazioni)}</b></div>` : ''}
      ${b.irpef_netta ? `<div class="paniere-anno-riga"><span class="fr-nome">IRPEF trattenuta</span><b class="num">${fmtEUR(b.irpef_netta)}</b></div>` : ''}
    </div>` : ''}

    ${b.quadratura_annuale ? `<div class="card" style="border-left:3px solid var(--violet)">
      <div class="meta">Su questa busta è riportata la <b>quadratura annuale</b>: la differenza fra le buste che ho potuto leggere e il totale certificato dal datore nel conguaglio di dicembre. I PDF non contengono le buste "AGG." della tredicesima, e quella differenza appartiene proprio a dicembre — così l'anno chiude al centesimo sul dato ufficiale.</div>
    </div>` : ''}

    ${b.rimborso_730 ? `<div class="card" style="border-left:3px solid var(--up)">
      <div class="meta">In questa busta hai ricevuto un <b>rimborso 730 di ${fmtEUR(b.rimborso_730)}</b>${b.rimborso_730_anno ? ` (conguaglio dell'anno d'imposta ${b.rimborso_730_anno})` : ''}. È un credito accreditato, non una trattenuta: per questo non compare qui sopra.</div>
    </div>` : ''}

    <div class="btn-row" style="margin:4px 0 12px">
      <button class="btn btn-secondary" id="stip-modifica">Modifica busta</button>
    </div>

    <div class="section-lbl"><span>Composizione del lordo</span></div>
    <div class="card">
      <div class="stip-compbar">${comp.map(v => `<div style="width:${(v.val / somma * 100).toFixed(1)}%;background:${v.colore}"></div>`).join('')}</div>
      <div class="elegend" style="margin-top:10px">${comp.map(v => `<span><i style="background:${v.colore}"></i>${escapeHtml(v.nome)} <b class="num">${fmtEUR(v.val)}</b></span>`).join('')}</div>
    </div>

    <div class="section-lbl"><span>Dettaglio importi</span></div>
    <div class="card" style="padding:4px 0">
      ${righe.map(([k, v]) => `<div class="stip-drow"><span>${escapeHtml(k)}</span><span class="num">${fmtEUR(v)}</span></div>`).join('')}
    </div>

    ${(b.voci_notevoli && b.voci_notevoli.length) ? `
      <div class="section-lbl"><span>Note</span></div>
      <div class="card">
        <ul class="stip-note">${b.voci_notevoli.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
      </div>` : ''}
  `;
  const sm = root.querySelector('#stip-modifica');
  if (sm) sm.addEventListener('click', () => navigate('stipendio-nuovo', { id: b.id }));
};

// ═══════════════════════════════════════════════════════════════════════════
// pezzi riutilizzabili
// ═══════════════════════════════════════════════════════════════════════════
const stipendiRecenti = (n) => state.stipendi.slice().sort((a, b) => (b.id || '').localeCompare(a.id || '')).slice(0, n);

const _rigaStipendioHTML = (b) => {
  const col = coloreDatore(b.datore);
  return `<div class="eboll" data-stip="${escapeHtml(b.id)}">
    <div class="eboll-ic" style="color:${col}">${BUSTA}</div>
    <div class="eboll-body">
      <div class="eboll-r1"><span class="eboll-nm">${escapeHtml(b.periodo)}</span><span class="eboll-imp num">${fmtEUR(nettoGuadagnato(b))}</span></div>
      <div class="eboll-r2"><span class="eboll-sub"><span class="stip-dot" style="background:${col}"></span> ${escapeHtml(b.datore)}${b.tredicesima_inclusa ? ' · 13ª' : ''}</span><span class="eboll-kwh num">lordo ${fmtEUR(b.lordo)}</span></div>
    </div>
    <div class="eboll-chev">›</div>
  </div>`;
};

// Card KPI di un anno dentro un contenitore.
const _renderKpiIn = (cont, anno) => {
  const agg = aggregatoAnno(anno);
  if (!agg) { cont.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:20px 0">Nessuna busta nel ${anno}</div>`; return; }
  const prec = Number(anno) - 1;
  const vN = variazioneAnno(anno, 'netto'), vM = variazioneAnno(anno, 'nettoMedio');
  const vL = variazioneAnno(anno, 'lordo'), vA = variazioneAnno(anno, 'aliquotaEff');
  const parziale = agg.mesi < 12 ? `<small> · ${agg.mesi} mesi</small>` : '';
  cont.innerHTML = `
    <div class="ekpi"><div class="k">Netto ${anno}</div><div class="v num">${fmtEUR(agg.netto)}${parziale}</div>${vN != null ? `<div class="d ${_clsUp(vN)}">${_fmtVar(vN)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Netto per mensilità</div><div class="v num">${fmtEUR(agg.nettoMedio)}</div>${vM != null ? `<div class="d ${_clsUp(vM)}">${_fmtVar(vM)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Lordo ${anno}</div><div class="v num">${fmtEUR(agg.lordo)}</div>${vL != null ? `<div class="d ${_clsUp(vL)}">${_fmtVar(vL)} vs ${prec}</div>` : ''}</div>
    <div class="ekpi"><div class="k">Fisco e contributi</div><div class="v num">${agg.aliquotaEff.toFixed(1)}<small> %</small></div>${agg.irpefEffettiva != null ? `<div class="d" style="color:var(--txt-3)">IRPEF ${agg.irpefEffettiva.toFixed(1)}% sull'imponibile</div>` : (vA != null ? `<div class="d ${_clsDown(vA)}">${_fmtVar(vA)} vs ${prec}</div>` : '')}</div>`;
};
const _renderKpi = (root) => _renderKpiIn(root.querySelector('#skpis'), _annoKpi);

// Heatmap netto mese × anno: colore = datore, intensità = netto (0.14 → 0.95).
const _renderHeatmap = (cont) => {
  const { anni, celle, max } = heatmapNetto();
  const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const testata = `<div class="hm-lbl"></div>` + anni.map(a => `<div class="hm-head num">'${a.slice(2)}</div>`).join('');
  const righe = Array.from({ length: 12 }, (_, m) => {
    const mese = m + 1;
    return `<div class="hm-lbl">${mese3(mese)}</div>` + anni.map(a => {
      const c = celle[`${a}-${mese}`];
      if (c == null) return `<div class="hm-cell vuota"></div>`;
      const t = Math.min(1, c.netto / max);
      const [r, g, bl] = hex2rgb(coloreDatore(c.datore));
      const alpha = (0.14 + t * 0.81).toFixed(2);
      const euro = Math.round(c.netto).toLocaleString('it-IT');
      return `<div class="hm-cell num" style="background:rgba(${r},${g},${bl},${alpha});color:${t > 0.5 ? '#fff' : 'var(--txt-2)'};font-size:9px">${euro}</div>`;
    }).join('');
  }).join('');
  cont.innerHTML = `<div class="hm-grid" style="grid-template-columns:34px repeat(${anni.length},1fr)">${testata}${righe}</div>
    <div class="eprice-note" style="margin-top:10px;padding:0 4px">Netto mensile (€). Il colore indica il datore, l'intensità l'importo.</div>`;
};

// Confronto datori: netto medio mensile, dal primo all'ultimo mese, colore aziendale.
const _renderDatori = (cont, datoreAttuale) => {
  const dati = confrontoDatori();
  if (!dati.length) { cont.innerHTML = '<div class="empty">Nessun dato</div>'; return; }
  const maxN = Math.max(...dati.map(d => d.perMensilita));
  cont.innerHTML = dati.map(f => {
    const w = (f.perMensilita / maxN * 100).toFixed(0);
    const attuale = f.datore === datoreAttuale;
    const [y1, m1] = f.dal.split('-'); const [y2, m2] = f.al.split('-');
    return `<div class="fr-row">
      <div class="fr-head">
        <span class="fr-nome"><span class="stip-dot" style="background:${f.colore}"></span> ${escapeHtml(f.datore)}${attuale ? ' <span class="fr-badge">attuale</span>' : ''}</span>
        <span class="fr-val num">${fmtEUR(f.perMensilita)}/mensilità</span>
      </div>
      <div class="fr-bar"><div class="fr-fill" style="width:${w}%;background:${f.colore}"></div></div>
      <div class="fr-sub">${mese3(+m1)} '${y1.slice(2)} – ${mese3(+m2)} '${y2.slice(2)} · ${f.mensilita} mensilità · netto guadagnato ${fmtEUR(f.guadagnato)}${f.addebiti ? ` (di cui ${fmtEUR(f.addebiti)} di addebiti: auto, mensa)` : ''}</div>
    </div>`;
  }).join('') + `<div class="eprice-note" style="margin-top:6px">La barra è il <b>netto guadagnato per mensilità</b>: un anno pieno vale <b>13 mensilità</b>, perché la tredicesima è dentro la busta di dicembre e resta lì. È il netto <i>prima</i> degli addebiti in busta (auto, mensa): quelli sono spese tue, non minor stipendio, così i datori si confrontano ad armi pari.</div>`;
};
