// dashboard.js — schermata principale, vista riassuntiva del periodo corrente.
//
// REFACTORING v1.3: la v1.2 aveva un'unica funzione che mescolava calcolo dati e
// costruzione HTML in una riga sola lunghissima. Qui sono separate due funzioni:
// - calcolaDatiDashboard(state): pura, restituisce solo dati (testabile, leggibile)
// - renderDashboard(root): chiama il calcolo, poi costruisce l'HTML
// L'output visivo per l'utente è lo stesso della v1.2, con l'aggiunta del box
// Patrimonio Netto (collegamento alla nuova sezione v1.3) e della proiezione 30gg
// arricchita con la stima delle spese non ricorrenti (media mobile).

import { state } from '../state.js';
import { fmtEUR, fmtDate, escapeHtml } from '../utils.js';
import { proiezione30gg } from '../services/ricorrentiService.js';
import { calcolaPatrimonio } from '../services/patrimonioService.js';

// --- Calcolo dati (nessun riferimento al DOM) ----------------------------------------

function calcolaDatiDashboard(s, annoRif, meseRif) {
  const movAnno = s.movimenti.filter(m => new Date(m.data).getFullYear() === annoRif);
  const movMese = movAnno.filter(m => (new Date(m.data).getMonth() + 1) === meseRif);

  const sum = (arr, tipo) => arr.filter(m => m.tipo === tipo).reduce((a, m) => a + m.importo, 0);

  const entrateAnno = sum(movAnno, 'entrata');
  const speseAnno = sum(movAnno, 'spesa');
  const saldoAnno = entrateAnno - speseAnno;
  const saldoMese = sum(movMese, 'entrata') - sum(movMese, 'spesa');

  const ultimo = s.movimenti.slice().sort((a, b) => (b.data_creazione || '').localeCompare(a.data_creazione || ''))[0];

  const perMese = {};
  movAnno.forEach(m => {
    const k = m.data.slice(0, 7);
    perMese[k] = perMese[k] || { e: 0, s: 0 };
    if (m.tipo === 'entrata') perMese[k].e += m.importo; else if (m.tipo === 'spesa') perMese[k].s += m.importo;
  });
  const nMesi = Object.keys(perMese).length || 1;
  const mediaEntrate = Object.values(perMese).reduce((a, v) => a + v.e, 0) / nMesi;
  const mediaSpese = Object.values(perMese).reduce((a, v) => a + v.s, 0) / nMesi;

  const cats = {};
  movAnno.filter(m => m.tipo === 'spesa').forEach(m => { const k = m.categoria || '(senza)'; cats[k] = (cats[k] || 0) + m.importo; });
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];

  return { entrateAnno, speseAnno, saldoAnno, saldoMese, ultimo, mediaEntrate, mediaSpese, topCat };
}

// --- Render HTML -----------------------------------------------------------------

export const renderDashboard = async (root) => {
  const now = new Date(), anno = now.getFullYear(), mese = now.getMonth() + 1;
  const dati = calcolaDatiDashboard(state, anno, mese);
  const proj = await proiezione30gg();
  const patrimonio = calcolaPatrimonio();

  const bannerBenvenuto = state.movimenti.length === 0
    ? `<div class="banner-info">👋 Benvenuto! Importa il tuo Excel da <strong>Setup → Import/Export</strong>.</div>`
    : '';

  root.innerHTML = `
    ${bannerBenvenuto}

    <div class="card" id="card-patrimonio" style="cursor:pointer">
      <h2>Patrimonio Netto</h2>
      <div class="kpi ${patrimonio.patrimonioNetto >= 0 ? 'positive' : 'negative'}">
        <div class="value">${fmtEUR(patrimonio.patrimonioNetto)}</div>
        <div class="label">Attività ${fmtEUR(patrimonio.totaleAttivita)} − Passività ${fmtEUR(patrimonio.totalePassivita)}</div>
      </div>
    </div>

    <div class="card">
      <h2>Saldo ${anno}</h2>
      <div class="kpi ${dati.saldoAnno >= 0 ? 'positive' : 'negative'}"><div class="value">${fmtEUR(dati.saldoAnno)}</div></div>
    </div>

    <div class="grid-2">
      <div class="card"><div class="kpi positive"><div class="label">Entrate anno</div><div class="value">${fmtEUR(dati.entrateAnno)}</div></div></div>
      <div class="card"><div class="kpi negative"><div class="label">Spese anno</div><div class="value">${fmtEUR(dati.speseAnno)}</div></div></div>
      <div class="card"><div class="kpi ${dati.saldoMese >= 0 ? 'positive' : 'negative'}"><div class="label">Saldo mese</div><div class="value">${fmtEUR(dati.saldoMese)}</div></div></div>
      <div class="card"><div class="kpi"><div class="label">Media spesa/mese</div><div class="value">${fmtEUR(dati.mediaSpese)}</div></div></div>
      <div class="card"><div class="kpi"><div class="label">Media entrata/mese</div><div class="value">${fmtEUR(dati.mediaEntrate)}</div></div></div>
      <div class="card"><div class="kpi"><div class="label">Top categoria</div><div class="value" style="font-size:18px">${dati.topCat ? escapeHtml(dati.topCat[0]) : '–'}</div><div class="label">${dati.topCat ? fmtEUR(dati.topCat[1]) : ''}</div></div></div>
    </div>

    <div class="card">
      <h2>Proiezione 30 giorni</h2>
      <p>Entrate previste (ricorrenti): <strong>${fmtEUR(proj.entrate)}</strong></p>
      <p>Spese previste (ricorrenti): <strong>${fmtEUR(proj.spese)}</strong></p>
      <p>Spese non ricorrenti stimate (media ultimi 3 mesi): <strong>${fmtEUR(proj.speseStimateNonRicorrenti)}</strong></p>
      <p style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">Saldo proiettato complessivo: <strong>${fmtEUR(proj.saldoStimatoTotale)}</strong></p>
    </div>

    <div class="card">
      <h2>Ultimo movimento</h2>
      ${dati.ultimo
        ? `<div class="mov-item"><div class="mov-left"><div class="desc">${escapeHtml(dati.ultimo.descrizione || '(no descrizione)')}</div><div class="meta">${fmtDate(dati.ultimo.data)} · ${escapeHtml(dati.ultimo.categoria || '')}</div></div><div class="mov-right ${dati.ultimo.tipo}">${dati.ultimo.tipo === 'spesa' ? '-' : '+'}${fmtEUR(dati.ultimo.importo)}</div></div>`
        : '<div class="empty">Nessun movimento</div>'}
    </div>
  `;

  root.querySelector('#card-patrimonio')?.addEventListener('click', () => { location.hash = '#/patrimonio'; });
};
