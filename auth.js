// ─── auth.js — Login / register wall ───────────────────────────────────────

const Auth = (() => {

  function showAuthScreen() {
    document.getElementById('appShell').classList.add('hidden');
    const el = document.getElementById('authScreen');
    el.classList.remove('hidden');
    renderLogin(el);
  }

  function hideAuthScreen() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
  }

  function renderLogin(el) {
    el.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">Ledger</div>
        <div class="auth-sub">Personal Finance</div>

        <div class="auth-tabs">
          <button class="auth-tab active" id="tabLogin">Sign in</button>
          <button class="auth-tab" id="tabRegister">Create account</button>
        </div>

        <div id="authForm">
          ${loginForm()}
        </div>

        <div id="authError" class="auth-error hidden"></div>
        <div id="authSuccess" class="auth-success hidden"></div>
      </div>
    `;

    document.getElementById('tabLogin')?.addEventListener('click', () => {
      document.getElementById('tabLogin').classList.add('active');
      document.getElementById('tabRegister').classList.remove('active');
      document.getElementById('authForm').innerHTML = loginForm();
      bindLoginEvents();
    });
    document.getElementById('tabRegister')?.addEventListener('click', () => {
      document.getElementById('tabRegister').classList.add('active');
      document.getElementById('tabLogin').classList.remove('active');
      document.getElementById('authForm').innerHTML = registerForm();
      bindRegisterEvents();
    });

    bindLoginEvents();
  }

  function loginForm() {
    return `
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" id="authEmail" placeholder="you@example.com" autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" class="form-input" id="authPassword" placeholder="••••••••" autocomplete="current-password" />
      </div>
      <button class="btn btn-primary auth-submit" id="loginBtn">Sign in</button>
      <div style="text-align:center;margin-top:0.75rem;">
        <button class="auth-link" id="forgotBtn">Forgot password?</button>
      </div>
    `;
  }

  function registerForm() {
    return `
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" id="authEmail" placeholder="you@example.com" autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" class="form-input" id="authPassword" placeholder="min. 6 characters" autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label class="form-label">Confirm password</label>
        <input type="password" class="form-input" id="authConfirm" placeholder="••••••••" autocomplete="new-password" />
      </div>
      <button class="btn btn-primary auth-submit" id="registerBtn">Create account</button>
    `;
  }

  function showError(msg) {
    const el = document.getElementById('authError');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('authSuccess')?.classList.add('hidden');
  }

  function showSuccess(msg) {
    const el = document.getElementById('authSuccess');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    document.getElementById('authError')?.classList.add('hidden');
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait…' : btn.dataset.label || btn.textContent;
  }

  function bindLoginEvents() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.dataset.label = 'Sign in';

    document.getElementById('authPassword')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('loginBtn')?.click();
    });

    document.getElementById('loginBtn')?.addEventListener('click', async () => {
      const email    = document.getElementById('authEmail')?.value.trim();
      const password = document.getElementById('authPassword')?.value;
      if (!email || !password) { showError('Please fill in all fields.'); return; }

      setLoading('loginBtn', true);
      try {
        await FB.login(email, password);
        // onAuthChange in app.js handles the rest
      } catch (e) {
        setLoading('loginBtn', false);
        showError(friendlyError(e.code));
      }
    });

    document.getElementById('forgotBtn')?.addEventListener('click', async () => {
      const email = document.getElementById('authEmail')?.value.trim();
      if (!email) { showError('Enter your email address first.'); return; }
      try {
        await FB.resetPassword(email);
        showSuccess('Password reset email sent. Check your inbox.');
      } catch (e) {
        showError(friendlyError(e.code));
      }
    });
  }

  function bindRegisterEvents() {
    const regBtn = document.getElementById('registerBtn');
    if (regBtn) regBtn.dataset.label = 'Create account';

    document.getElementById('registerBtn')?.addEventListener('click', async () => {
      const email    = document.getElementById('authEmail')?.value.trim();
      const password = document.getElementById('authPassword')?.value;
      const confirm  = document.getElementById('authConfirm')?.value;
      if (!email || !password || !confirm) { showError('Please fill in all fields.'); return; }
      if (password !== confirm) { showError('Passwords do not match.'); return; }
      if (password.length < 6)  { showError('Password must be at least 6 characters.'); return; }

      setLoading('registerBtn', true);
      try {
        await FB.register(email, password);
        // onAuthChange handles the rest
      } catch (e) {
        setLoading('registerBtn', false);
        showError(friendlyError(e.code));
      }
    });
  }

  function friendlyError(code) {
    const map = {
      'auth/user-not-found':      'No account found with that email.',
      'auth/wrong-password':      'Incorrect password.',
      'auth/email-already-in-use':'An account with that email already exists.',
      'auth/invalid-email':       'Please enter a valid email address.',
      'auth/weak-password':       'Password must be at least 6 characters.',
      'auth/too-many-requests':   'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  }

  function renderUserBadge(user) {
    const el = document.getElementById('userBadge');
    if (!el) return;
    el.innerHTML = `
      <span class="user-email">${user.email}</span>
      <button class="btn-ghost btn-sm" id="logoutBtn">Sign out</button>
    `;
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await FB.logout();
    });
  }

  return { showAuthScreen, hideAuthScreen, renderUserBadge };
})();
