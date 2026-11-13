// Offline cache for the app shell. Bump VERSION when files change.
const VERSION = 'tasting-v13';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/note.js', 'js/guess.js', 'js/profiles.js',
  'js/scan.js', 'js/icons.js', 'js/sync.js', 'js/config.js', 'js/methods/index.js', 'js/methods/wset.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'fonts/libre-caslon-display-latin-400-normal.woff2', 'fonts/libre-caslon-text-latin-400-italic.woff2',
  'fonts/josefin-sans-latin-600-normal.woff2', 'fonts/courier-prime-latin-400-normal.woff2',
  'fonts/libre-caslon-display-latin-ext-400-normal.woff2', 'fonts/libre-caslon-text-latin-ext-400-italic.woff2',
  'fonts/josefin-sans-latin-ext-600-normal.woff2', 'fonts/courier-prime-latin-ext-400-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first (so updates arrive), falling back to cache when offline.
// 'no-cache' makes the browser check with the server every time instead of reusing
// its own HTTP cache (GitHub Pages lets files be cached for 10 minutes).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
