// inserimento.js — Nuova operazione e modifica.
// Righe compatte, data NATIVA iOS, tastierino che si chiude cambiando campo,
// trasferimento con descrizione, suggerimenti a tendina che completano desc+categoria.

import { state } from '../core/store.js';
import { fmtEUR, todayISO, fmtDataEstesa, escapeHtml, round2 } from '../core/utils.js';
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
  desc: '', tag: [], data: todayISO(), ripeti: null,
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

  // righe conto/categoria a seconda del tipo (il trasferimento MANTIENE la descrizione)
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
      <div class="frow"><div class="fic">📅</div><input type="date" class="ffld fdate" id="fld-data" value="${d.data}"></div>
      <div class="frow"><div class="fic">🔁</div><div class="fval ${d.ripeti ? '' : 'fph'}" id="pick-ripeti">${d.ripeti ? _labelRipeti(d.ripeti) : 'Ripeti'}</div>${d.ripeti ? '<div class="fclear" id="clear-ripeti">✕</div>' : ''}</div>
      <div class="frow"><div class="fic">#️⃣</div><div class="fval ${d.tag.length ? '' : 'fph'}" id="pick-tag">${d.tag.length ? d.tag.map(escapeHtml).join(', ') : 'Tag (opzionale)'}</div></div>
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

  // descrizione + tendina
  const fldDesc = root.querySelector('#fld-desc');
  fldDesc.addEventListener('input', () => { d.desc = fldDesc.value; _mostraTendina(root); });
  fldDesc.addEventListener('focus', () => { _chiudiTastierino(root); _mostraTendina(root); });

  // data nativa
  const fldData = root.querySelector('#fld-data');
  fldData.addEventListener('change', () => { d.data = fldData.value || d.data; });
  fldData.addEventListener('focus', () => _chiudiTastierino(root));

  // tipo
  root.querySelectorAll('.type-switch-bottom button').forEach(b => b.addEventListener('click', () => {
    d.tipo = b.dataset.t;
    if (d.tipo === 'trasferimento') { d.macro = 'Investimenti'; d.cat = ''; d.sub = ''; }
    _render(root);
  }));

  // conto
  root.querySelector('#pick-conto').addEventListener('click', () => { _chiudiTastierino(root); _pickConto(root, 'conto'); });
  const pcd = root.querySelector('#pick-conto-dest');
  if (pcd) pcd.addEventListener('click', () => { _chiudiTastierino(root); _pickConto(root, 'contoDest'); });

  // categoria
  const pc = root.querySelector('#pick-cat');
  if (pc) pc.addEventListener('click', () => { _chiudiTastierino(root); apriSelettoreCategoria(sel => { d.macro = sel.macro; d.cat = sel.cat; d.sub = sel.sub; _render(root); }); });
  const cc = root.querySelector('#clear-cat');
  if (cc) cc.addEventListener('click', () => { d.macro = ''; d.cat = ''; d.sub = ''; _render(root); });

  // importo (tastierino)
  root.querySelector('#pick-imp').addEventListener('click', () => { fldDesc.blur(); _apriTastierino(root); });

  // ripeti
  root.querySelector('#pick-ripeti').addEventListener('click', () => { _chiudiTastierino(root); _pickRipeti(root); });
  const cr = root.querySelector('#clear-ripeti');
  if (cr) cr.addEventListener('click', () => { d.ripeti = null; _render(root); });

  // tag
  root.querySelector('#pick-tag').addEventListener('click', () => { _chiudiTastierino(root); _pickTag(root); });

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
    const s = sugg[parseInt(el.dataset.sugg)]; const c = s.classificazione;
    d.desc = s.desc; d.macro = c.macro || d.macro; d.cat = c.cat || ''; d.sub = c.sub || '';
    d.tipo = c.tipo || d.tipo; if (c.conto) d.conto = c.conto;
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

const _pickRipeti = (root) => {
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
    const ftEl = body.querySelector('#r-fine-tipo'), extra = body.querySelector('#r-fine-extra');
    const rExtra = () => {
      if (ftEl.value === 'data') extra.innerHTML = `<label class="meta">Fino al</label><input type="date" id="r-fine-data" value="${cur.fineData || ''}" class="sheet-input">`;
      else if (ftEl.value === 'conteggio') extra.innerHTML = `<label class="meta">Numero di volte</label><input type="number" id="r-fine-conteggio" value="${cur.fineConteggio || 12}" min="1" class="sheet-input">`;
      else extra.innerHTML = '';
    };
    ftEl.addEventListener('change', rExtra); rExtra();
    body.querySelector('#r-ok').addEventListener('click', () => {
      const ft = ftEl.value;
      d.ripeti = {
        frequenza: body.querySelector('#r-freq').value, dataInizio: body.querySelector('#r-inizio').value, fineTipo: ft,
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
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) { d.tag = Array.from(new Set([...d.tag, inp.value.trim()])); inp.value = ''; render(body, chiudi); } });
    body.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => { const t = el.dataset.tag; d.tag = d.tag.includes(t) ? d.tag.filter(x => x !== t) : [...d.tag, t]; render(body, chiudi); }));
    body.querySelector('#tag-ok').addEventListener('click', () => { chiudi(); _render(root); });
  };
  apriSheet('Tag', '', render);
};

// Tastierino: si CHIUDE quando si tocca un altro campo (via _chiudiTastierino)
const _chiudiTastierino = (root) => { const m = root.querySelector('#numpad-mount'); if (m) m.innerHTML = ''; };

const _apriTastierino = (root) => {
  const mount = root.querySelector('#numpad-mount');
  const tasti = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '00'];
  mount.innerHTML = `<div class="numpad">
    ${tasti.map(t => `<button data-k="${t}">${t}</button>`).join('')
      .replace('<button data-k="9">9</button>', '<button data-k="9">9</button><button class="sub" data-k="C">C</button>')
      .replace('<button data-k="6">6</button>', '<button data-k="6">6</button><button class="sub" data-k="back">⌫</button>')
      .replace('<button data-k="3">3</button>', '<button data-k="3">3</button><button class="ok" data-k="ok" style="grid-row:span 2">OK</button>')}
  </div>`;
  const upd = () => { d.imp = round2(parseFloat(d.impStr.replace(',', '.')) || 0); const el = root.querySelector('#pick-imp'); if (el) el.textContent = `${d.impStr} €`; };
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
  const eraModifica = !!d.id;
  await saveMovimento({
    id: d.id, tipo: d.tipo, imp: d.imp, data: d.data,
    macro: d.macro, cat: d.cat, sub: d.sub, conto: d.conto, contoDest: d.contoDest,
    desc: d.desc, tag: d.tag,
  });

  // crea la ricorrenza se richiesta — ANCHE in modifica (bug precedente: solo su nuovo)
  if (d.ripeti) {
    // Il movimento appena salvato È la prima occorrenza della ricorrenza:
    // la ricorrenza deve partire dall'occorrenza SUCCESSIVA, altrimenti il
    // generatore ricreerebbe il movimento di oggi (doppione).
    // Se invece la data di inizio è futura (oltre il movimento), parte da lì.
    const copreMovimento = d.ripeti.dataInizio <= d.data;
    const prossima = copreMovimento ? _occorrenzaSuccessiva(d.ripeti.dataInizio, d.ripeti.frequenza) : d.ripeti.dataInizio;
    await saveRicorrente({
      nome: d.desc || d.macro, tipo: d.tipo, frequenza: d.ripeti.frequenza,
      imp: d.imp, macro: d.macro, cat: d.cat, sub: d.sub,
      conto: d.conto, contoDest: d.contoDest, tag: d.tag, desc: d.desc,
      dataInizio: d.ripeti.dataInizio, prossima,
      generati: copreMovimento ? 1 : 0,   // il movimento manuale conta come prima occorrenza
      fineTipo: d.ripeti.fineTipo, fineData: d.ripeti.fineData, fineConteggio: d.ripeti.fineConteggio,
    });
    toast('Salvato e reso ricorrente');
  } else {
    toast(eraModifica ? 'Modifiche salvate' : 'Salvato');
  }

  d = null;
  navigate(wasTrasf ? 'movimenti' : 'spese');
};

// Occorrenza successiva a una data, per frequenza (fine mese gestito: 31 gen -> 28 feb)
const _occorrenzaSuccessiva = (dataISO, frequenza) => {
  const [y, m, g] = dataISO.split('-').map(Number);
  if (frequenza === 'giornaliera' || frequenza === 'settimanale') {
    const d = new Date(y, m - 1, g + (frequenza === 'giornaliera' ? 1 : 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (frequenza === 'annuale') {
    const maxG = new Date(y + 1, m, 0).getDate();
    return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(g, maxG)).padStart(2, '0')}`;
  }
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const maxG = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(g, maxG)).padStart(2, '0')}`;
};
