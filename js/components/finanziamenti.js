// finanziamenti.js — Elenco finanziamenti + scheda dettaglio in stile mutuo
// (residuo, barra avanzamento, rate pagate/totali, prossima, scadenza, piano espandibile).

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, fmtData, todayISO } from '../core/utils.js';
import { statoPrestito, saveFinanziamento, deleteFinanziamento } from '../services/prestitiService.js';
import { apriSheet, apriDataNativa, apriSelettoreCategoria } from './shared.js';
import { toast } from '../core/utils.js';

let _apertoId = null;   // id del finanziamento di cui mostrare il dettaglio

export const renderFinanziamenti = async (root) => {
  document.getElementById('view-title').textContent = 'Finanziamenti';
  const fins = state.finanziamenti.filter(f => f.attivo !== false);

  // se un finanziamento è "aperto", mostro la sua scheda dettaglio (stile mutuo)
  if (_apertoId) {
    const f = fins.find(x => x.id === _apertoId);
    if (f) return _renderDettaglio(root, f);
    _apertoId = null;
  }

  const cards = fins.map(f => {
    const s = statoPrestito(f, []);
    if (!s) return '';
    const quota = f.quota_utente || 100;
    const residuoTuo = s.residuo * quota / 100;
    return `
      <div class="card" data-fin="${f.id}" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div><div style="font-size:16px;font-weight:700">${escapeHtml(f.nome)}</div><div class="meta">${quota < 100 ? `tua quota ${quota}% · ` : ''}${s.ratePagate}/${s.rateTotali} rate</div></div>
          <div style="text-align:right"><div class="num" style="font-weight:800;color:var(--down)">−${fmtEUR(residuoTuo)}</div><div class="meta num">rata ${fmtEUR(s.rata * quota / 100)}</div></div>
        </div>
        <div class="progress-big" style="height:8px"><span style="width:${s.pctCompletamento}%"></span></div>
      </div>`;
  }).join('');

  root.innerHTML = (cards || '<div class="empty"><div class="big-ic">📄</div>Nessun finanziamento attivo</div>') +
    `<div style="margin-top:16px"><button class="btn btn-primary" id="nuovo">➕ Nuovo finanziamento</button></div>`;

  root.querySelectorAll('[data-fin]').forEach(el => el.addEventListener('click', () => { _apertoId = el.dataset.fin; renderFinanziamenti(root); }));
  root.querySelector('#nuovo').addEventListener('click', () => _edit(root, null));
};

// Scheda dettaglio di un singolo finanziamento (impaginata come il mutuo)
const _renderDettaglio = (root, f) => {
  document.getElementById('view-title').textContent = escapeHtml(f.nome);
  const s = statoPrestito(f, []);
  const quota = f.quota_utente || 100;
  const residuoTuo = s.residuo * quota / 100;
  const restituitoTuo = s.restituito * quota / 100;
  const totaleTuo = f.importo_iniziale * quota / 100;

  root.innerHTML = `
    <div style="margin-bottom:14px"><button class="btn btn-ghost" id="back-list" style="width:auto;display:inline-flex;padding:8px 12px;font-size:13px">‹ Tutti i finanziamenti</button></div>

    <div class="net-card">
      <div class="lbl">Debito residuo${quota < 100 ? ` (tua quota ${quota}%)` : ''}</div>
      <div class="big num">${fmtEUR(residuoTuo)}</div>
      <div class="progress-big"><span style="width:${s.pctCompletamento}%"></span></div>
      <div class="delta" style="color:var(--up)">${s.pctCompletamento}% restituito · ${fmtEUR(restituitoTuo)} di ${fmtEUR(totaleTuo)}</div>
      <div class="sub">
        <div><span class="lbl2">Rata</span><b class="num">${fmtEUR(s.rata * quota / 100)}</b></div>
        <div><span class="lbl2">Rate</span><b class="num">${s.ratePagate}/${s.rateTotali}</b></div>
        <div><span class="lbl2">Fine</span><b style="font-size:13px">${fmtData(s.dataFine)}</b></div>
      </div>
    </div>

    <div class="section-lbl"><span>Dettagli</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="edit">Modifica</span></div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Importo iniziale</span><span class="num">${fmtEUR(f.importo_iniziale)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Tasso annuo</span><span class="num">${f.tasso}%</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Durata</span><span class="num">${f.durata_mesi} mesi</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Prossima rata</span><span class="num">${s.prossimaData ? fmtData(s.prossimaData) : '—'}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Conto</span><span>${escapeHtml(f.conto || '—')}</span></div>
    </div>

    <div class="section-lbl"><span>Piano di ammortamento</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="toggle-piano">Mostra piano</span></div>
    <div id="piano-mount"></div>

    <div style="margin-top:16px"><button class="btn btn-danger" id="del-fin">Elimina finanziamento</button></div>
  `;

  root.querySelector('#back-list').addEventListener('click', () => { _apertoId = null; renderFinanziamenti(root); });
  root.querySelector('#edit').addEventListener('click', () => _edit(root, f.id));
  root.querySelector('#del-fin').addEventListener('click', async () => {
    if (confirm('Eliminare il finanziamento? La ricorrenza collegata verrà rimossa.')) {
      await deleteFinanziamento(f.id); _apertoId = null; toast('Eliminato'); renderFinanziamenti(root);
    }
  });

  const togglePiano = root.querySelector('#toggle-piano');
  const pianoMount = root.querySelector('#piano-mount');
  togglePiano.addEventListener('click', () => {
    if (pianoMount.innerHTML) { pianoMount.innerHTML = ''; togglePiano.textContent = 'Mostra piano'; return; }
    togglePiano.textContent = 'Nascondi piano';
    pianoMount.innerHTML = `<div class="card" style="max-height:360px;overflow-y:auto">
      ${s.piano.map(r => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);opacity:${r.pagata ? '.5' : '1'}">
          <span class="meta">${r.n}. ${fmtData(r.data)}</span>
          <span style="font-size:12px" class="num">${f.tasso > 0 ? `C ${fmtEUR(r.quotaCapitale)} · I ${fmtEUR(r.quotaInteressi)}` : fmtEUR(r.rata)}</span>
        </div>`).join('')}
    </div>`;
  });
};

// Maschera di modifica: input nativi affidabili (niente readonly/tastierino custom)
const _edit = (root, id) => {
  const f = id ? state.finanziamenti.find(x => x.id === id)
    : { nome: '', importo_iniziale: 0, tasso: 0, durata_mesi: 0, rata: 0, data_inizio: todayISO(), quota_utente: 100, macro: 'Casa', cat: '', sub: '', conto: '' };
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);
  const tmp = { data_inizio: f.data_inizio, macro: f.macro || 'Casa', cat: f.cat || '', sub: f.sub || '' };
  const fmtD = (iso) => iso ? iso.split('-').reverse().join('/') : 'Scegli';

  // input numerico nativo: type=text + inputmode=decimal apre la tastiera numerica iOS,
  // resta pienamente editabile (nessun readonly, nessun tastierino custom fragile).
  const numInput = (label, fid, val) => `<label class="meta">${label}</label><input type="text" inputmode="decimal" id="${fid}" value="${escapeHtml(String(val))}" class="sheet-input">`;

  apriSheet(id ? escapeHtml(f.nome) : 'Nuovo finanziamento', `
    <label class="meta">Nome</label><input id="f-nome" value="${escapeHtml(f.nome)}" class="sheet-input">
    ${numInput('Importo iniziale (€)', 'f-imp', f.importo_iniziale)}
    ${numInput('Tasso annuo (%)', 'f-tasso', f.tasso)}
    ${numInput('Durata (mesi)', 'f-durata', f.durata_mesi)}
    ${numInput('Rata (€)', 'f-rata', f.rata)}
    <label class="meta">Data inizio (prima rata)</label>
    <button type="button" id="f-data-btn" class="sheet-input" style="text-align:left;cursor:pointer">${fmtD(tmp.data_inizio)}</button>
    ${numInput('Tua quota (%)', 'f-quota', f.quota_utente)}
    <div class="divider" style="margin:14px 0"></div>
    <label class="meta">Conto da cui esce la rata</label>
    <select id="f-conto" class="sheet-input">${conti.map(c => `<option ${c === f.conto ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
    <label class="meta">Classificazione delle rate generate</label>
    <button type="button" id="f-cat-btn" class="sheet-input" style="text-align:left;cursor:pointer">${[tmp.macro, tmp.cat, tmp.sub].filter(Boolean).join(' › ') || 'Scegli categoria'}</button>
    <label class="meta">Descrizione delle rate generate</label>
    <input id="f-descmov" value="${escapeHtml(f.descMovimento ?? f.nome ?? '')}" placeholder="Es. Rata Dyson (vuota = solo classificazione)" class="sheet-input">
    <div class="btn-row" style="margin-top:16px">
      ${id ? '<button class="btn btn-danger" id="f-del">Elimina</button>' : ''}
      <button class="btn btn-primary" id="f-ok">Salva</button>
    </div>
  `, (body, chiudi) => {
    body.querySelector('#f-data-btn').addEventListener('click', () => apriDataNativa(tmp.data_inizio, (nd) => { tmp.data_inizio = nd; body.querySelector('#f-data-btn').textContent = fmtD(nd); }));
    body.querySelector('#f-cat-btn').addEventListener('click', () => apriSelettoreCategoria(sel => { tmp.macro = sel.macro; tmp.cat = sel.cat; tmp.sub = sel.sub; body.querySelector('#f-cat-btn').textContent = [sel.macro, sel.cat, sel.sub].filter(Boolean).join(' › '); }));

    body.querySelector('#f-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#f-nome').value.trim();
      if (!nome) { toast('Inserisci un nome'); return; }
      const num = (fid) => parseFloat(String(body.querySelector('#' + fid).value).replace(',', '.')) || 0;
      await saveFinanziamento({
        id: f.id, nome, importo_iniziale: num('f-imp'), tasso: num('f-tasso'),
        durata_mesi: parseInt(body.querySelector('#f-durata').value) || 0, rata: num('f-rata'),
        data_inizio: tmp.data_inizio, quota_utente: num('f-quota') || 100,
        conto: body.querySelector('#f-conto').value, macro: tmp.macro, cat: tmp.cat, sub: tmp.sub,
        descMovimento: body.querySelector('#f-descmov').value.trim(),
      });
      chiudi(); toast('Salvato'); renderFinanziamenti(root);
    });
    const del = body.querySelector('#f-del');
    if (del) del.addEventListener('click', async () => { if (confirm('Eliminare?')) { await deleteFinanziamento(f.id); _apertoId = null; chiudi(); toast('Eliminato'); renderFinanziamenti(root); } });
  });
};
