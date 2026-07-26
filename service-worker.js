const CACHE_NAME = 'habit-tracker-v3.1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './habit_tracker_dashboard.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: cache-first strategy with network fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// Background Sync: queue failed requests and retry when online
self.addEventListener('sync', (event) => {
  if (event.tag === 'habit-sync') {
    event.waitUntil(syncHabits());
  }
});

function syncHabits() {
  return new Promise((resolve) => {
    console.log('Background sync triggered');
    resolve();
  });
}

// Periodic Background Sync: refresh data daily
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'habit-daily-sync') {
    event.waitUntil(periodicSyncHabits());
  }
});

function periodicSyncHabits() {
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.addAll(STATIC_ASSETS).then(() => {
      console.log('Periodic sync: assets refreshed');
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'PERIODIC_SYNC_COMPLETE', timestamp: Date.now() });
        });
      });
    });
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Habit Tracker', body: 'Keep up with your habits!' };
  }

  const title = data.title || 'Habit Tracker';
  const options = {
    body: data.body || 'Time to check in on your habits!',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'habit-reminder',
    requireInteraction: false,
    renotify: false,
    data: data.data || { url: './habit_tracker_dashboard.html' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : './habit_tracker_dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Message handler from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
