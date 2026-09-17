let settingsData = {};
let originalSettings = {};

function loadSettingsPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  fetch(CONFIG.API_URL + '?action=getSettingsFull&email=' + encodeURIComponent(dashboardUser.email))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.ok) {
        area.innerHTML = '<div class="placeholder-page"><h2>خطأ</h2><p>' + data.message + '</p></div>';
        return;
      }
      settingsData = data.settings;
      originalSettings = Object.assign({}, data.settings);
      renderSettingsPage(area);
    })
    .catch(function(err) {
      area.innerHTML = '<div class="placeholder-page"><h2>خطأ في الاتصال</h2><p>' + err.message + '</p></div>';
    });
}

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

      <!-- ═══ عام ═══ -->
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

      <!-- ═══ المظهر ═══ -->
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
          <input type="file" id="logoFile" accept="image/*" />
          <button class="btn-secondary" onclick="clearLogo()">مسح اللوجو</button>
        </div>

        <div class="settings-group">
          <h3>صورة الخلفية</h3>
          <div class="logo-preview">
            <img id="bgPreview" src="" alt="" style="display:none;max-height:150px;" />
          </div>
          <input type="file" id="bgFile" accept="image/*" />
          <button class="btn-secondary" onclick="clearBgImage()">مسح الخلفية</button>
        </div>
      </div>

      <!-- ═══ الحضور ═══ -->
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

      <!-- ═══ الأشخاص ═══ -->
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

      <!-- ═══ الصور ═══ -->
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
        <button class="btn-primary" onclick="saveAllSettings()">حفظ التغييرات</button>
      </div>

    </div>
  `;

  fillSettingsForm();
  setupSettingsEvents();
}

function fillSettingsForm() {
  // الحقول النصية / الرقمية
  var textKeys = ['SystemName','OrganizationName','Language','TimeZone',
                  'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg',
                  'OpenBeforeMinutes','CloseAfterMinutes','ResultDisplayDuration',
                  'RequiredFields','MaxPhotoSize'];

  textKeys.forEach(function(key) {
    var el = document.getElementById('set_' + key);
    if (el && settingsData[key] !== undefined) {
      el.value = settingsData[key];
    }
  });

  // الحقول الـboolean
  var boolKeys = ['PreventDuplicateAttendance','SuccessSound','ErrorSound',
                  'ShowPersonPhoto','AllowDelete','DisableInsteadOfDelete',
                  'CompressPhotos'];

  boolKeys.forEach(function(key) {
    var el = document.getElementById('set_' + key);
    if (el) {
      el.checked = (settingsData[key] === true || String(settingsData[key]).toLowerCase() === 'true');
    }
  });

  // Preview اللوجو
  var logoPreview = document.getElementById('logoPreview');
  if (logoPreview && settingsData.ThemeLogoUrl) {
    logoPreview.src = settingsData.ThemeLogoUrl;
    logoPreview.style.display = 'block';
  }

  // Preview الخلفية
  var bgPreview = document.getElementById('bgPreview');
  if (bgPreview && settingsData.ThemeBgImageUrl) {
    bgPreview.src = settingsData.ThemeBgImageUrl;
    bgPreview.style.display = 'block';
  }
}

function setupSettingsEvents() {
  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(function(tab) {
    tab.onclick = function() {
      document.querySelectorAll('.settings-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');

      document.querySelectorAll('.settings-tab-content').forEach(function(c) { c.style.display = 'none'; });
      var target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.style.display = 'block';
    };
  });

  // Logo upload
  var logoFile = document.getElementById('logoFile');
  if (logoFile) {
    logoFile.onchange = function(e) {
      var file = e.target.files[0];
      if (file) uploadImage(file, 'ThemeLogoUrl', 'logoPreview');
    };
  }

  // Bg upload
  var bgFile = document.getElementById('bgFile');
  if (bgFile) {
    bgFile.onchange = function(e) {
      var file = e.target.files[0];
      if (file) uploadImage(file, 'ThemeBgImageUrl', 'bgPreview');
    };
  }
}

function uploadImage(file, settingKey, previewId) {
  if (file.size > 2 * 1024 * 1024) {
    alert('حجم الصورة كبير جدًا. الحد الأقصى 2MB');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];

    fetch(CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'uploadFile',
        email: dashboardUser.email,
        file: {
          name: file.name,
          mimeType: file.type,
          base64: base64
        }
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.ok) {
        alert('خطأ: ' + data.message);
        return;
      }
      settingsData[settingKey] = data.url;
      var preview = document.getElementById(previewId);
      if (preview) {
        preview.src = data.url;
        preview.style.display = 'block';
      }
    })
    .catch(function(err) {
      alert('خطأ في الرفع: ' + err.message);
    });
  };
  reader.readAsDataURL(file);
}

function clearLogo() {
  settingsData.ThemeLogoUrl = '';
  var preview = document.getElementById('logoPreview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
}

function clearBgImage() {
  settingsData.ThemeBgImageUrl = '';
  var preview = document.getElementById('bgPreview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
}

function saveAllSettings() {
  var textKeys = ['SystemName','OrganizationName','Language','TimeZone',
                  'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg',
                  'OpenBeforeMinutes','CloseAfterMinutes','ResultDisplayDuration',
                  'RequiredFields','MaxPhotoSize'];

  var boolKeys = ['PreventDuplicateAttendance','SuccessSound','ErrorSound',
                  'ShowPersonPhoto','AllowDelete','DisableInsteadOfDelete',
                  'CompressPhotos'];

  var payload = {};

  textKeys.forEach(function(key) {
    var el = document.getElementById('set_' + key);
    if (el) payload[key] = el.value;
  });

  boolKeys.forEach(function(key) {
    var el = document.getElementById('set_' + key);
    if (el) payload[key] = el.checked;
  });

  payload.ThemeLogoUrl = settingsData.ThemeLogoUrl || '';
  payload.ThemeBgImageUrl = settingsData.ThemeBgImageUrl || '';

  var btn = event.target;
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';

  fetch(CONFIG.API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateSettings',
      email: dashboardUser.email,
      settings: payload
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    btn.disabled = false;
    btn.textContent = originalText;

    if (!data.ok) {
      alert('خطأ: ' + data.message);
      return;
    }
    settingsData = data.settings;
    originalSettings = Object.assign({}, data.settings);

    // امسح كاش الداشبورد عشان المرة الجاية يجيب القيم المحدثة
    dashInitCache = null;
    try { sessionStorage.removeItem('dashInitCache'); } catch (e) {}

    // تطبيق الثيم مباشرة
    var theme = extractThemeFromSettings(settingsData);
    if (theme) saveTheme(theme);

    // تحديث اسم النظام
    var appNameEl = document.getElementById('appName');
    if (appNameEl && settingsData.SystemName) {
      appNameEl.textContent = settingsData.SystemName;
      document.title = settingsData.SystemName;
    }

    alert('تم الحفظ بنجاح');
  })
  .catch(function(err) {
    btn.disabled = false;
    btn.textContent = originalText;
    alert('خطأ: ' + err.message);
  });
}

function reloadSettings() {
  var area = document.getElementById('contentArea');
  loadSettingsPage(area);
}

function resetThemeToDefault() {
  if (!confirm('هل أنت متأكد من استعادة المظهر الافتراضي؟ سيتم مسح اللوجو والخلفية والألوان المخصصة.')) {
    return;
  }

  var btn = event.target;
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'جاري الاستعادة...';

  fetch(CONFIG.API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'resetThemeToDefault',
      email: dashboardUser.email
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    btn.disabled = false;
    btn.textContent = originalText;

    if (!data.ok) {
      alert('خطأ: ' + data.message);
      return;
    }

    settingsData = data.settings;
    originalSettings = Object.assign({}, data.settings);

    // امسح كاش الداشبورد
    dashInitCache = null;
    try { sessionStorage.removeItem('dashInitCache'); } catch (e) {}

    // حدّث الثيم فورًا
    var theme = extractThemeFromSettings(settingsData);
    if (theme) {
      saveTheme(theme);
    } else if (typeof DEFAULT_THEME !== 'undefined') {
      saveTheme(DEFAULT_THEME);
    }

    // أعد تحميل الصفحة عشان القيم تتحدّث
    var area = document.getElementById('contentArea');
    loadSettingsPage(area);

    alert('تم استعادة المظهر الافتراضي');
  })
  .catch(function(err) {
    btn.disabled = false;
    btn.textContent = originalText;
    alert('خطأ في الاتصال: ' + err.message);
  });
}
