// pdfBustaPaga.js — Import busta paga da PDF (formato Zucchetti: Schneider, Bonfiglioli,
// e in generale i cedolini prodotti da Zucchetti/Paghe Web).
//
// Riusa i mattoni già scritti per le bollette (inflate nativo, CMap ToUnicode, estrazione
// testo): zero dipendenze esterne, funziona offline. I PDF Zucchetti usano stream
// FlateDecode "puri" (senza ASCII85), quindi la decodifica va fatta sui BYTE dello stream.
//
// ATTENZIONE al layer di testo Zucchetti: le etichette laterali sono ruotate e si
// intrecciano alle righe, quindi il testo lineare è "sporco". Per questo il parser
// riconosce le voci per ETICHETTA (non per codice: es. Z00010 è "IVS agg." nei mesi
// normali ma "Anticipo Retribuzione" nei mesi di anticipo) e ogni valore passa da un
// controllo di plausibilità. Un campo che non supera il controllo resta VUOTO: meglio
// un buco che un numero inventato — poi lo correggi a mano nel form.

import { inflate, costruisciMappa, LATIN1 } from './pdfBolletta.js';

// I cedolini Zucchetti scrivono il testo con STRINGHE LETTERALI "( ... ) Tj" contenenti
// codici CID a 2 byte, e posizionano le righe con "Tm" (matrice) invece di Td/T*.
// È un dialetto diverso da quello delle bollette Dolomiti (stringhe esadecimali + Td),
// quindi serve un estrattore suo: la mappa CID→carattere resta invece quella condivisa.
const decodificaLetterale = (raw, mappa) => {
  const bytes = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') { bytes.push(raw.charCodeAt(i)); continue; }
    const next = raw[++i];
    if (next >= '0' && next <= '7') {           // sequenza ottale \ddd
      let ott = next;
      while (ott.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') ott += raw[++i];
      bytes.push(parseInt(ott, 8));
    } else {
      const spec = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      bytes.push(spec[next] != null ? spec[next] : raw.charCodeAt(i));
    }
  }
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const cid = (bytes[i] << 8) | bytes[i + 1];
    out += mappa[cid] || '';
  }
  return out;
};

const estraiTestoZucchetti = (d, mappePerFont, mappaFallback, runs) => {
  const out = [];
  let xCorr = null;
  let yPrec = null;
  let mappa = mappaFallback;
  const re = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|\(((?:\\.|[^\\()])*)\)\s*Tj|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|(-?[\d.]+)\s+(-?[\d.]+)\s+Td|T\*/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1] !== undefined) {                       // cambio font: cambia la codifica
      mappa = mappePerFont[m[1]] || mappaFallback;
      continue;
    }
    if (m[2] !== undefined) {
      const txt = decodificaLetterale(m[2], mappa);
      out.push(txt);
      if (runs && xCorr !== null && yPrec !== null) runs.push({ x: xCorr, y: yPrec, txt });
      continue;
    }
    let y = null;
    if (m[8] !== undefined) { y = parseFloat(m[8]); xCorr = parseFloat(m[7]); }   // Tm: x=5°, y=6°
    else if (m[10] !== undefined) { y = parseFloat(m[10]); xCorr = parseFloat(m[9]); }
    if (y === null) { out.push('\n'); yPrec = null; continue; }
    out.push(yPrec !== null && Math.abs(y - yPrec) > 0.5 ? '\n' : ' ');
    yPrec = y;
  }
  return out.join('');
};

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const numIt = (s) => {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(/[()]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? Math.abs(Math.round(v * 100) / 100) : null;
};

// ultimo importo (formato italiano con decimali) presente in una riga
const ultimoImporto = (riga) => {
  const m = String(riga).match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
  return m ? numIt(m[m.length - 1]) : null;
};

// somma gli importi di TUTTE le righe che contengono l'etichetta
const sommaPerEtichetta = (righe, regex) => {
  let tot = 0, trovate = 0;
  for (const r of righe) {
    if (!regex.test(r)) continue;
    const v = ultimoImporto(r);
    if (v != null) { tot += v; trovate++; }
  }
  return trovate ? Math.round(tot * 100) / 100 : null;
};

const primoPerEtichetta = (righe, regex) => {
  for (const r of righe) if (regex.test(r)) { const v = ultimoImporto(r); if (v != null) return v; }
  return null;
};

// I totali (COMPETENZE / TRATTENUTE / NETTO DEL MESE) sono stampati in fondo a destra,
// ma le loro ETICHETTE stanno nel modulo grafico di sfondo, non nel testo: non posso
// agganciarli per nome. Li individuo per posizione e li accetto SOLO se rispettano
// l'identità della busta (competenze - trattenute = netto). Se non quadra, restano vuoti.
const totaliDaPosizione = (runs) => {
  const cand = runs
    .filter(r => r.y < 220 && r.x > 430 && /^[\d.]+,\d{2}$/.test(r.txt.trim()))
    .map(r => ({ ...r, v: numIt(r.txt) }))
    .filter(r => r.v != null && r.v > 50)
    .sort((a, b) => b.y - a.y);
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      for (let k = j + 1; k < cand.length; k++) {
        const [c, t, n] = [cand[i].v, cand[j].v, cand[k].v];
        if (Math.abs(c - t - n) < 0.02 && t > 0 && n > 0) return { competenze: c, trattenute: t, netto: n };
      }
    }
  }
  return null;
};

// ── PARSER campi busta (layout Zucchetti) ──
export const parseBusta = (testo, totaliPos = null) => {
  const righe = testo.split('\n').map(r => r.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const piatto = righe.join(' ');
  const r = {};

  // periodo di retribuzione
  const mp = piatto.match(new RegExp(`\\b(${MESI.join('|')})\\s+(\\d{4})`, 'i'));
  if (mp) {
    r.mese = MESI.findIndex(m => m.toLowerCase() === mp[1].toLowerCase()) + 1;
    r.anno = +mp[2];
  }

  // datore (dalla ragione sociale in testa al cedolino)
  if (/SCHNEIDER/i.test(piatto)) r.datore = 'Schneider Electric';
  else if (/BONFIGLIOLI/i.test(piatto)) r.datore = 'Bonfiglioli';
  else if (/SASIB|COESIA/i.test(piatto)) r.datore = 'SASIB';
  else if (/MARPOSS/i.test(piatto)) r.datore = 'Marposs';

  // totali di busta
  const netto = (totaliPos && totaliPos.netto) ?? primoPerEtichetta(righe, /NETTO.{0,3}DEL.{0,3}MESE/i);
  const totComp = (totaliPos && totaliPos.competenze) ?? primoPerEtichetta(righe, /TOTALE.{0,3}COMPETENZE/i);
  const totTratt = (totaliPos && totaliPos.trattenute) ?? primoPerEtichetta(righe, /TOTALE.{0,3}TRATTENUTE/i);

  // PARTITE DI GIRO: compaiono sia fra le competenze sia fra le trattenute e si
  // annullano; gonfiano entrambi i totali senza essere né retribuzione né trattenuta.
  const giro = sommaPerEtichetta(righe,
    /(Recupero\s*Anticipo|Assenze\s*Retribuite|Assenza\s*assunti\/dimessi)/i) || 0;
  r.partite_di_giro = giro;

  // netto e trattenute: il netto è denaro reale, le trattenute vanno depurate del giro
  if (netto != null) r.netto = netto;
  else if (totComp != null && totTratt != null) r.netto = Math.round((totComp - totTratt) * 100) / 100;
  if (totTratt != null) r.trattenute = Math.round((totTratt - giro) * 100) / 100;
  // lordo per identità di busta (mai inventato): lordo = netto + trattenute depurate
  if (r.netto != null && r.trattenute != null) r.lordo = Math.round((r.netto + r.trattenute) * 100) / 100;

  // previdenza complementare
  r.tfr_a_fondo_pensione = primoPerEtichetta(righe, /T\.?F\.?R\.?.{0,20}(trasfer|COMETA|fondo)/i);
  r.cometa_dipendente = primoPerEtichetta(righe, /(Contributo\s*volont\.?\s*COMETA|Ctr\.?\s*Cometa\s*Dipendente)/i);
  const base = primoPerEtichetta(righe, /Ctr\.?\s*base\s*c\/az\.?\s*COMETA|Ctr\.?\s*Cometa\s*Ditta/i);
  const agg = primoPerEtichetta(righe, /Ctr\.?\s*Agg\.?\s*c\/az\.?\s*COMETA/i);
  if (base != null || agg != null) r.cometa_azienda = Math.round(((base || 0) + (agg || 0)) * 100) / 100;

  // fisco e contributi
  const ivs = primoPerEtichetta(righe, /Contributo\s*IVS(?!\s*agg)/i);
  const ivsAgg = primoPerEtichetta(righe, /Contributo\s*IVS\s*agg/i);
  const cigs = primoPerEtichetta(righe, /Contributo\s*CIGS/i);
  if (ivs != null || cigs != null) {
    r.contributi_inps = Math.round(((ivs || 0) + (ivsAgg || 0) + (cigs || 0)) * 100) / 100;
  }
  r.irpef_netta = primoPerEtichetta(righe, /Ritenute\s*IRPEF/i);
  r.addizionale_regionale = primoPerEtichetta(righe, /Addizionale\s*regionale/i);
  const com = primoPerEtichetta(righe, /Addizionale\s*comunale/i);
  const comAcc = primoPerEtichetta(righe, /Acconto\s*addiz\.?\s*comunale/i);
  if (com != null || comAcc != null) r.addizionale_comunale = Math.round(((com || 0) + (comAcc || 0)) * 100) / 100;

  // busta di cessazione: c'è una data di cessazione valorizzata o la liquidazione TFR
  if (/Data\s*Cessazione\s*\d{2}-\d{2}-\d{4}/i.test(piatto) || /Liquidazione\s*T\.?F\.?R/i.test(piatto)) {
    r.cessazione = true;
  }
  if (/tredicesima|13\^?\s*mensilit/i.test(piatto)) r.tredicesima_inclusa = true;

  // ── CONTROLLI DI PLAUSIBILITÀ: svuoto ciò che non regge, non lo aggiusto ──
  const fuori = (v, lo, hi) => v == null || v < lo || v > hi;
  if (fuori(r.netto, 100, 60000)) delete r.netto;
  if (fuori(r.lordo, 100, 90000)) { delete r.lordo; delete r.trattenute; }
  if (fuori(r.contributi_inps, 20, 8000)) delete r.contributi_inps;
  if (fuori(r.irpef_netta, 10, 20000)) delete r.irpef_netta;
  if (fuori(r.addizionale_regionale, 0.5, 500)) delete r.addizionale_regionale;
  if (fuori(r.addizionale_comunale, 0.5, 500)) delete r.addizionale_comunale;
  if (fuori(r.cometa_dipendente, 5, 2000)) delete r.cometa_dipendente;
  if (fuori(r.cometa_azienda, 5, 500)) delete r.cometa_azienda;
  if (fuori(r.tfr_a_fondo_pensione, 20, 20000)) delete r.tfr_a_fondo_pensione;
  // coerenza finale: lordo - trattenute deve dare il netto
  if (r.lordo != null && r.trattenute != null && r.netto != null &&
      Math.abs(r.lordo - r.trattenute - r.netto) > 0.05) {
    delete r.lordo; delete r.trattenute;
  }
  return r;
};

// ── API: estrae i dati della busta da un File PDF ──
// Ritorna { dati, campiTrovati }. Lancia con un messaggio comprensibile se non ce la fa.
export const estraiBustaDaPDF = async (file) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Questo dispositivo non supporta la lettura PDF integrata (serve iOS 16.4+).');
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const intero = LATIN1.decode(buf);
  if (!intero.startsWith('%PDF')) throw new Error('Il file non sembra un PDF.');

  // 1) leggo gli OGGETTI del PDF (numero -> corpo + eventuale stream decompresso).
  const oggetti = {};
  const reObj = /(\d+)\s+0\s+obj/g;
  let mo;
  while ((mo = reObj.exec(intero)) !== null) {
    const num = +mo[1];
    const fineObj = intero.indexOf('endobj', mo.index);
    const corpo = intero.slice(mo.index, fineObj === -1 ? mo.index + 4000 : fineObj);
    let testoStream = null;
    const ms = /stream\r?\n/.exec(corpo);
    if (ms) {
      const inizio = mo.index + ms.index + ms[0].length;
      const fine = intero.indexOf('endstream', inizio);
      if (fine !== -1) {
        let ultimo = fine;
        while (ultimo > inizio && (buf[ultimo - 1] === 10 || buf[ultimo - 1] === 13)) ultimo--;
        try { testoStream = LATIN1.decode(await inflate(buf.subarray(inizio, ultimo))); } catch { /* non deflate */ }
      }
    }
    oggetti[num] = { corpo, testoStream };
  }

  // 2) ogni FONT ha la SUA tabella caratteri: fondendole il testo esce cifrato,
  //    quindi risolvo /F1, /F2... fino alla rispettiva CMap ToUnicode.
  const cmapDiFont = {};
  for (const [num, o] of Object.entries(oggetti)) {
    if (!/\/Type\s*\/Font/.test(o.corpo)) continue;
    const tu = o.corpo.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (tu) cmapDiFont[num] = +tu[1];
  }
  const mappePerFont = {};
  for (const blocco of intero.matchAll(/\/Font\s*<<([^>]*)>>/g)) {
    for (const rif of blocco[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      const [, nome, objFont] = rif;
      const cmapNum = cmapDiFont[objFont];
      if (cmapNum == null || mappePerFont[nome]) continue;
      const st = oggetti[cmapNum] && oggetti[cmapNum].testoStream;
      if (st) mappePerFont[nome] = costruisciMappa([st]);
    }
  }

  // 3) testo delle pagine, decodificato col font corrente
  const streams = Object.values(oggetti).map(o => o.testoStream).filter(Boolean);
  if (!streams.length) {
    throw new Error('PDF non leggibile: se \u00e8 una scansione (buste vecchie) non contiene testo estraibile.');
  }
  const mappaFallback = costruisciMappa(streams);
  const runs = [];
  const testo = streams
    .filter(d => (d.includes('Tj') || d.includes('TJ')) && !d.includes('beginbfchar'))
    .map(d => estraiTestoZucchetti(d, mappePerFont, mappaFallback, runs)).join('\n');

  if (testo.replace(/\s/g, '').length < 100) {
    throw new Error('Non sono riuscito a estrarre testo dal PDF (probabile scansione).');
  }

  const dati = parseBusta(testo, totaliDaPosizione(runs));
  const campiTrovati = ['anno', 'mese', 'netto', 'lordo', 'contributi_inps', 'irpef_netta',
    'cometa_dipendente', 'tfr_a_fondo_pensione'].filter(k => dati[k] != null).length;
  if (campiTrovati < 3) {
    throw new Error('PDF letto ma non riconosciuto come busta Zucchetti. Puoi inserirla a mano.');
  }
  return { dati, campiTrovati };
};
