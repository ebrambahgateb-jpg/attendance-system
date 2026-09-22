// ═══════════════════════════════════════════════════════
//   Logs (السجلات) — عرض العمليات
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let logUser = null;
let logWorkspace = null;
let logData = [];
let logFiltered = [];
let logCurrentPage = 1;
const LOG_PER_PAGE = 50;

let logFilters = {
  search: '',
  type: 'all',      // all | event | person | attendance | request | account | settings | template
  dateFrom: '',
  dateTo: ''
};

// ═══ أيام الأسبوع ═══
const LOG_TYPE_LABELS = {
  event: '🎯 أحداث',
  person: '👥 أشخاص',
  attendance: '✅ حضور',
  request: '📨 طلبات',
  account: '🔑 حسابات',
  settings: '⚙️ إعدادات',
  template: '📋 أنماط'
};

const ACTION_ICONS = {
  // Events
  event_added: '➕',
  event_updated: '✏️',
  event_deleted: '🗑️',
  event_archived: '📦',
  event_restored: '↩️',
  occurrence_cancelled: '❌',
  occurrence_restored: '🔄',

  // RSVP
  rsvp_confirmed: '✅',
  rsvp_cancel_requested: '📢',
  rsvp_cancel_approved: '✔️',
  rsvp_cancel_rejected: '✖️',
  rsvp_reconfirmed: '🔄',

  // Requests
  transfer_requested: '🔄',
  transfer_approved: '✅',
  transfer_rejected: '❌',

  // Templates
  template_added: '➕',
  template_updated: '✏️',
  template_deleted: '🗑️',
  template_status_changed: '🔄',
  template_set_active: '⭐',

  // Location
  location_added: '➕',
  location_updated: '✏️',
  location_deleted: '🗑️'
};

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadLogsPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    logUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!logUser) {
      window.location.href = '../index.html';
      return;
    }
    logWorkspace = logUser.currentWorkspace || logUser.selectedRole || 'User';

    // ⚡ اجلب السجلات
    let snap;
    try {
      snap = await getDocs(query(
        collection(db, 'logs'),
        orderBy('Timestamp', 'desc'),
        limit(500)
      ));
    } catch (e) {
      // ⚡ fallback لو الـindex مش موجود
      snap = await getDocs(collection(db, 'logs'));
    }

    logData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ⚡ رتب (احتياطيًا)
    logData.sort((a, b) => {
      const da = parseDate(a.Timestamp) || new Date(0);
      const db2 = parseDate(b.Timestamp) || new Date(0);
      return db2 - da;
    });

    logFiltered = [...logData];
    logCurrentPage = 1;

    renderLogsPage(area);
  } catch (err) {
    console.error('❌ Load logs error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadLogsPage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderLogsPage(area) {
  // ⚡ إحصائيات
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const stats = {
    total: logData.length,
    last24h: logData.filter(l => {
      const d = parseDate(l.Timestamp);
      return d && d >= oneDayAgo;
    }).length,
    today: logData.filter(l => {
      const d = parseDate(l.Timestamp);
      return d && d >= startOfToday;
    }).length,
    thisWeek: logData.filter(l => {
      const d = parseDate(l.Timestamp);
      return d && d >= oneWeekAgo;
    }).length
  };

  area.innerHTML = `
    <div class="logs-container">

      <!-- ═══ إحصائيات ═══ -->
      <div class="logs-stats">
        <div class="logs-stat">
          <span class="logs-stat-value">${stats.total}</span>
          <span class="logs-stat-label">📋 إجمالي</span>
        </div>
        <div class="logs-stat">
          <span class="logs-stat-value">${stats.last24h}</span>
          <span class="logs-stat-label">🕐 آخر 24 ساعة</span>
        </div>
        <div class="logs-stat">
          <span class="logs-stat-value">${stats.today}</span>
          <span class="logs-stat-label">📅 اليوم</span>
        </div>
        <div class="logs-stat">
          <span class="logs-stat-value">${stats.thisWeek}</span>
          <span class="logs-stat-label">📆 هذا الأسبوع</span>
        </div>
      </div>

      <!-- ═══ فلاتر ═══ -->
      <div class="logs-filters">
        <div class="logs-filter-group">
          <label>🔍 بحث</label>
          <input type="text" id="logsSearch" placeholder="ابحث في السجلات..." value="${escapeHtml(logFilters.search)}" />
        </div>

        <div class="logs-filter-group">
          <label>النوع</label>
          <select id="logsTypeFilter">
            <option value="all" ${logFilters.type === 'all' ? 'selected' : ''}>الكل</option>
            ${Object.entries(LOG_TYPE_LABELS).map(([key, label]) => `
              <option value="${key}" ${logFilters.type === key ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </div>

        <div class="logs-filter-group">
          <label>من تاريخ</label>
          <input type="date" id="logsDateFrom" value="${logFilters.dateFrom}" />
        </div>

        <div class="logs-filter-group">
          <label>إلى تاريخ</label>
          <input type="date" id="logsDateTo" value="${logFilters.dateTo}" />
        </div>

        <button class="btn-secondary" onclick="clearLogsFilters()">مسح الفلاتر</button>
        <button class="btn-secondary" onclick="exportLogsCSV()">📥 CSV</button>
      </div>

      <!-- ═══ النتائج ═══ -->
      <div class="logs-results">
        <div class="logs-results-header">
          <h3>📋 السجلات (${logFiltered.length})</h3>
        </div>

        ${logFiltered.length === 0 ? `
          <div class="logs-empty">
            <div class="logs-empty-icon">📋</div>
            <h3>لا يوجد سجلات</h3>
            <p>لسه مفيش عمليات مسجلة</p>
          </div>
        ` : `
          <div class="logs-table-wrapper">
            <table class="logs-table">
              <thead>
                <tr>
                  <th>الإجراء</th>
                  <th>النوع</th>
                  <th>التفاصيل</th>
                  <th>المستخدم</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody id="logsTableBody"></tbody>
            </table>
          </div>
          <div class="logs-pagination" id="logsPagination"></div>
        `}
      </div>

    </div>
  `;

  renderLogsTable();
  setupLogsEvents();
}

// ═══════════════════════════════════════════════════════
//   Render Table
// ═══════════════════════════════════════════════════════

function renderLogsTable() {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;

  if (logFiltered.length === 0) {
    tbody.innerHTML = '';
    return;
  }

  const start = (logCurrentPage - 1) * LOG_PER_PAGE;
  const end = start + LOG_PER_PAGE;
  const pageData = logFiltered.slice(start, end);

  tbody.innerHTML = pageData.map(log => {
    const action = log.Action || '';
    const icon = ACTION_ICONS[action] || '📝';
    const type = log.Type || 'other';
    const typeLabel = LOG_TYPE_LABELS[type] || type;

    const timestamp = parseDate(log.Timestamp);
    const timeStr = timestamp ? formatDateTime(timestamp) : '-';

    return `
      <tr>
        <td>
          <div class="logs-action-cell">
            <span class="logs-action-icon">${icon}</span>
            <span class="logs-action-title">${escapeHtml(log.Title || action)}</span>
          </div>
        </td>
        <td>
          <span class="logs-type-badge logs-type-${type}">${typeLabel}</span>
        </td>
        <td>
          <div class="logs-desc">${escapeHtml(log.Description || '-')}</div>
        </td>
        <td>
          <div class="logs-user-cell">
            <div class="logs-user-name">${escapeHtml(log.UserName || log.UserEmail || '-')}</div>
            <div class="logs-user-role">${escapeHtml(log.UserRole || '')}</div>
          </div>
        </td>
        <td>
          <span class="logs-time">${timeStr}</span>
        </td>
      </tr>
    `;
  }).join('');

  renderLogsPagination();
}

function renderLogsPagination() {
  const container = document.getElementById('logsPagination');
  if (!container) return;

  const totalPages = Math.ceil(logFiltered.length / LOG_PER_PAGE);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button class="logs-page-btn" onclick="logsGoToPage(${logCurrentPage - 1})" ${logCurrentPage === 1 ? 'disabled' : ''}>« السابق</button>`;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, logCurrentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  pages.forEach(p => {
    html += `<button class="logs-page-btn ${p === logCurrentPage ? 'active' : ''}" onclick="logsGoToPage(${p})">${p}</button>`;
  });

  html += `<button class="logs-page-btn" onclick="logsGoToPage(${logCurrentPage + 1})" ${logCurrentPage === totalPages ? 'disabled' : ''}>التالي »</button>`;

  container.innerHTML = html;
}

window.logsGoToPage = function(page) {
  if (page < 1) return;
  const totalPages = Math.ceil(logFiltered.length / LOG_PER_PAGE);
  if (page > totalPages) return;

  logCurrentPage = page;
  renderLogsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ═══════════════════════════════════════════════════════
//   Filters
// ═══════════════════════════════════════════════════════

function setupLogsEvents() {
  const searchEl = document.getElementById('logsSearch');
  const typeEl = document.getElementById('logsTypeFilter');
  const dateFromEl = document.getElementById('logsDateFrom');
  const dateToEl = document.getElementById('logsDateTo');

  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      logFilters.search = e.target.value.toLowerCase().trim();
      applyLogsFilters();
    });
  }

  if (typeEl) {
    typeEl.onchange = (e) => {
      logFilters.type = e.target.value;
      applyLogsFilters();
    };
  }

  if (dateFromEl) {
    dateFromEl.onchange = (e) => {
      logFilters.dateFrom = e.target.value;
      applyLogsFilters();
    };
  }

  if (dateToEl) {
    dateToEl.onchange = (e) => {
      logFilters.dateTo = e.target.value;
      applyLogsFilters();
    };
  }
}

function applyLogsFilters() {
  const term = logFilters.search;

  logFiltered = logData.filter(log => {
    // ⚡ بحث
    if (term) {
      const combined = (
        (log.Title || '') + ' ' +
        (log.Description || '') + ' ' +
        (log.UserName || '') + ' ' +
        (log.UserEmail || '') + ' ' +
        (log.RelatedTitle || '')
      ).toLowerCase();
      if (!combined.includes(term)) return false;
    }

    // ⚡ النوع
    if (logFilters.type !== 'all' && log.Type !== logFilters.type) {
      return false;
    }

    // ⚡ التاريخ
    if (logFilters.dateFrom || logFilters.dateTo) {
      const d = parseDate(log.Timestamp);
      if (!d) return false;
      const dateISO = formatDateISO(d);
      if (logFilters.dateFrom && dateISO < logFilters.dateFrom) return false;
      if (logFilters.dateTo && dateISO > logFilters.dateTo) return false;
    }

    return true;
  });

  logCurrentPage = 1;
  renderLogsTable();
}

window.clearLogsFilters = function() {
  logFilters = {
    search: '',
    type: 'all',
    dateFrom: '',
    dateTo: ''
  };

  logFiltered = [...logData];
  logCurrentPage = 1;

  const area = document.getElementById('contentArea');
  renderLogsPage(area);
};

// ═══════════════════════════════════════════════════════
//   Export CSV
// ═══════════════════════════════════════════════════════

window.exportLogsCSV = function() {
  if (logFiltered.length === 0) {
    alert('لا يوجد بيانات للتصدير');
    return;
  }

  const headers = ['#', 'الإجراء', 'النوع', 'التفاصيل', 'المستخدم', 'الدور', 'الوقت'];

  const rows = logFiltered.map((log, idx) => {
    const timestamp = parseDate(log.Timestamp);
    const type = log.Type || 'other';
    const typeLabel = LOG_TYPE_LABELS[type] || type;

    return [
      idx + 1,
      log.Title || log.Action || '-',
      typeLabel,
      log.Description || '-',
      log.UserName || log.UserEmail || '-',
      log.UserRole || '-',
      timestamp ? formatDateTime(timestamp) : '-'
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
  link.setAttribute('download', `logs_${formatDateISO(new Date())}.csv`);
  link.click();
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

function formatDateTime(date) {
  if (!date) return '-';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mn = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} ${h}:${mn}`;
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
//   ⚡ Global logAction helper
//   ⚡ يتستخدم في كل الملفات لتسجيل العمليات
// ═══════════════════════════════════════════════════════

window.logAction = async function({
  action,
  type,
  title,
  description = '',
  relatedID = '',
  relatedTitle = ''
}) {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;

    const log = {
      Action: action || 'unknown',
      Type: type || 'other',
      Title: title || '',
      Description: description || '',
      RelatedID: relatedID || '',
      RelatedTitle: relatedTitle || '',
      UserEmail: user.email || '',
      UserName: user.name || user.email || '',
      UserRole: user.currentWorkspace || user.selectedRole || '',
      Timestamp: new Date().toISOString(),
      CreatedAt: new Date().toISOString()
    };

    await addDoc(collection(db, 'logs'), log);
  } catch (err) {
    console.warn('⚠️ logAction error:', err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.loadLogsPage = loadLogsPage;
