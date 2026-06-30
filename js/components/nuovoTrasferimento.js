// nuovoTrasferimento.js (NUOVO v1.3) — form dedicato per i trasferimenti tra conti.
// È una variante più mirata del form Nuovo Movimento (che gestisce comunque anche
// il tipo "trasferimento"): qui l'interfaccia è ottimizzata per il caso d'uso
// specifico mostrato nel mockup (es. un versamento PAC, uno spostamento di liquidità).

import { state } from '../state.js';
import { saveMovimento } from '../services/movimentiService.js';
import { todayISO, escapeHtml, toast } from '../utils.js';
import { navigate } from '../router.js';

export const renderNuovoTrasferimento = async (root) => {
  const optionsConti = (escluso) => state.conti
    .filter(c => c.nome !== escluso)
    .map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join('');

  root.innerHTML = `
    <form id="form-trasf" class="card">
      <div class="form-group"><label>Da dove</label><select name="conto_origine" id="sel-origine" required><option value="">–</option>${optionsConti(null)}</select></div>
      <div class="form-group"><label>A dove</label><select name="conto_destinazione" id="sel-dest" required><option value="">–</option>${optionsConti(null)}</select></div>
      <div class="form-group"><label>Importo</label><input type="number" name="importo" step="0.01" min="0" required /></div>
      <div class="form-group"><label>Data</label><input type="date" name="data" value="${todayISO()}" required /></div>
      <div class="form-group"><label>Descrizione</label><input name="descrizione" placeholder="es. PAC settimanale ETF" /></div>
      <div class="form-group"><label>Note (opzionale)</label><textarea name="note"></textarea></div>
      <button class="btn btn-primary" type="submit">Salva trasferimento</button>
    </form>
  `;

  const selOrigine = root.querySelector('#sel-origine');
  const selDest = root.querySelector('#sel-dest');

  // Evita di poter selezionare lo stesso conto sia come origine che come destinazione
  const aggiornaOpzioniDest = () => {
    const valoreAttuale = selDest.value;
    selDest.innerHTML = `<option value="">–</option>${optionsConti(selOrigine.value)}`;
    if (valoreAttuale !== selOrigine.value) selDest.value = valoreAttuale;
  };
  selOrigine.addEventListener('change', aggiornaOpzioniDest);

  root.querySelector('#form-trasf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = Object.fromEntries(new FormData(e.target).entries());
    if (obj.conto_origine === obj.conto_destinazione) { toast('Origine e destinazione devono essere diversi'); return; }
    await saveMovimento({ ...obj, tipo: 'trasferimento' });
    toast('Trasferimento salvato');
    navigate('storico');
  });
};
