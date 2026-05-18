const CACHE = 'neon-pinball-v3';
const ASSETS = [
  './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
  '../shared/coins.js'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{}))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
