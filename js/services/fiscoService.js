// fiscoService.js — Deduzioni e detrazioni, anno per anno.
//
// Il fisco è una sezione a sé (Altro → Sezioni) ma NON ha dati suoi: legge lo stesso
// stato di Stipendi. Le buste stanno in state.stipendi, i 730 in dichiarazioni.js, e
// tutte e due le sezioni leggono da lì. Separare le pagine non separa i dati: se
// inserisci una busta, il fisco lo sa nello stesso istante.
//
// DEDUZIONI E DETRAZIONI NON SONO LA STESSA COSA, e la sezione le tiene distinte:
//  · una DEDUZIONE abbassa il reddito su cui si calcola l'imposta. Vale quanto la tua
//    aliquota marginale: 1.000 EUR dedotti a chi sta nel 35% valgono 350 EUR.
//  · una DETRAZIONE abbassa l'imposta già calcolata, euro su euro.

import { DICHIARAZIONI, dichiarazioneDi, creditiInMaturazione, dedottoDi } from '../core/dichiarazioni.js';
import { round2 } from '../core/utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// DEDUZIONI di un anno.
//
// Attenzione a un fatto che il prospetto 730 nasconde: il rigo "Oneri deducibili" è
// zero in nove anni su dieci, ma NON perché non ci siano deduzioni. I contributi a
// previdenza complementare li deduce il sostituto d'imposta direttamente in busta,
// quindi al 730 il reddito di lavoro dipendente arriva già al netto: nel modello
// restano nel rigo E27 come informazione, non fra gli oneri che abbattono il reddito
// in dichiarazione — l'hanno già abbattuto prima.
//
// Elencare solo il rigo 13 avrebbe mostrato quasi sempre una riga vuota. Qui invece
// stanno tutte e tre le cose che riducono davvero l'imponibile, ognuna con la sua
// provenienza. Il DETTAGLIO della previdenza (plafond, recupero da prima occupazione)
// non sta qui: vive nella sezione Stipendi, che è il posto dove ci si ragiona.
// ─────────────────────────────────────────────────────────────────────────────
export const deduzioniAnno = (anno) => {
  const d = dichiarazioneDi(anno);
  if (!d) return null;
  const voci = [
    { k: 'previdenza', nome: 'Previdenza complementare', val: dedottoDi(d),
      nota: 'già dedotta in busta dal datore, non passa dal quadro E' },
    { k: 'abitazione', nome: 'Abitazione principale', val: d.deduzioneAbit || 0,
      nota: 'la rendita catastale della casa in cui vivi, dedotta d\'ufficio' },
    { k: 'altri', nome: 'Altri oneri deducibili', val: d.oneriDeducibili || 0,
      nota: 'rigo 13 del prospetto' },
  ].filter(v => v.val > 0);
  const totale = round2(voci.reduce((s, v) => s + v.val, 0));
  return {
    anno: d.anno, voci, totale,
    redditoComplessivo: d.redditoComplessivo, imponibile: d.imponibile,
    // quanto vale davvero una deduzione: dipende dall'aliquota marginale dell'anno
    aliquotaMarginale: _marginaleDi(d.imponibile, d.anno),
    risparmioStimato: round2(totale * _marginaleDi(d.imponibile, d.anno) / 100),
  };
};

const _marginaleDi = (imponibile, anno) => {
  const sc = anno <= 2021 ? [[15000, 23], [28000, 27], [55000, 38], [75000, 41], [Infinity, 43]]
    : anno <= 2023 ? [[15000, 23], [28000, 25], [50000, 35], [Infinity, 43]]
      : [[28000, 23], [50000, 35], [Infinity, 43]];
  for (const [lim, al] of sc) if (imponibile <= lim) return al;
  return sc[sc.length - 1][1];
};

// ─────────────────────────────────────────────────────────────────────────────
// DETRAZIONI, anno per anno, con la composizione presa dal prospetto.
// ─────────────────────────────────────────────────────────────────────────────
const VOCI_DETR = [
  ['recupero', 'Recupero edilizio', '#22E39A'],
  ['arredo', 'Bonus arredo', '#5FC3FF'],
  ['lavDip', 'Lavoro dipendente', '#2E9BFF'],
  ['oneri', 'Oneri e erogazioni liberali', '#FFB020'],
  ['ulteriore', 'Ulteriore detrazione', '#7B6CFF'],
  ['altre', 'Altre detrazioni', '#9AA7BD'],
];

export const detrazioniAnnuali = () => DICHIARAZIONI.slice().sort((a, b) => b.anno - a.anno).map(d => {
  const voci = VOCI_DETR
    .map(([k, nome, colore]) => ({ k, nome, colore, val: round2(d.detr[k] || 0) }))
    .filter(v => v.val > 0);
  const sommaVoci = round2(voci.reduce((s, v) => s + v.val, 0));
  // il totale del prospetto comprende anche crediti d'imposta minori che non hanno una
  // riga propria (es. credito prima casa under 36): li dichiaro invece di nasconderli
  const resto = round2(d.detr.totale - sommaVoci);
  return {
    anno: d.anno, voci, totale: round2(d.detr.totale),
    resto: Math.abs(resto) > 0.5 ? resto : 0,
    impostaLorda: d.impostaLorda, impostaNetta: d.impostaNetta,
    // quanto pesano: senza detrazioni avresti pagato questo in più
    quotaSuLorda: d.impostaLorda ? Math.round(d.detr.totale / d.impostaLorda * 100) : 0,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTESO NELL'ANNO IN CORSO: non un numero calato dall'alto, ma la somma di rate
// già maturate, ognuna con il suo intervento e la sua posizione nel piano decennale.
// ─────────────────────────────────────────────────────────────────────────────
export const attesoAnno = (anno) => {
  const a = Number(anno) || new Date().getFullYear();
  const c = creditiInMaturazione(a);
  const riga = c.righe.find(r => r.anno === a);
  if (!riga) return null;
  const dopo = c.righe.find(r => r.anno === a + 1);
  return {
    anno: a, voci: riga.voci, totale: riga.tot,
    prossimoAnno: dopo ? dopo.tot : 0,
    scalino: dopo ? round2(riga.tot - dopo.tot) : riga.tot,
    ultimoAnno: c.ultimoAnno, residuoTotale: c.residuoTotale,
    // il 730 di quest'anno non c'è ancora: è una previsione basata sulle rate note
    dichiarato: !!dichiarazioneDi(a),
  };
};
