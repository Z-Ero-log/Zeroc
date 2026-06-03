// sw.js — Service Worker · Logística Z-Ero CO₂ · Milla Verda S.L. (PWA offline)
// Puja aquest fitxer al MATEIX directori que index.html (ex: z-ero-log.github.io/Zeroc/sw.js)
const CACHE = 'zero-co2-v66';
const SHELL = ['./', './index.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // Carregar la pàgina: prova la xarxa primer i, si no hi ha connexió, serveix la còpia en cau
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy).catch(function () {}); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // Altres recursos (scripts CDN, etc.): primer la cau, després actualitza en segon pla
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy).catch(function () {}); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
