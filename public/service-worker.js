// Self-destroying service worker. The previous host of this domain
// registered a worker at this URL; browsers that still have it check here
// for updates, pick this up, and are cleaned: unregister, drop all caches,
// and reload each open tab once so it loads worker-free.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.navigate(client.url));
    })(),
  );
});
