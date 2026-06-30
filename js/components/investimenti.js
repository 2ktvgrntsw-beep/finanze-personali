// investimenti.js (NUOVO v1.3) — panoramica investimenti per piattaforma.
// In questa versione è una panoramica (capitale versato per conto/piattaforma);
// l'analisi storica avanzata per strumento (ETF, Crypto, Fondi) con grafici dedicati
// è prevista in v1.4, come da roadmap. Qui si usa comunque la macrocategoria/categoria
// dei movimenti taggati "Investimenti" per dare già un primo grafico per tipologia.

import { state } from '../state.js';
import { fmtEUR, escapeHtml } from '../utils.js';
import { contiPerTipologia } from '../services/contiService.js';
import { saldoStimatoConto } from '../services/patrimonioService.js';

let chart = null;

export const renderInvestimenti = async (root) => {
  chart?.destroy();
  const contiInvestimento = contiPerTipologia().investimenti;
  const valoreTotale = contiInvestimento.reduce((t, c) => t + saldoStimatoConto(c), 0);

  // Ripartizione per tipologia strumento: si usa la sottocategoria dei movimenti
  // storici con macrocategoria "Investimenti" (es. Azioni/ETF, Crypto, Fondi),
  // così la torta riflette i dati storici già taggati senza richiedere nuova UI.
  const perTipo = {};
  state.movimenti
    .filter(m => m.macrocategoria === 'Investimenti' && m.tipo === 'trasferimento')
    .forEach(m => { const k = m.categoria || '(altro)'; perTipo[k] = (perTipo[k] || 0) + m.importo; });

  root.innerHTML = `
    <div class="card">
      <h2>Valore investito totale</h2>
      <div class="kpi positive"><div class="value">${fmtEUR(valoreTotale)}</div><div class="label">Capitale versato (storico)</div></div>
    </div>

    ${Object.keys(perTipo).length ? `<div class="card"><h2>Per tipologia</h2><canvas id="ch-tipo"></canvas></div>` : ''}

    <div class="card">
      <h2>Per conto / piattaforma</h2>
      ${contiInvestimento.map(c => `
        <div class="mov-item">
          <div class="mov-left"><div class="desc">${escapeHtml(c.nome)}</div></div>
          <div class="mov-right entrata">${fmtEUR(saldoStimatoConto(c))}</div>
        </div>`).join('') || '<div class="empty">Nessun conto investimenti configurato</div>'}
    </div>

    <div class="card meta" style="font-size:12px">
      📌 Analisi storica avanzata per strumento e grafico di crescita nel tempo sono previsti nella prossima versione (v1.4).
    </div>
  `;

  if (Object.keys(perTipo).length && typeof Chart !== 'undefined') {
    chart = new Chart(document.getElementById('ch-tipo'), {
      type: 'pie',
      data: { labels: Object.keys(perTipo), datasets: [{ data: Object.values(perTipo) }] },
      options: { plugins: { legend: { position: 'bottom' } } },
    });
  }
};
