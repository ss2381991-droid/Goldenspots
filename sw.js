// Caches the app shell so GoldenSpots opens offline. Forecast, places and
// photos come from other sites and are cached by the app itself, so this
// worker only handles files from its own origin.

const VERSION = 'goldenspots-v1';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/dom.js',
  'js/geo.js',
  'js/geocode.js',
  'js/net.js',
  'js/photos.js',
  'js/scene.js',
  'js/score.js',
  'js/sky.js',
  'js/spots.js',
  'js/store.js',
  'js/sun.js',
  'js/weather.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for the app's own files so updates arrive as soon as you are
// online; the cached copy is the offline fallback.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
