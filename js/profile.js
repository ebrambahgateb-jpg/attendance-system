// ═══════════════════════════════════════════════════════
//   Profile Page (صفحة حسابي)
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC
} from './firebase-config.js';

// ═══ State ═══
let profileUser = null;
let profilePerson = null;
let profileSettings = {};
let isEditMode = false;
let isViewingOther = false;
 
// ═══════════════════════════════════════════════════════
//   Load Profile Page
// ═══════════════════════════════════════════════════════

async function loadProfilePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    profileUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!profileUser) {
      window.location.href = '../index.html';
      return;
    }

    // ⚡ اقرأ personId من URL (لو موجود)
    const urlParams = new URLSearchParams(window.location.search);
    const urlPersonId = urlParams.get('id');

    const isOwnerOrAdmin = ['Owner', 'Admin'].includes(profileUser.selectedRole);
    isViewingOther = urlPersonId && urlPersonId !== profileUser.personId;

    // اجلب الإعدادات
    const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
    profileSettings = settingsDoc.exists() ? settingsDoc.data() : {};

    // ⚡ لو بيشوف ملف حد تاني
    if (isViewingOther) {
      if (!isOwnerOrAdmin) {
        area.innerHTML = `<div class="placeholder-page">
          <h2>غير مصرح</h2>
          <p>ليس لديك صلاحية لعرض ملفات الآخرين</p>
          <button class="btn-primary" onclick="goToPeople()" style="margin-top:16px;">رجوع</button>
        </div>`;
        return;
      }

      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, urlPersonId));
      if (pDoc.exists()) {
        profilePerson = { id: pDoc.id, ...pDoc.data() };
      } else {
        area.innerHTML = `<div class="placeholder-page">
          <h2>شخص غير موجود</h2>
          <button class="btn-primary" onclick="goToPeople()" style="margin-top:16px;">رجوع للأشخاص</button>
        </div>`;
        return;
      }
    } else {
      // ⚡ وضع "حسابي"
      profilePerson = null;

      if (profileUser.personId) {
        const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, profileUser.personId));
        if (pDoc.exists()) {
          profilePerson = { id: pDoc.id, ...pDoc.data() };
        }
      }

      // لو مش مربوط، جرّب نربطه بالبريد
      if (!profilePerson && profileUser.email) {
        const q = query(
          collection(db, COLLECTIONS.PEOPLE),
          where('Email', '==', profileUser.email)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          profilePerson = { id: docSnap.id, ...docSnap.data() };

          profileUser.personId = profilePerson.id;
          localStorage.setItem('currentUser', JSON.stringify(profileUser));
        }
      }
    }

    renderProfilePage(area);

  } catch (err) {
    console.error('❌ Profile load error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadProfilePage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderProfilePage(area) {
  const container = document.createElement('div');
  container.className = 'profile-container';
  area.innerHTML = '';
  area.appendChild(container);

  if (!profilePerson) {
    container.innerHTML = `
      <div class="profile-empty">
        <div class="profile-empty-icon">👤</div>
        <h2>لا يوجد ملف شخصي</h2>
        <p>لم يتم ربط حسابك بأي شخص في النظام.</p>
        <p style="margin-top:8px;">تواصل مع المسؤول لربط حسابك.</p>
      </div>
    `;
    return;
  }

  calculateStats().then(stats => {
    container.innerHTML = `
      ${renderHeader()}
      ${renderStats(stats)}
      ${renderQR()}
      ${renderInfo()}
      ${renderAttendance(stats.recentAttendance)}
    `;

    setupProfileEvents();
  });
}

// ═══ Header ═══
function renderHeader() {
  const fullName = getFullName(profilePerson);
  const initial = (profilePerson.FirstName || '?').charAt(0);
  const status = String(profilePerson.Status || 'active').toLowerCase();
  const isActive = status === 'active';

  const photoHtml = profilePerson.PhotoURL
    ? `<img src="${profilePerson.PhotoURL}" alt="" class="profile-photo" />`
    : `<div class="profile-photo-placeholder">${initial}</div>`;

  const backBtn = isViewingOther
    ? `<button class="btn-secondary" onclick="goBackToPeople()" style="margin-bottom:16px;">← رجوع للأشخاص</button>`
    : '';

  return `
    ${backBtn}
    <div class="profile-header-card">
      <div class="profile-photo-wrapper">
        ${photoHtml}
      </div>
      <div class="profile-header-info">
        <h1>${escapeHtml(fullName)}</h1>
        <p class="profile-email">${escapeHtml(profilePerson.Email || profileUser.email || '')}</p>
        <span class="profile-status-badge ${isActive ? 'active' : 'inactive'}">
          ${isActive ? '✅ نشط' : '⛔ معطل'}
        </span>
      </div>
    </div>
  `;
}

// ═══ Stats ═══
function renderStats(stats) {
  return `
    <div class="profile-stats-grid">
      <div class="profile-stat-card">
        <div class="profile-stat-icon">✅</div>
        <div class="profile-stat-value">${stats.attended}</div>
        <div class="profile-stat-label">حضر</div>
      </div>
      <div class="profile-stat-card">
        <div class="profile-stat-icon">📅</div>
        <div class="profile-stat-value">${stats.totalMeetings}</div>
        <div class="profile-stat-label">إجمالي الاجتماعات</div>
      </div>
      <div class="profile-stat-card">
        <div class="profile-stat-icon">📈</div>
        <div class="profile-stat-value">${stats.attendanceRate}%</div>
        <div class="profile-stat-label">نسبة الحضور</div>
      </div>
    </div>
  `;
}

// ═══ QR ═══
function renderQR() {
  if (!profilePerson.QRCode) {
    return `
      <div class="profile-section">
        <h3 class="profile-section-title">
          <span>📱 QR</span>
        </h3>
        <div style="text-align:center;padding:20px;color:#64748b;">
          <p>لم يتم إنشاء QR بعد</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">
        <span>📱 QR</span>
        <button class="btn-secondary" onclick="downloadProfileQR()">💾 تحميل كصورة</button>
      </h3>
      <div class="profile-qr-wrapper">
        <div class="profile-qr-box">
          <div id="profileQRCanvas"></div>
        </div>
        <p style="font-size:13px;color:#64748b;text-align:center;">
          اعرض هذا الـQR للماسح لتسجيل حضورك
        </p>
      </div>
    </div>
  `;
}

// ═══ Info ═══
function renderInfo() {
  const editBtn = isViewingOther
    ? ''
    : `<button class="btn-primary" onclick="toggleEditMode()" id="editProfileBtn">✏️ تعديل بياناتي</button>`;

  const titleText = isViewingOther ? '📋 معلومات الشخص' : '📋 معلوماتي';

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">
        <span>${titleText}</span>
        ${editBtn}
      </h3>
      <div id="profileInfoView">
        ${renderInfoView()}
      </div>
      <div id="profileEditView" style="display:none;">
        ${renderEditForm()}
      </div>
    </div>
  `;
}

function renderInfoView() {
  const items = [
    { label: 'الاسم الأول', value: profilePerson.FirstName },
    { label: 'الاسم الثاني', value: profilePerson.SecondName },
    { label: 'الاسم الثالث', value: profilePerson.ThirdName },
    { label: 'الاسم الرابع', value: profilePerson.FourthName },
    { label: 'تاريخ الميلاد', value: formatDate(profilePerson.BirthDate) },
    { label: 'النوع', value: profilePerson.Gender === 'male' ? 'ذكر' : (profilePerson.Gender === 'female' ? 'أنثى' : '-') },
    { label: 'رقم الموبايل', value: profilePerson.Mobile, ltr: true },
    { label: 'رقم واتساب', value: profilePerson.WhatsApp, ltr: true },
    { label: 'البريد الإلكتروني', value: profilePerson.Email, ltr: true },
    { label: 'العنوان', value: profilePerson.Address },
    { label: 'Facebook', value: profilePerson.Facebook, ltr: true }
  ];

  return `
    <div class="profile-info-grid">
      ${items.map(item => `
        <div class="profile-info-item">
          <div class="profile-info-label">${item.label}</div>
          <div class="profile-info-value ${item.ltr ? 'ltr' : ''}">${escapeHtml(item.value || '-')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderEditForm() {
  return `
    <div class="profile-edit-form">
      <div class="profile-edit-grid-2">
        <div class="profile-edit-row">
          <label>الاسم الأول *</label>
          <input type="text" id="pf_FirstName" value="${escapeHtml(profilePerson.FirstName || '')}" />
        </div>
        <div class="profile-edit-row">
          <label>الاسم الثاني *</label>
          <input type="text" id="pf_SecondName" value="${escapeHtml(profilePerson.SecondName || '')}" />
        </div>
        <div class="profile-edit-row">
          <label>الاسم الثالث</label>
          <input type="text" id="pf_ThirdName" value="${escapeHtml(profilePerson.ThirdName || '')}" />
        </div>
        <div class="profile-edit-row">
          <label>الاسم الرابع</label>
          <input type="text" id="pf_FourthName" value="${escapeHtml(profilePerson.FourthName || '')}" />
        </div>
        <div class="profile-edit-row">
          <label>تاريخ الميلاد</label>
          <input type="date" id="pf_BirthDate" value="${profilePerson.BirthDate || ''}" />
        </div>
        <div class="profile-edit-row">
          <label>النوع</label>
          <select id="pf_Gender">
            <option value="">-- اختر --</option>
            <option value="male" ${profilePerson.Gender === 'male' ? 'selected' : ''}>ذكر</option>
            <option value="female" ${profilePerson.Gender === 'female' ? 'selected' : ''}>أنثى</option>
          </select>
        </div>
        <div class="profile-edit-row ltr">
          <label>رقم الموبايل *</label>
          <input type="tel" id="pf_Mobile" value="${escapeHtml(profilePerson.Mobile || '')}" />
        </div>
        <div class="profile-edit-row ltr">
          <label>رقم واتساب</label>
          <input type="tel" id="pf_WhatsApp" value="${escapeHtml(profilePerson.WhatsApp || '')}" />
        </div>
      </div>

      <div class="profile-edit-row ltr">
        <label>البريد الإلكتروني (مقفول)</label>
        <input type="email" value="${escapeHtml(profilePerson.Email || '')}" disabled />
      </div>

      <div class="profile-edit-row">
        <label>العنوان</label>
        <input type="text" id="pf_Address" value="${escapeHtml(profilePerson.Address || '')}" />
      </div>

      <div class="profile-edit-row ltr">
        <label>Facebook</label>
        <input type="text" id="pf_Facebook" value="${escapeHtml(profilePerson.Facebook || '')}" placeholder="facebook.com/username" />
      </div>

      <div class="profile-edit-row">
        <label>رابط الصورة</label>
        <input type="text" id="pf_PhotoURL" value="${escapeHtml(profilePerson.PhotoURL || '')}" placeholder="https://..." />
      </div>

      <div class="profile-actions">
        <button class="btn-secondary" onclick="cancelEdit()">إلغاء</button>
        <button class="btn-primary" onclick="saveProfile()">💾 حفظ التعديلات</button>
      </div>
    </div>
  `;
}

// ═══ Attendance ═══
function renderAttendance(recent) {
  if (!recent || recent.length === 0) {
    return `
      <div class="profile-section">
        <h3 class="profile-section-title">
          <span>📅 آخر حضور</span>
        </h3>
        <div style="text-align:center;padding:20px;color:#64748b;">
          <p>لم يسجّل حضور بعد</p>
        </div>
      </div>
    `;
  }

  const items = recent.map(a => {
    const scanDate = parseDate(a.ScanTime);
    const dateStr = scanDate ? formatDateTime(scanDate) : '';
    return `
      <div class="profile-attendance-item">
        <div class="profile-attendance-icon">✅</div>
        <div class="profile-attendance-info">
          <div class="profile-attendance-title">${escapeHtml(a.MeetingTitle || 'اجتماع')}</div>
          <div class="profile-attendance-date">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">
        <span>📅 آخر حضور</span>
      </h3>
      <div class="profile-attendance-list">
        ${items}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Calculate Stats
// ═══════════════════════════════════════════════════════

async function calculateStats() {
  let attended = 0;
  let totalMeetings = 0;
  let attendanceRate = 0;
  let recentAttendance = [];

  try {
    const meetingsSnap = await getDocs(collection(db, COLLECTIONS.MEETINGS));
    const meetings = meetingsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => String(m.Status || '').toLowerCase() === 'active');

    totalMeetings = meetings.length;

    if (profilePerson) {
      const attSnap = await getDocs(query(
        collection(db, COLLECTIONS.ATTENDANCE),
        where('PersonID', '==', profilePerson.id)
      ));

      const allAttendance = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      attended = allAttendance.length;

      recentAttendance = allAttendance
        .sort((a, b) => {
          const da = parseDate(a.ScanTime) || new Date(0);
          const db2 = parseDate(b.ScanTime) || new Date(0);
          return db2 - da;
        })
        .slice(0, 5);
    }

    attendanceRate = totalMeetings > 0
      ? Math.round((attended / totalMeetings) * 100)
      : 0;
  } catch (err) {
    console.error('Stats error:', err);
  }

  return { attended, totalMeetings, attendanceRate, recentAttendance };
}

// ═══════════════════════════════════════════════════════
//   Setup Events
// ═══════════════════════════════════════════════════════

function setupProfileEvents() {
  if (profilePerson && profilePerson.QRCode) {
    const qrContainer = document.getElementById('profileQRCanvas');
    if (qrContainer && typeof QRCode !== 'undefined') {
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: profilePerson.QRCode,
        width: 220,
        height: 220,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }
}

// ═══ Edit Mode ═══
window.toggleEditMode = function() {
  const view = document.getElementById('profileInfoView');
  const edit = document.getElementById('profileEditView');
  const btn = document.getElementById('editProfileBtn');

  if (view && edit) {
    view.style.display = 'none';
    edit.style.display = 'block';
  }
  if (btn) btn.style.display = 'none';
};

window.cancelEdit = function() {
  const view = document.getElementById('profileInfoView');
  const edit = document.getElementById('profileEditView');
  const btn = document.getElementById('editProfileBtn');

  if (view && edit) {
    view.style.display = 'block';
    edit.style.display = 'none';
  }
  if (btn) btn.style.display = 'inline-block';
};

window.saveProfile = async function() {
  const firstName = document.getElementById('pf_FirstName')?.value.trim();
  const secondName = document.getElementById('pf_SecondName')?.value.trim();
  const thirdName = document.getElementById('pf_ThirdName')?.value.trim() || '';
  const fourthName = document.getElementById('pf_FourthName')?.value.trim() || '';
  const birthDate = document.getElementById('pf_BirthDate')?.value || '';
  const gender = document.getElementById('pf_Gender')?.value || '';
  const mobile = document.getElementById('pf_Mobile')?.value.trim();
  const whatsapp = document.getElementById('pf_WhatsApp')?.value.trim() || '';
  const address = document.getElementById('pf_Address')?.value.trim() || '';
  const facebook = document.getElementById('pf_Facebook')?.value.trim() || '';
  const photoURL = document.getElementById('pf_PhotoURL')?.value.trim() || '';

  if (!firstName) { alert('الاسم الأول مطلوب'); return; }
  if (!secondName) { alert('الاسم الثاني مطلوب'); return; }
  if (!mobile) { alert('رقم الموبايل مطلوب'); return; }

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, profilePerson.id);
    await updateDoc(personRef, {
      FirstName: firstName,
      SecondName: secondName,
      ThirdName: thirdName,
      FourthName: fourthName,
      BirthDate: birthDate,
      Gender: gender,
      Mobile: mobile,
      WhatsApp: whatsapp,
      Address: address,
      Facebook: facebook,
      PhotoURL: photoURL,
      UpdatedAt: new Date().toISOString()
    });

    alert('✅ تم الحفظ بنجاح');

    const area = document.getElementById('contentArea');
    loadProfilePage(area);
  } catch (err) {
    console.error('Save profile error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══ Download QR ═══
window.downloadProfileQR = function() {
  const container = document.getElementById('profileQRCanvas');
  if (!container) return;

  const canvas = container.querySelector('canvas');
  const img = container.querySelector('img');

  let dataUrl = null;
  if (canvas) dataUrl = canvas.toDataURL('image/png');
  else if (img && img.src) dataUrl = img.src;

  if (!dataUrl) {
    alert('لا يمكن تحميل الصورة');
    return;
  }

  const fullName = getFullName(profilePerson).replace(/\s+/g, '_');
  const link = document.createElement('a');
  link.download = `QR_${fullName}.png`;
  link.href = dataUrl;
  link.click();
};

// ═══ Navigation ═══
window.goToPeople = function() {
  window.location.href = 'dashboard.html';
  setTimeout(() => {
    if (typeof window.navigateTo === 'function') window.navigateTo('people');
  }, 300);
};

window.goBackToPeople = function() {
  window.location.href = 'dashboard.html';
  setTimeout(() => {
    if (typeof window.navigateTo === 'function') window.navigateTo('people');
  }, 300);
};

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getFullName(p) {
  if (!p) return '';
  return [p.FirstName, p.SecondName, p.ThirdName, p.FourthName]
    .filter(Boolean).join(' ');
}

function parseDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

function formatDateTime(date) {
  if (!date) return '';
  try {
    const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} - ${h}:${m}`;
  } catch (e) {
    return '';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.loadProfilePage = loadProfilePage;
