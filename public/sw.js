/* KaiPai service worker — Web Push handler.
 * Shows a native notification for each push and focuses/opens the app on click.
 * Kept intentionally minimal (no offline caching) so it only owns push. */

self.addEventListener('install', () => {
  // Activate immediately so push works right after the first subscribe.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'KaiPai', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'KaiPai';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/dashboard' },
    // Una chiamata in corso resta finché non la si guarda e vibra come tale;
    // gli altri avvisi mantengono il comportamento discreto di sempre.
    requireInteraction: data.requireInteraction === true,
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : undefined,
    // Con un `tag` ripetuto, il browser di default sostituisce la notifica in
    // silenzio: qui vogliamo che il secondo squillo si faccia sentire.
    renotify: Boolean(data.tag) && data.requireInteraction === true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, otherwise open a new one.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
