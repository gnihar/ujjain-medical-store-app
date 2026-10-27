const CACHE_NAME = 'akshay-medicose-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/qr.html',
  '/install.html',
  '/css/styles.css',
  '/js/i18n.js',
  '/js/qrcode.js',
  '/js/receipt.js',
  '/js/voice.js',
  '/js/storeEngine.js',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
