// ═══════════════════════════════════════════════════════
//   Reports (التقارير) — Charts + إحصائيات
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC
} from './firebase-config.js';

// ═══ State ═══
let rptUser = null;
let rptWorkspace = null;
let rptPeople = [];
let rptEvents = [];
let rptAttendance = [];
let rptEventTypes = [];
let rptSettings = {};

let rptFilters = {
  dateFrom: '',
  dateTo: ''
};

// ═══ Charts instances ═══
let chartAttendance7Days = null;
let chartByType = null;

// ═══ الألوان ═══
const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadReportsPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    rptUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!rptUser) {
      window.location.href = '../index.html';
      return;
    }
    rptWorkspace = rptUser.currentWorkspace || rptUser.selectedRole || 'User';

    // ⚡ افتراضي: آخر 30 يوم
    if (!rptFilters.dateFrom) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      rptFilters.dateFrom = formatDateISO(d);
    }
    if (!rptFilters.dateTo) {
      rptFilters.dateTo = formatDateISO(new Date());
    }

    // ⚡ اجلب البيانات
    const [peopleSnap, eventsSnap, attendanceSnap, typesSnap, settingsDoc] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.PEOPLE)).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'events')).catch(() => ({ docs: [] })),
      getDocs(collection(db, COLLECTIONS.ATTENDANCE)).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'eventTypes')).catch(() => ({ docs: [] })),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC)).catch(() => null)
    ]);

    rptPeople = peopleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rptEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rptAttendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rptEventTypes = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rptSettings = settingsDoc && settingsDoc.exists() ? settingsDoc.data() : {};

    renderReportsPage(area);

    // ⚡ ارسم الـCharts بعد ما الـDOM يكون جاهز
    setTimeout(() => {
      renderAttendance7DaysChart();
      renderByTypeChart();
    }, 100);
  } catch (err) {
    console.error('❌ Load reports error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadReportsPage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderReportsPage(area) {
  // ⚡ فلتر الحضور حسب التاريخ
  const filteredAttendance = getFilteredAttendance();

  // ⚡ إحصائيات
  const activePeople = rptPeople.filter(p => String(p.Status || '').toLowerCase() === 'active').length;
  const activeEvents = rptEvents.filter(e => String(e.Status || '').toLowerCase() === 'active').length;
  const totalAttendance = filteredAttendance.length;

  // ⚡ نسبة الحضور (تقريبي)
  const attendedPersonIds = new Set(filteredAttendance.map(a => a.PersonID));
  const attendanceRate = activePeople > 0
    ? Math.round((attendedPersonIds.size / activePeople) * 100)
    : 0;

  area.innerHTML = `
    <div class="rpt-container">

      <!-- ═══ فلاتر ═══ -->
      <div class="rpt-filters">
        <div class="rpt-filter-group">
          <label>📅 من تاريخ</label>
          <input type="date" id="rptDateFrom" value="${rptFilters.dateFrom}" />
        </div>
        <div class="rpt-filter-group">
          <label>📅 إلى تاريخ</label>
          <input type="date" id="rptDateTo" value="${rptFilters.dateTo}" />
        </div>
        <button class="btn-primary" onclick="applyReportsFilters()">تطبيق</button>
        <button class="btn-secondary" onclick="resetReportsFilters()">إعادة تعيين</button>
        <div class="rpt-export-group">
          <button class="btn-secondary" onclick="exportReportsCSV()">📥 CSV</button>
          <button class="btn-primary" onclick="exportReportsPDF()">📄 PDF</button>
        </div>
      </div>

      <!-- ═══ إحصائيات سريعة ═══ -->
      <div class="rpt-stats">
        <div class="rpt-stat">
          <div class="rpt-stat-icon">👥</div>
          <div class="rpt-stat-info">
            <div class="rpt-stat-value">${activePeople}</div>
            <div class="rpt-stat-label">شخص نشط</div>
          </div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-icon">🎯</div>
          <div class="rpt-stat-info">
            <div class="rpt-stat-value">${activeEvents}</div>
            <div class="rpt-stat-label">حدث نشط</div>
          </div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-icon">✅</div>
          <div class="rpt-stat-info">
            <div class="rpt-stat-value">${totalAttendance}</div>
            <div class="rpt-stat-label">سجل حضور</div>
          </div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-icon">📈</div>
          <div class="rpt-stat-info">
            <div class="rpt-stat-value">${attendanceRate}%</div>
            <div class="rpt-stat-label">نسبة الحضور</div>
          </div>
        </div>
      </div>

      <!-- ═══ Chart: الحضور آخر 7 أيام ═══ -->
      <div class="rpt-section">
        <h3 class="rpt-section-title">📊 الحضور في آخر 7 أيام</h3>
        <div class="rpt-chart-container">
          <canvas id="rptChart7Days"></canvas>
        </div>
      </div>

      <!-- ═══ Chart: الحضور حسب النوع ═══ -->
      <div class="rpt-section">
        <h3 class="rpt-section-title">🥧 الحضور حسب نوع الحدث</h3>
        <div class="rpt-chart-container rpt-chart-pie">
          <canvas id="rptChartByType"></canvas>
        </div>
      </div>

      <!-- ═══ أكثر 10 أشخاص حضورًا ═══ -->
      <div class="rpt-section">
        <h3 class="rpt-section-title">🏆 أكثر 10 أشخاص حضورًا</h3>
        <div class="rpt-top-list">
          ${renderTopAttendees(filteredAttendance)}
        </div>
      </div>

    </div>
  `;

  setupReportsEvents();
}

// ═══════════════════════════════════════════════════════
//   Top Attendees
// ═══════════════════════════════════════════════════════

function renderTopAttendees(attendanceList) {
  // ⚡ احسب عدد الحضور لكل شخص
  const countByPerson = {};
  attendanceList.forEach(a => {
    if (!a.PersonID) return;
    countByPerson[a.PersonID] = (countByPerson[a.PersonID] || 0) + 1;
  });

  // ⚡ رتب
  const sorted = Object.entries(countByPerson)
    .map(([personId, count]) => ({ personId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (sorted.length === 0) {
    return '<div class="rpt-empty">لا يوجد بيانات</div>';
  }

  const maxCount = sorted[0].count;

  return sorted.map((item, idx) => {
    const person = rptPeople.find(p => p.id === item.personId);
    const name = person ? getPersonFullName(person) : 'غير معروف';
    const initial = (person?.FirstName || name || '?').charAt(0);

    const photoHtml = person?.PhotoURL
      ? `<img src="${person.PhotoURL}" alt="" class="rpt-person-photo" />`
      : `<div class="rpt-person-photo-placeholder">${escapeHtml(initial)}</div>`;

    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
    const barWidth = (item.count / maxCount) * 100;

    return `
      <div class="rpt-person-row">
        <div class="rpt-person-rank">${medal}</div>
        ${photoHtml}
        <div class="rpt-person-info">
          <div class="rpt-person-name">${escapeHtml(name)}</div>
          <div class="rpt-person-bar">
            <div class="rpt-person-bar-fill" style="width: ${barWidth}%"></div>
          </div>
        </div>
        <div class="rpt-person-count">${item.count}</div>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//   Charts
// ═══════════════════════════════════════════════════════

function renderAttendance7DaysChart() {
  const canvas = document.getElementById('rptChart7Days');
  if (!canvas || typeof Chart === 'undefined') return;

  // ⚡ آخر 7 أيام
  const days = [];
  const counts = [];
  const labels = [];

  const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);

    const dateISO = formatDateISO(d);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);

    const count = rptAttendance.filter(a => {
      const scanDate = parseDate(a.ScanTime);
      if (!scanDate) return false;
      return scanDate >= d && scanDate < nextDay;
    }).length;

    days.push(dateISO);
    counts.push(count);
    labels.push(`${DAYS_AR[d.getDay()]} ${d.getDate()}`);
  }

  // ⚡ امسح القديم
  if (chartAttendance7Days) chartAttendance7Days.destroy();

  chartAttendance7Days = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'عدد الحضور',
        data: counts,
        backgroundColor: '#3b82f6',
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `عدد الحضور: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function renderByTypeChart() {
  const canvas = document.getElementById('rptChartByType');
  if (!canvas || typeof Chart === 'undefined') return;

  // ⚡ احسب الحضور حسب نوع الحدث
  const countByType = {};

  rptAttendance.forEach(a => {
    const event = rptEvents.find(e => e.id === a.EventID);
    if (!event) return;
    const typeId = event.EventTypeID || 'other';
    countByType[typeId] = (countByType[typeId] || 0) + 1;
  });

  const labels = [];
  const data = [];
  const colors = [];

  Object.entries(countByType).forEach(([typeId, count], idx) => {
    const type = rptEventTypes.find(t => t.id === typeId);
    const label = type ? `${type.Icon || '📅'} ${type.Name}` : 'نوع آخر';
    labels.push(label);
    data.push(count);
    colors.push(CHART_COLORS[idx % CHART_COLORS.length]);
  });

  if (data.length === 0) {
    labels.push('لا يوجد بيانات');
    data.push(0);
    colors.push('#cbd5e1');
  }

  if (chartByType) chartByType.destroy();

  chartByType = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 13, family: 'inherit' },
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed}`
          }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
//   Filters
// ═══════════════════════════════════════════════════════

function setupReportsEvents() {
  // ⚡ مفيش حاجة — بنستخدم onclick
}

function getFilteredAttendance() {
  const from = rptFilters.dateFrom;
  const to = rptFilters.dateTo;

  return rptAttendance.filter(a => {
    const scanDate = parseDate(a.ScanTime);
    if (!scanDate) return false;

    const dateISO = formatDateISO(scanDate);
    if (from && dateISO < from) return false;
    if (to && dateISO > to) return false;

    return true;
  });
}

window.applyReportsFilters = function() {
  const from = document.getElementById('rptDateFrom')?.value || '';
  const to = document.getElementById('rptDateTo')?.value || '';

  rptFilters.dateFrom = from;
  rptFilters.dateTo = to;

  const area = document.getElementById('contentArea');
  renderReportsPage(area);

  setTimeout(() => {
    renderAttendance7DaysChart();
    renderByTypeChart();
  }, 100);
};

window.resetReportsFilters = function() {
  const d = new Date();
  d.setDate(d.getDate() - 30);

  rptFilters.dateFrom = formatDateISO(d);
  rptFilters.dateTo = formatDateISO(new Date());

  const area = document.getElementById('contentArea');
  renderReportsPage(area);

  setTimeout(() => {
    renderAttendance7DaysChart();
    renderByTypeChart();
  }, 100);
};

// ═══════════════════════════════════════════════════════
//   Export CSV
// ═══════════════════════════════════════════════════════

window.exportReportsCSV = function() {
  const filteredAttendance = getFilteredAttendance();

  if (filteredAttendance.length === 0) {
    alert('لا يوجد بيانات للتصدير');
    return;
  }

  const headers = ['#', 'الاسم', 'الحدث', 'نوع الحدث', 'التاريخ', 'الوقت', 'الطريقة'];

  const rows = filteredAttendance.map((record, idx) => {
    const person = rptPeople.find(p => p.id === record.PersonID);
    const event = rptEvents.find(e => e.id === record.EventID);
    const type = event ? rptEventTypes.find(t => t.id === event.EventTypeID) : null;
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? getPersonFullName(person) : 'غير معروف');

    return [
      idx + 1,
      personName,
      event?.Title || record.EventTitle || '-',
      type ? type.Name : '-',
      scanDate ? formatDateISO(scanDate) : '-',
      scanDate ? `${String(scanDate.getHours()).padStart(2, '0')}:${String(scanDate.getMinutes()).padStart(2, '0')}` : '-',
      record.Method === 'self' ? 'تسجيل ذاتي' : 'ماسح'
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
  link.setAttribute('download', `report_${rptFilters.dateFrom}_to_${rptFilters.dateTo}.csv`);
  link.click();
};

// ═══════════════════════════════════════════════════════
//   Export PDF (Print)
// ═══════════════════════════════════════════════════════

window.exportReportsPDF = function() {
  const filteredAttendance = getFilteredAttendance();

  if (filteredAttendance.length === 0) {
    alert('لا يوجد بيانات للتصدير');
    return;
  }

  const organizationName = rptSettings.OrganizationName || 'نظام تسجيل الحضور';
  const logoUrl = rptSettings.ThemeLogoUrl || '';

  let currentUserName = '';
  try {
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    currentUserName = cu?.name || cu?.email || '';
  } catch (e) {}

  const now = new Date();
  const nowText = `${formatDateISO(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const logoHtml = logoUrl ? `<img src="${logoUrl}" class="pdf-logo" alt="" />` : '';

  // ⚡ احسب إحصائيات
  const activePeople = rptPeople.filter(p => String(p.Status || '').toLowerCase() === 'active').length;
  const totalAttendance = filteredAttendance.length;

  const attendedPersonIds = new Set(filteredAttendance.map(a => a.PersonID));
  const attendanceRate = activePeople > 0
    ? Math.round((attendedPersonIds.size / activePeople) * 100)
    : 0;

  const rowsHtml = filteredAttendance.map((record, idx) => {
    const person = rptPeople.find(p => p.id === record.PersonID);
    const event = rptEvents.find(e => e.id === record.EventID);
    const scanDate = parseDate(record.ScanTime);

    const personName = record.PersonName
      || (person ? getPersonFullName(person) : 'غير معروف');

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(personName)}</td>
        <td>${escapeHtml(event?.Title || record.EventTitle || '-')}</td>
        <td>${scanDate ? formatDateISO(scanDate) : '-'}</td>
        <td>${scanDate ? `${String(scanDate.getHours()).padStart(2, '0')}:${String(scanDate.getMinutes()).padStart(2, '0')}` : '-'}</td>
        <td>${record.Method === 'self' ? 'ذاتي' : 'ماسح'}</td>
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
        @page { size: A4 landscape; margin: 12mm 8mm; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', 'Tahoma', 'Arial', sans-serif;
          direction: rtl;
          color: #0f172a;
          margin: 0;
          padding: 0;
          font-size: 11px;
        }
        .pdf-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 3px solid #475569;
          margin-bottom: 14px;
          gap: 20px;
        }
        .pdf-logo { max-height: 60px; max-width: 130px; object-fit: contain; }
        .pdf-title { font-size: 22px; font-weight: 800; margin: 0 0 4px 0; color: #1e293b; }
        .pdf-subtitle { font-size: 13px; color: #64748b; margin: 0; }
        .pdf-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .pdf-stat {
          background: #f1f5f9;
          padding: 10px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          text-align: center;
        }
        .pdf-stat-value { font-size: 18px; font-weight: 800; color: #1e293b; }
        .pdf-stat-label { font-size: 10px; color: #64748b; margin-top: 2px; }
        .pdf-meta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #475569;
          background: #f8fafc;
          padding: 8px 12px;
          border-radius: 6px;
          margin-bottom: 14px;
          border: 1px solid #e2e8f0;
        }
        .pdf-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .pdf-table thead { background: #1e293b; color: #fff; }
        .pdf-table th {
          padding: 8px 6px;
          text-align: right;
          font-weight: 700;
          font-size: 10px;
          border: 1px solid #1e293b;
        }
        .pdf-table td {
          padding: 6px;
          border: 1px solid #e2e8f0;
          text-align: right;
        }
        .pdf-table tbody tr:nth-child(even) { background: #f8fafc; }
        .pdf-footer {
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid #cbd5e1;
          font-size: 9px;
          color: #64748b;
          display: flex;
          justify-content: space-between;
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
          <h1 class="pdf-title">📊 تقرير الحضور</h1>
          <p class="pdf-subtitle">${escapeHtml(organizationName)}</p>
        </div>
        <div>${logoHtml}</div>
      </div>

      <div class="pdf-stats">
        <div class="pdf-stat">
          <div class="pdf-stat-value">${activePeople}</div>
          <div class="pdf-stat-label">👥 أشخاص نشطين</div>
        </div>
        <div class="pdf-stat">
          <div class="pdf-stat-value">${totalAttendance}</div>
          <div class="pdf-stat-label">✅ سجل حضور</div>
        </div>
        <div class="pdf-stat">
          <div class="pdf-stat-value">${attendanceRate}%</div>
          <div class="pdf-stat-label">📈 نسبة الحضور</div>
        </div>
      </div>

      <div class="pdf-meta">
        <div><strong>الفترة:</strong> من ${escapeHtml(rptFilters.dateFrom)} إلى ${escapeHtml(rptFilters.dateTo)}</div>
        <div><strong>عدد السجلات:</strong> ${totalAttendance}</div>
      </div>

      <table class="pdf-table">
        <thead>
          <tr>
            <th>#</th>
            <th>الاسم</th>
            <th>الحدث</th>
            <th>التاريخ</th>
            <th>الوقت</th>
            <th>الطريقة</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="pdf-footer">
        <div>تم الإنشاء: ${nowText}</div>
        <div>${currentUserName ? `بواسطة: ${escapeHtml(currentUserName)}` : ''}</div>
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
//   Helpers
// ═══════════════════════════════════════════════════════

function parseDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getPersonFullName(p) {
  if (!p) return '';
  return [p.FirstName, p.SecondName, p.ThirdName, p.FourthName]
    .filter(Boolean).join(' ');
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

window.loadReportsPage = loadReportsPage;
