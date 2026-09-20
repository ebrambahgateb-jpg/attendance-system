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

// ═══ State ═══
let settingsData = {};
let originalSettings = {};
let locationsData = [];
let currentLocationId = null;

// ═══ Constants ═══
const SYNC_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyLCcBwNOBx-74HLJIVOu0r8TjpD1z9SkeKL_5LJWFLe9-Lw2Z-ee8NMZy27x2RFiju/exec';
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeVxvcyHciVG2JH7gJlIzyxbOhmHM2HDafSLIIFuQUtbBqYLg/viewform';

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
      locationsData = [];
    } else {
      settingsData = snap.data();
      originalSettings = { ...settingsData };
      locationsData = Array.isArray(settingsData.Locations) ? [...settingsData.Locations] : [];
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
        <button class="settings-tab" data-tab="locations">📍 الأماكن و QR</button>
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

        <!-- 🔄 مزامنة Google Form -->
        <div class="settings-group sync-group">
          <h3>🔄 مزامنة Google Form</h3>
          <p class="hint">
            استخدم النموذج لإضافة أعضاء جدد. يمكنك المزامنة الآن أو انتظار المزامنة التلقائية (كل ساعة).
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

        <!-- الحقول الإلزامية -->
        <div class="settings-group">
          <h3>الحقول الإلزامية</h3>
          <p class="hint">اكتب أسماء الحقول مفصولة بفاصلة. مثال: Name,Phone</p>
          <div class="form-row">
            <input type="text" id="set_RequiredFields" placeholder="Name,Phone" />
          </div>
          <p class="hint">الحقول المتاحة: Name, Phone, Email, PhotoURL</p>
        </div>

        <!-- الحذف والتعطيل -->
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

      <!-- الأماكن و QR -->
      <div class="settings-tab-content" id="tab-locations" style="display:none;">

        <div class="settings-group">
          <h3 style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <span>📍 الأماكن المسجلة</span>
            <button class="btn-primary" onclick="openLocationModal()">➕ إضافة مكان</button>
          </h3>

          <p class="hint">كل مكان له QR خاص به. اطبعه وعلّقه في المكان.</p>

          <div id="locationsList" class="locations-list"></div>
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
  renderLocationsList();
  loadSyncInfo();
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
    // ⚡ POST بدل GET لتجنب CORS
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

    // ⚡ تأكد إنه JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('رد غير صالح من السيرفر');
    }

    if (!data.ok) {
      throw new Error(data.message || 'فشلت المزامنة');
    }

    // ⚡ احفظ النتيجة
    const now = new Date().toISOString();
    localStorage.setItem('lastSyncTime', now);
    localStorage.setItem('lastSyncResult', JSON.stringify({
      added: data.added || 0,
      updated: data.updated || 0,
      skipped: data.skipped || 0
    }));

    // ⚡ حدّث الواجهة
    await loadSyncInfo();

    // ⚡ عرض النتيجة
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
//   Locations
// ═══════════════════════════════════════════════════════

function renderLocationsList() {
  const container = document.getElementById('locationsList');
  if (!container) return;

  if (locationsData.length === 0) {
    container.innerHTML = `
      <div class="location-empty">
        <div class="location-empty-icon">📍</div>
        <p>لا توجد أماكن مسجلة بعد</p>
        <button class="btn-primary" onclick="openLocationModal()">➕ إضافة أول مكان</button>
      </div>
    `;
    return;
  }

  container.innerHTML = locationsData.map(loc => `
    <div class="location-card">
      <div class="location-card-header">
        <div class="location-card-title">
          <span class="location-icon">🏛️</span>
          <span>${escapeHtml(loc.name || 'بدون اسم')}</span>
        </div>
        <div class="location-card-actions">
          <button class="btn-icon" onclick="editLocation('${loc.id}')" title="تعديل">✏️</button>
          <button class="btn-icon danger" onclick="deleteLocation('${loc.id}')" title="حذف">🗑️</button>
        </div>
      </div>

      <div class="location-card-info">
        <div class="location-info-row">
          <span class="info-icon">📌</span>
          <span class="ltr">${(loc.lat || 0).toFixed(6)}, ${(loc.lng || 0).toFixed(6)}</span>
        </div>
        <div class="location-info-row">
          <span class="info-icon">🎯</span>
          <span>نطاق: ${loc.radius || 0}م | هامش: ${loc.tolerance || 0}م</span>
        </div>
      </div>

      <div class="location-card-qr">
        <div class="location-qr-preview" id="qr-preview-${loc.id}"></div>
        <div class="location-qr-actions">
          <button class="btn-secondary btn-small" onclick="copyLocationQR('${loc.id}')">📋 نسخ</button>
          <button class="btn-secondary btn-small" onclick="printLocationQR('${loc.id}')">🖨️ طباعة</button>
          <button class="btn-danger btn-small" onclick="regenerateLocationQR('${loc.id}')">🔄 تجديد</button>
        </div>
      </div>
    </div>
  `).join('');

  setTimeout(() => {
    locationsData.forEach(loc => {
      const container = document.getElementById('qr-preview-' + loc.id);
      if (container && loc.qrCode && typeof QRCode !== 'undefined') {
        container.innerHTML = '';
        new QRCode(container, {
          text: loc.qrCode,
          width: 120,
          height: 120,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    });
  }, 50);
}

window.openLocationModal = function(locationId) {
  currentLocationId = locationId || null;
  const loc = locationId ? locationsData.find(l => l.id === locationId) : null;
  const isEdit = !!loc;
  const data = loc || {};

  let modal = document.getElementById('locationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'locationModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ تعديل مكان' : '➕ إضافة مكان جديد'}</h2>
        <button class="modal-close" onclick="closeLocationModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-row">
          <label>اسم المكان *</label>
          <input type="text" id="loc_name" value="${escapeHtml(data.name || '')}" placeholder="مثال: الكنيسة الرئيسية" />
        </div>

        <div class="form-grid-2">
          <div class="form-row">
            <label>Latitude *</label>
            <input type="number" step="0.000001" id="loc_lat" value="${data.lat || ''}" placeholder="27.180144" dir="ltr" />
          </div>
          <div class="form-row">
            <label>Longitude *</label>
            <input type="number" step="0.000001" id="loc_lng" value="${data.lng || ''}" placeholder="31.183618" dir="ltr" />
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-row">
            <label>Radius (متر) *</label>
            <input type="number" id="loc_radius" value="${data.radius || 4}" min="1" max="1000" />
          </div>
          <div class="form-row">
            <label>Accuracy Tolerance (متر) *</label>
            <input type="number" id="loc_tolerance" value="${data.tolerance || 15}" min="0" max="200" />
          </div>
        </div>

        <div class="settings-inline-actions">
          <button class="btn-primary" onclick="detectLocationCurrent()">📍 حدّد موقعي الحالي</button>
          <button class="btn-secondary" onclick="previewLocationOnMap()">🗺️ معاينة على الخريطة</button>
        </div>

        <p class="hint" style="margin-top:12px;">
          💡 نصيحة: انسخ الإحداثيات من Google Maps (اضغط مطوّلاً على الموقع → انسخ الأرقام).
        </p>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeLocationModal()">إلغاء</button>
        <button class="btn-primary" onclick="saveLocation()">💾 حفظ</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  setTimeout(() => {
    const el = document.getElementById('loc_name');
    if (el) el.focus();
  }, 100);
};

window.closeLocationModal = function() {
  const modal = document.getElementById('locationModal');
  if (modal) modal.style.display = 'none';
  currentLocationId = null;
};

window.detectLocationCurrent = function() {
  if (!navigator.geolocation) {
    alert('المتصفح لا يدعم تحديد الموقع');
    return;
  }

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ جاري تحديد الموقع...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      document.getElementById('loc_lat').value = lat.toFixed(6);
      document.getElementById('loc_lng').value = lng.toFixed(6);

      btn.disabled = false;
      btn.textContent = originalText;

      alert(`✅ تم تحديد الموقع:\n\nLatitude: ${lat.toFixed(6)}\nLongitude: ${lng.toFixed(6)}\n\nدقة القياس: ${Math.round(acc)} متر`);
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = originalText;
      alert('❌ فشل تحديد الموقع: ' + err.message);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
};

window.previewLocationOnMap = function() {
  const lat = parseFloat(document.getElementById('loc_lat')?.value);
  const lng = parseFloat(document.getElementById('loc_lng')?.value);

  if (isNaN(lat) || isNaN(lng)) {
    alert('حدد الإحداثيات أولاً');
    return;
  }

  window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
};

window.saveLocation = async function() {
  const name = document.getElementById('loc_name')?.value.trim();
  const lat = parseFloat(document.getElementById('loc_lat')?.value);
  const lng = parseFloat(document.getElementById('loc_lng')?.value);
  const radius = parseInt(document.getElementById('loc_radius')?.value) || 4;
  const tolerance = parseInt(document.getElementById('loc_tolerance')?.value) || 15;

  if (!name) { alert('اسم المكان مطلوب'); return; }
  if (isNaN(lat) || isNaN(lng)) { alert('الإحداثيات مطلوبة'); return; }

  try {
    if (currentLocationId) {
      const idx = locationsData.findIndex(l => l.id === currentLocationId);
      if (idx !== -1) {
        locationsData[idx] = {
          ...locationsData[idx],
          name, lat, lng, radius, tolerance
        };
      }
    } else {
      const newId = 'loc_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const qrCode = generateLocationQR(newId);

      locationsData.push({
        id: newId,
        name, lat, lng, radius, tolerance,
        qrCode,
        createdAt: new Date().toISOString()
      });
    }

    await setDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC), {
      Locations: locationsData
    }, { merge: true });

    settingsData.Locations = locationsData;

    closeLocationModal();
    renderLocationsList();

    alert('✅ تم الحفظ بنجاح');
  } catch (err) {
    console.error('❌ Save location error:', err);
    alert('خطأ: ' + err.message);
  }
};

window.editLocation = function(locationId) {
  openLocationModal(locationId);
};

window.deleteLocation = async function(locationId) {
  const loc = locationsData.find(l => l.id === locationId);
  if (!loc) return;

  if (!confirm(`⚠️ هل أنت متأكد من حذف "${loc.name}"؟\n\nسيتوقف QR الخاص به عن العمل.`)) return;

  try {
    locationsData = locationsData.filter(l => l.id !== locationId);

    await setDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC), {
      Locations: locationsData
    }, { merge: true });

    settingsData.Locations = locationsData;

    renderLocationsList();
    alert('✅ تم الحذف');
  } catch (err) {
    console.error('❌ Delete location error:', err);
    alert('خطأ: ' + err.message);
  }
};

function generateLocationQR(locationId) {
  const randomPart = Math.random().toString(36).substring(2, 12);
  const timestamp = Date.now().toString(36);
  return `ATTENDANCE_LOC_${locationId}_${randomPart}${timestamp}`;
}

window.regenerateLocationQR = async function(locationId) {
  const loc = locationsData.find(l => l.id === locationId);
  if (!loc) return;

  if (!confirm(`⚠️ تحذير: تجديد QR لمكان "${loc.name}"\n\nسيتم إلغاء الـQR القديم نهائيًا، ولن يعمل.\n\nيجب استبدال الـQR المطبوع/المعلّق في المكان بالـQR الجديد بعد التجديد.\n\nهل أنت متأكد؟`)) {
    return;
  }

  try {
    const newQR = generateLocationQR(locationId);

    const idx = locationsData.findIndex(l => l.id === locationId);
    if (idx !== -1) {
      locationsData[idx].qrCode = newQR;
      locationsData[idx].regeneratedAt = new Date().toISOString();
    }

    await setDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC), {
      Locations: locationsData
    }, { merge: true });

    settingsData.Locations = locationsData;

    renderLocationsList();
    alert('✅ تم تجديد QR بنجاح');
  } catch (err) {
    console.error('❌ Regenerate QR error:', err);
    alert('خطأ: ' + err.message);
  }
};

window.copyLocationQR = function(locationId) {
  const loc = locationsData.find(l => l.id === locationId);
  if (!loc || !loc.qrCode) return;

  navigator.clipboard.writeText(loc.qrCode).then(() => {
    alert('✅ تم نسخ رمز QR');
  }).catch(() => {
    alert('الرمز:\n\n' + loc.qrCode);
  });
};

window.printLocationQR = function(locationId) {
  const loc = locationsData.find(l => l.id === locationId);
  if (!loc) return;

  const qrContainer = document.getElementById('qr-preview-' + locationId);
  if (!qrContainer) return;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html dir="rtl">
      <head>
        <title>QR - ${escapeHtml(loc.name)}</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 60px; }
          h1 { font-size: 32px; margin-bottom: 10px; }
          h2 { font-size: 20px; color: #666; margin-bottom: 40px; }
          .qr-box { display: inline-block; padding: 30px; border: 3px solid #000; border-radius: 16px; }
          .hint { margin-top: 40px; font-size: 16px; color: #333; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(settingsData.SystemName || 'سجل حضورك')}</h1>
        <h2>${escapeHtml(loc.name)}</h2>
        <div class="qr-box">${qrContainer.innerHTML}</div>
        <p class="hint">امسح الـQR لتسجيل حضورك</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
};

// ═══════════════════════════════════════════════════════
//   Clear Logo/Bg
// ═══════════════════════════════════════════════════════

window.clearLogo = function() {
  settingsData.ThemeLogoUrl = '';
  const input = document.getElementById('set_ThemeLogoUrl');
  if (input) input.value = '';
  const preview = document.getElementById('logoPreview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
};

window.clearBgImage = function() {
  settingsData.ThemeBgImageUrl = '';
  const input = document.getElementById('set_ThemeBgImageUrl');
  if (input) input.value = '';
  const preview = document.getElementById('bgPreview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
};

// ═══════════════════════════════════════════════════════
//   Save All Settings
// ═══════════════════════════════════════════════════════

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

  payload.Locations = locationsData;

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
    if (t.logoUrl) { img.src = t.logoUrl; img.style.display = 'block'; }
    else { img.style.display = 'none'; }
  });
}

// ═══ Expose ═══
window.loadSettingsPage = loadSettingsPage;
