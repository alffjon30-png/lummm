// Lumina Literature — authentication (Xano /auth/*)
//
// Wires signup / login / session-restore / logout into the existing topbar.
// Does NOT touch the books, wings, search, or catalog architecture — it only
// injects its own modal + account menu and reads/writes a single session token.
//
// Token storage: sessionStorage (per the documented security posture in
// CLAUDE.md — never localStorage). Survives page refresh and same-tab
// navigation across the multi-page site, which keeps the user logged in.

// Auth lives in its OWN Xano API group (api:WitMFOZH), separate from the
// books group (api:nFkvWAyl). Same host, so no CSP change is needed.
// Override with VITE_XANO_AUTH_BASE if you spin up a different workspace.
const AUTH_BASE = import.meta.env.VITE_XANO_AUTH_BASE
  || 'https://x8ki-letl-twmt.n7.xano.io/api:WitMFOZH';

const TOKEN_KEY = 'lumina_auth_token';

/* ------------------------------------------------------------------ *
 * Token storage
 * ------------------------------------------------------------------ */

function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(token) {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
}
function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

/* ------------------------------------------------------------------ *
 * State + subscribers
 * ------------------------------------------------------------------ */

let currentUser = null;
const listeners = new Set();

export function getCurrentUser() {
  return currentUser;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  fn(currentUser);
  return () => listeners.delete(fn);
}

function setUser(user) {
  currentUser = user || null;
  listeners.forEach((fn) => {
    try { fn(currentUser); } catch (err) { console.error('[auth] listener failed', err); }
  });
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

// Xano returns the auth token under one of a few possible keys depending on
// the function-stack wiring; accept whichever is present.
function extractToken(data) {
  if (!data || typeof data !== 'object') return '';
  const t = data.authToken || data.auth_token || data.token || data.jwt;
  return typeof t === 'string' ? t : '';
}

async function readError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body && (body.message || body.error || body.code) ? String(body.message || body.error || body.code) : '';
  } catch {
    /* non-JSON body */
  }
  return detail;
}

async function postAuth(path, payload) {
  let res;
  try {
    res = await fetch(`${AUTH_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    throw new Error('The archive is unreachable. Check your connection and try again.');
  }

  if (!res.ok) {
    const detail = await readError(res);
    if (res.status === 401 || res.status === 403) {
      throw new Error(detail || 'Those credentials were not recognised.');
    }
    if (res.status === 400 || res.status === 422) {
      throw new Error(detail || 'Please check the details you entered.');
    }
    throw new Error(detail || `The archive responded with an error (${res.status}).`);
  }
  return res.json();
}

export async function signup({ name, email, password }) {
  // The Xano signup stack requires a third param literally named `field_value`
  // (it does NOT persist as the user's name — /auth/me returns name:"" — but it
  // is required, so we route the collected name into it to satisfy the contract).
  const payload = { email, password, field_value: name || '' };
  const data = await postAuth('/auth/signup', payload);
  const token = extractToken(data);
  if (!token) throw new Error('Signup succeeded but no session token was returned.');
  setToken(token);
  const user = await fetchMe();
  return user;
}

export async function login({ email, password }) {
  const data = await postAuth('/auth/login', { email, password });
  const token = extractToken(data);
  if (!token) throw new Error('Login succeeded but no session token was returned.');
  setToken(token);
  const user = await fetchMe();
  return user;
}

// GET /auth/me with the bearer token. Throws on network/parse error.
// Returns null (and clears the token) on 401/403 — i.e. token expired/invalid.
export async function fetchMe() {
  const token = getToken();
  if (!token) { setUser(null); return null; }

  let res;
  try {
    res = await fetch(`${AUTH_BASE}/auth/me`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch (networkErr) {
    throw new Error('The archive is unreachable.');
  }

  if (res.status === 401 || res.status === 403) {
    clearToken();
    setUser(null);
    return null;
  }
  if (!res.ok) throw new Error(`Xano /auth/me returned ${res.status}`);

  const user = await res.json();
  setUser(user);
  return user;
}

export function logout() {
  clearToken();
  setUser(null);
}

/* ------------------------------------------------------------------ *
 * UI
 * ------------------------------------------------------------------ */

const ICON = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

function svg(markup) {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = markup; // trusted, hard-coded SVG only
  return tmpl.content.cloneNode(true);
}

function userDisplayName(user) {
  if (!user || typeof user !== 'object') return '';
  return String(user.name || user.full_name || user.username || user.email || '').trim();
}

function userEmail(user) {
  if (!user || typeof user !== 'object') return '';
  return String(user.email || '').trim();
}

function firstName(user) {
  const name = userDisplayName(user);
  return name ? name.split(/\s+/)[0] : '';
}

function initial(user) {
  const name = userDisplayName(user);
  return name ? name.charAt(0).toUpperCase() : '·';
}

// Build the centered login / signup modal once and return controllers.
function buildModal() {
  const overlay = document.createElement('div');
  overlay.className = 'auth-modal-overlay';
  overlay.dataset.open = 'false';
  overlay.setAttribute('aria-hidden', 'true');

  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Account access');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'auth-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(svg(ICON.close));

  const eyebrow = document.createElement('div');
  eyebrow.className = 'auth-eyebrow';
  eyebrow.textContent = 'Lumina Literature';

  const heading = document.createElement('h2');
  heading.className = 'auth-heading';

  const subhead = document.createElement('p');
  subhead.className = 'auth-subhead';

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'auth-tabs';
  const tabLogin = document.createElement('button');
  tabLogin.type = 'button';
  tabLogin.className = 'auth-tab';
  tabLogin.textContent = 'Sign In';
  const tabSignup = document.createElement('button');
  tabSignup.type = 'button';
  tabSignup.className = 'auth-tab';
  tabSignup.textContent = 'Create Account';
  tabs.append(tabLogin, tabSignup);

  // Form
  const form = document.createElement('form');
  form.className = 'auth-form';
  form.setAttribute('novalidate', '');

  const nameField = buildField('auth-name', 'Name', 'text', 'name', { autocomplete: 'name', maxlength: 80 });
  const emailField = buildField('auth-email', 'Email', 'email', 'email', { autocomplete: 'email', maxlength: 120, required: true });
  const passwordField = buildField('auth-password', 'Password', 'password', 'password', { autocomplete: 'current-password', maxlength: 200, required: true, minlength: 6 });

  const errorBox = document.createElement('div');
  errorBox.className = 'auth-error';
  errorBox.setAttribute('role', 'alert');
  errorBox.hidden = true;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-light auth-submit';

  form.append(nameField.wrap, emailField.wrap, passwordField.wrap, errorBox, submit);

  modal.append(closeBtn, eyebrow, heading, subhead, tabs, form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let mode = 'login'; // 'login' | 'signup'
  let busy = false;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setBusy(state) {
    busy = state;
    submit.disabled = state;
    submit.classList.toggle('is-busy', state);
    submit.textContent = state
      ? (mode === 'login' ? 'Signing in…' : 'Creating…')
      : (mode === 'login' ? 'Sign In' : 'Create Account');
  }

  function applyMode(next) {
    mode = next;
    showError('');
    tabLogin.classList.toggle('active', mode === 'login');
    tabSignup.classList.toggle('active', mode === 'signup');
    nameField.wrap.hidden = mode === 'login';
    nameField.input.required = mode === 'signup';
    heading.textContent = mode === 'login' ? 'Welcome back' : 'Join the archive';
    subhead.textContent = mode === 'login'
      ? 'Sign in to access your collection.'
      : 'Create an account to begin collecting.';
    passwordField.input.setAttribute(
      'autocomplete',
      mode === 'login' ? 'current-password' : 'new-password'
    );
    setBusy(false);
  }

  function open(initialMode) {
    applyMode(initialMode || 'login');
    overlay.dataset.open = 'true';
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-open');
    // focus the first relevant field
    requestAnimationFrame(() => {
      (mode === 'signup' ? nameField.input : emailField.input).focus();
    });
  }

  function close() {
    if (busy) return;
    overlay.dataset.open = 'false';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('auth-open');
    form.reset();
    showError('');
  }

  tabLogin.addEventListener('click', () => applyMode('login'));
  tabSignup.addEventListener('click', () => applyMode('signup'));
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.dataset.open === 'true') close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    showError('');

    const email = emailField.input.value.trim();
    const password = passwordField.input.value;
    const name = nameField.input.value.trim();

    if (!email || !password) {
      showError('Email and password are required.');
      return;
    }
    if (mode === 'signup' && !name) {
      showError('Please enter your name.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await signup({ name, email, password });
      }
      close();
    } catch (err) {
      console.error('[auth] submit failed', err);
      setBusy(false);
      showError(err && err.message ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return { open, close };
}

function buildField(id, label, type, name, opts = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'auth-field';
  wrap.setAttribute('for', id);

  const span = document.createElement('span');
  span.className = 'auth-label';
  span.textContent = label;

  const input = document.createElement('input');
  input.id = id;
  input.name = name;
  input.type = type;
  input.className = 'auth-input';
  input.autocomplete = opts.autocomplete || 'off';
  input.spellcheck = false;
  if (opts.maxlength) input.maxLength = opts.maxlength;
  if (opts.minlength) input.minLength = opts.minlength;
  if (opts.required) input.required = true;

  wrap.append(span, input);
  return { wrap, input };
}

// Build the dropdown account menu shown when signed in.
function buildAccountMenu(onLogout) {
  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.dataset.open = 'false';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-hidden', 'true');

  const head = document.createElement('div');
  head.className = 'account-head';
  const avatar = document.createElement('div');
  avatar.className = 'account-avatar';
  const headText = document.createElement('div');
  headText.className = 'account-head-text';
  const nameEl = document.createElement('div');
  nameEl.className = 'account-name';
  const emailEl = document.createElement('div');
  emailEl.className = 'account-email';
  headText.append(nameEl, emailEl);
  head.append(avatar, headText);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'account-logout';
  logoutBtn.appendChild(svg(ICON.logout));
  const logoutLabel = document.createElement('span');
  logoutLabel.textContent = 'Sign out';
  logoutBtn.appendChild(logoutLabel);

  menu.append(head, logoutBtn);

  logoutBtn.addEventListener('click', () => {
    onLogout();
    setOpen(false);
  });

  function setUserInfo(user) {
    avatar.textContent = initial(user);
    nameEl.textContent = userDisplayName(user) || 'Reader';
    const em = userEmail(user);
    emailEl.textContent = em;
    emailEl.hidden = !em;
  }

  function setOpen(state) {
    menu.dataset.open = state ? 'true' : 'false';
    menu.setAttribute('aria-hidden', state ? 'false' : 'true');
  }

  return { menu, setUserInfo, setOpen, isOpen: () => menu.dataset.open === 'true' };
}

export function initAuth() {
  const profileBtn = document.querySelector('.icon-btn[aria-label="profile"]');
  if (!profileBtn) return;
  if (profileBtn.dataset.authBound === '1') return;
  profileBtn.dataset.authBound = '1';

  const topbarRight = profileBtn.parentNode;

  // Name chip (shown when authed) — clearly surfaces the signed-in state.
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'auth-chip';
  chip.hidden = true;
  topbarRight.insertBefore(chip, profileBtn);

  const modal = buildModal();
  const account = buildAccountMenu(() => { logout(); });
  // Appended to <body> (not the topbar): the topbar's backdrop-filter would
  // otherwise become the containing block for the menu's position:fixed.
  document.body.appendChild(account.menu);

  // Reflect auth state into the topbar.
  onAuthChange((user) => {
    const authed = !!user;
    profileBtn.classList.toggle('is-authed', authed);
    profileBtn.setAttribute('title', authed ? (userDisplayName(user) || 'Account') : 'Sign in');
    chip.hidden = !authed;
    if (authed) {
      chip.textContent = firstName(user) || userEmail(user) || 'Account';
      account.setUserInfo(user);
    } else {
      account.setOpen(false);
    }
  });

  function toggleForState() {
    if (currentUser) {
      account.setOpen(!account.isOpen());
    } else {
      modal.open('login');
    }
  }

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleForState();
  });
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleForState();
  });

  // Dismiss the account menu on outside click / Escape.
  document.addEventListener('click', (e) => {
    if (!account.isOpen()) return;
    if (account.menu.contains(e.target) || profileBtn.contains(e.target) || chip.contains(e.target)) return;
    account.setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && account.isOpen()) account.setOpen(false);
  });

  // Restore session on load: validate the stored token via GET /auth/me.
  if (getToken()) {
    console.log('[auth] restoring session');
    fetchMe()
      .then((user) => {
        if (user) console.log('[auth] session restored', userEmail(user) || '(no email)');
      })
      .catch((err) => {
        // Network/parse error — keep the token (could be transient) but stay
        // logged-out in the UI until the next successful /auth/me.
        console.error('[auth] session restore failed', err);
      });
  }
}
