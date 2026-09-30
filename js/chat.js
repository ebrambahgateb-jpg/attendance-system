// ═══════════════════════════════════════════════════════
//   Chat — Internal Messaging System
//   ⚡ 1-to-1 + Groups + Channels + Realtime
//   ⚡ Reply + Edit + Delete + Swipe
//   ⚡ Typing + Read Receipts + Online Status
//   ⚡ Group Management + Mute + Mentions (جديد)
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  db,
  COLLECTIONS
} from './firebase-config.js';

// ═══ State ═══
let chatUser = null;
let chatPerson = null;
let chatWorkspace = null;
let chatPeople = {};
let chatPeopleArray = [];
let chatConversations = [];
let chatActiveChatId = null;
let chatActiveChat = null;
let chatMessages = [];
let chatUnsubscribeMessages = null;
let chatUnsubscribeChats = null;
let chatReplyTo = null;
let longPressTimer = null;

// ═══ ⚡ Typing/Online State ═══
let chatTypingUnsubscribe = null;
let chatTypingUsers = {};
let chatTypingTimeout = null;
let chatOnlineInterval = null;
let chatOnlineUnsubscribe = null;
let chatOnlineStatuses = {};

// ═══ ⚡ Mute State ═══
let chatMutedIds = new Set();

// ═══ ⚡ Mention State ═══
let mentionDropdownActive = false;
let mentionStartIndex = -1;

// ═══ Constants ═══
const MAX_MESSAGE_LENGTH = 2000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const TYPING_TIMEOUT_MS = 3000;
const ONLINE_TIMEOUT_MS = 2 * 60 * 1000;
const ONLINE_HEARTBEAT_MS = 30000;

// ═══ Default Channels ═══
const DEFAULT_CHANNELS = [
  { id: 'general', Name: '💬 الشات العام', Type: 'channel', Description: 'شات عام لكل الأعضاء', ReadOnly: false },
  { id: 'announcements', Name: '📢 الإعلانات', Type: 'channel', Description: 'إعلانات الإدارة', ReadOnly: true }
];

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadChatPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    chatUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!chatUser) {
      window.location.href = '../index.html';
      return;
    }

    chatWorkspace = chatUser.currentWorkspace || chatUser.selectedRole || 'User';

    // ⚡ حمّل الشخص
    chatPerson = null;
    if (chatUser.personId) {
      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, chatUser.personId));
      if (pDoc.exists()) chatPerson = { id: pDoc.id, ...pDoc.data() };
    }

    if (!chatPerson && chatUser.email) {
      const q = query(collection(db, COLLECTIONS.PEOPLE), where('Email', '==', chatUser.email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        chatPerson = { id: snap.docs[0].id, ...snap.docs[0].data() };
        chatUser.personId = chatPerson.id;
        localStorage.setItem('currentUser', JSON.stringify(chatUser));
      }
    }

    if (!chatPerson) {
      area.innerHTML = `
        <div class="chat-error">
          <div class="chat-error-icon">👤</div>
          <h2>لا يوجد ملف شخصي</h2>
          <p>تواصل مع المسؤول لربط حسابك.</p>
        </div>
      `;
      return;
    }

    // ⚡ حمّل الأشخاص
    const peopleSnap = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    chatPeople = {};
    chatPeopleArray = [];
    peopleSnap.docs.forEach(d => {
      const p = { id: d.id, ...d.data() };
      chatPeople[d.id] = p;
      if (String(p.Status || 'active').toLowerCase() === 'active') {
        chatPeopleArray.push(p);
      }
    });

    // ⚡ حمّل الـMuted Chats
    loadMutedChats();

    // ⚡ هيّئ القنوات الافتراضية
    await ensureDefaultChannels();

    // ⚡ ارسم الصفحة
    renderChatPage(area);

    // ⚡ ابدأ Listener
    startChatsListener();
    startOnlineHeartbeat();
    startOnlineListener();

  } catch (err) {
    console.error('❌ Load chat error:', err);
    area.innerHTML = `<div class="placeholder-page">
      <h2>خطأ</h2>
      <p>${err.message}</p>
      <button class="btn-primary" onclick="loadChatPage(document.getElementById('contentArea'))" style="margin-top:16px;">إعادة المحاولة</button>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Mute Chat — localStorage
// ═══════════════════════════════════════════════════════

function loadMutedChats() {
  try {
    const saved = localStorage.getItem('mutedChats');
    if (saved) {
      const arr = JSON.parse(saved);
      chatMutedIds = new Set(Array.isArray(arr) ? arr : []);
    }
  } catch (e) {
    chatMutedIds = new Set();
  }
}

function saveMutedChats() {
  try {
    localStorage.setItem('mutedChats', JSON.stringify([...chatMutedIds]));
  } catch (e) {}
}

function isChatMuted(chatId) {
  return chatMutedIds.has(chatId);
}

window.toggleMuteChat = function(chatId) {
  if (!chatId) return;

  if (chatMutedIds.has(chatId)) {
    chatMutedIds.delete(chatId);
    showToast('🔔 تم إلغاء الكتم');
  } else {
    chatMutedIds.add(chatId);
    showToast('🔕 تم كتم المحادثة');
  }

  saveMutedChats();
  renderChatList();

  // ⚡ حدّث الـheader لو مفتوح
  if (chatActiveChatId === chatId) {
    updateChatHeaderMuteButton();
  }
};

// ═══════════════════════════════════════════════════════
//   ⚡ Online Status
// ═══════════════════════════════════════════════════════

function startOnlineHeartbeat() {
  if (chatOnlineInterval) clearInterval(chatOnlineInterval);

  updateMyOnlineStatus();
  chatOnlineInterval = setInterval(updateMyOnlineStatus, ONLINE_HEARTBEAT_MS);

  window.addEventListener('beforeunload', markMeOffline);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      markMeOffline();
    } else {
      updateMyOnlineStatus();
    }
  });
}

async function updateMyOnlineStatus() {
  if (!chatPerson) return;

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, chatPerson.id);
    await updateDoc(personRef, {
      LastSeen: new Date().toISOString()
    });
    console.log('🟢 Online status updated');
  } catch (err) {
    console.warn('⚠️ updateMyOnlineStatus error:', err.message);
  }
}

function markMeOffline() {
  if (!chatPerson) return;

  try {
    const personRef = doc(db, COLLECTIONS.PEOPLE, chatPerson.id);
    updateDoc(personRef, {
      LastSeen: new Date().toISOString()
    }).catch(() => {});
  } catch (e) {}
}

function startOnlineListener() {
  if (chatOnlineUnsubscribe) {
    try { chatOnlineUnsubscribe(); } catch (e) {}
  }

  chatOnlineStatuses = {};
  Object.keys(chatPeople).forEach(id => {
    chatOnlineStatuses[id] = chatPeople[id].LastSeen || null;
  });

  try {
    chatOnlineUnsubscribe = onSnapshot(
      collection(db, COLLECTIONS.PEOPLE),
      (snap) => {
        snap.docs.forEach(d => {
          const p = d.data();
          chatOnlineStatuses[d.id] = p.LastSeen || null;
        });
        updateOnlineStatusUI();
        renderChatList();
      },
      (err) => {
        console.warn('⚠️ Online listener error:', err.message);
      }
    );
  } catch (err) {
    console.warn('⚠️ Could not start online listener:', err.message);
  }
}

function isUserOnline(personId) {
  const lastSeen = chatOnlineStatuses[personId];
  if (!lastSeen) return false;

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diff = now - lastSeenDate;

  return diff < ONLINE_TIMEOUT_MS;
}

function getOnlineStatusText(personId) {
  if (!personId) return '';

  const lastSeen = chatOnlineStatuses[personId];
  if (!lastSeen) return '';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diff = now - lastSeenDate;

  if (diff < ONLINE_TIMEOUT_MS) return '🟢 متاح الآن';

  const diffMinutes = Math.floor(diff / 60000);
  if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `منذ ${diffDays} يوم`;

  return 'منذ فترة طويلة';
}

function updateOnlineStatusUI() {
  const statusEl = document.getElementById('chatHeaderStatus');
  if (!statusEl || !chatActiveChat) return;

  if (chatActiveChat.Type === 'direct') {
    const otherId = (chatActiveChat.Members || []).find(id => id !== chatPerson.id);
    if (otherId) {
      const statusText = getOnlineStatusText(otherId);
      statusEl.textContent = statusText;
      statusEl.className = 'chat-header-status ' + (isUserOnline(otherId) ? 'online' : 'offline');
    }
  }
}

// ═══════════════════════════════════════════════════════
//   Ensure Default Channels
// ═══════════════════════════════════════════════════════

async function ensureDefaultChannels() {
  for (const ch of DEFAULT_CHANNELS) {
    const chatRef = doc(db, 'chats', ch.id);
    const snap = await getDoc(chatRef);

    if (!snap.exists()) {
      try {
        await setDoc(chatRef, {
          Type: ch.Type,
          Name: ch.Name,
          Description: ch.Description,
          ReadOnly: ch.ReadOnly,
          Members: [],
          Admins: [],
          IsDefault: true,
          CreatedBy: 'system',
          CreatedAt: new Date().toISOString(),
          LastMessage: null,
          LastMessageAt: null
        });
      } catch (err) {
        console.warn(`⚠️ Could not create channel ${ch.id}:`, err.message);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//   Render Page
// ═══════════════════════════════════════════════════════

function renderChatPage(area) {
  const isAdmin = ['Owner', 'Admin'].includes(chatWorkspace);

  area.innerHTML = `
    <div class="chat-container">
      <div class="chat-sidebar" id="chatSidebar">
        <div class="chat-sidebar-header">
          <div class="chat-search-box">
            <input type="text" id="chatSearchInput" placeholder="🔍 ابحث..." />
          </div>
          <div class="chat-sidebar-actions">
            <button class="chat-new-btn" id="newChatBtn" title="محادثة جديدة">✏️</button>
            ${isAdmin ? `<button class="chat-new-group-btn" id="newGroupBtn" title="مجموعة جديدة">➕</button>` : ''}
          </div>
        </div>

        <div class="chat-tabs-filters">
          <button class="chat-filter-btn active" data-filter="all">الكل</button>
          <button class="chat-filter-btn" data-filter="direct">💬 فردي</button>
          <button class="chat-filter-btn" data-filter="group">👥 مجموعات</button>
          <button class="chat-filter-btn" data-filter="channel">📢 قنوات</button>
        </div>

        <div class="chat-list" id="chatList">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </div>

      <div class="chat-main" id="chatMain">
        <div class="chat-empty-state" id="chatEmptyState">
          <div class="chat-empty-icon">💬</div>
          <h3>اختر محادثة للبدء</h3>
          <p>أو ابدأ محادثة جديدة</p>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.chat-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.chat-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderChatList();
    };
  });

  const searchInput = document.getElementById('chatSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderChatList());
  }

  const newChatBtn = document.getElementById('newChatBtn');
  if (newChatBtn) newChatBtn.onclick = window.openNewChatModal;

  const newGroupBtn = document.getElementById('newGroupBtn');
  if (newGroupBtn) newGroupBtn.onclick = window.openNewGroupModal;
}

// ═══════════════════════════════════════════════════════
//   Chats Listener
// ═══════════════════════════════════════════════════════

function startChatsListener() {
  if (chatUnsubscribeChats) {
    try { chatUnsubscribeChats(); } catch (e) {}
    chatUnsubscribeChats = null;
  }

  try {
    const chatsRef = collection(db, 'chats');

    chatUnsubscribeChats = onSnapshot(chatsRef, (snap) => {
      chatConversations = [];

      snap.docs.forEach(d => {
        const chat = { id: d.id, ...d.data() };

        if (chat.Type === 'channel' || chat.IsDefault) {
          chatConversations.push(chat);
          return;
        }

        const members = Array.isArray(chat.Members) ? chat.Members : [];
        if (members.includes(chatPerson.id)) {
          chatConversations.push(chat);
        }
      });

      chatConversations.sort((a, b) => {
        const aTime = a.LastMessageAt || a.CreatedAt || '';
        const bTime = b.LastMessageAt || b.CreatedAt || '';
        return String(bTime).localeCompare(String(aTime));
      });

      renderChatList();
    }, (err) => {
      console.warn('⚠️ Chats listener error:', err.message);
    });
  } catch (err) {
    console.warn('⚠️ Could not start chats listener:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Render Chat List
// ═══════════════════════════════════════════════════════

function renderChatList() {
  const list = document.getElementById('chatList');
  if (!list) return;

  const activeFilter = document.querySelector('.chat-filter-btn.active')?.dataset.filter || 'all';
  const searchTerm = (document.getElementById('chatSearchInput')?.value || '').toLowerCase().trim();

  let filtered = chatConversations;

  if (activeFilter !== 'all') {
    filtered = filtered.filter(c => c.Type === activeFilter || (activeFilter === 'channel' && c.IsDefault));
  }

  if (searchTerm) {
    filtered = filtered.filter(c => getChatDisplayName(c).toLowerCase().includes(searchTerm));
  }

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="chat-list-empty">
        <div class="chat-list-empty-icon">💬</div>
        <p>لا يوجد محادثات</p>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(chat => renderChatListItem(chat)).join('');

  list.querySelectorAll('.chat-item').forEach(item => {
    item.onclick = () => window.openChat(item.dataset.chatId);

    // ⚡ long press للـMute في القائمة
    setupChatItemLongPress(item);
  });
}

function renderChatListItem(chat) {
  const isActive = chat.id === chatActiveChatId;
  const displayName = getChatDisplayName(chat);
  const avatar = getChatAvatar(chat);
  const lastMsg = chat.LastMessage;
  const lastMsgText = lastMsg ? lastMsg.Text || (lastMsg.Type === 'image' ? '📷 صورة' : '') : 'لا يوجد رسائل';
  const lastMsgTime = lastMsg?.SentAt ? formatRelativeTime(parseDate(lastMsg.SentAt)) : '';
  const isMuted = isChatMuted(chat.id);

  let typeBadge = '';
  if (chat.Type === 'channel' || chat.IsDefault) {
    typeBadge = '<span class="chat-item-badge">📢</span>';
  } else if (chat.Type === 'group') {
    typeBadge = '<span class="chat-item-badge">👥</span>';
  }

  let onlineDot = '';
  if (chat.Type === 'direct') {
    const otherId = (chat.Members || []).find(id => id !== chatPerson.id);
    if (otherId && isUserOnline(otherId)) {
      onlineDot = '<span class="chat-online-dot"></span>';
    }
  }

  const muteBadge = isMuted ? '<span class="chat-mute-badge" title="مكتوم">🔕</span>' : '';

  return `
    <div class="chat-item ${isActive ? 'active' : ''} ${isMuted ? 'muted' : ''}" data-chat-id="${chat.id}">
      <div class="chat-item-avatar">
        ${avatar}
        ${onlineDot}
      </div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <div class="chat-item-name">${typeBadge} ${escapeHtml(displayName)} ${muteBadge}</div>
          ${lastMsgTime ? `<div class="chat-item-time">${lastMsgTime}</div>` : ''}
        </div>
        <div class="chat-item-preview">${escapeHtml(lastMsgText)}</div>
      </div>
    </div>
  `;
}

function setupChatItemLongPress(item) {
  let timer = null;

  const openMenu = (x, y) => {
    const chatId = item.dataset.chatId;
    showChatActionsMenu(chatId, x, y);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  item.addEventListener('touchstart', (e) => {
    timer = setTimeout(() => {
      e.preventDefault();
      openMenu(e.touches[0].clientX, e.touches[0].clientY);
    }, 500);
  }, { passive: true });

  item.addEventListener('touchend', () => {
    if (timer) { clearTimeout(timer); timer = null; }
  });

  item.addEventListener('touchmove', () => {
    if (timer) { clearTimeout(timer); timer = null; }
  });

  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  });
}

function showChatActionsMenu(chatId, x, y) {
  closeChatActionsMenu();

  const chat = chatConversations.find(c => c.id === chatId);
  if (!chat) return;

  const isMuted = isChatMuted(chatId);
  const canManage = canManageGroup(chat);

  const menu = document.createElement('div');
  menu.id = 'chatActionsMenu';
  menu.className = 'message-actions-menu';

  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 300);

  menu.innerHTML = `
    <div class="msg-menu-backdrop"></div>
    <div class="msg-menu-content" style="left: ${left}px; top: ${top}px;">
      <button class="msg-menu-item" data-action="mute">
        <span>${isMuted ? '🔔' : '🔕'}</span> <span>${isMuted ? 'إلغاء الكتم' : 'كتم المحادثة'}</span>
      </button>
      ${canManage ? `
        <button class="msg-menu-item" data-action="manage">
          <span>⚙️</span> <span>إعدادات المجموعة</span>
        </button>
      ` : ''}
      <button class="msg-menu-item cancel" data-action="cancel">
        <span>✕</span> <span>إلغاء</span>
      </button>
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('.msg-menu-backdrop').onclick = closeChatActionsMenu;

  menu.querySelectorAll('.msg-menu-item').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      closeChatActionsMenu();

      if (action === 'mute') window.toggleMuteChat(chatId);
      else if (action === 'manage') window.openGroupSettings(chatId);
    };
  });
}

function closeChatActionsMenu() {
  const menu = document.getElementById('chatActionsMenu');
  if (menu) menu.remove();
}

window.closeChatActionsMenu = closeChatActionsMenu;

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getChatDisplayName(chat) {
  if (chat.Name) return chat.Name;

  if (chat.Type === 'direct') {
    const otherId = (chat.Members || []).find(id => id !== chatPerson.id);
    const other = chatPeople[otherId];
    return other ? getPersonFullName(other) : 'محادثة محذوفة';
  }

  return 'بدون اسم';
}

function getChatAvatar(chat) {
  if (chat.Type === 'channel' || chat.IsDefault) {
    return chat.Name?.includes('📢') ? '📢' : '💬';
  }

  if (chat.Type === 'group') return '👥';

  if (chat.Type === 'direct') {
    const otherId = (chat.Members || []).find(id => id !== chatPerson.id);
    const other = chatPeople[otherId];
    if (other?.PhotoURL) return `<img src="${other.PhotoURL}" alt="" />`;
    return getInitial(other);
  }

  return '💬';
}

function canManageGroup(chat) {
  if (!chat) return false;
  if (!['group'].includes(chat.Type)) return false;

  const isOwnerOrAdmin = ['Owner', 'Admin'].includes(chatWorkspace);
  const isGroupAdmin = Array.isArray(chat.Admins) && chat.Admins.includes(chatPerson.id);

  return isOwnerOrAdmin || isGroupAdmin;
}

// ═══════════════════════════════════════════════════════
//   Mobile Helpers
// ═══════════════════════════════════════════════════════

function isMobile() {
  return window.innerWidth <= 768;
}

function showChatMobile() {
  const sidebar = document.getElementById('chatSidebar');
  const main = document.getElementById('chatMain');
  if (sidebar) sidebar.classList.add('hidden-mobile');
  if (main) main.classList.add('active-mobile');
}

function showSidebarMobile() {
  const sidebar = document.getElementById('chatSidebar');
  const main = document.getElementById('chatMain');
  if (sidebar) sidebar.classList.remove('hidden-mobile');
  if (main) main.classList.remove('active-mobile');
}

// ═══════════════════════════════════════════════════════
//   Open Chat
// ═══════════════════════════════════════════════════════

window.openChat = async function(chatId) {
  chatActiveChatId = chatId;

  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('active', item.dataset.chatId === chatId);
  });

  if (chatUnsubscribeMessages) {
    try { chatUnsubscribeMessages(); } catch (e) {}
    chatUnsubscribeMessages = null;
  }

  if (chatTypingUnsubscribe) {
    try { chatTypingUnsubscribe(); } catch (e) {}
    chatTypingUnsubscribe = null;
  }

  try {
    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    if (!chatDoc.exists()) {
      alert('❌ المحادثة غير موجودة');
      return;
    }

    chatActiveChat = { id: chatDoc.id, ...chatDoc.data() };
    window.cancelReply();
    chatTypingUsers = {};

    renderChatMain();
    startMessagesListener(chatId);
    startTypingListener(chatId);

    if (isMobile()) showChatMobile();

  } catch (err) {
    console.error('❌ openChat error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   ⚡ Typing Indicator
// ═══════════════════════════════════════════════════════

function startTypingListener(chatId) {
  try {
    const typingRef = collection(db, 'chats', chatId, 'typing');

    chatTypingUnsubscribe = onSnapshot(typingRef, (snap) => {
      const now = Date.now();
      chatTypingUsers = {};

      snap.docs.forEach(d => {
        const data = d.data();
        if (d.id === chatPerson.id) return;

        const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : 0;
        if (now - timestamp < TYPING_TIMEOUT_MS) {
          chatTypingUsers[d.id] = {
            name: data.name || 'مستخدم',
            timestamp: timestamp
          };
        }
      });

      updateTypingIndicator();
    }, (err) => {
      console.warn('⚠️ Typing listener error:', err.message);
    });
  } catch (err) {
    console.warn('⚠️ startTypingListener error:', err.message);
  }
}

function updateTypingIndicator() {
  const typingEl = document.getElementById('chatTypingIndicator');
  if (!typingEl) return;

  const userIds = Object.keys(chatTypingUsers);
  if (userIds.length === 0) {
    typingEl.style.display = 'none';
    typingEl.textContent = '';
    return;
  }

  const names = userIds.map(id => chatTypingUsers[id].name);

  let text = '';
  if (names.length === 1) {
    text = `${names[0]} بيكتب...`;
  } else if (names.length === 2) {
    text = `${names[0]} و ${names[1]} بيكتبوا...`;
  } else {
    text = `${names[0]} و ${names.length - 1} آخرين بيكتبوا...`;
  }

  typingEl.textContent = text;
  typingEl.style.display = 'block';
}

async function sendTypingIndicator() {
  if (!chatActiveChatId || !chatPerson) return;

  try {
    const typingRef = doc(db, 'chats', chatActiveChatId, 'typing', chatPerson.id);
    await setDoc(typingRef, {
      name: chatPerson.FirstName || 'مستخدم',
      personId: chatPerson.id,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn('⚠️ sendTypingIndicator error:', err.message);
  }
}

async function clearTypingIndicator() {
  if (!chatActiveChatId || !chatPerson) return;

  try {
    const typingRef = doc(db, 'chats', chatActiveChatId, 'typing', chatPerson.id);
    await deleteDoc(typingRef);
  } catch (err) {
    console.warn('⚠️ clearTypingIndicator error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Render Chat Main
// ═══════════════════════════════════════════════════════

function renderChatMain() {
  const main = document.getElementById('chatMain');
  if (!main || !chatActiveChat) return;

  const chat = chatActiveChat;
  const displayName = getChatDisplayName(chat);
  const isReadOnly = chat.ReadOnly && !['Owner', 'Admin'].includes(chatWorkspace);
  const isMuted = isChatMuted(chat.id);
  const canManage = canManageGroup(chat);

  let statusText = '';
  let statusClass = '';

  if (chat.Type === 'direct') {
    const otherId = (chat.Members || []).find(id => id !== chatPerson.id);
    if (otherId) {
      statusText = getOnlineStatusText(otherId);
      statusClass = isUserOnline(otherId) ? 'online' : 'offline';
    } else {
      statusText = 'محادثة فردية';
    }
  } else if (chat.Type === 'group') {
    statusText = `${(chat.Members || []).length} عضو`;
  } else if (chat.Description) {
    statusText = escapeHtml(chat.Description);
  }

  main.innerHTML = `
    <div class="chat-header">
      <button class="chat-back-btn" id="chatBackBtn" type="button" title="رجوع">←</button>
      <div class="chat-header-info">
        <div class="chat-header-avatar">${getChatAvatar(chat)}</div>
        <div class="chat-header-details">
          <div class="chat-header-name">${escapeHtml(displayName)}</div>
          <div class="chat-header-status ${statusClass}" id="chatHeaderStatus">${statusText}</div>
        </div>
      </div>
      <div class="chat-header-actions">
        <button class="chat-header-btn" id="chatMuteBtn" title="${isMuted ? 'إلغاء الكتم' : 'كتم'}">${isMuted ? '🔔' : '🔕'}</button>
        ${canManage ? `<button class="chat-header-btn" id="chatGroupSettingsBtn" title="إعدادات المجموعة">⚙️</button>` : ''}
      </div>
    </div>

    <div class="chat-messages" id="chatMessages">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>

    <div class="chat-typing-indicator" id="chatTypingIndicator" style="display:none;"></div>

    ${isReadOnly ? `
      <div class="chat-readonly">🔒 هذه القناة للقراءة فقط</div>
    ` : `
      <div class="chat-input-wrapper">
        <div class="chat-reply-preview" id="chatReplyPreview" style="display:none;">
          <div class="chat-reply-preview-bar"></div>
          <div class="chat-reply-preview-content">
            <div class="chat-reply-preview-name" id="chatReplyPreviewName">-</div>
            <div class="chat-reply-preview-text" id="chatReplyPreviewText">-</div>
          </div>
          <button class="chat-reply-preview-close" id="chatReplyPreviewClose" type="button" title="إلغاء">✕</button>
        </div>

        <div class="chat-mention-dropdown" id="chatMentionDropdown" style="display:none;"></div>

        <div class="chat-input-bar">
          <button class="chat-input-btn" id="chatImageBtn" type="button" title="صورة">📎</button>
          <button class="chat-input-btn" id="chatMentionBtn" type="button" title="إشارة @">@</button>
          <input type="text" id="chatInput" class="chat-input" placeholder="اكتب رسالة..." autocomplete="off" maxlength="${MAX_MESSAGE_LENGTH}" />
          <button class="chat-input-btn chat-send-btn" id="chatSendBtn" type="button" title="إرسال">📤</button>
        </div>
      </div>
    `}
  `;

  // ⚡ ربط الأزرار
  const backBtn = document.getElementById('chatBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSidebarMobile();
    });
  }

  const muteBtn = document.getElementById('chatMuteBtn');
  if (muteBtn) muteBtn.onclick = () => window.toggleMuteChat(chat.id);

  const groupSettingsBtn = document.getElementById('chatGroupSettingsBtn');
  if (groupSettingsBtn) groupSettingsBtn.onclick = () => window.openGroupSettings(chat.id);

  const imageBtn = document.getElementById('chatImageBtn');
  if (imageBtn) imageBtn.onclick = window.openChatImagePicker;

  const mentionBtn = document.getElementById('chatMentionBtn');
  if (mentionBtn) mentionBtn.onclick = () => window.showMentionDropdown(null);

  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.onclick = window.sendChatMessage;

  const replyCloseBtn = document.getElementById('chatReplyPreviewClose');
  if (replyCloseBtn) replyCloseBtn.onclick = () => window.cancelReply();

  // ⚡ input handlers
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (mentionDropdownActive) {
          e.preventDefault();
          selectMentionFromDropdown(0);
          return;
        }
        e.preventDefault();
        window.sendChatMessage();
      }

      // ⚡ Escape يغلق الـdropdown
      if (e.key === 'Escape' && mentionDropdownActive) {
        e.preventDefault();
        hideMentionDropdown();
      }
    });

    input.addEventListener('input', () => {
      sendTypingIndicator();
      handleMentionTyping(input);

      if (chatTypingTimeout) clearTimeout(chatTypingTimeout);
      chatTypingTimeout = setTimeout(() => {
        clearTypingIndicator();
      }, TYPING_TIMEOUT_MS);
    });

    setTimeout(() => input.focus(), 100);
  }

  updateTypingIndicator();
}

function updateChatHeaderMuteButton() {
  const btn = document.getElementById('chatMuteBtn');
  if (!btn || !chatActiveChatId) return;
  const isMuted = isChatMuted(chatActiveChatId);
  btn.textContent = isMuted ? '🔔' : '🔕';
  btn.title = isMuted ? 'إلغاء الكتم' : 'كتم';
}

// ═══════════════════════════════════════════════════════
//   Messages Listener
// ═══════════════════════════════════════════════════════

function startMessagesListener(chatId) {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('SentAt', 'asc'), limit(200));

  chatUnsubscribeMessages = onSnapshot(q, (snap) => {
    chatMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages();
    markMessagesAsRead();

    setTimeout(() => {
      const messagesEl = document.getElementById('chatMessages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 100);
  }, (err) => {
    console.warn('⚠️ Messages listener error:', err.message);
  });
}

async function markMessagesAsRead() {
  if (!chatActiveChatId || !chatPerson || !chatMessages.length) return;

  try {
    const unreadMessages = chatMessages.filter(msg => {
      if (msg.SenderID === chatPerson.id) return false;
      const readBy = Array.isArray(msg.ReadBy) ? msg.ReadBy : [];
      return !readBy.includes(chatPerson.id);
    });

    if (unreadMessages.length === 0) return;

    for (const msg of unreadMessages) {
      const msgRef = doc(db, 'chats', chatActiveChatId, 'messages', msg.id);
      await updateDoc(msgRef, {
        ReadBy: arrayUnion(chatPerson.id)
      });
    }
  } catch (err) {
    console.warn('⚠️ markMessagesAsRead error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Render Messages
// ═══════════════════════════════════════════════════════

function renderMessages() {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const visibleMessages = chatMessages.filter(msg => {
    const deletedFor = Array.isArray(msg.DeletedFor) ? msg.DeletedFor : [];
    return !deletedFor.includes(chatPerson.id);
  });

  if (visibleMessages.length === 0) {
    container.innerHTML = `
      <div class="chat-messages-empty">
        <div class="chat-messages-empty-icon">👋</div>
        <p>ابدأ المحادثة</p>
      </div>
    `;
    return;
  }

  container.innerHTML = visibleMessages.map(msg => renderMessageItem(msg)).join('');

  container.querySelectorAll('.chat-message').forEach(el => {
    if (el.classList.contains('chat-message-deleted')) return;

    const msgId = el.dataset.msgId;
    attachMessageActions(el);

    if (isMobile()) {
      setupSwipeToReply(el, msgId);
    }
  });

  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 50);
}

function renderMessageItem(msg) {
  const isMine = msg.SenderID === chatPerson.id;
  const sender = chatPeople[msg.SenderID];
  const senderName = msg.SenderName || getPersonFullName(sender) || 'غير معروف';
  const senderAvatar = getSenderAvatar(sender);
  const time = msg.SentAt ? formatTime(parseDate(msg.SentAt)) : '';

  if (msg.DeletedForEveryone) {
    return `
      <div class="chat-message ${isMine ? 'mine' : 'theirs'} chat-message-deleted">
        <div class="chat-message-bubble">
          <div class="chat-message-deleted-text">🚫 تم حذف هذه الرسالة</div>
          <div class="chat-message-time">${time}</div>
        </div>
      </div>
    `;
  }

  let contentHtml = '';
  if (msg.Type === 'image' && msg.ImageURL) {
    contentHtml = `
      <div class="chat-message-image">
        <img src="${escapeHtml(msg.ImageURL)}" alt="" loading="lazy" onclick="window.openChatImage('${escapeHtml(msg.ImageURL)}')" />
      </div>
    `;
  } else {
    contentHtml = `<div class="chat-message-text">${formatMessageText(msg.Text || '')}</div>`;
  }

  const editedBadge = msg.Edited ? '<span class="chat-edited-badge">✏️ تم التعديل</span>' : '';

  let replyHtml = '';
  if (msg.ReplyTo && msg.ReplyTo.MessageID) {
    const replyType = msg.ReplyTo.Type || 'text';
    const replyText = replyType === 'image'
      ? '📷 صورة'
      : (msg.ReplyTo.Text || '').substring(0, 60);

    replyHtml = `
      <div class="chat-message-reply" data-jump-to="${msg.ReplyTo.MessageID}">
        <div class="chat-message-reply-bar"></div>
        <div class="chat-message-reply-content">
          <div class="chat-message-reply-name">${escapeHtml(msg.ReplyTo.SenderName || '')}</div>
          <div class="chat-message-reply-text">${escapeHtml(replyText)}</div>
        </div>
      </div>
    `;
  }

  const showSender = !isMine && chatActiveChat && (chatActiveChat.Type === 'group' || chatActiveChat.Type === 'channel');

  // ⚡ Read Receipts
  let readReceiptHtml = '';
  if (isMine) {
    const readBy = Array.isArray(msg.ReadBy) ? msg.ReadBy : [];
    const totalMembers = chatActiveChat.Type === 'direct'
      ? 1
      : Math.max(1, (chatActiveChat.Members || []).length - 1);

    const readCount = readBy.filter(id => id !== chatPerson.id).length;

    if (readCount === 0) {
      readReceiptHtml = '<span class="chat-read-receipt sent" title="تم الإرسال">✓</span>';
    } else if (readCount >= totalMembers) {
      readReceiptHtml = '<span class="chat-read-receipt read" title="تم القراءة">✓✓</span>';
    } else {
      readReceiptHtml = `<span class="chat-read-receipt partial" title="${readCount} من ${totalMembers} قرأوا">✓✓</span>`;
    }
  }

  // ⚡ Mention check — لو فيه mention ليّ
  const hasMention = checkMentionsForMe(msg);

  return `
    <div class="chat-message ${isMine ? 'mine' : 'theirs'} ${hasMention ? 'mentioned' : ''}"
         data-msg-id="${msg.id}"
         data-msg-mine="${isMine ? '1' : '0'}"
         data-msg-type="${msg.Type || 'text'}">
      ${!isMine ? `<div class="chat-message-avatar">${senderAvatar}</div>` : ''}
      <div class="chat-message-bubble">
        ${showSender ? `<div class="chat-message-sender">${escapeHtml(senderName)}</div>` : ''}
        ${replyHtml}
        ${contentHtml}
        <div class="chat-message-meta">
          <span class="chat-message-time">${time}</span>
          ${editedBadge}
          ${readReceiptHtml}
        </div>
      </div>
    </div>
  `;
}

function getSenderAvatar(sender) {
  if (sender?.PhotoURL) return `<img src="${sender.PhotoURL}" alt="" />`;
  return getInitial(sender);
}

// ═══════════════════════════════════════════════════════
//   ⚡ Format Message Text (with mentions highlight)
// ═══════════════════════════════════════════════════════

function formatMessageText(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // ⚡ Highlight @mentions
  html = html.replace(/@([^\s@]+)/g, (match, name) => {
    return `<span class="chat-mention">${match}</span>`;
  });

  return html.replace(/\n/g, '<br>');
}

// ═══════════════════════════════════════════════════════
//   ⚡ Mentions — Logic
// ═══════════════════════════════════════════════════════

function checkMentionsForMe(msg) {
  if (!msg || !msg.Text || !chatPerson) return false;
  if (msg.SenderID === chatPerson.id) return false;

  // ⚡ لو فيه Mentions array
  if (Array.isArray(msg.Mentions) && msg.Mentions.includes(chatPerson.id)) {
    return true;
  }

  // ⚡ fallback — ابحث عن الاسم
  const myFirstName = chatPerson.FirstName || '';
  if (myFirstName && msg.Text.includes(`@${myFirstName}`)) {
    return true;
  }

  return false;
}

function handleMentionTyping(input) {
  const value = input.value;
  const cursorPos = input.selectionStart;

  // ⚡ ابحث عن آخر @ قبل الـcursor
  const beforeCursor = value.substring(0, cursorPos);
  const lastAt = beforeCursor.lastIndexOf('@');

  if (lastAt === -1) {
    hideMentionDropdown();
    return;
  }

  // ⚡ تحقق إن مفيش مسافة بين @ والـcursor
  const afterAt = beforeCursor.substring(lastAt + 1);
  if (afterAt.includes(' ') || afterAt.includes('\n')) {
    hideMentionDropdown();
    return;
  }

  mentionStartIndex = lastAt;
  showMentionDropdown(afterAt);
}

window.showMentionDropdown = function(searchTerm) {
  const dropdown = document.getElementById('chatMentionDropdown');
  if (!dropdown) return;

  // ⚡ فلتر الأعضاء
  let members = [];

  if (chatActiveChat.Type === 'direct') {
    // ⚡ في الـ1-to-1 — اذكر الطرف التاني بس
    const otherId = (chatActiveChat.Members || []).find(id => id !== chatPerson.id);
    if (otherId && chatPeople[otherId]) {
      members = [chatPeople[otherId]];
    }
  } else {
    // ⚡ في المجموعات — كل الأعضاء ما عداي
    const memberIds = (chatActiveChat.Members || []).filter(id => id !== chatPerson.id);
    members = memberIds.map(id => chatPeople[id]).filter(Boolean);
  }

  // ⚡ فلتر بالبحث
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    members = members.filter(p => {
      const fullName = getPersonFullName(p).toLowerCase();
      const firstName = (p.FirstName || '').toLowerCase();
      return fullName.includes(term) || firstName.includes(term);
    });
  }

  if (members.length === 0) {
    hideMentionDropdown();
    return;
  }

  mentionDropdownActive = true;

  dropdown.innerHTML = members.slice(0, 8).map((p, idx) => {
    const name = getPersonFullName(p);
    const avatar = p.PhotoURL
      ? `<img src="${p.PhotoURL}" alt="" />`
      : getInitial(p);

    return `
      <div class="chat-mention-item" data-person-id="${p.id}" data-person-name="${escapeHtml(p.FirstName || name)}" data-idx="${idx}">
        <div class="chat-mention-avatar">${avatar}</div>
        <div class="chat-mention-name">${escapeHtml(name)}</div>
      </div>
    `;
  }).join('');

  dropdown.style.display = 'block';

  // ⚡ ربط الـclick
  dropdown.querySelectorAll('.chat-mention-item').forEach(el => {
    el.onclick = () => {
      insertMention(el.dataset.personId, el.dataset.personName);
    };
  });
}

window.hideMentionDropdown = function() {
  const dropdown = document.getElementById('chatMentionDropdown');
  if (dropdown) dropdown.style.display = 'none';
  mentionDropdownActive = false;
  mentionStartIndex = -1;
}

function selectMentionFromDropdown(idx) {
  const dropdown = document.getElementById('chatMentionDropdown');
  if (!dropdown) return;

  const item = dropdown.querySelector(`.chat-mention-item[data-idx="${idx}"]`);
  if (item) {
    insertMention(item.dataset.personId, item.dataset.personName);
  }
}

window.insertMention = function(personId, personName) {
  const input = document.getElementById('chatInput');
  if (!input) return;

  const value = input.value;
  const beforeMention = value.substring(0, mentionStartIndex);
  const afterCursor = value.substring(input.selectionStart);

  const mentionText = `@${personName} `;
  const newValue = beforeMention + mentionText + afterCursor;

  input.value = newValue;
  const newCursorPos = beforeMention.length + mentionText.length;
  input.setSelectionRange(newCursorPos, newCursorPos);
  input.focus();

  hideMentionDropdown();
}

function extractMentionsFromText(text) {
  if (!text) return [];

  const mentions = [];
  const regex = /@([^\s@]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    // ⚡ ابحث عن الشخص بالاسم
    const person = chatPeopleArray.find(p => {
      const firstName = p.FirstName || '';
      const fullName = getPersonFullName(p);
      return firstName === name || fullName === name || fullName.startsWith(name + ' ');
    });

    if (person && !mentions.includes(person.id)) {
      mentions.push(person.id);
    }
  }

  return mentions;
}

// ═══════════════════════════════════════════════════════
//   Send Message
// ═══════════════════════════════════════════════════════

window.sendChatMessage = async function() {
  const input = document.getElementById('chatInput');
  if (!input || !chatActiveChatId) return;

  const text = input.value.trim();
  if (!text) return;

  if (text.length > MAX_MESSAGE_LENGTH) {
    alert(`الرسالة طويلة جدًا (الحد ${MAX_MESSAGE_LENGTH} حرف)`);
    return;
  }

  // ⚡ استخرج الـmentions
  const mentions = extractMentionsFromText(text);

  input.value = '';
  input.focus();

  if (chatTypingTimeout) clearTimeout(chatTypingTimeout);
  clearTypingIndicator();

  // ⚡ اخفي الـmention dropdown
  hideMentionDropdown();

  try {
    const messageData = {
      SenderID: chatPerson.id,
      SenderName: getPersonFullName(chatPerson),
      Type: 'text',
      Text: text,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    };

    // ⚡ أضف الـmentions لو موجودة
    if (mentions.length > 0) {
      messageData.Mentions = mentions;
    }

    if (chatReplyTo) {
      messageData.ReplyTo = {
        MessageID: chatReplyTo.MessageID,
        Text: chatReplyTo.Text,
        SenderName: chatReplyTo.SenderName,
        Type: chatReplyTo.Type || 'text'
      };
    }

    await addDoc(collection(db, 'chats', chatActiveChatId, 'messages'), messageData);

    await updateDoc(doc(db, 'chats', chatActiveChatId), {
      LastMessage: {
        Text: text,
        Type: 'text',
        SenderID: chatPerson.id,
        SenderName: getPersonFullName(chatPerson),
        SentAt: messageData.SentAt
      },
      LastMessageAt: messageData.SentAt
    });

    await sendChatNotification(chatActiveChat, messageData, mentions);

    window.cancelReply();

  } catch (err) {
    console.error('❌ sendChatMessage error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   Send Image
// ═══════════════════════════════════════════════════════

window.openChatImagePicker = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/jpg,image/png,image/webp';

  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE) {
      alert(`حجم الصورة أكبر من ${MAX_IMAGE_SIZE / 1024 / 1024} MB`);
      return;
    }

    await sendChatImage(file);
  };

  input.click();
};

async function sendChatImage(file) {
  if (!chatActiveChatId) return;

  const container = document.getElementById('chatMessages');
  if (container) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-uploading';
    loadingDiv.id = 'chatUploading';
    loadingDiv.innerHTML = '⏳ جاري رفع الصورة...';
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
  }

  try {
    if (typeof window.uploadPersonPhoto !== 'function') {
      throw new Error('خدمة الرفع غير متوفرة');
    }

    const result = await window.uploadPersonPhoto(file);

    const loadingEl = document.getElementById('chatUploading');
    if (loadingEl) loadingEl.remove();

    const messageData = {
      SenderID: chatPerson.id,
      SenderName: getPersonFullName(chatPerson),
      Type: 'image',
      ImageURL: result.url,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    };

    if (chatReplyTo) {
      messageData.ReplyTo = {
        MessageID: chatReplyTo.MessageID,
        Text: chatReplyTo.Text,
        SenderName: chatReplyTo.SenderName,
        Type: chatReplyTo.Type || 'text'
      };
    }

    await addDoc(collection(db, 'chats', chatActiveChatId, 'messages'), messageData);

    await updateDoc(doc(db, 'chats', chatActiveChatId), {
      LastMessage: {
        Text: '📷 صورة',
        Type: 'image',
        SenderID: chatPerson.id,
        SenderName: getPersonFullName(chatPerson),
        SentAt: messageData.SentAt
      },
      LastMessageAt: messageData.SentAt
    });

    await sendChatNotification(chatActiveChat, messageData, []);

    window.cancelReply();

  } catch (err) {
    console.error('❌ sendChatImage error:', err);
    const loadingEl = document.getElementById('chatUploading');
    if (loadingEl) loadingEl.remove();
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Open Chat Image
// ═══════════════════════════════════════════════════════

window.openChatImage = function(url) {
  let modal = document.getElementById('chatImageModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'chatImageModal';
    modal.className = 'chat-image-modal';
    modal.onclick = () => modal.style.display = 'none';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<img src="${url}" alt="" />`;
  modal.style.display = 'flex';
};

// ═══════════════════════════════════════════════════════
//   Reply System
// ═══════════════════════════════════════════════════════

window.startReply = function(msgId) {
  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  if (msg.DeletedForEveryone) {
    showToast('⚠️ لا يمكن الرد على رسالة محذوفة');
    return;
  }

  const sender = chatPeople[msg.SenderID];
  const senderName = msg.SenderID === chatPerson.id
    ? 'أنت'
    : (msg.SenderName || getPersonFullName(sender) || 'غير معروف');

  const replyText = msg.Type === 'image'
    ? '📷 صورة'
    : (msg.Text || '').substring(0, 100);

  chatReplyTo = {
    MessageID: msg.id,
    Text: replyText,
    SenderName: senderName,
    Type: msg.Type || 'text'
  };

  showReplyPreview();

  const input = document.getElementById('chatInput');
  if (input) input.focus();
};

function showReplyPreview() {
  const preview = document.getElementById('chatReplyPreview');
  const nameEl = document.getElementById('chatReplyPreviewName');
  const textEl = document.getElementById('chatReplyPreviewText');

  if (!preview || !chatReplyTo) return;

  if (nameEl) nameEl.textContent = chatReplyTo.SenderName;
  if (textEl) textEl.textContent = chatReplyTo.Text;
  preview.style.display = 'flex';
}

window.cancelReply = function() {
  chatReplyTo = null;

  const preview = document.getElementById('chatReplyPreview');
  if (preview) preview.style.display = 'none';
};

window.jumpToMessage = function(msgId) {
  const targetEl = document.querySelector(`.chat-message[data-msg-id="${msgId}"]`);
  if (!targetEl) {
    showToast('⚠️ الرسالة الأصلية غير متوفرة');
    return;
  }

  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  targetEl.classList.add('chat-message-highlight');
  setTimeout(() => {
    targetEl.classList.remove('chat-message-highlight');
  }, 1500);
};

// ═══════════════════════════════════════════════════════
//   Message Actions (Long Press / Right Click)
// ═══════════════════════════════════════════════════════

function attachMessageActions(el) {
  const msgId = el.dataset.msgId;
  const isMine = el.dataset.msgMine === '1';
  const msgType = el.dataset.msgType;

  el.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => {
      e.preventDefault();
      showMessageActionsMenu(msgId, isMine, msgType, e.touches[0].clientX, e.touches[0].clientY);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  }, { passive: true });

  el.addEventListener('touchend', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  el.addEventListener('touchmove', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMessageActionsMenu(msgId, isMine, msgType, e.clientX, e.clientY);
  });

  const replyEl = el.querySelector('.chat-message-reply');
  if (replyEl) {
    replyEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = replyEl.dataset.jumpTo;
      if (targetId) window.jumpToMessage(targetId);
    });
  }
}

function showMessageActionsMenu(msgId, isMine, msgType, x, y) {
  closeMessageActionsMenu();

  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  const now = Date.now();
  const sentAt = msg.SentAt ? new Date(msg.SentAt).getTime() : 0;
  const minutesSinceSent = (now - sentAt) / 60000;

  const isAdminOrOwner = ['Owner', 'Admin'].includes(chatWorkspace);

  const canReply = !msg.DeletedForEveryone;
  const canEdit = isMine && msgType === 'text' && minutesSinceSent < 60 && !msg.DeletedForEveryone;
  const canCopy = msgType === 'text' && !msg.DeletedForEveryone;
  const canDeleteForEveryone =
    !msg.DeletedForEveryone &&
    (isAdminOrOwner || (isMine && minutesSinceSent < 60));

  const menu = document.createElement('div');
  menu.id = 'messageActionsMenu';
  menu.className = 'message-actions-menu';

  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 300);

  menu.innerHTML = `
    <div class="msg-menu-backdrop"></div>
    <div class="msg-menu-content" style="left: ${left}px; top: ${top}px;">
      ${canReply ? `
        <button class="msg-menu-item" data-action="reply">
          <span>↩️</span> <span>رد</span>
        </button>
      ` : ''}
      ${canCopy ? `
        <button class="msg-menu-item" data-action="copy">
          <span>📋</span> <span>نسخ</span>
        </button>
      ` : ''}
      ${canEdit ? `
        <button class="msg-menu-item" data-action="edit">
          <span>✏️</span> <span>تعديل</span>
        </button>
      ` : ''}
      <button class="msg-menu-item" data-action="delete-me">
        <span>🗑️</span> <span>حذف ليّ</span>
      </button>
      ${canDeleteForEveryone ? `
        <button class="msg-menu-item danger" data-action="delete-all">
          <span>🗑️</span> <span>حذف للجميع</span>
        </button>
      ` : ''}
      <button class="msg-menu-item cancel" data-action="cancel">
        <span>✕</span> <span>إلغاء</span>
      </button>
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('.msg-menu-backdrop').onclick = closeMessageActionsMenu;

  menu.querySelectorAll('.msg-menu-item').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      closeMessageActionsMenu();

      if (action === 'reply') window.startReply(msgId);
      else if (action === 'edit') editMessage(msgId);
      else if (action === 'copy') copyMessageText(msg.Text);
      else if (action === 'delete-me') deleteMessageForMe(msgId);
      else if (action === 'delete-all') deleteMessageForEveryone(msgId);
    };
  });
}

function closeMessageActionsMenu() {
  const menu = document.getElementById('messageActionsMenu');
  if (menu) menu.remove();
}

window.closeMessageActionsMenu = closeMessageActionsMenu;

// ═══════════════════════════════════════════════════════
//   Copy / Toast
// ═══════════════════════════════════════════════════════

function copyMessageText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 تم النسخ');
  }).catch(() => {
    alert('فشل النسخ');
  });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

window.showChatToast = showToast;

// ═══════════════════════════════════════════════════════
//   Edit Message
// ═══════════════════════════════════════════════════════

function editMessage(msgId) {
  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  const newText = prompt('✏️ تعديل الرسالة:', msg.Text || '');
  if (newText === null) return;
  if (!newText.trim()) {
    alert('⚠️ الرسالة لا يمكن أن تكون فارغة');
    return;
  }
  if (newText === msg.Text) return;

  updateDoc(doc(db, 'chats', chatActiveChatId, 'messages', msgId), {
    Text: newText.trim(),
    Edited: true,
    EditedAt: new Date().toISOString()
  }).then(() => {
    showToast('✏️ تم التعديل');
  }).catch(err => {
    console.error('❌ Edit error:', err);
    alert('❌ فشل التعديل: ' + err.message);
  });
}

// ═══════════════════════════════════════════════════════
//   Delete Message
// ═══════════════════════════════════════════════════════

async function deleteMessageForMe(msgId) {
  if (!confirm('🗑️ حذف الرسالة ليّ فقط؟\n(هتختفي عندك بس، الآخر هيفضل شايفها)')) return;

  try {
    const msgRef = doc(db, 'chats', chatActiveChatId, 'messages', msgId);
    await updateDoc(msgRef, {
      DeletedFor: arrayUnion(chatPerson.id)
    });
    showToast('🗑️ تم الحذف ليّ');
  } catch (err) {
    console.error('❌ Delete-for-me error:', err);
    alert('❌ فشل الحذف: ' + err.message);
  }
}

async function deleteMessageForEveryone(msgId) {
  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  const isAdminOrOwner = ['Owner', 'Admin'].includes(chatWorkspace);
  const isMine = msg.SenderID === chatPerson.id;

  if (!isAdminOrOwner && !isMine) {
    alert('⚠️ لا يمكنك حذف رسائل الآخرين');
    return;
  }

  const confirmMsg = isAdminOrOwner && !isMine
    ? `🗑️ حذف رسالة "${msg.SenderName || 'مستخدم'}" للجميع؟\n(هتختفي عند الكل — لا يمكن التراجع)`
    : '🗑️ حذف الرسالة للجميع؟\n(هتختفي عند الكل — لا يمكن التراجع)';

  if (!confirm(confirmMsg)) return;

  try {
    const msgRef = doc(db, 'chats', chatActiveChatId, 'messages', msgId);
    await updateDoc(msgRef, {
      DeletedForEveryone: true,
      DeletedAt: new Date().toISOString(),
      DeletedBy: chatPerson.id,
      DeletedByName: getPersonFullName(chatPerson),
      DeletedByAdmin: isAdminOrOwner && !isMine,
      Text: '',
      ImageURL: ''
    });
    showToast('🗑️ تم الحذف للجميع');
  } catch (err) {
    console.error('❌ Delete-for-everyone error:', err);
    alert('❌ فشل الحذف: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Swipe to Reply
// ═══════════════════════════════════════════════════════

function setupSwipeToReply(el, msgId) {
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;
  const threshold = 60;

  const bubble = el.querySelector('.chat-message-bubble');
  if (!bubble) return;

  const oldIcon = el.querySelector('.chat-swipe-reply-icon');
  if (oldIcon) oldIcon.remove();

  const replyIcon = document.createElement('div');
  replyIcon.className = 'chat-swipe-reply-icon';
  replyIcon.innerHTML = '↩️';
  el.appendChild(replyIcon);

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    currentX = startX;
    isSwiping = true;
    bubble.style.transition = 'none';
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!isSwiping || e.touches.length !== 1) return;

    currentX = e.touches[0].clientX;
    const diff = currentX - startX;

    if (diff > 0 && diff < 100) {
      bubble.style.transform = `translateX(${diff}px)`;

      const opacity = Math.min(diff / threshold, 1);
      replyIcon.style.opacity = opacity;
      replyIcon.style.transform = `translateY(-50%) scale(${0.5 + opacity * 0.5})`;
    }
  }, { passive: true });

  el.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;

    const diff = currentX - startX;
    bubble.style.transition = 'transform 0.2s ease-out';
    bubble.style.transform = 'translateX(0)';
    replyIcon.style.opacity = '0';

    if (diff >= threshold) {
      if (navigator.vibrate) navigator.vibrate(30);
      window.startReply(msgId);
    }
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════
//   New Chat Modal
// ═══════════════════════════════════════════════════════

window.openNewChatModal = function() {
  let modal = document.getElementById('newChatModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'newChatModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const activePeople = chatPeopleArray
    .filter(p => p.id !== chatPerson.id)
    .sort((a, b) => getPersonFullName(a).localeCompare(getPersonFullName(b), 'ar'));

  modal.innerHTML = `
    <div class="modal-content" style="max-width:500px;max-height:80vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>✏️ محادثة جديدة</h2>
        <button class="modal-close" id="closeNewChatBtn">✕</button>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;">
        <div class="form-row">
          <input type="text" id="newChatSearch" placeholder="🔍 ابحث عن شخص..." class="chat-new-search" />
        </div>
        <div class="new-chat-people" id="newChatPeople">
          ${activePeople.map(p => renderNewChatPerson(p)).join('')}
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  document.getElementById('closeNewChatBtn').onclick = () => modal.style.display = 'none';

  const searchInput = document.getElementById('newChatSearch');
  searchInput.oninput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    const list = document.getElementById('newChatPeople');

    const filtered = activePeople.filter(p => getPersonFullName(p).toLowerCase().includes(term));

    list.innerHTML = filtered.map(p => renderNewChatPerson(p)).join('') ||
      '<p style="text-align:center;color:#94a3b8;padding:20px;">لا يوجد نتائج</p>';

    list.querySelectorAll('.new-chat-person').forEach(el => {
      el.onclick = () => window.startDirectChat(el.dataset.personId);
    });
  };

  modal.querySelectorAll('.new-chat-person').forEach(el => {
    el.onclick = () => window.startDirectChat(el.dataset.personId);
  });

  setTimeout(() => searchInput.focus(), 100);
};

function renderNewChatPerson(p) {
  const name = getPersonFullName(p);
  const avatar = p.PhotoURL ? `<img src="${p.PhotoURL}" alt="" />` : getInitial(p);
  const isOnline = isUserOnline(p.id);

  return `
    <div class="new-chat-person" data-person-id="${p.id}">
      <div class="new-chat-avatar">
        ${avatar}
        ${isOnline ? '<span class="chat-online-dot"></span>' : ''}
      </div>
      <div class="new-chat-info">
        <div class="new-chat-name">${escapeHtml(name)}</div>
        <div class="new-chat-email">${escapeHtml(p.Email || '')}</div>
      </div>
    </div>
  `;
}

window.closeNewChatModal = function() {
  const modal = document.getElementById('newChatModal');
  if (modal) modal.style.display = 'none';
};

window.startDirectChat = async function(otherPersonId) {
  if (!otherPersonId || otherPersonId === chatPerson.id) return;

  window.closeNewChatModal();

  try {
    const existing = chatConversations.find(c =>
      c.Type === 'direct' &&
      (c.Members || []).includes(chatPerson.id) &&
      (c.Members || []).includes(otherPersonId)
    );

    if (existing) {
      window.openChat(existing.id);
      return;
    }

    const chatData = {
      Type: 'direct',
      Members: [chatPerson.id, otherPersonId],
      Admins: [],
      CreatedBy: chatPerson.id,
      CreatedAt: new Date().toISOString(),
      LastMessage: null,
      LastMessageAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'chats'), chatData);

    setTimeout(() => window.openChat(docRef.id), 500);

  } catch (err) {
    console.error('❌ startDirectChat error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   New Group Modal
// ═══════════════════════════════════════════════════════

window.openNewGroupModal = function() {
  if (!['Owner', 'Admin'].includes(chatWorkspace)) {
    alert('⚠️ غير مصرح لك بإنشاء مجموعات');
    return;
  }

  let modal = document.getElementById('newGroupModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'newGroupModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const activePeople = chatPeopleArray.filter(p => p.id !== chatPerson.id);

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;max-height:85vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>👥 مجموعة جديدة</h2>
        <button class="modal-close" id="closeNewGroupBtn">✕</button>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;">
        <div class="form-row">
          <label>اسم المجموعة *</label>
          <input type="text" id="newGroupName" placeholder="مثال: فريق الشباب" />
        </div>
        <div class="form-row">
          <label>الوصف (اختياري)</label>
          <input type="text" id="newGroupDesc" placeholder="وصف مختصر" />
        </div>
        <div class="form-row">
          <label>الأعضاء *</label>
          <input type="text" id="newGroupSearch" placeholder="🔍 ابحث..." />
          <div class="new-group-people" id="newGroupPeople">
            ${activePeople.map(p => renderNewGroupPerson(p)).join('')}
          </div>
        </div>
        <p class="hint" id="newGroupCount">0 شخص محدد</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancelNewGroupBtn">إلغاء</button>
        <button class="btn-primary" id="createGroupBtn">👥 إنشاء</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  document.getElementById('closeNewGroupBtn').onclick = () => modal.style.display = 'none';
  document.getElementById('cancelNewGroupBtn').onclick = () => modal.style.display = 'none';
  document.getElementById('createGroupBtn').onclick = window.createGroup;

  const searchInput = document.getElementById('newGroupSearch');
  searchInput.oninput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    const list = document.getElementById('newGroupPeople');

    const filtered = activePeople.filter(p => getPersonFullName(p).toLowerCase().includes(term));

    list.innerHTML = filtered.map(p => renderNewGroupPerson(p)).join('') ||
      '<p style="text-align:center;color:#94a3b8;padding:20px;">لا يوجد نتائج</p>';

    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateGroupCount);
    });
  };

  setTimeout(() => {
    document.querySelectorAll('#newGroupPeople input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateGroupCount);
    });
  }, 100);
};

function renderNewGroupPerson(p) {
  const name = getPersonFullName(p);
  const avatar = p.PhotoURL ? `<img src="${p.PhotoURL}" alt="" />` : getInitial(p);

  return `
    <label class="new-group-person">
      <input type="checkbox" value="${p.id}" />
      <div class="new-chat-avatar">${avatar}</div>
      <div class="new-chat-info">
        <div class="new-chat-name">${escapeHtml(name)}</div>
        <div class="new-chat-email">${escapeHtml(p.Email || '')}</div>
      </div>
    </label>
  `;
}

function updateGroupCount() {
  const count = document.querySelectorAll('#newGroupPeople input[type="checkbox"]:checked').length;
  const el = document.getElementById('newGroupCount');
  if (el) el.textContent = `${count} شخص محدد`;
}

window.closeNewGroupModal = function() {
  const modal = document.getElementById('newGroupModal');
  if (modal) modal.style.display = 'none';
};

window.createGroup = async function() {
  const name = document.getElementById('newGroupName')?.value.trim();
  const description = document.getElementById('newGroupDesc')?.value.trim() || '';

  if (!name) {
    alert('⚠️ اسم المجموعة مطلوب');
    return;
  }

  const selected = Array.from(document.querySelectorAll('#newGroupPeople input[type="checkbox"]:checked'))
    .map(cb => cb.value);

  if (selected.length === 0) {
    alert('⚠️ اختر عضو واحد على الأقل');
    return;
  }

  try {
    const members = [chatPerson.id, ...selected];

    const chatData = {
      Type: 'group',
      Name: name,
      Description: description,
      Members: members,
      Admins: [chatPerson.id],
      CreatedBy: chatPerson.id,
      CreatedAt: new Date().toISOString(),
      LastMessage: null,
      LastMessageAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'chats'), chatData);

    window.closeNewGroupModal();
    setTimeout(() => window.openChat(docRef.id), 500);

  } catch (err) {
    console.error('❌ createGroup error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   ⚡ Group Settings Modal (المرحلة 2 جديد)
// ═══════════════════════════════════════════════════════

window.openGroupSettings = async function(chatId) {
  const chat = chatConversations.find(c => c.id === chatId);
  if (!chat) {
    alert('❌ المجموعة غير موجودة');
    return;
  }

  if (!canManageGroup(chat)) {
    alert('⚠️ غير مصرح لك بإدارة هذه المجموعة');
    return;
  }

  let modal = document.getElementById('groupSettingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupSettingsModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  renderGroupSettingsModal(modal, chat);
  modal.style.display = 'flex';
};

function renderGroupSettingsModal(modal, chat) {
  const members = (chat.Members || []).map(id => chatPeople[id]).filter(Boolean);
  const admins = Array.isArray(chat.Admins) ? chat.Admins : [];
  const isOwnerOrAdmin = ['Owner', 'Admin'].includes(chatWorkspace);

  modal.innerHTML = `
    <div class="modal-content" style="max-width:600px;max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>⚙️ إعدادات المجموعة</h2>
        <button class="modal-close" id="closeGroupSettingsBtn">✕</button>
      </div>

      <div class="modal-body" style="flex:1;overflow-y:auto;">

        <!-- ═══ معلومات المجموعة ═══ -->
        <div class="group-settings-section">
          <h3 class="group-settings-title">📋 معلومات المجموعة</h3>

          <div class="form-row">
            <label>اسم المجموعة</label>
            <input type="text" id="gsGroupName" value="${escapeHtml(chat.Name || '')}" />
          </div>

          <div class="form-row">
            <label>الوصف</label>
            <input type="text" id="gsGroupDesc" value="${escapeHtml(chat.Description || '')}" placeholder="وصف مختصر" />
          </div>

          <button class="btn-primary" id="gsSaveInfoBtn" style="margin-top:8px;">💾 حفظ المعلومات</button>
        </div>

        <!-- ═══ إضافة أعضاء ═══ -->
        <div class="group-settings-section">
          <h3 class="group-settings-title">➕ إضافة أعضاء</h3>

          <div class="form-row">
            <input type="text" id="gsAddSearch" placeholder="🔍 ابحث..." class="chat-new-search" />
          </div>

          <div class="group-settings-list" id="gsAddList"></div>
        </div>

        <!-- ═══ الأعضاء الحاليين ═══ -->
        <div class="group-settings-section">
          <h3 class="group-settings-title">👥 الأعضاء (${members.length})</h3>

          <div class="group-settings-list">
            ${members.map(m => {
              const isAdmin = admins.includes(m.id);
              const isMe = m.id === chatPerson.id;
              const isCreator = m.id === chat.CreatedBy;

              const name = getPersonFullName(m);
              const avatar = m.PhotoURL
                ? `<img src="${m.PhotoURL}" alt="" />`
                : getInitial(m);

              return `
                <div class="group-member-item" data-member-id="${m.id}">
                  <div class="group-member-avatar">${avatar}</div>
                  <div class="group-member-info">
                    <div class="group-member-name">
                      ${escapeHtml(name)}
                      ${isMe ? '<span class="group-member-badge me">أنت</span>' : ''}
                      ${isCreator ? '<span class="group-member-badge creator">👑 منشئ</span>' : ''}
                      ${isAdmin && !isCreator ? '<span class="group-member-badge admin">⭐ أدمن</span>' : ''}
                    </div>
                    <div class="group-member-email">${escapeHtml(m.Email || '')}</div>
                  </div>
                  <div class="group-member-actions">
                    ${isOwnerOrAdmin && !isMe && !isCreator ? `
                      ${!isAdmin ? `
                        <button class="btn-icon" data-action="promote" data-member="${m.id}" title="ترقية لأدمن">⭐</button>
                      ` : `
                        <button class="btn-icon" data-action="demote" data-member="${m.id}" title="إزالة الأدمن">↓</button>
                      `}
                      <button class="btn-icon danger" data-action="remove" data-member="${m.id}" title="إزالة من المجموعة">🗑️</button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- ═══ Danger Zone ═══ -->
        ${isOwnerOrAdmin ? `
          <div class="group-settings-section group-danger-section">
            <h3 class="group-settings-title">⚠️ منطقة الخطر</h3>
            <button class="btn-danger" id="gsLeaveBtn">🚪 ${isOwnerOrAdmin ? 'مغادرة المجموعة' : 'مغادرة'}</button>
          </div>
        ` : `
          <div class="group-settings-section group-danger-section">
            <h3 class="group-settings-title">⚠️ منطقة الخطر</h3>
            <button class="btn-danger" id="gsLeaveBtn">🚪 مغادرة المجموعة</button>
          </div>
        `}

      </div>
    </div>
  `;

  // ═══ ربط الأحداث ═══

  document.getElementById('closeGroupSettingsBtn').onclick = () => {
    modal.style.display = 'none';
  };

  // ⚡ حفظ معلومات المجموعة
  document.getElementById('gsSaveInfoBtn').onclick = () => saveGroupInfo(chat.id);

  // ⚡ إضافة أعضاء — search
  const addSearch = document.getElementById('gsAddSearch');
  renderAddMembersList(chat);

  addSearch.oninput = (e) => {
    renderAddMembersList(chat, e.target.value);
  };

  // ⚡ إجراءات الأعضاء
  modal.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.action;
      const memberId = btn.dataset.member;

      if (action === 'promote') await promoteToAdmin(chat.id, memberId);
      else if (action === 'demote') await demoteFromAdmin(chat.id, memberId);
      else if (action === 'remove') await removeFromGroup(chat.id, memberId);
    };
  });

  // ⚡ زر إضافة الأعضاء
  modal.querySelectorAll('[data-add-member]').forEach(btn => {
    btn.onclick = async () => {
      const memberId = btn.dataset.addMember;
      await addToGroup(chat.id, memberId);
    };
  });

  // ⚡ زر المغادرة
  const leaveBtn = document.getElementById('gsLeaveBtn');
  if (leaveBtn) {
    leaveBtn.onclick = () => leaveGroup(chat.id);
  }
}

function renderAddMembersList(chat, searchTerm = '') {
  const container = document.getElementById('gsAddList');
  if (!container) return;

  const currentMembers = Array.isArray(chat.Members) ? chat.Members : [];

  // ⚡ فلتر الأشخاص اللي مش في المجموعة
  let available = chatPeopleArray.filter(p => !currentMembers.includes(p.id));

  if (searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    available = available.filter(p => getPersonFullName(p).toLowerCase().includes(term));
  }

  if (available.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">لا يوجد أشخاص متاحين للإضافة</p>';
    return;
  }

  container.innerHTML = available.slice(0, 20).map(p => {
    const name = getPersonFullName(p);
    const avatar = p.PhotoURL
      ? `<img src="${p.PhotoURL}" alt="" />`
      : getInitial(p);

    return `
      <div class="group-member-item">
        <div class="group-member-avatar">${avatar}</div>
        <div class="group-member-info">
          <div class="group-member-name">${escapeHtml(name)}</div>
          <div class="group-member-email">${escapeHtml(p.Email || '')}</div>
        </div>
        <div class="group-member-actions">
          <button class="btn-primary btn-small" data-add-member="${p.id}">➕ إضافة</button>
        </div>
      </div>
    `;
  }).join('');

  // ⚡ ربط أزرار الإضافة
  container.querySelectorAll('[data-add-member]').forEach(btn => {
    btn.onclick = async () => {
      await addToGroup(chat.id, btn.dataset.addMember);
    };
  });
}

// ═══════════════════════════════════════════════════════
//   ⚡ Group Actions
// ═══════════════════════════════════════════════════════

async function saveGroupInfo(chatId) {
  const name = document.getElementById('gsGroupName')?.value.trim();
  const description = document.getElementById('gsGroupDesc')?.value.trim() || '';

  if (!name) {
    alert('⚠️ اسم المجموعة مطلوب');
    return;
  }

  try {
    await updateDoc(doc(db, 'chats', chatId), {
      Name: name,
      Description: description,
      UpdatedAt: new Date().toISOString()
    });

    showToast('✅ تم حفظ المعلومات');

    // ⚡ حدّث الـheader
    if (chatActiveChatId === chatId) {
      const chatDoc = await getDoc(doc(db, 'chats', chatId));
      if (chatDoc.exists()) {
        chatActiveChat = { id: chatDoc.id, ...chatDoc.data() };
        renderChatMain();
        startMessagesListener(chatId);
        startTypingListener(chatId);
      }
    }
  } catch (err) {
    console.error('❌ saveGroupInfo error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function addToGroup(chatId, memberId) {
  if (!memberId) return;

  try {
    const chatRef = doc(db, 'chats', chatId);
    await updateDoc(chatRef, {
      Members: arrayUnion(memberId),
      UpdatedAt: new Date().toISOString()
    });

    // ⚡ أضف رسالة نظام
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      SenderID: 'system',
      SenderName: 'النظام',
      Type: 'system',
      Text: `➕ تم إضافة ${getPersonFullName(chatPeople[memberId])} للمجموعة`,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    });

    showToast('✅ تم الإضافة للمجموعة');

    // ⚡ أعد فتح الإعدادات
    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    if (chatDoc.exists()) {
      const chat = { id: chatDoc.id, ...chatDoc.data() };
      const modal = document.getElementById('groupSettingsModal');
      if (modal && modal.style.display === 'flex') {
        renderGroupSettingsModal(modal, chat);
      }

      // ⚡ حدّث الشات النشط
      if (chatActiveChatId === chatId) {
        chatActiveChat = chat;
        renderChatMain();
        startMessagesListener(chatId);
        startTypingListener(chatId);
      }
    }
  } catch (err) {
    console.error('❌ addToGroup error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function removeFromGroup(chatId, memberId) {
  const member = chatPeople[memberId];
  const name = member ? getPersonFullName(member) : 'العضو';

  if (!confirm(`⚠️ إزالة "${name}" من المجموعة؟`)) return;

  try {
    const chatRef = doc(db, 'chats', chatId);
    await updateDoc(chatRef, {
      Members: arrayRemove(memberId),
      Admins: arrayRemove(memberId),
      UpdatedAt: new Date().toISOString()
    });

    // ⚡ أضف رسالة نظام
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      SenderID: 'system',
      SenderName: 'النظام',
      Type: 'system',
      Text: `➖ تم إزالة ${name} من المجموعة`,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    });

    showToast('✅ تم الإزالة');

    // ⚡ أعد فتح الإعدادات
    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    if (chatDoc.exists()) {
      const chat = { id: chatDoc.id, ...chatDoc.data() };
      const modal = document.getElementById('groupSettingsModal');
      if (modal && modal.style.display === 'flex') {
        renderGroupSettingsModal(modal, chat);
      }

      if (chatActiveChatId === chatId) {
        chatActiveChat = chat;
        renderChatMain();
        startMessagesListener(chatId);
        startTypingListener(chatId);
      }
    }
  } catch (err) {
    console.error('❌ removeFromGroup error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function promoteToAdmin(chatId, memberId) {
  const member = chatPeople[memberId];
  const name = member ? getPersonFullName(member) : 'العضو';

  if (!confirm(`⭐ ترقية "${name}" لـ Admin؟`)) return;

  try {
    const chatRef = doc(db, 'chats', chatId);
    await updateDoc(chatRef, {
      Admins: arrayUnion(memberId),
      UpdatedAt: new Date().toISOString()
    });

    // ⚡ رسالة نظام
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      SenderID: 'system',
      SenderName: 'النظام',
      Type: 'system',
      Text: `⭐ تم ترقية ${name} لـ Admin`,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    });

    showToast('⭐ تمت الترقية');

    // ⚡ أعد فتح الإعدادات
    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    if (chatDoc.exists()) {
      const chat = { id: chatDoc.id, ...chatDoc.data() };
      const modal = document.getElementById('groupSettingsModal');
      if (modal && modal.style.display === 'flex') {
        renderGroupSettingsModal(modal, chat);
      }
    }
  } catch (err) {
    console.error('❌ promoteToAdmin error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function demoteFromAdmin(chatId, memberId) {
  const member = chatPeople[memberId];
  const name = member ? getPersonFullName(member) : 'العضو';

  if (!confirm(`↓ إزالة "${name}" من Admins؟`)) return;

  try {
    const chatRef = doc(db, 'chats', chatId);
    await updateDoc(chatRef, {
      Admins: arrayRemove(memberId),
      UpdatedAt: new Date().toISOString()
    });

    // ⚡ رسالة نظام
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      SenderID: 'system',
      SenderName: 'النظام',
      Type: 'system',
      Text: `↓ تم إزالة ${name} من Admins`,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    });

    showToast('✅ تمت الإزالة');

    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    if (chatDoc.exists()) {
      const chat = { id: chatDoc.id, ...chatDoc.data() };
      const modal = document.getElementById('groupSettingsModal');
      if (modal && modal.style.display === 'flex') {
        renderGroupSettingsModal(modal, chat);
      }
    }
  } catch (err) {
    console.error('❌ demoteFromAdmin error:', err);
    alert('خطأ: ' + err.message);
  }
}

async function leaveGroup(chatId) {
  if (!confirm('⚠️ هل أنت متأكد من مغادرة المجموعة؟\n(لن تستقبل رسائل منها بعد الآن)')) return;

  try {
    const chatRef = doc(db, 'chats', chatId);

    await updateDoc(chatRef, {
      Members: arrayRemove(chatPerson.id),
      Admins: arrayRemove(chatPerson.id),
      UpdatedAt: new Date().toISOString()
    });

    // ⚡ رسالة نظام
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      SenderID: 'system',
      SenderName: 'النظام',
      Type: 'system',
      Text: `🚪 ${getPersonFullName(chatPerson)} غادر المجموعة`,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    });

    // ⚡ اقفل المودال والـchat
    const modal = document.getElementById('groupSettingsModal');
    if (modal) modal.style.display = 'none';

    if (chatActiveChatId === chatId) {
      chatActiveChatId = null;
      chatActiveChat = null;
      if (chatUnsubscribeMessages) {
        try { chatUnsubscribeMessages(); } catch (e) {}
      }
      if (chatTypingUnsubscribe) {
        try { chatTypingUnsubscribe(); } catch (e) {}
      }

      const main = document.getElementById('chatMain');
      if (main) {
        main.innerHTML = `
          <div class="chat-empty-state">
            <div class="chat-empty-icon">💬</div>
            <h3>اختر محادثة للبدء</h3>
          </div>
        `;
      }
    }

    showToast('🚪 تمت المغادرة');

  } catch (err) {
    console.error('❌ leaveGroup error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

function getPersonFullName(p) {
  if (!p) return '';
  return [p.FirstName, p.SecondName, p.ThirdName, p.FourthName].filter(Boolean).join(' ');
}

function getInitial(p) {
  if (!p) return '?';
  return (p.FirstName || '?').charAt(0).toUpperCase();
}

function parseDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(date) {
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} س`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ي`;
  return `${date.getDate()}/${date.getMonth() + 1}`;
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
//   Send Chat Notification (مع Mentions)
// ═══════════════════════════════════════════════════════

async function sendChatNotification(chat, messageData, mentions = []) {
  const previewText = messageData.Type === 'image'
    ? '📷 صورة'
    : (messageData.Text || '').substring(0, 80);

  const chatName = getChatDisplayName(chat);

  let recipients = [];

  if (chat.Type === 'channel' || chat.IsDefault) {
    recipients = chatPeopleArray
      .map(p => p.id)
      .filter(id => id !== chatPerson.id);
  } else {
    recipients = (chat.Members || []).filter(id => id !== chatPerson.id);
  }

  if (recipients.length === 0) return;

  for (const recipientId of recipients) {
    // ⚡ لو الشخص كاتب الشات كـMute → ما نبعتش إشعار
    if (isChatMuted(chat.id)) continue;

    // ⚡ هل ده mention ليّ؟
    const isMention = Array.isArray(mentions) && mentions.includes(recipientId);

    try {
      await addDoc(collection(db, 'notifications'), {
        Type: 'chat_message',
        Title: isMention
          ? `🔔 ${chatPerson.FirstName || 'مستخدم'} ذكرك في ${chatName}`
          : `💬 رسالة في ${chatName}`,
        Body: `${chatPerson.FirstName || 'مستخدم'}:\n${previewText}`,
        RelatedChatID: chat.id,
        ChatID: chat.id,
        RelatedID: chat.id,
        RelatedTitle: chatName,
        TargetType: 'person',
        TargetPersonID: recipientId,
        SentBy: chatPerson.id,
        SenderName: getPersonFullName(chatPerson),
        IsMention: isMention,
        SentAt: new Date().toISOString(),
        CreatedAt: new Date().toISOString(),
        ReadBy: []
      });
    } catch (err) {
      console.warn('⚠️ Send notification error:', err.message);
    }
  }

  console.log(`✅ Sent ${recipients.length} chat notifications (${mentions.length} mentions)`);
}

// ═══════════════════════════════════════════════════════
//   Cleanup
// ═══════════════════════════════════════════════════════

window.addEventListener('beforeunload', () => {
  clearTypingIndicator();

  if (chatUnsubscribeMessages) {
    try { chatUnsubscribeMessages(); } catch (e) {}
  }
  if (chatUnsubscribeChats) {
    try { chatUnsubscribeChats(); } catch (e) {}
  }
  if (chatTypingUnsubscribe) {
    try { chatTypingUnsubscribe(); } catch (e) {}
  }
  if (chatOnlineUnsubscribe) {
    try { chatOnlineUnsubscribe(); } catch (e) {}
  }
  if (chatOnlineInterval) {
    clearInterval(chatOnlineInterval);
  }
});

// ═══ Expose ═══
window.loadChatPage = loadChatPage;
window.showSidebarMobile = showSidebarMobile;
window.closeChatMobile = showSidebarMobile;
