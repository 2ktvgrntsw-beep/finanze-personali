// service-worker.js — cache offline-first.
//
// REFACTORING v1.3: VERSION incrementata da v1.1.0 a v1.3.0. È un cambio critico,
// non solo cosmetico: cambiare la stringa VERSION è ciò che fa scattare l'evento
// 'activate' che cancella la vecchia cache e ne installa una nuova — senza questo
// incremento, chi aggiorna l'app da v1.2 continuerebbe a usare i vecchi file
// cachati e i nuovi componenti (Patrimonio, Mutuo, ecc.) non funzionerebbero offline.
// La lista CORE è stata estesa con tutti i nuovi file v1.3 (9 componenti + 3 service).

const VERSION = 'finanze-v1.3.0';

const CORE = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/app.js', './js/db.js', './js/state.js', './js/utils.js', './js/router.js',

  // Componenti v1.2 (rifattorizzati)
  './js/components/dashboard.js', './js/components/movimento.js', './js/components/storico.js',
  './js/components/ricorrenti.js', './js/components/statistiche.js', './js/components/budget.js',
  './js/components/impostazioni.js', './js/components/importExport.js',

  // Componenti NUOVI v1.3
  './js/components/patrimonio.js', './js/components/conti.js', './js/components/mutuo.js',
  './js/components/pianoAmmortamento.js', './js/components/finanziamenti.js',
  './js/components/nuovoTrasferimento.js', './js/components/investimenti.js',
  './js/components/riconciliazione.js', './js/components/tagAnalisi.js',

  // Services v1.2 (rifattorizzati)
  './js/services/movimentiService.js', './js/services/ricorrentiService.js', './js/services/budgetService.js',
  './js/services/categorieService.js', './js/services/contiService.js', './js/services/tagService.js',
  './js/services/backupService.js', './js/services/excelService.js',

  // Services NUOVI v1.3
  './js/services/mutuoService.js', './js/services/finanziamentiService.js', './js/services/patrimonioService.js',

  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request)
        .then((r) => {
          const c = r.clone();
          caches.open(VERSION).then((cache) => cache.put(e.request, c));
          return r;
        })
        .catch(() => cached)
    )
  );
});
