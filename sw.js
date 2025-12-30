// sw.js
const CACHE_NAME = 'foga-logistik-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './mobile.css',
  './script.js',
  './tv.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
