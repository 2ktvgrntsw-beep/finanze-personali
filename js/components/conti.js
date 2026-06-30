// conti.js (NUOVO v1.3) — elenco conti raggruppati per tipologia, con saldo stimato.

import { state } from '../state.js';
import { fmtEUR, escapeHtml } from '../utils.js';
import { contiPerTipologia, TIPOLOGIE_CONTO } from '../services/contiService.js';
import { saldoStimatoConto } from '../services/patrimonioService.js';
import { navigate } from '../router.js';

const LABEL_TIPOLOGIA = { liquidita: 'Liquidità', risparmio: 'Risparmio', investimenti: 'Investimenti', asset: 'Asset', debiti: 'Debiti' };
const ICONA_TIPOLOGIA = { liquidita: '💶', risparmio: '🏦', investimenti: '📈', asset: '🏠', debiti: '📉' };

export const renderConti = async (root) => {
  const perTipologia = contiPerTipologia();

  const blocchi = TIPOLOGIE_CONTO
    .filter(t => perTipologia[t].length > 0)
    .map(t => {
      const conti = perTipologia[t];
      // Per liquidità/risparmio/investimenti il saldo è "stimato" (derivato dai
      // movimenti); per asset è il valore dichiarato manualmente (es. valore casa).
      const righe = conti.map(c => {
        const saldo = (t === 'asset') ? (Number(c.saldo_iniziale) || 0) : saldoStimatoConto(c);
        return `
          <div class="mov-item">
            <div class="mov-left"><div class="desc">${escapeHtml(c.nome)}</div>${c.descrizione ? `<div class="meta">${escapeHtml(c.descrizione)}</div>` : ''}</div>
            <div class="mov-right ${saldo >= 0 ? 'entrata' : 'spesa'}">${fmtEUR(saldo)}</div>
          </div>`;
      }).join('');

      return `
        <div class="card">
          <h2>${ICONA_TIPOLOGIA[t]} ${LABEL_TIPOLOGIA[t]}</h2>
          ${righe}
        </div>`;
    }).join('');

  root.innerHTML = `
    ${blocchi || '<div class="card empty">Nessun conto configurato. Aggiungine uno da Impostazioni.</div>'}
    <div class="card">
      <button class="btn btn-secondary" id="go-impostazioni">+ Gestisci conti (Impostazioni)</button>
    </div>
  `;

  root.querySelector('#go-impostazioni').addEventListener('click', () => navigate('impostazioni'));
};
