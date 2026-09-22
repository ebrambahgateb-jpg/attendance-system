// ═══════════════════════════════════════════════════════
//   Event RSVP + Cancel (with Admin Approval)
//   ⚡ تأكيد الحضور + طلب الإلغاء + طلب النقل
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where
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

  if (rsvpUser.personId) {
    const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, rsvpUser.personId));
    if (pDoc.exists()) rsvpPerson = { id: pDoc.id, ...pDoc.data() };
  }

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

async function getRegistrationStatus(eventId) {
  const reg = await getRegistration(eventId);
  if (!reg) return { status: 'pending', registration: null };
  return { status: reg.Status || 'pending', registration: reg };
}

// ═══════════════════════════════════════════════════════
//   RSVP: Confirm Attendance
// ═══════════════════════════════════════════════════════

async function confirmRsvp(eventId) {
  if (!rsvpPerson) {
    alert('❌ لا يوجد ملف شخصي مرتبط بحسابك');
    return false;
  }

  const eventDoc = await getDoc(doc(db, 'events', eventId));
  if (!eventDoc.exists()) {
    alert('❌ الحدث غير موجود');
    return false;
  }
  const event = { id: eventDoc.id, ...eventDoc.data() };

  if (!isEventUpcoming(event)) {
    alert('❌ لا يمكن التسجيل — الحدث قد بدأ أو انتهى');
    return false;
  }

  const existing = await getRegistration(eventId);

  if (existing && existing.Status === 'cancel_requested') {
    if (!confirm(`هل تريد التراجع عن طلب إلغاء الحضور في:\n"${event.Title}"؟\n\nسيبقى حضورك مؤكدًا.`)) return false;

    try {
      await updateDoc(doc(db, 'eventRegistrations', existing.id), {
        Status: 'confirmed',
        CancelRequestedAt: null,
        CancelReason: null,
        ReconfirmedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString()
      });

      await createAdminReconfirmNotification(event, rsvpPerson);

      // ⚡ سجل التراجع
      if (typeof window.logAction === 'function') {
        await window.logAction({
          action: 'rsvp_reconfirmed',
          type: 'event',
          title: `تراجع عن طلب إلغاء: ${event.Title}`,
          description: `${getPersonFullName(rsvpPerson)} تراجع عن طلب إلغاء حضوره`,
          relatedID: eventId,
          relatedTitle: event.Title
        });
      }

      alert('✅ تم التراجع — حضورك مؤكد');
      return true;
    } catch (err) {
      alert('خطأ: ' + err.message);
      return false;
    }
  }

  if (existing && existing.Status === 'cancelled') {
    alert('❌ لا يمكن تأكيد الحضور — تم إلغاء تسجيلك بالفعل');
    return false;
  }

  if (existing && existing.RejectedBefore === true && existing.Status !== 'confirmed') {
    alert('❌ لا يمكن التسجيل — تم رفض طلبك سابقًا. تواصل مع المسؤول.');
    return false;
  }

  if (!confirm(`هل تريد تأكيد حضورك في:\n"${event.Title}"؟\n\nسيتم إشعار المسؤول بتأكيدك.`)) return false;

  try {
    if (existing) {
      await updateDoc(doc(db, 'eventRegistrations', existing.id), {
        Status: 'confirmed',
        ConfirmedAt: new Date().toISOString(),
        ConfirmedVia: 'user',
        UpdatedAt: new Date().toISOString()
      });
    } else {
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
        RejectedBefore: false,
        CreatedAt: new Date().toISOString()
      });
    }

    await createAdminNotification(event, rsvpPerson);

    // ⚡ سجل التأكيد
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'rsvp_confirmed',
        type: 'event',
        title: `تأكيد حضور: ${event.Title}`,
        description: `${getPersonFullName(rsvpPerson)} أكّد حضوره`,
        relatedID: eventId,
        relatedTitle: event.Title
      });
    }

    alert('✅ تم تسجيل حضورك بنجاح\n\nسيتم إشعار المسؤول.');
    return true;
  } catch (err) {
    console.error('❌ confirmRsvp error:', err);
    alert('خطأ: ' + err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Cancel Request
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
        <h2>📢 طلب إلغاء الحضور</h2>
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
          <p class="cancel-warning-title">⚠️ مهم: هذا طلب محتاج موافقة</p>
          <div class="cancel-warning-list">
            <p>سيتم إرسال طلبك للمسؤول (Admin/Owner) للمراجعة.</p>
            <ul>
              <li>• <strong>لو وافق</strong> → يتم إلغاء حضورك + إشعار للزملاء</li>
              <li>• <strong>لو رفض</strong> → ترجع مؤكدًا + إشعار لك</li>
              <li>• <strong>لو ما ردش</strong> → تفترض حضورك مؤكدًا</li>
            </ul>
            <p style="margin-top:8px;">🔒 السبب سيظهر للمسؤولين فقط.</p>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeCancelModal()">تراجع</button>
        <button class="btn-danger" id="confirmCancelBtn">📢 إرسال طلب الإلغاء</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

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
    btn.textContent = '⏳ جاري إرسال الطلب...';
  }

  try {
    const existing = await getRegistration(eventId);

    if (!existing) {
      alert('❌ لم يتم العثور على تسجيلك في هذا الحدث');
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
      return false;
    }

    if (existing.RejectedBefore === true) {
      alert('❌ لا يمكن تقديم طلب إلغاء جديد — تم رفض طلبك سابقًا. تواصل مع المسؤول مباشرة.');
      closeCancelModal();
      return false;
    }

    if (existing.Status !== 'confirmed') {
      alert('❌ لا يمكن تقديم طلب إلغاء — يجب أن يكون حضورك مؤكدًا أولاً');
      closeCancelModal();
      return false;
    }

    await updateDoc(doc(db, 'eventRegistrations', existing.id), {
      Status: 'cancel_requested',
      CancelRequestedAt: new Date().toISOString(),
      CancelReason: reason,
      CancelledBy: rsvpUser.email,
      UpdatedAt: new Date().toISOString()
    });

    const eventDoc = await getDoc(doc(db, 'events', eventId));
    const event = eventDoc.exists() ? { id: eventId, ...eventDoc.data() } : { id: eventId, Title: eventTitle };

    await createCancelRequestNotification(event, rsvpPerson, occurrenceDate, reason);

    // ⚡ سجل الطلب
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'rsvp_cancel_requested',
        type: 'event',
        title: `طلب إلغاء حضور: ${eventTitle}`,
        description: `${getPersonFullName(rsvpPerson)} طلب إلغاء حضوره — السبب: ${reason || 'لم يُذكر'}`,
        relatedID: eventId,
        relatedTitle: eventTitle
      });
    }

    alert('✅ تم إرسال طلب الإلغاء\n\nسيقوم المسؤول بمراجعة طلبك.');
    closeCancelModal();
    return true;

  } catch (err) {
    console.error('❌ performCancel error:', err);
    alert('خطأ: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Admin Approval Functions
// ═══════════════════════════════════════════════════════

async function approveCancel(registrationId) {
  try {
    const regDoc = await getDoc(doc(db, 'eventRegistrations', registrationId));
    if (!regDoc.exists()) {
      alert('❌ الطلب غير موجود');
      return false;
    }
    const reg = { id: regDoc.id, ...regDoc.data() };

    if (reg.Status !== 'cancel_requested') {
      alert('⚠️ هذا الطلب مش في حالة انتظار الموافقة');
      return false;
    }

    const user = JSON.parse(localStorage.getItem('currentUser'));

    await updateDoc(doc(db, 'eventRegistrations', registrationId), {
      Status: 'cancelled',
      CancelApprovedAt: new Date().toISOString(),
      CancelApprovedBy: user?.email || '',
      CancelledAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    });

    const eventDoc = await getDoc(doc(db, 'events', reg.EventID));
    const event = eventDoc.exists() ? { id: eventDoc.id, ...eventDoc.data() } : { id: reg.EventID, Title: '' };

    const personDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, reg.PersonID));
    const person = personDoc.exists() ? { id: personDoc.id, ...personDoc.data() } : { id: reg.PersonID };

    await createCancelNotifications(event, person, event.Date || '', reg.CancelReason || '');

    await addDoc(collection(db, 'notifications'), {
      Type: 'cancel_approved',
      Title: '✅ تمت الموافقة على طلب الإلغاء',
      Body: `تمت الموافقة على طلب إلغاء حضورك في:\n"${event.Title || ''}"`,
      RelatedEventID: event.id,
      RelatedPersonID: person.id,
      TargetType: 'person',
      TargetPersonID: person.id,
      SentBy: 'system',
      SentAt: new Date().toISOString(),
      ReadBy: [],
      CreatedAt: new Date().toISOString()
    });

    // ⚡ سجل الموافقة
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'rsvp_cancel_approved',
        type: 'event',
        title: `موافقة على إلغاء: ${event.Title || ''}`,
        description: `${getPersonFullName(person)} تمت الموافقة على إلغاء حضوره`,
        relatedID: event.id,
        relatedTitle: event.Title || ''
      });
    }

    return true;
  } catch (err) {
    console.error('❌ approveCancel error:', err);
    alert('خطأ: ' + err.message);
    return false;
  }
}

async function rejectCancel(registrationId) {
  try {
    const regDoc = await getDoc(doc(db, 'eventRegistrations', registrationId));
    if (!regDoc.exists()) {
      alert('❌ الطلب غير موجود');
      return false;
    }
    const reg = { id: regDoc.id, ...regDoc.data() };

    if (reg.Status !== 'cancel_requested') {
      alert('⚠️ هذا الطلب مش في حالة انتظار الموافقة');
      return false;
    }

    const user = JSON.parse(localStorage.getItem('currentUser'));

    await updateDoc(doc(db, 'eventRegistrations', registrationId), {
      Status: 'confirmed',
      CancelRejectedAt: new Date().toISOString(),
      CancelRejectedBy: user?.email || '',
      CancelRequestedAt: null,
      CancelReason: null,
      RejectedBefore: true,
      UpdatedAt: new Date().toISOString()
    });

    const eventDoc = await getDoc(doc(db, 'events', reg.EventID));
    const event = eventDoc.exists() ? { id: eventDoc.id, ...eventDoc.data() } : { id: reg.EventID, Title: '' };

    await addDoc(collection(db, 'notifications'), {
      Type: 'cancel_rejected',
      Title: '❌ تم رفض طلب الإلغاء',
      Body: `تم رفض طلب إلغاء حضورك في:\n"${event.Title || ''}"\n\nحضورك مؤكد — تواصل مع المسؤول لو عندك ظرف خاص.`,
      RelatedEventID: event.id,
      RelatedPersonID: reg.PersonID,
      TargetType: 'person',
      TargetPersonID: reg.PersonID,
      SentBy: 'system',
      SentAt: new Date().toISOString(),
      ReadBy: [],
      CreatedAt: new Date().toISOString()
    });

    // ⚡ سجل الرفض
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'rsvp_cancel_rejected',
        type: 'event',
        title: `رفض إلغاء: ${event.Title || ''}`,
        description: `تم رفض طلب إلغاء الحضور`,
        relatedID: event.id,
        relatedTitle: event.Title || ''
      });
    }

    return true;
  } catch (err) {
    console.error('❌ rejectCancel error:', err);
    alert('خطأ: ' + err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Transfer Request
// ═══════════════════════════════════════════════════════

async function openTransferModal(fromEventId, fromEventTitle) {
  if (!rsvpPerson) {
    alert('❌ لا يوجد ملف شخصي مرتبط بحسابك');
    return;
  }

  const fromReg = await getRegistration(fromEventId);
  if (!fromReg || fromReg.Status !== 'confirmed') {
    alert('❌ يجب أن يكون حضورك مؤكدًا في الحدث الأصلي أولاً');
    return;
  }

  let allEvents = [];
  try {
    const snap = await getDocs(collection(db, 'events'));
    allEvents = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => String(e.Status || '').toLowerCase() === 'active')
      .filter(e => e.id !== fromEventId);
  } catch (err) {
    console.error('❌ Load events for transfer:', err);
    alert('خطأ في تحميل الأحداث: ' + err.message);
    return;
  }

  const myRegs = {};
  try {
    const q = query(
      collection(db, 'eventRegistrations'),
      where('PersonID', '==', rsvpPerson.id)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const r = d.data();
      if (r.EventID) myRegs[r.EventID] = r.Status;
    });
  } catch (e) {}

  const availableEvents = allEvents.filter(e => {
    const status = myRegs[e.id];
    return status !== 'confirmed' && status !== 'cancel_requested';
  });

  if (availableEvents.length === 0) {
    alert('❌ لا يوجد أحداث أخرى متاحة للنقل إليها');
    return;
  }

  const eventTypes = {};
  try {
    const typesSnap = await getDocs(collection(db, 'eventTypes'));
    typesSnap.docs.forEach(d => {
      eventTypes[d.id] = { id: d.id, ...d.data() };
    });
  } catch (e) {}

  const optionsHtml = availableEvents.map(e => {
    const type = eventTypes[e.EventTypeID];
    const typeIcon = type ? (type.Icon || '📅') : '📅';
    const typeName = type ? type.Name : '';

    const type_e = String(e.Type || 'once').toLowerCase();
    let dateStr = '';
    if (type_e === 'weekly') {
      const days = {Sunday:'الأحد',Monday:'الاثنين',Tuesday:'الثلاثاء',Wednesday:'الأربعاء',Thursday:'الخميس',Friday:'الجمعة',Saturday:'السبت'};
      dateStr = 'كل ' + (days[e.DayOfWeek] || '');
    } else if (e.Date) {
      dateStr = e.Date;
    }

    return `<option value="${e.id}">${typeIcon} ${escapeHtml(e.Title || '')}${typeName ? ' — ' + escapeHtml(typeName) : ''} (${dateStr} ${e.Time || ''})</option>`;
  }).join('');

  let modal = document.getElementById('transferRsvpModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'transferRsvpModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:560px;">
      <div class="modal-header">
        <h2>🔄 طلب نقل الحضور</h2>
        <button class="modal-close" onclick="closeTransferModal()">✕</button>
      </div>

      <div class="modal-body">

        <div class="transfer-info-box">
          <div class="transfer-info-row">
            <span class="transfer-info-label">من:</span>
            <span class="transfer-info-value">${escapeHtml(fromEventTitle)}</span>
          </div>
        </div>

        <div class="form-row">
          <label>إلى الحدث *</label>
          <select id="transferToEvent" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:inherit;font-size:14px;">
            <option value="">-- اختر الحدث --</option>
            ${optionsHtml}
          </select>
        </div>

        <div class="form-row">
          <label>السبب (اختياري):</label>
          <textarea id="transferReason" rows="3" placeholder="مثال: ظرف عائلي، تغيير في الخطة..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:inherit;font-size:14px;resize:vertical;"></textarea>
        </div>

        <div class="transfer-warning">
          <p class="transfer-warning-title">⚠️ مهم</p>
          <ul class="transfer-warning-list">
            <li>• الطلب هيتحوّل للمسؤول (Admin/Owner) للمراجعة</li>
            <li>• لو وافق: ينقل تسجيلك من الحدث الأصلي للجديد</li>
            <li>• لو رفض: تسجيلك في الحدث الأصلي يبقى زي ما هو</li>
          </ul>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeTransferModal()">إلغاء</button>
        <button class="btn-primary" id="confirmTransferBtn">🔄 إرسال الطلب</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  document.getElementById('confirmTransferBtn').onclick = async () => {
    const toEventId = document.getElementById('transferToEvent')?.value;
    const reason = document.getElementById('transferReason')?.value.trim() || '';

    if (!toEventId) {
      alert('⚠️ اختر الحدث اللي عايز تنقل إليه');
      return;
    }

    await submitTransferRequest(fromEventId, fromEventTitle, toEventId, reason);
  };
}

async function submitTransferRequest(fromEventId, fromEventTitle, toEventId, reason) {
  const btn = document.getElementById('confirmTransferBtn');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...'; }

  try {
    const toEventDoc = await getDoc(doc(db, 'events', toEventId));
    if (!toEventDoc.exists()) {
      alert('❌ الحدث الجديد غير موجود');
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
      return false;
    }
    const toEvent = { id: toEventDoc.id, ...toEventDoc.data() };

    const fromEventDoc = await getDoc(doc(db, 'events', fromEventId));
    const fromEvent = fromEventDoc.exists() ? fromEventDoc.data() : {};

    const reqData = {
      RequesterPersonID: rsvpPerson.id,
      RequesterName: getPersonFullName(rsvpPerson),
      RequesterEmail: rsvpUser.email,

      FromEventID: fromEventId,
      FromEventTitle: fromEventTitle,
      FromDate: fromEvent.Date || '',

      ToEventID: toEventId,
      ToEventTitle: toEvent.Title || '',
      ToDate: toEvent.Date || '',

      Reason: reason,
      Status: 'pending',

      CreatedAt: new Date().toISOString(),
      ApprovedAt: null,
      ApprovedBy: null,
      RejectedAt: null,
      RejectedBy: null
    };

    const reqRef = await addDoc(collection(db, 'massChangeRequests'), reqData);

    try {
      await addDoc(collection(db, 'notifications'), {
        Type: 'transfer_request',
        Title: `🔄 طلب نقل حضور`,
        Body: `${getPersonFullName(rsvpPerson)} طلب نقل حضوره:\nمن: ${fromEventTitle}\nإلى: ${toEvent.Title || ''}\n\nالسبب: ${reason || 'لم يُذكر'}`,
        RelatedEventID: toEventId,
        RelatedPersonID: rsvpPerson.id,
        RelatedRequestID: reqRef.id,
        TargetType: 'admins',
        SentBy: 'system',
        SentAt: new Date().toISOString(),
        ReadBy: [],
        CreatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Admin notification error:', e);
    }

    // ⚡ سجل الطلب
    if (typeof window.logAction === 'function') {
      await window.logAction({
        action: 'transfer_requested',
        type: 'request',
        title: `طلب نقل: ${getPersonFullName(rsvpPerson)}`,
        description: `من: ${fromEventTitle} → إلى: ${toEvent.Title || ''}`,
        relatedID: reqRef.id,
        relatedTitle: fromEventTitle
      });
    }

    alert('✅ تم إرسال طلب النقل بنجاح\n\nسيتم مراجعته من المسؤول.');
    closeTransferModal();
    return true;

  } catch (err) {
    console.error('❌ submitTransferRequest error:', err);
    alert('خطأ: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    return false;
  }
}

function closeTransferModal() {
  const modal = document.getElementById('transferRsvpModal');
  if (modal) modal.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
//   Notifications Creation
// ═══════════════════════════════════════════════════════

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

async function createAdminReconfirmNotification(event, person) {
  const personName = getPersonFullName(person);

  try {
    await addDoc(collection(db, 'notifications'), {
      Type: 'person_reconfirmed',
      Title: `🔄 ${personName} تراجع عن طلب الإلغاء`,
      Body: `${personName} تراجع عن طلب إلغاء حضوره في:\n"${event.Title}"\n\nحضوره مؤكد الآن.`,
      RelatedEventID: event.id,
      RelatedPersonID: person.id,
      TargetType: 'admins',
      SentBy: 'system',
      SentAt: new Date().toISOString(),
      ReadBy: [],
      CreatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('createAdminReconfirmNotification error:', err.message);
  }
}

async function createCancelRequestNotification(event, person, occurrenceDate, reason) {
  const personName = getPersonFullName(person);
  const eventDate = formatDate(occurrenceDate);

  const notification = {
    Type: 'cancel_request',
    Title: `📢 طلب إلغاء حضور`,
    Body: `${personName} طلب إلغاء حضوره في:\n"${event.Title}" — ${eventDate}\n\nالسبب: ${reason || 'لم يُذكر'}\n\nالطلب محتاج موافقتك.`,
    RelatedEventID: event.id,
    RelatedPersonID: person.id,
    CancelReason: reason || '',
    OccurrenceDate: occurrenceDate || '',
    TargetType: 'admins',
    SentBy: 'system',
    SentAt: new Date().toISOString(),
    ReadBy: [],
    CreatedAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'notifications'), notification);
  } catch (err) {
    console.warn('createCancelRequestNotification error:', err.message);
  }
}

async function createCancelNotifications(event, person, occurrenceDate, reason) {
  const personName = getPersonFullName(person);
  const eventDate = formatDate(occurrenceDate);

  const adminNotif = {
    Type: 'person_cancelled_admin',
    Title: `📢 تم إلغاء حضور`,
    Body: `${personName} تم إلغاء حضوره في:\n"${event.Title}" — ${eventDate}\n\nالسبب: ${reason || 'لم يُذكر'}`,
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

  try {
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
        Body: `${personName} (المسجّل معك في "${event.Title}") ألغى حضوره.`,
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

  const publicNotif = {
    Type: 'person_cancelled_public',
    Title: `🎟️ مكان متاح!`,
    Body: `${personName} ألغى حضوره من:\n"${event.Title}" — ${eventDate}\n\nلو مهتم تحضر مكانه، اضغط هنا للتسجيل`,
    RelatedEventID: event.id,
    RelatedPersonID: person.id,
    TargetType: 'all',
    ActionURL: `my-events.html?event=${event.id}`,
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

  return true;
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
window.approveCancel = approveCancel;
window.rejectCancel = rejectCancel;
window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;
window.submitTransferRequest = submitTransferRequest;
window.getRsvpPerson = () => rsvpPerson;
window.getRegistration = getRegistration;
window.getRegistrationStatus = getRegistrationStatus;

// ═══ Auto-init ═══
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.initRsvp === 'function') {
      window.initRsvp();
    }
  }, 1200);
});
