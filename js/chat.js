// ═══════════════════════════════════════════════════════
//   Chat — Internal Messaging System
//   ⚡ 1-to-1 + Groups + Channels + Realtime
// ═══════════════════════════════════════════════════════

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
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
  {
    id: 'general',
    Name: '💬 الشات العام',
    Type: 'channel',
    Description: 'شات عام لكل الأعضاء',
    ReadOnly: false
  },
  {
    id: 'announcements',
    Name: '📢 الإعلانات',
    Type: 'channel',
    Description: 'إعلانات الإدارة',
    ReadOnly: true
  }
];

// ═══════════════════════════════════════════════════════
//   Load Page
// ═══════════════════════════════════════════════════════

async function loadChatPage(area) {
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري التحميل...</div></div>';

  try {
    // ⚡ 1. حمّل المستخدم
    chatUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!chatUser) {
      window.location.href = '../index.html';
      return;
    }

    chatWorkspace = chatUser.currentWorkspace || chatUser.selectedRole || 'User';

    // ⚡ 2. حمّل الشخص (PersonID)
    chatPerson = null;
    if (chatUser.personId) {
      const pDoc = await getDoc(doc(db, COLLECTIONS.PEOPLE, chatUser.personId));
      if (pDoc.exists()) chatPerson = { id: pDoc.id, ...pDoc.data() };
    }

    if (!chatPerson && chatUser.email) {
      const q = query(
        collection(db, COLLECTIONS.PEOPLE),
        where('Email', '==', chatUser.email)
      );
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
          <p>لم يتم ربط حسابك بأي شخص في النظام.</p>
          <p>تواصل مع المسؤول لربط حسابك.</p>
        </div>
      `;
      return;
    }

    // ⚡ 3. حمّل كل الأشخاص
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

    // ⚡ 4. هيّئ القنوات الافتراضية
    await ensureDefaultChannels();

    // ⚡ 5. ارسم الصفحة
    renderChatPage(area);

       // ⚡ 6. ابدأ الـRealtime Listener
    startChatsListener();

    // ⚡ ملاحظة: مفيش فتح تلقائي — المستخدم يختار بنفسه

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
      const data = {
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
      };

      try {
        await setDoc(chatRef, data);
        console.log(`✅ Created default channel: ${ch.Name}`);
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
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">
          <div class="chat-search-box">
            <input type="text" id="chatSearchInput" placeholder="🔍 ابحث..." />
          </div>
          <div class="chat-sidebar-actions">
            <button class="chat-new-btn" onclick="openNewChatModal()" title="محادثة جديدة">
              ✏️
            </button>
            ${isAdmin ? `
              <button class="chat-new-group-btn" onclick="openNewGroupModal()" title="مجموعة جديدة">
                ➕
              </button>
            ` : ''}
          </div>
        </div>

        <div class="chat-tabs-filters">
          <button class="chat-filter-btn active" data-filter="all">الكل</button>
          <button class="chat-filter-btn" data-filter="direct">💬 فردي</button>
          <button class="chat-filter-btn" data-filter="group">👥 مجموعات</button>
          <button class="chat-filter-btn" data-filter="channel">📢 قنوات</button>
        </div>

        <div class="chat-list" id="chatList">
          <div class="loading-state">
            <div class="spinner"></div>
          </div>
        </div>
      </div>

      <div class="chat-main" id="chatMain">
        <div class="chat-empty-state">
          <div class="chat-empty-icon">💬</div>
          <h3>اختر محادثة للبدء</h3>
          <p>أو ابدأ محادثة جديدة</p>
        </div>
      </div>
    </div>
  `;

  setupChatFilters();
  setupChatSearch();
}

function setupChatFilters() {
  document.querySelectorAll('.chat-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.chat-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderChatList();
    };
  });
}

function setupChatSearch() {
  const input = document.getElementById('chatSearchInput');
  if (input) {
    input.addEventListener('input', () => renderChatList());
  }
}

// ═══════════════════════════════════════════════════════
//   Chats Listener (Realtime)
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

        // ⚡ القنوات: الكل يشوف
        if (chat.Type === 'channel' || chat.IsDefault) {
          chatConversations.push(chat);
          return;
        }

        // ⚡ 1-to-1 والمجموعات: بس الـMembers
        const members = Array.isArray(chat.Members) ? chat.Members : [];
        if (members.includes(chatPerson.id)) {
          chatConversations.push(chat);
        }
      });

      // ⚡ رتب: أحدث رسالة أول
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
    filtered = filtered.filter(c => {
      const name = getChatDisplayName(c).toLowerCase();
      return name.includes(searchTerm);
    });
  }

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="chat-list-empty">
        <div class="chat-list-empty-icon">💬</div>
        <p>لا يوجد محادثات</p>
        <button class="btn-primary" onclick="openNewChatModal()">ابدأ محادثة</button>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(chat => renderChatListItem(chat)).join('');
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
    <div class="chat-item ${isActive ? 'active' : ''}" onclick="openChat('${chat.id}')" data-chat-id="${chat.id}">
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

  if (chat.Type === 'group') {
    return '👥';
  }

  if (chat.Type === 'direct') {
    const otherId = (chat.Members || []).find(id => id !== chatPerson.id);
    const other = chatPeople[otherId];

    if (other?.PhotoURL) {
      return `<img src="${other.PhotoURL}" alt="" />`;
    }

    return getInitial(other);
  }

  return '💬';
}

// ═══════════════════════════════════════════════════════
//   Open Chat
// ═══════════════════════════════════════════════════════

window.openChat = async function(chatId) {
  chatActiveChatId = chatId;

  // ⚡ حدّد الـactive في القائمة
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('active', item.dataset.chatId === chatId);
  });

  // ⚡ اقفل listener قديم
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

    // ⚡ ارسم المحادثة
    renderChatMain();
    startMessagesListener(chatId);

    // ⚡ على الموبايل: اخفي الـSidebar + اظهر المحادثة
    if (window.innerWidth <= 768) {
      const sidebar = document.querySelector('.chat-sidebar');
      const main = document.querySelector('.chat-main');

      if (sidebar) sidebar.classList.add('hidden-mobile');
      if (main) main.classList.add('active-mobile');
    }

  } catch (err) {
    console.error('❌ openChat error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ⚡ الرجوع للـSidebar على الموبايل
window.closeChatMobile = function() {
  const sidebar = document.querySelector('.chat-sidebar');
  const main = document.querySelector('.chat-main');

  if (sidebar) sidebar.classList.remove('hidden-mobile');
  if (main) main.classList.remove('active-mobile');
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
      <button class="chat-back-btn" onclick="closeChatMobile()">←</button>
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
      <div class="loading-state">
        <div class="spinner"></div>
      </div>
    </div>

    ${isReadOnly ? `
      <div class="chat-readonly">
        🔒 هذه القناة للقراءة فقط
      </div>
    ` : `
      <div class="chat-input-wrapper">
        <div class="chat-input-bar">
          <button class="chat-input-btn" onclick="openChatImagePicker()" title="صورة">📎</button>
          <input type="text" id="chatInput" class="chat-input" placeholder="اكتب رسالة..." autocomplete="off" maxlength="${MAX_MESSAGE_LENGTH}" />
          <button class="chat-input-btn chat-send-btn" onclick="sendChatMessage()" title="إرسال">📤</button>
        </div>
      </div>
    `}
  `;

  setupChatInput();
}

window.closeChatMobile = function() {
  const sidebar = document.querySelector('.chat-sidebar');
  if (sidebar) sidebar.classList.remove('hidden-mobile');
};

// ═══════════════════════════════════════════════════════
//   Messages Listener (Realtime)
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
        <div class="chat-message-image" onclick="openChatImage('${escapeHtml(msg.ImageURL)}')">
          <img src="${msg.ImageURL}" alt="" loading="lazy" />
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
  if (sender?.PhotoURL) {
    return `<img src="${sender.PhotoURL}" alt="" />`;
  }
  return getInitial(sender);
}

// ═══════════════════════════════════════════════════════
//   Send Message
// ═══════════════════════════════════════════════════════

function setupChatInput() {
  const input = document.getElementById('chatInput');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  input.focus();
}

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

    // ⚡ حدّث آخر رسالة
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
//   New Chat Modal (1-to-1)
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
        <button class="modal-close" onclick="closeNewChatModal()">✕</button>
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

  const searchInput = document.getElementById('newChatSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const list = document.getElementById('newChatPeople');
      if (!list) return;

      const filtered = activePeople.filter(p => {
        const name = getPersonFullName(p).toLowerCase();
        return name.includes(term);
      });

      list.innerHTML = filtered.map(p => renderNewChatPerson(p)).join('') ||
        '<p style="text-align:center;color:#94a3b8;padding:20px;">لا يوجد نتائج</p>';
    });

    searchInput.focus();
  }
};

function renderNewChatPerson(p) {
  const name = getPersonFullName(p);
  const avatar = p.PhotoURL
    ? `<img src="${p.PhotoURL}" alt="" />`
    : getInitial(p);

  return `
    <div class="new-chat-person" onclick="startDirectChat('${p.id}')">
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

  closeNewChatModal();

  try {
    const existing = chatConversations.find(c =>
      c.Type === 'direct' &&
      (c.Members || []).includes(chatPerson.id) &&
      (c.Members || []).includes(otherPersonId)
    );

    if (existing) {
      openChat(existing.id);
      return;
    }

    const otherPerson = chatPeople[otherPersonId];
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

    setTimeout(() => openChat(docRef.id), 500);

  } catch (err) {
    console.error('❌ startDirectChat error:', err);
    alert('خطأ: ' + err.message);
  }
};

// ═══════════════════════════════════════════════════════
//   New Group Modal (Owner/Admin only)
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
        <button class="modal-close" onclick="closeNewGroupModal()">✕</button>
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
        <button class="btn-secondary" onclick="closeNewGroupModal()">إلغاء</button>
        <button class="btn-primary" onclick="createGroup()">👥 إنشاء</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const searchInput = document.getElementById('newGroupSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const list = document.getElementById('newGroupPeople');
      if (!list) return;

      const filtered = activePeople.filter(p =>
        getPersonFullName(p).toLowerCase().includes(term)
      );

      list.innerHTML = filtered.map(p => renderNewGroupPerson(p)).join('') ||
        '<p style="text-align:center;color:#94a3b8;padding:20px;">لا يوجد نتائج</p>';
    });
  }

  // ⚡ Counting
  setTimeout(() => {
    document.querySelectorAll('#newGroupPeople input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateGroupCount);
    });
  }, 100);
};

function renderNewGroupPerson(p) {
  const name = getPersonFullName(p);
  const avatar = p.PhotoURL
    ? `<img src="${p.PhotoURL}" alt="" />`
    : getInitial(p);

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
    // ⚡ ضيف نفسه كعضو وكـAdmin
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

    closeNewGroupModal();
    setTimeout(() => openChat(docRef.id), 500);

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
