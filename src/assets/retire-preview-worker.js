/* Retire only the former /new/ worker. Never delete the root worker's caches. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (new URL(self.registration.scope).pathname !== '/new/') return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('ngsw:/new/:')).map(key => caches.delete(key)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({type: 'window'});
    await Promise.all(windows.map(client => {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin || !url.pathname.startsWith('/new/')) return;
      url.pathname = url.pathname.slice(4) || '/';
      return client.navigate(url.href);
    }));
  })());
});
