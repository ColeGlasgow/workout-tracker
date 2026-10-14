// Offline: answer from cache at once, refresh the cache in the background.
// A new deploy shows up the next time the app opens.
const CACHE = 'reforged';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add('./'))); self.skipWaiting() });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  // the drop box is always live, never cached
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(e.request, {ignoreSearch: true});
    const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r }).catch(() => hit || Response.error());
    if (!hit) return net;
    e.waitUntil(net);
    return hit;
  })());
});
