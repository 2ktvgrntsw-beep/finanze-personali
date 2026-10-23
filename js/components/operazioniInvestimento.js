// operazioniInvestimento.js — Le tre schede Versa · Sposta · Disinvesti.
// Le usano la pagina Investimenti e il dettaglio di uno strumento. La logica (e la
// validazione) è in strumentiService: qui solo il modulo e i messaggi.

import { state } from '../core/store.js';
import { escapeHtml, fmtEUR, todayISO, toast } from '../core/utils.js';
import { safeWrite } from '../core/db.js';
import { apriSheet } from './shared.js';
import { saldoStimato } from '../services/contiService.js';
import {
  strumentiAttivi, strumentoById, contoDiStrumento, versato, versa, sposta, disinvesti,
} from '../services/strumentiService.js';

// importo scritto a mano: accetta "1.234,56", "1234,56" e "1234.56"
export const leggiImporto = (v) => {
  let t = String(v || '').trim().replace(/\s|€/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
};
const _fmtInput = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

const _contiLiquidi = () => state.conti
  .filter(c => c.attivo !== false && (c.tipo === 'liquidita' || c.tipo === 'risparmio'))
  .sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));

// conto di partenza proposto: l'ultimo usato per versare in questo strumento,
// altrimenti il primo conto di liquidità
const _ultimoContoPer = (s) => {
  const c = contoDiStrumento(s);
  const ultimo = state.movimenti
    .filter(m => m.tipo === 'trasferimento' && m.strumentoId === s.id && c && m.contoDest === c.nome)
    .sort((a, b) => b.data.localeCompare(a.data))[0];
  return ultimo ? ultimo.conto : (_contiLiquidi()[0] || {}).nome;
};

const _opzStrumenti = (lista, sel) => lista.map(s =>
  `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${escapeHtml(s.nome)} · ${escapeHtml(contoDiStrumento(s).nome)}</option>`).join('');

// Errori di validazione (Error con messaggio scritto da noi) → il messaggio;
// errori di scrittura del database (DOMException) → messaggio generico, come safeWrite.
const _esegui = async (fn, msgErr) => {
  try { await fn(); return true; }
  catch (e) {
    const diDatabase = (typeof DOMException !== 'undefined' && e instanceof DOMException) || !e || !e.message;
    if (!diDatabase) { toast(e.message); return false; }
    return safeWrite(() => { throw e; }, msgErr);
  }
};

export const apriVersa = (preId, onFatto) => {
  const lista = strumentiAttivi();
  if (!lista.length) { toast('Crea prima uno strumento in Conti e strumenti'); return; }
  const sel = preId && lista.some(s => s.id === preId) ? preId : lista[0].id;
  const liquidi = _contiLiquidi();
  apriSheet('Versa', `
    <label class="meta">Strumento</label>
    <select id="op-s" class="sheet-input">${_opzStrumenti(lista, sel)}</select>
    <label class="meta">Dal conto</label>
    <select id="op-c" class="sheet-input">${liquidi.map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)} · ${fmtEUR(saldoStimato(c))}</option>`).join('')}</select>
    <label class="meta">Importo (€)</label>
    <input type="text" inputmode="decimal" id="op-imp" placeholder="100" class="sheet-input">
    <label class="meta">Data</label>
    <input type="date" id="op-data" value="${todayISO()}" class="sheet-input">
    <p class="meta" style="margin:4px 0 12px">Esce dal conto ed entra nel versato dello strumento. Non è una spesa.</p>
    <button class="btn btn-primary" id="op-ok">Versa</button>
  `, (body, chiudi) => {
    const selS = body.querySelector('#op-s'), selC = body.querySelector('#op-c');
    const proponi = () => { const s = strumentoById(selS.value); const u = s && _ultimoContoPer(s); if (u) selC.value = u; };
    proponi();
    selS.addEventListener('change', proponi);
    body.querySelector('#op-ok').addEventListener('click', async () => {
      const imp = leggiImporto(body.querySelector('#op-imp').value);
      const s = strumentoById(selS.value);
      const ok = await _esegui(() => versa({ strumentoId: selS.value, contoOrigine: selC.value, imp, data: body.querySelector('#op-data').value }), 'Versamento non salvato');
      if (!ok) return;
      chiudi(); toast(`Versati ${fmtEUR(imp)} su ${s.nome}`); if (onFatto) onFatto();
    });
  });
};

export const apriSposta = (preId, onFatto) => {
  const da = strumentiAttivi().filter(s => versato(s) > 0);
  if (!da.length) { toast('Nessuno strumento con versato da spostare'); return; }
  const sel = preId && da.some(s => s.id === preId) ? preId : da[0].id;
  const contiInv = state.conti.filter(c => c.attivo !== false && c.tipo === 'investimenti');
  apriSheet('Sposta tra strumenti', `
    <label class="meta">Da (A)</label>
    <select id="op-a" class="sheet-input">${da.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${escapeHtml(s.nome)} · versato ${fmtEUR(versato(s))}</option>`).join('')}</select>
    <label class="meta">A (B)</label>
    <select id="op-b" class="sheet-input"></select>
    <div id="op-nuovo" style="display:none">
      <label class="meta">Nome del nuovo strumento</label>
      <input id="op-nome" placeholder="Es. PAC ETF World" class="sheet-input" autocomplete="off">
      <label class="meta">Nel conto</label>
      <select id="op-conto" class="sheet-input">${contiInv.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}</select>
    </div>
    <label class="meta">Versato tolto da A (€)</label>
    <input type="text" inputmode="decimal" id="op-tolto" class="sheet-input">
    <label class="meta">Arrivato su B (€)</label>
    <input type="text" inputmode="decimal" id="op-arr" class="sheet-input">
    <label class="meta">Data</label>
    <input type="date" id="op-data" value="${todayISO()}" class="sheet-input">
    <p class="meta" style="margin:4px 0 12px">Non è spesa né entrata. Se su B arriva più del versato tolto, la differenza va nel risultato realizzato e diventa versato di B.</p>
    <button class="btn btn-primary" id="op-ok">Sposta</button>
  `, (body, chiudi) => {
    const selA = body.querySelector('#op-a'), selB = body.querySelector('#op-b');
    const tolto = body.querySelector('#op-tolto'), arr = body.querySelector('#op-arr');
    const boxNuovo = body.querySelector('#op-nuovo');
    const riempiB = () => {
      const altri = strumentiAttivi().filter(s => s.id !== selA.value);
      selB.innerHTML = _opzStrumenti(altri, null) + '<option value="__nuovo">+ Nuovo strumento</option>';
      boxNuovo.style.display = selB.value === '__nuovo' ? 'block' : 'none';
    };
    const proponi = () => { const s = strumentoById(selA.value); const v = _fmtInput(versato(s)); tolto.value = v; arr.value = v; };
    riempiB(); proponi();
    selA.addEventListener('change', () => { riempiB(); proponi(); });
    selB.addEventListener('change', () => { boxNuovo.style.display = selB.value === '__nuovo' ? 'block' : 'none'; });
    body.querySelector('#op-ok').addEventListener('click', async () => {
      const t = leggiImporto(tolto.value), a = leggiImporto(arr.value);
      const nuovo = selB.value === '__nuovo' ? { nome: body.querySelector('#op-nome').value, contoId: body.querySelector('#op-conto').value } : null;
      let esito = null;
      const ok = await _esegui(async () => { esito = await sposta({ daId: selA.value, aId: nuovo ? null : selB.value, nuovo, tolto: t, arrivato: a, data: body.querySelector('#op-data').value }); }, 'Spostamento non salvato');
      if (!ok) return;
      chiudi();
      toast(`Spostato su ${esito.b.nome}${esito.risultato ? ` · risultato ${esito.risultato > 0 ? '+' : ''}${fmtEUR(esito.risultato)}` : ''}`);
      if (onFatto) onFatto();
    });
  });
};

export const apriDisinvesti = (preId, onFatto) => {
  const da = strumentiAttivi().filter(s => versato(s) > 0);
  if (!da.length) { toast('Nessuno strumento con versato da disinvestire'); return; }
  const sel = preId && da.some(s => s.id === preId) ? preId : da[0].id;
  const liquidi = _contiLiquidi();
  apriSheet('Disinvesti', `
    <label class="meta">Strumento</label>
    <select id="op-s" class="sheet-input">${da.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${escapeHtml(s.nome)} · versato ${fmtEUR(versato(s))}</option>`).join('')}</select>
    <label class="meta">Versato che esce (€)</label>
    <input type="text" inputmode="decimal" id="op-tolto" class="sheet-input">
    <label class="meta">Incassato davvero (€)</label>
    <input type="text" inputmode="decimal" id="op-inc" placeholder="quanto è arrivato sul conto" class="sheet-input">
    <label class="meta">Sul conto</label>
    <select id="op-c" class="sheet-input">${liquidi.map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join('')}</select>
    <label class="meta">Data</label>
    <input type="date" id="op-data" value="${todayISO()}" class="sheet-input">
    <p class="meta" style="margin:4px 0 12px">Il versato scende, il conto sale di quanto incassi. La differenza va nel risultato realizzato. Non è un'entrata.</p>
    <button class="btn btn-primary" id="op-ok">Disinvesti</button>
  `, (body, chiudi) => {
    const selS = body.querySelector('#op-s'), tolto = body.querySelector('#op-tolto');
    const proponi = () => { tolto.value = _fmtInput(versato(strumentoById(selS.value))); };
    proponi(); selS.addEventListener('change', proponi);
    body.querySelector('#op-ok').addEventListener('click', async () => {
      const t = leggiImporto(tolto.value), inc = leggiImporto(body.querySelector('#op-inc').value);
      if (!Number.isFinite(inc)) { toast('Inserisci quanto hai incassato'); return; }
      let esito = null;
      const ok = await _esegui(async () => { esito = await disinvesti({ strumentoId: selS.value, tolto: t, incassato: inc, contoArrivo: body.querySelector('#op-c').value, data: body.querySelector('#op-data').value }); }, 'Disinvestimento non salvato');
      if (!ok) return;
      chiudi(); toast(`Disinvestito · risultato ${esito.risultato >= 0 ? '+' : ''}${fmtEUR(esito.risultato)}`);
      if (onFatto) onFatto();
    });
  });
};
