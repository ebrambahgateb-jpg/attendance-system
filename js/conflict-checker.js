// ═══════════════════════════════════════════════════════
//   ⚡ Event Conflict Checker
//   يمنع تسجيل شخص في حدثين متعارضين في نفس اليوم
// ═══════════════════════════════════════════════════════

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { db, COLLECTIONS } from './firebase-config.js';

// ═══════════════════════════════════════════════════════
//   ⚡ Check Conflict
//   @param {string} personId - ID الشخص
//   @param {string} eventId - ID الحدث الجديد
//   @param {string} dateISO - التاريخ (YYYY-MM-DD)
//   @param {Object} eventData - بيانات الحدث الجديد (اختياري)
//   @param {Object} options - { excludeRegistrationId }
//   @returns {Object} { hasConflict, conflicts: [{event, eventTitle, time, endTime}] }
// ═══════════════════════════════════════════════════════

export async function checkEventConflict(personId, eventId, dateISO, eventData = null, options = {}) {
  if (!personId || !eventId || !dateISO) {
    return { hasConflict: false, conflicts: [] };
  }

  try {
    // ⚡ 1. اجلب الحدث الجديد (لو مش متوفر)
    let newEvent = eventData;
    if (!newEvent) {
      newEvent = await getEvent(eventId);
      if (!newEvent) return { hasConflict: false, conflicts: [] };
    }

    const newStart = timeToMinutes(newEvent.Time || '00:00');
    const newEnd = timeToMinutes(newEvent.EndTime || newEvent.Time || '00:00') || newStart + 120;

    // ⚡ 2. اجلب كل تسجيلات الشخص
    const [attendanceSnap, registrationSnap] = await Promise.all([
      getDocs(query(
        collection(db, COLLECTIONS.ATTENDANCE),
        where('PersonID', '==', personId)
      )).catch(() => ({ docs: [] })),
      getDocs(query(
        collection(db, 'eventRegistrations'),
        where('PersonID', '==', personId)
      )).catch(() => ({ docs: [] }))
    ]);

    // ⚡ 3. اجلب كل الأحداث (للتحقق من النوع)
    const eventsSnap = await getDocs(collection(db, 'events')).catch(() => ({ docs: [] }));
    const allEvents = {};
    eventsSnap.docs.forEach(d => {
      allEvents[d.id] = { id: d.id, ...d.data() };
    });

    // ⚡ 4. احسب الأحداث اللي الشخص مسجّل فيها في نفس اليوم
    const sameDayEventIds = new Set();

    // ⚡ من Attendance
    attendanceSnap.docs.forEach(doc => {
      const att = doc.data();
      if (!att.EventID) return;
      if (att.EventID === eventId) return;  // تجاهل نفس الحدث
      if (options.excludeRegistrationId && doc.id === options.excludeRegistrationId) return;

      const attDate = att.OccurrenceDate || getDateFromScanTime(att.ScanTime);
      if (attDate === dateISO) {
        sameDayEventIds.add(att.EventID);
      }
    });

    // ⚡ من Registrations (excluding cancelled)
    registrationSnap.docs.forEach(doc => {
      const reg = doc.data();
      if (!reg.EventID) return;
      if (reg.EventID === eventId) return;
      if (options.excludeRegistrationId && doc.id === options.excludeRegistrationId) return;

      const status = String(reg.Status || '').toLowerCase();
      // ⚡ نتجاهل الـcancelled
      if (status === 'cancelled' || status === 'rejected') return;

      // ⚡ هل الحدث ده بيحصل في نفس اليوم؟
      const event = allEvents[reg.EventID];
      if (!event) return;

      if (isEventOnDate(event, dateISO)) {
        sameDayEventIds.add(reg.EventID);
      }
    });

    // ⚡ 5. قارن الأوقات
    const conflicts = [];

    sameDayEventIds.forEach(id => {
      const otherEvent = allEvents[id];
      if (!otherEvent) return;

      const otherStart = timeToMinutes(otherEvent.Time || '00:00');
      const otherEnd = timeToMinutes(otherEvent.EndTime || otherEvent.Time || '00:00') || otherStart + 120;

      // ⚡ فحص التداخل
      if (hasTimeOverlap(newStart, newEnd, otherStart, otherEnd)) {
        conflicts.push({
          eventId: id,
          eventTitle: otherEvent.Title || '',
          time: otherEvent.Time || '',
          endTime: otherEvent.EndTime || '',
          conflictStart: Math.max(newStart, otherStart),
          conflictEnd: Math.min(newEnd, otherEnd)
        });
      }
    });

    return {
      hasConflict: conflicts.length > 0,
      conflicts
    };

  } catch (err) {
    console.error('❌ checkEventConflict error:', err);
    return { hasConflict: false, conflicts: [], error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Get Person Day Schedule
// ═══════════════════════════════════════════════════════

export async function getPersonDaySchedule(personId, dateISO) {
  if (!personId || !dateISO) return [];

  try {
    const [attendanceSnap, eventsSnap] = await Promise.all([
      getDocs(query(
        collection(db, COLLECTIONS.ATTENDANCE),
        where('PersonID', '==', personId)
      )).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'events')).catch(() => ({ docs: [] }))
    ]);

    const allEvents = {};
    eventsSnap.docs.forEach(d => {
      allEvents[d.id] = { id: d.id, ...d.data() };
    });

    const schedule = [];

    attendanceSnap.docs.forEach(doc => {
      const att = doc.data();
      if (!att.EventID) return;

      const attDate = att.OccurrenceDate || getDateFromScanTime(att.ScanTime);
      if (attDate !== dateISO) return;

      const event = allEvents[att.EventID];
      if (!event) return;

      schedule.push({
        eventId: att.EventID,
        eventTitle: event.Title || '',
        time: event.Time || '',
        endTime: event.EndTime || '',
        method: att.Method || 'scanner'
      });
    });

    return schedule;

  } catch (err) {
    console.error('❌ getPersonDaySchedule error:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Show Conflict Alert
// ═══════════════════════════════════════════════════════

export function showConflictAlert(conflicts, newEventTitle = '') {
  if (!conflicts || conflicts.length === 0) return;

  let msg = `⚠️ تعارض في المواعيد!\n\n`;
  msg += `الحدث الجديد: ${newEventTitle}\n\n`;
  msg += `📅 عندك تسجيل في:\n`;

  conflicts.forEach((c, idx) => {
    msg += `\n${idx + 1}. 🎯 ${c.eventTitle}\n`;
    msg += `   🕐 ${c.time} - ${c.endTime}\n`;
  });

  msg += `\n⚠️ لا يمكن التسجيل في حدثين متعارضين في نفس اليوم.`;
  msg += `\n\n💡 لو عايز تسجل في الحدث الجديد، لازم تلغي التسجيل القديم أولاً.`;

  alert(msg);
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

async function getEvent(eventId) {
  try {
    const snap = await getDocs(collection(db, 'events'));
    const doc = snap.docs.find(d => d.id === eventId);
    return doc ? { id: doc.id, ...doc.data() } : null;
  } catch (e) {
    return null;
  }
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hasTimeOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}

function getDateFromScanTime(scanTime) {
  if (!scanTime) return '';
  try {
    const d = new Date(scanTime);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  } catch (e) {
    return '';
  }
}

function isEventOnDate(event, dateISO) {
  const type = String(event.Type || 'once').toLowerCase();
  const d = new Date(dateISO + 'T00:00:00');
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];

  if (type === 'weekly') {
    return event.DayOfWeek === dayName;
  }

  if (type === 'once') {
    return event.Date === dateISO;
  }

  return false;
}

// ═══════════════════════════════════════════════════════
//   Expose to window
// ═══════════════════════════════════════════════════════

window.checkEventConflict = checkEventConflict;
window.getPersonDaySchedule = getPersonDaySchedule;
window.showConflictAlert = showConflictAlert;
