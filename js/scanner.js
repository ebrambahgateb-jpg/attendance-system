// ═══════════════════════════════════════════════════════
//   Scanner (QR Attendance) — Events
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS,
  SETTINGS_DOC
} from './firebase-config.js';

// ═══ State ═══
let currentUser = null;
let events = [];
let availableEventTypes = [];
let selectedEvent = null;
let html5QrCode = null;
let isScanning = false;
let settings = {};
let peopleCache = {};
let lastScanTime = 0;
const SCAN_COOLDOWN = 2000;

// ═══════════════════════════════════════════════════════
//   Helper: Get Person Full Name
// ═══════════════════════════════════════════════════════

function getPersonFullName(person) {
  if (!person) return '';

  if (person.FirstName || person.SecondName) {
    return [
      person.FirstName,
      person.SecondName,
      person.ThirdName,
      person.FourthName
    ].filter(Boolean).join(' ').trim();
  }

  if (person.Name) return String(person.Name).trim();

  return '';
}

function getPersonInitial(person) {
  if (!person) return '?';
  if (person.FirstName) return String(person.FirstName).charAt(0);
  if (person.Name) return String(person.Name).charAt(0);
  return '?';
}

// ═══════════════════════════════════════════════════════
//   Initialize
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    currentUser = null;
  }

  if (!currentUser || !currentUser.currentWorkspace) {
    window.location.href = '../index.html';
    return;
  }

  try {
    const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
    settings = settingsDoc.exists() ? settingsDoc.data() : {};
  } catch (e) {
    console.error('Settings load error:', e);
    settings = {};
  }

  const status = settings.SystemStatus || 'Active';
  const statusEl = document.getElementById('systemStatus');
  if (statusEl && status === 'Suspended') {
    statusEl.classList.add('suspended');
    statusEl.title = 'النظام متوقف';
  }

  // ⚡ اجلب أنواع الأحداث
  try {
    const eventTypesSnap = await getDocs(collection(db, 'eventTypes'));
    availableEventTypes = eventTypesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    availableEventTypes = [];
  }

  await loadEvents();
  setupEvents();
});

// ═══════════════════════════════════════════════════════
//   Load Events (⚡ الأحداث النهاردة فقط)
// ═══════════════════════════════════════════════════════

async function loadEvents() {
  try {
    const snap = await getDocs(collection(db, 'events'));

    // ⚡ فلتر: Active + عنده موعد النهاردة
    events = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => String(e.Status || '').toLowerCase() === 'active')
      .filter(e => getTodayOccurrence(e) !== null);

    events.sort((a, b) =>
      String(a.Time || '').localeCompare(String(b.Time || ''))
    );

    renderEventOptions();
  } catch (err) {
    console.error('❌ Load events error:', err);
    alert('خطأ في تحميل الأحداث: ' + err.message);
  }
}

function renderEventOptions() {
  const select = document.getElementById('meetingSelect');
  if (!select) return;

  select.innerHTML = '<option value="">-- اختر الحدث --</option>';

  if (events.length === 0) {
    select.innerHTML = '<option value="">لا يوجد أحداث مجدولة اليوم</option>';
    return;
  }

  events.forEach(event => {
    const opt = document.createElement('option');
    opt.value = event.id;

    const type = String(event.Type || 'once').toLowerCase();
    const endTime = getEventEndTime(event);

    // ⚡ نوع الحدث
    const eventType = availableEventTypes.find(t => t.id === event.EventTypeID);
    const typeIcon = eventType ? (eventType.Icon || '📅') : '📅';

    let dayInfo = '';
    if (type === 'weekly') {
      dayInfo = getDayLabel(event.DayOfWeek);
    } else {
      dayInfo = 'اليوم';
    }

    opt.textContent = `${typeIcon} ${event.Title} — ${dayInfo} — ${event.Time} - ${endTime}`;
    select.appendChild(opt);
  });
}

// ═══════════════════════════════════════════════════════
//   Events
// ═══════════════════════════════════════════════════════

function setupEvents() {
  const select = document.getElementById('meetingSelect');
  const startBtn = document.getElementById('startBtn');

  if (select) {
    select.onchange = () => {
      const eventId = select.value;

      if (!eventId) {
        selectedEvent = null;
        if (startBtn) startBtn.disabled = true;
        const info = document.getElementById('meetingInfo');
        if (info) info.style.display = 'none';
        return;
      }

      selectedEvent = events.find(e => e.id === eventId);
      if (selectedEvent) {
        renderEventInfo(selectedEvent);
        const info = document.getElementById('meetingInfo');
        if (info) info.style.display = 'block';
        if (startBtn) startBtn.disabled = false;
      }
    };
  }

  if (startBtn) {
    startBtn.onclick = () => startScanner();
  }
}

// ═══════════════════════════════════════════════════════
//   Render Event Info
// ═══════════════════════════════════════════════════════

function renderEventInfo(event) {
  const info = document.getElementById('meetingInfo');
  if (!info) return;

  const type = String(event.Type || 'once').toLowerCase();
  const isOpen = isEventOpen(event);
  const endTime = getEventEndTime(event);

  // ⚡ نوع الحدث
  const eventType = availableEventTypes.find(t => t.id === event.EventTypeID);
  const eventTypeText = eventType ? `${eventType.Icon || '📅'} ${eventType.Name}` : '';

  let dateInfo = '';
  if (type === 'weekly') {
    dateInfo = 'كل ' + getDayLabel(event.DayOfWeek);
  } else {
    dateInfo = formatDateShort(event.Date);
  }

  info.innerHTML = `
    ${eventTypeText ? `
      <div class="info-line">
        <span class="icon">📋</span>
        <span>${escapeHtml(eventTypeText)}</span>
      </div>
    ` : ''}
    <div class="info-line">
      <span class="icon">${type === 'weekly' ? '🔄' : '📅'}</span>
      <span>${dateInfo}</span>
    </div>
    <div class="info-line">
      <span class="icon">🕐</span>
      <span>${event.Time || '-'} - ${endTime}</span>
    </div>
    <div class="info-line">
      <span class="icon">${isOpen ? '🟢' : '🔴'}</span>
      <span class="${isOpen ? 'status-active' : 'status-closed'}">
        ${isOpen ? 'الحضور مفتوح الآن' : 'الحضور مغلق حالياً'}
      </span>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   Scanner
// ═══════════════════════════════════════════════════════

async function startScanner() {
  if (!selectedEvent) {
    alert('اختر الحدث أولاً');
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    alert('مكتبة QR لم تُحمّل. جرب تحديث الصفحة.');
    return;
  }

  showScreen('scannerScreen');

  const infoEl = document.getElementById('scannerMeetingInfo');
  if (infoEl) {
    infoEl.textContent = '🎯 ' + selectedEvent.Title;
  }

  try {
    html5QrCode = new Html5Qrcode('qrReader');

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const size = Math.floor(minEdge * 0.7);
        return { width: size, height: size };
      },
      aspectRatio: 1.0,
      disableFlip: false
    };

    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      onScanSuccess,
      onScanError
    );

    isScanning = true;

  } catch (err) {
    console.error('❌ Camera error:', err);
    alert('تعذّر تشغيل الكاميرا: ' + (err.message || err));
    showScreen('setupScreen');
  }
}

function onScanError(errorMessage) {
  // نتجاهل أخطاء المسح العادية
}

async function onScanSuccess(decodedText, decodedResult) {
  const now = Date.now();

  if (now - lastScanTime < SCAN_COOLDOWN) {
    return;
  }
  lastScanTime = now;

  if (isScanning && html5QrCode) {
    try {
      await html5QrCode.pause(true);
    } catch (e) {}
  }

  await processScan(decodedText);
}

async function stopScanner() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {}
  }
  isScanning = false;
  html5QrCode = null;
  showScreen('setupScreen');
}

// ═══════════════════════════════════════════════════════
//   Process Scan
// ═══════════════════════════════════════════════════════

async function processScan(decodedText) {
  console.log('📷 Scanned:', decodedText);

  try {
    // ═══ Check 1: QR صالح؟ ═══
    const personId = extractPersonId(decodedText);

    if (!personId) {
      await showResult({
        type: 'error',
        title: 'QR غير صالح',
        message: 'هذا الرمز ليس رمز حضور صالح',
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 2: الشخص موجود؟ ═══
    let person = peopleCache[personId];

    if (!person) {
      const personDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, personId));
      if (!personDoc.exists()) {
        await showResult({
          type: 'error',
          title: 'شخص غير معروف',
          message: 'هذا الشخص غير مسجل في النظام',
          playSound: 'error'
        });
        return;
      }
      person = { id: personDoc.id, ...personDoc.data() };
      peopleCache[personId] = person;
    }

    const personName = getPersonFullName(person);
    const personInitial = getPersonInitial(person);

    // ═══ Check 3: الشخص Active؟ ═══
    const personStatus = String(person.Status || '').toLowerCase();
    if (personStatus !== 'active') {
      await showResult({
        type: 'error',
        title: 'شخص معطّل',
        message: `${personName} — الحساب معطّل`,
        person: person,
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 4: الحدث موجود؟ ═══
    if (!selectedEvent) {
      await showResult({
        type: 'error',
        title: 'لا يوجد حدث',
        message: 'لم يتم اختيار حدث',
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 5: الحدث مفتوح في الوقت الحالي؟ ═══
    const occurrenceDate = getTodayOccurrence(selectedEvent);

    if (!occurrenceDate) {
      await showResult({
        type: 'error',
        title: 'لا يوجد موعد اليوم',
        message: 'لا يوجد حدث مجدول اليوم',
        person: person,
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 6: هل الموعد ملغي؟ ═══
    const cancelled = selectedEvent.CanceledOccurrences || [];
    if (cancelled.includes(occurrenceDate)) {
      await showResult({
        type: 'error',
        title: 'الموعد ملغي',
        message: 'تم إلغاء هذا الموعد',
        person: person,
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 7: هل الحضور مفتوح؟ ═══
    if (!isEventOpen(selectedEvent)) {
      await showResult({
        type: 'error',
        title: 'الحضور مغلق',
        message: 'وقت تسجيل الحضور انتهى أو لم يبدأ بعد',
        person: person,
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 8: هل سجّل حضور بالفعل؟ ═══
    const alreadyRegistered = await checkAlreadyRegistered(
      personId,
      selectedEvent.id,
      occurrenceDate
    );

    if (alreadyRegistered) {
      const preventDup = settings.PreventDuplicateAttendance !== false;

      if (preventDup) {
        await showResult({
          type: 'error',
          title: 'مسجّل بالفعل',
          message: `${personName} — سجّل الحضور مسبقاً`,
          person: person,
          playSound: 'error'
        });
        return;
      }
    }

    // ═══ كل الشروط صحيحة → سجّل الحضور ═══
    const attendanceData = {
      PersonID: personId,
      PersonName: personName || 'غير معروف',
      EventID: selectedEvent.id,
      EventTitle: selectedEvent.Title || '',
      EventTypeID: selectedEvent.EventTypeID || '',
      OccurrenceDate: occurrenceDate,
      ScanTime: new Date().toISOString(),
      Status: 'present',
      ScannerEmail: currentUser.email || '',
      ScannerName: currentUser.name || currentUser.email || '',
      Method: 'scanner',
      Location: null,
      Notes: ''
    };

    await addDoc(collection(db, COLLECTIONS.ATTENDANCE), attendanceData);

    await showResult({
      type: 'success',
      title: 'تم تسجيل الحضور',
      message: personName,
      person: person,
      playSound: 'success'
    });

  } catch (err) {
    console.error('❌ Process scan error:', err);
    await showResult({
      type: 'error',
      title: 'خطأ',
      message: err.message || 'حدث خطأ غير متوقع',
      playSound: 'error'
    });
  }
}

// ═══════════════════════════════════════════════════════
//   Helper Functions
// ═══════════════════════════════════════════════════════

function extractPersonId(text) {
  if (!text) return null;

  const match = String(text).match(/^PERSON_(.+)$/);
  if (match && match[1]) {
    return match[1];
  }

  if (/^[a-zA-Z0-9]{10,}$/.test(text)) {
    return text;
  }

  return null;
}

function getDayLabel(dayValue) {
  const days = {
    'Sunday': 'الأحد',
    'Monday': 'الاثنين',
    'Tuesday': 'الثلاثاء',
    'Wednesday': 'الأربعاء',
    'Thursday': 'الخميس',
    'Friday': 'الجمعة',
    'Saturday': 'السبت'
  };
  return days[dayValue] || dayValue || '-';
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

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

function getEventEndTime(event) {
  if (!event) return '';

  if (event.EndTime) return String(event.EndTime);

  const time = String(event.Time || '00:00');
  const [h, m] = time.split(':').map(Number);

  const totalMinutes = (h || 0) * 60 + (m || 0) + 120;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;

  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function getTodayOccurrence(event) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const type = String(event.Type || 'once').toLowerCase();

  if (type === 'weekly') {
    const todayDay = getDayNameFromDate(today);
    if (todayDay !== event.DayOfWeek) {
      return null;
    }
    return formatDateISO(today);
  }

  if (event.Date === formatDateISO(today)) {
    return formatDateISO(today);
  }

  return null;
}

function isEventOpen(event) {
  const today = new Date();
  const occurrenceDate = getTodayOccurrence(event);

  if (!occurrenceDate) return false;

  const [sh, sm] = String(event.Time || '00:00').split(':').map(Number);
  const eventStart = new Date(today);
  eventStart.setHours(sh || 0, sm || 0, 0, 0);

  const endTime = getEventEndTime(event);
  const [eh, em] = String(endTime).split(':').map(Number);
  const eventEnd = new Date(today);
  eventEnd.setHours(eh || 0, em || 0, 0, 0);

  const openBefore = Number(settings.OpenBeforeMinutes || 30);
  const closeAfter = Number(settings.CloseAfterMinutes || 15);

  const openTime = new Date(eventStart.getTime() - openBefore * 60 * 1000);
  const closeTime = new Date(eventEnd.getTime() + closeAfter * 60 * 1000);

  return today >= openTime && today <= closeTime;
}

async function checkAlreadyRegistered(personId, eventId, occurrenceDate) {
  try {
    const q = query(
      collection(db, COLLECTIONS.ATTENDANCE),
      where('PersonID', '==', personId),
      where('EventID', '==', eventId),
      where('OccurrenceDate', '==', occurrenceDate)
    );

    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.error('❌ Check duplicate error:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Show Result
// ═══════════════════════════════════════════════════════

async function showResult({ type, title, message, person, playSound }) {
  showScreen('resultScreen');

  const content = document.getElementById('resultContent');
  if (!content) return;

  const isSuccess = type === 'success';
  const icon = isSuccess ? '✓' : '✕';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const personName = person ? getPersonFullName(person) : '';
  const personInitial = person ? getPersonInitial(person) : '?';

  let photoHtml = '';
  const showPhoto = settings.ShowPersonPhoto !== false;

  if (person && showPhoto) {
    if (person.PhotoURL) {
      photoHtml = `<img src="${person.PhotoURL}" alt="" class="result-person-photo" />`;
    } else {
      photoHtml = `<div class="result-person-photo-placeholder">${escapeHtml(personInitial)}</div>`;
    }
  }

  content.innerHTML = `
    <div class="result-icon ${isSuccess ? 'success' : 'error'}">${icon}</div>
    ${photoHtml}
    <div class="result-title ${isSuccess ? 'success' : 'error'}">${title}</div>
    ${person ? `<div class="result-person-name">${escapeHtml(personName)}</div>` : ''}
    <div class="result-message">${escapeHtml(message || '')}</div>
    <div class="result-time">${timeStr}</div>
    <div class="result-actions">
      <button class="btn-primary" onclick="resumeScanner()">📷 مسح التالي</button>
      <button class="btn-secondary" onclick="stopScanner()">✕ إيقاف</button>
    </div>
  `;

  playResultSound(type);

  const duration = Number(settings.ResultDisplayDuration || 3);
  if (duration > 0) {
    setTimeout(() => {
      if (document.getElementById('resultScreen')?.classList.contains('active')) {
        resumeScanner();
      }
    }, duration * 1000);
  }
}

function resumeScanner() {
  showScreen('scannerScreen');

  if (html5QrCode && isScanning) {
    try {
      html5QrCode.resume();
    } catch (e) {
      console.error('Resume error:', e);
    }
  }
}

// ═══════════════════════════════════════════════════════
//   Sounds
// ═══════════════════════════════════════════════════════

function playResultSound(type) {
  const successEnabled = settings.SuccessSound !== false;
  const errorEnabled = settings.ErrorSound !== false;

  if (type === 'success' && !successEnabled) return;
  if (type === 'error' && !errorEnabled) return;

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'success') {
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(900, audioContext.currentTime + 0.1);
    } else {
      oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime + 0.15);
    }

    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// ═══════════════════════════════════════════════════════
//   Screen Management
// ═══════════════════════════════════════════════════════

function showScreen(screenId) {
  document.querySelectorAll('.scanner-screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

function goBack() {
  if (isScanning) {
    stopScanner();
  }
  window.location.href = 'dashboard.html';
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

window.stopScanner = stopScanner;
window.resumeScanner = resumeScanner;
window.goBack = goBack;
