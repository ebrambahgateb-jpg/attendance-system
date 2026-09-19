// ═══════════════════════════════════════════════════════
//   Attendance Viewer (عرض سجل الحضور)
// ═══════════════════════════════════════════════════════

import {
  collection,
  getDocs,
  doc,
  getDoc
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
let attCurrentPage = 1;
let attSettings = {};
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
    const [attSnap, peopleSnap, meetingsSnap, settingsDoc] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.ATTENDANCE)),
      getDocs(collection(db, COLLECTIONS.PEOPLE)),
      getDocs(collection(db, COLLECTIONS.MEETINGS)),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC))
    ]);

    attData = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    attSettings = settingsDoc.exists() ? settingsDoc.data() : {};

    attPeople = {};
    peopleSnap.docs.forEach(d => {
      attPeople[d.id] = { id: d.id, ...d.data() };
    });

    attMeetings = {};
    meetingsSnap.docs.forEach(d => {
      attMeetings[d.id] = { id: d.id, ...d.data() };
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
    <div class="att-container">

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
          <label>الاجتماع</label>
          <select id="attFilterMeeting">
            <option value="">الكل</option>
            ${Object.values(attMeetings).map(m => `
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
              <th>الاجتماع</th>
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
    const meeting = attMeetings[record.MeetingID];
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
            <div class="att-meeting-title">${escapeHtml(meeting?.Title || record.MeetingTitle || '-')}</div>
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
      const meetingTitle = attMeetings[record.MeetingID]?.Title || record.MeetingTitle || '';

      const combined = (personName + ' ' + meetingTitle).toLowerCase();
      if (!combined.includes(term)) return false;
    }

    if (attFilters.meetingId && record.MeetingID !== attFilters.meetingId) {
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

  const headers = ['الاسم', 'الموبايل', 'الاجتماع', 'التاريخ', 'الوقت', 'الطريقة', 'الموقع', 'بواسطة'];

  const rows = attFiltered.map(record => {
    const person = attPeople[record.PersonID];
    const meeting = attMeetings[record.MeetingID];
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ') : 'غير معروف');

    return [
      personName,
      person?.Mobile || '',
      meeting?.Title || record.MeetingTitle || '',
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

  // ⚡ اجلب اسم المؤسسة من الإعدادات
  const organizationName = attSettings.OrganizationName || 'نظام تسجيل الحضور';
  const systemName = attSettings.SystemName || '';
  const logoUrl = attSettings.ThemeLogoUrl || '';

  // ⚡ اجلب اسم المستخدم الحالي
  let currentUserName = '';
  try {
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    currentUserName = cu?.name || cu?.email || '';
  } catch (e) {}

  // ⚡ نطاق التاريخ
  let dateRangeText = 'كل السجلات';
  if (attFilters.dateFrom || attFilters.dateTo) {
    const from = attFilters.dateFrom || 'البداية';
    const to = attFilters.dateTo || 'اليوم';
    dateRangeText = `من ${from} إلى ${to}`;
  }

  // ⚡ فلتر إضافي
  let filterInfo = '';
  if (attFilters.meetingId) {
    const meetingTitle = attMeetings[attFilters.meetingId]?.Title || '';
    filterInfo += ` • الاجتماع: ${meetingTitle}`;
  }
  if (attFilters.method) {
    filterInfo += ` • النوع: ${attFilters.method === 'self' ? 'تسجيل ذاتي' : 'ماسح'}`;
  }
  if (attFilters.search) {
    filterInfo += ` • بحث: "${attFilters.search}"`;
  }

  // ⚡ التاريخ والوقت الحالي
  const now = new Date();
  const nowText = `${formatDateShort(now)} ${formatTimeShort(now)}`;

  // ⚡ JPG أو PNG للـLogo
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" class="pdf-logo" alt="" />`
    : '';

  // ⚡ ابنِ صفوف الجدول
  const rowsHtml = attFiltered.map((record, idx) => {
    const person = attPeople[record.PersonID];
    const meeting = attMeetings[record.MeetingID];
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? [person.FirstName, person.SecondName, person.ThirdName, person.FourthName].filter(Boolean).join(' ') : 'غير معروف');

    const methodText = record.Method === 'self' ? 'ذاتي' : 'ماسح';

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(personName)}</td>
        <td>${escapeHtml(person?.Mobile || '-')}</td>
        <td>${escapeHtml(meeting?.Title || record.MeetingTitle || '-')}</td>
        <td>${scanDate ? formatDateShort(scanDate) : '-'}</td>
        <td>${scanDate ? formatTimeShort(scanDate) : '-'}</td>
        <td>${methodText}</td>
        <td>${escapeHtml(record.Location?.name || '-')}</td>
      </tr>
    `;
  }).join('');

  // ⚡ HTML التقرير
  const reportHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير الحضور</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 15mm 10mm;
        }

        * {
          box-sizing: border-box;
        }

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

        .pdf-header-left {
          flex: 1;
        }

        .pdf-header-right {
          flex-shrink: 0;
        }

        .pdf-logo {
          max-height: 70px;
          max-width: 150px;
          object-fit: contain;
        }

        .pdf-title {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 5px 0;
          color: #1e293b;
        }

        .pdf-subtitle {
          font-size: 14px;
          color: #64748b;
          margin: 0;
        }

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

        .pdf-meta-item {
          font-size: 12px;
          color: #475569;
        }

        .pdf-meta-item strong {
          color: #0f172a;
        }

        .pdf-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .pdf-table thead {
          background: #1e293b;
          color: #fff;
        }

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

        .pdf-table tbody tr:nth-child(even) {
          background: #f8fafc;
        }

        .pdf-table tbody tr:hover {
          background: #f1f5f9;
        }

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

        .pdf-footer-left,
        .pdf-footer-right {
          flex: 1;
        }

        .pdf-footer-right {
          text-align: left;
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
        <div class="pdf-header-left">
          <h1 class="pdf-title">تقرير الحضور</h1>
          <p class="pdf-subtitle">${escapeHtml(organizationName)}</p>
        </div>
        <div class="pdf-header-right">
          ${logoHtml}
        </div>
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
            <th>الاجتماع</th>
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
        <div class="pdf-footer-left">
          تم الإنشاء: ${nowText}
        </div>
        <div class="pdf-footer-right">
          <span class="pdf-count">${attFiltered.length} سجل</span>
          ${currentUserName ? ` • بواسطة: ${escapeHtml(currentUserName)}` : ''}
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);

          window.onafterprint = function() {
            setTimeout(function() {
              window.close();
            }, 500);
          };
        };
      <\/script>

    </body>
    </html>
  `;

  // ⚡ افتح نافذة جديدة
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
