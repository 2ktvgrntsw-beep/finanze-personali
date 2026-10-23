// strumentiService.js — Strumenti di investimento: la FONTE UNICA del versato.
//
// MODELLO (concordato con l'utente):
//  - Un CONTO di tipo 'investimenti' è dove stanno i soldi (Fideuram, Binance...).
//  - Uno STRUMENTO è cosa c'è dentro (PAC Fideuram, PAC Binance...). È un oggetto
//    vero, salvato nello store 'strumenti', con un id: rinominarlo non stacca nulla.
//  - Conta SOLO il versato. Nessun valore di mercato, nessuna plusvalenza latente.
//
// VERSATO di uno strumento =
//    Σ versamenti (trasferimenti con strumentoId verso il SUO conto)
//  + Σ eventi.v  (righe che non sono movimenti di conto: riga iniziale, spostamenti,
//                 versato che esce con un disinvestimento)
//
// Le tre operazioni:
//  - VERSA      → un trasferimento liquidità → conto investimento (come sempre).
//  - SPOSTA     → NESSUN movimento: due eventi (esce da A, entra in B). A perde il
//                 versato tolto, B registra quanto è arrivato davvero. La differenza
//                 è il risultato realizzato e diventa versato di B.
//  - DISINVESTI → un trasferimento conto investimento → liquidità per quanto incassato
//                 + un evento che toglie il versato uscito. La differenza è il
//                 risultato realizzato. Non è un'entrata: il patrimonio sale perché la
//                 liquidità cresce più di quanto cala il versato.
//
// Questo modulo NON importa contiService (che importa noi): niente cicli.

import { dbAdd, dbBulkPut, dbDelete, dbGet } from '../core/db.js';
import { state, refreshAll } from '../core/store.js';
import { uid, round2, todayISO, annomese } from '../core/utils.js';
import { contoDiTrasferimento } from './attribuzioneInvestimenti.js';
import { saveMovimento as _saveMov, deleteMovimento as _delMov } from './movimentiService.js';

const FLAG_MIGRAZIONE = 'strumenti_v1';
const FLAG_PLUSVALENZE = 'plusvalenze_v1';
export const CAT_PLUSVALENZE = 'Plusvalenze';   // Entrate › Plusvalenze (storiche, già incassate)

// ─── letture ────────────────────────────────────────────────────────────────
const _conto = (id) => state.conti.find(c => c.id === id) || null;
export const contoDiStrumento = (s) => _conto(s.contoId);
export const strumentoById = (id) => state.strumenti.find(s => s.id === id) || null;
const _contoInvPerNome = (nome) => state.conti.find(c => c.nome === nome && c.tipo === 'investimenti') || null;

// Versamenti di uno strumento: trasferimenti che ENTRANO nel suo conto.
export const versamentiDi = (s) => {
  const c = contoDiStrumento(s);
  if (!c) return [];
  return state.movimenti.filter(m => m.tipo === 'trasferimento' && m.strumentoId === s.id && m.contoDest === c.nome);
};

export const versato = (s) => round2(
  versamentiDi(s).reduce((a, m) => a + m.imp, 0) + (s.eventi || []).reduce((a, e) => a + (e.v || 0), 0)
);

export const strumentiDelConto = (conto, { anche_chiusi = true } = {}) =>
  state.strumenti.filter(s => s.contoId === conto.id && (anche_chiusi || !s.chiuso));

export const versatoConto = (conto) => round2(strumentiDelConto(conto).reduce((a, s) => a + versato(s), 0));

// Strumenti attivi (non chiusi, in conti non archiviati), ordinati per conto e versato.
export const strumentiAttivi = () => state.strumenti
  .filter(s => !s.chiuso && contoDiStrumento(s) && contoDiStrumento(s).attivo !== false)
  .sort((a, b) => (contoDiStrumento(a).ordine ?? 999) - (contoDiStrumento(b).ordine ?? 999) || versato(b) - versato(a));

// Storia di uno strumento: versamenti + eventi, dal più recente.
export const storiaDi = (s) => {
  const righe = versamentiDi(s).map(m => ({ tipo: 'versa', data: m.data, v: m.imp, da: m.conto, movId: m.id, desc: m.desc }));
  for (const e of (s.eventi || [])) righe.push({ ...e, evento: true });
  return righe.sort((a, b) => b.data.localeCompare(a.data));
};

// Risultato realizzato: dagli eventi (spostamenti e disinvestimenti) + le plusvalenze
// storiche registrate come entrate (Entrate › Plusvalenze). Dal più recente.
export const risultatiRealizzati = () => {
  const out = [];
  for (const s of state.strumenti) {
    for (const e of (s.eventi || [])) {
      if (e.ris) out.push({ data: e.data, ris: round2(e.ris), desc: _descEvento(e), strumento: s.nome, strumentoId: s.id });
    }
  }
  for (const m of state.movimenti) {
    if (m.tipo === 'entrata' && m.macro === 'Entrate' && m.cat === CAT_PLUSVALENZE) {
      out.push({ data: m.data, ris: round2(m.imp), desc: m.desc || 'Plusvalenza incassata', strumento: '', movId: m.id });
    }
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
};
export const realizzatoAnno = (anno) => round2(risultatiRealizzati().filter(r => r.data.startsWith(String(anno))).reduce((a, r) => a + r.ris, 0));
export const realizzatoTotale = () => round2(risultatiRealizzati().reduce((a, r) => a + r.ris, 0));

const _descEvento = (e) => {
  if (e.tipo === 'iniziale') return e.nota || 'Riga iniziale';
  if (e.tipo === 'sposta-in') return `Spostamento da ${e.controparte || '—'}`;
  if (e.tipo === 'sposta-out') return `Spostamento su ${e.controparte || '—'}`;
  if (e.tipo === 'disinv') return e.nota || 'Disinvestimento';
  return e.nota || '';
};
export const etichettaRiga = (r) => {
  if (r.tipo === 'versa') return 'Versamento';
  if (r.tipo === 'iniziale') return 'Riga iniziale';
  if (r.tipo === 'sposta-out') return 'Spostato';
  if (r.tipo === 'sposta-in') return 'Arrivato da spostamento';
  if (r.tipo === 'disinv') return 'Disinvestito';
  return r.tipo;
};

// Versato cumulato per mese (per il grafico del dettaglio). `lista` = strumenti.
export const andamentoVersato = (lista) => {
  const perMese = {};
  for (const s of lista) {
    for (const m of versamentiDi(s)) perMese[annomese(m.data)] = (perMese[annomese(m.data)] || 0) + m.imp;
    for (const e of (s.eventi || [])) perMese[annomese(e.data)] = (perMese[annomese(e.data)] || 0) + (e.v || 0);
  }
  return perMese;
};

// ─── risoluzione: a quale strumento appartiene un trasferimento ─────────────
// 1) strumentoId valido  2) chiave storica {cat, sub} dello strumento nel conto di
// destinazione  3) nome dello strumento = sub/cat  4) unico strumento aperto del conto.
const _chiaveMov = (m) => ({ cat: m.cat || '', sub: m.sub || '' });
const _stessaChiave = (a, b) => a.cat === b.cat && a.sub === b.sub;

export const risolviStrumento = (m, strumenti = state.strumenti) => {
  if (m.tipo !== 'trasferimento') return null;
  const conto = _contoInvPerNome(m.contoDest);
  if (!conto) return null;
  const delConto = strumenti.filter(s => s.contoId === conto.id);
  if (m.strumentoId && delConto.some(s => s.id === m.strumentoId)) return delConto.find(s => s.id === m.strumentoId);
  const k = _chiaveMov(m);
  const perChiave = delConto.find(s => (s.chiavi || []).some(c => _stessaChiave(c, k)));
  if (perChiave) return perChiave;
  const nome = (m.sub || m.cat || '').trim().toLowerCase();
  if (nome) {
    const perNome = delConto.find(s => s.nome.trim().toLowerCase() === nome);
    if (perNome) return perNome;
  }
  const aperti = delConto.filter(s => !s.chiuso);
  if (aperti.length === 1) return aperti[0];
  return null;
};

// ─── migrazione una tantum: dagli storici trasferimenti agli strumenti ─────
// Per ogni conto investimenti raggruppa i trasferimenti in ingresso per sottocategoria
// (lo "strumento" di fatto finora), crea gli strumenti e collega i movimenti.
// RICONCILIAZIONE: il versato del conto prima della migrazione era
//   saldo_iniziale (a data_saldo) + movimenti da quella data in poi.
// Dopo è la somma dei movimenti collegati. Se le due cifre differiscono (versato
// "senza movimento dietro"), la differenza diventa una RIGA INIZIALE sullo strumento
// più vecchio del conto: così il numero che l'utente vede non cambia.
const _saldoLegacy = (c, movs) => {
  let saldo = c.saldo_iniziale || 0;
  const dataRif = c.data_saldo || '1970-01-01';
  for (const m of movs) {
    if (m.data < dataRif) continue;
    if (m.tipo === 'spesa' && m.conto === c.nome) saldo -= m.imp;
    else if (m.tipo === 'entrata' && m.conto === c.nome) saldo += m.imp;
    else if (m.tipo === 'trasferimento') {
      if (m.conto === c.nome) saldo -= m.imp;
      if (m.contoDest === c.nome) saldo += m.imp;
    }
  }
  return round2(saldo);
};

export const pianoMigrazione = (conti, movimenti) => {
  const contiInv = conti.filter(c => c.tipo === 'investimenti');
  const strumenti = [];
  const collegamenti = [];   // [{movId, strumentoId}]
  for (const c of contiInv) {
    const entrate = movimenti
      .filter(m => m.tipo === 'trasferimento' &&
        (m.contoDest === c.nome || (!m.contoDest && contoDiTrasferimento(m, conti) === c.nome)))
      .sort((a, b) => a.data.localeCompare(b.data));
    const perNome = new Map();
    for (const m of entrate) {
      const nome = (m.sub || m.cat || 'Generale').trim() || 'Generale';
      if (!perNome.has(nome)) {
        perNome.set(nome, { id: uid(), nome, contoId: c.id, chiavi: [], chiuso: false, eventi: [], creato: todayISO(), primo: m.data });
      }
      const s = perNome.get(nome);
      const k = _chiaveMov(m);
      if (!s.chiavi.some(x => _stessaChiave(x, k))) s.chiavi.push(k);
      collegamenti.push({ movId: m.id, strumentoId: s.id, contoDest: m.contoDest || c.nome });
    }
    const lista = [...perNome.values()];
    const totMov = round2(entrate.reduce((a, m) => a + m.imp, 0));
    // uscite storiche dal conto investimento (prelievi): diventano disinvestimenti a pari
    // importo, senza risultato (il guadagno di allora non è noto)
    const uscite = movimenti.filter(m => m.tipo === 'trasferimento' && m.conto === c.nome);
    const totUscite = round2(uscite.reduce((a, m) => a + m.imp, 0));
    const legacy = _saldoLegacy(c, movimenti);
    if (!lista.length && Math.abs(legacy) >= 0.005) {
      // conto con solo un saldo dichiarato: uno strumento col nome del conto
      lista.push({ id: uid(), nome: c.nome, contoId: c.id, chiavi: [], chiuso: false, eventi: [], creato: todayISO(), primo: c.data_saldo || todayISO() });
    }
    if (lista.length) {
      const piuVecchio = lista.slice().sort((a, b) => a.primo.localeCompare(b.primo))[0];
      for (const u of uscite) {
        piuVecchio.eventi.push({ id: uid(), tipo: 'disinv', data: u.data, v: -round2(u.imp), ris: 0, movId: u.id, nota: 'Prelievo registrato prima degli strumenti' });
      }
      const diff = round2(legacy - (totMov - totUscite));
      if (Math.abs(diff) >= 0.005) {
        piuVecchio.eventi.push({
          id: uid(), tipo: 'iniziale', data: c.data_saldo || todayISO(), v: diff,
          ris: diff > 0 ? diff : 0,
          nota: diff > 0 ? 'Plusvalenza reinvestita (riga iniziale)' : 'Differenza dal saldo iniziale',
        });
      }
    }
    for (const s of lista) { delete s.primo; strumenti.push(s); }
  }
  return { strumenti, collegamenti };
};

export const migraStrumentiSeNecessario = async () => {
  const flag = await dbGet('meta', FLAG_MIGRAZIONE);
  if (flag) return false;
  if (state.strumenti.length) { await dbAdd('meta', { chiave: FLAG_MIGRAZIONE, valore: todayISO() }); return false; }
  const { strumenti, collegamenti } = pianoMigrazione(state.conti, state.movimenti);
  if (strumenti.length) await dbBulkPut('strumenti', strumenti);
  if (collegamenti.length) {
    const byId = new Map(state.movimenti.map(m => [m.id, m]));
    const agg = collegamenti.map(k => ({ ...byId.get(k.movId), strumentoId: k.strumentoId, contoDest: k.contoDest }));
    await dbBulkPut('movimenti', agg);
  }
  await dbAdd('meta', { chiave: FLAG_MIGRAZIONE, valore: todayISO() });
  await refreshAll();
  return true;
};

// Plusvalenza storica registrata come Entrate › Stipendio: la sposto in
// Entrate › Plusvalenze, così non gonfia lo stipendio e conta nel realizzato.
export const migraPlusvalenzeSeNecessario = async () => {
  const flag = await dbGet('meta', FLAG_PLUSVALENZE);
  if (flag) return 0;
  const daSpostare = state.movimenti.filter(m => m.tipo === 'entrata' && m.macro === 'Entrate' &&
    m.cat !== CAT_PLUSVALENZE && /plusvalen/i.test(`${m.desc || ''} ${m.sub || ''}`));
  if (daSpostare.length) await dbBulkPut('movimenti', daSpostare.map(m => ({ ...m, cat: CAT_PLUSVALENZE, sub: '' })));
  if (!state.categorie.some(c => c.macro === 'Entrate' && c.cat === CAT_PLUSVALENZE)) {
    await dbAdd('categorie', { id: uid(), macro: 'Entrate', cat: CAT_PLUSVALENZE, sub: '', attiva: true });
  }
  await dbAdd('meta', { chiave: FLAG_PLUSVALENZE, valore: todayISO() });
  await refreshAll();
  return daSpostare.length;
};

// ─── manutenzione a ogni avvio (idempotente) ────────────────────────────────
// - collega allo strumento giusto i trasferimenti nuovi verso conti investimento
//   (es. inseriti col "+" o generati da una ricorrenza) creando lo strumento se serve;
// - un prelievo da conto investimento inserito a mano diventa un disinvestimento a
//   pari importo (altrimenti la cifra comparirebbe due volte nel patrimonio);
// - rimuove gli eventi legati a movimenti che non esistono più.
export const allineaStrumenti = async () => {
  if (!state.conti.some(c => c.tipo === 'investimenti')) return 0;
  const strumenti = state.strumenti.map(s => ({ ...s, eventi: (s.eventi || []).slice(), chiavi: (s.chiavi || []).slice() }));
  const nuovi = [];
  const movAgg = [];
  const toccati = new Set();
  for (const m of state.movimenti) {
    if (m.tipo !== 'trasferimento') continue;
    const conto = _contoInvPerNome(m.contoDest);
    if (!conto) continue;
    const giusto = m.strumentoId && strumenti.some(s => s.id === m.strumentoId && s.contoId === conto.id);
    if (giusto) continue;
    let s = risolviStrumento({ ...m, strumentoId: null }, strumenti);
    if (!s) {
      const nome = (m.sub || m.cat || 'Generale').trim() || 'Generale';
      s = { id: uid(), nome, contoId: conto.id, chiavi: [_chiaveMov(m)], chiuso: false, eventi: [], creato: todayISO() };
      strumenti.push(s); nuovi.push(s);
    }
    movAgg.push({ ...m, strumentoId: s.id });
  }
  const movIds = new Set(state.movimenti.map(m => m.id));
  const eventiLegati = new Set();
  for (const s of strumenti) for (const e of s.eventi) if (e.movId) eventiLegati.add(e.movId);
  // prelievi manuali da conti investimento
  for (const m of state.movimenti) {
    if (m.tipo !== 'trasferimento') continue;
    const da = _contoInvPerNome(m.conto);
    if (!da || eventiLegati.has(m.id)) continue;
    if (_contoInvPerNome(m.contoDest)) continue;   // inv→inv a mano: lo tratta il versamento in arrivo
    const cand = strumenti.filter(s => s.contoId === da.id);
    if (!cand.length) continue;
    const s = cand.find(x => m.strumentoId === x.id) || cand.find(x => !x.chiuso) || cand[0];
    s.eventi.push({ id: uid(), tipo: 'disinv', data: m.data, v: -round2(m.imp), ris: 0, movId: m.id, nota: 'Prelievo inserito come movimento' });
    toccati.add(s.id);
  }
  // eventi orfani
  for (const s of strumenti) {
    const prima = s.eventi.length;
    s.eventi = s.eventi.filter(e => !e.movId || movIds.has(e.movId));
    if (s.eventi.length !== prima) toccati.add(s.id);
  }
  const daSalvare = strumenti.filter(s => toccati.has(s.id) || nuovi.includes(s));
  if (!daSalvare.length && !movAgg.length) return 0;
  if (daSalvare.length) await dbBulkPut('strumenti', daSalvare);
  if (movAgg.length) await dbBulkPut('movimenti', movAgg);
  await refreshAll();
  return movAgg.length + daSalvare.length;
};

// ─── scritture ──────────────────────────────────────────────────────────────
const _salva = async (s) => { await dbAdd('strumenti', s); };

export const creaStrumento = async ({ nome, contoId }) => {
  nome = (nome || '').trim();
  if (!nome) throw new Error('Dai un nome allo strumento');
  if (!_conto(contoId)) throw new Error('Conto non trovato');
  if (state.strumenti.some(s => s.contoId === contoId && s.nome.toLowerCase() === nome.toLowerCase())) throw new Error('Esiste già uno strumento con questo nome nel conto');
  const s = { id: uid(), nome, contoId, chiavi: [], chiuso: false, eventi: [], creato: todayISO() };
  await _salva(s); await refreshAll();
  return s;
};

export const rinominaStrumento = async (id, nome) => {
  const s = strumentoById(id); nome = (nome || '').trim();
  if (!s) throw new Error('Strumento non trovato');
  if (!nome) throw new Error('Il nome non può essere vuoto');
  if (state.strumenti.some(x => x.id !== id && x.contoId === s.contoId && x.nome.toLowerCase() === nome.toLowerCase())) throw new Error('Esiste già uno strumento con questo nome nel conto');
  // gli eventi degli ALTRI strumenti che lo citano come controparte seguono il nome
  const altri = state.strumenti.filter(x => x.id !== id && (x.eventi || []).some(e => e.controparteId === id))
    .map(x => ({ ...x, eventi: x.eventi.map(e => e.controparteId === id ? { ...e, controparte: nome } : e) }));
  await dbBulkPut('strumenti', [{ ...s, nome }, ...altri]);
  await refreshAll();
};

export const impostaChiuso = async (id, chiuso) => {
  const s = strumentoById(id); if (!s) return;
  await _salva({ ...s, chiuso: !!chiuso }); await refreshAll();
};

export const eliminaStrumento = async (id) => {
  const s = strumentoById(id); if (!s) return;
  if (versamentiDi(s).length || (s.eventi || []).length) throw new Error('Ha dei movimenti: puoi solo chiuderlo');
  await dbDelete('strumenti', id); await refreshAll();
};

// VERSA: trasferimento dal conto di liquidità allo strumento
export const versa = async ({ strumentoId, contoOrigine, imp, data, saveMovimento = _saveMov }) => {
  const s = strumentoById(strumentoId); const c = s && contoDiStrumento(s);
  imp = round2(imp);
  if (!s || !c) throw new Error('Strumento non trovato');
  if (!(imp > 0)) throw new Error('Inserisci un importo maggiore di zero');
  if (!contoOrigine) throw new Error('Scegli il conto di partenza');
  const k = (s.chiavi && s.chiavi[0]) || { cat: '', sub: s.nome };
  return saveMovimento({
    tipo: 'trasferimento', data: data || todayISO(), imp,
    macro: 'Investimenti', cat: k.cat, sub: k.sub || s.nome,
    conto: contoOrigine, contoDest: c.nome, desc: `Versamento ${s.nome}`, strumentoId: s.id,
  });
};

// SPOSTA: nessun movimento di conto, due eventi legati tra loro
export const sposta = async ({ daId, aId, nuovo, tolto, arrivato, data }) => {
  const a = strumentoById(daId);
  tolto = round2(tolto); arrivato = round2(arrivato);
  if (!a) throw new Error('Strumento di partenza non trovato');
  if (!(tolto > 0)) throw new Error('Inserisci il versato tolto da A');
  if (tolto > versato(a) + 0.005) throw new Error(`A ha solo ${versato(a).toFixed(2).replace('.', ',')} € di versato`);
  if (!(arrivato > 0)) throw new Error('Inserisci quanto è arrivato su B');
  let b;
  if (nuovo) b = await creaStrumento(nuovo);
  else b = strumentoById(aId);
  if (!b) throw new Error('Strumento di arrivo non trovato');
  if (b.id === a.id) throw new Error('A e B devono essere diversi');
  const legame = uid(); const d = data || todayISO();
  const aa = strumentoById(a.id), bb = strumentoById(b.id);
  const nuovoA = { ...aa, eventi: [...(aa.eventi || []), { id: uid(), tipo: 'sposta-out', data: d, v: -tolto, ris: 0, legame, controparte: bb.nome, controparteId: bb.id }] };
  const nuovoB = { ...bb, eventi: [...(bb.eventi || []), { id: uid(), tipo: 'sposta-in', data: d, v: arrivato, ris: round2(arrivato - tolto), legame, controparte: aa.nome, controparteId: aa.id }] };
  await dbBulkPut('strumenti', [nuovoA, nuovoB]);
  await refreshAll();
  // A svuotato del tutto: lo chiudo (resta in "Chiusi" con la sua storia)
  if (Math.abs(versato(strumentoById(a.id))) < 0.005) await impostaChiuso(a.id, true);
  return { a: strumentoById(a.id), b: strumentoById(b.id), risultato: round2(arrivato - tolto) };
};

// DISINVESTI: trasferimento verso la liquidità per l'incassato + evento sul versato
export const disinvesti = async ({ strumentoId, tolto, incassato, contoArrivo, data, saveMovimento = _saveMov }) => {
  const s = strumentoById(strumentoId); const c = s && contoDiStrumento(s);
  tolto = round2(tolto); incassato = round2(incassato);
  if (!s || !c) throw new Error('Strumento non trovato');
  if (!(tolto > 0)) throw new Error('Inserisci il versato che esce');
  if (tolto > versato(s) + 0.005) throw new Error(`Lo strumento ha solo ${versato(s).toFixed(2).replace('.', ',')} € di versato`);
  if (!(incassato >= 0)) throw new Error('Inserisci quanto hai incassato');
  if (incassato > 0 && !contoArrivo) throw new Error('Scegli il conto su cui arrivano i soldi');
  const d = data || todayISO();
  let movId = null;
  if (incassato > 0) {
    const m = await saveMovimento({
      tipo: 'trasferimento', data: d, imp: incassato,
      macro: '', cat: '', sub: '',
      conto: c.nome, contoDest: contoArrivo, desc: `Disinvestimento ${s.nome}`, strumentoId: s.id,
    });
    movId = m.id;
  }
  const ss = strumentoById(s.id);
  const ev = { id: uid(), tipo: 'disinv', data: d, v: -tolto, ris: round2(incassato - tolto), movId,
    nota: incassato > 0 ? `Incassati ${incassato.toFixed(2).replace('.', ',')} € su ${contoArrivo}` : 'Nessun incasso' };
  await _salva({ ...ss, eventi: [...(ss.eventi || []), ev] });
  await refreshAll();
  if (Math.abs(versato(strumentoById(s.id))) < 0.005) await impostaChiuso(s.id, true);
  return { risultato: ev.ris };
};

// Elimina un evento (riga iniziale, spostamento — entrambe le metà — o
// disinvestimento — anche il suo movimento di incasso).
export const eliminaEvento = async (strumentoId, eventoId, { deleteMovimento = _delMov } = {}) => {
  const s = strumentoById(strumentoId); if (!s) return;
  const e = (s.eventi || []).find(x => x.id === eventoId); if (!e) return;
  const daSalvare = [];
  if (e.legame) {
    for (const x of state.strumenti) {
      if ((x.eventi || []).some(y => y.legame === e.legame)) daSalvare.push({ ...x, eventi: x.eventi.filter(y => y.legame !== e.legame) });
    }
  } else daSalvare.push({ ...s, eventi: s.eventi.filter(y => y.id !== eventoId) });
  await dbBulkPut('strumenti', daSalvare);
  if (e.movId && deleteMovimento) await deleteMovimento(e.movId);
  await refreshAll();
};

// Dopo un ripristino da backup. Un backup di PRIMA degli strumenti (senza lo store
// 'strumenti') riporta i movimenti allo stato vecchio e conti con id diversi: gli
// strumenti presenti non corrispondono più. Li azzero e rifaccio la migrazione su
// quei dati, esattamente come al primo avvio della versione con gli strumenti.
export const dopoRipristino = async (dati) => {
  const conStrumenti = Array.isArray(dati.strumenti) && dati.strumenti.length > 0;
  if (!conStrumenti) {
    const { dbClear } = await import('../core/db.js');
    await dbClear('strumenti');
    await dbDelete('meta', FLAG_MIGRAZIONE);
    await dbDelete('meta', FLAG_PLUSVALENZE);
    await refreshAll();
    await migraStrumentiSeNecessario();
    await migraPlusvalenzeSeNecessario();
  }
  await allineaStrumenti();
};
