self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: "流動待辦", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(self.registration.showNotification(message.title || "流動待辦", {
    body: message.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: message.tag || "flow-todo-reminder",
    data: { url: message.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      return existing.navigate(targetUrl);
    }
    return self.clients.openWindow(targetUrl);
  })());
});
