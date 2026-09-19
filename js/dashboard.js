// ═══════════════════════════════════════════════════════
//   Dashboard (Firestore)
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
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
  { id: 'dashboard',      label: 'لوحة التحكم',          icon: '🏠', roles: ['Owner','Admin','Scanner','User'] },
  { id: 'profile',        label: 'حسابي',                 icon: '👤', roles: ['Owner','Admin','Scanner','User'] },
  { id: 'my-attendance',  label: 'سجل حضورك بنفسك',      icon: '📱', roles: ['Owner','Admin','Scanner'] },
  { id: 'scanner',        label: 'الماسح',                icon: '📷', roles: ['Owner','Admin','Scanner'] },
  { id: 'meetings',       label: 'الاجتماعات',           icon: '📅', roles: ['Owner','Admin','Scanner','User'], modes: { Scanner: 'view', User: 'view', Owner: 'manage', Admin: 'manage' } },
  { id: 'people',         label: 'الأشخاص',              icon: '👥', roles: ['Owner','Admin'] },
  { id: 'attendance',     label: 'الحضور',                icon: '✅', roles: ['Owner','Admin'] },
  { id: 'reports',        label: 'التقارير',              icon: '📈', roles: ['Owner','Admin'] },
  { id: 'accounts',       label: 'الحسابات',              icon: '🔑', roles: ['Owner'] },
  { id: 'logs',           label: 'السجلات',               icon: '📋', roles: ['Owner','Admin'] },
  { id: 'archive',        label: 'الأرشيف',               icon: '📦', roles: ['Owner','Admin'] },
  { id: 'settings',       label: 'الإعدادات',             icon: '⚙️', roles: ['Owner'] }
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

  ensureSidebarOverlay();

  loadThemeFromStorage();
  renderUserInfo();
  renderSidebar();
  await loadDashboardInit(true);

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeSidebar();
  });
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
  } else if (pageId === 'profile') {
    loadProfileLazy(area);
  } else if (pageId === 'my-attendance') {
    loadMyAttendanceLazy(area);
  } else if (pageId === 'people') {
    loadPeopleLazy(area);
  } else if (pageId === 'meetings') {
    loadMeetingsLazy(area);
  } else if (pageId === 'settings') {
    loadSettingsLazy(area);
  } else {
    area.innerHTML = `<div class="placeholder-page">
      <h2>${item ? item.label : pageId}</h2>
      <p>هذه الصفحة قيد التطوير.</p>
    </div>`;
  }

  closeSidebar();
}

// ═══ Load Dashboard Init (حسب الدور) ═══
async function loadDashboardInit(useCache) {
  const area = document.getElementById('contentArea');
  if (!area) return;

  if (useCache && dashInitCache) {
    applyDashboardData(dashInitCache);
    return;
  }

  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  const role = dashboardUser.selectedRole;

  try {
    if (role === 'Owner' || role === 'Admin') {
      await renderAdminDashboard(area);
    } else if (role === 'Scanner') {
      await renderScannerDashboard(area);
    } else if (role === 'User') {
      await renderUserDashboard(area);
    } else {
      area.innerHTML = '<div class="placeholder-page"><h2>دور غير معروف</h2></div>';
    }
  } catch (err) {
    console.error('❌ Dashboard error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ في الاتصال</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadDashboardInit(false)" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══ Admin Dashboard ═══
async function renderAdminDashboard(area) {
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
    role: 'admin',
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
}

// ═══ Scanner Dashboard ═══
async function renderScannerDashboard(area) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // عدد المسحات اللي عملها اليوم
  const attSnap = await getDocs(query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where('ScannerEmail', '==', dashboardUser.email)
  ));

  const myScans = attSnap.docs.map(d => d.data()).filter(a => {
    if (!a.ScanTime) return false;
    const d = parseDate(a.ScanTime);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  // الاجتماعات القادمة
  const meetingsSnap = await getDocs(collection(db, COLLECTIONS.MEETINGS));
  const meetings = meetingsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => String(m.Status || '').toLowerCase() === 'active');

  const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
  const settings = settingsDoc.exists() ? settingsDoc.data() : {};

  const result = {
    role: 'scanner',
    stats: { myScansToday: myScans.length },
    meetings: meetings,
    settings: settings
  };

  dashInitCache = result;
  applyDashboardData(result);
}

// ═══ User Dashboard ═══
async function renderUserDashboard(area) {
  const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
  const settings = settingsDoc.exists() ? settingsDoc.data() : {};

  // اجلب بيانات الشخص
  let person = null;
  if (dashboardUser.personId) {
    const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, dashboardUser.personId));
    if (pDoc.exists()) person = { id: pDoc.id, ...pDoc.data() };
  }

  // إحصائيات حضور الشخص
  let myAttendance = [];
  if (dashboardUser.personId) {
    const attSnap = await getDocs(query(
      collection(db, COLLECTIONS.ATTENDANCE),
      where('PersonID', '==', dashboardUser.personId)
    ));
    myAttendance = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // الاجتماعات القادمة
  const meetingsSnap = await getDocs(collection(db, COLLECTIONS.MEETINGS));
  const meetings = meetingsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => String(m.Status || '').toLowerCase() === 'active');

  const totalMeetings = meetings.length;
  const attended = myAttendance.length;
  const absenceRate = totalMeetings > 0
    ? Math.round((attended / totalMeetings) * 100)
    : 0;

  const result = {
    role: 'user',
    person: person,
    myAttendance: myAttendance,
    stats: {
      totalMeetings: totalMeetings,
      attended: attended,
      attendanceRate: absenceRate
    },
    meetings: meetings,
    settings: settings
  };

  dashInitCache = result;
  applyDashboardData(result);
}

// ═══ Apply Dashboard Data ═══
function applyDashboardData(data) {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const role = data.role || 'admin';

  if (role === 'admin') {
    renderAdminStats(area, data.stats);
  } else if (role === 'scanner') {
    renderScannerStats(area, data);
  } else if (role === 'user') {
    renderUserStats(area, data);
  }

  updateSystemStatus(data.settings?.SystemStatus || 'Active');

  const theme = extractThemeFromSettings(data.settings || {});
  if (theme) saveTheme(theme);

  if (data.settings?.SystemName) {
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

// ═══ Admin Stats ═══
function renderAdminStats(area, stats) {
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

// ═══ Scanner Stats ═══
function renderScannerStats(area, data) {
  const meetingsHtml = (data.meetings || []).slice(0, 5).map(m => `
    <div class="dashboard-list-item">
      <div class="dashboard-list-icon">📅</div>
      <div class="dashboard-list-content">
        <div class="dashboard-list-title">${escapeHtml(m.Title || '')}</div>
        <div class="dashboard-list-subtitle">${formatMeetingDate(m)} — ${m.Time || ''}</div>
      </div>
    </div>
  `).join('');

  area.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📷</div>
        <div class="stat-info">
          <div class="stat-label">مسحاتي اليوم</div>
          <div class="stat-value">${data.stats.myScansToday}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-info">
          <div class="stat-label">الاجتماعات النشطة</div>
          <div class="stat-value">${(data.meetings || []).length}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <h3>📅 الاجتماعات القادمة</h3>
      <div class="dashboard-list">
        ${meetingsHtml || '<p style="text-align:center;color:#64748b;">لا يوجد اجتماعات</p>'}
      </div>
    </div>
  `;
}

// ═══ User Stats ═══
function renderUserStats(area, data) {
  const person = data.person;
  const fullName = person ? getPersonFullName(person) : dashboardUser.name;

  const initial = (person?.FirstName || dashboardUser.name || '?').charAt(0);

  const photoHtml = person?.PhotoURL
    ? `<img src="${person.PhotoURL}" alt="" class="user-dash-photo" />`
    : `<div class="user-dash-photo-placeholder">${initial}</div>`;

  const lastAttendance = (data.myAttendance || [])
    .sort((a, b) => new Date(b.ScanTime) - new Date(a.ScanTime))
    .slice(0, 5);

  const attendanceHtml = lastAttendance.map(a => {
    const scanDate = parseDate(a.ScanTime);
    const dateStr = scanDate ? scanDate.toLocaleDateString('ar-EG') : '';
    return `
      <div class="dashboard-list-item">
        <div class="dashboard-list-icon">✅</div>
        <div class="dashboard-list-content">
          <div class="dashboard-list-title">${escapeHtml(a.MeetingTitle || 'اجتماع')}</div>
          <div class="dashboard-list-subtitle">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('');

  area.innerHTML = `
    <div class="user-dash-header">
      ${photoHtml}
      <div class="user-dash-info">
        <h2>${escapeHtml(fullName || '')}</h2>
        <p>${escapeHtml(person?.Email || dashboardUser.email || '')}</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
          <div class="stat-label">حضرت</div>
          <div class="stat-value">${data.stats.attended}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-info">
          <div class="stat-label">إجمالي الاجتماعات</div>
          <div class="stat-value">${data.stats.totalMeetings}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-info">
          <div class="stat-label">نسبة الحضور</div>
          <div class="stat-value">${data.stats.attendanceRate}%</div>
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <h3>📅 آخر حضور</h3>
      <div class="dashboard-list">
        ${attendanceHtml || '<p style="text-align:center;color:#64748b;">لم تسجّل حضورك بعد</p>'}
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
    if (saved) { applyTheme(JSON.parse(saved)); return; }
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
    if (t.logoUrl) { img.src = t.logoUrl; img.style.display = 'block'; }
    else { img.style.display = 'none'; }
  });
}

function saveTheme(theme) {
  localStorage.setItem('themeSettings', JSON.stringify(theme));
  applyTheme(theme);
}

// ═══ Lazy Loaders ═══
function loadSettingsLazy(area) {
  if (typeof window.loadSettingsPage === 'function') window.loadSettingsPage(area);
  else showLoadError(area, 'الإعدادات');
}

function loadPeopleLazy(area) {
  if (typeof window.loadPeoplePage === 'function') window.loadPeoplePage(area);
  else showLoadError(area, 'الأشخاص');
}

function loadMeetingsLazy(area) {
  if (typeof window.loadMeetingsPage === 'function') {
    // مرر الوضع (view/manage) للصفحة
    window.loadMeetingsPage(area, getMeetingsMode());
  } else showLoadError(area, 'الاجتماعات');
}

function loadProfileLazy(area) {
  if (typeof window.loadProfilePage === 'function') window.loadProfilePage(area);
  else showLoadError(area, 'حسابي');
}

function loadMyAttendanceLazy(area) {
  if (typeof window.loadMyAttendancePage === 'function') window.loadMyAttendancePage(area);
  else showLoadError(area, 'سجل حضورك بنفسك');
}

function showLoadError(area, name) {
  console.error(`❌ load${name}Page not found`);
  area.innerHTML = `<div class="placeholder-page">
    <h2>خطأ</h2>
    <p>لم يتم تحميل ملف ${name}.</p>
    <button class="btn-primary" onclick="location.reload()" style="margin-top:16px;">إعادة التحميل</button>
  </div>`;
}

// ═══ Helpers ═══
function getMeetingsMode() {
  const role = dashboardUser.selectedRole;
  if (role === 'Owner' || role === 'Admin') return 'manage';
  return 'view';
}

function parseDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function getPersonFullName(p) {
  if (!p) return '';
  return [p.FirstName, p.SecondName, p.ThirdName, p.FourthName]
    .filter(Boolean).join(' ');
}

function formatMeetingDate(meeting) {
  const type = String(meeting.Type || 'once').toLowerCase();
  if (type === 'weekly') {
    const days = {Sunday:'الأحد',Monday:'الاثنين',Tuesday:'الثلاثاء',Wednesday:'الأربعاء',Thursday:'الخميس',Friday:'الجمعة',Saturday:'السبت'};
    return 'كل ' + (days[meeting.DayOfWeek] || '');
  }
  return meeting.Date || '';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══ Sidebar Management ═══
function ensureSidebarOverlay() {
  let overlay = document.querySelector('.sidebar-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  // ⚡ اربط الحدث دايمًا (حتى لو الـoverlay موجود)
  overlay.onclick = closeSidebar;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('open');
  const overlay = document.querySelector('.sidebar-overlay');
  if (isOpen) {
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

// ═══ Logout ═══
async function handleLogout() {
  // ⚡ أول حاجة: امسح الحالة المحلية وروح فورًا
  try {
    localStorage.removeItem('currentUser');
  } catch (e) {}

  try {
    sessionStorage.clear();
  } catch (e) {}

  // ⚡ روح لصفحة الدخول فورًا
  window.location.href = '../index.html';

  // ⚡ بعدها جرّب signOut من Firebase (مش هيأثر على الانتقال)
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('SignOut error (non-blocking):', err);
  }
}

window.logout = handleLogout;

// ⚡ كمان اربط الزرار مباشرة لو موجود
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn && !logoutBtn._bound) {
    logoutBtn._bound = true;
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });
  }
});

// ═══ Expose to window ═══
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.loadDashboardInit = loadDashboardInit;
