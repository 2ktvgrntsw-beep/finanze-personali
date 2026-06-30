// pianoAmmortamento.js (NUOVO v1.3) — tabella completa del piano di ammortamento mutuo.
// Performance: il piano (fino a 180+ righe) è calcolato una sola volta al render,
// non ad ogni cambio filtro — il filtro agisce solo sull'array già calcolato.

import { state } from '../state.js';
import { fmtEUR, fmtDate } from '../utils.js';
import { calcolaPianoAmmortamento, eventiPerRiferimento } from '../services/mutuoService.js';
import { exportFullExcel } from '../services/excelService.js';

export const renderPianoAmmortamento = async (root) => {
  if (!state.mutuo) {
    root.innerHTML = '<div class="card empty">Nessun mutuo configurato. Vai in Patrimonio → Mutuo.</div>';
    return;
  }

  const eventi = eventiPerRiferimento('mutuo-principale');
  const piano = calcolaPianoAmmortamento(state.mutuo, eventi); // calcolato una sola volta

  const totali = piano.reduce((acc, r) => ({
    rate: acc.rate + r.rata,
    capitale: acc.capitale + r.quotaCapitale,
    interessi: acc.interessi + r.quotaInteressi,
  }), { rate: 0, capitale: 0, interessi: 0 });

  root.innerHTML = `
    <div class="card">
      <div class="filters">
        <select id="f-stato"><option value="tutte">Tutte</option><option value="future">Future</option><option value="pagate">Pagate</option></select>
      </div>
    </div>
    <div class="card" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px" id="tabella-piano">
        <thead><tr style="text-align:left;border-bottom:2px solid var(--border)">
          <th style="padding:6px 4px">#</th><th style="padding:6px 4px">Data</th><th style="padding:6px 4px">Rata</th><th style="padding:6px 4px">Cap.</th><th style="padding:6px 4px">Int.</th><th style="padding:6px 4px">Residuo</th>
        </tr></thead>
        <tbody id="righe-piano"></tbody>
      </table>
    </div>
    <div class="card">
      <h2>Totali</h2>
      <div class="mov-item"><div class="mov-left"><div class="desc">Totale rate</div></div><div class="mov-right">${fmtEUR(totali.rate)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Totale interessi</div></div><div class="mov-right spesa">${fmtEUR(totali.interessi)}</div></div>
      <div class="mov-item"><div class="mov-left"><div class="desc">Totale capitale</div></div><div class="mov-right">${fmtEUR(totali.capitale)}</div></div>
    </div>
    <div class="card"><button class="btn btn-secondary" id="esporta">Esporta piano completo</button></div>
  `;

  const corpoTabella = root.querySelector('#righe-piano');
  const renderRighe = (filtro) => {
    const arr = filtro === 'future' ? piano.filter(r => !r.pagata) : filtro === 'pagate' ? piano.filter(r => r.pagata) : piano;
    corpoTabella.innerHTML = arr.map(r => `
      <tr style="border-bottom:1px solid var(--border);${r.pagata ? 'opacity:.6' : ''}">
        <td style="padding:6px 4px">${r.pagata ? '✓' : ''} ${r.numero}</td>
        <td style="padding:6px 4px">${fmtDate(r.data)}</td>
        <td style="padding:6px 4px">${fmtEUR(r.rata)}</td>
        <td style="padding:6px 4px">${fmtEUR(r.quotaCapitale)}</td>
        <td style="padding:6px 4px">${fmtEUR(r.quotaInteressi)}</td>
        <td style="padding:6px 4px">${fmtEUR(r.residuo)}</td>
      </tr>`).join('');
  };

  root.querySelector('#f-stato').addEventListener('change', (e) => renderRighe(e.target.value));
  root.querySelector('#esporta').addEventListener('click', () => exportFullExcel());

  renderRighe('tutte');
};
