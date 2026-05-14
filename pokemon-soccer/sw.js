const CACHE = 'pokemon-soccer-v1';
const PRECACHE = ['./', './index.html', './manifest.json', '../shared/coins.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

function isHtmlOrSharedJs(req){
  const url = new URL(req.url);
  if(req.mode === 'navigate') return true;
  if(url.pathname.endsWith('.html')) return true;
  if(url.pathname.endsWith('/')) return true;
  if(url.pathname.endsWith('shared/coins.js')) return true;
  return false;
}

self.addEventListener('fetch', e => {
  if(isHtmlOrSharedJs(e.request)){
    e.respondWith(
      fetch(e.request).then(resp => {
        if(resp && resp.ok){
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if(resp && resp.ok && (e.request.url.includes('skin-pokemon') || e.request.url.includes('fonts.g'))){
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
      }
      return resp;
    }).catch(() => caches.match(e.request)))
  );
});
