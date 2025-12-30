const CACHE_NAME = 'fogarolli-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/mobile.css',
  '/script.js',
  '/tv.js'
];

// Installera service worker och cacha filer
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Svara från cache om möjligt
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
