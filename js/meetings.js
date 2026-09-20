// ═══════════════════════════════════════════════════════
//   Meetings Management (Firestore)
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
let meetingsData = [];
let filteredMeetings = [];
let currentEditId = null;
let currentFilter = 'all';
let currentMode = 'manage';
let settingsCache = null;
let availableLocations = [];

// ═══ أيام الأسبوع ═══
const DAYS_OF_WEEK = [
  { value: 'Sunday',    label: 'الأحد' },
  { value: 'Monday',    label: 'الاثنين' },
  { value: 'Tuesday',   label: 'الثلاثاء' },
  { value: 'Wednesday', label: 'الأربعاء' },
  { value: 'Thursday',  label: 'الخميس' },
  { value: 'Friday',    label: 'الجمعة' },
  { value: 'Saturday',  label: 'السبت' }
];

// ═══════════════════════════════════════════════════════
//   Date/Time Validation Helpers
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
  const meetingTime = new Date(now);
  meetingTime.setHours(h || 0, m || 0, 0, 0);

  return meetingTime < now;
}

function isWeeklyTimeInPast(dayOfWeek, timeStr) {
  if (!dayOfWeek || !timeStr) return false;

  const now = new Date();
  const todayDay = getDayNameFromDate(now);

  if (todayDay !== dayOfWeek) return false;

  const [h, m] = String(timeStr).split(':').map(Number);
  const meetingTime = new Date(now);
  meetingTime.setHours(h || 0, m || 0, 0, 0);

  return meetingTime < now;
}

/**
 * ⚡ التحقق: EndTime بعد Time
 */
function isEndTimeAfterStart(startTime, endTime) {
  if (!startTime || !endTime) return false;
  return String(endTime) > String(startTime);
}

function getDayNameFromDate(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
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

function formatDateArabic(date) {
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * ⚡ الحصول على EndTime (مع Fallback للاجتماعات القديمة)
 * Time + 2 ساعات
 */
function getMeetingEndTime(meeting) {
  if (!meeting) return '';

  // ⚡ لو EndTime موجود
  if (meeting.EndTime) return String(meeting.EndTime);

  // ⚡ Fallback: Time + 2 ساعات
  const time = String(meeting.Time || '00:00');
  const [h, m] = time.split(':').map(Number);

  const totalMinutes = (h || 0) * 60 + (m || 0) + 120; // +2 hours
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;

  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════
//   Load Meetings Page
// ═══════════════════════════════════════════════════════

async function loadMeetingsPage(area, mode) {
  currentMode = (mode === 'view') ? 'view' : 'manage';

  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const [meetingsSnap, settingsDoc] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.MEETINGS)),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC))
    ]);

    meetingsData = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    settingsCache = settingsDoc.exists() ? settingsDoc.data() : {};

    availableLocations = Array.isArray(settingsCache.Locations) ? settingsCache.Locations : [];

    let meetingsToShow = meetingsData;
    if (currentMode === 'view') {
      meetingsToShow = meetingsData.filter(m =>
        String(m.Status || '').toLowerCase() === 'active'
      );
    }

    meetingsToShow.sort((a, b) => {
      const statusOrder = { active: 0, cancelled: 1, inactive: 2, archived: 3 };
      const aOrder = statusOrder[String(a.Status || '').toLowerCase()] ?? 4;
      const bOrder = statusOrder[String(b.Status || '').toLowerCase()] ?? 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.Time || '').localeCompare(String(b.Time || ''));
    });

    filteredMeetings = [...meetingsToShow];

    renderMeetingsPage(area);
  } catch (err) {
    console.error('❌ Load meetings error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadMeetingsPage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderMeetingsPage(area) {
  const isView = currentMode === 'view';

  const filtersHtml = isView
    ? `
      <div class="meetings-filters">
        <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
        <button class="filter-btn ${currentFilter === 'weekly' ? 'active' : ''}" data-filter="weekly">أسبوعي</button>
        <button class="filter-btn ${currentFilter === 'once' ? 'active' : ''}" data-filter="once">مرة واحدة</button>
      </div>
    `
    : `
      <div class="meetings-filters">
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
    : `<button class="btn-primary" onclick="openMeetingModal()">➕ إضافة اجتماع</button>`;

  const statsHtml = isView
    ? `
      <div class="meetings-stats">
        <div class="meeting-stat">
          <span class="meeting-stat-value">${meetingsData.filter(m => String(m.Status || '').toLowerCase() === 'active').length}</span>
          <span class="meeting-stat-label">اجتماع نشط</span>
        </div>
        <div class="meeting-stat">
          <span class="meeting-stat-value">${meetingsData.filter(m => String(m.Type || '').toLowerCase() === 'weekly' && String(m.Status || '').toLowerCase() === 'active').length}</span>
          <span class="meeting-stat-label">أسبوعي</span>
        </div>
        <div class="meeting-stat">
          <span class="meeting-stat-value">${meetingsData.filter(m => String(m.Type || '').toLowerCase() === 'once' && String(m.Status || '').toLowerCase() === 'active').length}</span>
          <span class="meeting-stat-label">مرة واحدة</span>
        </div>
      </div>
    `
    : `
      <div class="meetings-stats">
        <div class="meeting-stat">
          <span class="meeting-stat-value">${meetingsData.length}</span>
          <span class="meeting-stat-label">إجمالي</span>
        </div>
        <div class="meeting-stat">
          <span class="meeting-stat-value">${meetingsData.filter(m => String(m.Status || '').toLowerCase() === 'active').length}</span>
          <span class="meeting-stat-label">نشط</span>
        </div>
        <div class="meeting-stat">
          <span class="meeting-stat-value">${meetingsData.filter(m => String(m.Type || '').toLowerCase() === 'weekly').length}</span>
          <span class="meeting-stat-label">أسبوعي</span>
        </div>
        <div class="meeting-stat">
          <span class="meeting-stat-value">${meetingsData.filter(m => String(m.Status || '').toLowerCase() === 'archived').length}</span>
          <span class="meeting-stat-label">مؤرشف</span>
        </div>
      </div>
    `;

  const emptyBtnHtml = isView
    ? ''
    : `<button class="btn-primary" onclick="openMeetingModal()">➕ إضافة اجتماع</button>`;

  area.innerHTML = `
    <div class="meetings-container">

      <div class="meetings-header">
        ${filtersHtml}
        ${addBtnHtml}
      </div>

      ${statsHtml}

      <div class="meetings-grid" id="meetingsGrid"></div>

      <div id="meetingsEmptyState" class="meetings-empty" style="display:none;">
        <div class="meetings-empty-icon">📅</div>
        <h3>لا يوجد اجتماعات</h3>
        <p>${isView ? 'لم يتم إضافة اجتماعات بعد' : 'ابدأ بإضافة اجتماع جديد'}</p>
        ${emptyBtnHtml}
      </div>

    </div>
  `;

  renderMeetingsGrid();
  setupMeetingsEvents();
}

// ═══════════════════════════════════════════════════════
//   Render Grid
// ═══════════════════════════════════════════════════════

function renderMeetingsGrid() {
  const grid = document.getElementById('meetingsGrid');
  const emptyState = document.getElementById('meetingsEmptyState');

  if (!grid) return;

  if (filteredMeetings.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  const isView = currentMode === 'view';

  grid.innerHTML = filteredMeetings.map(meeting => {
    const status = String(meeting.Status || 'active').toLowerCase();
    const type = String(meeting.Type || 'once').toLowerCase();
    const canceledOccurrences = meeting.CanceledOccurrences || [];

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

    const typeBadge = type === 'weekly'
      ? '<span class="type-badge weekly">🔄 أسبوعي</span>'
      : '<span class="type-badge once">1️⃣ مرة واحدة</span>';

    let dateInfo = '';
    if (type === 'weekly') {
      const dayLabel = getDayLabel(meeting.DayOfWeek);
      dateInfo = `كل ${dayLabel}`;
    } else {
      dateInfo = formatDate(meeting.Date);
    }

    // ⚡ عرض المدة (من - إلى)
    const startTime = meeting.Time || '-';
    const endTime = getMeetingEndTime(meeting);
    const timeInfo = `${startTime} - ${endTime}`;

    const cancelInfo = canceledOccurrences.length > 0
      ? `<span class="cancel-count">${canceledOccurrences.length} موعد ملغي</span>`
      : '';

    const locationsInfo = getLocationsInfoText(meeting);

    const footerHtml = isView
      ? `
        <div class="meeting-card-footer">
          <button class="btn-icon" onclick="viewOccurrences('${meeting.id}')" title="المواعيد">📋 المواعيد</button>
        </div>
      `
      : `
        <div class="meeting-card-footer">
          <button class="btn-icon" onclick="viewOccurrences('${meeting.id}')" title="المواعيد">📋</button>
          <button class="btn-icon" onclick="editMeeting('${meeting.id}')" title="تعديل">✏️</button>
          ${status !== 'archived' ? `
            <button class="btn-icon" onclick="archiveMeeting('${meeting.id}')" title="أرشفة">📦</button>
          ` : ''}
          <button class="btn-icon danger" onclick="confirmDeleteMeeting('${meeting.id}')" title="حذف">🗑️</button>
        </div>
      `;

    return `
      <div class="meeting-card" data-id="${meeting.id}">
        <div class="meeting-card-header">
          <h3>${escapeHtml(meeting.Title || 'بدون عنوان')}</h3>
          <div class="meeting-badges">
            ${statusBadge}
          </div>
        </div>

        <div class="meeting-card-body">
          <div class="meeting-info">
            <div class="meeting-info-row">
              <span class="meeting-info-icon">${type === 'weekly' ? '🔄' : '📅'}</span>
              <span>${typeBadge}</span>
            </div>

            <div class="meeting-info-row">
              <span class="meeting-info-icon">📆</span>
              <span>${dateInfo}</span>
            </div>

            <div class="meeting-info-row">
              <span class="meeting-info-icon">🕐</span>
              <span>${escapeHtml(timeInfo)}</span>
            </div>

            <div class="meeting-info-row">
              <span class="meeting-info-icon">📍</span>
              <span>${locationsInfo}</span>
            </div>

            ${cancelInfo ? `
              <div class="meeting-info-row">
                <span class="meeting-info-icon">⚠️</span>
                ${cancelInfo}
              </div>
            ` : ''}
          </div>
        </div>

        ${footerHtml}
      </div>
    `;
  }).join('');
}

function getLocationsInfoText(meeting) {
  const mode = String(meeting.LocationMode || 'any').toLowerCase();

  if (mode === 'any') {
    return `<span style="color:#16a34a;">أي مكان مسجل</span>`;
  }

  const ids = Array.isArray(meeting.LocationIds) ? meeting.LocationIds : [];

  if (ids.length === 0) {
    return `<span style="color:#d97706;">لم يتم تحديد أماكن</span>`;
  }

  const names = ids.map(id => {
    const loc = availableLocations.find(l => l.id === id);
    return loc ? loc.name : 'مكان محذوف';
  });

  if (mode === 'single') {
    return escapeHtml(names[0] || 'مكان محدد');
  }

  return escapeHtml(names.join(' • '));
}

// ═══════════════════════════════════════════════════════
//   Filters
// ═══════════════════════════════════════════════════════

function setupMeetingsEvents() {
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
    ? meetingsData.filter(m => String(m.Status || '').toLowerCase() === 'active')
    : meetingsData;

  if (currentFilter === 'all') {
    filteredMeetings = [...baseData];
  } else if (currentFilter === 'active') {
    filteredMeetings = baseData.filter(m =>
      String(m.Status || '').toLowerCase() === 'active'
    );
  } else if (currentFilter === 'inactive') {
    filteredMeetings = baseData.filter(m =>
      String(m.Status || '').toLowerCase() === 'inactive'
    );
  } else if (currentFilter === 'weekly') {
    filteredMeetings = baseData.filter(m =>
      String(m.Type || '').toLowerCase() === 'weekly'
    );
  } else if (currentFilter === 'once') {
    filteredMeetings = baseData.filter(m =>
      String(m.Type || '').toLowerCase() === 'once'
    );
  } else if (currentFilter === 'archived') {
    filteredMeetings = baseData.filter(m =>
      String(m.Status || '').toLowerCase() === 'archived'
    );
  }

  renderMeetingsGrid();
}

// ═══════════════════════════════════════════════════════
//   Meeting Modal
// ═══════════════════════════════════════════════════════

function openMeetingModal(meetingId) {
  if (currentMode === 'view') {
    alert('غير مصرح لك بإضافة أو تعديل الاجتماعات');
    return;
  }

  currentEditId = meetingId || null;
  const meeting = meetingId ? meetingsData.find(m => m.id === meetingId) : null;
  const isEdit = !!meeting;

  let modal = document.getElementById('meetingModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'meetingModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const type = meeting ? String(meeting.Type || 'once').toLowerCase() : 'once';
  const locationMode = meeting ? String(meeting.LocationMode || 'any').toLowerCase() : 'any';
  const locationIds = meeting && Array.isArray(meeting.LocationIds) ? meeting.LocationIds : [];

  const noLocations = availableLocations.length === 0;

  const todayISO = formatDateISO(new Date());

  // ⚡ EndTime (مع Fallback)
  const endTime = meeting ? getMeetingEndTime(meeting) : '21:00';

  modal.innerHTML = `
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2>${isEdit ? '✏️ تعديل اجتماع' : '➕ إضافة اجتماع جديد'}</h2>
        <button class="modal-close" onclick="closeMeetingModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-row">
          <label>اسم الاجتماع *</label>
          <input type="text" id="meetingTitle" value="${meeting ? escapeHtml(meeting.Title || '') : ''}" placeholder="مثال: اجتماع الشباب" />
        </div>

        <div class="form-row">
          <label>نوع الاجتماع *</label>
          <select id="meetingType">
            <option value="once" ${type === 'once' ? 'selected' : ''}>مرة واحدة</option>
            <option value="weekly" ${type === 'weekly' ? 'selected' : ''}>أسبوعي</option>
          </select>
        </div>

        <div id="onceFields" style="${type === 'once' ? '' : 'display:none;'}">
          <div class="form-row">
            <label>التاريخ *</label>
            <input type="date" id="meetingDate" value="${meeting && meeting.Date ? meeting.Date : ''}" min="${todayISO}" />
            <p class="hint">لا يمكن اختيار تاريخ في الماضي</p>
          </div>
        </div>

        <div id="weeklyFields" style="${type === 'weekly' ? '' : 'display:none;'}">
          <div class="form-row">
            <label>يوم الأسبوع *</label>
            <select id="meetingDayOfWeek">
              ${DAYS_OF_WEEK.map(d => `
                <option value="${d.value}" ${meeting && meeting.DayOfWeek === d.value ? 'selected' : ''}>${d.label}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- ⚡ الوقت: من - إلى -->
        <div class="form-grid-2">
          <div class="form-row">
            <label>وقت البداية *</label>
            <input type="time" id="meetingTime" value="${meeting && meeting.Time ? meeting.Time : '19:00'}" />
          </div>
          <div class="form-row">
            <label>وقت النهاية *</label>
            <input type="time" id="meetingEndTime" value="${endTime}" />
          </div>
        </div>
        <p class="hint">تأكد أن وقت النهاية بعد وقت البداية</p>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="meetingActive" ${!meeting || String(meeting.Status || 'active').toLowerCase() === 'active' ? 'checked' : ''} />
          <label for="meetingActive">نشط</label>
        </div>

        <div class="modal-section">
          <h4 class="modal-section-title">📍 الأماكن المسموحة</h4>

          ${noLocations ? `
            <div class="locations-warning">
              ⚠️ لا توجد أماكن مسجلة. أضف أماكن من الإعدادات أولاً.
            </div>
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
                  <option value="${loc.id}" ${locationIds[0] === loc.id ? 'selected' : ''}>${escapeHtml(loc.name)}</option>
                `).join('')}
              </select>
            </div>

            <div id="multipleLocationsBox" class="location-picker-box" style="${locationMode === 'multiple' ? '' : 'display:none;'}">
              <label>اختر الأماكن المسموحة</label>
              <div class="locations-checkbox-list">
                ${availableLocations.map(loc => `
                  <label class="location-checkbox-item">
                    <input type="checkbox" value="${loc.id}" ${locationIds.includes(loc.id) ? 'checked' : ''} />
                    <span>${escapeHtml(loc.name)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeMeetingModal()">إلغاء</button>
        <button class="btn-primary" onclick="saveMeeting()">💾 حفظ</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const typeSelect = document.getElementById('meetingType');
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

  setTimeout(() => {
    const titleInput = document.getElementById('meetingTitle');
    if (titleInput) titleInput.focus();
  }, 100);
}

function closeMeetingModal() {
  const modal = document.getElementById('meetingModal');
  if (modal) modal.style.display = 'none';
  currentEditId = null;
}

// ═══════════════════════════════════════════════════════
//   Save Meeting
// ═══════════════════════════════════════════════════════

async function saveMeeting() {
  if (currentMode === 'view') {
    alert('غير مصرح لك بحفظ الاجتماعات');
    return;
  }

  const title = document.getElementById('meetingTitle')?.value.trim();
  const type = document.getElementById('meetingType')?.value;
  const date = document.getElementById('meetingDate')?.value || '';
  const dayOfWeek = document.getElementById('meetingDayOfWeek')?.value || '';
  const time = document.getElementById('meetingTime')?.value || '';
  const endTime = document.getElementById('meetingEndTime')?.value || '';
  const isActive = document.getElementById('meetingActive')?.checked;

  if (!title) {
    alert('اسم الاجتماع مطلوب');
    return;
  }

  if (type === 'once' && !date) {
    alert('التاريخ مطلوب للاجتماع مرة واحدة');
    return;
  }

  if (type === 'weekly' && !dayOfWeek) {
    alert('يوم الأسبوع مطلوب للاجتماع الأسبوعي');
    return;
  }

  if (!time) {
    alert('وقت البداية مطلوب');
    return;
  }

  if (!endTime) {
    alert('وقت النهاية مطلوب');
    return;
  }

  // ⚡ Validation: EndTime > Time
  if (!isEndTimeAfterStart(time, endTime)) {
    alert(
      `❌ وقت النهاية يجب أن يكون بعد وقت البداية.\n\n` +
      `وقت البداية: ${time}\n` +
      `وقت النهاية: ${endTime}`
    );
    return;
  }

  // ═══ ⚡ التحقق من التاريخ (Once) ═══
  if (type === 'once') {
    if (isDateInPast(date)) {
      alert(
        `❌ لا يمكن إضافة اجتماع بتاريخ قديم.\n\n` +
        `التاريخ المحدد: ${date}\n` +
        `التاريخ الحالي: ${formatDateISO(new Date())}\n\n` +
        `اختر تاريخ اليوم أو تاريخ مستقبلي.`
      );
      return;
    }

    if (isTimeInPast(date, time)) {
      alert(
        `❌ الوقت المحدد قد فات.\n\n` +
        `الوقت الحالي: ${formatTimeNow()}\n` +
        `الوقت المحدد: ${time}\n\n` +
        `اختر وقتاً لاحقاً.`
      );
      return;
    }
  }

  if (type === 'weekly') {
    if (isWeeklyTimeInPast(dayOfWeek, time)) {
      const dayLabel = getDayLabel(dayOfWeek);
      alert(
        `❌ اجتماع "${dayLabel}" الساعة ${time} قد فات.\n\n` +
        `اليوم: ${dayLabel}\n` +
        `الوقت الحالي: ${formatTimeNow()}\n\n` +
        `اختر يوماً آخر، أو وقتاً لاحقاً.`
      );
      return;
    }
  }

  // ═══ Location Mode ═══
  let locationMode = 'any';
  let locationIds = [];

  const modeRadio = document.querySelector('input[name="locationMode"]:checked');
  if (modeRadio) {
    locationMode = modeRadio.value;
  }

  if (locationMode === 'single') {
    const singleVal = document.getElementById('singleLocationSelect')?.value;
    if (!singleVal) {
      alert('اختر مكان واحد على الأقل');
      return;
    }
    locationIds = [singleVal];
  } else if (locationMode === 'multiple') {
    const checked = document.querySelectorAll('#multipleLocationsBox input[type="checkbox"]:checked');
    locationIds = Array.from(checked).map(c => c.value);

    if (locationIds.length === 0) {
      alert('اختر مكان واحد على الأقل');
      return;
    }
  }

  const status = isActive ? 'active' : 'cancelled';

  try {
    if (currentEditId) {
      const meetingRef = doc(db, COLLECTIONS.MEETINGS, currentEditId);
      const updateData = {
        Title: title,
        Type: type,
        Date: type === 'once' ? date : '',
        DayOfWeek: type === 'weekly' ? dayOfWeek : '',
        Time: time,
        EndTime: endTime,   // ⚡ جديد
        Status: status,
        LocationMode: locationMode,
        LocationIds: locationIds,
        UpdatedAt: new Date().toISOString()
      };

      await updateDoc(meetingRef, updateData);
      alert('✅ تم التعديل بنجاح');
    } else {
      const user = JSON.parse(localStorage.getItem('currentUser'));

      const meetingData = {
        Title: title,
        Type: type,
        Date: type === 'once' ? date : '',
        DayOfWeek: type === 'weekly' ? dayOfWeek : '',
        Time: time,
        EndTime: endTime,   // ⚡ جديد
        Status: status,
        LocationMode: locationMode,
        LocationIds: locationIds,
        CreatedAt: new Date().toISOString(),
        CreatedBy: user?.email || '',
        CanceledOccurrences: []
      };

      await addDoc(collection(db, COLLECTIONS.MEETINGS), meetingData);
      alert('✅ تمت الإضافة بنجاح');
    }

    closeMeetingModal();

    const area = document.getElementById('contentArea');
    await loadMeetingsPage(area, currentMode);
  } catch (err) {
    console.error('❌ Save meeting error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Edit / Archive / Delete
// ═══════════════════════════════════════════════════════

function editMeeting(meetingId) {
  if (currentMode === 'view') {
    alert('غير مصرح لك بتعديل الاجتماعات');
    return;
  }
  openMeetingModal(meetingId);
}

async function archiveMeeting(meetingId) {
  if (currentMode === 'view') {
    alert('غير مصرح لك بأرشفة الاجتماعات');
    return;
  }

  const meeting = meetingsData.find(m => m.id === meetingId);
  if (!meeting) return;

  if (!confirm(`📦 هل تريد أرشفة "${meeting.Title}"؟\n\nسيتم نقله للأرشيف، ولن يظهر في القائمة الرئيسية.`)) {
    return;
  }

  try {
    const meetingRef = doc(db, COLLECTIONS.MEETINGS, meetingId);
    await updateDoc(meetingRef, {
      Status: 'archived',
      ArchivedAt: new Date().toISOString()
    });

    alert('✅ تمت الأرشفة بنجاح');

    const area = document.getElementById('contentArea');
    await loadMeetingsPage(area, currentMode);
  } catch (err) {
    console.error('❌ Archive meeting error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function confirmDeleteMeeting(meetingId) {
  if (currentMode === 'view') {
    alert('غير مصرح لك بحذف الاجتماعات');
    return;
  }

  const meeting = meetingsData.find(m => m.id === meetingId);
  if (!meeting) return;

  if (!confirm(`⚠️ هل أنت متأكد من حذف "${meeting.Title}"؟\n\nهذا الإجراء لا يمكن التراجع عنه.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, COLLECTIONS.MEETINGS, meetingId));

    alert('✅ تم الحذف بنجاح');

    const area = document.getElementById('contentArea');
    await loadMeetingsPage(area, currentMode);
  } catch (err) {
    console.error('❌ Delete meeting error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   View Occurrences
// ═══════════════════════════════════════════════════════

function viewOccurrences(meetingId) {
  const meeting = meetingsData.find(m => m.id === meetingId);
  if (!meeting) return;

  const isView = currentMode === 'view';
  const type = String(meeting.Type || 'once').toLowerCase();
  const canceledOccurrences = meeting.CanceledOccurrences || [];
  const startTime = meeting.Time || '-';
  const endTime = getMeetingEndTime(meeting);

  let occurrencesHtml = '';

  if (type === 'once') {
    const isCancelled = canceledOccurrences.includes(meeting.Date);
    occurrencesHtml = `
      <div class="occurrence-item ${isCancelled ? 'cancelled' : ''}">
        <div class="occurrence-date">${formatDate(meeting.Date)}</div>
        <div class="occurrence-time">🕐 ${startTime} - ${endTime}</div>
        <div class="occurrence-status">
          ${isCancelled
            ? '<span class="status-badge inactive">❌ ملغي</span>'
            : '<span class="status-badge active">✅ نشط</span>'
          }
        </div>
      </div>
    `;
  } else {
    const upcomingDates = getUpcomingOccurrences(meeting.DayOfWeek, 4);

    occurrencesHtml = upcomingDates.map(dateStr => {
      const isCancelled = canceledOccurrences.includes(dateStr);

      const actionsHtml = isView
        ? (isCancelled ? '<span class="status-badge inactive">❌ ملغي</span>' : '<span class="status-badge active">✅ نشط</span>')
        : (isCancelled
          ? `<button class="btn-small" onclick="restoreOccurrence('${meetingId}', '${dateStr}')">↺ استعادة</button>`
          : `<button class="btn-small danger" onclick="cancelOccurrence('${meetingId}', '${dateStr}')">✕ إلغاء</button>`
        );

      return `
        <div class="occurrence-item ${isCancelled ? 'cancelled' : ''}">
          <div class="occurrence-date">${formatDate(dateStr)}</div>
          <div class="occurrence-time">🕐 ${startTime} - ${endTime}</div>
          <div class="occurrence-actions">
            ${actionsHtml}
          </div>
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
        <h2>📋 المواعيد - ${escapeHtml(meeting.Title)}</h2>
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

async function cancelOccurrence(meetingId, dateStr) {
  if (currentMode === 'view') {
    alert('غير مصرح لك بإلغاء المواعيد');
    return;
  }

  const meeting = meetingsData.find(m => m.id === meetingId);
  if (!meeting) return;

  if (!confirm(`إلغاء موعد ${formatDate(dateStr)}؟`)) return;

  const canceled = meeting.CanceledOccurrences || [];
  if (!canceled.includes(dateStr)) {
    canceled.push(dateStr);
  }

  try {
    const meetingRef = doc(db, COLLECTIONS.MEETINGS, meetingId);
    await updateDoc(meetingRef, {
      CanceledOccurrences: canceled
    });

    meeting.CanceledOccurrences = canceled;

    alert('✅ تم الإلغاء');
    closeOccurrencesModal();
    viewOccurrences(meetingId);
  } catch (err) {
    console.error('❌ Cancel occurrence error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function restoreOccurrence(meetingId, dateStr) {
  if (currentMode === 'view') {
    alert('غير مصرح لك باستعادة المواعيد');
    return;
  }

  const meeting = meetingsData.find(m => m.id === meetingId);
  if (!meeting) return;

  const canceled = (meeting.CanceledOccurrences || []).filter(d => d !== dateStr);

  try {
    const meetingRef = doc(db, COLLECTIONS.MEETINGS, meetingId);
    await updateDoc(meetingRef, {
      CanceledOccurrences: canceled
    });

    meeting.CanceledOccurrences = canceled;

    alert('✅ تمت الاستعادة');
    closeOccurrencesModal();
    viewOccurrences(meetingId);
  } catch (err) {
    console.error('❌ Restore occurrence error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getDayLabel(dayValue) {
  const day = DAYS_OF_WEEK.find(d => d.value === dayValue);
  return day ? day.label : dayValue || '-';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';

  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;

    return formatDateArabic(date);
  } catch (e) {
    return dateStr;
  }
}

function getUpcomingOccurrences(dayOfWeek, count) {
  const dayMap = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };

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
//   ⚡ Auto Deactivate Once Meetings
// ═══════════════════════════════════════════════════════

/**
 * ⚡ يحوّل الاجتماعات Once المنتهية إلى inactive
 * - شرط: Type=once + Status=active
 * - التاريخ + EndTime + CloseAfter < الآن
 */
async function autoDeactivateOnceMeetings() {
  try {
    const now = new Date();

    // ⚡ اجلب الإعدادات
    const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};

    const closeAfter = Number(settings.CloseAfterMinutes || 15);

    // ⚡ اجلب الاجتماعات
    const snap = await getDocs(collection(db, COLLECTIONS.MEETINGS));

    const toDeactivate = [];

    snap.docs.forEach(docSnap => {
      const meeting = { id: docSnap.id, ...docSnap.data() };

      // ⚡ Once + Active فقط
      if (String(meeting.Type || '').toLowerCase() !== 'once') return;
      if (String(meeting.Status || '').toLowerCase() !== 'active') return;
      if (!meeting.Date) return;

      const endTime = getMeetingEndTime(meeting);

      // ⚡ احسب وقت النهاية
      const [eh, em] = endTime.split(':').map(Number);
      const [sh, sm] = String(meeting.Time || '00:00').split(':').map(Number);

      const meetingEnd = new Date(meeting.Date + 'T00:00:00');
      meetingEnd.setHours(eh || 0, em || 0, 0, 0);

      const closeTime = new Date(meetingEnd.getTime() + closeAfter * 60 * 1000);

      // ⚡ لو مر وقت الإغلاق
      if (now > closeTime) {
        toDeactivate.push(meeting.id);
      }
    });

    // ⚡ حدّث كل واحد
    for (const id of toDeactivate) {
      await updateDoc(doc(db, COLLECTIONS.MEETINGS, id), {
        Status: 'inactive',
        DeactivatedAt: now.toISOString(),
        AutoDeactivated: true
      });
    }

    if (toDeactivate.length > 0) {
      console.log(`⏸️ Auto-deactivated ${toDeactivate.length} meeting(s)`);
    }

    return { deactivated: toDeactivate.length };

  } catch (err) {
    console.error('❌ autoDeactivateOnceMeetings error:', err);
    return { deactivated: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
//   Expose to window
// ═══════════════════════════════════════════════════════

window.loadMeetingsPage = loadMeetingsPage;
window.openMeetingModal = openMeetingModal;
window.closeMeetingModal = closeMeetingModal;
window.saveMeeting = saveMeeting;
window.editMeeting = editMeeting;
window.archiveMeeting = archiveMeeting;
window.confirmDeleteMeeting = confirmDeleteMeeting;
window.viewOccurrences = viewOccurrences;
window.closeOccurrencesModal = closeOccurrencesModal;
window.cancelOccurrence = cancelOccurrence;
window.restoreOccurrence = restoreOccurrence;
window.autoDeactivateOnceMeetings = autoDeactivateOnceMeetings;
