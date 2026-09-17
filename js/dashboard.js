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
let dashInitCache = null; // نحفظ آخر نتيجة عشان نستخدمها عند التنقل السريع

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

/**
 * تحميل لوحة التحكم
 * useCache = true → استخدم آخر نتيجة لو موجودة
 */
function loadDashboardInit(useCache) {
  var area = document.getElementById('contentArea');

  // لو عندنا cache وطالبين نستخدمه → اعرض فورًا
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

  // الإحصائيات
  renderStats(area, data.stats);

  // حالة النظام
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

  // الثيم
  var theme = extractThemeFromSettings(data.settings);
  if (theme) saveTheme(theme);

  // اسم النظام
  if (data.settings.SystemName) {
    var appNameEl = document.getElementById('appName');
    if (appNameEl) appNameEl.textContent = data.settings.SystemName;
    document.title = data.settings.SystemName;
  }

  // active على dashboard
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

function extractThemeFromSettings(s) {
  var keys = ['ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg','ThemeLogoUrl','ThemeBgImageUrl'];
  var hasAny = keys.some(function(k) { return s[k]; });
  if (!hasAny) return null;

  return {
    primary: s.ThemePrimary || DEFAULT_THEME.primary,
    primaryHover: DEFAULT_THEME.primaryHover,
    accent: s.ThemeAccent || DEFAULT_THEME.accent,
    bg: s.ThemeBg || DEFAULT_THEME.bg,
    cardBg: DEFAULT_THEME.cardBg,
    text: DEFAULT_THEME.text,
    textMuted: DEFAULT_THEME.textMuted,
    border: DEFAULT_THEME.border,
    sidebarBg: s.ThemeSidebarBg || DEFAULT_THEME.sidebarBg,
    sidebarText: DEFAULT_THEME.sidebarText,
    sidebarActive: DEFAULT_THEME.sidebarActive,
    logoUrl: s.ThemeLogoUrl || '',
    bgImageUrl: s.ThemeBgImageUrl || ''
  };
}

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}
