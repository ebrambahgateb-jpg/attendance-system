// ═══════════════════════════════════════════════════════
//   Authentication (Firebase Auth)
//   ⚡ محدّث: Auto-sync للصورة + Sign Up Flow Support
//   ⚡ محدّث: PWA Update Check قبل Dashboard
// ═══════════════════════════════════════════════════════

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  auth,
  db,
  googleProvider,
  COLLECTIONS
} from './firebase-config.js';

// ═══ Global State ═══
let currentUser = null;

// ═══ Screen Management ═══
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

function showMessage(msg, type) {
  const loginMessage = document.getElementById('loginMessage');
  if (!loginMessage) return;
  loginMessage.textContent = msg;
  loginMessage.className = 'message ' + (type || '');
}

// ═══ Sign In with Google ═══
async function signInWithGoogle() {
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  if (googleSignInBtn) googleSignInBtn.disabled = true;
  showMessage('جاري تسجيل الدخول...', '');

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;

    console.log('✅ Signed in:', firebaseUser.email);

    await checkUserInFirestore(firebaseUser);

  } catch (error) {
    console.error('❌ Sign in error:', error);

    let msg = 'حدث خطأ في تسجيل الدخول';
    if (error.code === 'auth/popup-closed-by-user') {
      msg = 'تم إغلاق نافذة تسجيل الدخول';
    } else if (error.code === 'auth/popup-blocked') {
      msg = 'تم حجب النافذة المنبثقة. اسمح بها من إعدادات المتصفح.';
    } else if (error.code === 'auth/network-request-failed') {
      msg = 'خطأ في الشبكة. تأكد من اتصالك بالإنترنت.';
    }

    showMessage(msg, 'error');
    if (googleSignInBtn) googleSignInBtn.disabled = false;
  }
}

// ═══ Check User in Firestore ═══
async function checkUserInFirestore(firebaseUser) {
  try {
    const accountRef = doc(db, COLLECTIONS.ACCOUNTS, firebaseUser.uid);
    const accountSnap = await getDoc(accountRef);

    // ═══ الحالة 1: الحساب غير موجود بالـUID ═══
    if (!accountSnap.exists()) {
      console.log('⚠️ Account not found for UID:', firebaseUser.uid);

      const found = await findAccountByEmail(firebaseUser.email);

      if (found) {
        await linkAccountToUid(found.id, firebaseUser.uid, firebaseUser);
        return;
      }

      // ⚡ نفحص لو فيه طلب تسجيل قائم
      const pendingRequest = await checkPendingSignupRequest(firebaseUser.email);
      const deniedMessage = document.getElementById('deniedMessage');

      if (pendingRequest) {
        if (pendingRequest.rejected) {
          if (deniedMessage) {
            deniedMessage.innerHTML = `
              ❌ <strong>تم رفض طلب التسجيل</strong><br><br>
              ${pendingRequest.RejectReason ? `السبب: ${pendingRequest.RejectReason}<br><br>` : ''}
              تواصل مع المسؤول لمزيد من التفاصيل.
            `;
          }
        } else {
          if (deniedMessage) {
            deniedMessage.innerHTML = `
              ⏳ <strong>عندك طلب تسجيل قيد المراجعة</strong><br><br>
              طلبك من <strong>${pendingRequest.CreatedAt ? new Date(pendingRequest.CreatedAt).toLocaleDateString('ar-EG') : ''}</strong><br>
              سيتم إشعارك عند الموافقة أو الرفض.
            `;
          }
        }
        showScreen('deniedScreen');
        try { await signOut(auth); } catch (e) {}
        return;
      }

      // ⚡ الحالة: مفيش حساب + مفيش طلب
      if (deniedMessage) {
        deniedMessage.innerHTML = `
          🚫 <strong>الحساب غير موجود</strong><br><br>
          يمكنك التسجيل من تبويب <strong>"حساب جديد"</strong> أعلى الصفحة.
        `;
      }
      showScreen('deniedScreen');
      try { await signOut(auth); } catch (e) {}
      return;
    }

    // ═══ الحالة 2: الحساب معطل ═══
    let account = accountSnap.data();
    if (account.Status && String(account.Status).toLowerCase() === 'disabled') {
      showScreen('disabledScreen');
      try { await signOut(auth); } catch (e) {}
      return;
    }

    // ═══ الحالة 3: اربط بـPersonID ═══
    const personId = await ensurePersonLink(firebaseUser, account);

    if (personId && !account.PersonID) {
      try {
        await updateDoc(accountRef, { PersonID: personId });
        account.PersonID = personId;
        console.log('✅ Account linked to person:', personId);
      } catch (e) {
        console.warn('Could not save PersonID:', e);
      }
    }

    // ═══ ⚡ Auto-sync صورة Google ═══
    if (personId && firebaseUser.photoURL) {
      await syncGooglePhoto(personId, firebaseUser.photoURL);
    }

    // ═══ الحالة 4: الأدوار ═══
    const roles = getRolesFromAccount(account);

    if (roles.length === 0) {
      const deniedMessage = document.getElementById('deniedMessage');
      if (deniedMessage) {
        deniedMessage.textContent = 'لا يوجد دور مخصص لحسابك. تواصل مع المسؤول.';
      }
      showScreen('deniedScreen');
      try { await signOut(auth); } catch (e) {}
      return;
    }

    // ═══ احفظ بيانات المستخدم ═══
    currentUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName || firebaseUser.email,
      photoURL: firebaseUser.photoURL || '',
      account: account,
      roles: roles,
      personId: personId || account.PersonID || null,
      currentWorkspace: null
    };

        // ═══════════════════════════════════════════════════
    //   ⚡ الحالة 5: فحص PWA Update قبل أي إجراء
    //   (قبل Dashboard وكمان قبل Workspace Selection)
    // ═══════════════════════════════════════════════════

    let needsUpdate = null;
    try {
      needsUpdate = await checkPWAUpdate();
    } catch (err) {
      console.warn('⚠️ checkPWAUpdate error:', err.message);
    }

    if (needsUpdate) {
      const { from, to } = needsUpdate;
      console.log(`🔄 PWA update needed: v${from} → v${to}`);

      // ⚡ خزّن الـrole المختار (أو أول role) — للرجوع بعد التحديث
      //    لو المستخدم عنده role واحد بس → نحفظه
      //    لو عنده كذا role → نحفظ إننا محتاجين نختار workspace بعد التحديث

      if (roles.length === 1) {
        // ⚡ احفظ الـworkspace عشان بعد التحديث يدخل على طول
        localStorage.setItem('currentWorkspace', roles[0]);
      } else {
        // ⚡ امسح أي workspace محفوظ عشان بعد التحديث يروح لصفحة الاختيار
        localStorage.removeItem('currentWorkspace');

        // ⚡ خزّن الأدوار عشان بعد التحديث نعرض الصفحة تاني
        localStorage.setItem('_pendingRoles', JSON.stringify(roles));
      }

      // ⚡ احفظ بيانات المستخدم
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // ⚡ روح لصفحة التحديث
      window.location.href = `pages/update.html?from=${from}&to=${to}`;
      return;
    }

    // ═══ ⚡ مفيش Update — كمّل عادي ═══
    if (roles.length === 1) {
      await goToDashboard(roles[0]);
      return;
    }

    showWorkspaceSelection(roles);

  } catch (error) {
    console.error('❌ Firestore check error:', error);
    showMessage('خطأ في الاتصال بقاعدة البيانات', 'error');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) googleSignInBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Check Pending Signup Request
// ═══════════════════════════════════════════════════════

async function checkPendingSignupRequest(email) {
  if (!email) return null;

  try {
    const emailLower = String(email).toLowerCase().trim();

    // ⚡ فحص الطلبات المعلقة
    const q = query(
      collection(db, 'signupRequests'),
      where('Email', '==', emailLower),
      where('Status', '==', 'pending')
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data(), rejected: false };
    }

    // ⚡ فحص الطلبات المرفوضة
    const q2 = query(
      collection(db, 'signupRequests'),
      where('Email', '==', emailLower),
      where('Status', '==', 'rejected')
    );
    const snap2 = await getDocs(q2);

    if (!snap2.empty) {
      return { id: snap2.docs[0].id, ...snap2.docs[0].data(), rejected: true };
    }

    return null;
  } catch (e) {
    console.warn('checkPendingSignupRequest error:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Sync Google Photo
// ═══════════════════════════════════════════════════════

async function syncGooglePhoto(personId, googlePhotoURL) {
  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, personId);
    const personSnap = await getDoc(personRef);

    if (!personSnap.exists()) return;

    const person = personSnap.data();

    if (person.PhotoURL && String(person.PhotoURL).trim() !== '') {
      return;
    }

    await updateDoc(personRef, {
      PhotoURL: googlePhotoURL,
      PhotoSource: 'google',
      PhotoSyncedAt: new Date().toISOString()
    });

    console.log('✅ Google photo synced for person:', personId);
  } catch (err) {
    console.warn('⚠️ syncGooglePhoto error:', err.message);
  }
}

// ═══ Ensure Person Link ═══
async function ensurePersonLink(firebaseUser, account) {
  if (account.PersonID) {
    try {
      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, account.PersonID));
      if (pDoc.exists()) return account.PersonID;
    } catch (e) {}
  }

  if (firebaseUser.email) {
    try {
      const emailLower = String(firebaseUser.email).toLowerCase().trim();

      const q = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', emailLower)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        return snap.docs[0].id;
      }

      // ⚡ محاولة بالإيميل الأصلي
      const q2 = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', firebaseUser.email)
      );
      const snap2 = await getDocs(q2);

      if (!snap2.empty) {
        return snap2.docs[0].id;
      }
    } catch (e) {
      console.warn('Person link by email error:', e);
    }
  }

  return null;
}

// ═══ Find Account by Email ═══
async function findAccountByEmail(email) {
  if (!email) return null;

  const emailLower = String(email).toLowerCase().trim();

  try {
    let q = query(
      collection(db, COLLECTIONS.ACCOUNTS),
      where('Email', '==', emailLower)
    );
    let snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      return { id: docSnap.id, data: docSnap.data() };
    }

    if (email !== emailLower) {
      q = query(
        collection(db, COLLECTIONS.ACCOUNTS),
        where('Email', '==', email)
      );
      snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        return { id: docSnap.id, data: docSnap.data() };
      }
    }

    console.log('🔍 Searching all accounts manually...');
    const allSnap = await getDocs(collection(db, COLLECTIONS.ACCOUNTS));

    for (const docSnap of allSnap.docs) {
      const accEmail = String(docSnap.data().Email || '').toLowerCase().trim();
      if (accEmail === emailLower) {
        console.log('✅ Found by manual search:', docSnap.id);
        return { id: docSnap.id, data: docSnap.data() };
      }
    }

    console.warn('❌ No account found for:', emailLower);
    return null;

  } catch (error) {
    console.error('❌ findAccountByEmail error:', error);
    return null;
  }
}

// ═══ Link Account to UID ═══
async function linkAccountToUid(oldDocId, newUid, firebaseUser) {
  try {
    console.log(`🔗 Linking account: ${oldDocId} → ${newUid}`);

    const oldRef = doc(db, COLLECTIONS.ACCOUNTS, oldDocId);
    const oldSnap = await getDoc(oldRef);

    if (!oldSnap.exists()) {
      console.warn('⚠️ Old account not found');
      return;
    }

    const data = oldSnap.data();

    const newRef = doc(db, COLLECTIONS.ACCOUNTS, newUid);

    await setDoc(newRef, {
      ...data,
      UID: newUid,
      Email: String(data.Email || firebaseUser.email).toLowerCase().trim(),
      LinkedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    });

    console.log('✅ New account created with UID:', newUid);

    if (oldDocId !== newUid) {
      try {
        await deleteDoc(oldRef);
        console.log('🗑️ Old account removed:', oldDocId);
      } catch (e) {
        console.warn('⚠️ Could not delete old account:', e.message);
      }
    }

    await checkUserInFirestore(firebaseUser);

  } catch (error) {
    console.error('❌ linkAccountToUid error:', error);
    showMessage('خطأ في ربط الحساب: ' + error.message, 'error');
  }
}

// ═══ Get Roles from Account ═══
function getRolesFromAccount(account) {
  if (!account || !account.Role) return [];
  return String(account.Role)
    .split(',')
    .map(r => r.trim())
    .filter(r => ['Owner', 'Admin', 'Scanner', 'User'].includes(r));
}

// ═══ Show Workspace Selection ═══
function showWorkspaceSelection(roles) {
  const rolesList = document.getElementById('rolesList');
  if (!rolesList) return;

  rolesList.innerHTML = '';

  const workspaceMap = {
    'Owner':   { label: 'واجهة المالك',  icon: '👑', desc: 'إدارة كاملة للنظام' },
    'Admin':   { label: 'واجهة المدير',  icon: '⚙️', desc: 'إدارة كاملة ما عدا الحسابات والإعدادات' },
    'Scanner': { label: 'واجهة الماسح',  icon: '📷', desc: 'المسح وتسجيل الحضور' },
    'User':    { label: 'واجهة المستخدم', icon: '🎭', desc: 'حسابي، حضوري، الأحداث' }
  };

  const titleEl = document.querySelector('#roleScreen h2');
  if (titleEl) titleEl.textContent = 'اختر الواجهة';

  const subtitleEl = document.querySelector('#roleScreen .subtitle');
  if (subtitleEl) subtitleEl.textContent = 'حسابك له أكثر من واجهة، اختر الواجهة التي تريد الدخول بها';

  roles.forEach(role => {
    const info = workspaceMap[role] || { label: role, icon: '👤', desc: '' };

    const btn = document.createElement('button');
    btn.className = 'role-btn';
    btn.innerHTML = `
      <span class="role-icon">${info.icon}</span>
      <div style="display:flex;flex-direction:column;align-items:flex-start;flex:1;text-align:right;">
        <strong style="font-size:15px;">${info.label}</strong>
        <small style="font-size:12px;opacity:0.7;font-weight:400;">${info.desc}</small>
      </div>
    `;
    btn.onclick = () => goToDashboard(role);
    rolesList.appendChild(btn);
  });

  showScreen('roleScreen');
}

// ═══════════════════════════════════════════════════════
//   ⚡ Go to Dashboard — with PWA update check
// ═══════════════════════════════════════════════════════

async function goToDashboard(workspaceId) {
  if (!currentUser) return;

  currentUser.currentWorkspace = workspaceId;
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  localStorage.setItem('currentWorkspace', workspaceId);

  // ⚡ ⚡ ⚡ فحص إصدار PWA قبل الدخول
  try {
    const needsUpdate = await checkPWAUpdate();

    if (needsUpdate) {
      const { from, to } = needsUpdate;
      console.log(`🔄 Redirecting to update page: v${from} → v${to}`);
      window.location.href = `pages/update.html?from=${from}&to=${to}`;
      return;
    }
  } catch (err) {
    console.warn('⚠️ checkPWAUpdate error:', err.message);
  }

  // ⚡ محدّث → الداشبورد
  window.location.href = 'pages/dashboard.html';
}

// ═══════════════════════════════════════════════════════
//   ⚡ Check PWA Update
// ═══════════════════════════════════════════════════════

async function checkPWAUpdate() {
  try {
    const settingsRef = doc(db, COLLECTIONS.SETTINGS, 'main');
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) return null;

    const settings = settingsSnap.data();
    const currentVersion = Number(settings.PWAIconVersion) || 0;

    if (currentVersion === 0) return null;

    const seenVersion = Number(localStorage.getItem('pwa_icon_version_seen')) || 0;

    console.log(`📱 PWA version: current=${currentVersion}, seen=${seenVersion}`);

    // ⚡ محدّث
    if (currentVersion <= seenVersion) {
      return null;
    }

    // ⚡ محتاج تحديث
    console.log(`🔄 PWA update needed: ${seenVersion} → ${currentVersion}`);
    return { from: seenVersion, to: currentVersion };

  } catch (err) {
    console.warn('⚠️ checkPWAUpdate error:', err.message);
    return null;
  }
}

// ═══ Logout ═══
async function logout() {
  try {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentWorkspace');
    try { sessionStorage.clear(); } catch (e) {}
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
  }
  window.location.href = 'index.html';
}

// ═══════════════════════════════════════════════════════
//   ⚡ Event Listeners — Robust Binding
// ═══════════════════════════════════════════════════════

function bindAuthButtons() {
  const gBtn = document.getElementById('googleSignInBtn');
  if (gBtn && !gBtn._bound) {
    gBtn._bound = true;
    gBtn.onclick = signInWithGoogle;
    console.log('✅ Google Sign-In button bound');
  }

  const lBtn = document.getElementById('logoutBtn');
  if (lBtn && !lBtn._bound) {
    lBtn._bound = true;
    lBtn.onclick = logout;
  }
}

// ⚡ اربط فورًا
bindAuthButtons();

// ⚡ اربط بعد DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAuthButtons);
}

// ⚡ إعادة محاولات للربط (للأمان)
setTimeout(bindAuthButtons, 500);
setTimeout(bindAuthButtons, 1500);
setTimeout(bindAuthButtons, 3000);

// ⚡ Expose للاستخدام من ملفات تانية
window._rebindAuthButtons = bindAuthButtons;

// ═══════════════════════════════════════════════════════
//   ⚡ Auto-redirect if already signed in
// ═══════════════════════════════════════════════════════

onAuthStateChanged(auth, async (firebaseUser) => {
  // ⚡ لو في Sign Up flow → تجاهل
  if (window._signupFlowActive === true) {
    console.log('⏭️ Sign Up flow active — skipping auth handling');
    return;
  }

  if (firebaseUser) {
    console.log('👤 Already signed in:', firebaseUser.email);

    const saved = localStorage.getItem('currentUser');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.uid === firebaseUser.uid && parsed.currentWorkspace) {
          // ⚡ فحص PWA Update قبل التحويل
          const needsUpdate = await checkPWAUpdate();
          if (needsUpdate) {
            const { from, to } = needsUpdate;
            window.location.href = `pages/update.html?from=${from}&to=${to}`;
            return;
          }
          window.location.href = 'pages/dashboard.html';
          return;
        }
      } catch (e) {}
    }

    await checkUserInFirestore(firebaseUser);
  } else {
    console.log('👤 No user signed in');
    showScreen('loginScreen');
    const gBtn = document.getElementById('googleSignInBtn');
    if (gBtn) gBtn.disabled = false;
  }
});

// ═══ Export for other scripts ═══
export { currentUser, logout };
