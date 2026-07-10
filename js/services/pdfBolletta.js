// pdfBolletta.js — Import bolletta da PDF (formato Dolomiti Energia).
// ZERO dipendenze esterne: i PDF Dolomiti usano stream ASCII85+Flate con testo
// CID e CMap ToUnicode incorporate. Decodifica: ASCII85 scritto a mano (~30 righe)
// + DecompressionStream('deflate') NATIVO del browser (Safari 16.4+, Chrome 80+).
// Il parser è MIRATO al layout Dolomiti: per altri fornitori ritorna i campi che
// riesce a riconoscere, e comunque l'utente verifica tutto nel form prima di salvare.

// ── ASCII85 (variante Adobe usata nei PDF, con 'z' per gruppo zero) ──
const a85decode = (str) => {
  const out = [];
  let tuple = 0, count = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 122 && count === 0) { out.push(0, 0, 0, 0); continue; }  // 'z'
    if (c < 33 || c > 117) continue;   // spazi/newline ignorati
    tuple = tuple * 85 + (c - 33);
    if (++count === 5) {
      out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255);
      tuple = 0; count = 0;
    }
  }
  if (count > 0) {   // gruppo finale parziale
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
    const bytes = [(tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255];
    for (let i = 0; i < count - 1; i++) out.push(bytes[i]);
  }
  return new Uint8Array(out);
};

// inflate zlib con l'API nativa del browser
const inflate = async (bytes) => {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
};

const LATIN1 = new TextDecoder('latin1');

// decodifica uno stream PDF: ASCII85 -> Flate (con fallback solo-A85)
const decodificaStream = async (chunkStr) => {
  const fine = chunkStr.indexOf('~>');
  if (fine === -1) return null;
  try {
    const a85 = a85decode(chunkStr.slice(0, fine));
    try { return LATIN1.decode(await inflate(a85)); }
    catch { return LATIN1.decode(a85); }
  } catch { return null; }
};

// costruisce la mappa CID -> carattere dalle CMap ToUnicode (fuse: nei PDF
// Dolomiti i font condividono lo stesso subset, zero conflitti)
const costruisciMappa = (streamsTesto) => {
  const mappa = {};
  for (const d of streamsTesto) {
    if (!d.includes('beginbfchar') && !d.includes('beginbfrange')) continue;
    for (const blk of d.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        mappa[parseInt(m[1], 16)] = String.fromCharCode(parseInt(m[2], 16));
      }
    }
    for (const blk of d.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const a = parseInt(m[1], 16), b = parseInt(m[2], 16), c = parseInt(m[3], 16);
        for (let i = 0; i <= b - a; i++) mappa[a + i] = String.fromCharCode(c + i);
      }
    }
  }
  return mappa;
};

// estrae il testo da uno stream di contenuto: stringhe hex in Tj/TJ,
// newline sui movimenti verticali (Td con ty != 0, T*)
const estraiTesto = (d, mappa) => {
  const out = [];
  const decodHex = (h) => {
    let s = '';
    for (let i = 0; i + 4 <= h.length; i += 4) s += mappa[parseInt(h.slice(i, i + 4), 16)] || '';
    return s;
  };
  const re = /<([0-9A-Fa-f]+)>\s*Tj|\[([^\]]*)\]\s*TJ|(-?[\d.]+)\s+(-?[\d.]+)\s+Td|T\*/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) out.push(decodHex(m[1]));
    else if (m[2]) for (const hh of m[2].matchAll(/<([0-9A-Fa-f]+)>/g)) out.push(decodHex(hh[1]));
    else if (m[3] !== undefined) out.push(Math.abs(parseFloat(m[4])) > 0.1 ? '\n' : ' ');
    else out.push('\n');
  }
  return out.join('');
};

const MESI_IT = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 };
const numIt = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const pad2 = (n) => String(n).padStart(2, '0');

// ── PARSER campi bolletta (layout Dolomiti) ──
const parseCampi = (testo) => {
  const r = { fornitore: null };
  let m;
  if (/Dolomiti Energia/i.test(testo)) r.fornitore = 'Dolomiti Energia';

  m = testo.match(/Fattura\s*\n?\s*n\.\s*\n?\s*(\d+)/);
  if (m) r.numero = m[1];

  m = testo.match(/fatturazione:\s*(\d{1,2})\s+(\w+)\s+(\d{4})\s*-\s*(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m && MESI_IT[m[2].toLowerCase()] && MESI_IT[m[5].toLowerCase()]) {
    r.dal = `${m[3]}-${pad2(MESI_IT[m[2].toLowerCase()])}-${pad2(m[1])}`;
    r.al = `${m[6]}-${pad2(MESI_IT[m[5].toLowerCase()])}-${pad2(m[4])}`;
  }

  m = testo.match(/Consumo totale fatturato:\s*([\d.]+)\s*kWh/);
  if (m) r.kwhTot = Math.round(numIt(m[1]));

  m = testo.match(/TOTALE DA PAGARE\s*\n?\s*([\d.]+,\d{2})/);
  if (m) r.totale = numIt(m[1]);

  m = testo.match(/FATTURATI\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (m) { r.kwhF1 = +m[1]; r.kwhF2 = +m[2]; r.kwhF3 = +m[3]; }

  m = testo.match(/Totale spesa per l.offerta nel periodo fatturato:\s*([\d.]+,\d+)/);
  if (m) r.materia = numIt(m[1]);

  let oneri = 0;
  for (const x of testo.matchAll(/componente A(?:SOS|RIM)\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n([\d.]+,\d{2})/g)) oneri += numIt(x[1]);
  if (oneri) r.oneri = Math.round(oneri * 100) / 100;

  let accise = 0;
  for (const x of testo.matchAll(/accisa\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n([\d.]+,\d{2})/g)) accise += numIt(x[1]);
  if (accise) r.accise = Math.round(accise * 100) / 100;

  m = testo.match(/TOTALE IVA\s+([\d.]+,\d{2})/);
  if (m) r.iva = numIt(m[1]);

  m = testo.match(/televisione[\s\S]{0,140}?Euro\s*([\d.]+,\d{2})/);
  if (m) r.canone = numIt(m[1]);

  m = testo.match(/Offerta:\s*([A-Z][A-Z ']+)/);
  if (m) r.offerta = m[1].trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  m = testo.match(/Fascia\s+(MONORARIA|BIORARIA)/i);
  if (m) r.tariffa = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();

  // trasporto per differenza: nel layout Dolomiti "rete/contatore/potenza" è
  // ciò che resta togliendo materia, oneri, accise, IVA e canone dal totale.
  // Precompila; l'utente può correggere nel form.
  if (r.totale != null && r.materia != null && r.iva != null) {
    const resto = r.totale - r.materia - (r.oneri || 0) - (r.accise || 0) - r.iva - (r.canone || 0);
    if (resto > 0) r.trasporto = Math.round(resto * 100) / 100;
  }
  return r;
};

// ── API: estrae i dati bolletta da un File PDF. Ritorna { dati, campiTrovati }
// oppure lancia con un messaggio comprensibile. ──
export const estraiBollettaDaPDF = async (file) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Questo dispositivo non supporta la lettura PDF integrata (serve iOS 16.4+).');
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const intero = LATIN1.decode(buf);
  if (!intero.startsWith('%PDF')) throw new Error('Il file non sembra un PDF.');

  const grezzi = [];
  for (const m of intero.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) grezzi.push(m[1]);
  const decodificati = [];
  for (const g of grezzi) {
    const d = await decodificaStream(g);
    if (d) decodificati.push(d);
  }
  if (!decodificati.length) throw new Error('PDF non leggibile: potrebbe essere una scansione o un formato non supportato.');

  const mappa = costruisciMappa(decodificati);
  const testo = decodificati
    .filter(d => (d.includes('Tj') || d.includes('TJ')) && !d.includes('beginbfchar'))
    .map(d => estraiTesto(d, mappa)).join('\n');

  if (testo.replace(/\s/g, '').length < 100) throw new Error('Non sono riuscito a estrarre testo dal PDF (scansione?).');

  const dati = parseCampi(testo);
  const campiTrovati = ['dal', 'al', 'totale', 'kwhTot', 'kwhF1', 'materia', 'oneri', 'accise', 'iva', 'canone']
    .filter(k => dati[k] != null).length;
  if (campiTrovati < 3) throw new Error('PDF letto ma formato non riconosciuto (il parser è tarato sulle bollette Dolomiti).');
  return { dati, campiTrovati };
};
