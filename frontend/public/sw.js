// Concept Stay Service Worker — handles Web Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Concept Stay', body: event.data.text() };
  }

  const title = data.title || 'Concept Stay';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: data.tag || 'conceptstay-notification',
    renotify: true,
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open with this URL or origin, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl)) {
            return client.focus();
          }
        }
      }
      // If any client exists, navigate and focus
      if (clientList.length > 0 && 'focus' in clientList[0]) {
        clientList[0].focus();
        if ('navigate' in clientList[0]) {
          return clientList[0].navigate(targetUrl);
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
