// dettaglioInvestimento.js — Scheda di uno STRUMENTO (o di un conto investimento):
// versato, grafico del versato cumulato, storia (versamenti + spostamenti +
// disinvestimenti) e gestione (rinomina, chiudi, elimina).
//   #/dettaglio-investimento?strumento=<id>
//   #/dettaglio-investimento?conto=<nome>

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, nomeMese, toast } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { costruisciSparkline, agganciaSparkline } from '../core/sparkline.js';
import { apriSheet, conferma } from './shared.js';
import {
  strumentoById, contoDiStrumento, versato, versamentiDi, storiaDi, etichettaRiga, andamentoVersato,
  strumentiDelConto, versatoConto, rinominaStrumento, impostaChiuso, eliminaStrumento, eliminaEvento,
} from '../services/strumentiService.js';
import { apriVersa, apriSposta, apriDisinvesti } from './operazioniInvestimento.js';

const _segno = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtEUR(Math.abs(n));
const _dIt = (iso) => iso.split('-').reverse().join('/');

// punti cumulati mese per mese, dal primo all'ultimo mese con movimenti
const _punti = (lista) => {
  const perMese = andamentoVersato(lista);
  const mesi = Object.keys(perMese).sort();
  if (!mesi.length) return [];
  const [y0, m0] = mesi[0].split('-').map(Number);
  const [y1, m1] = mesi[mesi.length - 1].split('-').map(Number);
  const out = []; let cum = 0, y = y0, mm = m0;
  while (y < y1 || (y === y1 && mm <= m1)) {
    const am = `${y}-${String(mm).padStart(2, '0')}`;
    cum += perMese[am] || 0;
    out.push({ label: nomeMese(mm - 1).slice(0, 3) + " '" + String(y).slice(2), valore: Math.round(cum * 100) / 100 });
    mm++; if (mm > 12) { mm = 1; y++; }
  }
  return out;
};

const _grafico = (punti) => {
  if (punti.length < 2) return '<div class="empty">Storico insufficiente per il grafico</div>';
  const { svg, dataAttr } = costruisciSparkline(punti, {
    vw: 320, vh: 150, padX: 12, padTop: 16, padBot: 30, idLinea: 'invl', idArea: 'inva',
    coloreLinea0: '#2E9BFF', coloreLinea1: '#22E39A', larghezzaLinea: 2.4, mostraEtichette: true, mostraUltimoPunto: true,
  });
  return `<div class="spark spark-big" ${dataAttr}>${svg}<div class="spark-vline"></div><div class="spark-tip"></div></div>`;
};

let _mostraTutto = false;

export const renderDettaglioInvestimento = async (root, params = {}) => {
  if (params.strumento) return _renderStrumento(root, params.strumento);
  return _renderConto(root, params.conto || '');
};

const _renderStrumento = (root, id) => {
  const s = strumentoById(id);
  if (!s) { root.innerHTML = '<div class="empty">Strumento non trovato</div>'; return; }
  const c = contoDiStrumento(s);
  document.getElementById('view-title').textContent = s.nome;
  const rerender = () => _renderStrumento(root, id);
  const storia = storiaDi(s);
  const nVers = versamentiDi(s).length;
  const lista = _mostraTutto ? storia : storia.slice(0, 15);
  const punti = _punti([s]);

  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">${escapeHtml(c ? c.nome : '')} · versato${s.chiuso ? ' · chiuso' : ''}</div>
      <div class="big num">${fmtEUR(versato(s))}</div>
      <div class="sub">
        <div><span class="lbl2">Versamenti</span><b class="num">${nVers}</b></div>
        <div><span class="lbl2">Dal</span><b style="font-size:13px">${punti.length ? punti[0].label : '—'}</b></div>
      </div>
    </div>

    ${s.chiuso ? '' : `<div class="btn-row" style="margin:14px 0 4px">
      <button class="btn btn-primary" id="op-versa">Versa</button>
      <button class="btn btn-secondary" id="op-sposta">Sposta</button>
      <button class="btn btn-secondary" id="op-disinv">Disinvesti</button>
    </div>`}

    <div class="card spark-card" style="margin-top:14px">
      <div class="spark-title">Andamento versato nel tempo</div>
      ${_grafico(punti)}
    </div>

    <div class="section-lbl"><span>Storia</span><span class="meta">${storia.length} righe</span></div>
    <div class="card" style="padding:4px 14px">
      ${lista.map(r => `
        <div class="conto-riga" ${r.evento ? `data-evento="${r.id}"` : `data-mov="${r.movId}"`}>
          <div class="conto-nome">${etichettaRiga(r)}<div class="meta" style="font-size:11.5px;margin-top:2px">${_dIt(r.data)}${r.da ? ' · da ' + escapeHtml(r.da) : ''}${r.controparte ? (r.tipo === 'sposta-out' ? ' · su ' : ' · da ') + escapeHtml(r.controparte) : ''}${r.tipo === 'disinv' || r.tipo === 'iniziale' ? (r.nota ? ' · ' + escapeHtml(r.nota) : '') : ''}${r.ris ? ` · risultato ${_segno(r.ris)}` : ''}</div></div>
          <div class="conto-saldo num">${_segno(r.v)}</div>
          <div class="conto-chev">${r.evento ? '✕' : '›'}</div>
        </div>`).join('') || '<div class="empty" style="padding:8px 0">Nessun movimento</div>'}
    </div>
    ${storia.length > 15 && !_mostraTutto ? `<button class="btn btn-secondary" id="tutto">Mostra tutte le ${storia.length} righe</button>` : ''}

    <p class="meta" style="text-align:center;margin:14px 4px;line-height:1.5">Capitale <b>versato</b>. Il valore di mercato lo trovi nell'app della piattaforma.</p>
    <button class="btn btn-secondary" id="gestisci">Rinomina, chiudi o elimina</button>
  `;

  const b = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
  b('#op-versa', () => apriVersa(s.id, rerender));
  b('#op-sposta', () => apriSposta(s.id, rerender));
  b('#op-disinv', () => apriDisinvesti(s.id, rerender));
  b('#tutto', () => { _mostraTutto = true; rerender(); });
  b('#gestisci', () => apriGestioneStrumento(s.id, rerender, () => navigate('investimenti')));
  root.querySelectorAll('[data-mov]').forEach(el => el.addEventListener('click', () => navigate('modifica', { id: el.dataset.mov })));
  root.querySelectorAll('[data-evento]').forEach(el => el.addEventListener('click', async () => {
    const e = (s.eventi || []).find(x => x.id === el.dataset.evento);
    if (!e) return;
    const msg = e.legame ? 'Eliminare questo spostamento? Spariscono entrambe le righe (su A e su B).'
      : e.tipo === 'disinv' && e.movId ? 'Eliminare il disinvestimento? Sparisce anche il movimento di incasso sul conto.'
      : 'Eliminare questa riga?';
    if (!(await conferma(msg, { danger: true, ok: 'Elimina' }))) return;
    await eliminaEvento(s.id, e.id);
    toast('Eliminato'); rerender();
  }));
  agganciaSparkline(root.querySelector('.spark'), fmtEUR);
  _mostraTutto = false;
};

const _renderConto = (root, nome) => {
  const c = state.conti.find(x => x.nome === nome);
  if (!c) { root.innerHTML = '<div class="empty">Conto non trovato</div>'; return; }
  document.getElementById('view-title').textContent = c.nome;
  const strum = strumentiDelConto(c);
  const punti = _punti(strum);
  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">${escapeHtml(c.nome)} · versato</div>
      <div class="big num">${fmtEUR(versatoConto(c))}</div>
      <div class="sub"><div><span class="lbl2">Strumenti</span><b class="num">${strum.length}</b></div>
      <div><span class="lbl2">Dal</span><b style="font-size:13px">${punti.length ? punti[0].label : '—'}</b></div></div>
    </div>
    <div class="card spark-card" style="margin-top:14px"><div class="spark-title">Andamento versato nel tempo</div>${_grafico(punti)}</div>
    <div class="section-lbl"><span>Strumenti</span></div>
    <div class="card" style="padding:4px 14px">
      ${strum.map(s => `<div class="conto-riga" data-strumento="${s.id}"><div class="conto-nome" ${s.chiuso ? 'style="color:var(--txt-2)"' : ''}>${escapeHtml(s.nome)}${s.chiuso ? ' · chiuso' : ''}</div><div class="conto-saldo num">${fmtEUR(versato(s))}</div><div class="conto-chev">›</div></div>`).join('') || '<div class="empty" style="padding:8px 0">Nessuno strumento</div>'}
    </div>`;
  root.querySelectorAll('[data-strumento]').forEach(el => el.addEventListener('click', () => navigate('dettaglio-investimento', { strumento: el.dataset.strumento })));
  agganciaSparkline(root.querySelector('.spark'), fmtEUR);
};

// Sheet di gestione di uno strumento (usato anche da Conti e strumenti)
export const apriGestioneStrumento = (id, onFatto, onEliminato) => {
  const s = strumentoById(id); if (!s) return;
  const nMov = versamentiDi(s).length + (s.eventi || []).length;
  apriSheet(s.nome, `
    <p class="meta" style="margin-bottom:12px">${escapeHtml(contoDiStrumento(s)?.nome || '')} · ${nMov} righe collegate · versato ${fmtEUR(versato(s))}</p>
    <label class="meta">Nome</label>
    <input id="gs-nome" value="${escapeHtml(s.nome)}" class="sheet-input">
    <button class="btn btn-primary" id="gs-rin" style="margin-bottom:14px">Salva nome</button>
    <div class="btn-row">
      <button class="btn btn-secondary" id="gs-chiudi">${s.chiuso ? 'Riapri' : 'Chiudi'}</button>
      <button class="btn btn-danger" id="gs-del" ${nMov ? 'style="opacity:.45"' : ''}>Elimina</button>
    </div>
    <p class="meta" style="font-size:12px;margin-top:8px">${nMov ? 'Ha dei movimenti: puoi solo chiuderlo. Resta in "Chiusi" con la sua storia.' : 'Nessun movimento: puoi eliminarlo.'}</p>
  `, (body, chiudi) => {
    body.querySelector('#gs-rin').addEventListener('click', async () => {
      try { await rinominaStrumento(id, body.querySelector('#gs-nome').value); } catch (e) { toast(e.message); return; }
      chiudi(); toast('Strumento rinominato'); if (onFatto) onFatto();
    });
    body.querySelector('#gs-chiudi').addEventListener('click', async () => {
      await impostaChiuso(id, !s.chiuso); chiudi(); toast(s.chiuso ? 'Strumento riaperto' : 'Strumento chiuso'); if (onFatto) onFatto();
    });
    body.querySelector('#gs-del').addEventListener('click', async () => {
      if (nMov) { toast('Ha dei movimenti: puoi solo chiuderlo'); return; }
      if (!(await conferma(`Eliminare "${s.nome}"?`, { danger: true, ok: 'Elimina' }))) return;
      try { await eliminaStrumento(id); } catch (e) { toast(e.message); return; }
      chiudi(); toast('Strumento eliminato'); if (onEliminato) onEliminato(); else if (onFatto) onFatto();
    });
  });
};
