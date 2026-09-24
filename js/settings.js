// ═══════════════════════════════════════════════════════
//   Settings (Firestore)
// ═══════════════════════════════════════════════════════

import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC,
  DEFAULT_THEME
} from './firebase-config.js';

import {
  TABS_REGISTRY,
  OWNER_ONLY_TABS
} from './tabs-config.js';

// ═══ State ═══
let settingsData = {};
let originalSettings = {};

// ═══ Constants ═══
const SYNC_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyLCcBwNOBx-74HLJIVOu0r8TjpD1z9SkeKL_5LJWFLe9-Lw2Z-ee8NMZy27x2RFiju/exec';
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeVxvcyHciVG2JH7gJlIzyxbOhmHM2HDafSLIIFuQUtbBqYLg/viewform';

// ⚡ الأدوار القابلة للتعديل
const EDITABLE_ROLES = [
  { role: 'User',    label: '👤 User' },
  { role: 'Admin',   label: '🛠️ Admin' },
  { role: 'Scanner', label: '📷 Scanner' }
];

// ⚡ التابات القابلة للاختيار (كل التابات ما عدا ownerOnly)
const SELECTABLE_TABS = TABS_REGISTRY.filter(t => !t.ownerOnly);

// ⚡ حساب الافتراضي محليًا
const DEFAULT_TAB_PERMISSIONS = {
  User:    SELECTABLE_TABS.filter(t => t.workspaces && t.workspaces.includes('User')).map(t => t.id),
  Admin:   SELECTABLE_TABS.filter(t => t.workspaces && t.workspaces.includes('Admin')).map(t => t.id),
  Scanner: SELECTABLE_TABS.filter(t => t.workspaces && t.workspaces.includes('Scanner')).map(t => t.id)
};

// ═══════════════════════════════════════════════════════
//   Load Settings Page
// ═══════════════════════════════════════════════════════

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
        <button class="settings-tab" data-tab="tabs">🎛️ التابات والصلاحيات</button>
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
          <p class="hint">اللوجو المفضل: صورة مربعة (PNG / JPG / WebP) — بحد أقصى 5 MB</p>
          <div id="logoUploadContainer"></div>
          <input type="hidden" id="set_ThemeLogoUrl" />
        </div>

        <!-- ═══ ⚡ إعدادات عرض اللوجو ═══ -->
        <div class="settings-group">
          <h3>⚙️ إعدادات عرض اللوجو</h3>

          <div class="form-row">
            <label>حجم اللوجو في الـ Sidebar</label>
            <div class="logo-size-slider-wrap">
              <input type="range" id="set_LogoSizeSidebar"
                     min="30" max="150" step="2" value="48"
                     class="logo-size-slider" />
              <span class="logo-size-value" id="logoSizeSidebarValue">48px</span>
            </div>
            <p class="hint">اسحب المؤشر لتغيير الحجم (30 - 150 بكسل)</p>
          </div>

          <div class="form-row">
            <label>حجم اللوجو في صفحة تسجيل الدخول</label>
            <div class="logo-size-slider-wrap">
              <input type="range" id="set_LogoSizeLogin"
                     min="30" max="150" step="2" value="90"
                     class="logo-size-slider" />
              <span class="logo-size-value" id="logoSizeLoginValue">90px</span>
            </div>
            <p class="hint">اسحب المؤشر لتغيير الحجم (30 - 150 بكسل)</p>
          </div>

          <div class="form-row">
            <label>شكل اللوجو</label>
            <select id="set_LogoShape">
              <option value="square">🔲 مربع (زوايا مدوّرة)</option>
              <option value="circle">⭕ دائري</option>
              <option value="rounded">▢ مستطيل (زوايا كبيرة)</option>
              <option value="original">🖼️ الشكل الأصلي</option>
            </select>
          </div>

          <div class="logo-preview-box">
            <h4 class="logo-preview-title">معاينة</h4>
            <div class="logo-preview-samples">
              <div class="logo-preview-sample">
                <div class="logo-preview-sidebar-bg">
                  <div id="logoPreviewSidebar" class="logo-preview-icon"></div>
                </div>
                <span class="logo-preview-label">Sidebar</span>
              </div>
              <div class="logo-preview-sample">
                <div class="logo-preview-login-bg">
                  <div id="logoPreviewLogin" class="logo-preview-icon"></div>
                </div>
                <span class="logo-preview-label">Login</span>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <h3>صورة الخلفية</h3>
          <p class="hint">صورة الخلفية: يفضل 1920×1080 (PNG / JPG / WebP) — بحد أقصى 5 MB</p>
          <div id="bgUploadContainer"></div>
          <input type="hidden" id="set_ThemeBgImageUrl" />
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

        <div class="settings-group sync-group">
          <h3>🔄 مزامنة Google Form</h3>
          <p class="hint">
            استخدم النموذج لإضافة أعضاء جدد. يمكنك المزامنة الآن يدويًا.
          </p>

          <div class="sync-info-box" id="syncInfoBox">
            <div class="sync-info-row">
              <span class="sync-info-icon">📊</span>
              <span>آخر مزامنة: <strong id="lastSyncTime">—</strong></span>
            </div>
            <div class="sync-info-row">
              <span class="sync-info-icon">📈</span>
              <span>آخر نتيجة: <strong id="lastSyncResult">—</strong></span>
            </div>
          </div>

          <div class="sync-actions">
            <button class="btn-primary" id="syncNowBtn" onclick="syncGoogleFormNow()">
              🔄 مزامنة الآن
            </button>
            <button class="btn-secondary" onclick="openGoogleForm()">
              🔗 فتح الـ Form
            </button>
          </div>

          <div class="sync-result" id="syncResultBox" style="display:none;"></div>
        </div>

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

      <!-- 🎛️ التابات والصلاحيات -->
      <div class="settings-tab-content" id="tab-tabs" style="display:none;">
        <div class="settings-group">
          <h3>🎛️ التحكم في تابات الـSidebar</h3>
          <p class="hint">
            اختر التابات التي تظهر لكل واجهة. <strong>Owner</strong> يمتلك كل التابات دائمًا (غير قابل للتعديل).
            التابات <strong>الحسابات</strong> و <strong>الإعدادات</strong> محصورة للـOwner فقط.
          </p>
        </div>

        <div id="tabPermissionsContainer"></div>
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
  loadSyncInfo();
  renderTabPermissions();
}

// ═══ Fill Form ═══
function fillSettingsForm() {
  const textKeys = ['SystemName','OrganizationName','Language','TimeZone',
                    'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg',
                    'OpenBeforeMinutes','CloseAfterMinutes','ResultDisplayDuration',
                    'RequiredFields','MaxPhotoSize'];

  textKeys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el && settingsData[key] !== undefined) {
      el.value = settingsData[key];
    }
  });

  // ⚡ القيم المخزنة في hidden inputs
  const logoInput = document.getElementById('set_ThemeLogoUrl');
  if (logoInput) logoInput.value = settingsData.ThemeLogoUrl || '';

  const bgInput = document.getElementById('set_ThemeBgImageUrl');
  if (bgInput) bgInput.value = settingsData.ThemeBgImageUrl || '';

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

  // ⚡ Init Upload Widgets
  initThemeUploadWidgets();

  // ⚡ Init Logo Display Settings
  initLogoDisplaySettings();
}

// ═══════════════════════════════════════════════════════
//   ⚡ Logo Display Settings
// ═══════════════════════════════════════════════════════

function initLogoDisplaySettings() {
  const sidebarSlider = document.getElementById('set_LogoSizeSidebar');
  const sidebarValue = document.getElementById('logoSizeSidebarValue');
  const loginSlider = document.getElementById('set_LogoSizeLogin');
  const loginValue = document.getElementById('logoSizeLoginValue');
  const shapeSelect = document.getElementById('set_LogoShape');

  const sidebarSize = Number(settingsData.LogoSizeSidebar) || 48;
  const loginSize = Number(settingsData.LogoSizeLogin) || 90;
  const shape = settingsData.LogoShape || 'square';

  if (sidebarSlider) sidebarSlider.value = sidebarSize;
  if (sidebarValue) sidebarValue.textContent = `${sidebarSize}px`;
  if (loginSlider) loginSlider.value = loginSize;
  if (loginValue) loginValue.textContent = `${loginSize}px`;
  if (shapeSelect) shapeSelect.value = shape;

  if (sidebarSlider) {
    sidebarSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      settingsData.LogoSizeSidebar = val;
      if (sidebarValue) sidebarValue.textContent = `${val}px`;
      updateLogoPreview();
    });
  }

  if (loginSlider) {
    loginSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      settingsData.LogoSizeLogin = val;
      if (loginValue) loginValue.textContent = `${val}px`;
      updateLogoPreview();
    });
  }

  if (shapeSelect) {
    shapeSelect.addEventListener('change', (e) => {
      settingsData.LogoShape = e.target.value;
      updateLogoPreview();
    });
  }

  updateLogoPreview();
}

function updateLogoPreview() {
  const sidebarPreview = document.getElementById('logoPreviewSidebar');
  const loginPreview = document.getElementById('logoPreviewLogin');

  const logoUrl = settingsData.ThemeLogoUrl || '';
  const sidebarSize = Number(settingsData.LogoSizeSidebar) || 48;
  const loginSize = Number(settingsData.LogoSizeLogin) || 90;
  const shape = settingsData.LogoShape || 'square';

  const borderRadius = {
    square: '10px',
    circle: '50%',
    rounded: '16px',
    original: '0'
  }[shape] || '10px';

  if (sidebarPreview) {
    const previewSize = Math.min(sidebarSize, 100);
    if (logoUrl) {
      sidebarPreview.innerHTML = `<img src="${logoUrl}" style="width:${previewSize}px;height:${previewSize}px;border-radius:${borderRadius};object-fit:contain;" />`;
    } else {
      sidebarPreview.innerHTML = `<div style="width:${previewSize}px;height:${previewSize}px;border-radius:${borderRadius};background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">LOGO</div>`;
    }
  }

  if (loginPreview) {
    const previewSize = Math.min(loginSize, 120);
    if (logoUrl) {
      loginPreview.innerHTML = `<img src="${logoUrl}" style="width:${previewSize}px;height:${previewSize}px;border-radius:${borderRadius};object-fit:contain;" />`;
    } else {
      loginPreview.innerHTML = `<div style="width:${previewSize}px;height:${previewSize}px;border-radius:${borderRadius};background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">LOGO</div>`;
    }
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Theme Upload Widgets
// ═══════════════════════════════════════════════════════

function initThemeUploadWidgets() {
  // ═══ اللوجو ═══
  const logoContainer = document.getElementById('logoUploadContainer');
  if (logoContainer) {
    renderSimpleUploadWidget(
      'logoUploadContainer',
      settingsData.ThemeLogoUrl || '',
      async (file) => {
        if (typeof window.compressImage !== 'function' || typeof window.uploadToImgBB !== 'function') {
          throw new Error('خدمة الرفع غير متوفرة');
        }

        const compressed = await window.compressImage(file, 500, 500, 0.9);
        const result = await window.uploadToImgBB(compressed, `logo_${Date.now()}`);

        settingsData.ThemeLogoUrl = result.url;
        const hiddenInput = document.getElementById('set_ThemeLogoUrl');
        if (hiddenInput) hiddenInput.value = result.url;

        // ⚡ حدّث المعاينة
        updateLogoPreview();

        return result.url;
      },
      () => {
        settingsData.ThemeLogoUrl = '';
        const hiddenInput = document.getElementById('set_ThemeLogoUrl');
        if (hiddenInput) hiddenInput.value = '';

        // ⚡ حدّث المعاينة
        updateLogoPreview();
      }
    );
  }

  // ═══ الخلفية ═══
  const bgContainer = document.getElementById('bgUploadContainer');
  if (bgContainer) {
    renderSimpleUploadWidget(
      'bgUploadContainer',
      settingsData.ThemeBgImageUrl || '',
      async (file) => {
        if (typeof window.compressImage !== 'function' || typeof window.uploadToImgBB !== 'function') {
          throw new Error('خدمة الرفع غير متوفرة');
        }

        const compressed = await window.compressImage(file, 1920, 1080, 0.85);
        const result = await window.uploadToImgBB(compressed, `background_${Date.now()}`);

        settingsData.ThemeBgImageUrl = result.url;
        const hiddenInput = document.getElementById('set_ThemeBgImageUrl');
        if (hiddenInput) hiddenInput.value = result.url;

        return result.url;
      },
      () => {
        settingsData.ThemeBgImageUrl = '';
        const hiddenInput = document.getElementById('set_ThemeBgImageUrl');
        if (hiddenInput) hiddenInput.value = '';
      },
      { isBanner: true }
    );
  }
}

// ═══ Upload Widget بسيط ═══
function renderSimpleUploadWidget(containerId, currentUrl, onUpload, onRemove, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isBanner = options.isBanner || false;
  const hasImage = !!currentUrl;

  container.innerHTML = `
    <div class="simple-upload-widget ${isBanner ? 'simple-upload-banner' : ''}">
      <div class="simple-upload-preview" id="${containerId}-preview">
        ${hasImage
          ? `<img src="${currentUrl}" alt="" class="simple-upload-img" />`
          : `<div class="simple-upload-empty">
              <span class="simple-upload-icon">${isBanner ? '🖼️' : '📷'}</span>
              <span>لا توجد صورة</span>
             </div>`
        }
        <div class="simple-upload-loading" id="${containerId}-loading" style="display:none;">
          <div class="upload-spinner"></div>
          <span>جاري الرفع...</span>
        </div>
      </div>

      <div class="simple-upload-actions">
        <button type="button" class="btn-primary simple-upload-btn" id="${containerId}-upload">
          📤 ${hasImage ? 'تغيير' : 'رفع صورة'}
        </button>
        ${hasImage ? `
          <button type="button" class="btn-secondary simple-upload-btn" id="${containerId}-remove">
            🗑️ مسح
          </button>
        ` : ''}
      </div>
    </div>
  `;

  const uploadBtn = document.getElementById(`${containerId}-upload`);
  const removeBtn = document.getElementById(`${containerId}-remove`);
  const preview = document.getElementById(`${containerId}-preview`);
  const loading = document.getElementById(`${containerId}-loading`);

  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      if (typeof window.pickImage !== 'function') {
        alert('⚠️ خدمة رفع الصور غير متوفرة');
        return;
      }

      const file = await window.pickImage();
      if (!file) return;

      if (loading) loading.style.display = 'flex';
      uploadBtn.disabled = true;
      if (removeBtn) removeBtn.disabled = true;

      try {
        const url = await onUpload(file);

        if (preview) {
          const img = preview.querySelector('.simple-upload-img');
          const empty = preview.querySelector('.simple-upload-empty');

          if (img) {
            img.src = url;
          } else {
            if (empty) empty.remove();
            const newImg = document.createElement('img');
            newImg.src = url;
            newImg.className = 'simple-upload-img';
            preview.insertBefore(newImg, loading);
          }
        }

        uploadBtn.innerHTML = '📤 تغيير';

        if (!document.getElementById(`${containerId}-remove`)) {
          const actionsDiv = document.querySelector(`#${containerId} .simple-upload-actions`);
          if (actionsDiv) {
            const newRemoveBtn = document.createElement('button');
            newRemoveBtn.type = 'button';
            newRemoveBtn.className = 'btn-secondary simple-upload-btn';
            newRemoveBtn.id = `${containerId}-remove`;
            newRemoveBtn.innerHTML = '🗑️ مسح';
            newRemoveBtn.onclick = () => handleSimpleRemove(containerId, preview, uploadBtn, onRemove, isBanner);
            actionsDiv.appendChild(newRemoveBtn);
          }
        }

      } catch (err) {
        console.error('❌ Upload error:', err);
        alert('❌ فشل الرفع: ' + err.message);
      } finally {
        if (loading) loading.style.display = 'none';
        uploadBtn.disabled = false;
        if (removeBtn) removeBtn.disabled = false;
      }
    };
  }

  if (removeBtn) {
    removeBtn.onclick = () => handleSimpleRemove(containerId, preview, uploadBtn, onRemove, isBanner);
  }
}

function handleSimpleRemove(containerId, preview, uploadBtn, onRemove, isBanner) {
  if (!confirm('⚠️ مسح الصورة؟')) return;

  if (typeof onRemove === 'function') onRemove();

  if (preview) {
    preview.innerHTML = `
      <div class="simple-upload-empty">
        <span class="simple-upload-icon">${isBanner ? '🖼️' : '📷'}</span>
        <span>لا توجد صورة</span>
      </div>
      <div class="simple-upload-loading" id="${containerId}-loading" style="display:none;">
        <div class="upload-spinner"></div>
        <span>جاري الرفع...</span>
      </div>
    `;
  }

  const rb = document.getElementById(`${containerId}-remove`);
  if (rb) rb.remove();

  if (uploadBtn) uploadBtn.innerHTML = '📤 رفع صورة';
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

// ═══════════════════════════════════════════════════════
//   ⚡ Tab Permissions
// ═══════════════════════════════════════════════════════

function renderTabPermissions() {
  const container = document.getElementById('tabPermissionsContainer');
  if (!container) return;

  const perms = settingsData.TabPermissions || DEFAULT_TAB_PERMISSIONS;

  let html = '';

  EDITABLE_ROLES.forEach(({ role, label }) => {
    const allowedTabs = perms[role] || DEFAULT_TAB_PERMISSIONS[role] || [];

    html += `
      <div class="settings-group">
        <h3>${label}</h3>
        <div class="tab-permissions-grid">
          ${SELECTABLE_TABS.map(tab => {
            const isChecked = allowedTabs.includes(tab.id);

            return `
              <label class="tab-permission-item">
                <input type="checkbox"
                       data-role="${role}"
                       value="${tab.id}"
                       ${isChecked ? 'checked' : ''} />
                <span class="tab-icon">${tab.icon}</span>
                <span class="tab-label">${tab.label}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  html += `
    <div class="settings-group owner-tabs-group">
      <h3>👑 Owner</h3>
      <p class="hint">Owner يمتلك كل التابات دائمًا (غير قابل للتعديل)</p>
      <div class="tab-permissions-grid">
        ${SELECTABLE_TABS.map(tab => `
          <label class="tab-permission-item disabled">
            <input type="checkbox" checked disabled />
            <span class="tab-icon">${tab.icon}</span>
            <span class="tab-label">${tab.label}</span>
          </label>
        `).join('')}
        ${OWNER_ONLY_TABS.map(tab => `
          <label class="tab-permission-item disabled">
            <input type="checkbox" checked disabled />
            <span class="tab-icon">${tab.icon}</span>
            <span class="tab-label">${tab.label}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;

  html += `
    <div class="tab-permissions-actions">
      <button class="btn-secondary" onclick="resetTabPermissions()">↺ استعادة الافتراضي</button>
      <button class="btn-primary" onclick="saveTabPermissions(event)">💾 حفظ التابات</button>
    </div>
  `;

  container.innerHTML = html;
}

window.saveTabPermissions = async function(event) {
  const btn = event ? event.target : null;
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }

  try {
    const newPerms = {};

    EDITABLE_ROLES.forEach(({ role }) => {
      newPerms[role] = [];
    });

    document.querySelectorAll('#tabPermissionsContainer input[type="checkbox"]:not(:disabled)').forEach(cb => {
      if (cb.checked) {
        const role = cb.dataset.role;
        if (role) {
          if (!newPerms[role]) newPerms[role] = [];
          newPerms[role].push(cb.value);
        }
      }
    });

    EDITABLE_ROLES.forEach(({ role }) => {
      if (!newPerms[role] || !newPerms[role].includes('dashboard')) {
        newPerms[role] = ['dashboard', ...(newPerms[role] || [])];
      }
    });

    const settingsRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
    await setDoc(settingsRef, {
      TabPermissions: newPerms
    }, { merge: true });

    settingsData.TabPermissions = newPerms;

    alert('✅ تم حفظ إعدادات التابات بنجاح\n\nسيتم تطبيقها بعد إعادة تحميل الصفحة.');

  } catch (err) {
    console.error('❌ Save tab permissions error:', err);
    alert('خطأ: ' + err.message);
  }

  if (btn) { btn.disabled = false; btn.textContent = originalText; }
};

window.resetTabPermissions = async function() {
  if (!confirm('هل أنت متأكد من استعادة إعدادات التابات الافتراضية؟')) return;

  try {
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
    await setDoc(settingsRef, {
      TabPermissions: DEFAULT_TAB_PERMISSIONS
    }, { merge: true });

    settingsData.TabPermissions = DEFAULT_TAB_PERMISSIONS;
    renderTabPermissions();

    alert('✅ تم استعادة الإعدادات الافتراضية');
  } catch (err) {
    console.error('❌ Reset tab permissions error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   Google Form Sync
// ═══════════════════════════════════════════════════════

async function loadSyncInfo() {
  try {
    const lastSync = localStorage.getItem('lastSyncTime');
    const lastResult = localStorage.getItem('lastSyncResult');

    const timeEl = document.getElementById('lastSyncTime');
    const resultEl = document.getElementById('lastSyncResult');

    if (timeEl && lastSync) {
      timeEl.textContent = formatSyncTime(lastSync);
    }

    if (resultEl && lastResult) {
      const r = JSON.parse(lastResult);
      resultEl.textContent = `+${r.added} مضاف / ${r.updated} محدّث / ${r.skipped} متجاهل`;
    }
  } catch (e) {
    console.warn('Load sync info error:', e);
  }
}

function formatSyncTime(isoStr) {
  try {
    const d = new Date(isoStr);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy} - ${h}:${m}`;
  } catch (e) {
    return isoStr;
  }
}

window.syncGoogleFormNow = async function() {
  const btn = document.getElementById('syncNowBtn');
  const resultBox = document.getElementById('syncResultBox');

  if (!btn) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ جاري المزامنة...';

  if (resultBox) {
    resultBox.style.display = 'none';
    resultBox.innerHTML = '';
  }

  try {
    const response = await fetch(SYNC_WEBAPP_URL, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action: 'sync' })
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('رد غير صالح من السيرفر');
    }

    if (!data.ok) {
      throw new Error(data.message || 'فشلت المزامنة');
    }

    const now = new Date().toISOString();
    localStorage.setItem('lastSyncTime', now);
    localStorage.setItem('lastSyncResult', JSON.stringify({
      added: data.added || 0,
      updated: data.updated || 0,
      skipped: data.skipped || 0,
      ignored: data.ignored || 0
    }));

    await loadSyncInfo();

    if (resultBox) {
      resultBox.style.display = 'block';
      resultBox.className = 'sync-result success';
      resultBox.innerHTML = `
        <div class="sync-result-title">✅ تمت المزامنة بنجاح</div>
        <div class="sync-result-details">
          <div class="sync-result-item">
            <span class="sync-result-icon">➕</span>
            <span>مضاف: <strong>${data.added || 0}</strong></span>
          </div>
          ${data.restored ? `
            <div class="sync-result-item">
              <span class="sync-result-icon">🔄</span>
              <span>مُستعاد: <strong>${data.restored}</strong></span>
            </div>
          ` : ''}
          <div class="sync-result-item">
            <span class="sync-result-icon">✏️</span>
            <span>محدّث: <strong>${data.updated || 0}</strong></span>
          </div>
          <div class="sync-result-item">
            <span class="sync-result-icon">⏭️</span>
            <span>متجاهل: <strong>${data.skipped || 0}</strong></span>
          </div>
          ${data.ignored ? `
            <div class="sync-result-item">
              <span class="sync-result-icon">🚫</span>
              <span>في قائمة التجاهل: <strong>${data.ignored}</strong></span>
            </div>
          ` : ''}
        </div>
      `;
    }

  } catch (err) {
    console.error('❌ Sync error:', err);

    if (resultBox) {
      resultBox.style.display = 'block';
      resultBox.className = 'sync-result error';
      resultBox.innerHTML = `
        <div class="sync-result-title">❌ فشلت المزامنة</div>
        <div class="sync-result-details">
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  btn.disabled = false;
  btn.textContent = originalText;
};

window.openGoogleForm = function() {
  window.open(FORM_URL, '_blank');
};

// ═══════════════════════════════════════════════════════
//   Save All Settings
// ═══════════════════════════════════════════════════════

window.saveAllSettings = async function(event) {
  const textKeys = ['SystemName','OrganizationName','Language','TimeZone',
                    'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg',
                    'OpenBeforeMinutes','CloseAfterMinutes','ResultDisplayDuration',
                    'RequiredFields','MaxPhotoSize'];

  const boolKeys = ['PreventDuplicateAttendance','SuccessSound','ErrorSound',
                    'ShowPersonPhoto','AllowDelete','DisableInsteadOfDelete',
                    'CompressPhotos'];

  const payload = {};

  textKeys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el) payload[key] = el.value;
  });

  // ⚡ اللوجو والخلفية من settingsData
  payload.ThemeLogoUrl = settingsData.ThemeLogoUrl || '';
  payload.ThemeBgImageUrl = settingsData.ThemeBgImageUrl || '';

  // ⚡ إعدادات عرض اللوجو
  payload.LogoSizeSidebar = Number(settingsData.LogoSizeSidebar) || 48;
  payload.LogoSizeLogin = Number(settingsData.LogoSizeLogin) || 90;
  payload.LogoShape = settingsData.LogoShape || 'square';

  boolKeys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el) payload[key] = el.checked;
  });

  const btn = event ? event.target : null;
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }

  try {
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
    await setDoc(settingsRef, payload, { merge: true });

    settingsData = { ...settingsData, ...payload };
    originalSettings = { ...settingsData };

    if (window.dashInitCache !== undefined) window.dashInitCache = null;
    try { sessionStorage.removeItem('dashInitCache'); } catch (e) {}

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

  if (btn) { btn.disabled = false; btn.textContent = originalText; }
};

// ═══════════════════════════════════════════════════════
//   Reset Theme
// ═══════════════════════════════════════════════════════

window.resetThemeToDefault = async function() {
  if (!confirm('هل أنت متأكد من استعادة المظهر الافتراضي؟')) return;

  const defaults = {
    ThemePrimary: DEFAULT_THEME.primary,
    ThemeAccent: DEFAULT_THEME.accent,
    ThemeBg: DEFAULT_THEME.bg,
    ThemeSidebarBg: DEFAULT_THEME.sidebarBg,
    ThemeLogoUrl: '',
    ThemeBgImageUrl: '',
    LogoSizeSidebar: 48,
    LogoSizeLogin: 90,
    LogoShape: 'square'
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

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    bgImageUrl: s.ThemeBgImageUrl || '',

    // ⚡ إعدادات عرض اللوجو
    logoSizeSidebar: Number(s.LogoSizeSidebar) || 48,
    logoSizeLogin: Number(s.LogoSizeLogin) || 90,
    logoShape: s.LogoShape || 'square'
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

  // ⚡ اللوجو — الحجم والشكل
  const logoSize = Number(t.logoSizeSidebar) || 48;
  const logoShape = t.logoShape || 'square';

  const borderRadius = {
    square: '10px',
    circle: '50%',
    rounded: '16px',
    original: '0'
  }[logoShape] || '10px';

    document.querySelectorAll('.app-logo').forEach(img => {
    if (t.logoUrl) {
      img.src = t.logoUrl;
      img.style.display = 'block';
      img.style.width = logoSize + 'px';
      img.style.height = logoSize + 'px';
      img.style.borderRadius = borderRadius;
      img.style.objectFit = 'contain';

      // ⚡ ⚡ ⚡ خلفية شفافة
      img.style.background = 'transparent';
      img.style.backgroundColor = 'transparent';
      img.style.padding = '0';
      img.style.border = 'none';
      img.style.boxShadow = 'none';
    } else {
      img.style.display = 'none';
    }
  });
}

// ═══ Expose ═══
window.loadSettingsPage = loadSettingsPage;
