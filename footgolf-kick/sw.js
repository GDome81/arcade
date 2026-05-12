const CACHE = 'footgolf-v1';
const PRECACHE = ['./','./index.html','./manifest.json','../shared/coins.js','./assets/ball.png'];
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
