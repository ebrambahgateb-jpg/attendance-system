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

import {
  TABS_REGISTRY,
  WORKSPACES,
  getTabById,
  getTabsForWorkspace,
  getWorkspaceById
} from './tabs-config.js';

// ═══ Global State ═══
let dashboardUser = null;
let currentWorkspace = null;
let currentPage = 'dashboard';
let dashInitCache = null;

// ═══ Initialize on Load ═══
document.addEventListener('DOMContentLoaded', async () => {
  try {
    dashboardUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    dashboardUser = null;
  }

  if (!dashboardUser || !dashboardUser.currentWorkspace) {
    window.location.href = '../index.html';
    return;
  }

  currentWorkspace = dashboardUser.currentWorkspace;

  ensureSidebarOverlay();

  loadThemeFromStorage();

  // ⚡ Auto Deactivate Once Events
  autoDeactivateOnceEventsSafe();

  renderUserInfo();
  renderWorkspaceSwitcher();
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
  if (roleEl) {
    const ws = getWorkspaceById(currentWorkspace);
    roleEl.textContent = ws ? ws.label : currentWorkspace;
  }
  if (avatar) {
    if (dashboardUser.photoURL) {
      avatar.innerHTML = `<img src="${dashboardUser.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else if (dashboardUser.name) {
      avatar.textContent = dashboardUser.name.charAt(0).toUpperCase();
    }
  }
}

// ═══════════════════════════════════════════════════════
//   Workspace Switcher
// ═══════════════════════════════════════════════════════

function renderWorkspaceSwitcher() {
  const container = document.getElementById('workspaceSwitcher');
  if (!container) return;

  const roles = dashboardUser.roles || [];
  if (roles.length <= 1) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <button class="ws-btn" id="wsBtn" title="تبديل الواجهة" aria-label="تبديل الواجهة">
      <span class="ws-icon">🔄</span>
      <span class="ws-text">تبديل الواجهة</span>
      <span class="ws-arrow">▾</span>
    </button>
    <div class="ws-dropdown" id="wsDropdown" style="display:none;"></div>
  `;

  const btn = document.getElementById('wsBtn');
  const dropdown = document.getElementById('wsDropdown');

  btn.onclick = (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'block';
    if (isOpen) {
      dropdown.style.display = 'none';
    } else {
      renderWorkspaceDropdown(dropdown);
      dropdown.style.display = 'block';
    }
  };

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

function renderWorkspaceDropdown(dropdown) {
  const roles = dashboardUser.roles || [];

  dropdown.innerHTML = roles.map(roleId => {
    const ws = getWorkspaceById(roleId) || { id: roleId, label: roleId, icon: '👤', description: '' };
    const isCurrent = roleId === currentWorkspace;

    return `
      <button class="ws-item ${isCurrent ? 'active' : ''}" data-ws="${roleId}" ${isCurrent ? 'disabled' : ''}>
        <span class="ws-item-icon">${ws.icon}</span>
        <div class="ws-item-content">
          <div class="ws-item-label">${ws.label}</div>
          <div class="ws-item-desc">${ws.description || ''}</div>
        </div>
        ${isCurrent ? '<span class="ws-item-check">✓</span>' : ''}
      </button>
    `;
  }).join('');

  dropdown.querySelectorAll('.ws-item').forEach(item => {
    if (item.disabled) return;
    item.onclick = () => {
      const newWs = item.dataset.ws;
      switchWorkspace(newWs);
    };
  });
}

function switchWorkspace(newWorkspace) {
  if (!dashboardUser) return;
  if (newWorkspace === currentWorkspace) return;

  const ws = getWorkspaceById(newWorkspace);
  const confirmMsg = `هل تريد التبديل إلى "${ws ? ws.label : newWorkspace}"؟`;
  if (!confirm(confirmMsg)) return;

  dashboardUser.currentWorkspace = newWorkspace;
  localStorage.setItem('currentUser', JSON.stringify(dashboardUser));
  localStorage.setItem('currentWorkspace', newWorkspace);

  window.location.reload();
}

// ═══ Sidebar ═══
function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  nav.innerHTML = '';

  const allowedTabs = getTabsForWorkspace(currentWorkspace);

  allowedTabs.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.page = item.id;
    btn.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;

    btn.onclick = () => {
      if (item.isPage && item.pageUrl) {
        window.location.href = item.pageUrl;
        return;
      }
      navigateTo(item.id);
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

  const item = getTabById(pageId);
  const titleEl = document.getElementById('pageTitle');
  if (titleEl && item) titleEl.textContent = item.label;

  const area = document.getElementById('contentArea');
  if (!area) return;

  if (pageId === 'dashboard') {
    loadDashboardInit(false);
    closeSidebar();
    return;
  }

  if (item && item.handler) {
    const handlerFn = window[item.handler];

    if (typeof handlerFn === 'function') {
      if (pageId === 'events') {
        handlerFn(area, getEventsMode());
      } else {
        handlerFn(area);
      }
    } else {
      showLoadError(area, item.label);
    }
  } else {
    area.innerHTML = `<div class="placeholder-page">
      <h2>${item ? item.label : pageId}</h2>
      <p>هذه الصفحة قيد التطوير.</p>
    </div>`;
  }

  closeSidebar();
}

// ═══ Load Dashboard Init (حسب الواجهة) ═══
async function loadDashboardInit(useCache) {
  const area = document.getElementById('contentArea');
  if (!area) return;

  if (useCache && dashInitCache) {
    applyDashboardData(dashInitCache);
    return;
  }

  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  const ws = currentWorkspace;

  try {
    if (ws === 'Owner' || ws === 'Admin') {
      await renderAdminDashboard(area);
    } else if (ws === 'Scanner') {
      await renderScannerDashboard(area);
    } else if (ws === 'User') {
      await renderUserDashboard(area);
    } else {
      area.innerHTML = '<div class="placeholder-page"><h2>واجهة غير معروفة</h2></div>';
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
  const [peopleSnap, eventsSnap, attendanceSnap, settingsDoc] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.PEOPLE)),
    getDocs(collection(db, 'events')),
    getDocs(collection(db, COLLECTIONS.ATTENDANCE)),
    getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC))
  ]);

  const people = peopleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const settings = settingsDoc.exists() ? settingsDoc.data() : {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activePeople = people.filter(p =>
    String(p.Status || '').toLowerCase() === 'active'
  ).length;

  const totalEvents = events.filter(e =>
    String(e.Status || '').toLowerCase() !== 'archived'
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
      totalEvents: totalEvents,
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

  const eventsSnap = await getDocs(collection(db, 'events'));
  const events = eventsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => String(e.Status || '').toLowerCase() === 'active');

  const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
  const settings = settingsDoc.exists() ? settingsDoc.data() : {};

  const result = {
    role: 'scanner',
    stats: { myScansToday: myScans.length },
    events: events,
    settings: settings
  };

  dashInitCache = result;
  applyDashboardData(result);
}

// ═══ User Dashboard ═══
async function renderUserDashboard(area) {
  const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
  const settings = settingsDoc.exists() ? settingsDoc.data() : {};

  let person = null;
  if (dashboardUser.personId) {
    const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, dashboardUser.personId));
    if (pDoc.exists()) person = { id: pDoc.id, ...pDoc.data() };
  }

  let myAttendance = [];
  if (dashboardUser.personId) {
    const attSnap = await getDocs(query(
      collection(db, COLLECTIONS.ATTENDANCE),
      where('PersonID', '==', dashboardUser.personId)
    ));
    myAttendance = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const eventsSnap = await getDocs(collection(db, 'events'));
  const events = eventsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => String(e.Status || '').toLowerCase() === 'active');

  const totalEvents = events.length;
  const attended = myAttendance.length;
  const attendanceRate = totalEvents > 0
    ? Math.round((attended / totalEvents) * 100)
    : 0;

  const result = {
    role: 'user',
    person: person,
    myAttendance: myAttendance,
    stats: {
      totalEvents: totalEvents,
      attended: attended,
      attendanceRate: attendanceRate
    },
    events: events,
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
        <div class="stat-icon">🎯</div>
        <div class="stat-info">
          <div class="stat-label">إجمالي الأحداث</div>
          <div class="stat-value">${stats.totalEvents}</div>
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
  const eventsHtml = (data.events || []).slice(0, 5).map(e => `
    <div class="dashboard-list-item">
      <div class="dashboard-list-icon">🎯</div>
      <div class="dashboard-list-content">
        <div class="dashboard-list-title">${escapeHtml(e.Title || '')}</div>
        <div class="dashboard-list-subtitle">${formatEventDate(e)} — ${e.Time || ''}</div>
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
        <div class="stat-icon">🎯</div>
        <div class="stat-info">
          <div class="stat-label">الأحداث النشطة</div>
          <div class="stat-value">${(data.events || []).length}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <h3>🎯 الأحداث القادمة</h3>
      <div class="dashboard-list">
        ${eventsHtml || '<p style="text-align:center;color:#64748b;">لا يوجد أحداث</p>'}
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
    const title = a.EventTitle || a.MeetingTitle || 'حدث';
    return `
      <div class="dashboard-list-item">
        <div class="dashboard-list-icon">✅</div>
        <div class="dashboard-list-content">
          <div class="dashboard-list-title">${escapeHtml(title)}</div>
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
        <div class="stat-icon">🎯</div>
        <div class="stat-info">
          <div class="stat-label">إجمالي الأحداث</div>
          <div class="stat-value">${data.stats.totalEvents}</div>
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

function loadEventsLazy(area, mode) {
  if (typeof window.loadEventsPage === 'function') {
    window.loadEventsPage(area, mode || getEventsMode());
  } else showLoadError(area, 'الأحداث');
}

function loadProfileLazy(area) {
  if (typeof window.loadProfilePage === 'function') window.loadProfilePage(area);
  else showLoadError(area, 'حسابي');
}

function loadMyEventsLazy(area) {
  if (typeof window.loadMyEventsPage === 'function') window.loadMyEventsPage(area);
  else showLoadError(area, 'حضوري');
}

function loadScheduleLazy(area) {
  if (typeof window.loadSchedulePage === 'function') window.loadSchedulePage(area);
  else showLoadError(area, 'الجدول');
}

function loadArchiveLazy(area) {
  if (typeof window.loadArchivePage === 'function') window.loadArchivePage(area);
  else showLoadError(area, 'الأرشيف');
}

function loadMyAttendanceLazy(area) {
  if (typeof window.loadMyAttendancePage === 'function') window.loadMyAttendancePage(area);
  else showLoadError(area, 'سجل حضورك بنفسك');
}

function loadAttendanceLazy(area) {
  if (typeof window.loadAttendancePage === 'function') window.loadAttendancePage(area);
  else showLoadError(area, 'الحضور');
}

function loadAccountsLazy(area) {
  if (typeof window.loadAccountsPage === 'function') window.loadAccountsPage(area);
  else showLoadError(area, 'الحسابات');
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
function getEventsMode() {
  if (currentWorkspace === 'Owner' || currentWorkspace === 'Admin') return 'manage';
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

function formatEventDate(event) {
  const type = String(event.Type || 'once').toLowerCase();
  if (type === 'weekly') {
    const days = {Sunday:'الأحد',Monday:'الاثنين',Tuesday:'الثلاثاء',Wednesday:'الأربعاء',Thursday:'الخميس',Friday:'الجمعة',Saturday:'السبت'};
    return 'كل ' + (days[event.DayOfWeek] || '');
  }
  return event.Date || '';
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
    overlay.id = 'sidebarOverlay';
    document.body.appendChild(overlay);
  }

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

// ═══ ⚡ Auto Deactivate Once Events ═══
async function autoDeactivateOnceEventsSafe() {
  if (!['Owner', 'Admin'].includes(currentWorkspace)) return;

  if (typeof window.autoDeactivateOnceEvents === 'function') {
    try {
      await window.autoDeactivateOnceEvents();
    } catch (e) {
      console.warn('autoDeactivate error:', e);
    }
  }
}

// ═══ Logout ═══
async function handleLogout() {
  try {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentWorkspace');
  } catch (e) {}

  try {
    sessionStorage.clear();
  } catch (e) {}

  window.location.href = '../index.html';

  try {
    await signOut(auth);
  } catch (err) {
    console.warn('SignOut error (non-blocking):', err);
  }
}

window.logout = handleLogout;

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
window.switchWorkspace = switchWorkspace;
window.loadSettingsLazy = loadSettingsLazy;
window.loadPeopleLazy = loadPeopleLazy;
window.loadEventsLazy = loadEventsLazy;
window.loadProfileLazy = loadProfileLazy;
window.loadMyEventsLazy = loadMyEventsLazy;
window.loadScheduleLazy = loadScheduleLazy;
window.loadArchiveLazy = loadArchiveLazy;
window.loadMyAttendanceLazy = loadMyAttendanceLazy;
window.loadAttendanceLazy = loadAttendanceLazy;
window.loadAccountsLazy = loadAccountsLazy;
