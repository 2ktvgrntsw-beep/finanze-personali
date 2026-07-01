// movimenti.js — Lista movimenti raggruppati per giorno.
// Può ricevere filtri via params (macro, cat, sub, tipo, periodo, mese) quando si arriva
// dal drill-down o dall'icona di una categoria. Senza filtri mostra il mese corrente.

import { state, movimentiDelMese } from '../core/store.js';
import { fmtEUR, fmtDataEstesa, nomeMese, annomese, todayISO, escapeHtml, gruppoPer } from '../core/utils.js';
import { iconaMacro, iconaTipo } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { deleteMovimento, movimentiDiVoce } from '../services/movimentiService.js';
import { toast } from '../core/utils.js';

let _mese = annomese(todayISO());

export const renderMovimenti = async (root, params = {}) => {
  const { macro, cat, sub, tipo, periodo } = params;
  if (params.mese) _mese = params.mese;

  const haFiltri = macro || cat || sub || tipo;

  // seleziona il set di movimenti
  let movs;
  if (periodo === 'anno' && params.mese) movs = state.movimenti.filter(m => m.data.startsWith(params.mese.slice(0, 4)));
  else if (haFiltri) movs = state.movimenti;  // se filtro per categoria, cerco su tutto
  else movs = movimentiDelMese(_mese);

  if (macro) movs = movs.filter(m => m.macro === macro);
  if (cat) movs = movs.filter(m => m.cat === cat);
  if (sub) movs = movs.filter(m => m.sub === sub);
  if (tipo) movs = movs.filter(m => m.tipo === tipo);
  if (params.contoDest) movs = movs.filter(m => m.contoDest === params.contoDest);

  movs = movs.slice().sort((a, b) => b.data.localeCompare(a.data));

  // titolo
  let titolo = 'Movimenti';
  if (tipo === 'trasferimento') titolo = 'Investimenti e accantonamenti';
  else if (sub) titolo = sub;
  else if (cat) titolo = cat;
  else if (macro) titolo = macro;
  document.getElementById('view-title').textContent = titolo;

  // raggruppa per giorno
  const perGiorno = gruppoPer(movs, m => m.data);
  const giorni = Object.keys(perGiorno).sort((a, b) => b.localeCompare(a));

  const totaleFiltro = movs.filter(m => m.tipo === 'spesa').reduce((s, m) => s + m.imp, 0);

  const listaHTML = giorni.length ? giorni.map(g => {
    const items = perGiorno[g];
    const totGiorno = items.reduce((s, m) => s + (m.tipo === 'spesa' ? -m.imp : m.tipo === 'entrata' ? m.imp : 0), 0);
    const righe = items.map(m => {
      const segno = m.tipo === 'spesa' ? '−' : m.tipo === 'entrata' ? '+' : '⇄ ';
      const cls = m.tipo === 'spesa' ? 'sp' : m.tipo === 'entrata' ? 'en' : 'tr';
      const icona = m.macro ? iconaMacro(m.macro) : iconaTipo(m.tipo);
      const sotto = [m.macro, m.cat].filter(Boolean).join(' · ') || m.tipo;
      return `
        <div class="mov-wrap" data-id="${m.id}">
          <div class="del-bg">Elimina</div>
          <div class="mov" data-mov="${m.id}">
            <div class="ic">${icona}</div>
            <div class="body">
              <div class="d1">${escapeHtml(m.desc || sotto)}</div>
              <div class="d2">${escapeHtml(sotto)}${m.conto ? ' · ' + escapeHtml(m.conto) : ''}</div>
            </div>
            <div class="amt ${cls} num">${segno}${fmtEUR(m.imp)}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="day-head"><span>${fmtDataEstesa(g)}</span><b class="num">${totGiorno < 0 ? '−' : '+'}${fmtEUR(Math.abs(totGiorno))}</b></div>
      ${righe}`;
  }).join('') : '<div class="empty"><div class="big-ic">📭</div>Nessun movimento</div>';

  const [anno, mese] = _mese.split('-');
  root.innerHTML = `
    ${haFiltri ? `
      <div class="search-summary"><div class="n">${movs.length} movimenti · totale spese</div><div class="big num">${fmtEUR(totaleFiltro)}</div></div>
    ` : `
      <div class="month-nav">
        <button class="arr" id="prev">‹</button>
        <div class="m">${nomeMese(parseInt(mese) - 1)} ${anno}</div>
        <button class="arr" id="next">›</button>
      </div>
    `}
    ${!haFiltri ? '<div class="cap" style="text-align:center;font-size:11px;color:var(--txt-3);margin:6px 0">← scorri un movimento a sinistra per eliminarlo</div>' : ''}
    ${listaHTML}
  `;

  // navigazione mesi
  const prev = root.querySelector('#prev'), next = root.querySelector('#next');
  if (prev) prev.addEventListener('click', () => { const d = new Date(parseInt(anno), parseInt(mese) - 2, 1); _mese = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; renderMovimenti(root); });
  if (next) next.addEventListener('click', () => { const d = new Date(parseInt(anno), parseInt(mese), 1); _mese = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; renderMovimenti(root); });

  // tap su movimento -> dettaglio/modifica (sheet), swipe -> elimina
  _abilitaSwipe(root, () => renderMovimenti(root, params));
};

// Swipe-to-delete semplice (touch) + tap per eliminare su desktop tramite long-press fallback
const _abilitaSwipe = (root, refresh) => {
  root.querySelectorAll('.mov-wrap').forEach(wrap => {
    const mov = wrap.querySelector('.mov');
    let startX = 0, curX = 0, dragging = false;

    const onStart = (x) => { startX = x; dragging = true; mov.style.transition = 'none'; };
    const onMove = (x) => {
      if (!dragging) return;
      curX = Math.min(0, x - startX);
      mov.style.transform = `translateX(${curX}px)`;
    };
    const onEnd = async () => {
      if (!dragging) return;
      dragging = false;
      mov.style.transition = 'transform .2s ease';
      if (curX < -110) {
        mov.style.transform = 'translateX(-100%)';
        const id = wrap.dataset.id;
        setTimeout(async () => {
          if (confirm('Eliminare questo movimento?')) { await deleteMovimento(id); toast('Movimento eliminato'); refresh(); }
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

    // tap (senza swipe) -> apre modifica
    mov.addEventListener('click', () => {
      if (Math.abs(curX) > 5) return;
      navigate('modifica', { id: wrap.dataset.id });
    });
  });
};
