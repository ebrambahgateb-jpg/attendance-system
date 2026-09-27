// ═══════════════════════════════════════════════════════
//   Attendance Viewer + Manual Attendance
//   ⚡ محدّث: عرض + طلبات إلغاء + تسجيل يدوي بالساعة
// ═══════════════════════════════════════════════════════

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC
} from './firebase-config.js';

// ═══ State ═══
let attData = [];
let attFiltered = [];
let attPeople = {};
let attMeetings = {};
let attEvents = {};
let attCurrentPage = 1;
let attSettings = {};
let attCancelRequests = [];
const ATT_PER_PAGE = 50;

let attFilters = {
  search: '',
  dateFrom: '',
  dateTo: '',
  meetingId: '',
  personId: '',
  method: ''
};

// ═══ ⚡ Manual Attendance State ═══
let attCurrentUser = null;
let attCurrentWorkspace = null;
let manualSelectedPeople = [];
let manualSelectedEventId = null;
const ATT_MANUAL_MAX_DAYS = 30;

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadAttendancePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    try {
      attCurrentUser = JSON.parse(localStorage.getItem('currentUser'));
      attCurrentWorkspace = attCurrentUser?.currentWorkspace || attCurrentUser?.selectedRole || 'User';
    } catch (e) {
      attCurrentUser = null;
      attCurrentWorkspace = 'User';
    }

    const [attSnap, peopleSnap, eventsSnap, settingsDoc, cancelReqSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.ATTENDANCE)),
      getDocs(collection(db, COLLECTIONS.PEOPLE)),
      getDocs(collection(db, 'events')).catch(() => ({ docs: [] })),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC)),
      getDocs(query(
        collection(db, 'eventRegistrations'),
        where('Status', '==', 'cancel_requested')
      )).catch(() => ({ docs: [] }))
    ]);

    attData = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    attSettings = settingsDoc.exists() ? settingsDoc.data() : {};

    attPeople = {};
    peopleSnap.docs.forEach(d => {
      attPeople[d.id] = { id: d.id, ...d.data() };
    });

    attEvents = {};
    eventsSnap.docs.forEach(d => {
      attEvents[d.id] = { id: d.id, ...d.data() };
    });

    attCancelRequests = cancelReqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    attCancelRequests.sort((a, b) => {
      const da = parseDate(a.CancelRequestedAt) || new Date(0);
      const db2 = parseDate(b.CancelRequestedAt) || new Date(0);
      return db2 - da;
    });

    attData.sort((a, b) => {
      const da = parseDate(a.ScanTime) || new Date(0);
      const db2 = parseDate(b.ScanTime) || new Date(0);
      return db2 - da;
    });

    attFiltered = [...attData];
    attCurrentPage = 1;

    renderAttendancePage(area);
  } catch (err) {
    console.error('❌ Load attendance error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadAttendancePage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderAttendancePage(area) {
  const isAdmin = ['Owner', 'Admin'].includes(attCurrentWorkspace);

  area.innerHTML = `
    <div class="att-container">

      ${renderCancelRequestsSection()}

      <div class="att-header">
        <div class="att-search">
          <input type="text" id="attSearchInput" placeholder="🔍 ابحث بالاسم أو الاجتماع..." value="${escapeHtml(attFilters.search)}" />
        </div>
        ${isAdmin ? `
          <button class="btn-primary att-manual-btn" onclick="openManualAttendanceModal()">
            ➕ تسجيل حضور يدوي
          </button>
        ` : ''}
        <button class="btn-secondary" onclick="exportAttendanceCSV()">📥 CSV</button>
        <button class="btn-primary" onclick="exportAttendancePDF()">📄 PDF</button>
      </div>

      <div class="att-stats">
        <div class="att-stat">
          <span class="att-stat-value">${attData.length}</span>
          <span class="att-stat-label">إجمالي السجلات</span>
        </div>
        <div class="att-stat">
          <span class="att-stat-value">${countToday()}</span>
          <span class="att-stat-label">اليوم</span>
        </div>
        <div class="att-stat">
          <span class="att-stat-value">${countThisWeek()}</span>
          <span class="att-stat-label">هذا الأسبوع</span>
        </div>
        <div class="att-stat">
          <span class="att-stat-value">${attFiltered.length}</span>
          <span class="att-stat-label">بعد الفلترة</span>
        </div>
      </div>

      <div class="att-filters">
        <div class="att-filter-group">
          <label>من تاريخ</label>
          <input type="date" id="attFilterFrom" value="${attFilters.dateFrom}" />
        </div>

        <div class="att-filter-group">
          <label>إلى تاريخ</label>
          <input type="date" id="attFilterTo" value="${attFilters.dateTo}" />
        </div>

        <div class="att-filter-group">
          <label>الحدث</label>
          <select id="attFilterMeeting">
            <option value="">الكل</option>
            ${Object.values(attEvents).map(m => `
              <option value="${m.id}" ${attFilters.meetingId === m.id ? 'selected' : ''}>${escapeHtml(m.Title || '')}</option>
            `).join('')}
          </select>
        </div>

        <div class="att-filter-group">
          <label>النوع</label>
          <select id="attFilterMethod">
            <option value="">الكل</option>
            <option value="self" ${attFilters.method === 'self' ? 'selected' : ''}>📱 تسجيل ذاتي</option>
            <option value="scanner" ${attFilters.method === 'scanner' ? 'selected' : ''}>📷 ماسح</option>
            <option value="manual" ${attFilters.method === 'manual' ? 'selected' : ''}>✍️ يدوي</option>
          </select>
        </div>

        <button class="btn-secondary" onclick="clearAttendanceFilters()">مسح الفلاتر</button>
      </div>

      <div class="att-table-wrapper">
        <table class="att-table">
          <thead>
            <tr>
              <th>الشخص</th>
              <th>الحدث</th>
              <th>التاريخ</th>
              <th>الوقت</th>
              <th>الطريقة</th>
              <th>الموقع</th>
              <th>بواسطة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody id="attTableBody"></tbody>
        </table>
      </div>

      <div class="att-pagination" id="attPagination"></div>

      <div id="attEmptyState" class="att-empty" style="display:none;">
        <div class="att-empty-icon">✅</div>
        <h3>لا يوجد سجلات حضور</h3>
        <p>لم يتم تسجيل أي حضور بعد</p>
      </div>

    </div>
  `;

  renderAttendanceTable();
  setupAttendanceEvents();
}

// ═══════════════════════════════════════════════════════
//   Render Cancel Requests Section
// ═══════════════════════════════════════════════════════

function renderCancelRequestsSection() {
  if (!attCancelRequests || attCancelRequests.length === 0) {
    return '';
  }

  const itemsHtml = attCancelRequests.map(req => {
    const person = attPeople[req.PersonID];
    const event = attEvents[req.EventID];

    const personName = req.PersonName
      || (person ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ') : 'غير معروف');

    const eventTitle = event?.Title || req.EventTitle || '-';
    const eventDate = event?.Date
      ? formatDateShort(parseDate(event.Date + 'T00:00:00'))
      : '';

    const requestedAt = parseDate(req.CancelRequestedAt);
    const requestedAgo = requestedAt ? formatRelativeTime(requestedAt) : '';

    const reasonHtml = req.CancelReason
      ? `<div class="att-cancel-reason">
           <span class="att-cancel-reason-label">🔒 السبب (سري):</span>
           ${escapeHtml(req.CancelReason)}
         </div>`
      : '<div class="att-cancel-reason" style="background:#f1f5f9;border-color:#94a3b8;color:#475569;">لم يذكر سبب</div>';

    return `
      <div class="att-cancel-item" data-reg-id="${req.id}">
        <div class="att-cancel-info">
          <div class="att-cancel-name">👤 ${escapeHtml(personName)}</div>
          <div class="att-cancel-line">🎯 <strong>${escapeHtml(eventTitle)}</strong>${eventDate ? ` — ${eventDate}` : ''}</div>
          ${reasonHtml}
          ${requestedAgo ? `<div class="att-cancel-time">🕐 طلب منذ ${requestedAgo}</div>` : ''}
        </div>
        <div class="att-cancel-actions">
          <button class="att-cancel-btn approve" onclick="approveCancelRequest('${req.id}')">✅ موافقة</button>
          <button class="att-cancel-btn reject" onclick="rejectCancelRequest('${req.id}')">❌ رفض</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="att-cancel-section">
      <div class="att-cancel-header">
        <h3 class="att-cancel-title">
          🔔 طلبات الإلغاء
          <span class="att-cancel-count">${attCancelRequests.length}</span>
        </h3>
      </div>
      <div class="att-cancel-list">
        ${itemsHtml}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Approve / Reject Cancel Request
// ═══════════════════════════════════════════════════════

window.approveCancelRequest = async function(regId) {
  if (!confirm('✅ هل تريد الموافقة على طلب الإلغاء؟\n\nسيتم إلغاء الحضور + إشعار الزملاء والمستخدمين.')) return;

  const item = document.querySelector(`[data-reg-id="${regId}"]`);
  const buttons = item ? item.querySelectorAll('.att-cancel-btn') : [];
  buttons.forEach(b => b.disabled = true);

  try {
    if (typeof window.approveCancel !== 'function') {
      throw new Error('دالة approveCancel غير متوفرة — تأكد من تحميل event-rsvp.js');
    }

    const ok = await window.approveCancel(regId);

    if (ok) {
      alert('✅ تمت الموافقة على الطلب\n\nتم إرسال الإشعارات للزملاء والمستخدمين.');
      await loadAttendancePage(document.getElementById('contentArea'));
    } else {
      buttons.forEach(b => b.disabled = false);
    }
  } catch (err) {
    console.error('approveCancelRequest error:', err);
    alert('خطأ: ' + err.message);
    buttons.forEach(b => b.disabled = false);
  }
};

window.rejectCancelRequest = async function(regId) {
  if (!confirm('❌ هل تريد رفض طلب الإلغاء؟\n\nسيبقى الحضور مؤكدًا، ولن يستطيع صاحب الطلب تقديم طلب جديد.')) return;

  const item = document.querySelector(`[data-reg-id="${regId}"]`);
  const buttons = item ? item.querySelectorAll('.att-cancel-btn') : [];
  buttons.forEach(b => b.disabled = true);

  try {
    if (typeof window.rejectCancel !== 'function') {
      throw new Error('دالة rejectCancel غير متوفرة — تأكد من تحميل event-rsvp.js');
    }

    const ok = await window.rejectCancel(regId);

    if (ok) {
      alert('❌ تم رفض الطلب\n\nتم إشعار الشخص، وحضوره مؤكد.');
      await loadAttendancePage(document.getElementById('contentArea'));
    } else {
      buttons.forEach(b => b.disabled = false);
    }
  } catch (err) {
    console.error('rejectCancelRequest error:', err);
    alert('خطأ: ' + err.message);
    buttons.forEach(b => b.disabled = false);
  }
};

// ═══════════════════════════════════════════════════════
//   Render Table
// ═══════════════════════════════════════════════════════

function renderAttendanceTable() {
  const tbody = document.getElementById('attTableBody');
  const emptyState = document.getElementById('attEmptyState');
  const tableWrapper = document.querySelector('.att-table-wrapper');
  const pagination = document.getElementById('attPagination');

  if (!tbody) return;

  if (attFiltered.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (pagination) pagination.innerHTML = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  const isAdmin = ['Owner', 'Admin'].includes(attCurrentWorkspace);
  const totalPages = Math.ceil(attFiltered.length / ATT_PER_PAGE);
  const start = (attCurrentPage - 1) * ATT_PER_PAGE;
  const end = start + ATT_PER_PAGE;
  const pageData = attFiltered.slice(start, end);

  tbody.innerHTML = pageData.map(record => {
    const person = attPeople[record.PersonID];
    const event = attEvents[record.EventID] || attMeetings[record.EventID];
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ') : 'غير معروف');

    const personPhoto = person?.PhotoURL
      ? `<img src="${person.PhotoURL}" class="att-avatar" alt="" />`
      : `<div class="att-avatar-placeholder">${personName.charAt(0)}</div>`;

    let method = '';
    if (record.Method === 'self') {
      method = '<span class="att-badge self">📱 ذاتي</span>';
    } else if (record.Method === 'manual') {
      method = '<span class="att-badge manual">✍️ يدوي</span>';
    } else {
      method = '<span class="att-badge scanner">📷 ماسح</span>';
    }

    const dateStr = scanDate ? formatDateShort(scanDate) : '-';
    const timeStr = scanDate ? formatTimeShort(scanDate) : '-';
    const locationName = record.Location?.name || '-';

    const canDelete = isAdmin && record.Method === 'manual';

    return `
      <tr>
        <td>
          <div class="att-person-cell">
            ${personPhoto}
            <div>
              <div class="att-person-name">${escapeHtml(personName)}</div>
              <div class="att-person-id">${escapeHtml(person?.Mobile || '')}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="att-meeting-cell">
            <div class="att-meeting-title">${escapeHtml(event?.Title || record.EventTitle || record.MeetingTitle || '-')}</div>
          </div>
        </td>
        <td>${dateStr}</td>
        <td class="ltr">${timeStr}</td>
        <td>${method}</td>
        <td>${escapeHtml(locationName)}</td>
        <td>${escapeHtml(record.ManualByName || record.ScannerName || record.ScannerEmail || '-')}</td>
        <td class="actions-cell">
          ${canDelete ? `
            <button class="btn-icon danger" onclick="deleteManualAttendance('${record.id}')" title="حذف السجل اليدوي">🗑️</button>
          ` : '-'}
        </td>
      </tr>
    `;
  }).join('');

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('attPagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  html += `<button class="att-page-btn" onclick="attGoToPage(${attCurrentPage - 1})" ${attCurrentPage === 1 ? 'disabled' : ''}>« السابق</button>`;

  const pages = [];
  const maxVisible = 5;

  let start = Math.max(1, attCurrentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  pages.forEach(p => {
    html += `<button class="att-page-btn ${p === attCurrentPage ? 'active' : ''}" onclick="attGoToPage(${p})">${p}</button>`;
  });

  html += `<button class="att-page-btn" onclick="attGoToPage(${attCurrentPage + 1})" ${attCurrentPage === totalPages ? 'disabled' : ''}>التالي »</button>`;

  container.innerHTML = html;
}

window.attGoToPage = function(page) {
  if (page < 1) return;
  const totalPages = Math.ceil(attFiltered.length / ATT_PER_PAGE);
  if (page > totalPages) return;

  attCurrentPage = page;
  renderAttendanceTable();

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ═══════════════════════════════════════════════════════
//   Events
// ═══════════════════════════════════════════════════════

function setupAttendanceEvents() {
  const searchInput = document.getElementById('attSearchInput');
  const filterFrom = document.getElementById('attFilterFrom');
  const filterTo = document.getElementById('attFilterTo');
  const filterMeeting = document.getElementById('attFilterMeeting');
  const filterMethod = document.getElementById('attFilterMethod');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      attFilters.search = e.target.value.toLowerCase().trim();
      applyAttFilters();
    });
  }

  if (filterFrom) {
    filterFrom.onchange = (e) => {
      attFilters.dateFrom = e.target.value;
      applyAttFilters();
    };
  }

  if (filterTo) {
    filterTo.onchange = (e) => {
      attFilters.dateTo = e.target.value;
      applyAttFilters();
    };
  }

  if (filterMeeting) {
    filterMeeting.onchange = (e) => {
      attFilters.meetingId = e.target.value;
      applyAttFilters();
    };
  }

  if (filterMethod) {
    filterMethod.onchange = (e) => {
      attFilters.method = e.target.value;
      applyAttFilters();
    };
  }
}

function applyAttFilters() {
  const term = attFilters.search;

  attFiltered = attData.filter(record => {
    if (term) {
      const person = attPeople[record.PersonID];
      const personName = record.PersonName
        || (person ? [person.FirstName, person.SecondName].filter(Boolean).join(' ') : '');
      const eventTitle = attEvents[record.EventID]?.Title || record.EventTitle || '';

      const combined = (personName + ' ' + eventTitle).toLowerCase();
      if (!combined.includes(term)) return false;
    }

    if (attFilters.meetingId && record.EventID !== attFilters.meetingId) {
      return false;
    }

    if (attFilters.method) {
      const m = record.Method || 'scanner';
      if (m !== attFilters.method) return false;
    }

    if (attFilters.dateFrom || attFilters.dateTo) {
      const scanDate = parseDate(record.ScanTime);
      if (!scanDate) return false;

      const dateISO = formatDateISO(scanDate);

      if (attFilters.dateFrom && dateISO < attFilters.dateFrom) return false;
      if (attFilters.dateTo && dateISO > attFilters.dateTo) return false;
    }

    return true;
  });

  attCurrentPage = 1;
  renderAttendanceTable();
}

window.clearAttendanceFilters = function() {
  attFilters = {
    search: '',
    dateFrom: '',
    dateTo: '',
    meetingId: '',
    personId: '',
    method: ''
  };

  attFiltered = [...attData];
  attCurrentPage = 1;

  const area = document.getElementById('contentArea');
  renderAttendancePage(area);
};

// ═══════════════════════════════════════════════════════
//   ⚡ Manual Attendance — Open Modal
// ═══════════════════════════════════════════════════════

window.openManualAttendanceModal = function() {
  if (!['Owner', 'Admin'].includes(attCurrentWorkspace)) {
    alert('⚠️ غير مصرح لك');
    return;
  }

  manualSelectedPeople = [];
  manualSelectedEventId = null;

  let modal = document.getElementById('manualAttModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'manualAttModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const todayISO = formatDateISO(new Date());

  // ⚡ كل الناس (active + inactive)
  const allPeople = Object.values(attPeople).sort((a, b) => {
    const aN = [a.FirstName, a.SecondName].filter(Boolean).join(' ');
    const bN = [b.FirstName, b.SecondName].filter(Boolean).join(' ');
    return aN.localeCompare(bN, 'ar');
  });

  modal.innerHTML = `
    <div class="modal-content modal-large" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>➕ تسجيل حضور يدوي</h2>
        <button class="modal-close" onclick="closeManualAttModal()">✕</button>
      </div>

      <div class="modal-body" style="overflow-y:auto;flex:1;">

        <!-- ═══ 1. التاريخ ═══ -->
        <div class="form-row">
          <label>📅 التاريخ *</label>
          <input type="date" id="manual_Date" value="${todayISO}" max="${todayISO}" />
          <p class="hint">يمكن التسجيل خلال آخر ${ATT_MANUAL_MAX_DAYS} يوم</p>
        </div>

        <!-- ═══ 2. الأحداث ═══ -->
        <div class="form-row" id="manualEventsWrap" style="display:none;">
          <label>🎯 الحدث *</label>
          <div class="manual-events-container" id="manualEventsContainer"></div>
        </div>

        <!-- ═══ 3. الساعة ═══ -->
        <div class="form-row" id="manualTimeWrap" style="display:none;">
          <label>🕐 الساعة *</label>
          <input type="time" id="manual_Time" step="60" />
          <p class="hint" id="manual_TimeHint"></p>
        </div>

        <!-- ═══ 4. الأشخاص ═══ -->
        <div class="form-row">
          <label>👤 ابحث عن شخص *</label>
          <input type="text" id="manual_PersonSearch" placeholder="🔍 ابحث بالاسم أو الموبايل..." />

          <div class="manual-people-list" id="manualPeopleList">
            ${allPeople.slice(0, 20).map(p => renderManualPersonItem(p)).join('')}
          </div>
        </div>

        <div class="manual-selected-box" id="manualSelectedBox" style="display:none;">
          <div class="manual-selected-title">✅ المحددون (<span id="manualSelectedCount">0</span>)</div>
          <div class="manual-selected-list" id="manualSelectedList"></div>
        </div>

        <div class="form-row">
          <label>✍️ ملاحظة (اختياري)</label>
          <textarea id="manual_Note" rows="2" placeholder="مثال: نسى يسجل حضوره..."></textarea>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeManualAttModal()">إلغاء</button>
        <button class="btn-primary" id="manualSaveBtn" onclick="saveManualAttendance()">
          💾 تسجيل الحضور
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  // ⚡ Events
  const searchInput = document.getElementById('manual_PersonSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      renderManualPeopleList(allPeople, term);
    });
  }

  // ⚡ Date change
  const dateInput = document.getElementById('manual_Date');
  if (dateInput) {
    dateInput.onchange = () => onManualDateChange();
    onManualDateChange();
  }

  renderManualSelected();
};

// ═══════════════════════════════════════════════════════
//   ⚡ Manual — Date Change
// ═══════════════════════════════════════════════════════

function onManualDateChange() {
  const dateInput = document.getElementById('manual_Date');
  const eventsWrap = document.getElementById('manualEventsWrap');
  const eventsContainer = document.getElementById('manualEventsContainer');
  const timeWrap = document.getElementById('manualTimeWrap');

  if (!dateInput || !eventsWrap || !eventsContainer || !timeWrap) return;

  const dateISO = dateInput.value;
  manualSelectedEventId = null;

  if (!dateISO) {
    eventsWrap.style.display = 'none';
    timeWrap.style.display = 'none';
    return;
  }

  const eventsForDate = getEventsForDate(dateISO);

  eventsWrap.style.display = 'block';
  timeWrap.style.display = 'none';

  if (eventsForDate.weekly.length === 0 && eventsForDate.once.length === 0) {
    eventsContainer.innerHTML = `
      <div class="manual-no-events">
        📭 لا يوجد أحداث في هذا التاريخ
      </div>
    `;
    return;
  }

  let html = '';

  if (eventsForDate.weekly.length > 0) {
    html += `<div class="manual-events-group">
      <div class="manual-events-group-title">🔄 أحداث أسبوعية</div>
      ${eventsForDate.weekly.map(e => renderManualEventItem(e)).join('')}
    </div>`;
  }

  if (eventsForDate.once.length > 0) {
    html += `<div class="manual-events-group">
      <div class="manual-events-group-title">⭐ أحداث مرة واحدة</div>
      ${eventsForDate.once.map(e => renderManualEventItem(e)).join('')}
    </div>`;
  }

  eventsContainer.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
//   ⚡ Get Events For Date
// ═══════════════════════════════════════════════════════

function getEventsForDate(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];

  const weekly = [];
  const once = [];

  Object.values(attEvents).forEach(e => {
    // ⚡ بنعرض كل الأحداث (نشطة + غير نشطة) عشان الـAdmin يقدر يسجل حضور يدوي في أي حدث
    const type = String(e.Type || 'once').toLowerCase();

    if (type === 'weekly') {
      if (e.DayOfWeek === dayName) weekly.push(e);
    } else if (type === 'once') {
      if (e.Date === dateISO) once.push(e);
    }
  });

  weekly.sort((a, b) => String(a.Time || '').localeCompare(String(b.Time || '')));
  once.sort((a, b) => String(a.Time || '').localeCompare(String(b.Time || '')));

  return { weekly, once };
}
// ═══════════════════════════════════════════════════════
//   ⚡ Render Event Item
// ═══════════════════════════════════════════════════════

function renderManualEventItem(event) {
  const endTime = getEventEndTime(event);
  const isSelected = manualSelectedEventId === event.id;
  const isInactive = String(event.Status || 'active').toLowerCase() !== 'active';

  return `
    <div class="manual-event-item ${isSelected ? 'selected' : ''} ${isInactive ? 'inactive' : ''}"
         data-event-id="${event.id}"
         onclick="selectManualEvent('${event.id}')">
      <div class="manual-event-radio"></div>
      <div class="manual-event-info">
        <div class="manual-event-title">
          ${escapeHtml(event.Title || '')}
          ${isInactive ? '<span class="manual-event-inactive-badge">⏸️ معطّل</span>' : ''}
        </div>
        <div class="manual-event-time">🕐 ${event.Time || '-'} - ${endTime}</div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   ⚡ Select Manual Event
// ═══════════════════════════════════════════════════════

window.selectManualEvent = function(eventId) {
  manualSelectedEventId = eventId;

  document.querySelectorAll('.manual-event-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.eventId === eventId);
  });

  const event = attEvents[eventId];
  if (!event) return;

  showManualTimeField(event);
};

// ═══════════════════════════════════════════════════════
//   ⚡ Show Time Field with Limits
// ═══════════════════════════════════════════════════════

function showManualTimeField(event) {
  const timeWrap = document.getElementById('manualTimeWrap');
  const timeInput = document.getElementById('manual_Time');
  const timeHint = document.getElementById('manual_TimeHint');

  if (!timeWrap || !timeInput || !timeHint) return;

  const eventStartTime = event.Time || '00:00';
  const eventEndTime = getEventEndTime(event);

  const openBefore = Number(attSettings.OpenBeforeMinutes || 30);
  const closeAfter = Number(attSettings.CloseAfterMinutes || 15);

  const openTime = addMinutes(eventStartTime, -openBefore);
  const closeTime = addMinutes(eventEndTime, closeAfter);

  timeWrap.style.display = 'block';
  timeInput.min = openTime;
  timeInput.max = closeTime;
  timeInput.value = eventStartTime;

  timeHint.innerHTML = `
    💡 الوقت المسموح: <strong>${openTime}</strong> → <strong>${closeTime}</strong>
    <br><small>(فتح التسجيل قبل ${openBefore} دقيقة + إغلاق بعد ${closeAfter} دقيقة)</small>
  `;
}

// ═══════════════════════════════════════════════════════
//   ⚡ Time Helpers
// ═══════════════════════════════════════════════════════

function addMinutes(timeStr, minutes) {
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  let total = (h || 0) * 60 + (m || 0) + minutes;

  if (total < 0) total = 0;
  if (total > 1439) total = 1439;

  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ═══════════════════════════════════════════════════════
//   ⚡ Render Person Item
// ═══════════════════════════════════════════════════════

function renderManualPersonItem(person) {
  const name = [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ');
  const initial = (person.FirstName || '?').charAt(0);
  const isSelected = manualSelectedPeople.includes(person.id);
  const isInactive = String(person.Status || 'active').toLowerCase() !== 'active';

  const avatar = person.PhotoURL
    ? `<img src="${person.PhotoURL}" class="manual-person-avatar" alt="" />`
    : `<div class="manual-person-avatar-placeholder">${escapeHtml(initial)}</div>`;

  return `
    <div class="manual-person-item ${isSelected ? 'selected' : ''} ${isInactive ? 'inactive' : ''}"
         data-person-id="${person.id}"
         onclick="toggleManualPerson('${person.id}')">
      ${avatar}
      <div class="manual-person-info">
        <div class="manual-person-name">
          ${escapeHtml(name)}
          ${isInactive ? '<span class="manual-person-inactive-badge">معطل</span>' : ''}
        </div>
        <div class="manual-person-sub">${escapeHtml(person.Mobile || '')}</div>
      </div>
      <div class="manual-person-check">${isSelected ? '✅' : ''}</div>
    </div>
  `;
}

function renderManualPeopleList(peopleList, term = '') {
  const container = document.getElementById('manualPeopleList');
  if (!container) return;

  let filtered = peopleList;

  if (term) {
    filtered = peopleList.filter(p => {
      const name = [p.FirstName, p.SecondName, p.ThirdName, p.FourthName].filter(Boolean).join(' ').toLowerCase();
      const mobile = String(p.Mobile || '');
      return name.includes(term) || mobile.includes(term);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="manual-person-empty">لا يوجد نتائج</div>';
    return;
  }

  container.innerHTML = filtered.slice(0, 30).map(p => renderManualPersonItem(p)).join('');
}

window.toggleManualPerson = function(personId) {
  const idx = manualSelectedPeople.indexOf(personId);

  if (idx === -1) {
    manualSelectedPeople.push(personId);
  } else {
    manualSelectedPeople.splice(idx, 1);
  }

  const searchInput = document.getElementById('manual_PersonSearch');
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const allPeople = Object.values(attPeople).sort((a, b) => {
    const aN = [a.FirstName, a.SecondName].filter(Boolean).join(' ');
    const bN = [b.FirstName, b.SecondName].filter(Boolean).join(' ');
    return aN.localeCompare(bN, 'ar');
  });

  renderManualPeopleList(allPeople, term);
  renderManualSelected();
};

function renderManualSelected() {
  const box = document.getElementById('manualSelectedBox');
  const countEl = document.getElementById('manualSelectedCount');
  const listEl = document.getElementById('manualSelectedList');

  if (!box || !countEl || !listEl) return;

  if (manualSelectedPeople.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  countEl.textContent = manualSelectedPeople.length;

  listEl.innerHTML = manualSelectedPeople.map(pid => {
    const person = attPeople[pid];
    if (!person) return '';

    const name = [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ');

    return `
      <div class="manual-selected-chip">
        <span>${escapeHtml(name)}</span>
        <button type="button" onclick="event.stopPropagation(); toggleManualPerson('${pid}')">✕</button>
      </div>
    `;
  }).join('');
}

window.closeManualAttModal = function() {
  const modal = document.getElementById('manualAttModal');
  if (modal) modal.style.display = 'none';
  manualSelectedPeople = [];
  manualSelectedEventId = null;
};

// ═══════════════════════════════════════════════════════
//   ⚡ Manual Attendance — Save
// ═══════════════════════════════════════════════════════

window.saveManualAttendance = async function() {
  const eventId = manualSelectedEventId;
  const dateISO = document.getElementById('manual_Date')?.value;
  const timeStr = document.getElementById('manual_Time')?.value;
  const note = document.getElementById('manual_Note')?.value.trim() || '';

  if (!dateISO) { alert('⚠️ اختر التاريخ'); return; }
  if (!eventId) { alert('⚠️ اختر الحدث'); return; }
  if (!timeStr) { alert('⚠️ اختر الساعة'); return; }
  if (manualSelectedPeople.length === 0) { alert('⚠️ اختر شخص واحد على الأقل'); return; }

  // ⚡ تحقق من التاريخ
  const selectedDate = new Date(dateISO + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (selectedDate > today) {
    alert('⚠️ لا يمكن تسجيل حضور بتاريخ مستقبلي');
    return;
  }

  const daysDiff = Math.floor((today - selectedDate) / (1000 * 60 * 60 * 24));
  if (daysDiff > ATT_MANUAL_MAX_DAYS) {
    alert(`⚠️ لا يمكن تسجيل حضور قبل ${ATT_MANUAL_MAX_DAYS} يوم`);
    return;
  }

  const event = attEvents[eventId];
  if (!event) {
    alert('⚠️ الحدث غير موجود');
    return;
  }

  // ⚡ التحقق من الوقت
  const eventStartTime = event.Time || '00:00';
  const eventEndTime = getEventEndTime(event);

  const openBefore = Number(attSettings.OpenBeforeMinutes || 30);
  const closeAfter = Number(attSettings.CloseAfterMinutes || 15);

  const openTime = addMinutes(eventStartTime, -openBefore);
  const closeTime = addMinutes(eventEndTime, closeAfter);

  const timeMinutes = timeToMinutes(timeStr);
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);

  if (timeMinutes < openMinutes || timeMinutes > closeMinutes) {
    alert(
      `⚠️ الساعة خارج نطاق التسجيل المسموح\n\n` +
      `🕐 الوقت المسموح: ${openTime} → ${closeTime}\n` +
      `🕐 الوقت المختار: ${timeStr}`
    );
    return;
  }

  const saveBtn = document.getElementById('manualSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ جاري التسجيل...';
  }

  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  const manualByName = attCurrentUser?.name || attCurrentUser?.email || '';

  for (const personId of manualSelectedPeople) {
    try {
      const dupQ = query(
        collection(db, COLLECTIONS.ATTENDANCE),
        where('PersonID', '==', personId),
        where('EventID', '==', eventId),
        where('OccurrenceDate', '==', dateISO)
      );
      const dupSnap = await getDocs(dupQ);

      if (!dupSnap.empty) {
        duplicateCount++;
        continue;
      }

      const person = attPeople[personId];
      const personName = person
        ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ')
        : 'غير معروف';

      const scanTime = new Date(dateISO + 'T' + timeStr + ':00').toISOString();

      await addDoc(collection(db, COLLECTIONS.ATTENDANCE), {
        PersonID: personId,
        PersonName: personName,
        EventID: eventId,
        EventTitle: event.Title || '',
        EventTypeID: event.EventTypeID || '',
        OccurrenceDate: dateISO,
        ScanTime: scanTime,
        Status: 'present',
        Method: 'manual',
        ManualBy: attCurrentUser?.email || '',
        ManualByName: manualByName,
        ManualAt: new Date().toISOString(),
        Note: note,
        Location: {
          id: 'manual',
          name: 'تسجيل يدوي',
          lat: null,
          lng: null,
          accuracy: null
        }
      });

      successCount++;

      if (typeof window.logAction === 'function') {
        try {
          await window.logAction({
            action: 'manual_attendance_added',
            type: 'attendance',
            title: `تسجيل حضور يدوي: ${personName}`,
            description: `الحدث: ${event.Title || ''} — التاريخ: ${dateISO} ${timeStr}`,
            relatedID: eventId,
            relatedTitle: event.Title || ''
          });
        } catch (e) {}
      }

    } catch (err) {
      console.error('❌ Manual attendance error for', personId, ':', err);
      errorCount++;
    }
  }

  let msg = `✅ تم التسجيل بنجاح\n\n`;
  msg += `✔️ مسجّلين: ${successCount}\n`;
  if (duplicateCount > 0) msg += `⚠️ مسجّلين مسبقًا: ${duplicateCount}\n`;
  if (errorCount > 0) msg += `❌ فشل: ${errorCount}\n`;

  alert(msg);

  closeManualAttModal();

  await loadAttendancePage(document.getElementById('contentArea'));
};

// ═══════════════════════════════════════════════════════
//   ⚡ Delete Manual Attendance
// ═══════════════════════════════════════════════════════

window.deleteManualAttendance = async function(recordId) {
  if (!['Owner', 'Admin'].includes(attCurrentWorkspace)) {
    alert('⚠️ غير مصرح لك');
    return;
  }

  const record = attData.find(r => r.id === recordId);
  if (!record) {
    alert('❌ السجل غير موجود');
    return;
  }

  const person = attPeople[record.PersonID];
  const personName = record.PersonName
    || (person ? [person.FirstName, person.SecondName].filter(Boolean).join(' ') : 'غير معروف');

  if (!confirm(`⚠️ حذف سجل الحضور اليدوي؟\n\n👤 ${personName}\n🎯 ${record.EventTitle || ''}\n📅 ${record.OccurrenceDate || ''}`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, COLLECTIONS.ATTENDANCE, recordId));

    if (typeof window.logAction === 'function') {
      try {
        await window.logAction({
          action: 'manual_attendance_deleted',
          type: 'attendance',
          title: `حذف سجل حضور يدوي: ${personName}`,
          description: `الحدث: ${record.EventTitle || ''}`,
          relatedID: recordId,
          relatedTitle: personName
        });
      } catch (e) {}
    }

    alert('✅ تم الحذف بنجاح');
    await loadAttendancePage(document.getElementById('contentArea'));
  } catch (err) {
    console.error('❌ Delete manual attendance error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   Export CSV
// ═══════════════════════════════════════════════════════

window.exportAttendanceCSV = function() {
  if (attFiltered.length === 0) {
    alert('لا يوجد بيانات للتصدير');
    return;
  }

  const headers = ['الاسم', 'الموبايل', 'الحدث', 'التاريخ', 'الوقت', 'الطريقة', 'الموقع', 'بواسطة'];

  const rows = attFiltered.map(record => {
    const person = attPeople[record.PersonID];
    const event = attEvents[record.EventID] || attMeetings[record.EventID];
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ') : 'غير معروف');

    let method = 'ماسح';
    if (record.Method === 'self') method = 'تسجيل ذاتي';
    else if (record.Method === 'manual') method = 'يدوي';

    return [
      personName,
      person?.Mobile || '',
      event?.Title || record.EventTitle || '',
      scanDate ? formatDateShort(scanDate) : '',
      scanDate ? formatTimeShort(scanDate) : '',
      method,
      record.Location?.name || '',
      record.ManualByName || record.ScannerName || record.ScannerEmail || ''
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `attendance_${formatDateISO(new Date())}.csv`);
  link.click();
};

// ═══════════════════════════════════════════════════════
//   Export PDF
// ═══════════════════════════════════════════════════════

window.exportAttendancePDF = function() {
  if (attFiltered.length === 0) {
    alert('لا يوجد بيانات للتصدير');
    return;
  }

  const organizationName = attSettings.OrganizationName || 'نظام تسجيل الحضور';
  const logoUrl = attSettings.ThemeLogoUrl || '';

  let currentUserName = '';
  try {
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    currentUserName = cu?.name || cu?.email || '';
  } catch (e) {}

  let dateRangeText = 'كل السجلات';
  if (attFilters.dateFrom || attFilters.dateTo) {
    const from = attFilters.dateFrom || 'البداية';
    const to = attFilters.dateTo || 'اليوم';
    dateRangeText = `من ${from} إلى ${to}`;
  }

  let filterInfo = '';
  if (attFilters.meetingId) {
    const eventTitle = attEvents[attFilters.meetingId]?.Title || '';
    filterInfo += ` • الحدث: ${eventTitle}`;
  }
  if (attFilters.method) {
    let methodText = 'ماسح';
    if (attFilters.method === 'self') methodText = 'تسجيل ذاتي';
    else if (attFilters.method === 'manual') methodText = 'يدوي';
    filterInfo += ` • النوع: ${methodText}`;
  }
  if (attFilters.search) {
    filterInfo += ` • بحث: "${attFilters.search}"`;
  }

  const now = new Date();
  const nowText = `${formatDateShort(now)} ${formatTimeShort(now)}`;

  const logoHtml = logoUrl ? `<img src="${logoUrl}" class="pdf-logo" alt="" />` : '';

  const rowsHtml = attFiltered.map((record, idx) => {
    const person = attPeople[record.PersonID];
    const event = attEvents[record.EventID] || attMeetings[record.EventID];
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ') : 'غير معروف');

    let methodText = 'ماسح';
    if (record.Method === 'self') methodText = 'ذاتي';
    else if (record.Method === 'manual') methodText = 'يدوي';

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(personName)}</td>
        <td>${escapeHtml(person?.Mobile || '-')}</td>
        <td>${escapeHtml(event?.Title || record.EventTitle || '-')}</td>
        <td>${scanDate ? formatDateShort(scanDate) : '-'}</td>
        <td>${scanDate ? formatTimeShort(scanDate) : '-'}</td>
        <td>${methodText}</td>
        <td>${escapeHtml(record.Location?.name || '-')}</td>
      </tr>
    `;
  }).join('');

  const reportHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير الحضور</title>
      <style>
        @page { size: A4 landscape; margin: 15mm 10mm; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', 'Tahoma', 'Arial', sans-serif;
          direction: rtl;
          color: #0f172a;
          margin: 0;
          padding: 0;
          font-size: 12px;
        }
        .pdf-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 15px;
          border-bottom: 3px solid #475569;
          margin-bottom: 20px;
          gap: 20px;
        }
        .pdf-logo { max-height: 70px; max-width: 150px; object-fit: contain; }
        .pdf-title { font-size: 24px; font-weight: 800; margin: 0 0 5px 0; color: #1e293b; }
        .pdf-subtitle { font-size: 14px; color: #64748b; margin: 0; }
        .pdf-meta {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          background: #f8fafc;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px solid #e2e8f0;
        }
        .pdf-meta-item { font-size: 12px; color: #475569; }
        .pdf-meta-item strong { color: #0f172a; }
        .pdf-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .pdf-table thead { background: #1e293b; color: #fff; }
        .pdf-table th {
          padding: 10px 8px;
          text-align: right;
          font-weight: 700;
          font-size: 11px;
          border: 1px solid #1e293b;
        }
        .pdf-table td {
          padding: 8px;
          border: 1px solid #e2e8f0;
          text-align: right;
          vertical-align: middle;
        }
        .pdf-table tbody tr:nth-child(even) { background: #f8fafc; }
        .pdf-footer {
          margin-top: 20px;
          padding-top: 12px;
          border-top: 1px solid #cbd5e1;
          font-size: 10px;
          color: #64748b;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }
        .pdf-count {
          background: #475569;
          color: #fff;
          padding: 3px 10px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 11px;
        }
        @media print {
          body { margin: 0; }
          .pdf-table tbody tr { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>

      <div class="pdf-header">
        <div>
          <h1 class="pdf-title">تقرير الحضور</h1>
          <p class="pdf-subtitle">${escapeHtml(organizationName)}</p>
        </div>
        <div>${logoHtml}</div>
      </div>

      <div class="pdf-meta">
        <div class="pdf-meta-item"><strong>النطاق:</strong> ${escapeHtml(dateRangeText)}${escapeHtml(filterInfo)}</div>
        <div class="pdf-meta-item"><strong>عدد السجلات:</strong> ${attFiltered.length}</div>
      </div>

      <table class="pdf-table">
        <thead>
          <tr>
            <th>#</th>
            <th>الاسم</th>
            <th>الموبايل</th>
            <th>الحدث</th>
            <th>التاريخ</th>
            <th>الوقت</th>
            <th>الطريقة</th>
            <th>الموقع</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="pdf-footer">
        <div>تم الإنشاء: ${nowText}</div>
        <div>
          <span class="pdf-count">${attFiltered.length} سجل</span>
          ${currentUserName ? ` • بواسطة: ${escapeHtml(currentUserName)}` : ''}
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 500);
          window.onafterprint = function() {
            setTimeout(function() { window.close(); }, 500);
          };
        };
      <\/script>

    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) {
    alert('الرجاء السماح بالنوافذ المنبثقة لتصدير PDF');
    return;
  }

  win.document.open();
  win.document.write(reportHtml);
  win.document.close();
};

// ═══════════════════════════════════════════════════════
//   Counters
// ═══════════════════════════════════════════════════════

function countToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return attData.filter(r => {
    const d = parseDate(r.ScanTime);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;
}

function countThisWeek() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return attData.filter(r => {
    const d = parseDate(r.ScanTime);
    if (!d) return false;
    return d >= startOfWeek;
  }).length;
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function parseDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateShort(date) {
  if (!date) return '-';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function formatTimeShort(date) {
  if (!date) return '-';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} يوم`;
  return formatDateShort(date);
}

function getEventEndTime(event) {
  if (!event) return '';
  if (event.EndTime) return String(event.EndTime);

  const time = String(event.Time || '00:00');
  const [h, m] = time.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + 120;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
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

window.loadAttendancePage = loadAttendancePage;
