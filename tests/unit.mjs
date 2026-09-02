// tests/unit.mjs — logica pura, niente browser. Si esegue con: node tests/unit.mjs
//
// Il primo test e' quello che costa piu' caro quando salta: se APP_VERSION e
// CACHE_VERSION non combaciano, i telefoni continuano a servire il codice vecchio
// dalla cache e sembra che il rilascio non sia mai avvenuto.

import { readFileSync, readdirSync } from 'node:fs';
import { APP_VERSION } from '../js/core/version.js';
import { toISO, toAnnomese } from '../js/core/utils.js';
import {
  DICHIARAZIONI, verificaIdentita, irpefPerScaglioni, scaglioniDi,
  plafondPrimaOccupazione, detrazionePluriennale, detrazionePluriennaleCalcolata, creditiInMaturazione,
} from '../js/core/dichiarazioni.js';
import { certificatoDi } from '../js/core/fiscoUfficiale.js';
import { pianoSeed } from '../js/core/seedStipendi.js';
import { state } from '../js/core/store.js';
import { round2 } from '../js/core/utils.js';
import { bilancioAnnuale, candidatiUnaTantum, TAG_UNA_TANTUM } from '../js/services/bilancioService.js';

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

console.log('\ndate: ora locale, non UTC');
{
  // La radice di tre bug diversi: toISOString() converte in UTC e in Italia la
  // mezzanotte locale cade nel giorno prima. Il primo del mese diventava l'ultimo del
  // mese precedente (rate del mutuo nel mese sbagliato, sparkline sfalsata di un mese),
  // e una data inserita all'una di notte tornava indietro di un giorno.
  const primoOttobre = new Date(2026, 9, 1);
  ok('toISO tiene il giorno locale sul primo del mese', toISO(primoOttobre) === '2026-10-01',
    `ottenuto ${toISO(primoOttobre)}`);
  ok('toISO non e\' toISOString', toISO(primoOttobre) !== primoOttobre.toISOString().slice(0, 10)
    || primoOttobre.getTimezoneOffset() >= 0);
  ok('toAnnomese resta nel mese giusto', toAnnomese(primoOttobre) === '2026-10',
    `ottenuto ${toAnnomese(primoOttobre)}`);
  const meta = new Date(2026, 9, 15, 0, 30);
  ok('toISO regge la mezzanotte e mezza', toISO(meta) === '2026-10-15', `ottenuto ${toISO(meta)}`);

  // Guardia di regressione: nessun sorgente deve tornare a fabbricare date con
  // toISOString().slice(). I timestamp interi (marcatempo) restano leciti.
  const dir = new URL('../js/', import.meta.url);
  const colpevoli = [];
  const scorri = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const u = new URL(e.name + (e.isDirectory() ? '/' : ''), d);
      if (e.isDirectory()) scorri(u);
      else if (e.name.endsWith('.js')) {
        const txt = readFileSync(u, 'utf8');
        if (/toISOString\(\)\.slice/.test(txt)) colpevoli.push(e.name);
      }
    }
  };
  scorri(dir);
  ok('nessun toISOString().slice() nei sorgenti', colpevoli.length === 0, colpevoli.join(', '));
}

console.log('\nbilancio: entrate, uscite, quel che resta');
{
  // Lo stato e' un oggetto esportato e mutabile: si puo' riempire a mano senza
  // IndexedDB e provare la logica pura del servizio.
  state.conti = [
    { nome: 'Conto', tipo: 'liquidita' },
    { nome: 'ETF', tipo: 'investimenti' },
  ];
  state._idxContoByNome = Object.fromEntries(state.conti.map(c => [c.nome, c]));
  state.stipendi = [{ anno: 2024, mese: 1, netto: 20000, addebiti_netti: 0 }];
  state.movimenti = [
    { id: 'e1', data: '2024-03-10', tipo: 'entrata', cat: 'Stipendio', imp: 20000, tag: [] },
    { id: 'e2', data: '2024-07-01', tipo: 'entrata', cat: 'Vendite', imp: 10000, tag: [TAG_UNA_TANTUM], desc: 'Vendita auto' },
    { id: 's1', data: '2024-04-10', tipo: 'spesa', imp: 12000, tag: [] },
    { id: 's2', data: '2024-07-02', tipo: 'spesa', imp: 8000, tag: [TAG_UNA_TANTUM], desc: 'Saldo auto' },
    { id: 't1', data: '2024-05-10', tipo: 'trasferimento', contoDest: 'ETF', imp: 5000, tag: [] },
    { id: 't2', data: '2024-05-11', tipo: 'trasferimento', contoDest: 'Conto', imp: 999, tag: [] },
  ];
  const [r] = bilancioAnnuale().filter(x => x.anno === '2024');
  ok('entrate sommate dai movimenti', r.entrate === 30000, `${r.entrate}`);
  ok('speso sommato dai movimenti', r.speso === 20000, `${r.speso}`);
  ok('accantonato solo verso conti risparmio/investimenti', r.accantonato === 5000, `${r.accantonato}`);
  ok('rimasto = entrate - speso - accantonato', r.rimasto === 5000, `${r.rimasto}`);
  ok('risparmiato = entrate - speso', r.risparmiato === r.entrate - r.speso, `${r.risparmiato}`);
  ok('tasso = risparmiato / entrate', Math.round(r.tasso) === 33, `${r.tasso}`);
  // tolte le una tantum da entrambi i lati: 20.000 dentro, 12.000 fuori -> 40%
  ok('tasso ordinario esclude le una tantum dai due lati',
    Math.round(r.tassoOrdinario) === 40, `${r.tassoOrdinario}`);
  ok('le una tantum sono elencate', r.straordinari.length === 2);
  ok('scarto con le buste calcolato', r.scartoBuste === 0, `${r.scartoBuste}`);
  ok('anno non in rosso', r.inRosso === false);

  // stessa scena ma con un accantonamento superiore a quel che avanza
  state.movimenti.push({ id: 't3', data: '2024-06-01', tipo: 'trasferimento', contoDest: 'ETF', imp: 9000, tag: [] });
  const [r2] = bilancioAnnuale().filter(x => x.anno === '2024');
  ok('accantonare oltre l\'avanzo mette l\'anno in rosso', r2.inRosso === true, `rimasto ${r2.rimasto}`);
  ok('ma il tasso di risparmio non cambia', Math.round(r2.tasso) === 33, `${r2.tasso}`);

  // ── la rata del mutuo si divide: il capitale non e' spesa ──
  state.mutuo = { importo_iniziale: 80000, tasso: 2, durata_mesi: 180, rata: 514.81,
    data_inizio: '2018-03-31', giorno_addebito: 28, macro: 'Casa', cat: 'Affitto/Mutuo', sub: 'Rata Mutuo' };
  state.eventiMutuo = [];
  state.finanziamenti = [];
  const senzaMutuo = bilancioAnnuale().find(x => x.anno === '2024');
  state.movimenti.push(...Array.from({ length: 12 }, (_, i) => ({
    id: 'mut' + i, data: `2024-${String(i + 1).padStart(2, '0')}-28`, tipo: 'spesa',
    macro: 'Casa', cat: 'Affitto/Mutuo', sub: 'Rata Mutuo', imp: 514.81, tag: [],
  })));
  const conMutuo = bilancioAnnuale().find(x => x.anno === '2024');
  const rate = round2(514.81 * 12);
  ok('le rate del mutuo sono riconosciute', conMutuo.rateDebito === rate, `${conMutuo.rateDebito}`);
  ok('capitale + interessi = rate registrate',
    round2(conMutuo.capitaleDebito + conMutuo.interessiDebito) === rate,
    `${conMutuo.capitaleDebito} + ${conMutuo.interessiDebito}`);
  ok('nel 2024 il capitale e\' la parte grossa della rata',
    conMutuo.capitaleDebito / rate > 0.8, `${(conMutuo.capitaleDebito / rate * 100).toFixed(1)}%`);
  ok('tutte e dodici le rate del 2024 sono abbinate', conMutuo.rateMancanti === 0,
    `mancanti ${conMutuo.rateMancanti}`);
  ok('il capitale NON finisce fra le spese',
    round2(conMutuo.speso - senzaMutuo.speso) === conMutuo.interessiDebito,
    `speso cresciuto di ${round2(conMutuo.speso - senzaMutuo.speso)}, interessi ${conMutuo.interessiDebito}`);
  ok('la cassa pero\' e\' uscita davvero: rimasto scende di tutta la rata',
    round2(senzaMutuo.rimasto - conMutuo.rimasto) === rate,
    `${round2(senzaMutuo.rimasto - conMutuo.rimasto)}`);
  ok('l\'identita\' torna: entrate = speso + capitale + accantonato + rimasto',
    round2(conMutuo.speso + conMutuo.capitaleDebito + conMutuo.accantonato + conMutuo.rimasto) === conMutuo.entrate,
    `${conMutuo.speso} + ${conMutuo.capitaleDebito} + ${conMutuo.accantonato} + ${conMutuo.rimasto} vs ${conMutuo.entrate}`);
  // Il paragone giusto NON e' con l'anno senza mutuo — un mutuo aggiunge un costo vero
  // (gli interessi) e il tasso infatti scende un po'. E' con il trattamento ingenuo, che
  // considera spesa tutta la rata: li' il tasso crollerebbe di oltre il triplo.
  const tassoIngenuo = round2((conMutuo.entrate - (conMutuo.speso + rate - conMutuo.interessiDebito)) / conMutuo.entrate * 100);
  ok('il capitale non deprime il tasso come farebbe la rata intera',
    conMutuo.tasso > tassoIngenuo + 15,
    `con lo split ${conMutuo.tasso}% contro ${tassoIngenuo}% contando tutta la rata`);
  ok('solo gli interessi erodono il tasso',
    vicino(senzaMutuo.tasso - conMutuo.tasso, conMutuo.interessiDebito / conMutuo.entrate * 100, 0.02),
    `${senzaMutuo.tasso}% -> ${conMutuo.tasso}%`);
  // ── una rata che nel registro non c'e' va dichiarata, non spalmata ──
  state.movimenti = state.movimenti.filter(m => m.id !== 'mut5');   // via giugno
  const buco = bilancioAnnuale().find(x => x.anno === '2024');
  ok('la rata mancante viene contata', buco.rateMancanti === 1, `${buco.rateMancanti}`);
  ok('il capitale scende di una rata sola',
    buco.capitaleDebito < conMutuo.capitaleDebito && buco.capitaleDebito > conMutuo.capitaleDebito * 0.9,
    `${conMutuo.capitaleDebito} -> ${buco.capitaleDebito}`);
  ok('e l\'identita\' regge lo stesso',
    round2(buco.speso + buco.capitaleDebito + buco.accantonato + buco.rimasto) === buco.entrate);

  // ── i finanziamenti NON si dividono: un elettrodomestico si consuma ──
  state.movimenti = state.movimenti.filter(m => !m.id.startsWith('mut'));
  state.finanziamenti = [{ importo_iniziale: 972, tasso: 0, durata_mesi: 20, rata: 48.59,
    data_inizio: '2024-05-05', giorno_addebito: 5, macro: 'Casa', cat: 'Finanziamenti', sub: 'Elettrodomestico' }];
  state.movimenti.push({ id: 'fin1', data: '2024-05-05', tipo: 'spesa',
    macro: 'Casa', cat: 'Finanziamenti', sub: 'Elettrodomestico', imp: 48.59, tag: [] });
  const conFin = bilancioAnnuale().find(x => x.anno === '2024');
  ok('la rata del finanziamento resta spesa intera', conFin.capitaleDebito === 0, `${conFin.capitaleDebito}`);
  state.movimenti = state.movimenti.filter(m => m.id !== 'fin1');
  state.finanziamenti = [];
  state.mutuo = null;

  const cand = candidatiUnaTantum();
  ok('i candidati escludono gli stipendi e i gia\' marcati',
    cand.length === 1 && cand[0].id === 's1', cand.map(c => c.id).join(','));
}

console.log('\nseed buste paga: la correzione a mano vince sul seed');
{
  // Il seed delle buste e' autoritativo per scelta, ma una busta corretta a mano no:
  // chi l'ha corretta ha guardato il cedolino. Fino alla 3.35 la busta modificata
  // teneva l'id del seed, rientrava nel confronto, l'impronta non tornava mai e a ogni
  // avvio veniva riscritta. Questi controlli stanno di guardia proprio li'.
  const SEED = [
    { id: 'a', anno: 2024, mese: 1, datore: 'X', netto: 100, lordo: 200, cometa_azienda: 0 },
    { id: 'b', anno: 2024, mese: 2, datore: 'X', netto: 110, lordo: 210, cometa_azienda: 0 },
  ];

  const uguale = pianoSeed(SEED.map(b => ({ ...b })), SEED);
  ok('database identico al seed: non si tocca niente', uguale.allineato === true);

  // una busta corretta a mano, con importi diversi
  const conManuale = [
    { ...SEED[0], netto: 999, manuale: true },
    { ...SEED[1] },
  ];
  const pm = pianoSeed(conManuale, SEED);
  ok('con una busta manuale il seed resta allineato', pm.allineato === true,
    `allineato=${pm.allineato}`);
  ok('la busta manuale non viene riscritta',
    !pm.daSeminare.some(b => b.id === 'a'), pm.daSeminare.map(b => b.id).join(','));
  ok('la busta manuale non viene cancellata',
    !pm.obsoleti.some(b => b.id === 'a'));

  // una busta di seed davvero mancante: li' il riallineamento deve scattare
  const mancante = pianoSeed([{ ...SEED[0] }], SEED);
  ok('se manca una busta di seed, si risemina', mancante.allineato === false);
  ok('e si riscrivono entrambe', mancante.daSeminare.length === 2);

  // residuo di un seed vecchio (stesso periodo, id diverso, non manuale)
  const conResiduo = pianoSeed(
    [...SEED.map(b => ({ ...b })), { id: 'vecchio', anno: 2024, mese: 1, datore: 'X', netto: 1, lordo: 1 }],
    SEED);
  ok('un residuo di seed vecchio viene rimosso',
    conResiduo.obsoleti.length === 1 && conResiduo.obsoleti[0].id === 'vecchio',
    conResiduo.obsoleti.map(b => b.id).join(','));

  // busta aggiunta dall'utente su un periodo che il seed non copre
  const conAggiunta = pianoSeed(
    [...SEED.map(b => ({ ...b })), { id: 'c', anno: 2024, mese: 3, datore: 'Y', netto: 50, lordo: 60, manuale: true }],
    SEED);
  ok('una busta aggiunta a mano non fa riseminare', conAggiunta.allineato === true);
  ok('e non viene rimossa', conAggiunta.obsoleti.length === 0);
}

console.log(`\n${passati} passati, ${falliti} falliti\n`);
process.exit(falliti ? 1 : 0);
