// ═══════════════════════════════════════════════════════
//   Events Management (Firestore)
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC
} from './firebase-config.js';

// ═══ State ═══
let eventsData = [];
let filteredEvents = [];
let currentEditId = null;
let currentFilter = 'all';
let currentMode = 'manage';
let settingsCache = null;
let availableLocations = [];
let availableEventTypes = [];
let availablePeople = [];

// ═══ أيام الأسبوع ═══
const DAYS_OF_WEEK = [
  { value: 'Saturday',  label: 'السبت' },
  { value: 'Sunday',    label: 'الأحد' },
  { value: 'Monday',    label: 'الاثنين' },
  { value: 'Tuesday',   label: 'الثلاثاء' },
  { value: 'Wednesday', label: 'الأربعاء' },
  { value: 'Thursday',  label: 'الخميس' },
  { value: 'Friday',    label: 'الجمعة' }
];

// ═══════════════════════════════════════════════════════
//   Load Events Page
// ═══════════════════════════════════════════════════════

async function loadEventsPage(area, mode) {
  currentMode = (mode === 'view') ? 'view' : 'manage';
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const [
      eventsSnap,
      settingsDoc,
      locationsSnap,
      eventTypesSnap,
      peopleSnap
    ] = await Promise.all([
      getDocs(collection(db, 'events')),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC)),
      getDocs(collection(db, 'locations')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'eventTypes')).catch(() => ({ docs: [] })),
      getDocs(collection(db, COLLECTIONS.PEOPLE)).catch(() => ({ docs: [] }))
    ]);

    eventsData = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    settingsCache = settingsDoc.exists() ? settingsDoc.data() : {};

    availableLocations = locationsSnap.docs
      ? locationsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      : [];

    availableEventTypes = eventTypesSnap.docs
      ? eventTypesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0))
      : [];

    availablePeople = peopleSnap.docs
      ? peopleSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      : [];

    let eventsToShow = eventsData;
    if (currentMode === 'view') {
      eventsToShow = eventsData.filter(e =>
        String(e.Status || '').toLowerCase() === 'active'
      );
    }

    eventsToShow.sort((a, b) => {
      const statusOrder = { active: 0, cancelled: 1, inactive: 2, archived: 3 };
      const aOrder = statusOrder[String(a.Status || '').toLowerCase()] ?? 4;
      const bOrder = statusOrder[String(b.Status || '').toLowerCase()] ?? 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.Time || '').localeCompare(String(b.Time || ''));
    });

    filteredEvents = [...eventsToShow];
    renderEventsPage(area);
  } catch (err) {
    console.error('❌ Load events error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadEventsPage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderEventsPage(area) {
  const isView = currentMode === 'view';

  const filtersHtml = isView
    ? `
      <div class="events-filters">
        <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
        <button class="filter-btn ${currentFilter === 'weekly' ? 'active' : ''}" data-filter="weekly">أسبوعي</button>
        <button class="filter-btn ${currentFilter === 'once' ? 'active' : ''}" data-filter="once">مرة واحدة</button>
      </div>
    `
    : `
      <div class="events-filters">
        <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
        <button class="filter-btn ${currentFilter === 'active' ? 'active' : ''}" data-filter="active">نشط</button>
        <button class="filter-btn ${currentFilter === 'inactive' ? 'active' : ''}" data-filter="inactive">غير نشط</button>
        <button class="filter-btn ${currentFilter === 'weekly' ? 'active' : ''}" data-filter="weekly">أسبوعي</button>
        <button class="filter-btn ${currentFilter === 'once' ? 'active' : ''}" data-filter="once">مرة واحدة</button>
        <button class="filter-btn ${currentFilter === 'archived' ? 'active' : ''}" data-filter="archived">مؤرشف</button>
      </div>
    `;

  const addBtnHtml = isView
    ? ''
    : `<button class="btn-primary" onclick="openEventModal()">➕ إضافة حدث</button>`;

  const statsHtml = isView
    ? `
      <div class="events-stats">
        <div class="event-stat">
          <span class="event-stat-value">${eventsData.filter(e => String(e.Status || '').toLowerCase() === 'active').length}</span>
          <span class="event-stat-label">حدث نشط</span>
        </div>
        <div class="event-stat">
          <span class="event-stat-value">${eventsData.filter(e => String(e.Type || '').toLowerCase() === 'weekly' && String(e.Status || '').toLowerCase() === 'active').length}</span>
          <span class="event-stat-label">أسبوعي</span>
        </div>
        <div class="event-stat">
          <span class="event-stat-value">${eventsData.filter(e => String(e.Type || '').toLowerCase() === 'once' && String(e.Status || '').toLowerCase() === 'active').length}</span>
          <span class="event-stat-label">مرة واحدة</span>
        </div>
      </div>
    `
    : `
      <div class="events-stats">
        <div class="event-stat">
          <span class="event-stat-value">${eventsData.length}</span>
          <span class="event-stat-label">إجمالي</span>
        </div>
        <div class="event-stat">
          <span class="event-stat-value">${eventsData.filter(e => String(e.Status || '').toLowerCase() === 'active').length}</span>
          <span class="event-stat-label">نشط</span>
        </div>
        <div class="event-stat">
          <span class="event-stat-value">${eventsData.filter(e => String(e.Type || '').toLowerCase() === 'weekly').length}</span>
          <span class="event-stat-label">أسبوعي</span>
        </div>
        <div class="event-stat">
          <span class="event-stat-value">${eventsData.filter(e => String(e.Status || '').toLowerCase() === 'archived').length}</span>
          <span class="event-stat-label">مؤرشف</span>
        </div>
      </div>
    `;

  const emptyBtnHtml = isView
    ? ''
    : `<button class="btn-primary" onclick="openEventModal()">➕ إضافة حدث</button>`;

  area.innerHTML = `
    <div class="events-container">
      <div class="events-header">
        ${filtersHtml}
        ${addBtnHtml}
      </div>
      ${statsHtml}
      <div class="events-grid" id="eventsGrid"></div>
      <div id="eventsEmptyState" class="events-empty" style="display:none;">
        <div class="events-empty-icon">📅</div>
        <h3>لا يوجد أحداث</h3>
        <p>${isView ? 'لم يتم إضافة أحداث بعد' : 'ابدأ بإضافة حدث جديد'}</p>
        ${emptyBtnHtml}
      </div>
    </div>
  `;

  renderEventsGrid();
  setupEventsEvents();
}

// ═══════════════════════════════════════════════════════
//   Render Grid
// ═══════════════════════════════════════════════════════

function renderEventsGrid() {
  const grid = document.getElementById('eventsGrid');
  const emptyState = document.getElementById('eventsEmptyState');
  if (!grid) return;

  if (filteredEvents.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  const isView = currentMode === 'view';

  grid.innerHTML = filteredEvents.map(event => {
    const status = String(event.Status || 'active').toLowerCase();
    const type = String(event.Type || 'once').toLowerCase();
    const canceledOccurrences = event.CanceledOccurrences || [];

    let statusBadge = '';
    if (status === 'archived') {
      statusBadge = '<span class="status-badge archived">📦 مؤرشف</span>';
    } else if (status === 'cancelled') {
      statusBadge = '<span class="status-badge inactive">❌ ملغي</span>';
    } else if (status === 'inactive') {
      statusBadge = '<span class="status-badge inactive">⏸️ غير نشط</span>';
    } else {
      statusBadge = '<span class="status-badge active">✅ نشط</span>';
    }

    const eventType = availableEventTypes.find(t => t.id === event.EventTypeID);
    const eventTypeBadge = eventType
      ? `<span class="event-type-badge">${eventType.Icon || '📅'} ${escapeHtml(eventType.Name)}</span>`
      : '';

    const typeBadge = type === 'weekly'
      ? '<span class="type-badge weekly">🔄 أسبوعي</span>'
      : '<span class="type-badge once">1️⃣ مرة واحدة</span>';

    let dateInfo = '';
    if (type === 'weekly') {
      const dayLabel = getDayLabel(event.DayOfWeek);
      dateInfo = `كل ${dayLabel}`;
    } else {
      dateInfo = formatDate(event.Date);
    }

    const startTime = event.Time || '-';
    const endTime = getEventEndTime(event);
    const timeInfo = `${startTime} - ${endTime}`;

    const locationsInfo = getLocationsInfoText(event);

    const cancelInfo = canceledOccurrences.length > 0
      ? `<span class="cancel-count">${canceledOccurrences.length} موعد ملغي</span>`
      : '';

    const regScope = String(event.RegistrationScope || 'all').toLowerCase();
    const regPersonIds = Array.isArray(event.RegistrationPersonIDs) ? event.RegistrationPersonIDs : [];
    let regInfo = '';
    if (regScope === 'optional') {
      regInfo = '<span class="reg-badge reg-optional">🟢 اختياري</span>';
    } else if (regScope === 'specific') {
      regInfo = `<span class="reg-badge reg-specific">👥 إلزامي لقائمة (${regPersonIds.length})</span>`;
    } else {
      regInfo = '<span class="reg-badge reg-all">🌍 إلزامي للكل</span>';
    }

    const footerHtml = isView
      ? `<div class="event-card-footer">
          <button class="btn-icon" onclick="viewOccurrences('${event.id}')" title="المواعيد">📋 المواعيد</button>
        </div>`
      : `<div class="event-card-footer">
          <button class="btn-icon" onclick="viewOccurrences('${event.id}')" title="المواعيد">📋</button>
          <button class="btn-icon" onclick="editEvent('${event.id}')" title="تعديل">✏️</button>
          ${status !== 'archived' ? `<button class="btn-icon" onclick="archiveEvent('${event.id}')" title="أرشفة">📦</button>` : ''}
          <button class="btn-icon danger" onclick="confirmDeleteEvent('${event.id}')" title="حذف">🗑️</button>
        </div>`;

    return `
      <div class="event-card" data-id="${event.id}">
        <div class="event-card-header">
          <h3>${escapeHtml(event.Title || 'بدون عنوان')}</h3>
          <div class="event-badges">
            ${statusBadge}
          </div>
        </div>
        <div class="event-card-body">
          <div class="event-info">
            ${eventTypeBadge ? `<div class="event-info-row"><span class="event-info-icon">📋</span><span>${eventTypeBadge}</span></div>` : ''}
            <div class="event-info-row">
              <span class="event-info-icon">${type === 'weekly' ? '🔄' : '📅'}</span>
              <span>${typeBadge}</span>
            </div>
            <div class="event-info-row">
              <span class="event-info-icon">📆</span>
              <span>${dateInfo}</span>
            </div>
            <div class="event-info-row">
              <span class="event-info-icon">🕐</span>
              <span>${escapeHtml(timeInfo)}</span>
            </div>
            <div class="event-info-row">
              <span class="event-info-icon">📍</span>
              <span>${locationsInfo}</span>
            </div>
            <div class="event-info-row">
              <span class="event-info-icon">👥</span>
              <span>${regInfo}</span>
            </div>
            ${cancelInfo ? `<div class="event-info-row"><span class="event-info-icon">⚠️</span>${cancelInfo}</div>` : ''}
          </div>
        </div>
        ${footerHtml}
      </div>
    `;
  }).join('');
}

function getLocationsInfoText(event) {
  const mode = String(event.LocationMode || 'any').toLowerCase();

  if (mode === 'any') {
    return `<span style="color:#16a34a;">أي مكان مسجل</span>`;
  }

  const ids = Array.isArray(event.LocationIds) && event.LocationIds.length > 0
    ? event.LocationIds
    : (event.LocationID ? [event.LocationID] : []);

  if (ids.length === 0) {
    return `<span style="color:#d97706;">لم يتم تحديد أماكن</span>`;
  }

  const names = ids.map(id => {
    const loc = availableLocations.find(l => l.id === id);
    return loc ? loc.Name : 'مكان محذوف';
  });

  if (mode === 'single') {
    return escapeHtml(names[0] || 'مكان محدد');
  }

  return escapeHtml(names.join(' • '));
}

// ═══════════════════════════════════════════════════════
//   Filters
// ═══════════════════════════════════════════════════════

function setupEventsEvents() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter();
    };
  });
}

function applyFilter() {
  const isView = currentMode === 'view';
  const baseData = isView
    ? eventsData.filter(e => String(e.Status || '').toLowerCase() === 'active')
    : eventsData;

  if (currentFilter === 'all') filteredEvents = [...baseData];
  else if (currentFilter === 'active') filteredEvents = baseData.filter(e => String(e.Status || '').toLowerCase() === 'active');
  else if (currentFilter === 'inactive') filteredEvents = baseData.filter(e => String(e.Status || '').toLowerCase() === 'inactive');
  else if (currentFilter === 'weekly') filteredEvents = baseData.filter(e => String(e.Type || '').toLowerCase() === 'weekly');
  else if (currentFilter === 'once') filteredEvents = baseData.filter(e => String(e.Type || '').toLowerCase() === 'once');
  else if (currentFilter === 'archived') filteredEvents = baseData.filter(e => String(e.Status || '').toLowerCase() === 'archived');

  renderEventsGrid();
}

// ═══════════════════════════════════════════════════════
//   Event Modal
// ═══════════════════════════════════════════════════════

function openEventModal(eventId) {
  if (currentMode === 'view') {
    alert('غير مصرح لك بإضافة أو تعديل الأحداث');
    return;
  }

  currentEditId = eventId || null;
  const event = eventId ? eventsData.find(e => e.id === eventId) : null;
  const isEdit = !!event;

  let modal = document.getElementById('eventModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'eventModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const type = event ? String(event.Type || 'once').toLowerCase() : 'once';
  const locationMode = event ? String(event.LocationMode || 'any').toLowerCase() : 'any';
  const locationIds = event && Array.isArray(event.LocationIds) ? event.LocationIds : [];
  const noLocations = availableLocations.length === 0;
  const noEventTypes = availableEventTypes.length === 0;
  const todayISO = formatDateISO(new Date());
  const endTime = event ? getEventEndTime(event) : '21:00';
  const regScope = event ? String(event.RegistrationScope || 'all').toLowerCase() : 'all';
  const regPersonIds = event && Array.isArray(event.RegistrationPersonIDs) ? event.RegistrationPersonIDs : [];
  const selectedTypeId = event ? String(event.EventTypeID || '') : (availableEventTypes[0]?.id || '');

  modal.innerHTML = `
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ تعديل حدث' : '➕ إضافة حدث جديد'}</h2>
        <button class="modal-close" onclick="closeEventModal()">✕</button>
      </div>
      <div class="modal-body">

        <div class="form-row">
          <label>عنوان الحدث *</label>
          <input type="text" id="eventTitle" value="${event ? escapeHtml(event.Title || '') : ''}" placeholder="مثال: قداس الأحد" />
        </div>

        <div class="form-row">
          <label>نوع الحدث *</label>
          ${noEventTypes
            ? '<p class="hint" style="color:#dc2626;">⚠️ لا توجد أنواع أحداث مسجلة. تواصل مع المسؤول.</p>'
            : `<select id="eventTypeID">
                ${availableEventTypes.map(t => `
                  <option value="${t.id}" ${selectedTypeId === t.id ? 'selected' : ''}>${t.Icon || '📅'} ${escapeHtml(t.Name)}</option>
                `).join('')}
              </select>`
          }
        </div>

        <div class="form-row">
          <label>نوع التكرار *</label>
          <select id="eventType">
            <option value="once" ${type === 'once' ? 'selected' : ''}>مرة واحدة</option>
            <option value="weekly" ${type === 'weekly' ? 'selected' : ''}>أسبوعي</option>
          </select>
        </div>

        <div id="onceFields" style="${type === 'once' ? '' : 'display:none;'}">
          <div class="form-row">
            <label>التاريخ *</label>
            <input type="date" id="eventDate" value="${event && event.Date ? event.Date : ''}" min="${todayISO}" />
            <p class="hint">لا يمكن اختيار تاريخ في الماضي</p>
          </div>
        </div>

        <div id="weeklyFields" style="${type === 'weekly' ? '' : 'display:none;'}">
          <div class="form-row">
            <label>يوم الأسبوع *</label>
            <select id="eventDayOfWeek">
              ${DAYS_OF_WEEK.map(d => `
                <option value="${d.value}" ${event && event.DayOfWeek === d.value ? 'selected' : ''}>${d.label}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-row">
            <label>وقت البداية *</label>
            <input type="time" id="eventTime" value="${event && event.Time ? event.Time : '19:00'}" />
          </div>
          <div class="form-row">
            <label>وقت النهاية *</label>
            <input type="time" id="eventEndTime" value="${endTime}" />
          </div>
        </div>
        <p class="hint">تأكد أن وقت النهاية بعد وقت البداية</p>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="eventActive" ${!event || String(event.Status || 'active').toLowerCase() === 'active' ? 'checked' : ''} />
          <label for="eventActive">نشط</label>
        </div>

        <!-- ═══ قواعد التسجيل ═══ -->
        <div class="modal-section">
          <h4 class="modal-section-title">⚙️ قواعد التسجيل</h4>

          <div class="location-mode-options">
            <label class="location-mode-option">
              <input type="radio" name="regScope" value="all" ${regScope === 'all' ? 'checked' : ''} />
              <span>🌍 إلزامي لكل الأشخاص</span>
              <small>كل شخص في النظام ملتزم بالحضور</small>
            </label>
            <label class="location-mode-option">
              <input type="radio" name="regScope" value="specific" ${regScope === 'specific' ? 'checked' : ''} />
              <span>👥 إلزامي لقائمة محددة</span>
              <small>اختر أشخاص معينين فقط</small>
            </label>
            <label class="location-mode-option">
              <input type="radio" name="regScope" value="optional" ${regScope === 'optional' ? 'checked' : ''} />
              <span>🟢 اختياري (بدون إلزام)</span>
              <small>أي شخص يقدر يسجّل — بدون إلزام أو غياب</small>
            </label>
          </div>

          <div id="specificPeopleBox" class="location-picker-box" style="${regScope === 'specific' ? '' : 'display:none;'}">
            <label>اختر الأشخاص الملتزمين</label>
            <div class="locations-checkbox-list" id="regPeopleList"></div>
          </div>
        </div>

        <!-- ═══ الأماكن ═══ -->
        <div class="modal-section">
          <h4 class="modal-section-title">📍 الأماكن المسموحة</h4>

          ${noLocations ? `
            <div class="locations-warning">⚠️ لا توجد أماكن مسجلة. أضف أماكن من الإعدادات أولاً.</div>
          ` : `
            <div class="location-mode-options">
              <label class="location-mode-option">
                <input type="radio" name="locationMode" value="any" ${locationMode === 'any' ? 'checked' : ''} />
                <span>🌍 أي مكان مسجل</span>
                <small>يمكن التسجيل من أي مكان مضاف في النظام</small>
              </label>
              <label class="location-mode-option">
                <input type="radio" name="locationMode" value="single" ${locationMode === 'single' ? 'checked' : ''} />
                <span>📍 مكان واحد محدد</span>
                <small>التسجيل من مكان واحد فقط</small>
              </label>
              <label class="location-mode-option">
                <input type="radio" name="locationMode" value="multiple" ${locationMode === 'multiple' ? 'checked' : ''} />
                <span>📌 أماكن محددة (متعددة)</span>
                <small>اختر مجموعة من الأماكن المسموح بها</small>
              </label>
            </div>

            <div id="singleLocationBox" class="location-picker-box" style="${locationMode === 'single' ? '' : 'display:none;'}">
              <label>اختر المكان</label>
              <select id="singleLocationSelect">
                ${availableLocations.map(loc => `
                  <option value="${loc.id}" ${locationIds[0] === loc.id ? 'selected' : ''}>${escapeHtml(loc.Name)}</option>
                `).join('')}
              </select>
            </div>

            <div id="multipleLocationsBox" class="location-picker-box" style="${locationMode === 'multiple' ? '' : 'display:none;'}">
              <label>اختر الأماكن المسموحة</label>
              <div class="locations-checkbox-list">
                ${availableLocations.map(loc => `
                  <label class="location-checkbox-item">
                    <input type="checkbox" value="${loc.id}" ${locationIds.includes(loc.id) ? 'checked' : ''} />
                    <span>${escapeHtml(loc.Name)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `}
        </div>

        <!-- ═══ 🔔 إشعار ═══ -->
        ${!isEdit ? `
          <div class="modal-section">
            <h4 class="modal-section-title">🔔 إشعار</h4>

            <div class="location-mode-options">
              <label class="location-mode-option">
                <input type="radio" name="notifType" value="none" checked />
                <span>🔕 بدون إشعار</span>
                <small>لن يتم إرسال أي إشعار</small>
              </label>
              <label class="location-mode-option">
                <input type="radio" name="notifType" value="all" />
                <span>🌍 للكل</span>
                <small>سيتم إرسال الإشعار لكل المستخدمين</small>
              </label>
              <label class="location-mode-option">
                <input type="radio" name="notifType" value="specific" />
                <span>👥 لمجموعة محددة</span>
                <small>اختر أشخاص معينين</small>
              </label>
            </div>

            <div id="notifPeopleBox" class="location-picker-box" style="display:none;">
              <label>اختر الأشخاص</label>
              <div class="locations-checkbox-list" id="notifPeopleList"></div>
            </div>
          </div>
        ` : ''}

      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeEventModal()">إلغاء</button>
        <button class="btn-primary" onclick="saveEvent()">💾 حفظ</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const typeSelect = document.getElementById('eventType');
  if (typeSelect) {
    typeSelect.onchange = (e) => {
      const onceFields = document.getElementById('onceFields');
      const weeklyFields = document.getElementById('weeklyFields');
      if (e.target.value === 'once') {
        if (onceFields) onceFields.style.display = 'block';
        if (weeklyFields) weeklyFields.style.display = 'none';
      } else {
        if (onceFields) onceFields.style.display = 'none';
        if (weeklyFields) weeklyFields.style.display = 'block';
      }
    };
  }

  document.querySelectorAll('input[name="regScope"]').forEach(radio => {
    radio.onchange = (e) => {
      const box = document.getElementById('specificPeopleBox');
      if (e.target.value === 'specific') {
        if (box) box.style.display = 'block';
      } else {
        if (box) box.style.display = 'none';
      }
    };
  });

  document.querySelectorAll('input[name="locationMode"]').forEach(radio => {
    radio.onchange = (e) => {
      const singleBox = document.getElementById('singleLocationBox');
      const multipleBox = document.getElementById('multipleLocationsBox');
      if (e.target.value === 'single') {
        if (singleBox) singleBox.style.display = 'block';
        if (multipleBox) multipleBox.style.display = 'none';
      } else if (e.target.value === 'multiple') {
        if (singleBox) singleBox.style.display = 'none';
        if (multipleBox) multipleBox.style.display = 'block';
      } else {
        if (singleBox) singleBox.style.display = 'none';
        if (multipleBox) multipleBox.style.display = 'none';
      }
    };
  });

  document.querySelectorAll('input[name="notifType"]').forEach(radio => {
    radio.onchange = (e) => {
      const box = document.getElementById('notifPeopleBox');
      if (e.target.value === 'specific') {
        if (box) box.style.display = 'block';
      } else {
        if (box) box.style.display = 'none';
      }
    };
  });

  const regPeopleList = document.getElementById('regPeopleList');
  if (regPeopleList) {
    fillPeopleList(regPeopleList, regPersonIds);
  }

  const notifPeopleList = document.getElementById('notifPeopleList');
  if (notifPeopleList) {
    fillPeopleList(notifPeopleList, []);
  }

  setTimeout(() => {
    const titleInput = document.getElementById('eventTitle');
    if (titleInput) titleInput.focus();
  }, 100);
}

function fillPeopleList(container, selectedIds) {
  if (!container) return;

  const selected = Array.isArray(selectedIds) ? selectedIds : [];

  const activePeople = availablePeople
    .filter(p => String(p.Status || '').toLowerCase() === 'active')
    .sort((a, b) => getPersonFullName(a).localeCompare(getPersonFullName(b), 'ar'));

  if (activePeople.length === 0) {
    container.innerHTML = '<p class="hint" style="padding:8px;color:#94a3b8;">لا يوجد أشخاص نشطين</p>';
    return;
  }

  container.innerHTML = activePeople.map(p => {
    const isChecked = selected.includes(p.id);
    return `
      <label class="location-checkbox-item">
        <input type="checkbox" value="${p.id}" ${isChecked ? 'checked' : ''} />
        <span>${escapeHtml(getPersonFullName(p))}</span>
      </label>
    `;
  }).join('');
}

function closeEventModal() {
  const modal = document.getElementById('eventModal');
  if (modal) modal.style.display = 'none';
  currentEditId = null;
}

// ═══════════════════════════════════════════════════════
//   Save Event
// ═══════════════════════════════════════════════════════

async function saveEvent() {
  if (currentMode === 'view') {
    alert('غير مصرح لك بحفظ الأحداث');
    return;
  }

  const title = document.getElementById('eventTitle')?.value.trim();
  const eventTypeID = document.getElementById('eventTypeID')?.value || '';
  const type = document.getElementById('eventType')?.value;
  const date = document.getElementById('eventDate')?.value || '';
  const dayOfWeek = document.getElementById('eventDayOfWeek')?.value || '';
  const time = document.getElementById('eventTime')?.value || '';
  const endTime = document.getElementById('eventEndTime')?.value || '';
  const isActive = document.getElementById('eventActive')?.checked;

  if (!title) { alert('عنوان الحدث مطلوب'); return; }
  if (!eventTypeID) { alert('نوع الحدث مطلوب'); return; }
  if (type === 'once' && !date) { alert('التاريخ مطلوب'); return; }
  if (type === 'weekly' && !dayOfWeek) { alert('يوم الأسبوع مطلوب'); return; }
  if (!time) { alert('وقت البداية مطلوب'); return; }
  if (!endTime) { alert('وقت النهاية مطلوب'); return; }

  if (String(endTime) <= String(time)) {
    alert(`❌ وقت النهاية يجب أن يكون بعد وقت البداية.\n\nالبداية: ${time}\nالنهاية: ${endTime}`);
    return;
  }

  if (type === 'once') {
    if (isDateInPast(date)) {
      alert(`❌ لا يمكن إضافة حدث بتاريخ قديم.\n\nالتاريخ: ${date}\nاليوم: ${formatDateISO(new Date())}`);
      return;
    }
    if (isTimeInPast(date, time)) {
      alert(`❌ الوقت المحدد قد فات.\n\nالآن: ${formatTimeNow()}\nالمحدد: ${time}`);
      return;
    }
  }

  let regScope = 'all';
  let regPersonIds = [];
  const regRadio = document.querySelector('input[name="regScope"]:checked');
  if (regRadio) {
    regScope = regRadio.value;
    if (regScope === 'specific') {
      const checked = document.querySelectorAll('#regPeopleList input[type="checkbox"]:checked');
      regPersonIds = Array.from(checked).map(c => c.value);
      if (regPersonIds.length === 0) {
        alert('⚠️ اختر شخص واحد على الأقل في القائمة، أو اختر "إلزامي لكل الأشخاص"');
        return;
      }
    }
  }

  let locationMode = 'any';
  let locationIds = [];
  const modeRadio = document.querySelector('input[name="locationMode"]:checked');
  if (modeRadio) locationMode = modeRadio.value;

  if (locationMode === 'single') {
    const singleVal = document.getElementById('singleLocationSelect')?.value;
    if (!singleVal) { alert('اختر مكان واحد على الأقل'); return; }
    locationIds = [singleVal];
  } else if (locationMode === 'multiple') {
    const checked = document.querySelectorAll('#multipleLocationsBox input[type="checkbox"]:checked');
    locationIds = Array.from(checked).map(c => c.value);
    if (locationIds.length === 0) { alert('اختر مكان واحد على الأقل'); return; }
  }

  let notifType = 'none';
  let notifPersonIds = [];
  const notifRadio = document.querySelector('input[name="notifType"]:checked');
  if (notifRadio) {
    notifType = notifRadio.value;
    if (notifType === 'specific') {
      const checked = document.querySelectorAll('#notifPeopleList input[type="checkbox"]:checked');
      notifPersonIds = Array.from(checked).map(c => c.value);
      if (notifPersonIds.length === 0) {
        alert('⚠️ اختر شخص واحد على الأقل للإشعار، أو اختر "بدون إشعار"');
        return;
      }
    }
  }

  const status = isActive ? 'active' : 'cancelled';

  try {
    if (currentEditId) {
      const eventRef = doc(db, 'events', currentEditId);
      await updateDoc(eventRef, {
        Title: title,
        EventTypeID: eventTypeID,
        Type: type,
        Date: type === 'once' ? date : '',
        DayOfWeek: type === 'weekly' ? dayOfWeek : '',
        Time: time,
        EndTime: endTime,
        Status: status,
        RegistrationScope: regScope,
        RegistrationPersonIDs: regPersonIds,
        LocationMode: locationMode,
        LocationIds: locationIds,
        UpdatedAt: new Date().toISOString()
      });
      alert('✅ تم التعديل بنجاح');

      // ⚡ سجل التعديل
      if (typeof window.logAction === 'function') {
        await window.logAction({
          action: 'event_updated',
          type: 'event',
          title: `تعديل حدث: ${title}`,
          description: `تم تعديل بيانات الحدث`,
          relatedID: currentEditId,
          relatedTitle: title
        });
      }
    } else {
      const user = JSON.parse(localStorage.getItem('currentUser'));
      const docRef = await addDoc(collection(db, 'events'), {
        Title: title,
        EventTypeID: eventTypeID,
        Type: type,
        Date: type === 'once' ? date : '',
        DayOfWeek: type === 'weekly' ? dayOfWeek : '',
        Time: time,
        EndTime: endTime,
        Status: status,
        RegistrationScope: regScope,
        RegistrationPersonIDs: regPersonIds,
        LocationMode: locationMode,
        LocationIds: locationIds,
        Rules: {
          RequiresQR: true,
          RequiresLocation: locationMode !== 'any',
          PreventDuplicate: true
        },
        TemplateID: settingsCache?.ActiveMassTemplateID || 'template_normal',
        CreatedAt: new Date().toISOString(),
        CreatedBy: user?.email || '',
        CanceledOccurrences: []
      });

      if (status === 'active' && notifType !== 'none') {
        await sendEventNotification(docRef.id, title, notifType, notifPersonIds);
      }

      alert('✅ تمت الإضافة بنجاح' + (notifType !== 'none' ? '\n\n🔔 تم إرسال الإشعارات' : ''));

      // ⚡ سجل الإضافة
      if (typeof window.logAction === 'function') {
        await window.logAction({
          action: 'event_added',
          type: 'event',
          title: `إضافة حدث: ${title}`,
          description: `النوع: ${type === 'weekly' ? 'أسبوعي' : 'مرة واحدة'} — ${time} - ${endTime}`,
          relatedID: docRef.id,
          relatedTitle: title
        });
      }
    }

    closeEventModal();
    const area = document.getElementById('contentArea');
    await loadEventsPage(area, currentMode);
  } catch (err) {
    console.error('❌ Save event error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Send Event Notification
// ═══════════════════════════════════════════════════════

async function sendEventNotification(eventId, eventTitle, targetType, personIds) {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser'));

    const notif = {
      Type: 'event_added',
      Title: `حدث جديد: ${eventTitle}`,
      Body: `تم إضافة حدث جديد: ${eventTitle}\nلتسجيل حضورك اضغط هنا`,
      RelatedEventID: eventId,
      RelatedEventTitle: eventTitle,
      TargetType: targetType,
      TargetPersonIDs: personIds || [],
      ActionURL: `my-events.html?event=${eventId}`,
      SentBy: user?.email || 'system',
      SentAt: new Date().toISOString(),
      ReadBy: [],
      CreatedAt: new Date().toISOString()
    };

    await addDoc(collection(db, 'notifications'), notif);
    console.log('✅ Notification sent:', targetType);
  } catch (err) {
    console.error('❌ sendEventNotification error:', err);
    alert('⚠️ لم يتم إرسال الإشعارات: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Edit / Archive / Delete
// ═══════════════════════════════════════════════════════

function editEvent(eventId) {
  if (currentMode === 'view') { alert('غير مصرح'); return; }
  openEventModal(eventId);
}

async function archiveEvent(eventId) {
  if (currentMode === 'view') { alert('غير مصرح'); return; }
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;
  if (!confirm(`📦 هل تريد أرشفة "${event.Title}"؟`)) return;

  try {
    await updateDoc(doc(db, 'events', eventId), {
      Status: 'archived',
      ArchivedAt: new Date().toISOString(),
      ArchivedBy: JSON.parse(localStorage.getItem('currentUser'))?.email || ''
    });

    // ⚡ سجل الأرشفة
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'event_archived',
        type: 'event',
        title: `أرشفة حدث: ${event.Title}`,
        description: `تم أرشفة الحدث`,
        relatedID: eventId,
        relatedTitle: event.Title
      });
    }

    alert('✅ تمت الأرشفة');
    await loadEventsPage(document.getElementById('contentArea'), currentMode);
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

async function confirmDeleteEvent(eventId) {
  if (currentMode === 'view') { alert('غير مصرح'); return; }
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;
  if (!confirm(`⚠️ هل أنت متأكد من حذف "${event.Title}"؟`)) return;

  try {
    // ⚡ سجل الحذف قبل ما نحذف
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'event_deleted',
        type: 'event',
        title: `حذف حدث: ${event.Title}`,
        description: `تم حذف الحدث نهائيًا`,
        relatedID: eventId,
        relatedTitle: event.Title
      });
    }

    await deleteDoc(doc(db, 'events', eventId));
    alert('✅ تم الحذف');
    await loadEventsPage(document.getElementById('contentArea'), currentMode);
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   View Occurrences
// ═══════════════════════════════════════════════════════

function viewOccurrences(eventId) {
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;

  const isView = currentMode === 'view';
  const type = String(event.Type || 'once').toLowerCase();
  const canceledOccurrences = event.CanceledOccurrences || [];
  const startTime = event.Time || '-';
  const endTime = getEventEndTime(event);

  let occurrencesHtml = '';

  if (type === 'once') {
    const isCancelled = canceledOccurrences.includes(event.Date);
    occurrencesHtml = `
      <div class="occurrence-item ${isCancelled ? 'cancelled' : ''}">
        <div class="occurrence-date">${formatDate(event.Date)}</div>
        <div class="occurrence-time">🕐 ${startTime} - ${endTime}</div>
        <div class="occurrence-status">
          ${isCancelled ? '<span class="status-badge inactive">❌ ملغي</span>' : '<span class="status-badge active">✅ نشط</span>'}
        </div>
      </div>
    `;
  } else {
    const upcomingDates = getUpcomingOccurrences(event.DayOfWeek, 4);
    occurrencesHtml = upcomingDates.map(dateStr => {
      const isCancelled = canceledOccurrences.includes(dateStr);
      const actionsHtml = isView
        ? (isCancelled ? '<span class="status-badge inactive">❌ ملغي</span>' : '<span class="status-badge active">✅ نشط</span>')
        : (isCancelled
          ? `<button class="btn-small" onclick="restoreOccurrence('${eventId}', '${dateStr}')">↺ استعادة</button>`
          : `<button class="btn-small danger" onclick="cancelOccurrence('${eventId}', '${dateStr}')">✕ إلغاء</button>`);

      return `
        <div class="occurrence-item ${isCancelled ? 'cancelled' : ''}">
          <div class="occurrence-date">${formatDate(dateStr)}</div>
          <div class="occurrence-time">🕐 ${startTime} - ${endTime}</div>
          <div class="occurrence-actions">${actionsHtml}</div>
        </div>
      `;
    }).join('');
  }

  let modal = document.getElementById('occurrencesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'occurrencesModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>📋 المواعيد - ${escapeHtml(event.Title)}</h2>
        <button class="modal-close" onclick="closeOccurrencesModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="occurrences-list">
          ${occurrencesHtml || '<p style="text-align:center;color:#64748b;">لا توجد مواعيد قادمة</p>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeOccurrencesModal()">إغلاق</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeOccurrencesModal() {
  const modal = document.getElementById('occurrencesModal');
  if (modal) modal.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
//   Cancel / Restore Occurrence
// ═══════════════════════════════════════════════════════

async function cancelOccurrence(eventId, dateStr) {
  if (currentMode === 'view') { alert('غير مصرح'); return; }
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;
  if (!confirm(`إلغاء موعد ${formatDate(dateStr)}؟`)) return;

  const canceled = event.CanceledOccurrences || [];
  if (!canceled.includes(dateStr)) canceled.push(dateStr);

  try {
    await updateDoc(doc(db, 'events', eventId), {
      CanceledOccurrences: canceled
    });
    event.CanceledOccurrences = canceled;

    // ⚡ سجل الإلغاء
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'occurrence_cancelled',
        type: 'event',
        title: `إلغاء موعد: ${event.Title}`,
        description: `تم إلغاء موعد ${formatDate(dateStr)}`,
        relatedID: eventId,
        relatedTitle: event.Title
      });
    }

    alert('✅ تم الإلغاء');
    closeOccurrencesModal();
    viewOccurrences(eventId);
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

async function restoreOccurrence(eventId, dateStr) {
  if (currentMode === 'view') { alert('غير مصرح'); return; }
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;

  const canceled = (event.CanceledOccurrences || []).filter(d => d !== dateStr);

  try {
    await updateDoc(doc(db, 'events', eventId), {
      CanceledOccurrences: canceled
    });
    event.CanceledOccurrences = canceled;

    // ⚡ سجل الاستعادة
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'occurrence_restored',
        type: 'event',
        title: `استعادة موعد: ${event.Title}`,
        description: `تم استعادة موعد ${formatDate(dateStr)}`,
        relatedID: eventId,
        relatedTitle: event.Title
      });
    }

    alert('✅ تمت الاستعادة');
    closeOccurrencesModal();
    viewOccurrences(eventId);
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function isDateInPast(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function isTimeInPast(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const now = new Date();
  const todayStr = formatDateISO(now);
  if (dateStr !== todayStr) return false;
  const [h, m] = String(timeStr).split(':').map(Number);
  const t = new Date(now);
  t.setHours(h || 0, m || 0, 0, 0);
  return t < now;
}

function getDayLabel(dayValue) {
  const day = DAYS_OF_WEEK.find(d => d.value === dayValue);
  return day ? day.label : dayValue || '-';
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTimeNow() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
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

function getUpcomingOccurrences(dayOfWeek, count) {
  const dayMap = { Saturday: 6, Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
  const targetDay = dayMap[dayOfWeek];
  if (targetDay === undefined) return [];

  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = new Date(today);
  const diff = (targetDay - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + diff);

  for (let i = 0; i < count; i++) {
    dates.push(formatDateISO(current));
    current.setDate(current.getDate() + 7);
  }
  return dates;
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
//   Auto Deactivate Once Events
// ═══════════════════════════════════════════════════════

async function autoDeactivateOnceEvents() {
  try {
    const now = new Date();
    const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};
    const closeAfter = Number(settings.CloseAfterMinutes || 15);

    const snap = await getDocs(collection(db, 'events'));
    const toDeactivate = [];

    snap.docs.forEach(docSnap => {
      const event = { id: docSnap.id, ...docSnap.data() };
      if (String(event.Type || '').toLowerCase() !== 'once') return;
      if (String(event.Status || '').toLowerCase() !== 'active') return;
      if (!event.Date) return;

      const endTime = getEventEndTime(event);
      const [eh, em] = endTime.split(':').map(Number);

      const eventEnd = new Date(event.Date + 'T00:00:00');
      eventEnd.setHours(eh || 0, em || 0, 0, 0);
      const closeTime = new Date(eventEnd.getTime() + closeAfter * 60 * 1000);

      if (now > closeTime) toDeactivate.push(event.id);
    });

    for (const id of toDeactivate) {
      await updateDoc(doc(db, 'events', id), {
        Status: 'inactive',
        DeactivatedAt: now.toISOString(),
        AutoDeactivated: true
      });
    }

    return { deactivated: toDeactivate.length };
  } catch (err) {
    console.error('❌ autoDeactivateOnceEvents error:', err);
    return { deactivated: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
//   Expose to window
// ═══════════════════════════════════════════════════════

window.loadEventsPage = loadEventsPage;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent;
window.editEvent = editEvent;
window.archiveEvent = archiveEvent;
window.confirmDeleteEvent = confirmDeleteEvent;
window.viewOccurrences = viewOccurrences;
window.closeOccurrencesModal = closeOccurrencesModal;
window.cancelOccurrence = cancelOccurrence;
window.restoreOccurrence = restoreOccurrence;
window.autoDeactivateOnceEvents = autoDeactivateOnceEvents;
window.sendEventNotification = sendEventNotification;
