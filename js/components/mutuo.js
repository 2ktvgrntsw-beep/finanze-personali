// mutuo.js — Scheda mutuo: stato, piano di ammortamento, eventi.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, fmtData } from '../core/utils.js';
import { statoPrestito, saveMutuo, saveEventoMutuo, eventiMutuo, deleteEventoMutuo } from '../services/prestitiService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

export const renderMutuo = async (root) => {
  document.getElementById('view-title').textContent = 'Mutuo';
  const m = state.mutuo;
  if (!m || !m.importo_iniziale) { root.innerHTML = '<div class="empty">Nessun mutuo configurato</div><div style="margin-top:16px"><button class="btn btn-primary" id="setup">Configura mutuo</button></div>'; root.querySelector('#setup').addEventListener('click', () => _edit(root)); return; }

  const s = statoPrestito(m, state.eventiMutuo);
  const eventi = eventiMutuo();

  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">Debito residuo${m.quota_utente < 100 ? ` (tua quota ${m.quota_utente}%)` : ''}</div>
      <div class="big num">${fmtEUR(s.residuo * (m.quota_utente || 100) / 100)}</div>
      <div class="progress-big"><span style="width:${s.pctCompletamento}%"></span></div>
      <div class="delta" style="color:var(--up)">${s.pctCompletamento}% restituito · ${fmtEUR(s.restituito * (m.quota_utente || 100) / 100)} di ${fmtEUR(m.importo_iniziale * (m.quota_utente || 100) / 100)}</div>
      <div class="sub">
        <div><span class="lbl2">Rata</span><b class="num">${fmtEUR(s.quotaUtente)}</b></div>
        <div><span class="lbl2">Rate</span><b class="num">${s.ratePagate}/${s.rateTotali}</b></div>
        <div><span class="lbl2">Fine</span><b style="font-size:13px">${fmtData(s.dataFine)}</b></div>
      </div>
    </div>

    <div class="section-lbl"><span>Dettagli</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="edit">Modifica</span></div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Importo iniziale</span><span class="num">${fmtEUR(m.importo_iniziale)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Tasso annuo</span><span class="num">${m.tasso}%</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Durata</span><span class="num">${m.durata_mesi} mesi</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Prossima rata</span><span class="num">${s.prossimaData ? fmtData(s.prossimaData) : '—'}</span></div>
      ${m.banca ? `<div style="display:flex;justify-content:space-between;padding:6px 0"><span class="meta">Banca</span><span>${escapeHtml(m.banca)}</span></div>` : ''}
    </div>

    <div class="section-lbl"><span>Eventi</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="add-ev">➕ Estinzione parziale</span></div>
    ${eventi.length ? eventi.map(e => `<div class="recrow" data-ev="${e.id}"><div class="ic" style="background:var(--up-bg)">💸</div><div class="body"><div class="d1">${e.tipo === 'estinzione_parziale' ? 'Estinzione parziale' : e.tipo}</div><div class="d2">${fmtData(e.data)}</div></div><div class="amt num">−${fmtEUR(e.importo)}</div></div>`).join('') : '<div class="meta" style="padding:4px">Nessun evento straordinario</div>'}

    <div class="section-lbl"><span>Piano di ammortamento</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="toggle-piano">Mostra piano</span></div>
    <div id="piano-mount"></div>
  `;

  root.querySelector('#edit').addEventListener('click', () => _edit(root));
  root.querySelector('#add-ev').addEventListener('click', () => _addEvento(root));
  root.querySelectorAll('[data-ev]').forEach(el => el.addEventListener('click', async () => { if (confirm('Eliminare evento?')) { await deleteEventoMutuo(el.dataset.ev); toast('Eliminato'); renderMutuo(root); } }));

  // piano nascosto, si apre al click
  const togglePiano = root.querySelector('#toggle-piano');
  const pianoMount = root.querySelector('#piano-mount');
  togglePiano.addEventListener('click', () => {
    if (pianoMount.innerHTML) { pianoMount.innerHTML = ''; togglePiano.textContent = 'Mostra piano'; return; }
    togglePiano.textContent = 'Nascondi piano';
    pianoMount.innerHTML = `<div class="card" style="max-height:360px;overflow-y:auto">
      ${s.piano.filter((_, i) => i < 360).map(r => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);opacity:${r.pagata ? '.5' : '1'}">
          <span class="meta">${r.n}. ${fmtData(r.data)}</span>
          <span style="font-size:12px" class="num">C ${fmtEUR(r.quotaCapitale)} · I ${fmtEUR(r.quotaInteressi)}</span>
        </div>`).join('')}
    </div>`;
  });
};

const _edit = (root) => {
  const m = state.mutuo || { nome: 'Mutuo', importo_iniziale: 0, tasso: 0, durata_mesi: 0, rata: 0, data_inizio: '2020-01-01', quota_utente: 100, banca: '', giorno_addebito: 1 };
  const f = (label, id, val, type = 'number', step = '0.01') => `<label class="meta">${label}</label><input type="${type}" ${type === 'number' ? `step="${step}"` : ''} id="${id}" value="${escapeHtml(String(val))}" style="width:100%;padding:12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:15px;margin:6px 0 10px">`;
  apriSheet('Modifica mutuo', `
    ${f('Nome', 'm-nome', m.nome, 'text')}
    ${f('Importo iniziale (€)', 'm-imp', m.importo_iniziale)}
    ${f('Tasso annuo (%)', 'm-tasso', m.tasso)}
    ${f('Durata (mesi)', 'm-durata', m.durata_mesi, 'number', '1')}
    ${f('Rata (€)', 'm-rata', m.rata)}
    ${f('Data inizio', 'm-data', m.data_inizio, 'date')}
    ${f('Tua quota (%)', 'm-quota', m.quota_utente, 'number', '1')}
    ${f('Banca', 'm-banca', m.banca || '', 'text')}
    <button class="btn btn-primary" id="m-ok" style="margin-top:8px">Salva</button>
  `, (body, chiudi) => {
    body.querySelector('#m-ok').addEventListener('click', async () => {
      await saveMutuo({
        nome: body.querySelector('#m-nome').value, importo_iniziale: parseFloat(body.querySelector('#m-imp').value) || 0,
        tasso: parseFloat(body.querySelector('#m-tasso').value) || 0, durata_mesi: parseInt(body.querySelector('#m-durata').value) || 0,
        rata: parseFloat(body.querySelector('#m-rata').value) || 0, data_inizio: body.querySelector('#m-data').value,
        quota_utente: parseFloat(body.querySelector('#m-quota').value) || 100, banca: body.querySelector('#m-banca').value,
        giorno_addebito: m.giorno_addebito || 1, conto: m.conto || '', macro: m.macro || 'Casa',
      });
      chiudi(); toast('Salvato'); renderMutuo(root);
    });
  });
};

const _addEvento = (root) => {
  apriSheet('Estinzione parziale', `
    <label class="meta">Importo estinto (€)</label>
    <input type="number" step="0.01" id="e-imp" value="0" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
    <label class="meta">Data</label>
    <input type="date" id="e-data" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:15px;margin:8px 0 12px">
    <button class="btn btn-primary" id="e-ok">Registra</button>
  `, (body, chiudi) => {
    body.querySelector('#e-ok').addEventListener('click', async () => {
      const imp = parseFloat(body.querySelector('#e-imp').value) || 0;
      if (imp <= 0) { toast('Inserisci un importo'); return; }
      await saveEventoMutuo({ tipo: 'estinzione_parziale', importo: imp, data: body.querySelector('#e-data').value, riferimento: 'mutuo-principale' });
      chiudi(); toast('Registrato'); renderMutuo(root);
    });
  });
};
