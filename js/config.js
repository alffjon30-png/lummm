// Lumina Literature — central API configuration.
//
// This is the SINGLE SOURCE OF TRUTH for every Xano API group base URL.
// No Xano group id (api:xxxx) should appear anywhere else in the codebase.
// When the backend migrates again, change it HERE (or via the matching VITE_
// env var) and the whole app follows — no other file needs editing.
//
// Each entry resolves to a full base like:
//   https://x8ki-letl-twmt.n7.xano.io/api:books
// and callers append their own paths (e.g. `${API.books}/search`).

const XANO_HOST = import.meta.env.VITE_XANO_HOST
  || 'https://x8ki-letl-twmt.n7.xano.io';

// Build a group base URL from its Xano canonical id.
const group = (id) => `${XANO_HOST}/api:${id}`;

export const API = {
  host: XANO_HOST,

  // Auth group (login / me). Migrated from api:WitMFOZH → api:authentication.
  auth:            import.meta.env.VITE_XANO_AUTH_BASE
                     || group('authentication'),

  // Catalog / books. Migrated from api:nFkvWAyl → api:books.
  books:           import.meta.env.VITE_XANO_BOOKS_BASE
                     || import.meta.env.VITE_XANO_API_BASE   // legacy env name, still honored
                     || group('books'),

  // Purchases / ownership (check-access, library, my-books, history).
  purchases:       import.meta.env.VITE_XANO_PURCHASES_BASE
                     || group('purchases'),

  // Payments (wallet / deposits / withdrawals).
  payments:        import.meta.env.VITE_XANO_PAYMENTS_BASE
                     || group('payments'),

  // Favourites.
  favourites:      import.meta.env.VITE_XANO_FAVORITES_BASE
                     || group('favourites'),

  // Reading progress.
  readingProgress: import.meta.env.VITE_XANO_READING_PROGRESS_BASE
                     || group('reading-progress'),

  // Notifications.
  notifications:   import.meta.env.VITE_XANO_NOTIFICATIONS_BASE
                     || group('notifications')
};

// The favourites endpoint is nested under a `/favourites` group path
// (full path: api:favourites/favourites). Kept here so paths are centralized too.
export const FAVORITES_PATH = import.meta.env.VITE_XANO_FAVORITES_PATH || '/favourites';
