// ═══════════════════════════════════════════════════════
//   Dashboard (Firestore)
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import {
  auth,
  db,
  COLLECTIONS,
  SETTINGS_DOC,
  DEFAULT_THEME
} from './firebase-config.js';

// ═══ Menu Configuration ═══
const MENU_ITEMS = [
  { id: 'dashboard',  label: 'لوحة التحكم', icon: '📊', roles: ['Owner','Admin'] },
  { id: 'scanner',    label: 'الماسح',      icon: '📷', roles: ['Owner','Admin','Scanner'] },
  { id: 'people',     label: 'الأشخاص',     icon: '👥', roles: ['Owner','Admin'] },
  { id: 'meetings',   label: 'الاجتماعات',  icon: '📅', roles: ['Owner','Admin'] },
  { id: 'attendance', label: 'الحضور',      icon: '✅', roles: ['Owner','Admin'] },
  { id: 'reports',    label: 'التقارير',    icon: '📈', roles: ['Owner','Admin'] },
  { id: 'accounts',   label: 'الحسابات',    icon: '🔑', roles: ['Owner'] },
  { id: 'logs',       label: 'السجلات',     icon: '📋', roles: ['Owner','Admin'] },
  { id: 'archive',    label: 'الأرشيف',     icon: '📦', roles: ['Owner','Admin'] },
  { id: 'settings',   label: 'الإعدادات',   icon: '⚙️', roles: ['Owner'] }
];

// ═══ Global State ═══
let dashboardUser = null;
let currentPage = 'dashboard';
let dashInitCache = null;

// ═══ Initialize on Load ═══
document.addEventListener('DOMContentLoaded', async () => {
  try {
    dashboardUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    dashboardUser = null;
  }

  if (!dashboardUser || !dashboardUser.selectedRole) {
    window.location.href = '../index.html';
    return;
  }

  loadThemeFromStorage();
  renderUserInfo();
  renderSidebar();
  await loadDashboardInit(true);
});

// ═══ User Info ═══
function renderUserInfo() {
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  const avatar = document.getElementById('userAvatar');

  if (nameEl) nameEl.textContent = dashboardUser.name || dashboardUser.email;
  if (roleEl) roleEl.textContent = dashboardUser.selectedRole;
  if (avatar) {
    if (dashboardUser.photoURL) {
      avatar.innerHTML = `<img src="${dashboardUser.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else if (dashboardUser.name) {
      avatar.textContent = dashboardUser.name.charAt(0).toUpperCase();
    }
  }
}

// ═══ Sidebar ═══
function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  nav.innerHTML = '';

  const role = dashboardUser.selectedRole;

  MENU_ITEMS.forEach(item => {
    if (item.roles.indexOf(role) === -1) return;

    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.page = item.id;
    btn.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;

    btn.onclick = () => {
      if (item.id === 'scanner') {
        window.location.href = 'scanner.html';
      } else {
        navigateTo(item.id);
      }
    };

    nav.appendChild(btn);
  });
}

// ═══ Navigation ═══
function navigateTo(pageId) {
  currentPage = pageId;

  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });

  const item = MENU_ITEMS.find(m => m.id === pageId);
  const titleEl = document.getElementById('pageTitle');
  if (titleEl && item) titleEl.textContent = item.label;

  const area = document.getElementById('contentArea');
  if (!area) return;

  if (pageId === 'dashboard') {
    loadDashboardInit(false);
  } else if (pageId === 'settings') {
    loadSettingsLazy(area);
  } else {
    area.innerHTML = `<div class="placeholder-page">
      <h2>${item ? item.label : pageId}</h2>
      <p>هذه الصفحة قيد التطوير.</p>
    </div>`;
  }

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

// ═══ Load Dashboard Init ═══
async function loadDashboardInit(useCache) {
  const area = document.getElementById('contentArea');

  if (useCache && dashInitCache) {
    applyDashboardData(dashInitCache);
    return;
  }

  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const [peopleSnap, meetingsSnap, attendanceSnap, settingsDoc] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.PEOPLE)),
      getDocs(collection(db, COLLECTIONS.MEETINGS)),
      getDocs(collection(db, COLLECTIONS.ATTENDANCE)),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC))
    ]);

    const people = peopleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const meetings = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activePeople = people.filter(p =>
      String(p.Status || '').toLowerCase() === 'active'
    ).length;

    const totalMeetings = meetings.filter(m =>
      String(m.Status || '').toLowerCase() !== 'archived'
    ).length;

    const todayAttendance = attendance.filter(a => {
      if (!a.ScanTime) return false;
      const scanDate = parseDate(a.ScanTime);
      if (!scanDate) return false;
      scanDate.setHours(0, 0, 0, 0);
      return scanDate.getTime() === today.getTime();
    }).length;

    const attendanceRate = activePeople > 0
      ? Math.round((todayAttendance / activePeople) * 100)
      : 0;

    const result = {
      stats: {
        totalPeople: people.length,
        activePeople: activePeople,
        totalMeetings: totalMeetings,
        todayAttendance: todayAttendance,
        attendanceRate: attendanceRate,
        systemStatus: settings.SystemStatus || 'Active'
      },
      settings: settings
    };

    dashInitCache = result;
    applyDashboardData(result);

  } catch (err) {
    console.error('❌ Dashboard init error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ في الاتصال</h2>
      <p>${err.message || 'فشل قراءة البيانات من Firestore'}</p>
      <button class="btn-primary" onclick="loadDashboardInit(false)" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══ Apply Dashboard Data ═══
function applyDashboardData(data) {
  const area = document.getElementById('contentArea');
  if (!area) return;

  renderStats(area, data.stats);
  updateSystemStatus(data.settings.SystemStatus || 'Active');

  const theme = extractThemeFromSettings(data.settings);
  if (theme) saveTheme(theme);

  if (data.settings.SystemName) {
    const appNameEl = document.getElementById('appName');
    if (appNameEl) appNameEl.textContent = data.settings.SystemName;
    document.title = data.settings.SystemName;
  }

  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === 'dashboard');
  });
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = 'لوحة التحكم';
}

// ═══ Render Stats ═══
function renderStats(area, stats) {
  area.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <div class="stat-label">إجمالي الأشخاص</div>
          <div class="stat-value">${stats.totalPeople}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
          <div class="stat-label">الأشخاص النشطين</div>
          <div class="stat-value">${stats.activePeople}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-info">
          <div class="stat-label">إجمالي الاجتماعات</div>
          <div class="stat-value">${stats.totalMeetings}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📌</div>
        <div class="stat-info">
          <div class="stat-label">حضور اليوم</div>
          <div class="stat-value">${stats.todayAttendance}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-info">
          <div class="stat-label">نسبة الحضور</div>
          <div class="stat-value">${stats.attendanceRate}%</div>
        </div>
      </div>
    </div>
  `;
}

// ═══ System Status ═══
function updateSystemStatus(status) {
  const statusEl = document.getElementById('systemStatus');
  if (!statusEl) return;

  if (status === 'Suspended') {
    statusEl.classList.add('suspended');
    statusEl.title = 'النظام متوقف';
  } else {
    statusEl.classList.remove('suspended');
    statusEl.title = 'النظام يعمل';
  }
}

// ═══ Theme ═══
function extractThemeFromSettings(s) {
  const base = DEFAULT_THEME;

  return {
    primary: s.ThemePrimary || base.primary,
    primaryHover: base.primaryHover,
    accent: s.ThemeAccent || base.accent,
    bg: s.ThemeBg || base.bg,
    cardBg: base.cardBg,
    text: base.text,
    textMuted: base.textMuted,
    border: base.border,
    sidebarBg: s.ThemeSidebarBg || base.sidebarBg,
    sidebarText: base.sidebarText,
    sidebarActive: base.sidebarActive,
    logoUrl: s.ThemeLogoUrl || '',
    bgImageUrl: s.ThemeBgImageUrl || ''
  };
}

function loadThemeFromStorage() {
  try {
    const saved = localStorage.getItem('themeSettings');
    if (saved) {
      applyTheme(JSON.parse(saved));
      return;
    }
  } catch (e) {}
  applyTheme(DEFAULT_THEME);
}

function applyTheme(theme) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) };
  const root = document.documentElement;

  root.style.setProperty('--primary', t.primary);
  root.style.setProperty('--primary-hover', t.primaryHover);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--card-bg', t.cardBg);
  root.style.setProperty('--text', t.text);
  root.style.setProperty('--text-muted', t.textMuted);
  root.style.setProperty('--border', t.border);
  root.style.setProperty('--sidebar-bg', t.sidebarBg);
  root.style.setProperty('--sidebar-text', t.sidebarText);
  root.style.setProperty('--sidebar-active', t.sidebarActive);

  if (t.bgImageUrl) {
    document.body.style.backgroundImage = `url('${t.bgImageUrl}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundImage = 'none';
    document.body.style.background = t.bg;
  }

  document.querySelectorAll('.app-logo').forEach(img => {
    if (t.logoUrl) {
      img.src = t.logoUrl;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  });
}

function saveTheme(theme) {
  localStorage.setItem('themeSettings', JSON.stringify(theme));
  applyTheme(theme);
}

// ═══ Load Settings (Simple) ═══
function loadSettingsLazy(area) {
  if (typeof window.loadSettingsPage === 'function') {
    window.loadSettingsPage(area);
  } else {
    console.error('❌ loadSettingsPage not found on window');
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>لم يتم تحميل ملف الإعدادات. تأكد من رفع js/settings.js</p>
      <button class="btn-primary" onclick="location.reload()" style="margin-top:16px;">إعادة التحميل</button>
    </div>`;
  }
}

// ═══ Helpers ═══
function parseDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ═══ Sidebar Toggle (Mobile) ═══
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// ═══ Logout ═══
window.logout = async function() {
  try {
    localStorage.removeItem('currentUser');
    try { sessionStorage.clear(); } catch (e) {}
    await signOut(auth);
  } catch (err) {
    console.error('Logout error:', err);
  }
  window.location.href = '../index.html';
};

window.toggleSidebar = toggleSidebar;
window.loadDashboardInit = loadDashboardInit;
