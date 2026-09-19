// ═══════════════════════════════════════════════════════
//   Authentication (Firebase Auth)
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

// ═══ DOM Elements ═══
const loginScreen = document.getElementById('loginScreen');
const roleScreen = document.getElementById('roleScreen');
const deniedScreen = document.getElementById('deniedScreen');
const disabledScreen = document.getElementById('disabledScreen');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const loginMessage = document.getElementById('loginMessage');
const rolesList = document.getElementById('rolesList');
const logoutBtn = document.getElementById('logoutBtn');
const deniedMessage = document.getElementById('deniedMessage');

// ═══ Screen Management ═══
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

function showMessage(msg, type) {
  if (!loginMessage) return;
  loginMessage.textContent = msg;
  loginMessage.className = 'message ' + (type || '');
}

// ═══ Sign In with Google ═══
async function signInWithGoogle() {
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

    // ═══ الحالة 1: الحساب غير موجود → دوّر بالبريد ═══
    if (!accountSnap.exists()) {
      console.log('⚠️ Account not found for UID:', firebaseUser.uid);
      console.log('📧 Email:', firebaseUser.email);

      const found = await findAccountByEmail(firebaseUser.email);

      if (found) {
        await linkAccountToUid(found.id, firebaseUser.uid, firebaseUser);
        return;
      }

      if (deniedMessage) {
        deniedMessage.textContent = 'الحساب غير موجود في النظام. تواصل مع المسؤول.';
      }
      showScreen('deniedScreen');
      await signOut(auth);
      return;
    }

    // ═══ الحالة 2: الحساب موجود لكن معطل ═══
    let account = accountSnap.data();
    if (account.Status && String(account.Status).toLowerCase() === 'disabled') {
      showScreen('disabledScreen');
      await signOut(auth);
      return;
    }

    // ═══ الحالة 3: اربط بـPersonID (لو مش مربوط) ═══
    const personId = await ensurePersonLink(firebaseUser, account);

    // احفظ PersonID في account إذا اتربط
    if (personId && !account.PersonID) {
      try {
        await updateDoc(accountRef, { PersonID: personId });
        account.PersonID = personId;
        console.log('✅ Account linked to person:', personId);
      } catch (e) {
        console.warn('Could not save PersonID:', e);
      }
    }

    // ═══ الحالة 4: الأدوار ═══
    const roles = getRolesFromAccount(account);

    if (roles.length === 0) {
      if (deniedMessage) {
        deniedMessage.textContent = 'لا يوجد دور مخصص لحسابك. تواصل مع المسؤول.';
      }
      showScreen('deniedScreen');
      await signOut(auth);
      return;
    }

    // احفظ بيانات المستخدم
    currentUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName || firebaseUser.email,
      photoURL: firebaseUser.photoURL || '',
      account: account,
      roles: roles,
      personId: personId || account.PersonID || null,
      selectedRole: null
    };

    // لو عنده دور واحد → ادخل مباشرة
    if (roles.length === 1) {
      goToDashboard(roles[0]);
      return;
    }

    // لو أكثر من دور → اختار
    showRoleSelection(roles);

  } catch (error) {
    console.error('❌ Firestore check error:', error);
    showMessage('خطأ في الاتصال بقاعدة البيانات', 'error');
    if (googleSignInBtn) googleSignInBtn.disabled = false;
  }
}

// ═══ Ensure Person Link ═══
async function ensurePersonLink(firebaseUser, account) {
  // 1. لو account.PersonID موجود → تأكد إنه لسه في people
  if (account.PersonID) {
    try {
      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, account.PersonID));
      if (pDoc.exists()) return account.PersonID;
    } catch (e) {}
  }

  // 2. دوّر بالبريد
  if (firebaseUser.email) {
    try {
      const q = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', firebaseUser.email)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const personDoc = snap.docs[0];
        return personDoc.id;
      }
    } catch (e) {
      console.warn('Person link by email error:', e);
    }
  }

  return null;
}

// ═══ Find Account by Email ═══
async function findAccountByEmail(email) {
  try {
    const q = query(
      collection(db, COLLECTIONS.ACCOUNTS),
      where('Email', '==', email)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, data: docSnap.data() };
  } catch (error) {
    console.error('❌ findAccountByEmail error:', error);
    return null;
  }
}

// ═══ Link Account to UID ═══
async function linkAccountToUid(oldDocId, newUid, firebaseUser) {
  try {
    const oldRef = doc(db, COLLECTIONS.ACCOUNTS, oldDocId);
    const oldSnap = await getDoc(oldRef);

    if (!oldSnap.exists()) return;

    const data = oldSnap.data();

    // أنشئ document جديد بالـ UID
    const newRef = doc(db, COLLECTIONS.ACCOUNTS, newUid);
    await setDoc(newRef, {
      ...data,
      UID: newUid,
      UpdatedAt: new Date().toISOString()
    });

    // امسح الـ document القديم (لو الـ ID مختلف)
    if (oldDocId !== newUid) {
      await deleteDoc(oldRef);
    }

    console.log('✅ Account linked to UID:', newUid);

    // أعد الفحص
    await checkUserInFirestore(firebaseUser);

  } catch (error) {
    console.error('❌ linkAccountToUid error:', error);
    showMessage('خطأ في ربط الحساب', 'error');
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

// ═══ Show Role Selection ═══
function showRoleSelection(roles) {
  if (!rolesList) return;

  rolesList.innerHTML = '';
  const icons = {
    'Owner': '👑',
    'Admin': '🛠️',
    'Scanner': '📷',
    'User': '👤'
  };

  roles.forEach(role => {
    const btn = document.createElement('button');
    btn.className = 'role-btn';
    btn.innerHTML = `<span class="role-icon">${icons[role] || '👤'}</span> ${role}`;
    btn.onclick = () => goToDashboard(role);
    rolesList.appendChild(btn);
  });

  showScreen('roleScreen');
}

// ═══ Go to Dashboard ═══
function goToDashboard(role) {
  if (!currentUser) return;

  currentUser.selectedRole = role;
  localStorage.setItem('currentUser', JSON.stringify(currentUser));

  window.location.href = 'pages/dashboard.html';
}

// ═══ Logout ═══
async function logout() {
  try {
    localStorage.removeItem('currentUser');
    try { sessionStorage.clear(); } catch (e) {}
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
  }
  window.location.href = 'index.html';
}

// ═══ Auto-redirect if already signed in ═══
onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    console.log('👤 Already signed in:', firebaseUser.email);

    // تحقق لو المستخدم عنده بيانات محفوظة
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.uid === firebaseUser.uid && parsed.selectedRole) {
          window.location.href = 'pages/dashboard.html';
          return;
        }
      } catch (e) {}
    }

    // افحص الحساب
    await checkUserInFirestore(firebaseUser);
  } else {
    console.log('👤 No user signed in');
    showScreen('loginScreen');
    if (googleSignInBtn) googleSignInBtn.disabled = false;
  }
});

// ═══ Event Listeners ═══
if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', signInWithGoogle);
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', logout);
}

// ═══ Export for other scripts ═══
export { currentUser, logout };
