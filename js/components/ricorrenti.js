// ricorrenti.js — Pagina Ricorrenti divisa in due: SPESE ricorrenti e ACCANTONAMENTI.
// Due totali distinti. Modifica avanzata (importo col tastierino + ambito
// "solo questa / future / anche passate").

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, round2, todayISO } from '../core/utils.js';
import { iconaMacro } from '../core/icons.js';
import { ricorrentiAttive, saveRicorrente, deleteRicorrente, FREQUENZE } from '../services/ricorrentiService.js';
import { applicaModificaAmbito } from '../services/movimentiService.js';
import { apriSheet, montaTastierino } from './shared.js';
import { toast } from '../core/utils.js';

const FREQ_LABEL = { giornaliera: 'Ogni giorno', settimanale: 'Ogni settimana', mensile: 'Ogni mese', annuale: 'Ogni anno' };

// Totale di una ricorrenza NEL MESE CORRENTE: conteggio REALE delle occorrenze
// (non proiezione media). 100€/settimana valgono 400€ o 500€ a seconda di quanti
// lunedì/mercoledì ha davvero il mese — mai 433€ "medi" che non esistono.
const _mensile = (r) => {
  const oggi = new Date();
  const anno = oggi.getFullYear(), mese = oggi.getMonth();   // mese corrente
  const giorniNelMese = new Date(anno, mese + 1, 0).getDate();

  if (r.frequenza === 'mensile') return r.imp;
  if (r.frequenza === 'giornaliera') return r.imp * giorniNelMese;
  if (r.frequenza === 'annuale') {
    // conta solo se l'anniversario cade nel mese corrente
    const rif = r.prossima || r.dataInizio;
    return rif && parseInt(rif.split('-')[1]) === mese + 1 ? r.imp : 0;
  }
  if (r.frequenza === 'settimanale') {
    // quante volte cade il giorno-della-settimana della ricorrenza in questo mese
    const rif = r.prossima || r.dataInizio;
    if (!rif) return r.imp * 4;
    const dow = new Date(rif + 'T00:00:00').getDay();
    let count = 0;
    for (let g = 1; g <= giorniNelMese; g++) if (new Date(anno, mese, g).getDay() === dow) count++;
    return r.imp * count;
  }
  return r.imp;
};

export const renderRicorrenti = async (root) => {
  const ric = ricorrentiAttive();
  // divido: spese (spesa) vs accantonamenti/trasferimenti
  const spese = ric.filter(r => r.tipo === 'spesa');
  const trasf = ric.filter(r => r.tipo === 'trasferimento');
  const entrate = ric.filter(r => r.tipo === 'entrata');

  const totSpese = round2(spese.reduce((s, r) => s + _mensile(r), 0));
  const totTrasf = round2(trasf.reduce((s, r) => s + _mensile(r), 0));

  const rigaRic = (r) => {
    const cls = r.tipo === 'trasferimento' ? 'tr' : r.tipo === 'entrata' ? 'en' : 'sp';
    const icona = r.tipo === 'trasferimento' ? '💠' : (r.macro ? iconaMacro(r.macro) : '🔁');
    const bg = r.tipo === 'trasferimento' ? 'rgba(61,182,255,.18)' : 'var(--surface-2)';
    const freq = FREQ_LABEL[r.frequenza] || r.frequenza;
    const extra = r.modalita === 'soglia' ? ` · a soglia ${fmtEUR(r.soglia)}` : '';
    const segno = r.tipo === 'trasferimento' ? '⇄ ' : r.tipo === 'entrata' ? '+' : '−';
    const dest = r.contoDest ? ' → ' + escapeHtml(r.contoDest) : '';
    return `
      <div class="recrow" data-ric="${r.id}">
        <div class="ic" style="background:${bg}">${icona}</div>
        <div class="body"><div class="d1">${escapeHtml(r.nome)}</div><div class="d2">${freq}${extra}${dest}</div></div>
        <div class="amt ${cls} num">${segno}${fmtEUR(r.imp)}</div>
      </div>`;
  };

  root.innerHTML = `
    <div class="rec-hero" style="display:flex;gap:0;padding:0;overflow:hidden">
      <div style="flex:1;padding:20px 16px;border-right:1px solid rgba(255,255,255,.08)">
        <div class="lbl" style="color:var(--txt-2);font-size:11px;text-transform:uppercase;letter-spacing:.05em">Spese questo mese</div>
        <div class="num" style="font-size:24px;font-weight:850;margin-top:4px;color:var(--down)">${fmtEUR(totSpese)}</div>
        <div class="sub" style="font-size:11.5px;color:var(--txt-2);margin-top:2px">${spese.length} ricorrenze</div>
      </div>
      <div style="flex:1;padding:20px 16px">
        <div class="lbl" style="color:var(--txt-2);font-size:11px;text-transform:uppercase;letter-spacing:.05em">Accantonato questo mese</div>
        <div class="num" style="font-size:24px;font-weight:850;margin-top:4px;color:var(--transfer)">${fmtEUR(totTrasf)}</div>
        <div class="sub" style="font-size:11.5px;color:var(--txt-2);margin-top:2px">${trasf.length} trasferimenti</div>
      </div>
    </div>

    ${spese.length ? `<div class="section-lbl"><span>Spese ricorrenti</span></div>${spese.map(rigaRic).join('')}` : ''}
    ${trasf.length ? `<div class="section-lbl"><span>Accantonamenti e PAC</span></div>${trasf.map(rigaRic).join('')}` : ''}
    ${entrate.length ? `<div class="section-lbl"><span>Entrate ricorrenti</span></div>${entrate.map(rigaRic).join('')}` : ''}
    ${!ric.length ? '<div class="empty"><div class="big-ic">🔁</div>Nessuna ricorrenza.<br>Creane una col + qui sotto, o rendi ricorrente una spesa dall\u2019inserimento.</div>' : ''}

    <div style="margin-top:20px" class="btn-row"><button class="btn btn-primary" id="nuova-ric">➕ Nuova ricorrenza</button></div>
    <div style="margin-top:10px"><button class="btn btn-secondary" id="nuova-regola">⚙️ Nuova regola di accantonamento</button></div>
  `;

  root.querySelectorAll('[data-ric]').forEach(el => el.addEventListener('click', () => _modificaRic(root, el.dataset.ric)));
  root.querySelector('#nuova-ric').addEventListener('click', () => _nuovaRicorrenza(root));
  root.querySelector('#nuova-regola').addEventListener('click', () => _nuovaRegola(root));
};

// Modifica ricorrente: importo col tastierino + ambito (solo questa / future / anche passate)
const _modificaRic = (root, id) => {
  const r = state.ricorrenti.find(x => x.id === id);
  if (!r) return;
  let impStr = String(r.imp).replace('.', ',');

  apriSheet(escapeHtml(r.nome), `
    <p class="meta" style="margin-bottom:12px">${FREQ_LABEL[r.frequenza]} · ${fmtEUR(r.imp)}${r.modalita === 'soglia' ? ' (a soglia)' : ''}</p>
    <label class="meta">Importo (€)</label>
    <div class="mini-amount" id="mr-amount">${escapeHtml(impStr)} €</div>
    <div id="mr-pad"></div>
    ${r.modalita === 'soglia' ? `<label class="meta">Soglia (€)</label><input type="number" step="0.01" id="mr-soglia" value="${r.soglia || 0}" class="sheet-input">` : ''}
    <label class="meta" style="margin-top:10px">Applica la modifica a</label>
    <select id="mr-ambito" class="sheet-input">
      <option value="questa">Solo questa (da ora in poi)</option>
      <option value="future">Questa e le future</option>
      <option value="tutte">Anche le passate (stessa descrizione e importo)</option>
    </select>
    <div class="btn-row">
      <button class="btn btn-danger" id="mr-del">Elimina</button>
      <button class="btn btn-primary" id="mr-ok">Salva</button>
    </div>
    <button class="btn btn-ghost" id="mr-toggle" style="margin-top:10px">${r.attiva === false ? 'Riattiva' : 'Metti in pausa'}</button>
  `, (body, chiudi) => {
    // tastierino per l'importo (usa l'helper condiviso: inline, non sventrato)
    const amountEl = body.querySelector('#mr-amount');
    const pad = body.querySelector('#mr-pad');
    amountEl.addEventListener('click', () => {
      if (pad.innerHTML) { pad.innerHTML = ''; return; }
      montaTastierino(pad, impStr, (s) => { impStr = s; amountEl.textContent = `${impStr} €`; }, () => {});
    });

    body.querySelector('#mr-ok').addEventListener('click', async () => {
      const nuovoImp = round2(parseFloat(impStr.replace(',', '.')) || 0);
      const soglia = body.querySelector('#mr-soglia') ? parseFloat(body.querySelector('#mr-soglia').value) || 0 : r.soglia;
      const ambito = body.querySelector('#mr-ambito').value;

      // aggiorna la ricorrenza
      await saveRicorrente({ ...r, imp: nuovoImp, soglia });

      // applica ai movimenti passati/futuri secondo l'ambito
      if (ambito === 'tutte') {
        const n = await applicaModificaAmbito(r, { imp: nuovoImp }, 'tutte');
        toast(`Aggiornata + ${n} movimenti passati`);
      } else if (ambito === 'future') {
        toast('Aggiornata per questa e le future');
      } else {
        toast('Aggiornata');
      }
      chiudi(); renderRicorrenti(root);
    });
    body.querySelector('#mr-del').addEventListener('click', async () => { if (confirm('Eliminare la ricorrenza?')) { await deleteRicorrente(id); chiudi(); toast('Eliminata'); renderRicorrenti(root); } });
    body.querySelector('#mr-toggle').addEventListener('click', async () => { await saveRicorrente({ ...r, attiva: r.attiva === false }); chiudi(); renderRicorrenti(root); });
  });
};

const _nuovaRicorrenza = (root) => {
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);
  const oggi = todayISO();
  apriSheet('Nuova ricorrenza', `
    <label class="meta">Nome / descrizione</label>
    <input id="nr-nome" placeholder="Es. Netflix, Palestra..." class="sheet-input">
    <label class="meta">Tipo</label>
    <select id="nr-tipo" class="sheet-input"><option value="spesa">Spesa</option><option value="entrata">Entrata</option><option value="trasferimento">Trasferimento</option></select>
    <label class="meta">Importo (€)</label>
    <input type="number" step="0.01" id="nr-imp" value="0" class="sheet-input">
    <label class="meta">Conto</label>
    <select id="nr-conto" class="sheet-input">${conti.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>
    <label class="meta">Frequenza</label>
    <select id="nr-freq" class="sheet-input"><option value="mensile">Ogni mese</option><option value="settimanale">Ogni settimana</option><option value="giornaliera">Ogni giorno</option><option value="annuale">Ogni anno</option></select>
    <label class="meta">Inizia il</label>
    <input type="date" id="nr-inizio" value="${oggi}" class="sheet-input">
    <label class="meta">Termina</label>
    <select id="nr-fine-tipo" class="sheet-input"><option value="mai">Mai</option><option value="data">A una data</option><option value="conteggio">Dopo N volte</option></select>
    <div id="nr-fine-extra"></div>
    <button class="btn btn-primary" id="nr-ok" style="margin-top:8px">Crea ricorrenza</button>
  `, (body, chiudi) => {
    const ft = body.querySelector('#nr-fine-tipo'), extra = body.querySelector('#nr-fine-extra');
    const rExtra = () => {
      if (ft.value === 'data') extra.innerHTML = `<label class="meta">Fino al</label><input type="date" id="nr-fine-data" class="sheet-input">`;
      else if (ft.value === 'conteggio') extra.innerHTML = `<label class="meta">Numero di volte</label><input type="number" id="nr-fine-cont" value="12" min="1" class="sheet-input">`;
      else extra.innerHTML = '';
    };
    ft.addEventListener('change', rExtra); rExtra();
    body.querySelector('#nr-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#nr-nome').value.trim() || 'Ricorrenza';
      const imp = parseFloat(body.querySelector('#nr-imp').value) || 0;
      if (imp <= 0) { toast('Inserisci un importo'); return; }
      const inizio = body.querySelector('#nr-inizio').value;
      const fineTipo = ft.value;
      await saveRicorrente({
        nome, desc: nome, tipo: body.querySelector('#nr-tipo').value, imp,
        conto: body.querySelector('#nr-conto').value, frequenza: body.querySelector('#nr-freq').value,
        dataInizio: inizio, prossima: inizio, fineTipo,
        fineData: fineTipo === 'data' ? body.querySelector('#nr-fine-data')?.value : null,
        fineConteggio: fineTipo === 'conteggio' ? parseInt(body.querySelector('#nr-fine-cont')?.value) : null,
      });
      chiudi(); toast('Ricorrenza creata'); renderRicorrenti(root);
    });
  });
};

const _nuovaRegola = (root) => {
  const conti = state.conti.filter(c => c.attivo !== false).map(c => c.nome);
  apriSheet('Nuova regola', `
    <label class="meta">Nome</label>
    <input id="g-nome" placeholder="Es. Accantono Satispay" class="sheet-input">
    <label class="meta">Frequenza</label>
    <select id="g-freq" class="sheet-input">${FREQUENZE.map(f => `<option value="${f}">${FREQ_LABEL[f]}</option>`).join('')}</select>
    <label class="meta">Modalità</label>
    <select id="g-mod" class="sheet-input"><option value="fisso">Importo fisso</option><option value="soglia">A soglia (riporta il conto a un valore)</option></select>
    <label class="meta">Importo / Soglia (€)</label>
    <input type="number" step="0.01" id="g-imp" value="0" class="sheet-input">
    <label class="meta">Da conto</label>
    <select id="g-da" class="sheet-input">${conti.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>
    <label class="meta">A conto</label>
    <select id="g-a" class="sheet-input">${conti.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>
    <button class="btn btn-primary" id="g-ok" style="margin-top:8px">Crea regola</button>
  `, (body, chiudi) => {
    body.querySelector('#g-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#g-nome').value.trim() || 'Regola';
      const mod = body.querySelector('#g-mod').value;
      const imp = parseFloat(body.querySelector('#g-imp').value) || 0;
      await saveRicorrente({
        nome, desc: nome, tipo: 'trasferimento', frequenza: body.querySelector('#g-freq').value, modalita: mod,
        imp: mod === 'soglia' ? 0 : imp, soglia: mod === 'soglia' ? imp : null,
        conto: body.querySelector('#g-da').value, contoDest: body.querySelector('#g-a').value,
        macro: 'Investimenti', isRegola: true, prossima: todayISO(), dataInizio: todayISO(),
      });
      chiudi(); toast('Regola creata'); renderRicorrenti(root);
    });
  });
};
