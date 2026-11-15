// The site's service worker. It does ONE thing: show the push notifications
// the reader asked for (button "Ativar notificações", src/lib/push.ts) and
// open the story when they are tapped.
//
// It never touches the site's pages or files (no "fetch" handler, no cache):
// the site loads exactly as it would without it.
//
// It is registered only when the reader turns notifications on. Nobody who
// never clicked the button gets it.

self.addEventListener('install', () => {
  // A new version takes over at once instead of waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// A message from the API (backend/src/modules/push), already decrypted by the
// browser: { title, body, url, image, tag }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    // The small white symbol in Android's status bar.
    badge: '/badge-72.png',
    lang: 'pt-BR',
    data: { url: typeof data.url === 'string' ? data.url : '/' },
  };
  // The cover, large (Android and Windows; others ignore it).
  if (data.image) options.image = data.image;
  // Same story twice: the second replaces the first instead of piling up.
  if (data.tag) options.tag = data.tag;

  // Safari (and Chrome) require a notification for every push. Always one.
  event.waitUntil(self.registration.showNotification(data.title || 'Portal100Fronteiras', options));
});

// Tap: open the story, or bring to the front a tab already showing it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  // Only pages of this site, whatever the message says.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const path = new URL(url).pathname;
      for (const client of windows) {
        if (new URL(client.url).pathname === path && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});

// The browser renewed the subscription (it does so now and then): tell the
// API the new address and forget the old one, so notifications keep coming.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      let next = event.newSubscription;
      if (!next) {
        const config = await fetch('/api/push/config').then((r) => r.json()).catch(() => null);
        const key = config && config.data && config.data.publicKey;
        if (!key) return;
        next = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next.toJSON()),
      });
      if (old && old.endpoint !== next.endpoint) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: old.endpoint }),
        });
      }
    })().catch(() => undefined),
  );
});
