// app.js — punto di ingresso dell'applicazione: registra le rotte e avvia il router.
//
// REFACTORING v1.3: stesso comportamento della v1.2 (era tutto su 2 righe lunghissime,
// qui riformattato su più righe per leggibilità), con l'aggiunta delle 9 nuove rotte
// v1.3 e l'inizializzazione dei nuovi domini dati (mutuo, finanziamenti, patrimonio).

import { openDB } from './db.js';
import { refreshAll } from './state.js';
import { initRouter, registerRoute, navigate } from './router.js';

// Componenti v1.2 (rifattorizzati)
import { renderDashboard } from './components/dashboard.js';
import { renderMovimento } from './components/movimento.js';
import { renderStorico } from './components/storico.js';
import { renderRicorrenti } from './components/ricorrenti.js';
import { renderStatistiche } from './components/statistiche.js';
import { renderBudget } from './components/budget.js';
import { renderImpostazioni } from './components/impostazioni.js';
import { renderImportExport } from './components/importExport.js';

// Componenti NUOVI v1.3
import { renderPatrimonio } from './components/patrimonio.js';
import { renderConti } from './components/conti.js';
import { renderMutuo } from './components/mutuo.js';
import { renderPianoAmmortamento } from './components/pianoAmmortamento.js';
import { renderFinanziamenti } from './components/finanziamenti.js';
import { renderNuovoTrasferimento } from './components/nuovoTrasferimento.js';
import { renderInvestimenti } from './components/investimenti.js';
import { renderRiconciliazione } from './components/riconciliazione.js';
import { renderTagAnalisi } from './components/tagAnalisi.js';

import { generaRicorrentiScaduti } from './services/ricorrentiService.js';
import { verificaBackupScaduto } from './services/backupService.js';
import { ensureContoDefault } from './services/contiService.js';
import { snapshotMeseCorrenteMancante } from './services/patrimonioService.js';
import { toast } from './utils.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
}

const TITLES = {
  dashboard: 'Dashboard',
  nuovo: 'Nuovo Movimento',
  storico: 'Storico',
  ricorrenti: 'Ricorrenti',
  statistiche: 'Statistiche',
  budget: 'Budget',
  impostazioni: 'Impostazioni',
  importexport: 'Import / Export',
  // v1.3
  patrimonio: 'Patrimonio',
  conti: 'Conti',
  mutuo: 'Mutuo',
  'piano-ammortamento': 'Piano di Ammortamento',
  finanziamenti: 'Finanziamenti',
  'nuovo-trasferimento': 'Nuovo Trasferimento',
  investimenti: 'Investimenti',
  riconciliazione: 'Riconciliazione Conto',
  tag: 'Analisi Tag',
};

(async function bootstrap() {
  try {
    await openDB();
    await refreshAll();
    await ensureContoDefault();
    await refreshAll();
    await generaRicorrentiScaduti();
    await refreshAll();
    await verificaBackupScaduto();

    // Rotte v1.2
    registerRoute('dashboard', renderDashboard);
    registerRoute('nuovo', renderMovimento);
    registerRoute('storico', renderStorico);
    registerRoute('ricorrenti', renderRicorrenti);
    registerRoute('statistiche', renderStatistiche);
    registerRoute('budget', renderBudget);
    registerRoute('impostazioni', renderImpostazioni);
    registerRoute('importexport', renderImportExport);

    // Rotte NUOVE v1.3
    registerRoute('patrimonio', renderPatrimonio);
    registerRoute('conti', renderConti);
    registerRoute('mutuo', renderMutuo);
    registerRoute('piano-ammortamento', renderPianoAmmortamento);
    registerRoute('finanziamenti', renderFinanziamenti);
    registerRoute('nuovo-trasferimento', renderNuovoTrasferimento);
    registerRoute('investimenti', renderInvestimenti);
    registerRoute('riconciliazione', renderRiconciliazione);
    registerRoute('tag', renderTagAnalisi);

    const updateTitle = () => {
      const name = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
      document.getElementById('view-title').textContent = TITLES[name] || 'Finanze';
    };
    window.addEventListener('hashchange', updateTitle);
    updateTitle();

    document.getElementById('quick-add').addEventListener('click', () => navigate('nuovo'));

    // Promemoria gentile (solo toast, non bloccante) se manca lo snapshot del
    // patrimonio per il mese corrente — non forza nulla, l'utente lo vede anche
    // come banner dedicato entrando in Patrimonio.
    if (snapshotMeseCorrenteMancante() && location.hash.includes('dashboard')) {
      setTimeout(() => toast('📸 Ricordati di salvare la rilevazione mensile del patrimonio'), 1200);
    }

    initRouter();
  } catch (err) {
    console.error(err);
    toast('Errore inizializzazione: ' + err.message);
  }
})();
