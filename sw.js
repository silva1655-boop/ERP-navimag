const CACHE_NAME = "mantek-v3";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
];

// Install — cache static assets
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — delete old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — network first, fallback to cache
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // Never intercept Firebase, ImgBB, or external APIs
  if (
    url.includes("firestore.googleapis.com") ||
    url.includes("firebase") ||
    url.includes("imgbb.com") ||
    url.includes("ibb.co") ||
    url.includes("googleapis.com") ||
    url.includes("gstatic.com") ||
    e.request.method !== "GET"
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        // Offline fallback — serve from cache
        return caches.match(e.request)
          .then(cached => {
            if (cached) return cached;
            // For navigation requests, return index.html
            if (e.request.mode === "navigate") {
              return caches.match("/index.html");
            }
          });
      })
  );
});

// Push notifications (future use)
self.addEventListener("push", e => {
  if (!e.data) return;
  const data = e.data.json();
  self.registration.showNotification(data.title || "MANTEK ERP", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" }
  });
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow(e.notification.data?.url || "/")
  );
});
