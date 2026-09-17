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
      </div>

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
  ['SystemName','OrganizationName','Language','TimeZone',
   'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg'].forEach(function(key) {
    var el = document.getElementById('set_' + key);
    if (el && settingsData[key] !== undefined) {
      el.value = settingsData[key];
    }
  });

  // Preview اللوجو
  var logoPreview = document.getElementById('logoPreview');
  if (settingsData.ThemeLogoUrl) {
    logoPreview.src = settingsData.ThemeLogoUrl;
    logoPreview.style.display = 'block';
  }

  // Preview الخلفية
  var bgPreview = document.getElementById('bgPreview');
  if (settingsData.ThemeBgImageUrl) {
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
  var keys = ['SystemName','OrganizationName','Language','TimeZone',
              'ThemePrimary','ThemeAccent','ThemeBg','ThemeSidebarBg'];

  var payload = {};

  keys.forEach(function(key) {
    var el = document.getElementById('set_' + key);
    if (el) payload[key] = el.value;
  });

  payload.ThemeLogoUrl = settingsData.ThemeLogoUrl || '';
  payload.ThemeBgImageUrl = settingsData.ThemeBgImageUrl || '';

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
    if (!data.ok) {
      alert('خطأ: ' + data.message);
      return;
    }
    settingsData = data.settings;
    originalSettings = Object.assign({}, data.settings);

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
    alert('خطأ: ' + err.message);
  });
}

function reloadSettings() {
  var area = document.getElementById('contentArea');
  loadSettingsPage(area);
}
