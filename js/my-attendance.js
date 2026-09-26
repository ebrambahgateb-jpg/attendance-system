// ═══════════════════════════════════════════════════════
//   My Attendance (سجل حضورك بنفسك) — Events
//   ⚡ محدّث: GPS محسّن + watchPosition + Tolerance
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
let maEvents = [];
let maSelectedEvent = null;
let maHtml5QrCode = null;
let maIsScanning = false;
let maLastScanTime = 0;
let maUserLocation = null;
let maAvailableLocations = [];
let maAvailableEventTypes = [];
let maLocationWatchId = null;

// ═══ Constants ═══
const MA_SCAN_COOLDOWN = 2000;
const MA_MAX_ACCURACY = 50;            // ⚡ 50 متر (بدل 15)
const MA_GOOD_ACCURACY = 25;           // ⚡ دقة جيدة (نتوقف عندها)
const MA_STRICT_RADIUS = false;         // ⚡ يستخدم Radius + Tolerance
const MA_LOCATION_TIMEOUT = 20000;     // ⚡ 20 ثانية كحد أقصى
const MA_MIN_ATTEMPTS = 3;             // ⚡ 3 قراءات على الأقل

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

    const [settingsDoc, locationsSnap, eventTypesSnap] = await Promise.all([
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC)),
      getDocs(collection(db, 'locations')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'eventTypes')).catch(() => ({ docs: [] }))
    ]);

    maSettings = settingsDoc.exists() ? settingsDoc.data() : {};

    maAvailableLocations = locationsSnap.docs
      ? locationsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      : [];

    maAvailableEventTypes = eventTypesSnap.docs
      ? eventTypesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      : [];

    maPerson = null;
    const personId = maUser.personId || maUser.account?.PersonID;

    if (personId) {
      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, personId));
      if (pDoc.exists()) {
        maPerson = { id: pDoc.id, ...pDoc.data() };
      }
    }

    if (!maPerson && maUser.email) {
      const q = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', maUser.email)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        maPerson = { id: docSnap.id, ...docSnap.data() };

        maUser.personId = maPerson.id;
        localStorage.setItem('currentUser', JSON.stringify(maUser));
      }
    }

    const eventsSnap = await getDocs(collection(db, 'events'));

    maEvents = eventsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => String(e.Status || '').toLowerCase() === 'active')
      .filter(e => getTodayOccurrence(e) !== null)
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

  if (maEvents.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;margin-bottom:20px;">
        <h2 style="color:var(--text);margin-bottom:6px;">مرحبًا ${escapeHtml(fullName)}</h2>
      </div>
      <div class="ma-empty">
        <div class="ma-empty-icon">📅</div>
        <h2>لا يوجد أحداث مجدولة اليوم</h2>
        <p>سيظهر هنا الأحداث فور إضافتها، أو عُد غدًا.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="text-align:center;margin-bottom:20px;">
      <h2 style="color:var(--text);margin-bottom:6px;">مرحبًا ${escapeHtml(fullName)}</h2>
      <p style="color:var(--text-muted);font-size:14px;">سجّل حضورك بمسح QR النظام</p>
    </div>

    <div class="ma-step">
      <div class="ma-step-title">
        <span class="step-num">1</span>
        <span>اختر الحدث</span>
      </div>

      <select id="maEventSelect" class="ma-select">
        <option value="">-- اختر الحدث --</option>
        ${maEvents.map(e => {
          const type = String(e.Type || 'once').toLowerCase();
          const typeLabel = type === 'weekly' ? '🔄' : '📅';
          const endTime = getEventEndTime(e);
          const eventType = maAvailableEventTypes.find(t => t.id === e.EventTypeID);
          const typeIcon = eventType ? (eventType.Icon || '📅') : '📅';
          return `<option value="${e.id}">${typeIcon} ${escapeHtml(e.Title || '')} — ${e.Time || ''} - ${endTime}</option>`;
        }).join('')}
      </select>

      <div id="maEventInfo" class="ma-meeting-info" style="display:none;"></div>
    </div>

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
  const select = document.getElementById('maEventSelect');
  const scanBtn = document.getElementById('maScanBtn');

  if (select) {
    select.onchange = () => {
      const eventId = select.value;

      if (!eventId) {
        maSelectedEvent = null;
        const info = document.getElementById('maEventInfo');
        const scanStep = document.getElementById('maScanStep');
        if (info) info.style.display = 'none';
        if (scanStep) scanStep.style.display = 'none';
        return;
      }

      maSelectedEvent = maEvents.find(e => e.id === eventId);
      if (maSelectedEvent) {
        renderEventInfo();
        const scanStep = document.getElementById('maScanStep');
        if (scanStep) scanStep.style.display = 'block';

        checkLocation();
      }
    };
  }

  if (scanBtn) {
    scanBtn.onclick = () => openScanner();
  }
}

// ═══════════════════════════════════════════════════════
//   Event Info
// ═══════════════════════════════════════════════════════

function renderEventInfo() {
  const info = document.getElementById('maEventInfo');
  if (!info || !maSelectedEvent) return;

  const type = String(maSelectedEvent.Type || 'once').toLowerCase();
  const endTime = getEventEndTime(maSelectedEvent);

  const eventType = maAvailableEventTypes.find(t => t.id === maSelectedEvent.EventTypeID);
  const eventTypeText = eventType ? `${eventType.Icon || '📅'} ${eventType.Name}` : '';

  let dayText = '';
  if (type === 'weekly') {
    const days = {Sunday:'الأحد',Monday:'الاثنين',Tuesday:'الثلاثاء',Wednesday:'الأربعاء',Thursday:'الخميس',Friday:'الجمعة',Saturday:'السبت'};
    dayText = 'كل ' + (days[maSelectedEvent.DayOfWeek] || '');
  } else {
    dayText = maSelectedEvent.Date || '';
  }

  const isOpen = isEventOpenNow(maSelectedEvent);
  const timeStatus = isOpen
    ? { class: 'status-open', icon: '🟢', text: 'الحضور مفتوح الآن' }
    : { class: 'status-closed', icon: '🔴', text: 'الحضور مغلق حالياً' };

  const locMode = String(maSelectedEvent.LocationMode || 'any').toLowerCase();
  let locText = '';

  if (locMode === 'any') {
    locText = 'أي مكان مسجل';
  } else {
    const ids = Array.isArray(maSelectedEvent.LocationIds) ? maSelectedEvent.LocationIds : [];
    const names = ids.map(id => {
      const loc = maAvailableLocations.find(l => l.id === id);
      return loc ? loc.Name : null;
    }).filter(Boolean);

    locText = names.length > 0 ? names.join(' • ') : 'لم يتم تحديد أماكن';
  }

  info.innerHTML = `
    ${eventTypeText ? `
      <div class="ma-info-row">
        <span class="icon">📋</span>
        <span>${escapeHtml(eventTypeText)}</span>
      </div>
    ` : ''}
    <div class="ma-info-row">
      <span class="icon">${type === 'weekly' ? '🔄' : '📅'}</span>
      <span>${dayText}</span>
    </div>
    <div class="ma-info-row">
      <span class="icon">🕐</span>
      <span>${maSelectedEvent.Time || ''} - ${endTime}</span>
    </div>
    <div class="ma-info-row">
      <span class="icon">📍</span>
      <span>${escapeHtml(locText)}</span>
    </div>
    <div class="ma-info-row">
      <span class="icon">${timeStatus.icon}</span>
      <span class="${timeStatus.class}">${timeStatus.text}</span>
    </div>
  `;
  info.style.display = 'block';
}

// ═══════════════════════════════════════════════════════
//   ⚡ Check Location (Enhanced with watchPosition)
// ═══════════════════════════════════════════════════════

function checkLocation() {
  const statusEl = document.getElementById('maLocationStatus');
  if (!statusEl) return;

  const locationEnabled = maSettings.LocationEnabled !== false;

  if (!locationEnabled) {
    statusEl.className = 'ma-location-status valid';
    statusEl.innerHTML = '<span class="dot"></span><span>التحقق من الموقع غير مفعّل</span>';
    updateScanButton();
    return;
  }

  if (!navigator.geolocation) {
    statusEl.className = 'ma-location-status invalid';
    statusEl.innerHTML = '<span class="dot"></span><span>متصفحك لا يدعم تحديد الموقع</span>';
    updateScanButton();
    return;
  }

  // ⚡ اوقف أي watch سابق
  stopLocationWatch();

  statusEl.className = 'ma-location-status checking';
  statusEl.innerHTML = '<span class="dot"></span><span>📡 جاري تحديد الموقع بدقة...</span>';

  // ⚡ ابدأ watchPosition
  let attempts = 0;
  let bestPosition = null;
  let bestAccuracy = Infinity;
  let resolved = false;

  const startTime = Date.now();

  maLocationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (resolved) return;

      attempts++;

      const accuracy = pos.coords.accuracy;
      const elapsed = Date.now() - startTime;

      console.log(`📍 Location attempt ${attempts}: accuracy=${Math.round(accuracy)}m, elapsed=${Math.round(elapsed/1000)}s`);

      // ⚡ احفظ الأحسن
      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
        bestPosition = pos;
      }

      // ⚡ شرط الإنهاء:
      // 1. دقة جيدة (≤ 25 متر) → توقف فورًا
      // 2. أو مرت 20 ثانية → توقف وخد الأحسن
      // 3. أو 5 محاولات + دقة مقبولة (≤ 50 متر)

      const shouldStop =
        accuracy <= MA_GOOD_ACCURACY ||
        elapsed >= MA_LOCATION_TIMEOUT ||
        (attempts >= MA_MIN_ATTEMPTS && accuracy <= MA_MAX_ACCURACY);

      if (shouldStop) {
        resolved = true;
        stopLocationWatch();
        finalizeLocationCheck(bestPosition, statusEl);
      } else {
        // ⚡ حدّث الحالة
        statusEl.className = 'ma-location-status checking';
        statusEl.innerHTML = `<span class="dot"></span><span>📡 تحسين الدقة... (${Math.round(accuracy)}م)</span>`;
      }
    },
    (err) => {
      if (resolved) return;

      // ⚡ لو فيه قراءة أحسن → استخدمها
      if (bestPosition) {
        resolved = true;
        stopLocationWatch();
        finalizeLocationCheck(bestPosition, statusEl);
        return;
      }

      resolved = true;
      stopLocationWatch();

      let msg = 'فشل تحديد الموقع';
      if (err.code === 1) msg = 'لم تسمح بالوصول للموقع';
      else if (err.code === 2) msg = 'الموقع غير متاح';
      else if (err.code === 3) msg = 'انتهت مهلة تحديد الموقع';

      statusEl.className = 'ma-location-status invalid';
      statusEl.innerHTML = `<span class="dot"></span><span>❌ ${msg}</span>`;
      updateScanButton();
    },
    {
      enableHighAccuracy: true,
      timeout: MA_LOCATION_TIMEOUT,
      maximumAge: 0
    }
  );

  // ⚡ Timeout إجباري بعد 20 ثانية
  setTimeout(() => {
    if (resolved) return;
    resolved = true;
    stopLocationWatch();
    if (bestPosition) {
      finalizeLocationCheck(bestPosition, statusEl);
    } else {
      statusEl.className = 'ma-location-status invalid';
      statusEl.innerHTML = '<span class="dot"></span><span>❌ انتهت المهلة</span>';
      updateScanButton();
    }
  }, MA_LOCATION_TIMEOUT);
}

function stopLocationWatch() {
  if (maLocationWatchId !== null) {
    navigator.geolocation.clearWatch(maLocationWatchId);
    maLocationWatchId = null;
  }
}

function finalizeLocationCheck(position, statusEl) {
  if (!position) {
    statusEl.className = 'ma-location-status invalid';
    statusEl.innerHTML = '<span class="dot"></span><span>❌ فشل تحديد الموقع</span>';
    updateScanButton();
    return;
  }

  maUserLocation = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy
  };

  console.log(`✅ Final location: accuracy=${Math.round(maUserLocation.accuracy)}m`);

  // ⚡ لو الدقة سيئة جدًا → رفض
  if (maUserLocation.accuracy > MA_MAX_ACCURACY) {
    statusEl.className = 'ma-location-status invalid';
    statusEl.innerHTML = `<span class="dot"></span><span>⚠️ دقة GPS ضعيفة (${Math.round(maUserLocation.accuracy)}م). اقترب من نافذة/باب وحاول مجددًا.</span>`;
    updateScanButton();
    return;
  }

  const check = validateLocation(maUserLocation);

  if (check.valid) {
    statusEl.className = 'ma-location-status valid';
    const locName = check.location ? check.location.Name : '';
    const distStr = check.distance ? ` (${Math.round(check.distance)}م)` : '';
    const accStr = ` [دقة: ${Math.round(maUserLocation.accuracy)}م]`;
    statusEl.innerHTML = `<span class="dot"></span><span>✅ داخل النطاق${locName ? ' — ' + escapeHtml(locName) : ''}${distStr}${accStr}</span>`;
  } else {
    statusEl.className = 'ma-location-status invalid';

    let reasonText = 'أنت خارج النطاق المسموح';
    if (check.reason === 'no_locations') reasonText = 'الحدث غير مرتبط بأماكن';
    else if (check.reason === 'low_accuracy') reasonText = 'دقة GPS ضعيفة';

    statusEl.innerHTML = `<span class="dot"></span><span>❌ ${reasonText}</span>`;
  }

  updateScanButton();
}

// ═══════════════════════════════════════════════════════
//   Validate Location
// ═══════════════════════════════════════════════════════

function validateLocation(loc) {
  const locationEnabled = maSettings.LocationEnabled !== false;
  if (!locationEnabled) return { valid: true, location: null };

  if (!maSelectedEvent) {
    return { valid: false, location: null, reason: 'no_event' };
  }

  if ((loc.accuracy || 0) > MA_MAX_ACCURACY) {
    return { valid: false, location: null, reason: 'low_accuracy' };
  }

  const allowedLocations = getAllowedLocationsForEvent(maSelectedEvent);

  if (allowedLocations.length === 0) {
    return { valid: false, location: null, reason: 'no_locations' };
  }

  let bestMatch = null;
  let bestDistance = Infinity;

  for (const targetLoc of allowedLocations) {
    const distance = getDistance(loc.lat, loc.lng, targetLoc.Lat, targetLoc.Lng);

    // ⚡ السماحية = Radius + Tolerance
    const allowed = MA_STRICT_RADIUS
      ? (targetLoc.Radius || 4)
      : ((targetLoc.Radius || 4) + (targetLoc.Tolerance || 15));

    if (distance <= allowed) {
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = targetLoc;
      }
    }
  }

  if (bestMatch) {
    return {
      valid: true,
      location: bestMatch,
      distance: bestDistance
    };
  }

  return {
    valid: false,
    location: null,
    reason: 'out_of_range'
  };
}

function getAllowedLocationsForEvent(event) {
  const mode = String(event.LocationMode || 'any').toLowerCase();

  if (mode === 'any') {
    return maAvailableLocations;
  }

  const ids = Array.isArray(event.LocationIds) ? event.LocationIds : [];

  if (ids.length === 0) {
    return [];
  }

  return maAvailableLocations.filter(loc => ids.includes(loc.id));
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
  const isOpen = isEventOpenNow(maSelectedEvent);

  let canScan = true;
  let reason = '';

  if (!maSelectedEvent) {
    canScan = false;
    reason = 'اختر حدث أولاً';
  } else if (!isOpen) {
    canScan = false;
    reason = 'الحضور مغلق حالياً';
  } else if (locationEnabled) {
    if (!maUserLocation) {
      canScan = false;
      reason = 'جاري التحقق من الموقع...';
    } else if (maUserLocation.accuracy > MA_MAX_ACCURACY) {
      canScan = false;
      reason = `دقة GPS ضعيفة (${Math.round(maUserLocation.accuracy)}م)`;
    } else {
      const check = validateLocation(maUserLocation);

      if (!check.valid) {
        canScan = false;

        if (check.reason === 'no_locations') {
          reason = 'الحدث غير مرتبط بأماكن';
        } else if (check.reason === 'low_accuracy') {
          reason = `دقة GPS ضعيفة`;
        } else if (check.reason === 'out_of_range') {
          reason = 'أنت خارج نطاق الأماكن';
        } else {
          reason = 'الموقع غير صالح';
        }
      }
    }
  }

  btn.disabled = !canScan;
  btn.innerHTML = canScan ? '📷 تشغيل الكاميرا' : `⛔ ${reason}`;
}

// ═══════════════════════════════════════════════════════
//   Scanner
// ═══════════════════════════════════════════════════════

async function openScanner() {
  if (!maSelectedEvent) { alert('اختر حدث أولاً'); return; }
  if (!isEventOpenNow(maSelectedEvent)) { alert('الحضور مغلق حالياً'); return; }

  const locationEnabled = maSettings.LocationEnabled !== false;
  if (locationEnabled) {
    if (!maUserLocation) { alert('جاري التحقق من الموقع، انتظر قليلاً'); return; }

    if (maUserLocation.accuracy > MA_MAX_ACCURACY) {
      alert(`دقة GPS ضعيفة (${Math.round(maUserLocation.accuracy)} متر). اقترب من المكان وحاول مرة أخرى.`);
      return;
    }

    const check = validateLocation(maUserLocation);
    if (!check.valid) {
      alert('أنت خارج نطاق الأماكن المسموحة. اقترب من المكان وحاول مرة أخرى.');
      return;
    }
  }

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

  if (maHtml5QrCode && maIsScanning) {
    try { await maHtml5QrCode.pause(true); } catch (e) {}
  }

  await processScan(decodedText);
}

// ═══════════════════════════════════════════════════════
//   Process Scan
// ═══════════════════════════════════════════════════════

async function processScan(scannedText) {
  try {
    if (!maPerson) {
      return showResult('error', 'لا يوجد ملف شخصي', 'تواصل مع المسؤول.');
    }

    if (String(maPerson.Status || '').toLowerCase() !== 'active') {
      return showResult('error', 'حساب معطل', 'تواصل مع المسؤول.');
    }

    if (!maSelectedEvent) {
      return showResult('error', 'لا يوجد حدث', 'اختر حدث أولاً.');
    }

    const occurrenceDate = getTodayOccurrence(maSelectedEvent);
    if (!occurrenceDate) {
      return showResult('error', 'لا يوجد موعد اليوم', 'لا يوجد حدث مجدول اليوم.');
    }

    const cancelled = maSelectedEvent.CanceledOccurrences || [];
    if (cancelled.includes(occurrenceDate)) {
      return showResult('error', 'الموعد ملغي', 'تم إلغاء هذا الموعد.');
    }

    if (!isEventOpenNow(maSelectedEvent)) {
      return showResult('error', 'الحضور مغلق', 'وقت التسجيل انتهى.');
    }

    const allowedLocations = getAllowedLocationsForEvent(maSelectedEvent);

    if (allowedLocations.length === 0) {
      return showResult('error', 'الحدث غير مرتبط بأماكن', 'تواصل مع المسؤول.');
    }

    const scannedLocation = allowedLocations.find(loc => loc.QRCode === scannedText);

    if (!scannedLocation) {
      return showResult('error', 'QR غير صالح', 'هذا QR ليس من الأماكن المسموحة لهذا الحدث.');
    }

    // ═══ الموقع ═══
    const locationEnabled = maSettings.LocationEnabled !== false;

    if (locationEnabled) {
      if (!maUserLocation) {
        return showResult('error', 'لم يتم تحديد الموقع', 'اسمح بالوصول للموقع وحاول مرة أخرى.');
      }

      if (maUserLocation.accuracy > MA_MAX_ACCURACY) {
        return showResult(
          'error',
          'دقة GPS ضعيفة',
          `دقة الموقع ${Math.round(maUserLocation.accuracy)} متر. اقترب من المكان.`
        );
      }

      const distance = getDistance(
        maUserLocation.lat,
        maUserLocation.lng,
        scannedLocation.Lat,
        scannedLocation.Lng
      );

      const allowed = MA_STRICT_RADIUS
        ? (scannedLocation.Radius || 4)
        : ((scannedLocation.Radius || 4) + (scannedLocation.Tolerance || 15));

      if (distance > allowed) {
        return showResult(
          'error',
          'خارج النطاق',
          `أنت على بعد ${Math.round(distance)} متر من "${scannedLocation.Name}". النطاق المسموح ${allowed} متر.`
        );
      }
    }

    const isDup = await checkAlreadyRegistered(maPerson.id, maSelectedEvent.id, occurrenceDate);
    const preventDup = maSettings.PreventDuplicateAttendance !== false;

    if (isDup && preventDup) {
      return showResult('error', 'مسجّل بالفعل', 'سجّلت حضورك مسبقاً لهذا الحدث.');
    }

    await addDoc(collection(db, COLLECTIONS.ATTENDANCE), {
      PersonID: maPerson.id,
      PersonName: [maPerson.FirstName, maPerson.SecondName, maPerson.ThirdName, maPerson.FourthName].filter(Boolean).join(' '),
      EventID: maSelectedEvent.id,
      EventTitle: maSelectedEvent.Title || '',
      EventTypeID: maSelectedEvent.EventTypeID || '',
      OccurrenceDate: occurrenceDate,
      ScanTime: new Date().toISOString(),
      Status: 'present',
      ScannerEmail: maUser.email,
      ScannerName: maUser.name || maUser.email,
      Method: 'self',
      Location: {
        id: scannedLocation.id,
        name: scannedLocation.Name,
        lat: maUserLocation?.lat || null,
        lng: maUserLocation?.lng || null,
        accuracy: maUserLocation?.accuracy || null
      },
      Notes: ''
    });

    playSound('success');
    showResult('success', 'تم تسجيل حضورك', `${maSelectedEvent.Title || ''} — ${scannedLocation.Name}`);

  } catch (err) {
    console.error('❌ Process scan error:', err);
    showResult('error', 'خطأ', err.message);
  }
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

function isEventOpenNow(event) {
  if (!event) return false;

  const occurrenceDate = getTodayOccurrence(event);
  if (!occurrenceDate) return false;

  const now = new Date();

  const [sh, sm] = String(event.Time || '00:00').split(':').map(Number);
  const eventStart = new Date(now);
  eventStart.setHours(sh || 0, sm || 0, 0, 0);

  const endTime = getEventEndTime(event);
  const [eh, em] = String(endTime).split(':').map(Number);
  const eventEnd = new Date(now);
  eventEnd.setHours(eh || 0, em || 0, 0, 0);

  const openBefore = Number(maSettings.OpenBeforeMinutes || 30);
  const closeAfter = Number(maSettings.CloseAfterMinutes || 15);

  const openTime = new Date(eventStart.getTime() - openBefore * 60000);
  const closeTime = new Date(eventEnd.getTime() + closeAfter * 60000);

  return now >= openTime && now <= closeTime;
}

function getTodayOccurrence(event) {
  if (!event) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateISO(today);
  const type = String(event.Type || 'once').toLowerCase();

  if (type === 'weekly') {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    if (days[today.getDay()] !== event.DayOfWeek) return null;
    return todayStr;
  }

  if (event.Date === todayStr) return todayStr;
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
//   Cleanup on page unload
// ═══════════════════════════════════════════════════════

window.addEventListener('beforeunload', () => {
  stopLocationWatch();
});

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.loadMyAttendancePage = loadMyAttendancePage;
window.stopLocationWatch = stopLocationWatch;
