// conti.js — Conti e strumenti: elenco per tipologia con gestione completa.
//  - Conto: rinomina (propagata a movimenti, ricorrenze, prestiti, suggerimenti),
//    archivia (solo a saldo zero: esce dalle liste, lo storico resta), elimina (solo
//    se nessun movimento lo usa).
//  - Conti investimento: i loro strumenti, con aggiunta, rinomina, chiusura, eliminazione.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, todayISO, toast } from '../core/utils.js';
import {
  saldoStimato, saveConto, TIPI_CONTO, LABEL_TIPO, movimentiDelConto, rinominaConto,
  puoArchiviare, impostaArchiviato, puoEliminare, eliminaContoSicuro,
} from '../services/contiService.js';
import { strumentiDelConto, versato, creaStrumento } from '../services/strumentiService.js';
import { apriSheet, apriDataNativa, conferma } from './shared.js';
import { safeWrite } from '../core/db.js';
import { apriGestioneStrumento } from './dettaglioInvestimento.js';
import { leggiImporto } from './operazioniInvestimento.js';

const TIPI_VISIBILI = TIPI_CONTO.filter(t => t !== 'debiti');   // i debiti vivono in Mutuo/Finanziamenti

export const renderConti = async (root, params = {}) => {
  document.getElementById('view-title').textContent = params.tipo ? LABEL_TIPO[params.tipo] || 'Conti e strumenti' : 'Conti e strumenti';
  const rerender = () => renderConti(root, params);
  const tipi = params.tipo ? [params.tipo] : TIPI_VISIBILI;

  let html = '<p class="meta" style="margin:12px 4px">Tocca un conto o uno strumento per rinominarlo, archiviarlo o eliminarlo. Le rinomine aggiornano anche i movimenti.</p>';
  for (const tipo of tipi) {
    const conti = state.conti.filter(c => c.attivo !== false && c.tipo === tipo)
      .sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));
    if (!conti.length) continue;
    html += `<div class="section-lbl"><span>${LABEL_TIPO[tipo]}</span></div><div class="card" style="padding:4px 14px">`;
    for (const c of conti) {
      html += `
        <div class="conto-riga" data-conto="${c.id}">
          <div class="conto-nome">${escapeHtml(c.nome)}</div>
          <div class="conto-saldo num">${fmtEUR(saldoStimato(c))}</div>
          <div class="conto-chev">›</div>
        </div>`;
      if (tipo === 'investimenti') {
        for (const s of strumentiDelConto(c)) {
          html += `
            <div class="conto-riga strumento-riga" data-strumento="${s.id}" style="padding-left:16px">
              <div class="conto-nome" style="color:var(--txt-2)">${escapeHtml(s.nome)}${s.chiuso ? ' · chiuso' : ''}</div>
              <div class="conto-saldo num" style="color:var(--txt-2)">${fmtEUR(versato(s))}</div>
              <div class="conto-chev">›</div>
            </div>`;
        }
        html += `<div class="conto-riga" data-nuovo-strumento="${c.id}" style="padding-left:16px"><div class="conto-nome" style="color:var(--accent)">+ Aggiungi strumento</div></div>`;
      }
    }
    html += '</div>';
  }
  const archiviati = state.conti.filter(c => c.attivo === false && (!params.tipo || c.tipo === params.tipo));
  if (archiviati.length) {
    html += `<div class="section-lbl"><span>Archiviati</span></div><div class="card" style="padding:4px 14px">${archiviati.map(c => `
      <div class="conto-riga" data-conto="${c.id}">
        <div class="conto-nome" style="color:var(--txt-2)">${escapeHtml(c.nome)}<div class="meta" style="font-size:11.5px;margin-top:2px">${LABEL_TIPO[c.tipo] || c.tipo} · storico conservato</div></div>
        <div class="conto-chev">›</div>
      </div>`).join('')}</div>`;
  }

  root.innerHTML = html + `<div style="margin-top:20px"><button class="btn btn-primary" id="nuovo-conto">Nuovo conto</button></div>`;

  root.querySelectorAll('[data-conto]').forEach(el => el.addEventListener('click', () => _gestisciConto(el.dataset.conto, rerender)));
  root.querySelectorAll('[data-strumento]').forEach(el => el.addEventListener('click', () => apriGestioneStrumento(el.dataset.strumento, rerender)));
  root.querySelectorAll('[data-nuovo-strumento]').forEach(el => el.addEventListener('click', () => _nuovoStrumento(el.dataset.nuovoStrumento, rerender)));
  root.querySelector('#nuovo-conto').addEventListener('click', () => _nuovoConto(rerender, params.tipo));
};

const _gestisciConto = (id, onFatto) => {
  const c = state.conti.find(x => x.id === id);
  if (!c) return;
  const nMov = movimentiDelConto(c);
  const archiviato = c.attivo === false;
  const archOk = archiviato || puoArchiviare(c);
  const delOk = puoEliminare(c);
  apriSheet(c.nome, `
    <p class="meta" style="margin-bottom:12px">${LABEL_TIPO[c.tipo] || c.tipo} · ${nMov} movimenti · ${c.tipo === 'investimenti' ? 'versato' : 'saldo'} ${fmtEUR(saldoStimato(c))}</p>
    <label class="meta">Nome</label>
    <input id="gc-nome" value="${escapeHtml(c.nome)}" class="sheet-input">
    <button class="btn btn-primary" id="gc-rin" style="margin-bottom:6px">Salva nome</button>
    <p class="meta" style="font-size:12px;margin-bottom:14px">Rinominando, i ${nMov} movimenti restano collegati al conto.</p>
    <div class="btn-row">
      <button class="btn btn-secondary" id="gc-arc" ${archOk ? '' : 'style="opacity:.45"'}>${archiviato ? 'Ripristina' : 'Archivia'}</button>
      <button class="btn btn-danger" id="gc-del" ${delOk ? '' : 'style="opacity:.45"'}>Elimina</button>
    </div>
    <p class="meta" style="font-size:12px;margin-top:8px">${delOk ? 'Nessun movimento lo usa: puoi eliminarlo.'
      : archOk ? 'È usato da movimenti: puoi solo archiviarlo. Esce dalle liste, lo storico resta.'
      : 'Per archiviarlo porta prima il saldo a zero: un conto archiviato esce dal patrimonio.'}</p>
  `, (body, chiudi) => {
    body.querySelector('#gc-rin').addEventListener('click', async () => {
      let n = 0;
      try { n = await rinominaConto(id, body.querySelector('#gc-nome').value); } catch (e) { toast(e.message); return; }
      chiudi(); toast(`Conto rinominato · ${n} movimenti aggiornati`); onFatto();
    });
    body.querySelector('#gc-arc').addEventListener('click', async () => {
      try { await impostaArchiviato(id, !archiviato); } catch (e) { toast(e.message); return; }
      chiudi(); toast(archiviato ? 'Conto ripristinato' : 'Conto archiviato'); onFatto();
    });
    body.querySelector('#gc-del').addEventListener('click', async () => {
      if (!delOk) { toast('È usato da movimenti o ricorrenze: puoi solo archiviarlo'); return; }
      if (!(await conferma(`Eliminare il conto "${c.nome}"?`, { danger: true, ok: 'Elimina' }))) return;
      try { await eliminaContoSicuro(id); } catch (e) { toast(e.message); return; }
      chiudi(); toast('Conto eliminato'); onFatto();
    });
  });
};

const _nuovoStrumento = (contoId, onFatto) => {
  const c = state.conti.find(x => x.id === contoId);
  apriSheet(`Nuovo strumento · ${c ? c.nome : ''}`, `
    <label class="meta">Nome</label>
    <input id="ns-nome" placeholder="Es. PAC ETF World" class="sheet-input" autocomplete="off">
    <p class="meta" style="font-size:12px;margin-bottom:12px">Il versato parte da zero: lo alimenti con Versa o con uno spostamento.</p>
    <button class="btn btn-primary" id="ns-ok">Crea strumento</button>
  `, (body, chiudi) => {
    body.querySelector('#ns-ok').addEventListener('click', async () => {
      try { await creaStrumento({ nome: body.querySelector('#ns-nome').value, contoId }); } catch (e) { toast(e.message); return; }
      chiudi(); toast('Strumento creato'); onFatto();
    });
  });
};

const _nuovoConto = (onFatto, tipoPre) => {
  const tmp = { data_saldo: todayISO(), possessoData: '' };
  const tipoIniziale = tipoPre && TIPI_VISIBILI.includes(tipoPre) ? tipoPre : 'liquidita';
  apriSheet('Nuovo conto', `
    <label class="meta">Nome</label>
    <input id="c-nome" class="sheet-input" placeholder="Es. Trade Republic">
    <label class="meta">Tipo</label>
    <select id="c-tipo" class="sheet-input">
      ${TIPI_VISIBILI.map(t => `<option value="${t}" ${t === tipoIniziale ? 'selected' : ''}>${LABEL_TIPO[t]}</option>`).join('')}
    </select>
    <div id="c-saldo-wrap">
      <label class="meta">Saldo / Valore iniziale (€)</label>
      <input type="text" inputmode="decimal" id="c-saldo" value="0" class="sheet-input">
      <label class="meta">Data del saldo</label>
      <button type="button" id="c-data-btn" class="sheet-input" style="text-align:left;cursor:pointer">${_fmtD(tmp.data_saldo)}</button>
    </div>
    <p class="meta" id="c-inv-nota" style="font-size:12px;display:none">Il versato di un conto investimento nasce dai suoi strumenti: dopo averlo creato aggiungi uno strumento e usa Versa.</p>
    <div id="c-possesso-wrap" style="display:none">
      <label class="meta">Posseduto dal (per il grafico patrimonio)</label>
      <button type="button" id="c-possesso-btn" class="sheet-input" style="text-align:left;cursor:pointer">Non impostato</button>
    </div>
    <button class="btn btn-primary" id="c-ok" style="margin-top:8px">Crea conto</button>
  `, (body, chiudi) => {
    const tipoSel = body.querySelector('#c-tipo');
    const aggiorna = () => {
      const t = tipoSel.value;
      body.querySelector('#c-possesso-wrap').style.display = t === 'asset' ? '' : 'none';
      body.querySelector('#c-saldo-wrap').style.display = t === 'investimenti' ? 'none' : '';
      body.querySelector('#c-inv-nota').style.display = t === 'investimenti' ? '' : 'none';
    };
    aggiorna(); tipoSel.addEventListener('change', aggiorna);
    const dataBtn = body.querySelector('#c-data-btn');
    dataBtn.addEventListener('click', () => apriDataNativa(tmp.data_saldo, (nd) => { tmp.data_saldo = nd; dataBtn.textContent = _fmtD(nd); }));
    const possBtn = body.querySelector('#c-possesso-btn');
    possBtn.addEventListener('click', () => apriDataNativa(tmp.possessoData || todayISO(), (nd) => { tmp.possessoData = nd; possBtn.textContent = _fmtD(nd); }));
    body.querySelector('#c-ok').addEventListener('click', async () => {
      const nome = body.querySelector('#c-nome').value.trim();
      if (!nome) { toast('Inserisci un nome'); return; }
      if (state.conti.some(x => x.nome.toLowerCase() === nome.toLowerCase())) { toast('Esiste già un conto con questo nome'); return; }
      const tipo = tipoSel.value;
      const ok = await safeWrite(() => saveConto({
        nome, tipo,
        saldo_iniziale: tipo === 'investimenti' ? 0 : (leggiImporto(body.querySelector('#c-saldo').value) || 0),
        data_saldo: tmp.data_saldo, possessoData: tmp.possessoData || null,
      }), 'Conto non salvato');
      if (!ok) return;
      chiudi(); toast('Conto creato'); onFatto();
    });
  });
};

const _fmtD = (iso) => { if (!iso) return ''; const [a, m, g] = iso.split('-'); return `${g}/${m}/${a}`; };
