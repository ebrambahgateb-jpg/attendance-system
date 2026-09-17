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
  navigateTo('dashboard');
  loadSystemStatus();
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
  renderDashboardHome(area);
} else if (pageId === 'settings') {
  loadSettingsPage(area);
} else {
  area.innerHTML = '<div class="placeholder-page"><h2>' + (item ? item.label : pageId) + '</h2><p>هذه الصفحة قيد التطوير.</p></div>';
}

  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

function renderDashboardHome(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري تحميل الإحصائيات...</div></div>';

  fetch(CONFIG.API_URL + '?action=dashboardStats&email=' + encodeURIComponent(dashboardUser.email))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.ok) {
        area.innerHTML = '<div class="placeholder-page"><h2>خطأ</h2><p>' + data.message + '</p></div>';
        return;
      }
      renderStats(area, data.stats);
    })
    .catch(function(err) {
      area.innerHTML = '<div class="placeholder-page"><h2>خطأ في الاتصال</h2><p>' + err.message + '</p></div>';
    });
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

function loadSystemStatus() {
  fetch(CONFIG.API_URL + '?action=getSettings&email=' + encodeURIComponent(dashboardUser.email))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.ok) return;
      var s = data.settings;
      var statusEl = document.getElementById('systemStatus');
      var status = s.SystemStatus || 'Active';

      if (statusEl) {
        if (status === 'Suspended') {
          statusEl.classList.add('suspended');
          statusEl.title = 'النظام متوقف';
        } else {
          statusEl.title = 'النظام يعمل';
        }
      }

      var theme = extractThemeFromSettings(s);
      if (theme) saveTheme(theme);

      if (s.SystemName) {
        var appNameEl = document.getElementById('appName');
        if (appNameEl) appNameEl.textContent = s.SystemName;
        document.title = s.SystemName;
      }
    })
    .catch(function() {});
}

function extractThemeFromSettings(s) {
  var keys = ['ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg','ThemeLogoUrl','ThemeBgImageUrl'];
  var hasAny = keys.some(function(k) { return s[k]; });
  if (!hasAny) return null;

  return {
    primary: s.ThemePrimary || undefined,
    accent: s.ThemeAccent || undefined,
    bg: s.ThemeBg || undefined,
    sidebarBg: s.ThemeSidebarBg || undefined,
    logoUrl: s.ThemeLogoUrl || '',
    bgImageUrl: s.ThemeBgImageUrl || ''
  };
}

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}
