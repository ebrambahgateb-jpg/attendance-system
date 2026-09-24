// ═══════════════════════════════════════════════════════
//   People Management (Firestore) + Auto Accounts
//   ⚡ محدّث: Upload Widget + PhotoHash + Ignore List + Filters
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let peopleData = [];
let filteredPeople = [];
let currentEditId = null;
let currentPhotoURL = '';
let currentPhotoHash = '';

// ═══ Filters State ═══
let peopleFilters = {
  search: '',
  status: 'all',      // all | active | inactive
  gender: 'all',      // all | male | female
  ageFrom: '',
  ageTo: ''
};

// ═══ Constants ═══
const DEFAULT_ROLE = 'User';
const SYNC_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyLCcBwNOBx-74HLJIVOu0r8TjpD1z9SkeKL_5LJWFLe9-Lw2Z-ee8NMZy27x2RFiju/exec';

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getFullName(person) {
  if (!person) return '';
  return [
    person.FirstName,
    person.SecondName,
    person.ThirdName,
    person.FourthName
  ].filter(Boolean).join(' ');
}

function getInitial(person) {
  return (person?.FirstName || '?').charAt(0);
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

function parseDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = parseDate(dateStr);
    if (!d) return dateStr;
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

// ═══ ⚡ Age Calculator ═══
function getAge(birthDate) {
  if (!birthDate) return null;

  try {
    const birth = new Date(birthDate + 'T00:00:00');
    if (isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();

    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age >= 0 ? age : null;
  } catch (e) {
    return null;
  }
}

// ═══ Facebook URL Helpers ═══
function formatFacebookUrl(value) {
  if (!value) return '';
  let url = String(value).trim();

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('facebook.com') ||
      url.startsWith('www.facebook.com') ||
      url.startsWith('m.facebook.com') ||
      url.startsWith('fb.com') ||
      url.startsWith('fb.me')) {
    return 'https://' + url;
  }

  url = url.replace(/^@/, '');
  return 'https://facebook.com/' + url;
}

function getFacebookDisplay(value) {
  if (!value) return '-';
  let url = String(value).trim();

  url = url.replace(/^https?:\/\//, '');
  url = url.replace(/^www\./, '');
  url = url.replace(/^m\./, '');

  return url;
}

// ═══════════════════════════════════════════════════════
//   ⚡ Sync Ignore List Helper
// ═══════════════════════════════════════════════════════

async function addEmailToIgnoreList(email, reason = '') {
  if (!email) return { ok: false, message: 'Email required' };

  const emailLower = String(email).toLowerCase().trim();

  try {
    const response = await fetch(SYNC_WEBAPP_URL, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'addToIgnoreList',
        email: emailLower,
        reason: reason
      })
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const text = await response.text();
    const data = JSON.parse(text);

    console.log(`✅ Added to ignore list: ${emailLower}`, data);
    return data;
  } catch (err) {
    console.warn('⚠️ addEmailToIgnoreList error:', err.message);
    return { ok: false, message: err.message };
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Auto Account Creation
// ═══════════════════════════════════════════════════════

async function ensureAccountForPerson(personId, personData) {
  const email = String(personData.Email || '').toLowerCase().trim();

  if (!email) {
    return { action: 'skipped', reason: 'no_email' };
  }

  try {
    const q = query(
      collection(db, COLLECTIONS.ACCOUNTS),
      where('Email', '==', email)
    );
    const snap = await getDocs(q);

    const accountStatus = String(personData.Status || 'active').toLowerCase() === 'active'
      ? 'active'
      : 'disabled';

    if (!snap.empty) {
      const existingDoc = snap.docs[0];
      const existingData = existingDoc.data();

      const updateData = {
        PersonID: personId,
        Status: accountStatus,
        UpdatedAt: new Date().toISOString()
      };

      if (!existingData.Role) {
        updateData.Role = DEFAULT_ROLE;
      }

      await updateDoc(doc(db, COLLECTIONS.ACCOUNTS, existingDoc.id), updateData);

      return {
        action: 'updated',
        accountId: existingDoc.id,
        message: `تم ربط الحساب الموجود (${email}) بالشخص`
      };
    } else {
      const newAccount = {
        Email: email,
        Role: DEFAULT_ROLE,
        PersonID: personId,
        Status: accountStatus,
        CreatedAt: new Date().toISOString(),
        Source: 'auto_from_person'
      };

      const docRef = await addDoc(collection(db, COLLECTIONS.ACCOUNTS), newAccount);

      return {
        action: 'created',
        accountId: docRef.id,
        message: `تم إنشاء حساب جديد (${email}) كـ User`
      };
    }
  } catch (err) {
    console.error('❌ ensureAccountForPerson error:', err);
    return {
      action: 'error',
      message: err.message
    };
  }
}

// ═══════════════════════════════════════════════════════
//   Load People Page
// ═══════════════════════════════════════════════════════

async function loadPeoplePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const snap = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    peopleData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    peopleData.sort((a, b) =>
      getFullName(a).localeCompare(getFullName(b), 'ar')
    );

    filteredPeople = [...peopleData];
    renderPeoplePage(area);
  } catch (err) {
    console.error('❌ Load people error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadPeoplePage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderPeoplePage(area) {
  area.innerHTML = `
    <div class="people-container">

      <div class="people-header">
        <div class="people-search">
          <input type="text" id="peopleSearchInput" placeholder="🔍 ابحث بالاسم، الموبايل، أو البريد..." value="${escapeHtml(peopleFilters.search)}" />
        </div>
        <button class="btn-primary" onclick="openPersonModal()">
          ➕ إضافة شخص
        </button>
      </div>

      <!-- ═══ فلاتر ═══ -->
      <div class="people-filters">
        <div class="people-filter-group">
          <label>الحالة</label>
          <select id="peopleFilterStatus">
            <option value="all" ${peopleFilters.status === 'all' ? 'selected' : ''}>الكل</option>
            <option value="active" ${peopleFilters.status === 'active' ? 'selected' : ''}>✅ نشط</option>
            <option value="inactive" ${peopleFilters.status === 'inactive' ? 'selected' : ''}>⛔ معطل</option>
          </select>
        </div>

        <div class="people-filter-group">
          <label>النوع</label>
          <select id="peopleFilterGender">
            <option value="all" ${peopleFilters.gender === 'all' ? 'selected' : ''}>الكل</option>
            <option value="male" ${peopleFilters.gender === 'male' ? 'selected' : ''}>ذكر</option>
            <option value="female" ${peopleFilters.gender === 'female' ? 'selected' : ''}>أنثى</option>
          </select>
        </div>

        <div class="people-filter-group">
          <label>العمر من</label>
          <input type="number" id="peopleFilterAgeFrom" placeholder="من" min="0" max="150" value="${escapeHtml(peopleFilters.ageFrom)}" />
        </div>

        <div class="people-filter-group">
          <label>العمر إلى</label>
          <input type="number" id="peopleFilterAgeTo" placeholder="إلى" min="0" max="150" value="${escapeHtml(peopleFilters.ageTo)}" />
        </div>

        <button class="btn-secondary" onclick="clearPeopleFilters()">مسح الفلاتر</button>
      </div>

      <!-- ═══ نتائج الفلترة ═══ -->
      <div class="people-results-info" id="peopleResultsInfo" style="display:none;">
        <span id="peopleResultsCount"></span>
      </div>

      <div class="people-stats">
        <div class="people-stat">
          <span class="people-stat-value">${peopleData.length}</span>
          <span class="people-stat-label">إجمالي</span>
        </div>
        <div class="people-stat">
          <span class="people-stat-value">${peopleData.filter(p => String(p.Status || 'active').toLowerCase() === 'active').length}</span>
          <span class="people-stat-label">نشط</span>
        </div>
        <div class="people-stat">
          <span class="people-stat-value">${peopleData.filter(p => String(p.Status || '').toLowerCase() === 'inactive').length}</span>
          <span class="people-stat-label">معطل</span>
        </div>
      </div>

      <div class="people-table-wrapper">
        <table class="people-table">
          <thead>
            <tr>
              <th>الصورة</th>
              <th>الاسم</th>
              <th>الموبايل</th>
              <th>واتساب</th>
              <th>البريد</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th>QR</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody id="peopleTableBody"></tbody>
        </table>
      </div>

      <div id="peopleEmptyState" class="people-empty" style="display:none;">
        <div class="people-empty-icon">👥</div>
        <h3>لا يوجد أشخاص</h3>
        <p>ابدأ بإضافة شخص جديد</p>
        <button class="btn-primary" onclick="openPersonModal()">➕ إضافة شخص</button>
      </div>

    </div>
  `;

  renderPeopleTable();
  setupPeopleEvents();
  applyPeopleFilters();
}

// ═══════════════════════════════════════════════════════
//   Render Table
// ═══════════════════════════════════════════════════════

function renderPeopleTable() {
  const tbody = document.getElementById('peopleTableBody');
  const emptyState = document.getElementById('peopleEmptyState');
  const tableWrapper = document.querySelector('.people-table-wrapper');

  if (!tbody) return;

  if (filteredPeople.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (tableWrapper) tableWrapper.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  tbody.innerHTML = filteredPeople.map(person => {
    const status = String(person.Status || 'active').toLowerCase();
    const isActive = status === 'active';
    const gender = person.Gender === 'female' ? 'أنثى' : (person.Gender === 'male' ? 'ذكر' : '-');

    return `
      <tr>
        <td>
          ${person.PhotoURL
            ? `<img src="${person.PhotoURL}" alt="" class="person-avatar" />`
            : `<div class="person-avatar-placeholder">${escapeHtml(getInitial(person))}</div>`
          }
        </td>
        <td>
          <a href="#" onclick="viewPersonDetails('${person.id}'); return false;" class="person-name-link" title="عرض التفاصيل">
            <strong>${escapeHtml(getFullName(person) || '-')}</strong>
          </a>
        </td>
        <td class="ltr-cell">${escapeHtml(person.Mobile || '-')}</td>
        <td class="ltr-cell">${escapeHtml(person.WhatsApp || '-')}</td>
        <td class="ltr-cell">${escapeHtml(person.Email || '-')}</td>
        <td>${gender}</td>
        <td>
          <span class="status-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? '✅ نشط' : '⛔ معطل'}
          </span>
        </td>
        <td>
          ${person.QRCode
            ? `<button class="btn-icon" onclick="viewQR('${person.id}')" title="عرض QR">📱</button>`
            : `<button class="btn-icon" onclick="generateQR('${person.id}')" title="إنشاء QR">✨</button>`
          }
        </td>
        <td class="actions-cell">
          <button class="btn-icon" onclick="editPerson('${person.id}')" title="تعديل">✏️</button>
          <button class="btn-icon" onclick="togglePersonStatus('${person.id}')" title="${isActive ? 'تعطيل' : 'تفعيل'}">
            ${isActive ? '⏸️' : '▶️'}
          </button>
          <button class="btn-icon danger" onclick="confirmDeletePerson('${person.id}')" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//   ⚡ Filters
// ═══════════════════════════════════════════════════════

function setupPeopleEvents() {
  // ═══ Search ═══
  const searchInput = document.getElementById('peopleSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      peopleFilters.search = e.target.value.toLowerCase().trim();
      applyPeopleFilters();
    });
  }

  // ═══ Status ═══
  const statusFilter = document.getElementById('peopleFilterStatus');
  if (statusFilter) {
    statusFilter.onchange = (e) => {
      peopleFilters.status = e.target.value;
      applyPeopleFilters();
    };
  }

  // ═══ Gender ═══
  const genderFilter = document.getElementById('peopleFilterGender');
  if (genderFilter) {
    genderFilter.onchange = (e) => {
      peopleFilters.gender = e.target.value;
      applyPeopleFilters();
    };
  }

  // ═══ Age From ═══
  const ageFromFilter = document.getElementById('peopleFilterAgeFrom');
  if (ageFromFilter) {
    ageFromFilter.addEventListener('input', (e) => {
      peopleFilters.ageFrom = e.target.value.trim();
      applyPeopleFilters();
    });
  }

  // ═══ Age To ═══
  const ageToFilter = document.getElementById('peopleFilterAgeTo');
  if (ageToFilter) {
    ageToFilter.addEventListener('input', (e) => {
      peopleFilters.ageTo = e.target.value.trim();
      applyPeopleFilters();
    });
  }
}

function applyPeopleFilters() {
  const term = peopleFilters.search;
  const statusFilter = peopleFilters.status;
  const genderFilter = peopleFilters.gender;
  const ageFrom = peopleFilters.ageFrom ? Number(peopleFilters.ageFrom) : null;
  const ageTo = peopleFilters.ageTo ? Number(peopleFilters.ageTo) : null;

  filteredPeople = peopleData.filter(p => {
    // ═══ Search ═══
    if (term) {
      const fullName = getFullName(p).toLowerCase();
      const matchesSearch =
        fullName.includes(term) ||
        String(p.Mobile || '').includes(term) ||
        String(p.WhatsApp || '').includes(term) ||
        String(p.Email || '').toLowerCase().includes(term);

      if (!matchesSearch) return false;
    }

    // ═══ Status ═══
    if (statusFilter !== 'all') {
      const personStatus = String(p.Status || 'active').toLowerCase();
      if (personStatus !== statusFilter) return false;
    }

    // ═══ Gender ═══
    if (genderFilter !== 'all') {
      if (String(p.Gender || '').toLowerCase() !== genderFilter) return false;
    }

    // ═══ Age ═══
    if (ageFrom !== null || ageTo !== null) {
      const age = getAge(p.BirthDate);

      // ⚡ اللي ملهوش تاريخ ميلاد → يظهر بس في "الكل"
      if (age === null) return false;

      if (ageFrom !== null && age < ageFrom) return false;
      if (ageTo !== null && age > ageTo) return false;
    }

    return true;
  });

  renderPeopleTable();
  updateResultsInfo();
}

function updateResultsInfo() {
  const infoEl = document.getElementById('peopleResultsInfo');
  const countEl = document.getElementById('peopleResultsCount');

  if (!infoEl || !countEl) return;

  const hasFilter =
    peopleFilters.search ||
    peopleFilters.status !== 'all' ||
    peopleFilters.gender !== 'all' ||
    peopleFilters.ageFrom ||
    peopleFilters.ageTo;

  if (hasFilter && filteredPeople.length !== peopleData.length) {
    countEl.innerHTML = `🔍 <strong>${filteredPeople.length}</strong> من <strong>${peopleData.length}</strong> (نتيجة الفلترة)`;
    infoEl.style.display = 'block';
  } else {
    infoEl.style.display = 'none';
  }
}

window.clearPeopleFilters = function() {
  peopleFilters = {
    search: '',
    status: 'all',
    gender: 'all',
    ageFrom: '',
    ageTo: ''
  };

  filteredPeople = [...peopleData];
  renderPeoplePage(document.getElementById('contentArea'));
};

// ═══════════════════════════════════════════════════════
//   Person Modal (Add/Edit)
// ═══════════════════════════════════════════════════════

function openPersonModal(personId) {
  currentEditId = personId || null;
  const person = personId ? peopleData.find(p => p.id === personId) : null;
  const isEdit = !!person;

  currentPhotoURL = person?.PhotoURL || '';
  currentPhotoHash = person?.PhotoHash || '';

  let modal = document.getElementById('personModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'personModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const p = person || {};

  modal.innerHTML = `
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ تعديل بيانات شخص' : '➕ إضافة شخص جديد'}</h2>
        <button class="modal-close" onclick="closePersonModal()">✕</button>
      </div>

      <div class="modal-body">

        <div class="modal-section">
          <h4 class="modal-section-title">الاسم</h4>
          <div class="form-grid-2">
            <div class="form-row">
              <label>الاسم الأول *</label>
              <input type="text" id="p_FirstName" value="${escapeHtml(p.FirstName || '')}" placeholder="محمد" />
            </div>
            <div class="form-row">
              <label>الاسم الثاني *</label>
              <input type="text" id="p_SecondName" value="${escapeHtml(p.SecondName || '')}" placeholder="أحمد" />
            </div>
            <div class="form-row">
              <label>الاسم الثالث</label>
              <input type="text" id="p_ThirdName" value="${escapeHtml(p.ThirdName || '')}" placeholder="إبراهيم" />
            </div>
            <div class="form-row">
              <label>الاسم الرابع</label>
              <input type="text" id="p_FourthName" value="${escapeHtml(p.FourthName || '')}" placeholder="عبد الله" />
            </div>
          </div>
        </div>

        <div class="modal-section">
          <h4 class="modal-section-title">معلومات شخصية</h4>
          <div class="form-grid-2">
            <div class="form-row">
              <label>تاريخ الميلاد</label>
              <input type="date" id="p_BirthDate" value="${p.BirthDate || ''}" />
            </div>
            <div class="form-row">
              <label>النوع</label>
              <select id="p_Gender">
                <option value="">-- اختر --</option>
                <option value="male" ${p.Gender === 'male' ? 'selected' : ''}>ذكر</option>
                <option value="female" ${p.Gender === 'female' ? 'selected' : ''}>أنثى</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <label>العنوان</label>
            <input type="text" id="p_Address" value="${escapeHtml(p.Address || '')}" placeholder="أسيوط - شارع الجمهورية" />
          </div>
        </div>

        <div class="modal-section">
          <h4 class="modal-section-title">معلومات التواصل</h4>
          <div class="form-grid-2">
            <div class="form-row">
              <label>رقم الموبايل *</label>
              <input type="tel" id="p_Mobile" value="${escapeHtml(p.Mobile || '')}" placeholder="01xxxxxxxxx" dir="ltr" />
            </div>
            <div class="form-row">
              <label>رقم واتساب</label>
              <input type="tel" id="p_WhatsApp" value="${escapeHtml(p.WhatsApp || '')}" placeholder="01xxxxxxxxx" dir="ltr" />
            </div>
          </div>
          <div class="form-row">
            <label>البريد الإلكتروني</label>
            <input type="email" id="p_Email" value="${escapeHtml(p.Email || '')}" placeholder="name@example.com" dir="ltr" />
            <p class="hint">البريد مهم — سيتم إنشاء حساب User تلقائيًا به</p>
          </div>
          <div class="form-row">
            <label>Facebook</label>
            <input type="text" id="p_Facebook" value="${escapeHtml(p.Facebook || '')}" placeholder="username أو facebook.com/username" dir="ltr" />
          </div>
        </div>

        <div class="modal-section">
          <h4 class="modal-section-title">الصورة</h4>
          <div id="photoUploadContainer"></div>
        </div>

        <div class="modal-section">
          <h4 class="modal-section-title">الحالة</h4>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="p_Active" ${!person || String(p.Status || 'active').toLowerCase() === 'active' ? 'checked' : ''} />
            <label for="p_Active">حساب نشط</label>
          </div>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closePersonModal()">إلغاء</button>
        <button class="btn-primary" onclick="savePerson()">💾 حفظ</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  setTimeout(() => {
    if (typeof window.renderUploadWidget === 'function') {
      window.renderUploadWidget(
        'photoUploadContainer',
        currentPhotoURL,
        (result) => {
          currentPhotoURL = result.url;
          currentPhotoHash = result.hash || '';
          console.log('✅ Photo uploaded:', result.url, result.isDuplicate ? '(duplicate)' : '');
        },
        () => {
          currentPhotoURL = '';
          console.log('🗑️ Photo removed (hash kept for matching)');
        },
        {
          currentHash: currentPhotoHash || '',
          currentURL: currentPhotoURL || ''
        }
      );
    } else {
      console.warn('⚠️ renderUploadWidget not available');
    }
  }, 50);

  setTimeout(() => {
    const el = document.getElementById('p_FirstName');
    if (el) el.focus();
  }, 100);
}

function closePersonModal() {
  const modal = document.getElementById('personModal');
  if (modal) modal.style.display = 'none';
  currentEditId = null;
  currentPhotoURL = '';
  currentPhotoHash = '';
}

// ═══════════════════════════════════════════════════════
//   ⚡ Save Person (with auto Account)
// ═══════════════════════════════════════════════════════

async function savePerson() {
  const firstName = document.getElementById('p_FirstName')?.value.trim();
  const secondName = document.getElementById('p_SecondName')?.value.trim();
  const thirdName = document.getElementById('p_ThirdName')?.value.trim() || '';
  const fourthName = document.getElementById('p_FourthName')?.value.trim() || '';
  const birthDate = document.getElementById('p_BirthDate')?.value || '';
  const gender = document.getElementById('p_Gender')?.value || '';
  const address = document.getElementById('p_Address')?.value.trim() || '';
  const mobile = document.getElementById('p_Mobile')?.value.trim();
  const whatsapp = document.getElementById('p_WhatsApp')?.value.trim() || '';
  const email = document.getElementById('p_Email')?.value.trim() || '';
  const facebook = document.getElementById('p_Facebook')?.value.trim() || '';
  const isActive = document.getElementById('p_Active')?.checked;

  if (!firstName) { alert('الاسم الأول مطلوب'); return; }
  if (!secondName) { alert('الاسم الثاني مطلوب'); return; }
  if (!mobile) { alert('رقم الموبايل مطلوب'); return; }

  const status = isActive ? 'active' : 'inactive';

  const photoURL = currentPhotoURL || '';
  const photoHash = currentPhotoHash || '';

  const personData = {
    FirstName: firstName,
    SecondName: secondName,
    ThirdName: thirdName,
    FourthName: fourthName,
    BirthDate: birthDate,
    Gender: gender,
    Address: address,
    Mobile: mobile,
    WhatsApp: whatsapp,
    Email: email,
    Facebook: facebook,
    PhotoURL: photoURL,
    PhotoHash: photoHash,
    Status: status,
    UpdatedAt: new Date().toISOString()
  };

  try {
    let personId = currentEditId;
    let isNew = false;

    if (currentEditId) {
      const personRef = doc(db, COLLECTIONS.PEOPLE, currentEditId);
      await updateDoc(personRef, personData);
    } else {
      personData.QRCode = '';
      personData.CreatedAt = new Date().toISOString();
      const docRef = await addDoc(collection(db, COLLECTIONS.PEOPLE), personData);
      personId = docRef.id;
      isNew = true;
    }

    let accountMessage = '';

    if (email) {
      const result = await ensureAccountForPerson(personId, personData);

      if (result.action === 'created') {
        accountMessage = '\n\n👤 تم إنشاء حساب User جديد تلقائيًا.';
      } else if (result.action === 'updated') {
        accountMessage = '\n\n🔗 تم ربط الحساب الموجود بالشخص.';
      } else if (result.action === 'skipped') {
        accountMessage = '\n\n⚠️ لم يتم إنشاء حساب (لا يوجد بريد).';
      } else if (result.action === 'error') {
        accountMessage = '\n\n⚠️ لم يتم إنشاء الحساب: ' + result.message;
      }
    } else {
      accountMessage = '\n\n⚠️ لا يوجد بريد — لم يتم إنشاء حساب.';
    }

    // ⚡ لو كان الشخص موجود في Ignore List، شيله
    if (email && !isNew) {
      try {
        await fetch(SYNC_WEBAPP_URL, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'removeFromIgnoreList',
            email: email.toLowerCase().trim()
          })
        });
        console.log('✅ Removed from ignore list (if existed):', email);
      } catch (e) {
        console.warn('⚠️ removeFromIgnoreList error:', e.message);
      }
    }

    alert(
      (isNew ? '✅ تمت الإضافة بنجاح' : '✅ تم التعديل بنجاح') +
      accountMessage
    );

    closePersonModal();
    const area = document.getElementById('contentArea');
    await loadPeoplePage(area);
  } catch (err) {
    console.error('❌ Save person error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Edit / Toggle / Delete
// ═══════════════════════════════════════════════════════

function editPerson(personId) {
  openPersonModal(personId);
}

async function togglePersonStatus(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const currentStatus = String(person.Status || 'active').toLowerCase();
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const fullName = getFullName(person);

  const confirmMsg = newStatus === 'inactive'
    ? `هل تريد تعطيل "${fullName}"؟\n\nسيتم تعطيل حسابه أيضاً.`
    : `هل تريد تفعيل "${fullName}"؟\n\nسيتم تفعيل حسابه أيضاً.`;

  if (!confirm(confirmMsg)) return;

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, personId);
    await updateDoc(personRef, {
      Status: newStatus,
      UpdatedAt: new Date().toISOString()
    });
    person.Status = newStatus;

    if (person.Email) {
      const email = String(person.Email).toLowerCase().trim();
      const q = query(
        collection(db, COLLECTIONS.ACCOUNTS),
        where('Email', '==', email)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const accountStatus = newStatus === 'active' ? 'active' : 'disabled';
        await updateDoc(doc(db, COLLECTIONS.ACCOUNTS, snap.docs[0].id), {
          Status: accountStatus,
          UpdatedAt: new Date().toISOString()
        });
      }
    }

    renderPeopleTable();
  } catch (err) {
    console.error('❌ Toggle status error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function confirmDeletePerson(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const fullName = getFullName(person);
  if (!confirm(`⚠️ هل أنت متأكد من حذف "${fullName}"؟\n\nهذا الإجراء لا يمكن التراجع عنه.`)) return;

  try {
    // ⚡ 1. أضف للـIgnore List قبل الحذف
    if (person.Email) {
      console.log(`📝 Adding to ignore list: ${person.Email}`);
      await addEmailToIgnoreList(person.Email, 'deleted_by_admin');
    }

    // ⚡ 2. احذف الشخص
    await deleteDoc(doc(db, COLLECTIONS.PEOPLE, personId));

    alert('✅ تم الحذف بنجاح\n\n📌 لن يعود الشخص من المزامنة التلقائية.\n📌 الحساب المرتبط لم يُحذف.');
    const area = document.getElementById('contentArea');
    await loadPeoplePage(area);
  } catch (err) {
    console.error('❌ Delete person error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   QR Code - Generate
// ═══════════════════════════════════════════════════════

async function generateQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const qrValue = 'PERSON_' + personId;

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, personId);
    await updateDoc(personRef, {
      QRCode: qrValue,
      UpdatedAt: new Date().toISOString()
    });
    person.QRCode = qrValue;
    alert('✅ تم إنشاء QR بنجاح');
    viewQR(personId);
  } catch (err) {
    console.error('❌ Generate QR error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   QR Code - View
// ═══════════════════════════════════════════════════════

function viewQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person || !person.QRCode) return;

  const fullName = getFullName(person);

  let modal = document.getElementById('qrModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qrModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content qr-modal-content">
      <div class="modal-header">
        <h2>📱 QR - ${escapeHtml(fullName)}</h2>
        <button class="modal-close" onclick="closeQRModal()">✕</button>
      </div>

      <div class="modal-body qr-body">
        <div id="qrCodeContainer" class="qr-container"></div>
        <p class="qr-person-name">${escapeHtml(fullName)}</p>
        <p class="qr-person-id">ID: ${person.id}</p>
      </div>

      <div class="modal-footer qr-modal-footer">
        <button class="btn-secondary" onclick="closeQRModal()">إغلاق</button>
        <button class="btn-secondary" onclick="downloadQR('${person.id}')">💾 تحميل كصورة</button>
        <button class="btn-danger" onclick="confirmRegenerateQR('${person.id}')">🔄 تجديد QR</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const container = document.getElementById('qrCodeContainer');
  if (container && typeof QRCode !== 'undefined') {
    container.innerHTML = '';
    new QRCode(container, {
      text: person.QRCode,
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } else if (container) {
    container.innerHTML = `<div class="qr-fallback"><p>QR Code:</p><code>${person.QRCode}</code></div>`;
  }
}

function closeQRModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
//   QR Code - Regenerate
// ═══════════════════════════════════════════════════════

async function confirmRegenerateQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const fullName = getFullName(person);

  if (!confirm(
    `⚠️ تحذير: تجديد QR لـ "${fullName}"\n\n` +
    `سيتم إلغاء الـ QR القديم نهائيًا، ولن يعمل.\n\n` +
    `يجب عليك طباعة/إرسال الـ QR الجديد للشخص.\n\n` +
    `هل أنت متأكد؟`
  )) {
    return;
  }

  try {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    const newQRCode = `PERSON_${personId}_${timestamp}${randomPart}`;

    const personRef = doc(db, COLLECTIONS.PEOPLE, personId);
    await updateDoc(personRef, {
      QRCode: newQRCode,
      QRRegeneratedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    });

    person.QRCode = newQRCode;
    person.QRRegeneratedAt = new Date().toISOString();

    alert('✅ تم تجديد QR بنجاح\n\nالـ QR القديم لم يعد صالحاً.');

    closeQRModal();
    setTimeout(() => viewQR(personId), 200);

  } catch (err) {
    console.error('❌ Regenerate QR error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   QR Code - Download
// ═══════════════════════════════════════════════════════

function downloadQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const container = document.getElementById('qrCodeContainer');
  if (!container) return;

  const canvas = container.querySelector('canvas');
  const img = container.querySelector('img');

  let dataUrl = null;
  if (canvas) dataUrl = canvas.toDataURL('image/png');
  else if (img && img.src) dataUrl = img.src;

  if (!dataUrl) { alert('لا يمكن تحميل الصورة'); return; }

  const fullName = getFullName(person).replace(/\s+/g, '_');
  const link = document.createElement('a');
  link.download = `QR_${fullName}.png`;
  link.href = dataUrl;
  link.click();
}

// ═══════════════════════════════════════════════════════
//   View Person Details
// ═══════════════════════════════════════════════════════

async function viewPersonDetails(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  let modal = document.getElementById('personDetailsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'personDetailsModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content modal-xlarge">
      <div class="modal-header">
        <h2>👤 ملف الشخص</h2>
        <button class="modal-close" onclick="closePersonDetails()">✕</button>
      </div>
      <div class="modal-body">
        <div class="loading-state">
          <div class="spinner"></div>
          <div>جاري التحميل...</div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'flex';

  try {
    const [meetingsSnap, attendanceSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.MEETINGS)),
      getDocs(collection(db, COLLECTIONS.ATTENDANCE))
    ]);

    const meetings = meetingsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => String(m.Status || '').toLowerCase() === 'active');

    const allAttendance = attendanceSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.PersonID === personId);

    const totalMeetings = meetings.length;
    const attended = allAttendance.length;
    const attendanceRate = totalMeetings > 0
      ? Math.round((attended / totalMeetings) * 100)
      : 0;

    const recentAttendance = allAttendance
      .sort((a, b) => {
        const da = parseDate(a.ScanTime) || new Date(0);
        const db2 = parseDate(b.ScanTime) || new Date(0);
        return db2 - da;
      })
      .slice(0, 5);

    renderPersonDetailsModal(modal, person, {
      totalMeetings,
      attended,
      attendanceRate,
      recentAttendance
    });
  } catch (err) {
    console.error('❌ Load person details error:', err);
    const body = modal.querySelector('.modal-body');
    if (body) {
      body.innerHTML = `<div class="placeholder-page"><h2>خطأ</h2><p>${err.message}</p></div>`;
    }
  }
}

function renderPersonDetailsModal(modal, person, stats) {
  const fullName = getFullName(person);
  const initial = getInitial(person);
  const status = String(person.Status || 'active').toLowerCase();
  const isActive = status === 'active';

  const photoHtml = person.PhotoURL
    ? `<img src="${person.PhotoURL}" alt="" class="pd-photo" />`
    : `<div class="pd-photo-placeholder">${initial}</div>`;

  const genderLabel = person.Gender === 'male' ? 'ذكر'
    : (person.Gender === 'female' ? 'أنثى' : '-');

  const age = getAge(person.BirthDate);
  const ageLabel = age !== null ? `${age} سنة` : '-';

  const attendanceHtml = stats.recentAttendance.length > 0
    ? stats.recentAttendance.map(a => {
        const scanDate = parseDate(a.ScanTime);
        const dateStr = scanDate ? formatDateTime(scanDate) : '';
        return `
          <div class="pd-attendance-item">
            <div class="pd-attendance-icon">✅</div>
            <div class="pd-attendance-info">
              <div class="pd-attendance-title">${escapeHtml(a.MeetingTitle || 'اجتماع')}</div>
              <div class="pd-attendance-date">${dateStr}</div>
            </div>
          </div>
        `;
      }).join('')
    : '<p style="text-align:center;color:#64748b;padding:20px;">لم يسجّل حضور بعد</p>';

  const body = modal.querySelector('.modal-body');
  body.innerHTML = `
    <div class="pd-container">

      <div class="pd-header">
        <div class="pd-photo-wrapper">${photoHtml}</div>
        <div class="pd-header-info">
          <h1>${escapeHtml(fullName)}</h1>
          <p class="pd-email">${escapeHtml(person.Email || '-')}</p>
          <span class="pd-status-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? '✅ نشط' : '⛔ معطل'}
          </span>
        </div>
      </div>

      <div class="pd-stats-grid">
        <div class="pd-stat-card">
          <div class="pd-stat-icon">✅</div>
          <div class="pd-stat-value">${stats.attended}</div>
          <div class="pd-stat-label">حضر</div>
        </div>
        <div class="pd-stat-card">
          <div class="pd-stat-icon">📅</div>
          <div class="pd-stat-value">${stats.totalMeetings}</div>
          <div class="pd-stat-label">إجمالي الاجتماعات</div>
        </div>
        <div class="pd-stat-card">
          <div class="pd-stat-icon">📈</div>
          <div class="pd-stat-value">${stats.attendanceRate}%</div>
          <div class="pd-stat-label">نسبة الحضور</div>
        </div>
      </div>

      ${person.QRCode ? `
        <div class="pd-section">
          <h3 class="pd-section-title">📱 QR</h3>
          <div class="pd-qr-wrapper">
            <div class="pd-qr-box" id="pdQrCanvas"></div>
            <div class="pd-qr-actions">
              <button class="btn-secondary" onclick="downloadPersonQR('${person.id}')">💾 تحميل كصورة</button>
              <button class="btn-danger" onclick="confirmRegenerateQRDetails('${person.id}')">🔄 تجديد QR</button>
            </div>
          </div>
        </div>
      ` : `
        <div class="pd-section">
          <h3 class="pd-section-title">📱 QR</h3>
          <div style="text-align:center;padding:20px;color:#64748b;">
            <p>لم يتم إنشاء QR بعد</p>
            <button class="btn-primary" onclick="closePersonDetails(); generateQR('${person.id}');" style="margin-top:12px;">✨ إنشاء QR</button>
          </div>
        </div>
      `}

      <div class="pd-section">
        <h3 class="pd-section-title">📋 البيانات الشخصية</h3>
        <div class="pd-info-grid">
          <div class="pd-info-item"><div class="pd-info-label">الاسم الأول</div><div class="pd-info-value">${escapeHtml(person.FirstName || '-')}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">الاسم الثاني</div><div class="pd-info-value">${escapeHtml(person.SecondName || '-')}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">الاسم الثالث</div><div class="pd-info-value">${escapeHtml(person.ThirdName || '-')}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">الاسم الرابع</div><div class="pd-info-value">${escapeHtml(person.FourthName || '-')}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">تاريخ الميلاد</div><div class="pd-info-value">${formatDate(person.BirthDate)}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">العمر</div><div class="pd-info-value">${ageLabel}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">النوع</div><div class="pd-info-value">${genderLabel}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">الموبايل</div><div class="pd-info-value ltr">${escapeHtml(person.Mobile || '-')}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">واتساب</div><div class="pd-info-value ltr">${escapeHtml(person.WhatsApp || '-')}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">البريد</div><div class="pd-info-value ltr">${escapeHtml(person.Email || '-')}</div></div>
          <div class="pd-info-item"><div class="pd-info-label">العنوان</div><div class="pd-info-value">${escapeHtml(person.Address || '-')}</div></div>
          <div class="pd-info-item">
            <div class="pd-info-label">Facebook</div>
            ${person.Facebook
              ? `<a href="${escapeHtml(formatFacebookUrl(person.Facebook))}" target="_blank" rel="noopener noreferrer" class="pd-facebook-btn">🔗 فتح الصفحة</a>`
              : `<div class="pd-info-value ltr">-</div>`
            }
          </div>
          <div class="pd-info-item"><div class="pd-info-label">تاريخ الإضافة</div><div class="pd-info-value">${formatDate(person.CreatedAt)}</div></div>
        </div>
      </div>

      <div class="pd-section">
        <h3 class="pd-section-title">📅 آخر الحضور</h3>
        <div class="pd-attendance-list">${attendanceHtml}</div>
      </div>

    </div>
  `;

  if (person.QRCode) {
    setTimeout(() => {
      const container = document.getElementById('pdQrCanvas');
      if (container && typeof QRCode !== 'undefined') {
        container.innerHTML = '';
        new QRCode(container, {
          text: person.QRCode,
          width: 200,
          height: 200,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    }, 100);
  }
}

function closePersonDetails() {
  const modal = document.getElementById('personDetailsModal');
  if (modal) modal.style.display = 'none';
}

async function confirmRegenerateQRDetails(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const fullName = getFullName(person);

  if (!confirm(
    `⚠️ تحذير: تجديد QR لـ "${fullName}"\n\n` +
    `سيتم إلغاء الـ QR القديم نهائيًا، ولن يعمل.\n\n` +
    `يجب عليك طباعة/إرسال الـ QR الجديد للشخص.\n\n` +
    `هل أنت متأكد؟`
  )) {
    return;
  }

  try {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    const newQRCode = `PERSON_${personId}_${timestamp}${randomPart}`;

    const personRef = doc(db, COLLECTIONS.PEOPLE, personId);
    await updateDoc(personRef, {
      QRCode: newQRCode,
      QRRegeneratedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    });

    person.QRCode = newQRCode;
    person.QRRegeneratedAt = new Date().toISOString();

    alert('✅ تم تجديد QR بنجاح\n\nالـ QR القديم لم يعد صالحاً.');

    closePersonDetails();
    setTimeout(() => viewPersonDetails(personId), 200);

  } catch (err) {
    console.error('❌ Regenerate QR error:', err);
    alert('خطأ: ' + err.message);
  }
}

function downloadPersonQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const container = document.getElementById('pdQrCanvas');
  if (!container) return;

  const canvas = container.querySelector('canvas');
  const img = container.querySelector('img');

  let dataUrl = null;
  if (canvas) dataUrl = canvas.toDataURL('image/png');
  else if (img && img.src) dataUrl = img.src;

  if (!dataUrl) { alert('لا يمكن تحميل الصورة'); return; }

  const fullName = getFullName(person).replace(/\s+/g, '_');
  const link = document.createElement('a');
  link.download = `QR_${fullName}.png`;
  link.href = dataUrl;
  link.click();
}

// ═══════════════════════════════════════════════════════
//   Expose to window
// ═══════════════════════════════════════════════════════

window.loadPeoplePage = loadPeoplePage;
window.openPersonModal = openPersonModal;
window.closePersonModal = closePersonModal;
window.savePerson = savePerson;
window.editPerson = editPerson;
window.togglePersonStatus = togglePersonStatus;
window.confirmDeletePerson = confirmDeletePerson;
window.generateQR = generateQR;
window.viewQR = viewQR;
window.closeQRModal = closeQRModal;
window.downloadQR = downloadQR;
window.confirmRegenerateQR = confirmRegenerateQR;
window.confirmRegenerateQRDetails = confirmRegenerateQRDetails;
window.viewPersonDetails = viewPersonDetails;
window.closePersonDetails = closePersonDetails;
window.downloadPersonQR = downloadPersonQR;
window.addEmailToIgnoreList = addEmailToIgnoreList;
window.clearPeopleFilters = clearPeopleFilters;
