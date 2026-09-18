// ═══════════════════════════════════════════════════════
//   Scanner (QR Attendance)
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
let meetings = [];
let selectedMeeting = null;
let html5QrCode = null;
let isScanning = false;
let settings = {};
let peopleCache = {};
let lastScanTime = 0;
const SCAN_COOLDOWN = 2000; // 2 ثانية بين كل مسحة

// ═══════════════════════════════════════════════════════
//   Initialize
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  // اقرأ بيانات المستخدم
  try {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    currentUser = null;
  }

  if (!currentUser || !currentUser.selectedRole) {
    window.location.href = '../index.html';
    return;
  }

  // اقرأ الإعدادات
  try {
    const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
    settings = settingsDoc.exists() ? settingsDoc.data() : {};
  } catch (e) {
    console.error('Settings load error:', e);
    settings = {};
  }

  // تحقق من حالة النظام
  const status = settings.SystemStatus || 'Active';
  const statusEl = document.getElementById('systemStatus');
  if (statusEl && status === 'Suspended') {
    statusEl.classList.add('suspended');
    statusEl.title = 'النظام متوقف';
  }

  // حمّل الاجتماعات
  await loadMeetings();

  // اربط الأحداث
  setupEvents();
});

// ═══════════════════════════════════════════════════════
//   Load Meetings
// ═══════════════════════════════════════════════════════

async function loadMeetings() {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.MEETINGS));

    meetings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => String(m.Status || '').toLowerCase() === 'active');

    // ترتيب حسب الوقت
    meetings.sort((a, b) =>
      String(a.Time || '').localeCompare(String(b.Time || ''))
    );

    renderMeetingOptions();
  } catch (err) {
    console.error('❌ Load meetings error:', err);
    alert('خطأ في تحميل الاجتماعات: ' + err.message);
  }
}

function renderMeetingOptions() {
  const select = document.getElementById('meetingSelect');
  if (!select) return;

  select.innerHTML = '<option value="">-- اختر الاجتماع --</option>';

  if (meetings.length === 0) {
    select.innerHTML = '<option value="">لا يوجد اجتماعات نشطة</option>';
    return;
  }

  meetings.forEach(meeting => {
    const opt = document.createElement('option');
    opt.value = meeting.id;

    const type = String(meeting.Type || 'once').toLowerCase();
    let dayInfo = '';
    if (type === 'weekly') {
      dayInfo = 'كل ' + getDayLabel(meeting.DayOfWeek);
    } else {
      dayInfo = meeting.Date || '';
    }

    opt.textContent = `${meeting.Title} — ${dayInfo} — ${meeting.Time}`;
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
      const meetingId = select.value;

      if (!meetingId) {
        selectedMeeting = null;
        if (startBtn) startBtn.disabled = true;
        const info = document.getElementById('meetingInfo');
        if (info) info.style.display = 'none';
        return;
      }

      selectedMeeting = meetings.find(m => m.id === meetingId);
      if (selectedMeeting) {
        renderMeetingInfo(selectedMeeting);
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
//   Render Meeting Info
// ═══════════════════════════════════════════════════════

function renderMeetingInfo(meeting) {
  const info = document.getElementById('meetingInfo');
  if (!info) return;

  const type = String(meeting.Type || 'once').toLowerCase();
  const isOpen = isMeetingOpen(meeting);

  let dateInfo = '';
  if (type === 'weekly') {
    dateInfo = 'كل ' + getDayLabel(meeting.DayOfWeek);
  } else {
    dateInfo = meeting.Date || '-';
  }

  info.innerHTML = `
    <div class="info-line">
      <span class="icon">${type === 'weekly' ? '🔄' : '📅'}</span>
      <span>${dateInfo}</span>
    </div>
    <div class="info-line">
      <span class="icon">🕐</span>
      <span>${meeting.Time || '-'}</span>
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
  if (!selectedMeeting) {
    alert('اختر الاجتماع أولاً');
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    alert('مكتبة QR لم تُحمّل. جرب تحديث الصفحة.');
    return;
  }

  showScreen('scannerScreen');

  // اعرض اسم الاجتماع
  const infoEl = document.getElementById('scannerMeetingInfo');
  if (infoEl) {
    infoEl.textContent = '📅 ' + selectedMeeting.Title;
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
      { facingMode: 'environment' }, // كاميرا خلفية
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
  // نتجاهل أخطاء المسح العادية (لا يوجد QR في الإطار)
}

async function onScanSuccess(decodedText, decodedResult) {
  const now = Date.now();

  // Cooldown لتجنب المسح المكرر
  if (now - lastScanTime < SCAN_COOLDOWN) {
    return;
  }
  lastScanTime = now;

  // أوقف المسح مؤقتًا
  if (isScanning && html5QrCode) {
    try {
      await html5QrCode.pause(true);
    } catch (e) {}
  }

  // عالج المسحة
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
//   Process Scan (8 Checks)
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

    // ═══ Check 3: الشخص Active؟ ═══
    const personStatus = String(person.Status || '').toLowerCase();
    if (personStatus !== 'active') {
      await showResult({
        type: 'error',
        title: 'شخص معطّل',
        message: `${person.Name} — الحساب معطّل`,
        person: person,
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 4: الاجتماع موجود؟ ═══
    if (!selectedMeeting) {
      await showResult({
        type: 'error',
        title: 'لا يوجد اجتماع',
        message: 'لم يتم اختيار اجتماع',
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 5: الاجتماع مفتوح في الوقت الحالي؟ ═══
    const occurrenceDate = getTodayOccurrence(selectedMeeting);

    if (!occurrenceDate) {
      await showResult({
        type: 'error',
        title: 'لا يوجد موعد اليوم',
        message: 'لا يوجد اجتماع مجدول اليوم',
        person: person,
        playSound: 'error'
      });
      return;
    }

    // ═══ Check 6: هل الموعد ملغي؟ ═══
    const cancelled = selectedMeeting.CanceledOccurrences || [];
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
    if (!isMeetingOpen(selectedMeeting)) {
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
      selectedMeeting.id,
      occurrenceDate
    );

    if (alreadyRegistered) {
      const preventDup = settings.PreventDuplicateAttendance !== false;

      if (preventDup) {
        await showResult({
          type: 'error',
          title: 'مسجّل بالفعل',
          message: `${person.Name} — سجّل الحضور مسبقاً`,
          person: person,
          playSound: 'error'
        });
        return;
      }
    }

    // ═══ كل الشروط صحيحة → سجّل الحضور ═══
    const attendanceData = {
      PersonID: personId,
      PersonName: person.Name,
      MeetingID: selectedMeeting.id,
      MeetingTitle: selectedMeeting.Title,
      OccurrenceDate: occurrenceDate,
      ScanTime: new Date().toISOString(),
      Status: 'present',
      ScannerEmail: currentUser.email,
      ScannerName: currentUser.name || currentUser.email,
      Notes: ''
    };

    await addDoc(collection(db, COLLECTIONS.ATTENDANCE), attendanceData);

    await showResult({
      type: 'success',
      title: 'تم تسجيل الحضور',
      message: person.Name,
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

  // الصيغة: PERSON_{id}
  const match = String(text).match(/^PERSON_(.+)$/);
  if (match && match[1]) {
    return match[1];
  }

  // في حالة QR قديم كان فيه ID مباشر
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

/**
 * هل يوجد موعد اليوم للاجتماع؟
 * لو Weekly → لازم يكون اليوم صح
 * لو Once → لازم يكون التاريخ = اليوم
 */
function getTodayOccurrence(meeting) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const type = String(meeting.Type || 'once').toLowerCase();

  if (type === 'weekly') {
    const todayDay = getDayNameFromDate(today);
    if (todayDay !== meeting.DayOfWeek) {
      return null; // اليوم غلط
    }
    return formatDateISO(today);
  }

  // Once
  if (meeting.Date === formatDateISO(today)) {
    return formatDateISO(today);
  }

  return null;
}

/**
 * هل الحضور مفتوح الآن؟
 */
function isMeetingOpen(meeting) {
  const today = new Date();
  const occurrenceDate = getTodayOccurrence(meeting);

  if (!occurrenceDate) return false;

  // احسب وقت الاجتماع
  const [hours, minutes] = String(meeting.Time || '00:00').split(':').map(Number);
  const meetingTime = new Date(today);
  meetingTime.setHours(hours || 0, minutes || 0, 0, 0);

  const openBefore = Number(settings.OpenBeforeMinutes || 30);
  const closeAfter = Number(settings.CloseAfterMinutes || 15);

  const openTime = new Date(meetingTime.getTime() - openBefore * 60 * 1000);
  const closeTime = new Date(meetingTime.getTime() + closeAfter * 60 * 1000);

  return today >= openTime && today <= closeTime;
}

/**
 * هل سجّل حضور بالفعل لهذا الموعد؟
 */
async function checkAlreadyRegistered(personId, meetingId, occurrenceDate) {
  try {
    const q = query(
      collection(db, COLLECTIONS.ATTENDANCE),
      where('PersonID', '==', personId),
      where('MeetingID', '==', meetingId),
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

  // الصورة
  let photoHtml = '';
  const showPhoto = settings.ShowPersonPhoto !== false;

  if (person && showPhoto) {
    if (person.PhotoURL) {
      photoHtml = `<img src="${person.PhotoURL}" alt="" class="result-person-photo" />`;
    } else {
      const initial = (person.Name || '?').charAt(0);
      photoHtml = `<div class="result-person-photo-placeholder">${initial}</div>`;
    }
  }

  content.innerHTML = `
    <div class="result-icon ${isSuccess ? 'success' : 'error'}">${icon}</div>
    ${photoHtml}
    <div class="result-title ${isSuccess ? 'success' : 'error'}">${title}</div>
    ${person ? `<div class="result-person-name">${escapeHtml(person.Name || '')}</div>` : ''}
    <div class="result-message">${escapeHtml(message || '')}</div>
    <div class="result-time">${timeStr}</div>
    <div class="result-actions">
      <button class="btn-primary" onclick="resumeScanner()">📷 مسح التالي</button>
      <button class="btn-secondary" onclick="stopScanner()">✕ إيقاف</button>
    </div>
  `;

  // شغّل الصوت
  playResultSound(type);

  // مدة العرض
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
      // صوت صاعد
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(900, audioContext.currentTime + 0.1);
    } else {
      // صوت هابط
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
