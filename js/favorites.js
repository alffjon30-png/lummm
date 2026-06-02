// Lumina Literature — favorites (save / remove / view)
//
// Owns ALL favorites behavior + UI, decoupled from the catalog renderer:
//   - heart buttons on book cards (any element carrying data-book-id) and on
//     the book detail page, injected via a MutationObserver so async-rendered
//     catalog cards are covered too;
//   - the favorites page (#favorites-root);
//   - the data layer (load / add / remove) against Xano.
//
// It does NOT modify books.js rendering — it observes the DOM and decorates.
//
// ─────────────────────────────────────────────────────────────────────────
//  ENDPOINTS ARE PENDING. Wiring is a ONE-PLACE change — see CONFIG below.
//  Until VITE_XANO_FAVORITES_BASE is set, the module runs in DEMO mode:
//  hearts toggle and the favorites page works, persisted only to sessionStorage
//  so the UX is fully walkable. Flip to real persistence by setting the env
//  var + confirming the three routes / field names. Delete the DEMO shim then.
// ─────────────────────────────────────────────────────────────────────────

import { onAuthChange, getCurrentUser, getAuthToken, openAuthModal } from './auth.js';
import { ensureBooks, getAllBooks, renderBookList } from './books.js';

/* ===================== CONFIG — fill in when Xano CRUD is published ======= */

// Base URL of the Xano API group that hosts the favorites endpoints.
// Favorites likely live in the auth group (api:WitMFOZH) since they're
// user-scoped, but CONFIRM once the endpoints exist. Same host either way, so
// no CSP change is needed. Empty string => DEMO mode (no network).
const FAVORITES_BASE = import.meta.env.VITE_XANO_FAVORITES_BASE || '';

// Route builders. Adjust paths to match the published endpoints.
const ROUTES = {
  list:   (base) => `${base}/favorites`,                                   // GET  → rows for the authed user
  create: (base) => `${base}/favorites`,                                   // POST {bookInputField: <id>}
  remove: (base, favId) => `${base}/favorites/${encodeURIComponent(favId)}` // DELETE one favorite row by its id
};

// Field-name mapping between our code and the Xano payloads.
const FIELDS = {
  bookInput: 'book_id',                 // POST body field for the book reference (Xano reference inputs are usually <name>_id)
  favRowId: 'id',                       // the favorite row's own id (used for DELETE)
  bookFromRow: ['book', 'book_id', 'books_id', 'book_id_text'] // where the book id lives on a returned row (first match wins)
};

const REQUEST_TIMEOUT_MS = 15000;
function favoritesConfigured() { return !!FAVORITES_BASE; }

/* ===================== state ============================================== */

// bookId(string) -> favorite row id (or the bookId itself in demo mode)
let favByBook = new Map();
let loaded = false;
let loadPromise = null;

const favListeners = new Set();
const hearts = new Set(); // injected heart buttons, for state refresh

const DEMO_KEY = 'lumina_fav_demo'; // DEMO mode only — remove when endpoints land

/* ===================== utilities ========================================= */

function idStr(v) { return String(v == null ? '' : v); }

export function isFavorited(bookId) {
  return favByBook.has(idStr(bookId));
}

export function getFavoriteBookIds() {
  return [...favByBook.keys()];
}

export function onFavoritesChange(fn) {
  favListeners.add(fn);
  try { fn(); } catch (e) { console.error('[favorites] listener failed', e); }
  return () => favListeners.delete(fn);
}

function emitChange() {
  refreshAllHearts();
  favListeners.forEach((fn) => { try { fn(); } catch (e) { console.error('[favorites] listener failed', e); } });
}

function bookIdFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  for (const key of FIELDS.bookFromRow) {
    if (row[key] != null && typeof row[key] !== 'object') return idStr(row[key]);
    // expanded reference object, e.g. { book: { id: 7 } }
    if (row[key] && typeof row[key] === 'object' && row[key].id != null) return idStr(row[key].id);
  }
  return '';
}

/* ===================== DEMO persistence (remove when wired) =============== */

function demoLoad() {
  try {
    const raw = sessionStorage.getItem(DEMO_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    favByBook = new Map((Array.isArray(ids) ? ids : []).map((id) => [idStr(id), idStr(id)]));
  } catch { favByBook = new Map(); }
}
function demoSave() {
  try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(getFavoriteBookIds())); } catch {}
}

/* ===================== network =========================================== */

async function api(url, opts = {}) {
  const token = getAuthToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Accept': 'application/json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(opts.headers || {})
      },
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Xano favorites ${opts.method || 'GET'} ${url} → ${res.status}`);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

/* ===================== load / add / remove =============================== */

// Load the current user's favorites. Safe to call repeatedly (deduped).
export function loadFavorites() {
  if (!getCurrentUser()) {
    favByBook = new Map();
    loaded = true;
    emitChange();
    return Promise.resolve();
  }
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  if (!favoritesConfigured()) {
    console.warn('[favorites] DEMO mode — set VITE_XANO_FAVORITES_BASE to persist. Loading from sessionStorage.');
    demoLoad();
    loaded = true;
    emitChange();
    return Promise.resolve();
  }

  console.log('[favorites] loading from', ROUTES.list(FAVORITES_BASE));
  loadPromise = api(ROUTES.list(FAVORITES_BASE))
    .then((rows) => {
      const list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.items) ? rows.items : []);
      favByBook = new Map();
      list.forEach((row) => {
        const bid = bookIdFromRow(row);
        const favId = row && row[FIELDS.favRowId] != null ? row[FIELDS.favRowId] : bid;
        if (bid) favByBook.set(bid, favId);
      });
      loaded = true;
      console.log('[favorites] loaded', favByBook.size, 'favorites');
      emitChange();
    })
    .catch((err) => {
      console.error('[favorites] load failed', err);
      loaded = true; // don't wedge the UI; treat as empty
      emitChange();
    })
    .finally(() => { loadPromise = null; });
  return loadPromise;
}

export async function addFavorite(bookId) {
  const id = idStr(bookId);
  if (!id || favByBook.has(id)) return;
  // optimistic
  favByBook.set(id, id);
  emitChange();
  try {
    if (!favoritesConfigured()) { demoSave(); return; }
    const created = await api(ROUTES.create(FAVORITES_BASE), {
      method: 'POST',
      body: JSON.stringify({ [FIELDS.bookInput]: maybeNumber(id) })
    });
    const favId = created && created[FIELDS.favRowId] != null ? created[FIELDS.favRowId] : id;
    favByBook.set(id, favId);
    console.log('[favorites] saved book', id, '→ favorite', favId);
  } catch (err) {
    console.error('[favorites] add failed — reverting', err);
    favByBook.delete(id);
    emitChange();
  }
}

export async function removeFavorite(bookId) {
  const id = idStr(bookId);
  if (!favByBook.has(id)) return;
  const favId = favByBook.get(id);
  // optimistic
  favByBook.delete(id);
  emitChange();
  try {
    if (!favoritesConfigured()) { demoSave(); return; }
    await api(ROUTES.remove(FAVORITES_BASE, favId), { method: 'DELETE' });
    console.log('[favorites] removed book', id, '(favorite', favId + ')');
  } catch (err) {
    console.error('[favorites] remove failed — reverting', err);
    favByBook.set(id, favId);
    emitChange();
  }
}

export function toggleFavorite(bookId) {
  if (!getCurrentUser()) {
    console.log('[favorites] not signed in — prompting login');
    openAuthModal('login');
    return Promise.resolve();
  }
  return isFavorited(bookId) ? removeFavorite(bookId) : addFavorite(bookId);
}

function maybeNumber(v) {
  // Xano reference ids are usually integers; send a number if it looks like one.
  return /^\d+$/.test(v) ? Number(v) : v;
}

/* ===================== heart UI ========================================== */

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

function makeHeart(bookId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fav-heart';
  btn.dataset.bookId = idStr(bookId);
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', 'Save to favorites');
  const tmpl = document.createElement('template');
  tmpl.innerHTML = HEART_SVG; // trusted, hard-coded
  btn.appendChild(tmpl.content);
  btn.addEventListener('click', (e) => {
    // book cards are <a> — keep the heart from navigating/submitting
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(bookId);
  });
  hearts.add(btn);
  refreshHeart(btn);
  return btn;
}

function refreshHeart(btn) {
  const active = isFavorited(btn.dataset.bookId);
  btn.classList.toggle('is-active', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.setAttribute('aria-label', active ? 'Remove from favorites' : 'Save to favorites');
}

function refreshAllHearts() {
  // prune detached buttons, refresh the rest
  for (const btn of [...hearts]) {
    if (!btn.isConnected) { hearts.delete(btn); continue; }
    refreshHeart(btn);
  }
}

// Inject a heart into every book card under `root` that doesn't have one yet.
function injectCardHearts(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const cards = scope.querySelectorAll
    ? scope.querySelectorAll('.book[data-book-id]:not([data-heart-bound])')
    : [];
  cards.forEach((card) => {
    card.dataset.heartBound = '1';
    const host = card.querySelector('.cover') || card;
    host.appendChild(makeHeart(card.dataset.bookId));
  });
}

// Inject a heart on the book detail page once it has rendered.
function injectDetailHeart() {
  const detail = document.querySelector('#book-detail[data-state="ready"]');
  if (!detail || detail.dataset.heartBound === '1') return;
  const frame = detail.querySelector('.book-detail-cover .cover-frame');
  if (!frame) return;
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return;
  detail.dataset.heartBound = '1';
  const heart = makeHeart(id);
  heart.classList.add('fav-heart-lg');
  frame.appendChild(heart);
}

function scanAndInject(root) {
  injectCardHearts(root);
  injectDetailHeart();
}

/* ===================== favorites page ==================================== */

function initFavoritesPage(rootEl) {
  let listContainer = null;

  function renderGate(message, withCta) {
    rootEl.replaceChildren();
    rootEl.dataset.state = 'gate';
    const wrap = document.createElement('div');
    wrap.className = 'favorites-gate';
    const p = document.createElement('p');
    p.textContent = message;
    wrap.appendChild(p);
    if (withCta) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-light';
      btn.textContent = 'Sign In';
      btn.addEventListener('click', () => openAuthModal('login'));
      wrap.appendChild(btn);
    } else {
      const a = document.createElement('a');
      a.className = 'btn btn-ghost';
      a.href = 'index.html';
      a.textContent = 'Browse the Archive';
      wrap.appendChild(a);
    }
    rootEl.appendChild(wrap);
  }

  function ensureListContainer() {
    if (listContainer && listContainer.isConnected) return listContainer;
    rootEl.replaceChildren();
    rootEl.dataset.state = 'list';
    listContainer = document.createElement('div');
    listContainer.className = 'catalog';
    rootEl.appendChild(listContainer);
    return listContainer;
  }

  async function renderForUser() {
    rootEl.dataset.state = 'loading';
    try {
      await Promise.all([ensureBooks(), loadFavorites()]);
    } catch (err) {
      console.error('[favorites] page load failed', err);
    }
    if (!getCurrentUser()) { renderGate('Sign in to view the volumes you’ve saved.', true); return; }

    const favIds = new Set(getFavoriteBookIds());
    const books = getAllBooks().filter((b) => favIds.has(idStr(b.id)));
    if (!books.length) {
      renderGate('You haven’t saved any volumes yet. Tap the heart on any book to keep it here.', false);
      return;
    }
    const container = ensureListContainer();
    renderBookList(container, books);
    // hearts get injected by the global observer; nudge for immediacy
    requestAnimationFrame(() => scanAndInject(container));
  }

  // React to auth + favorites changes (e.g. unfavoriting removes the card).
  onAuthChange(() => { renderForUser(); });
  onFavoritesChange(() => {
    if (rootEl.dataset.state === 'list' || rootEl.dataset.state === 'gate') {
      // only re-render the grid view in place when already showing the list
      if (getCurrentUser()) renderForUser();
    }
  });
}

/* ===================== init ============================================== */

export function initFavorites() {
  // Keep favorites in sync with auth: reload on login, clear on logout.
  onAuthChange((user) => {
    loaded = false;
    loadPromise = null;
    if (user) {
      loadFavorites();
    } else {
      favByBook = new Map();
      emitChange();
    }
  });

  // Decorate existing + future book cards / detail page with hearts.
  scanAndInject(document);
  if ('MutationObserver' in window) {
    const obs = new MutationObserver((mutations) => {
      let touched = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) touched = true;
        if (m.type === 'attributes') touched = true; // #book-detail data-state flip
      }
      if (touched) scanAndInject(document);
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state']
    });
  }

  // Favorites page
  const favRoot = document.getElementById('favorites-root');
  if (favRoot) initFavoritesPage(favRoot);
}
