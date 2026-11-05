const CACHE_VERSION = 'revive-shell-v6';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/revive-192.svg', '/icons/revive-512.svg', '/asset-manifest.json'];
const isPublicAsset = url => url.origin === self.location.origin && !url.search &&
  (SHELL.includes(url.pathname) || /^\/assets\/[^/]+\.(?:js|css|woff2?|svg|png|jpe?g|webp|avif)$/.test(url.pathname));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Cache every emitted public chunk on the first visit, even before this worker controls the page.
    const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Public asset manifest unavailable');
    const manifest = await response.clone().json();
    const assets = Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css || []), ...(entry.assets || [])])
      .filter(Boolean).map(file => new URL('/' + file, self.location.origin))
      .filter(isPublicAsset).map(url => url.pathname);
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll([...new Set([...SHELL.filter(file => file !== '/asset-manifest.json'), ...assets])]);
    await cache.put('/asset-manifest.json', response);
    // No automatic window reload: saved intentions and unsent form text stay in their current page.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).filter(key => key !== CACHE_VERSION &&
      (key.startsWith('revive-shell-') || /^revive-v\d+$/.test(key)));
    // Keep one previous shell for an older tab's lazy assets; never touch private IndexedDB.
    await Promise.all(previous.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.status >= 500) throw new Error('Public shell temporarily unavailable');
      return response;
    }).catch(async () => {
      const shell = await caches.open(CACHE_VERSION);
      return await shell.match('/index.html') || Response.error();
    }));
    return;
  }
  if (!isPublicAsset(url)) return;
  event.respondWith((async () => {
    const own = await caches.open(CACHE_VERSION);
    const cached = await own.match(request);
    if (cached) return cached;
    const previous = (await caches.keys()).filter(key => key !== CACHE_VERSION &&
      (key.startsWith('revive-shell-') || /^revive-v\d+$/.test(key)));
    for (const key of previous.reverse()) {
      const old = await (await caches.open(key)).match(request);
      if (old) return old;
    }
    const response = await fetch(request);
    if (response.ok) await own.put(request, response.clone());
    return response;
  })());
});
