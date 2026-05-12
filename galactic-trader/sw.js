const CACHE = 'galactic-trader-v1';
const ASSETS = [
  './index.html', './manifest.json',
  './assets/player.png', './assets/pirate.png', './assets/pirate2.png',
  './assets/asteroid_big.png', './assets/asteroid_med.png', './assets/asteroid_small.png',
  './assets/asteroid_big2.png', './assets/asteroid_med2.png',
  './assets/laser_blue.png', './assets/laser_red.png',
  './assets/pickup_credits.png', './assets/pickup_rare.png', './assets/pickup_shield.png',
  './assets/bg_tile.png',
  './icons/icon-192.png', './icons/icon-512.png',
  '../shared/coins.js', '../shared/touch-dpad.js', '../shared/touch-dpad.css'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})) ));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
