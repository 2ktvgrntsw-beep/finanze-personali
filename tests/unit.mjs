// tests/unit.mjs — Test unitari della logica pura. Eseguire con: node tests/unit.mjs
// Girano senza browser: proteggono le regole di calcolo dalle regressioni.

import { calcolaPiano, statoPrestito } from '../js/services/prestitiService.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
let falliti = 0;
const check = (nome, cond, dettaglio = '') => {
  if (cond) { console.log(`  ✅ ${nome}`); }
  else { console.log(`  ❌ ${nome} ${dettaglio}`); falliti++; }
};

console.log('— VERSIONE COERENTE (il test che avrebbe evitato il bug della 2.2 doppia) —');
{
  const ver = readFileSync(join(__dir, '../js/core/version.js'), 'utf8');
  const sw = readFileSync(join(__dir, '../service-worker.js'), 'utf8');
  const appV = ver.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
  const swV = sw.match(/CACHE_VERSION\s*=\s*'finanze-v([\d.]+)\.\d+'/)?.[1] || sw.match(/CACHE_VERSION\s*=\s*'finanze-v([\d.]+)'/)?.[1];
  check(`APP_VERSION (${appV}) combacia con CACHE_VERSION (${swV})`, appV && swV && swV.startsWith(appV));
}

console.log('— PIANO DI AMMORTAMENTO —');
{
  // Finanziamento reale: 05/05/2026, 20 rate — deve combaciare con l'estratto banca
  const fin = { importo_iniziale: 972, tasso: 0, durata_mesi: 20, rata: 48.59, data_inizio: '2026-05-05' };
  const p = calcolaPiano(fin);
  check('prima rata = data inizio (05/05)', p[0].data === '2026-05-05', p[0].data);
  check('20 rate totali', p.length === 20, String(p.length));
  check('ultima rata 05/12/2027 (come la banca)', p[19].data === '2027-12-05', p[19].data);
  check('2 rate passate al 01/07/2026', p.filter(r => r.data <= '2026-07-01').length === 2);
}
{
  // Overflow fine mese: piano dal 31 gennaio NON deve scivolare al 3 marzo
  const m = { importo_iniziale: 12000, tasso: 0, durata_mesi: 12, rata: 1000, data_inizio: '2026-01-31' };
  const p = calcolaPiano(m);
  check('31 gen + 1 mese = 28 feb (no scivolamento)', p[1].data === '2026-02-28', p[1].data);
  check('il giorno 31 si preserva a marzo', p[2].data === '2026-03-31', p[2].data);
  check('30 aprile (31 non esiste)', p[3].data === '2026-04-30', p[3].data);
}
{
  // Mutuo reale: 180 rate dal 31/03/2018
  const mut = { importo_iniziale: 80000, tasso: 2, durata_mesi: 180, rata: 514.81, data_inizio: '2018-03-31' };
  const p = calcolaPiano(mut);
  check('prima rata 31/03/2018 (allineata allo storico)', p[0].data === '2018-03-31', p[0].data);
  check('180 rate', p.length === 180, String(p.length));
  const s = statoPrestito(mut, []);
  check('residuo plausibile (30-45k)', s.residuo > 30000 && s.residuo < 45000, String(s.residuo));
  check('quota capitale + interessi = rata (rata 1)', Math.abs(p[0].quotaCapitale + p[0].quotaInteressi - 514.81) < 0.02);
}

console.log('— SERVICE WORKER: tutti gli asset esistono —');
{
  const sw = readFileSync(join(__dir, '../service-worker.js'), 'utf8');
  const assets = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(a => a && a !== '/');
  let mancanti = [];
  for (const a of assets) {
    try { readFileSync(join(__dir, '..', a)); } catch { mancanti.push(a); }
  }
  check(`tutti i ${assets.length} asset del SW esistono`, mancanti.length === 0, mancanti.join(','));
}

console.log('');
if (falliti) { console.log(`❌ ${falliti} TEST FALLITI`); process.exit(1); }
console.log('✅ TUTTI I TEST UNITARI PASSANO');
