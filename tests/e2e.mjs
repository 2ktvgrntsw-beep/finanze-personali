// tests/e2e.mjs — Collaudo nel browser vero (Playwright + Chromium).
// Si esegue con: node tests/e2e.mjs
//
// Apre l'app come farebbe una persona, su un profilo pulito, e controlla le cose
// che i test di logica pura (tests/unit.mjs) non possono vedere:
//   1. ogni file elencato in ASSETS del service worker esiste davvero (niente 404:
//      un file mancante rompe l'installazione offline sul telefono);
//   2. il primo avvio carica i dati senza errori;
//   3. il secondo avvio non duplica niente (seed e migrazioni idempotenti);
//   4. ogni schermata registrata in app.js si apre senza errori;
//   5. dopo il primo avvio l'app riparte anche senza rete (service worker).
//
// Nessuna dipendenza da installare: usa la libreria 'playwright' e il Chromium già
// presenti nell'ambiente. Il server statico lo avvia lo script stesso. Le richieste
// verso internet (SheetJS da CDN) sono bloccate: il test non dipende dalla rete.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let falliti = 0, passati = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) { passati++; console.log(`  ok   ${nome}`); }
  else { falliti++; console.log(`  FAIL ${nome}${extra ? ' — ' + extra : ''}`); }
};

// ── server statico minimo sulla radice del repository ─────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
};
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ── rotte e asset letti dai sorgenti: il test si aggiorna da solo ─────────────
const appJs = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
const ROTTE = [...appJs.matchAll(/registerRoute\('([^']+)'/g)].map(m => m[1]);
const sw = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
const ASSETS = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

// conta i record degli store principali direttamente in IndexedDB
const contaRecord = (page) => page.evaluate(() => new Promise((res, rej) => {
  const req = indexedDB.open('FinanzePersonaliDB');
  req.onerror = () => rej(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const nomi = ['movimenti', 'conti', 'categorie', 'ricorrenti', 'stipendi', 'bollette',
      'consumiMensili', 'strumenti', 'natura', 'finanziamenti', 'mutuo']
      .filter(n => db.objectStoreNames.contains(n));
    const t = db.transaction(nomi);
    const out = {};
    for (const n of nomi) { const c = t.objectStore(n).count(); c.onsuccess = () => { out[n] = c.result; }; }
    t.oncomplete = () => { db.close(); res(out); };
    t.onerror = () => rej(t.error);
  };
}));

const attendiAvvio = async (page) => {
  await page.waitForSelector('#bottom-nav a', { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('app-root').children.length > 0, null, { timeout: 60000 });
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, locale: 'it-IT', timezoneId: 'Europe/Rome',
  serviceWorkers: 'allow',
});
// niente internet: solo il server locale risponde
await context.route(url => !url.href.startsWith(BASE), r => r.abort());

const page = await context.newPage();
const errori = [];
page.on('pageerror', e => errori.push(`pageerror: ${e.message}`));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|net::ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(t)) return; // CDN bloccato apposta
  errori.push(`console: ${t}`);
});
// toast mostrati all'utente (es. "Movimento non salvato. Riprova.")
const toastVisibili = () => page.evaluate(() =>
  [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).filter(Boolean));

try {
  console.log('\nservice worker: ogni asset esiste');
  {
    const mancanti = [];
    for (const a of ASSETS) {
      const r = await page.request.get(new URL(a, BASE).href);
      if (r.status() !== 200) mancanti.push(`${a} (${r.status()})`);
    }
    ok(`${ASSETS.length} asset in ASSETS rispondono 200`, mancanti.length === 0, mancanti.join(', '));
  }

  console.log('\nprimo avvio');
  let primo;
  {
    const t0 = Date.now();
    await page.goto(BASE);
    await attendiAvvio(page);
    ok(`l'app si avvia (${((Date.now() - t0) / 1000).toFixed(1)} s)`, true);
    const testo = await page.textContent('#app-root');
    ok('nessun messaggio "Errore all\'avvio"', !testo.includes("Errore all'avvio"), testo.slice(0, 200));
    primo = await contaRecord(page);
    ok('storico movimenti caricato', primo.movimenti > 1000, `movimenti: ${primo.movimenti}`);
    ok('buste paga caricate', primo.stipendi > 0, `stipendi: ${primo.stipendi}`);
    ok('bollette caricate', primo.bollette > 0, `bollette: ${primo.bollette}`);
    ok('consumi mensili caricati', primo.consumiMensili > 0, `consumi: ${primo.consumiMensili}`);
    ok('conti caricati', primo.conti > 0, `conti: ${primo.conti}`);
    ok('nessun errore JavaScript al primo avvio', errori.length === 0, errori.join(' | '));
  }

  console.log('\nsecondo avvio: niente doppioni');
  {
    errori.length = 0;
    await page.reload();
    await attendiAvvio(page);
    const secondo = await contaRecord(page);
    for (const [store, n] of Object.entries(primo)) {
      ok(`${store}: stesso numero di record (${n})`, secondo[store] === n, `prima ${n}, dopo ${secondo[store]}`);
    }
    ok('nessun errore JavaScript al secondo avvio', errori.length === 0, errori.join(' | '));
  }

  console.log('\nogni schermata si apre');
  {
    // Parametri presi dai dati veri, per le schermate di dettaglio che senza un id
    // mostrerebbero solo "non trovato".
    const campioni = await page.evaluate(async () => {
      const { state } = await import('./js/core/store.js');
      const spesa = state.movimenti.find(m => m.tipo === 'spesa' && m.macro && m.cat);
      return {
        spesa: spesa && { id: spesa.id, macro: spesa.macro, cat: spesa.cat, mese: spesa.data.slice(0, 7) },
        stipendio: state.stipendi[0]?.id,
        bolletta: state.bollette[0]?.id,
        strumento: state.strumenti[0]?.id,
        contoInv: state.conti.find(c => c.tipo === 'investimenti')?.nome,
        paniere: state.panieri[0]?.id,
        ricorrente: state.ricorrenti[0]?.id,
      };
    });
    const s = campioni.spesa || {};
    const PARAMETRI = {
      drill: [{ macro: s.macro, mese: s.mese }, { macro: s.macro, cat: s.cat, mese: s.mese }],
      modifica: [{ id: s.id }, ...(campioni.ricorrente ? [{ ric: campioni.ricorrente }] : [])],
      'stipendio-dettaglio': [{ id: campioni.stipendio }],
      'stipendio-nuovo': [{}, { id: campioni.stipendio }],
      'bolletta-dettaglio': [{ id: campioni.bolletta }],
      'bolletta-nuova': [{}, { id: campioni.bolletta }],
      'dettaglio-investimento': [
        ...(campioni.contoInv ? [{ conto: campioni.contoInv }] : []),
        ...(campioni.strumento ? [{ strumento: campioni.strumento }] : []),
      ],
      paniere: campioni.paniere ? [{ id: campioni.paniere }] : [],
      analisi: [{}, { macro: s.macro }, { macro: s.macro, cat: s.cat }],
      movimenti: [{}, { periodo: 'anno' }],
      ricerca: [{}, { q: 'a' }],
    };

    for (const rotta of ROTTE) {
      const varianti = PARAMETRI[rotta] ?? [{}];
      if (!varianti.length) { console.log(`  --   ${rotta}: nessun dato per aprirla, saltata`); continue; }
      for (const params of varianti) {
        errori.length = 0;
        const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
        const hash = `#/${rotta}${q ? '?' + q : ''}`;
        // render atteso fino in fondo: un'eccezione nel componente arriva qui
        const esito = await page.evaluate(async (h) => {
          const { renderCurrent } = await import('./js/core/router.js');
          history.replaceState(null, '', h);
          try { await renderCurrent(); } catch (e) { return { errore: e && (e.stack || e.message || String(e)) }; }
          const root = document.getElementById('app-root');
          return { figli: root.children.length, testo: root.innerText };
        }, hash);
        await page.waitForTimeout(50);   // lascia sfogare eventuali errori asincroni
        const problemi = [...errori];
        if (esito.errore) problemi.unshift(esito.errore.split('\n').slice(0, 2).join(' '));
        else {
          if (!esito.figli && rotta !== 'paniere') problemi.push('schermata vuota');
          if (/\bNaN\b|\bundefined\b/.test(esito.testo)) problemi.push('testo con NaN/undefined');
        }
        ok(hash, problemi.length === 0, problemi.join(' | '));
      }
    }
    const t = await toastVisibili();
    ok('nessun avviso di salvataggio fallito', !t.some(x => /non salvat|non riuscit|Riprova/i.test(x)), t.join(' | '));
  }

  console.log('\nbollette: modifiche e cancellazioni sopravvivono al riavvio');
  {
    // Fino alla 3.43 il seed riscriveva tutte le bollette e non ricordava quelle
    // cancellate. Qui si fa come l'utente: si corregge e si cancella, poi si riavvia.
    const bollette = () => page.evaluate(async () => {
      const { dbAll } = await import('./js/core/db.js');
      return Object.fromEntries((await dbAll('bollette')).map(b => [b.id, b]));
    });
    const ids = await page.evaluate(async () => {
      const { BOLLETTE_SEED } = await import('./js/core/bolletteSeedData.js');
      const { eliminaBolletta, salvaBolletta, bollettaById } = await import('./js/services/energiaService.js');
      const campione = BOLLETTE_SEED.find(b => b.canone != null);
      const daCancellare = BOLLETTE_SEED.find(b => b.id !== campione.id);
      // il caso peggiore di prima: la campione corretta a mano col canone svuotato
      await salvaBolletta({ ...bollettaById(campione.id), canone: null, totale: 999.99, origine: 'manuale' });
      await eliminaBolletta(daCancellare.id);
      const altra = BOLLETTE_SEED.find(b => b.id !== campione.id && b.id !== daCancellare.id);
      return { campione: campione.id, cancellata: daCancellare.id, altra: altra.id, nSeed: BOLLETTE_SEED.length };
    });
    errori.length = 0;
    await page.reload();
    await attendiAvvio(page);
    let b = await bollette();
    ok('la bolletta corretta a mano resta corretta', b[ids.campione]?.totale === 999.99, `totale ${b[ids.campione]?.totale}`);
    ok('la bolletta cancellata non ricompare', !b[ids.cancellata]);

    // Telefono fermo alla 3.43: niente lista delle cancellate, vecchio flag acceso, e
    // una bolletta del seed cancellata con la versione vecchia (senza registrarla).
    await page.evaluate(async ({ altra }) => {
      const { dbDelete, dbAdd } = await import('./js/core/db.js');
      await dbDelete('meta', 'seed_bollette_cancellate');
      await dbDelete('meta', 'seed_bollette_impronta');
      await dbAdd('meta', { chiave: 'seed_bollette_completato', valore: true });
      await dbDelete('bollette', altra);
    }, ids);
    await page.reload();
    await attendiAvvio(page);
    b = await bollette();
    ok('aggiornando dalla 3.43 le bollette gia\' cancellate restano cancellate', !b[ids.altra] && !b[ids.cancellata]);
    ok('...e la correzione a mano resta', b[ids.campione]?.totale === 999.99);
    const n1 = Object.keys(b).length;
    await page.reload();
    await attendiAvvio(page);
    const n2 = Object.keys(await bollette()).length;
    ok(`numero di bollette stabile fra un avvio e l'altro (${n1})`, n1 === n2 && n1 === ids.nSeed - 2, `${n1} poi ${n2}`);
    ok('nessun errore JavaScript', errori.length === 0, errori.join(' | '));
  }

  console.log('\nfunziona offline');
  {
    await page.goto(BASE + '#/spese');
    await attendiAvvio(page);
    const attivo = await page.evaluate(async () => {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise(r => setTimeout(() => r(null), 20000)),
      ]);
      return !!(reg && reg.active);
    });
    ok('service worker attivo', attivo);
    if (attivo) {
      errori.length = 0;
      await context.setOffline(true);
      await page.reload();
      await attendiAvvio(page);
      const testo = await page.textContent('#app-root');
      ok("l'app riparte senza rete", !testo.includes("Errore all'avvio"), testo.slice(0, 200));
      ok('nessun errore JavaScript offline', errori.length === 0, errori.join(' | '));
      await context.setOffline(false);
    }
  }
  console.log('\npagina Spese: grafico del ritmo del mese');
  {
    // Data fissata e movimenti successivi tolti: la pagina com'era quel giorno.
    const apriAl = async (data) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
      await ctx.route(url => !url.href.startsWith(BASE), r => r.abort());
      const p = await ctx.newPage();
      const err = [];
      p.on('pageerror', e => err.push(e.message));
      await p.clock.setFixedTime(new Date(`${data}T10:00:00`));
      await p.goto(BASE);
      await attendiAvvio(p);
      await p.evaluate(async (oggi) => {
        const { dbAll, dbDelete } = await import('./js/core/db.js');
        for (const m of await dbAll('movimenti')) if (m.data > oggi) await dbDelete('movimenti', m.id);
      }, data);
      await p.reload();
      await attendiAvvio(p);
      return { p, ctx, err };
    };
    const euro = (t) => Number((t || '').replace(/[^\d,]/g, '').replace(',', '.'));

    const { p, ctx, err } = await apriAl('2026-06-18');
    // Dalla 3.46 la card spese torna com'era fino alla 3.44: pulsante in alto a destra,
    // grafico chiuso all'apertura, barretta sotto. Il pulsante apre il grafico nuovo.
    const visibile = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
    ok('il pulsante del grafico e\' nella card delle spese', await p.evaluate(() => !!document.querySelector('.hero-spese #spark-toggle')));
    ok('all\'apertura il grafico e\' chiuso', !(await visibile('.ritmo-card')));
    ok('la barretta "dove sto col mese" c\'e\'', await visibile('.pace'));
    await p.click('#spark-toggle');
    ok('premendo il pulsante compare il grafico nuovo', await visibile('.ritmo-card'));
    ok('il vecchio grafico degli ultimi 6 mesi non torna', !(await p.$('.spark-card')));
    const info = await p.evaluate(() => ({
      tit: document.querySelector('.ritmo-tit')?.innerText || '',
      sub: document.querySelector('.ritmo-sub')?.innerText || '',
      totale: document.querySelector('.big-spese')?.innerText || '',
      badge: document.querySelector('.hero-spese .delta')?.className || '',
      sopra: document.querySelector('.ritmo-svg .rc')?.classList.contains('sopra'),
    }));
    ok('la frase dice come chiude il mese', /chiudi giugno intorno a/.test(info.tit), info.tit);
    const finora = euro((info.sub.match(/finora ([^,]+)/) || [])[1]);
    ok('"finora" coincide col totale del riquadro', Math.round(finora) === Math.round(euro(info.totale)), `${finora} vs ${info.totale}`);
    ok('grafico e percentuale dicono la stessa cosa', info.sopra === info.badge.includes('worse'), `${info.badge} / sopra=${info.sopra}`);
    const box = await p.locator('.ritmo-svg').boundingBox();
    await p.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
    const tip = await p.locator('.ritmo-tip').innerText();
    ok('toccando il grafico compare il giorno', /\d+\/06/.test(tip) && /di solito/.test(tip), tip.replace(/\n/g, ' '));
    await p.click('#spark-toggle');
    ok('ripremendo il pulsante il grafico si richiude', !(await visibile('.ritmo-card')));
    await p.click('#spark-toggle');
    await p.click('#prev');
    await p.waitForTimeout(100);
    ok('cambiando mese il grafico resta aperto', await visibile('.ritmo-card'));
    ok('un mese passato mostra il riepilogo', /maggio chiuso a/i.test(await p.locator('.ritmo-tit').innerText()));
    // vista per anno (dalla 3.47): stesso pulsante, stesso grafico, conti sull'anno
    await p.click('#head-seg button[data-p="anno"]');
    await p.waitForTimeout(100);
    ok('anche nella vista per anno c\'e\' il pulsante', !!(await p.$('.hero-spese #spark-toggle')));
    if (!(await visibile('.ritmo-card'))) await p.click('#spark-toggle');
    const anno = await p.evaluate(() => ({
      tit: document.querySelector('.ritmo-tit')?.innerText || '',
      sub: document.querySelector('.ritmo-sub')?.innerText || '',
      totale: document.querySelector('.big-spese')?.innerText || '',
      righe: document.querySelectorAll('.ritmo-svg .rg').length,
      mesi: document.querySelectorAll('.ritmo-svg .rx').length,
    }));
    ok('per anno la frase dice come chiude l\'anno', /chiudi il 2026 intorno a/.test(anno.tit), anno.tit);
    const finoraAnno = euro((anno.sub.match(/finora ([^,]+)/) || [])[1]);
    ok('per anno "finora" coincide col totale del riquadro', Math.round(finoraAnno) === Math.round(euro(anno.totale)), `${finoraAnno} vs ${anno.totale}`);
    ok('griglia leggibile anche sulle decine di migliaia (al massimo 5 righe)', anno.righe <= 5, `${anno.righe} righe`);
    ok('asse dell\'anno con le iniziali dei 12 mesi', anno.mesi === 12, `${anno.mesi}`);
    ok('nessun errore JavaScript', err.length === 0, err.join(' | '));
    await ctx.close();

    const inizio = await apriAl('2026-06-02');
    ok('nei primi giorni la percentuale tace ma il grafico c\'e\'',
      !(await inizio.p.$('.hero-spese .delta')) && !!(await inizio.p.$('#spark-wrap .ritmo-card')));
    await inizio.ctx.close();
  }
} catch (e) {
  falliti++;
  console.log(`  FAIL eccezione nel collaudo — ${e.stack || e.message}`);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passati} passati, ${falliti} falliti\n`);
process.exit(falliti ? 1 : 0);
