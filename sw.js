// Service worker: la app funciona sin internet y se actualiza sola cuando hay conexión.
// Estrategia: primero la red (para tener siempre la última versión); si no hay red, la copia guardada.
const CACHE = 'syng-v26';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/app.js', './js/audio.js', './js/pitch.js', './js/store.js', './js/ui.js',
  './js/curriculum.js', './js/exercises.js', './js/songs.js', './js/analysis.js',
  './js/coach.js', './js/voice.js', './js/lines.js', './js/adapt.js', './js/songcoach.js', './js/game.js', './js/shift.js', './js/voicemap.js', './js/energy.js', './js/fun.js', './js/resources.js', './js/account.js', './js/profe.js', './js/findnote.js', './js/myvoice.js', './js/miccheck.js', './js/cancionero.js', './js/comfort.js', './js/sheet.js', './js/clase.js', './audio/manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './img/logo-96.png',
  './img/chincol-feliz.webp', './img/chincol-hola.webp', './img/chincol-atento.webp', './img/chincol-piensa.webp', './img/chincol-celebra.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return; // la cuenta nunca se guarda en caché
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
