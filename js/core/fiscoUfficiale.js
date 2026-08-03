// fiscoUfficiale.js — DATO FISCALE CERTIFICATO, anno per anno e datore per datore.
//
// Due fonti, entrambe ufficiali:
//  · CU (Certificazione Unica) per gli anni 2017-2021 -> reddito (punto 1) e ritenute
//    IRPEF (punto 21). Le addizionali e le detrazioni non le riporto: nella CU stanno
//    in caselle che cambiano posizione fra un anno e l'altro e non voglio rischiare di
//    attribuire un importo al campo sbagliato.
//  · Riquadro CONGUAGLIO della busta di dicembre (o dell'ultima busta, se il rapporto
//    e' cessato in corso d'anno) per il 2022-2025: qui c'e' tutto, detrazioni comprese.
//
// A cosa serve: e' la PIETRA DI PARAGONE. I totali d'anno mostrati dall'app vengono da
// qui quando il dato certificato esiste; la somma delle singole buste resta accanto, e
// dove le due non coincidono l'app lo dichiara invece di nasconderlo.

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
  { anno: 2025, datore: 'Schneider',   fonte: 'busta', imponibile: 52771.31, irpefLorda: 18469.96, detrazioni: 0,       irpefTrattenuta: 18469.96, addReg: 1187.28, addCom: 305.15 },
];

// Scaglioni IRPEF PER ANNO: fino al 2023 erano quattro (col 25% fra 15k e 28k),
// dal 2024 sono tre. Usare quelli sbagliati falsa il confronto di 260 EUR l'anno.
const SCAGLIONI = {
  fino2023: [[15000, 0.23], [28000, 0.25], [50000, 0.35], [Infinity, 0.43]],
  dal2024:  [[28000, 0.23], [50000, 0.35], [Infinity, 0.43]],
};

export const irpefTeorica = (imponibile, anno) => {
  const sc = anno >= 2024 ? SCAGLIONI.dal2024 : SCAGLIONI.fino2023;
  let dovuta = 0, prec = 0;
  for (const [limite, aliquota] of sc) {
    if (imponibile <= prec) break;
    dovuta += (Math.min(imponibile, limite) - prec) * aliquota;
    prec = limite;
  }
  return Math.round(dovuta * 100) / 100;
};

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
  };
};
