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
//   Load People Page
// ═══════════════════════════════════════════════════════

async function loadPeoplePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const snap = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    peopleData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
          <input type="text" id="peopleSearchInput" placeholder="🔍 ابحث بالاسم، الهاتف، أو البريد..." />
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
          <span class="people-stat-value">${peopleData.filter(p => String(p.Status || '').toLowerCase() === 'active').length}</span>
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
              <th>الهاتف</th>
              <th>البريد</th>
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

    return `
      <tr>
        <td>
          ${person.PhotoURL
            ? `<img src="${person.PhotoURL}" alt="" class="person-avatar" />`
            : `<div class="person-avatar-placeholder">${(person.Name || '?').charAt(0)}</div>`
          }
        </td>
        <td><strong>${escapeHtml(person.Name || '-')}</strong></td>
        <td>${escapeHtml(person.Phone || '-')}</td>
        <td>${escapeHtml(person.Email || '-')}</td>
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
        filteredPeople = peopleData.filter(p =>
          String(p.Name || '').toLowerCase().includes(term) ||
          String(p.Phone || '').toLowerCase().includes(term) ||
          String(p.Email || '').toLowerCase().includes(term)
        );
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

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ تعديل شخص' : '➕ إضافة شخص جديد'}</h2>
        <button class="modal-close" onclick="closePersonModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-row">
          <label>الاسم *</label>
          <input type="text" id="personName" value="${person ? escapeHtml(person.Name || '') : ''}" placeholder="الاسم الكامل" />
        </div>

        <div class="form-row">
          <label>الهاتف</label>
          <input type="tel" id="personPhone" value="${person ? escapeHtml(person.Phone || '') : ''}" placeholder="01xxxxxxxxx" />
        </div>

        <div class="form-row">
          <label>البريد الإلكتروني</label>
          <input type="email" id="personEmail" value="${person ? escapeHtml(person.Email || '') : ''}" placeholder="name@example.com" />
        </div>

        <div class="form-row">
          <label>رابط الصورة (اختياري)</label>
          <input type="text" id="personPhotoURL" value="${person ? escapeHtml(person.PhotoURL || '') : ''}" placeholder="https://..." />
        </div>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="personActive" ${!person || String(person.Status || 'active').toLowerCase() === 'active' ? 'checked' : ''} />
          <label for="personActive">حساب نشط</label>
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
    const nameInput = document.getElementById('personName');
    if (nameInput) nameInput.focus();
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
  const name = document.getElementById('personName')?.value.trim();
  const phone = document.getElementById('personPhone')?.value.trim() || '';
  const email = document.getElementById('personEmail')?.value.trim() || '';
  const photoURL = document.getElementById('personPhotoURL')?.value.trim() || '';
  const isActive = document.getElementById('personActive')?.checked;

  if (!name) {
    alert('الاسم مطلوب');
    return;
  }

  const status = isActive ? 'active' : 'inactive';

  try {
    if (currentEditId) {
      const personRef = doc(db, COLLECTIONS.PEOPLE, currentEditId);
      await updateDoc(personRef, {
        Name: name,
        Phone: phone,
        Email: email,
        PhotoURL: photoURL,
        Status: status,
        UpdatedAt: new Date().toISOString()
      });

      alert('✅ تم التعديل بنجاح');
    } else {
      const personData = {
        Name: name,
        Phone: phone,
        Email: email,
        PhotoURL: photoURL,
        QRCode: '',
        Status: status,
        CreatedAt: new Date().toISOString(),
        ExtraData: ''
      };

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

  const confirmMsg = newStatus === 'inactive'
    ? `هل تريد تعطيل "${person.Name}"؟`
    : `هل تريد تفعيل "${person.Name}"؟`;

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

  if (!confirm(`⚠️ هل أنت متأكد من حذف "${person.Name}"؟\n\nهذا الإجراء لا يمكن التراجع عنه.`)) {
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
        <h2>📱 QR - ${escapeHtml(person.Name)}</h2>
        <button class="modal-close" onclick="closeQRModal()">✕</button>
      </div>

      <div class="modal-body qr-body">
        <div id="qrCodeContainer" class="qr-container"></div>
        <p class="qr-person-name">${escapeHtml(person.Name)}</p>
        <p class="qr-person-id">ID: ${person.id}</p>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeQRModal()">إغلاق</button>
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

function printQR(personId) {
  const person = peopleData.find(p => p.id === personId);
  if (!person) return;

  const qrContainer = document.getElementById('qrCodeContainer');
  if (!qrContainer) return;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html dir="rtl">
      <head>
        <title>QR - ${person.Name}</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 40px; }
          h2 { margin-bottom: 20px; }
          .qr-box { display: inline-block; padding: 20px; border: 2px solid #000; }
        </style>
      </head>
      <body>
        <h2>${person.Name}</h2>
        <div class="qr-box">${qrContainer.innerHTML}</div>
        <p style="margin-top:20px;color:#666;">ID: ${person.id}</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

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
window.printQR = printQR;
