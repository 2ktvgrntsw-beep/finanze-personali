// app.js — Bootstrap e orchestrazione dell'applicazione.

import { openDB, setWriteErrorHandler } from './core/db.js';
import { refreshAll } from './core/store.js';
import { seedStoricoSeNecessario } from './core/seed.js';
import { seedBolletteSeNecessario } from './core/seedBollette.js';
import { registerRoute, initRouter, navigate, renderCurrent, currentRoute } from './core/router.js';
import { NAV_SVG } from './core/icons.js';
import { ensureContoDefault } from './services/contiService.js';
import { generaScaduti } from './services/ricorrentiService.js';
import { sincronizzaPrestiti } from './services/prestitiService.js';
import { salvaBackupAuto, rilevaPerdita, ripristinaBackupAuto } from './services/backupService.js';
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
import { conferma } from './components/shared.js';
import { renderConti } from './components/conti.js';
import { renderMutuo } from './components/mutuo.js';
import { renderFinanziamenti } from './components/finanziamenti.js';
import { renderInvestimenti } from './components/investimenti.js';
import { renderDettaglioInvestimento } from './components/dettaglioInvestimento.js';
import { renderCategorie } from './components/categorie.js';
import { renderImpostazioni } from './components/impostazioni.js';
import { renderEnergia, renderEnergiaAnno } from './components/energia.js';
import { renderBollettaForm, renderBollettaDettaglio, renderBolletteStorico } from './components/energiaBollette.js';

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
  registerRoute('dettaglio-investimento', renderDettaglioInvestimento);
  registerRoute('categorie', renderCategorie);
  registerRoute('impostazioni', wrap(renderImpostazioni, 'Impostazioni'));
  registerRoute('energia', renderEnergia);
  registerRoute('energia-anno', renderEnergiaAnno);
  registerRoute('bolletta-nuova', renderBollettaForm);
  registerRoute('bolletta-dettaglio', renderBollettaDettaglio);
  registerRoute('bollette-storico', renderBolletteStorico);
};

const costruisciChrome = () => {
  // Header: [+] a sinistra · selettore periodo piccolo al centro (Spese/Movimenti)
  // · lente (solo Movimenti) · ⚙️ a destra. Nelle sottopagine: [‹][titolo]…[+][⚙️].
  const header = document.getElementById('app-header');
  header.innerHTML = `
    <button class="hbtn" id="btn-search" title="Cerca" aria-label="Cerca movimenti" style="order:1">
      <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    </button>
    <button class="hbtn back" id="btn-back" aria-label="Indietro" style="display:none;order:1">‹</button>
    <button id="btn-annulla" style="display:none;order:1;background:none;border:0;color:var(--down);font-size:15px;font-weight:600;padding:6px 4px;cursor:pointer">Annulla</button>
    <button class="hbtn" id="btn-filtro-pat" title="Filtra patrimonio" aria-label="Filtra patrimonio" style="display:none;order:1">
      <svg viewBox="0 0 24 24" style="width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linejoin:round"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>
    </button>
    <div class="title" id="view-title" style="order:2">Spese</div>
    <div id="head-spacer" style="flex:1;display:none;order:3"></div>
    <div id="head-seg" style="order:4;flex:1;display:flex;justify-content:center"></div>
    <button class="hbtn add" id="btn-add" title="Aggiungi" aria-label="Nuovo movimento" style="order:9">+</button>
  `;

  document.getElementById('btn-back').addEventListener('click', () => history.back());
  document.getElementById('btn-annulla').addEventListener('click', () => { if (history.length > 1) history.back(); else navigate('spese'); });
  document.getElementById('btn-add').addEventListener('click', () => navigate('nuovo'));
  document.getElementById('btn-search').addEventListener('click', () => navigate('ricerca'));


  // Bottom nav (5 icone uniformi)
  const nav = document.getElementById('bottom-nav');
  const voci = [
    ['spese', 'Spese'], ['movimenti', 'Movimenti'], ['patrimonio', 'Patrimonio'],
    ['ricorrenti', 'Ricorrenti'], ['analisi', 'Analisi'], ['impostazioni', 'Altro'],
  ];
  nav.innerHTML = voci.map(([r, label]) =>
    `<a data-route="${r}"><span class="ni">${NAV_SVG[r]}</span>${label}</a>`).join('');
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navigate(a.dataset.route)));
};

const boot = async () => {
  try {
    // notificatore utente per gli errori di scrittura DB (safeWrite -> toast)
    setWriteErrorHandler((msg, err) => {
      console.error('[DB write]', msg, err);
      toast(msg + '. Riprova.');
    });

    // Chiede al browser di marcare lo storage come PERSISTENTE: riduce (non azzera)
    // la probabilità che iOS/il browser cancelli i dati per liberare spazio.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    await openDB();
    await seedStoricoSeNecessario();   // carica lo storico al primo avvio
    await seedBolletteSeNecessario();  // carica le bollette energia (una tantum)
    await refreshAll();

    // RILEVAMENTO PERDITA DATI: se i dati principali sono vuoti ma esiste un backup
    // interno con dati, offro il ripristino (copre bug/corruzioni; NON lo sfratto iOS totale).
    const perdita = await rilevaPerdita();
    if (perdita) {
      const quando = new Date(perdita.data).toLocaleDateString('it-IT');
      if (await conferma(`Sembra che i dati siano andati persi, ma ho trovato un backup automatico del ${quando} con ${perdita.contatori.movimenti} movimenti. Vuoi ripristinarlo?`, { titolo: 'Backup trovato', ok: 'Ripristina' })) {
        await ripristinaBackupAuto();
        toast('Dati ripristinati dal backup automatico');
      }
    }

    await ensureContoDefault();
    await sincronizzaPrestiti();        // crea/aggiorna le ricorrenze di mutuo e finanziamenti
    await generaScaduti();             // genera movimenti da ricorrenze scadute (solo dal presente)

    costruisciChrome();
    registraRotte();
    initRouter();

    // BACKUP AUTOMATICO INTERNO: salva una copia di sicurezza a ogni avvio (non blocca l'avvio)
    salvaBackupAuto().catch(e => console.warn('Backup automatico non riuscito:', e));

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
