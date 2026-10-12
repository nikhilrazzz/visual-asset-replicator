// Mafia push notification worker. Handles push + clicks only; it never caches pages.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = { title: "Mafia", body: "You have a new notification", url: "/inbox", tag: undefined };
  try { if (event.data) d = { ...d, ...event.data.json() }; } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag,
      renotify: !!d.tag,
      data: { url: d.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/inbox", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          try { await w.navigate(url); } catch (_) { w.postMessage({ type: "open", url }); }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
