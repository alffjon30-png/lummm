// Lumina Literature — authentication (Xano /auth/*)
//
// Wires signup / login / session-restore / logout into the existing topbar.
// Does NOT touch the books, wings, search, or catalog architecture — it only
// injects its own modal + account menu and reads/writes a single session token.
//
// Token storage: sessionStorage (per the documented security posture in
// CLAUDE.md — never localStorage). Survives page refresh and same-tab
// navigation across the multi-page site, which keeps the user logged in.

// Auth API base comes from the central config (js/config.js) — the only place
// Xano group ids live. Override the group there or via VITE_XANO_AUTH_BASE.
import { API } from './config.js';

const AUTH_BASE = API.auth;

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

// Exposed so feature modules (e.g. favorites) can authorize their own
// requests with the stored session token without duplicating the key.
export function getAuthToken() {
  return getToken();
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

// Network timeout so a stalled request can NEVER freeze the UI indefinitely.
// On timeout the fetch rejects, surfacing a visible error instead of hanging.
const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, opts = {}, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
    res = await fetchWithTimeout(`${AUTH_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    // Preserve a timeout message; otherwise report unreachable.
    if (networkErr && /timed out/i.test(networkErr.message)) throw networkErr;
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

// Authenticate, store the token, and return it. Fetching the user record
// (/auth/me) is left to the caller so a slow/flaky /auth/me can never block
// the success+redirect — the token is already persisted at that point.
export async function signup({ name, email, password }) {
  console.log('[auth] (1) signup request start →', `${AUTH_BASE}/auth/signup`);
  // The Xano signup stack requires a third param literally named `field_value`
  // (it does NOT persist as the user's name — /auth/me returns name:"" — but it
  // is required, so we route the collected name into it to satisfy the contract).
  const data = await postAuth('/auth/signup', { email, password, field_value: name || '' });
  console.log('[auth] (2) signup response received');
  const token = extractToken(data);
  if (!token) throw new Error('Signup succeeded but no session token was returned.');
  console.log('[auth] (3) auth token received (len ' + token.length + ')');
  setToken(token);
  console.log('[auth] (4) auth token stored in sessionStorage');
  return token;
}

export async function login({ email, password }) {
  console.log('[auth] (1) login request start →', `${AUTH_BASE}/auth/login`);
  const data = await postAuth('/auth/login', { email, password });
  console.log('[auth] (2) login response received');
  const token = extractToken(data);
  if (!token) throw new Error('Login succeeded but no session token was returned.');
  console.log('[auth] (3) auth token received (len ' + token.length + ')');
  setToken(token);
  console.log('[auth] (4) auth token stored in sessionStorage');
  return token;
}

// GET /auth/me with the bearer token. Throws on network/parse error.
// Returns null (and clears the token) on 401/403 — i.e. token expired/invalid.
export async function fetchMe() {
  const token = getToken();
  if (!token) { setUser(null); return null; }

  console.log('[auth] (5) GET /auth/me request start');
  let res;
  try {
    res = await fetchWithTimeout(`${AUTH_BASE}/auth/me`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch (networkErr) {
    if (networkErr && /timed out/i.test(networkErr.message)) throw networkErr;
    throw new Error('The archive is unreachable.');
  }
  console.log('[auth] (6) GET /auth/me response received →', res.status);

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

// Reference to the login/signup modal, set once initAuth() builds it, so other
// modules (e.g. favorites) can prompt an unauthenticated user to sign in.
let modalController = null;
export function openAuthModal(mode = 'login') {
  if (modalController) modalController.open(mode);
}

/* ------------------------------------------------------------------ *
 * UI
 * ------------------------------------------------------------------ */

const ICON = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  spinner: '<svg class="auth-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
};

function svg(markup) {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = markup; // trusted, hard-coded SVG only
  return tmpl.content.cloneNode(true);
}

// Where to send the user after a successful login/signup.
// Honors a same-origin relative ?redirect=<page>.html (the "intended
// destination" — e.g. a future gated action can bounce through login),
// otherwise defaults to the homepage. Open-redirect safe: only a bare
// relative .html filename (optionally with a query) is accepted — no
// leading slash, no "//", no protocol.
function resolveRedirect() {
  try {
    const raw = new URLSearchParams(window.location.search).get('redirect');
    if (raw && /^[A-Za-z0-9_-]+\.html(\?[^\s/\\]*)?$/.test(raw)) return raw;
  } catch { /* ignore */ }
  return 'index.html';
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

  // Success panel (shown after login/signup succeeds, just before redirect)
  const successPanel = document.createElement('div');
  successPanel.className = 'auth-success';
  successPanel.hidden = true;
  const successMark = document.createElement('div');
  successMark.className = 'auth-success-mark';
  successMark.appendChild(svg(ICON.check));
  const successTitle = document.createElement('div');
  successTitle.className = 'auth-success-title';
  const successSub = document.createElement('div');
  successSub.className = 'auth-success-sub';
  successPanel.append(successMark, successTitle, successSub);

  modal.append(closeBtn, eyebrow, heading, subhead, tabs, form, successPanel);
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
    submit.replaceChildren();
    if (state) {
      submit.appendChild(svg(ICON.spinner));
      submit.appendChild(document.createTextNode(
        mode === 'login' ? 'Signing in...' : 'Creating account...'
      ));
    } else {
      submit.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }
  }

  // Show the success state, then redirect to the intended destination so the
  // logged-in state is unmistakable. Stays "busy" so the modal can't be closed
  // out from under the redirect.
  function showSuccessAndRedirect(forMode, user) {
    tabs.hidden = true;
    form.hidden = true;
    subhead.hidden = true;
    heading.hidden = true;
    closeBtn.hidden = true;
    successPanel.hidden = false;

    const who = firstName(user);
    successTitle.textContent = forMode === 'login'
      ? (who ? `Welcome back, ${who}` : 'Welcome back')
      : 'Account created successfully';
    successSub.textContent = 'Taking you to the archive…';

    const dest = resolveRedirect();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    console.log('[auth] (7) redirect start → ' + dest + ' (in ' + (reduce ? 250 : 1100) + 'ms)');
    window.setTimeout(() => {
      console.log('[auth] (8) redirect complete — navigating to ' + dest);
      window.location.assign(dest);
    }, reduce ? 250 : 1100);
  }

  function applyMode(next) {
    mode = next;
    showError('');
    // Restore the form view (in case a prior success swapped to the success panel)
    successPanel.hidden = true;
    form.hidden = false;
    tabs.hidden = false;
    heading.hidden = false;
    subhead.hidden = false;
    closeBtn.hidden = false;
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

    const submittedMode = mode;
    setBusy(true);
    try {
      // Step 1-4: authenticate + store token (throws on bad creds / network).
      if (submittedMode === 'login') {
        await login({ email, password });
      } else {
        await signup({ name, email, password });
      }

      // Step 5-6: fetch the user record — NON-FATAL. The token is already
      // stored, so even if /auth/me is slow/blocked we still redirect; the
      // destination page's startup fetchMe() will populate the logged-in
      // state. This guarantees a successful login can never hang here.
      let user = null;
      try {
        user = await fetchMe();
      } catch (meErr) {
        console.warn('[auth] /auth/me failed after auth — redirecting anyway', meErr);
      }

      // Step 7-8: success feedback + redirect.
      console.log('[auth] ' + submittedMode + ' success — proceeding to redirect');
      showSuccessAndRedirect(submittedMode, user);
    } catch (err) {
      // Failed authentication: show the error, re-enable the form (never hang).
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

  // Link to the favorites page (logged-in only — the menu only shows when authed).
  const favLink = document.createElement('a');
  favLink.className = 'account-link';
  favLink.href = 'favorites.html';
  favLink.appendChild(svg(ICON.heart));
  const favLabel = document.createElement('span');
  favLabel.textContent = 'My Favorites';
  favLink.appendChild(favLabel);

  // Link to the owned-books library (logged-in only).
  const libLink = document.createElement('a');
  libLink.className = 'account-link';
  libLink.href = 'library.html';
  libLink.appendChild(svg(ICON.library));
  const libLabel = document.createElement('span');
  libLabel.textContent = 'My Library';
  libLink.appendChild(libLabel);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'account-logout';
  logoutBtn.appendChild(svg(ICON.logout));
  const logoutLabel = document.createElement('span');
  logoutLabel.textContent = 'Sign out';
  logoutBtn.appendChild(logoutLabel);

  menu.append(head, favLink, libLink, logoutBtn);

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
  modalController = modal;
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
