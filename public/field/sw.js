const CACHE = "cz-field-shell-v9";
const SHELL = ["/field/", "/field/field.css", "/field/field.js", "/field/icon-192.png", "/field/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (!url.pathname.startsWith("/field/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request, { ignoreSearch: true }).then(match => match || caches.match("/field/"))));
});

self.addEventListener("push", event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(message.title || "Comfort Zone Field Service", {
    body: message.body || "You have a maintenance update.", icon: "/field/icon-192.png", badge: "/field/icon-192.png",
    data: { url: message.url && message.url.startsWith("/field/") ? message.url : "/field/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/field/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const existing = windows.find(window => window.url.startsWith(self.location.origin + "/field/"));
    if (existing) return existing.navigate(url).then(window => window.focus());
    return self.clients.openWindow(url);
  }));
});
