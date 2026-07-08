// attribuzioneInvestimenti.js — FONTE UNICA di verità per attribuire un trasferimento
// di investimento al suo conto di riferimento.
//
// PERCHÉ ESISTE: i dati storici dell'utente hanno il campo `contoDest` vuoto sui
// trasferimenti verso investimenti (sono classificati per cat/sub/desc, es. "PAC
// Fideuram", "Crypto"/"Deposito Binance"). Serve quindi inferire il conto. Questa
// logica era duplicata — e leggermente divergente — tra patrimonio.js e
// dettaglioInvestimento.js: due implementazioni della stessa regola possono dare
// numeri diversi per lo stesso strumento, il che in un'app di finanze è inaccettabile.
// Qui la regola è UNA, pura e testabile.

// Restituisce il NOME del conto investimento a cui appartiene il trasferimento `m`,
// oppure null se non attribuibile. `conti` è l'elenco completo dei conti.
// Priorità: 1) contoDest esplicito valido  2) parola chiave del nome conto nel testo
//           3) euristica crypto -> Binance.
export const contoDiTrasferimento = (m, conti) => {
  const nomiInvest = conti.filter(c => c.tipo === 'investimenti').map(c => c.nome);

  // 1) contoDest esplicito e valido (dato "nuovo", inserito dall'utente)
  if (m.contoDest && nomiInvest.includes(m.contoDest)) return m.contoDest;

  const testo = `${m.sub || ''} ${m.cat || ''} ${m.desc || ''}`.toLowerCase();

  // 2) parola chiave del nome conto (es. "Fideuram" da "PAC Fideuram")
  for (const nome of nomiInvest) {
    const chiave = nome.replace(/investimenti/i, '').trim().toLowerCase();
    if (chiave && testo.includes(chiave)) return nome;
  }

  // 3) euristica crypto -> Binance (se esiste un conto Binance)
  if (/crypto|binance|bitcoin|btc/.test(testo)) {
    const binance = nomiInvest.find(n => /binance/i.test(n));
    if (binance) return binance;
  }

  return null;
};

// True se il movimento è un trasferimento verso un investimento (usato per filtrare).
export const eInvestimento = (m, conti) => {
  if (m.tipo !== 'trasferimento') return false;
  if (m.macro === 'Investimenti') return true;
  const dest = conti.find(c => c.nome === m.contoDest);
  return dest ? dest.tipo === 'investimenti' : false;
};

// Nome dello "strumento" dentro un conto (PAC Fideuram, Crypto, ...): usato per il
// raggruppamento annidato. Ripiega su cat, poi desc, poi il conto stesso.
export const strumentoDiTrasferimento = (m, contoNome) => m.sub || m.cat || m.desc || contoNome;
