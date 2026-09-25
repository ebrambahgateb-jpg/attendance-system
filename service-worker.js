// ═══════════════════════════════════════════════════════
//   Service Worker — PWA + FCM Push Notifications
//   ⚠️ Service Worker يستخدم importScripts — مش import
// ═══════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// ═══ Firebase Config ═══
const firebaseConfig = {
  apiKey: "AIzaSyBVmfrzut1QEvUGOwfA8us7Kvz_vDC1FOA",
  authDomain: "attendance-system-2dc6f.firebaseapp.com",
  projectId: "attendance-system-2dc6f",
  storageBucket: "attendance-system-2dc6f.firebasestorage.app",
  messagingSenderId: "288395797724",
  appId: "1:288395797724:web:20f2277013c8d0966e4019"
};

// ⚡ Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  // ⚡ Background message handler
  messaging.onBackgroundMessage((payload) => {
    console.log('🔔 FCM Background message:', payload);

    const notification = payload.notification || {};
    const data = payload.data || {};

    const notificationOptions = {
      body: notification.body || data.body || '',
      icon: notification.icon || data.icon || 'https://placehold.co/192x192/2563eb/ffffff?text=ح',
      badge: 'https://placehold.co/96x96/2563eb/ffffff?text=ح',
      tag: data.tag || 'default',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200],
      data: data
    };

    self.registration.showNotification(
      notification.title || data.title || '🔔 إشعار جديد',
      notificationOptions
    );
  });

  console.log('✅ Firebase Messaging initialized in SW');
} catch (err) {
  console.warn('⚠️ Firebase SW init error:', err.message);
}

// ═══ Cache ═══
const CACHE_NAME = 'attendance-v4';
const RUNTIME_CACHE = 'attendance-runtime-v4';

const DEFAULT_ICON = 'https://placehold.co/192x192/2563eb/ffffff?text=ح';

const PRECACHE_URLS = [
  '/attendance-system/',
  '/attendance-system/index.html',
  '/attendance-system/pages/dashboard.html'
];

// ═══ Install ═══
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('⚠️ Precache fail:', err.message);
      });
    })
  );
  self.skipWaiting();
});

// ═══ Activate ═══
self.addEventListener('activate', (event) => {
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

// ═══ Push (Web Push غير FCM) ═══
self.addEventListener('push', (event) => {
  console.log('🔔 Push received:', event);

  let data = {
    title: '🔔 إشعار جديد',
    body: 'لديك إشعار جديد',
    icon: DEFAULT_ICON,
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
      badge: data.icon,
      data: data.data,
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200]
    })
  );
});

// ═══ Notification Click ═══
self.addEventListener('notificationclick', (event) => {
  console.log('👆 Notification clicked');

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

// ═══ Message from App ═══
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
