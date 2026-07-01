// finanziamenti.js — Elenco e gestione finanziamenti (con split quota utente).

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, fmtData, todayISO } from '../core/utils.js';
import { statoPrestito, saveFinanziamento, deleteFinanziamento } from '../services/prestitiService.js';
import { apriSheet, apriDataNativa, montaTastierino, apriSelettoreCategoria } from './shared.js';
import { toast } from '../core/utils.js';

export const renderFinanziamenti = async (root) => {
  document.getElementById('view-title').textContent = 'Finanziamenti';
  const fins = state.finanziamenti.filter(f => f.attivo !== false);

  let html = '';
  for (const f of fins) {
    const s = statoPrestito(f, []);
    if (!s) continue;
    html += `
      <div class="card" data-fin="${f.id}" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div><div style="font-size:16px;font-weight:700">${escapeHtml(f.nome)}</div><div class="meta">${f.quota_utente < 100 ? `tua quota ${f.quota_utente}%` : ''} ${s.ratePagate}/${s.rateTotali} rate</div></div>
          <div style="text-align:right"><div class="num" style="font-weight:800;color:var(--down)">−${fmtEUR(s.residuo * (f.quota_utente || 100) / 100)}</div><div class="meta num">rata ${fmtEUR(s.quotaUtente)}</div></div>
        </div>
        <div class="bar red"><span style="width:${s.pctCompletamento}%"></span></div>
      </div>`;
  }

  root.innerHTML = (html || '<div class="empty"><div class="big-ic">📄</div>Nessun finanziamento attivo</div>') +
    `<div style="margin-top:16px"><button class="btn btn-primary" id="nuovo">➕ Nuovo finanziamento</button></div>`;

  root.querySelectorAll('[data-fin]').forEach(el => el.addEventListener('click', () => _edit(root, el.dataset.fin)));
  root.querySelector('#nuovo').addEventListener('click', () => _edit(root, null));
};

const _edit = (root, id) => {
  const f = id ? state.finanziamenti.find(x => x.id === id) : { nome: '', importo_iniziale: 0, tasso: 0, durata_mesi: 0, rata: 0, data_inizio: todayISO(), quota_utente: 100, macro: 'Casa', cat: '', sub: '', conto: '' };
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);
  const tmp = { data_inizio: f.data_inizio, macro: f.macro || 'Casa', cat: f.cat || '', sub: f.sub || '' };
  const vals = { importo: String(f.importo_iniziale).replace('.', ','), tasso: String(f.tasso).replace('.', ','), rata: String(f.rata).replace('.', ','), durata: String(f.durata_mesi), quota: String(f.quota_utente) };
  const txtInput = (label, fid, val) => `<label class="meta">${label}</label><input type="text" inputmode="decimal" id="${fid}" value="${escapeHtml(val)}" class="sheet-input" readonly>`;

  apriSheet(id ? escapeHtml(f.nome) : 'Nuovo finanziamento', `
    <label class="meta">Nome</label><input id="f-nome" value="${escapeHtml(f.nome)}" class="sheet-input">
    ${txtInput('Importo iniziale (€)', 'f-imp', vals.importo)}<div id="fp-imp"></div>
    ${txtInput('Tasso annuo (%)', 'f-tasso', vals.tasso)}<div id="fp-tasso"></div>
    ${txtInput('Durata (mesi)', 'f-durata', vals.durata)}<div id="fp-durata"></div>
    ${txtInput('Rata (€)', 'f-rata', vals.rata)}<div id="fp-rata"></div>
    <label class="meta">Data inizio</label><button type="button" id="f-data-btn" class="sheet-input" style="text-align:left">${_fmtDFin(tmp.data_inizio)}</button>
    ${txtInput('Tua quota (%)', 'f-quota', vals.quota)}<div id="fp-quota"></div>
    <div class="divider" style="margin:14px 0"></div>
    <label class="meta">Conto da cui esce la rata</label>
    <select id="f-conto" class="sheet-input">${conti.map(c => `<option ${c === f.conto ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
    <label class="meta">Classificazione delle rate generate</label>
    <button type="button" id="f-cat-btn" class="sheet-input" style="text-align:left">${[tmp.macro, tmp.cat, tmp.sub].filter(Boolean).join(' › ') || 'Scegli'}</button>
    <p class="meta" style="font-size:11px;margin:4px 0 12px;opacity:.8">Le rate future compariranno tra le spese con questa classificazione, dalla prossima scadenza in avanti.</p>
    <div class="btn-row">
      ${id ? '<button class="btn btn-danger" id="f-del">Elimina</button>' : ''}
      <button class="btn btn-primary" id="f-ok">Salva</button>
    </div>
  `, (body, chiudi) => {
    const attach = (inputId, npId, key) => {
      const inp = body.querySelector('#' + inputId);
      inp.addEventListener('click', () => montaTastierino(body.querySelector('#' + npId), vals[key], (s) => { vals[key] = s; inp.value = s; }, () => {}));
    };
    attach('f-imp', 'fp-imp', 'importo'); attach('f-tasso', 'fp-tasso', 'tasso');
    attach('f-durata', 'fp-durata', 'durata'); attach('f-rata', 'fp-rata', 'rata'); attach('f-quota', 'fp-quota', 'quota');
    body.querySelector('#f-data-btn').addEventListener('click', () => apriDataNativa(tmp.data_inizio, (nd) => { tmp.data_inizio = nd; body.querySelector('#f-data-btn').textContent = _fmtDFin(nd); }));
    body.querySelector('#f-cat-btn').addEventListener('click', () => apriSelettoreCategoria(sel => { tmp.macro = sel.macro; tmp.cat = sel.cat; tmp.sub = sel.sub; body.querySelector('#f-cat-btn').textContent = [sel.macro, sel.cat, sel.sub].filter(Boolean).join(' › '); }));

    body.querySelector('#f-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#f-nome').value.trim();
      if (!nome) { toast('Inserisci un nome'); return; }
      await saveFinanziamento({
        id: f.id, nome, importo_iniziale: parseFloat(vals.importo.replace(',', '.')) || 0,
        tasso: parseFloat(vals.tasso.replace(',', '.')) || 0, durata_mesi: parseInt(vals.durata) || 0,
        rata: parseFloat(vals.rata.replace(',', '.')) || 0, data_inizio: tmp.data_inizio,
        quota_utente: parseFloat(vals.quota) || 100, conto: body.querySelector('#f-conto').value,
        macro: tmp.macro, cat: tmp.cat, sub: tmp.sub,
      });
      chiudi(); toast('Salvato'); renderFinanziamenti(root);
    });
    const del = body.querySelector('#f-del');
    if (del) del.addEventListener('click', async () => { if (confirm('Eliminare?')) { await deleteFinanziamento(f.id); chiudi(); toast('Eliminato'); renderFinanziamenti(root); } });
  });
};

const _fmtDFin = (iso) => { if (!iso) return ''; const [a, m, g] = iso.split('-'); return `${g}/${m}/${a}`; };
