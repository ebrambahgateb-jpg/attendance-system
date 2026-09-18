// ═══════════════════════════════════════════════════════
//   Settings (Firestore)
// ═══════════════════════════════════════════════════════

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC,
  DEFAULT_THEME
} from './firebase-config.js';

// ═══ State ═══
let settingsData = {};
let originalSettings = {};

// ═══ Load Settings Page ═══
async function loadSettingsPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
    const snap = await getDoc(settingsRef);

    if (!snap.exists()) {
      settingsData = {};
      originalSettings = {};
    } else {
      settingsData = snap.data();
      originalSettings = { ...settingsData };
    }

    renderSettingsPage(area);
  } catch (err) {
    console.error('❌ Load settings error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
    </div>`;
  }
}

// ═══ Render Page ═══
function renderSettingsPage(area) {
  area.innerHTML = `
    <div class="settings-container">

      <div class="settings-tabs">
        <button class="settings-tab active" data-tab="general">عام</button>
        <button class="settings-tab" data-tab="appearance">المظهر</button>
        <button class="settings-tab" data-tab="attendance">الحضور</button>
        <button class="settings-tab" data-tab="people">الأشخاص</button>
        <button class="settings-tab" data-tab="photo">الصور</button>
      </div>

      <!-- عام -->
      <div class="settings-tab-content" id="tab-general">
        <div class="settings-group">
          <h3>الإعدادات العامة</h3>
          <div class="form-row">
            <label>اسم النظام</label>
            <input type="text" id="set_SystemName" />
          </div>
          <div class="form-row">
            <label>اسم المؤسسة</label>
            <input type="text" id="set_OrganizationName" />
          </div>
          <div class="form-row">
            <label>اللغة</label>
            <select id="set_Language">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="form-row">
            <label>المنطقة الزمنية</label>
            <input type="text" id="set_TimeZone" placeholder="Africa/Cairo" />
          </div>
        </div>
      </div>

      <!-- المظهر -->
      <div class="settings-tab-content" id="tab-appearance" style="display:none;">
        <div class="settings-group">
          <h3>الألوان</h3>
          <div class="form-row">
            <label>اللون الأساسي</label>
            <input type="color" id="set_ThemePrimary" />
          </div>
          <div class="form-row">
            <label>لون التمييز</label>
            <input type="color" id="set_ThemeAccent" />
          </div>
          <div class="form-row">
            <label>لون الخلفية</label>
            <input type="color" id="set_ThemeBg" />
          </div>
          <div class="form-row">
            <label>لون الـSidebar</label>
            <input type="color" id="set_ThemeSidebarBg" />
          </div>
        </div>

        <div class="settings-group">
          <h3>اللوجو</h3>
          <div class="logo-preview">
            <img id="logoPreview" src="" alt="" style="display:none;" />
          </div>
          <input type="text" id="set_ThemeLogoUrl" placeholder="https://..." />
          <button class="btn-secondary" onclick="clearLogo()">مسح اللوجو</button>
        </div>

        <div class="settings-group">
          <h3>صورة الخلفية</h3>
          <div class="logo-preview">
            <img id="bgPreview" src="" alt="" style="display:none;max-height:150px;" />
          </div>
          <input type="text" id="set_ThemeBgImageUrl" placeholder="https://..." />
          <button class="btn-secondary" onclick="clearBgImage()">مسح الخلفية</button>
        </div>
      </div>

      <!-- الحضور -->
      <div class="settings-tab-content" id="tab-attendance" style="display:none;">
        <div class="settings-group">
          <h3>توقيت الحضور</h3>
          <div class="form-row">
            <label>فتح الحضور قبل الاجتماع (بالدقائق)</label>
            <input type="number" id="set_OpenBeforeMinutes" min="0" max="120" />
          </div>
          <div class="form-row">
            <label>إغلاق الحضور بعد الاجتماع (بالدقائق)</label>
            <input type="number" id="set_CloseAfterMinutes" min="0" max="120" />
          </div>
        </div>

        <div class="settings-group">
          <h3>قواعد التسجيل</h3>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="set_PreventDuplicateAttendance" />
            <label for="set_PreventDuplicateAttendance">منع تسجيل الحضور مرتين</label>
          </div>
          <div class="form-row">
            <label>مدة عرض النتيجة على الشاشة (بالثواني)</label>
            <input type="number" id="set_ResultDisplayDuration" min="1" max="30" />
          </div>
        </div>

        <div class="settings-group">
          <h3>الأصوات والصور</h3>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="set_SuccessSound" />
            <label for="set_SuccessSound">صوت عند نجاح الحضور</label>
          </div>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="set_ErrorSound" />
            <label for="set_ErrorSound">صوت عند الخطأ</label>
          </div>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="set_ShowPersonPhoto" />
            <label for="set_ShowPersonPhoto">إظهار صورة الشخص بعد المسح</label>
          </div>
        </div>
      </div>

      <!-- الأشخاص -->
      <div class="settings-tab-content" id="tab-people" style="display:none;">
        <div class="settings-group">
          <h3>الحقول الإلزامية</h3>
          <p class="hint">اكتب أسماء الحقول مفصولة بفاصلة. مثال: Name,Phone</p>
          <div class="form-row">
            <input type="text" id="set_RequiredFields" placeholder="Name,Phone" />
          </div>
          <p class="hint">الحقول المتاحة: Name, Phone, Email, PhotoURL</p>
        </div>

        <div class="settings-group">
          <h3>الحذف والتعطيل</h3>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="set_AllowDelete" />
            <label for="set_AllowDelete">السماح بحذف الأشخاص</label>
          </div>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="set_DisableInsteadOfDelete" />
            <label for="set_DisableInsteadOfDelete">تعطيل بدل الحذف (يُفضّل)</label>
          </div>
        </div>
      </div>

      <!-- الصور -->
      <div class="settings-tab-content" id="tab-photo" style="display:none;">
        <div class="settings-group">
          <h3>إعدادات الصور</h3>
          <div class="form-row">
            <label>أقصى حجم للصورة (بالميجابايت)</label>
            <input type="number" id="set_MaxPhotoSize" min="1" max="10" />
          </div>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="set_CompressPhotos" />
            <label for="set_CompressPhotos">ضغط الصور لتقليل المساحة</label>
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn-danger" onclick="resetThemeToDefault()">↺ استعادة المظهر الافتراضي</button>
        <button class="btn-secondary" onclick="reloadSettings()">إلغاء</button>
        <button class="btn-primary" onclick="saveAllSettings(event)">حفظ التغييرات</button>
      </div>

    </div>
  `;

  fillSettingsForm();
  setupSettingsEvents();
}

// ═══ Fill Form ═══
function fillSettingsForm() {
  const textKeys = ['SystemName','OrganizationName','Language','TimeZone',
                    'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg',
                    'OpenBeforeMinutes','CloseAfterMinutes','ResultDisplayDuration',
                    'RequiredFields','MaxPhotoSize','ThemeLogoUrl','ThemeBgImageUrl'];

  textKeys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el && settingsData[key] !== undefined) {
      el.value = settingsData[key];
    }
  });

  const boolKeys = ['PreventDuplicateAttendance','SuccessSound','ErrorSound',
                    'ShowPersonPhoto','AllowDelete','DisableInsteadOfDelete',
                    'CompressPhotos'];

  boolKeys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el) {
      el.checked = (settingsData[key] === true ||
                    String(settingsData[key]).toLowerCase() === 'true');
    }
  });

  // Preview
  const logoPreview = document.getElementById('logoPreview');
  if (logoPreview && settingsData.ThemeLogoUrl) {
    logoPreview.src = settingsData.ThemeLogoUrl;
    logoPreview.style.display = 'block';
  }

  const bgPreview = document.getElementById('bgPreview');
  if (bgPreview && settingsData.ThemeBgImageUrl) {
    bgPreview.src = settingsData.ThemeBgImageUrl;
    bgPreview.style.display = 'block';
  }
}

// ═══ Setup Events ═══
function setupSettingsEvents() {
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.settings-tab-content').forEach(c => c.style.display = 'none');
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.style.display = 'block';
    };
  });
}

// ═══ Clear Logo/Bg ═══
window.clearLogo = function() {
  settingsData.ThemeLogoUrl = '';
  const input = document.getElementById('set_ThemeLogoUrl');
  if (input) input.value = '';
  const preview = document.getElementById('logoPreview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
};

window.clearBgImage = function() {
  settingsData.ThemeBgImageUrl = '';
  const input = document.getElementById('set_ThemeBgImageUrl');
  if (input) input.value = '';
  const preview = document.getElementById('bgPreview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
};

// ═══ Save Settings ═══
window.saveAllSettings = async function(event) {
  const textKeys = ['SystemName','OrganizationName','Language','TimeZone',
                    'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg',
                    'OpenBeforeMinutes','CloseAfterMinutes','ResultDisplayDuration',
                    'RequiredFields','MaxPhotoSize','ThemeLogoUrl','ThemeBgImageUrl'];

  const boolKeys = ['PreventDuplicateAttendance','SuccessSound','ErrorSound',
                    'ShowPersonPhoto','AllowDelete','DisableInsteadOfDelete',
                    'CompressPhotos'];

  const payload = {};

  textKeys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el) payload[key] = el.value;
  });

  boolKeys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el) payload[key] = el.checked;
  });

  const btn = event ? event.target : null;
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';
  }

  try {
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
    await setDoc(settingsRef, payload, { merge: true });

    settingsData = { ...settingsData, ...payload };
    originalSettings = { ...settingsData };

    // امسح كاش الداشبورد
    if (window.dashInitCache !== undefined) window.dashInitCache = null;
    try { sessionStorage.removeItem('dashInitCache'); } catch (e) {}

    // طبّق الثيم
    const theme = extractTheme(settingsData);
    saveTheme(theme);

    const appNameEl = document.getElementById('appName');
    if (appNameEl && settingsData.SystemName) {
      appNameEl.textContent = settingsData.SystemName;
      document.title = settingsData.SystemName;
    }

    alert('تم الحفظ بنجاح');
  } catch (err) {
    console.error('❌ Save settings error:', err);
    alert('خطأ: ' + err.message);
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

// ═══ Reset Theme ═══
window.resetThemeToDefault = async function() {
  if (!confirm('هل أنت متأكد من استعادة المظهر الافتراضي؟')) return;

  const defaults = {
    ThemePrimary: DEFAULT_THEME.primary,
    ThemeAccent: DEFAULT_THEME.accent,
    ThemeBg: DEFAULT_THEME.bg,
    ThemeSidebarBg: DEFAULT_THEME.sidebarBg,
    ThemeLogoUrl: '',
    ThemeBgImageUrl: ''
  };

  try {
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
    await setDoc(settingsRef, defaults, { merge: true });

    settingsData = { ...settingsData, ...defaults };

    saveTheme(DEFAULT_THEME);

    const area = document.getElementById('contentArea');
    if (area) loadSettingsPage(area);

    alert('تم استعادة المظهر الافتراضي');
  } catch (err) {
    console.error('❌ Reset theme error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══ Reload ═══
window.reloadSettings = function() {
  const area = document.getElementById('contentArea');
  if (area) loadSettingsPage(area);
};

// ═══ Theme Helpers ═══
function extractTheme(s) {
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

function saveTheme(theme) {
  localStorage.setItem('themeSettings', JSON.stringify(theme));

  const root = document.documentElement;
  const t = { ...DEFAULT_THEME, ...theme };

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

// ═══ Expose ═══
window.loadSettingsPage = loadSettingsPage;
