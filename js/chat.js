// ═══════════════════════════════════════════════════════
//   Chat — Internal Messaging System
//   ⚡ 1-to-1 + Groups + Channels + Realtime
//   ⚡ Mobile: Sidebar → Chat → Back button + Swipe
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
  setDoc
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

// ═══ Constants ═══
const MAX_MESSAGE_LENGTH = 2000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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

    // ⚡ هيّئ القنوات الافتراضية
    await ensureDefaultChannels();

    // ⚡ ارسم الصفحة
    renderChatPage(area);

    // ⚡ ابدأ Listener
    startChatsListener();

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

  // ⚡ ربط الأزرار
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

  // ⚡ اربط الأحداث بـaddEventListener
  list.querySelectorAll('.chat-item').forEach(item => {
    item.onclick = () => window.openChat(item.dataset.chatId);
  });
}

function renderChatListItem(chat) {
  const isActive = chat.id === chatActiveChatId;
  const displayName = getChatDisplayName(chat);
  const avatar = getChatAvatar(chat);
  const lastMsg = chat.LastMessage;
  const lastMsgText = lastMsg ? lastMsg.Text || (lastMsg.Type === 'image' ? '📷 صورة' : '') : 'لا يوجد رسائل';
  const lastMsgTime = lastMsg?.SentAt ? formatRelativeTime(parseDate(lastMsg.SentAt)) : '';

  let typeBadge = '';
  if (chat.Type === 'channel' || chat.IsDefault) {
    typeBadge = '<span class="chat-item-badge">📢</span>';
  } else if (chat.Type === 'group') {
    typeBadge = '<span class="chat-item-badge">👥</span>';
  }

  return `
    <div class="chat-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
      <div class="chat-item-avatar">${avatar}</div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <div class="chat-item-name">${typeBadge} ${escapeHtml(displayName)}</div>
          ${lastMsgTime ? `<div class="chat-item-time">${lastMsgTime}</div>` : ''}
        </div>
        <div class="chat-item-preview">${escapeHtml(lastMsgText)}</div>
      </div>
    </div>
  `;
}

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

// ═══════════════════════════════════════════════════════
//   ⚡ Mobile Helper — Show/Hide Sidebar
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

  try {
    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    if (!chatDoc.exists()) {
      alert('❌ المحادثة غير موجودة');
      return;
    }

    chatActiveChat = { id: chatDoc.id, ...chatDoc.data() };

    renderChatMain();
    startMessagesListener(chatId);

    // ⚡ على الموبايل: اظهر الشات، اخفي Sidebar
    if (isMobile()) showChatMobile();

  } catch (err) {
    console.error('❌ openChat error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   Render Chat Main
// ═══════════════════════════════════════════════════════

function renderChatMain() {
  const main = document.getElementById('chatMain');
  if (!main || !chatActiveChat) return;

  const chat = chatActiveChat;
  const displayName = getChatDisplayName(chat);
  const isReadOnly = chat.ReadOnly && !['Owner', 'Admin'].includes(chatWorkspace);

  main.innerHTML = `
    <div class="chat-header">
      <button class="chat-back-btn" id="chatBackBtn" type="button" title="رجوع">←</button>
      <div class="chat-header-info">
        <div class="chat-header-avatar">${getChatAvatar(chat)}</div>
        <div class="chat-header-details">
          <div class="chat-header-name">${escapeHtml(displayName)}</div>
          <div class="chat-header-status">
            ${chat.Type === 'direct' ? 'محادثة فردية' :
              chat.Type === 'group' ? `${(chat.Members || []).length} عضو` :
              chat.Description ? escapeHtml(chat.Description) : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="chat-messages" id="chatMessages">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>

    ${isReadOnly ? `
      <div class="chat-readonly">🔒 هذه القناة للقراءة فقط</div>
    ` : `
      <div class="chat-input-wrapper">
        <div class="chat-input-bar">
          <button class="chat-input-btn" id="chatImageBtn" type="button" title="صورة">📎</button>
          <input type="text" id="chatInput" class="chat-input" placeholder="اكتب رسالة..." autocomplete="off" maxlength="${MAX_MESSAGE_LENGTH}" />
          <button class="chat-input-btn chat-send-btn" id="chatSendBtn" type="button" title="إرسال">📤</button>
        </div>
      </div>
    `}
  `;

  // ⚡ ⚡ ⚡ ربط زر الرجوع — مباشر بدون onclick inline
  const backBtn = document.getElementById('chatBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 Back button clicked');
      showSidebarMobile();
    });
  }

  // ⚡ ربط زر الصورة
  const imageBtn = document.getElementById('chatImageBtn');
  if (imageBtn) imageBtn.onclick = window.openChatImagePicker;

  // ⚡ ربط زر الإرسال
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.onclick = window.sendChatMessage;

  // ⚡ input
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.sendChatMessage();
      }
    });
    setTimeout(() => input.focus(), 100);
  }

  // ⚡ ⚡ ⚡ Swipe للرجوع (اسحب من شمال ليمين)
  setupSwipeBack();
}

// ═══════════════════════════════════════════════════════
//   ⚡ Swipe Back (Mobile)
// ═══════════════════════════════════════════════════════

function setupSwipeBack() {
  const main = document.getElementById('chatMain');
  if (!main) return;

  // ⚡ شيل الـlistener القديم
  if (main._swipeHandler) {
    main.removeEventListener('touchstart', main._swipeHandler.start);
    main.removeEventListener('touchmove', main._swipeHandler.move);
    main.removeEventListener('touchend', main._swipeHandler.end);
  }

  let startX = 0;
  let startY = 0;
  let isSwiping = false;

  const start = (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = false;
  };

  const move = (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX;
    const diffY = Math.abs(currentY - startY);

    // ⚡ لازم الحركة تكون أفقية (يمين) + من أول الشاشة (20% الأولى)
    if (diffX > 10 && diffY < 50 && startX < window.innerWidth * 0.3) {
      isSwiping = true;
    }
  };

  const end = (e) => {
    if (!isMobile()) return;
    if (!isSwiping) return;

    const endX = e.changedTouches[0].clientX;
    const diffX = endX - startX;

    // ⚡ Swipe يمين > 80px → رجوع
    if (diffX > 80) {
      console.log('📱 Swipe back detected');
      showSidebarMobile();
    }

    isSwiping = false;
  };

  main.addEventListener('touchstart', start, { passive: true });
  main.addEventListener('touchmove', move, { passive: true });
  main.addEventListener('touchend', end, { passive: true });

  main._swipeHandler = { start, move, end };
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

    setTimeout(() => {
      const messagesEl = document.getElementById('chatMessages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 100);
  }, (err) => {
    console.warn('⚠️ Messages listener error:', err.message);
  });
}

function renderMessages() {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  if (chatMessages.length === 0) {
    container.innerHTML = `
      <div class="chat-messages-empty">
        <div class="chat-messages-empty-icon">👋</div>
        <p>ابدأ المحادثة</p>
      </div>
    `;
    return;
  }

  container.innerHTML = chatMessages.map(msg => {
    const isMine = msg.SenderID === chatPerson.id;
    const sender = chatPeople[msg.SenderID];
    const senderName = msg.SenderName || getPersonFullName(sender) || 'غير معروف';
    const senderAvatar = getSenderAvatar(sender);
    const time = msg.SentAt ? formatTime(parseDate(msg.SentAt)) : '';

    let contentHtml = '';
    if (msg.Type === 'image') {
      contentHtml = `
        <div class="chat-message-image">
          <img src="${escapeHtml(msg.ImageURL)}" alt="" loading="lazy" onclick="window.openChatImage('${escapeHtml(msg.ImageURL)}')" />
        </div>
      `;
    } else {
      contentHtml = `<div class="chat-message-text">${escapeHtml(msg.Text || '')}</div>`;
    }

    return `
      <div class="chat-message ${isMine ? 'mine' : 'theirs'}">
        ${!isMine ? `<div class="chat-message-avatar">${senderAvatar}</div>` : ''}
        <div class="chat-message-bubble">
          ${!isMine && chatActiveChat.Type !== 'direct' ? `<div class="chat-message-sender">${escapeHtml(senderName)}</div>` : ''}
          ${contentHtml}
          <div class="chat-message-time">${time}</div>
        </div>
      </div>
    `;
  }).join('');
}

function getSenderAvatar(sender) {
  if (sender?.PhotoURL) return `<img src="${sender.PhotoURL}" alt="" />`;
  return getInitial(sender);
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

  input.value = '';
  input.focus();

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

  // ⚡ اربط
  modal.querySelectorAll('.new-chat-person').forEach(el => {
    el.onclick = () => window.startDirectChat(el.dataset.personId);
  });

  setTimeout(() => searchInput.focus(), 100);
};

function renderNewChatPerson(p) {
  const name = getPersonFullName(p);
  const avatar = p.PhotoURL ? `<img src="${p.PhotoURL}" alt="" />` : getInitial(p);

  return `
    <div class="new-chat-person" data-person-id="${p.id}">
      <div class="new-chat-avatar">${avatar}</div>
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

    // ⚡ أعد الربط
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

// ═══ Expose ═══
window.loadChatPage = loadChatPage;
window.showSidebarMobile = showSidebarMobile;
window.closeChatMobile = showSidebarMobile; // ⚡ للتوافق
