// app.js — Bootstrap e orchestrazione dell'applicazione.

import { openDB } from './core/db.js';
import { refreshAll } from './core/store.js';
import { seedStoricoSeNecessario } from './core/seed.js';
import { registerRoute, initRouter, navigate, renderCurrent, currentRoute } from './core/router.js';
import { NAV_SVG } from './core/icons.js';
import { ensureContoDefault } from './services/contiService.js';
import { generaScaduti } from './services/ricorrentiService.js';
import { toast } from './core/utils.js';

// Componenti (schermate)
import { renderSpese } from './components/spese.js';
import { renderDrill } from './components/drill.js';
import { renderMovimenti } from './components/movimenti.js';
import { renderInserimento } from './components/inserimento.js';
import { renderPatrimonio } from './components/patrimonio.js';
import { renderRicorrenti } from './components/ricorrenti.js';
import { renderAnalisi } from './components/analisi.js';
import { renderRicerca } from './components/ricerca.js';
import { renderConti } from './components/conti.js';
import { renderMutuo } from './components/mutuo.js';
import { renderFinanziamenti } from './components/finanziamenti.js';
import { renderInvestimenti } from './components/investimenti.js';
import { renderCategorie } from './components/categorie.js';
import { renderImpostazioni } from './components/impostazioni.js';

// Titolo di ogni schermata principale (per l'header)
const TITOLI = {
  spese: 'Spese', movimenti: 'Movimenti', patrimonio: 'Patrimonio',
  ricorrenti: 'Ricorrenti', analisi: 'Analisi',
};

const registraRotte = () => {
  // wrapper che imposta il titolo di default prima del render
  const wrap = (fn, titolo) => async (root, params) => {
    if (titolo) { const t = document.getElementById('view-title'); if (t) t.textContent = titolo; }
    await fn(root, params);
  };

  registerRoute('spese', wrap(renderSpese, 'Spese'));
  registerRoute('drill', renderDrill);
  registerRoute('movimenti', renderMovimenti);
  registerRoute('nuovo', renderInserimento);
  registerRoute('modifica', renderInserimento);
  registerRoute('patrimonio', wrap(renderPatrimonio, 'Patrimonio'));
  registerRoute('ricorrenti', wrap(renderRicorrenti, 'Ricorrenti'));
  registerRoute('analisi', wrap(renderAnalisi, 'Analisi'));
  registerRoute('ricerca', renderRicerca);
  registerRoute('conti', renderConti);
  registerRoute('mutuo', renderMutuo);
  registerRoute('finanziamenti', renderFinanziamenti);
  registerRoute('investimenti', renderInvestimenti);
  registerRoute('categorie', renderCategorie);
  registerRoute('impostazioni', wrap(renderImpostazioni, 'Impostazioni'));
};

const costruisciChrome = () => {
  // Header
  const header = document.getElementById('app-header');
  header.innerHTML = `
    <button class="hbtn back" id="btn-back" style="display:none">‹</button>
    <div class="title" id="view-title">Spese</div>
    <button class="hbtn add" id="btn-add" title="Aggiungi">+</button>
    <button class="hbtn" id="btn-search" title="Cerca">
      <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    </button>
    <button class="hbtn" id="btn-settings" title="Impostazioni">
      <svg viewBox="0 0 24 24" style="width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  `;

  document.getElementById('btn-back').addEventListener('click', () => history.back());
  document.getElementById('btn-add').addEventListener('click', () => navigate('nuovo'));
  document.getElementById('btn-search').addEventListener('click', () => navigate('ricerca'));
  document.getElementById('btn-settings').addEventListener('click', () => navigate('impostazioni'));

  // Bottom nav (5 icone uniformi)
  const nav = document.getElementById('bottom-nav');
  const voci = [
    ['spese', 'Spese'], ['movimenti', 'Movimenti'], ['patrimonio', 'Patrimonio'],
    ['ricorrenti', 'Ricorrenti'], ['analisi', 'Analisi'],
  ];
  nav.innerHTML = voci.map(([r, label]) =>
    `<a data-route="${r}"><span class="ni">${NAV_SVG[r]}</span>${label}</a>`).join('');
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navigate(a.dataset.route)));
};

const boot = async () => {
  try {
    await openDB();
    await seedStoricoSeNecessario();   // carica lo storico al primo avvio
    await refreshAll();
    await ensureContoDefault();
    await generaScaduti();             // genera movimenti da ricorrenze scadute

    costruisciChrome();
    registraRotte();
    initRouter();

    // registra il service worker (PWA offline)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  } catch (e) {
    console.error('Errore avvio:', e);
    document.getElementById('app-root').innerHTML = `<div class="empty"><div class="big-ic">⚠️</div>Errore all'avvio dell'app.<br><br>${e.message}</div>`;
  }
};

boot();
