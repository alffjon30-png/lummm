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
  books.forEach((book) => {
    const div = document.createElement('div');
    div.style.cssText = 'color:#fff;padding:20px;border:1px solid #fff;margin-bottom:12px;background:#111;';
    const grid = container.classList.contains('catalog') ? '1 / -1' : 'auto';
    div.style.gridColumn = grid;

    const h3 = document.createElement('h3');
    h3.textContent = book.title || '(no title)';
    h3.style.cssText = 'margin:0 0 6px 0;font-family:Cormorant Garamond, serif;font-size:20px;';

    const author = document.createElement('p');
    author.textContent = book.author || '(no author)';
    author.style.cssText = 'margin:2px 0;opacity:0.85;';

    const category = document.createElement('p');
    category.textContent = book.category || '(no category)';
    category.style.cssText = 'margin:2px 0;opacity:0.7;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;';

    const price = document.createElement('p');
    price.textContent = formatPrice(book.price) || '(no price)';
    price.style.cssText = 'margin:6px 0 0 0;color:#d4a857;font-weight:600;';

    div.append(h3, author, category, price);
    container.appendChild(div);
  });
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
