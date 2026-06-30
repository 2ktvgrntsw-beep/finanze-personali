# Finanze Personali PWA — v1.3 "Patrimonio Edition"

App offline-first per la gestione delle finanze personali, installabile su iPhone
come PWA. Nessun cloud, nessun account, nessuna API esterna: tutti i dati restano
sul dispositivo (IndexedDB), con backup/export manuale su Excel.

## Cosa c'è di nuovo nella v1.3

Rispetto alla v1.2, questa versione aggiunge l'intero quadro patrimoniale:

- **Patrimonio**: vista panoramica del patrimonio netto (Attività − Debiti), con
  rilevazione mensile salvata per costruire uno storico nel tempo
- **Conti**: conti raggruppati per tipologia (Liquidità, Risparmio, Investimenti,
  Asset, Debiti)
- **Mutuo**: scheda con dati chiave, piano di ammortamento completo (180 rate),
  gestione eventi straordinari (estinzioni parziali, anticipi rata, variazioni
  assicurazione, rinegoziazioni tasso)
- **Finanziamenti**: gestione finanziamenti con quota a carico parziale (split),
  wizard per aggiungerne di nuovi senza toccare l'Excel
- **Investimenti**: panoramica per conto/piattaforma
- **Nuovo Trasferimento**: terzo tipo di movimento (oltre Entrata/Spesa) per
  spostare denaro tra conti senza impattare il saldo periodo
- **Riconciliazione Conto**: confronto saldo stimato vs reale, con 3 modalità
  (aggiorna senza rettifica / crea rettifica / ignora)
- **Bulk Tag Tool**: applica un tag a centinaia di movimenti storici in un click
- **Analisi Tag**: lista tag con totali, drill-down, confronto affiancato tra due tag

## Refactoring rispetto alla v1.2

Oltre alle nuove funzionalità, questa versione include una revisione tecnica
mirata del motore dell'app (stessa interfaccia, stesso comportamento per
l'utente, codice più solido sotto il cofano):

- **Import Excel**: passato da N transazioni database sequenziali (una per riga,
  ~5.600 transazioni per l'import iniziale) a un'unica transazione bulk. L'app
  non si blocca più durante l'import dello storico
- **Parser date**: ora interpreta sempre e solo il formato europeo gg/mm/aaaa,
  senza ambiguità. *(La v1.2 in alcuni casi interpretava le date anche in
  formato USA MM/GG/AAAA quando giorno e mese erano entrambi ≤12 — corretto)*
- **Indici in memoria**: i movimenti sono indicizzati per anno/mese al
  caricamento, invece di essere scansionati linearmente ad ogni filtro
- **Categorie archiviabili**: invece di solo creare/eliminare, le categorie con
  storico possono essere archiviate (non più proposte per nuovi movimenti, ma
  ancora visibili e filtrabili nello storico)
- **Proiezione 30 giorni**: arricchita con una stima delle spese non ricorrenti
  basata sulla media mobile degli ultimi 3 mesi, invece di basarsi solo sui
  movimenti ricorrenti programmati (che da sola risultava sistematicamente
  troppo ottimistica)

## Import Excel

- Fogli **Movimenti** e **Anagrafica** riconosciuti automaticamente
- Fogli **Conti Iniziali**, **Mutuo**, **Finanziamenti** importabili come dati
  patrimoniali opzionali, proposti dopo l'import principale se presenti nel file
- Le date sono sempre interpretate in formato europeo gg/mm/aaaa

## Backup

- Nome file: `backup_GG-MM-AAAA.xlsx` (senza orario)
- **Nota**: più backup nello stesso giorno possono sovrascriversi a vicenda
- Il file di backup include anche un foglio `_Meta` con la versione dello schema
  dati, utile in futuro per verificare la compatibilità prima di un reimport

## Installazione locale

```bash
cd finanze-pwa
python3 -m http.server 8080
```

Poi apri `http://localhost:8080`

## GitHub Pages

Carica tutti i file del progetto in un repository GitHub pubblico e attiva
**Settings → Pages → main / root**.

## iPhone

Apri il sito in Safari → Condividi → Aggiungi alla schermata Home.

Dopo un aggiornamento dell'app (nuova versione caricata su GitHub Pages), può
essere necessario chiudere e riaprire l'app dalla schermata Home perché il
service worker scarichi la nuova versione (la cache si aggiorna automaticamente
al cambio di versione interna, ma il browser potrebbe servire la pagina già
aperta dalla cache per qualche istante in più).
