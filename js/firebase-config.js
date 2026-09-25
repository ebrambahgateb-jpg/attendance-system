// ═══════════════════════════════════════════════════════
//   Firebase Config + Auth + FCM
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { 
  getAuth,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

// ═══ Firebase Config ═══
const firebaseConfig = {
  apiKey: "AIzaSyBVmfrzut1QEvUGOwfA8us7Kvz_vDC1FOA",
  authDomain: "attendance-system-2dc6f.firebaseapp.com",
  projectId: "attendance-system-2dc6f",
  storageBucket: "attendance-system-2dc6f.firebasestorage.app",
  messagingSenderId: "288395797724",
  appId: "1:288395797724:web:20f2277013c8d0966e4019"
};

// ═══ Initialize ═══
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ═══ ⚡ Google Auth Provider ═══
export const googleProvider = new GoogleAuthProvider();

// ⚡ Google Provider Settings
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// ═══ FCM ═══
let messagingInstance = null;
try {
  messagingInstance = getMessaging(app);
} catch (err) {
  console.warn('⚠️ FCM not supported:', err.message);
}
export const messaging = messagingInstance;

// ═══ VAPID Key ═══
export const VAPID_KEY = 'BHmFepm0wM8sqgKzCTAdYw0pj3WS1vji-BSmyTpWtwsJ3C_5gg2g9JmI5IQ0CdvRzs0UWDV32j962VI7lOQm7sA';

// ═══ Collections ═══
export const COLLECTIONS = {
  PEOPLE: 'people',
  ACCOUNTS: 'accounts',
  EVENTS: 'events',
  EVENT_TYPES: 'eventTypes',
  LOCATIONS: 'locations',
  ATTENDANCE: 'attendance',
  MEETINGS: 'meetings',
  SETTINGS: 'settings',
  MASS_TEMPLATES: 'massTemplates',
  MASS_CHANGE_REQUESTS: 'massChangeRequests',
  NOTIFICATIONS: 'notifications',
  LOGS: 'logs'
};

export const SETTINGS_DOC = 'main';

// ═══ Default Theme ═══
export const DEFAULT_THEME = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  accent: '#f59e0b',
  bg: '#f8fafc',
  cardBg: '#ffffff',
  text: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  sidebarBg: '#1e293b',
  sidebarText: '#f1f5f9',
  sidebarActive: '#3b82f6'
};
