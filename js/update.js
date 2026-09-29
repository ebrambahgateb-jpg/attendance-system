// ═══════════════════════════════════════════════════════
//   Update Page Logic
//   ⚡ يفرّق بين Android (auto-update) و iOS (manual)
// ═══════════════════════════════════════════════════════

// ═══ Constants ═══
const VERSION_STORAGE_KEY = 'pwa_icon_version_seen';

// ═══ DOM Elements ═══
const updateBtn = document.getElementById('updateBtn');
const updateProgress = document.getElementById('updateProgress');
const updateProgressFill = document.getElementById('updateProgressFill');
const updateProgressText = document.getElementById('updateProgressText');
const oldVersionEl = document.getElementById('oldVersion');
const newVersionEl = document.getElementById('newVersion');

// ═══════════════════════════════════════════════════════
//   Load Versions
// ═══════════════════════════════════════════════════════

function loadVersionInfo() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '0';
  const to = params.get('to') || '1';

  if (oldVersionEl) oldVersionEl.textContent = `v${from}`;
  if (newVersionEl) newVersionEl.textContent = `v${to}`;

  console.log(`📱 Update: from v${from} → v${to}`);
}

// ═══════════════════════════════════════════════════════
//   Update Progress Bar
// ═══════════════════════════════════════════════════════

function updateProgress_(percent, text) {
  if (updateProgressFill) {
    updateProgressFill.style.width = `${percent}%`;
  }
  if (updateProgressText && text) {
    updateProgressText.textContent = text;
  }
}

// ═══════════════════════════════════════════════════════
//   Detect Platform
// ═══════════════════════════════════════════════════════

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

// ═══════════════════════════════════════════════════════
//   Update Handler
// ═══════════════════════════════════════════════════════

async function handleUpdate() {
  if (!updateBtn) return;

  // ⚡ Disable الزر
  updateBtn.disabled = true;
  updateBtn.classList.add('loading');
  updateBtn.querySelector('.update-btn-icon').textContent = '⏳';
  updateBtn.querySelector('.update-btn-text').textContent = 'جاري التحديث...';

  // ⚡ أظهر شريط التقدم
  if (updateProgress) {
    updateProgress.style.display = 'block';
  }

  try {
    // ═══ Step 1: مسح الـCaches (20%) ═══
    updateProgress_(10, '🗑️ جاري مسح الملفات القديمة...');

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log('🗑️ Caches to delete:', cacheNames);

      for (let i = 0; i < cacheNames.length; i++) {
        await caches.delete(cacheNames[i]);
        const percent = 10 + Math.round((i + 1) / cacheNames.length * 15);
        updateProgress_(percent, `🗑️ جاري مسح الملفات (${i + 1}/${cacheNames.length})...`);
      }
      console.log('✅ All caches cleared');
    }

    // ═══ Step 2: Unregister Service Worker (40%) ═══
    updateProgress_(35, '⚙️ جاري تحديث التكوين...');

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('⚙️ SW registrations:', registrations.length);

      for (let i = 0; i < registrations.length; i++) {
        await registrations[i].unregister();
        const percent = 35 + Math.round((i + 1) / registrations.length * 15);
        updateProgress_(percent, `⚙️ جاري تحديث التكوين (${i + 1}/${registrations.length})...`);
      }
      console.log('✅ All SWs unregistered');
    }

    // ═══ Step 3: احفظ الإصدار (60%) ═══
    updateProgress_(55, '💾 جاري حفظ الإصدار الجديد...');

    const params = new URLSearchParams(window.location.search);
    const newVersion = params.get('to') || '1';

    localStorage.setItem(VERSION_STORAGE_KEY, newVersion);
    console.log(`✅ Saved version: ${newVersion}`);

    // ═══ Step 4: تجهيز شاشة النتيجة (80%) ═══
    updateProgress_(75, '✨ جاري إعادة التشغيل...');

    const pendingRoles = localStorage.getItem('_pendingRoles');
    const savedWorkspace = localStorage.getItem('currentWorkspace');

    await new Promise(r => setTimeout(r, 400));

    updateProgress_(100, '✅ التحديث اكتمل!');

    await new Promise(r => setTimeout(r, 300));

    // ═══ Show Platform-Specific Result ═══
    showResultScreen(pendingRoles, savedWorkspace);

  } catch (err) {
    console.error('❌ Update error:', err);

    updateProgress_(100, '⚠️ حدث خطأ — إعادة المحاولة...');

    // ⚡ Reload عادي كـFallback
    setTimeout(() => {
      window.location.reload(true);
    }, 1500);
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Show Result Screen — Platform-Specific
// ═══════════════════════════════════════════════════════

function showResultScreen(pendingRoles, savedWorkspace) {
  const platform = detectPlatform();
  const card = document.querySelector('.update-card');
  if (!card) return;

  card.classList.add('success');

  if (platform === 'android') {
    // ⚡ Android: Auto-update — رسالة بسيطة
    showAndroidSuccess(card);
  } else if (platform === 'ios') {
    // ⚡ iOS: Manual reinstall — خطوات
    showIOSInstructions(card);
  } else {
    // ⚡ Desktop: Auto-update — رسالة بسيطة
    showDesktopSuccess(card);
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Android Success (Auto-update)
// ═══════════════════════════════════════════════════════

function showAndroidSuccess(card) {
  card.innerHTML = `
    <div class="update-icon">✅</div>
    <h1 class="update-title">تم التحديث بنجاح</h1>
    <p class="update-message">
      ✅ تم تحديث التطبيق بنجاح.<br>
      <strong>الأيقونة الجديدة ستظهر تلقائيًا خلال 24-72 ساعة.</strong>
    </p>

    <div class="auto-update-note">
      <div class="auto-update-icon">🔄</div>
      <div class="auto-update-text">
        <strong>تحديث تلقائي</strong>
        <span>لا تحتاج لعمل أي شيء — الأيقونة هتتحدث لوحدها</span>
      </div>
    </div>

    <div class="reinstall-note" style="margin-top: 16px;">
      💡 <strong>نصيحة:</strong> لو عايز الأيقونة الجديدة فورًا، يمكنك:
      <ol style="margin-top: 8px; padding-right: 20px; line-height: 1.7;">
        <li>اضغط مطوّلاً على الأيقونة</li>
        <li>اختر <strong>"إلغاء التثبيت"</strong></li>
        <li>افتح الموقع في Chrome</li>
        <li>اختر <strong>"تثبيت التطبيق"</strong> من القائمة (⋮)</li>
      </ol>
    </div>

    <button class="update-btn" id="proceedBtn" style="margin-top: 20px;">
      <span class="update-btn-icon">🚀</span>
      <span class="update-btn-text">فتح التطبيق</span>
    </button>
  `;

  const proceedBtn = document.getElementById('proceedBtn');
  if (proceedBtn) {
    proceedBtn.onclick = () => {
      console.log('🚀 Proceeding to dashboard');
      window.location.href = 'dashboard.html';
    };
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ iOS Instructions (Manual reinstall)
// ═══════════════════════════════════════════════════════

function showIOSInstructions(card) {
  card.innerHTML = `
    <div class="update-icon">✅</div>
    <h1 class="update-title">تم التحديث بنجاح</h1>
    <p class="update-message">
      ✅ تم تحديث التطبيق للملفات الأخيرة.<br>
      <strong>على iPhone، لازم تعيد تثبيت التطبيق عشان الأيقونة الجديدة تظهر.</strong>
    </p>

    <div class="reinstall-box">
      <div class="reinstall-box-title">📱 خطوات إعادة التثبيت (iOS):</div>
      <ol class="reinstall-steps">
        <li>روح للشاشة الرئيسية</li>
        <li>اضغط مطوّلاً على أيقونة التطبيق</li>
        <li>اختر <strong>"إزالة الإشارة المرجعية"</strong> أو <strong>"حذف التطبيق"</strong></li>
        <li>افتح الموقع في <strong>Safari</strong></li>
        <li>اضغط زر <strong>المشاركة</strong> (⬆️)</li>
        <li>اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></li>
      </ol>
    </div>

    <div class="reinstall-note">
      💡 <strong>ملاحظة:</strong> التطبيق اشتغل بالفعل بالكود الجديد. لكن <strong>الأيقونة</strong> اللي على الشاشة الرئيسية لازم تتغير يدويًا.
    </div>

    <button class="update-btn" id="proceedBtn" style="margin-top: 20px;">
      <span class="update-btn-icon">🚀</span>
      <span class="update-btn-text">فتح التطبيق</span>
    </button>

    <p class="update-note">
      ⚡ يمكنك المتابعة بالبرنامج الآن
    </p>
  `;

  const proceedBtn = document.getElementById('proceedBtn');
  if (proceedBtn) {
    proceedBtn.onclick = () => {
      console.log('🚀 Proceeding to dashboard');
      window.location.href = 'dashboard.html';
    };
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Desktop Success (Auto-update)
// ═══════════════════════════════════════════════════════

function showDesktopSuccess(card) {
  card.innerHTML = `
    <div class="update-icon">✅</div>
    <h1 class="update-title">تم التحديث بنجاح</h1>
    <p class="update-message">
      ✅ تم تحديث التطبيق بنجاح.<br>
      <strong>الأيقونة الجديدة هتظهر تلقائيًا خلال 24 ساعة.</strong>
    </p>

    <div class="auto-update-note">
      <div class="auto-update-icon">🔄</div>
      <div class="auto-update-text">
        <strong>تحديث تلقائي</strong>
        <span>لا تحتاج لعمل أي شيء</span>
      </div>
    </div>

    <button class="update-btn" id="proceedBtn" style="margin-top: 20px;">
      <span class="update-btn-icon">🚀</span>
      <span class="update-btn-text">فتح التطبيق</span>
    </button>
  `;

  const proceedBtn = document.getElementById('proceedBtn');
  if (proceedBtn) {
    proceedBtn.onclick = () => {
      console.log('🚀 Proceeding to dashboard');
      window.location.href = 'dashboard.html';
    };
  }
}

// ═══════════════════════════════════════════════════════
//   Check Auth
// ═══════════════════════════════════════════════════════

function checkAuth() {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user || !user.uid) {
      console.log('⏭️ Not authenticated — redirecting to login');
      window.location.href = '../index.html';
      return false;
    }
    return true;
  } catch (e) {
    window.location.href = '../index.html';
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Initialize
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  loadVersionInfo();

  if (updateBtn) {
    updateBtn.onclick = handleUpdate;
  }

  console.log('✅ update.js initialized');
});

// ═══ Expose ═══
window.handleUpdate = handleUpdate;
