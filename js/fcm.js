// ═══════════════════════════════════════════════════════
//   Firebase Cloud Messaging (FCM)
//   ⚡ Push Notifications حقيقية
// ═══════════════════════════════════════════════════════

import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import {
  doc,
  updateDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  messaging,
  VAPID_KEY,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let currentFCMToken = null;
let currentUser = null;
let messageListener = null;

// ═══════════════════════════════════════════════════════
//   Init FCM
// ═══════════════════════════════════════════════════════

async function initFCM() {
  try {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    currentUser = null;
  }

  if (!currentUser || !currentUser.personId) {
    console.log('⏭️ FCM: no personId — skipped');
    return;
  }

  // ⚡ تحقق من دعم المتصفح
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('⚠️ FCM: browser not supported');
    return;
  }

  if (!messaging) {
    console.log('⚠️ FCM: messaging not initialized');
    return;
  }

  // ⚡ لو الإذن مش granted → نستنى
  if (Notification.permission !== 'granted') {
    console.log('⏭️ FCM: permission not granted yet');
    return;
  }

  await registerFCMToken();
  setupFCMListener();
}

// ═══════════════════════════════════════════════════════
//   Register FCM Token
// ═══════════════════════════════════════════════════════

async function registerFCMToken() {
  if (!messaging || !currentUser?.personId) return null;

  try {
    console.log('🔔 FCM: Getting token...');

        // ⚡ تأكد إن الـSW جاهز
    const registration = await navigator.serviceWorker.ready;

    console.log('🔔 FCM: SW ready, scope =', registration.scope);

    // ⚡ استخدم registration.scope للتأكد
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      console.warn('⚠️ FCM: no token received');
      return null;
    }

    console.log('✅ FCM Token:', token.substring(0, 30) + '...');
    currentFCMToken = token;

    // ⚡ احفظ الـToken في Firestore
    await saveFCMTokenToFirestore(token);

    return token;

  } catch (err) {
    console.error('❌ FCM getToken error:', err);

    if (err.code === 'messaging/permission-blocked') {
      console.warn('⚠️ FCM: permission blocked');
    }

    return null;
  }
}

async function saveFCMTokenToFirestore(token) {
  if (!token || !currentUser?.personId) return;

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, currentUser.personId);

    // ⚡ اقرا الـTokens القديمة
    const snap = await getDoc(personRef);
    const data = snap.exists() ? snap.data() : {};
    const existingTokens = Array.isArray(data.FCMTokens) ? data.FCMTokens : [];

    // ⚡ ضيف التوكن الجديد لو مش موجود
    if (!existingTokens.includes(token)) {
      existingTokens.push(token);
    }

    // ⚡ احفظ
    await updateDoc(personRef, {
      FCMTokens: existingTokens,
      FCMToken: token,  // ⚡ الأحدث
      FCMUpdatedAt: new Date().toISOString()
    });

    console.log('✅ FCM Token saved to Firestore');
    return true;

  } catch (err) {
    console.error('❌ saveFCMToken error:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Foreground Message Listener
// ═══════════════════════════════════════════════════════

function setupFCMListener() {
  if (!messaging) return;
  if (messageListener) return;

  try {
    messageListener = onMessage(messaging, (payload) => {
      console.log('🔔 FCM message (foreground):', payload);

      const notification = payload.notification || {};
      const data = payload.data || {};

      // ⚡ اعرض الإشعار
      showFCMNotification({
        title: notification.title || data.title || '🔔 إشعار جديد',
        body: notification.body || data.body || '',
        data: data
      });
    });

    console.log('✅ FCM foreground listener active');

  } catch (err) {
    console.warn('⚠️ FCM listener error:', err.message);
  }
}

function showFCMNotification({ title, body, data }) {
  // ⚡ لو الموقع focus → Toast بدل الإشعار
  if (document.visibilityState === 'visible') {
    if (typeof window.showToast === 'function') {
      window.showToast(`${title}\n${body}`);
    } else {
      console.log('📬', title, body);
    }
    return;
  }

  // ⚡ لو الموقع في الخلفية → إشعار حقيقي
  if (typeof window.showBrowserNotification === 'function') {
    window.showBrowserNotification({
      title,
      body,
      data,
      force: true
    });
  }
}

// ═══════════════════════════════════════════════════════
//   طلب الإذن + تسجيل FCM
// ═══════════════════════════════════════════════════════

window.enableFCM = async function() {
  try {
    // ⚡ اطلب الإذن
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      console.warn('⚠️ FCM: permission denied');
      return false;
    }

    // ⚡ سجّل التوكن
    const token = await registerFCMToken();

    if (token) {
      if (typeof window.showToast === 'function') {
        window.showToast('✅ تم تفعيل إشعارات FCM');
      }
      return true;
    }

    return false;

  } catch (err) {
    console.error('❌ enableFCM error:', err);
    return false;
  }
};

// ═══════════════════════════════════════════════════════
//   حذف التوكن (Logout)
// ═══════════════════════════════════════════════════════

window.removeFCMToken = async function() {
  if (!currentUser?.personId || !currentFCMToken) return;

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, currentUser.personId);
    const snap = await getDoc(personRef);

    if (!snap.exists()) return;

    const data = snap.data();
    const tokens = Array.isArray(data.FCMTokens) ? data.FCMTokens : [];
    const filtered = tokens.filter(t => t !== currentFCMToken);

    await updateDoc(personRef, {
      FCMTokens: filtered,
      FCMUpdatedAt: new Date().toISOString()
    });

    console.log('✅ FCM Token removed');
  } catch (err) {
    console.warn('⚠️ removeFCMToken error:', err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.initFCM = initFCM;
window.getFCMToken = () => currentFCMToken;

// ═══ Auto-init ═══
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.initFCM === 'function') {
      window.initFCM();
    }
  }, 2000);
});
