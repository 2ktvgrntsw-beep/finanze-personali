// dettaglioInvestimento.js — Scheda di approfondimento di un conto/strumento di
// investimento: versato totale + grafico dell'andamento del versato nel tempo
// (cumulato), grande e interattivo al tocco, in stile Cockpit.

import { state } from '../core/store.js';
import { fmtEUR, escapeHtml, nomeMese } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { contoDiTrasferimento, eInvestimento } from '../services/attribuzioneInvestimenti.js';
import { costruisciSparkline, agganciaSparkline } from '../core/sparkline.js';

// Somma cumulata dei versamenti verso il conto/strumento dato, per mese.
// Predicato: il movimento appartiene al conto/strumento dato? (fonte unica per il conto)
const _appartiene = (m, nome, isStrumento) => {
  if (isStrumento) {
    const nomeLow = (nome || '').toLowerCase();
    return (m.sub && m.sub === nome) || (m.cat && m.cat === nome) ||
           (`${m.sub || ''} ${m.cat || ''} ${m.desc || ''}`.toLowerCase().includes(nomeLow));
  }
  return contoDiTrasferimento(m, state.conti) === nome;
};

// I dati storici hanno contoDest vuoto: l'attribuzione al conto usa la FONTE UNICA
// (attribuzioneInvestimenti.js), condivisa con la pagina Patrimonio, così i numeri
// coincidono. Per lo "strumento" (PAC Fideuram, Crypto...) il match resta su sub/cat/desc.
const _andamentoVersato = (nome, isStrumento) => {
  const movs = state.movimenti
    .filter(m => eInvestimento(m, state.conti) && _appartiene(m, nome, isStrumento))
    .sort((a, b) => a.data.localeCompare(b.data));
  if (!movs.length) return [];
  const perMese = {};
  for (const m of movs) {
    const am = m.data.slice(0, 7);
    perMese[am] = (perMese[am] || 0) + m.imp;
  }
  const mesi = Object.keys(perMese).sort();
  const primo = mesi[0], ultimo = mesi[mesi.length - 1];
  const [y0, m0] = primo.split('-').map(Number);
  const [y1, m1] = ultimo.split('-').map(Number);
  const out = [];
  let cum = 0, y = y0, mm = m0;
  while (y < y1 || (y === y1 && mm <= m1)) {
    const am = `${y}-${String(mm).padStart(2, '0')}`;
    cum += perMese[am] || 0;
    out.push({ label: nomeMese(mm - 1).slice(0, 3) + " '" + String(y).slice(2), mese: am, val: cum });
    mm++; if (mm > 12) { mm = 1; y++; }
  }
  return out;
};

const _graficoGrande = (punti) => {
  if (punti.length < 2) return '<div class="empty">Storico insufficiente per il grafico</div>';
  const datiGrafico = punti.map(p => ({ label: p.label, valore: p.val }));
  const { svg, dataAttr } = costruisciSparkline(datiGrafico, {
    vw: 320, vh: 150, padX: 12, padTop: 16, padBot: 30,
    idLinea: 'invl', idArea: 'inva',
    coloreLinea0: '#2E9BFF', coloreLinea1: '#22E39A',
    larghezzaLinea: 2.4, mostraEtichette: true, mostraUltimoPunto: true,
  });
  return `<div class="spark spark-big" ${dataAttr}>
    ${svg}
    <div class="spark-vline"></div>
    <div class="spark-tip"></div>
  </div>`;
};

export const renderDettaglioInvestimento = async (root, params = {}) => {
  const nome = params.conto || params.strumento || '';
  const isStrumento = !!params.strumento;
  document.getElementById('view-title').textContent = nome || 'Investimento';
  const punti = _andamentoVersato(nome, isStrumento);
  const versato = punti.length ? punti[punti.length - 1].val : 0;
  const nVersamenti = state.movimenti.filter(m => eInvestimento(m, state.conti) && _appartiene(m, nome, isStrumento)).length;

  root.innerHTML = `
    <div class="net-card">
      <div class="lbl">${escapeHtml(nome)} · versato</div>
      <div class="big num">${fmtEUR(versato)}</div>
      <div class="sub">
        <div><span class="lbl2">Versamenti</span><b class="num">${nVersamenti}</b></div>
        <div><span class="lbl2">Dal</span><b style="font-size:13px">${punti.length ? punti[0].label : '—'}</b></div>
      </div>
    </div>

    <div class="card spark-card" style="margin-top:14px">
      <div class="spark-title">Andamento versato nel tempo</div>
      ${_graficoGrande(punti)}
    </div>

    <p class="meta" style="text-align:center;margin-top:14px;line-height:1.5">
      Questo è il capitale <b>versato</b> cumulato. Il valore di mercato aggiornato
      lo trovi nell'app della piattaforma.
    </p>

    <button class="btn btn-secondary" id="vedi-mov" style="margin-top:14px">Vedi i versamenti</button>
  `;

  root.querySelector('#vedi-mov').addEventListener('click', () => navigate('movimenti', {
    tipo: 'trasferimento', periodo: 'anno', mese: new Date().toISOString().slice(0, 7),
  }));

  // interattività grafico: modulo condiviso (corregge anche la precisione della barra,
  // che qui non era mai stata allineata al fix fatto in spese/patrimonio)
  agganciaSparkline(root.querySelector('.spark'), fmtEUR);
};
