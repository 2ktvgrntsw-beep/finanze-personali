// inserimento.js — Nuova operazione (spesa/entrata/trasferimento) e modifica.
// Compatto: righe basse, tipo Spesa/Entrata/Trasferimento in basso, data a ruota inline,
// suggerimenti a tendina che completano descrizione + classificazione.

import { state } from '../core/store.js';
import { fmtEUR, todayISO, fmtDataEstesa, escapeHtml, round2, nomeMese } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { saveMovimento, deleteMovimento } from '../services/movimentiService.js';
import { saveRicorrente } from '../services/ricorrentiService.js';
import { suggerisciPerTesto, suggerisciTag } from '../services/suggerimentiService.js';
import { apriSelettoreCategoria, apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

let d = null;

const nuovaBozza = () => ({
  id: null, tipo: 'spesa', imp: 0, impStr: '0',
  macro: '', cat: '', sub: '', conto: '', contoDest: '',
  desc: '', tag: [], data: todayISO(),
  ripeti: null,
});

export const renderInserimento = async (root, params = {}) => {
  if (params.id) {
    const m = state.movimenti.find(x => x.id === params.id);
    d = m ? { ...nuovaBozza(), ...m, impStr: String(m.imp).replace('.', ','), id: m.id } : nuovaBozza();
  } else {
    d = nuovaBozza();
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
    <div class="frow"><div class="fic">💳</div><div class="fval" id="pick-conto">${d.conto ? escapeHtml(d.conto) : '<span class="fph">Da conto</span>'}</div></div>
    <div class="frow"><div class="fic">➡️</div><div class="fval" id="pick-conto-dest">${d.contoDest ? escapeHtml(d.contoDest) : '<span class="fph">A conto</span>'}</div></div>
  ` : `
    <div class="frow"><div class="fic">💳</div><div class="fval" id="pick-conto">${d.conto ? escapeHtml(d.conto) : '<span class="fph">Conto</span>'}</div></div>
    <div class="frow"><div class="fic act">🏷️</div><div class="fval" id="pick-cat">${d.macro ? escapeHtml(catLabel) : '<span class="fph">Seleziona categoria</span>'}</div>${d.macro ? '<div class="fclear" id="clear-cat">✕</div>' : ''}</div>
  `;

  root.innerHTML = `
    <div class="ins-compact">
      ${contoRow}
      <div class="frow">
        <div class="fic">💬</div>
        <input class="ffld" id="fld-desc" placeholder="Descrizione" value="${escapeHtml(d.desc)}" autocomplete="off">
        <div class="sugg-dropdown" id="sugg-dd"></div>
      </div>
      <div class="frow"><div class="fic">💰</div><div class="fval famount" id="pick-imp" style="color:${impColor}">${escapeHtml(d.impStr)} €</div></div>
      <div class="frow" id="row-data"><div class="fic">📅</div><div class="fval" id="pick-data">${fmtDataEstesa(d.data)}</div></div>
      <div id="data-wheel"></div>
      <div class="frow"><div class="fic">🔁</div><div class="fval ${d.ripeti ? '' : 'fph'}" id="pick-ripeti">${d.ripeti ? _labelRipeti(d.ripeti) : 'Ripeti'}</div>${d.ripeti ? '<div class="fclear" id="clear-ripeti">✕</div>' : ''}</div>
      ${!isTrasf ? `<div class="frow"><div class="fic">#️⃣</div><div class="fval ${d.tag.length ? '' : 'fph'}" id="pick-tag">${d.tag.length ? d.tag.map(escapeHtml).join(', ') : 'Tag (opzionale)'}</div></div>` : ''}
    </div>

    <div class="type-switch-bottom">
      <button data-t="spesa" class="${d.tipo === 'spesa' ? 'on' : ''}">Spesa</button>
      <button data-t="entrata" class="${d.tipo === 'entrata' ? 'on en' : ''}">Entrata</button>
      <button data-t="trasferimento" class="${d.tipo === 'trasferimento' ? 'on tr' : ''}">Trasferimento</button>
    </div>

    <div class="ins-actions">
      ${d.id ? '<button class="btn btn-danger" id="del-mov">Elimina</button>' : ''}
      <button class="btn btn-primary" id="salva">${d.id ? 'Salva modifiche' : 'Salva'}</button>
    </div>

    <div id="numpad-mount"></div>
  `;

  // descrizione + tendina suggerimenti
  const fldDesc = root.querySelector('#fld-desc');
  fldDesc.addEventListener('input', () => { d.desc = fldDesc.value; _mostraTendina(root); });
  fldDesc.addEventListener('focus', () => _mostraTendina(root));

  // tipo
  root.querySelectorAll('.type-switch-bottom button').forEach(b => b.addEventListener('click', () => {
    d.tipo = b.dataset.t;
    if (d.tipo === 'trasferimento') { d.macro = 'Investimenti'; d.cat = ''; d.sub = ''; }
    _render(root);
  }));

  // conto
  root.querySelector('#pick-conto').addEventListener('click', () => _pickConto(root, 'conto'));
  const pcd = root.querySelector('#pick-conto-dest');
  if (pcd) pcd.addEventListener('click', () => _pickConto(root, 'contoDest'));

  // categoria
  const pc = root.querySelector('#pick-cat');
  if (pc) pc.addEventListener('click', () => apriSelettoreCategoria(sel => { d.macro = sel.macro; d.cat = sel.cat; d.sub = sel.sub; _render(root); }));
  const cc = root.querySelector('#clear-cat');
  if (cc) cc.addEventListener('click', () => { d.macro = ''; d.cat = ''; d.sub = ''; _render(root); });

  // importo
  root.querySelector('#pick-imp').addEventListener('click', () => _apriTastierino(root));

  // data (ruota inline)
  root.querySelector('#pick-data').addEventListener('click', () => _toggleDataWheel(root));

  // ripeti
  root.querySelector('#pick-ripeti').addEventListener('click', () => _pickRipeti(root));
  const cr = root.querySelector('#clear-ripeti');
  if (cr) cr.addEventListener('click', () => { d.ripeti = null; _render(root); });

  // tag
  const pt = root.querySelector('#pick-tag');
  if (pt) pt.addEventListener('click', () => _pickTag(root));

  // salva / elimina
  root.querySelector('#salva').addEventListener('click', () => _salva());
  const dm = root.querySelector('#del-mov');
  if (dm) dm.addEventListener('click', async () => { if (confirm('Eliminare?')) { await deleteMovimento(d.id); toast('Eliminato'); navigate('movimenti'); } });
};

const _labelRipeti = (r) => {
  const base = { giornaliera: 'Ogni giorno', settimanale: 'Ogni settimana', mensile: 'Ogni mese', annuale: 'Ogni anno' }[r.frequenza] || 'Ricorrente';
  let fine = '';
  if (r.fineTipo === 'data' && r.fineData) fine = ` · fino al ${r.fineData.split('-').reverse().join('/')}`;
  else if (r.fineTipo === 'conteggio' && r.fineConteggio) fine = ` · ${r.fineConteggio} volte`;
  return base + fine;
};

// Tendina suggerimenti: completa DESCRIZIONE + classificazione (conto/categoria)
const _mostraTendina = (root) => {
  const dd = root.querySelector('#sugg-dd');
  if (!dd) return;
  const sugg = suggerisciPerTesto(d.desc, 5);
  if (!sugg.length || d.desc.trim().length < 2) { dd.innerHTML = ''; dd.style.display = 'none'; return; }
  dd.style.display = 'block';
  dd.innerHTML = sugg.map((s, i) => {
    const c = s.classificazione;
    const label = [c.macro, c.cat].filter(Boolean).join(':') || c.tipo;
    return `<div class="sugg-item" data-sugg="${i}"><b>${escapeHtml(s.desc)}</b><span>${escapeHtml(label)}</span></div>`;
  }).join('');
  dd.querySelectorAll('[data-sugg]').forEach(el => el.addEventListener('click', () => {
    const s = sugg[parseInt(el.dataset.sugg)];
    const c = s.classificazione;
    // completa la descrizione col testo del suggerimento
    d.desc = s.desc;
    d.macro = c.macro || d.macro; d.cat = c.cat || ''; d.sub = c.sub || '';
    d.tipo = c.tipo || d.tipo;
    if (c.conto) d.conto = c.conto;
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

// Ruota data inline (giorno / mese / anno) che si espande sotto la riga
const _toggleDataWheel = (root) => {
  const mount = root.querySelector('#data-wheel');
  if (mount.innerHTML) { mount.innerHTML = ''; return; }

  const [ay, am, ad] = d.data.split('-').map(Number);
  const oggi = new Date();
  const anni = [];
  for (let y = oggi.getFullYear() - 10; y <= oggi.getFullYear() + 1; y++) anni.push(y);
  const mesi = Array.from({ length: 12 }, (_, i) => i + 1);
  const giorni = Array.from({ length: 31 }, (_, i) => i + 1);

  const col = (items, sel, id, fmt) => `
    <div class="wheel-col" id="${id}">
      ${items.map(v => `<div class="wheel-opt ${v === sel ? 'sel' : ''}" data-v="${v}">${fmt ? fmt(v) : v}</div>`).join('')}
    </div>`;

  mount.innerHTML = `
    <div class="date-wheel">
      ${col(giorni, ad, 'wg')}
      ${col(mesi, am, 'wm', v => nomeMese(v - 1))}
      ${col(anni, ay, 'wy')}
    </div>`;

  const sel = { g: ad, m: am, y: ay };
  const applica = () => {
    // valida giorno max del mese
    const maxG = new Date(sel.y, sel.m, 0).getDate();
    if (sel.g > maxG) sel.g = maxG;
    d.data = `${sel.y}-${String(sel.m).padStart(2, '0')}-${String(sel.g).padStart(2, '0')}`;
    const pd = root.querySelector('#pick-data');
    if (pd) pd.textContent = fmtDataEstesa(d.data);
  };

  const bind = (colId, key) => {
    mount.querySelectorAll(`#${colId} .wheel-opt`).forEach(o => o.addEventListener('click', () => {
      sel[key] = parseInt(o.dataset.v);
      mount.querySelectorAll(`#${colId} .wheel-opt`).forEach(x => x.classList.remove('sel'));
      o.classList.add('sel');
      o.scrollIntoView({ block: 'center', behavior: 'smooth' });
      applica();
    }));
    // centra l'opzione selezionata all'apertura
    const selEl = mount.querySelector(`#${colId} .wheel-opt.sel`);
    if (selEl) selEl.scrollIntoView({ block: 'center' });
  };
  bind('wg', 'g'); bind('wm', 'm'); bind('wy', 'y');
};

// Ricorrenza: frequenza + inizio + fine (data o conteggio), entrambe disponibili
const _pickRipeti = (root) => {
  const oggi = todayISO();
  const cur = d.ripeti || { frequenza: 'mensile', dataInizio: d.data, fineTipo: 'mai' };
  apriSheet('Rendi ricorrente', `
    <label class="meta">Frequenza</label>
    <select id="r-freq" class="sheet-input">
      <option value="giornaliera" ${cur.frequenza === 'giornaliera' ? 'selected' : ''}>Ogni giorno</option>
      <option value="settimanale" ${cur.frequenza === 'settimanale' ? 'selected' : ''}>Ogni settimana</option>
      <option value="mensile" ${cur.frequenza === 'mensile' ? 'selected' : ''}>Ogni mese</option>
      <option value="annuale" ${cur.frequenza === 'annuale' ? 'selected' : ''}>Ogni anno</option>
    </select>
    <label class="meta">Inizia il</label>
    <input type="date" id="r-inizio" value="${cur.dataInizio || d.data}" class="sheet-input">
    <label class="meta">Termina</label>
    <select id="r-fine-tipo" class="sheet-input">
      <option value="mai" ${cur.fineTipo === 'mai' ? 'selected' : ''}>Mai</option>
      <option value="data" ${cur.fineTipo === 'data' ? 'selected' : ''}>A una data</option>
      <option value="conteggio" ${cur.fineTipo === 'conteggio' ? 'selected' : ''}>Dopo N volte</option>
    </select>
    <div id="r-fine-extra"></div>
    <button class="btn btn-primary" id="r-ok" style="margin-top:8px">Conferma</button>
  `, (body, chiudi) => {
    const fineTipo = body.querySelector('#r-fine-tipo');
    const extra = body.querySelector('#r-fine-extra');
    const renderExtra = () => {
      if (fineTipo.value === 'data') extra.innerHTML = `<label class="meta">Fino al</label><input type="date" id="r-fine-data" value="${cur.fineData || ''}" class="sheet-input">`;
      else if (fineTipo.value === 'conteggio') extra.innerHTML = `<label class="meta">Numero di volte</label><input type="number" id="r-fine-conteggio" value="${cur.fineConteggio || 12}" min="1" class="sheet-input">`;
      else extra.innerHTML = '';
    };
    fineTipo.addEventListener('change', renderExtra); renderExtra();

    body.querySelector('#r-ok').addEventListener('click', () => {
      const ft = fineTipo.value;
      d.ripeti = {
        frequenza: body.querySelector('#r-freq').value,
        dataInizio: body.querySelector('#r-inizio').value,
        fineTipo: ft,
        fineData: ft === 'data' ? (body.querySelector('#r-fine-data')?.value || null) : null,
        fineConteggio: ft === 'conteggio' ? (parseInt(body.querySelector('#r-fine-conteggio')?.value) || null) : null,
      };
      chiudi(); _render(root);
    });
  });
};

const _pickTag = (root) => {
  const render = (body, chiudi) => {
    const esistenti = suggerisciTag('', 20);
    body.innerHTML = `
      <input id="tag-inp" placeholder="Nuovo tag o cerca..." class="sheet-input" autocomplete="off">
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

  const wasTrasf = d.tipo === 'trasferimento';
  await saveMovimento({
    id: d.id, tipo: d.tipo, imp: d.imp, data: d.data,
    macro: d.macro, cat: d.cat, sub: d.sub,
    conto: d.conto, contoDest: d.contoDest,
    desc: d.desc, tag: d.tag,
  });

  if (d.ripeti && !d.id) {
    await saveRicorrente({
      nome: d.desc || d.macro, tipo: d.tipo, frequenza: d.ripeti.frequenza,
      imp: d.imp, macro: d.macro, cat: d.cat, sub: d.sub,
      conto: d.conto, contoDest: d.contoDest, tag: d.tag, desc: d.desc,
      dataInizio: d.ripeti.dataInizio, prossima: d.ripeti.dataInizio,
      fineTipo: d.ripeti.fineTipo, fineData: d.ripeti.fineData, fineConteggio: d.ripeti.fineConteggio,
    });
    toast('Salvato e reso ricorrente');
  } else {
    toast(d.id ? 'Modifiche salvate' : 'Salvato');
  }

  d = null;
  navigate(wasTrasf ? 'movimenti' : 'spese');
};
