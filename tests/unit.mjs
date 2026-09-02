// tests/unit.mjs — logica pura, niente browser. Si esegue con: node tests/unit.mjs
//
// Il primo test e' quello che costa piu' caro quando salta: se APP_VERSION e
// CACHE_VERSION non combaciano, i telefoni continuano a servire il codice vecchio
// dalla cache e sembra che il rilascio non sia mai avvenuto.

import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../js/core/version.js';
import {
  DICHIARAZIONI, verificaIdentita, irpefPerScaglioni, scaglioniDi,
  plafondPrimaOccupazione, detrazionePluriennale, detrazionePluriennaleCalcolata, creditiInMaturazione,
} from '../js/core/dichiarazioni.js';
import { certificatoDi } from '../js/core/fiscoUfficiale.js';

let falliti = 0, passati = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) { passati++; console.log(`  ok   ${nome}`); }
  else { falliti++; console.log(`  FAIL ${nome}${extra ? ' — ' + extra : ''}`); }
};
const vicino = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

console.log('\nversioni');
{
  const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  const m = sw.match(/CACHE_VERSION\s*=\s*'finanze-v([\d.]+?)\.0'/);
  ok('APP_VERSION e CACHE_VERSION combaciano', m && m[1] === APP_VERSION,
    `app ${APP_VERSION} vs cache ${m ? m[1] : '?'}`);
  ok('dichiarazioni.js e' + ' nella cache del service worker', sw.includes('./js/core/dichiarazioni.js'));
}

console.log('\n730 — identita' + ' contabili');
{
  ok('dieci anni d\'imposta', DICHIARAZIONI.length === 10, `trovati ${DICHIARAZIONI.length}`);
  ok('anni consecutivi 2016-2025',
    DICHIARAZIONI.every((d, i) => d.anno === 2016 + i));
  ok('ogni dichiarazione e\' presentata l\'anno dopo',
    DICHIARAZIONI.every(d => d.presentata === d.anno + 1));
  for (const v of verificaIdentita()) {
    ok(`${v.anno}: lorda - detrazioni = netta`, v.scartoNetta === 0, `scarto ${v.scartoNetta}`);
    ok(`${v.anno}: ritenute - netta = -differenza`, v.scartoDifferenza === 0, `scarto ${v.scartoDifferenza}`);
    ok(`${v.anno}: lorda coerente con gli scaglioni`, vicino(v.scartoScaglioni, 0),
      `scarto ${v.scartoScaglioni}`);
  }
}

console.log('\nscaglioni storici');
{
  // Tre regimi diversi. La regressione da evitare e' usare quelli del 2022 per il 2021:
  // sull'imponibile 2021 fa 586 EUR di differenza.
  ok('2021 ha cinque scaglioni', scaglioniDi(2021).length === 5);
  ok('2022 ne ha quattro', scaglioniDi(2022).length === 4);
  ok('2024 ne ha tre', scaglioniDi(2024).length === 3);
  ok('2021: 27% sul secondo scaglione', scaglioniDi(2021)[1][1] === 0.27);
  ok('20.000 nel 2021 = 4.800', vicino(irpefPerScaglioni(20000, 2021), 4800, 0.01));
  ok('20.000 nel 2024 = 4.600', vicino(irpefPerScaglioni(20000, 2024), 4600, 0.01));
  ok('gli scaglioni 2021 non sono quelli del 2022',
    irpefPerScaglioni(38869, 2021) !== irpefPerScaglioni(38869, 2022));
}

console.log('\nplafond previdenza complementare');
{
  const p = plafondPrimaOccupazione();
  ok('cinque anni di riferimento', p.primiCinqueAnni.length === 5);
  ok('residuo positivo e sotto il massimo teorico', p.residuo > 0 && p.residuo <= 25822.85);
  ok('incremento annuo mai oltre 2.582,29', p.incrementoAnnuo <= 2582.29);
  ok('tetto annuo = ordinario + incremento',
    vicino(p.tettoAnnuo, 5164.57 + p.incrementoAnnuo, 0.01));
  ok('finestra chiusa al 25esimo anno di adesione', p.scadenza === 2040);
}

console.log('\ndetrazioni pluriennali');
{
  // Sugli anni dichiarati deve rispondere il 730, non la ricostruzione.
  for (const d of DICHIARAZIONI.filter(x => x.anno >= 2019)) {
    ok(`${d.anno}: detrazione pluriennale presa dal 730`,
      detrazionePluriennale(d.anno) === d.detr.recupero + d.detr.arredo);
  }
  // Sull'ultimo anno, da cui la tabella delle rate e' stata letta, le due strade
  // devono convergere: se non lo fanno, la tabella degli interventi e' incompleta.
  const ultimo = DICHIARAZIONI[DICHIARAZIONI.length - 1];
  ok(`${ultimo.anno}: rate ricostruite = detrazioni del 730`,
    vicino(detrazionePluriennaleCalcolata(ultimo.anno), ultimo.detr.recupero + ultimo.detr.arredo, 3),
    `calcolato ${detrazionePluriennaleCalcolata(ultimo.anno)} vs 730 ${ultimo.detr.recupero + ultimo.detr.arredo}`);
  const c = creditiInMaturazione(2026);
  ok('il calendario futuro parte dal 2026', c.righe[0].anno === 2026);
  ok('gli importi futuri sono decrescenti',
    c.righe.every((r, i) => i === 0 || r.tot <= c.righe[i - 1].tot));
  ok('residuo totale coerente con la somma delle righe',
    vicino(c.residuoTotale, c.righe.reduce((s, r) => s + r.tot, 0), 0.01));
}

console.log('\nincrocio 730 / dato certificato dal datore');
{
  // L'imponibile del 730 deve ritrovarsi nei dati di busta o CU, a meno degli oneri
  // deducibili e degli altri redditi che il datore non vede.
  for (const d of DICHIARAZIONI.filter(x => x.anno >= 2017)) {
    const c = certificatoDi(d.anno);
    if (!c) continue;
    const atteso = c.imponibile + (d.altriRedditi || 0) - (d.oneriDeducibili || 0);
    ok(`${d.anno}: imponibile 730 spiegato dal certificato`, vicino(atteso, d.imponibile, 1.5),
      `certificato ${c.imponibile} + altri ${d.altriRedditi} - oneri ${d.oneriDeducibili} = ${atteso.toFixed(2)} vs 730 ${d.imponibile}`);
  }
  const c25 = certificatoDi(2025);
  ok('la riga 2025 e\' marcata da verificare', c25.daVerificare.length === 1);
}

console.log(`\n${passati} passati, ${falliti} falliti\n`);
process.exit(falliti ? 1 : 0);
