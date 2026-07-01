// ricorrenti.js — Vista d'insieme delle ricorrenze + regole automatiche.
// Mostra quanto è "impegnato" ogni mese e permette di gestire accantonamenti
// parametrizzabili (soglia/fisso, giornaliero/settimanale/mensile).

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import {
  ricorrentiAttive, impegnatoMensile, saveRicorrente, deleteRicorrente, FREQUENZE,
} from '../services/ricorrentiService.js';
import { apriSheet } from './shared.js';
import { toast } from '../core/utils.js';

const FREQ_LABEL = { giornaliera: 'Ogni giorno', settimanale: 'Ogni settimana', mensile: 'Ogni mese', annuale: 'Ogni anno' };

export const renderRicorrenti = async (root) => {
  const ric = ricorrentiAttive();
  const impegnato = impegnatoMensile();

  // stima % del reddito impegnato (usa media entrate mensili se disponibile)
  const entratePerMese = {};
  for (const m of state.movimenti) if (m.tipo === 'entrata') entratePerMese[m.annomese] = (entratePerMese[m.annomese] || 0) + m.imp;
  const valoriEntrate = Object.values(entratePerMese);
  const redditoMedio = valoriEntrate.length ? valoriEntrate.reduce((s, v) => s + v, 0) / valoriEntrate.length : 0;
  const pctReddito = redditoMedio > 0 ? Math.round(impegnato / redditoMedio * 100) : null;

  const regole = ric.filter(r => r.isRegola);
  const normali = ric.filter(r => !r.isRegola);

  const rigaRic = (r) => {
    const cls = r.tipo === 'trasferimento' ? 'tr' : 'sp';
    const icona = r.tipo === 'trasferimento' ? '💠' : (r.macro ? iconaMacro(r.macro) : '🔁');
    const bg = r.tipo === 'trasferimento' ? 'rgba(61,182,255,.18)' : 'var(--surface-2)';
    const freq = FREQ_LABEL[r.frequenza] || r.frequenza;
    const extra = r.modalita === 'soglia' ? ` · a soglia ${fmtEUR(r.soglia)}` : '';
    const segno = r.tipo === 'trasferimento' ? '⇄ ' : '−';
    return `
      <div class="recrow" data-ric="${r.id}">
        <div class="ic" style="background:${bg}">${icona}</div>
        <div class="body">
          <div class="d1">${escapeHtml(r.nome)}</div>
          <div class="d2">${freq}${extra}${r.contoDest ? ' → ' + escapeHtml(r.contoDest) : ''}</div>
        </div>
        <div class="amt ${cls} num">${segno}${fmtEUR(r.imp)}</div>
      </div>`;
  };

  root.innerHTML = `
    <div class="rec-hero">
      <div class="lbl">Impegnato ogni mese</div>
      <div class="big num">${fmtEUR(impegnato)}</div>
      <div class="sub">${ric.length} ricorrenze${pctReddito !== null ? ` · circa il ${pctReddito}% del reddito` : ''}</div>
    </div>

    ${normali.length ? `<div class="section-lbl"><span>Ricorrenze</span></div>${normali.map(rigaRic).join('')}` : ''}
    ${regole.length ? `<div class="section-lbl"><span>Regole automatiche</span></div>${regole.map(rigaRic).join('')}` : ''}
    ${!ric.length ? '<div class="empty"><div class="big-ic">🔁</div>Nessuna ricorrenza.<br>Creane una col +, o rendi ricorrente una spesa dall’inserimento.</div>' : ''}

    <div style="margin-top:20px" class="btn-row">
      <button class="btn btn-primary" id="nuova-ric">➕ Nuova ricorrenza</button>
    </div>
    <div style="margin-top:10px">
      <button class="btn btn-secondary" id="nuova-regola">⚙️ Nuova regola di accantonamento</button>
    </div>
  `;

  root.querySelectorAll('[data-ric]').forEach(el => el.addEventListener('click', () => _modificaRic(root, el.dataset.ric)));
  root.querySelector('#nuova-ric').addEventListener('click', () => _nuovaRicorrenza(root));
  root.querySelector('#nuova-regola').addEventListener('click', () => _nuovaRegola(root));
};

// Nuova ricorrenza generica (spesa/entrata/trasferimento) con inizio/cadenza/fine
const _nuovaRicorrenza = (root) => {
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);
  const oggi = new Date().toISOString().slice(0, 10);
  apriSheet('Nuova ricorrenza', `
    <label class="meta">Nome / descrizione</label>
    <input id="nr-nome" placeholder="Es. Netflix, Palestra..." class="sheet-input">
    <label class="meta">Tipo</label>
    <select id="nr-tipo" class="sheet-input">
      <option value="spesa">Spesa</option>
      <option value="entrata">Entrata</option>
      <option value="trasferimento">Trasferimento</option>
    </select>
    <label class="meta">Importo (€)</label>
    <input type="number" step="0.01" id="nr-imp" value="0" class="sheet-input">
    <label class="meta">Conto</label>
    <select id="nr-conto" class="sheet-input">${conti.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>
    <label class="meta">Frequenza</label>
    <select id="nr-freq" class="sheet-input">
      <option value="mensile">Ogni mese</option>
      <option value="settimanale">Ogni settimana</option>
      <option value="giornaliera">Ogni giorno</option>
      <option value="annuale">Ogni anno</option>
    </select>
    <label class="meta">Inizia il</label>
    <input type="date" id="nr-inizio" value="${oggi}" class="sheet-input">
    <label class="meta">Termina</label>
    <select id="nr-fine-tipo" class="sheet-input">
      <option value="mai">Mai</option>
      <option value="data">A una data</option>
      <option value="conteggio">Dopo N volte</option>
    </select>
    <div id="nr-fine-extra"></div>
    <button class="btn btn-primary" id="nr-ok" style="margin-top:8px">Crea ricorrenza</button>
  `, (body, chiudi) => {
    const ft = body.querySelector('#nr-fine-tipo');
    const extra = body.querySelector('#nr-fine-extra');
    const renderExtra = () => {
      if (ft.value === 'data') extra.innerHTML = `<label class="meta">Fino al</label><input type="date" id="nr-fine-data" class="sheet-input">`;
      else if (ft.value === 'conteggio') extra.innerHTML = `<label class="meta">Numero di volte</label><input type="number" id="nr-fine-cont" value="12" min="1" class="sheet-input">`;
      else extra.innerHTML = '';
    };
    ft.addEventListener('change', renderExtra); renderExtra();

    body.querySelector('#nr-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#nr-nome').value.trim() || 'Ricorrenza';
      const imp = parseFloat(body.querySelector('#nr-imp').value) || 0;
      if (imp <= 0) { toast('Inserisci un importo'); return; }
      const inizio = body.querySelector('#nr-inizio').value;
      const fineTipo = ft.value;
      await saveRicorrente({
        nome, desc: nome, tipo: body.querySelector('#nr-tipo').value,
        imp, conto: body.querySelector('#nr-conto').value,
        frequenza: body.querySelector('#nr-freq').value,
        dataInizio: inizio, prossima: inizio,
        fineTipo,
        fineData: fineTipo === 'data' ? body.querySelector('#nr-fine-data')?.value : null,
        fineConteggio: fineTipo === 'conteggio' ? parseInt(body.querySelector('#nr-fine-cont')?.value) : null,
      });
      chiudi(); toast('Ricorrenza creata'); renderRicorrenti(root);
    });
  });
};

const _modificaRic = (root, id) => {
  const r = state.ricorrenti.find(x => x.id === id);
  if (!r) return;
  apriSheet(escapeHtml(r.nome), `
    <p class="meta" style="margin-bottom:14px">${FREQ_LABEL[r.frequenza]} · ${fmtEUR(r.imp)}${r.modalita === 'soglia' ? ' (a soglia)' : ''}</p>
    <label class="meta">Importo (€)</label>
    <input type="number" step="0.01" id="r-imp" value="${r.imp}" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
    ${r.modalita === 'soglia' ? `<label class="meta">Soglia (€)</label><input type="number" step="0.01" id="r-soglia" value="${r.soglia || 0}" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">` : ''}
    <div class="btn-row">
      <button class="btn btn-danger" id="r-del">Elimina</button>
      <button class="btn btn-primary" id="r-ok">Salva</button>
    </div>
    <button class="btn btn-ghost" id="r-toggle" style="margin-top:10px">${r.attiva === false ? 'Riattiva' : 'Metti in pausa'}</button>
  `, (body, chiudi) => {
    body.querySelector('#r-ok').addEventListener('click', async () => {
      const imp = parseFloat(body.querySelector('#r-imp').value) || 0;
      const soglia = body.querySelector('#r-soglia') ? parseFloat(body.querySelector('#r-soglia').value) || 0 : r.soglia;
      await saveRicorrente({ ...r, imp, soglia });
      chiudi(); toast('Aggiornata'); renderRicorrenti(root);
    });
    body.querySelector('#r-del').addEventListener('click', async () => { if (confirm('Eliminare la ricorrenza?')) { await deleteRicorrente(id); chiudi(); toast('Eliminata'); renderRicorrenti(root); } });
    body.querySelector('#r-toggle').addEventListener('click', async () => { await saveRicorrente({ ...r, attiva: r.attiva === false }); chiudi(); renderRicorrenti(root); });
  });
};

const _nuovaRegola = (root) => {
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);
  apriSheet('Nuova regola', `
    <label class="meta">Nome</label>
    <input id="g-nome" placeholder="Es. Accantono Satispay" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
    <label class="meta">Frequenza</label>
    <select id="g-freq" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
      ${FREQUENZE.map(f => `<option value="${f}">${FREQ_LABEL[f]}</option>`).join('')}
    </select>
    <label class="meta">Modalità</label>
    <select id="g-mod" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
      <option value="fisso">Importo fisso</option>
      <option value="soglia">A soglia (riporta il conto a un valore)</option>
    </select>
    <label class="meta">Importo / Soglia (€)</label>
    <input type="number" step="0.01" id="g-imp" value="0" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">
    <label class="meta">Da conto</label>
    <select id="g-da" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">${conti.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>
    <label class="meta">A conto</label>
    <select id="g-a" style="width:100%;padding:13px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--txt);font-size:16px;margin:8px 0 12px">${conti.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>
    <button class="btn btn-primary" id="g-ok" style="margin-top:8px">Crea regola</button>
  `, (body, chiudi) => {
    body.querySelector('#g-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#g-nome').value.trim() || 'Regola';
      const freq = body.querySelector('#g-freq').value;
      const mod = body.querySelector('#g-mod').value;
      const imp = parseFloat(body.querySelector('#g-imp').value) || 0;
      const da = body.querySelector('#g-da').value;
      const a = body.querySelector('#g-a').value;
      await saveRicorrente({
        nome, tipo: 'trasferimento', frequenza: freq, modalita: mod,
        imp: mod === 'soglia' ? 0 : imp, soglia: mod === 'soglia' ? imp : null,
        conto: da, contoDest: a, macro: 'Investimenti', desc: nome, isRegola: true,
      });
      chiudi(); toast('Regola creata'); renderRicorrenti(root);
    });
  });
};
