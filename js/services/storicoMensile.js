// storicoMensile.js — Estrae dalle bollette il CONSUMO REALE MESE PER MESE.
//
// Perché esiste: una bolletta bimestrale dice quanto hai consumato in due mesi insieme.
// Spalmare quel totale sui giorni sembra ragionevole ma sbaglia parecchio (verificato:
// fino al 19% su un singolo mese, perché ottobre e novembre non si somigliano affatto).
// Le bollette però portano con sé lo STORICO mensile, ed è un dato reale: va letto, non
// ricostruito. Ogni fornitore lo presenta a modo suo, quindi serve un lettore per tipo.
//
// Se un mese non compare in nessuno storico, resta VUOTO. Mai stimato.

// Ricostruisce le RIGHE del documento raggruppando i pezzi di testo che stanno alla
// stessa quota verticale e ordinandoli da sinistra a destra. Senza questo passaggio le
// tabelle (ENGIE, Illumia, Enel) arrivano spezzate una parola per riga e le espressioni
// che cercano "mese F1 F2 F3 totale" non agganciano nulla.
export const righeDaRun = (run) => {
  const per = new Map();
  for (const r of run) {
    if (r.ruotato || !r.t.trim()) continue;
    const k = Math.round(r.y * 2) / 2;          // mezzo punto di tolleranza
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(r);
  }
  return [...per.entries()]
    .sort((a, b) => b[0] - a[0])                // dall'alto verso il basso
    .map(([, arr]) => arr.sort((a, b) => a.x - b.x).map(r => r.t).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

const MESI3 = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
const MESI_EST = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};
const intIt = (s) => {
  const v = parseInt(String(s).replace(/[.\s]/g, ''), 10);
  return Number.isFinite(v) ? v : null;
};
const chiave = (a, m) => `${a}-${String(m).padStart(2, '0')}`;

// ── DOLOMITI: grafico "consumi degli ultimi 18 mesi" ──
// I valori e le etichette sono scritti RUOTATI di 90° (matrice Tm "0 1 -1 0"). Leggendo
// direttamente gli operatori del PDF il testo esce nel verso giusto; è la coordinata
// orizzontale a dire a quale mese appartiene ciascun valore: in un grafico è l'unico
// aggancio possibile.
const dolomiti = (run) => {
  const out = {};
  const rot = run.filter(r => r.ruotato);
  const etichette = [], valori = [];
  for (const r of rot) {
    const s = r.t.trim();
    const me = s.match(/^([a-z]{3})-(\d{2})$/);
    if (me && MESI3[me[1]]) etichette.push({ x: r.x, anno: 2000 + +me[2], mese: MESI3[me[1]] });
    else if (/^\d{1,4}$/.test(s)) valori.push({ x: r.x, v: +s });
  }
  for (const e of etichette) {
    const vicini = valori.filter(v => Math.abs(v.x - e.x) < 5);
    if (vicini.length) out[chiave(e.anno, e.mese)] = { kwh: vicini[0].v, fonte: 'grafico18' };
  }
  return out;
};

// ── ENGIE: tabella "ultimi 12 mesi", una riga per mese con F1 F2 F3 ──
const engie = (testo) => {
  const out = {};
  const re = new RegExp(`\\b(${Object.keys(MESI_EST).join('|')})\\s+(\\d{4})\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`, 'gi');
  for (const m of testo.matchAll(re)) {
    const f1 = intIt(m[3]), f2 = intIt(m[4]), f3 = intIt(m[5]);
    if (f1 == null || f2 == null || f3 == null) continue;
    out[chiave(+m[2], MESI_EST[m[1].toLowerCase()])] = { kwh: f1 + f2 + f3, f1, f2, f3, fonte: 'tabella12' };
  }
  return out;
};

// ── ILLUMIA: tabella "Consumo storico energia": Mmm-AAAA F1 F2 F3 Totale ──
const illumia = (testo) => {
  const out = {};
  for (const m of testo.matchAll(/\b([A-Za-z]{3})-(\d{4})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/g)) {
    const me = MESI3[m[1].toLowerCase()];
    if (!me) continue;
    out[chiave(+m[2], me)] = { kwh: +m[6], f1: +m[3], f2: +m[4], f3: +m[5], fonte: 'storicoIllumia' };
  }
  return out;
};

// ── ENEL: due fonti. Le LETTURE del contatore sono la migliore (differenza fra due
// letture consecutive rilevate = consumo di quel mese, senza alcuna interpolazione).
// In più c'è la tabella "andamento dei consumi" che marca ogni mese Reale o Stimato:
// da quella prendo SOLO i mesi dichiarati Reale.
const enelLetture = (testo) => {
  const letture = [];
  for (const m of testo.matchAll(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d+)\s+(\d+)\s+(\d+)\s*\((rilevata|stimata)\)/g)) {
    letture.push({ id: `${m[3]}-${m[2]}-${m[1]}`, anno: +m[3], mese: +m[2],
      f: [+m[4], +m[5], +m[6]], rilevata: m[7] === 'rilevata' });
  }
  letture.sort((a, b) => a.id.localeCompare(b.id));
  const out = {};
  for (let i = 1; i < letture.length; i++) {
    const p = letture[i - 1], c = letture[i];
    if (!c.rilevata || !p.rilevata) continue;
    const d = c.f.map((v, j) => v - p.f[j]);
    if (d.some(v => v < 0)) continue;
    out[chiave(c.anno, c.mese)] = { kwh: d[0] + d[1] + d[2], f1: d[0], f2: d[1], f3: d[2], fonte: 'lettureEnel' };
  }
  return out;
};

const enelTabella = (testo) => {
  const out = {};
  const i = testo.indexOf('Andamento dei consumi');
  if (i === -1) return out;
  const righe = testo.slice(i).split('\n').map(r => r.trim());
  let mesi = null, anni = null;
  const dati = {};
  for (const r of righe) {
    const tok = r.split(/\s+/).filter(Boolean);
    if (!tok.length) continue;
    const cap = tok.map(t => t.charAt(0).toUpperCase() + t.slice(1, 3).toLowerCase());
    if (!mesi && tok.length >= 6 && cap.every(t => MESI3[t.toLowerCase()])) { mesi = cap; continue; }
    if (mesi && !anni && tok.length === mesi.length && tok.every(t => /^20\d\d$/.test(t))) { anni = tok; continue; }
    if (anni) {
      for (const et of ['Tipologia', 'F1kWh', 'F2kWh', 'F3kWh', 'Totale']) {
        if (r.startsWith(et)) dati[et] = tok.slice(1);
      }
      if (r.startsWith('Andamento della potenza')) break;
    }
  }
  if (!mesi || !anni || !dati.Totale) return out;
  const val = (et, j) => {
    const arr = dati[et] || [];
    const k = j - (mesi.length - arr.length);
    return k >= 0 && k < arr.length ? arr[k] : null;
  };
  const off = mesi.length - dati.Totale.length;
  dati.Totale.forEach((v, idx) => {
    const j = idx + off;
    if (j < 0 || j >= mesi.length || !/^[\d.]+$/.test(v)) return;
    if (val('Tipologia', j) === 'Stimato') return;      // niente stime: le scarto
    const rec = { kwh: intIt(v), fonte: 'tabella12Enel' };
    for (const [n, et] of [['f1', 'F1kWh'], ['f2', 'F2kWh'], ['f3', 'F3kWh']]) {
      const x = val(et, j);
      if (x && /^[\d.]+$/.test(x)) rec[n] = intIt(x);
    }
    out[chiave(+anni[j], MESI3[mesi[j].toLowerCase()])] = rec;
  });
  return out;
};

// ── API: dallo stesso PDF già decodificato, ricava lo storico mensile ──
export const estraiStoricoMensile = (testo, run) => {
  // per le tabelle uso il testo RICOSTRUITO A RIGHE dalle coordinate: è l'unico modo
  // per tenere insieme "mese | F1 | F2 | F3 | totale" sulla stessa riga
  if (/Dolomiti/i.test(testo)) return dolomiti(run);
  // Le tabelle possono venire meglio dal testo lineare o da quello ricostruito a righe,
  // a seconda di come il fornitore dispone gli operatori: provo entrambe e tengo il
  // risultato più ricco, invece di scommettere su una delle due.
  const perRighe = righeDaRun(run).join('\n');
  const meglio = (a, b) => (Object.keys(a).length >= Object.keys(b).length ? a : b);
  const prova = (fn) => meglio(fn(testo), fn(perRighe));
  if (/ENGIE/i.test(testo)) return prova(engie);
  if (/Illumia/i.test(testo)) return prova(illumia);
  if (/Enel/i.test(testo)) {
    const tab = prova(enelTabella); const let2 = prova(enelLetture);
    return { ...tab, ...let2 };            // le letture del contatore prevalgono
  }
  return {};
};
