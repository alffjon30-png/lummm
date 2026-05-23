const API_BASE = import.meta.env.VITE_XANO_API_BASE
  || 'https://x8ki-letl-twmt.n7.xano.io/api:nFkvWAyl';

const PLACEHOLDER_CARD_COUNT = 4;
const ALL_CATEGORY = 'All';

let allBooks = [];
let activeCategory = ALL_CATEGORY;
let catalogContainer = null;

export async function fetchBooks() {
  const res = await fetch(`${API_BASE}/books`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    credentials: 'omit',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Xano /books returned ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Xano /books did not return an array');
  return data;
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return '';
  try {
    new URL(trimmed);
  } catch { return ''; }
  return encodeURI(trimmed);
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `$${n.toFixed(2)}`;
}

function buildSkeleton() {
  const card = document.createElement('article');
  card.className = 'book book-skeleton';
  card.setAttribute('aria-hidden', 'true');
  const cover = document.createElement('div');
  cover.className = 'cover';
  const h4 = document.createElement('h4');
  h4.innerHTML = '&nbsp;';
  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.innerHTML = '&nbsp;';
  const row = document.createElement('div');
  row.className = 'row';
  const price = document.createElement('div');
  price.className = 'price-tag';
  price.innerHTML = '&nbsp;';
  row.appendChild(price);
  card.append(cover, h4, sub, row);
  return card;
}

function buildBookCard(book, index) {
  const card = document.createElement('article');
  card.className = 'book';
  card.style.opacity = '0';
  card.style.transform = 'translateY(16px)';
  card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  card.style.transitionDelay = `${Math.min(index, 8) * 60}ms`;

  const cover = document.createElement('div');
  cover.className = 'cover';
  const url = safeImageUrl(book.coverimage);
  if (url) {
    cover.style.setProperty(
      'background-image',
      `linear-gradient(180deg, rgba(7,21,30,0.15) 0%, rgba(7,21,30,0.65) 100%), url("${url}")`
    );
    cover.style.backgroundSize = 'cover';
    cover.style.backgroundPosition = 'center';
  }

  const h4 = document.createElement('h4');
  h4.textContent = book.title || 'Untitled';

  const sub = document.createElement('div');
  sub.className = 'sub';
  const subParts = [];
  if (book.author) subParts.push(String(book.author));
  if (book.category) subParts.push(String(book.category));
  sub.textContent = subParts.join(' · ');

  const row = document.createElement('div');
  row.className = 'row';

  const price = document.createElement('div');
  price.className = 'price-tag';
  price.textContent = formatPrice(book.price);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add';
  const inStock = Number(book.stock) > 0;
  add.textContent = inStock ? 'Add' : 'Sold out';
  if (!inStock) add.disabled = true;

  row.append(price, add);
  card.append(cover, h4, sub, row);

  if (book.id != null) card.dataset.bookId = String(book.id);
  return card;
}

function renderSkeleton(container) {
  container.replaceChildren();
  for (let i = 0; i < PLACEHOLDER_CARD_COUNT; i++) {
    container.appendChild(buildSkeleton());
  }
  container.dataset.state = 'loading';
}

function renderEmpty(container, message) {
  container.replaceChildren();
  const p = document.createElement('p');
  p.className = 'catalog-empty';
  p.textContent = message;
  container.appendChild(p);
  container.dataset.state = 'empty';
}

function renderError(container, err) {
  container.replaceChildren();
  const banner = document.createElement('div');
  banner.className = 'catalog-error';
  const title = document.createElement('strong');
  title.textContent = 'XANO FETCH FAILED';
  const detail = document.createElement('div');
  detail.className = 'catalog-error-detail';
  detail.textContent = String(err && err.message ? err.message : err);
  const hint = document.createElement('div');
  hint.className = 'catalog-error-hint';
  hint.textContent = `Endpoint: ${API_BASE}/books — open DevTools → Network for the failed request.`;
  banner.append(title, detail, hint);
  container.appendChild(banner);
  container.dataset.state = 'error';
}

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase();
}

export function filterBooks(category) {
  const requested = String(category || ALL_CATEGORY);
  activeCategory = requested;
  console.log('[filter] selected category:', requested);

  if (!catalogContainer) return;

  const normalized = normalizeCategory(requested);
  const filtered = normalized === normalizeCategory(ALL_CATEGORY)
    ? allBooks
    : allBooks.filter((b) => normalizeCategory(b.category) === normalized);

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    const match = normalizeCategory(btn.dataset.filter) === normalized;
    btn.classList.toggle('is-active', match);
    btn.setAttribute('aria-pressed', match ? 'true' : 'false');
  });

  if (!filtered.length) {
    renderEmpty(catalogContainer, `No books found in this category.`);
    console.log('[filter] rendered 0 books');
    return;
  }

  renderBooks(catalogContainer, filtered);
  console.log('[filter] rendered', filtered.length, 'books');
}

function bindFilterControls() {
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    if (btn.dataset.filterBound === '1') return;
    btn.dataset.filterBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      filterBooks(btn.dataset.filter);
    });
  });
}

function renderBooks(container, books) {
  container.replaceChildren();
  const cards = books.map((book, i) => {
    const card = buildBookCard(book, i);
    container.appendChild(card);
    return card;
  });
  container.dataset.state = 'ready';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cards.forEach((card) => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  }));
}

export async function initBooks(rootSelector = '#catalog-list') {
  const container = document.querySelector(rootSelector);
  if (!container) return;
  catalogContainer = container;

  bindFilterControls();
  renderSkeleton(container);

  try {
    const books = await fetchBooks();
    allBooks = books;
    if (!books.length) {
      renderEmpty(container, 'No volumes in the archive yet. Check back soon.');
      return;
    }
    filterBooks(activeCategory);
  } catch (err) {
    console.error('[books] fetch failed', err);
    renderError(container, err);
  }
}
