// inserimento.js — Nuova operazione e modifica.
// Righe compatte, data NATIVA iOS, tastierino che si chiude cambiando campo,
// trasferimento con descrizione, suggerimenti a tendina che completano desc+categoria.

import { state } from '../core/store.js';
import { fmtEUR, todayISO, fmtDataEstesa, escapeHtml, round2 } from '../core/utils.js';
import { iconaMacro, UI_SVG } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { safeWrite } from '../core/db.js';
import { saveMovimento, deleteMovimento } from '../services/movimentiService.js';
import { saveRicorrente } from '../services/ricorrentiService.js';
import { suggerisciPerTesto, suggerisciTag } from '../services/suggerimentiService.js';
import { apriSelettoreCategoria, apriSheet, conferma } from './shared.js';
import { strumentoById, risolviStrumento, creaStrumento, allineaStrumenti } from '../services/strumentiService.js';
import { _normDesc } from '../core/seed.js';
import { toast } from '../core/utils.js';

let d = null;

const nuovaBozza = () => ({
  id: null, tipo: 'spesa', imp: 0, impStr: '0',
  macro: '', cat: '', sub: '', conto: '', contoDest: '', strumentoId: null,
  desc: '', tag: [], data: todayISO(), ripeti: null,
});

// conto di destinazione di tipo investimenti? (allora serve lo strumento)
const _contoInv = (nome) => state.conti.find(c => c.nome === nome && c.tipo === 'investimenti') || null;
// strumento proposto: quello risolto dalla classificazione, altrimenti l'ultimo usato nel conto
const _strumentoProposto = () => {
  const c = _contoInv(d.contoDest);
  if (!c) return null;
  const r = risolviStrumento({ tipo: 'trasferimento', contoDest: d.contoDest, cat: d.cat, sub: d.sub, strumentoId: d.strumentoId });
  if (r) return r.id;
  const ultimo = state.movimenti.filter(m => m.tipo === 'trasferimento' && m.contoDest === c.nome && m.strumentoId)
    .sort((a, b) => b.data.localeCompare(a.data))[0];
  return ultimo ? ultimo.strumentoId : null;
};

export const renderInserimento = async (root, params = {}) => {
  if (params.ric) {
    // MODIFICA RICORRENZA nella stessa UI dell'inserimento (coerenza visiva):
    // precompila tutto dalla ricorrenza; al salvataggio aggiorna la ricorrenza
    // (nessun nuovo movimento viene creato).
    const r = state.ricorrenti.find(x => x.id === params.ric);
    if (r) {
      d = {
        ...nuovaBozza(),
        ricEdit: r.id,
        tipo: r.tipo || 'spesa', imp: r.imp, impStr: String(r.imp).replace('.', ','),
        macro: r.macro || '', cat: r.cat || '', sub: r.sub || '',
        conto: r.conto || '', contoDest: r.contoDest || '', strumentoId: r.strumentoId || null,
        desc: r.desc || r.nome || '', tag: Array.isArray(r.tag) ? r.tag : [],
        data: r.prossima || todayISO(),
        ripeti: {
          frequenza: r.frequenza, dataInizio: r.dataInizio || r.prossima,
          fineTipo: r.fineTipo || 'mai', fineData: r.fineData || null, fineConteggio: r.fineConteggio || null,
        },
      };
    } else d = nuovaBozza();
  } else if (params.id) {
    const m = state.movimenti.find(x => x.id === params.id);
    d = m ? { ...nuovaBozza(), ...m, impStr: String(m.imp).replace('.', ','), id: m.id } : nuovaBozza();
  } else {
    d = nuovaBozza();
    const liq = state.conti.find(c => c.tipo === 'liquidita');
    if (liq) d.conto = liq.nome;
  }
  const _title = document.getElementById('view-title');
  const _isModifica = d.ricEdit || params.id;
  _title.textContent = d.ricEdit ? 'Modifica ricorrenza' : params.id ? 'Modifica' : 'Nuova operazione';
  // in modifica: titolo visibile e centrato (non si sovrappone ad Annulla)
  if (_isModifica) { _title.style.display = 'block'; _title.classList.add('center'); }
  else { _title.classList.remove('center'); }
  _render(root);
};

const _render = (root) => {
  const isTrasf = d.tipo === 'trasferimento';
  const catLabel = d.macro ? [d.macro, d.cat, d.sub].filter(Boolean).join(' › ') : 'Seleziona categoria';
  const impColor = d.tipo === 'entrata' ? 'var(--up)' : d.tipo === 'trasferimento' ? 'var(--transfer)' : 'var(--down)';

  // righe conto/categoria a seconda del tipo (il trasferimento MANTIENE la descrizione)
  const contoRow = isTrasf ? `
    <div class="frow"><div class="fic">${UI_SVG.conto}</div><div class="fval" id="pick-conto">${d.conto ? escapeHtml(d.conto) : '<span class="fph">Da conto</span>'}</div></div>
    <div class="frow"><div class="fic">➡️</div><div class="fval" id="pick-conto-dest">${d.contoDest ? escapeHtml(d.contoDest) : '<span class="fph">A conto</span>'}</div></div>
    ${_contoInv(d.contoDest) ? `<div class="frow"><div class="fic">${UI_SVG.investimento}</div><div class="fval" id="pick-strumento">${strumentoById(d.strumentoId) ? escapeHtml(strumentoById(d.strumentoId).nome) : '<span class="fph">Strumento</span>'}</div></div>` : ''}
  ` : `
    <div class="frow"><div class="fic">${UI_SVG.conto}</div><div class="fval" id="pick-conto">${d.conto ? escapeHtml(d.conto) : '<span class="fph">Conto</span>'}</div></div>
    <div class="frow"><div class="fic act">${UI_SVG.tag}</div><div class="fval" id="pick-cat">${d.macro ? escapeHtml(catLabel) : '<span class="fph">Seleziona categoria</span>'}</div>${d.macro ? '<div class="fclear" id="clear-cat">✕</div>' : ''}</div>
  `;

  root.innerHTML = `
    <div class="ins-compact">
      ${contoRow}
      <div class="frow">
        <div class="fic">${UI_SVG.descrizione}</div>
        <input class="ffld" id="fld-desc" placeholder="Descrizione" value="${escapeHtml(d.desc)}" autocomplete="off">
        <div class="sugg-dropdown" id="sugg-dd"></div>
      </div>
      <div class="frow"><div class="fic">${UI_SVG.importo}</div><div class="fval famount" id="pick-imp" style="color:${impColor}">${escapeHtml(d.impStr)} €</div></div>
      <div class="frow"><div class="fic">📅</div><input type="date" class="ffld fdate" id="fld-data" value="${d.data}"></div>
      <div class="frow"><div class="fic">${UI_SVG.ripeti}</div><div class="fval ${d.ripeti ? '' : 'fph'}" id="pick-ripeti">${d.ripeti ? _labelRipeti(d.ripeti) : 'Ripeti'}</div>${d.ripeti ? '<div class="fclear" id="clear-ripeti">✕</div>' : ''}</div>
      <div class="frow"><div class="fic">${UI_SVG.hashtag}</div><div class="fval ${d.tag.length ? '' : 'fph'}" id="pick-tag">${d.tag.length ? d.tag.map(escapeHtml).join(', ') : 'Tag (opzionale)'}</div></div>
    </div>

    <div class="type-switch-bottom">
      <button data-t="spesa" class="${d.tipo === 'spesa' ? 'on' : ''}">Spesa</button>
      <button data-t="entrata" class="${d.tipo === 'entrata' ? 'on en' : ''}">Entrata</button>
      <button data-t="trasferimento" class="${d.tipo === 'trasferimento' ? 'on tr' : ''}">Trasferimento</button>
    </div>

    <div class="ins-actions">
      ${d.id ? '<button class="btn btn-danger" id="del-mov">Elimina</button>' : ''}${d.ricEdit ? '<button class="btn btn-danger" id="del-ric">Elimina ricorrenza</button>' : ''}
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
  const pst = root.querySelector('#pick-strumento');
  if (pst) pst.addEventListener('click', () => { _chiudiTastierino(root); _pickStrumento(root); });

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
  const dr = root.querySelector('#del-ric');
  if (dr) dr.addEventListener('click', async () => {
    if (await conferma('Eliminare la ricorrenza? I movimenti già generati restano.', { danger: true, ok: 'Elimina' })) {
      const { deleteRicorrente } = await import('../services/ricorrentiService.js');
      await deleteRicorrente(d.ricEdit); toast('Eliminata'); d = null; navigate('ricorrenti');
    }
  });
  const dm = root.querySelector('#del-mov');
  if (dm) dm.addEventListener('click', async () => { if (!(await conferma('Eliminare questo movimento?', { danger: true, ok: 'Elimina' }))) return; const ok = await safeWrite(() => deleteMovimento(d.id), 'Movimento non eliminato'); if (!ok) return; toast('Eliminato'); navigate('movimenti'); });
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
  const formRows = dd.closest('.form-rows');
  const sugg = suggerisciPerTesto(d.desc, 12);
  if (!sugg.length || d.desc.trim().length < 2) { dd.innerHTML = ''; dd.style.display = 'none'; if (formRows) formRows.classList.remove('sugg-open'); return; }
  dd.style.display = 'block';
  if (formRows) formRows.classList.add('sugg-open');
  dd.innerHTML = sugg.map((s, i) => {
    const c = s.classificazione;
    const label = [c.macro, c.cat].filter(Boolean).join(':') || c.tipo;
    return `<div class="sugg-item" data-sugg="${i}"><b>${escapeHtml(s.desc)}</b><span>${escapeHtml(label)}</span></div>`;
  }).join('');
  dd.querySelectorAll('[data-sugg]').forEach(el => el.addEventListener('click', () => {
    const s = sugg[parseInt(el.dataset.sugg)]; const c = s.classificazione;
    d.desc = s.desc; d.macro = c.macro || d.macro; d.cat = c.cat || ''; d.sub = c.sub || '';
    d.tipo = c.tipo || d.tipo; if (c.conto) d.conto = c.conto;
    if (d.tipo === 'trasferimento') {
      // la destinazione non è nel suggerimento: la prendo dall'ultimo movimento uguale
      const k = _normDesc(s.desc);
      const ultimo = state.movimenti.filter(m => m.tipo === 'trasferimento' && m.contoDest && _normDesc(m.desc) === k)
        .sort((a, b) => b.data.localeCompare(a.data))[0];
      if (ultimo) { d.contoDest = ultimo.contoDest; d.strumentoId = ultimo.strumentoId || null; }
      d.strumentoId = _strumentoProposto();
    }
    _render(root);
  }));
};

const _pickConto = (root, campo) => {
  const conti = state.conti.filter(c => c.attivo !== false);
  apriSheet(campo === 'contoDest' ? 'A quale conto' : 'Da quale conto', '', (body, chiudi) => {
    body.innerHTML = conti.map(c => `<div class="mov" data-c="${escapeHtml(c.nome)}"><div class="ic">${UI_SVG.conto}</div><div class="body"><div class="d1">${escapeHtml(c.nome)}</div><div class="d2">${c.tipo}</div></div></div>`).join('');
    body.querySelectorAll('[data-c]').forEach(el => el.addEventListener('click', () => {
      d[campo] = el.dataset.c;
      if (campo === 'contoDest') { d.strumentoId = null; d.strumentoId = _strumentoProposto(); }
      chiudi(); _render(root);
    }));
  });
};

// Strumento del conto investimento di destinazione (+ creazione al volo)
const _pickStrumento = (root) => {
  const c = _contoInv(d.contoDest);
  if (!c) return;
  const lista = state.strumenti.filter(s => s.contoId === c.id && !s.chiuso);
  apriSheet(`Strumento · ${c.nome}`, `
    ${lista.map(s => `<div class="mov" data-s="${s.id}"><div class="ic">${UI_SVG.investimento}</div><div class="body"><div class="d1">${escapeHtml(s.nome)}</div></div></div>`).join('')}
    <label class="meta" style="margin-top:12px">Oppure un nuovo strumento</label>
    <input id="ns-nome" placeholder="Es. PAC ETF World" class="sheet-input" autocomplete="off">
    <button class="btn btn-secondary" id="ns-ok">Crea e usa</button>
  `, (body, chiudi) => {
    body.querySelectorAll('[data-s]').forEach(el => el.addEventListener('click', () => { d.strumentoId = el.dataset.s; chiudi(); _render(root); }));
    body.querySelector('#ns-ok').addEventListener('click', async () => {
      try { const s = await creaStrumento({ nome: body.querySelector('#ns-nome').value, contoId: c.id }); d.strumentoId = s.id; }
      catch (e) { toast(e.message); return; }
      chiudi(); _render(root);
    });
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
      <input id="tag-inp" placeholder="Uno o più tag, separati da virgola..." class="sheet-input" autocomplete="off">
      <div class="chip-row" style="flex-wrap:wrap" id="tag-chips">
        ${esistenti.map(t => `<div class="chip ${d.tag.includes(t) ? 'on' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</div>`).join('')}
      </div>
      <button class="btn btn-primary" id="tag-ok" style="margin-top:16px">Fatto</button>`;
    const inp = body.querySelector('#tag-inp');
    // più tag in un colpo: separali con la VIRGOLA ("mare, famiglia, vacanza26")
    const aggiungi = (testo) => {
      const nuovi = testo.split(',').map(t => t.trim()).filter(Boolean);
      if (nuovi.length) d.tag = Array.from(new Set([...d.tag, ...nuovi]));
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) { aggiungi(inp.value); inp.value = ''; render(body, chiudi); } });
    // filtro live dei suggerimenti mentre scrivi
    inp.addEventListener('input', () => {
      const filtrati = suggerisciTag(inp.value, 20);
      body.querySelector('#tag-chips').innerHTML = filtrati.map(t => `<div class="chip ${d.tag.includes(t) ? 'on' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</div>`).join('');
      body.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => { const t = el.dataset.tag; d.tag = d.tag.includes(t) ? d.tag.filter(x => x !== t) : [...d.tag, t]; render(body, chiudi); }));
    });
    body.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => { const t = el.dataset.tag; d.tag = d.tag.includes(t) ? d.tag.filter(x => x !== t) : [...d.tag, t]; render(body, chiudi); }));
    // "Fatto" raccoglie ANCHE il tag ancora scritto nell'input (senza Invio):
    // prima si perdeva in silenzio — era il "tag non tenuto" segnalato.
    body.querySelector('#tag-ok').addEventListener('click', () => {
      if (inp.value.trim()) aggiungi(inp.value);
      chiudi(); _render(root);
    });
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
  if (d.tipo === 'trasferimento' && d.conto === d.contoDest) { toast('I due conti devono essere diversi'); return; }
  if (d.tipo === 'trasferimento' && _contoInv(d.contoDest) && !strumentoById(d.strumentoId)) { toast('Scegli lo strumento'); return; }
  const strumentoId = d.tipo === 'trasferimento' && _contoInv(d.contoDest) ? d.strumentoId : null;
  if (d.tipo !== 'trasferimento' && !d.macro) { toast('Scegli una categoria'); return; }

  // ── MODIFICA RICORRENZA: aggiorna solo la ricorrenza, nessun movimento nuovo ──
  if (d.ricEdit) {
    const r = state.ricorrenti.find(x => x.id === d.ricEdit);
    if (r) {
      await saveRicorrente({
        ...r,
        nome: d.desc || r.nome, tipo: d.tipo, imp: d.imp,
        macro: d.macro, cat: d.cat, sub: d.sub,
        conto: d.conto, contoDest: d.contoDest, strumentoId, tag: d.tag, desc: d.desc,
        frequenza: d.ripeti ? d.ripeti.frequenza : r.frequenza,
        fineTipo: d.ripeti ? d.ripeti.fineTipo : r.fineTipo,
        fineData: d.ripeti ? d.ripeti.fineData : r.fineData,
        fineConteggio: d.ripeti ? d.ripeti.fineConteggio : r.fineConteggio,
      });
    }
    toast('Ricorrenza aggiornata');
    d = null;
    if (history.length > 1) history.back(); else navigate('ricorrenti');
    return;
  }

  const wasTrasf = d.tipo === 'trasferimento';
  const eraModifica = !!d.id;
  const ok = await safeWrite(() => saveMovimento({
    id: d.id, tipo: d.tipo, imp: d.imp, data: d.data,
    macro: d.macro, cat: d.cat, sub: d.sub, conto: d.conto, contoDest: d.contoDest, strumentoId,
    desc: d.desc, tag: d.tag,
  }), eraModifica ? 'Modifiche non salvate' : 'Movimento non salvato');
  // se la scrittura è fallita, NON navigo: l'utente vede il toast e può riprovare
  // senza perdere ciò che ha inserito.
  if (!ok) return;

  // un prelievo da conto investimento inserito a mano: va tenuto allineato al versato
  if (wasTrasf) { try { await allineaStrumenti(); } catch (e) { console.warn(e); } }

  // crea la ricorrenza se richiesta — ANCHE in modifica (bug precedente: solo su nuovo)
  if (d.ripeti) {
    // Il movimento appena salvato È la prima occorrenza della ricorrenza:
    // la ricorrenza deve partire dall'occorrenza SUCCESSIVA, altrimenti il
    // generatore ricreerebbe il movimento di oggi (doppione).
    // Se invece la data di inizio è futura (oltre il movimento), parte da lì.
    const copreMovimento = d.ripeti.dataInizio <= d.data;
    const prossima = copreMovimento ? _occorrenzaSuccessiva(d.ripeti.dataInizio, d.ripeti.frequenza) : d.ripeti.dataInizio;
    const okRic = await safeWrite(() => saveRicorrente({
      nome: d.desc || d.macro, tipo: d.tipo, frequenza: d.ripeti.frequenza,
      imp: d.imp, macro: d.macro, cat: d.cat, sub: d.sub,
      conto: d.conto, contoDest: d.contoDest, strumentoId, tag: d.tag, desc: d.desc,
      dataInizio: d.ripeti.dataInizio, prossima,
      generati: copreMovimento ? 1 : 0,   // il movimento manuale conta come prima occorrenza
      fineTipo: d.ripeti.fineTipo, fineData: d.ripeti.fineData, fineConteggio: d.ripeti.fineConteggio,
    }), 'Ricorrenza non impostata');
    toast(okRic ? 'Salvato e reso ricorrente' : 'Movimento salvato, ma ricorrenza non impostata');
  } else {
    toast(eraModifica ? 'Modifiche salvate' : 'Salvato');
  }

  d = null;
  // se era una MODIFICA, torna da dove sei venuto (es. la ricerca coi risultati);
  // se era un nuovo inserimento, vai alla pagina naturale.
  if (eraModifica && history.length > 1) history.back();
  else navigate(wasTrasf ? 'movimenti' : 'spese');
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
