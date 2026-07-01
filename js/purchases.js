// Lumina Literature — purchases (Stripe checkout + ownership)
//
// Owns the "Acquire Volume" → Stripe Checkout → ownership flow, decoupled from
// the catalog renderer: it observes the book detail page and enhances the
// existing action button (no books.js changes), mirroring how favorites.js works.
//
// Live Xano contract (purchases group — base from js/config.js, no CSP change):
//   POST /create-checkout      { book_id }        (auth) -> { checkout_url, purchase_id }
//   GET  /check-access/{id}                        (auth) -> { has_access: bool }
//   GET  /my-books                                 (auth) -> [ ... ]

import { getAuthToken, getCurrentUser, onAuthChange, openAuthModal } from './auth.js';
import { ensureBooks, getAllBooks } from './books.js';
import { API } from './config.js';

const PURCHASES_BASE = API.purchases;

const ROUTES = {
  createCheckout: (b) => `${b}/create-checkout`,
  checkAccess:    (b, id) => `${b}/check-access/${encodeURIComponent(id)}`,
  myBooks:        (b) => `${b}/my-books`
};

const REQUEST_TIMEOUT_MS = 20000;

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
    if (res.status === 401 || res.status === 403) {
      const e = new Error('Authentication required.'); e.auth = true; throw e;
    }
    if (!res.ok) {
      let detail = '';
      try { const b = await res.json(); detail = b && (b.message || b.code) ? String(b.message || b.code) : ''; } catch {}
      throw new Error(detail || `Request failed (${res.status}).`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function numify(v) { return /^\d+$/.test(String(v)) ? Number(v) : v; }
function idStr(v) { return String(v == null ? '' : v); }

function safeImageUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return '';
  try { new URL(trimmed); } catch { return ''; }
  return encodeURI(trimmed);
}

/* ===================== API ================================================ */

// Does the authed user own this book? Safe: returns false when logged out or on error.
export async function checkAccess(bookId) {
  if (!getAuthToken()) return false;
  try {
    const d = await api(ROUTES.checkAccess(PURCHASES_BASE, bookId));
    return !!(d && (d.has_access === true || d.hasAccess === true || d.access === true));
  } catch (err) {
    console.error('[purchases] check-access failed', err);
    return false;
  }
}

// Create a Stripe Checkout session and return its URL. Throws on failure.
export async function createCheckout(bookId) {
  const d = await api(ROUTES.createCheckout(PURCHASES_BASE), {
    method: 'POST',
    body: JSON.stringify({ book_id: numify(bookId) })
  });
  const url = d && (d.checkout_url || d.url || d.checkoutUrl);
  // Only ever redirect to a validated https Stripe URL (no open-redirect).
  if (typeof url !== 'string' || !/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//i.test(url)) {
    throw new Error('No valid checkout URL was returned.');
  }
  console.log('[purchases] checkout session', d.purchase_id, '→ redirecting to Stripe');
  return url;
}

// The authed user's purchased books. Throws on error so callers can show an
// error state; returns the raw rows on success.
export async function fetchMyBooks() {
  if (!getAuthToken()) return [];
  const d = await api(ROUTES.myBooks(PURCHASES_BASE));
  return Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []);
}

// Extract a book-like record from a my-books row, tolerant of shape:
// embedded object (book/_book/books), the row itself being a book, or just an id.
function bookFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  for (const k of ['book', '_book', 'books']) {
    const v = row[k];
    if (v && typeof v === 'object' && v.id != null && (v.title != null || v.coverimage != null)) return v;
  }
  if (row.title != null || row.coverimage != null) return row; // row is the book
  return null; // only an id — resolve from the catalog cache
}
function bookIdFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  const o = bookFromRow(row);
  if (o) return idStr(o.id);
  for (const k of ['book', 'book_id', 'books_id', 'book_idreference_books']) {
    if (row[k] != null && typeof row[k] !== 'object') return idStr(row[k]);
  }
  return '';
}

// Resolve my-books rows to full book records (using the catalog cache only when
// a row carries just an id rather than an embedded record).
async function resolveLibraryBooks() {
  const rows = await fetchMyBooks();
  if (!rows.length) return [];
  let books = rows.map(bookFromRow);
  if (books.some((b) => !b)) {
    let cache = [];
    try { cache = await ensureBooks(); } catch { cache = getAllBooks(); }
    books = rows.map((row, i) => books[i] || cache.find((b) => idStr(b.id) === bookIdFromRow(row)) || null);
  }
  return books.filter(Boolean);
}

/* ===================== reader overlay (owned books) ====================== */

const BOOK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

function svgFrag(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.cloneNode(true);
}

let reader = null;
function openReader({ title, author, body }) {
  if (!reader) {
    reader = document.createElement('div');
    reader.className = 'reader-overlay';
    reader.dataset.open = 'false';
    const panel = document.createElement('div');
    panel.className = 'reader-panel';
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'reader-close'; close.setAttribute('aria-label', 'Close');
    close.appendChild(svgFrag(CLOSE_SVG));
    const eyebrow = document.createElement('div'); eyebrow.className = 'reader-eyebrow'; eyebrow.textContent = 'Your Library';
    const h = document.createElement('h2'); h.className = 'reader-title';
    const by = document.createElement('div'); by.className = 'reader-byline';
    const txt = document.createElement('div'); txt.className = 'reader-body';
    panel.append(close, eyebrow, h, by, txt);
    reader.appendChild(panel);
    document.body.appendChild(reader);
    const hide = () => { reader.dataset.open = 'false'; document.body.classList.remove('reader-open'); };
    close.addEventListener('click', hide);
    reader.addEventListener('click', (e) => { if (e.target === reader) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && reader.dataset.open === 'true') hide(); });
    reader._h = h; reader._by = by; reader._txt = txt;
  }
  reader._h.textContent = title || 'Untitled';
  reader._by.textContent = author ? `by ${author}` : '';
  reader._txt.textContent = body || 'Your copy is in your library. A full reading experience is coming soon.';
  reader.dataset.open = 'true';
  document.body.classList.add('reader-open');
}

/* ===================== book detail integration =========================== */

function bookIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

// Add ?redirect=<this book> so the login flow returns here (preserves ?id=).
function setLoginReturn(id) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('redirect', `book.html?id=${id}`);
    window.history.replaceState(null, '', u);
  } catch { /* ignore */ }
}

function enhanceDetail() {
  const detail = document.querySelector('#book-detail[data-state="ready"]');
  if (!detail) return;
  const btn = detail.querySelector('.book-detail-actions .btn-light');
  if (!btn || btn.dataset.purchaseBound === '1') return;
  const id = bookIdFromUrl();
  if (!id) return;
  btn.dataset.purchaseBound = '1';

  const acquireLabel = btn.textContent;          // "Acquire Volume" or "Notify When Available"
  const inStock = !btn.disabled;                 // disabled => out of stock

  // status line under the actions
  const msg = document.createElement('div');
  msg.className = 'purchase-msg';
  msg.setAttribute('role', 'status');
  msg.hidden = true;
  (detail.querySelector('.book-detail-actions') || btn.parentNode).appendChild(msg);

  const showMsg = (text, kind) => {
    msg.textContent = text || '';
    msg.dataset.kind = kind || '';
    msg.hidden = !text;
  };
  const setLoading = (on) => {
    btn.disabled = on;
    btn.classList.toggle('is-busy', on);
    if (on) btn.textContent = 'Preparing checkout…';
  };

  function setOwned() {
    btn.disabled = false;
    btn.classList.remove('is-busy');
    btn.textContent = 'Read Book';
    btn.classList.add('btn-owned');
    btn.onclick = () => openReader({
      title: detail.querySelector('h1')?.textContent,
      author: (detail.querySelector('.byline')?.textContent || '').replace(/^by\s+/i, ''),
      body: detail.querySelector('.lede')?.textContent
    });
  }
  function setAcquire() {
    btn.classList.remove('btn-owned', 'is-busy');
    btn.textContent = acquireLabel;
    if (inStock) {
      btn.disabled = false;
      btn.onclick = onAcquire;
    } else {
      btn.disabled = true;       // out of stock + not owned → "Notify When Available"
      btn.onclick = null;
    }
  }

  async function onAcquire() {
    // 1. require auth — else send to login and return here afterwards
    if (!getAuthToken() || !getCurrentUser()) {
      setLoginReturn(id);
      openAuthModal('login');
      return;
    }
    // 2-5. create checkout session → redirect to Stripe
    setLoading(true);
    showMsg('');
    try {
      const url = await createCheckout(id);
      showMsg('Redirecting to secure checkout…', 'info');
      window.location.assign(url);   // leaves the SPA for Stripe Checkout
    } catch (err) {
      console.error('[purchases] create-checkout failed', err);
      setLoading(false);
      setAcquire();
      showMsg("Sorry, we couldn't initiate the purchase. Please try again.", 'error');
    }
  }

  // initial paint while we resolve ownership
  if (getAuthToken()) {
    btn.disabled = true;
    btn.textContent = 'Checking your library…';
  } else {
    setAcquire();
  }

  async function refreshOwnership() {
    if (getAuthToken()) {
      const owned = await checkAccess(id);
      if (owned) { setOwned(); return true; }
    }
    setAcquire();
    return false;
  }
  refreshOwnership();

  // re-check when auth state changes (e.g. user logs in from the prompt)
  onAuthChange(() => { refreshOwnership(); });

  // 6. success handling on return from Stripe (?purchase=success).
  // The purchase may post-process via webhook, so poll check-access briefly.
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get('purchase') || params.get('checkout');
  if (outcome === 'success' || params.get('session_id')) {
    showMsg('Payment received — unlocking your volume…', 'success');
    let tries = 0;
    const poll = async () => {
      tries++;
      const owned = await refreshOwnership();
      if (owned) { showMsg('Purchase complete. Enjoy your volume.', 'success'); cleanUrl(); }
      else if (tries < 5) setTimeout(poll, 1500);
      else { showMsg('Payment received. Your library will update shortly.', 'success'); cleanUrl(); }
    };
    poll();
  } else if (outcome === 'cancel') {
    showMsg('Checkout canceled — no charge was made.', 'info');
    cleanUrl();
  }

  function cleanUrl() {
    try {
      const u = new URL(window.location.href);
      ['purchase', 'checkout', 'session_id'].forEach((k) => u.searchParams.delete(k));
      window.history.replaceState(null, '', u);
    } catch { /* ignore */ }
  }
}

/* ===================== My Library page =================================== */

function libraryCard(book) {
  const card = document.createElement('article');
  card.className = 'book lib-book';

  const cover = document.createElement('div');
  cover.className = 'cover';
  const url = safeImageUrl(book.coverimage);
  if (url) {
    cover.style.setProperty('background-image',
      `linear-gradient(180deg, rgba(7,21,30,0.15) 0%, rgba(7,21,30,0.65) 100%), url("${url}")`);
    cover.style.backgroundSize = 'cover';
    cover.style.backgroundPosition = 'center';
  }

  const h4 = document.createElement('h4');
  h4.textContent = book.title || 'Untitled';

  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.textContent = [book.author, book.category].filter(Boolean).map(String).join(' · ');

  const row = document.createElement('div');
  row.className = 'row';
  const read = document.createElement('button');
  read.type = 'button';
  read.className = 'read-btn';
  read.textContent = 'Read Book';
  read.addEventListener('click', () => openReader({
    title: book.title, author: book.author, body: book.description
  }));
  row.appendChild(read);

  card.append(cover, h4, sub, row);
  return card;
}

function initLibrary(root) {
  function gate(message, withLogin) {
    root.replaceChildren();
    root.dataset.state = 'gate';
    const wrap = document.createElement('div');
    wrap.className = 'favorites-gate';
    const p = document.createElement('p');
    p.textContent = message;
    wrap.appendChild(p);
    if (withLogin) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn btn-light'; btn.textContent = 'Sign In';
      btn.addEventListener('click', () => openAuthModal('login'));
      wrap.appendChild(btn);
    } else {
      const a = document.createElement('a');
      a.className = 'btn btn-ghost'; a.href = 'index.html'; a.textContent = 'Browse the Archive';
      wrap.appendChild(a);
    }
    root.appendChild(wrap);
  }
  function errorState() {
    root.replaceChildren();
    root.dataset.state = 'error';
    const wrap = document.createElement('div');
    wrap.className = 'favorites-gate';
    const p = document.createElement('p');
    p.textContent = 'We couldn’t load your library just now.';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn btn-light'; btn.textContent = 'Try Again';
    btn.addEventListener('click', render);
    wrap.append(p, btn);
    root.appendChild(wrap);
  }

  let rendering = false;
  async function render() {
    if (!getAuthToken()) { gate('Sign in to view your library.', true); return; }
    if (rendering) return;
    rendering = true;
    try {
      if (root.dataset.state !== 'list') { root.replaceChildren(); root.dataset.state = 'loading'; }
      let books;
      try { books = await resolveLibraryBooks(); }
      catch (err) { console.error('[purchases] library load failed', err); errorState(); return; }

      if (!getAuthToken()) { gate('Sign in to view your library.', true); return; }
      if (!books.length) { gate("You haven't purchased any books yet.", false); return; }

      root.replaceChildren();
      root.dataset.state = 'list';
      const grid = document.createElement('div');
      grid.className = 'catalog';
      books.forEach((b) => grid.appendChild(libraryCard(b)));
      root.appendChild(grid);
    } finally {
      rendering = false;
    }
  }

  onAuthChange(() => { render(); });
}

/* ===================== init ============================================== */

export function initPurchases() {
  const detail = document.getElementById('book-detail');
  if (detail) {
    enhanceDetail(); // in case it's already rendered
    // The detail renders async (Xano fetch) and flips data-state to "ready".
    if ('MutationObserver' in window) {
      const obs = new MutationObserver(() => enhanceDetail());
      obs.observe(detail, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    }
  }

  const library = document.getElementById('library-root');
  if (library) initLibrary(library);
}
