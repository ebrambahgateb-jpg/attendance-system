// ═══════════════════════════════════════════════════════
//   Service Worker — PWA + Push Notifications
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'attendance-v1';
const RUNTIME_CACHE = 'attendance-runtime-v1';

// ⚡ الملفات الأساسية
const PRECACHE_URLS = [
  '/attendance-system/',
  '/attendance-system/index.html',
  '/attendance-system/pages/dashboard.html'
];

// ═══ Install ═══
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Precaching files');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('⚠️ Precache partial fail:', err.message);
      });
    })
  );

  self.skipWaiting();
});

// ═══ Activate ═══
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: Activated');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => {
            console.log('🗑️ Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );

  self.clients.claim();
});

// ═══ Fetch (Network first, fallback to cache) ═══
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ⚡ تجاهل Firebase, ImgBB, Catbox, CDN
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('imgbb') ||
    url.hostname.includes('catbox') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('unpkg') ||
    event.request.method !== 'GET'
  ) {
    return; // ⚡ بدون Cache
  }

  // ⚡ Network first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // ⚡ احفظ نسخة
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // ⚡ Offline → جيب من الـCache
        return caches.match(event.request).then(cached => {
          return cached || caches.match('/attendance-system/index.html');
        });
      })
  );
});

// ═══════════════════════════════════════════════════════
//   Push Notifications
// ═══════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  console.log('🔔 Push received:', event);

  let data = {
    title: '🔔 إشعار جديد',
    body: 'لديك إشعار جديد في نظام الحضور',
    icon: 'https://i.ibb.co/icon-192.png',
    badge: 'https://i.ibb.co/icon-192.png',
    tag: 'default',
    data: {
      url: '/attendance-system/pages/dashboard.html'
    }
  };

  // ⚡ لو فيه data
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: data.actions || []
    })
  );
});

// ═══════════════════════════════════════════════════════
//   Notification Click — Open Related Page
// ═══════════════════════════════════════════════════════

self.addEventListener('notificationclick', (event) => {
  console.log('👆 Notification clicked:', event);

  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || '/attendance-system/pages/dashboard.html';

  // ⚡ لو فيه tab محدد
  if (data.tab) {
    targetUrl += `?tab=${data.tab}`;
  }

  // ⚡ لو فيه chatId
  if (data.chatId) {
    targetUrl += `&chatId=${data.chatId}`;
  }

  // ⚡ لو فيه eventId
  if (data.eventId) {
    targetUrl += `&eventId=${data.eventId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // ⚡ لو الموقع مفتوح → focus عليه + ابعتله رسالة
      for (const client of clientList) {
        if (client.url.includes('/attendance-system/') && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            data: data
          });
          return client.focus();
        }
      }

      // ⚡ لو مش مفتوح → افتحه
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ═══════════════════════════════════════════════════════
//   Message from App
// ═══════════════════════════════════════════════════════

self.addEventListener('message', (event) => {
  console.log('💬 Message from app:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, data } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: 'https://i.ibb.co/icon-192.png',
      badge: 'https://i.ibb.co/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: data || {},
      vibrate: [200, 100, 200]
    });
  }
});
