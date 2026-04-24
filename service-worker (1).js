// ═══════════════════════════════════════════════
//  SERVICE WORKER — Mon Programme Santé PWA
//  Version : 1.0.0
// ═══════════════════════════════════════════════

const CACHE_NAME    = 'sante-app-v1';
const CACHE_STATIC  = 'sante-static-v1';

// Fichiers à mettre en cache pour fonctionner HORS-LIGNE
const FILES_TO_CACHE = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ── INSTALLATION ─────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Mise en cache des fichiers statiques');
      // On cache ce qu'on peut, on ignore les erreurs réseau (fonts)
      return Promise.allSettled(
        FILES_TO_CACHE.map(url => cache.add(url).catch(e => console.warn('[SW] Cache fail:', url)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATION ───────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_NAME)
          .map(k => { console.log('[SW] Suppression ancien cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH (stratégie Cache First, puis réseau) ──
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET et les extensions Chrome
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('chrome-extension')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Mettre à jour le cache en arrière-plan
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_STATIC).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      // Pas en cache : aller chercher sur le réseau
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_STATIC).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Hors-ligne et pas en cache : page de fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ═══════════════════════════════════════════════
//  NOTIFICATIONS PUSH PROGRAMMÉES
// ═══════════════════════════════════════════════

// Notifications reçues depuis le client principal
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    console.log('[SW] Notifications programmées reçues');
  }
  if (event.data && event.data.type === 'SHOW_NOTIF') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: event.data.tag || 'sante-notif',
      renotify: true,
      data: { url: '/index.html' }
    });
  }
});

// Clic sur une notification → ouvrir l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/index.html');
      }
    })
  );
});
