// deduzione.js — La deduzione dei contributi al fondo pensione, e nient'altro.
//
// Pagina monotematica per scelta: qui si risponde a una domanda sola — quanto posso
// dedurre e quanto ne sto usando — senza mescolarla con IRPEF, detrazioni e rimborsi,
// che stanno nella sezione Fisco. Ci si arriva dalla barra in Stipendi › Fondo pensione.
//
// DUE TETTI, non uno. Quello ORDINARIO vale per tutti ed è cambiato nel tempo: fermo a
// 5.164,57 dal 2007, portato a 5.300 dalla legge di bilancio 2026. Quello con RECUPERO
// vale solo per chi ha iniziato a lavorare dopo il 2007 e nei primi cinque anni di
// adesione non ha saturato il plafond: dal sesto al venticinquesimo anno può alzare il
// tetto di quanto ha lasciato sul tavolo, fino a +2.582,29 l'anno. L'incremento non è
// stato ritoccato nel 2026, quindi da quest'anno il massimo raggiungibile è 7.882,29.

import { fmtEUR } from '../core/utils.js';
import { plafondFondo } from '../services/stipendiService.js';

let _anno = null;

export const renderDeduzione = async (root, params = {}) => {
  document.getElementById('view-title').textContent = 'Deduzione';
  const anni = plafondFondo().anni;
  const richiesto = Number(params.anno);
  if (richiesto && anni.includes(richiesto)) _anno = richiesto;
  if (_anno == null || !anni.includes(_anno)) _anno = anni[0];

  root.innerHTML = `
    <div class="section-lbl" style="margin-top:4px">
      <span>Anno d'imposta</span>
      <div class="eyear" id="ded2-year">
        <button id="ded2-prev" aria-label="Anno precedente">‹</button>
        <span class="num" id="ded2-lbl">${_anno}</span>
        <button id="ded2-next" aria-label="Anno successivo">›</button>
      </div>
    </div>
    <div id="ded2-body"></div>
  `;

  const dis = () => {
    const pf = plafondFondo(_anno);
    const r = pf.riga;
    const scala = r.tettoConRecupero;
    const pcOrd = r.tetto / scala * 100;
    const pcDed = Math.min(r.dedotto, scala) / scala * 100;
    const margineOrd = Math.max(0, r.tetto - r.dedotto);
    const margineTot = Math.max(0, scala - r.dedotto);

    root.querySelector('#ded2-body').innerHTML = `
      <div class="net-card" style="margin-top:2px">
        <div class="lbl2">${r.dichiarato ? `Dedotto nel ${r.anno}` : `Tetto del ${r.anno}`}</div>
        <div class="num" style="font-size:30px;font-weight:750">${fmtEUR(r.dichiarato ? r.dedotto : r.tetto)}</div>
        <div class="meta" style="margin-top:4px">${r.dichiarato
    ? `${r.quota}% del tetto ordinario di ${fmtEUR(r.tetto)}`
    : 'il 730 di quest\'anno non è ancora stato presentato'}</div>
      </div>

      <div class="card">
        <div class="dedtrack">
          <span class="ded-extra" style="left:${pcOrd}%;width:${100 - pcOrd}%"></span>
          <span class="ded-fill" style="width:${pcDed}%"></span>
          <span class="ded-mk" style="left:${pcOrd}%"></span>
        </div>
        <div class="dedscale">
          <span>dedotto ${fmtEUR(r.dedotto)}</span>
          <span>tetto ${fmtEUR(r.tetto)}</span>
          <span>con recupero ${fmtEUR(scala)}</span>
        </div>
        <div class="fr-sub" style="margin-top:10px">Il pieno arriva al <b>tetto ordinario</b> dell'anno. La parte tratteggiata è il <b>recupero da prima occupazione</b>: esiste per legge, ma solo se lo chiedi nel 730.</div>
      </div>

      <div class="section-lbl"><span>Quanto puoi ancora dedurre</span></div>
      <div class="card">
        <div class="fr-row">
          <div class="fr-head">
            <span class="fr-nome">Margine sul tetto ordinario</span>
            <span class="fr-val num">${fmtEUR(margineOrd)}</span>
          </div>
          <div class="fr-sub">Tetto ${r.anno}: ${fmtEUR(r.tetto)}${r.anno >= 2026 ? ' — alzato da 5.164,57 € dalla legge di bilancio 2026' : ''}</div>
        </div>
        <div class="fr-row">
          <div class="fr-head">
            <span class="fr-nome">Margine con il recupero</span>
            <span class="fr-val num" style="color:var(--up)">${fmtEUR(margineTot)}</span>
          </div>
          <div class="fr-sub">Tetto massimo ${fmtEUR(scala)} = ${fmtEUR(r.tetto)} ordinario + ${fmtEUR(pf.incrementoAnnuo)} di recupero</div>
        </div>
      </div>

      <div class="section-lbl"><span>Plafond arretrato da prima occupazione</span></div>
      <div class="card">
        <div class="fr-head">
          <span class="fr-nome" style="font-weight:700">Ancora disponibile</span>
          <span class="fr-val num" style="font-size:19px;font-weight:750;color:var(--up)">${fmtEUR(pf.residuo)}</span>
        </div>
        <div class="fr-sub" style="margin-top:8px">
          Nei primi cinque anni di adesione a Cometa (${pf.primiCinqueAnni[0]}-${pf.primiCinqueAnni[4]}) hai dedotto
          <b>${fmtEUR(pf.dedottoNeiPrimiCinque)}</b> sui ${fmtEUR(5164.57 * 5)} possibili. La differenza non è persa:
          si recupera dal sesto al venticinquesimo anno di adesione, cioè fino al <b>${pf.scadenza}</b>, al massimo
          ${fmtEUR(pf.incrementoAnnuo)} l'anno.
        </div>
        <div class="fr-sub" style="margin-top:6px;color:var(--warn)">
          Finora non è mai stato chiesto: dal ${pf.primiCinqueAnni[4] + 1} in poi il rigo E28 del 730 è vuoto${pf.usatoNellaFinestra ? ` (usati ${fmtEUR(pf.usatoNellaFinestra)})` : ''}.
        </div>
      </div>

      <div class="section-lbl"><span>Contributi dedotti · anno per anno</span></div>
      <div class="card" style="padding:4px 14px" data-noline>
        ${pf.serie.slice().reverse().map(x => `
          <div class="paniere-anno-riga ${x.anno === _anno ? 'sel' : ''}">
            <span class="num anno">${x.anno}</span>
            <b class="num">${fmtEUR(x.dedotto)}</b>
            <span class="delta num" style="color:var(--txt-3)">${x.quota}% di ${fmtEUR(x.tetto)}</span>
          </div>
          ${x.primaOccupazione ? `<div class="fr-sub" style="margin:-4px 0 8px">di cui ${fmtEUR(x.primaOccupazione)} chiesti come prima occupazione</div>` : ''}
        `).join('')}
      </div>

      <div class="card">
        <div class="meta">Nel conto entrano i <b>contributi</b> versati a Cometa: la tua quota trattenuta in busta
        e quella del datore. Il <b>TFR conferito no</b> — non è deducibile e non consuma il tetto, anche se è la
        parte più grossa di quello che finisce nel fondo. È per questo che il totale versato è molto più alto
        di quanto vedi dedotto qui.</div>
      </div>`;
  };

  dis();
  root.querySelector('#ded2-prev').addEventListener('click', () => {
    const i = anni.indexOf(_anno);
    if (i < anni.length - 1) { _anno = anni[i + 1]; root.querySelector('#ded2-lbl').textContent = _anno; dis(); }
  });
  root.querySelector('#ded2-next').addEventListener('click', () => {
    const i = anni.indexOf(_anno);
    if (i > 0) { _anno = anni[i - 1]; root.querySelector('#ded2-lbl').textContent = _anno; dis(); }
  });
};
