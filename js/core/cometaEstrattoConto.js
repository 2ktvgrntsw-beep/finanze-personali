// cometaEstrattoConto.js — Posizione reale su COMETA, dall'estratto conto del fondo.
// Le buste dicono quanto e' stato VERSATO; solo il fondo dice quanto VALE oggi.
// Riconciliazione col versato calcolato dalle buste: scarto complessivo ~10 EUR su
// oltre 52.000 (la quota a tuo carico coincide a 3 centesimi). Le differenze su TFR e
// quota azienda nascono dallo sfasamento fra maturazione mensile in busta e versamento
// trimestrale al fondo.
export const COMETA = {
  aggiornatoAl: '2025-12-31',
  versato: { dip: 15061.71, az: 5959.10, tfr: 31591.49, tot: 52612.30 },
  quote: 2383.218,
  valoreQuota: 25.686,
  spese: 130.53,
  perDatore: [
    { datore: 'Marposs', dip: 1277.83, az: 1500.54, tfr: 7871.65, tot: 10650.02 },
    { datore: 'SASIB', dip: 3831.59, az: 1402.92, tfr: 6561.23, tot: 11795.74 },
    { datore: 'Bonfiglioli', dip: 4954.80, az: 1510.33, tfr: 8560.46, tot: 15025.59 },
    { datore: 'Schneider Electric', dip: 4997.49, az: 1545.31, tfr: 8598.15, tot: 15140.95 },
  ],
  comparti: [{ nome: 'Monetario Plus', fino: '2022-06' }, { nome: 'Crescita', dal: '2022-06' }],
};

export const montante = () => Math.round(COMETA.quote * COMETA.valoreQuota * 100) / 100;
export const rendimento = () => {
  const m = montante();
  return { valore: Math.round((m - COMETA.versato.tot) * 100) / 100,
           perc: Math.round((m / COMETA.versato.tot - 1) * 1000) / 10 };
};
