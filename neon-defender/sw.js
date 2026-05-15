// Bump the version string whenever neon-defender's HTML/JS/CSS changes —
// the activate handler deletes any cache whose name doesn't match this
// constant, forcing a fresh install on next load.
const CACHE = 'neon-defender-v5';
const PRECACHE = ['./', './index.html', './manifest.json', '../shared/coins.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for navigation / HTML / shared JS (so a deploy is visible on
// next reload without manual cache busting), cache-first for static assets
// like sprites and fonts (those are big and rarely change). Falls back to
// cache when the network is unreachable so offline play still works.
function isHtmlOrSharedJs(req){
  const url = new URL(req.url);
  if(req.mode === 'navigate') return true;
  if(url.pathname.endsWith('.html')) return true;
  if(url.pathname.endsWith('/')) return true;
  if(url.pathname.endsWith('/shared/coins.js') || url.pathname.endsWith('shared/coins.js')) return true;
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
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(resp => {
        if(resp && resp.ok && (e.request.url.includes('fonts.g') || e.request.url.includes('/icons/') || e.request.url.includes('/assets/'))){
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
