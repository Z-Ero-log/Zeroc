/* ============================================================
   Z-Ero CO₂ · Service Worker (PWA offline)
   ------------------------------------------------------------
   Ha d'estar al MATEIX directori que index.html.
   El registre ja es fa des de index.html: navigator.serviceWorker.register('./sw.js')

   Estratègies:
   - Navegació (l'HTML): network-first → cau a la còpia en caché (offline).
   - Google Fonts + llibreries CDN (firebase, jspdf, chartjs, qrcode, emailjs):
       stale-while-revalidate → carrega ràpid i s'actualitza en segon pla.
   - Google Maps / Firebase data / enviaments (POST): NO s'intercepten
       (l'app ja té la seva pròpia gestió offline / cua de sincronització).

   ⚠ Quan publiquis una versió nova de l'index, canvia CACHE_VERSION
      perquè els clients descartin la caché antiga.
   ============================================================ */

const CACHE_VERSION = 'zero-co2-v1';
const SHELL_CACHE   = CACHE_VERSION + '-shell';
const ASSET_CACHE   = CACHE_VERSION + '-assets';

// Recursos del propi directori que volem disponibles offline d'entrada.
// (No forcem cap nom d'arxiu concret perquè l'index pot dir-se index.html,
//  index_v76.html, etc. El document es cau a la caché la primera vegada
//  que es visita, via la lògica de navegació de més avall.)
const SHELL_URLS = ['./'];

// Hosts d'assets estàtics que SÍ ens interessa cachejar.
const ASSET_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',          // firebase-*-compat.js
  'cdn.jsdelivr.net',         // emailjs, html5-qrcode
  'cdnjs.cloudflare.com'      // jspdf, chart.js
];

// Hosts dinàmics que NO s'han de cachejar mai (sempre xarxa directa).
const NEVER_CACHE_HOSTS = [
  'maps.googleapis.com',
  'maps.gstatic.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'api.emailjs.com'
  // *.firebaseio.com i *.firebasedatabase.app es filtren per sufix més avall
];

/* ---------- INSTALL: pre-cachejar el shell mínim ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (cache) { return cache.addAll(SHELL_URLS); })
      .catch(function () { /* si '.' no es pot precachejar, no passa res */ })
      .then(function () { return self.skipWaiting(); })
  );
});

/* ---------- ACTIVATE: esborrar cachés antigues ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k.indexOf(CACHE_VERSION) !== 0) { return caches.delete(k); }
          return null;
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

/* ---------- Helpers ---------- */
function isNeverCache(url) {
  if (NEVER_CACHE_HOSTS.indexOf(url.hostname) !== -1) return true;
  // Firebase Realtime Database (qualsevol regió)
  if (/\.firebaseio\.com$/.test(url.hostname)) return true;
  if (/\.firebasedatabase\.app$/.test(url.hostname)) return true;
  return false;
}

function isAssetHost(url) {
  return ASSET_HOSTS.indexOf(url.hostname) !== -1;
}

// Stale-while-revalidate: serveix de caché i actualitza en segon pla.
function staleWhileRevalidate(request) {
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var network = fetch(request).then(function (resp) {
        // Cachejem respostes ok o opaques (cross-origin sense CORS).
        if (resp && (resp.ok || resp.type === 'opaque')) {
          try { cache.put(request, resp.clone()); } catch (e) {}
        }
        return resp;
      }).catch(function () { return cached; });
      return cached || network;
    });
  });
}

// Network-first per a la navegació (HTML): sempre l'última versió si hi ha xarxa.
function networkFirstDocument(request) {
  return caches.open(SHELL_CACHE).then(function (cache) {
    return fetch(request).then(function (resp) {
      if (resp && resp.ok) {
        try { cache.put(request, resp.clone()); } catch (e) {}
      }
      return resp;
    }).catch(function () {
      // Offline: torna la versió exacta cachejada, o l'arrel './', o l'últim HTML que tinguem.
      return cache.match(request)
        .then(function (m) { return m || cache.match('./'); })
        .then(function (m) {
          if (m) return m;
          return caches.match(request, { ignoreSearch: true });
        });
    });
  });
}

/* ---------- FETCH ---------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Només GET. POST/PUT (enviaments EmailJS, escriptures Firebase…) passen directes.
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Esquemes no http(s) (chrome-extension, data:, blob:…) → no intervenim.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Recursos dinàmics (maps, firebase data, tokens, emailjs API) → xarxa directa.
  if (isNeverCache(url)) return;

  // Navegació / document HTML → network-first amb fallback offline.
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(networkFirstDocument(req));
    return;
  }

  // Fonts i llibreries CDN conegudes → stale-while-revalidate.
  if (isAssetHost(url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Mateix origen (qualsevol altre recurs local) → stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Resta de cross-origin no llistat → xarxa directa (sense intervenir).
});
