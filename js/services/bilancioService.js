// bilancioService.js — Il tasso di risparmio, anno per anno.
//
// È l'unica vista che incrocia i due lati dell'app: quanto è entrato e quanto è uscito.
// Finora vivevano in sezioni separate e non si parlavano mai.
//
// DA DOVE VENGONO LE ENTRATE. Dai MOVIMENTI (tipo 'entrata'), non dalle buste paga.
// Sembra controintuitivo avendo dieci anni di cedolini, ma lo stipendio è già
// registrato fra i movimenti come "Entrate > Stipendio": sommare anche le buste
// significherebbe contarlo due volte. Il registro dei movimenti è la CASSA — sa anche
// delle entrate che una busta non conosce (vendite, rimborsi, regali) — mentre le buste
// restano il riscontro: se i due numeri divergono, è l'archivio dei movimenti a essere
// incompleto, e la vista lo dice invece di far finta di niente.
//
// LE UNA TANTUM VANNO SEPARATE, SU ENTRAMBI I LATI. Nel 2023 c'è una vendita d'auto da
// 24.000 € e un saldo da 18.384: senza distinguerle, quell'anno sembra al tempo stesso
// eccezionale e disastroso, e il confronto con gli altri anni non significa niente.
// Il marcatore è il tag 'una tantum', messo da te: l'app propone i candidati (movimenti
// sopra la soglia, stipendi esclusi) ma non decide da sola, perché "grande" e
// "straordinario" non sono la stessa cosa.

import { state, contoByNome } from '../core/store.js';
import { round2, todayISO } from '../core/utils.js';
import { calcolaPiano } from './prestitiService.js';
import { naturaDi, vociTra } from './naturaService.js';

// ─────────────────────────────────────────────────────────────────────────────
// LA RATA DEL MUTUO NON E' UNA SPESA SOLA: sono due cose incollate.
//
//  · gli INTERESSI sono il prezzo del denaro. Spesa vera, come un affitto.
//  · il CAPITALE non e' una spesa: sposta soldi da una tasca (la liquidita') a
//    un'altra (la casa che possiedi, il debito che cala). Nell'istante in cui paghi,
//    il tuo patrimonio netto non si muove di un euro. E' risparmio, per giunta forzato.
//
// Contando tutta la rata come consumo, il tasso di risparmio veniva sottostimato di
// 9-19 punti l'anno. Quindi la quota capitale esce da "speso" e diventa un segmento
// suo: accanto all'accantonato, perche' e' della stessa natura, ma DISTINTO, perche'
// e' risparmio illiquido — quei soldi tornano disponibili solo vendendo casa.
//
// SOLO IL MUTUO. Il criterio non e' "e' un debito" ma "il bene conserva valore":
// un'auto e un elettrodomestico si consumano, quindi le loro rate restano spese
// intere, capitale compreso. Una casa no.
//
// COME SI DIVIDE: rata per rata, non a proporzione d'anno. Il piano di ammortamento
// conosce il mese e lo split esatto di ogni rata; il registro conosce cosa e' uscito
// davvero. Le due liste si abbinano per MESE: dove il movimento c'e', prendo capitale
// e interessi di QUELLA rata. Le rate del piano senza movimento non entrano nei conti
// — dal conto corrente non e' uscito niente — ma vengono contate e dichiarate, perche'
// una rata che manca nel registro e' un buco nell'archivio, non un mese senza mutuo.
// (Se l'importo registrato differisce dalla rata piena — per esempio un mutuo
// cointestato con quota_utente al 50% — lo split viene scalato nella stessa
// proporzione: su una rata pagata per intero il fattore vale 1 e i numeri sono
// esattamente quelli del piano.)
// ─────────────────────────────────────────────────────────────────────────────

export const TAG_UNA_TANTUM = 'una tantum';
export const SOGLIA_CANDIDATO = 2000;

// RISCONTRO STIPENDI. Si confronta solo lo stipendio vero (Entrate › Stipendio)
// col netto del cedolino + addebiti in busta (il "netto guadagnato" dell'app).
// Buoni pasto e welfare stanno anch'essi sotto Stipendio ma NON sono nel netto del
// cedolino: contarli faceva comparire 2.624 € di "scarto" inesistente nel 2026.
// Il confronto è mese per mese: un totale annuo nascondeva quali mesi non tornano.
// Sotto i 50 € al mese è arrotondamento o un piccolo addebito non registrato.
export const SOGLIA_SCARTO_MESE = 50;
const _NON_NEL_NETTO = /buon[io]\s*pasto|welfare|ticket/i;
const _eStipendioDaBusta = (m) => m.cat === 'Stipendio' && !_NON_NEL_NETTO.test(m.sub || '');

const _anno = (m) => m.data.slice(0, 4);
const _mese = (m) => Number(m.data.slice(5, 7));
const _isUnaTantum = (m) => (m.tag || []).some(t => String(t).toLowerCase() === TAG_UNA_TANTUM);

// Un trasferimento è "accantonato" solo se atterra su un conto di risparmio o
// investimento: spostare soldi fra due conti correnti non è risparmiare.
const _accantona = (m) => {
  const dest = contoByNome(m.contoDest);
  return dest ? (dest.tipo === 'investimenti' || dest.tipo === 'risparmio') : m.macro === 'Investimenti';
};

// Il piano del mutuo indicizzato per MESE, piu' la chiave con cui riconoscerne le rate
// fra i movimenti. Null se il mutuo non e' stato modellato.
const _pianoMutuo = () => {
  const p = state.mutuo;
  if (!p || !p.importo_iniziale || !p.rata || !p.durata_mesi) return null;
  const perMese = {};
  for (const r of calcolaPiano(p, state.eventiMutuo || [])) {
    perMese[r.data.slice(0, 7)] = { capitale: r.quotaCapitale, interessi: r.quotaInteressi, rata: r.rata, data: r.data };
  }
  return { chiave: { macro: p.macro || '', cat: p.cat || '', sub: p.sub || '' }, perMese };
};

const _eRataMutuo = (m, chiave) => !!chiave
  && m.macro === chiave.macro && m.cat === chiave.cat && (chiave.sub ? m.sub === chiave.sub : true);

export const bilancioAnnuale = () => {
  const piano = _pianoMutuo();
  const mesiAbbinati = new Set();
  const annoOggi = String(new Date().getFullYear());
  const meseOggi = new Date().getMonth() + 1;

  const per = {};
  const riga = (a) => (per[a] = per[a] || {
    anno: a, entrate: 0, entrateStraordinarie: 0, stipendiRegistrati: 0, extraStipendio: 0, stipMese: {},
    speso: 0, spesoStraordinario: 0, accantonato: 0, nMov: 0,
    rateMutuo: 0, capitaleMutuo: 0, interessiMutuo: 0, rateMancanti: 0, straordinari: [],
    // speso per natura (bisogno/desiderio/da classificare) e quota capitale del mutuo
    // per natura: il capitale esce dallo speso, quindi esce anche dalla sua natura
    spesoNat: { B: 0, D: 0, N: 0 }, capitaleNat: { B: 0, D: 0, N: 0 },
  });

  for (const m of state.movimenti) {
    const a = _anno(m);
    const r = riga(a);
    r.nMov++;
    const straord = _isUnaTantum(m);
    if (m.tipo === 'entrata') {
      r.entrate += m.imp;
      if (straord) r.entrateStraordinarie += m.imp;
      if (_eStipendioDaBusta(m)) {
        r.stipendiRegistrati += m.imp;
        const am = m.data.slice(0, 7);
        r.stipMese[am] = (r.stipMese[am] || 0) + m.imp;
      } else if (m.cat === 'Stipendio') r.extraStipendio += m.imp;
    } else if (m.tipo === 'spesa') {
      r.speso += m.imp;
      const nat = naturaDi(m.macro, m.cat, m.sub) || 'N';
      r.spesoNat[nat] += m.imp;
      if (straord) r.spesoStraordinario += m.imp;
      // rata del mutuo: la abbino alla rata del piano dello STESSO MESE e ne prendo
      // lo split esatto. Un mese si abbina una volta sola: se per errore ci fossero
      // due movimenti nello stesso mese, il secondo resta una spesa normale.
      if (piano && _eRataMutuo(m, piano.chiave)) {
        const am = m.data.slice(0, 7);
        const rata = piano.perMese[am];
        if (rata && !mesiAbbinati.has(am)) {
          mesiAbbinati.add(am);
          const fattore = rata.rata > 0 ? m.imp / rata.rata : 1;
          r.rateMutuo += m.imp;
          r.capitaleMutuo += rata.capitale * fattore;
          r.capitaleNat[naturaDi(m.macro, m.cat, m.sub) || 'N'] += rata.capitale * fattore;
          r.interessiMutuo += rata.interessi * fattore;
        }
      }
    } else if (m.tipo === 'trasferimento' && _accantona(m)) {
      r.accantonato += m.imp;
    }
    if (straord) r.straordinari.push({ id: m.id, data: m.data, tipo: m.tipo, desc: m.desc, imp: round2(m.imp) });
  }

  // Rate previste dal piano che nel registro non hanno trovato un movimento: non
  // entrano nei conti (dal conto non e' uscito niente) ma vanno dichiarate.
  if (piano) {
    const oggi = todayISO();
    for (const am of Object.keys(piano.perMese)) {
      if (mesiAbbinati.has(am)) continue;
      // una rata non ancora scaduta non "manca": prima contava anche novembre e
      // dicembre dell'anno in corso, e il Bilancio segnalava due rate inesistenti
      if (piano.perMese[am].data > oggi) continue;
      const a = am.slice(0, 4);
      if (!per[a]) continue;            // anni fuori dall'archivio: non e' un buco
      per[a].rateMancanti++;
    }
  }

  // netto delle buste paga dello stesso anno: serve solo come riscontro
  const nettoBuste = {}, nettoBusteMese = {};
  for (const b of state.stipendi) {
    const a = String(b.anno);
    const v = (b.netto || 0) + (b.addebiti_netti || 0);
    nettoBuste[a] = (nettoBuste[a] || 0) + v;
    const am = `${a}-${String(b.mese).padStart(2, '0')}`;
    nettoBusteMese[am] = (nettoBusteMese[am] || 0) + v;
  }
  const stipMese = {};
  for (const r of Object.values(per)) for (const [am, v] of Object.entries(r.stipMese)) stipMese[am] = v;
  const riscontro = _riscontroStipendi(stipMese, nettoBusteMese);

  return Object.values(per).map(r => {
    const entrate = round2(r.entrate);
    const capitaleDebito = round2(r.capitaleMutuo);
    const interessiDebito = round2(r.rateMutuo - capitaleDebito);   // il resto della rata
    const speso = round2(r.speso - capitaleDebito);   // gli interessi restano spesa
    const accantonato = round2(r.accantonato);
    const rimasto = round2(entrate - speso - capitaleDebito - accantonato);
    const risparmiato = round2(entrate - speso);
    // Versione "ricorrente": tolte le partite straordinarie da entrambi i lati.
    const entrateOrd = round2(entrate - r.entrateStraordinarie);
    const spesoOrd = round2(speso - r.spesoStraordinario);
    const risparmiatoOrd = round2(entrateOrd - spesoOrd);
    const buste = round2(nettoBuste[r.anno] || 0);
    return {
      anno: r.anno,
      parziale: r.anno === annoOggi,
      finoAlMese: r.anno === annoOggi ? meseOggi : 12,
      entrate, speso, accantonato, rimasto, risparmiato,
      capitaleDebito, interessiDebito, rateDebito: round2(r.rateMutuo),
      rateMancanti: r.rateMancanti,
      tasso: entrate > 0 ? round2(risparmiato / entrate * 100) : null,
      // il tasso al netto delle una tantum: è quello che dice come vivi davvero
      tassoOrdinario: entrateOrd > 0 ? round2(risparmiatoOrd / entrateOrd * 100) : null,
      entrateStraordinarie: round2(r.entrateStraordinarie),
      entrateOrdinarie: entrateOrd,
      // lo speso diviso per natura, SENZA la quota capitale del mutuo (come lo speso)
      bisogni: round2(r.spesoNat.B - r.capitaleNat.B),
      desideri: round2(r.spesoNat.D - r.capitaleNat.D),
      nonClassificato: round2(r.spesoNat.N - r.capitaleNat.N),
      spesoStraordinario: round2(r.spesoStraordinario),
      straordinari: r.straordinari.sort((a, b) => b.imp - a.imp),
      // riscontro con l'archivio buste paga
      stipendiRegistrati: round2(r.stipendiRegistrati),
      extraStipendio: round2(r.extraStipendio),   // buoni pasto, welfare: non sono nel netto
      nettoBuste: buste,
      scartoBuste: buste ? round2(r.stipendiRegistrati - buste) : null,
      // riscontro MESE PER MESE: solo i mesi che hanno un cedolino
      mesiConCedolino: Object.keys(nettoBusteMese).filter(am => am.startsWith(r.anno)).length,
      riscontroFuori: riscontro.filter(g => g.mesi[0].startsWith(r.anno)),
      nMov: r.nMov,
      inRosso: rimasto < 0,
    };
  }).sort((a, b) => b.anno.localeCompare(a.anno));
};

// Totale sull'intero archivio, esclusi gli anni parziali: è il numero da mettere in cima.
export const bilancioComplessivo = () => {
  const righe = bilancioAnnuale().filter(r => !r.parziale);
  if (!righe.length) return null;
  const s = (c) => round2(righe.reduce((t, r) => t + r[c], 0));
  const entrate = s('entrate'), risparmiato = s('risparmiato');
  return {
    anni: righe.length, entrate, speso: s('speso'), accantonato: s('accantonato'),
    risparmiato, tasso: entrate > 0 ? round2(risparmiato / entrate * 100) : 0,
    dal: righe[righe.length - 1].anno, al: righe[0].anno,
  };
};

// Candidati al tag 'una tantum': movimenti grossi non ancora marcati. Gli stipendi
// restano fuori — sono grandi per definizione e non hanno niente di straordinario.
export const candidatiUnaTantum = () => state.movimenti
  .filter(m => (m.tipo === 'spesa' || m.tipo === 'entrata')
    && m.imp >= SOGLIA_CANDIDATO
    && !(m.cat === 'Stipendio')
    && !_isUnaTantum(m))
  .map(m => ({ id: m.id, data: m.data, tipo: m.tipo, macro: m.macro, cat: m.cat, desc: m.desc, imp: round2(m.imp) }))
  .sort((a, b) => b.imp - a.imp);

// Entrate fra due date (incluse), anche al netto delle una tantum: base del tetto
// dei desideri, che si misura in % delle entrate.
export const entrateTra = (da, a) => {
  let tot = 0, straord = 0;
  for (const m of state.movimenti) {
    if (m.tipo !== 'entrata' || m.data < da || m.data > a) continue;
    tot += m.imp;
    if (_isUnaTantum(m)) straord += m.imp;
  }
  return { totali: round2(tot), ordinarie: round2(tot - straord) };
};

// Desideri in % delle entrate ordinarie (senza una tantum) fra due date: è la misura
// del tetto dei desideri (pagina Bisogni e card in Analisi).
export const quotaDesideriSuEntrate = (da, a) => {
  const v = vociTra(da, a);
  const e = entrateTra(da, a).ordinarie;
  return { desideri: v.D, entrate: e, pct: e > 0 ? v.D / e * 100 : null, bisogni: v.B, nonClass: v.N };
};

// Riscontro mese per mese fra stipendio registrato e cedolino, su TUTTO l'archivio.
// Un accredito che arriva il mese dopo (succedeva coi datori precedenti, e con
// tredicesima/quattordicesima) crea due scarti opposti in due mesi vicini: non è un
// errore, è uno sfasamento. Quindi i mesi consecutivi che si compensano vengono
// sommati, e si segnala solo ciò che resta oltre la soglia.
// Ritorna i gruppi che NON tornano: [{ mesi: ['2026-04'], registrato, cedolino, scarto }].
const _riscontroStipendi = (stipMese, nettoBusteMese) => {
  const mesi = Object.keys(nettoBusteMese).sort();
  const voce = (am) => ({ am, reg: stipMese[am] || 0, ced: nettoBusteMese[am], s: (stipMese[am] || 0) - nettoBusteMese[am] });
  const out = [];
  for (let i = 0; i < mesi.length; i++) {
    const v = voce(mesi[i]);
    if (Math.abs(v.s) <= SOGLIA_SCARTO_MESE) continue;
    const g = { mesi: [v.am], registrato: v.reg, cedolino: v.ced, scarto: v.s };
    // allarga il gruppo finché il mese dopo compensa (segno opposto) e resta qualcosa
    while (Math.abs(g.scarto) > SOGLIA_SCARTO_MESE && i + 1 < mesi.length) {
      const n = voce(mesi[i + 1]);
      if (Math.sign(n.s) === Math.sign(g.scarto) || Math.abs(n.s) <= SOGLIA_SCARTO_MESE) break;
      g.mesi.push(n.am); g.registrato += n.reg; g.cedolino += n.ced; g.scarto += n.s; i++;
    }
    if (Math.abs(g.scarto) > SOGLIA_SCARTO_MESE) {
      out.push({ mesi: g.mesi, registrato: round2(g.registrato), cedolino: round2(g.cedolino), scarto: round2(g.scarto) });
    }
  }
  return out;
};
