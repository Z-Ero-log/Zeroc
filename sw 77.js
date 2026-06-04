/* ============================================================
   Z-Ero CO₂ · Milla Verda S.L. — Service Worker
   Versió: v76
   Funcionament offline de la plataforma de gestió UCO.
   ============================================================ */

const APP_VERSION = 'v76';
const CACHE_NAME   = 'zero-co2-' + APP_VERSION;

/* App-shell: fitxers bàsics per arrencar sense connexió.
   La majoria de recursos (logos, icones, manifest) van incrustats
   com a data-URI dins de l'index, així que aquí n'hi ha prou amb
   el document principal. */
const APP_SHELL = [
  './',
  './index.html'
];

/* ---------- INSTAL·LACIÓ: precarrega l'app-shell ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () {
        /* si algun fitxer no existeix, no bloquegem la instal·lació */
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ---------- ACTIVACIÓ: esborra versions antigues ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key.indexOf('zero-co2-') === 0 && key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;

  /* Només GET i mateix origen es gestionen per la cache */
  if (req.method !== 'GET') return;

  var sameOrigin = req.url.indexOf(self.location.origin) === 0;
  if (!sameOrigin) return; // peticions externes (Firebase, fonts, etc.) van directes a la xarxa

  var isNavigation =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isNavigation) {
    /* NETWORK-FIRST per a la navegació: així sempre s'agafa
       l'última versió de l'index quan hi ha connexió, i es cau
       a la còpia en cache quan estem offline. */
    event.respondWith(
      fetch(req).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put('./index.html', copy);
        });
        return resp;
      }).catch(function () {
        return caches.match('./index.html').then(function (cached) {
          return cached || caches.match('./');
        });
      })
    );
    return;
  }

  /* CACHE-FIRST per a la resta de recursos del mateix origen */
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return resp;
      });
    })
  );
});

/* ---------- Missatge per forçar actualització immediata ---------- */
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
