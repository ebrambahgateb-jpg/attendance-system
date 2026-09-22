// ═══════════════════════════════════════════════════════
//   Dark Mode
//   ⚡ تبديل بين Light / Dark + Auto-detect + حفظ
// ═══════════════════════════════════════════════════════

// ═══ Constants ═══
const STORAGE_KEY = 'darkModePreference'; // 'light' | 'dark' | null
const THEME_ATTR = 'data-theme';
const ICON_SUN = '☀️';
const ICON_MOON = '🌙';

// ═══════════════════════════════════════════════════════
//   Initialize (Run BEFORE page render to avoid flash)
// ═══════════════════════════════════════════════════════

function initDarkMode() {
  const theme = getPreferredTheme();
  applyTheme(theme, false);
}

/**
 * ⚡ احصل على الوضع المفضل
 * Priority: localStorage → system → light
 */
function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) {}

  // ⚡ Auto-detect من إعدادات النظام
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }

  return 'light';
}

/**
 * ⚡ طبّق الوضع
 * @param {string} theme - 'light' | 'dark'
 * @param {boolean} animate - هل نعمل transition؟
 */
function applyTheme(theme, animate = true) {
  const html = document.documentElement;

  if (animate) {
    html.classList.add('theme-transitioning');
    setTimeout(() => {
      html.classList.remove('theme-transitioning');
    }, 300);
  }

  if (theme === 'dark') {
    html.setAttribute(THEME_ATTR, 'dark');
  } else {
    html.removeAttribute(THEME_ATTR);
  }

  // ⚡ حدّث أيقونة الزرار
  updateToggleIcon(theme);

  // ⚡ خزّن
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════
//   Toggle
// ═══════════════════════════════════════════════════════

function toggleDarkMode() {
  const current = document.documentElement.getAttribute(THEME_ATTR);
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme, true);
}

// ═══════════════════════════════════════════════════════
//   Update Toggle Icon
// ═══════════════════════════════════════════════════════

function updateToggleIcon(theme) {
  const btn = document.getElementById('darkModeToggle');
  if (!btn) return;

  const icon = btn.querySelector('.dm-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? ICON_SUN : ICON_MOON;
  }

  btn.title = theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
  btn.setAttribute('aria-label', btn.title);
}

// ═══════════════════════════════════════════════════════
//   Inject Toggle Button in Topbar
// ═══════════════════════════════════════════════════════

function injectToggleButton() {
  const topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;

  // ⚡ لو موجود بالغلط، مش نضيفه تاني
  if (document.getElementById('darkModeToggle')) return;

  const btn = document.createElement('button');
  btn.className = 'dark-mode-toggle';
  btn.id = 'darkModeToggle';
  btn.type = 'button';
  btn.innerHTML = '<span class="dm-icon">🌙</span>';

  // ⚡ ضيفه قبل زرار 🔔
  const notifBtn = document.getElementById('notificationsBtn');
  if (notifBtn) {
    topbarRight.insertBefore(btn, notifBtn);
  } else {
    topbarRight.appendChild(btn);
  }

  btn.onclick = toggleDarkMode;

  // ⚡ حدّث الأيقونة حسب الوضع الحالي
  const current = document.documentElement.getAttribute(THEME_ATTR);
  updateToggleIcon(current === 'dark' ? 'dark' : 'light');
}

// ═══════════════════════════════════════════════════════
//   Listen to System Theme Changes
// ═══════════════════════════════════════════════════════

function listenSystemTheme() {
  if (typeof window.matchMedia !== 'function') return;

  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e) => {
    // ⚡ لو المستخدم ما اختارش يدويًا، نتبع النظام
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return;
    } catch (err) {}

    applyTheme(e.matches ? 'dark' : 'light', true);
  };

  if (media.addEventListener) {
    media.addEventListener('change', handler);
  } else if (media.addListener) {
    media.addListener(handler); // legacy
  }
}

// ═══════════════════════════════════════════════════════
//   Auto-Init
// ═══════════════════════════════════════════════════════

// ⚡ طبّق الوضع فورًا (قبل ما الصفحة تترسم) — يمنع flash
initDarkMode();

// ⚡ لما الـDOM يجهز → نضيف الزرار + نستمع للتغييرات
document.addEventListener('DOMContentLoaded', () => {
  injectToggleButton();
  listenSystemTheme();
});

// ⚡ لو الصفحة اتحمّلت خلاص
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setTimeout(() => {
    injectToggleButton();
    listenSystemTheme();
  }, 100);
}

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.initDarkMode = initDarkMode;
window.toggleDarkMode = toggleDarkMode;
window.applyTheme = applyTheme;
window.getPreferredTheme = getPreferredTheme;
