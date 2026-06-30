// riconciliazione.js (NUOVO v1.3) — confronto tra saldo stimato dall'app e saldo reale
// dichiarato dall'utente, con 3 modalità di gestione (come da documento di progetto,
// sezione 13 "Decisioni progettuali": Aggiorna manuale / Rettifica / Ignora — sempre
// opzionale, mai automatico).
//
// Le 3 modalità:
// 1) "Aggiorna saldo (senza rettifica)": sposta il punto di riferimento del conto
//    (saldo_iniziale + data_saldo) ad oggi. Nessun movimento aggiuntivo nello storico.
//    Adatta a piccole differenze/arrotondamenti.
// 2) "Crea rettifica": genera un movimento di tipo entrata/spesa con descrizione
//    "Rettifica saldo", visibile nello storico — così resta traccia del perché
//    il saldo è cambiato. Il conto stesso NON viene toccato: la rettifica, sommata
//    ai movimenti esistenti, porta automaticamente il saldo stimato a coincidere
//    con quello reale.
// 3) "Ignora per ora": non fa nulla, utile se la differenza è temporanea
//    (es. pagamento non ancora contabilizzato dalla banca).

import { state } from '../state.js';
import { fmtEUR, fmtDate, escapeHtml, todayISO, round2 } from '../utils.js';
import { saldoStimatoConto } from '../services/patrimonioService.js';
import { saveConto } from '../services/contiService.js';
import { saveMovimento } from '../services/movimentiService.js';
import { toast } from '../utils.js';

export const renderRiconciliazione = async (root) => {
  const conti = state.conti.filter(c => c.tipologia === 'liquidita' || c.tipologia === 'risparmio');

  root.innerHTML = `
    <div class="card">
      <h2>Riconcilia Conto</h2>
      <div class="form-group"><label>Conto</label><select id="sel-conto"><option value="">– seleziona –</option>${conti.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}</select></div>
    </div>
    <div id="dettaglio"></div>
  `;

  const dettaglio = root.querySelector('#dettaglio');

  root.querySelector('#sel-conto').addEventListener('change', (e) => {
    const conto = state.conti.find(c => c.id === e.target.value);
    if (!conto) { dettaglio.innerHTML = ''; return; }
    mostraDettaglio(conto);
  });

  function mostraDettaglio(conto) {
    const saldoStimato = saldoStimatoConto(conto);

    dettaglio.innerHTML = `
      <div class="card">
        <div class="kpi"><div class="label">Saldo stimato (da app)</div><div class="value">${fmtEUR(saldoStimato)}</div></div>
        <p class="meta">Ultimo punto di riferimento: ${fmtDate(conto.data_saldo || '1970-01-01')}</p>
        <div class="form-group" style="margin-top:12px"><label>Saldo reale (dalla tua banca/app)</label><input type="number" step="0.01" id="saldo-reale" placeholder="es. 3298.50" /></div>
        <button class="btn btn-secondary" id="calcola-diff">Confronta</button>
        <div id="risultato-confronto"></div>
      </div>
    `;

    dettaglio.querySelector('#calcola-diff').addEventListener('click', () => {
      const saldoReale = parseFloat(dettaglio.querySelector('#saldo-reale').value);
      if (isNaN(saldoReale)) { toast('Inserisci un saldo valido'); return; }
      const diff = round2(saldoReale - saldoStimato);

      const risultato = dettaglio.querySelector('#risultato-confronto');
      if (Math.abs(diff) < 0.01) {
        risultato.innerHTML = `<div class="banner-success" style="margin-top:14px">✅ Il saldo coincide. Nessuna azione necessaria.</div>`;
        return;
      }

      risultato.innerHTML = `
        <div class="banner-info" style="margin-top:14px">
          Differenza: <strong>${diff >= 0 ? '+' : ''}${fmtEUR(diff)}</strong> ${diff >= 0 ? '(il saldo reale è maggiore)' : '(il saldo reale è minore)'}
        </div>
        <p style="margin:12px 0 6px"><strong>Cosa vuoi fare?</strong></p>
        <div class="btn-row" style="flex-direction:column;gap:8px">
          <button class="btn btn-secondary" id="azione-aggiorna" style="width:100%">Aggiorna saldo (senza rettifica)</button>
          <button class="btn btn-secondary" id="azione-rettifica" style="width:100%">Crea rettifica</button>
          <button class="btn btn-secondary" id="azione-ignora" style="width:100%">Ignora per ora</button>
        </div>
        <p class="meta" style="margin-top:10px;font-size:12px">
          <strong>Aggiorna saldo</strong>: sposta il punto di partenza ad oggi, nessun movimento creato. Adatto a piccole differenze.<br>
          <strong>Crea rettifica</strong>: aggiunge un movimento visibile nello storico, con motivazione. Mantiene traccia del perché.<br>
          <strong>Ignora</strong>: non fa nulla ora, utile se la differenza è temporanea (es. pagamento non ancora contabilizzato).
        </p>
      `;

      risultato.querySelector('#azione-aggiorna').addEventListener('click', async () => {
        await saveConto({ ...conto, saldo_iniziale: saldoReale, data_saldo: todayISO() });
        toast('Saldo aggiornato');
        mostraDettaglio(state.conti.find(c => c.id === conto.id));
      });

      risultato.querySelector('#azione-rettifica').addEventListener('click', async () => {
        await saveMovimento({
          tipo: diff > 0 ? 'entrata' : 'spesa',
          importo: Math.abs(diff),
          conto: conto.nome,
          macrocategoria: 'Rettifica',
          categoria: 'Rettifica saldo',
          descrizione: `Rettifica saldo — riconciliazione ${fmtDate(todayISO())}`,
          note: `Saldo stimato: ${fmtEUR(saldoStimato)} → Saldo reale: ${fmtEUR(saldoReale)}`,
          data: todayISO(),
          origine: 'rettifica',
        });
        toast('Rettifica creata e visibile nello Storico');
        mostraDettaglio(state.conti.find(c => c.id === conto.id));
      });

      risultato.querySelector('#azione-ignora').addEventListener('click', () => {
        toast('Differenza ignorata per ora');
        risultato.innerHTML = '';
      });
    });
  }
};
