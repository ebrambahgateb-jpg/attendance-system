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

let currentUser = null;
let currentPage = 'dashboard';

document.addEventListener('DOMContentLoaded', () => {
  currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser || !currentUser.selectedRole) {
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
  const el1 = document.getElementById('userName');
  const el2 = document.getElementById('userRole');
  const avatar = document.getElementById('userAvatar');

  if (el1) el1.textContent = currentUser.name || currentUser.email;
  if (el2) el2.textContent = currentUser.selectedRole;
  if (avatar && currentUser.name) {
    avatar.textContent = currentUser.name.charAt(0).toUpperCase();
  }
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';

  const role = currentUser.selectedRole;

  MENU_ITEMS.forEach(item => {
    if (!item.roles.includes(role)) return;

    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.page = item.id;
    btn.innerHTML = `
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    `;
    btn.onclick = () => navigateTo(item.id);
    nav.appendChild(btn);
  });

  // زرار Scanner بيتحول لصفحة تانية
  const scannerBtn = nav.querySelector('[data-page="scanner"]');
  if (scannerBtn) {
    scannerBtn.onclick = () => {
      window.location.href = 'scanner.html';
    };
  }
}

function navigateTo(pageId) {
  currentPage = pageId;

  // active class
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });

  // عنوان الصفحة
  const item = MENU_ITEMS.find(m => m.id === pageId);
  const titleEl = document.getElementById('pageTitle');
  if (titleEl && item) titleEl.textContent = item.label;

  // المحتوى
  const area = document.getElementById('contentArea');

  if (pageId === 'dashboard') {
    renderDashboardHome(area);
  } else {
    area.innerHTML = `
      <div class="placeholder-page">
        <h2>${item ? item.label : pageId}</h2>
        <p>هذه الصفحة قيد التطوير. سيتم بناؤها في الخطوات القادمة.</p>
      </div>
    `;
  }

  // إغلاق الـsidebar في الموبايل
  document.getElementById('sidebar').classList.remove('open');
}

function renderDashboardHome(area) {
  area.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <div>جاري تحميل الإحصائيات...</div>
    </div>
  `;

  fetch(`${CONFIG.API_URL}?action=dashboardStats&email=${encodeURIComponent(currentUser.email)}`)
    .then(res => res.json())
    .then(data => {
      if (!data.ok) {
        area.innerHTML = `<div class="placeholder-page"><h2>خطأ</h2><p>${data.message}</p></div>`;
        return;
      }
      renderStats(area, data.stats);
    })
    .catch(err => {
      area.innerHTML = `<div class="placeholder-page"><h2>خطأ في الاتصال</h2><p>${err.message}</p></div>`;
    });
}

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

function loadSystemStatus() {
  fetch(`${CONFIG.API_URL}?action=getSettings&email=${encodeURIComponent(currentUser.email)}`)
    .then(res => res.json())
    .then(data => {
      if (!data.ok) return;
      const s = data.settings;
      const statusEl = document.getElementById('systemStatus');
      const status = s.SystemStatus || 'Active';

      if (status === 'Suspended') {
        statusEl.classList.add('suspended');
        statusEl.title = 'النظام متوقف';
      } else {
        statusEl.title = 'النظام يعمل';
      }

      // تطبيق الثيم من الإعدادات لو موجود
      const theme = extractThemeFromSettings(s);
      if (theme) {
        saveTheme(theme);
      }

      // اسم النظام
      if (s.SystemName) {
        document.getElementById('appName').textContent = s.SystemName;
        document.title = s.SystemName;
      }
    })
    .catch(() => {});
}

function extractThemeFromSettings(s) {
  const keys = ['ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg','ThemeLogoUrl','ThemeBgImageUrl'];
  const hasAny = keys.some(k => s[k]);
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
  document.getElementById('sidebar').classList.toggle('open');
}
