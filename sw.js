const CACHE = 'drift-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

const scheduledTimers = new Map();

function clearScheduledTimers() {
  for (const timer of scheduledTimers.values()) {
    clearTimeout(timer);
  }
  scheduledTimers.clear();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'CANCEL_NOTIFICATIONS') {
    clearScheduledTimers();
    if (self.registration && self.registration.getNotifications) {
      event.waitUntil(
        self.registration.getNotifications().then((list) => {
          list.forEach((n) => {
            if (n.tag && n.tag.indexOf('drift-') === 0) n.close();
          });
        })
      );
    }
    return;
  }

  if (data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = data;
    if (self.registration && self.registration.showNotification) {
      event.waitUntil(self.registration.showNotification(title, options || {}));
    }
    return;
  }

  if (data.type === 'SCHEDULE_NOTIFICATIONS' && Array.isArray(data.items)) {
    clearScheduledTimers();
    data.items.forEach((item) => {
      const delay = Math.max(0, item.fireAt - Date.now());
      if (delay > 86400000) return;
      const timer = setTimeout(() => {
        scheduledTimers.delete(item.tag);
        if (self.registration && self.registration.showNotification) {
          self.registration.showNotification(item.title, {
            body: item.body,
            tag: item.tag,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
            renotify: true,
            data: { url: './' }
          });
        }
      }, delay);
      scheduledTimers.set(item.tag, timer);
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
