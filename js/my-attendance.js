// ═══════════════════════════════════════════════════════
//   My Attendance (سجل حضورك بنفسك)
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
let maUser = null;
let maPerson = null;
let maSettings = {};
let maMeetings = [];
let maSelectedMeeting = null;
let maHtml5QrCode = null;
let maIsScanning = false;
let maLastScanTime = 0;
let maUserLocation = null;
const MA_SCAN_COOLDOWN = 2000;

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadMyAttendancePage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    maUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!maUser) {
      window.location.href = '../index.html';
      return;
    }

    // اجلب الإعدادات
    const settingsDoc = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC));
    maSettings = settingsDoc.exists() ? settingsDoc.data() : {};

    // ⚡ اجلب بيانات الشخص المرتبط
    maPerson = null;
    const personId = maUser.personId || maUser.account?.PersonID;

    if (personId) {
      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, personId));
      if (pDoc.exists()) {
        maPerson = { id: pDoc.id, ...pDoc.data() };
      }
    }

    // لو مش موجود، دوّر بالبريد
    if (!maPerson && maUser.email) {
      const q = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', maUser.email)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        maPerson = { id: docSnap.id, ...docSnap.data() };

        // احفظ
        maUser.personId = maPerson.id;
        localStorage.setItem('currentUser', JSON.stringify(maUser));
      }
    }

    // اجلب الاجتماعات
    const meetingsSnap = await getDocs(collection(db, COLLECTIONS.MEETINGS));
    maMeetings = meetingsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => String(m.Status || '').toLowerCase() === 'active')
      .sort((a, b) => String(a.Time || '').localeCompare(String(b.Time || '')));

    renderMyAttendancePage(area);

  } catch (err) {
    console.error('❌ Load my-attendance error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadMyAttendancePage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderMyAttendancePage(area) {
  const container = document.createElement('div');
  container.className = 'ma-container';
  area.innerHTML = '';
  area.appendChild(container);

  // ⚡ لو مفيش شخص مرتبط
  if (!maPerson) {
    container.innerHTML = `
      <div class="ma-empty">
        <div class="ma-empty-icon">👤</div>
        <h2>لا يوجد ملف شخصي</h2>
        <p>لم يتم ربط حسابك بأي شخص في النظام.</p>
        <p style="margin-top:8px;">تواصل مع المسؤول لربط حسابك.</p>
      </div>
    `;
    return;
  }

  // ⚡ لو شخص معطل
  const personStatus = String(maPerson.Status || 'active').toLowerCase();
  if (personStatus !== 'active') {
    container.innerHTML = `
      <div class="ma-empty">
        <div class="ma-empty-icon">⛔</div>
        <h2>الحساب معطل</h2>
        <p>تواصل مع المسؤول لتفعيل حسابك.</p>
      </div>
    `;
    return;
  }

  const fullName = [
    maPerson.FirstName, maPerson.SecondName, maPerson.ThirdName, maPerson.FourthName
  ].filter(Boolean).join(' ');

  // ⚡ لو مفيش اجتماعات
  if (maMeetings.length === 0) {
    container.innerHTML = `
      <div class="ma-empty">
        <div class="ma-empty-icon">📅</div>
        <h2>لا يوجد اجتماعات نشطة</h2>
        <p>سيظهر هنا الاجتماعات فور إضافتها.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <!-- Header -->
    <div style="text-align:center;margin-bottom:20px;">
      <h2 style="color:var(--text);margin-bottom:6px;">مرحبًا ${escapeHtml(fullName)}</h2>
      <p style="color:var(--text-muted);font-size:14px;">سجّل حضورك بمسح QR النظام</p>
    </div>

    <!-- Step 1: Choose Meeting -->
    <div class="ma-step">
      <div class="ma-step-title">
        <span class="step-num">1</span>
        <span>اختر الاجتماع</span>
      </div>

      <select id="maMeetingSelect" class="ma-select">
        <option value="">-- اختر الاجتماع --</option>
        ${maMeetings.map(m => {
          const type = String(m.Type || 'once').toLowerCase();
          const typeLabel = type === 'weekly' ? '🔄' : '📅';
          return `<option value="${m.id}">${typeLabel} ${escapeHtml(m.Title || '')} - ${m.Time || ''}</option>`;
        }).join('')}
      </select>

      <div id="maMeetingInfo" class="ma-meeting-info" style="display:none;"></div>
    </div>

    <!-- Step 2: Scan QR -->
    <div class="ma-step" id="maScanStep" style="display:none;">
      <div class="ma-step-title">
        <span class="step-num">2</span>
        <span>امسح QR النظام</span>
      </div>

      <p style="font-size:14px;color:var(--text-muted);margin-bottom:14px;line-height:1.6;">
        وجّه كاميرا الموبايل نحو QR المعلّق في المكان. تأكد من وجودك في نطاق المكان المسموح.
      </p>

      <button id="maScanBtn" class="ma-action-btn" disabled>
        📷 تشغيل الكاميرا
      </button>

      <div id="maLocationStatus" class="ma-location-status">
        <span class="dot"></span>
        <span>جاري التحقق من الموقع...</span>
      </div>
    </div>
  `;

  setupMyAttendanceEvents();
  checkLocation();
}

// ═══════════════════════════════════════════════════════
//   Events
// ═══════════════════════════════════════════════════════

function setupMyAttendanceEvents() {
  const select = document.getElementById('maMeetingSelect');
  const scanBtn = document.getElementById('maScanBtn');

  if (select) {
    select.onchange = () => {
      const meetingId = select.value;

      if (!meetingId) {
        maSelectedMeeting = null;
        const info = document.getElementById('maMeetingInfo');
        const scanStep = document.getElementById('maScanStep');
        if (info) info.style.display = 'none';
        if (scanStep) scanStep.style.display = 'none';
        return;
      }

      maSelectedMeeting = maMeetings.find(m => m.id === meetingId);
      if (maSelectedMeeting) {
        renderMeetingInfo();
        const scanStep = document.getElementById('maScanStep');
        if (scanStep) scanStep.style.display = 'block';
        updateScanButton();
      }
    };
  }

  if (scanBtn) {
    scanBtn.onclick = () => openScanner();
  }
}

// ═══════════════════════════════════════════════════════
//   Meeting Info
// ═══════════════════════════════════════════════════════

function renderMeetingInfo() {
  const info = document.getElementById('maMeetingInfo');
  if (!info || !maSelectedMeeting) return;

  const type = String(maSelectedMeeting.Type || 'once').toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dayText = '';
  if (type === 'weekly') {
    const days = {Sunday:'الأحد',Monday:'الاثنين',Tuesday:'الثلاثاء',Wednesday:'الأربعاء',Thursday:'الخميس',Friday:'الجمعة',Saturday:'السبت'};
    dayText = 'كل ' + (days[maSelectedMeeting.DayOfWeek] || '');
  } else {
    dayText = maSelectedMeeting.Date || '';
  }

  const isOpen = isMeetingOpenNow(maSelectedMeeting);
  const timeStatus = isOpen
    ? { class: 'status-open', icon: '🟢', text: 'الحضور مفتوح الآن' }
    : { class: 'status-closed', icon: '🔴', text: 'الحضور مغلق حالياً' };

  info.innerHTML = `
    <div class="ma-info-row">
      <span class="icon">${type === 'weekly' ? '🔄' : '📅'}</span>
      <span>${dayText}</span>
    </div>
    <div class="ma-info-row">
      <span class="icon">🕐</span>
      <span>${maSelectedMeeting.Time || ''}</span>
    </div>
    <div class="ma-info-row">
      <span class="icon">${timeStatus.icon}</span>
      <span class="${timeStatus.class}">${timeStatus.text}</span>
    </div>
  `;
  info.style.display = 'block';
}

// ═══════════════════════════════════════════════════════
//   Location
// ═══════════════════════════════════════════════════════

function checkLocation() {
  const statusEl = document.getElementById('maLocationStatus');
  if (!statusEl) return;

  const locationEnabled = maSettings.LocationEnabled !== false;

  if (!locationEnabled) {
    statusEl.innerHTML = '<span class="dot valid"></span><span>التحقق من الموقع غير مفعّل</span>';
    statusEl.className = 'ma-location-status valid';
    return;
  }

  if (!navigator.geolocation) {
    statusEl.innerHTML = '<span class="dot invalid"></span><span>متصفحك لا يدعم تحديد الموقع</span>';
    statusEl.className = 'ma-location-status invalid';
    return;
  }

  statusEl.className = 'ma-location-status checking';
  statusEl.innerHTML = '<span class="dot"></span><span>جاري التحقق من الموقع...</span>';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      maUserLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };

      const check = validateLocation(maUserLocation);

      if (check.valid) {
        statusEl.className = 'ma-location-status valid';
        statusEl.innerHTML = `<span class="dot"></span><span>✅ أنت داخل النطاق (${Math.round(check.distance)}م)</span>`;
      } else {
        statusEl.className = 'ma-location-status invalid';
        statusEl.innerHTML = `<span class="dot"></span><span>❌ أنت خارج النطاق (${Math.round(check.distance)}م)</span>`;
      }

      updateScanButton();
    },
    (err) => {
      statusEl.className = 'ma-location-status invalid';
      let msg = 'فشل تحديد الموقع';
      if (err.code === 1) msg = 'لم تسمح بالوصول للموقع';
      statusEl.innerHTML = `<span class="dot"></span><span>❌ ${msg}</span>`;
      updateScanButton();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

function validateLocation(loc) {
  const locationEnabled = maSettings.LocationEnabled !== false;
  if (!locationEnabled) return { valid: true, distance: 0 };

  const targetLat = parseFloat(maSettings.LocationLatitude);
  const targetLng = parseFloat(maSettings.LocationLongitude);

  if (isNaN(targetLat) || isNaN(targetLng)) {
    return { valid: true, distance: 0 };
  }

  const radius = parseFloat(maSettings.LocationRadius) || 4;
  const tolerance = parseFloat(maSettings.LocationAccuracyTolerance) || 15;

  const distance = getDistance(loc.lat, loc.lng, targetLat, targetLng);
  const effectiveDistance = distance - (loc.accuracy || 0);

  return {
    valid: effectiveDistance <= (radius + tolerance),
    distance: distance,
    effectiveDistance: effectiveDistance,
    target: { lat: targetLat, lng: targetLng },
    radius: radius + tolerance
  };
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// ═══════════════════════════════════════════════════════
//   Scan Button State
// ═══════════════════════════════════════════════════════

function updateScanButton() {
  const btn = document.getElementById('maScanBtn');
  if (!btn) return;

  const locationEnabled = maSettings.LocationEnabled !== false;
  const isOpen = isMeetingOpenNow(maSelectedMeeting);

  let canScan = true;
  let reason = '';

  if (!maSelectedMeeting) {
    canScan = false;
    reason = 'اختر اجتماع أولاً';
  } else if (!isOpen) {
    canScan = false;
    reason = 'الحضور مغلق حالياً';
  } else if (locationEnabled && !maUserLocation) {
    canScan = false;
    reason = 'جاري التحقق من الموقع...';
  } else if (locationEnabled && maUserLocation) {
    const check = validateLocation(maUserLocation);
    if (!check.valid) {
      canScan = false;
      reason = 'أنت خارج نطاق المكان';
    }
  }

  btn.disabled = !canScan;
  btn.innerHTML = canScan ? '📷 تشغيل الكاميرا' : `⛔ ${reason}`;
}

// ═══════════════════════════════════════════════════════
//   Scanner
// ═══════════════════════════════════════════════════════

async function openScanner() {
  if (!maSelectedMeeting) { alert('اختر اجتماع أولاً'); return; }
  if (!isMeetingOpenNow(maSelectedMeeting)) { alert('الحضور مغلق حالياً'); return; }

  const locationEnabled = maSettings.LocationEnabled !== false;
  if (locationEnabled) {
    if (!maUserLocation) { alert('جاري التحقق من الموقع، انتظر قليلاً'); return; }
    const check = validateLocation(maUserLocation);
    if (!check.valid) {
      alert(`أنت خارج نطاق المكان (${Math.round(check.distance)}م). اقترب من المكان وحاول مرة أخرى.`);
      return;
    }
  }

  // أنشئ واجهة الـScanner
  let scannerView = document.getElementById('maScannerView');
  if (!scannerView) {
    scannerView = document.createElement('div');
    scannerView.id = 'maScannerView';
    scannerView.className = 'ma-scanner-view';
    document.body.appendChild(scannerView);
  }

  scannerView.innerHTML = `
    <div class="ma-scanner-header">
      <h2>📷 امسح QR النظام</h2>
      <button class="ma-scanner-close" onclick="closeMyAttendanceScanner()">✕</button>
    </div>
    <div class="ma-scanner-body">
      <div id="maQrReader"></div>
      <div class="ma-scanner-hint">وجّه الكاميرا نحو QR المعلّق</div>
    </div>
  `;

  scannerView.style.display = 'flex';

  try {
    maHtml5QrCode = new Html5Qrcode('maQrReader');

    await maHtml5QrCode.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: (w, h) => {
          const min = Math.min(w, h);
          const size = Math.floor(min * 0.7);
          return { width: size, height: size };
        },
        aspectRatio: 1.0
      },
      onScanSuccess,
      () => {}
    );

    maIsScanning = true;
  } catch (err) {
    console.error('Camera error:', err);
    alert('تعذّر تشغيل الكاميرا: ' + (err.message || err));
    closeMyAttendanceScanner();
  }
}

async function onScanSuccess(decodedText) {
  const now = Date.now();
  if (now - maLastScanTime < MA_SCAN_COOLDOWN) return;
  maLastScanTime = now;

  // أوقف المسح
  if (maHtml5QrCode && maIsScanning) {
    try { await maHtml5QrCode.pause(true); } catch (e) {}
  }

  await processScan(decodedText);
}

async function processScan(scannedText) {
  try {
    // ═══ Check 1: QR صالح؟ ═══
    const expectedQr = maSettings.SystemQRCode;
    if (!expectedQr) {
      return showResult('error', 'خطأ في الإعدادات', 'لم يتم إعداد QR النظام بعد.');
    }

    if (scannedText !== expectedQr) {
      return showResult('error', 'QR غير صالح', 'هذا ليس رمز الحضور الرسمي للنظام.');
    }

    // ═══ Check 2: شخص موجود؟ ═══
    if (!maPerson) {
      return showResult('error', 'لا يوجد ملف شخصي', 'تواصل مع المسؤول.');
    }

    // ═══ Check 3: الشخص Active؟ ═══
    if (String(maPerson.Status || '').toLowerCase() !== 'active') {
      return showResult('error', 'حساب معطل', 'تواصل مع المسؤول.');
    }

    // ═══ Check 4: الاجتماع؟ ═══
    if (!maSelectedMeeting) {
      return showResult('error', 'لا يوجد اجتماع', 'اختر اجتماع أولاً.');
    }

    // ═══ Check 5: الموعد صحيح؟ ═══
    const occurrenceDate = getTodayOccurrence(maSelectedMeeting);
    if (!occurrenceDate) {
      return showResult('error', 'لا يوجد موعد اليوم', 'لا يوجد اجتماع مجدول اليوم.');
    }

    // ═══ Check 6: موعد ملغي؟ ═══
    const cancelled = maSelectedMeeting.CanceledOccurrences || [];
    if (cancelled.includes(occurrenceDate)) {
      return showResult('error', 'الموعد ملغي', 'تم إلغاء هذا الموعد.');
    }

    // ═══ Check 7: الحضور مفتوح؟ ═══
    if (!isMeetingOpenNow(maSelectedMeeting)) {
      return showResult('error', 'الحضور مغلق', 'وقت التسجيل انتهى.');
    }

    // ═══ Check 8: مسجّل قبل كده؟ ═══
    const isDup = await checkAlreadyRegistered(maPerson.id, maSelectedMeeting.id, occurrenceDate);
    const preventDup = maSettings.PreventDuplicateAttendance !== false;

    if (isDup && preventDup) {
      return showResult('error', 'مسجّل بالفعل', 'سجّلت حضورك مسبقاً لهذا الاجتماع.');
    }

    // ═══ Check 9: الموقع؟ ═══
    const locationEnabled = maSettings.LocationEnabled !== false;
    if (locationEnabled) {
      if (!maUserLocation) {
        return showResult('error', 'لم يتم تحديد الموقع', 'اسمح بالوصول للموقع وحاول مرة أخرى.');
      }

      const check = validateLocation(maUserLocation);
      if (!check.valid) {
        return showResult('error', 'خارج النطاق', `أنت على بعد ${Math.round(check.distance)} متر من المكان.`);
      }
    }

    // ═══ كل الشروط صحيحة → سجّل ═══
    await addDoc(collection(db, COLLECTIONS.ATTENDANCE), {
      PersonID: maPerson.id,
      PersonName: [maPerson.FirstName, maPerson.SecondName, maPerson.ThirdName, maPerson.FourthName].filter(Boolean).join(' '),
      MeetingID: maSelectedMeeting.id,
      MeetingTitle: maSelectedMeeting.Title || '',
      OccurrenceDate: occurrenceDate,
      ScanTime: new Date().toISOString(),
      Status: 'present',
      ScannerEmail: maUser.email,
      ScannerName: maUser.name || maUser.email,
      Method: 'self', // ⚡ جديد: عشان نعرف إنها تسجيل ذاتي
      Location: maUserLocation ? {
        lat: maUserLocation.lat,
        lng: maUserLocation.lng,
        accuracy: maUserLocation.accuracy
      } : null,
      Notes: ''
    });

    playSound('success');
    showResult('success', 'تم تسجيل حضورك', maSelectedMeeting.Title || '');

  } catch (err) {
    console.error('❌ Process scan error:', err);
    showResult('error', 'خطأ', err.message);
  }
}

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
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//   Result Popup
// ═══════════════════════════════════════════════════════

function showResult(type, title, message) {
  if (type === 'error') playSound('error');

  let overlay = document.getElementById('maResultOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'maResultOverlay';
    overlay.className = 'ma-result-overlay';
    document.body.appendChild(overlay);
  }

  const icon = type === 'success' ? '✅' : '❌';
  const btnText = type === 'success' ? 'حسنًا' : 'حاول مرة أخرى';

  overlay.innerHTML = `
    <div class="ma-result-card">
      <div class="ma-result-icon">${icon}</div>
      <div class="ma-result-title ${type}">${escapeHtml(title)}</div>
      <div class="ma-result-message">${escapeHtml(message)}</div>
      <button class="ma-result-btn" onclick="closeResultAndResume()">${btnText}</button>
    </div>
  `;

  // لو نجح → اقفل الـScanner بعد 3 ثواني
  if (type === 'success') {
    setTimeout(() => {
      const overlayEl = document.getElementById('maResultOverlay');
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
      }
      closeMyAttendanceScanner();
    }, 3000);
  }
}

window.closeResultAndResume = function() {
  const overlay = document.getElementById('maResultOverlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  resumeScanner();
};

async function resumeScanner() {
  if (maHtml5QrCode && maIsScanning) {
    try { await maHtml5QrCode.resume(); } catch (e) {}
  } else {
    openScanner();
  }
}

window.closeMyAttendanceScanner = async function() {
  if (maHtml5QrCode && maIsScanning) {
    try {
      await maHtml5QrCode.stop();
      maHtml5QrCode.clear();
    } catch (e) {}
  }
  maIsScanning = false;
  maHtml5QrCode = null;

  const view = document.getElementById('maScannerView');
  if (view && view.parentNode) {
    view.parentNode.removeChild(view);
  }
};

// ═══════════════════════════════════════════════════════
//   Sounds
// ═══════════════════════════════════════════════════════

function playSound(type) {
  const enabled = type === 'success'
    ? maSettings.SuccessSound !== false
    : maSettings.ErrorSound !== false;

  if (!enabled) return;

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.1);
    } else {
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
    }

    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════
//   Time Helpers
// ═══════════════════════════════════════════════════════

function isMeetingOpenNow(meeting) {
  if (!meeting) return false;

  const occurrenceDate = getTodayOccurrence(meeting);
  if (!occurrenceDate) return false;

  const [h, m] = String(meeting.Time || '00:00').split(':').map(Number);
  const now = new Date();
  const meetingTime = new Date(now);
  meetingTime.setHours(h || 0, m || 0, 0, 0);

  const openBefore = Number(maSettings.OpenBeforeMinutes || 30);
  const closeAfter = Number(maSettings.CloseAfterMinutes || 15);

  const openTime = new Date(meetingTime.getTime() - openBefore * 60000);
  const closeTime = new Date(meetingTime.getTime() + closeAfter * 60000);

  return now >= openTime && now <= closeTime;
}

function getTodayOccurrence(meeting) {
  if (!meeting) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateISO(today);
  const type = String(meeting.Type || 'once').toLowerCase();

  if (type === 'weekly') {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    if (days[today.getDay()] !== meeting.DayOfWeek) return null;
    return todayStr;
  }

  if (meeting.Date === todayStr) return todayStr;
  return null;
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
//   Expose
// ═══════════════════════════════════════════════════════

window.loadMyAttendancePage = loadMyAttendancePage;
