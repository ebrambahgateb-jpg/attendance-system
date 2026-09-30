// ═══════════════════════════════════════════════════════
//   Chat — Internal Messaging System
//   ⚡ 1-to-1 + Groups + Channels + Realtime
//   ⚡ Reply + Edit + Delete + Swipe
//   ⚡ Typing + Read Receipts + Online Status
//   ⚡ Group Management + Mute + Mentions
//   ⚡ Reactions + Star + Forward + Pin + Search (PHASE 3)
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

import { EMOJI_CATEGORIES } from './emoji-data.js';

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

// ═══ Typing/Online State ═══
let chatTypingUnsubscribe = null;
let chatTypingUsers = {};
let chatTypingTimeout = null;
let chatOnlineInterval = null;
let chatOnlineUnsubscribe = null;
let chatOnlineStatuses = {};

// ═══ Mute State ═══
let chatMutedIds = new Set();

// ═══ Mention State ═══
let mentionDropdownActive = false;
let mentionStartIndex = -1;
let mentionOutsideClickBound = false;

// ═══ ⚡ Phase 3 State ═══
let chatPinnedMessages = {};        // { chatId: messageId }
let chatStarredIds = new Set();     // Set<messageId>
let chatSearchActive = false;
let chatSearchResults = [];
let chatSearchIndex = -1;
let chatSearchTerm = '';

// ═══ Constants ═══
const MAX_MESSAGE_LENGTH = 2000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const TYPING_TIMEOUT_MS = 3000;
const ONLINE_TIMEOUT_MS = 2 * 60 * 1000;
const ONLINE_HEARTBEAT_MS = 30000;

// ═══ ⚡ Reactions — 10 إيموجي ═══
const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯'];

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

    console.log(`✅ Loaded ${Object.keys(chatPeople).length} people (${chatPeopleArray.length} active)`);

    loadMutedChats();
    loadStarredMessages();
    loadPinnedMessages();

    await ensureDefaultChannels();

    renderChatPage(area);
    startChatsListener();
    startOnlineHeartbeat();
    startOnlineListener();

    if (!mentionOutsideClickBound) {
      mentionOutsideClickBound = true;
      document.addEventListener('click', handleOutsideClickForMention);
    }

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
//   ⚡ Starred Messages — localStorage + Firestore
// ═══════════════════════════════════════════════════════

function loadStarredMessages() {
  try {
    const saved = localStorage.getItem(`starred_${chatPerson.id}`);
    if (saved) {
      const arr = JSON.parse(saved);
      chatStarredIds = new Set(Array.isArray(arr) ? arr : []);
    }
  } catch (e) {
    chatStarredIds = new Set();
  }
}

function saveStarredMessages() {
  try {
    localStorage.setItem(`starred_${chatPerson.id}`, JSON.stringify([...chatStarredIds]));
  } catch (e) {}
}

function isMessageStarred(msgId) {
  return chatStarredIds.has(msgId);
}

window.toggleStarMessage = function(msgId, msgData) {
  if (!msgId) return;

  if (chatStarredIds.has(msgId)) {
    chatStarredIds.delete(msgId);
    showToast('⭐ تم إزالة النجمة');
  } else {
    chatStarredIds.add(msgId);
    showToast('⭐ تم الحفظ في المحفوظات');

    // ⚡ احفظ نسخة من الرسالة في Firestore
    saveStarredToFirestore(msgId, msgData);
  }

  saveStarredMessages();
  renderMessages();
};

async function saveStarredToFirestore(msgId, msgData) {
  if (!msgData || !chatPerson) return;

  try {
    const starRef = doc(db, 'starredMessages', `${chatPerson.id}_${msgId}`);
    await setDoc(starRef, {
      PersonID: chatPerson.id,
      MessageID: msgId,
      ChatID: chatActiveChatId,
      ChatName: getChatDisplayName(chatActiveChat),
      Text: msgData.Text || '',
      Type: msgData.Type || 'text',
      ImageURL: msgData.ImageURL || '',
      SenderID: msgData.SenderID || '',
      SenderName: msgData.SenderName || '',
      SentAt: msgData.SentAt || '',
      StarredAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('⚠️ saveStarredToFirestore error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Pinned Messages — Firestore
// ═══════════════════════════════════════════════════════

async function loadPinnedMessages() {
  try {
    const chatsSnap = await getDocs(collection(db, 'chats'));
    chatPinnedMessages = {};
    chatsSnap.docs.forEach(d => {
      const chat = d.data();
      if (chat.PinnedMessageId) {
        chatPinnedMessages[d.id] = chat.PinnedMessageId;
      }
    });
  } catch (err) {
    console.warn('⚠️ loadPinnedMessages error:', err.message);
  }
}

function getPinnedMessageId(chatId) {
  return chatPinnedMessages[chatId] || null;
}

window.pinMessage = async function(msgId) {
  if (!chatActiveChatId || !msgId) return;

  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  if (msg.DeletedForEveryone) {
    showToast('⚠️ لا يمكن تثبيت رسالة محذوفة');
    return;
  }

  try {
    await updateDoc(doc(db, 'chats', chatActiveChatId), {
      PinnedMessageId: msgId,
      PinnedAt: new Date().toISOString(),
      PinnedBy: chatPerson.id,
      PinnedByName: getPersonFullName(chatPerson)
    });

    chatPinnedMessages[chatActiveChatId] = msgId;

    // ⚡ أضف رسالة نظام
    await addDoc(collection(db, 'chats', chatActiveChatId, 'messages'), {
      SenderID: 'system',
      SenderName: 'النظام',
      Type: 'system',
      Text: `📌 تم تثبيت رسالة`,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    });

    showToast('📌 تم التثبيت');

    if (chatActiveChat) {
      chatActiveChat.PinnedMessageId = msgId;
    }

    renderMessages();
    updatePinnedBanner();

  } catch (err) {
    console.error('❌ pinMessage error:', err);
    alert('خطأ: ' + err.message);
  }
};

window.unpinMessage = async function() {
  if (!chatActiveChatId) return;

  try {
    await updateDoc(doc(db, 'chats', chatActiveChatId), {
      PinnedMessageId: null,
      PinnedAt: null,
      PinnedBy: null
    });

    delete chatPinnedMessages[chatActiveChatId];

    if (chatActiveChat) {
      chatActiveChat.PinnedMessageId = null;
    }

    showToast('📌 تم إلغاء التثبيت');

    renderMessages();
    updatePinnedBanner();

  } catch (err) {
    console.error('❌ unpinMessage error:', err);
    alert('خطأ: ' + err.message);
  }
};

function updatePinnedBanner() {
  const banner = document.getElementById('chatPinnedBanner');
  if (!banner) return;

  const pinnedId = getPinnedMessageId(chatActiveChatId);
  if (!pinnedId) {
    banner.style.display = 'none';
    return;
  }

  const msg = chatMessages.find(m => m.id === pinnedId);
  if (!msg) {
    banner.style.display = 'none';
    return;
  }

  const msgText = msg.Type === 'image'
    ? '📷 صورة'
    : (msg.Text || '').substring(0, 60);

  const senderName = msg.SenderName || 'مستخدم';

  banner.innerHTML = `
    <div class="pinned-banner-content" onclick="window.jumpToMessage('${pinnedId}')">
      <div class="pinned-banner-icon">📌</div>
      <div class="pinned-banner-text">
        <div class="pinned-banner-label">رسالة مثبتة — ${escapeHtml(senderName)}</div>
        <div class="pinned-banner-preview">${escapeHtml(msgText)}</div>
      </div>
    </div>
    <button class="pinned-banner-close" onclick="window.unpinMessage()" title="إلغاء التثبيت">✕</button>
  `;
  banner.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════
//   ⚡ Outside Click — إغلاق الـMention Dropdown
// ═══════════════════════════════════════════════════════

function handleOutsideClickForMention(e) {
  if (!mentionDropdownActive) return;

  const dropdown = document.getElementById('chatMentionDropdown');
  const input = document.getElementById('chatInput');
  const mentionBtn = document.getElementById('chatMentionBtn');

  const clickedInside =
    (dropdown && dropdown.contains(e.target)) ||
    (input && input.contains(e.target)) ||
    (mentionBtn && mentionBtn.contains(e.target));

  if (!clickedInside) {
    hideMentionDropdown();
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
            <button class="chat-starred-btn" id="starredBtn" title="⭐ المحفوظات">⭐</button>
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

  const starredBtn = document.getElementById('starredBtn');
  if (starredBtn) starredBtn.onclick = window.openStarredModal;

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

        // ⚡ حدّث الـpinned
        if (chat.PinnedMessageId) {
          chatPinnedMessages[d.id] = chat.PinnedMessageId;
        } else {
          delete chatPinnedMessages[d.id];
        }

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

      // ⚡ حدّث الـPinned Banner لو الشات مفتوح
      if (chatActiveChatId) {
        updatePinnedBanner();
      }
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
  const pinBadge = chat.PinnedMessageId ? '<span class="chat-pin-badge" title="فيه رسالة مثبتة">📌</span>' : '';

  return `
    <div class="chat-item ${isActive ? 'active' : ''} ${isMuted ? 'muted' : ''}" data-chat-id="${chat.id}">
      <div class="chat-item-avatar">
        ${avatar}
        ${onlineDot}
      </div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <div class="chat-item-name">${typeBadge} ${escapeHtml(displayName)} ${muteBadge} ${pinBadge}</div>
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

  // ⚡ اقفل الـSearch لما تفتح شات جديد
  closeSearchBar();

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
        <button class="chat-header-btn" id="chatSearchBtn" title="بحث">🔍</button>
        <button class="chat-menu-btn" id="chatMenuBtn" title="المزيد">⋮</button>
      </div>
    </div>

    <div class="chat-search-bar" id="chatSearchBar" style="display:none;">
      <input type="text" id="chatSearchInputInline" class="chat-search-inline" placeholder="🔍 ابحث في الرسائل..." />
      <div class="chat-search-info" id="chatSearchInfo"></div>
      <div class="chat-search-nav">
        <button class="chat-search-nav-btn" id="chatSearchPrev" title="السابق">⬆️</button>
        <button class="chat-search-nav-btn" id="chatSearchNext" title="التالي">⬇️</button>
        <button class="chat-search-nav-btn" id="chatSearchClose" title="إغلاق">✕</button>
      </div>
    </div>

    <div class="chat-pinned-banner" id="chatPinnedBanner" style="display:none;"></div>

    <div class="chat-messages" id="chatMessages">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>

    <div class="chat-typing-indicator" id="chatTypingIndicator" style="display:none;"></div>

    <button class="chat-scroll-bottom-btn" id="chatScrollBottomBtn" style="display:none;" title="أسفل">
      ⬇️
      <span class="chat-scroll-badge" id="chatScrollBadge" style="display:none;">0</span>
    </button>

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
          <button class="chat-emoji-inline-btn" id="chatEmojiBtn" type="button" title="إيموجي">😀</button>
          <input type="text" id="chatInput" class="chat-input" placeholder="اكتب رسالة..." autocomplete="off" maxlength="${MAX_MESSAGE_LENGTH}" />
          <div class="chat-input-actions">
            <button class="chat-input-btn" id="chatImageBtn" type="button" title="إرفاق">📎</button>
            <button class="chat-input-btn" id="chatCameraBtn" type="button" title="الكاميرا">📷</button>
            <button class="chat-input-btn chat-send-btn" id="chatSendBtn" type="button" title="إرسال">✔️</button>
          </div>
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

  const searchBtn = document.getElementById('chatSearchBtn');
  if (searchBtn) searchBtn.onclick = window.toggleSearchBar;

    const menuBtn = document.getElementById('chatMenuBtn');
  if (menuBtn) {
    menuBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showChatHeaderMenu(chat, isMuted, canManage);
    };
  }

  const imageBtn = document.getElementById('chatImageBtn');
  if (imageBtn) imageBtn.onclick = window.openChatImagePicker;

  const cameraBtn = document.getElementById('chatCameraBtn');
  if (cameraBtn) cameraBtn.onclick = window.openCamera;

  const emojiBtn = document.getElementById('chatEmojiBtn');
  if (emojiBtn) emojiBtn.onclick = window.toggleEmojiPicker;

  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.onclick = window.sendChatMessage;

  const replyCloseBtn = document.getElementById('chatReplyPreviewClose');
  if (replyCloseBtn) replyCloseBtn.onclick = () => window.cancelReply();

  // ⚡ Search bar handlers
  const searchInputInline = document.getElementById('chatSearchInputInline');
  if (searchInputInline) {
    searchInputInline.addEventListener('input', (e) => {
      performInlineSearch(e.target.value);
    });
    searchInputInline.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigateSearch(e.shiftKey ? -1 : 1);
      }
      if (e.key === 'Escape') {
        closeSearchBar();
      }
    });
  }

  const searchPrev = document.getElementById('chatSearchPrev');
  if (searchPrev) searchPrev.onclick = () => navigateSearch(-1);

  const searchNext = document.getElementById('chatSearchNext');
  if (searchNext) searchNext.onclick = () => navigateSearch(1);

  const searchClose = document.getElementById('chatSearchClose');
  if (searchClose) searchClose.onclick = closeSearchBar;

  // ⚡ Scroll to bottom button
  const scrollBtn = document.getElementById('chatScrollBottomBtn');
  if (scrollBtn) scrollBtn.onclick = scrollToBottom;

  // ⚡ Scroll listener
  const messagesEl = document.getElementById('chatMessages');
  if (messagesEl) {
    messagesEl.addEventListener('scroll', handleMessagesScroll);
  }

  // ⚡ input handlers
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mentionDropdownActive) {
        e.preventDefault();
        hideMentionDropdown();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        if (mentionDropdownActive) {
          e.preventDefault();
          selectMentionFromDropdown(0);
          return;
        }
        e.preventDefault();
        window.sendChatMessage();
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
  updatePinnedBanner();
}

function updateChatHeaderMuteButton() {
  const btn = document.getElementById('chatMuteBtn');
  if (!btn || !chatActiveChatId) return;
  const isMuted = isChatMuted(chatActiveChatId);
  btn.textContent = isMuted ? '🔔' : '🔕';
  btn.title = isMuted ? 'إلغاء الكتم' : 'كتم';
}

// ═══════════════════════════════════════════════════════
//   ⚡ Scroll to Bottom
// ═══════════════════════════════════════════════════════

function handleMessagesScroll() {
  const messagesEl = document.getElementById('chatMessages');
  const scrollBtn = document.getElementById('chatScrollBottomBtn');
  if (!messagesEl || !scrollBtn) return;

  const scrollFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;

  // ⚡ لو المسافة من الأسفل أكتر من 300px → اعرض الزر
  if (scrollFromBottom > 300) {
    scrollBtn.style.display = 'flex';
  } else {
    scrollBtn.style.display = 'none';
  }
}

function scrollToBottom() {
  const messagesEl = document.getElementById('chatMessages');
  if (!messagesEl) return;

  messagesEl.scrollTo({
    top: messagesEl.scrollHeight,
    behavior: 'smooth'
  });
}

// ═══════════════════════════════════════════════════════
//   ⚡ Search in Chat
// ═══════════════════════════════════════════════════════

window.toggleSearchBar = function() {
  const bar = document.getElementById('chatSearchBar');
  if (!bar) return;

  if (bar.style.display === 'none') {
    bar.style.display = 'flex';
    chatSearchActive = true;
    const input = document.getElementById('chatSearchInputInline');
    if (input) {
      input.focus();
      input.value = '';
    }
    clearSearchHighlights();
    updateSearchInfo();
  } else {
    closeSearchBar();
  }
};

function closeSearchBar() {
  const bar = document.getElementById('chatSearchBar');
  if (bar) bar.style.display = 'none';

  chatSearchActive = false;
  chatSearchResults = [];
  chatSearchIndex = -1;
  chatSearchTerm = '';

  clearSearchHighlights();
}

function performInlineSearch(term) {
  chatSearchTerm = (term || '').trim();

  if (!chatSearchTerm || chatSearchTerm.length < 2) {
    chatSearchResults = [];
    chatSearchIndex = -1;
    clearSearchHighlights();
    updateSearchInfo();
    return;
  }

  const lowerTerm = chatSearchTerm.toLowerCase();

  chatSearchResults = chatMessages
    .filter(msg => !msg.DeletedForEveryone && msg.Text && msg.Text.toLowerCase().includes(lowerTerm))
    .map(msg => msg.id);

  chatSearchIndex = chatSearchResults.length > 0 ? 0 : -1;

  highlightSearchResults();
  updateSearchInfo();

  if (chatSearchIndex >= 0) {
    scrollToSearchResult(chatSearchIndex);
  }
}

function highlightSearchResults() {
  // ⚡ امسح الـhighlights القديمة
  document.querySelectorAll('.chat-message.search-match').forEach(el => {
    el.classList.remove('search-match', 'search-current');
  });

  // ⚡ علّم النتائج الجديدة
  chatSearchResults.forEach((msgId, idx) => {
    const el = document.querySelector(`.chat-message[data-msg-id="${msgId}"]`);
    if (el) {
      el.classList.add('search-match');
      if (idx === chatSearchIndex) {
        el.classList.add('search-current');
      }
    }
  });

  // ⚡ Highlight النص جوه الرسالة
  highlightTextInMessages();
}

function highlightTextInMessages() {
  if (!chatSearchTerm) return;

  const lowerTerm = chatSearchTerm.toLowerCase();
  const escapedTerm = chatSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  chatSearchResults.forEach(msgId => {
    const el = document.querySelector(`.chat-message[data-msg-id="${msgId}"] .chat-message-text`);
    if (!el) return;

    // ⚡ restore original first
    const originalText = el.dataset.originalText || el.textContent;
    if (!el.dataset.originalText) {
      el.dataset.originalText = originalText;
    }

    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const html = escapeHtml(originalText).replace(regex, '<mark class="chat-search-mark">$1</mark>');
    el.innerHTML = html;
  });
}

function clearSearchHighlights() {
  document.querySelectorAll('.chat-message.search-match, .chat-message.search-current').forEach(el => {
    el.classList.remove('search-match', 'search-current');
  });

  document.querySelectorAll('.chat-message-text').forEach(el => {
    if (el.dataset.originalText) {
      el.textContent = el.dataset.originalText;
      delete el.dataset.originalText;
    }
  });
}

function updateSearchInfo() {
  const info = document.getElementById('chatSearchInfo');
  if (!info) return;

  if (chatSearchResults.length === 0) {
    info.textContent = chatSearchTerm.length >= 2 ? 'لا يوجد نتائج' : '';
    return;
  }

  info.textContent = `${chatSearchIndex + 1} من ${chatSearchResults.length}`;
}

function navigateSearch(direction) {
  if (chatSearchResults.length === 0) return;

  chatSearchIndex += direction;

  if (chatSearchIndex < 0) chatSearchIndex = chatSearchResults.length - 1;
  if (chatSearchIndex >= chatSearchResults.length) chatSearchIndex = 0;

  // ⚡ حدّث الـcurrent highlight
  document.querySelectorAll('.chat-message.search-current').forEach(el => {
    el.classList.remove('search-current');
  });

  const currentId = chatSearchResults[chatSearchIndex];
  const el = document.querySelector(`.chat-message[data-msg-id="${currentId}"]`);
  if (el) el.classList.add('search-current');

  scrollToSearchResult(chatSearchIndex);
  updateSearchInfo();
}

function scrollToSearchResult(index) {
  const msgId = chatSearchResults[index];
  if (!msgId) return;

  const el = document.querySelector(`.chat-message[data-msg-id="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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
    updatePinnedBanner();

    // ⚡ لو فيه بحث نشط → أعد البحث
    if (chatSearchActive && chatSearchTerm.length >= 2) {
      performInlineSearch(chatSearchTerm);
    }

    // ⚡ Auto-scroll if user is near bottom
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
      const scrollFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
      if (scrollFromBottom < 200) {
        setTimeout(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }, 100);
      }
    }
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

    // ⚡ ربط الـreactions
    el.querySelectorAll('.reaction-chip').forEach(chip => {
      chip.onclick = (e) => {
        e.stopPropagation();
        window.toggleReaction(msgId, chip.dataset.emoji);
      };
    });
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
  const isStarred = isMessageStarred(msg.id);

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

  if (msg.Type === 'system') {
    return `
      <div class="chat-message" data-msg-id="${msg.id}" data-msg-type="system">
        <div class="chat-message-bubble">
          <div class="chat-message-text">${escapeHtml(msg.Text || '')}</div>
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
  const starBadge = isStarred ? '<span class="chat-star-badge" title="محفوظة">⭐</span>' : '';

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

  const hasMention = checkMentionsForMe(msg);
  const reactionsHtml = renderReactions(msg);

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
          ${starBadge}
          ${readReceiptHtml}
        </div>
        ${reactionsHtml}
      </div>
    </div>
  `;
}

function getSenderAvatar(sender) {
  if (sender?.PhotoURL) return `<img src="${sender.PhotoURL}" alt="" />`;
  return getInitial(sender);
}

// ═══════════════════════════════════════════════════════
//   ⚡ Reactions — Render
// ═══════════════════════════════════════════════════════

function renderReactions(msg) {
  if (!msg.Reactions || typeof msg.Reactions !== 'object') return '';

  const counts = {};
  const myReactions = new Set();

  Object.keys(msg.Reactions).forEach(personId => {
    const emoji = msg.Reactions[personId];
    if (!emoji) return;

    counts[emoji] = (counts[emoji] || 0) + 1;
    if (personId === chatPerson.id) myReactions.add(emoji);
  });

  const emojis = Object.keys(counts);
  if (emojis.length === 0) return '';

  return `
    <div class="chat-reactions">
      ${emojis.map(emoji => {
        const isMine = myReactions.has(emoji);
        return `
          <button class="reaction-chip ${isMine ? 'mine' : ''}"
                  data-emoji="${emoji}"
                  data-msg-id="${msg.id}"
                  title="${counts[emoji]} تفاعل">
            <span class="reaction-emoji">${emoji}</span>
            <span class="reaction-count">${counts[emoji]}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

window.toggleReaction = async function(msgId, emoji) {
  if (!msgId || !emoji || !chatActiveChatId) return;

  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  if (msg.DeletedForEveryone) return;

  try {
    const msgRef = doc(db, 'chats', chatActiveChatId, 'messages', msgId);
    const currentReactions = msg.Reactions || {};
    const myCurrentReaction = currentReactions[chatPerson.id];

    if (myCurrentReaction === emoji) {
      // ⚡ شيل الـreaction
      const newReactions = { ...currentReactions };
      delete newReactions[chatPerson.id];

      await updateDoc(msgRef, { Reactions: newReactions });
    } else {
      // ⚡ ضيف/غيّر الـreaction
      await updateDoc(msgRef, {
        [`Reactions.${chatPerson.id}`]: emoji
      });
    }
  } catch (err) {
    console.error('❌ toggleReaction error:', err);
  }
};

// ═══════════════════════════════════════════════════════
//   ⚡ Format Message Text (with mentions highlight)
// ═══════════════════════════════════════════════════════

function formatMessageText(text) {
  if (!text) return '';

  let html = escapeHtml(text);

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

  if (Array.isArray(msg.Mentions) && msg.Mentions.includes(chatPerson.id)) {
    return true;
  }

  const myFirstName = chatPerson.FirstName || '';
  if (myFirstName && msg.Text.includes(`@${myFirstName}`)) {
    return true;
  }

  return false;
}

function handleMentionTyping(input) {
  const value = input.value;
  const cursorPos = input.selectionStart;

  const beforeCursor = value.substring(0, cursorPos);
  const lastAt = beforeCursor.lastIndexOf('@');

  if (lastAt === -1) {
    hideMentionDropdown();
    return;
  }

  const afterAt = beforeCursor.substring(lastAt + 1);
  if (afterAt.includes(' ') || afterAt.includes('\n')) {
    hideMentionDropdown();
    return;
  }

  mentionStartIndex = lastAt;
  window.showMentionDropdown(afterAt);
}

window.showMentionDropdown = function(searchTerm) {
  const dropdown = document.getElementById('chatMentionDropdown');
  if (!dropdown) return;

  let members = [];

  if (chatActiveChat && chatActiveChat.Type) {
    if (chatActiveChat.Type === 'direct') {
      const otherId = (chatActiveChat.Members || []).find(id => id !== chatPerson?.id);
      if (otherId && chatPeople[otherId]) {
        members = [chatPeople[otherId]];
      }
    } else {
      const memberIds = (chatActiveChat.Members || []).filter(id => id !== chatPerson?.id);
      members = memberIds.map(id => chatPeople[id]).filter(Boolean);
    }
  }

  if (members.length === 0) {
    members = chatPeopleArray.filter(p => p.id !== chatPerson?.id);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    members = members.filter(p => {
      const fullName = getPersonFullName(p).toLowerCase();
      const firstName = (p.FirstName || '').toLowerCase();
      const secondName = (p.SecondName || '').toLowerCase();
      return fullName.includes(term)
        || firstName.includes(term)
        || secondName.includes(term);
    });
  }

  members.sort((a, b) =>
    getPersonFullName(a).localeCompare(getPersonFullName(b), 'ar')
  );

  if (members.length === 0) {
    dropdown.innerHTML = `<div class="chat-mention-empty">لا يوجد نتائج مطابقة</div>`;
    dropdown.style.display = 'block';
    mentionDropdownActive = true;
    return;
  }

  mentionDropdownActive = true;

  dropdown.innerHTML = members.map((p, idx) => {
    const name = getPersonFullName(p);
    const avatar = p.PhotoURL
      ? `<img src="${p.PhotoURL}" alt="" />`
      : getInitial(p);
    const isOnline = isUserOnline(p.id);

    return `
      <div class="chat-mention-item"
           data-person-id="${p.id}"
           data-person-name="${escapeHtml(p.FirstName || name)}"
           data-idx="${idx}">
        <div class="chat-mention-avatar">
          ${avatar}
          ${isOnline ? '<span class="chat-online-dot chat-online-dot-small"></span>' : ''}
        </div>
        <div class="chat-mention-name">${escapeHtml(name)}</div>
      </div>
    `;
  }).join('');

  dropdown.style.display = 'block';

  dropdown.querySelectorAll('.chat-mention-item').forEach(el => {
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertMention(el.dataset.personId, el.dataset.personName);
    };

    el.ontouchend = (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertMention(el.dataset.personId, el.dataset.personName);
    };
  });
};

window.hideMentionDropdown = function() {
  const dropdown = document.getElementById('chatMentionDropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
  mentionDropdownActive = false;
  mentionStartIndex = -1;
};

function hideMentionDropdown() {
  window.hideMentionDropdown();
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
};

function insertMention(personId, personName) {
  window.insertMention(personId, personName);
}

function extractMentionsFromText(text) {
  if (!text) return [];

  const mentions = [];
  const regex = /@([^\s@]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
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

  const mentions = extractMentionsFromText(text);

  input.value = '';
  input.focus();

  if (chatTypingTimeout) clearTimeout(chatTypingTimeout);
  clearTypingIndicator();

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

  // ⚡ Double click = ❤️ quick reaction
  el.addEventListener('dblclick', (e) => {
    e.preventDefault();
    window.toggleReaction(msgId, '❤️');
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

  if (msg.DeletedForEveryone) return;

  const now = Date.now();
  const sentAt = msg.SentAt ? new Date(msg.SentAt).getTime() : 0;
  const minutesSinceSent = (now - sentAt) / 60000;

  const isAdminOrOwner = ['Owner', 'Admin'].includes(chatWorkspace);
  const isStarred = isMessageStarred(msgId);
  const isPinned = getPinnedMessageId(chatActiveChatId) === msgId;

  const canReply = msg.Type !== 'system';
  const canEdit = isMine && msgType === 'text' && minutesSinceSent < 60;
  const canCopy = msgType === 'text';
  const canDeleteForEveryone = isAdminOrOwner || (isMine && minutesSinceSent < 60);
  const canStar = msg.Type !== 'system';
  const canForward = msg.Type !== 'system';
  const canPin = isAdminOrOwner || chatActiveChat?.Type === 'group';

  const menu = document.createElement('div');
  menu.id = 'messageActionsMenu';
  menu.className = 'message-actions-menu';

  const menuWidth = 320;
  const menuHeight = 480;

  const left = Math.max(8, Math.min(x - menuWidth / 2, window.innerWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(y - menuHeight / 2, window.innerHeight - menuHeight - 8));

  menu.innerHTML = `
    <div class="msg-menu-backdrop"></div>
    <div class="msg-menu-content msg-menu-wide" style="left: ${left}px; top: ${top}px;">

      <!-- ⚡ Reactions Bar -->
      ${msg.Type !== 'system' ? `
        <div class="reactions-picker">
          ${REACTION_EMOJIS.map(emoji => {
            const isMine = (msg.Reactions || {})[chatPerson.id] === emoji;
            return `
              <button class="reaction-picker-btn ${isMine ? 'active' : ''}"
                      data-emoji="${emoji}">
                ${emoji}
              </button>
            `;
          }).join('')}
        </div>
      ` : ''}

      <!-- ⚡ Actions List -->
      <div class="msg-menu-items">

        ${canReply ? `
          <button class="msg-menu-item" data-action="reply">
            <span class="msg-menu-icon">↩️</span> <span>رد</span>
          </button>
        ` : ''}

        ${canStar ? `
          <button class="msg-menu-item" data-action="star">
            <span class="msg-menu-icon">${isStarred ? '⭐' : '☆'}</span>
            <span>${isStarred ? 'إزالة النجمة' : 'حفظ في المحفوظات'}</span>
          </button>
        ` : ''}

        ${canForward ? `
          <button class="msg-menu-item" data-action="forward">
            <span class="msg-menu-icon">📤</span> <span>إعادة توجيه</span>
          </button>
        ` : ''}

        ${canPin ? `
          <button class="msg-menu-item" data-action="pin">
            <span class="msg-menu-icon">📌</span>
            <span>${isPinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'}</span>
          </button>
        ` : ''}

        ${canCopy ? `
          <button class="msg-menu-item" data-action="copy">
            <span class="msg-menu-icon">📋</span> <span>نسخ</span>
          </button>
        ` : ''}

        ${canEdit ? `
          <button class="msg-menu-item" data-action="edit">
            <span class="msg-menu-icon">✏️</span> <span>تعديل</span>
          </button>
        ` : ''}

        <button class="msg-menu-item" data-action="delete-me">
          <span class="msg-menu-icon">🗑️</span> <span>حذف ليّ</span>
        </button>

        ${canDeleteForEveryone ? `
          <button class="msg-menu-item danger" data-action="delete-all">
            <span class="msg-menu-icon">🗑️</span> <span>حذف للجميع</span>
          </button>
        ` : ''}

        <button class="msg-menu-item cancel" data-action="cancel">
          <span class="msg-menu-icon">✕</span> <span>إلغاء</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('.msg-menu-backdrop').onclick = closeMessageActionsMenu;

  // ⚡ Reactions buttons
  menu.querySelectorAll('.reaction-picker-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const emoji = btn.dataset.emoji;
      window.toggleReaction(msgId, emoji);
      closeMessageActionsMenu();
    };
  });

  // ⚡ Action buttons
  menu.querySelectorAll('.msg-menu-item').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      closeMessageActionsMenu();

      if (action === 'reply') window.startReply(msgId);
      else if (action === 'star') window.toggleStarMessage(msgId, msg);
      else if (action === 'forward') window.openForwardModal(msgId);
      else if (action === 'pin') isPinned ? window.unpinMessage() : window.pinMessage(msgId);
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
//   ⚡ Forward Modal (Multi-Select)
// ═══════════════════════════════════════════════════════

window.openForwardModal = function(msgId) {
  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  let modal = document.getElementById('forwardModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'forwardModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const selectedChats = new Set();

  const availableChats = chatConversations
    .filter(c => c.id !== chatActiveChatId)
    .sort((a, b) => {
      const aTime = a.LastMessageAt || a.CreatedAt || '';
      const bTime = b.LastMessageAt || b.CreatedAt || '';
      return String(bTime).localeCompare(String(aTime));
    });

  modal.innerHTML = `
    <div class="modal-content" style="max-width:540px;max-height:85vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>📤 إعادة توجيه</h2>
        <button class="modal-close" id="closeForwardBtn">✕</button>
      </div>

      <div class="modal-body" style="flex:1;overflow-y:auto;">

        <!-- ⚡ Preview الرسالة -->
        <div class="forward-preview">
          <div class="forward-preview-label">📨 الرسالة:</div>
          <div class="forward-preview-content">
            ${msg.Type === 'image'
              ? `<img src="${escapeHtml(msg.ImageURL)}" class="forward-preview-img" />`
              : `<div class="forward-preview-text">${escapeHtml((msg.Text || '').substring(0, 200))}</div>`
            }
          </div>
        </div>

        <!-- ⚡ Search -->
        <div class="form-row">
          <input type="text" id="forwardSearch" placeholder="🔍 ابحث عن محادثة..." class="chat-new-search" />
        </div>

        <!-- ⚡ Selected count -->
        <div class="forward-selected-count" id="forwardSelectedCount" style="display:none;">
          ✅ <span id="forwardCountNum">0</span> محادثة محددة
        </div>

        <!-- ⚡ Chats list -->
        <div class="forward-chats-list" id="forwardChatsList">
          ${availableChats.map(c => renderForwardChatItem(c, selectedChats.has(c.id))).join('')}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" id="cancelForwardBtn">إلغاء</button>
        <button class="btn-primary" id="confirmForwardBtn" disabled>
          📤 إرسال (<span id="forwardCountBtn">0</span>)
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const updateSelectedCount = () => {
    const count = selectedChats.size;
    document.getElementById('forwardCountNum').textContent = count;
    document.getElementById('forwardCountBtn').textContent = count;

    const countBox = document.getElementById('forwardSelectedCount');
    countBox.style.display = count > 0 ? 'block' : 'none';

    document.getElementById('confirmForwardBtn').disabled = count === 0;
  };

  const bindChatItems = () => {
    modal.querySelectorAll('.forward-chat-item').forEach(item => {
      item.onclick = () => {
        const chatId = item.dataset.chatId;
        if (selectedChats.has(chatId)) {
          selectedChats.delete(chatId);
          item.classList.remove('selected');
        } else {
          selectedChats.add(chatId);
          item.classList.add('selected');
        }
        updateSelectedCount();
      };
    });
  };

  bindChatItems();

  document.getElementById('closeForwardBtn').onclick = () => modal.style.display = 'none';
  document.getElementById('cancelForwardBtn').onclick = () => modal.style.display = 'none';

  document.getElementById('confirmForwardBtn').onclick = async () => {
    if (selectedChats.size === 0) return;

    const btn = document.getElementById('confirmForwardBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ جاري الإرسال...';

    await forwardMessageToChats(msg, Array.from(selectedChats));

    modal.style.display = 'none';
    showToast(`📤 تم الإرسال لـ ${selectedChats.size} محادثة`);
  };

  // ⚡ Search
  const searchInput = document.getElementById('forwardSearch');
  searchInput.oninput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    const list = document.getElementById('forwardChatsList');

    const filtered = availableChats.filter(c => {
      const name = getChatDisplayName(c).toLowerCase();
      return name.includes(term);
    });

    if (filtered.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;">لا يوجد نتائج</p>';
      return;
    }

    list.innerHTML = filtered.map(c => renderForwardChatItem(c, selectedChats.has(c.id))).join('');
    bindChatItems();
  };

  setTimeout(() => searchInput.focus(), 100);
};

function renderForwardChatItem(chat, isSelected) {
  const displayName = getChatDisplayName(chat);
  const avatar = getChatAvatar(chat);

  let typeBadge = '';
  if (chat.Type === 'channel' || chat.IsDefault) {
    typeBadge = '<span class="chat-item-badge">📢</span>';
  } else if (chat.Type === 'group') {
    typeBadge = '<span class="chat-item-badge">👥</span>';
  }

  return `
    <div class="forward-chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}">
      <div class="forward-chat-checkbox">
        ${isSelected ? '✅' : '⬜'}
      </div>
      <div class="forward-chat-avatar">${avatar}</div>
      <div class="forward-chat-info">
        <div class="forward-chat-name">${typeBadge} ${escapeHtml(displayName)}</div>
      </div>
    </div>
  `;
}

async function forwardMessageToChats(msg, chatIds) {
  const forwardedData = {
    SenderID: chatPerson.id,
    SenderName: getPersonFullName(chatPerson),
    Type: msg.Type || 'text',
    Text: msg.Text || '',
    ImageURL: msg.ImageURL || '',
    SentAt: new Date().toISOString(),
    ReadBy: [chatPerson.id],
    Reactions: {},
    Forwarded: true,
    ForwardedFrom: chatActiveChatId,
    ForwardedFromName: getChatDisplayName(chatActiveChat)
  };

  for (const chatId of chatIds) {
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), forwardedData);

      await updateDoc(doc(db, 'chats', chatId), {
        LastMessage: {
          Text: msg.Type === 'image' ? '📷 صورة' : (msg.Text || '').substring(0, 100),
          Type: msg.Type || 'text',
          SenderID: chatPerson.id,
          SenderName: getPersonFullName(chatPerson),
          SentAt: forwardedData.SentAt
        },
        LastMessageAt: forwardedData.SentAt
      });

      // ⚡ إشعار
      const targetChat = chatConversations.find(c => c.id === chatId);
      if (targetChat) {
        await sendChatNotification(targetChat, forwardedData, []);
      }
    } catch (err) {
      console.warn(`⚠️ Forward to ${chatId} error:`, err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Starred Messages Modal
// ═══════════════════════════════════════════════════════

window.openStarredModal = async function() {
  let modal = document.getElementById('starredModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'starredModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:600px;max-height:85vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>⭐ المحفوظات</h2>
        <button class="modal-close" id="closeStarredBtn">✕</button>
      </div>

      <div class="modal-body" style="flex:1;overflow-y:auto;">
        <div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  document.getElementById('closeStarredBtn').onclick = () => modal.style.display = 'none';

  try {
    const q = query(
      collection(db, 'starredMessages'),
      where('PersonID', '==', chatPerson.id)
    );
    const snap = await getDocs(q);

    const starred = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aT = a.StarredAt || '';
        const bT = b.StarredAt || '';
        return String(bT).localeCompare(String(aT));
      });

    const body = modal.querySelector('.modal-body');

    if (starred.length === 0) {
      body.innerHTML = `
        <div class="starred-empty">
          <div class="starred-empty-icon">⭐</div>
          <h3>لا يوجد رسائل محفوظة</h3>
          <p>احفظ الرسائل المهمة عشان تلقاها هنا بسهولة</p>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="starred-list">
        ${starred.map(s => {
          const sentAt = s.SentAt ? parseDate(s.SentAt) : null;
          const timeStr = sentAt ? formatRelativeTime(sentAt) : '';

          return `
            <div class="starred-item" data-starred-id="${s.id}" data-chat-id="${s.ChatID}" data-msg-id="${s.MessageID}">
              <div class="starred-item-header">
                <div class="starred-item-chat">💬 ${escapeHtml(s.ChatName || 'شات')}</div>
                <div class="starred-item-time">${timeStr}</div>
              </div>
              <div class="starred-item-content">
                ${s.Type === 'image'
                  ? `<img src="${escapeHtml(s.ImageURL)}" class="starred-item-img" />`
                  : `<div class="starred-item-text">${escapeHtml((s.Text || '').substring(0, 200))}</div>`
                }
              </div>
              <div class="starred-item-footer">
                <span class="starred-item-sender">👤 ${escapeHtml(s.SenderName || '')}</span>
                <button class="starred-item-remove" data-remove-id="${s.MessageID}" title="إزالة">🗑️</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // ⚡ Jump to message
    body.querySelectorAll('.starred-item').forEach(item => {
      item.onclick = (e) => {
        if (e.target.closest('.starred-item-remove')) return;

        const chatId = item.dataset.chatId;
        const msgId = item.dataset.msgId;

        modal.style.display = 'none';
        window.openChat(chatId);

        setTimeout(() => window.jumpToMessage(msgId), 1500);
      };
    });

    // ⚡ Remove from starred
    body.querySelectorAll('.starred-item-remove').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const msgId = btn.dataset.removeId;
        const starredDocId = `${chatPerson.id}_${msgId}`;

        if (!confirm('🗑️ إزالة الرسالة من المحفوظات؟')) return;

        try {
          await deleteDoc(doc(db, 'starredMessages', starredDocId));
          chatStarredIds.delete(msgId);
          saveStarredMessages();

          btn.closest('.starred-item').remove();
          showToast('✅ تم الإزالة');

          if (body.querySelectorAll('.starred-item').length === 0) {
            window.openStarredModal();
          }
        } catch (err) {
          console.error('❌ Remove starred error:', err);
        }
      };
    });

  } catch (err) {
    console.error('❌ openStarredModal error:', err);
    const body = modal.querySelector('.modal-body');
    if (body) {
      body.innerHTML = `<div class="placeholder-page"><h2>خطأ</h2><p>${err.message}</p></div>`;
    }
  }
};

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
//   Group Settings Modal
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

        <div class="group-settings-section">
          <h3 class="group-settings-title">➕ إضافة أعضاء</h3>

          <div class="form-row">
            <input type="text" id="gsAddSearch" placeholder="🔍 ابحث..." class="chat-new-search" />
          </div>

          <div class="group-settings-list" id="gsAddList"></div>
        </div>

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

        <div class="group-settings-section group-danger-section">
          <h3 class="group-settings-title">⚠️ منطقة الخطر</h3>
          <button class="btn-danger" id="gsLeaveBtn">🚪 مغادرة المجموعة</button>
        </div>

      </div>
    </div>
  `;

  document.getElementById('closeGroupSettingsBtn').onclick = () => {
    modal.style.display = 'none';
  };

  document.getElementById('gsSaveInfoBtn').onclick = () => saveGroupInfo(chat.id);

  const addSearch = document.getElementById('gsAddSearch');
  renderAddMembersList(chat);

  addSearch.oninput = (e) => {
    renderAddMembersList(chat, e.target.value);
  };

  modal.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.action;
      const memberId = btn.dataset.member;

      if (action === 'promote') await promoteToAdmin(chat.id, memberId);
      else if (action === 'demote') await demoteFromAdmin(chat.id, memberId);
      else if (action === 'remove') await removeFromGroup(chat.id, memberId);
    };
  });

  const leaveBtn = document.getElementById('gsLeaveBtn');
  if (leaveBtn) {
    leaveBtn.onclick = () => leaveGroup(chat.id);
  }
}

function renderAddMembersList(chat, searchTerm = '') {
  const container = document.getElementById('gsAddList');
  if (!container) return;

  const currentMembers = Array.isArray(chat.Members) ? chat.Members : [];

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

  container.querySelectorAll('[data-add-member]').forEach(btn => {
    btn.onclick = async () => {
      await addToGroup(chat.id, btn.dataset.addMember);
    };
  });
}

// ═══════════════════════════════════════════════════════
//   Group Actions
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

    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      SenderID: 'system',
      SenderName: 'النظام',
      Type: 'system',
      Text: `🚪 ${getPersonFullName(chatPerson)} غادر المجموعة`,
      SentAt: new Date().toISOString(),
      ReadBy: [chatPerson.id],
      Reactions: {}
    });

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
    if (isChatMuted(chat.id)) continue;

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
//   Keyboard Shortcuts
// ═══════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  // ⚡ Ctrl+F / Cmd+F → Search in Chat
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    if (chatActiveChatId && document.getElementById('chatMain')?.contains(document.activeElement)) {
      e.preventDefault();
      window.toggleSearchBar();
    }
  }

  // ⚡ Escape → إغلاق كل حاجة
  if (e.key === 'Escape') {
    if (mentionDropdownActive) {
      hideMentionDropdown();
    }
    if (chatSearchActive) {
      closeSearchBar();
    }
    closeMessageActionsMenu();
    closeChatActionsMenu();
  }
});

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

// ═══════════════════════════════════════════════════════
//   ⚡ PHASE 3-3: Emoji Picker + Camera + Poll + Wallpaper
// ═══════════════════════════════════════════════════════


// ═══ State ═══
let emojiPickerActive = false;
let cameraStream = null;
let currentCameraFacing = 'environment'; // environment | user
let wallpaperCache = {}; // { chatId: url }

// ═══════════════════════════════════════════════════════
//   ⚡ Emoji Picker
// ═══════════════════════════════════════════════════════

window.toggleEmojiPicker = function() {
  const picker = document.getElementById('chatEmojiPicker');
  if (!picker) return;

  if (emojiPickerActive) {
    closeEmojiPicker();
    return;
  }

  emojiPickerActive = true;
  renderEmojiPicker(picker);
  picker.style.display = 'flex';
};

window.closeEmojiPicker = function() {
  const picker = document.getElementById('chatEmojiPicker');
  if (picker) picker.style.display = 'none';
  emojiPickerActive = false;
};

function renderEmojiPicker(container) {
  if (!EMOJI_CATEGORIES || EMOJI_CATEGORIES.length === 0) {
    container.innerHTML = '<div class="emoji-picker-empty">⚠️ الإيموجي مش محمّلة</div>';
    return;
  }

  const activeCat = container.dataset.activeCat || EMOJI_CATEGORIES[0].id;
  const currentCategory = EMOJI_CATEGORIES.find(c => c.id === activeCat) || EMOJI_CATEGORIES[0];

  container.innerHTML = `
    <div class="emoji-picker-header">
      <div class="emoji-picker-tabs">
        ${EMOJI_CATEGORIES.map(cat => `
          <button class="emoji-cat-btn ${cat.id === currentCategory.id ? 'active' : ''}"
                  data-cat="${cat.id}"
                  title="${cat.name}">
            ${cat.icon}
          </button>
        `).join('')}
      </div>
      <button class="emoji-picker-close" id="emojiPickerCloseBtn" title="إغلاق">✕</button>
    </div>
    <div class="emoji-picker-body" id="emojiPickerBody">
      <div class="emoji-cat-title">${currentCategory.name}</div>
      <div class="emoji-grid">
        ${currentCategory.emojis.map(e => `
          <button class="emoji-item" data-emoji="${e}">${e}</button>
        `).join('')}
      </div>
    </div>
  `;

  // ⚡ Close button
  const closeBtn = document.getElementById('emojiPickerCloseBtn');
  if (closeBtn) closeBtn.onclick = closeEmojiPicker;

  // ⚡ Category tabs
  container.querySelectorAll('.emoji-cat-btn').forEach(btn => {
    btn.onclick = () => {
      container.dataset.activeCat = btn.dataset.cat;
      renderEmojiPicker(container);
    };
  });

  // ⚡ Emoji clicks
  container.querySelectorAll('.emoji-item').forEach(btn => {
    btn.onclick = () => {
      const emoji = btn.dataset.emoji;
      insertEmojiToInput(emoji);
    };
  });
}

function insertEmojiToInput(emoji) {
  const input = document.getElementById('chatInput');
  if (!input) return;

  const start = input.selectionStart || input.value.length;
  const end = input.selectionEnd || input.value.length;

  input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
  input.setSelectionRange(start + emoji.length, start + emoji.length);
  input.focus();

  // ⚡ Typing indicator
  sendTypingIndicator();
}

// ═══════════════════════════════════════════════════════
//   ⚡ Camera — Modern Full-Screen UI
// ═══════════════════════════════════════════════════════

let cameraFlashOn = false;
let cameraZoom = 1;
let cameraCapturedBlob = null;
let cameraTouchStart = null;
let cameraPinchStart = null;

window.openCamera = async function() {
  let modal = document.getElementById('chatCameraModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'chatCameraModal';
    modal.className = 'camera-modal-overlay';
    document.body.appendChild(modal);
  }

  // ⚡ Reset state
  cameraFlashOn = false;
  cameraZoom = 1;
  cameraCapturedBlob = null;

  modal.innerHTML = `
    <div class="camera-screen">

      <!-- ═══ Top Bar ═══ -->
      <div class="camera-topbar">
        <button class="camera-topbar-btn" id="cameraCloseBtn" title="إغلاق">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div class="camera-topbar-actions">
          <button class="camera-topbar-btn" id="cameraFlashBtn" title="فلاش">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </button>
          <button class="camera-topbar-btn" id="cameraRotateBtn" title="تبديل الكاميرا">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- ═══ Camera View ═══ -->
      <div class="camera-viewport" id="cameraViewport">
        <video id="cameraVideo" class="camera-video" autoplay playsinline muted></video>
        <canvas id="cameraCanvas" class="camera-canvas" style="display:none;"></canvas>
        <img id="cameraPreview" class="camera-preview" style="display:none;" />

        <!-- ═══ Grid Overlay ═══ -->
        <div class="camera-grid" id="cameraGrid">
          <div class="camera-grid-line camera-grid-v1"></div>
          <div class="camera-grid-line camera-grid-v2"></div>
          <div class="camera-grid-line camera-grid-h1"></div>
          <div class="camera-grid-line camera-grid-h2"></div>
        </div>

        <!-- ═══ Loading ═══ -->
        <div class="camera-loading" id="cameraLoading">
          <div class="camera-loading-spinner"></div>
          <div class="camera-loading-text">جاري تشغيل الكاميرا...</div>
        </div>

        <!-- ═══ Error ═══ -->
        <div class="camera-error" id="cameraError" style="display:none;">
          <div class="camera-error-icon">📷</div>
          <div class="camera-error-text" id="cameraErrorText">لا يمكن تشغيل الكاميرا</div>
          <button class="camera-error-btn" id="cameraRetryBtn">🔄 إعادة المحاولة</button>
        </div>

        <!-- ═══ Zoom Indicator ═══ -->
        <div class="camera-zoom-indicator" id="cameraZoomIndicator" style="display:none;">
          <span id="cameraZoomValue">1.0x</span>
        </div>
      </div>

      <!-- ═══ Bottom Bar ═══ -->
      <div class="camera-bottombar" id="cameraBottombar">

        <!-- ═══ Capture Mode ═══ -->
        <div class="camera-capture-actions" id="cameraCaptureActions">
          <button class="camera-gallery-btn" id="cameraGalleryBtn" title="المعرض">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </button>

          <button class="camera-capture-btn" id="cameraCaptureBtn" title="تصوير">
            <span class="camera-capture-ring"></span>
            <span class="camera-capture-inner"></span>
          </button>

          <div class="camera-side-space"></div>
        </div>

        <!-- ═══ Preview Mode ═══ -->
        <div class="camera-preview-actions" id="cameraPreviewActions" style="display:none;">
          <button class="camera-action-btn camera-retake-btn" id="cameraRetakeBtn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>إعادة</span>
          </button>

          <button class="camera-action-btn camera-send-btn" id="cameraSendBtn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <span>إرسال</span>
          </button>
        </div>

      </div>

    </div>
  `;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // ⚡ Start camera
  await startCamera();

  // ═══ ربط الأزرار ═══
  document.getElementById('cameraCloseBtn').onclick = closeCamera;
  document.getElementById('cameraRotateBtn').onclick = switchCamera;
  document.getElementById('cameraFlashBtn').onclick = toggleFlash;
  document.getElementById('cameraCaptureBtn').onclick = capturePhoto;
  document.getElementById('cameraRetakeBtn').onclick = retakePhoto;
  document.getElementById('cameraSendBtn').onclick = sendCapturedPhoto;
  document.getElementById('cameraGalleryBtn').onclick = openGallery;
  document.getElementById('cameraRetryBtn').onclick = startCamera;

  // ═══ Pinch to zoom ═══
  const viewport = document.getElementById('cameraViewport');
  if (viewport) {
    setupPinchZoom(viewport);
  }

  // ═══ Escape to close ═══
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeCamera();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
};

async function startCamera() {
  const video = document.getElementById('cameraVideo');
  const loading = document.getElementById('cameraLoading');
  const error = document.getElementById('cameraError');
  const grid = document.getElementById('cameraGrid');

  if (!video) return;

  // ⚡ Reset
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
  }

  if (loading) loading.style.display = 'flex';
  if (error) error.style.display = 'none';
  if (grid) grid.style.display = 'block';

  try {
    const constraints = {
      video: {
        facingMode: currentCameraFacing,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

    video.srcObject = cameraStream;
    video.style.display = 'block';

    // ⚡ Apply zoom if supported
    applyZoom();

    if (loading) loading.style.display = 'none';

    console.log('✅ Camera started:', currentCameraFacing);

  } catch (err) {
    console.error('❌ Camera error:', err);

    if (loading) loading.style.display = 'none';

    if (error) {
      error.style.display = 'flex';
      let msg = 'لا يمكن تشغيل الكاميرا';

      if (err.name === 'NotAllowedError') {
        msg = 'تم رفض إذن الكاميرا. اسمح بالوصول من إعدادات المتصفح.';
      } else if (err.name === 'NotFoundError') {
        msg = 'لا توجد كاميرا متاحة على هذا الجهاز.';
      } else if (err.name === 'NotReadableError') {
        msg = 'الكاميرا مشغولة بتطبيق آخر.';
      } else if (err.name === 'OverconstrainedError') {
        msg = 'دقة الكاميرا غير مدعومة.';
      }

      const errorText = document.getElementById('cameraErrorText');
      if (errorText) errorText.textContent = msg;
    }
  }
}

async function switchCamera() {
  currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';

  // ⚡ Animation
  const viewport = document.getElementById('cameraViewport');
  if (viewport) {
    viewport.classList.add('camera-flip');
    setTimeout(() => viewport.classList.remove('camera-flip'), 400);
  }

  await startCamera();

  // ⚡ Haptic
  if (navigator.vibrate) navigator.vibrate(20);
}

function toggleFlash() {
  cameraFlashOn = !cameraFlashOn;

  const flashBtn = document.getElementById('cameraFlashBtn');
  if (flashBtn) {
    flashBtn.classList.toggle('active', cameraFlashOn);
  }

  // ⚡ Apply torch to camera track
  if (cameraStream) {
    const track = cameraStream.getVideoTracks()[0];
    if (track) {
      try {
        track.applyConstraints({
          advanced: [{ torch: cameraFlashOn }]
        }).catch(() => {
          // ⚡ Fallback: flash via screen
          flashScreen();
        });
      } catch (e) {
        flashScreen();
      }
    }
  }

  if (navigator.vibrate) navigator.vibrate(15);
}

function flashScreen() {
  // ⚡ فلاش احتياطي — شاشة بيضا سريعة
  const flash = document.createElement('div');
  flash.className = 'camera-screen-flash';
  document.body.appendChild(flash);

  setTimeout(() => flash.classList.add('show'), 10);
  setTimeout(() => {
    flash.classList.remove('show');
    setTimeout(() => flash.remove(), 200);
  }, 100);
}

function capturePhoto() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const preview = document.getElementById('cameraPreview');
  const captureActions = document.getElementById('cameraCaptureActions');
  const previewActions = document.getElementById('cameraPreviewActions');
  const grid = document.getElementById('cameraGrid');

  if (!video || !canvas) return;

  // ⚡ Flash effect
  if (cameraFlashOn && currentCameraFacing === 'user') {
    flashScreen();
  }

  // ═══ Capture Image ═══
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  const ctx = canvas.getContext('2d');

  // ⚡ Mirror للكاميرا الأمامية
  if (currentCameraFacing === 'user') {
    ctx.translate(videoWidth, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0);

  // ═══ Convert to Blob ═══
  canvas.toBlob((blob) => {
    if (!blob) return;

    cameraCapturedBlob = blob;
    const dataUrl = URL.createObjectURL(blob);

    preview.src = dataUrl;
    preview.style.display = 'block';
    video.style.display = 'none';

    if (grid) grid.style.display = 'none';
    if (captureActions) captureActions.style.display = 'none';
    if (previewActions) previewActions.style.display = 'flex';

    // ═══ Animation ═══
    preview.classList.add('camera-preview-animate');
    setTimeout(() => preview.classList.remove('camera-preview-animate'), 400);

  }, 'image/jpeg', 0.92);

  // ═══ Haptic ═══
  if (navigator.vibrate) navigator.vibrate(30);
}

function retakePhoto() {
  const video = document.getElementById('cameraVideo');
  const preview = document.getElementById('cameraPreview');
  const captureActions = document.getElementById('cameraCaptureActions');
  const previewActions = document.getElementById('cameraPreviewActions');
  const grid = document.getElementById('cameraGrid');

  if (preview.src) {
    URL.revokeObjectURL(preview.src);
  }

  cameraCapturedBlob = null;

  if (preview) preview.style.display = 'none';
  if (video) video.style.display = 'block';
  if (grid) grid.style.display = 'block';
  if (captureActions) captureActions.style.display = 'flex';
  if (previewActions) previewActions.style.display = 'none';
}

async function sendCapturedPhoto() {
  if (!cameraCapturedBlob) return;

  const sendBtn = document.getElementById('cameraSendBtn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.classList.add('sending');
    sendBtn.innerHTML = `
      <div class="camera-send-spinner"></div>
      <span>جاري الإرسال...</span>
    `;
  }

  try {
    const file = new File([cameraCapturedBlob], `camera_${Date.now()}.jpg`, {
      type: 'image/jpeg'
    });

    closeCamera();
    await sendChatImage(file);

  } catch (err) {
    console.error('❌ Send captured photo error:', err);
    alert('خطأ: ' + err.message);

    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.classList.remove('sending');
      sendBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        <span>إرسال</span>
      `;
    }
  }
}

function openGallery() {
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

    closeCamera();
    await sendChatImage(file);
  };

  input.click();
}

// ═══════════════════════════════════════════════════════
//   ⚡ Pinch to Zoom
// ═══════════════════════════════════════════════════════

function setupPinchZoom(viewport) {
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      cameraPinchStart = Math.sqrt(dx * dx + dy * dy);
      cameraTouchStart = cameraZoom;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && cameraPinchStart) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const scale = distance / cameraPinchStart;
      let newZoom = cameraTouchStart * scale;

      // ⚡ Clamp 1x - 5x
      newZoom = Math.max(1, Math.min(5, newZoom));

      cameraZoom = newZoom;
      applyZoom();
      showZoomIndicator();
    }
  }, { passive: true });

  viewport.addEventListener('touchend', () => {
    cameraPinchStart = null;
    cameraTouchStart = null;

    setTimeout(() => {
      const indicator = document.getElementById('cameraZoomIndicator');
      if (indicator) indicator.style.display = 'none';
    }, 1000);
  });
}

function applyZoom() {
  const video = document.getElementById('cameraVideo');
  if (!video) return;

  // ⚡ Apply zoom via CSS transform
  video.style.transform = `scale(${cameraZoom})`;

  // ⚡ Or try native zoom if supported
  if (cameraStream) {
    const track = cameraStream.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities?.();
      if (capabilities?.zoom) {
        const zoom = Math.min(capabilities.zoom.max, cameraZoom);
        track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
      }
    }
  }
}

function showZoomIndicator() {
  const indicator = document.getElementById('cameraZoomIndicator');
  const value = document.getElementById('cameraZoomValue');

  if (indicator) indicator.style.display = 'flex';
  if (value) value.textContent = `${cameraZoom.toFixed(1)}x`;
}

window.closeCamera = function() {
  const modal = document.getElementById('chatCameraModal');
  if (modal) modal.style.display = 'none';

  document.body.style.overflow = '';

  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }

  if (cameraCapturedBlob) {
    const preview = document.getElementById('cameraPreview');
    if (preview?.src) URL.revokeObjectURL(preview.src);
    cameraCapturedBlob = null;
  }

  // ⚡ Reset state
  cameraFlashOn = false;
  cameraZoom = 1;
  cameraPinchStart = null;
  cameraTouchStart = null;
};

// ═══════════════════════════════════════════════════════
//   ⚡ Poll
// ═══════════════════════════════════════════════════════

window.openPollModal = function() {
  let modal = document.getElementById('pollModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pollModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:560px;max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>📊 تصويت جديد</h2>
        <button class="modal-close" id="closePollBtn">✕</button>
      </div>

      <div class="modal-body" style="flex:1;overflow-y:auto;">
        <div class="form-row">
          <label>السؤال *</label>
          <input type="text" id="pollQuestion" placeholder="اكتب سؤالك..." maxlength="200" />
        </div>

        <div class="form-row">
          <label>الخيارات (2-10) *</label>
          <div id="pollOptionsList"></div>
          <button class="btn-secondary" id="addPollOptionBtn" style="margin-top:8px;">➕ إضافة خيار</button>
        </div>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="pollMultiple" />
          <label for="pollMultiple">السماح باختيار أكثر من خيار</label>
        </div>

        <div class="form-row checkbox-row">
          <input type="checkbox" id="pollAnonymous" />
          <label for="pollAnonymous">تصويت مجهول (إخفاء الأسماء)</label>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" id="cancelPollBtn">إلغاء</button>
        <button class="btn-primary" id="createPollBtn">📊 إنشاء التصويت</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  // ⚡ Initial options (2)
  const optionsList = document.getElementById('pollOptionsList');
  optionsList.innerHTML = '';
  addPollOption();
  addPollOption();

  document.getElementById('addPollOptionBtn').onclick = addPollOption;
  document.getElementById('closePollBtn').onclick = () => modal.style.display = 'none';
  document.getElementById('cancelPollBtn').onclick = () => modal.style.display = 'none';
  document.getElementById('createPollBtn').onclick = createPoll;
};

function addPollOption() {
  const list = document.getElementById('pollOptionsList');
  if (!list) return;

  const count = list.children.length;
  if (count >= 10) {
    alert('⚠️ الحد الأقصى 10 خيارات');
    return;
  }

  const idx = count + 1;
  const div = document.createElement('div');
  div.className = 'poll-option-row';
  div.innerHTML = `
    <input type="text" class="poll-option-input" placeholder="الخيار ${idx}" maxlength="100" />
    ${count >= 2 ? `<button class="poll-option-remove" title="حذف">✕</button>` : ''}
  `;

  const removeBtn = div.querySelector('.poll-option-remove');
  if (removeBtn) {
    removeBtn.onclick = () => {
      div.remove();
      renumberPollOptions();
    };
  }

  list.appendChild(div);
}

function renumberPollOptions() {
  const list = document.getElementById('pollOptionsList');
  if (!list) return;
  list.querySelectorAll('.poll-option-row').forEach((row, i) => {
    const input = row.querySelector('.poll-option-input');
    if (input) input.placeholder = `الخيار ${i + 1}`;
  });
}

async function createPoll() {
  const question = document.getElementById('pollQuestion')?.value.trim();
  const multiple = document.getElementById('pollMultiple')?.checked || false;
  const anonymous = document.getElementById('pollAnonymous')?.checked || false;

  const inputs = document.querySelectorAll('.poll-option-input');
  const options = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);

  if (!question) {
    alert('⚠️ اكتب السؤال');
    return;
  }
  if (options.length < 2) {
    alert('⚠️ لازم خيارين على الأقل');
    return;
  }

  try {
    const pollData = {
      Question: question,
      Options: options.map((text, i) => ({ id: `opt_${i}`, text, votes: [] })),
      Multiple: multiple,
      Anonymous: anonymous,
      CreatedBy: chatPerson.id,
      CreatedByName: getPersonFullName(chatPerson),
      CreatedAt: new Date().toISOString(),
      TotalVotes: 0
    };

    const messageData = {
      SenderID: chatPerson.id,
      SenderName: getPersonFullName(chatPerson),
      Type: 'poll',
      Poll: pollData,
      Text: `📊 تصويت: ${question}`,
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
        Text: `📊 ${question}`,
        Type: 'poll',
        SenderID: chatPerson.id,
        SenderName: getPersonFullName(chatPerson),
        SentAt: messageData.SentAt
      },
      LastMessageAt: messageData.SentAt
    });

    await sendChatNotification(chatActiveChat, messageData, []);

    document.getElementById('pollModal').style.display = 'none';
    window.cancelReply();

    showToast('📊 تم إنشاء التصويت');

  } catch (err) {
    console.error('❌ createPoll error:', err);
    alert('خطأ: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Poll — Vote Handler
// ═══════════════════════════════════════════════════════

window.votePoll = async function(msgId, optionId) {
  if (!msgId || !optionId || !chatActiveChatId) return;

  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg || !msg.Poll) return;

  const poll = msg.Poll;
  const isMultiple = poll.Multiple === true;

  try {
    // ⚡ جهّز الخيارات الجديدة
    const newOptions = poll.Options.map(opt => {
      const votes = Array.isArray(opt.votes) ? [...opt.votes] : [];

      if (isMultiple) {
        // ⚡ Multi: toggle
        if (opt.id === optionId) {
          const idx = votes.indexOf(chatPerson.id);
          if (idx === -1) votes.push(chatPerson.id);
          else votes.splice(idx, 1);
        }
      } else {
        // ⚡ Single: شيل صوّتي من كل الخيارات + ضيف هنا
        const idx = votes.indexOf(chatPerson.id);
        if (idx !== -1) votes.splice(idx, 1);

        if (opt.id === optionId) {
          votes.push(chatPerson.id);
        }
      }

      return { ...opt, votes };
    });

    const totalVotes = newOptions.reduce((sum, opt) => sum + opt.votes.length, 0);

    await updateDoc(doc(db, 'chats', chatActiveChatId, 'messages', msgId), {
      'Poll.Options': newOptions,
      'Poll.TotalVotes': totalVotes
    });

  } catch (err) {
    console.error('❌ votePoll error:', err);
  }
};

// ═══════════════════════════════════════════════════════
//   ⚡ Wallpaper
// ═══════════════════════════════════════════════════════

async function loadWallpapers() {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;

    const q = query(
      collection(db, 'chatWallpapers'),
      where('PersonID', '==', chatPerson.id)
    );
    const snap = await getDocs(q);

    wallpaperCache = {};
    snap.docs.forEach(d => {
      const data = d.data();
      wallpaperCache[data.ChatID] = data.Url;
    });
  } catch (err) {
    console.warn('⚠️ loadWallpapers error:', err.message);
  }
}

function applyWallpaper(chatId) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const url = wallpaperCache[chatId];

  if (url) {
    container.style.backgroundImage = `url('${url}')`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundAttachment = 'local';
  } else {
    container.style.backgroundImage = 'none';
  }
}

window.openWallpaperModal = function() {
  if (!chatActiveChatId) return;

  let modal = document.getElementById('wallpaperModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'wallpaperModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const currentUrl = wallpaperCache[chatActiveChatId] || '';

  const presetColors = [
    '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
    '#fef3c7', '#fed7aa', '#fecaca', '#fbcfe8',
    '#e9d5ff', '#ddd6fe', '#bfdbfe', '#a5f3fc',
    '#d1fae5', '#bbf7d0', '#fef9c3', '#fef08a',
    '#1e293b', '#0f172a', '#111827', '#1f2937'
  ];

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;max-height:85vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h2>🖼️ خلفية المحادثة</h2>
        <button class="modal-close" id="closeWallpaperBtn">✕</button>
      </div>

      <div class="modal-body" style="flex:1;overflow-y:auto;">

        <!-- ⚡ Upload -->
        <div class="wallpaper-section">
          <h3 class="wallpaper-title">📸 رفع صورة</h3>
          <button class="btn-primary" id="uploadWallpaperBtn">📤 رفع خلفية</button>
        </div>

        <!-- ⚡ Preset Colors -->
        <div class="wallpaper-section">
          <h3 class="wallpaper-title">🎨 خلفيات جاهزة</h3>
          <div class="wallpaper-grid">
            ${presetColors.map(c => `
              <button class="wallpaper-color ${currentUrl === c ? 'active' : ''}"
                      data-color="${c}"
                      style="background: ${c};"></button>
            `).join('')}
          </div>
        </div>

        <!-- ⚡ Remove -->
        ${currentUrl ? `
          <div class="wallpaper-section">
            <button class="btn-danger" id="removeWallpaperBtn">❌ إزالة الخلفية</button>
          </div>
        ` : ''}

      </div>
    </div>
  `;

  modal.style.display = 'flex';

  document.getElementById('closeWallpaperBtn').onclick = () => modal.style.display = 'none';
  document.getElementById('uploadWallpaperBtn').onclick = uploadWallpaper;

  // ⚡ Preset colors
  modal.querySelectorAll('.wallpaper-color').forEach(btn => {
    btn.onclick = () => setWallpaperColor(btn.dataset.color);
  });

  // ⚡ Remove
  const removeBtn = document.getElementById('removeWallpaperBtn');
  if (removeBtn) removeBtn.onclick = removeWallpaper;
};

async function uploadWallpaper() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/jpg,image/png,image/webp';

  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('⚠️ الحد الأقصى 5 MB');
      return;
    }

    try {
      const btn = document.getElementById('uploadWallpaperBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ جاري الرفع...';
      }

      if (typeof window.uploadPersonPhoto !== 'function') {
        throw new Error('خدمة الرفع غير متوفرة');
      }

      const result = await window.uploadPersonPhoto(file);

      await saveWallpaper(chatActiveChatId, result.url);

      applyWallpaper(chatActiveChatId);
      document.getElementById('wallpaperModal').style.display = 'none';
      showToast('🖼️ تم تعيين الخلفية');

    } catch (err) {
      console.error('❌ uploadWallpaper error:', err);
      alert('خطأ: ' + err.message);
    }
  };

  input.click();
}

async function setWallpaperColor(color) {
  try {
    await saveWallpaper(chatActiveChatId, color);
    applyWallpaper(chatActiveChatId);

    // ⚡ حدّث الـUI
    document.querySelectorAll('.wallpaper-color').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === color);
    });

    showToast('🎨 تم تعيين الخلفية');

  } catch (err) {
    console.error('❌ setWallpaperColor error:', err);
  }
}

async function removeWallpaper() {
  try {
    const wallpaperDocId = `${chatPerson.id}_${chatActiveChatId}`;
    await deleteDoc(doc(db, 'chatWallpapers', wallpaperDocId));

    delete wallpaperCache[chatActiveChatId];
    applyWallpaper(chatActiveChatId);

    document.getElementById('wallpaperModal').style.display = 'none';
    showToast('❌ تم إزالة الخلفية');

  } catch (err) {
    console.error('❌ removeWallpaper error:', err);
  }
}

async function saveWallpaper(chatId, url) {
  const wallpaperDocId = `${chatPerson.id}_${chatId}`;

  await setDoc(doc(db, 'chatWallpapers', wallpaperDocId), {
    PersonID: chatPerson.id,
    ChatID: chatId,
    Url: url,
    UpdatedAt: new Date().toISOString()
  });

  wallpaperCache[chatId] = url;
}

// ═══════════════════════════════════════════════════════
//   ⚡ Render Poll Item (in messages)
// ═══════════════════════════════════════════════════════

function renderPollItem(msg) {
  const poll = msg.Poll;
  if (!poll) return '';

  const totalVotes = poll.TotalVotes || 0;
  const myVotes = new Set();

  poll.Options.forEach(opt => {
    const votes = Array.isArray(opt.votes) ? opt.votes : [];
    if (votes.includes(chatPerson.id)) myVotes.add(opt.id);
  });

  const hasVoted = myVotes.size > 0;

  return `
    <div class="chat-poll">
      <div class="chat-poll-question">📊 ${escapeHtml(poll.Question)}</div>
      <div class="chat-poll-options">
        ${poll.Options.map(opt => {
          const votes = Array.isArray(opt.votes) ? opt.votes : [];
          const count = votes.length;
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyVote = myVotes.has(opt.id);

          return `
            <button class="chat-poll-option ${isMyVote ? 'voted' : ''}"
                    onclick="window.votePoll('${msg.id}', '${opt.id}')">
              <div class="chat-poll-bar" style="width: ${percent}%;"></div>
              <div class="chat-poll-content">
                <span class="chat-poll-text">
                  ${isMyVote ? '✅' : '⬜'} ${escapeHtml(opt.text)}
                </span>
                <span class="chat-poll-count">${count} (${percent}%)</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
      <div class="chat-poll-footer">
        <span>${totalVotes} صوت</span>
        ${poll.Multiple ? '<span>• متعدد</span>' : ''}
        ${poll.Anonymous ? '<span>• مجهول</span>' : ''}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
//   ⚡ Hooks — نضيفها للـrenderChatMain + renderMessageItem
// ═══════════════════════════════════════════════════════

// ⚡ احفظ الدوال الأصلية
const _originalRenderChatMain = renderChatMain;
const _originalRenderMessageItem = renderMessageItem;

// ⚡ Override renderChatMain — نضيف الإيموجي picker فقط
renderChatMain = function() {
  _originalRenderChatMain();

  // ⚡ أضف الـEmoji Picker container
  const inputWrapper = document.querySelector('.chat-input-wrapper');
  if (inputWrapper && !document.getElementById('chatEmojiPicker')) {
    const picker = document.createElement('div');
    picker.id = 'chatEmojiPicker';
    picker.className = 'chat-emoji-picker';
    picker.style.display = 'none';
    inputWrapper.appendChild(picker);
  }

  // ⚡ طبّق الـWallpaper
  if (typeof applyWallpaper === 'function' && chatActiveChatId) {
    applyWallpaper(chatActiveChatId);
  }
};

// ⚡ Override renderMessageItem — نضيف Poll + Wallpaper
renderMessageItem = function(msg) {
  // ⚡ لو Poll → استخدم renderPollItem
  if (msg.Type === 'poll' && msg.Poll) {
    const isMine = msg.SenderID === chatPerson.id;
    const sender = chatPeople[msg.SenderID];
    const senderName = msg.SenderName || getPersonFullName(sender) || 'غير معروف';
    const senderAvatar = getSenderAvatar(sender);
    const time = msg.SentAt ? formatTime(parseDate(msg.SentAt)) : '';
    const showSender = !isMine && chatActiveChat && (chatActiveChat.Type === 'group' || chatActiveChat.Type === 'channel');

    let readReceiptHtml = '';
    if (isMine) {
      const readBy = Array.isArray(msg.ReadBy) ? msg.ReadBy : [];
      const totalMembers = chatActiveChat.Type === 'direct'
        ? 1
        : Math.max(1, (chatActiveChat.Members || []).length - 1);
      const readCount = readBy.filter(id => id !== chatPerson.id).length;

      if (readCount === 0) {
        readReceiptHtml = '<span class="chat-read-receipt sent">✓</span>';
      } else if (readCount >= totalMembers) {
        readReceiptHtml = '<span class="chat-read-receipt read">✓✓</span>';
      } else {
        readReceiptHtml = '<span class="chat-read-receipt partial">✓✓</span>';
      }
    }

    return `
      <div class="chat-message ${isMine ? 'mine' : 'theirs'}"
           data-msg-id="${msg.id}"
           data-msg-mine="${isMine ? '1' : '0'}"
           data-msg-type="poll">
        ${!isMine ? `<div class="chat-message-avatar">${senderAvatar}</div>` : ''}
        <div class="chat-message-bubble">
          ${showSender ? `<div class="chat-message-sender">${escapeHtml(senderName)}</div>` : ''}
          ${renderPollItem(msg)}
          <div class="chat-message-meta">
            <span class="chat-message-time">${time}</span>
            ${readReceiptHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ⚡ باقي الرسائل → الدالة الأصلية
  return _originalRenderMessageItem(msg);
};

// ═══════════════════════════════════════════════════════
//   ⚡ Hook — تحميل الـWallpapers عند فتح شات
// ═══════════════════════════════════════════════════════

const _originalOpenChat = window.openChat;
window.openChat = async function(chatId) {
  await _originalOpenChat(chatId);

  // ⚡ حمّل الـwallpapers لو لسه مش محمّلة
  if (Object.keys(wallpaperCache).length === 0) {
    await loadWallpapers();
  }

  // ⚡ طبّق الخلفية
  applyWallpaper(chatId);
};

// ═══════════════════════════════════════════════════════
//   ⚡ Keyboard Shortcut — Escape لإغلاق Emoji Picker
// ═══════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (emojiPickerActive) closeEmojiPicker();
  }
});

// ═══════════════════════════════════════════════════════
//   ⚡ Chat Header Menu (⋮)
// ═══════════════════════════════════════════════════════

function showChatHeaderMenu(chat, isMuted, canManage) {
  // ⚡ اقفل أي menu مفتوح
  closeChatHeaderMenu();

  const menu = document.createElement('div');
  menu.id = 'chatHeaderMenu';
  menu.className = 'chat-header-menu';

  menu.innerHTML = `
    <button class="chat-header-menu-item" data-action="poll">
      <span class="chat-header-menu-icon">📊</span>
      <span>إنشاء تصويت</span>
    </button>

    <button class="chat-header-menu-item" data-action="wallpaper">
      <span class="chat-header-menu-icon">🖼️</span>
      <span>خلفية المحادثة</span>
    </button>

    <button class="chat-header-menu-item" data-action="mute">
      <span class="chat-header-menu-icon">${isMuted ? '🔔' : '🔕'}</span>
      <span>${isMuted ? 'إلغاء الكتم' : 'كتم المحادثة'}</span>
    </button>

    <button class="chat-header-menu-item" data-action="starred">
      <span class="chat-header-menu-icon">⭐</span>
      <span>المحفوظات</span>
    </button>

    ${canManage ? `
      <button class="chat-header-menu-item" data-action="settings">
        <span class="chat-header-menu-icon">⚙️</span>
        <span>إعدادات المجموعة</span>
      </button>
    ` : ''}
  `;

  // ⚡ ضيف في الهيدر (position relative)
  const headerActions = document.querySelector('.chat-header-actions');
  if (headerActions) {
    headerActions.style.position = 'relative';
    headerActions.appendChild(menu);
  }

  // ⚡ ربط الأزرار
  menu.querySelectorAll('.chat-header-menu-item').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      closeChatHeaderMenu();

      if (action === 'poll') {
        if (typeof window.openPollModal === 'function') window.openPollModal();
      } else if (action === 'wallpaper') {
        if (typeof window.openWallpaperModal === 'function') window.openWallpaperModal();
      } else if (action === 'mute') {
        window.toggleMuteChat(chat.id);
      } else if (action === 'starred') {
        if (typeof window.openStarredModal === 'function') window.openStarredModal();
      } else if (action === 'settings') {
        if (typeof window.openGroupSettings === 'function') window.openGroupSettings(chat.id);
      }
    };
  });

  // ⚡ اقفل عند الضغط خارج
  setTimeout(() => {
    document.addEventListener('click', closeChatHeaderMenuOnOutsideClick, { once: true });
  }, 100);
}

function closeChatHeaderMenu() {
  const menu = document.getElementById('chatHeaderMenu');
  if (menu) menu.remove();
}

function closeChatHeaderMenuOnOutsideClick(e) {
  const menu = document.getElementById('chatHeaderMenu');
  if (!menu) return;

  if (!menu.contains(e.target) && !e.target.closest('#chatMenuBtn')) {
    closeChatHeaderMenu();
  } else {
    // ⚡ لو الضغط جوه → نعيد التسجيل
    setTimeout(() => {
      document.addEventListener('click', closeChatHeaderMenuOnOutsideClick, { once: true });
    }, 100);
  }
}

window.closeChatHeaderMenu = closeChatHeaderMenu;

console.log('✅ chat.js loaded (full — phase 1 + 2 + 3 + 3-3)');
