// service-worker.js — Cache offline per la PWA.
// Strategia: cache-first per gli asset dell'app (funziona senza rete). Per aggiornare
// l'app dopo un deploy, basta incrementare CACHE_VERSION: il vecchio cache viene
// eliminato e i file ricaricati.

const CACHE_VERSION = 'finanze-v2.18.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './data/storico.js',
  './js/app.js',
  './js/core/db.js',
  './js/core/utils.js',
  './js/core/version.js',
  './js/core/store.js',
  './js/core/seed.js',
  './js/core/router.js',
  './js/core/icons.js',
  './js/services/attribuzioneInvestimenti.js',
  './js/services/movimentiService.js',
  './js/services/suggerimentiService.js',
  './js/services/contiService.js',
  './js/services/prestitiService.js',
  './js/services/patrimonioService.js',
  './js/services/categorieService.js',
  './js/services/ricorrentiService.js',
  './js/services/excelService.js',
  './js/services/backupService.js',
  './js/components/shared.js',
  './js/components/spese.js',
  './js/components/drill.js',
  './js/components/movimenti.js',
  './js/components/inserimento.js',
  './js/components/patrimonio.js',
  './js/components/ricorrenti.js',
  './js/components/analisi.js',
  './js/components/ricerca.js',
  './js/components/conti.js',
  './js/components/mutuo.js',
  './js/components/finanziamenti.js',
  './js/components/investimenti.js',
  './js/components/dettaglioInvestimento.js',
  './js/components/categorie.js',
  './js/components/impostazioni.js',
  './icons/icon-192.png?v=216',
  './icons/icon-512.png?v=216',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS).catch(err => {
        // se un asset (es. icone) manca, non bloccare l'installazione
        console.warn('Alcuni asset non messi in cache:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION && k !== CACHE_VERSION + '-cdn').map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Richieste esterne (CDN SheetJS): stale-while-revalidate — servi dalla cache se
  // presente, altrimenti rete + salva in cache. Dopo il primo avvio online, la
  // libreria Excel funziona anche offline.
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetched = fetch(e.request).then(resp => {
          if (resp && (resp.status === 200 || resp.type === 'opaque')) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION + '-cdn').then(c => c.put(e.request, copy));
          }
          return resp;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // Cache-first per gli asset locali
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // metti in cache le nuove richieste locali GET andate a buon fine
        if (e.request.method === 'GET' && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
