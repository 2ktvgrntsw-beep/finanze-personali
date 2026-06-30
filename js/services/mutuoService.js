// mutuoService.js (NUOVO v1.3) — gestione mutuo: piano di ammortamento, capitale
// residuo, eventi straordinari.
//
// Logica di calcolo (rata costante, metodo francese — standard per i mutui italiani
// a tasso fisso): per ogni rata, la quota interessi è calcolata sul capitale residuo
// del mese precedente; la quota capitale è il resto della rata fissa.
//
// Eventi straordinari supportati: estinzione_parziale, anticipo_rata, variazione_assicurazione,
// rinegoziazione_tasso (aggiunta in v1.3 su suggerimento in fase di revisione: il mutuo
// di Lorenzo ha già avuto un cambio banca/condizioni in passato — Banca Interprovinciale
// → Credem — quindi è un evento che può ripresentarsi e va previsto, non solo le
// estinzioni parziali già presenti nel mockup).

import { dbAdd, dbDelete, dbAll } from '../db.js';
import { uid, round2 } from '../utils.js';
import { refreshAll, state } from '../state.js';

export const saveMutuo = async (m) => {
  const obj = {
    id: 'mutuo-principale', // un solo mutuo gestito in v1.3, come da progetto
    importo_iniziale: round2(Number(m.importo_iniziale) || 0),
    tasso: Number(m.tasso) || 0, // percentuale annua, es. 2.00
    durata_mesi: parseInt(m.durata_mesi, 10) || 0,
    rata_mensile: round2(Number(m.rata_mensile) || 0),
    data_inizio: m.data_inizio,
    banca: m.banca || '',
    quota_utente_percentuale: Number(m.quota_utente_percentuale ?? 100),
  };
  await dbAdd('mutuo', obj);
  await refreshAll();
  return obj;
};

export const saveEventoStraordinario = async (e) => {
  const obj = {
    id: e.id || uid(),
    riferimento_id: e.riferimento_id || 'mutuo-principale', // mutuo o id finanziamento
    tipo: e.tipo, // 'estinzione_parziale' | 'anticipo_rata' | 'variazione_assicurazione' | 'rinegoziazione_tasso'
    data: e.data,
    importo: e.importo != null ? round2(Number(e.importo)) : null,        // per estinzione/anticipo/variazione
    nuovo_tasso: e.nuovo_tasso != null ? Number(e.nuovo_tasso) : null,    // solo per rinegoziazione_tasso
    note: e.note || '',
  };
  await dbAdd('eventi_straordinari', obj);
  await refreshAll();
  return obj;
};

export const deleteEventoStraordinario = async (id) => {
  await dbDelete('eventi_straordinari', id);
  await refreshAll();
};

export const eventiPerRiferimento = (riferimentoId) =>
  state.eventiStraordinari.filter(e => e.riferimento_id === riferimentoId).sort((a, b) => a.data.localeCompare(b.data));

// Genera il piano di ammortamento completo (metodo francese, rata costante),
// applicando gli eventi straordinari registrati nell'ordine cronologico in cui sono
// accaduti. Ogni rata dell'array di output: { numero, data, rata, quotaCapitale,
// quotaInteressi, residuo, pagata }.
export const calcolaPianoAmmortamento = (mutuo, eventi = []) => {
  if (!mutuo || !mutuo.importo_iniziale || !mutuo.durata_mesi) return [];

  const piano = [];
  let residuo = mutuo.importo_iniziale;
  let tassoCorrente = mutuo.tasso;
  let rataCorrente = mutuo.rata_mensile;
  const tassoMensile = () => tassoCorrente / 100 / 12;

  const dataInizio = new Date(mutuo.data_inizio);
  const oggi = new Date();
  const eventiOrdinati = [...eventi].sort((a, b) => a.data.localeCompare(b.data));

  for (let i = 1; i <= mutuo.durata_mesi && residuo > 0.01; i++) {
    const dataRata = new Date(dataInizio);
    dataRata.setMonth(dataRata.getMonth() + i);
    const dataRataISO = dataRata.toISOString().slice(0, 10);

    // Applica eventi straordinari avvenuti prima di questa rata (non ancora applicati)
    for (const ev of eventiOrdinati) {
      if (ev._applicato || ev.data > dataRataISO) continue;
      if (ev.tipo === 'estinzione_parziale' || ev.tipo === 'anticipo_rata') {
        residuo = round2(Math.max(0, residuo - (ev.importo || 0)));
      } else if (ev.tipo === 'rinegoziazione_tasso' && ev.nuovo_tasso != null) {
        tassoCorrente = ev.nuovo_tasso;
        // Ricalcola la rata sul residuo e sulla durata rimanente con il nuovo tasso,
        // come avviene realmente in una rinegoziazione con la banca.
        const mesiRimanenti = mutuo.durata_mesi - i + 1;
        const tm = tassoCorrente / 100 / 12;
        rataCorrente = tm === 0
          ? round2(residuo / mesiRimanenti)
          : round2(residuo * tm / (1 - Math.pow(1 + tm, -mesiRimanenti)));
      }
      ev._applicato = true;
    }

    if (residuo <= 0.01) break;

    const quotaInteressi = round2(residuo * tassoMensile());
    let quotaCapitale = round2(rataCorrente - quotaInteressi);
    if (quotaCapitale > residuo) quotaCapitale = residuo; // ultima rata: non superare il residuo
    residuo = round2(residuo - quotaCapitale);

    piano.push({
      numero: i,
      data: dataRataISO,
      rata: round2(quotaCapitale + quotaInteressi),
      quotaCapitale,
      quotaInteressi,
      residuo,
      pagata: dataRataISO <= oggi.toISOString().slice(0, 10),
    });
  }

  return piano;
};

// Stato sintetico del mutuo "a oggi", usato dalla scheda Mutuo e dalla Dashboard Patrimonio.
export const statoMutuoOggi = (mutuo, eventi = []) => {
  const piano = calcolaPianoAmmortamento(mutuo, eventi);
  if (!piano.length) return null;

  const ratePagate = piano.filter(r => r.pagata);
  const ultimaPagata = ratePagate[ratePagate.length - 1];
  const prossima = piano.find(r => !r.pagata);
  const residuoCapitale = ultimaPagata ? ultimaPagata.residuo : mutuo.importo_iniziale;
  const restituitoFinora = round2(mutuo.importo_iniziale - residuoCapitale);
  const percentualeCompletamento = round2((ratePagate.length / piano.length) * 100);
  const quotaUtente = round2((mutuo.quota_utente_percentuale ?? 100) / 100 * (prossima?.rata ?? mutuo.rata_mensile));

  return {
    rataMensile: prossima?.rata ?? mutuo.rata_mensile,
    quotaUtente,
    residuoCapitale,
    restituitoFinora,
    ratePagate: ratePagate.length,
    rateTotali: piano.length,
    percentualeCompletamento,
    prossimaRataData: prossima?.data ?? null,
    dataFinePrevista: piano[piano.length - 1]?.data ?? null,
    tassoAttuale: piano.length ? mutuo.tasso : mutuo.tasso, // resta il tasso registrato sul mutuo; il piano riflette eventuali rinegoziazioni internamente
  };
};
