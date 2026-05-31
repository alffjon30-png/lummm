const API_BASE = import.meta.env.VITE_XANO_API_BASE
  || 'https://x8ki-letl-twmt.n7.xano.io/api:nFkvWAyl';

const PLACEHOLDER_CARD_COUNT = 4;

let allBooks = [];

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

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase();
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return '';
  try { new URL(trimmed); } catch { return ''; }
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
  const card = document.createElement('a');
  card.className = 'book';
  if (book.id != null) {
    card.href = `book.html?id=${encodeURIComponent(book.id)}`;
    card.setAttribute('aria-label', `View details for ${book.title || 'untitled volume'}`);
  } else {
    card.href = '#';
    card.setAttribute('aria-disabled', 'true');
  }
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
  add.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

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

export function renderCategoryBooks(category, container) {
  if (!container) return 0;
  const target = normalizeCategory(category);
  const matches = allBooks.filter((b) => normalizeCategory(b.category) === target);
  console.log(`[segment] rendering ${category}: ${matches.length} books`);
  if (!matches.length) {
    renderEmpty(container, 'New volumes coming to this wing soon.');
    return 0;
  }
  renderBooks(container, matches);
  return matches.length;
}

export async function initBooks() {
  const segments = Array.from(document.querySelectorAll('[data-category]'));
  if (!segments.length) return;

  segments.forEach(renderSkeleton);

  try {
    allBooks = await fetchBooks();
    segments.forEach((container) => {
      renderCategoryBooks(container.dataset.category, container);
    });
  } catch (err) {
    console.error('[books] fetch failed', err);
    segments.forEach((container) => renderError(container, err));
  }
}

const WING_RETURN = {
  'medical':        { href: 'marketplace.html', label: 'Return to the Medical Wing' },
  'philosophy':     { href: 'philosophy.html',  label: 'Return to the Philosophy Rotunda' },
  'sci-fi':         { href: 'scifi.html',       label: 'Return to the Speculative Wing' },
  'rare editions':  { href: 'rare.html',        label: 'Return to the Rare Editions Vault' },
};

const WING_BODY_CLASS = {
  'medical':       'wing-medical',
  'philosophy':    'wing-philosophy',
  'sci-fi':        'wing-scifi',
  'rare editions': 'wing-rare',
};

function returnDestinationFor(category) {
  return WING_RETURN[normalizeCategory(category)]
    || { href: 'index.html', label: 'Return to the Archive' };
}

export async function fetchBookById(id) {
  const safeId = encodeURIComponent(String(id));
  const res = await fetch(`${API_BASE}/books/${safeId}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    credentials: 'omit',
    cache: 'no-store'
  });
  if (res.status === 404) {
    const err = new Error('Volume not found in the archive.');
    err.notFound = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Xano /books/${safeId} returned ${res.status}`);
  const data = await res.json();
  if (!data || typeof data !== 'object') throw new Error('Xano /books/:id did not return an object');
  return data;
}

function renderDetailLoading(container) {
  container.replaceChildren();
  container.dataset.state = 'loading';
  const wrap = document.createElement('div');
  wrap.className = 'book-detail-grid';
  const cover = document.createElement('div');
  cover.className = 'book-detail-cover';
  const frame = document.createElement('div');
  frame.className = 'cover-frame book-skeleton';
  cover.appendChild(frame);
  const info = document.createElement('div');
  info.className = 'book-detail-info';
  ['pill', 'title', 'title', 'lede', 'lede', 'lede'].forEach((kind) => {
    const line = document.createElement('div');
    line.className = `detail-skeleton-line is-${kind}`;
    info.appendChild(line);
  });
  wrap.append(cover, info);
  container.appendChild(wrap);
}

function renderDetailNotFound(container, id) {
  container.replaceChildren();
  container.dataset.state = 'not-found';
  const wrap = document.createElement('div');
  wrap.className = 'book-detail-empty';
  const h1 = document.createElement('h1');
  h1.textContent = 'This volume is not in the archive.';
  const p = document.createElement('p');
  p.textContent = id
    ? `No record exists for id "${id}". It may have been retired, or the link may be misprinted.`
    : 'No identifier was provided. The archive needs a volume number to retrieve a record.';
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = 'index.html';
  back.textContent = '← Return to the Archive';
  wrap.append(h1, p, back);
  container.appendChild(wrap);
}

function renderDetailError(container, err) {
  container.replaceChildren();
  container.dataset.state = 'error';
  const banner = document.createElement('div');
  banner.className = 'catalog-error';
  const title = document.createElement('strong');
  title.textContent = 'XANO FETCH FAILED';
  const detail = document.createElement('div');
  detail.className = 'catalog-error-detail';
  detail.textContent = String(err && err.message ? err.message : err);
  const hint = document.createElement('div');
  hint.className = 'catalog-error-hint';
  hint.textContent = `Endpoint: ${API_BASE}/books/:id — open DevTools → Network for the failed request.`;
  banner.append(title, detail, hint);
  container.appendChild(banner);
}

function renderBookDetail(container, book) {
  container.replaceChildren();
  container.dataset.state = 'ready';

  const wingClass = WING_BODY_CLASS[normalizeCategory(book.category)];
  Object.values(WING_BODY_CLASS).forEach((cls) => document.body.classList.remove(cls));
  if (wingClass) document.body.classList.add(wingClass);

  const wrap = document.createElement('div');
  wrap.className = 'book-detail-grid';

  const coverCol = document.createElement('div');
  coverCol.className = 'book-detail-cover';
  const frame = document.createElement('div');
  frame.className = 'cover-frame';
  const url = safeImageUrl(book.coverimage);
  if (url) {
    frame.style.setProperty(
      'background-image',
      `linear-gradient(180deg, rgba(7,21,30,0.10) 0%, rgba(7,21,30,0.55) 100%), url("${url}")`
    );
    frame.style.backgroundSize = 'cover';
    frame.style.backgroundPosition = 'center';
  }
  coverCol.appendChild(frame);

  const info = document.createElement('div');
  info.className = 'book-detail-info';

  if (book.category) {
    const pill = document.createElement('span');
    pill.className = 'accent-pill';
    pill.textContent = String(book.category);
    info.appendChild(pill);
  }

  const h1 = document.createElement('h1');
  h1.textContent = book.title || 'Untitled volume';
  info.appendChild(h1);

  if (book.author) {
    const byline = document.createElement('div');
    byline.className = 'byline';
    byline.textContent = `by ${book.author}`;
    info.appendChild(byline);
  }

  const bar = document.createElement('div');
  bar.className = 'accent-bar';
  info.appendChild(bar);

  if (book.description) {
    const desc = document.createElement('p');
    desc.className = 'lede';
    desc.textContent = String(book.description);
    info.appendChild(desc);
  }

  const meta = document.createElement('dl');
  meta.className = 'detail-meta';
  const priceText = formatPrice(book.price);
  if (priceText) appendMeta(meta, 'Price', priceText);
  const stockNum = Number(book.stock);
  if (Number.isFinite(stockNum)) {
    appendMeta(meta, 'Availability', stockNum > 0 ? `${stockNum} in archive` : 'Out of stock');
  }
  if (book.id != null) appendMeta(meta, 'Archive ID', `№ ${book.id}`);
  if (meta.children.length) info.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'book-detail-actions';
  const acquire = document.createElement('button');
  acquire.type = 'button';
  acquire.className = 'btn-light';
  acquire.textContent = stockNum > 0 ? 'Acquire Volume' : 'Notify When Available';
  if (!(stockNum > 0)) acquire.disabled = true;
  actions.appendChild(acquire);

  const dest = returnDestinationFor(book.category);
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = dest.href;
  back.textContent = `← ${dest.label}`;
  actions.appendChild(back);

  info.appendChild(actions);
  wrap.append(coverCol, info);
  container.appendChild(wrap);
}

function appendMeta(dl, label, value) {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  dl.appendChild(row);
}

export async function initBookDetail(rootSelector = '#book-detail') {
  const container = document.querySelector(rootSelector);
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  console.log('[book] fetching id', id);

  if (!id) {
    renderDetailNotFound(container, null);
    return;
  }

  renderDetailLoading(container);

  try {
    const book = await fetchBookById(id);
    renderBookDetail(container, book);
    if (book.title) document.title = `${book.title} — Lumina Literature`;
    console.log('[book] render success', book.id);
  } catch (err) {
    if (err && err.notFound) {
      console.warn('[book] not found', id);
      renderDetailNotFound(container, id);
      return;
    }
    console.error('[book] fetch failed', err);
    renderDetailError(container, err);
  }
}
