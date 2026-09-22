// ═══════════════════════════════════════════════════════
//   Schedule (الجدول) — عرض شهري + أسبوعي
//   ⚡ محدّث: عرض المؤكدين فقط للـUser + كل الحالات للـAdmin
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
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC
} from './firebase-config.js';

// ═══ State ═══
let schUser = null;
let schWorkspace = null;
let schActiveTab = 'grid';

let schEvents = [];
let schEventTypes = [];
let schLocations = [];
let schTemplates = [];
let schRequests = [];
let schMyRequests = [];
let schRegistrations = {};
let schPeople = {};
let schSettings = {};

// ⚡ للجدول
let schViewMode = 'month';
let schCurrentDate = new Date();

// ═══ أيام الأسبوع ═══
const DAYS_OF_WEEK = [
  { value: 'Saturday',  label: 'السبت',   short: 'سبت',   icon: '🕯️', jsDay: 6 },
  { value: 'Sunday',    label: 'الأحد',   short: 'أحد',   icon: '⛪', jsDay: 0 },
  { value: 'Monday',    label: 'الاثنين', short: 'اثنين', icon: '📅', jsDay: 1 },
  { value: 'Tuesday',   label: 'الثلاثاء', short: 'ثلاثاء', icon: '📅', jsDay: 2 },
  { value: 'Wednesday', label: 'الأربعاء', short: 'أربعاء', icon: '📅', jsDay: 3 },
  { value: 'Thursday',  label: 'الخميس',  short: 'خميس',  icon: '📅', jsDay: 4 },
  { value: 'Friday',    label: 'الجمعة',  short: 'جمعة',  icon: '⛪', jsDay: 5 }
];

// ═══ أسماء الشهور ═══
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

// ═══════════════════════════════════════════════════════
//   Load Schedule Page
// ═══════════════════════════════════════════════════════

async function loadSchedulePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    schUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!schUser) {
      window.location.href = '../index.html';
      return;
    }
    schWorkspace = schUser.currentWorkspace || schUser.selectedRole || 'User';

    try {
      const saved = localStorage.getItem('schViewMode');
      if (saved === 'week' || saved === 'month') schViewMode = saved;
    } catch (e) {}

    const [
      eventsSnap,
      eventTypesSnap,
      locationsSnap,
      templatesSnap,
      peopleSnap,
      registrationsSnap,
      requestsSnap,
      myRequestsSnap,
      settingsDoc
    ] = await Promise.all([
      getDocs(collection(db, 'events')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'eventTypes')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'locations')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'massTemplates')).catch(() => ({ docs: [] })),
      getDocs(collection(db, COLLECTIONS.PEOPLE)).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'eventRegistrations')).catch(() => ({ docs: [] })),
      getDocs(query(
        collection(db, 'massChangeRequests'),
        where('Status', '==', 'pending')
      )).catch(() => ({ docs: [] })),
      getDocs(query(
        collection(db, 'massChangeRequests'),
        where('RequesterEmail', '==', schUser.email)
      )).catch(() => ({ docs: [] })),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC)).catch(() => null)
    ]);

    schEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    schEventTypes = eventTypesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    schLocations = locationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    schTemplates = templatesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    schRequests = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    schMyRequests = myRequestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    schSettings = settingsDoc && settingsDoc.exists() ? settingsDoc.data() : {};

    schPeople = {};
    peopleSnap.docs.forEach(d => {
      schPeople[d.id] = { id: d.id, ...d.data() };
    });

    schRegistrations = {};
    registrationsSnap.docs.forEach(d => {
      const reg = { id: d.id, ...d.data() };
      if (!reg.EventID) return;
      if (!schRegistrations[reg.EventID]) schRegistrations[reg.EventID] = [];
      schRegistrations[reg.EventID].push(reg);
    });

    renderSchedulePage(area);
  } catch (err) {
    console.error('❌ Load schedule error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadSchedulePage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderSchedulePage(area) {
  const isAdmin = ['Owner', 'Admin'].includes(schWorkspace);
  const isOwner = schWorkspace === 'Owner';
  const isUser = ['User', 'Scanner'].includes(schWorkspace);

  const tabs = [
    { id: 'grid', label: '📊 الجدول', show: true },
    { id: 'locations', label: '⛪ الأماكن', show: isAdmin },
    { id: 'requests', label: '📨 الطلبات', show: isAdmin, count: schRequests.length },
    { id: 'my-requests', label: '📝 طلباتي', show: isUser, count: schMyRequests.length },
    { id: 'templates', label: '⚙️ الأنماط', show: isOwner }
  ];

  const visibleTabs = tabs.filter(t => t.show);

  area.innerHTML = `
    <div class="sch-container">

      <div class="sch-tabs">
        ${visibleTabs.map(t => `
          <button class="sch-tab ${schActiveTab === t.id ? 'active' : ''}" data-tab="${t.id}">
            ${t.label}
            ${t.count ? `<span class="sch-tab-count">${t.count}</span>` : ''}
          </button>
        `).join('')}
      </div>

      <div class="sch-content" id="schContent"></div>

    </div>
  `;

  setupScheduleEvents();
  renderActiveTab();
}

function setupScheduleEvents() {
  document.querySelectorAll('.sch-tab').forEach(btn => {
    btn.onclick = () => {
      schActiveTab = btn.dataset.tab;
      document.querySelectorAll('.sch-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderActiveTab();
    };
  });
}

function renderActiveTab() {
  const container = document.getElementById('schContent');
  if (!container) return;

  if (schActiveTab === 'grid') {
    renderGridView(container);
  } else if (schActiveTab === 'locations') {
    renderLocationsView(container);
  } else if (schActiveTab === 'requests') {
    renderRequestsView(container);
  } else if (schActiveTab === 'my-requests') {
    renderMyRequestsView(container);
  } else if (schActiveTab === 'templates') {
    renderTemplatesView(container);
  }
}

// ═══════════════════════════════════════════════════════
//   1. Grid View
// ═══════════════════════════════════════════════════════

function renderGridView(container) {
  const headerHtml = renderGridHeader();
  const bodyHtml = schViewMode === 'week' ? renderWeekView() : renderMonthView();

  container.innerHTML = `
    ${headerHtml}
    ${bodyHtml}
  `;
}

function renderGridHeader() {
  const title = schViewMode === 'week'
    ? renderWeekTitle()
    : renderMonthTitle();

  return `
    <div class="sch-grid-header">
      <div class="sch-view-switcher">
        <button class="sch-view-btn ${schViewMode === 'week' ? 'active' : ''}" onclick="switchScheduleView('week')">
          📆 أسبوعي
        </button>
        <button class="sch-view-btn ${schViewMode === 'month' ? 'active' : ''}" onclick="switchScheduleView('month')">
          📅 شهري
        </button>
      </div>

      <div class="sch-nav">
        <button class="sch-nav-btn" onclick="changeScheduleRange(-1)">◀</button>
        <div class="sch-nav-title">${title}</div>
        <button class="sch-nav-btn" onclick="changeScheduleRange(1)">▶</button>
      </div>

      <div class="sch-nav-today">
        <button class="sch-today-btn" onclick="goToScheduleToday()">اليوم</button>
      </div>
    </div>
  `;
}

function renderMonthTitle() {
  return `${MONTHS_AR[schCurrentDate.getMonth()]} ${schCurrentDate.getFullYear()}`;
}

function renderWeekTitle() {
  const weekStart = getWeekStart(schCurrentDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startStr = `${weekStart.getDate()} ${MONTHS_AR[weekStart.getMonth()]}`;
  const endStr = `${weekEnd.getDate()} ${MONTHS_AR[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  return `${startStr} — ${endStr}`;
}

// ═══════════════════════════════════════════════════════
//   Month View
// ═══════════════════════════════════════════════════════

function renderMonthView() {
  const year = schCurrentDate.getFullYear();
  const month = schCurrentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);

  const startDate = new Date(firstDayOfMonth);
  const firstDayJs = firstDayOfMonth.getDay();
  const daysToSubtract = (firstDayJs - 6 + 7) % 7;
  startDate.setDate(firstDayOfMonth.getDate() - daysToSubtract);

  const lastDayOfMonth = new Date(year, month + 1, 0);

  const endDate = new Date(lastDayOfMonth);
  const lastDayJs = lastDayOfMonth.getDay();
  const daysToAdd = (5 - lastDayJs + 7) % 7;
  endDate.setDate(lastDayOfMonth.getDate() + daysToAdd);

  const cells = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    cells.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const headerRow = `
    <div class="sch-month-header">
      ${DAYS_OF_WEEK.map(d => `<div class="sch-month-header-cell">${d.label}</div>`).join('')}
    </div>
  `;

  const cellsHtml = cells.map(date => renderMonthCell(date, month)).join('');

  return `
    <div class="sch-month-wrapper">
      ${headerRow}
      <div class="sch-month-grid">
        ${cellsHtml}
      </div>
    </div>
  `;
}

function renderMonthCell(date, currentMonth) {
  const isToday = isSameDay(date, new Date());
  const isCurrentMonth = date.getMonth() === currentMonth;
  const dateStr = formatDateISO(date);
  const dayNum = date.getDate();

  const events = getEventsForDate(date);

  const MAX_VISIBLE = 3;
  const visibleEvents = events.slice(0, MAX_VISIBLE);
  const extraCount = events.length - MAX_VISIBLE;

  const eventsHtml = visibleEvents.map(e => {
    const eventType = schEventTypes.find(t => t.id === e.EventTypeID);
    const icon = eventType ? (eventType.Icon || '📅') : '📅';
    const isWeekly = String(e.Type || '').toLowerCase() === 'weekly';

    return `
      <div class="sch-month-event" onclick="event.stopPropagation(); openEventAttendeesModal('${e.id}')">
        <span class="sch-month-event-icon">${icon}${isWeekly ? '' : ' ⭐'}</span>
        <span class="sch-month-event-title">${escapeHtml(e.Title || '')}</span>
        <span class="sch-month-event-time">${e.Time || ''}</span>
      </div>
    `;
  }).join('');

  const moreHtml = extraCount > 0
    ? `<div class="sch-month-more">+${extraCount} أكثر</div>`
    : '';

  const emptyHtml = events.length === 0
    ? '<div class="sch-month-empty"></div>'
    : '';

  return `
    <div class="sch-month-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}"
         onclick="openDayEventsModal('${dateStr}')"
         data-date="${dateStr}">
      <div class="sch-month-day-num">${dayNum}</div>
      <div class="sch-month-events">
        ${eventsHtml}
        ${moreHtml}
        ${emptyHtml}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Week View
// ═══════════════════════════════════════════════════════

function renderWeekView() {
  const weekStart = getWeekStart(schCurrentDate);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  return `
    <div class="sch-week-grid">
      ${days.map(date => renderWeekColumn(date)).join('')}
    </div>
  `;
}

function renderWeekColumn(date) {
  const isToday = isSameDay(date, new Date());
  const dayName = DAYS_OF_WEEK.find(d => d.jsDay === date.getDay());
  const dayLabel = dayName ? dayName.label : '';
  const dayIcon = dayName ? dayName.icon : '';
  const dateStr = formatDateISO(date);

  const events = getEventsForDate(date);
  events.sort((a, b) => String(a.Time || '').localeCompare(String(b.Time || '')));

  const eventsHtml = events.length === 0
    ? '<div class="sch-week-empty">لا يوجد أحداث</div>'
    : events.map(e => renderWeekEventCard(e)).join('');

  return `
    <div class="sch-week-col ${isToday ? 'today' : ''}">
      <div class="sch-week-col-header" onclick="openDayEventsModal('${dateStr}')">
        <div class="sch-week-day-icon">${dayIcon}</div>
        <div class="sch-week-day-name">${dayLabel}</div>
        <div class="sch-week-day-date">${date.getDate()} ${MONTHS_AR[date.getMonth()]}</div>
      </div>
      <div class="sch-week-col-body">
        ${eventsHtml}
      </div>
    </div>
  `;
}

function renderWeekEventCard(event) {
  const eventType = schEventTypes.find(t => t.id === event.EventTypeID);
  const icon = eventType ? (eventType.Icon || '📅') : '📅';
  const endTime = getEventEndTime(event);
  const locInfo = getEventLocationText(event);
  const isWeekly = String(event.Type || '').toLowerCase() === 'weekly';

  const stats = getEventAttendeesStats(event);
  const isAdminView = ['Owner', 'Admin'].includes(schWorkspace);
  const scope = String(event.RegistrationScope || 'all').toLowerCase();

  let statsHtml = '';
  if (isAdminView) {
    if (scope === 'optional') {
      statsHtml = `<div class="sch-event-stats">
        <span class="sch-stat-committed">👥 ${stats.confirmed} مسجّل</span>
      </div>`;
    } else {
      statsHtml = `<div class="sch-event-stats">
        <span class="sch-stat-committed">👥 ${stats.committed}</span>
        <span class="sch-stat-confirmed">✅ ${stats.confirmed}</span>
      </div>`;
    }
  } else {
    statsHtml = `<div class="sch-event-stats">
      <span class="sch-stat-confirmed">✅ ${stats.confirmed} مؤكد</span>
    </div>`;
  }

  return `
    <div class="sch-week-event" onclick="openEventAttendeesModal('${event.id}')">
      <div class="sch-week-event-header">
        <span class="sch-week-event-icon">${icon}</span>
        <span class="sch-week-event-title">${escapeHtml(event.Title || '')}</span>
        ${!isWeekly ? '<span class="sch-week-event-once">⭐</span>' : ''}
      </div>
      <div class="sch-week-event-info">
        <span>🕐 ${event.Time || '-'} - ${endTime}</span>
        <span>📍 ${escapeHtml(locInfo)}</span>
      </div>
      ${statsHtml}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Get Events For Date
// ═══════════════════════════════════════════════════════

function getEventsForDate(date) {
  const dateISO = formatDateISO(date);
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];

  return schEvents.filter(e => {
    const status = String(e.Status || '').toLowerCase();
    if (status !== 'active') return false;

    const type = String(e.Type || 'once').toLowerCase();

    if (type === 'weekly') {
      return e.DayOfWeek === dayName;
    }

    if (type === 'once') {
      return e.Date === dateISO;
    }

    return false;
  });
}

// ═══════════════════════════════════════════════════════
//   Navigation
// ═══════════════════════════════════════════════════════

window.switchScheduleView = function(mode) {
  if (mode !== 'week' && mode !== 'month') return;
  schViewMode = mode;
  try { localStorage.setItem('schViewMode', mode); } catch (e) {}
  renderGridView(document.getElementById('schContent'));
};

window.changeScheduleRange = function(direction) {
  if (schViewMode === 'week') {
    schCurrentDate.setDate(schCurrentDate.getDate() + direction * 7);
  } else {
    schCurrentDate.setMonth(schCurrentDate.getMonth() + direction);
  }
  renderGridView(document.getElementById('schContent'));
};

window.goToScheduleToday = function() {
  schCurrentDate = new Date();
  renderGridView(document.getElementById('schContent'));
};

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day - 6 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

// ═══════════════════════════════════════════════════════
//   Day Events Modal
// ═══════════════════════════════════════════════════════

window.openDayEventsModal = function(dateISO) {
  const date = new Date(dateISO + 'T00:00:00');
  const events = getEventsForDate(date);
  events.sort((a, b) => String(a.Time || '').localeCompare(String(b.Time || '')));

  const dayName = DAYS_OF_WEEK.find(d => d.jsDay === date.getDay());
  const dayLabel = dayName ? dayName.label : '';
  const dateFormatted = `${dayLabel} ${date.getDate()} ${MONTHS_AR[date.getMonth()]} ${date.getFullYear()}`;

  const isAdminView = ['Owner', 'Admin'].includes(schWorkspace);

  let modal = document.getElementById('dayEventsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dayEventsModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  let contentHtml = '';
  if (events.length === 0) {
    contentHtml = `
      <div class="att-empty">
        <div class="att-empty-icon">📅</div>
        <p>لا يوجد أحداث في هذا اليوم</p>
      </div>
    `;
  } else {
    contentHtml = events.map(e => {
      const eventType = schEventTypes.find(t => t.id === e.EventTypeID);
      const icon = eventType ? (eventType.Icon || '📅') : '📅';
      const typeName = eventType ? eventType.Name : '';
      const endTime = getEventEndTime(e);
      const locInfo = getEventLocationText(e);
      const isWeekly = String(e.Type || '').toLowerCase() === 'weekly';
      const stats = getEventAttendeesStats(e);

      const scope = String(e.RegistrationScope || 'all').toLowerCase();
      let scopeBadge = '';
      if (scope === 'optional') {
        scopeBadge = '<span class="sch-scope-badge optional">🟢 اختياري</span>';
      } else if (scope === 'specific') {
        scopeBadge = '<span class="sch-scope-badge specific">👥 قائمة</span>';
      } else {
        scopeBadge = '<span class="sch-scope-badge all">🌍 للكل</span>';
      }

      // ⚡ إحصائيات حسب الصلاحية
      let statsHtml = '';
      if (isAdminView) {
        if (scope === 'optional') {
          statsHtml = `<div class="sch-event-stats">
            <span class="sch-stat-committed">👥 ${stats.confirmed} مسجّل</span>
          </div>`;
        } else {
          statsHtml = `<div class="sch-event-stats">
            <span class="sch-stat-committed">👥 ${stats.committed} ملتزم</span>
            <span class="sch-stat-confirmed">✅ ${stats.confirmed} مؤكد</span>
          </div>`;
        }
      } else {
        statsHtml = `<div class="sch-event-stats">
          <span class="sch-stat-confirmed">✅ ${stats.confirmed} مؤكد</span>
        </div>`;
      }

      return `
        <div class="sch-day-event-card" onclick="closeDayEventsModal(); openEventAttendeesModal('${e.id}')">
          <div class="sch-day-event-header">
            <span class="sch-day-event-icon">${icon}</span>
            <span class="sch-day-event-title">${escapeHtml(e.Title || '')}</span>
            ${scopeBadge}
            ${isWeekly ? '<span class="sch-week-event-weekly">🔄</span>' : '<span class="sch-week-event-once">⭐</span>'}
          </div>
          ${typeName ? `<div class="sch-day-event-line">📋 ${escapeHtml(typeName)}</div>` : ''}
          <div class="sch-day-event-line">🕐 ${e.Time || '-'} - ${endTime}</div>
          <div class="sch-day-event-line">📍 ${escapeHtml(locInfo)}</div>
          ${statsHtml}
        </div>
      `;
    }).join('');
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:600px;max-height:85vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>📅 ${dateFormatted}</h2>
        <button class="modal-close" onclick="closeDayEventsModal()">✕</button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1;">
        ${contentHtml}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeDayEventsModal()">إغلاق</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
};

window.closeDayEventsModal = function() {
  const modal = document.getElementById('dayEventsModal');
  if (modal) modal.style.display = 'none';
};

// ═══════════════════════════════════════════════════════
//   Event Attendees Modal
//   ⚡ Admin/Owner: كل الحالات / User/Scanner: المؤكدين بس
// ═══════════════════════════════════════════════════════

window.openEventAttendeesModal = function(eventId) {
  const event = schEvents.find(e => e.id === eventId);
  if (!event) {
    alert('الحدث غير موجود');
    return;
  }

  // ⚡ هل المستخدم Admin/Owner؟
  const isAdminView = ['Owner', 'Admin'].includes(schWorkspace);

  const attendees = getEventAttendees(event);
  const stats = getEventAttendeesStats(event);
  const scope = String(event.RegistrationScope || 'all').toLowerCase();

  // ⚡ لو User/Scanner: عرض المؤكدين بس
  const confirmedList = attendees.filter(a => a.rsvpStatus === 'confirmed');
  const pendingList = isAdminView ? attendees.filter(a => a.rsvpStatus === 'pending') : [];
  const cancelRequestedList = isAdminView ? attendees.filter(a => a.rsvpStatus === 'cancel_requested') : [];
  const cancelledList = isAdminView ? attendees.filter(a => a.rsvpStatus === 'cancelled') : [];

  const eventType = schEventTypes.find(t => t.id === event.EventTypeID);
  const eventTypeIcon = eventType ? (eventType.Icon || '📅') : '📅';
  const eventTypeName = eventType ? eventType.Name : '';
  const endTime = getEventEndTime(event);
  const locInfo = getEventLocationText(event);

  const type = String(event.Type || 'once').toLowerCase();
  let dateLine = '';
  if (type === 'weekly') {
    const dayLabel = DAYS_OF_WEEK.find(d => d.value === event.DayOfWeek)?.label || '';
    dateLine = `كل ${dayLabel}`;
  } else if (event.Date) {
    const d = new Date(event.Date + 'T00:00:00');
    dateLine = `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ⚡ Badge للـscope
  let scopeBadge = '';
  if (scope === 'optional') {
    scopeBadge = '<span class="sch-scope-badge optional">🟢 اختياري</span>';
  } else if (scope === 'specific') {
    scopeBadge = '<span class="sch-scope-badge specific">👥 إلزامي لقائمة</span>';
  } else {
    scopeBadge = '<span class="sch-scope-badge all">🌍 إلزامي للكل</span>';
  }

  let modal = document.getElementById('attendeesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'attendeesModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  // ⚡ إحصائيات حسب الصلاحية + scope
  let statsBoxHtml = '';
  if (isAdminView) {
    // ⚡ Admin/Owner: كل الحالات
    if (scope === 'optional') {
      statsBoxHtml = `
        <div class="att-stats-box" style="grid-template-columns: repeat(3, 1fr);">
          <div class="att-stat-item confirmed">
            <span class="att-stat-number">${stats.confirmed}</span>
            <span class="att-stat-label">✅ مسجّل</span>
          </div>
          <div class="att-stat-item cancel-req">
            <span class="att-stat-number">${stats.cancelRequested}</span>
            <span class="att-stat-label">🔄 طلب إلغاء</span>
          </div>
          <div class="att-stat-item cancelled">
            <span class="att-stat-number">${stats.cancelled}</span>
            <span class="att-stat-label">❌ ملغي</span>
          </div>
        </div>
      `;
    } else {
      statsBoxHtml = `
        <div class="att-stats-box">
          <div class="att-stat-item">
            <span class="att-stat-number">${stats.committed}</span>
            <span class="att-stat-label">👥 ملتزم</span>
          </div>
          <div class="att-stat-item confirmed">
            <span class="att-stat-number">${stats.confirmed}</span>
            <span class="att-stat-label">✅ مؤكد</span>
          </div>
          <div class="att-stat-item pending">
            <span class="att-stat-number">${stats.pending}</span>
            <span class="att-stat-label">⏳ انتظار</span>
          </div>
          <div class="att-stat-item cancel-req">
            <span class="att-stat-number">${stats.cancelRequested}</span>
            <span class="att-stat-label">🔄 طلب إلغاء</span>
          </div>
          <div class="att-stat-item cancelled">
            <span class="att-stat-number">${stats.cancelled}</span>
            <span class="att-stat-label">❌ ملغي</span>
          </div>
        </div>
      `;
    }
  } else {
    // ⚡ User/Scanner: المؤكدين بس
    statsBoxHtml = `
      <div class="att-stats-box" style="grid-template-columns: repeat(1, 1fr);">
        <div class="att-stat-item confirmed">
          <span class="att-stat-number">${stats.confirmed}</span>
          <span class="att-stat-label">✅ مؤكد الحضور</span>
        </div>
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:600px;max-height:85vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>${eventTypeIcon} ${escapeHtml(event.Title || '')}</h2>
        <button class="modal-close" onclick="closeAttendeesModal()">✕</button>
      </div>

      <div class="modal-body" style="overflow-y:auto;flex:1;">

        <div class="att-event-info">
          ${eventTypeName ? `<div class="att-event-line"><span>📋</span><span>${escapeHtml(eventTypeName)}</span></div>` : ''}
          <div class="att-event-line"><span>⚙️</span><span>${scopeBadge}</span></div>
          ${dateLine ? `<div class="att-event-line"><span>${type === 'weekly' ? '🔄' : '📅'}</span><span>${dateLine}</span></div>` : ''}
          <div class="att-event-line"><span>🕐</span><span>${event.Time || '-'} - ${endTime}</span></div>
          <div class="att-event-line"><span>📍</span><span>${escapeHtml(locInfo)}</span></div>
        </div>

        ${statsBoxHtml}

        ${renderAttendeesGroup('✅ المؤكدين', confirmedList, 'confirmed')}
        ${isAdminView && scope !== 'optional' ? renderAttendeesGroup('⏳ في انتظار التأكيد', pendingList, 'pending') : ''}
        ${isAdminView ? renderAttendeesGroup('🔄 طلبات إلغاء', cancelRequestedList, 'cancel-requested') : ''}
        ${isAdminView ? renderAttendeesGroup('❌ الملغيين', cancelledList, 'cancelled') : ''}

        ${confirmedList.length === 0 && !isAdminView ? `
          <div class="att-empty">
            <div class="att-empty-icon">👥</div>
            <p>لا يوجد مسجّلين بعد</p>
          </div>
        ` : ''}

        ${attendees.length === 0 && isAdminView ? `
          <div class="att-empty">
            <div class="att-empty-icon">👥</div>
            <p>${scope === 'optional' ? 'لا يوجد مسجّلين بعد' : 'لا يوجد ملتزمين بهذا الحدث'}</p>
          </div>
        ` : ''}
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeAttendeesModal()">إغلاق</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
};

function renderAttendeesGroup(title, list, variant) {
  if (list.length === 0) return '';

  const itemsHtml = list.map(att => {
    const person = att.person;
    const name = getPersonFullName(person);
    const initial = (person.FirstName || name || '?').charAt(0);

    const photoHtml = person.PhotoURL
      ? `<img src="${person.PhotoURL}" alt="" class="att-mini-photo" />`
      : `<div class="att-mini-photo-placeholder">${escapeHtml(initial)}</div>`;

    let subText = '';
    if (variant === 'confirmed' && att.registration?.ConfirmedAt) {
      const d = parseDate(att.registration.ConfirmedAt);
      if (d) subText = `أكّد ${formatRelativeTime(d)}`;
    } else if (variant === 'cancel-requested' && att.registration?.CancelRequestedAt) {
      const d = parseDate(att.registration.CancelRequestedAt);
      if (d) subText = `طلب ${formatRelativeTime(d)}`;
    }

    return `
      <div class="att-person-row">
        ${photoHtml}
        <div class="att-person-info">
          <div class="att-person-name">${escapeHtml(name)}</div>
          ${subText ? `<div class="att-person-sub">${escapeHtml(subText)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="att-group">
      <div class="att-group-title ${variant}">
        ${title}
        <span class="att-group-count">${list.length}</span>
      </div>
      <div class="att-group-list">
        ${itemsHtml}
      </div>
    </div>
  `;
}

window.closeAttendeesModal = function() {
  const modal = document.getElementById('attendeesModal');
  if (modal) modal.style.display = 'none';
};

// ═══════════════════════════════════════════════════════
//   Get Event Attendees
// ═══════════════════════════════════════════════════════

function getEventAttendeesStats(event) {
  const attendees = getEventAttendees(event);

  let committed = attendees.length;
  let confirmed = 0;
  let pending = 0;
  let cancelRequested = 0;
  let cancelled = 0;

  for (const att of attendees) {
    if (att.rsvpStatus === 'confirmed') confirmed++;
    else if (att.rsvpStatus === 'cancel_requested') cancelRequested++;
    else if (att.rsvpStatus === 'cancelled') cancelled++;
    else pending++;
  }

  return { committed, confirmed, pending, cancelRequested, cancelled };
}

function getEventAttendees(event) {
  const scope = String(event.RegistrationScope || 'all').toLowerCase();
  const registrations = schRegistrations[event.id] || [];

  const regByPerson = {};
  registrations.forEach(r => {
    if (r.PersonID) regByPerson[r.PersonID] = r;
  });

  let personIds = [];

  if (scope === 'optional') {
    personIds = registrations.map(r => r.PersonID).filter(id => schPeople[id]);
  } else if (scope === 'specific') {
    const ids = Array.isArray(event.RegistrationPersonIDs) ? event.RegistrationPersonIDs : [];
    personIds = ids.filter(id => schPeople[id]);
  } else {
    personIds = Object.keys(schPeople).filter(id => {
      const p = schPeople[id];
      return String(p.Status || 'active').toLowerCase() === 'active';
    });
  }

  const attendees = personIds.map(personId => {
    const person = schPeople[personId];
    const reg = regByPerson[personId];
    const rsvpStatus = reg?.Status || 'pending';
    return { person, rsvpStatus, registration: reg };
  });

  const order = { confirmed: 0, pending: 1, cancel_requested: 2, cancelled: 3 };
  attendees.sort((a, b) => {
    const oa = order[a.rsvpStatus] ?? 4;
    const ob = order[b.rsvpStatus] ?? 4;
    if (oa !== ob) return oa - ob;
    return getPersonFullName(a.person).localeCompare(getPersonFullName(b.person), 'ar');
  });

  return attendees;
}

// ═══════════════════════════════════════════════════════
//   2. Locations View
// ═══════════════════════════════════════════════════════

function renderLocationsView(container) {
  const isOwnerOrAdmin = ['Owner', 'Admin'].includes(schWorkspace);

  container.innerHTML = `
    <div class="sch-locations-header">
      <h3>⛪ الأماكن (${schLocations.length})</h3>
      ${isOwnerOrAdmin ? `
        <button class="btn-primary" onclick="openLocationModal()">➕ إضافة مكان</button>
      ` : ''}
    </div>

    ${schLocations.length === 0 ? `
      <div class="sch-empty">
        <div class="sch-empty-icon">⛪</div>
        <h3>لا يوجد أماكن</h3>
        <p>ابدأ بإضافة مكان جديد</p>
      </div>
    ` : `
      <div class="sch-locations-grid">
        ${schLocations.map(loc => renderLocationCard(loc, isOwnerOrAdmin)).join('')}
      </div>
    `}
  `;
}

function renderLocationCard(loc, isAdmin) {
  const qrHtml = loc.QRCode
    ? `<div class="sch-loc-qr" id="qr-${loc.id}" data-qr="${escapeHtml(loc.QRCode)}"></div>`
    : '<p class="sch-loc-no-qr">لا يوجد QR</p>';

  return `
    <div class="sch-loc-card">
      <div class="sch-loc-header">
        <h4>${escapeHtml(loc.Name || '')}</h4>
        <span class="status-badge ${loc.Status === 'active' ? 'active' : 'inactive'}">
          ${loc.Status === 'active' ? '✅ نشط' : '⏸️ معطل'}
        </span>
      </div>

      <div class="sch-loc-info">
        <div class="sch-loc-row">
          <span>📍</span>
          <span>${loc.Lat?.toFixed(5) || '-'}, ${loc.Lng?.toFixed(5) || '-'}</span>
        </div>
        <div class="sch-loc-row">
          <span>📏</span>
          <span>نطاق: ${loc.Radius || 4}م</span>
        </div>
      </div>

      <div class="sch-loc-qr-wrap">
        ${qrHtml}
      </div>

      ${isAdmin ? `
        <div class="sch-loc-actions">
          <button class="btn-small" onclick="showLocationQR('${loc.id}')">📷 QR</button>
          <button class="btn-small" onclick="editLocation('${loc.id}')">✏️ تعديل</button>
          <button class="btn-small danger" onclick="deleteLocation('${loc.id}')">🗑️ حذف</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   3. Requests View
// ═══════════════════════════════════════════════════════

function renderRequestsView(container) {
  container.innerHTML = `
    <div class="sch-requests-header">
      <h3>📨 طلبات النقل (${schRequests.length})</h3>
    </div>

    ${schRequests.length === 0 ? `
      <div class="sch-empty">
        <div class="sch-empty-icon">📨</div>
        <h3>لا يوجد طلبات</h3>
        <p>مفيش طلبات نقل مقدمها المستخدمين حاليًا</p>
      </div>
    ` : `
      <div class="sch-requests-list">
        ${schRequests.map(r => renderRequestCard(r, true)).join('')}
      </div>
    `}
  `;
}

function renderMyRequestsView(container) {
  container.innerHTML = `
    <div class="sch-requests-header">
      <h3>📝 طلباتي (${schMyRequests.length})</h3>
    </div>

    ${schMyRequests.length === 0 ? `
      <div class="sch-empty">
        <div class="sch-empty-icon">📝</div>
        <h3>لا يوجد طلبات</h3>
        <p>لسه مقدمتش أي طلب</p>
      </div>
    ` : `
      <div class="sch-requests-list">
        ${schMyRequests.map(r => renderRequestCard(r, false)).join('')}
      </div>
    `}
  `;
}

function renderRequestCard(req, showActions) {
  const requester = schPeople[req.RequesterPersonID];
  const requesterName = req.RequesterName
    || (requester ? getPersonFullName(requester) : 'غير معروف');

  const requestedAt = parseDate(req.CreatedAt);
  const requestedAgo = requestedAt ? formatRelativeTime(requestedAt) : '';

  let statusBadge = '';
  if (req.Status === 'pending') statusBadge = '<span class="status-badge pending">⏳ في انتظار</span>';
  else if (req.Status === 'approved') statusBadge = '<span class="status-badge active">✅ موافق عليه</span>';
  else if (req.Status === 'rejected') statusBadge = '<span class="status-badge inactive">❌ مرفوض</span>';

  return `
    <div class="sch-request-card">
      <div class="sch-req-header">
        <div class="sch-req-person">
          <strong>👤 ${escapeHtml(requesterName)}</strong>
        </div>
        ${statusBadge}
      </div>

      <div class="sch-req-body">
        <div class="sch-req-line">
          <span>من:</span>
          <strong>${escapeHtml(req.FromEventTitle || '-')}</strong>
          ${req.FromDate ? `<span class="sch-req-date">${formatDateShort(req.FromDate)}</span>` : ''}
        </div>
        <div class="sch-req-line">
          <span>إلى:</span>
          <strong>${escapeHtml(req.ToEventTitle || '-')}</strong>
          ${req.ToDate ? `<span class="sch-req-date">${formatDateShort(req.ToDate)}</span>` : ''}
        </div>
        ${req.Reason ? `<div class="sch-req-reason"><strong>السبب:</strong> ${escapeHtml(req.Reason)}</div>` : ''}
      </div>

      ${requestedAgo ? `<div class="sch-req-time">🕐 منذ ${requestedAgo}</div>` : ''}

      ${showActions && req.Status === 'pending' ? `
        <div class="sch-req-actions">
          <button class="att-cancel-btn approve" onclick="approveRequest('${req.id}')">✅ موافقة</button>
          <button class="att-cancel-btn reject" onclick="rejectRequest('${req.id}')">❌ رفض</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   4. Templates View
// ═══════════════════════════════════════════════════════

function renderTemplatesView(container) {
  container.innerHTML = `
    <div class="sch-templates-header">
      <h3>⚙️ الأنماط (${schTemplates.length})</h3>
    </div>

    ${schTemplates.length === 0 ? `
      <div class="sch-empty">
        <div class="sch-empty-icon">⚙️</div>
        <h3>لا يوجد أنماط</h3>
        <p>الأنماط هتتضاف في مرحلة قادمة</p>
      </div>
    ` : `
      <div class="sch-templates-list">
        ${schTemplates.map(t => renderTemplateCard(t)).join('')}
      </div>
    `}
  `;
}

function renderTemplateCard(template) {
  const isActive = schSettings.ActiveMassTemplateID === template.id;

  return `
    <div class="sch-template-card ${isActive ? 'active' : ''}">
      <div class="sch-template-header">
        <h4>${escapeHtml(template.Name || '')}</h4>
        ${isActive ? '<span class="status-badge active">✅ نشط</span>' : ''}
      </div>
      ${template.Description ? `<p class="sch-template-desc">${escapeHtml(template.Description)}</p>` : ''}
      <div class="sch-template-info">
        <span>الحالة: ${template.Status === 'active' ? '✅ مفعل' : '⏸️ معطل'}</span>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Location Modal
// ═══════════════════════════════════════════════════════

window.openLocationModal = function(locId) {
  const isEdit = !!locId;
  const loc = isEdit ? schLocations.find(l => l.id === locId) : null;

  let modal = document.getElementById('locationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'locationModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ تعديل مكان' : '➕ إضافة مكان جديد'}</h2>
        <button class="modal-close" onclick="closeLocationModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-row">
          <label>اسم المكان *</label>
          <input type="text" id="locName" value="${loc ? escapeHtml(loc.Name || '') : ''}" placeholder="مثال: كنيسة مارمرقس" />
        </div>

        <div class="form-grid-2">
          <div class="form-row">
            <label>Latitude *</label>
            <input type="number" id="locLat" step="0.000001" value="${loc?.Lat || ''}" placeholder="27.179216" />
          </div>
          <div class="form-row">
            <label>Longitude *</label>
            <input type="number" id="locLng" step="0.000001" value="${loc?.Lng || ''}" placeholder="31.175953" />
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-row">
            <label>النطاق (بالأمتار)</label>
            <input type="number" id="locRadius" value="${loc?.Radius || 4}" min="1" max="1000" />
          </div>
          <div class="form-row">
            <label>السماحية (بالأمتار)</label>
            <input type="number" id="locTolerance" value="${loc?.Tolerance || 15}" min="1" max="1000" />
          </div>
        </div>

        <div class="form-row">
          <label>QR Code (اتركه فاضي لتوليده تلقائيًا)</label>
          <input type="text" id="locQR" value="${loc ? escapeHtml(loc.QRCode || '') : ''}" placeholder="ATTENDANCELOC..." />
        </div>

        <div class="form-row">
          <label>الحالة</label>
          <select id="locStatus">
            <option value="active" ${!loc || loc.Status === 'active' ? 'selected' : ''}>✅ نشط</option>
            <option value="inactive" ${loc && loc.Status === 'inactive' ? 'selected' : ''}>⏸️ معطل</option>
          </select>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeLocationModal()">إلغاء</button>
        <button class="btn-primary" onclick="saveLocation('${locId || ''}')">💾 حفظ</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
};

window.closeLocationModal = function() {
  const modal = document.getElementById('locationModal');
  if (modal) modal.style.display = 'none';
};

window.saveLocation = async function(locId) {
  const name = document.getElementById('locName')?.value.trim();
  const lat = parseFloat(document.getElementById('locLat')?.value || '');
  const lng = parseFloat(document.getElementById('locLng')?.value || '');
  const radius = parseInt(document.getElementById('locRadius')?.value || '4');
  const tolerance = parseInt(document.getElementById('locTolerance')?.value || '15');
  let qrCode = document.getElementById('locQR')?.value.trim() || '';
  const status = document.getElementById('locStatus')?.value || 'active';

  if (!name) { alert('اسم المكان مطلوب'); return; }
  if (isNaN(lat) || isNaN(lng)) { alert('الـCoordinates مطلوبة'); return; }

  if (!qrCode) {
    const randomPart = Math.random().toString(36).substring(2, 18);
    qrCode = 'ATTENDANCELOC' + randomPart;
  }

  const data = {
    Name: name,
    Lat: lat,
    Lng: lng,
    Radius: radius,
    Tolerance: tolerance,
    QRCode: qrCode,
    Status: status,
    Category: 'church',
    UpdatedAt: new Date().toISOString()
  };

  try {
    if (locId) {
      await updateDoc(doc(db, 'locations', locId), data);
      alert('✅ تم التعديل');
    } else {
      data.CreatedAt = new Date().toISOString();
      data.CreatedBy = schUser?.email || '';
      await addDoc(collection(db, 'locations'), data);
      alert('✅ تمت الإضافة');
    }

    closeLocationModal();
    await loadSchedulePage(document.getElementById('contentArea'));
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
};

window.editLocation = function(locId) {
  window.openLocationModal(locId);
};

window.deleteLocation = async function(locId) {
  const loc = schLocations.find(l => l.id === locId);
  if (!loc) return;
  if (!confirm(`⚠️ هل تريد حذف "${loc.Name}"؟`)) return;

  try {
    await deleteDoc(doc(db, 'locations', locId));
    alert('✅ تم الحذف');
    await loadSchedulePage(document.getElementById('contentArea'));
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
};

window.showLocationQR = function(locId) {
  const loc = schLocations.find(l => l.id === locId);
  if (!loc || !loc.QRCode) {
    alert('لا يوجد QR لهذا المكان');
    return;
  }

  let modal = document.getElementById('qrModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qrModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:400px;text-align:center;">
      <div class="modal-header">
        <h2>📷 QR - ${escapeHtml(loc.Name)}</h2>
        <button class="modal-close" onclick="closeQRModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:30px;">
        <div id="qrBigContainer" style="display:flex;justify-content:center;background:#fff;padding:20px;border-radius:12px;"></div>
        <p style="margin-top:16px;font-size:12px;color:#64748b;word-break:break-all;">${escapeHtml(loc.QRCode)}</p>
        <button class="btn-primary" onclick="printQR('${loc.id}')" style="margin-top:16px;width:100%;">🖨️ طباعة</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  setTimeout(() => {
    const container = document.getElementById('qrBigContainer');
    if (container && typeof QRCode !== 'undefined') {
      container.innerHTML = '';
      new QRCode(container, {
        text: loc.QRCode,
        width: 250,
        height: 250,
        colorDark: '#000',
        colorLight: '#fff'
      });
    }
  }, 100);
};

window.closeQRModal = function() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.style.display = 'none';
};

window.printQR = function(locId) {
  const loc = schLocations.find(l => l.id === locId);
  if (!loc) return;

  const container = document.getElementById('qrBigContainer');
  if (!container) return;

  const canvas = container.querySelector('canvas');
  if (!canvas) return;

  const imgData = canvas.toDataURL();

  const win = window.open('', '_blank');
  win.document.write(`
    <html dir="rtl">
      <head><title>QR - ${escapeHtml(loc.Name)}</title></head>
      <body style="text-align:center;font-family:Arial;padding:40px;">
        <h1>${escapeHtml(loc.Name)}</h1>
        <img src="${imgData}" style="width:400px;height:400px;" />
        <p style="margin-top:20px;font-size:14px;color:#666;">${escapeHtml(loc.QRCode)}</p>
        <script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script>
      </body>
    </html>
  `);
  win.document.close();
};

// ═══════════════════════════════════════════════════════
//   Requests — Approve / Reject (فعلي)
// ═══════════════════════════════════════════════════════

window.approveRequest = async function(reqId) {
  if (!confirm('✅ هل تريد الموافقة على الطلب؟\n\nسيتم نقل تسجيل الشخص من الحدث الأصلي للجديد.')) return;

  try {
    const reqDoc = await getDoc(doc(db, 'massChangeRequests', reqId));
    if (!reqDoc.exists()) {
      alert('❌ الطلب غير موجود');
      return;
    }

    const req = { id: reqDoc.id, ...reqDoc.data() };

    if (req.Status !== 'pending') {
      alert('⚠️ هذا الطلب مش في حالة انتظار');
      return;
    }

    const personId = req.RequesterPersonID;
    const fromEventId = req.FromEventID;
    const toEventId = req.ToEventID;

    // ═══ 1. حدّث التسجيل في الحدث الأصلي ═══
    let fromRegId = null;
    try {
      const q1 = query(
        collection(db, 'eventRegistrations'),
        where('EventID', '==', fromEventId),
        where('PersonID', '==', personId)
      );
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        fromRegId = snap1.docs[0].id;
        await updateDoc(doc(db, 'eventRegistrations', fromRegId), {
          Status: 'cancelled',
          CancelledAt: new Date().toISOString(),
          CancelApprovedAt: new Date().toISOString(),
          CancelApprovedBy: schUser.email,
          TransferedTo: toEventId,
          UpdatedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Update from registration error:', e);
    }

    // ═══ 2. أنشئ/حدّث التسجيل في الحدث الجديد ═══
    let toRegId = null;
    try {
      const q2 = query(
        collection(db, 'eventRegistrations'),
        where('EventID', '==', toEventId),
        where('PersonID', '==', personId)
      );
      const snap2 = await getDocs(q2);

      if (!snap2.empty) {
        toRegId = snap2.docs[0].id;
        await updateDoc(doc(db, 'eventRegistrations', toRegId), {
          Status: 'confirmed',
          ConfirmedAt: new Date().toISOString(),
          ConfirmedVia: 'transfer',
          TransferedFrom: fromEventId,
          UpdatedAt: new Date().toISOString()
        });
      } else {
        const person = schPeople[personId];
        const newRef = await addDoc(collection(db, 'eventRegistrations'), {
          EventID: toEventId,
          PersonID: personId,
          PersonName: person ? getPersonFullName(person) : req.RequesterName,
          PersonEmail: req.RequesterEmail || '',
          Status: 'confirmed',
          ConfirmedAt: new Date().toISOString(),
          ConfirmedVia: 'transfer',
          TransferedFrom: fromEventId,
          RegisteredBy: schUser.email,
          RegisteredAt: new Date().toISOString(),
          RejectedBefore: false,
          CreatedAt: new Date().toISOString()
        });
        toRegId = newRef.id;
      }
    } catch (e) {
      console.error('Create/update to registration error:', e);
    }

    // ═══ 3. حدّث الطلب ═══
    await updateDoc(doc(db, 'massChangeRequests', reqId), {
      Status: 'approved',
      ApprovedAt: new Date().toISOString(),
      ApprovedBy: schUser.email,
      FromRegistrationID: fromRegId,
      ToRegistrationID: toRegId
    });

    // ═══ 4. إشعار للشخص ═══
    try {
      await addDoc(collection(db, 'notifications'), {
        Type: 'transfer_approved',
        Title: '✅ تمت الموافقة على طلب النقل',
        Body: `تم نقل حضورك:\nمن: ${req.FromEventTitle || ''}\nإلى: ${req.ToEventTitle || ''}`,
        RelatedEventID: toEventId,
        RelatedPersonID: personId,
        TargetType: 'person',
        TargetPersonID: personId,
        SentBy: 'system',
        SentAt: new Date().toISOString(),
        ReadBy: [],
        CreatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Notification error:', e);
    }

    alert('✅ تمت الموافقة\n\nتم نقل التسجيل بنجاح.');
    await loadSchedulePage(document.getElementById('contentArea'));
  } catch (err) {
    console.error('❌ approveRequest error:', err);
    alert('خطأ: ' + err.message);
  }
};

window.rejectRequest = async function(reqId) {
  if (!confirm('❌ هل تريد رفض الطلب؟\n\nتسجيل الشخص في الحدث الأصلي هيفضل كما هو.')) return;

  try {
    const reqDoc = await getDoc(doc(db, 'massChangeRequests', reqId));
    if (!reqDoc.exists()) {
      alert('❌ الطلب غير موجود');
      return;
    }

    const req = { id: reqDoc.id, ...reqDoc.data() };

    if (req.Status !== 'pending') {
      alert('⚠️ هذا الطلب مش في حالة انتظار');
      return;
    }

    // ═══ 1. حدّث الطلب ═══
    await updateDoc(doc(db, 'massChangeRequests', reqId), {
      Status: 'rejected',
      RejectedAt: new Date().toISOString(),
      RejectedBy: schUser.email
    });

    // ═══ 2. إشعار للشخص ═══
    try {
      await addDoc(collection(db, 'notifications'), {
        Type: 'transfer_rejected',
        Title: '❌ تم رفض طلب النقل',
        Body: `تم رفض طلب نقل حضورك:\nمن: ${req.FromEventTitle || ''}\nإلى: ${req.ToEventTitle || ''}\n\nتسجيلك في الحدث الأصلي كما هو.`,
        RelatedEventID: req.FromEventID,
        RelatedPersonID: req.RequesterPersonID,
        TargetType: 'person',
        TargetPersonID: req.RequesterPersonID,
        SentBy: 'system',
        SentAt: new Date().toISOString(),
        ReadBy: [],
        CreatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Notification error:', e);
    }

    alert('❌ تم رفض الطلب');
    await loadSchedulePage(document.getElementById('contentArea'));
  } catch (err) {
    console.error('❌ rejectRequest error:', err);
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

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  } catch (e) {
    return dateStr;
  }
}

function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return date.toLocaleDateString('ar-EG');
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
}

function getPersonFullName(p) {
  if (!p) return '';
  return [p.FirstName, p.SecondName, p.ThirdName, p.FourthName].filter(Boolean).join(' ');
}

function getEventLocationText(event) {
  const mode = String(event.LocationMode || 'any').toLowerCase();
  if (mode === 'any') return 'أي مكان';

  const ids = Array.isArray(event.LocationIds) ? event.LocationIds : [];
  if (ids.length === 0) return 'لم يحدد';

  const names = ids.map(id => {
    const loc = schLocations.find(l => l.id === id);
    return loc ? loc.Name : null;
  }).filter(Boolean);

  return names.length > 0 ? names.join(' • ') : 'مكان محذوف';
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

window.loadSchedulePage = loadSchedulePage;
