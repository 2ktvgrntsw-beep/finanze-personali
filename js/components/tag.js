// tag.js — Gestione dei tag (Altro → Tag → Gestisci tag): elenco con quanti movimenti
// e ricorrenze li usano; per ognuno rinomina/unisci ed eliminazione, propagate a tutti
// i record che lo portano (tagService). Dalla 3.49: prima un tag non si poteva
// modificare da nessuna parte.

import { escapeHtml, fmtData, toast } from '../core/utils.js';
import { UI_SVG } from '../core/icons.js';
import { safeWrite } from '../core/db.js';
import { apriSheet, conferma } from './shared.js';
import { elencoTag, rinominaTag, eliminaTag, controllaRinomina, eTagUnaTantum, normalizzaTag } from '../services/tagService.js';
import { apriAnalisiTag } from './analisi.js';

let _filtro = '';

const _uso = (t) => {
  const parti = [`${t.movimenti} ${t.movimenti === 1 ? 'movimento' : 'movimenti'}`];
  if (t.ricorrenze) parti.push(`${t.ricorrenze} ${t.ricorrenze === 1 ? 'ricorrenza' : 'ricorrenze'}`);
  if (t.ultimo) parti.push(`ultimo ${fmtData(t.ultimo)}`);
  return parti.join(' · ');
};

export const renderTag = async (root) => {
  document.getElementById('view-title').textContent = 'Tag';
  const tutti = elencoTag();
  const q = _filtro.trim().toLowerCase();
  const visibili = q ? tutti.filter(t => t.nome.toLowerCase().includes(q)) : tutti;

  root.innerHTML = `
    <p class="meta" style="margin:12px 4px">Tocca un tag per rinominarlo o eliminarlo. Le modifiche valgono per tutti i movimenti che lo hanno e per le ricorrenze, così anche i movimenti futuri. Rinominandolo come un tag che esiste già, i due si uniscono.</p>
    ${tutti.length > 6 ? `<div class="searchbar" style="margin:0 0 12px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="tag-q" placeholder="Cerca un tag" autocomplete="off" value="${escapeHtml(_filtro)}" aria-label="Cerca un tag"></div>` : ''}
    ${visibili.length ? `<div class="card" style="padding:0">${visibili.map((t, i) => `
      ${i ? '<div class="divider"></div>' : ''}
      <div class="patrow" data-tag="${escapeHtml(t.nome)}" role="button" style="cursor:pointer">
        <div class="icon" style="background:var(--surface-2)">${UI_SVG.hashtag}</div>
        <div class="body">
          <div class="row1"><span class="name">${escapeHtml(t.nome)}</span></div>
          <div class="meta" style="font-size:12px">${_uso(t)}${eTagUnaTantum(t.nome) ? ' · usato da Bilancio e grafici' : ''}</div>
        </div>
        <div class="chev">${UI_SVG.matita}</div>
      </div>`).join('')}</div>`
    : `<div class="empty"><div class="big-ic">#</div>${tutti.length ? 'Nessun tag corrisponde alla ricerca.' : 'Non hai ancora usato i tag.<br><br>Aggiungili quando inserisci un movimento, o in blocco da Altro → Tag.'}</div>`}
  `;

  const inp = root.querySelector('#tag-q');
  if (inp) inp.addEventListener('input', () => {
    _filtro = inp.value;
    renderTag(root).then(() => { const i = root.querySelector('#tag-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
  });
  root.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => {
    const t = tutti.find(x => x.nome === el.dataset.tag);
    if (t) _gestisci(root, t);
  }));
};

const _gestisci = (root, t) => {
  const speciale = eTagUnaTantum(t.nome);
  const tot = t.movimenti + t.ricorrenze;   // record da riscrivere
  apriSheet(`#${t.nome}`, `
    <p class="meta" style="margin-bottom:14px">${_uso(t)}</p>
    ${speciale ? `
      <p class="meta" style="margin-bottom:14px">Questo tag ha un significato per l'app: Bilancio, grafico del ritmo e mese tipico lo riconoscono per nome per separare le spese e le entrate straordinarie. Per questo non si può rinominare.</p>
    ` : `
      <label class="meta" for="t-nome">Rinomina o unisci</label>
      <input id="t-nome" value="${escapeHtml(t.nome)}" class="sheet-input" autocomplete="off" list="t-esistenti">
      <datalist id="t-esistenti">${elencoTag().filter(x => x.nome !== t.nome).map(x => `<option value="${escapeHtml(x.nome)}"></option>`).join('')}</datalist>
      <button class="btn btn-primary" id="t-rinomina" style="margin-bottom:16px">Rinomina${tot ? ` (aggiorna ${_uso({ ...t, ultimo: '' })})` : ''}</button>
    `}
    ${t.movimenti ? '<button class="btn btn-secondary" id="t-analisi" style="margin-bottom:16px">Vedi i movimenti in Analisi</button>' : ''}
    <div class="divider" style="margin:6px 0 14px"></div>
    <button class="btn btn-danger" id="t-elimina">Elimina il tag</button>
    <p class="meta" style="font-size:11px;margin-top:6px;opacity:.8">Il tag viene tolto da tutti i movimenti e le ricorrenze. I movimenti restano.</p>
  `, (body, chiudi) => {
    const btnRin = body.querySelector('#t-rinomina');
    if (btnRin) btnRin.addEventListener('click', async () => {
      const nuovo = normalizzaTag(body.querySelector('#t-nome').value);
      const errore = controllaRinomina(t.nome, nuovo);
      if (errore) { toast(errore); return; }
      const esiste = elencoTag().some(x => x.nome === nuovo);
      if (esiste && !(await conferma(`"${nuovo}" esiste già: i due tag verranno uniti in "${nuovo}". Continuare?`, { titolo: 'Unisci tag', ok: 'Unisci' }))) return;
      if (eTagUnaTantum(nuovo) && !esiste && !(await conferma(`Con il nome "una tantum" questi ${t.movimenti} movimenti diventano straordinari: escono dal "solito" nei grafici e dal tasso ordinario del Bilancio. Continuare?`, { ok: 'Rinomina' }))) return;
      let esito;
      const ok = await safeWrite(async () => { esito = await rinominaTag(t.nome, nuovo); }, 'Tag non rinominato');
      if (!ok) return;
      chiudi();
      toast(`${esito.unito ? 'Uniti' : 'Rinominato'} · ${esito.movimenti} movimenti${esito.ricorrenze ? ` e ${esito.ricorrenze} ricorrenze` : ''} aggiornati`);
      renderTag(root);
    });

    const btnAn = body.querySelector('#t-analisi');
    if (btnAn) btnAn.addEventListener('click', () => { chiudi(); apriAnalisiTag(t.nome); });

    body.querySelector('#t-elimina').addEventListener('click', async () => {
      const msg = speciale
        ? `Togliere "una tantum" da ${t.movimenti} movimenti? Torneranno a contare come spese ed entrate normali nel Bilancio e nei grafici.`
        : tot ? `Togliere "${t.nome}" da ${t.movimenti} movimenti${t.ricorrenze ? ` e ${t.ricorrenze} ricorrenze` : ''}? I movimenti restano.` : `Eliminare "${t.nome}"?`;
      if (!(await conferma(msg, { titolo: 'Elimina tag', danger: true, ok: 'Elimina' }))) return;
      let esito;
      const ok = await safeWrite(async () => { esito = await eliminaTag(t.nome); }, 'Tag non eliminato');
      if (!ok) return;
      chiudi();
      toast(`Tag eliminato${esito.movimenti ? ` da ${esito.movimenti} movimenti` : ''}`);
      renderTag(root);
    });
  });
};
