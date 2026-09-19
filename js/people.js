// ═══════════════════════════════════════════════════════
//   People Management (Firestore)
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let peopleData = [];
let filteredPeople = [];
let currentEditId = null;

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getFullName(person) {
  return [
    person.FirstName,
    person.SecondName,
    person.ThirdName,
    person.FourthName
  ].filter(Boolean).join(' ');
}

function getShortName(person) {
  return [person.FirstName, person.SecondName].filter(Boolean).join(' ');
}

function getInitial(person) {
  return (person.FirstName || '?').charAt(0);
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

// ═══════════════════════════════════════════════════════
//   Load People Page
// ═══════════════════════════════════════════════════════

async function loadPeoplePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const snap = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    peopleData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ترتيب حسب الاسم
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
          <input type="text" id="peopleSearchInput" placeholder="🔍 ابحث بالاسم، الموبايل، أو البريد..." />
        </div>
        <button class="btn-primary" onclick="openPersonModal()">
          ➕ إضافة شخص
        </button>
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
        <td><strong>${escapeHtml(getFullName(person) || '-')}</strong></td>
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
//   Search
// ═══════════════════════════════════════════════════════

function setupPeopleEvents() {
  const searchInput = document.getElementById('peopleSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();

      if (!term) {
        filteredPeople = [...peopleData];
      } else {
        filteredPeople = peopleData.filter(p => {
          const fullName = getFullName(p).toLowerCase();
          return fullName.includes(term) ||
            String(p.Mobile || '').includes(term) ||
            String(p.WhatsApp || '').includes(term) ||
            String(p.Email || '').toLowerCase().includes(term);
        });
      }

      renderPeopleTable();
    });
  }
}

// ═══════════════════════════════════════════════════════
//   Person Modal
// ═══════════════════════════════════════════════════════

function openPersonModal(personId) {
  currentEditId = personId || null;
  const person = personId ? peopleData.find(p => p.id === personId) : null;
  const isEdit = !!person;

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

        <!-- الأسماء -->
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

        <!-- معلومات شخصية -->
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

        <!-- معلومات تواصل -->
        <div class="modal-section">
          <h4 class="modal-section-title">معلومات التواصل</h4>
          <div class="form-grid-2">
            <div class="form-row">
              <label>رقم الموبايل *</label>
              <input type="tel" id="p_Mobile" value="${escapeHtml(p.Mobile || '')}" placeholder="01xxxxxxxxx" />
            </div>
            <div class="form-row">
              <label>رقم واتساب</label>
              <input type="tel" id="p_WhatsApp" value="${escapeHtml(p.WhatsApp || '')}" placeholder="01xxxxxxxxx" />
            </div>
          </div>
          <div class="form-row">
            <label>البريد الإلكتروني</label>
            <input type="email" id="p_Email" value="${escapeHtml(p.Email || '')}" placeholder="name@example.com" />
            <p class="hint">البريد مهم — هو اللي بيتم الربط بحساب Google</p>
          </div>
          <div class="form-row">
            <label>Facebook</label>
            <input type="text" id="p_Facebook" value="${escapeHtml(p.Facebook || '')}" placeholder="facebook.com/username أو username" />
          </div>
        </div>

        <!-- الصورة والحالة -->
        <div class="modal-section">
          <h4 class="modal-section-title">الصورة والحالة</h4>
          <div class="form-row">
            <label>رابط الصورة</label>
            <input type="text" id="p_PhotoURL" value="${escapeHtml(p.PhotoURL || '')}" placeholder="https://..." />
          </div>

          <div id="photoPreviewBox" class="photo-preview-box" style="${p.PhotoURL ? '' : 'display:none;'}">
            <img id="photoPreviewImg" src="${p.PhotoURL || ''}" alt="" />
          </div>

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

  // Preview للصورة
  const photoInput = document.getElementById('p_PhotoURL');
  if (photoInput) {
    photoInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      const box = document.getElementById('photoPreviewBox');
      const img = document.getElementById('photoPreviewImg');
      if (url && box && img) {
        img.src = url;
        box.style.display = 'block';
      } else if (box) {
        box.style.display = 'none';
      }
    });
  }

  setTimeout(() => {
    const el = document.getElementById('p_FirstName');
    if (el) el.focus();
  }, 100);
}

function closePersonModal() {
  const modal = document.getElementById('personModal');
  if (modal) modal.style.display = 'none';
  currentEditId = null;
}

// ═══════════════════════════════════════════════════════
//   Save Person
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
  const photoURL = document.getElementById('p_PhotoURL')?.value.trim() || '';
  const isActive = document.getElementById('p_Active')?.checked;

  // Validation
  if (!firstName) { alert('الاسم الأول مطلوب'); return; }
  if (!secondName) { alert('الاسم الثاني مطلوب'); return; }
  if (!mobile) { alert('رقم الموبايل مطلوب'); return; }

  const status = isActive ? 'active' : 'inactive';

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
    Status: status,
    UpdatedAt: new Date().toISOString()
  };

  try {
    if (currentEditId) {
      const personRef = doc(db, COLLECTIONS.PEOPLE, currentEditId);
      await updateDoc(personRef, personData);
      alert('✅ تم التعديل بنجاح');
    } else {
      personData.QRCode = '';
      personData.CreatedAt = new Date().toISOString();

      await addDoc(collection(db, COLLECTIONS.PEOPLE), personData);
      alert('✅ تمت الإضافة بنجاح');
    }

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
    ? `هل تريد تعطيل "${fullName}"؟`
    : `هل تريد تفعيل "${fullName}"؟`;

  if (!confirm(confirmMsg)) return;

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, personId);
    await updateDoc(personRef, {
      Status: newStatus,
      UpdatedAt: new Date().toISOString()
    });

    person.Status = newStatus;
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

  if (!confirm(`⚠️ هل أنت متأكد من حذف "${fullName}"؟\n\nهذا الإجراء لا يمكن التراجع عنه.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, COLLECTIONS.PEOPLE, personId));
    alert('✅ تم الحذف بنجاح');

    const area = document.getElementById('contentArea');
    await loadPeoplePage(area);
  } catch (err) {
    console.error('❌ Delete person error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   QR Code
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

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeQRModal()">إغلاق</button>
        <button class="btn-secondary" onclick="downloadQR('${person.id}')">💾 تحميل كصورة</button>
        <button class="btn-primary" onclick="printQR('${person.id}')">🖨️ طباعة</button>
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
    container.innerHTML = `
      <div class="qr-fallback">
        <p>QR Code:</p>
        <code style="font-size:14px;word-break:break-all;">${person.QRCode}</code>
      </div>
    `;
  }
}

function closeQRModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.style.display = 'none';
}

function downloadQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const container = document.getElementById('qrCodeContainer');
  if (!container) return;

  const canvas = container.querySelector('canvas');
  const img = container.querySelector('img');

  let dataUrl = null;

  if (canvas) {
    dataUrl = canvas.toDataURL('image/png');
  } else if (img && img.src) {
    dataUrl = img.src;
  }

  if (!dataUrl) {
    alert('لا يمكن تحميل الصورة');
    return;
  }

  const fullName = getFullName(person).replace(/\s+/g, '_');
  const link = document.createElement('a');
  link.download = `QR_${fullName}.png`;
  link.href = dataUrl;
  link.click();
}

function printQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const qrContainer = document.getElementById('qrCodeContainer');
  if (!qrContainer) return;

  const fullName = getFullName(person);

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html dir="rtl">
      <head>
        <title>QR - ${fullName}</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 40px; }
          h2 { margin-bottom: 20px; }
          .qr-box { display: inline-block; padding: 20px; border: 2px solid #000; }
        </style>
      </head>
      <body>
        <h2>${fullName}</h2>
        <div class="qr-box">${qrContainer.innerHTML}</div>
        <p style="margin-top:20px;color:#666;">ID: ${person.id}</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
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
window.printQR = printQR;
window.getFullName = getFullName;
window.getShortName = getShortName;
