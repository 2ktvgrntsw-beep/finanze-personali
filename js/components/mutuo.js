// mutuo.js — Scheda mutuo: stato, piano di ammortamento, eventi.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, fmtData } from '../core/utils.js';
import { statoPrestito, saveMutuo, saveEventoMutuo, eventiMutuo, deleteEventoMutuo } from '../services/prestitiService.js';
import { apriSheet, apriDataNativa, montaTastierino, apriSelettoreCategoria } from './shared.js';
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

    <div class="section-lbl"><span>Eventi</span><span style="color:var(--accent);font-size:11px;cursor:pointer" id="add-ev">+ Estinzione parziale</span></div>
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
  const m = state.mutuo || { nome: 'Mutuo', importo_iniziale: 0, tasso: 0, durata_mesi: 0, rata: 0, data_inizio: '2020-01-01', quota_utente: 100, banca: '', giorno_addebito: 1, sub: 'Rata Mutuo', macro: 'Casa', conto: '' };
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);
  const tmp = { data_inizio: m.data_inizio, macro: m.macro || 'Casa', cat: m.cat || '', sub: m.sub || 'Rata Mutuo' };
  const vals = { importo: String(m.importo_iniziale).replace('.', ','), tasso: String(m.tasso).replace('.', ','), rata: String(m.rata).replace('.', ','), durata: String(m.durata_mesi), quota: String(m.quota_utente) };
  const txtInput = (label, id, val) => `<label class="meta">${label}</label><input type="text" inputmode="decimal" id="${id}" value="${escapeHtml(val)}" class="sheet-input">`;

  apriSheet('Modifica mutuo', `
    <label class="meta">Nome</label><input id="m-nome" value="${escapeHtml(m.nome)}" class="sheet-input">
    ${txtInput('Importo iniziale (€)', 'm-imp', vals.importo)}
    ${txtInput('Tasso annuo (%)', 'm-tasso', vals.tasso)}
    ${txtInput('Durata (mesi)', 'm-durata', vals.durata)}
    ${txtInput('Rata (€)', 'm-rata', vals.rata)}
    <label class="meta">Data inizio</label><button type="button" id="m-data-btn" class="sheet-input" style="text-align:left;cursor:pointer">${_fmtDMutuo(tmp.data_inizio)}</button>
    ${txtInput('Tua quota (%)', 'm-quota', vals.quota)}
    <label class="meta">Banca</label><input id="m-banca" value="${escapeHtml(m.banca || '')}" class="sheet-input">
    <div class="divider" style="margin:14px 0"></div>
    <label class="meta">Conto da cui esce la rata</label>
    <select id="m-conto" class="sheet-input">${conti.map(c => `<option ${c === m.conto ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
    <label class="meta">Classificazione delle rate generate</label>
    <button type="button" id="m-cat-btn" class="sheet-input" style="text-align:left;cursor:pointer">${[tmp.macro, tmp.cat, tmp.sub].filter(Boolean).join(' › ') || 'Scegli'}</button>
    <label class="meta">Descrizione delle rate generate</label>
    <input id="m-descmov" value="${escapeHtml(m.descMovimento || '')}" placeholder="Vuota = come le rate storiche (solo classificazione)" class="sheet-input">
    <p class="meta" style="font-size:11px;margin:4px 0 12px;opacity:.8">Le rate future compariranno tra le spese con questa classificazione e descrizione, dalla prossima scadenza in avanti (le rate passate restano quelle già nello storico). Per cambiare anche le passate usa la modifica massiva dal Cerca.</p>
    <button class="btn btn-primary" id="m-ok" style="margin-top:8px">Salva</button>
  `, (body, chiudi) => {
    body.querySelector('#m-data-btn').addEventListener('click', () => apriDataNativa(tmp.data_inizio, (nd) => { tmp.data_inizio = nd; body.querySelector('#m-data-btn').textContent = _fmtDMutuo(nd); }));
    body.querySelector('#m-cat-btn').addEventListener('click', () => apriSelettoreCategoria(sel => { tmp.macro = sel.macro; tmp.cat = sel.cat; tmp.sub = sel.sub; body.querySelector('#m-cat-btn').textContent = [sel.macro, sel.cat, sel.sub].filter(Boolean).join(' › '); }));

    body.querySelector('#m-ok').addEventListener('click', async () => {
      const num = (fid) => parseFloat(String(body.querySelector('#' + fid).value).replace(',', '.')) || 0;
      await saveMutuo({
        nome: body.querySelector('#m-nome').value, importo_iniziale: num('m-imp'),
        tasso: num('m-tasso'), durata_mesi: parseInt(body.querySelector('#m-durata').value) || 0,
        rata: num('m-rata'), data_inizio: tmp.data_inizio,
        quota_utente: num('m-quota') || 100, banca: body.querySelector('#m-banca').value,
        giorno_addebito: m.giorno_addebito || 1, conto: body.querySelector('#m-conto').value,
        macro: tmp.macro, cat: tmp.cat, sub: tmp.sub, descMovimento: body.querySelector('#m-descmov').value.trim(),
      });
      chiudi(); toast('Salvato'); renderMutuo(root);
    });
  });
};

const _fmtDMutuo = (iso) => { if (!iso) return ''; const [a, mm, g] = iso.split('-'); return `${g}/${mm}/${a}`; };

const _addEvento = (root) => {
  const tmp = { data: new Date().toISOString().slice(0, 10) };
  apriSheet('Estinzione parziale', `
    <label class="meta">Importo estinto (€)</label>
    <input type="text" inputmode="decimal" id="e-imp" value="" placeholder="0,00" class="sheet-input">
    <label class="meta">Data</label>
    <button type="button" id="e-data-btn" class="sheet-input" style="text-align:left;cursor:pointer">${_fmtDMutuo(tmp.data)}</button>
    <button class="btn btn-primary" id="e-ok" style="margin-top:8px">Registra</button>
  `, (body, chiudi) => {
    body.querySelector('#e-data-btn').addEventListener('click', () => apriDataNativa(tmp.data, (nd) => { tmp.data = nd; body.querySelector('#e-data-btn').textContent = _fmtDMutuo(nd); }));
    body.querySelector('#e-ok').addEventListener('click', async () => {
      const imp = parseFloat(String(body.querySelector('#e-imp').value).replace(',', '.')) || 0;
      if (imp <= 0) { toast('Inserisci un importo'); return; }
      await saveEventoMutuo({ tipo: 'estinzione_parziale', importo: imp, data: tmp.data, riferimento: 'mutuo-principale' });
      chiudi(); toast('Registrato'); renderMutuo(root);
    });
  });
};
