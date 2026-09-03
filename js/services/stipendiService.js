// stipendiService.js — Logica di dominio della sezione Stipendi.
// Separata dalla presentazione (come gli altri service): calcola KPI, aggregazioni
// per anno e per datore, serie storiche. Il componente stipendi.js la consuma.
//
// NOTA SUI DATI: 'netto' è ESATTO ovunque. 'lordo'/'trattenute' sono gonfiati nei
// mesi con Anticipo/Recupero (alcuni mesi Marposs e Schneider): le viste che
// contano davvero (netto per anno, netto medio, heatmap) usano il netto; la
// scomposizione del lordo è offerta come vista secondaria, con avviso.

import { state, refreshAll } from '../core/store.js';
import { round2 } from '../core/utils.js';
import { dbAdd, dbDelete } from '../core/db.js';
import { FISCO_UFFICIALE, certificatoDi } from '../core/fiscoUfficiale.js';
import {
  DICHIARAZIONI, dichiarazioneDi, dichiarazioneIncassataNel, irpefPerScaglioni,
  plafondPrimaOccupazione, seriePlafond, plafondAnno, anniPlafond, plafondOrdinarioDi,
  creditiInMaturazione,
} from '../core/dichiarazioni.js';

// ─────────────────────────────────────────────────────────────────────────────
// Datori: ordine cronologico e colori scelti dall'utente (identità aziendale).
//  Marposs = blu Marposs · SASIB = rosso Coesia · Bonfiglioli = grigio chiaro ·
//  Schneider = verde acceso (Schneider green).
// ─────────────────────────────────────────────────────────────────────────────
export const DATORI = [
  { nome: 'Marposs', colore: '#1E56D6' },
  { nome: 'SASIB', colore: '#E2001A' },
  { nome: 'Bonfiglioli', colore: '#AEB7C4' },
  { nome: 'Schneider', colore: '#3DCD58' },
];
const _COL = Object.fromEntries(DATORI.map(d => [d.nome, d.colore]));
export const coloreDatore = (nome) => _COL[nome] || '#8B96AB';
export const ordineDatore = (nome) => { const i = DATORI.findIndex(d => d.nome === nome); return i < 0 ? 99 : i; };

// Tutte le buste ordinate dalla più recente alla più vecchia (per id 'YYYY-MM').
export const stipendiOrdinati = () => state.stipendi.slice().sort((a, b) => (b.id || '').localeCompare(a.id || ''));

// L'ultima busta (per l'hero).
export const ultimoStipendio = () => stipendiOrdinati()[0] || null;

// Trova una busta per id.
export const stipendioById = (id) => state.stipendi.find(s => s.id === id) || null;

// Elenco degli anni disponibili (dal più recente).
export const anniDisponibili = () => {
  const anni = new Set(state.stipendi.map(s => String(s.anno)));
  return [...anni].sort((a, b) => b.localeCompare(a));
};

// Buste di un anno, in ordine cronologico crescente (mese).
export const stipendiAnno = (anno) =>
  state.stipendi.filter(s => String(s.anno) === String(anno)).sort((a, b) => a.mese - b.mese);

// NIENTE PIÙ ESCLUSIONI. Il lordo delle buste è già DEPURATO delle partite di giro
// Zucchetti (Recupero Anticipo, Assenze Retribuite, Assenza assunti/dimessi), quindi
// ogni mese è confrontabile: anche le buste di cessazione entrano nei totali, perché
// quei soldi sono stati incassati e quelle trattenute pagate davvero.

// Aggregato per un anno: totali + netto per datore.
export const aggregatoAnno = (anno) => {
  const buste = stipendiAnno(anno);
  if (!buste.length) return null;
  const somma = (arr, campo) => round2(arr.reduce((s, b) => s + (b[campo] || 0), 0));
  const netto = round2(somma(buste, 'netto') + somma(buste, 'addebiti_netti'));  // netto guadagnato
  const nettoInBanca = somma(buste, 'netto');
  const lordo = somma(buste, 'lordo');
  const trattenute = somma(buste, 'trattenute');
  // netto per datore (per barre impilate e transizioni di lavoro)
  const perDatore = {};
  for (const b of buste) perDatore[b.datore] = round2((perDatore[b.datore] || 0) + nettoGuadagnato(b));
  const datorePrevalente = Object.entries(perDatore).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    anno: String(anno), mesi: buste.length,
    netto, nettoInBanca, lordo, trattenute,
    tfr: somma(buste, 'tfr_a_fondo_pensione'),
    cometaDip: somma(buste, 'cometa_dipendente'),
    cometaAz: somma(buste, 'cometa_azienda'),
    premi: somma(buste, 'premi_detassati'),
    rimborso: somma(buste, 'rimborso_fiscale_escluso'),
    nettoMedio: round2(netto / mensilitaDi(buste)),   // netto guadagnato per mensilità
    // PRELIEVO VERO sul lordo: contributi + imposte. Cometa resta FUORI: e' risparmio
    // tuo che va in pensione, non un prelievo. Metterlo dentro gonfiava il numero e lo
    // rendeva incomparabile con le aliquote fiscali.
    aliquotaEff: lordo ? round2((somma(buste, 'contributi_inps') + somma(buste, 'irpef_netta')
      + somma(buste, 'addizionale_regionale') + somma(buste, 'addizionale_comunale')
      + somma(buste, 'imposta_sostitutiva') + somma(buste, 'irpef_tass_separata')) / lordo * 100) : 0,
    // ALIQUOTA IRPEF EFFETTIVA: IRPEF sull'IMPONIBILE fiscale (non sul lordo). E' il
    // numero confrontabile con gli scaglioni: se somiglia troppo all'aliquota di uno
    // scaglione secco, il datore probabilmente non sta applicando la progressivita'.
    imponibileIrpef: somma(buste, 'imponibile_irpef'),
    irpefEffettiva: somma(buste, 'imponibile_irpef')
      ? round2(somma(buste, 'irpef_netta') / somma(buste, 'imponibile_irpef') * 100) : null,
    giro: somma(buste, 'partite_di_giro'),
    perDatore, datorePrevalente,
  };
};

// Variazione % anno su anno per un KPI ('netto'|'lordo'|'trattenute'|'nettoMedio'|'aliquotaEff'...).
export const variazioneAnno = (anno, campo) => {
  const cur = aggregatoAnno(anno), prev = aggregatoAnno(String(Number(anno) - 1));
  if (!cur || !prev || !prev[campo]) return null;
  return round2(((cur[campo] - prev[campo]) / prev[campo]) * 100);
};

// ─────────────────────────────────────────────────────────────────────────────
// Serie per i grafici della dashboard
// ─────────────────────────────────────────────────────────────────────────────

// Netto ANNO PER ANNO, ripartito per datore (barre impilate: mostra le transizioni).
// Ritorna [{ anno, valori:{Marposs,SASIB,...}, tot }] in ordine cronologico.
export const nettoPerAnnoPerDatore = () => {
  return anniDisponibili().slice().reverse().map(anno => {
    const agg = aggregatoAnno(anno);
    const valori = {};
    for (const d of DATORI) valori[d.nome] = agg.perDatore[d.nome] || 0;
    return { anno, valori, tot: agg.netto };
  });
};

// Scomposizione del LORDO anno per anno: netto in tasca + fisco/contributi + Cometa.
// I tre segmenti sommano al lordo (netto + trattenute; e trattenute = fisco/contributi
// + Cometa dipendente). Vista secondaria: nei mesi 'anticipo' il lordo è gonfiato.
// Scomposizione del lordo secondo il modello concordato:
//   lordo = netto guadagnato + fisco/contributi + Cometa
// 'netto guadagnato' = quello che il lavoro ti ha reso, PRIMA degli addebiti netti
// (auto, mensa, ticket): quelli sono spese tue, non minor compenso, e li tracci
// tra i movimenti. Lo split imposte / contributi INPS sta nel dettaglio, non nella barra.
export const composizioneLordoAnnuale = () => {
  return anniDisponibili().slice().reverse().map(anno => {
    const buste = stipendiAnno(anno);
    return { anno, ...composizioneDi(buste) };
  });
};


// Netto mese per mese di un anno, colorato per datore (barre del riepilogo anno).
export const nettoMensile = (anno) => {
  return stipendiAnno(anno).map(b => ({
    mese: b.mese, label: MESI3[b.mese - 1], netto: nettoGuadagnato(b), datore: b.datore,
    valori: { [b.datore]: nettoGuadagnato(b) }, tot: nettoGuadagnato(b),
  }));
};

// Scomposizione del lordo MESE PER MESE di un anno (stessa struttura della barra annuale).
export const composizioneLordoMensile = (anno) => {
  return stipendiAnno(anno).map(b => ({
    mese: b.mese, label: MESI3[b.mese - 1], ...composizioneDi([b]),
  }));
};

// Nucleo condiviso: da un gruppo di buste ai tre segmenti della barra.
export const composizioneDi = (buste) => {
  const s = (c) => round2(buste.reduce((x, b) => x + (b[c] || 0), 0));
  const lordo = s('lordo');
  const guadagnato = round2(s('netto') + s('addebiti_netti'));   // quanto ha reso il lavoro
  const inps = s('contributi_inps');
  const irpef = s('irpef_netta');
  const addiz = round2(s('addizionale_regionale') + s('addizionale_comunale'));
  const altre = round2(s('imposta_sostitutiva') + s('irpef_tass_separata'));
  const cometa = s('cometa_dipendente');
  // quello che resta: voci non identificate una per una. Dichiarato, mai spalmato.
  const resto = round2(lordo - (guadagnato + inps + irpef + addiz + altre + cometa));
  const restoVisibile = Math.max(resto, 0);
  return {
    valori: { guadagnato, inps, irpef, addiz, altre, cometa, resto: restoVisibile },
    tot: round2(guadagnato + inps + irpef + addiz + altre + cometa + restoVisibile),
    netto: s('netto'), addebiti: s('addebiti_netti'), guadagnato,
    inps, irpef, addiz, altre, cometa, resto,
    quotaNetta: lordo ? Math.round(guadagnato / lordo * 100) : 0,
  };
};

export const SEG_LORDO = [
  { k: 'guadagnato', nome: 'Netto guadagnato', colore: '#22E39A' },
  { k: 'inps', nome: 'Contributi INPS', colore: '#2E9BFF' },
  { k: 'irpef', nome: 'IRPEF', colore: '#FF3B5C' },
  { k: 'addiz', nome: 'Addizionali', colore: '#FFB020' },
  { k: 'altre', nome: 'Altre imposte', colore: '#B3123A' },
  { k: 'cometa', nome: 'Cometa', colore: '#7B6CFF' },
  { k: 'resto', nome: 'Non dettagliato', colore: '#5A6274' },
];

// Serie del NETTO nel tempo (per la spike-line), cronologica.
export const serieNetto = () => stipendiOrdinati().slice().reverse().map(b => ({
  label: `${MESI3[b.mese - 1]} '${String(b.anno).slice(2)}`, valore: round2(b.netto), datore: b.datore,
}));

// MENSILITÀ: la tredicesima è dentro la busta di dicembre, quindi un anno pieno vale
// 13 mensilità. Contarle come 12 buste gonfierebbe la media mensile di circa l'8%.
// La 13ma non e' sempre a dicembre: SASIB la pagava a NOVEMBRE. Per questo conto le
// mensilita' sul CONTRASSEGNO della busta, non sul mese.
// Un mese parziale (assunzione o cessazione) NON vale una mensilita' intera: pesa per i
// giorni di rapporto effettivi, letti dal campo "Giorni Detrazioni" della busta. Senza
// questo, il mese in cui cambi lavoro abbassa la media come se avessi lavorato tutto.
// NETTO GUADAGNATO: quello che il lavoro ha reso, prima degli addebiti in busta
// (auto uso privato, mensa, ticket). Quelli sono spese, non minor stipendio.
export const nettoGuadagnato = (b) => round2((b.netto || 0) + (b.addebiti_netti || 0));

export const mensilitaDi = (buste) => round2(
  buste.reduce((t, b) => t + (b.frazione_mensilita || 1) + (b.tredicesima_inclusa ? 1 : 0), 0));

// Confronto DATORI: netto totale, mesi, netto medio, periodo. Ordinato per periodo.
export const confrontoDatori = () => {
  const per = {};
  for (const b of state.stipendi) {
    const d = b.datore || '?';
    per[d] = per[d] || { datore: d, buste: [], dal: b.id, al: b.id };
    per[d].buste.push(b);
    if (b.id < per[d].dal) per[d].dal = b.id;
    if (b.id > per[d].al) per[d].al = b.id;
  }
  return Object.values(per).map(f => {
    const s = (c) => round2(f.buste.reduce((x, b) => x + (b[c] || 0), 0));
    const netto = s('netto'), addebiti = s('addebiti_netti');
    const guadagnato = round2(netto + addebiti);
    const mensilita = mensilitaDi(f.buste);
    return {
      datore: f.datore, dal: f.dal, al: f.al,
      mesi: f.buste.length, mensilita,
      netto, addebiti, guadagnato,
      lordoTot: s('lordo'),
      // quanto rende il lavoro per mensilità (13 in un anno pieno)
      perMensilita: mensilita ? round2(guadagnato / mensilita) : 0,
      colore: coloreDatore(f.datore),
    };
  }).sort((a, b) => a.dal.localeCompare(b.dal));
};

// Heatmap netto mese × anno. Celle colorate col colore del datore, intensità = netto.
// Ritorna { anni:[..], celle:{ 'anno-mese': {netto,datore} }, max }.
export const heatmapNetto = () => {
  const celle = {};
  let max = 1;
  for (const b of state.stipendi) {
    const k = `${b.anno}-${b.mese}`;
    // se in un mese ci fossero due datori (transizione) tengo il netto sommato e il datore prevalente
    if (celle[k]) {
      celle[k].netto = round2(celle[k].netto + (b.netto || 0));
      if ((b.netto || 0) > celle[k]._top) { celle[k]._top = b.netto || 0; celle[k].datore = b.datore; }
    } else {
      celle[k] = { netto: nettoGuadagnato(b), datore: b.datore, _top: nettoGuadagnato(b) };
    }
    if (celle[k].netto > max) max = celle[k].netto;
  }
  const anni = anniDisponibili().slice().reverse();
  return { anni, celle, max };
};

// Statistiche globali (per l'eventuale riga riepilogo).
export const statisticheGlobali = () => {
  const st = state.stipendi;
  return {
    nBuste: st.length,
    nettoTotale: round2(st.reduce((s, b) => s + (b.netto || 0), 0)),
    lordoTotale: round2(st.reduce((s, b) => s + (b.lordo || 0), 0)),
    tfrTotale: round2(st.reduce((s, b) => s + (b.tfr_a_fondo_pensione || 0), 0)),
    datori: [...new Set(st.map(b => b.datore))],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// FONDO PENSIONE — versato: TFR devoluto + Cometa dipendente (mio) + Cometa azienda.
// Sono versamenti reali al fondo: inclusi TUTTI i mesi (anche speciali).
// ─────────────────────────────────────────────────────────────────────────────
export const versamentoFondoAnnuale = () => {
  return anniDisponibili().slice().reverse().map(anno => {
    const b = stipendiAnno(anno);
    const s = (c) => round2(b.reduce((x, r) => x + (r[c] || 0), 0));
    const tfr = s('tfr_a_fondo_pensione'), dip = s('cometa_dipendente'), az = s('cometa_azienda');
    return { anno, valori: { tfr, dip, az }, tot: round2(tfr + dip + az) };
  });
};

export const versamentoFondoTotale = () => {
  const st = state.stipendi;
  const s = (c) => round2(st.reduce((x, r) => x + (r[c] || 0), 0));
  const tfr = s('tfr_a_fondo_pensione'), dip = s('cometa_dipendente'), az = s('cometa_azienda');
  return { tfr, dip, az, tot: round2(tfr + dip + az) };
};

// Dettaglio fondo pensione per ANNO (con datore prevalente) — per la pagina dedicata.
export const dettaglioFondoAnnuale = () => {
  // dal piu' recente al piu' vecchio: e' l'anno che ti interessa per primo
  return anniDisponibili().slice().sort((a, b) => Number(b) - Number(a)).map(anno => {
    const b = stipendiAnno(anno);
    const s = (c) => round2(b.reduce((x, r) => x + (r[c] || 0), 0));
    const tfr = s('tfr_a_fondo_pensione'), dip = s('cometa_dipendente'), az = s('cometa_azienda');
    const perDatore = {};
    for (const r of b) {
      const q = (r.tfr_a_fondo_pensione || 0) + (r.cometa_dipendente || 0) + (r.cometa_azienda || 0);
      if (q) perDatore[r.datore] = round2((perDatore[r.datore] || 0) + q);
    }
    return { anno, tfr, dip, az, tot: round2(tfr + dip + az), mesi: b.length, perDatore };
  });
};

// Dettaglio fondo pensione per DATORE (chi ha versato cosa, in quale periodo).
export const dettaglioFondoPerDatore = () => {
  const per = {};
  for (const b of state.stipendi) {
    const d = b.datore || '?';
    per[d] = per[d] || { datore: d, tfr: 0, dip: 0, az: 0, dal: b.id, al: b.id };
    per[d].tfr += (b.tfr_a_fondo_pensione || 0);
    per[d].dip += (b.cometa_dipendente || 0);
    per[d].az += (b.cometa_azienda || 0);
    if (b.id < per[d].dal) per[d].dal = b.id;
    if (b.id > per[d].al) per[d].al = b.id;
  }
  return Object.values(per).map(f => ({
    ...f, tfr: round2(f.tfr), dip: round2(f.dip), az: round2(f.az),
    tot: round2(f.tfr + f.dip + f.az), colore: coloreDatore(f.datore),
  })).sort((a, b) => a.dal.localeCompare(b.dal));
};

// Segmenti (con colori) per le barre del fondo pensione.
export const SEG_FONDO = [
  { k: 'tfr', nome: 'TFR devoluto', colore: '#5FC3FF' },
  { k: 'dip', nome: 'Cometa — mio', colore: '#22E39A' },
  { k: 'az', nome: 'Cometa — datore', colore: '#FFB020' },
];

export const MESI3 = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export const mese3 = (m) => MESI3[m - 1] || '';

// ─────────────────────────────────────────────────────────────────────────────
// FISCO: quanto hai pagato di IRPEF/addizionali e quanto ti e' tornato indietro.
// Il rimborso 730 e' un CREDITO in busta, non una trattenuta: non va mai sottratto
// dalle trattenute del mese, ma confrontato con l'imposta pagata.
// ─────────────────────────────────────────────────────────────────────────────
const _s = (buste, c) => round2(buste.reduce((x, b) => x + (b[c] || 0), 0));

export const fiscoAnnuale = () => anniDisponibili().slice().reverse().map(anno => {
  const b = stipendiAnno(anno);
  const irpef = _s(b, 'irpef_netta');
  const addReg = _s(b, 'addizionale_regionale');
  const addCom = _s(b, 'addizionale_comunale');
  const sost = _s(b, 'imposta_sostitutiva');
  const sep = _s(b, 'irpef_tass_separata');
  const pagato = round2(irpef + addReg + addCom + sost + sep);
  const rimborso = _s(b, 'rimborso_730');
  return {
    anno, irpef, addReg, addCom, sost, sep, pagato, rimborso,
    netto: round2(pagato - rimborso),
    // anno d'imposta a cui si riferisce il rimborso, quando la busta lo dichiara
    annoImposta: (b.find(x => x.rimborso_730_anno) || {}).rimborso_730_anno || null,
    valori: { irpef, addReg, addCom },
    tot: pagato,
  };
});

export const fiscoTotale = () => {
  const st = state.stipendi;
  const irpef = _s(st, 'irpef_netta'), addReg = _s(st, 'addizionale_regionale');
  const addCom = _s(st, 'addizionale_comunale'), sost = _s(st, 'imposta_sostitutiva');
  const sep = _s(st, 'irpef_tass_separata');
  const pagato = round2(irpef + addReg + addCom + sost + sep);
  const rimborso = _s(st, 'rimborso_730');
  return { irpef, addReg, addCom, sost, sep, pagato, rimborso,
    netto: round2(pagato - rimborso),
    quotaRestituita: pagato ? round2(rimborso / pagato * 100) : 0 };
};

// Elenco dei rimborsi ricevuti (uno per busta che li contiene).
export const elencoRimborsi = () => state.stipendi
  .filter(b => b.rimborso_730)
  .map(b => ({ id: b.id, anno: b.anno, mese: b.mese, datore: b.datore,
    importo: b.rimborso_730, annoImposta: b.rimborso_730_anno || null }))
  .sort((a, b) => (b.anno - a.anno) || (b.mese - a.mese));

// VERIFICA FISCALE — riscritta sul 730 (v3.30).
//
// Prima confrontavo le ritenute del datore con "IRPEF per scaglioni meno le detrazioni
// certificate in busta". Due errori in uno: gli scaglioni erano quelli sbagliati per
// gli anni fino al 2021, e le detrazioni di busta sono una frazione di quelle vere
// (mancavano ~1.880 EUR l'anno di recupero edilizio e 500 di bonus arredo). Risultato:
// scarti a tre cifre segnalati in rosso che non esistevano.
//
// Adesso il metro e' il 730, che l'imposta la calcola per davvero. Il confronto utile
// non e' piu' "hai pagato il giusto?" ma "quanto ti hanno trattenuto in piu' rispetto
// a quello che dovevi, e quando te l'hanno ridato?".
export const verificaFiscale = () => {
  const anni = [...new Set([...DICHIARAZIONI.map(d => d.anno), ...FISCO_UFFICIALE.map(x => x.anno)])]
    .sort((a, b) => b - a);
  return anni.map(anno => {
    const d = dichiarazioneDi(anno);
    const c = certificatoDi(anno) || {};
    const b = stipendiAnno(anno);
    const sommaIrpef = round2(b.reduce((s, x) => s + (x.irpef_netta || 0) + (x.irpef_tass_separata || 0), 0));
    if (!d) {
      // Nessun 730 per quest'anno (tipicamente l'anno in corso): resta il vecchio
      // riscontro sui dati di busta, dichiarato per quello che e'.
      return { anno, fonte: 'busta', datori: c.datori || [], sommaIrpef,
        imponibile: c.imponibile ?? null, irpefTrattenuta: c.irpefTrattenuta ?? null,
        impostaNetta: null, eccedenza: null, rimborso: null, daVerificare: c.daVerificare || [] };
    }
    return {
      anno, fonte: '730', presentata: d.presentata,
      datori: c.datori || [],
      redditoComplessivo: d.redditoComplessivo,
      imponibile: d.imponibile,
      impostaLorda: d.impostaLorda,
      detrazioni: d.detr.totale,
      impostaNetta: d.impostaNetta,
      irpefTrattenuta: d.ritenute,
      // quanto il datore ha trattenuto in piu' (positivo) o in meno (negativo)
      eccedenza: round2(d.ritenute - d.impostaNetta),
      rimborso: d.rimborsoBusta,
      aliquotaReale: round2(d.impostaNetta / d.redditoComplessivo * 100),
      // riscontro fra l'archivio buste e le ritenute certificate
      sommaIrpef, scartoArchivio: round2(sommaIrpef - d.ritenute),
      // riscontro dell'imposta lorda sugli scaglioni dell'anno giusto
      scartoScaglioni: round2(irpefPerScaglioni(d.imponibile, anno) - d.impostaLorda),
      piuDatori: !!c.piuDatori,
      daVerificare: c.daVerificare || [],
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// WATERFALL — dal reddito complessivo al saldo, passo per passo. E' il percorso che
// il 730 fa davvero, e che dalla busta non si vede: ogni gradino toglie o aggiunge.
// ─────────────────────────────────────────────────────────────────────────────
export const waterfallAnno = (anno) => {
  const d = dichiarazioneDi(anno);
  if (!d) return null;
  const p = [];
  p.push({ k: 'complessivo', nome: 'Reddito complessivo', val: d.redditoComplessivo, tipo: 'base' });
  if (d.deduzioneAbit) p.push({ k: 'abit', nome: 'Deduzione abitazione principale', val: -d.deduzioneAbit, tipo: 'giu' });
  if (d.oneriDeducibili) p.push({ k: 'oneri', nome: 'Oneri deducibili', val: -d.oneriDeducibili, tipo: 'giu' });
  p.push({ k: 'imponibile', nome: 'Reddito imponibile', val: d.imponibile, tipo: 'tappa' });
  p.push({ k: 'lorda', nome: 'IRPEF lorda', val: d.impostaLorda, tipo: 'base' });
  p.push({ k: 'detr', nome: 'Detrazioni e crediti', val: -d.detr.totale, tipo: 'giu' });
  p.push({ k: 'netta', nome: 'IRPEF netta', val: d.impostaNetta, tipo: 'tappa' });
  p.push({ k: 'rit', nome: 'Ritenute subite in busta', val: -d.ritenute, tipo: 'giu' });
  p.push({ k: 'saldo', nome: d.differenza < 0 ? 'A credito' : 'A debito', val: Math.abs(d.differenza), tipo: 'saldo' });
  return { anno: d.anno, presentata: d.presentata, passi: p, credito: d.differenza < 0,
    rimborso: d.rimborsoBusta, aliquotaReale: round2(d.impostaNetta / d.redditoComplessivo * 100) };
};

// ─────────────────────────────────────────────────────────────────────────────
// CASSA REALE DI UN ANNO SOLARE. Il netto delle buste non e' quello che entra in banca:
// nell'anno arriva anche il rimborso del 730 dell'anno prima (che l'app tiene giustamente
// fuori dal netto, perche' non e' retribuzione). Qui i due si rimettono insieme.
// ─────────────────────────────────────────────────────────────────────────────
export const cassaRealeAnnuale = () => anniDisponibili().slice().reverse().map(anno => {
  const buste = stipendiAnno(anno);
  const netto = round2(buste.reduce((s, b) => s + nettoGuadagnato(b), 0));
  const rimborsoIncassato = round2(buste.reduce((s, b) => s + (b.rimborso_730 || 0), 0));
  const attesa = dichiarazioneIncassataNel(anno);
  return {
    anno, netto, rimborsoIncassato,
    // un anno con meno di dodici buste e' in corso (o troncato da un cambio lavoro):
    // il totale non va confrontato con gli anni pieni senza dirlo.
    mesi: buste.length, parziale: buste.length < 12,
    // quello che il 730 di quell'anno prevedeva di far arrivare in busta
    rimborsoPrevisto: attesa ? attesa.rimborsoBusta : null,
    annoImpostaRimborso: attesa ? attesa.anno : null,
    tot: round2(netto + rimborsoIncassato),
    valori: { netto, rimborso: rimborsoIncassato },
  };
});

// Totale storico: quanto e' stato trattenuto in eccesso e poi restituito.
export const saldoDichiarazioni = () => {
  const ecc = DICHIARAZIONI.reduce((s, d) => s + (d.ritenute - d.impostaNetta), 0);
  const rim = DICHIARAZIONI.reduce((s, d) => s + (d.rimborsoBusta || 0), 0);
  const ultimo = DICHIARAZIONI[DICHIARAZIONI.length - 1];
  return {
    anni: DICHIARAZIONI.length,
    eccedenzaTotale: round2(ecc), rimborsatoTotale: round2(rim),
    mediaAnnua: round2(ecc / DICHIARAZIONI.length),
    ultimo: { anno: ultimo.anno, presentata: ultimo.presentata,
      eccedenza: round2(ultimo.ritenute - ultimo.impostaNetta), rimborso: ultimo.rimborsoBusta },
  };
};

// RIMBORSO ANCORA DA INCASSARE. Il 730 dice quanto tornera' in busta; l'archivio buste
// dice se e' gia' arrivato. Quando i due non coincidono c'e' del denaro in viaggio, e
// vale la pena dirlo in home invece di farselo trovare per caso nel cedolino.
export const rimborsoAtteso = () => {
  for (const d of [...DICHIARAZIONI].reverse()) {
    if (!d.rimborsoBusta) continue;
    const incassato = stipendiAnno(d.presentata).reduce((s, b) => s + (b.rimborso_730 || 0), 0);
    if (round2(incassato) < d.rimborsoBusta - 1) {
      return { anno: d.anno, presentata: d.presentata, importo: d.rimborsoBusta,
        giaIncassato: round2(incassato), residuo: round2(d.rimborsoBusta - incassato) };
    }
    return null;   // l'ultimo con credito e' gia' stato pagato: non c'e' nulla in viaggio
  }
  return null;
};

// Plafond del fondo pensione per un anno: quanto del tetto deducibile e' stato usato e
// quanto vale l'extra da prima occupazione mai richiesto. Il tetto ordinario cambia per
// anno (5.164,57 fino al 2025, 5.300 dal 2026), quindi va sempre chiesto per anno.
export const plafondFondo = (anno) => {
  const a = Number(anno) || new Date().getFullYear();
  return {
    ...plafondPrimaOccupazione(a),
    riga: plafondAnno(a),
    serie: seriePlafond(),
    anni: anniPlafond(),
    tettoOrdinario: plafondOrdinarioDi(a),
  };
};

// Detrazioni pluriennali gia' acquisite, dall'anno indicato in poi.
export const creditiFuturi = (daAnno) => creditiInMaturazione(daAnno);

export const SEG_FISCO = [
  { k: 'irpef', nome: 'IRPEF', colore: '#FF3B5C' },
  { k: 'addReg', nome: 'Addiz. regionale', colore: '#FFB020' },
  { k: 'addCom', nome: 'Addiz. comunale', colore: '#7B6CFF' },
];

// Scomposizione delle TRATTENUTE di una busta, voce per voce, con il residuo
// dichiarato: la somma torna sempre al totale di busta.
export const dettaglioTrattenute = (b) => {
  const voci = [
    ['Contributi INPS', b.contributi_inps, '#2E9BFF'],
    ['IRPEF', b.irpef_netta, '#FF3B5C'],
    ['Addizionale regionale', b.addizionale_regionale, '#FFB020'],
    ['Addizionale comunale', b.addizionale_comunale, '#7B6CFF'],
    ['Imposta sostitutiva (premi)', b.imposta_sostitutiva, '#FF8A3D'],
    ['IRPEF tassazione separata', b.irpef_tass_separata, '#E2001A'],
    ['Cometa — quota tua', b.cometa_dipendente, '#22E39A'],
    ['Altre (mensa, ticket, auto…)', b.altre_trattenute, '#9AA7BD'],
  ].filter(v => v[1]).map(([nome, val, colore]) => ({ nome, val: round2(val), colore }));
  const residuo = round2(b.trattenute - voci.reduce((s, v) => s + v.val, 0));
  return { voci, residuo, totale: round2(b.trattenute) };
};

// ─────────────────────────────────────────────────────────────────────────────
// CRUD buste paga (inserimento manuale o import PDF).
// L'id è composito 'AAAA-MM-datore': nei mesi di passaggio convivono due buste.
// ─────────────────────────────────────────────────────────────────────────────
export const salvaStipendio = async (b) => {
  const anno = +b.anno, mese = +b.mese;
  const netto = round2(b.netto || 0);
  const trattenute = round2(b.trattenute || 0);
  // il lordo è SEMPRE coerente con l'identità di busta: lordo = netto + trattenute
  const lordo = round2(netto + trattenute);
  const rec = {
    id: `${anno}-${String(mese).padStart(2, '0')}-${b.datore}`,
    periodoId: `${anno}-${String(mese).padStart(2, '0')}`,
    anno, mese, datore: b.datore,
    periodo: `${MESI_ESTESI[mese - 1]} ${anno}`,
    netto, netto_cassa: round2(b.netto_cassa || netto), lordo, trattenute,
    partite_di_giro: round2(b.partite_di_giro || 0),
    // addebiti in busta (auto, mensa, ticket): riducono la cassa ma non sono prelievo
    addebiti_netti: round2(b.addebiti_netti || 0),
    tfr_a_fondo_pensione: round2(b.tfr_a_fondo_pensione || 0),
    cometa_dipendente: round2(b.cometa_dipendente || 0),
    cometa_azienda: round2(b.cometa_azienda || 0),
    premi_detassati: round2(b.premi_detassati || 0),
    rimborso_fiscale_escluso: round2(b.rimborso_fiscale_escluso || 0),
    // rimborso 730: credito accreditato in busta, tenuto fuori da netto e lordo
    rimborso_730: round2(b.rimborso_730 || 0),
    rimborso_730_anno: b.rimborso_730_anno || null,
    tredicesima_inclusa: !!b.tredicesima_inclusa,
    cessazione: !!b.cessazione,
    manuale: true,   // inserita/modificata da te: il seed non la tocca
    voci_notevoli: b.voci_notevoli || [],
  };
  for (const k of ['contributi_inps', 'irpef_netta', 'addizionale_regionale', 'addizionale_comunale']) {
    if (b[k] != null && b[k] !== '') rec[k] = round2(b[k]);
  }
  await dbAdd('stipendi', rec);
  await refreshAll();
  return rec;
};

export const eliminaStipendio = async (id) => { await dbDelete('stipendi', id); await refreshAll(); };

export const MESI_ESTESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
