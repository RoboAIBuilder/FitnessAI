// Imported by the generated service worker: shows Web Push notifications from the FitnessAI API.
self.addEventListener('push', (event) => {
  let data = { title: 'FitnessAI', body: '', url: './' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: data.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
