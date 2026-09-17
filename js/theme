const DEFAULT_THEME = {
  primary: '#475569',       // Slate-600
  primaryHover: '#334155',  // Slate-700
  accent: '#0d9488',        // Teal
  bg: '#f8fafc',            // Slate-50
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

  const logoImgs = document.querySelectorAll('.app-logo');
  logoImgs.forEach(img => {
    if (t.logoUrl) {
      img.src = t.logoUrl;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  });
}

function loadThemeFromSettings() {
  try {
    const saved = localStorage.getItem('themeSettings');
    if (saved) {
      applyTheme(JSON.parse(saved));
      return;
    }
  } catch (e) {}

  applyTheme(DEFAULT_THEME);
}

function saveTheme(theme) {
  localStorage.setItem('themeSettings', JSON.stringify(theme));
  applyTheme(theme);
}
