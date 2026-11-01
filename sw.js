/* Service worker: offline dla aplikacji i danych, cache obrazków stworków. */
const VERSION = 'v1';
const SHELL = `pokedex-shell-${VERSION}`;
const IMG = 'pokedex-img-v1';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'data/pokemon.json', 'data/cards.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('pokedex-') && k !== SHELL && k !== IMG).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pliki aplikacji i dane: stale-while-revalidate
  if (url.origin === location.origin) {
    e.respondWith(caches.open(SHELL).then(async cache => {
      const key = req.mode === 'navigate' ? 'index.html' : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const net = fetch(req).then(res => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => cached);
      return cached || net;
    }));
    return;
  }

  // Grafiki stworków (CORS z raw.githubusercontent.com): cache-first
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/PokeAPI/sprites/')) {
    e.respondWith(caches.open(IMG).then(async cache => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && res.type === 'cors') cache.put(req, res.clone());
      return res;
    }));
  }
  // Obrazki kart TCG idą przez zwykły cache HTTP przeglądarki.
});
