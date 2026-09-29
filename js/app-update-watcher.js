// ═══════════════════════════════════════════════════════
//   App Update Watcher
//   ⚡ فحص عند فتح البرنامج + عند الرجوع للتاب
// ═══════════════════════════════════════════════════════

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC
} from './firebase-config.js';

// ═══ Constants ═══
const VERSION_STORAGE_KEY = 'pwa_icon_version_seen';

// ═══ State ═══
let isRedirecting = false;

// ═══════════════════════════════════════════════════════
//   ⚡ Check Update
// ═══════════════════════════════════════════════════════

async function checkForUpdate() {
  // ⚡ لو بنعمل Redirect بالفعل → تجاهل
  if (isRedirecting) return;

  try {
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) return;

    const settings = settingsSnap.data();
    const currentVersion = Number(settings.PWAIconVersion) || 0;

    if (currentVersion === 0) return;

    const seenVersion = Number(localStorage.getItem(VERSION_STORAGE_KEY)) || 0;

    // ⚡ لو محدّث → مفيش حاجة
    if (currentVersion <= seenVersion) return;

    // ⚡ ⚡ ⚡ في إصدار جديد!
    console.log(`🔄 App update detected: v${seenVersion} → v${currentVersion}`);

    isRedirecting = true;

    // ⚡ منع أي تفاعل مع الصفحة
    blockCurrentPage();

    // ⚡ انتظر شوية للـUX
    await new Promise(r => setTimeout(r, 300));

    // ⚡ تحويل لصفحة التحديث
    window.location.href = `../pages/update.html?from=${seenVersion}&to=${currentVersion}`;

  } catch (err) {
    console.warn('⚠️ checkForUpdate error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Block Current Page
// ═══════════════════════════════════════════════════════

function blockCurrentPage() {
  // ⚡ اقفل كل الأزرار
  document.querySelectorAll('button, a, input, select, textarea').forEach(el => {
    el.disabled = true;
    el.style.pointerEvents = 'none';
    el.style.opacity = '0.5';
  });

  // ⚡ منع Click / Touch / Keyboard
  document.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ⚡ Show overlay
  showBlockingOverlay();
}

function showBlockingOverlay() {
  if (document.getElementById('appUpdateOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'appUpdateOverlay';
  overlay.innerHTML = `
    <div class="app-update-overlay-content">
      <div class="app-update-overlay-icon">🚀</div>
      <h2 class="app-update-overlay-title">تحديث التطبيق</h2>
      <p class="app-update-overlay-message">جاري التحويل لصفحة التحديث...</p>
      <div class="app-update-overlay-spinner"></div>
    </div>
  `;

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999999;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    font-family: 'Segoe UI', Tahoma, sans-serif;
    direction: rtl;
    animation: appUpdateFadeIn 0.3s ease;
  `;

  document.body.appendChild(overlay);

  // ═══ Animation CSS ═══
  if (!document.getElementById('appUpdateOverlayStyles')) {
    const style = document.createElement('style');
    style.id = 'appUpdateOverlayStyles';
    style.textContent = `
      @keyframes appUpdateFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .app-update-overlay-content {
        text-align: center;
        color: #ffffff;
        max-width: 400px;
      }

      .app-update-overlay-icon {
        font-size: 80px;
        margin-bottom: 20px;
        animation: appUpdateOverlayBounce 1.5s infinite;
      }

      @keyframes appUpdateOverlayBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-15px); }
      }

      .app-update-overlay-title {
        font-size: 26px;
        font-weight: 800;
        margin: 0 0 12px 0;
        background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .app-update-overlay-message {
        font-size: 15px;
        color: #cbd5e1;
        margin: 0 0 24px 0;
        line-height: 1.6;
      }

      .app-update-overlay-spinner {
        width: 44px;
        height: 44px;
        border: 4px solid rgba(96, 165, 250, 0.25);
        border-top-color: #60a5fa;
        border-radius: 50%;
        animation: appUpdateSpinner 0.8s linear infinite;
        margin: 0 auto;
      }

      @keyframes appUpdateSpinner {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Start Watching
// ═══════════════════════════════════════════════════════

export function startAppUpdateWatcher() {
  console.log('👁️ App Update Watcher started');

  // ⚡ 1. فحص فوري عند فتح البرنامج
  checkForUpdate();

  // ⚡ 2. فحص عند رجوع التاب للـForeground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('👁️ Tab visible — checking for update');
      checkForUpdate();
    }
  });

  // ⚡ 3. فحص عند رجوع النت
  window.addEventListener('online', () => {
    console.log('🌐 Back online — checking for update');
    checkForUpdate();
  });

  // ⚡ 4. فحص عند رجوع الـFocus للـWindow
  window.addEventListener('focus', () => {
    console.log('👁️ Window focused — checking for update');
    checkForUpdate();
  });
}

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.startAppUpdateWatcher = startAppUpdateWatcher;
window.checkForUpdate = checkForUpdate;

console.log('✅ app-update-watcher.js loaded');
