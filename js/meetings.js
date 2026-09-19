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

// ═══ أنماط تحديد الأماكن ═══
const LOCATION_MODES = {
  SINGLE: 'single',    // مكان واحد محدد
  ANY: 'any',          // أي مكان متسجل
  MULTIPLE: 'multiple' // أماكن محددة (متعددة)
};

// ═══════════════════════════════════════════════════════
//   Load Meetings Page
// ═══════════════════════════════════════════════════════

async function loadMeetingsPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    const [meetingsSnap, settingsDoc] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.MEETINGS)),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC))
    ]);

    meetingsData = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    settingsCache = settingsDoc.exists() ? settingsDoc.data() : {};

    // ⚡ اجلب الأماكن المسجلة
    availableLocations = Array.isArray(settingsCache.Locations) ? settingsCache.Locations : [];

    // ترتيب حسب الوقت
    meetingsData.sort((a, b) => {
      const statusOrder = { active: 0, cancelled: 1, archived: 2 };
      const aOrder = statusOrder[String(a.Status || '').toLowerCase()] ?? 3;
      const bOrder = statusOrder[String(b.Status || '').toLowerCase()] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.Time || '').localeCompare(String(b.Time || ''));
    });

    filteredMeetings = [...meetingsData];

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
  area.innerHTML = `
    <div class="meetings-container">

      <!-- Header -->
      <div class="meetings-header">
        <div class="meetings-filters">
          <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
          <button class="filter-btn ${currentFilter === 'active' ? 'active' : ''}" data-filter="active">نشط</button>
          <button class="filter-btn ${currentFilter === 'weekly' ? 'active' : ''}" data-filter="weekly">أسبوعي</button>
          <button class="filter-btn ${currentFilter === 'once' ? 'active' : ''}" data-filter="once">مرة واحدة</button>
          <button class="filter-btn ${currentFilter === 'archived' ? 'active' : ''}" data-filter="archived">مؤرشف</button>
        </div>
        <button class="btn-primary" onclick="openMeetingModal()">
          ➕ إضافة اجتماع
        </button>
      </div>

      <!-- Stats -->
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

      <!-- Cards Grid -->
      <div class="meetings-grid" id="meetingsGrid">
        <!-- يتولد بـ JS -->
      </div>

      <!-- Empty State -->
      <div id="meetingsEmptyState" class="meetings-empty" style="display:none;">
        <div class="meetings-empty-icon">📅</div>
        <h3>لا يوجد اجتماعات</h3>
        <p>ابدأ بإضافة اجتماع جديد</p>
        <button class="btn-primary" onclick="openMeetingModal()">➕ إضافة اجتماع</button>
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

  grid.innerHTML = filteredMeetings.map(meeting => {
    const status = String(meeting.Status || 'active').toLowerCase();
    const type = String(meeting.Type || 'once').toLowerCase();
    const canceledOccurrences = meeting.CanceledOccurrences || [];

    let statusBadge = '';
    if (status === 'archived') {
      statusBadge = '<span class="status-badge archived">📦 مؤرشف</span>';
    } else if (status === 'cancelled') {
      statusBadge = '<span class="status-badge inactive">❌ ملغي</span>';
    } else {
      statusBadge = '<span class="status-badge active">✅ نشط</span>';
    }

    const typeBadge = type === 'weekly'
      ? '<span class="type-badge weekly">🔄 أسبوعي</span>'
      : '<span class="type-badge once">1️⃣ مرة واحدة</span>';

    // معلومات التاريخ
    let dateInfo = '';
    if (type === 'weekly') {
      const dayLabel = getDayLabel(meeting.DayOfWeek);
      dateInfo = `كل ${dayLabel}`;
    } else {
      dateInfo = formatDate(meeting.Date);
    }

    // عدد الإلغاءات
    const cancelInfo = canceledOccurrences.length > 0
      ? `<span class="cancel-count">${canceledOccurrences.length} موعد ملغي</span>`
      : '';

    // ⚡ معلومات الأماكن
    const locationsInfo = getLocationsInfoText(meeting);

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
              <span>${escapeHtml(meeting.Time || '-')}</span>
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

        <div class="meeting-card-footer">
          <button class="btn-icon" onclick="viewOccurrences('${meeting.id}')" title="المواعيد">📋</button>
          <button class="btn-icon" onclick="editMeeting('${meeting.id}')" title="تعديل">✏️</button>
          ${status !== 'archived' ? `
            <button class="btn-icon" onclick="archiveMeeting('${meeting.id}')" title="أرشفة">📦</button>
          ` : ''}
          <button class="btn-icon danger" onclick="confirmDeleteMeeting('${meeting.id}')" title="حذف">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// ═══ معلومات الأماكن في الكارت ═══
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
  if (currentFilter === 'all') {
    filteredMeetings = [...meetingsData];
  } else if (currentFilter === 'active') {
    filteredMeetings = meetingsData.filter(m =>
      String(m.Status || '').toLowerCase() === 'active'
    );
  } else if (currentFilter === 'weekly') {
    filteredMeetings = meetingsData.filter(m =>
      String(m.Type || '').toLowerCase() === 'weekly'
    );
  } else if (currentFilter === 'once') {
    filteredMeetings = meetingsData.filter(m =>
      String(m.Type || '').toLowerCase() === 'once'
    );
  } else if (currentFilter === 'archived') {
    filteredMeetings = meetingsData.filter(m =>
      String(m.Status || '').toLowerCase() === 'archived'
    );
  }

  renderMeetingsGrid();
}

// ═══════════════════════════════════════════════════════
//   Meeting Modal
// ═══════════════════════════════════════════════════════

function openMeetingModal(meetingId) {
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

  // ⚡ لو مفيش أماكن مسجلة
  const noLocations = availableLocations.length === 0;

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

        <!-- حقول Once -->
        <div id="onceFields" style="${type === 'once' ? '' : 'display:none;'}">
          <div class="form-row">
            <label>التاريخ *</label>
            <input type="date" id="meetingDate" value="${meeting && meeting.Date ? meeting.Date : ''}" />
          </div>
        </div>

        <!-- حقول Weekly -->
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

        <div class="form-row">
          <label>الوقت *</label>
          <input type="time" id="meetingTime" value="${meeting && meeting.Time ? meeting.Time : '19:00'}" />
        </div>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="meetingActive" ${!meeting || String(meeting.Status || 'active').toLowerCase() === 'active' ? 'checked' : ''} />
          <label for="meetingActive">نشط</label>
        </div>

        <!-- ═══ الأماكن المسموحة ═══ -->
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

            <!-- اختيار مكان واحد -->
            <div id="singleLocationBox" class="location-picker-box" style="${locationMode === 'single' ? '' : 'display:none;'}">
              <label>اختر المكان</label>
              <select id="singleLocationSelect">
                ${availableLocations.map(loc => `
                  <option value="${loc.id}" ${locationIds[0] === loc.id ? 'selected' : ''}>${escapeHtml(loc.name)}</option>
                `).join('')}
              </select>
            </div>

            <!-- اختيار أماكن متعددة -->
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

  // Event: تغيير النوع (once/weekly)
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

  // Event: تغيير وضع الأماكن
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
  const title = document.getElementById('meetingTitle')?.value.trim();
  const type = document.getElementById('meetingType')?.value;
  const date = document.getElementById('meetingDate')?.value || '';
  const dayOfWeek = document.getElementById('meetingDayOfWeek')?.value || '';
  const time = document.getElementById('meetingTime')?.value || '';
  const isActive = document.getElementById('meetingActive')?.checked;

  // Validation
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
    alert('الوقت مطلوب');
    return;
  }

  // ═══ قراءة الأماكن المسموحة ═══
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
  // لو any → locationIds تفضل فاضية

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
    await loadMeetingsPage(area);

  } catch (err) {
    console.error('❌ Save meeting error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Edit
// ═══════════════════════════════════════════════════════

function editMeeting(meetingId) {
  openMeetingModal(meetingId);
}

// ═══════════════════════════════════════════════════════
//   Archive
// ═══════════════════════════════════════════════════════

async function archiveMeeting(meetingId) {
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
    await loadMeetingsPage(area);

  } catch (err) {
    console.error('❌ Archive meeting error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Delete
// ═══════════════════════════════════════════════════════

async function confirmDeleteMeeting(meetingId) {
  const meeting = meetingsData.find(m => m.id === meetingId);
  if (!meeting) return;

  if (!confirm(`⚠️ هل أنت متأكد من حذف "${meeting.Title}"؟\n\nهذا الإجراء لا يمكن التراجع عنه.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, COLLECTIONS.MEETINGS, meetingId));

    alert('✅ تم الحذف بنجاح');

    const area = document.getElementById('contentArea');
    await loadMeetingsPage(area);

  } catch (err) {
    console.error('❌ Delete meeting error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   View Occurrences (المواعيد القادمة)
// ═══════════════════════════════════════════════════════

function viewOccurrences(meetingId) {
  const meeting = meetingsData.find(m => m.id === meetingId);
  if (!meeting) return;

  const type = String(meeting.Type || 'once').toLowerCase();
  const canceledOccurrences = meeting.CanceledOccurrences || [];

  let occurrencesHtml = '';

  if (type === 'once') {
    const isCancelled = canceledOccurrences.includes(meeting.Date);
    occurrencesHtml = `
      <div class="occurrence-item ${isCancelled ? 'cancelled' : ''}">
        <div class="occurrence-date">${formatDate(meeting.Date)}</div>
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
      return `
        <div class="occurrence-item ${isCancelled ? 'cancelled' : ''}">
          <div class="occurrence-date">${formatDate(dateStr)}</div>
          <div class="occurrence-actions">
            ${isCancelled
              ? `<button class="btn-small" onclick="restoreOccurrence('${meetingId}', '${dateStr}')">↺ استعادة</button>`
              : `<button class="btn-small danger" onclick="cancelOccurrence('${meetingId}', '${dateStr}')">✕ إلغاء</button>`
            }
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

    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
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
