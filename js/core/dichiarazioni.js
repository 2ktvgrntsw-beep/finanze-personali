// dichiarazioni.js — I MODELLI 730, anno d'imposta per anno d'imposta.
//
// Perche' esiste questo file. Fino alla versione 3.29 la sezione Stipendi conosceva
// solo quello che passa dalla busta paga: imponibile, IRPEF, addizionali, Cometa. La
// busta pero' vede una fetta sola. Il 730 chiude il cerchio, e lo fa con tre dati che
// dalla busta non si ricavano in nessun modo:
//   1. le DETRAZIONI vere (recupero edilizio, arredo, oneri): in busta ci sono solo
//      quelle da lavoro dipendente, che sono meno di un terzo del totale;
//   2. il REDDITO COMPLESSIVO, che comprende abitazione principale e altri redditi;
//   3. il SALDO: ritenute contro imposta netta, cioe' quanto e' tornato indietro.
//
// GERARCHIA DELLE FONTI: 730 > conguaglio di busta > CU. Dove c'e' la dichiarazione,
// e' lei a comandare; le altre restano come riscontro.
//
// Come e' stato prodotto: parsing del prospetto di liquidazione 730-3 dei PDF scaricati
// dall'Agenzia delle Entrate. Ogni riga e' stata verificata su TRE identita' contabili
// (vedi verificaIdentita() in fondo): imposta lorda - detrazioni = imposta netta,
// ritenute - imposta netta = -differenza, e imposta lorda = scaglioni dell'anno
// applicati all'imponibile. Tutti e dieci gli anni tornano all'euro.
//
// Gli importi sono arrotondati all'euro perche' cosi' stanno nel modello: il 730
// ragiona in euro interi, non in centesimi.

export const DICHIARAZIONI = [
  { anno: 2016, presentata: 2017,
    lavDip: 19593, altriRedditi: 0, abitPrinc: 0,
    redditoComplessivo: 19593, deduzioneAbit: 0, oneriDeducibili: 0,
    imponibile: 19593, impostaLorda: 4690,
    detr: { lavDip: 1011, oneri: 122, recupero: 0, arredo: 0, ulteriore: 0, altre: 0, totale: 1133 },
    impostaNetta: 3557, ritenute: 3679, differenza: -122,
    addRegDovuta: 288, addRegCert: 288, addComDovuta: 157, addComCert: 157,
    rimborsoBusta: 122, trattenutoBusta: 0,
    cometaOrdinario: 0, cometaPrimaOccupazione: 0, interessiMutuo: 0 },
  { anno: 2017, presentata: 2018,
    lavDip: 28322, altriRedditi: 0, abitPrinc: 0,
    redditoComplessivo: 28322, deduzioneAbit: 0, oneriDeducibili: 0,
    imponibile: 28322, impostaLorda: 7082,
    detr: { lavDip: 966, oneri: 103, recupero: 1759, arredo: 0, ulteriore: 0, altre: 0, totale: 2828 },
    impostaNetta: 4254, ritenute: 6111, differenza: -1857,
    addRegDovuta: 457, addRegCert: 457, addComDovuta: 227, addComCert: 227,
    rimborsoBusta: 1857, trattenutoBusta: 0,
    cometaOrdinario: 0, cometaPrimaOccupazione: 863, interessiMutuo: 0 },
  { anno: 2018, presentata: 2019,
    lavDip: 29721, altriRedditi: 0, abitPrinc: 135,
    redditoComplessivo: 29856, deduzioneAbit: 135, oneriDeducibili: 0,
    imponibile: 29721, impostaLorda: 7614,
    detr: { lavDip: 916, oneri: 844, recupero: 1860, arredo: 500, ulteriore: 0, altre: 0, totale: 4120 },
    impostaNetta: 3494, ritenute: 6696, differenza: -3202,
    addRegDovuta: 485, addRegCert: 485, addComDovuta: 238, addComCert: 238,
    rimborsoBusta: 3202, trattenutoBusta: 0,
    cometaOrdinario: 0, cometaPrimaOccupazione: 961, interessiMutuo: 0 },
  { anno: 2019, presentata: 2020,
    lavDip: 35818, altriRedditi: 0, abitPrinc: 563,
    redditoComplessivo: 36381, deduzioneAbit: 563, oneriDeducibili: 0,
    imponibile: 35818, impostaLorda: 9931,
    detr: { lavDip: 693, oneri: 98, recupero: 1869, arredo: 500, ulteriore: 0, altre: 0, totale: 3160 },
    impostaNetta: 6771, ritenute: 7047, differenza: -276,
    addRegDovuta: 609, addRegCert: 511, addComDovuta: 176, addComCert: 150,
    rimborsoBusta: 124, trattenutoBusta: 0,
    cometaOrdinario: 1087, cometaPrimaOccupazione: 402, interessiMutuo: 0 },
  { anno: 2020, presentata: 2021,
    lavDip: 33607, altriRedditi: 253, abitPrinc: 659,
    redditoComplessivo: 34519, deduzioneAbit: 659, oneriDeducibili: 0,
    imponibile: 33860, impostaLorda: 9187,
    detr: { lavDip: 766, oneri: 95, recupero: 1875, arredo: 500, ulteriore: 500, altre: 0, totale: 3736 },
    impostaNetta: 5451, ritenute: 7812, differenza: -2361,
    addRegDovuta: 569, addRegCert: 564, addComDovuta: 163, addComCert: 190,
    rimborsoBusta: 2388, trattenutoBusta: 0,
    cometaOrdinario: 2029, cometaPrimaOccupazione: 0, interessiMutuo: 0 },
  { anno: 2021, presentata: 2022,
    lavDip: 38869, altriRedditi: 0, abitPrinc: 659,
    redditoComplessivo: 39528, deduzioneAbit: 659, oneriDeducibili: 0,
    imponibile: 38869, impostaLorda: 11090,
    detr: { lavDip: 583, oneri: 106, recupero: 1876, arredo: 500, ulteriore: 216, altre: 0, totale: 3281 },
    impostaNetta: 7809, ritenute: 10291, differenza: -2482,
    addRegDovuta: 671, addRegCert: 671, addComDovuta: 196, addComCert: 195,
    rimborsoBusta: 2423, trattenutoBusta: 0,
    cometaOrdinario: 2118, cometaPrimaOccupazione: 0, interessiMutuo: 0 },
  { anno: 2022, presentata: 2023,
    lavDip: 38376, altriRedditi: 0, abitPrinc: 659,
    redditoComplessivo: 39035, deduzioneAbit: 659, oneriDeducibili: 0,
    imponibile: 38376, impostaLorda: 10332,
    detr: { lavDip: 984, oneri: 158, recupero: 1876, arredo: 500, ulteriore: 0, altre: 0, totale: 3518 },
    impostaNetta: 6814, ritenute: 9347, differenza: -2533,
    addRegDovuta: 661, addRegCert: 661, addComDovuta: 250, addComCert: 309,
    rimborsoBusta: 2592, trattenutoBusta: 0,
    cometaOrdinario: 2354, cometaPrimaOccupazione: 0, interessiMutuo: 0 },
  { anno: 2023, presentata: 2024,
    lavDip: 46458, altriRedditi: 0, abitPrinc: 563,
    redditoComplessivo: 47021, deduzioneAbit: 563, oneriDeducibili: 45,
    imponibile: 46413, impostaLorda: 13145,
    detr: { lavDip: 308, oneri: 70, recupero: 1884, arredo: 500, ulteriore: 0, altre: 0, totale: 2762 },
    impostaNetta: 10383, ritenute: 12853, differenza: -2470,
    addRegDovuta: 824, addRegCert: 825, addComDovuta: 313, addComCert: 313,
    rimborsoBusta: 2470, trattenutoBusta: 0,
    cometaOrdinario: 2883, cometaPrimaOccupazione: 0, interessiMutuo: 0 },
  { anno: 2024, presentata: 2025,
    lavDip: 49550, altriRedditi: 0, abitPrinc: 563,
    redditoComplessivo: 50113, deduzioneAbit: 563, oneriDeducibili: 0,
    imponibile: 49550, impostaLorda: 13983,
    detr: { lavDip: 39, oneri: 93, recupero: 1888, arredo: 500, ulteriore: 0, altre: 0, totale: 2520 },
    impostaNetta: 11463, ritenute: 12919, differenza: -1456,
    addRegDovuta: 888, addRegCert: 779, addComDovuta: 336, addComCert: 302,
    rimborsoBusta: 1269, trattenutoBusta: 0,
    cometaOrdinario: 2973, cometaPrimaOccupazione: 0, interessiMutuo: 0 },
  { anno: 2025, presentata: 2026,
    lavDip: 52771, altriRedditi: 0, abitPrinc: 563,
    redditoComplessivo: 53334, deduzioneAbit: 563, oneriDeducibili: 0,
    imponibile: 52771, impostaLorda: 15332,
    detr: { lavDip: 0, oneri: 129, recupero: 1894, arredo: 500, ulteriore: 0, altre: 0, totale: 2523 },
    impostaNetta: 12809, ritenute: 18470, differenza: -5661,
    addRegDovuta: 1187, addRegCert: 1187, addComDovuta: 362, addComCert: 406,
    rimborsoBusta: 5705, trattenutoBusta: 0,
    cometaOrdinario: 3174, cometaPrimaOccupazione: 0, interessiMutuo: 0 },];

// ─────────────────────────────────────────────────────────────────────────────
// SCAGLIONI IRPEF STORICI. Non sono due set, sono TRE, e usarne uno per l'altro
// falsa il confronto fino a 586 EUR su un anno solo (2021).
//   2016-2021: 23% / 27% / 38% / 41% / 43%
//   2022-2023: 23% / 25% / 35% / 43%      (riforma 2022, quattro scaglioni)
//   dal 2024:  23% / 35% / 43%            (accorpamento dei primi due)
// ─────────────────────────────────────────────────────────────────────────────
export const scaglioniDi = (anno) => {
  if (anno <= 2021) return [[15000, 0.23], [28000, 0.27], [55000, 0.38], [75000, 0.41], [Infinity, 0.43]];
  if (anno <= 2023) return [[15000, 0.23], [28000, 0.25], [50000, 0.35], [Infinity, 0.43]];
  return [[28000, 0.23], [50000, 0.35], [Infinity, 0.43]];
};

export const irpefPerScaglioni = (imponibile, anno) => {
  let dovuta = 0, prec = 0;
  for (const [limite, aliquota] of scaglioniDi(anno)) {
    if (imponibile <= prec) break;
    dovuta += (Math.min(imponibile, limite) - prec) * aliquota;
    prec = limite;
  }
  return Math.round(dovuta * 100) / 100;
};

export const dichiarazioneDi = (anno) => DICHIARAZIONI.find(d => d.anno === Number(anno)) || null;
export const anniDichiarati = () => DICHIARAZIONI.map(d => d.anno).sort((a, b) => b - a);
// L'anno in cui il credito di una dichiarazione entra materialmente in banca.
export const dichiarazioneIncassataNel = (anno) =>
  DICHIARAZIONI.find(d => d.presentata === Number(anno)) || null;

// ─────────────────────────────────────────────────────────────────────────────
// PREVIDENZA COMPLEMENTARE — il plafond di deduzione.
//
// Tetto ordinario: 5.164,57 EUR l'anno, e ci rientrano i contributi del lavoratore
// E quelli del datore. Il TFR conferito NO: non e' deducibile, non erode il plafond.
//
// Prima occupazione (art. 8 c.6 D.lgs 252/2005): chi ha iniziato a lavorare dopo il
// 1/1/2007 e nei primi cinque anni di adesione non ha saturato il tetto, dal SESTO al
// VENTICINQUESIMO anno puo' alzarlo di quanto ha lasciato sul tavolo, fino a
// +2.582,29 EUR l'anno. Il plafond arretrato non si perde: scade nel 2040.
// ─────────────────────────────────────────────────────────────────────────────
export const PLAFOND_ORDINARIO = 5164.57;
export const PLAFOND_INCREMENTO_MAX = 2582.29;
const PLAFOND_PRIMI_5 = 25822.85;   // 5 x 5.164,57

// Adesione a Cometa: 10 aprile 2016 -> primi cinque anni = 2016-2020,
// finestra dell'incremento = dal 2021 al 2040.
export const ANNO_ADESIONE = 2016;
const PRIMI_CINQUE = [2016, 2017, 2018, 2019, 2020];

export const dedottoDi = (d) => (d.cometaOrdinario || 0) + (d.cometaPrimaOccupazione || 0);

export const plafondPrimaOccupazione = () => {
  const nei5 = DICHIARAZIONI.filter(d => PRIMI_CINQUE.includes(d.anno));
  const dedotto5 = nei5.reduce((s, d) => s + dedottoDi(d), 0);
  const usatoDopo = DICHIARAZIONI.filter(d => d.anno > 2020)
    .reduce((s, d) => s + (d.cometaPrimaOccupazione || 0), 0);
  const residuo = Math.round((PLAFOND_PRIMI_5 - dedotto5 - usatoDopo) * 100) / 100;
  return {
    primiCinqueAnni: PRIMI_CINQUE, dedottoNeiPrimiCinque: Math.round(dedotto5 * 100) / 100,
    usatoNellaFinestra: Math.round(usatoDopo * 100) / 100,
    residuo: Math.max(0, residuo),
    incrementoAnnuo: Math.min(PLAFOND_INCREMENTO_MAX, Math.max(0, residuo)),
    tettoAnnuo: Math.round((PLAFOND_ORDINARIO + Math.min(PLAFOND_INCREMENTO_MAX, Math.max(0, residuo))) * 100) / 100,
    scadenza: ANNO_ADESIONE + 24,   // 25o anno di adesione = 2040
  };
};

// Serie anno per anno: quanto hai dedotto e quanto ti e' avanzato del tetto ordinario.
export const seriePlafond = () => DICHIARAZIONI.map(d => {
  const ded = dedottoDi(d);
  return {
    anno: d.anno, dedotto: Math.round(ded * 100) / 100,
    ordinario: d.cometaOrdinario || 0, primaOccupazione: d.cometaPrimaOccupazione || 0,
    nonUsato: Math.round((PLAFOND_ORDINARIO - ded) * 100) / 100,
    quota: Math.round(ded / PLAFOND_ORDINARIO * 100),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICA DELLE IDENTITA' CONTABILI. Non e' un vezzo: se domani si aggiunge un anno
// a mano e si sbaglia una casella, questo lo becca prima che finisca in una schermata.
// ─────────────────────────────────────────────────────────────────────────────
export const verificaIdentita = () => DICHIARAZIONI.map(d => {
  const netta = d.impostaLorda - d.detr.totale;
  const diff = d.impostaNetta - d.ritenute;
  const teorica = irpefPerScaglioni(d.imponibile, d.anno);
  return {
    anno: d.anno,
    scartoNetta: Math.round((netta - d.impostaNetta) * 100) / 100,
    scartoDifferenza: Math.round((diff - d.differenza) * 100) / 100,
    scartoScaglioni: Math.round((teorica - d.impostaLorda) * 100) / 100,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// DETRAZIONI PLURIENNALI — i bonus edilizi in corso, letti dal quadro E sezione III-A
// del 730/2026 (che elenca TUTTI gli interventi ancora in ammortamento).
// Ogni intervento si detrae al 50% in dieci rate annuali uguali: la prima nell'anno
// della spesa. Quello che conta e' che sono crediti GIA' ACQUISITI: si sa in anticipo,
// all'euro, quanto sconto fiscale arriva ogni anno fino all'ultima rata.
// Il bonus arredo e' agganciato all'intervento 2017 e vale 500 EUR l'anno dal 2018.
// ─────────────────────────────────────────────────────────────────────────────
export const INTERVENTI_PLURIENNALI = [
  { tipo: 'Recupero edilizio', annoSpesa: 2017, spesa: 35175, rate: 10 },
  { tipo: 'Recupero edilizio', annoSpesa: 2018, spesa: 2015,  rate: 10 },
  { tipo: 'Recupero edilizio', annoSpesa: 2019, spesa: 196,   rate: 10 },
  { tipo: 'Recupero edilizio', annoSpesa: 2020, spesa: 117,   rate: 10 },
  { tipo: 'Recupero edilizio', annoSpesa: 2022, spesa: 156,   rate: 10 },
  { tipo: 'Recupero edilizio', annoSpesa: 2024, spesa: 72,    rate: 10 },
  { tipo: 'Recupero edilizio', annoSpesa: 2025, spesa: 117,   rate: 10 },
  { tipo: 'Bonus arredo',      annoSpesa: 2018, rataAnnua: 500, rate: 10 },
];

const rataDi = (i) => i.rataAnnua != null ? i.rataAnnua : Math.round(i.spesa * 0.5 / i.rate * 100) / 100;

// Quanto vale la detrazione pluriennale in un dato anno d'imposta.
//
// Per gli anni GIA' DICHIARATI vince il 730: e' il dato vero. La ricostruzione dalle
// rate serve solo a proiettare il futuro, e non puo' sostituire il passato perche' un
// intervento puo' essere stato portato in detrazione con un anno di ritardo — e' il
// caso della spesa 2022 da 156 EUR, che nel 730/2023 non c'era ancora e compare solo
// nei modelli successivi. Confondere le due cose faceva sballare il 2022 di 7 EUR.
export const detrazionePluriennaleCalcolata = (anno) => Math.round(INTERVENTI_PLURIENNALI
  .filter(i => anno >= i.annoSpesa && anno < i.annoSpesa + i.rate)
  .reduce((s, i) => s + rataDi(i), 0) * 100) / 100;

export const detrazionePluriennale = (anno) => {
  const d = DICHIARAZIONI.find(x => x.anno === Number(anno));
  if (d) return Math.round((d.detr.recupero + d.detr.arredo) * 100) / 100;
  return detrazionePluriennaleCalcolata(anno);
};

// Il calendario di quello che resta: dal primo anno non ancora dichiarato in poi.
// Serve per sapere quando lo sconto finisce — e di quanto sale l'imposta quel giorno.
export const creditiInMaturazione = (daAnno) => {
  const ultimo = Math.max(...INTERVENTI_PLURIENNALI.map(i => i.annoSpesa + i.rate - 1));
  const righe = [];
  for (let a = daAnno; a <= ultimo; a++) {
    const voci = INTERVENTI_PLURIENNALI
      .filter(i => a >= i.annoSpesa && a < i.annoSpesa + i.rate)
      .map(i => ({ tipo: i.tipo, annoSpesa: i.annoSpesa, rata: a - i.annoSpesa + 1, su: i.rate, importo: rataDi(i) }));
    righe.push({ anno: a, voci, tot: Math.round(voci.reduce((s, v) => s + v.importo, 0) * 100) / 100 });
  }
  return { righe, residuoTotale: Math.round(righe.reduce((s, r) => s + r.tot, 0) * 100) / 100, ultimoAnno: ultimo };
};
