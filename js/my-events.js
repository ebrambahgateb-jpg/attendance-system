// ═══════════════════════════════════════════════════════
//   My Events (حضوري) — مع دعم الأحداث الاختيارية
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
let meUser = null;
let mePerson = null;
let meEvents = [];
let meEventTypes = [];
let meLocations = [];
let meRegistrations = {};
let meAttendance = [];
let meSettings = {};

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

async function loadMyEventsPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    meUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!meUser) {
      window.location.href = '../index.html';
      return;
    }

    mePerson = null;
    const personId = meUser.personId || meUser.account?.PersonID;

    if (personId) {
      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, personId));
      if (pDoc.exists()) mePerson = { id: pDoc.id, ...pDoc.data() };
    }

    if (!mePerson && meUser.email) {
      const q = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', meUser.email)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        mePerson = { id: snap.docs[0].id, ...snap.docs[0].data() };
        meUser.personId = mePerson.id;
        localStorage.setItem('currentUser', JSON.stringify(meUser));
      }
    }

    if (!mePerson) {
      area.innerHTML = `
        <div class="me-empty">
          <div class="me-empty-icon">👤</div>
          <h2>لا يوجد ملف شخصي</h2>
          <p>لم يتم ربط حسابك بأي شخص في النظام.</p>
          <p>تواصل مع المسؤول لربط حسابك.</p>
        </div>
      `;
      return;
    }

    const [
      eventsSnap,
      eventTypesSnap,
      locationsSnap,
      regsSnap,
      attSnap,
      settingsDoc
    ] = await Promise.all([
      getDocs(collection(db, 'events')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'eventTypes')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'locations')).catch(() => ({ docs: [] })),
      getDocs(query(
        collection(db, 'eventRegistrations'),
        where('PersonID', '==', mePerson.id)
      )).catch(() => ({ docs: [] })),
      getDocs(query(
        collection(db, COLLECTIONS.ATTENDANCE),
        where('PersonID', '==', mePerson.id)
      )).catch(() => ({ docs: [] })),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC)).catch(() => null)
    ]);

    meEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    meEventTypes = eventTypesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    meLocations = locationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    meAttendance = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    meSettings = settingsDoc && settingsDoc.exists() ? settingsDoc.data() : {};

    meRegistrations = {};
    regsSnap.docs.forEach(d => {
      const reg = { id: d.id, ...d.data() };
      if (reg.EventID) meRegistrations[reg.EventID] = reg;
    });

    renderMyEventsPage(area);
  } catch (err) {
    console.error('❌ Load my-events error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadMyEventsPage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderMyEventsPage(area) {
  const fullName = [
    mePerson.FirstName, mePerson.SecondName, mePerson.ThirdName, mePerson.FourthName
  ].filter(Boolean).join(' ');

  const { pending, confirmed, cancelRequested, cancelled, optional } = categorizeEvents();

  const stats = {
    attended: meAttendance.length,
    confirmed: confirmed.length,
    pending: pending.length,
    total: meEvents.filter(e => String(e.Status || '').toLowerCase() === 'active').length
  };

  const recentAttendance = [...meAttendance]
    .sort((a, b) => {
      const da = parseDate(a.ScanTime) || new Date(0);
      const db2 = parseDate(b.ScanTime) || new Date(0);
      return db2 - da;
    })
    .slice(0, 10);

  area.innerHTML = `
    <div class="me-container">

      <div class="me-header">
        <h2>مرحبًا ${escapeHtml(fullName || meUser.name || '')}</h2>
        <p>هنا هتلاقي كل حاجة تخص حضورك</p>
      </div>

      <div class="me-stats">
        <div class="me-stat">
          <span class="me-stat-value">${stats.attended}</span>
          <span class="me-stat-label">✅ حضرت</span>
        </div>
        <div class="me-stat">
          <span class="me-stat-value">${stats.confirmed}</span>
          <span class="me-stat-label">✔️ أكّدت</span>
        </div>
        <div class="me-stat">
          <span class="me-stat-value">${stats.pending}</span>
          <span class="me-stat-label">⏰ محتاج تأكيد</span>
        </div>
        <div class="me-stat">
          <span class="me-stat-value">${stats.total}</span>
          <span class="me-stat-label">📅 إجمالي الأحداث</span>
        </div>
      </div>

      ${pending.length > 0 ? `
        <div class="me-section">
          <h3 class="me-section-title">
            ⏰ أحداث محتاجة تأكيد
            <span class="me-section-count pending">${pending.length}</span>
          </h3>
          <div class="me-list">
            ${pending.map(e => renderEventCard(e, 'pending')).join('')}
          </div>
        </div>
      ` : ''}

      ${cancelRequested.length > 0 ? `
        <div class="me-section">
          <h3 class="me-section-title">
            ⏳ في انتظار موافقة المسؤول
            <span class="me-section-count warning">${cancelRequested.length}</span>
          </h3>
          <div class="me-list">
            ${cancelRequested.map(e => renderEventCard(e, 'cancel_requested')).join('')}
          </div>
        </div>
      ` : ''}

      ${confirmed.length > 0 ? `
        <div class="me-section">
          <h3 class="me-section-title">
            ✅ أحداث مؤكدها
            <span class="me-section-count confirmed">${confirmed.length}</span>
          </h3>
          <div class="me-list">
            ${confirmed.map(e => renderEventCard(e, 'confirmed')).join('')}
          </div>
        </div>
      ` : ''}

      ${optional.length > 0 ? `
        <div class="me-section">
          <h3 class="me-section-title">
            🟢 أحداث اختيارية (مفتوحة للجميع)
            <span class="me-section-count optional">${optional.length}</span>
          </h3>
          <div class="me-list">
            ${optional.map(e => renderEventCard(e, 'optional')).join('')}
          </div>
        </div>
      ` : ''}

      ${cancelled.length > 0 ? `
        <div class="me-section">
          <h3 class="me-section-title">
            ❌ أحداث ملغية
            <span class="me-section-count cancelled">${cancelled.length}</span>
          </h3>
          <div class="me-list">
            ${cancelled.map(e => renderEventCard(e, 'cancelled')).join('')}
          </div>
        </div>
      ` : ''}

      ${pending.length === 0 && confirmed.length === 0 && cancelRequested.length === 0 && cancelled.length === 0 && optional.length === 0 ? `
        <div class="me-empty">
          <div class="me-empty-icon">🎯</div>
          <h2>مفيش أحداث لسه</h2>
          <p>لسه مفيش أحداث ملتزم بيها أو مؤكدها.</p>
        </div>
      ` : ''}

      <div class="me-section">
        <h3 class="me-section-title">📅 سجل الحضور (آخر 10)</h3>
        ${recentAttendance.length > 0 ? `
          <div class="me-attendance-list">
            ${recentAttendance.map(a => renderAttendanceItem(a)).join('')}
          </div>
        ` : `
          <div class="me-attendance-empty">لم تسجّل حضورك بعد</div>
        `}
      </div>

    </div>
  `;

  setupMyEventsHandlers();
}

// ═══════════════════════════════════════════════════════
//   Categorize Events
// ═══════════════════════════════════════════════════════

function categorizeEvents() {
  const pending = [];
  const confirmed = [];
  const cancelRequested = [];
  const cancelled = [];
  const optional = [];

  const activeEvents = meEvents.filter(e => String(e.Status || '').toLowerCase() === 'active');

  for (const event of activeEvents) {
    if (!isEventUpcoming(event)) continue;

    const reg = meRegistrations[event.id];
    const status = reg?.Status || 'pending';
    const scope = String(event.RegistrationScope || 'all').toLowerCase();

    // ⚡ الأحداث الاختيارية
    if (scope === 'optional') {
      // ⚡ لو الشخص مسجّل فيها → يبقى مؤكد أو ملغي
      if (status === 'confirmed') {
        confirmed.push(event);
      } else if (status === 'cancel_requested') {
        cancelRequested.push(event);
      } else if (status === 'cancelled') {
        cancelled.push(event);
      } else {
        // ⚡ pending أو مفيش تسجيل → يحط في optional
        optional.push(event);
      }
      continue;
    }

    // ⚡ الأحداث الإلزامية (all/specific)
    if (!isPersonObligated(event)) continue;

    if (status === 'confirmed') {
      confirmed.push(event);
    } else if (status === 'cancel_requested') {
      cancelRequested.push(event);
    } else if (status === 'cancelled') {
      cancelled.push(event);
    } else {
      pending.push(event);
    }
  }

  const sortByDate = (a, b) => {
    const da = getEventSortDate(a);
    const db2 = getEventSortDate(b);
    return da - db2;
  };

  pending.sort(sortByDate);
  confirmed.sort(sortByDate);
  cancelRequested.sort(sortByDate);
  cancelled.sort(sortByDate);
  optional.sort(sortByDate);

  return { pending, confirmed, cancelRequested, cancelled, optional };
}

function isPersonObligated(event) {
  const scope = String(event.RegistrationScope || 'all').toLowerCase();

  if (scope === 'all') return true;

  if (scope === 'specific') {
    const ids = Array.isArray(event.RegistrationPersonIDs) ? event.RegistrationPersonIDs : [];
    return ids.includes(mePerson.id);
  }

  return false;
}

function isEventUpcoming(event) {
  const now = new Date();
  const type = String(event.Type || 'once').toLowerCase();

  if (type === 'weekly') return true;

  if (!event.Date) return false;

  const endTime = event.EndTime || event.Time || '23:59';
  const [h, m] = endTime.split(':').map(Number);
  const end = new Date(event.Date + 'T00:00:00');
  end.setHours(h || 0, m || 0, 0, 0);

  if (end < now) return false;

  const diffDays = (end - now) / (1000 * 60 * 60 * 24);
  return diffDays <= 30;
}

function getEventSortDate(event) {
  const type = String(event.Type || 'once').toLowerCase();

  if (type === 'once' && event.Date) {
    return new Date(event.Date + 'T00:00:00').getTime();
  }

  if (type === 'weekly' && event.DayOfWeek) {
    const dayMap = { Saturday: 6, Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
    const targetDay = dayMap[event.DayOfWeek];
    if (targetDay === undefined) return Infinity;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = (targetDay - today.getDay() + 7) % 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + diff);
    return nextDate.getTime();
  }

  return Infinity;
}

// ═══════════════════════════════════════════════════════
//   Render Event Card
// ═══════════════════════════════════════════════════════

function renderEventCard(event, status) {
  const type = String(event.Type || 'once').toLowerCase();
  const eventType = meEventTypes.find(t => t.id === event.EventTypeID);
  const eventTypeIcon = eventType ? (eventType.Icon || '📅') : '📅';
  const eventTypeName = eventType ? eventType.Name : '';

  const endTime = getEventEndTime(event);
  const timeInfo = `${event.Time || '-'} - ${endTime}`;

  let dateInfo = '';
  if (type === 'weekly') {
    const dayLabel = DAYS_OF_WEEK[event.DayOfWeek] || '';
    dateInfo = `كل ${dayLabel}`;
  } else {
    dateInfo = formatDate(event.Date);
  }

  const locInfo = getLocationInfo(event);
  const reg = meRegistrations[event.id];

  let actionsHtml = '';

  if (status === 'pending') {
    actionsHtml = `
      <div class="me-actions">
        <button class="me-btn me-btn-confirm" onclick="meConfirmRsvp('${event.id}')">✅ سجّل حضورك</button>
      </div>
    `;
  } else if (status === 'confirmed') {
    actionsHtml = `
      <div class="me-actions">
        <button class="me-btn me-btn-cancel" onclick="meOpenCancelModal('${event.id}', '${escapeAttr(event.Title || '')}', '${type === 'once' ? event.Date : ''}')">📢 إعلان عدم الحضور</button>
      </div>
    `;
  } else if (status === 'cancel_requested') {
    const reasonHtml = reg?.CancelReason
      ? `<div class="me-cancel-reason"><strong>السبب:</strong> ${escapeHtml(reg.CancelReason)}</div>`
      : '';

    actionsHtml = `
      ${reasonHtml}
      <div class="me-status-banner warning">
        ⏳ في انتظار موافقة المسؤول
      </div>
      <div class="me-actions">
        <button class="me-btn me-btn-revert" onclick="meRevertCancel('${event.id}')">🚫 إلغاء طلب الإلغاء</button>
      </div>
    `;
  } else if (status === 'cancelled') {
    actionsHtml = `
      <div class="me-status-banner cancelled">
        ❌ تم إلغاء حضورك
      </div>
    `;
  } else if (status === 'optional') {
    actionsHtml = `
      <div class="me-status-banner optional">
        🟢 حدث اختياري — يمكنك التسجيل
      </div>
      <div class="me-actions">
        <button class="me-btn me-btn-confirm" onclick="meConfirmRsvp('${event.id}')">✅ سجّل حضورك</button>
      </div>
    `;
  }

  return `
    <div class="me-card me-card-${status}">
      <div class="me-card-header">
        <div class="me-card-icon">${eventTypeIcon}</div>
        <div class="me-card-title-wrap">
          <h4 class="me-card-title">${escapeHtml(event.Title || '')}</h4>
          ${eventTypeName ? `<span class="me-card-type">${escapeHtml(eventTypeName)}</span>` : ''}
        </div>
      </div>

      <div class="me-card-info">
        <div class="me-info-row">
          <span class="me-info-icon">${type === 'weekly' ? '🔄' : '📅'}</span>
          <span>${dateInfo}</span>
        </div>
        <div class="me-info-row">
          <span class="me-info-icon">🕐</span>
          <span>${escapeHtml(timeInfo)}</span>
        </div>
        <div class="me-info-row">
          <span class="me-info-icon">📍</span>
          <span>${escapeHtml(locInfo)}</span>
        </div>
      </div>

      ${actionsHtml}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Render Attendance Item
// ═══════════════════════════════════════════════════════

function renderAttendanceItem(record) {
  const scanDate = parseDate(record.ScanTime);
  const dateStr = scanDate ? formatDateTime(scanDate) : '-';
  const eventTitle = record.EventTitle || record.MeetingTitle || 'حدث';
  const method = record.Method === 'self' ? '📱' : '📷';

  return `
    <div class="me-attendance-item">
      <div class="me-attendance-icon">✅</div>
      <div class="me-attendance-content">
        <div class="me-attendance-title">${escapeHtml(eventTitle)}</div>
        <div class="me-attendance-meta">${dateStr} • ${method}</div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Actions
// ═══════════════════════════════════════════════════════

window.meConfirmRsvp = async function(eventId) {
  if (typeof window.confirmRsvp !== 'function') {
    alert('⚠️ خدمة RSVP غير جاهزة، حاول من جديد');
    return;
  }

  const result = await window.confirmRsvp(eventId);
  if (result) {
    await loadMyEventsPage(document.getElementById('contentArea'));
  }
};

window.meOpenCancelModal = function(eventId, eventTitle, occurrenceDate) {
  if (typeof window.openCancelModal !== 'function') {
    alert('⚠️ خدمة RSVP غير جاهزة، حاول من جديد');
    return;
  }

  window.openCancelModal(eventId, eventTitle, occurrenceDate);
};

window.meRevertCancel = async function(eventId) {
  if (!confirm('هل تريد التراجع عن طلب الإلغاء؟\n\nحضورك هيبقى مؤكد مرة تانية.')) return;

  if (typeof window.confirmRsvp !== 'function') {
    alert('⚠️ خدمة RSVP غير جاهزة');
    return;
  }

  const result = await window.confirmRsvp(eventId);
  if (result) {
    await loadMyEventsPage(document.getElementById('contentArea'));
  }
};

function setupMyEventsHandlers() {
  // ⚡ بنستخدم inline onclick
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getLocationInfo(event) {
  const mode = String(event.LocationMode || 'any').toLowerCase();

  if (mode === 'any') return 'أي مكان مسجل';

  const ids = Array.isArray(event.LocationIds) ? event.LocationIds : [];
  if (ids.length === 0) return 'لم يتم تحديد أماكن';

  const names = ids.map(id => {
    const loc = meLocations.find(l => l.id === id);
    return loc ? loc.Name : null;
  }).filter(Boolean);

  return names.length > 0 ? names.join(' • ') : 'مكان محذوف';
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

function formatDateTime(date) {
  if (!date) return '-';
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} — ${h}:${m}`;
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

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, ' ');
}

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.loadMyEventsPage = loadMyEventsPage;
