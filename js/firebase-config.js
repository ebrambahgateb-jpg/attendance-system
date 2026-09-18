// ═══════════════════════════════════════════════════════
//   Firebase Configuration & Initialization
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVmfrzut1QEvUGOwfA8us7Kvz_vDC1FOA",
  authDomain: "attendance-system-2dc6f.firebaseapp.com",
  projectId: "attendance-system-2dc6f",
  storageBucket: "attendance-system-2dc6f.firebasestorage.app",
  messagingSenderId: "288395797724",
  appId: "1:288395797724:web:20f2277013c8d0966e4019"
};

// ═══ Initialize Firebase ═══
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// ═══ Collection Names ═══
export const COLLECTIONS = {
  PEOPLE: 'people',
  MEETINGS: 'meetings',
  ATTENDANCE: 'attendance',
  ACCOUNTS: 'accounts',
  LOGS: 'logs',
  SETTINGS: 'settings',
  ARCHIVED_MEETINGS: 'archivedMeetings',
  ARCHIVED_ATTENDANCE: 'archivedAttendance'
};

// ═══ Settings Document ═══
export const SETTINGS_DOC = 'main';

// ═══ Default Theme ═══
export const DEFAULT_THEME = {
  primary: '#475569',
  primaryHover: '#334155',
  accent: '#0d9488',
  bg: '#f8fafc',
  cardBg: '#ffffff',
  text: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  sidebarBg: '#1e293b',
  sidebarText: '#cbd5e1',
  sidebarActive: '#475569',
  logoUrl: '',
  bgImageUrl: ''
};

console.log('🔥 Firebase initialized successfully');
