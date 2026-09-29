// ═══════════════════════════════════════════════════════
//   Update Page Logic
//   ⚡ المستخدم ضغط "تحديث الآن" → يمسح الكاش + Reload
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
//   Load Versions from URL Params or Storage
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
    // ═══ Step 1: مسح الـCaches (30%) ═══
    updateProgress_(10, '🗑️ جاري مسح الملفات القديمة...');

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log('🗑️ Caches to delete:', cacheNames);

      for (let i = 0; i < cacheNames.length; i++) {
        await caches.delete(cacheNames[i]);
        const percent = 10 + Math.round((i + 1) / cacheNames.length * 20);
        updateProgress_(percent, `🗑️ جاري مسح الملفات (${i + 1}/${cacheNames.length})...`);
      }
      console.log('✅ All caches cleared');
    }

    // ═══ Step 2: Unregister Service Worker (60%) ═══
    updateProgress_(40, '⚙️ جاري تحديث التكوين...');

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('⚙️ SW registrations:', registrations.length);

      for (let i = 0; i < registrations.length; i++) {
        await registrations[i].unregister();
        const percent = 40 + Math.round((i + 1) / registrations.length * 20);
        updateProgress_(percent, `⚙️ جاري تحديث التكوين (${i + 1}/${registrations.length})...`);
      }
      console.log('✅ All SWs unregistered');
    }

    // ═══ Step 3: احفظ الإصدار (80%) ═══
    updateProgress_(70, '💾 جاري حفظ الإصدار الجديد...');

    const params = new URLSearchParams(window.location.search);
    const newVersion = params.get('to') || '1';

    localStorage.setItem(VERSION_STORAGE_KEY, newVersion);
    console.log(`✅ Saved version: ${newVersion}`);

    // ═══ Step 4: Reload (100%) ═══
    updateProgress_(90, '✨ جاري إعادة التشغيل...');

    await new Promise(r => setTimeout(r, 600));
    updateProgress_(100, '✅ التحديث اكتمل!');

    // ═══ Success Animation ═══
    const card = document.querySelector('.update-card');
    if (card) card.classList.add('success');

    const icon = document.querySelector('.update-icon');
    if (icon) icon.textContent = '✅';

    const title = document.querySelector('.update-title');
    if (title) title.textContent = 'تم التحديث بنجاح!';

    const message = document.querySelector('.update-message');
    if (message) message.innerHTML = 'جاري فتح التطبيق...';

    if (updateProgress) {
      updateProgress.style.display = 'none';
    }

    updateBtn.querySelector('.update-btn-icon').textContent = '✅';
    updateBtn.querySelector('.update-btn-text').textContent = 'جاري الفتح...';

        await new Promise(r => setTimeout(r, 800));

    // ═══════════════════════════════════════════════════
    //   ⚡ Redirect بعد التحديث
    //   - لو المستخدم عنده كذا role → صفحة اختيار الواجهة
    //   - لو عنده role واحد → الداشبورد
    // ═══════════════════════════════════════════════════

    const pendingRoles = localStorage.getItem('_pendingRoles');
    const savedWorkspace = localStorage.getItem('currentWorkspace');

    if (pendingRoles) {
      // ⚡ المستخدم عنده أدوار متعددة → روح لصفحة الدخول
      //    عشان auth.js يعرض صفحة اختيار الواجهة
      console.log('🎭 Multiple roles — redirecting to role selection');
      localStorage.removeItem('_pendingRoles');

      // ⚡ نظّف الـworkspace المؤقت
      if (savedWorkspace) {
        localStorage.removeItem('currentWorkspace');
      }

      // ⚡ اذهب للصفحة الرئيسية (auth.js هيتعامل مع العرض)
      window.location.href = '../index.html';
      return;
    }

    // ⚡ role واحد → الداشبورد مباشرة
    if (savedWorkspace) {
      console.log(`✅ Single role — redirecting to dashboard`);
      window.location.href = 'dashboard.html';
      return;
    }

    // ⚡ Fallback
    console.log('⚠️ No saved workspace — redirecting to login');
    window.location.href = '../index.html';

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
//   Check Auth — لو مش مسجل، ارجع لصفحة الدخول
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
  // ⚡ تحقق من الصلاحية
  if (!checkAuth()) return;

  // ⚡ حمّل معلومات الإصدار
  loadVersionInfo();

  // ⚡ اربط الزر
  if (updateBtn) {
    updateBtn.onclick = handleUpdate;
  }

  console.log('✅ update.js initialized');
});

// ═══ Expose ═══
window.handleUpdate = handleUpdate;
