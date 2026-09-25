// ═══════════════════════════════════════════════════════
//   Service Worker — PWA + Push Notifications
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'attendance-v3';
const RUNTIME_CACHE = 'attendance-runtime-v3';

const DEFAULT_ICON = 'https://placehold.co/192x192/2563eb/ffffff?text=ح';

const PRECACHE_URLS = [
  '/attendance-system/',
  '/attendance-system/index.html',
  '/attendance-system/pages/dashboard.html'
];

// ═══ Install ═══
self.addEventListener('install', (event) => {
  console.log('🔧 SW: Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('⚠️ Precache partial fail:', err.message);
      });
    })
  );

  self.skipWaiting();
});

// ═══ Activate ═══
self.addEventListener('activate', (event) => {
  console.log('✅ SW: Activated');

  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter(n => n !== CACHE_NAME && n !== RUNTIME_CACHE)
          .map(n => caches.delete(n))
      );
    })
  );

  self.clients.claim();
});

// ═══ Fetch ═══
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('imgbb') ||
    url.hostname.includes('catbox') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('unpkg') ||
    url.hostname.includes('placehold') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(c => {
          return c || caches.match('/attendance-system/index.html');
        });
      })
  );
});

// ═══ Push ═══
self.addEventListener('push', (event) => {
  console.log('🔔 Push received');

  let data = {
    title: '🔔 إشعار جديد',
    body: 'لديك إشعار جديد',
    icon: DEFAULT_ICON,
    badge: DEFAULT_ICON,
    data: { url: '/attendance-system/pages/dashboard.html' }
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: data.data,
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200]
    })
  );
});

// ═══ Notification Click ═══
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || '/attendance-system/pages/dashboard.html';

  if (data.tab) targetUrl += `?tab=${data.tab}`;
  if (data.chatId) targetUrl += `&chatId=${data.chatId}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/attendance-system/') && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', data });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ═══ Message ═══
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();

  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, data, icon } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: icon || DEFAULT_ICON,
      badge: icon || DEFAULT_ICON,
      dir: 'rtl',
      lang: 'ar',
      data: data || {},
      vibrate: [200, 100, 200]
    });
  }
});
