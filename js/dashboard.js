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

let dashboardUser = null;
let currentPage = 'dashboard';
let dashInitCache = null;

window.addEventListener('DOMContentLoaded', function() {
  try {
    dashboardUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    dashboardUser = null;
  }

  if (!dashboardUser || !dashboardUser.selectedRole) {
    window.location.href = '../index.html';
    return;
  }

  loadThemeFromSettings();
  renderUserInfo();
  renderSidebar();
  loadDashboardInit(true);
});

function renderUserInfo() {
  var nameEl = document.getElementById('userName');
  var roleEl = document.getElementById('userRole');
  var avatar = document.getElementById('userAvatar');

  if (nameEl) nameEl.textContent = dashboardUser.name || dashboardUser.email;
  if (roleEl) roleEl.textContent = dashboardUser.selectedRole;
  if (avatar && dashboardUser.name) {
    avatar.textContent = dashboardUser.name.charAt(0).toUpperCase();
  }
}

function renderSidebar() {
  var nav = document.getElementById('sidebarNav');
  if (!nav) return;
  nav.innerHTML = '';

  var role = dashboardUser.selectedRole;

  MENU_ITEMS.forEach(function(item) {
    if (item.roles.indexOf(role) === -1) return;

    var btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.page = item.id;
    btn.innerHTML = '<span class="nav-icon">' + item.icon + '</span><span>' + item.label + '</span>';

    btn.onclick = function() {
      if (item.id === 'scanner') {
        window.location.href = 'scanner.html';
      } else {
        navigateTo(item.id);
      }
    };

    nav.appendChild(btn);
  });
}

function navigateTo(pageId) {
  currentPage = pageId;

  document.querySelectorAll('.nav-item').forEach(function(b) {
    b.classList.toggle('active', b.dataset.page === pageId);
  });

  var item = MENU_ITEMS.find(function(m) { return m.id === pageId; });
  var titleEl = document.getElementById('pageTitle');
  if (titleEl && item) titleEl.textContent = item.label;

  var area = document.getElementById('contentArea');
  if (!area) return;

  if (pageId === 'dashboard') {
    loadDashboardInit(false);
  } else if (pageId === 'settings') {
    loadSettingsPage(area);
  } else {
    area.innerHTML = '<div class="placeholder-page"><h2>' + (item ? item.label : pageId) + '</h2><p>هذه الصفحة قيد التطوير.</p></div>';
  }

  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

function loadDashboardInit(useCache) {
  var area = document.getElementById('contentArea');

  if (useCache && dashInitCache) {
    applyDashboardData(dashInitCache);
    return;
  }

  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  fetch(CONFIG.API_URL + '?action=dashboardInit&email=' + encodeURIComponent(dashboardUser.email))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.ok) {
        area.innerHTML = '<div class="placeholder-page"><h2>خطأ</h2><p>' + data.message + '</p></div>';
        return;
      }
      dashInitCache = data;
      applyDashboardData(data);
    })
    .catch(function(err) {
      area.innerHTML = '<div class="placeholder-page"><h2>خطأ في الاتصال</h2><p>' + err.message + '</p></div>';
    });
}

function applyDashboardData(data) {
  var area = document.getElementById('contentArea');

  renderStats(area, data.stats);

  var statusEl = document.getElementById('systemStatus');
  if (statusEl) {
    var status = data.settings.SystemStatus || 'Active';
    if (status === 'Suspended') {
      statusEl.classList.add('suspended');
      statusEl.title = 'النظام متوقف';
    } else {
      statusEl.classList.remove('suspended');
      statusEl.title = 'النظام يعمل';
    }
  }

  var theme = extractThemeFromSettings(data.settings);
  if (theme) saveTheme(theme);

  if (data.settings.SystemName) {
    var appNameEl = document.getElementById('appName');
    if (appNameEl) appNameEl.textContent = data.settings.SystemName;
    document.title = data.settings.SystemName;
  }

  document.querySelectorAll('.nav-item').forEach(function(b) {
    b.classList.toggle('active', b.dataset.page === 'dashboard');
  });
  var titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = 'لوحة التحكم';
}

function renderStats(area, stats) {
  area.innerHTML =
    '<div class="stats-grid">' +
      '<div class="stat-card"><div class="stat-icon">👥</div><div class="stat-info"><div class="stat-label">إجمالي الأشخاص</div><div class="stat-value">' + stats.totalPeople + '</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon">✅</div><div class="stat-info"><div class="stat-label">الأشخاص النشطين</div><div class="stat-value">' + stats.activePeople + '</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon">📅</div><div class="stat-info"><div class="stat-label">إجمالي الاجتماعات</div><div class="stat-value">' + stats.totalMeetings + '</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon">📌</div><div class="stat-info"><div class="stat-label">حضور اليوم</div><div class="stat-value">' + stats.todayAttendance + '</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info"><div class="stat-label">نسبة الحضور</div><div class="stat-value">' + stats.attendanceRate + '%</div></div></div>' +
    '</div>';
}

/**
 * استخراج الثيم من الإعدادات
 * - لو مفيش قيم → يرجع DEFAULT_THEME مباشرة
 * - لو فيه قيم → يدمجها مع DEFAULT_THEME
 */
function extractThemeFromSettings(s) {
  var base = (typeof DEFAULT_THEME !== 'undefined') ? DEFAULT_THEME : {
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

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}
