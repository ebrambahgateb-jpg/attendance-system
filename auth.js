let currentUser = null;

function decodeJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')
  );
  return JSON.parse(jsonPayload);
}

function handleCredentialResponse(response) {
  const payload = decodeJwt(response.credential);
  const email = payload.email;
  const name = payload.name;

  console.log('Logged in as:', email);

  callLoginAPI(email, name);
}

function callLoginAPI(email, name) {
  showMessage('جاري التحقق من الحساب...', '');
  showScreen('loginScreen');

  fetch(`${CONFIG.API_URL}?action=login&email=${encodeURIComponent(email)}`)
    .then(res => res.json())
    .then(data => {
      if (!data.ok) {
        if (data.code === 'ACCOUNT_DISABLED') {
          showScreen('disabledScreen');
        } else {
          document.getElementById('deniedMessage').textContent = data.message;
          showScreen('deniedScreen');
        }
        return;
      }

      currentUser = {
        email: email,
        name: name,
        account: data.account,
        roles: data.roles,
        person: data.person
      };

      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      if (data.roles.length === 0) {
        document.getElementById('deniedMessage').textContent = 'لا يوجد دور مخصص لحسابك';
        showScreen('deniedScreen');
        return;
      }

      if (data.roles.length === 1) {
        goToDashboard(data.roles[0]);
      } else {
        showRoleSelection(data.roles);
      }
    })
    .catch(err => {
      console.error(err);
      showMessage('حدث خطأ في الاتصال بالسيرفر', 'error');
    });
}

function showRoleSelection(roles) {
  const list = document.getElementById('rolesList');
  list.innerHTML = '';

  const icons = {
    'Owner': '👑',
    'Admin': '🛠️',
    'Scanner': '📷',
    'User': '👤'
  };

  roles.forEach(role => {
    const btn = document.createElement('button');
    btn.className = 'role-btn';
    btn.innerHTML = `<span class="role-icon">${icons[role] || '👤'}</span> ${role}`;
    btn.onclick = () => goToDashboard(role);
    list.appendChild(btn);
  });

  showScreen('roleScreen');
}

function goToDashboard(role) {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  user.selectedRole = role;
  localStorage.setItem('currentUser', JSON.stringify(user));

  window.location.href = 'pages/dashboard.html';
}

function logout() {
  localStorage.removeItem('currentUser');
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
  location.reload();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function showMessage(msg, type) {
  const el = document.getElementById('loginMessage');
  el.textContent = msg;
  el.className = 'message ' + (type || '');
}