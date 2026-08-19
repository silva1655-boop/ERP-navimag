const CACHE = "mantek-v4";

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match("/index.html"))
  );
});

self.addEventListener("push", e => {
  if(!e.data) return;
  let payload;
  try{ payload=e.data.json(); }
  catch{ payload={title:"MANTEK ERP",body:e.data.text()}; }
  e.waitUntil(
    self.registration.showNotification(payload.title,{
      body:payload.body||"",
      icon:payload.icon||"/icon-192.png",
      badge:payload.badge||"/icon-192.png",
      tag:payload.tag||"mantek-notif",
      requireInteraction:payload.requireInteraction||false,
      data:payload.data||{},
      actions:payload.actions||[],
      vibrate:[200,100,200],
    })
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if(e.action==="cerrar") return;
  const page=e.notification.data?.page;
  e.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(all=>{
      for(const c of all){
        if(c.url.includes(self.location.origin)){
          c.focus();
          if(page) c.postMessage({type:"NAVIGATE",page});
          return;
        }
      }
      return clients.openWindow("/");
    })
  );
});
