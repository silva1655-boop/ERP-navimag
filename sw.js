const CACHE = "mantek-v2";
const ASSETS = ["/", "/index.html", "/manifest.json"];

// ── Cache ────────────────────────────────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).catch(() => caches.match("/index.html"))
    )
  );
});

// ── Push: recibir notificación ──────────────────────────────────────────
self.addEventListener("push", e => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: "MANTEK ERP", body: e.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || "mantek-notif",
    requireInteraction: payload.requireInteraction || false,
    data: payload.data || {},
    actions: payload.actions || [],
    vibrate: [200, 100, 200],
  };

  e.waitUntil(
    self.registration.showNotification(payload.title || "MANTEK ERP", options)
  );
});

// ── Push: click en notificación ─────────────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "cerrar") return;

  const data = e.notification.data || {};
  const url = data.url || "/";
  const page = data.page;

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(windowClients => {
        // Si la app ya está abierta, enfocarla y navegar sin recargar.
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            if (page) client.postMessage({ type: "NAVIGATE", page, data });
            return;
          }
        }
        // Si no está abierta, abrir una ventana nueva.
        return clients.openWindow(url);
      })
  );
});

self.addEventListener("notificationclose", e => {
  console.log("Notificación cerrada:", e.notification.tag);
});
