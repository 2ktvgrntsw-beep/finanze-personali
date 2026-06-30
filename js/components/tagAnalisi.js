// tagAnalisi.js (NUOVO v1.3) — Vista Analisi Tag.
// Tre funzioni in una schermata, come da documento di progetto (sezioni 4-G, 9):
// 1) lista di tutti i tag con il totale speso, ordinata dal più costoso
// 2) drill-down: click su un tag mostra tutti i movimenti che lo usano
// 3) confronto affiancato tra due tag scelti dall'utente (es. Vacanza Sicilia vs Vacanza NY)

import { state } from '../state.js';
import { totaliPerTag } from '../services/tagService.js';
import { fmtEUR, fmtDate, escapeHtml } from '../utils.js';

function movimentiPerTag(nomeTag) {
  return state.movimenti.filter(m => (m.tag || []).includes(nomeTag)).sort((a, b) => b.data.localeCompare(a.data));
}

export const renderTagAnalisi = async (root) => {
  const totali = totaliPerTag();
  const tagOrdinati = Object.entries(totali).sort((a, b) => b[1] - a[1]);

  root.innerHTML = `
    <div class="card">
      <h2>Tutti i tag</h2>
      ${tagOrdinati.length ? tagOrdinati.map(([nome, tot]) => `
        <div class="mov-item" data-tag="${escapeHtml(nome)}" style="cursor:pointer">
          <div class="mov-left"><div class="desc">${escapeHtml(nome)}</div><div class="meta">${movimentiPerTag(nome).length} movimenti</div></div>
          <div class="mov-right spesa">${fmtEUR(tot)}</div>
        </div>`).join('') : '<div class="empty">Nessun tag usato ancora</div>'}
    </div>

    <div class="card">
      <h2>Confronta due tag</h2>
      <div class="grid-2">
        <select id="tag-a"><option value="">– primo tag –</option>${tagOrdinati.map(([n]) => `<option>${escapeHtml(n)}</option>`).join('')}</select>
        <select id="tag-b"><option value="">– secondo tag –</option>${tagOrdinati.map(([n]) => `<option>${escapeHtml(n)}</option>`).join('')}</select>
      </div>
      <div id="confronto"></div>
    </div>

    <div id="drilldown"></div>
  `;

  // Click su un tag nella lista → drill-down dei movimenti
  root.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => {
    const nome = el.dataset.tag;
    const mov = movimentiPerTag(nome);
    const drill = root.querySelector('#drilldown');
    drill.innerHTML = `
      <div class="card">
        <h2>Movimenti con tag "${escapeHtml(nome)}"</h2>
        ${mov.map(m => `
          <div class="mov-item">
            <div class="mov-left"><div class="desc">${escapeHtml(m.descrizione || '(no descrizione)')}</div><div class="meta">${fmtDate(m.data)} · ${escapeHtml(m.categoria || '')}</div></div>
            <div class="mov-right ${m.tipo}">${m.tipo === 'spesa' ? '-' : '+'}${fmtEUR(m.importo)}</div>
          </div>`).join('')}
      </div>`;
    drill.scrollIntoView({ behavior: 'smooth' });
  }));

  // Confronto tra due tag selezionati
  const aggiornaConfronto = () => {
    const nomeA = root.querySelector('#tag-a').value;
    const nomeB = root.querySelector('#tag-b').value;
    const box = root.querySelector('#confronto');
    if (!nomeA || !nomeB) { box.innerHTML = ''; return; }

    const movA = movimentiPerTag(nomeA), movB = movimentiPerTag(nomeB);
    const totA = movA.filter(m => m.tipo === 'spesa').reduce((t, m) => t + m.importo, 0);
    const totB = movB.filter(m => m.tipo === 'spesa').reduce((t, m) => t + m.importo, 0);

    box.innerHTML = `
      <div class="grid-2" style="margin-top:14px">
        <div class="card" style="margin:0"><div class="kpi negative"><div class="label">${escapeHtml(nomeA)}</div><div class="value">${fmtEUR(totA)}</div></div><p class="meta">${movA.length} movimenti</p></div>
        <div class="card" style="margin:0"><div class="kpi negative"><div class="label">${escapeHtml(nomeB)}</div><div class="value">${fmtEUR(totB)}</div></div><p class="meta">${movB.length} movimenti</p></div>
      </div>
      <p class="meta" style="margin-top:10px;text-align:center">
        ${totA === totB ? 'Spesa identica' : (totA > totB ? `${escapeHtml(nomeA)} è costato ${fmtEUR(totA - totB)} in più` : `${escapeHtml(nomeB)} è costato ${fmtEUR(totB - totA)} in più`)}
      </p>
    `;
  };

  root.querySelector('#tag-a').addEventListener('change', aggiornaConfronto);
  root.querySelector('#tag-b').addEventListener('change', aggiornaConfronto);
};
