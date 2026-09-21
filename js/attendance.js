// ═══════════════════════════════════════════════════════
//   Attendance Viewer (عرض سجل الحضور + طلبات الإلغاء)
// ═══════════════════════════════════════════════════════

import {
  collection,
  getDocs,
  doc,
  getDoc,
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

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadAttendancePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
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

    // ⚡ طلبات الإلغاء
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
  area.innerHTML = `
    <style>
      /* ═══ Cancel Requests Section ═══ */
      .att-cancel-section {
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border: 2px solid #f59e0b;
        border-radius: 14px;
        padding: 16px 18px;
        margin-bottom: 20px;
      }

      .att-cancel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        gap: 10px;
        flex-wrap: wrap;
      }

      .att-cancel-title {
        font-size: 16px;
        font-weight: 800;
        color: #92400e;
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
      }

      .att-cancel-count {
        background: #dc2626;
        color: #fff;
        font-size: 12px;
        padding: 3px 10px;
        border-radius: 12px;
        font-weight: 700;
      }

      .att-cancel-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .att-cancel-item {
        background: #fff;
        border-radius: 12px;
        padding: 14px 16px;
        border: 1px solid #fcd34d;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        flex-wrap: wrap;
      }

      .att-cancel-info {
        flex: 1;
        min-width: 220px;
      }

      .att-cancel-name {
        font-size: 15px;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .att-cancel-line {
        font-size: 13px;
        color: #475569;
        margin: 4px 0;
        line-height: 1.5;
      }

      .att-cancel-line strong {
        color: #0f172a;
      }

      .att-cancel-reason {
        background: #fef2f2;
        border-right: 3px solid #dc2626;
        padding: 8px 12px;
        border-radius: 8px;
        margin-top: 8px;
        font-size: 13px;
        color: #7f1d1d;
      }

      .att-cancel-reason-label {
        font-weight: 700;
        color: #991b1b;
        display: block;
        margin-bottom: 3px;
        font-size: 12px;
      }

      .att-cancel-time {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 6px;
        font-weight: 600;
      }

      .att-cancel-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-self: center;
      }

      .att-cancel-btn {
        padding: 10px 18px;
        border-radius: 10px;
        border: none;
        font-size: 13px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }

      .att-cancel-btn.approve {
        background: #16a34a;
        color: #fff;
      }

      .att-cancel-btn.approve:hover {
        background: #15803d;
        transform: translateY(-1px);
      }

      .att-cancel-btn.reject {
        background: #fff;
        color: #dc2626;
        border: 1px solid #fecaca;
      }

      .att-cancel-btn.reject:hover {
        background: #dc2626;
        color: #fff;
        border-color: #dc2626;
      }

      .att-cancel-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      @media (max-width: 600px) {
        .att-cancel-item {
          flex-direction: column;
        }
        .att-cancel-actions {
          width: 100%;
        }
        .att-cancel-btn {
          flex: 1;
        }
      }
    </style>

    <div class="att-container">

      ${renderCancelRequestsSection()}

      <div class="att-header">
        <div class="att-search">
          <input type="text" id="attSearchInput" placeholder="🔍 ابحث بالاسم أو الاجتماع..." value="${escapeHtml(attFilters.search)}" />
        </div>
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

    const method = record.Method === 'self'
      ? '<span class="att-badge self">📱 ذاتي</span>'
      : '<span class="att-badge scanner">📷 ماسح</span>';

    const dateStr = scanDate ? formatDateShort(scanDate) : '-';
    const timeStr = scanDate ? formatTimeShort(scanDate) : '-';

    const locationName = record.Location?.name || '-';

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
        <td>${escapeHtml(record.ScannerName || record.ScannerEmail || '-')}</td>
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

    return [
      personName,
      person?.Mobile || '',
      event?.Title || record.EventTitle || '',
      scanDate ? formatDateShort(scanDate) : '',
      scanDate ? formatTimeShort(scanDate) : '',
      record.Method === 'self' ? 'تسجيل ذاتي' : 'ماسح',
      record.Location?.name || '',
      record.ScannerName || record.ScannerEmail || ''
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
//   Export PDF (Print Dialog)
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
    filterInfo += ` • النوع: ${attFilters.method === 'self' ? 'تسجيل ذاتي' : 'ماسح'}`;
  }
  if (attFilters.search) {
    filterInfo += ` • بحث: "${attFilters.search}"`;
  }

  const now = new Date();
  const nowText = `${formatDateShort(now)} ${formatTimeShort(now)}`;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" class="pdf-logo" alt="" />`
    : '';

  const rowsHtml = attFiltered.map((record, idx) => {
    const person = attPeople[record.PersonID];
    const event = attEvents[record.EventID] || attMeetings[record.EventID];
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ') : 'غير معروف');

    const methodText = record.Method === 'self' ? 'ذاتي' : 'ماسح';

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
