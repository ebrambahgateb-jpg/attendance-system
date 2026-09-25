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

  startNotificationsListener();
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

function isNotificationForMe(notif) {
  if (!currentUser || !currentUser.email) return false;

  const targetType = String(notif.TargetType || '').toLowerCase();
  const ws = currentUser.currentWorkspace || currentUser.selectedRole || '';

  if (targetType === 'all') return true;

  if (targetType === 'admins') {
    return ['Owner', 'Admin'].includes(ws);
  }

  if (targetType === 'specific') {
    const ids = Array.isArray(notif.TargetPersonIDs) ? notif.TargetPersonIDs : [];
    return ids.includes(currentUser.personId);
  }

  if (targetType === 'person') {
    return String(notif.TargetPersonID) === String(currentUser.personId);
  }

  return false;
}

// ═══════════════════════════════════════════════════════
//   Badge
// ═══════════════════════════════════════════════════════

function updateBadge() {
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
      const clickable = isClickable(n);

      return `
        <div class="notif-item ${isRead ? 'read' : 'unread'} ${clickable ? 'clickable' : ''}"
             data-id="${n.id}">
          <div class="notif-item-icon">${typeIcon}</div>
          <div class="notif-item-content">
            <div class="notif-item-title">${escapeHtml(n.Title || '')}</div>
            <div class="notif-item-body">${formatBody(n.Body || '')}</div>
            <div class="notif-item-time">${timeStr}</div>
          </div>
          ${!isRead ? '<div class="notif-item-dot"></div>' : ''}
          <button class="notif-item-delete" data-delete-id="${n.id}" title="حذف">✕</button>
        </div>
      `;
    }).join('');
  }

  modal.innerHTML = `
    <div class="modal-content notif-modal-content">
      <div class="modal-header">
        <h2>🔔 الإشعارات ${unreadCount > 0 ? `<span class="notif-count">${unreadCount} جديد</span>` : ''}</h2>
        <button class="modal-close" id="closeNotifModal">✕</button>
      </div>
      <div class="modal-body notif-modal-body">
        ${notificationsData.length > 0 ? `
          <div class="notif-actions">
            ${unread.length > 0 ? `<button class="btn-small" id="markAllReadBtn">✅ تعليم الكل كمقروء</button>` : ''}
            <button class="btn-small danger" id="clearAllNotifBtn">🗑️ حذف الكل</button>
          </div>
        ` : ''}
        <div class="notif-list">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;

  // ⚡ اقفل
  const closeBtn = document.getElementById('closeNotifModal');
  if (closeBtn) closeBtn.onclick = closeNotificationsModal;

  // ⚡ تعليم الكل
  const markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) markAllBtn.onclick = window.markAllAsRead;

  // ⚡ حذف الكل
  const clearAllBtn = document.getElementById('clearAllNotifBtn');
  if (clearAllBtn) clearAllBtn.onclick = window.clearAllNotifications;

  // ⚡ اربط الإشعارات
  modal.querySelectorAll('.notif-item').forEach(el => {
    const notifId = el.dataset.id;

    el.onclick = (e) => {
      // ⚡ لو ضغط على زرار الحذف → مش نفتح
      if (e.target.closest('.notif-item-delete')) return;
      handleNotificationClick(notifId);
    };
  });

  // ⚡ اربط أزرار الحذف
  modal.querySelectorAll('.notif-item-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const notifId = btn.dataset.deleteId;
      if (notifId) window.deleteNotification(notifId);
    };
  });
}

// ═══════════════════════════════════════════════════════
//   ⚡ Handle Notification Click (Navigate)
// ═══════════════════════════════════════════════════════

function isClickable(notif) {
  const type = String(notif.Type || '').toLowerCase();
  const clickableTypes = [
    'chat_message',
    'transfer_request',
    'transfer_approved',
    'transfer_rejected',
    'event_added',
    'event_updated',
    'event_cancelled',
    'rsvp_request',
    'person_confirmed',
    'person_cancelled_admin',
    'person_cancelled_member',
    'person_cancelled_public'
  ];
  return clickableTypes.includes(type);
}

async function handleNotificationClick(notifId) {
  const notif = notificationsData.find(n => n.id === notifId);
  if (!notif) return;

  // ⚡ علّم كمقروء
  await markAsRead(notifId);

  const type = String(notif.Type || '').toLowerCase();

  console.log('🔔 Notification clicked:', type, notif);

  // ⚡ اقفل المودال
  closeNotificationsModal();

  // ═══════════════════════════════════════════════════
  //   Navigate based on Type
  // ═══════════════════════════════════════════════════

  if (type === 'chat_message') {
    navigateToChat(notif);
    return;
  }

  if (type === 'transfer_request') {
    navigateToScheduleTab('requests');
    return;
  }

  if (type === 'transfer_approved' || type === 'transfer_rejected') {
    navigateToScheduleTab('my-requests');
    return;
  }

  if (type === 'event_added' || type === 'event_updated' || type === 'event_cancelled') {
    navigateToTab('events');
    return;
  }

  if (type === 'rsvp_request') {
    navigateToTab('my-events');
    return;
  }

  if (type === 'person_confirmed' || type.startsWith('person_cancelled')) {
    navigateToTab('attendance');
    return;
  }

  // ⚡ Fallback — لو مش عارفين النوع
  console.log('⚠️ Unknown notification type:', type);
}

// ═══ Navigate to Tab ═══

function navigateToTab(tabId) {
  // ⚡ اضغط على الـnav-item المناسب
  const navItem = document.querySelector(`.nav-item[data-page="${tabId}"]`);

  if (navItem) {
    navItem.click();
    console.log(`✅ Navigated to: ${tabId}`);
  } else {
    console.warn(`⚠️ Tab not found: ${tabId}`);
    alert(`⚠️ التاب "${tabId}" غير متاح في واجهتك`);
  }
}

function navigateToScheduleTab(subTab) {
  // ⚡ اذهب للجدول
  const scheduleNav = document.querySelector('.nav-item[data-page="schedule"]');

  if (!scheduleNav) {
    console.warn('⚠️ Schedule tab not available');
    alert('⚠️ تاب الجدول غير متاح في واجهتك');
    return;
  }

  scheduleNav.click();

  // ⚡ بعد ما الجدول يفتح، نضغط على التاب الفرعي
  setTimeout(() => {
    const subTabBtn = document.querySelector(`.sch-tab[data-tab="${subTab}"]`);

    if (subTabBtn) {
      subTabBtn.click();
      console.log(`✅ Navigated to schedule sub-tab: ${subTab}`);
    } else {
      console.warn(`⚠️ Sub-tab not found: ${subTab}`);
    }
  }, 800);
}

function navigateToChat(notif) {
  // ⚡ اذهب للشات
  const chatNav = document.querySelector('.nav-item[data-page="chat"]');

  if (!chatNav) {
    console.warn('⚠️ Chat tab not available');
    alert('⚠️ تاب الرسائل غير متاح في واجهتك');
    return;
  }

  chatNav.click();

  // ⚡ بعد ما الشات يفتح، نفتح المحادثة المحددة
  const chatId = notif.ChatID || notif.RelatedChatID || notif.RelatedID;

  if (chatId) {
    setTimeout(() => {
      if (typeof window.openChat === 'function') {
        window.openChat(chatId);
        console.log(`✅ Opened chat: ${chatId}`);
      } else {
        console.warn('⚠️ openChat function not available');
      }
    }, 1000);
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
    transfer_request: '🔄',
    transfer_approved: '✅',
    transfer_rejected: '❌',
    chat_message: '💬'
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

// ═══ Auto-init ═══
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.initNotifications === 'function') {
      window.initNotifications();
    }
  }, 1000);
});
