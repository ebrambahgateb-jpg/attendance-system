// ═══════════════════════════════════════════════════════
//   Accounts Management (إدارة الحسابات)
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let accountsData = [];
let filteredAccounts = [];
let peopleData = {};
let currentEditId = null;

// ═══ الأدوار المتاحة ═══
const ROLES = [
  { value: 'Owner',   label: 'Owner (مالك)',   icon: '👑' },
  { value: 'Admin',   label: 'Admin (مسؤول)',  icon: '🛠️' },
  { value: 'Scanner', label: 'Scanner (ماسح)', icon: '📷' },
  { value: 'User',    label: 'User (مستخدم)',  icon: '👤' }
];

// ═══════════════════════════════════════════════════════
//   Load Accounts Page
// ═══════════════════════════════════════════════════════

async function loadAccountsPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const [accountsSnap, peopleSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.ACCOUNTS)),
      getDocs(collection(db, COLLECTIONS.PEOPLE))
    ]);

    accountsData = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Map للأشخاص
    peopleData = {};
    peopleSnap.docs.forEach(d => {
      peopleData[d.id] = { id: d.id, ...d.data() };
    });

    // ترتيب: Owner → Admin → Scanner → User
    const roleOrder = { owner: 0, admin: 1, scanner: 2, user: 3 };
    accountsData.sort((a, b) => {
      const aRole = String(a.Role || '').split(',')[0].trim().toLowerCase();
      const bRole = String(b.Role || '').split(',')[0].trim().toLowerCase();
      const aOrd = roleOrder[aRole] ?? 4;
      const bOrd = roleOrder[bRole] ?? 4;
      if (aOrd !== bOrd) return aOrd - bOrd;
      return String(a.Email || '').localeCompare(String(b.Email || ''));
    });

    filteredAccounts = [...accountsData];
    renderAccountsPage(area);

  } catch (err) {
    console.error('❌ Load accounts error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadAccountsPage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderAccountsPage(area) {
  // إحصائيات
  const stats = {
    total: accountsData.length,
    owners: accountsData.filter(a => getRolesArray(a.Role).includes('Owner')).length,
    admins: accountsData.filter(a => getRolesArray(a.Role).includes('Admin')).length,
    scanners: accountsData.filter(a => getRolesArray(a.Role).includes('Scanner')).length,
    users: accountsData.filter(a => getRolesArray(a.Role).includes('User')).length,
    disabled: accountsData.filter(a => String(a.Status || '').toLowerCase() === 'disabled').length
  };

  area.innerHTML = `
    <div class="acc-container">

      <!-- Header -->
      <div class="acc-header">
        <div class="acc-search">
          <input type="text" id="accSearchInput" placeholder="🔍 ابحث بالبريد، الاسم..." />
        </div>
        <button class="btn-primary" onclick="openAccountModal()">➕ إضافة حساب</button>
      </div>

      <!-- Stats -->
      <div class="acc-stats">
        <div class="acc-stat">
          <span class="acc-stat-value">${stats.total}</span>
          <span class="acc-stat-label">إجمالي</span>
        </div>
        <div class="acc-stat">
          <span class="acc-stat-value">👑 ${stats.owners}</span>
          <span class="acc-stat-label">Owner</span>
        </div>
        <div class="acc-stat">
          <span class="acc-stat-value">🛠️ ${stats.admins}</span>
          <span class="acc-stat-label">Admin</span>
        </div>
        <div class="acc-stat">
          <span class="acc-stat-value">📷 ${stats.scanners}</span>
          <span class="acc-stat-label">Scanner</span>
        </div>
        <div class="acc-stat">
          <span class="acc-stat-value">👤 ${stats.users}</span>
          <span class="acc-stat-label">User</span>
        </div>
        <div class="acc-stat">
          <span class="acc-stat-value">⛔ ${stats.disabled}</span>
          <span class="acc-stat-label">معطل</span>
        </div>
      </div>

      <!-- Table -->
      <div class="acc-table-wrapper">
        <table class="acc-table">
          <thead>
            <tr>
              <th>الصورة</th>
              <th>البريد الإلكتروني</th>
              <th>الأدوار</th>
              <th>الشخص المرتبط</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody id="accTableBody"></tbody>
        </table>
      </div>

      <!-- Empty -->
      <div id="accEmptyState" class="acc-empty" style="display:none;">
        <div class="acc-empty-icon">🔑</div>
        <h3>لا يوجد حسابات</h3>
        <p>ابدأ بإضافة حساب جديد</p>
        <button class="btn-primary" onclick="openAccountModal()">➕ إضافة حساب</button>
      </div>

    </div>
  `;

  renderAccountsTable();
  setupAccountsEvents();
}

// ═══════════════════════════════════════════════════════
//   Render Table
// ═══════════════════════════════════════════════════════

function renderAccountsTable() {
  const tbody = document.getElementById('accTableBody');
  const emptyState = document.getElementById('accEmptyState');
  const tableWrapper = document.querySelector('.acc-table-wrapper');

  if (!tbody) return;

  if (filteredAccounts.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (tableWrapper) tableWrapper.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  tbody.innerHTML = filteredAccounts.map(acc => {
    const status = String(acc.Status || 'active').toLowerCase();
    const isActive = status === 'active';
    const roles = getRolesArray(acc.Role);

    // الشخص المرتبط
    const person = acc.PersonID ? peopleData[acc.PersonID] : null;
    const personName = person
      ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ')
      : '';

    // الصورة
    const initial = (acc.Email || '?').charAt(0).toUpperCase();
    const photoHtml = person?.PhotoURL
      ? `<img src="${person.PhotoURL}" class="acc-avatar" alt="" />`
      : `<div class="acc-avatar-placeholder">${initial}</div>`;

    // شارات الأدوار
    const rolesHtml = roles.length > 0
      ? roles.map(r => {
          const roleInfo = ROLES.find(x => x.value === r);
          return `<span class="acc-role-badge role-${r.toLowerCase()}">${roleInfo?.icon || ''} ${r}</span>`;
        }).join('')
      : '<span class="acc-role-badge role-none">بدون دور</span>';

    return `
      <tr>
        <td>${photoHtml}</td>
        <td>
          <div class="acc-email">${escapeHtml(acc.Email || '-')}</div>
        </td>
        <td>
          <div class="acc-roles">${rolesHtml}</div>
        </td>
        <td>
          ${personName
            ? `<span class="acc-person-name">${escapeHtml(personName)}</span>`
            : `<span class="acc-person-empty">— غير مرتبط —</span>`
          }
        </td>
        <td>
          <span class="status-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? '✅ نشط' : '⛔ معطل'}
          </span>
        </td>
        <td class="actions-cell">
          <button class="btn-icon" onclick="editAccount('${acc.id}')" title="تعديل">✏️</button>
          <button class="btn-icon" onclick="toggleAccountStatus('${acc.id}')" title="${isActive ? 'تعطيل' : 'تفعيل'}">
            ${isActive ? '⏸️' : '▶️'}
          </button>
          <button class="btn-icon danger" onclick="confirmDeleteAccount('${acc.id}')" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//   Search
// ═══════════════════════════════════════════════════════

function setupAccountsEvents() {
  const searchInput = document.getElementById('accSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();

      if (!term) {
        filteredAccounts = [...accountsData];
      } else {
        filteredAccounts = accountsData.filter(a => {
          const email = String(a.Email || '').toLowerCase();
          const person = a.PersonID ? peopleData[a.PersonID] : null;
          const personName = person
            ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ').toLowerCase()
            : '';
          return email.includes(term) || personName.includes(term);
        });
      }

      renderAccountsTable();
    });
  }
}

// ═══════════════════════════════════════════════════════
//   Account Modal
// ═══════════════════════════════════════════════════════

function openAccountModal(accountId) {
  currentEditId = accountId || null;
  const acc = accountId ? accountsData.find(a => a.id === accountId) : null;
  const isEdit = !!acc;

  // الأدوار الحالية للحساب
  const currentRoles = acc ? getRolesArray(acc.Role) : [];

  // قائمة الأشخاص
  const peopleList = Object.values(peopleData).sort((a, b) => {
    const aName = [a.FirstName, a.SecondName].filter(Boolean).join(' ');
    const bName = [b.FirstName, b.SecondName].filter(Boolean).join(' ');
    return aName.localeCompare(bName, 'ar');
  });

  let modal = document.getElementById('accountModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'accountModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ تعديل حساب' : '➕ إضافة حساب جديد'}</h2>
        <button class="modal-close" onclick="closeAccountModal()">✕</button>
      </div>

      <div class="modal-body">

        <div class="modal-section">
          <h4 class="modal-section-title">معلومات الحساب</h4>

          <div class="form-row">
            <label>البريد الإلكتروني (Google) *</label>
            <input type="email" id="acc_Email"
                   value="${acc ? escapeHtml(acc.Email || '') : ''}"
                   placeholder="user@gmail.com"
                   dir="ltr"
                   ${isEdit ? 'disabled' : ''} />
            ${isEdit ? '<p class="hint">البريد لا يمكن تعديله (معرّف الحساب)</p>' : '<p class="hint">البريد الذي يسجّل به المستخدم من Google</p>'}
          </div>

          <div class="form-row checkbox-row">
            <input type="checkbox" id="acc_Active"
                   ${!acc || String(acc.Status || 'active').toLowerCase() === 'active' ? 'checked' : ''} />
            <label for="acc_Active">حساب نشط</label>
          </div>
        </div>

        <div class="modal-section">
          <h4 class="modal-section-title">الأدوار *</h4>
          <p class="hint">يمكن اختيار أكثر من دور</p>

          <div class="roles-checkbox-list">
            ${ROLES.map(role => `
              <label class="role-checkbox-item role-${role.value.toLowerCase()}">
                <input type="checkbox"
                       name="acc_Roles"
                       value="${role.value}"
                       ${currentRoles.includes(role.value) ? 'checked' : ''} />
                <span class="role-icon">${role.icon}</span>
                <span class="role-label">${role.label}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="modal-section">
          <h4 class="modal-section-title">الشخص المرتبط (اختياري)</h4>
          <p class="hint">اربط الحساب بشخص في النظام لتسجيل حضوره</p>

          <div class="form-row">
            <label>اختر الشخص</label>
            <select id="acc_PersonID">
              <option value="">— بدون ربط —</option>
              ${peopleList.map(p => {
                const name = [p.FirstName, p.SecondName, p.ThirdName, p.FourthName].filter(Boolean).join(' ');
                return `<option value="${p.id}" ${acc && acc.PersonID === p.id ? 'selected' : ''}>${escapeHtml(name)}</option>`;
              }).join('')}
            </select>
          </div>

          ${!isEdit && Object.keys(peopleData).length > 0 ? `
            <button type="button" class="btn-secondary" onclick="autoLinkPerson()">
              🔍 اربط تلقائيًا بالبريد
            </button>
          ` : ''}
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeAccountModal()">إلغاء</button>
        <button class="btn-primary" onclick="saveAccount()">💾 حفظ</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  setTimeout(() => {
    const el = document.getElementById('acc_Email');
    if (el && !isEdit) el.focus();
  }, 100);
}

function closeAccountModal() {
  const modal = document.getElementById('accountModal');
  if (modal) modal.style.display = 'none';
  currentEditId = null;
}

// ═══ Auto Link by Email ═══
window.autoLinkPerson = function() {
  const email = document.getElementById('acc_Email')?.value.trim().toLowerCase();
  if (!email) {
    alert('اكتب البريد الإلكتروني أولاً');
    return;
  }

  const found = Object.values(peopleData).find(p =>
    String(p.Email || '').toLowerCase() === email
  );

  if (found) {
    const select = document.getElementById('acc_PersonID');
    if (select) select.value = found.id;

    const name = [found.FirstName, found.SecondName].filter(Boolean).join(' ');
    alert(`✅ تم ربط الحساب بـ: ${name}`);
  } else {
    alert('❌ لم يتم إيجاد شخص بنفس البريد');
  }
};

// ═══════════════════════════════════════════════════════
//   Save Account
// ═══════════════════════════════════════════════════════

async function saveAccount() {
  const email = document.getElementById('acc_Email')?.value.trim().toLowerCase();
  const isActive = document.getElementById('acc_Active')?.checked;
  const personId = document.getElementById('acc_PersonID')?.value || '';

  // الأدوار المختارة
  const selectedRoles = Array.from(
    document.querySelectorAll('input[name="acc_Roles"]:checked')
  ).map(c => c.value);

  // Validation
  if (!email) {
    alert('البريد الإلكتروني مطلوب');
    return;
  }

  if (selectedRoles.length === 0) {
    alert('اختر دورًا واحدًا على الأقل');
    return;
  }

  // ترتيب الأدوار: Owner → Admin → Scanner → User
  const roleOrder = { Owner: 0, Admin: 1, Scanner: 2, User: 3 };
  selectedRoles.sort((a, b) => (roleOrder[a] ?? 4) - (roleOrder[b] ?? 4));

  const roleString = selectedRoles.join(',');
  const status = isActive ? 'active' : 'disabled';

  try {
    if (currentEditId) {
      // ⚡ تعديل
      const accRef = doc(db, COLLECTIONS.ACCOUNTS, currentEditId);
      await updateDoc(accRef, {
        Role: roleString,
        PersonID: personId || '',
        Status: status,
        UpdatedAt: new Date().toISOString()
      });

      alert('✅ تم التعديل بنجاح');
    } else {
      // ⚡ إضافة جديدة
      // تحقق من عدم وجود حساب بنفس البريد
      const existingQuery = query(
        collection(db, COLLECTIONS.ACCOUNTS),
        where('Email', '==', email)
      );
      const existingSnap = await getDocs(existingQuery);

      if (!existingSnap.empty) {
        alert('❌ يوجد حساب بنفس البريد بالفعل');
        return;
      }

      // ⚡ لو فيه شخص بنفس البريد، اربطه تلقائيًا
      let finalPersonId = personId;
      if (!finalPersonId) {
        const foundPerson = Object.values(peopleData).find(p =>
          String(p.Email || '').toLowerCase() === email
        );
        if (foundPerson) finalPersonId = foundPerson.id;
      }

      const accountData = {
        Email: email,
        Role: roleString,
        PersonID: finalPersonId || '',
        Status: status,
        CreatedAt: new Date().toISOString(),
        UID: '' // يُملأ عند أول دخول
      };

      await addDoc(collection(db, COLLECTIONS.ACCOUNTS), accountData);
      alert('✅ تمت الإضافة بنجاح\n\nملاحظة: سيتم ربط UID تلقائيًا عند أول تسجيل دخول.');
    }

    closeAccountModal();

    const area = document.getElementById('contentArea');
    await loadAccountsPage(area);

  } catch (err) {
    console.error('❌ Save account error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Edit / Toggle / Delete
// ═══════════════════════════════════════════════════════

function editAccount(accountId) {
  openAccountModal(accountId);
}

async function toggleAccountStatus(accountId) {
  const acc = accountsData.find(a => a.id === accountId);
  if (!acc) return;

  const currentStatus = String(acc.Status || 'active').toLowerCase();
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active';

  const confirmMsg = newStatus === 'disabled'
    ? `هل تريد تعطيل "${acc.Email}"؟\n\nلن يستطيع تسجيل الدخول.`
    : `هل تريد تفعيل "${acc.Email}"؟`;

  if (!confirm(confirmMsg)) return;

  try {
    const accRef = doc(db, COLLECTIONS.ACCOUNTS, accountId);
    await updateDoc(accRef, {
      Status: newStatus,
      UpdatedAt: new Date().toISOString()
    });

    acc.Status = newStatus;
    renderAccountsTable();
  } catch (err) {
    console.error('❌ Toggle status error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function confirmDeleteAccount(accountId) {
  const acc = accountsData.find(a => a.id === accountId);
  if (!acc) return;

  // ⚡ تحذير خاص لو الحساب Owner
  const isOwner = getRolesArray(acc.Role).includes('Owner');
  const warning = isOwner
    ? '\n\n⚠️ تحذير: هذا حساب Owner! حذفه قد يسبب فقدان السيطرة على النظام.'
    : '';

  if (!confirm(`⚠️ هل أنت متأكد من حذف "${acc.Email}"؟${warning}\n\nهذا الإجراء لا يمكن التراجع عنه.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, COLLECTIONS.ACCOUNTS, accountId));

    alert('✅ تم الحذف بنجاح');

    const area = document.getElementById('contentArea');
    await loadAccountsPage(area);
  } catch (err) {
    console.error('❌ Delete account error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getRolesArray(roleStr) {
  if (!roleStr) return [];
  return String(roleStr)
    .split(',')
    .map(r => r.trim())
    .filter(r => ['Owner', 'Admin', 'Scanner', 'User'].includes(r));
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

window.loadAccountsPage = loadAccountsPage;
window.openAccountModal = openAccountModal;
window.closeAccountModal = closeAccountModal;
window.saveAccount = saveAccount;
window.editAccount = editAccount;
window.toggleAccountStatus = toggleAccountStatus;
window.confirmDeleteAccount = confirmDeleteAccount;
