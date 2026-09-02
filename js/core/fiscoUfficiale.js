// fiscoUfficiale.js — DATO FISCALE CERTIFICATO DAL DATORE, anno per anno e datore per
// datore. E' la fonte di SECONDO livello: sopra c'e' il 730 (vedi dichiarazioni.js),
// che e' l'unico documento in cui il conto si chiude davvero.
//
// Due fonti, entrambe ufficiali:
//  · CU (Certificazione Unica) per gli anni 2017-2021 -> reddito (punto 1) e ritenute
//    IRPEF (punto 21). Le addizionali e le detrazioni non le riporto: nella CU stanno
//    in caselle che cambiano posizione fra un anno e l'altro e non voglio rischiare di
//    attribuire un importo al campo sbagliato.
//  · Riquadro CONGUAGLIO della busta di dicembre (o dell'ultima busta, se il rapporto
//    e' cessato in corso d'anno) per il 2022-2025.
//
// DUE LIMITI STRUTTURALI di questi dati, scoperti confrontandoli col 730 e per i quali
// NON vanno piu' usati da soli per dire "hai pagato troppo":
//
//  a) le detrazioni qui sono solo quelle da lavoro dipendente. Il grosso (recupero
//     edilizio ~1.880/anno, bonus arredo 500/anno, oneri) il datore non lo applica e
//     non lo vede. Sottrarre solo queste dall'IRPEF per scaglioni fa sembrare che tu
//     abbia pagato meno del dovuto quando e' esattamente il contrario.
//
//  b) negli anni con DUE datori la somma delle loro IRPEF lorde non e' l'IRPEF lorda
//     dell'anno. Nel 2024 Bonfiglioli ha tassato la sua fetta al 23% e Schneider la
//     propria al 35% secco (30.658,53 x 0,35 = 10.730,49 esatto): insieme 15.075 EUR
//     contro i 13.983 che risultano applicando gli scaglioni al reddito complessivo.
//     1.092 EUR di troppo, restituiti col 730. La progressivita' si ricompone solo
//     nella dichiarazione.
//
// ATTENZIONE alla riga 2025: 'irpefLorda' vale 18.469,96, cioe' ESATTAMENTE quanto le
// ritenute. Il 730/2026 dice invece che l'imposta lorda del 2025 e' 15.332 e la netta
// 12.809. O il campo e' stato letto dalla casella sbagliata del conguaglio, o Schneider
// ha trattenuto 3.138 EUR piu' del dovuto: finche' non si riapre la busta di dicembre
// 2025 il dato resta marcato come DA VERIFICARE e non viene usato per i confronti.

export const FISCO_UFFICIALE = [
  // anno, datore, fonte, imponibile, IRPEF trattenuta, (detrazioni/addizionali se note)
  { anno: 2017, datore: 'Marposs',     fonte: 'CU', imponibile: 28321.77, irpefTrattenuta: 6111.00 },
  { anno: 2018, datore: 'Marposs',     fonte: 'CU', imponibile: 29720.62, irpefTrattenuta: 6695.81 },
  { anno: 2019, datore: 'Marposs',     fonte: 'CU', imponibile: 16279.80, irpefTrattenuta: 3110.37 },
  { anno: 2019, datore: 'SASIB',       fonte: 'CU', imponibile: 19537.57, irpefTrattenuta: 3937.27 },
  { anno: 2020, datore: 'SASIB',       fonte: 'CU', imponibile: 33607.37, irpefTrattenuta: 7811.78 },
  { anno: 2021, datore: 'SASIB',       fonte: 'CU', imponibile: 38869.43, irpefTrattenuta: 10290.99 },
  { anno: 2022, datore: 'Bonfiglioli', fonte: 'busta', imponibile: 38376.15, irpefLorda: 10331.65, detrazioni: 984.17,  irpefTrattenuta: 9347.48,  addReg: 661.04,  addCom: 250.23 },
  { anno: 2023, datore: 'Bonfiglioli', fonte: 'busta', imponibile: 46457.62, irpefLorda: 13160.17, detrazioni: 307.51,  irpefTrattenuta: 12852.66, addReg: 825.09,  addCom: 238.20 },
  { anno: 2024, datore: 'Bonfiglioli', fonte: 'busta', imponibile: 18891.11, irpefLorda: 4344.96,  detrazioni: 1052.38, irpefTrattenuta: 3292.58,  addReg: 274.60,  addCom: 82.02 },
  { anno: 2024, datore: 'Schneider',   fonte: 'busta', imponibile: 30658.53, irpefLorda: 10730.49, detrazioni: 1104.65, irpefTrattenuta: 9625.84,  addReg: 504.37,  addCom: 188.74 },
  { anno: 2025, datore: 'Schneider',   fonte: 'busta', imponibile: 52771.31, irpefLorda: 18469.96, detrazioni: 0,       irpefTrattenuta: 18469.96, addReg: 1187.28, addCom: 305.15, daVerificare: 'irpefLorda uguale alle ritenute: il 730 dice 15.332' },
];

// Gli scaglioni stanno in dichiarazioni.js insieme al 730: una tabella sola, per anno.
// Qui si ri-esportano per non rompere chi importava da questo modulo.
export { scaglioniDi, irpefPerScaglioni, irpefPerScaglioni as irpefTeorica } from './dichiarazioni.js';

// Totale certificato di un ANNO (sommando i datori che hanno lavorato in quell'anno).
export const certificatoDi = (anno) => {
  const righe = FISCO_UFFICIALE.filter(x => x.anno === Number(anno));
  if (!righe.length) return null;
  const s = (c) => Math.round(righe.reduce((t, x) => t + (x[c] || 0), 0) * 100) / 100;
  return {
    anno: Number(anno), datori: righe.map(x => x.datore), fonti: [...new Set(righe.map(x => x.fonte))],
    imponibile: s('imponibile'), irpefTrattenuta: s('irpefTrattenuta'),
    detrazioni: s('detrazioni'), addReg: s('addReg'), addCom: s('addCom'),
    completo: righe.every(x => x.fonte === 'busta'),
    piuDatori: righe.length > 1,
    daVerificare: righe.filter(x => x.daVerificare).map(x => `${x.datore}: ${x.daVerificare}`),
  };
};
