// ─────────────────────────────────────────────────────────────────────────────
// ROOT SERVICE WORKER — covers the launcher (index.html) and the shared/
// modules every game depends on. Scope is "./" so per-game service workers
// (e.g. pokemon-rush/sw.js) still take precedence inside their own folder;
// this SW only owns the launcher + shared assets + anything the user opens
// that doesn't have its own scoped worker.
//
// Strategy:
//   • HTML navigations  → NETWORK-FIRST, fall back to cache. Fresh content
//     reaches the user as soon as they're online; offline still works.
//   • Everything else   → CACHE-FIRST, fall back to network. Static assets
//     (scripts, images, fonts) stay snappy and survive offline reloads.
// ─────────────────────────────────────────────────────────────────────────────
const CACHE = 'arcade-shell-v1';

// The minimum shell that has to be cached at install time so the launcher
// works offline on first visit. Per-game SWs cache their own internals.
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './shared/profile.js',
  './shared/firebase.js',
  './shared/brutimon.js',
  './shared/brutimon/index.json',
  './shared/coins.js',
  './shared/cloud-sync.js',
  './shared/leaderboard.js',
  './shared/touch-dpad.js',
  './shared/touch-dpad.css',
  './shared/no-gestures.js',
  './shared/fullscreen.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Add the shell one URL at a time so a single 404 doesn't sink the
    // whole install. Anything that can't be fetched up-front will be cached
    // on demand by the fetch handler later.
    for(const url of SHELL){
      try { await c.add(url); } catch(_err){ /* best-effort */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  // Same-origin only — Firebase / CDN requests pass through untouched.
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if(!sameOrigin) return;

  const isHtml = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if(isHtml){
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return fresh;
      } catch (_e) {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if(cached) return cached;
    try {
      const fresh = await fetch(req);
      if(fresh && fresh.ok && fresh.type === 'basic'){
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch(_e){
      return cached || Response.error();
    }
  })());
});
