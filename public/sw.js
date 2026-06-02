self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'Cairo Confessions';
  const options = {
    body: data.body ?? 'You have a notification.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    navigator.setAppBadge(1).catch(() => {}),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  navigator.clearAppBadge().catch(() => {});
  event.waitUntil(clients.openWindow('/'));
});
