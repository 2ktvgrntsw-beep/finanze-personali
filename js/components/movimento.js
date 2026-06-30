// movimento.js — form di inserimento/modifica movimento.
//
// REFACTORING v1.3: aggiunto il terzo tipo "Trasferimento" (oltre a Spesa/Entrata),
// come da documento di progetto — serve per spostare denaro tra conti (es. un PAC)
// senza che venga contato come spesa/entrata nel calcolo del saldo periodo.
// Il form cambia dinamicamente: Spesa/Entrata mostrano "Conto" + categorie;
// Trasferimento mostra "Da conto" + "A conto" e nasconde le categorie (un
// trasferimento non ha categoria di spesa, sposta solo denaro).

import { state } from '../state.js';
import { saveMovimento, deleteMovimento, duplicateMovimento, suggerimentiFrequenti } from '../services/movimentiService.js';
import { getMacrocategorie, getCategorieByMacro, getSottocategorieByCat } from '../services/categorieService.js';
import { todayISO, toast, escapeHtml } from '../utils.js';
import { navigate } from '../router.js';

const optionsConti = (selezionato) =>
  state.conti.map(c => `<option value="${escapeHtml(c.nome)}" ${selezionato === c.nome ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('');

function campiSpesaEntrata(mov) {
  return `
    <div class="form-group"><label>Macrocategoria</label>
      <select name="macrocategoria"><option value="">–</option>${getMacrocategorie().map(m => `<option ${mov?.macrocategoria === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Categoria</label><select name="categoria"><option value="">–</option></select></div>
    <div class="form-group"><label>Sottocategoria</label><select name="sottocategoria"><option value="">–</option></select></div>
    <div class="form-group"><label>Conto</label><select name="conto"><option value="">–</option>${optionsConti(mov?.conto)}</select></div>
  `;
}

function campiTrasferimento(mov) {
  return `
    <div class="form-group"><label>Da conto</label><select name="conto_origine" required><option value="">–</option>${optionsConti(mov?.conto_origine)}</select></div>
    <div class="form-group"><label>A conto</label><select name="conto_destinazione" required><option value="">–</option>${optionsConti(mov?.conto_destinazione)}</select></div>
  `;
}

export const renderMovimento = async (root, movId = null) => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const id = movId || params.get('id');
  const mov = id ? state.movimenti.find(m => m.id === id) : null;
  const sugg = suggerimentiFrequenti(5);
  const tipoIniziale = mov?.tipo || 'spesa';

  root.innerHTML = `
    <form id="form-mov" class="card">
      <div class="form-group">
        <label>Tipo</label>
        <select name="tipo" id="sel-tipo" required>
          <option value="spesa" ${tipoIniziale === 'spesa' ? 'selected' : ''}>Spesa</option>
          <option value="entrata" ${tipoIniziale === 'entrata' ? 'selected' : ''}>Entrata</option>
          <option value="trasferimento" ${tipoIniziale === 'trasferimento' ? 'selected' : ''}>Trasferimento</option>
        </select>
      </div>
      <div class="form-group"><label>Data</label><input type="date" name="data" value="${mov?.data || todayISO()}" required /></div>
      <div class="form-group"><label>Importo (€)</label><input type="number" name="importo" step="0.01" min="0" value="${mov?.importo ?? ''}" required /></div>

      <div id="campi-dinamici">${tipoIniziale === 'trasferimento' ? campiTrasferimento(mov) : campiSpesaEntrata(mov)}</div>

      <div class="form-group"><label>Tag (virgola)</label><input name="tag" value="${(mov?.tag || []).join(', ')}" /></div>
      <div class="form-group"><label>Descrizione</label><input name="descrizione" value="${escapeHtml(mov?.descrizione || '')}" /></div>
      <div class="form-group"><label>Note</label><textarea name="note">${escapeHtml(mov?.note || '')}</textarea></div>

      <button class="btn btn-primary" type="submit">${mov ? 'Aggiorna' : 'Salva'}</button>
      ${mov ? `<div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn-secondary" id="dup">Duplica</button><button type="button" class="btn btn-danger" id="del">Elimina</button></div>` : ''}
    </form>
    ${sugg.length ? `<div class="card"><h2>Suggerimenti rapidi</h2>${sugg.map(s => `<div class="mov-item" data-fill='${escapeHtml(JSON.stringify({ tipo: s.tipo, categoria: s.categoria, macrocategoria: s.macrocategoria, sottocategoria: s.sottocategoria, conto: s.conto, descrizione: s.descrizione, importo: s.importo }))}'><div class="mov-left"><div class="desc">${escapeHtml(s.descrizione || '—')}</div><div class="meta">${escapeHtml(s.categoria || '')}</div></div><div class="mov-right ${s.tipo}">${s.tipo === 'spesa' ? '-' : '+'}${s.importo.toFixed(2)} €</div></div>`).join('')}</div>` : ''}
  `;

  const form = root.querySelector('#form-mov');
  const selTipo = root.querySelector('#sel-tipo');
  const campiDinamici = root.querySelector('#campi-dinamici');

  // Cambia i campi del form quando l'utente cambia tipo (es. da Spesa a Trasferimento)
  selTipo.addEventListener('change', () => {
    campiDinamici.innerHTML = selTipo.value === 'trasferimento' ? campiTrasferimento(null) : campiSpesaEntrata(null);
    if (selTipo.value !== 'trasferimento') agganciaCascataCategorie();
  });

  // Cascata Macrocategoria → Categoria → Sottocategoria (solo per Spesa/Entrata)
  function agganciaCascataCategorie() {
    const sMacro = form.querySelector('[name=macrocategoria]');
    const sCat = form.querySelector('[name=categoria]');
    const sSub = form.querySelector('[name=sottocategoria]');
    if (!sMacro || !sCat || !sSub) return;

    const refreshSub = () => {
      const subs = getSottocategorieByCat(sMacro.value, sCat.value);
      sSub.innerHTML = '<option value="">–</option>' + subs.map(s => `<option ${mov?.sottocategoria === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    };
    const refreshCat = () => {
      const cats = getCategorieByMacro(sMacro.value);
      sCat.innerHTML = '<option value="">–</option>' + cats.map(c => `<option ${mov?.categoria === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
      refreshSub();
    };
    sMacro.addEventListener('change', refreshCat);
    sCat.addEventListener('change', refreshSub);
    refreshCat();
  }
  if (tipoIniziale !== 'trasferimento') agganciaCascataCategorie();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = Object.fromEntries(new FormData(form).entries());
    obj.tag = (obj.tag || '').split(',').map(s => s.trim()).filter(Boolean);
    if (mov) obj.id = mov.id;
    await saveMovimento(obj);
    toast(mov ? 'Movimento aggiornato' : 'Movimento salvato');
    navigate('storico');
  });

  root.querySelector('#del')?.addEventListener('click', async () => {
    if (confirm('Eliminare questo movimento?')) { await deleteMovimento(mov.id); toast('Eliminato'); navigate('storico'); }
  });
  root.querySelector('#dup')?.addEventListener('click', async () => {
    await duplicateMovimento(mov.id); toast('Duplicato'); navigate('storico');
  });

  root.querySelectorAll('[data-fill]').forEach(el => el.addEventListener('click', () => {
    try {
      const data = JSON.parse(el.dataset.fill.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
      Object.entries(data).forEach(([k, v]) => { const input = form.querySelector(`[name=${k}]`); if (input) input.value = v; });
    } catch (err) { /* suggerimento malformato: si ignora silenziosamente */ }
  }));
};
