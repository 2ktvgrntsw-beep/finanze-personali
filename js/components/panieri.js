// panieri.js — Panieri di voci: sommatorie mirate multi-voce e andamento pluriennale.
// La LISTA vive in fondo alla pagina Analisi (sezioneHTML + bind); il DETTAGLIO è
// una pagina dedicata (rotta 'paniere') col grafico a barre impilate anno per anno,
// riusando il componente dell'Energia. La selezione voci parte dalle MACRO con
// possibilità di scendere in categorie e sottocategorie.

import { state, refreshAll } from '../core/store.js';
import { fmtEUR, escapeHtml, toast, uid } from '../core/utils.js';
import { navigate, currentRoute } from '../core/router.js';
import { apriSheet, conferma } from './shared.js';
import { safeWrite, dbAdd, dbDelete } from '../core/db.js';
import { categorieDi, sottocategorieDi, listaMacro } from '../services/categorieService.js';
import { sommaPaniere, seriePaniereAnnuale, segmentiPaniere, etichettaVoce } from '../services/panieriService.js';
import { _barreImpilate } from './energia.js';

// ── sezione nella pagina Analisi ──
export const panieriSezioneHTML = () => {
  const anno = new Date().getFullYear();
  const righe = state.panieri.map(p => {
    const { tot } = sommaPaniere(p.voci, anno);
    return `<div class="paniere-riga" data-paniere="${escapeHtml(p.id)}">
      <div class="paniere-nome">${escapeHtml(p.nome)}<span class="paniere-voci">${p.voci.length} voci</span></div>
      <div class="paniere-tot"><span class="lbl2">${anno}</span><b class="num">${fmtEUR(tot)}</b></div>
      <div class="eboll-chev">›</div>
    </div>`;
  }).join('');
  return `
    <div class="section-lbl"><span>Panieri (somme mirate)</span><span class="act" id="nuovo-paniere">+ Nuovo</span></div>
    <div class="card" style="padding:${state.panieri.length ? '2px 14px' : '14px'}">
      ${state.panieri.length ? righe : '<div class="empty" style="padding:8px 0">Raggruppa più voci (es. carburante + assicurazione + bollo) e segui il totale negli anni.</div>'}
    </div>`;
};

export const bindPanieri = (root) => {
  const nuovo = root.querySelector('#nuovo-paniere');
  if (nuovo) nuovo.addEventListener('click', () => _sheetPaniere(null, () => navigate('analisi')));
  root.querySelectorAll('[data-paniere]').forEach(el =>
    el.addEventListener('click', () => navigate('paniere', { id: el.dataset.paniere })));
};

// ── pagina dettaglio ──
export const renderPaniere = async (root) => {
  const params = currentRoute().params || {};
  const p = state.panieri.find(x => x.id === params.id);
  if (!p) { navigate('analisi'); return; }
  document.getElementById('view-title').textContent = p.nome;

  const serie = seriePaniereAnnuale(p.voci);
  const segmenti = segmentiPaniere(p.voci);
  const anno = new Date().getFullYear();
  const attuale = serie.find(s => s.anno === String(anno));

  // riepilogo per anno con delta sull'anno precedente
  const righeAnni = serie.slice().reverse().map((s, i, arr) => {
    const prec = arr[i + 1];
    const delta = prec && prec.tot > 0 ? Math.round((s.tot - prec.tot) / prec.tot * 100) : null;
    return `<div class="paniere-anno-riga">
      <span class="num anno">${s.anno}</span>
      <b class="num">${fmtEUR(s.tot)}</b>
      ${delta != null ? `<span class="delta ${delta <= 0 ? 'ok' : 'ko'} num">${delta > 0 ? '+' : ''}${delta}%</span>` : '<span class="delta">—</span>'}
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="card" style="margin-top:4px">
      <div class="lbl2" style="margin-bottom:4px">Totale ${anno}</div>
      <div class="num" style="font-size:26px;font-weight:750">${fmtEUR(attuale ? attuale.tot : 0)}</div>
      <div class="meta" style="margin-top:6px">${p.voci.map(v => escapeHtml(etichettaVoce(v))).join(' · ')}</div>
    </div>

    <div class="section-lbl"><span>Andamento negli anni</span></div>
    <div class="card">
      <div class="elegend">${segmenti.map(s => `<span><i style="background:${s.colore}"></i>${escapeHtml(s.nome)}</span>`).join('')}</div>
      <div class="estack" id="g-paniere"></div>
    </div>

    <div class="section-lbl"><span>Totali per anno</span></div>
    <div class="card" style="padding:4px 14px">${righeAnni || '<div class="empty">Nessuna spesa trovata</div>'}</div>

    <div class="btn-row" style="margin-top:16px">
      <button class="btn btn-danger" id="pan-del">Elimina</button>
      <button class="btn btn-secondary" id="pan-mod">Modifica</button>
    </div>
  `;

  _barreImpilate(root.querySelector('#g-paniere'),
    serie.map(s => ({ label: s.label, valori: s.valori, tot: s.tot })),
    segmenti, v => fmtEUR(v), v => Math.round(v));

  root.querySelector('#pan-mod').addEventListener('click', () => _sheetPaniere(p, () => renderPaniere(root)));
  root.querySelector('#pan-del').addEventListener('click', async () => {
    if (!(await conferma(`Eliminare il paniere "${p.nome}"? I movimenti non vengono toccati.`, { danger: true, ok: 'Elimina' }))) return;
    const ok = await safeWrite(async () => { await dbDelete('panieri', p.id); await refreshAll(); }, 'Paniere non eliminato');
    if (!ok) return;
    toast('Paniere eliminato'); navigate('analisi');
  });
};

// ── sheet creazione/modifica: albero macro -> categorie -> sottocategorie ──
const _sheetPaniere = (esistente, onDone) => {
  // selezione corrente come Set di chiavi 'macro|cat|sub'
  const chiave = (v) => [v.macro, v.cat || '', v.sub || ''].join('|');
  const sel = new Set((esistente ? esistente.voci : []).map(chiave));
  const daChiave = (k) => { const [macro, cat, sub] = k.split('|'); return { macro, ...(cat && { cat }), ...(sub && { sub }) }; };

  const macros = listaMacro().filter(m => m !== 'Entrate');

  const vociHTML = () => macros.map(m => {
    const kM = chiave({ macro: m });
    const cats = categorieDi(m);
    return `<div class="pv-blocco">
      <div class="pv-riga liv-0">
        <span class="pv-check ${sel.has(kM) ? 'on' : ''}" data-sel="${escapeHtml(kM)}"></span>
        <span class="pv-nome" data-sel="${escapeHtml(kM)}">${escapeHtml(m)}</span>
        ${cats.length ? `<span class="pv-exp" data-exp="${escapeHtml(m)}">▾</span>` : ''}
      </div>
      <div class="pv-figli" data-figli="${escapeHtml(m)}" style="display:none">
        ${cats.map(c => {
          const kC = chiave({ macro: m, cat: c });
          const subs = sottocategorieDi(m, c);
          return `<div class="pv-riga liv-1">
            <span class="pv-check ${sel.has(kC) ? 'on' : ''}" data-sel="${escapeHtml(kC)}"></span>
            <span class="pv-nome" data-sel="${escapeHtml(kC)}">${escapeHtml(c)}</span>
            ${subs.length ? `<span class="pv-exp" data-exp="${escapeHtml(m + '|' + c)}">▾</span>` : ''}
          </div>
          <div class="pv-figli" data-figli="${escapeHtml(m + '|' + c)}" style="display:none">
            ${subs.map(su => {
              const kS = chiave({ macro: m, cat: c, sub: su });
              return `<div class="pv-riga liv-2">
                <span class="pv-check ${sel.has(kS) ? 'on' : ''}" data-sel="${escapeHtml(kS)}"></span>
                <span class="pv-nome" data-sel="${escapeHtml(kS)}">${escapeHtml(su)}</span>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  apriSheet(esistente ? 'Modifica paniere' : 'Nuovo paniere', `
    <label class="meta">Nome</label>
    <input id="pan-nome" class="sheet-input" placeholder="Es. Auto, Casa, Vacanze…" value="${esistente ? escapeHtml(esistente.nome) : ''}">
    <label class="meta" style="margin-top:12px;display:block">Voci del paniere <span style="color:var(--txt-3)">(tocca ▾ per scendere)</span></label>
    <div class="pv-albero">${vociHTML()}</div>
    <div class="pv-conta" id="pan-conta"></div>
    <button class="btn btn-primary" id="pan-salva" style="margin-top:12px">Salva paniere</button>
  `, (body, chiudi) => {
    const aggiornaConta = () => {
      body.querySelector('#pan-conta').textContent = sel.size ? (sel.size === 1 ? '1 voce selezionata' : `${sel.size} voci selezionate`) : '';
    };
    aggiornaConta();
    // toggle selezione (check o nome)
    body.querySelectorAll('[data-sel]').forEach(el => el.addEventListener('click', () => {
      const k = el.dataset.sel;
      if (sel.has(k)) sel.delete(k); else sel.add(k);
      body.querySelectorAll(`[data-sel="${CSS.escape(k)}"]`).forEach(x => {
        if (x.classList.contains('pv-check')) x.classList.toggle('on', sel.has(k));
      });
      aggiornaConta();
    }));
    // expand/collapse
    body.querySelectorAll('[data-exp]').forEach(el => el.addEventListener('click', () => {
      const fig = body.querySelector(`[data-figli="${CSS.escape(el.dataset.exp)}"]`);
      const aperto = fig.style.display !== 'none';
      fig.style.display = aperto ? 'none' : 'block';
      el.textContent = aperto ? '▾' : '▴';
    }));
    // salvataggio
    body.querySelector('#pan-salva').addEventListener('click', async () => {
      const nome = body.querySelector('#pan-nome').value.trim();
      if (!nome) { toast('Dai un nome al paniere'); return; }
      if (!sel.size) { toast('Seleziona almeno una voce'); return; }
      const voci = Array.from(sel).map(daChiave);
      const record = { id: esistente ? esistente.id : uid(), nome, voci };
      const ok = await safeWrite(async () => { await dbAdd('panieri', record); await refreshAll(); }, 'Paniere non salvato');
      if (!ok) return;
      chiudi(); toast(esistente ? 'Paniere aggiornato' : 'Paniere creato');
      onDone();
    });
  });
};
