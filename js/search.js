import { ensureBooks, getAllBooks } from './books.js';

const MAX_RESULTS = 8;

function normalize(s) {
  return String(s == null ? '' : s).toLowerCase();
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return '';
  try { new URL(trimmed); } catch { return ''; }
  return encodeURI(trimmed);
}

function filterBooks(books, query) {
  const q = normalize(query).trim();
  if (!q) return [];
  const hits = [];
  for (const book of books) {
    const title = normalize(book.title);
    const author = normalize(book.author);
    if (title.includes(q) || author.includes(q)) {
      hits.push({ book, titleHit: title.includes(q) });
      if (hits.length >= MAX_RESULTS * 2) break;
    }
  }
  hits.sort((a, b) => Number(b.titleHit) - Number(a.titleHit));
  return hits.slice(0, MAX_RESULTS).map((h) => h.book);
}

function buildResultRow(book) {
  const row = document.createElement('a');
  row.className = 'search-result';
  row.href = book.id != null
    ? `book.html?id=${encodeURIComponent(book.id)}`
    : '#';

  const cover = document.createElement('div');
  cover.className = 'cover';
  const url = safeImageUrl(book.coverimage);
  if (url) {
    cover.style.setProperty('background-image', `url("${url}")`);
    cover.style.backgroundSize = 'cover';
    cover.style.backgroundPosition = 'center';
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = book.title || 'Untitled';
  const sub = document.createElement('div');
  sub.className = 'sub';
  const parts = [];
  if (book.author) parts.push(String(book.author));
  if (book.category) parts.push(String(book.category));
  sub.textContent = parts.join(' · ');
  meta.append(title, sub);

  row.append(cover, meta);
  return row;
}

function buildMessage(text) {
  const div = document.createElement('div');
  div.className = 'search-message';
  div.textContent = text;
  return div;
}

function render(panel, kind, payload) {
  panel.replaceChildren();
  panel.dataset.state = kind;
  if (kind === 'hidden') return;
  if (kind === 'loading') {
    panel.appendChild(buildMessage('Searching the archive…'));
    return;
  }
  if (kind === 'error') {
    panel.appendChild(buildMessage('The archive is briefly unreachable. Try again in a moment.'));
    return;
  }
  if (kind === 'empty') {
    const q = payload ? ` for "${payload}"` : '';
    panel.appendChild(buildMessage(`No volumes match${q}.`));
    return;
  }
  if (kind === 'ready') {
    payload.forEach((book) => panel.appendChild(buildResultRow(book)));
  }
}

export function initSearch() {
  const input = document.querySelector('.search');
  if (!input) return;
  if (input.dataset.searchBound === '1') return;
  input.dataset.searchBound = '1';

  const wrap = document.createElement('div');
  wrap.className = 'search-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const panel = document.createElement('div');
  panel.className = 'search-results';
  panel.dataset.state = 'hidden';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', 'Search results');
  wrap.appendChild(panel);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'search-results');
  input.setAttribute('aria-autocomplete', 'list');
  panel.id = 'search-results';

  let loaded = false;
  let loading = false;
  let lastQuery = '';

  async function ensureCatalog() {
    if (loaded || loading) return;
    loading = true;
    if (input.value.trim()) render(panel, 'loading');
    try {
      await ensureBooks();
      loaded = true;
    } catch (err) {
      console.error('[search] load failed', err);
      render(panel, 'error');
    } finally {
      loading = false;
    }
  }

  function runQuery() {
    const q = input.value;
    lastQuery = q;
    if (!q.trim()) {
      render(panel, 'hidden');
      return;
    }
    if (!loaded) {
      ensureCatalog().then(() => {
        if (lastQuery !== q) return;
        if (loaded) runQuery();
      });
      if (!loaded) return;
    }
    const hits = filterBooks(getAllBooks(), q);
    console.log('[search] query', q, '→', hits.length, 'hits');
    if (!hits.length) {
      render(panel, 'empty', q.trim());
      return;
    }
    render(panel, 'ready', hits);
  }

  input.addEventListener('focus', () => { ensureCatalog(); });
  input.addEventListener('input', runQuery);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      render(panel, 'hidden');
      input.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) render(panel, 'hidden');
  });
  input.addEventListener('focus', () => {
    if (input.value.trim() && loaded) runQuery();
  });
}
