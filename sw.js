/* Service worker: cache offline del app shell + click en notificaciones. */
const CACHE = 'habits-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/storage.js',
  './js/habits.js',
  './js/notifications.js',
  './js/drive.js',
  './js/ui.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // solo cacheamos nuestro propio origen (Drive/Google van directo a red)
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached =>
      cached ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
    )
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { habitId, alarm } = e.notification.data || {};
  const target = alarm ? `./index.html?alarm=${habitId}` : './index.html';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes('index.html') || new URL(client.url).pathname.endsWith('/')) {
          client.focus();
          client.postMessage({ type: 'notification-click', habitId, alarm });
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
