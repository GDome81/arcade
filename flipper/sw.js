const CACHE = 'neon-pinball-v5';
const ASSETS = [
  './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
  '../shared/coins.js'
];
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => c.addAll(ASSETS).catch(()=>{}))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys
      .filter(k => k.startsWith('neon-pinball-') && k !== CACHE)
      .map(k => caches.delete(k))
    ))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
