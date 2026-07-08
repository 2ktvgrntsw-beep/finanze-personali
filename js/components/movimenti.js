// movimenti.js — Lista movimenti raggruppati per giorno.
// Può ricevere filtri via params (macro, cat, sub, tipo, periodo, mese) quando si arriva
// dal drill-down o dall'icona di una categoria. Senza filtri mostra il mese corrente.

import { state, movimentiDelMese } from '../core/store.js';
import { fmtEUR, fmtDataEstesa, nomeMese, annomese, todayISO, escapeHtml, gruppoPer } from '../core/utils.js';
import { iconaMacro, iconaTipo } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { deleteMovimento, movimentiDiVoce } from '../services/movimentiService.js';
import { safeWrite } from '../core/db.js';
import { conferma } from './shared.js';
import { toast } from '../core/utils.js';
import { creaSelezione } from './selezioneMultipla.js';

let _mese = annomese(todayISO());
let _periodo = 'mese';   // 'settimana' | 'mese' | 'anno'
let _sel = null;         // controller selezione multipla (creato al primo render)

export const renderMovimenti = async (root, params = {}) => {
  const { macro, cat, sub, tipo } = params;
  if (params.mese) _mese = params.mese;
  if (params.periodo) _periodo = params.periodo;

  // La selezione multipla non deve sopravvivere all'uscita dalla pagina: se questo
  // render NON è un refresh interno (innescato dalla selezione stessa), la azzero.
  if (!params._interno && _sel) _sel.esciSilenzioso();

  const haFiltri = macro || cat || sub || tipo || params.contoDest;

  // set di movimenti SEMPRE limitato al periodo selezionato (mai tutto lo storico)
  const [anno, mese] = _mese.split('-');
  let movs;
  if (_periodo === 'anno') {
    movs = state.movimenti.filter(m => m.data.startsWith(anno));
  } else if (_periodo === 'settimana') {
    const oggi = new Date(); const s = new Date(); s.setDate(oggi.getDate() - 6);
    const da = s.toISOString().slice(0, 10), a = oggi.toISOString().slice(0, 10);
    movs = state.movimenti.filter(m => m.data >= da && m.data <= a);
  } else {
    movs = movimentiDelMese(_mese);
  }

  // applica i filtri di categoria/tipo DENTRO il periodo
  if (macro) movs = movs.filter(m => m.macro === macro);
  if (cat) movs = movs.filter(m => m.cat === cat);
  if (sub) movs = movs.filter(m => m.sub === sub);
  if (tipo) movs = movs.filter(m => m.tipo === tipo);
  if (params.contoDest) movs = movs.filter(m => m.contoDest === params.contoDest);

  movs = movs.slice().sort((a, b) => b.data.localeCompare(a.data));

  // titolo (mostra la categoria/filtro se presente)
  let titolo = 'Movimenti';
  if (tipo === 'trasferimento') titolo = 'Investimenti e accantonamenti';
  else if (tipo === 'entrata') titolo = 'Entrate';
  else if (tipo === 'spesa') titolo = 'Spese';
  else if (sub) titolo = sub;
  else if (cat) titolo = cat;
  else if (macro) titolo = macro;
  document.getElementById('view-title').textContent = titolo;

  // raggruppa per giorno
  const perGiorno = gruppoPer(movs, m => m.data);
  const giorni = Object.keys(perGiorno).sort((a, b) => b.localeCompare(a));

  // ── CARD AGGREGATE (solo con filtro attivo): totale, vs media, vs precedente ──
  // Il tipo da sommare: quello del filtro se esplicito, altrimenti il prevalente
  // nei movimenti filtrati (così "Entrate" somma entrate, non spese).
  let tipoSomma = tipo;
  if (!tipoSomma) {
    const conta = {};
    for (const m of movs) conta[m.tipo] = (conta[m.tipo] || 0) + 1;
    tipoSomma = Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || 'spesa';
  }
  const clsTot = tipoSomma === 'entrata' ? 'en' : tipoSomma === 'trasferimento' ? 'tr' : 'sp';
  const lblTot = tipoSomma === 'entrata' ? 'Entrate' : tipoSomma === 'trasferimento' ? 'Investito' : 'Spese';
  const matchFiltro = (m) => m.tipo === tipoSomma
    && (!macro || m.macro === macro) && (!cat || m.cat === cat) && (!sub || m.sub === sub)
    && (!params.contoDest || m.contoDest === params.contoDest);
  const totaleFiltro = movs.filter(m => m.tipo === tipoSomma).reduce((s, m) => s + m.imp, 0);

  let cardsHTML = '';
  if (haFiltri) {
    // totali per periodo (mese o anno) su tutto lo storico del filtro
    const perPeriodo = {};
    for (const m of state.movimenti) {
      if (!matchFiltro(m)) continue;
      const k = _periodo === 'anno' ? m.data.slice(0, 4) : (m.annomese || m.data.slice(0, 7));
      perPeriodo[k] = (perPeriodo[k] || 0) + m.imp;
    }
    const chiaveCorrente = _periodo === 'anno' ? anno : _mese;
    const altre = Object.keys(perPeriodo).filter(k => k !== chiaveCorrente);
    const media = altre.length ? altre.reduce((s, k) => s + perPeriodo[k], 0) / altre.length : 0;
    // periodo precedente diretto
    let chiavePrec;
    if (_periodo === 'anno') chiavePrec = String(parseInt(anno) - 1);
    else { const d = new Date(parseInt(anno), parseInt(mese) - 2, 1); chiavePrec = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    const valPrec = perPeriodo[chiavePrec] || 0;

    // per le entrate la crescita è positiva (verde); per spese è negativa (rosso)
    const inverti = tipoSomma === 'entrata';
    const deltaCell = (rif, lbl) => {
      if (_periodo === 'settimana' || rif <= 0) return `<div class="cell"><div class="lbl">${lbl}</div><div class="val sa num">—</div></div>`;
      const pct = Math.round((totaleFiltro - rif) / rif * 100);
      const diff = totaleFiltro - rif;
      const buono = inverti ? pct >= 0 : pct <= 0;
      return `<div class="cell"><div class="lbl">${lbl}</div><div class="val num ${buono ? 'en' : 'sp'}">${pct > 0 ? '+' : ''}${pct}%</div><div class="delta num" style="color:var(--txt-2)">${diff > 0 ? '+' : '−'}${fmtEUR(Math.abs(diff))}</div></div>`;
    };
    cardsHTML = `
      <div class="triple" style="margin:8px 0 4px">
        <div class="cell"><div class="lbl">${lblTot}</div><div class="val ${clsTot} num">${fmtEUR(totaleFiltro)}</div></div>
        ${deltaCell(media, 'vs media')}
        ${deltaCell(valPrec, _periodo === 'anno' ? 'vs anno prec.' : 'vs mese prec.')}
      </div>`;
  }

  const listaHTML = giorni.length ? giorni.map(g => {
    const items = perGiorno[g];
    const totGiorno = items.reduce((s, m) => s + (m.tipo === 'spesa' ? -m.imp : m.tipo === 'entrata' ? m.imp : 0), 0);
    const righe = items.map(m => {
      const segno = m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ ';
      const cls = m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr';
      const icona = m.macro ? iconaMacro(m.macro) : iconaTipo(m.tipo);
      // classificazione COMPLETA fino alla sottocategoria (per modifiche massive a colpo d'occhio)
      const classif = [m.macro, m.cat, m.sub].filter(Boolean).join(' › ') || m.tipo;
      const selMode = _sel && _sel.attiva();
      const isSel = selMode && _sel.ha(m.id);
      return `
        <div class="mov-wrap" data-id="${m.id}">
          <div class="del-bg">Elimina</div>
          <div class="mov tipo-${m.tipo} ${selMode ? 'selectable' : ''} ${isSel ? 'sel' : ''}" data-mov="${m.id}">
            ${selMode ? `<div class="selbox">${isSel ? '✓' : ''}</div>` : ''}
            <div class="ic">${icona}</div>
            <div class="body">
              <div class="d1">${escapeHtml(m.desc || classif)}</div>
              <div class="d2"><span class="cls">${escapeHtml(classif)}</span>${m.conto ? ' <span class="cnt">· ' + escapeHtml(m.conto) + '</span>' : ''}</div>
            </div>
            <div class="amt ${cls} num">${segno}${fmtEUR(m.imp)}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="day-head"><span>${fmtDataEstesa(g)}</span><b class="num">${totGiorno < 0 ? '−' : '+'}${fmtEUR(Math.abs(totGiorno))}</b></div>
      ${righe}`;
  }).join('') : '<div class="empty"><div class="big-ic">📭</div>Nessun movimento in questo periodo</div>';

  const labelPeriodo = _periodo === 'anno' ? anno
    : _periodo === 'settimana' ? 'Ultimi 7 giorni'
    : `${nomeMese(parseInt(mese) - 1)} ${anno}`;

  // controller selezione multipla (creato una volta; onChange RI-AGGANCIATA a ogni
  // render perché refreshLista cattura root e params correnti)
  const refreshLista = () => renderMovimenti(root, { ...params, mese: _mese, periodo: _periodo, _interno: true });
  if (!_sel) _sel = creaSelezione(refreshLista);
  else _sel.setOnChange(refreshLista);

  const btnSeleziona = (movs.length && !_sel.attiva())
    ? `<button class="sel-mini" id="attiva-sel" aria-label="Seleziona operazioni"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 12l2.2 2.2L15.5 9.5"/></svg></button>`
    : '';
  const toolbarHTML = _sel.attiva() ? _sel.toolbarHTML() : '';

  root.innerHTML = `
    <div class="mov-sticky">
      ${_periodo !== 'settimana' ? `
        <div class="month-nav withsel" style="margin:6px 0">
          <button class="arr" id="prev">‹</button>
          <div class="m">${labelPeriodo}</div>
          <button class="arr" id="next">›</button>
          ${btnSeleziona}
        </div>` : `<div class="month-nav withsel" style="margin:6px 0"><div class="m">${labelPeriodo}</div>${btnSeleziona}</div>`}
      ${haFiltri ? `<div class="filtro-badge">Filtro: <b>${escapeHtml(titolo)}</b> · ${movs.length} mov <span id="clear-filtro">✕</span></div>` : ''}
      ${toolbarHTML}
      ${cardsHTML}
    </div>
    ${listaHTML}
  `;

  // IMPORTANTE: i listener passano SEMPRE params aggiornati (mese/periodo nuovi),
  // altrimenti il re-render rileggerebbe quelli vecchi e la navigazione resterebbe bloccata.
  const vaiA = (nuovi) => renderMovimenti(root, { ...params, ...nuovi });

  // selettore periodo NELL'HEADER (compatto)
  const headSeg = document.getElementById('head-seg');
  if (headSeg) {
    headSeg.innerHTML = `<div class="seg">
      <button data-p="settimana" class="${_periodo === 'settimana' ? 'on' : ''}">Sett.</button>
      <button data-p="mese" class="${_periodo === 'mese' ? 'on' : ''}">Mese</button>
      <button data-p="anno" class="${_periodo === 'anno' ? 'on' : ''}">Anno</button>
    </div>`;
    headSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => vaiA({ periodo: b.dataset.p, mese: _mese })));
  }

  // navigazione periodo (mese o anno)
  const vaiPrec = () => {
    let nuovoMese;
    if (_periodo === 'anno') nuovoMese = `${parseInt(anno) - 1}-${mese}`;
    else { const d = new Date(parseInt(anno), parseInt(mese) - 2, 1); nuovoMese = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    vaiA({ mese: nuovoMese, periodo: _periodo });
  };
  const vaiSucc = () => {
    let nuovoMese;
    if (_periodo === 'anno') nuovoMese = `${parseInt(anno) + 1}-${mese}`;
    else { const d = new Date(parseInt(anno), parseInt(mese), 1); nuovoMese = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    vaiA({ mese: nuovoMese, periodo: _periodo });
  };
  const prev = root.querySelector('#prev'), next = root.querySelector('#next');
  if (prev) prev.addEventListener('click', vaiPrec);
  if (next) next.addEventListener('click', vaiSucc);

  // rimuovi filtro (torna a tutti i movimenti del periodo)
  const cf = root.querySelector('#clear-filtro');
  if (cf) cf.addEventListener('click', () => renderMovimenti(root, { periodo: _periodo, mese: _mese }));

  // swipe-to-delete + tap per modifica + long-press per selezione multipla
  _abilitaInterazioni(root, refreshLista);
  const attivaSelBtn = root.querySelector('#attiva-sel');
  if (attivaSelBtn) attivaSelBtn.addEventListener('click', () => _sel.avvia());
  if (_sel.attiva()) {
    const idsVisibili = movs.map(m => m.id);
    _sel.bindToolbar(root, idsVisibili);
  }
};

// Gestione interazioni su ogni riga: swipe (elimina), tap (modifica o toggle selezione),
// long-press (avvia la selezione multipla). Il long-press di ~500ms entra in modalità
// selezione; da lì un tap seleziona/deseleziona invece di aprire la modifica.
const _abilitaInterazioni = (root, refresh) => {
  root.querySelectorAll('.mov-wrap').forEach(wrap => {
    const mov = wrap.querySelector('.mov');
    const id = wrap.dataset.id;
    let startX = 0, curX = 0, dragging = false, longTimer = null, longFired = false;

    const clearLong = () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } };

    const onStart = (x) => {
      startX = x; dragging = true; longFired = false;
      mov.style.transition = 'none';
      // avvio timer long-press SOLO se non sono già in selezione (in selezione il tap basta)
      if (!_sel.attiva()) {
        longTimer = setTimeout(() => {
          longFired = true;
          if (navigator.vibrate) navigator.vibrate(15);   // feedback aptico
          _sel.avvia(id);   // entra in modalità selezione con questa riga
        }, 500);
      }
    };
    const onMove = (x) => {
      if (!dragging) return;
      if (Math.abs(x - startX) > 8) clearLong();   // si sta muovendo: non è un long-press
      if (_sel.attiva()) return;                   // in selezione niente swipe
      curX = Math.min(0, x - startX);
      mov.style.transform = `translateX(${curX}px)`;
    };
    const onEnd = async () => {
      clearLong();
      if (!dragging) return;
      dragging = false;
      if (longFired) { curX = 0; return; }   // il long-press ha già agito
      mov.style.transition = 'transform .2s ease';
      if (!_sel.attiva() && curX < -110) {
        mov.style.transform = 'translateX(-100%)';
        setTimeout(async () => {
          if (await conferma('Eliminare questo movimento?', { danger: true, ok: 'Elimina' })) { const ok = await safeWrite(() => deleteMovimento(id), 'Movimento non eliminato'); if (ok) { toast('Movimento eliminato'); refresh(); } }
          else { mov.style.transform = 'translateX(0)'; }
        }, 150);
      } else {
        mov.style.transform = 'translateX(0)';
      }
      curX = 0;
    };

    mov.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
    mov.addEventListener('touchmove', e => onMove(e.touches[0].clientX), { passive: true });
    mov.addEventListener('touchend', onEnd);
    // desktop: long-press col mouse
    mov.addEventListener('mousedown', e => onStart(e.clientX));
    mov.addEventListener('mouseup', onEnd);
    mov.addEventListener('mouseleave', () => { clearLong(); });

    // tap: in selezione -> toggle; altrimenti -> modifica
    mov.addEventListener('click', () => {
      if (longFired) return;              // il long-press non è un click
      if (Math.abs(curX) > 5) return;     // era uno swipe
      if (_sel.attiva()) { _sel.toggle(id); return; }
      navigate('modifica', { id });
    });
  });
};
