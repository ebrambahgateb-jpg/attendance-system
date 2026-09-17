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

/**
 * ⚡ تحميل بيانات Dashboard — POST لتجنب 302 Redirect
 */
function loadDashboardInit(useCache, retryCount) {
  retryCount = retryCount || 0;
  var area = document.getElementById('contentArea');

  // 1) من الذاكرة
  if (useCache && dashInitCache) {
    applyDashboardData(dashInitCache);
    return;
  }

  // 2) من sessionStorage
  if (useCache) {
    try {
      var saved = sessionStorage.getItem('dashInitCache');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && parsed.data && parsed._ts && (Date.now() - parsed._ts) < 60000) {
          dashInitCache = parsed.data;
          applyDashboardData(dashInitCache);
          return;
        } else {
          sessionStorage.removeItem('dashInitCache');
        }
      }
    } catch (e) {
      try { sessionStorage.removeItem('dashInitCache'); } catch (e2) {}
    }
  }

  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  // ⚡ POST بدل GET
  fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'dashboardInit',
      email: dashboardUser.email
    }),
    redirect: 'follow'
  })
    .then(function(res) {
      if (res.status === 404) {
        throw new Error('REDIRECT_FAILED');
      }
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      return res.text();
    })
    .then(function(text) {
      // نتأكد إن الـResponse JSON مش HTML
      if (!text || text.trim().charAt(0) === '<') {
        throw new Error('REDIRECT_FAILED');
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('INVALID_JSON');
      }
    })
    .then(function(data) {
      if (!data || !data.ok) {
        area.innerHTML =
          '<div class="placeholder-page">' +
            '<h2>خطأ</h2>' +
            '<p>' + ((data && data.message) || 'حدث خطأ') + '</p>' +
            '<button class="btn-primary" onclick="loadDashboardInit(false)" style="margin-top:16px;">إعادة المحاولة</button>' +
          '</div>';
        return;
      }

      if (!data.stats || !data.settings) {
        throw new Error('INVALID_DATA');
      }

      dashInitCache = data;
      try {
        sessionStorage.setItem('dashInitCache', JSON.stringify({
          data: data,
          _ts: Date.now()
        }));
      } catch (e) {}

      applyDashboardData(data);
    })
    .catch(function(err) {
      console.error('Dashboard load error:', err.message || err);

      // ⚡ Retry تلقائي (مرتين)
      if (retryCount < 2) {
        console.log('إعادة المحاولة... (' + (retryCount + 1) + ')');
        setTimeout(function() {
          loadDashboardInit(false, retryCount + 1);
        }, 2000);
        return;
      }

      var msg = 'تعذّر الاتصال بالسيرفر.';
      if (err.message === 'REDIRECT_FAILED') {
        msg = 'السيرفر مشغول، جرّب مرة أخرى.';
      } else if (err.message === 'INVALID_JSON' || err.message === 'INVALID_DATA') {
        msg = 'رد غير متوقع من السيرفر.';
      }

      area.innerHTML =
        '<div class="placeholder-page">' +
          '<h2>خطأ في الاتصال</h2>' +
          '<p>' + msg + '</p>' +
          '<button class="btn-primary" onclick="loadDashboardInit(false)" style="margin-top:16px;">إعادة المحاولة</button>' +
        '</div>';
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

// ⚡ Keep-alive ping كل 5 دقايق
function keepAlive() {
  fetch(CONFIG.API_URL + '?action=ping', { cache: 'no-store' })
    .catch(function() {});
}

setTimeout(keepAlive, 30000);
setInterval(keepAlive, 5 * 60 * 1000);
