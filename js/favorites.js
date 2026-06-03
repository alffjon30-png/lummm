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

/* ===================== CONFIG (live Xano favourites group) ================
 *
 * Secured contract (server-side, see the Xano notes in the PR summary):
 *   - GET /favourites requires auth and returns ONLY the authed user's rows
 *     (Query All + filter `user = auth.id`), with the related book record
 *     embedded via an addon so the favorites page renders without a second
 *     fetch.
 *   - POST /favourites sets the user from the auth token; the frontend sends
 *     ONLY the book reference, never a user id.
 *   - DELETE verifies ownership server-side.
 * The frontend therefore trusts server scoping — it does NOT send or filter on
 * a user id. It prefers the embedded book record and falls back to the catalog
 * cache only if a row lacks it.
 * ------------------------------------------------------------------------- */

// Favourites live in their own Xano group, base id `api:favourites`, with the
// endpoint nested at /favourites (full path api:favourites/favourites).
// Same host → no CSP change.
const FAVORITES_BASE = import.meta.env.VITE_XANO_FAVORITES_BASE
  || 'https://x8ki-letl-twmt.n7.xano.io/api:favourites';

// The live Xano endpoint path. The favourites API group nests the endpoint
// under a `/favourites` base path, so the full path is `/favourites/favourites`.
// Override with VITE_XANO_FAVORITES_PATH if it changes again.
const FAVORITES_PATH = import.meta.env.VITE_XANO_FAVORITES_PATH || '/favourites';

const ROUTES = {
  list:   (base) => `${base}${FAVORITES_PATH}`,                                    // GET  → the AUTHED user's rows (server-scoped)
  create: (base) => `${base}${FAVORITES_PATH}`,                                    // POST { book reference } — server sets user from auth
  remove: (base, favId) => `${base}${FAVORITES_PATH}/${encodeURIComponent(favId)}` // DELETE one favourite row by its id
};

// Field-name mapping for the Xano columns/inputs.
const FIELDS = {
  // POST body: the book reference, and ONLY the book (never the user — the
  // server derives that from auth.id). We send BOTH candidate input names so
  // this keeps working whether the published endpoint names the input `book`
  // or the auto-generated `book_idreference_books`; Xano ignores undeclared
  // inputs, so the extra key is harmless either way.
  bookInput: ['book', 'book_idreference_books'],
  favRowId: 'id',                        // favourite row id (used for DELETE)
  bookIdFromRow: ['book_idreference_books', 'book_id', 'books_id', 'book'], // where the book id lives on a row
  bookObjFromRow: ['book', '_book', 'books'] // where the embedded related-book record lives (GET addon — requirement 5)
};

const REQUEST_TIMEOUT_MS = 15000;

function currentUserId() {
  const u = getCurrentUser();
  return u && u.id != null ? idStr(u.id) : '';
}

/* ===================== state ============================================== */

// bookId(string) -> favourite row id
let favByBook = new Map();
// bookId(string) -> embedded book record from the GET addon (for the page)
let favBookData = new Map();
let loadedUserId = null;   // user id that favByBook currently reflects (null = not loaded)
let loadPromise = null;    // in-flight GET, shared so concurrent callers don't refetch
let lastLoadError = null;  // last load failure (so the favorites page can show an error state)

const favListeners = new Set();
const hearts = new Set(); // injected heart buttons, for state refresh

/* ===================== utilities ========================================= */

function idStr(v) { return String(v == null ? '' : v); }

export function isFavorited(bookId) {
  return favByBook.has(idStr(bookId));
}

export function getFavoriteBookIds() {
  return [...favByBook.keys()];
}

// True when every favourite already has its book record embedded (from the GET
// addon), so the favorites page needs no separate /books fetch.
export function favoritesHaveBookData() {
  for (const bid of favByBook.keys()) if (!favBookData.has(bid)) return false;
  return favByBook.size > 0;
}

// Book records for the favorites page: prefer the embedded record, fall back to
// the catalog cache (pass it in) for any row that lacked embedded data.
export function getFavoriteBooks(cache = []) {
  return getFavoriteBookIds()
    .map((bid) => favBookData.get(bid) || cache.find((b) => idStr(b.id) === bid))
    .filter(Boolean);
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

// The embedded related-book record (from the GET addon), or null.
function bookObjFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  for (const key of FIELDS.bookObjFromRow) {
    const v = row[key];
    if (v && typeof v === 'object' && v.id != null && (v.title != null || v.coverimage != null)) return v;
  }
  return null;
}

function bookIdFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  const obj = bookObjFromRow(row);
  if (obj) return idStr(obj.id);
  for (const key of FIELDS.bookIdFromRow) {
    if (row[key] != null && typeof row[key] !== 'object') return idStr(row[key]);
    // expanded reference object, e.g. { book: { id: 7 } }
    if (row[key] && typeof row[key] === 'object' && row[key].id != null) return idStr(row[key].id);
  }
  return '';
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

export function getLoadError() { return lastLoadError; }

// Load the current user's favourites. Deduped: repeated calls while loaded for
// the same user (or while a request is in flight) reuse the result/promise, so
// the many auth/render triggers don't each hit the network. Pass force=true to
// bypass the cache (e.g. an explicit "retry").
export function loadFavorites(force = false) {
  const uid = currentUserId();
  if (!uid) {
    favByBook = new Map();
    favBookData = new Map();
    loadedUserId = null;
    lastLoadError = null;
    emitChange();
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;
  if (!force && loadedUserId === uid && !lastLoadError) return Promise.resolve();

  console.log('[favorites] loading from', ROUTES.list(FAVORITES_BASE));
  loadPromise = api(ROUTES.list(FAVORITES_BASE))
    .then((rows) => {
      // GET is server-scoped to the authed user — we trust it and do NOT
      // filter by a user id (the response may not even expose one).
      const list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.items) ? rows.items : []);
      favByBook = new Map();
      favBookData = new Map();
      list.forEach((row) => {
        const bid = bookIdFromRow(row);
        if (!bid) return;
        const favId = row && row[FIELDS.favRowId] != null ? row[FIELDS.favRowId] : bid;
        favByBook.set(bid, favId);
        const obj = bookObjFromRow(row); // embedded related-book record (addon)
        if (obj) favBookData.set(bid, obj);
      });
      loadedUserId = uid;
      lastLoadError = null;
      console.log('[favorites] loaded', favByBook.size, 'favourites for user', uid);
      emitChange();
    })
    .catch((err) => {
      // Leave loadedUserId unset so an explicit retry can refetch; surface the
      // error so the favorites page shows an error state (not a false "empty").
      console.error('[favorites] load failed', err);
      lastLoadError = err;
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
    // Send ONLY the book — the server sets the user from the auth token.
    const v = maybeNumber(id);
    const body = {};
    FIELDS.bookInput.forEach((k) => { body[k] = v; });
    const created = await api(ROUTES.create(FAVORITES_BASE), {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const favId = created && created[FIELDS.favRowId] != null ? created[FIELDS.favRowId] : id;
    favByBook.set(id, favId);
    console.log('[favorites] saved book', id, '→ favourite', favId);
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
    await api(ROUTES.remove(FAVORITES_BASE, favId), { method: 'DELETE' });
    console.log('[favorites] removed book', id, '(favourite', favId + ')');
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

  function renderError() {
    rootEl.replaceChildren();
    rootEl.dataset.state = 'error';
    const wrap = document.createElement('div');
    wrap.className = 'favorites-gate';
    const p = document.createElement('p');
    p.textContent = 'We couldn’t load your favourites just now.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-light';
    btn.textContent = 'Try Again';
    btn.addEventListener('click', () => { loadFavorites(true).then(renderForUser); });
    wrap.append(p, btn);
    rootEl.appendChild(wrap);
  }

  let rendering = false;
  async function renderForUser() {
    if (!getCurrentUser()) { renderGate('Sign in to view the volumes you’ve saved.', true); return; }
    if (rendering) return;
    rendering = true;
    try {
      // Only show the loading state when data isn't ready yet (avoids flicker on
      // in-place updates like unfavouriting from this page).
      const ready = loadedUserId === currentUserId() && !lastLoadError;
      if (!ready) { rootEl.replaceChildren(); rootEl.dataset.state = 'loading'; }

      await loadFavorites(); // server-scoped; embeds the related book record

      if (!getCurrentUser()) { renderGate('Sign in to view the volumes you’ve saved.', true); return; }
      if (lastLoadError) { renderError(); return; }

      // Fall back to the catalog cache ONLY for favourites missing embedded data.
      let cache = [];
      if (favByBook.size && !favoritesHaveBookData()) {
        try { cache = await ensureBooks(); } catch { cache = getAllBooks(); }
      }
      const books = getFavoriteBooks(cache);
      if (!books.length) {
        renderGate('You haven’t saved any books yet. Tap the heart on any volume to keep it here.', false);
        return;
      }
      const container = ensureListContainer();
      renderBookList(container, books);
      // hearts get injected by the global observer; nudge for immediacy
      requestAnimationFrame(() => scanAndInject(container));
    } finally {
      rendering = false;
    }
  }

  // React to auth + favourites changes (e.g. unfavouriting removes the card).
  onAuthChange(() => { renderForUser(); });
  onFavoritesChange(() => { if (getCurrentUser()) renderForUser(); });
}

/* ===================== init ============================================== */

export function initFavorites() {
  // Keep favourites in sync with auth. loadFavorites() is keyed by user id and
  // deduped, so it fetches once on login and clears on logout on its own.
  onAuthChange(() => { loadFavorites(); });

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
