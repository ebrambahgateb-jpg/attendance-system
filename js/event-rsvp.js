// ═══════════════════════════════════════════════════════
//   Event RSVP + Cancel
//   ⚡ تسجيل الحضور (تأكيد/إلغاء) + الإشعارات التلقائية
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let rsvpUser = null;
let rsvpPerson = null;
let rsvpSettings = {};

// ═══════════════════════════════════════════════════════
//   Initialize
// ═══════════════════════════════════════════════════════

async function initRsvp() {
  try {
    rsvpUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    rsvpUser = null;
  }

  if (!rsvpUser) return;

  // ⚡ اجلب بيانات الشخص
  if (rsvpUser.personId) {
    const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, rsvpUser.personId));
    if (pDoc.exists()) rsvpPerson = { id: pDoc.id, ...pDoc.data() };
  }

  // ⚡ لو مفيش personId، دوّر بالبريد
  if (!rsvpPerson && rsvpUser.email) {
    try {
      const q = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', rsvpUser.email)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        rsvpPerson = { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    } catch (e) {}
  }

  // ⚡ اجلب الإعدادات
  try {
    const sDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'main'));
    rsvpSettings = sDoc.exists() ? sDoc.data() : {};
  } catch (e) {}

  console.log('✅ RSVP initialized', { user: rsvpUser?.email, person: rsvpPerson?.id });
}

// ═══════════════════════════════════════════════════════
//   Get Registration for Person + Event
// ═══════════════════════════════════════════════════════

async function getRegistration(eventId) {
  if (!rsvpPerson) return null;

  try {
    const q = query(
      collection(db, 'eventRegistrations'),
      where('EventID', '==', eventId),
      where('PersonID', '==', rsvpPerson.id)
    );
    const snap = await getDocs(q);

    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    console.warn('getRegistration error:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//   RSVP: Confirm Attendance
// ═══════════════════════════════════════════════════════

async function confirmRsvp(eventId) {
  if (!rsvpPerson) {
    alert('❌ لا يوجد ملف شخصي مرتبط بحسابك');
    return;
  }

  const eventDoc = await getDoc(doc(db, 'events', eventId));
  if (!eventDoc.exists()) {
    alert('❌ الحدث غير موجود');
    return;
  }
  const event = { id: eventDoc.id, ...eventDoc.data() };

  // ⚡ تحقق من الوقت
  if (!isEventUpcoming(event)) {
    alert('❌ لا يمكن التسجيل — الحدث قد بدأ أو انتهى');
    return;
  }

  if (!confirm(`هل تريد تأكيد حضورك في:\n"${event.Title}"؟\n\nسيتم إشعار المسؤول بتأكيدك.`)) return;

  try {
    // ⚡ ابحث عن registration موجود
    const existing = await getRegistration(eventId);

    if (existing) {
      // ⚡ حدّث
      await updateDoc(doc(db, 'eventRegistrations', existing.id), {
        Status: 'confirmed',
        ConfirmedAt: new Date().toISOString(),
        ConfirmedVia: 'user',
        UpdatedAt: new Date().toISOString()
      });
    } else {
      // ⚡ أنشئ جديد
      await addDoc(collection(db, 'eventRegistrations'), {
        EventID: eventId,
        PersonID: rsvpPerson.id,
        PersonName: getPersonFullName(rsvpPerson),
        PersonEmail: rsvpPerson.Email || rsvpUser.email,
        Status: 'confirmed',
        ConfirmedAt: new Date().toISOString(),
        ConfirmedVia: 'user',
        RegisteredBy: rsvpUser.email,
        RegisteredAt: new Date().toISOString(),
        CreatedAt: new Date().toISOString()
      });
    }

    // ⚡ إشعار للـ Admin
    await createAdminNotification(event, rsvpPerson);

    alert('✅ تم تسجيل حضورك بنجاح\n\nسيتم إشعار المسؤول.');
    return true;
  } catch (err) {
    console.error('❌ confirmRsvp error:', err);
    alert('خطأ: ' + err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Cancel Attendance (إعلان عدم الحضور)
// ═══════════════════════════════════════════════════════

function openCancelModal(eventId, eventTitle, occurrenceDate) {
  let modal = document.getElementById('cancelRsvpModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cancelRsvpModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;">
      <div class="modal-header">
        <h2>📢 إعلان عدم الحضور</h2>
        <button class="modal-close" onclick="closeCancelModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="cancel-event-info">
          <div class="cancel-info-row">
            <span class="cancel-info-label">الحدث:</span>
            <span class="cancel-info-value">${escapeHtml(eventTitle)}</span>
          </div>
          <div class="cancel-info-row">
            <span class="cancel-info-label">📅 الموعد:</span>
            <span class="cancel-info-value">${formatDate(occurrenceDate)}</span>
          </div>
        </div>

        <div class="form-row">
          <label>السبب (اختياري):</label>
          <textarea id="cancelReason" rows="3" placeholder="مثال: ظرف عائلي، مرض، سفر..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:inherit;font-size:14px;resize:vertical;"></textarea>
        </div>

        <div class="cancel-warning">
          <p class="cancel-warning-title">🔒 السبب سيظهر للمسؤولين فقط</p>
          <div class="cancel-warning-list">
            <p>⚠️ سيتم إرسال إشعارات تلقائية إلى:</p>
            <ul>
              <li>• المسؤول (Admin/Owner) — مع السبب</li>
              <li>• الزملاء في نفس الحدث — بدون سبب</li>
              <li>• باقي المستخدمين (قد يكون مكان متاح)</li>
            </ul>
          </div>
          <p class="cancel-warning-note">⚠️ بعد الإعلان، لن تقدر على التراجع</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeCancelModal()">إلغاء</button>
        <button class="btn-danger" id="confirmCancelBtn">📢 إعلان عدم الحضور</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  // ⚡ اربط الزرار
  document.getElementById('confirmCancelBtn').onclick = async () => {
    const reason = document.getElementById('cancelReason')?.value.trim() || '';
    await performCancel(eventId, eventTitle, occurrenceDate, reason);
  };
}

function closeCancelModal() {
  const modal = document.getElementById('cancelRsvpModal');
  if (modal) modal.style.display = 'none';
}

async function performCancel(eventId, eventTitle, occurrenceDate, reason) {
  const btn = document.getElementById('confirmCancelBtn');
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جاري الإعلان...';
  }

  try {
    // ⚡ ابحث عن registration
    const existing = await getRegistration(eventId);

    if (!existing) {
      alert('❌ لم يتم العثور على تسجيلك في هذا الحدث');
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      return;
    }

    // ⚡ حدّث الـ status
    await updateDoc(doc(db, 'eventRegistrations', existing.id), {
      Status: 'cancelled',
      CancelledAt: new Date().toISOString(),
      CancelReason: reason,
      CancelledBy: rsvpUser.email,
      UpdatedAt: new Date().toISOString()
    });

    // ⚡ اجلب الحدث
    const eventDoc = await getDoc(doc(db, 'events', eventId));
    const event = eventDoc.exists() ? { id: eventId, ...eventDoc.data() } : { id: eventId, Title: eventTitle };

    // ⚡ أنشئ 3 إشعارات
    await createCancelNotifications(event, rsvpPerson, occurrenceDate, reason);

    alert('✅ تم إعلان عدم حضورك بنجاح\n\nسيتم إشعار الزملاء والمسؤولين.');
    closeCancelModal();
    return true;

  } catch (err) {
    console.error('❌ performCancel error:', err);
    alert('خطأ: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Notifications Creation
// ═══════════════════════════════════════════════════════

/**
 * ⚡ إشعار للـ Admin عند تأكيد حضور
 */
async function createAdminNotification(event, person) {
  const personName = getPersonFullName(person);

  const notification = {
    Type: 'person_confirmed',
    Title: `✅ ${personName} أكّد حضوره`,
    Body: `${personName} سجّل إنه سيحضر:\n"${event.Title}"`,
    RelatedEventID: event.id,
    RelatedPersonID: person.id,
    TargetType: 'admins',
    SentBy: 'system',
    SentAt: new Date().toISOString(),
    ReadBy: [],
    CreatedAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'notifications'), notification);
  } catch (err) {
    console.warn('createAdminNotification error:', err.message);
  }
}

/**
 * ⚡ 3 إشعارات عند إعلان عدم الحضور
 */
async function createCancelNotifications(event, person, occurrenceDate, reason) {
  const personName = getPersonFullName(person);
  const eventDate = formatDate(occurrenceDate);

  // ═══ 1. للـ Admin (مع السبب) ═══
  const adminNotif = {
    Type: 'person_cancelled_admin',
    Title: `📢 إعلان عدم حضور`,
    Body: `${personName} أعلن عدم حضوره في:\n"${event.Title}" — ${eventDate}\n\nالسبب: ${reason || 'لم يُذكر'}`,
    RelatedEventID: event.id,
    RelatedPersonID: person.id,
    CancelReason: reason || '',
    TargetType: 'admins',
    SentBy: 'system',
    SentAt: new Date().toISOString(),
    ReadBy: [],
    CreatedAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'notifications'), adminNotif);
  } catch (err) {
    console.warn('admin cancel notification error:', err.message);
  }

  // ═══ 2. للزملاء في نفس الحدث (بدون سبب) ═══
  try {
    // ⚡ اجلب المسجلين في نفس الحدث
    const regsSnap = await getDocs(query(
      collection(db, 'eventRegistrations'),
      where('EventID', '==', event.id)
    ));

    const memberPersonIds = regsSnap.docs
      .map(d => d.data())
      .filter(r => r.Status === 'confirmed' && r.PersonID !== person.id)
      .map(r => r.PersonID);

    if (memberPersonIds.length > 0) {
      const memberNotif = {
        Type: 'person_cancelled_member',
        Title: `⚠️ تنبيه: زميلك مش هيحضر`,
        Body: `${personName} (المسجّل معك في "${event.Title}") أعلن عدم حضوره.`,
        RelatedEventID: event.id,
        RelatedPersonID: person.id,
        TargetType: 'specific',
        TargetPersonIDs: memberPersonIds,
        ActionURL: '',
        SentBy: 'system',
        SentAt: new Date().toISOString(),
        ReadBy: [],
        CreatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'notifications'), memberNotif);
    }
  } catch (err) {
    console.warn('member cancel notification error:', err.message);
  }

  // ═══ 3. للبث العام (بدون سبب) ═══
  const publicNotif = {
    Type: 'person_cancelled_public',
    Title: `🎟️ مكان متاح!`,
    Body: `${personName} ألغى حضوره من:\n"${event.Title}" — ${eventDate}\n\nلو مهتم تحضر مكانه، اضغط هنا للتسجيل`,
    RelatedEventID: event.id,
    RelatedPersonID: person.id,
    TargetType: 'all',
    ActionURL: `my-attendance.html?event=${event.id}`,
    SentBy: 'system',
    SentAt: new Date().toISOString(),
    ReadBy: [],
    CreatedAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'notifications'), publicNotif);
  } catch (err) {
    console.warn('public cancel notification error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function isEventUpcoming(event) {
  if (!event) return false;

  const now = new Date();

  if (String(event.Type || '').toLowerCase() === 'once' && event.Date) {
    const endTime = event.EndTime || event.Time || '23:59';
    const [h, m] = endTime.split(':').map(Number);
    const end = new Date(event.Date + 'T00:00:00');
    end.setHours(h || 0, m || 0, 0, 0);
    return now <= end;
  }

  return true; // للـ weekly نفترض دائمًا upcoming
}

function getPersonFullName(p) {
  if (!p) return '';
  return [p.FirstName, p.SecondName, p.ThirdName, p.FourthName].filter(Boolean).join(' ');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
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

window.initRsvp = initRsvp;
window.confirmRsvp = confirmRsvp;
window.openCancelModal = openCancelModal;
window.closeCancelModal = closeCancelModal;
window.performCancel = performCancel;
window.getRsvpPerson = () => rsvpPerson;
window.getRegistration = getRegistration;

// ═══ Auto-init ═══
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.initRsvp === 'function') {
      window.initRsvp();
    }
  }, 1200);
});
