// ═══════════════════════════════════════════════════════
//   Sign Up Module
//   ⚡ تسجيل حساب جديد → إرسال طلب للأدمن للمراجعة
// ═══════════════════════════════════════════════════════

import {
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  auth,
  db,
  googleProvider,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let signupVerifiedUser = null; // ⚡ المستخدم اللي أكد إيميله بـGoogle

// ═══ DOM Elements ═══
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabSignupBtn = document.getElementById('tabSignupBtn');
const loginPanel = document.getElementById('loginPanel');
const signupPanel = document.getElementById('signupPanel');

const signupStep1 = document.getElementById('signupStep1');
const signupStep2 = document.getElementById('signupStep2');
const signupStep3 = document.getElementById('signupStep3');

const googleSignUpBtn = document.getElementById('googleSignUpBtn');
const signupMessage1 = document.getElementById('signupMessage1');
const signupMessage2 = document.getElementById('signupMessage2');
const signupConfirmedEmail = document.getElementById('signupConfirmedEmail');

const signupBackBtn = document.getElementById('signupBackBtn');
const signupSubmitBtn = document.getElementById('signupSubmitBtn');

// ═══════════════════════════════════════════════════════
//   Tab Switching
// ═══════════════════════════════════════════════════════

if (tabLoginBtn) {
  tabLoginBtn.onclick = () => switchTab('login');
}

if (tabSignupBtn) {
  tabSignupBtn.onclick = () => switchTab('signup');
}

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.style.display = 'none');

  if (tab === 'login') {
    if (tabLoginBtn) tabLoginBtn.classList.add('active');
    if (loginPanel) {
      loginPanel.style.display = 'block';
      loginPanel.classList.add('active');
    }
  } else {
    if (tabSignupBtn) tabSignupBtn.classList.add('active');
    if (signupPanel) {
      signupPanel.style.display = 'block';
      signupPanel.classList.add('active');
    }
    // ⚡ Reset Sign Up Steps
    resetSignupSteps();
  }
}

function resetSignupSteps() {
  signupStep1.classList.add('active');
  signupStep2.classList.remove('active');
  signupStep3.classList.remove('active');

  showSignupMessage(signupMessage1, '', '');
  showSignupMessage(signupMessage2, '', '');
}

function showSignupMessage(el, msg, type) {
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'message ' + (type || '');
}

function showSignupStep(stepNum) {
  signupStep1.classList.remove('active');
  signupStep2.classList.remove('active');
  signupStep3.classList.remove('active');

  if (stepNum === 1) signupStep1.classList.add('active');
  else if (stepNum === 2) signupStep2.classList.add('active');
  else if (stepNum === 3) signupStep3.classList.add('active');
}

// ═══════════════════════════════════════════════════════
//   Step 1: Verify Email with Google
// ═══════════════════════════════════════════════════════

if (googleSignUpBtn) {
  googleSignUpBtn.onclick = async () => {
    googleSignUpBtn.disabled = true;
    showSignupMessage(signupMessage1, '⏳ جاري تأكيد البريد...', '');

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;

      if (!firebaseUser.email) {
        throw new Error('لم يتم استرجاع البريد الإلكتروني');
      }

      console.log('✅ Google verified:', firebaseUser.email);

      const email = String(firebaseUser.email).toLowerCase().trim();

      // ═══ 1. فحص إن الإيميل مش مسجل في people ═══
      const inPeople = await checkEmailExistsInPeople(email);
      if (inPeople) {
        showSignupMessage(
          signupMessage1,
          '⚠️ هذا البريد مسجل بالفعل في النظام. يمكنك تسجيل الدخول.',
          'error'
        );
        await signOut(auth);
        googleSignUpBtn.disabled = false;
        return;
      }

      // ═══ 2. فحص إن الإيميل مش مسجل في accounts ═══
      const inAccounts = await checkEmailExistsInAccounts(email);
      if (inAccounts) {
        showSignupMessage(
          signupMessage1,
          '⚠️ هذا البريد مسجل بالفعل في النظام. يمكنك تسجيل الدخول.',
          'error'
        );
        await signOut(auth);
        googleSignUpBtn.disabled = false;
        return;
      }

      // ═══ 3. فحص إن مفيش طلب قائم ═══
      const pendingRequest = await checkPendingRequest(email);
      if (pendingRequest) {
        showSignupMessage(
          signupMessage1,
          '⏳ عندك طلب تسجيل قيد المراجعة بالفعل. تواصل مع المسؤول.',
          'error'
        );
        await signOut(auth);
        googleSignUpBtn.disabled = false;
        return;
      }

      // ═══ ✅ الإيميل مؤكد + مش مسجل ═══
      signupVerifiedUser = {
        uid: firebaseUser.uid,
        email: email,
        name: firebaseUser.displayName || '',
        photoURL: firebaseUser.photoURL || ''
      };

      if (signupConfirmedEmail) {
        signupConfirmedEmail.textContent = `📧 ${email}`;
      }

      // ⚡ سجّل خروج مؤقت (لأنه مش عايز يدخل، عايز يسجل)
      await signOut(auth);

      showSignupStep(2);
      showSignupMessage(signupMessage1, '✅ تم تأكيد البريد', 'success');

      // ⚡ Focus على أول حقل
      setTimeout(() => {
        document.getElementById('su_FirstName')?.focus();
      }, 200);

    } catch (error) {
      console.error('❌ Google verify error:', error);

      let msg = 'حدث خطأ في تأكيد البريد';
      if (error.code === 'auth/popup-closed-by-user') {
        msg = 'تم إغلاق نافذة Google';
      } else if (error.code === 'auth/popup-blocked') {
        msg = 'الرجاء السماح بالنوافذ المنبثقة';
      } else if (error.message) {
        msg = error.message;
      }

      showSignupMessage(signupMessage1, msg, 'error');
      googleSignUpBtn.disabled = false;
    }
  };
}

// ═══════════════════════════════════════════════════════
//   ⚡ Check Helpers
// ═══════════════════════════════════════════════════════

async function checkEmailExistsInPeople(email) {
  try {
    const q = query(
      collection(db, COLLECTIONS.PEOPLE),
      where('Email', '==', email)
    );
    const snap = await getDocs(q);

    if (!snap.empty) return true;

    // ⚡ محاولة بالإيميل الأصلي (case)
    const q2 = query(
      collection(db, COLLECTIONS.PEOPLE),
      where('Email', '==', email.toLowerCase())
    );
    const snap2 = await getDocs(q2);

    return !snap2.empty;
  } catch (e) {
    console.warn('checkPeople error:', e.message);
    return false;
  }
}

async function checkEmailExistsInAccounts(email) {
  try {
    const q = query(
      collection(db, COLLECTIONS.ACCOUNTS),
      where('Email', '==', email)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (e) {
    console.warn('checkAccounts error:', e.message);
    return false;
  }
}

async function checkPendingRequest(email) {
  try {
    const q = query(
      collection(db, 'signupRequests'),
      where('Email', '==', email),
      where('Status', '==', 'pending')
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (e) {
    console.warn('checkPendingRequest error:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Step 2: Back Button
// ═══════════════════════════════════════════════════════

if (signupBackBtn) {
  signupBackBtn.onclick = () => {
    signupVerifiedUser = null;
    googleSignUpBtn.disabled = false;
    showSignupStep(1);
    showSignupMessage(signupMessage1, '', '');
  };
}

// ═══════════════════════════════════════════════════════
//   Step 2: Submit Request
// ═══════════════════════════════════════════════════════

if (signupSubmitBtn) {
  signupSubmitBtn.onclick = async () => {
    if (!signupVerifiedUser) {
      alert('⚠️ لازم تأكد البريد بـ Google أولاً');
      showSignupStep(1);
      return;
    }

    // ═══ Collect Data ═══
    const firstName = document.getElementById('su_FirstName')?.value.trim();
    const secondName = document.getElementById('su_SecondName')?.value.trim();
    const thirdName = document.getElementById('su_ThirdName')?.value.trim() || '';
    const fourthName = document.getElementById('su_FourthName')?.value.trim() || '';
    const birthDate = document.getElementById('su_BirthDate')?.value || '';
    const gender = document.getElementById('su_Gender')?.value || '';
    const address = document.getElementById('su_Address')?.value.trim() || '';
    const mobile = document.getElementById('su_Mobile')?.value.trim();
    const whatsapp = document.getElementById('su_WhatsApp')?.value.trim() || '';
    const facebook = document.getElementById('su_Facebook')?.value.trim() || '';

    // ═══ Validation ═══
    if (!firstName) { alert('⚠️ الاسم الأول مطلوب'); return; }
    if (!secondName) { alert('⚠️ الاسم الثاني مطلوب'); return; }
    if (!birthDate) { alert('⚠️ تاريخ الميلاد مطلوب'); return; }
    if (!gender) { alert('⚠️ النوع مطلوب'); return; }
    if (!mobile) { alert('⚠️ رقم الموبايل مطلوب'); return; }

    // ═══ Check Mobile Duplicate ═══
    const mobileExists = await checkMobileExists(mobile);
    if (mobileExists) {
      alert('⚠️ رقم الموبايل مسجل بالفعل في النظام');
      return;
    }

    signupSubmitBtn.disabled = true;
    signupSubmitBtn.innerHTML = '⏳ جاري إرسال الطلب...';
    showSignupMessage(signupMessage2, '', '');

    try {
      // ═══ Create Signup Request ═══
      const requestData = {
        FirstName: firstName,
        SecondName: secondName,
        ThirdName: thirdName,
        FourthName: fourthName,
        BirthDate: birthDate,
        Gender: gender,
        Address: address,
        Mobile: mobile,
        WhatsApp: whatsapp,
        Email: signupVerifiedUser.email,
        Facebook: facebook,
        PhotoURL: signupVerifiedUser.photoURL || '',
        GoogleUID: signupVerifiedUser.uid,
        GoogleName: signupVerifiedUser.name,

        Status: 'pending',       // pending | approved | rejected
        CreatedAt: new Date().toISOString(),
        ReviewedAt: null,
        ReviewedBy: null,
        RejectReason: ''
      };

      const docRef = await addDoc(collection(db, 'signupRequests'), requestData);

      console.log('✅ Signup request created:', docRef.id);

      // ═══ Send Notification to Admins ═══
      await sendAdminSignupNotification(requestData, docRef.id);

      showSignupStep(3);

    } catch (err) {
      console.error('❌ Signup submit error:', err);
      showSignupMessage(
        signupMessage2,
        'خطأ في إرسال الطلب: ' + err.message,
        'error'
      );
      signupSubmitBtn.disabled = false;
      signupSubmitBtn.innerHTML = '📩 إرسال الطلب';
    }
  };
}

async function checkMobileExists(mobile) {
  try {
    const q = query(
      collection(db, COLLECTIONS.PEOPLE),
      where('Mobile', '==', mobile)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Send Notification to Admins
// ═══════════════════════════════════════════════════════

async function sendAdminSignupNotification(requestData, requestId) {
  const fullName = [
    requestData.FirstName,
    requestData.SecondName,
    requestData.ThirdName,
    requestData.FourthName
  ].filter(Boolean).join(' ');

  try {
    await addDoc(collection(db, 'notifications'), {
      Type: 'signup_request',
      Title: `🆕 طلب تسجيل جديد`,
      Body: `${fullName} طلب التسجيل في النظام\n📧 ${requestData.Email}\n📱 ${requestData.Mobile}`,
      RelatedRequestID: requestId,
      RelatedPersonID: null,
      TargetType: 'admins',
      SentBy: 'system',
      SentAt: new Date().toISOString(),
      ReadBy: [],
      CreatedAt: new Date().toISOString()
    });

    console.log('✅ Admin notification sent');
  } catch (e) {
    console.warn('⚠️ sendAdminSignupNotification error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.switchAuthTab = switchTab;
window.getSignupVerifiedUser = () => signupVerifiedUser;
