// patrimonio.js (NUOVO v1.3) — vista panoramica del patrimonio netto.
// Hub principale da cui si accede a Conti, Mutuo, Finanziamenti, Investimenti.

import { state } from '../state.js';
import { fmtEUR, fmtDate } from '../utils.js';
import { calcolaPatrimonio, salvaSnapshotPatrimonio, snapshotMeseCorrenteMancante, serieStoricaPatrimonio } from '../services/patrimonioService.js';
import { toast } from '../utils.js';

export const renderPatrimonio = async (root) => {
  const p = calcolaPatrimonio();
  const serieStorica = serieStoricaPatrimonio();
  const mostraSuggerimentoSnapshot = snapshotMeseCorrenteMancante();

  // Variazione rispetto allo snapshot precedente, se disponibile — dà un riferimento
  // immediato ("sto crescendo o no") senza dover aprire il grafico completo.
  let variazione = null;
  if (serieStorica.length >= 1) {
    const ultimo = serieStorica[serieStorica.length - 1];
    const diff = p.patrimonioNetto - ultimo.patrimonioNetto;
    variazione = { diff, da: ultimo.data };
  }

  root.innerHTML = `
    <div class="card">
      <h2>Patrimonio Netto</h2>
      <div class="kpi ${p.patrimonioNetto >= 0 ? 'positive' : 'negative'}">
        <div class="value">${fmtEUR(p.patrimonioNetto)}</div>
      </div>
      ${variazione ? `<p class="meta" style="margin-top:6px">${variazione.diff >= 0 ? '▲' : '▼'} ${fmtEUR(Math.abs(variazione.diff))} dall'ultima rilevazione (${fmtDate(variazione.da)})</p>` : ''}
    </div>

    ${mostraSuggerimentoSnapshot ? `
      <div class="banner-info" id="banner-snapshot">
        📸 Non hai ancora salvato una rilevazione del patrimonio per questo mese.
        <button class="btn btn-secondary" id="salva-snapshot" style="margin-top:10px;width:auto">Salva rilevazione di oggi</button>
      </div>` : ''}

    <div class="card">
      <h2>Attività</h2>
      <div class="mov-item"><div class="mov-left"><div class="desc">Liquidità</div></div><div class="mov-right entrata">${fmtEUR(p.liquidita)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Risparmio</div></div><div class="mov-right entrata">${fmtEUR(p.risparmio)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Investimenti</div></div><div class="mov-right entrata">${fmtEUR(p.investimenti)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Asset (es. Casa)</div></div><div class="mov-right entrata">${fmtEUR(p.asset)}</div></div>
      <div class="mov-item" style="border-top:2px solid var(--border);margin-top:6px;padding-top:10px"><div class="mov-left"><div class="desc"><strong>Totale Attività</strong></div></div><div class="mov-right entrata"><strong>${fmtEUR(p.totaleAttivita)}</strong></div></div>
    </div>

    <div class="card">
      <h2>Passività</h2>
      <div class="mov-item"><div class="mov-left"><div class="desc">Mutuo (residuo)</div></div><div class="mov-right spesa">${fmtEUR(p.mutuoResiduo)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Finanziamenti (residuo)</div></div><div class="mov-right spesa">${fmtEUR(p.finanziamentiResiduo)}</div></div>
      <div class="mov-item" style="border-top:2px solid var(--border);margin-top:6px;padding-top:10px"><div class="mov-left"><div class="desc"><strong>Totale Passività</strong></div></div><div class="mov-right spesa"><strong>${fmtEUR(p.totalePassivita)}</strong></div></div>
    </div>

    <div class="card">
      <h2>Sezioni</h2>
      <div class="btn-row" style="flex-wrap:wrap;gap:8px">
        <button class="btn btn-secondary" id="go-conti" style="flex:1 1 45%">Conti</button>
        <button class="btn btn-secondary" id="go-mutuo" style="flex:1 1 45%">Mutuo</button>
        <button class="btn btn-secondary" id="go-finanziamenti" style="flex:1 1 45%">Finanziamenti</button>
        <button class="btn btn-secondary" id="go-investimenti" style="flex:1 1 45%">Investimenti</button>
        <button class="btn btn-secondary" id="go-trasferimento" style="flex:1 1 45%">Nuovo Trasferimento</button>
        <button class="btn btn-secondary" id="go-riconciliazione" style="flex:1 1 45%">Riconciliazione</button>
      </div>
    </div>

    ${serieStorica.length >= 2 ? `<div class="card"><h2>Andamento</h2><canvas id="ch-patrimonio"></canvas></div>` : ''}
  `;

  root.querySelector('#salva-snapshot')?.addEventListener('click', async () => {
    await salvaSnapshotPatrimonio();
    toast('Rilevazione salvata');
    document.getElementById('banner-snapshot')?.remove();
  });

  root.querySelector('#go-conti').addEventListener('click', () => { location.hash = '#/conti'; });
  root.querySelector('#go-mutuo').addEventListener('click', () => { location.hash = '#/mutuo'; });
  root.querySelector('#go-finanziamenti').addEventListener('click', () => { location.hash = '#/finanziamenti'; });
  root.querySelector('#go-investimenti').addEventListener('click', () => { location.hash = '#/investimenti'; });
  root.querySelector('#go-trasferimento').addEventListener('click', () => { location.hash = '#/nuovo-trasferimento'; });
  root.querySelector('#go-riconciliazione').addEventListener('click', () => { location.hash = '#/riconciliazione'; });

  if (serieStorica.length >= 2 && typeof Chart !== 'undefined') {
    new Chart(document.getElementById('ch-patrimonio'), {
      type: 'line',
      data: {
        labels: serieStorica.map(s => fmtDate(s.data)),
        datasets: [{ label: 'Patrimonio Netto', data: serieStorica.map(s => s.patrimonioNetto), borderColor: '#1e88e5', tension: .3, fill: false }],
      },
    });
  }
};
