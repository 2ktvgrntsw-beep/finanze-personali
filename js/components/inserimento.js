// inserimento.js — Nuova operazione (spesa/entrata/trasferimento) e modifica.
// Form compatto a icone con tastierino numerico, suggerimenti dalla descrizione,
// selettore categoria a griglia e ricorrenza inline.

import { state } from '../core/store.js';
import { fmtEUR, todayISO, fmtDataEstesa, escapeHtml, round2 } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { saveMovimento, deleteMovimento } from '../services/movimentiService.js';
import { saveRicorrente } from '../services/ricorrentiService.js';
import { suggerisciPerTesto, suggerisciTag } from '../services/suggerimentiService.js';
import { apriSelettoreCategoria, apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

// bozza dell'operazione in corso
let d = null;

const nuovaBozza = () => ({
  id: null, tipo: 'spesa', imp: 0, impStr: '0',
  macro: '', cat: '', sub: '', conto: '', contoDest: '',
  desc: '', tag: [], data: todayISO(),
  ripeti: null,   // {frequenza, giorno} se ricorrente
});

export const renderInserimento = async (root, params = {}) => {
  // modalità modifica?
  if (params.id) {
    const m = state.movimenti.find(x => x.id === params.id);
    d = m ? { ...nuovaBozza(), ...m, impStr: String(m.imp).replace('.', ','), id: m.id } : nuovaBozza();
  } else if (!d || !params.keep) {
    d = nuovaBozza();
    // conto di default: il primo conto liquidità
    const liq = state.conti.find(c => c.tipo === 'liquidita');
    if (liq) d.conto = liq.nome;
  }

  document.getElementById('view-title').textContent = params.id ? 'Modifica' : 'Nuova operazione';
  _render(root);
};

const _render = (root) => {
  const isTrasf = d.tipo === 'trasferimento';
  const catLabel = d.macro ? [d.macro, d.cat, d.sub].filter(Boolean).join(' › ') : 'Seleziona categoria';
  const impColor = d.tipo === 'entrata' ? 'var(--up)' : d.tipo === 'trasferimento' ? 'var(--transfer)' : 'var(--down)';

  const contoRow = isTrasf ? `
    <div class="form-row"><div class="ic">💳</div><div class="val" id="pick-conto">${d.conto ? escapeHtml(d.conto) : '<span class="ph">Da conto</span>'}</div></div>
    <div class="form-row"><div class="ic">➡️</div><div class="val" id="pick-conto-dest">${d.contoDest ? escapeHtml(d.contoDest) : '<span class="ph">A conto</span>'}</div></div>
  ` : `
    <div class="form-row"><div class="ic">💳</div><div class="val" id="pick-conto">${d.conto ? escapeHtml(d.conto) : '<span class="ph">Conto</span>'}</div></div>
    <div class="form-row"><div class="ic act">🏷️</div><div class="val" id="pick-cat">${d.macro ? escapeHtml(catLabel) : '<span class="ph">Seleziona categoria</span>'}</div>${d.macro ? '<div class="clear" id="clear-cat">✕</div>' : ''}</div>
  `;

  root.innerHTML = `
    <div class="type-switch">
      <button data-t="spesa" class="${d.tipo === 'spesa' ? 'on' : ''}">Spesa</button>
      <button data-t="entrata" class="${d.tipo === 'entrata' ? 'on en' : ''}">Entrata</button>
      <button data-t="trasferimento" class="${d.tipo === 'trasferimento' ? 'on tr' : ''}">Trasferimento</button>
    </div>

    <div class="form-rows">
      ${contoRow}
      <div class="form-row"><div class="ic">💬</div><input class="fld" id="fld-desc" placeholder="Descrizione" value="${escapeHtml(d.desc)}" autocomplete="off"></div>
      <div class="form-row"><div class="ic">🐷</div><div class="val amount num" id="pick-imp" style="color:${impColor}">${escapeHtml(d.impStr)} €</div></div>
      <div class="form-row"><div class="ic">📅</div><div class="val" id="pick-data">${fmtDataEstesa(d.data)}</div></div>
      <div class="form-row"><div class="ic">🔁</div><div class="val ${d.ripeti ? '' : 'ph'}" id="pick-ripeti">${d.ripeti ? _labelRipeti(d.ripeti) : 'Ripeti — rendi ricorrente'}</div>${d.ripeti ? '<div class="clear" id="clear-ripeti">✕</div>' : ''}</div>
      ${!isTrasf ? `<div class="form-row"><div class="ic">#️⃣</div><div class="val ${d.tag.length ? '' : 'ph'}" id="pick-tag">${d.tag.length ? d.tag.map(escapeHtml).join(', ') : 'Tag (opzionale)'}</div></div>` : ''}
    </div>

    <div id="suggerimenti"></div>

    <div style="margin-top:16px" class="btn-row">
      ${d.id ? '<button class="btn btn-danger" id="del-mov">Elimina</button>' : ''}
      <button class="btn btn-primary" id="salva">${d.id ? 'Salva modifiche' : 'Salva'}</button>
    </div>

    <div id="numpad-mount"></div>
  `;

  // --- descrizione + suggerimenti ---
  const fldDesc = root.querySelector('#fld-desc');
  fldDesc.addEventListener('input', () => { d.desc = fldDesc.value; _mostraSuggerimenti(root); });

  // --- tipo ---
  root.querySelectorAll('.type-switch button').forEach(b => b.addEventListener('click', () => {
    d.tipo = b.dataset.t;
    if (d.tipo === 'trasferimento') { d.macro = 'Investimenti'; d.cat = ''; d.sub = ''; }
    _render(root);
  }));

  // --- conto ---
  root.querySelector('#pick-conto').addEventListener('click', () => _pickConto(root, 'conto'));
  const pcd = root.querySelector('#pick-conto-dest');
  if (pcd) pcd.addEventListener('click', () => _pickConto(root, 'contoDest'));

  // --- categoria ---
  const pc = root.querySelector('#pick-cat');
  if (pc) pc.addEventListener('click', () => apriSelettoreCategoria(sel => { d.macro = sel.macro; d.cat = sel.cat; d.sub = sel.sub; _render(root); }));
  const cc = root.querySelector('#clear-cat');
  if (cc) cc.addEventListener('click', () => { d.macro = ''; d.cat = ''; d.sub = ''; _render(root); });

  // --- importo (tastierino) ---
  root.querySelector('#pick-imp').addEventListener('click', () => _apriTastierino(root));

  // --- data ---
  root.querySelector('#pick-data').addEventListener('click', () => _pickData(root));

  // --- ripeti ---
  root.querySelector('#pick-ripeti').addEventListener('click', () => _pickRipeti(root));
  const cr = root.querySelector('#clear-ripeti');
  if (cr) cr.addEventListener('click', () => { d.ripeti = null; _render(root); });

  // --- tag ---
  const pt = root.querySelector('#pick-tag');
  if (pt) pt.addEventListener('click', () => _pickTag(root));

  // --- salva / elimina ---
  root.querySelector('#salva').addEventListener('click', () => _salva());
  const dm = root.querySelector('#del-mov');
  if (dm) dm.addEventListener('click', async () => { if (confirm('Eliminare?')) { await deleteMovimento(d.id); toast('Eliminato'); navigate('movimenti'); } });
};

const _labelRipeti = (r) => ({ giornaliera: 'Ogni giorno', settimanale: 'Ogni settimana', mensile: 'Ogni mese', annuale: 'Ogni anno' }[r.frequenza] || 'Ricorrente');

const _mostraSuggerimenti = (root) => {
  const box = root.querySelector('#suggerimenti');
  const sugg = suggerisciPerTesto(d.desc, 4);
  if (!sugg.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="section-lbl" style="padding-bottom:6px"><span>Suggerimenti</span></div>` +
    sugg.map((s, i) => {
      const c = s.classificazione;
      const label = [c.macro, c.cat, c.sub].filter(Boolean).join(' › ');
      return `<div class="mov" data-sugg="${i}"><div class="ic">${iconaMacro(c.macro)}</div><div class="body"><div class="d1">${escapeHtml(s.desc)}</div><div class="d2">${escapeHtml(label)}${c.conto ? ' · ' + escapeHtml(c.conto) : ''}</div></div><div class="chev" style="color:var(--accent)">＋</div></div>`;
    }).join('');
  box.querySelectorAll('[data-sugg]').forEach(el => el.addEventListener('click', () => {
    const s = sugg[parseInt(el.dataset.sugg)];
    const c = s.classificazione;
    d.macro = c.macro; d.cat = c.cat; d.sub = c.sub; d.tipo = c.tipo || d.tipo;
    if (c.conto) d.conto = c.conto;
    if (!d.desc) d.desc = s.desc;
    _render(root);
  }));
};

const _pickConto = (root, campo) => {
  const conti = state.conti.filter(c => c.attivo !== false);
  apriSheet(campo === 'contoDest' ? 'A quale conto' : 'Da quale conto', '', (body, chiudi) => {
    body.innerHTML = conti.map(c => `<div class="mov" data-c="${escapeHtml(c.nome)}"><div class="ic">💳</div><div class="body"><div class="d1">${escapeHtml(c.nome)}</div><div class="d2">${c.tipo}</div></div></div>`).join('');
    body.querySelectorAll('[data-c]').forEach(el => el.addEventListener('click', () => { d[campo] = el.dataset.c; chiudi(); _render(root); }));
  });
};

const _pickData = (root) => {
  apriSheet('Data', `<input type="date" id="d-inp" value="${d.data}" style="width:100%;padding:14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px"><button class="btn btn-primary" id="d-ok" style="margin-top:16px">OK</button>`, (body, chiudi) => {
    body.querySelector('#d-ok').addEventListener('click', () => { d.data = body.querySelector('#d-inp').value || d.data; chiudi(); _render(root); });
  });
};

const _pickRipeti = (root) => {
  const opzioni = [['giornaliera', 'Ogni giorno'], ['settimanale', 'Ogni settimana'], ['mensile', 'Ogni mese'], ['annuale', 'Ogni anno']];
  apriSheet('Rendi ricorrente', opzioni.map(([v, l]) => `<div class="mov" data-r="${v}"><div class="ic">🔁</div><div class="body"><div class="d1">${l}</div></div></div>`).join(''), (body, chiudi) => {
    body.querySelectorAll('[data-r]').forEach(el => el.addEventListener('click', () => { d.ripeti = { frequenza: el.dataset.r }; chiudi(); _render(root); }));
  });
};

const _pickTag = (root) => {
  const render = (body, chiudi) => {
    const esistenti = suggerisciTag('', 20);
    body.innerHTML = `
      <input id="tag-inp" placeholder="Nuovo tag o cerca..." style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin-bottom:12px" autocomplete="off">
      <div class="chip-row" style="flex-wrap:wrap" id="tag-chips">
        ${esistenti.map(t => `<div class="chip ${d.tag.includes(t) ? 'on' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</div>`).join('')}
      </div>
      <button class="btn btn-primary" id="tag-ok" style="margin-top:16px">Fatto</button>`;
    const inp = body.querySelector('#tag-inp');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inp.value.trim()) { d.tag = Array.from(new Set([...d.tag, inp.value.trim()])); inp.value = ''; render(body, chiudi); }
    });
    body.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => {
      const t = el.dataset.tag;
      d.tag = d.tag.includes(t) ? d.tag.filter(x => x !== t) : [...d.tag, t];
      render(body, chiudi);
    }));
    body.querySelector('#tag-ok').addEventListener('click', () => { chiudi(); _render(root); });
  };
  apriSheet('Tag', '', render);
};

// --- Tastierino numerico ---
const _apriTastierino = (root) => {
  const mount = root.querySelector('#numpad-mount');
  const tasti = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '00'];
  mount.innerHTML = `<div class="numpad">
    ${tasti.map(t => `<button data-k="${t}">${t}</button>`).join('')
      .replace('<button data-k="9">9</button>', '<button data-k="9">9</button><button class="sub" data-k="C">C</button>')
      .replace('<button data-k="6">6</button>', '<button data-k="6">6</button><button class="sub" data-k="back">⌫</button>')
      .replace('<button data-k="3">3</button>', '<button data-k="3">3</button><button class="ok" data-k="ok" style="grid-row:span 2">OK</button>')}
  </div>`;

  const upd = () => {
    d.imp = round2(parseFloat(d.impStr.replace(',', '.')) || 0);
    const el = root.querySelector('#pick-imp');
    if (el) el.textContent = `${d.impStr} €`;
  };

  mount.querySelectorAll('.numpad button').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (k === 'C') d.impStr = '0';
    else if (k === 'back') d.impStr = d.impStr.length > 1 ? d.impStr.slice(0, -1) : '0';
    else if (k === 'ok') { mount.innerHTML = ''; upd(); return; }
    else if (k === ',') { if (!d.impStr.includes(',')) d.impStr += ','; }
    else { d.impStr = d.impStr === '0' ? k : d.impStr + k; }
    upd();
  }));
};

const _salva = async () => {
  if (d.imp <= 0) { toast('Inserisci un importo'); return; }
  if (d.tipo === 'trasferimento' && (!d.conto || !d.contoDest)) { toast('Scegli i conti'); return; }
  if (d.tipo !== 'trasferimento' && !d.macro) { toast('Scegli una categoria'); return; }

  const mov = await saveMovimento({
    id: d.id, tipo: d.tipo, imp: d.imp, data: d.data,
    macro: d.macro, cat: d.cat, sub: d.sub,
    conto: d.conto, contoDest: d.contoDest,
    desc: d.desc, tag: d.tag,
  });

  // se marcato come ricorrente, crea anche la ricorrenza
  if (d.ripeti && !d.id) {
    await saveRicorrente({
      nome: d.desc || d.macro, tipo: d.tipo, frequenza: d.ripeti.frequenza,
      imp: d.imp, macro: d.macro, cat: d.cat, sub: d.sub,
      conto: d.conto, contoDest: d.contoDest, tag: d.tag, desc: d.desc,
      prossima: d.data,
    });
    toast('Salvato e reso ricorrente');
  } else {
    toast(d.id ? 'Modifiche salvate' : 'Salvato');
  }

  d = null;
  navigate(d && d.tipo === 'trasferimento' ? 'movimenti' : 'spese');
};
