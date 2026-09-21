// ═══════════════════════════════════════════════════════
//   Schedule (الجدول) — 5 تابات داخلية
//   ⚡ محدّث: عرض الملتزمين + Popup التفاصيل
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
let schRegistrations = {};     // { eventId: [registrations] }
let schPeople = {};            // { personId: person }
let schSettings = {};

// ═══ أيام الأسبوع ═══
const DAYS_OF_WEEK = [
  { value: 'Saturday',  label: 'السبت', icon: '🕯️' },
  { value: 'Sunday',    label: 'الأحد', icon: '⛪' },
  { value: 'Monday',    label: 'الاثنين', icon: '📅' },
  { value: 'Tuesday',   label: 'الثلاثاء', icon: '📅' },
  { value: 'Wednesday', label: 'الأربعاء', icon: '📅' },
  { value: 'Thursday',  label: 'الخميس', icon: '📅' },
  { value: 'Friday',    label: 'الجمعة', icon: '⛪' }
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

    // ⚡ اجلب كل البيانات
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

    // ⚡ خزّن الناس
    schPeople = {};
    peopleSnap.docs.forEach(d => {
      schPeople[d.id] = { id: d.id, ...d.data() };
    });

    // ⚡ خزّن التسجيلات بـeventId
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
//   1. Grid View (الجدول الأسبوعي)
// ═══════════════════════════════════════════════════════

function renderGridView(container) {
  // ⚡ نعرض الأحداث الأسبوعية النشطة بس
  const activeWeeklyEvents = schEvents.filter(e =>
    String(e.Status || '').toLowerCase() === 'active' &&
    String(e.Type || '').toLowerCase() === 'weekly'
  );

  // ⚡ توزيع على الأيام
  const eventsByDay = {};
  DAYS_OF_WEEK.forEach(d => eventsByDay[d.value] = []);

  activeWeeklyEvents.forEach(event => {
    if (event.DayOfWeek && eventsByDay[event.DayOfWeek]) {
      eventsByDay[event.DayOfWeek].push(event);
    }
  });

  // ⚡ رتب حسب الوقت
  Object.values(eventsByDay).forEach(list => {
    list.sort((a, b) => String(a.Time || '').localeCompare(String(b.Time || '')));
  });

  container.innerHTML = `
    <div class="sch-grid">
      ${DAYS_OF_WEEK.map(day => {
        const dayEvents = eventsByDay[day.value] || [];
        return `
          <div class="sch-day">
            <div class="sch-day-header">
              <span class="sch-day-icon">${day.icon}</span>
              <span class="sch-day-label">${day.label}</span>
              <span class="sch-day-count">${dayEvents.length}</span>
            </div>
            <div class="sch-day-body">
              ${dayEvents.length === 0 ? `
                <div class="sch-day-empty">لا يوجد أحداث</div>
              ` : dayEvents.map(e => renderGridEventCard(e)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderGridEventCard(event) {
  const eventType = schEventTypes.find(t => t.id === event.EventTypeID);
  const eventTypeIcon = eventType ? (eventType.Icon || '📅') : '📅';
  const endTime = getEventEndTime(event);
  const locInfo = getEventLocationText(event);

  // ⚡ احسب إحصائيات الملتزمين
  const stats = getEventAttendeesStats(event);

  return `
    <div class="sch-event-card" onclick="openEventAttendeesModal('${event.id}')" style="cursor:pointer;">
      <div class="sch-event-header">
        <span class="sch-event-icon">${eventTypeIcon}</span>
        <span class="sch-event-title">${escapeHtml(event.Title || '')}</span>
      </div>
      <div class="sch-event-info">
        <span class="sch-event-time">🕐 ${event.Time || '-'} - ${endTime}</span>
        <span class="sch-event-loc">📍 ${escapeHtml(locInfo)}</span>
      </div>
      <div class="sch-event-stats">
        <span class="sch-stat-committed">👥 ${stats.committed} ملتزم</span>
        <span class="sch-stat-confirmed">✅ ${stats.confirmed} مؤكد</span>
      </div>
    </div>
  `;
}

/**
 * ⚡ احسب إحصائيات الملتزمين لحدث
 */
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

/**
 * ⚡ اجلب قائمة الملتزمين لحدث معين
 * - كل الناس النشطين (لو all)
 * - قائمة محددة (لو specific)
 * ⚡ كل عنصر فيه: { person, rsvpStatus, registration }
 */
function getEventAttendees(event) {
  const scope = String(event.RegistrationScope || 'all').toLowerCase();
  const registrations = schRegistrations[event.id] || [];

  // ⚡ 1. جهّز الـregistrations map
  const regByPerson = {};
  registrations.forEach(r => {
    if (r.PersonID) regByPerson[r.PersonID] = r;
  });

  // ⚡ 2. حدد الـpersonIds الملتزمين
  let personIds = [];

  if (scope === 'specific') {
    const ids = Array.isArray(event.RegistrationPersonIDs) ? event.RegistrationPersonIDs : [];
    personIds = ids.filter(id => schPeople[id]);
  } else {
    // ⚡ all → كل الناس النشطين
    personIds = Object.keys(schPeople).filter(id => {
      const p = schPeople[id];
      return String(p.Status || 'active').toLowerCase() === 'active';
    });
  }

  // ⚡ 3. اجمع المعلومات
  const attendees = personIds.map(personId => {
    const person = schPeople[personId];
    const reg = regByPerson[personId];
    const rsvpStatus = reg?.Status || 'pending';

    return { person, rsvpStatus, registration: reg };
  });

  // ⚡ 4. رتب: confirmed → pending → cancel_requested → cancelled
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
//   Event Attendees Modal (Popup التفاصيل)
// ═══════════════════════════════════════════════════════

window.openEventAttendeesModal = function(eventId) {
  const event = schEvents.find(e => e.id === eventId);
  if (!event) {
    alert('الحدث غير موجود');
    return;
  }

  const attendees = getEventAttendees(event);
  const stats = getEventAttendeesStats(event);

  // ⚡ المجموعات
  const confirmedList = attendees.filter(a => a.rsvpStatus === 'confirmed');
  const pendingList = attendees.filter(a => a.rsvpStatus === 'pending');
  const cancelRequestedList = attendees.filter(a => a.rsvpStatus === 'cancel_requested');
  const cancelledList = attendees.filter(a => a.rsvpStatus === 'cancelled');

  const eventType = schEventTypes.find(t => t.id === event.EventTypeID);
  const eventTypeIcon = eventType ? (eventType.Icon || '📅') : '📅';
  const eventTypeName = eventType ? eventType.Name : '';
  const endTime = getEventEndTime(event);
  const locInfo = getEventLocationText(event);
  const dayLabel = DAYS_OF_WEEK.find(d => d.value === event.DayOfWeek)?.label || '';

  let modal = document.getElementById('attendeesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'attendeesModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:600px;max-height:85vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>${eventTypeIcon} ${escapeHtml(event.Title || '')}</h2>
        <button class="modal-close" onclick="closeAttendeesModal()">✕</button>
      </div>

      <div class="modal-body" style="overflow-y:auto;flex:1;">

        <!-- ═══ معلومات الحدث ═══ -->
        <div class="att-event-info">
          ${eventTypeName ? `<div class="att-event-line"><span>📋</span><span>${escapeHtml(eventTypeName)}</span></div>` : ''}
          ${dayLabel ? `<div class="att-event-line"><span>🔄</span><span>كل ${dayLabel}</span></div>` : ''}
          <div class="att-event-line"><span>🕐</span><span>${event.Time || '-'} - ${endTime}</span></div>
          <div class="att-event-line"><span>📍</span><span>${escapeHtml(locInfo)}</span></div>
        </div>

        <!-- ═══ إحصائيات ═══ -->
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

        <!-- ═══ قائمة الملتزمين ═══ -->
        ${renderAttendeesGroup('✅ المؤكدين', confirmedList, 'confirmed')}
        ${renderAttendeesGroup('⏳ في انتظار التأكيد', pendingList, 'pending')}
        ${renderAttendeesGroup('🔄 طلبات إلغاء (بانتظار موافقة)', cancelRequestedList, 'cancel-requested')}
        ${renderAttendeesGroup('❌ الملغيين', cancelledList, 'cancelled')}

        ${attendees.length === 0 ? `
          <div class="att-empty">
            <div class="att-empty-icon">👥</div>
            <p>لا يوجد ملتزمين بهذا الحدث</p>
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
//   Location Modal (Add/Edit)
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
//   Requests — Approve/Reject
// ═══════════════════════════════════════════════════════

window.approveRequest = async function(reqId) {
  if (!confirm('✅ هل تريد الموافقة على الطلب؟')) return;

  try {
    await updateDoc(doc(db, 'massChangeRequests', reqId), {
      Status: 'approved',
      ApprovedAt: new Date().toISOString(),
      ApprovedBy: schUser.email
    });

    alert('✅ تمت الموافقة');
    await loadSchedulePage(document.getElementById('contentArea'));
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
};

window.rejectRequest = async function(reqId) {
  if (!confirm('❌ هل تريد رفض الطلب؟')) return;

  try {
    await updateDoc(doc(db, 'massChangeRequests', reqId), {
      Status: 'rejected',
      RejectedAt: new Date().toISOString(),
      RejectedBy: schUser.email
    });

    alert('❌ تم الرفض');
    await loadSchedulePage(document.getElementById('contentArea'));
  } catch (err) {
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
