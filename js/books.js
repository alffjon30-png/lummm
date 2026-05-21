const API_BASE = import.meta.env.VITE_XANO_API_BASE
  || 'https://x8ki-letl-twmt.n7.xano.io/api:nFkvWAyl';

const PLACEHOLDER_CARD_COUNT = 4;

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

function buildBookCard(book) {
  const card = document.createElement('article');
  card.className = 'book reveal';
  card.setAttribute('data-reveal', '');

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

function renderBooks(container, books) {
  container.replaceChildren();
  books.forEach((book) => container.appendChild(buildBookCard(book)));
  container.dataset.state = 'ready';
}

export async function initBooks(rootSelector = '#catalog-list') {
  const container = document.querySelector(rootSelector);
  if (!container) return;

  renderSkeleton(container);

  try {
    const books = await fetchBooks();
    if (!books.length) {
      renderEmpty(container, 'No volumes in the archive yet. Check back soon.');
      return;
    }
    renderBooks(container, books);
  } catch (err) {
    console.error('[books] fetch failed', err);
    renderError(container, err);
  }
}
