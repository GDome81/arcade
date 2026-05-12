const CACHE = 'pixel-platformer-v1';
const PRECACHE = [
  './', './index.html', './manifest.json', '../shared/coins.js',
  './assets/player_idle.png', './assets/player_walk_a.png', './assets/player_walk_b.png',
  './assets/player_jump.png', './assets/player_duck.png',
  './assets/ground.png', './assets/ground_inner.png',
  './assets/coin.png', './assets/flag.png',
  './assets/slime_rest.png', './assets/slime_walk_a.png', './assets/slime_walk_b.png',
  './assets/bg.png'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => e.respondWith(
  caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
    if(resp.ok && e.request.url.includes('/assets/')){
      const clone = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
    }
    return resp;
  }).catch(() => cached))
));
