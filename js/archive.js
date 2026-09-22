// ═══════════════════════════════════════════════════════
//   Archive (الأرشيف) — الأحداث المؤرشفة
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let archUser = null;
let archWorkspace = null;
let archEvents = [];
let archEventTypes = [];
let archLocations = [];
let archFiltered = [];
let archCurrentPage = 1;
const ARCH_PER_PAGE = 20;

let archFilters = {
  search: '',
  type: 'all',     // all | mass | praise | meeting | custom
  status: 'all',   // all | archived
  dateFrom: '',
  dateTo: ''
};

// ═══ أيام الأسبوع ═══
const DAYS_OF_WEEK = {
  Saturday: 'السبت',
  Sunday: 'الأحد',
  Monday: 'الاثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة'
};

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadArchivePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    archUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!archUser) {
      window.location.href = '../index.html';
      return;
    }
    archWorkspace = archUser.currentWorkspace || archUser.selectedRole || 'User';

    // ⚡ اجلب كل البيانات
    const [eventsSnap, typesSnap, locsSnap] = await Promise.all([
      getDocs(collection(db, 'events')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'eventTypes')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'locations')).catch(() => ({ docs: [] }))
    ]);

    // ⚡ صفّي المؤرشفة بس
    archEvents = eventsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => String(e.Status || '').toLowerCase() === 'archived');

    archEventTypes = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    archLocations = locsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ⚡ رتب بالأحدث أولاً
    archEvents.sort((a, b) => {
      const da = parseDate(a.ArchivedAt) || parseDate(a.CreatedAt) || new Date(0);
      const db2 = parseDate(b.ArchivedAt) || parseDate(b.CreatedAt) || new Date(0);
      return db2 - da;
    });

    archFiltered = [...archEvents];
    archCurrentPage = 1;

    renderArchivePage(area);
  } catch (err) {
    console.error('❌ Load archive error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadArchivePage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderArchivePage(area) {
  // ⚡ إحصائيات
  const stats = {
    total: archEvents.length,
    thisMonth: archEvents.filter(e => {
      const d = parseDate(e.ArchivedAt);
      if (!d) return false;
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    byType: {}
  };

  // ⚡ حسب النوع
  archEventTypes.forEach(t => {
    stats.byType[t.id] = archEvents.filter(e => e.EventTypeID === t.id).length;
  });

  area.innerHTML = `
    <div class="arch-container">

      <!-- ═══ إحصائيات ═══ -->
      <div class="arch-stats">
        <div class="arch-stat">
          <span class="arch-stat-value">${stats.total}</span>
          <span class="arch-stat-label">📦 إجمالي مؤرشف</span>
        </div>
        <div class="arch-stat">
          <span class="arch-stat-value">${stats.thisMonth}</span>
          <span class="arch-stat-label">📅 هذا الشهر</span>
        </div>
        ${archEventTypes.map(t => `
          <div class="arch-stat">
            <span class="arch-stat-value">${stats.byType[t.id] || 0}</span>
            <span class="arch-stat-label">${t.Icon || '📅'} ${escapeHtml(t.Name)}</span>
          </div>
        `).join('')}
      </div>

      <!-- ═══ فلاتر ═══ -->
      <div class="arch-filters">
        <div class="arch-filter-group">
          <label>🔍 بحث</label>
          <input type="text" id="archSearch" placeholder="اسم الحدث..." value="${escapeHtml(archFilters.search)}" />
        </div>

        <div class="arch-filter-group">
          <label>النوع</label>
          <select id="archTypeFilter">
            <option value="all" ${archFilters.type === 'all' ? 'selected' : ''}>الكل</option>
            ${archEventTypes.map(t => `
              <option value="${t.id}" ${archFilters.type === t.id ? 'selected' : ''}>${t.Icon || '📅'} ${escapeHtml(t.Name)}</option>
            `).join('')}
          </select>
        </div>

        <div class="arch-filter-group">
          <label>من تاريخ</label>
          <input type="date" id="archDateFrom" value="${archFilters.dateFrom}" />
        </div>

        <div class="arch-filter-group">
          <label>إلى تاريخ</label>
          <input type="date" id="archDateTo" value="${archFilters.dateTo}" />
        </div>

        <button class="btn-secondary" onclick="clearArchiveFilters()">مسح الفلاتر</button>
      </div>

      <!-- ═══ النتائج ═══ -->
      <div class="arch-results">
        <div class="arch-results-header">
          <h3>📦 الأحداث المؤرشفة (${archFiltered.length})</h3>
        </div>

        ${archFiltered.length === 0 ? `
          <div class="arch-empty">
            <div class="arch-empty-icon">📦</div>
            <h3>لا يوجد أحداث مؤرشفة</h3>
            <p>الأحداث اللي تؤرشفها هتظهر هنا</p>
          </div>
        ` : `
          <div class="arch-list" id="archList"></div>
          <div class="arch-pagination" id="archPagination"></div>
        `}
      </div>

    </div>
  `;

  renderArchiveList();
  setupArchiveEvents();
}

// ═══════════════════════════════════════════════════════
//   Render List
// ═══════════════════════════════════════════════════════

function renderArchiveList() {
  const list = document.getElementById('archList');
  if (!list) return;

  if (archFiltered.length === 0) {
    list.innerHTML = '';
    const pagination = document.getElementById('archPagination');
    if (pagination) pagination.innerHTML = '';
    return;
  }

  const start = (archCurrentPage - 1) * ARCH_PER_PAGE;
  const end = start + ARCH_PER_PAGE;
  const pageData = archFiltered.slice(start, end);

  list.innerHTML = pageData.map(event => renderArchiveCard(event)).join('');

  renderPagination();
}

function renderArchiveCard(event) {
  const type = String(event.Type || 'once').toLowerCase();
  const eventType = archEventTypes.find(t => t.id === event.EventTypeID);
  const typeIcon = eventType ? (eventType.Icon || '📅') : '📅';
  const typeName = eventType ? eventType.Name : '';

  const endTime = getEventEndTime(event);
  const timeInfo = `${event.Time || '-'} - ${endTime}`;

  let dateInfo = '';
  if (type === 'weekly') {
    const dayLabel = DAYS_OF_WEEK[event.DayOfWeek] || '';
    dateInfo = `كل ${dayLabel}`;
  } else {
    dateInfo = formatDate(event.Date);
  }

  const locInfo = getLocationText(event);

  const archivedAt = parseDate(event.ArchivedAt);
  const archivedAgo = archivedAt ? formatRelativeTime(archivedAt) : '';

  return `
    <div class="arch-card">
      <div class="arch-card-header">
        <div class="arch-card-icon">${typeIcon}</div>
        <div class="arch-card-title-wrap">
          <h4>${escapeHtml(event.Title || 'بدون عنوان')}</h4>
          ${typeName ? `<span class="arch-card-type">${escapeHtml(typeName)}</span>` : ''}
        </div>
        <span class="status-badge archived">📦 مؤرشف</span>
      </div>

      <div class="arch-card-info">
        <div class="arch-info-row">
          <span class="arch-info-icon">${type === 'weekly' ? '🔄' : '📅'}</span>
          <span>${dateInfo}</span>
        </div>
        <div class="arch-info-row">
          <span class="arch-info-icon">🕐</span>
          <span>${escapeHtml(timeInfo)}</span>
        </div>
        <div class="arch-info-row">
          <span class="arch-info-icon">📍</span>
          <span>${escapeHtml(locInfo)}</span>
        </div>
        ${archivedAgo ? `
          <div class="arch-info-row">
            <span class="arch-info-icon">📦</span>
            <span>تمت الأرشفة ${archivedAgo}</span>
          </div>
        ` : ''}
      </div>

      <div class="arch-card-actions">
        <button class="btn-small" onclick="restoreArchivedEvent('${event.id}')">↩️ إرجاع للنشط</button>
        <button class="btn-small danger" onclick="permanentDeleteArchived('${event.id}')">🗑️ حذف نهائي</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Pagination
// ═══════════════════════════════════════════════════════

function renderPagination() {
  const container = document.getElementById('archPagination');
  if (!container) return;

  const totalPages = Math.ceil(archFiltered.length / ARCH_PER_PAGE);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button class="arch-page-btn" onclick="archGoToPage(${archCurrentPage - 1})" ${archCurrentPage === 1 ? 'disabled' : ''}>« السابق</button>`;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, archCurrentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  pages.forEach(p => {
    html += `<button class="arch-page-btn ${p === archCurrentPage ? 'active' : ''}" onclick="archGoToPage(${p})">${p}</button>`;
  });

  html += `<button class="arch-page-btn" onclick="archGoToPage(${archCurrentPage + 1})" ${archCurrentPage === totalPages ? 'disabled' : ''}>التالي »</button>`;

  container.innerHTML = html;
}

window.archGoToPage = function(page) {
  if (page < 1) return;
  const totalPages = Math.ceil(archFiltered.length / ARCH_PER_PAGE);
  if (page > totalPages) return;

  archCurrentPage = page;
  renderArchiveList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ═══════════════════════════════════════════════════════
//   Filters
// ═══════════════════════════════════════════════════════

function setupArchiveEvents() {
  const searchEl = document.getElementById('archSearch');
  const typeEl = document.getElementById('archTypeFilter');
  const dateFromEl = document.getElementById('archDateFrom');
  const dateToEl = document.getElementById('archDateTo');

  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      archFilters.search = e.target.value.toLowerCase().trim();
      applyArchiveFilters();
    });
  }

  if (typeEl) {
    typeEl.onchange = (e) => {
      archFilters.type = e.target.value;
      applyArchiveFilters();
    };
  }

  if (dateFromEl) {
    dateFromEl.onchange = (e) => {
      archFilters.dateFrom = e.target.value;
      applyArchiveFilters();
    };
  }

  if (dateToEl) {
    dateToEl.onchange = (e) => {
      archFilters.dateTo = e.target.value;
      applyArchiveFilters();
    };
  }
}

function applyArchiveFilters() {
  const term = archFilters.search;

  archFiltered = archEvents.filter(e => {
    // ⚡ بحث
    if (term) {
      const title = String(e.Title || '').toLowerCase();
      if (!title.includes(term)) return false;
    }

    // ⚡ فلتر النوع
    if (archFilters.type !== 'all' && e.EventTypeID !== archFilters.type) {
      return false;
    }

    // ⚡ فلتر التاريخ (يعتمد على ArchivedAt أو Date)
    if (archFilters.dateFrom || archFilters.dateTo) {
      const d = parseDate(e.ArchivedAt) || parseDate(e.Date);
      if (!d) return false;

      const dateISO = formatDateISO(d);
      if (archFilters.dateFrom && dateISO < archFilters.dateFrom) return false;
      if (archFilters.dateTo && dateISO > archFilters.dateTo) return false;
    }

    return true;
  });

  archCurrentPage = 1;
  renderArchiveList();
}

window.clearArchiveFilters = function() {
  archFilters = {
    search: '',
    type: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: ''
  };

  archFiltered = [...archEvents];
  archCurrentPage = 1;

  const area = document.getElementById('contentArea');
  renderArchivePage(area);
};

// ═══════════════════════════════════════════════════════
//   Actions: Restore / Permanent Delete
// ═══════════════════════════════════════════════════════

window.restoreArchivedEvent = async function(eventId) {
  const event = archEvents.find(e => e.id === eventId);
  if (!event) return;

  if (!confirm(`↩️ هل تريد إرجاع "${event.Title}" للنشط؟`)) return;

  try {
    await updateDoc(doc(db, 'events', eventId), {
      Status: 'active',
      RestoredAt: new Date().toISOString(),
      RestoredBy: archUser.email
    });

    alert('✅ تم الإرجاع بنجاح');
    await loadArchivePage(document.getElementById('contentArea'));
  } catch (err) {
    console.error('❌ restoreArchivedEvent error:', err);
    alert('خطأ: ' + err.message);
  }
};

window.permanentDeleteArchived = async function(eventId) {
  const event = archEvents.find(e => e.id === eventId);
  if (!event) return;

  if (!confirm(`⚠️ هل أنت متأكد من حذف "${event.Title}" نهائيًا؟\n\nهذا الإجراء لا يمكن التراجع عنه!`)) return;

  const confirmText = prompt(`اكتب "حذف" للتأكيد:`);
  if (confirmText !== 'حذف') {
    alert('تم الإلغاء');
    return;
  }

  try {
    await deleteDoc(doc(db, 'events', eventId));
    alert('✅ تم الحذف النهائي');
    await loadArchivePage(document.getElementById('contentArea'));
  } catch (err) {
    console.error('❌ permanentDeleteArchived error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

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

function getLocationText(event) {
  const mode = String(event.LocationMode || 'any').toLowerCase();
  if (mode === 'any') return 'أي مكان';

  const ids = Array.isArray(event.LocationIds) ? event.LocationIds : [];
  if (ids.length === 0) return 'لم يحدد';

  const names = ids.map(id => {
    const loc = archLocations.find(l => l.id === id);
    return loc ? loc.Name : null;
  }).filter(Boolean);

  return names.length > 0 ? names.join(' • ') : 'مكان محذوف';
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
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
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
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  if (diff < 2592000) return `منذ ${Math.floor(diff / 604800)} أسبوع`;
  if (diff < 31536000) return `منذ ${Math.floor(diff / 2592000)} شهر`;
  return `منذ ${Math.floor(diff / 31536000)} سنة`;
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

window.loadArchivePage = loadArchivePage;
