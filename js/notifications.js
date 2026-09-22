// ═══════════════════════════════════════════════════════
//   Notifications Center
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let notificationsData = [];
let currentUser = null;
let unsubscribeListener = null;
let unreadCount = 0;

// ═══════════════════════════════════════════════════════
//   Initialize
// ═══════════════════════════════════════════════════════

function initNotifications() {
  try {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    currentUser = null;
  }

  if (!currentUser) return;

  // ⚡ ابدأ Live Listener
  startNotificationsListener();

  // ⚡ اربط الأزرار
  setupNotificationsEvents();
}

function setupNotificationsEvents() {
  const bellBtn = document.getElementById('notificationsBtn');
  if (bellBtn) {
    bellBtn.onclick = () => openNotificationsModal();
  }
}

// ═══════════════════════════════════════════════════════
//   Live Listener
// ═══════════════════════════════════════════════════════

function startNotificationsListener() {
  if (unsubscribeListener) {
    unsubscribeListener();
  }

  try {
    // ⚡ اجلب كل الإشعارات (مرتبة بالأحدث)
    const q = query(
      collection(db, 'notifications'),
      orderBy('CreatedAt', 'desc')
    );

    unsubscribeListener = onSnapshot(q, (snap) => {
      notificationsData = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => isNotificationForMe(n));

      updateBadge();
    }, (err) => {
      console.warn('⚠️ Notifications listener error:', err.message);

      // ⚡ Fallback: جلب بدون orderBy
      getDocs(collection(db, 'notifications'))
        .then(snap => {
          notificationsData = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(n => isNotificationForMe(n))
            .sort((a, b) => {
              const da = new Date(b.CreatedAt || 0);
              const db2 = new Date(a.CreatedAt || 0);
              return da - db2;
            });
          updateBadge();
        })
        .catch(() => {});
    });
  } catch (err) {
    console.warn('⚠️ startNotificationsListener error:', err.message);
  }
}

/**
 * ⚡ هل الإشعار موجّه للمستخدم الحالي؟
 */
function isNotificationForMe(notif) {
  if (!currentUser || !currentUser.email) return false;

  const targetType = String(notif.TargetType || '').toLowerCase();

  // ⚡ الواجهة الحالية (currentWorkspace أو selectedRole كـ fallback)
  const ws = currentUser.currentWorkspace || currentUser.selectedRole || '';

  // ⚡ للكل
  if (targetType === 'all') return true;

  // ⚡ للـ Admins بس
  if (targetType === 'admins') {
    return ['Owner', 'Admin'].includes(ws);
  }

  // ⚡ لأشخاص محددين
  if (targetType === 'specific') {
    const ids = Array.isArray(notif.TargetPersonIDs) ? notif.TargetPersonIDs : [];
    return ids.includes(currentUser.personId);
  }

  // ⚡ لشخص واحد
  if (targetType === 'person') {
    return String(notif.TargetPersonID) === String(currentUser.personId);
  }

  return false;
}

// ═══════════════════════════════════════════════════════
//   Badge
// ═══════════════════════════════════════════════════════

function updateBadge() {
  // ⚡ احسب عدد الإشعارات غير المقروءة
  unreadCount = notificationsData.filter(n => !isReadByMe(n)).length;

  const badge = document.getElementById('notificationsBadge');
  const bellBtn = document.getElementById('notificationsBtn');

  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (bellBtn) {
    bellBtn.classList.toggle('has-unread', unreadCount > 0);
  }
}

function isReadByMe(notif) {
  const readBy = Array.isArray(notif.ReadBy) ? notif.ReadBy : [];
  return readBy.includes(currentUser.email);
}

// ═══════════════════════════════════════════════════════
//   Modal
// ═══════════════════════════════════════════════════════

function openNotificationsModal() {
  let modal = document.getElementById('notificationsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'notificationsModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  renderNotificationsModal(modal);
  modal.style.display = 'flex';
}

function closeNotificationsModal() {
  const modal = document.getElementById('notificationsModal');
  if (modal) modal.style.display = 'none';
}

function renderNotificationsModal(modal) {
  const unread = notificationsData.filter(n => !isReadByMe(n));

  let contentHtml = '';

  if (notificationsData.length === 0) {
    contentHtml = `
      <div class="notif-empty">
        <div class="notif-empty-icon">🔔</div>
        <p>لا توجد إشعارات</p>
      </div>
    `;
  } else {
    contentHtml = notificationsData.map(n => {
      const isRead = isReadByMe(n);
      const timeStr = formatRelativeTime(n.CreatedAt);
      const typeIcon = getTypeIcon(n.Type);

      return `
        <div class="notif-item ${isRead ? 'read' : 'unread'}" data-id="${n.id}">
          <div class="notif-item-icon">${typeIcon}</div>
          <div class="notif-item-content">
            <div class="notif-item-title">${escapeHtml(n.Title || '')}</div>
            <div class="notif-item-body">${formatBody(n.Body || '')}</div>
            <div class="notif-item-time">${timeStr}</div>
          </div>
          ${!isRead ? '<div class="notif-item-dot"></div>' : ''}
          <button class="notif-item-delete" onclick="deleteNotification('${n.id}')" title="حذف">✕</button>
        </div>
      `;
    }).join('');
  }

  modal.innerHTML = `
    <div class="modal-content notif-modal-content">
      <div class="modal-header">
        <h2>🔔 الإشعارات ${unreadCount > 0 ? `<span class="notif-count">${unreadCount} جديد</span>` : ''}</h2>
        <button class="modal-close" onclick="closeNotificationsModal()">✕</button>
      </div>
      <div class="modal-body notif-modal-body">
        ${notificationsData.length > 0 ? `
          <div class="notif-actions">
            ${unread.length > 0 ? `<button class="btn-small" onclick="markAllAsRead()">✅ تعليم الكل كمقروء</button>` : ''}
            <button class="btn-small danger" onclick="clearAllNotifications()">🗑️ حذف الكل</button>
          </div>
        ` : ''}
        <div class="notif-list">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;

  // ⚡ علّم كمقروء بمجرد الفتح
  if (unread.length > 0) {
    setTimeout(() => markAllAsRead(), 500);
  }
}

// ═══════════════════════════════════════════════════════
//   Actions
// ═══════════════════════════════════════════════════════

async function markAsRead(notifId) {
  const notif = notificationsData.find(n => n.id === notifId);
  if (!notif) return;
  if (isReadByMe(notif)) return;

  try {
    await updateDoc(doc(db, 'notifications', notifId), {
      ReadBy: arrayUnion(currentUser.email)
    });
    // ⚡ Live listener هيعمل refresh تلقائيًا
  } catch (err) {
    console.warn('Mark as read error:', err.message);
  }
}

window.markAllAsRead = async function() {
  const unread = notificationsData.filter(n => !isReadByMe(n));

  for (const n of unread) {
    try {
      await updateDoc(doc(db, 'notifications', n.id), {
        ReadBy: arrayUnion(currentUser.email)
      });
    } catch (err) {
      console.warn('Mark all error:', err.message);
    }
  }

  // ⚡ أعد فتح الـ Modal
  const modal = document.getElementById('notificationsModal');
  if (modal && modal.style.display === 'flex') {
    renderNotificationsModal(modal);
  }
};

window.deleteNotification = async function(notifId) {
  if (!confirm('هل تريد حذف هذا الإشعار؟')) return;

  try {
    await deleteDoc(doc(db, 'notifications', notifId));
  } catch (err) {
    alert('خطأ في الحذف: ' + err.message);
  }
};

window.clearAllNotifications = async function() {
  if (!confirm('⚠️ هل أنت متأكد من حذف كل الإشعارات؟')) return;

  for (const n of notificationsData) {
    try {
      await deleteDoc(doc(db, 'notifications', n.id));
    } catch (err) {
      console.warn('Clear error:', err.message);
    }
  }
};

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getTypeIcon(type) {
    const map = {
    event_added: '🎯',
    event_updated: '✏️',
    event_cancelled: '❌',
    person_confirmed: '✅',
    person_cancelled_admin: '📢',
    person_cancelled_member: '⚠️',
    person_cancelled_public: '🎟️',
    rsvp_request: '📝',
    transfer_request: '🔄',      // ⚡ جديد
    transfer_approved: '✅',      // ⚡ جديد
    transfer_rejected: '❌'       // ⚡ جديد
  };
  return map[type] || '🔔';
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';

  try {
    const date = new Date(isoStr);
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;

    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  } catch (e) {
    return '';
  }
}

function formatBody(body) {
  if (!body) return '';
  return escapeHtml(body).replace(/\n/g, '<br>');
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

window.initNotifications = initNotifications;
window.openNotificationsModal = openNotificationsModal;
window.closeNotificationsModal = closeNotificationsModal;

// ═══ Auto-init عند تحميل الصفحة ═══
document.addEventListener('DOMContentLoaded', () => {
  // ⚡ انتظر شوية لحد ما الـ dashboard.js يحمّل
  setTimeout(() => {
    if (typeof window.initNotifications === 'function') {
      window.initNotifications();
    }
  }, 1000);
});
