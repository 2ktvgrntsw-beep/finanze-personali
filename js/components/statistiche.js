// statistiche.js — grafici di analisi (ripartizione, trend, entrate vs spese, top 5).
// Nessuna modifica funzionale sostanziale rispetto alla v1.2: solo riformattazione
// per leggibilità. La Vista Analisi Tag dedicata (drill-down, confronto tra tag)
// è un componente separato, vedi tagAnalisi.js.

import { state } from '../state.js';

let charts = {};
const destroyAll = () => { Object.values(charts).forEach(c => c?.destroy()); charts = {}; };

export const renderStatistiche = async (root) => {
  destroyAll();
  const anni = [...new Set(state.movimenti.map(m => new Date(m.data).getFullYear()).filter(y => !isNaN(y)))].sort((a, b) => b - a);

  root.innerHTML = `
    <div class="card">
      <h2>Filtri</h2>
      <div class="filters">
        <select id="s-anno"><option value="">Tutti</option>${anni.map(a => `<option>${a}</option>`).join('')}</select>
        <select id="s-livello"><option value="macrocategoria">Macrocategoria</option><option value="categoria">Categoria</option><option value="sottocategoria">Sottocategoria</option><option value="conto">Conto</option><option value="tag">Tag</option></select>
        <select id="s-tipo"><option value="spesa">Spese</option><option value="entrata">Entrate</option></select>
        <select id="s-agg"><option value="mese">Mese</option><option value="anno">Anno</option></select>
      </div>
    </div>
    <div class="card"><h2>Ripartizione</h2><canvas id="ch1"></canvas></div>
    <div class="card"><h2>Entrate vs Spese</h2><canvas id="ch2"></canvas></div>
    <div class="card"><h2>Saldo</h2><canvas id="ch3"></canvas></div>
    <div class="card"><h2>Trend spese</h2><canvas id="ch4"></canvas></div>
    <div class="card"><h2>Top 5</h2><canvas id="ch5"></canvas></div>
  `;

  const render = () => {
    if (typeof Chart === 'undefined') return;

    const anno = root.querySelector('#s-anno').value;
    const livello = root.querySelector('#s-livello').value;
    const tipo = root.querySelector('#s-tipo').value;
    const agg = root.querySelector('#s-agg').value;

    let arr = state.movimenti.slice();
    if (anno) arr = arr.filter(m => new Date(m.data).getFullYear() === Number(anno));
    destroyAll();

    const pie = {};
    arr.filter(m => m.tipo === tipo).forEach(m => {
      const chiavi = livello === 'tag' ? ((m.tag && m.tag.length) ? m.tag : ['(no tag)']) : [m[livello] || '(altro)'];
      chiavi.forEach(k => { pie[k] = (pie[k] || 0) + m.importo; });
    });
    charts.a = new Chart(document.getElementById('ch1'), { type: 'pie', data: { labels: Object.keys(pie), datasets: [{ data: Object.values(pie) }] }, options: { plugins: { legend: { position: 'bottom' } } } });

    const ev = {};
    arr.forEach(m => {
      const k = agg === 'anno' ? new Date(m.data).getFullYear() : m.data.slice(0, 7);
      ev[k] = ev[k] || { e: 0, s: 0 };
      if (m.tipo === 'entrata') ev[k].e += m.importo; else if (m.tipo === 'spesa') ev[k].s += m.importo;
    });
    const labels = Object.keys(ev).sort();
    charts.b = new Chart(document.getElementById('ch2'), { type: 'bar', data: { labels, datasets: [{ label: 'Entrate', data: labels.map(k => ev[k].e), backgroundColor: '#2e7d32' }, { label: 'Spese', data: labels.map(k => ev[k].s), backgroundColor: '#c62828' }] } });
    charts.c = new Chart(document.getElementById('ch3'), { type: 'bar', data: { labels, datasets: [{ label: 'Saldo', data: labels.map(k => ev[k].e - ev[k].s), backgroundColor: '#1e88e5' }] } });

    const trend = {};
    arr.filter(m => m.tipo === 'spesa').forEach(m => { const k = m.data.slice(0, 7); trend[k] = (trend[k] || 0) + m.importo; });
    const labelsTrend = Object.keys(trend).sort();
    charts.d = new Chart(document.getElementById('ch4'), { type: 'line', data: { labels: labelsTrend, datasets: [{ label: 'Spese', data: labelsTrend.map(k => trend[k]), borderColor: '#c62828', tension: .3 }] } });

    const top = Object.entries(pie).sort((a, b) => b[1] - a[1]).slice(0, 5);
    charts.e = new Chart(document.getElementById('ch5'), { type: 'bar', data: { labels: top.map(t => t[0]), datasets: [{ label: 'Importo', data: top.map(t => t[1]), backgroundColor: '#1e88e5' }] }, options: { indexAxis: 'y' } });
  };

  root.querySelectorAll('.filters select').forEach(el => el.addEventListener('change', render));

  // Chart.js è caricato via <script defer>: se non è ancora pronto al primo render,
  // si attende con un piccolo polling invece di fallire silenziosamente.
  if (typeof Chart === 'undefined') {
    const t = setInterval(() => { if (typeof Chart !== 'undefined') { clearInterval(t); render(); } }, 100);
  } else {
    render();
  }
};
