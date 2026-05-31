# Lumina Literature

A cinematic, dark-themed static web app for a curated literary archive. Three pages, no framework, premium motion design.

## Stack

- **Build**: Vite 6 (multi-page), no transpiler beyond ES modules
- **Animation**: GSAP 3.12 + ScrollTrigger; Lenis smooth scroll wired into ScrollTrigger
- **3D**: Three.js (only used on the index hero when no video is present)
- **Type**: Cormorant Garamond (serif) + Inter (sans), Google Fonts
- **Backend (live)**: Xano workspace `x8ki-letl-twmt.n7.xano.io/api:nFkvWAyl` — public `GET /books` feeds the wing-page catalogs via `js/books.js`. No auth header; the endpoint is intentionally public per Xano workspace config. Override at build time with `VITE_XANO_API_BASE` (a fallback to the prod URL is baked in, so `.env` is optional).
- **Backend (planned)**: Supabase (data) + Firebase or Supabase Auth — not wired

## Pages (entry points in `vite.config.js`)

| File | Route | Wing | Curator | Accent |
|---|---|---|---|---|
| `index.html` | `/` | — (hero landing) | — | gold |
| `marketplace.html` | `/marketplace.html` | The Medical Wing | Dr. Aris Thorne · Senior Curator | `--medical` cyan |
| `rare.html` | `/rare.html` | The Rare Editions Vault | Mme. Vivienne Aubert · Chief Archivist | `--rare` bronze |
| `philosophy.html` | `/philosophy.html` | The Philosophy Rotunda | Prof. Adrien Lavoie · Emeritus Reader | `--philosophy` amethyst |
| `scifi.html` | `/scifi.html` | The Speculative Wing | Dr. Kai Voronin · Speculative Curator | `--scifi` ember |
| `librarian.html` | `/librarian.html` | The Librarian's Study (AI chat) | The Archivist · Deep Library Access | gold |
| `book.html` | `/book.html?id={id}` | Single-volume detail (Xano-driven) | — | inherits via `body.wing-{name}` from the book's category |

**Index** has no sidebar. Hero plays `/videos/hero-0511.mp4` (720p / 24fps / CRF 26 / 1.6 MB, re-encoded from a 12 MB source) autoplay-muted-loop with a darkened scrim. Only CTA in the hero is **Enter the archive**; the old **Watch intro** ghost button was removed because it pointed at a `#trending` anchor rather than real video. The wordmark `Lumina Literature` is an `<a class="brand" href="index.html">` on every page (gold hover, no underline) — clicking it returns to the landing. The Three.js procedural-book scene (`js/hero3d.js`) is **dormant whenever the hero has `.has-video` or a `.hero-video` element** — it stays in the codebase and is fully functional, but the video takes the slot. To switch back to the procedural scene, remove the `<video>` element + `has-video` class from `index.html`. Trending Volumes uses pinned 3D scroll-stack on desktop, both cards play video. Curated Segments uses arrow-row layout linking to each wing.

**Wing pages** (marketplace / rare / philosophy / scifi) share a template: sidebar with `Segments` label + 4 cross-wing nav links + curator profile pinned at bottom; page head with accent pill ("Medical Accent: Cyan", "Philosophy · Amethyst" etc.) + accent bar; Collector's Highlight card with bespoke title/price/CTA; Curator's Notes card with stat row; **live `.catalog` grid populated from Xano** via `<div class="catalog" id="{wing}-books" data-category="{Category}">` — `js/books.js` does one shared fetch and renders each wing's books into its own container; "Transitioning to" divider linking the wings in a cycle (Medical → Philosophy & Ethics, Rare → Medical, Philosophy → Sci-Fi, Sci-Fi → Rare). The wing's accent color comes from `body.wing-{name}` setting `--wing`, `--wing-bg`, `--wing-border` CSS variables that everything wing-specific reads. The original static cards had a `.pillrow` + `.has-spark` sparkle on the bestseller — both removed when the markup went data-driven. If pills/sparkles need to come back, they should come from Xano fields (e.g. `tags: []`, `featured: bool`), not be re-hardcoded.

**Librarian** (`librarian.html`) is the chat experience. Sidebar has The Archivist profile. Avatar-pill chat rows, white user bubble, suggestion chips, Library Aura panel with pulsing visual + Atmosphere/Intellectual Rigor/Chronology bars, Curator's Insight, Associated Themes pills.

## File map

```
.
├── index.html              # Hero landing (no sidebar)
├── marketplace.html        # Medical Wing
├── rare.html               # Rare Editions Vault
├── philosophy.html         # Philosophy Rotunda
├── scifi.html              # Speculative Wing
├── librarian.html          # Librarian's Study (chat)
├── book.html               # Single-volume detail (?id=N — Xano-driven)
├── vite.config.js          # 7 entry points
├── package.json
├── css/styles.css          # Single stylesheet, layered sections (see below)
├── js/
│   ├── app.js              # Entry: Lenis, char split, ScrollTrigger, magnetic CTAs, chat, sidebar, initBooks(), initBookDetail()
│   ├── books.js            # Xano /books + /books/:id; catalog renderer + book detail renderer
│   └── hero3d.js           # Three.js scene; bails if hero has .has-video
├── .env.example            # Documents VITE_XANO_API_BASE (optional override)
├── vercel.json             # Security headers (CSP, HSTS, etc.) + cache-control routes
└── public/
    └── videos/             # Local mp4 assets, served at /videos/*
        ├── hero-0511.mp4                                          # current hero
        ├── cathedral-hero.mp4                                     # retired hero option
        ├── 3d-animation-of-the-library-scene-with-books-flyin.mp4 # retired hero option
        └── video-1070044246195105.mp4                             # left Trending card
```

## Run

```bash
npm install     # gsap, three, lenis, vite
npm run dev     # http://localhost:5173
npm run build   # outputs ./dist with hashed assets
npm run preview # serves built dist
```

## Animation system (in `js/app.js`)

All animation lives in a single `gsap.matchMedia()` block keyed off `(min-width: 900px)` and `(prefers-reduced-motion: reduce)`. The cleanup function runs when conditions change so e.g. resizing past the breakpoint reverts the 3D stack.

Key effects:

- **Lenis smooth scroll** — initialized once at module load, tied into `ScrollTrigger.update`. Skipped if `prefers-reduced-motion`.
- **Hero h1 char reveal** — `splitChars()` walks text nodes, wraps each character in `<span class="char">`, preserves `<br>`/`<em>` structure. Animates rotateX -85 → 0, y 56 → 0, autoAlpha 0 → 1 with 22ms stagger.
- **Trending 3D pin** (desktop only) — `.trending` gets `.stack-3d` class, cards become absolutely positioned, scrubbed timeline rotates card 0 back into depth (`z -480, rotateY -28`) while card 1 rotates forward from behind (`z -520 → 0, rotateY 32 → 0`). Pins for 140% viewport, scrub 1.2.
- **Volume card inner parallax** — the `.bg` or `video.card-video` inside each card translates `yPercent: -10` with `scale 1.08`, scrubbed.
- **Card video viewport play/pause** — every `video.card-video` plays only when its ScrollTrigger reports it intersecting; pauses otherwise. **Hero video is excluded** from this loop on purpose.
- **Hero video autoplay (mobile-safe)** — a dedicated bootstrap above the matchMedia block (`js/app.js:64`) forces `muted=true`/`playsInline=true` programmatically, fires `play()` on script load + every readiness event (`loadedmetadata`/`loadeddata`/`canplay`/`canplaythrough`) + `DOMContentLoaded` + first touch/click/pointer/scroll + tab focus regain. ScrollTrigger's `onEnter` was unreliable here because the hero starts already inside its active range; an `IntersectionObserver(threshold: 0.05)` handles the pause-when-offscreen so the laptop GPU isn't decoding the loop forever after the user scrolls past.
- **Magnetic CTAs** — `.btn-light, .btn-ghost, .ask-librarian, .review-btn, .composer .send` pull toward cursor on `mousemove` (rAF-throttled), snap back with `elastic.out` on `mouseleave`.
- **Scroll progress bar** — fixed top, scaleX driven by `ScrollTrigger.create({ start: 0, end: 'max' })`.
- **Generic `[data-reveal]`** — fade-in scrubbed by `ScrollTrigger`. Trending cards are excluded when 3D stack is active.
- **Dynamic catalog fade-in** — books rendered by `js/books.js` do **not** participate in `[data-reveal]`. The reveal pass runs once at matchMedia init via `gsap.utils.toArray('[data-reveal]')`, which snapshots existing elements only. Async-rendered cards inherit the `autoAlpha:0 / y:32` start state but never get animated to visible — they end up in the DOM, invisible. Instead, dynamic cards get a plain inline transition (`opacity 0→1`, `translateY 16→0`, 60ms stagger capped at index 8, 500ms duration) triggered by double-rAF after insertion. This is the one place the `.reveal` / `data-reveal` system is deliberately bypassed.

## Live catalog (Xano)

`js/books.js` owns the wing-page catalog rendering. The homepage is intentionally **not** data-driven — the original "Curated Segments" arrow rows and Trending Volumes stay static / motion-driven to preserve the cinematic entry feel.

- **API base**: `https://x8ki-letl-twmt.n7.xano.io/api:nFkvWAyl`. Override with `VITE_XANO_API_BASE` if you spin up a separate workspace. Hardcoded fallback in `books.js` so `.env` is optional.
- **Single fetch**: `fetchBooks()` does one `GET /books` with `credentials:'omit'`, `cache:'no-store'`, `Accept: application/json`. Response is cached in module-scope `allBooks`.
- **Distribution**: `initBooks()` queries `document.querySelectorAll('[data-category]')` and routes through `renderCategoryBooks(category, container)` for each. Works for any number of containers — one wing per page today, zero on the homepage.
- **Wing → category mapping**:
  | Page | `data-category` |
  |---|---|
  | `marketplace.html` | `Medical` |
  | `philosophy.html` | `Philosophy` |
  | `scifi.html` | `Sci-Fi` |
  | `rare.html` | `Rare Editions` |
- **Card field mapping**: `title → <h4>`, `author + category → .sub`, `price → .price-tag` (formatted `$X.XX`), `coverimage → .cover background-image` (validated `https://…` + `encodeURI`'d, never `innerHTML`'d), `stock > 0 → "Add"` else disabled `"Sold out"`. Every string field goes through `textContent`.
- **Per-container states**: skeleton shimmer while loading → real cards on success → "New volumes coming to this wing soon." on filtered-to-empty → loud red **XANO FETCH FAILED** banner with the error message + endpoint URL on network/parse error. The error banner is deliberately impossible to miss — promoted from debug aid to permanent UX.
- **Category matching**: `normalizeCategory()` = `String(v||'').trim().toLowerCase()` applied to both sides. So `"sci-fi"`, `"Sci-Fi"`, and `" SCI-FI "` all match.
- **Console breadcrumb**: `[segment] rendering {Category}: N books` on each render, `console.error('[books] fetch failed', err)` on failure.
- **CSP**: `connect-src` allows the Xano host. `img-src` allows `images.unsplash.com`, `plus.unsplash.com`, `i.postimg.cc`, `*.xano.io`, `*.xanocdn.com`. Any new image origin in the Xano payload will show as a CSP violation in DevTools — append to `vercel.json` then.
- **Mounted from**: `js/app.js` imports `{ initBooks, initBookDetail }` and calls both once, alongside `initHero3D()`. No other entry point needs touching to add the catalog to a new page — just drop a `<div class="catalog" data-category="…">` in that page's markup.

### Single-volume detail (`book.html?id=…`)

`js/books.js` also owns the detail page. Clicking any card in any wing navigates to `book.html?id={book.id}` — book cards are now `<a class="book">` elements, not `<article>`, with the whole card as the link target. The `.add` button inside the card calls `e.preventDefault(); e.stopPropagation()` on click so future cart logic can short-circuit the navigation.

- **Endpoint**: `GET /books/:id` on the same Xano workspace.
- **Bootstrap**: `initBookDetail()` queries `#book-detail`, reads `id` from `URLSearchParams`, fetches one record, swaps the body's `wing-*` class so the page inherits the right accent.
- **States** (same `data-state` pattern as the catalog):
  - `loading` — cover-frame + line-block skeleton shimmer
  - `ready` — two-column editorial layout (sticky cover on desktop, stacked on mobile)
  - `not-found` — Xano 404 → "This volume is not in the archive." + return link to `/`
  - `error` — anything else → red `XANO FETCH FAILED` banner with the message
- **Rendered fields**: `coverimage` → framed cover with inset shadow, `category` → accent-pill, `title` → big serif h1 (clamp 36→68px), `author` → italic byline, `description` → lede paragraph, `price`/`stock`/`id` → 3-column meta strip ("№ {id}", "$X.XX", "N in archive"), CTA = "Acquire Volume" (or "Notify When Available" if stock=0).
- **Return to Collection**: the back link's `href` + label is chosen from the book's `category`, not from `document.referrer` — opening a `?id=` URL directly still produces a correct destination. Mapping: Medical → marketplace.html · Philosophy → philosophy.html · Sci-Fi → scifi.html · Rare Editions → rare.html · anything else → index.html.
- **Console breadcrumbs**: `[book] fetching id <id>` on load, `[book] render success <id>` on success, `[book] not found <id>` on 404, `[book] fetch failed <err>` on network/parse error.
- **Document title**: replaced with `{title} — Lumina Literature` once the record renders, so browser tabs/back-stack stay meaningful.
- **Security**: `id` is `encodeURIComponent`'d into the URL. Every string field renders via `textContent`. The `coverimage` URL goes through the same `safeImageUrl()` validation as the catalog cards.

## CSS sections (in `css/styles.css`)

Single stylesheet that grew in append-only layers. Order is significant — later rules win where specificity ties.

1. **Base** (lines ~1-90): tokens (`--gold`, `--medical`, `--bg-0`, etc.), reset, body gradient, top bar, sidebar primitives.
2. **Layout primitives** (lines ~90-300): `.app`, `.hero`, `.section`, `.trending`, `.curated`, `.feature-card`, `.book`, `.chat`, `.composer`, `.insight`. Original v1 styling.
3. **Responsive** (lines ~250-360): five breakpoints — 1280, 1100, 820, 640, 400px. 1100 hides sidebar into a slide-in drawer.
4. **Design v2 components** (after `/* Design v2 — Lumina Literature mockup components */` marker): top-bar refinements with active underline, `.has-dot` notification, `.app.no-sidebar`, `.side-profile`, `.side-link`, hero `.scroll-indicator` and `.ask-librarian`, `.segment-row` arrow-row layout, `.accent-pill`, `.accent-bar`, feature card price-row + Review Manuscript button, `.notes-card` head/stat-row, book pillrow + sparkle, `.transitioning` divider, chat avatar rows + `.chip` + composer with arrow send, `.aura-panel` with `@keyframes pulse`, `.insight` with `.quote-glyph`, `.theme-pill`, footer minimal v2.
5. **Hero video** (`.hero.has-video` overrides): `.hero-video` fills the hero behind the scrim, suppresses `.hero::before` photo and `.hero-canvas` Three.js layer.
6. **Card video** (`.volume-card .card-video`): same pattern for trending cards.
7. **3D stack** (`.trending.stack-3d`): overrides grid to `display: block` with `perspective: 1800px`, cards become `position: absolute`. Only active when JS adds the class on desktop.
8. **Premium polish**: `.scroll-progress`, `.hero h1 .char`, focus-visible gold outline, drag-protect images.
9. **Live catalog states** (after the responsive breakpoints, bottom of file): `.catalog[data-state="loading"] .book.book-skeleton` shimmer (transform-only on a 200% `background-position` gradient), `.catalog-empty` italic centered copy, `.catalog-error` red-on-dark banner with `.catalog-error-detail` (monospace error message) and `.catalog-error-hint`. `prefers-reduced-motion` flattens the shimmer.

## Conventions

- **Imagery**: Unsplash photo IDs as URL params (`?w=...&q=80`); local videos in `public/videos/` referenced as `/videos/filename.mp4`.
- **Icons**: inline SVG, `stroke-width: 1.6` or `1.8`, `fill: none, stroke: currentColor`. No icon library.
- **Colors**: only via CSS variables (`var(--gold)`, `var(--medical)` etc.). Hex literals confined to gradient stops.
- **Reveal entries**: add `data-reveal` to any element you want fading in on scroll. Hero items + section heads + cards already have it. **Do not** put `data-reveal` on elements that will be injected after page load — see "Dynamic catalog fade-in" in the Animation system.
- **Live catalog containers**: any `.catalog` element on any page becomes data-driven if you give it a `data-category="…"`. `books.js` does the rest. No per-page wiring required.
- **Network-derived content**: anything coming from Xano (or any future API) must go through `textContent` for strings and validated URLs (`https://` + `encodeURI`) for any URL interpolated into CSS. Never `innerHTML` a fetched string.
- **Z-index stacking inside hero**: photo backdrop `0`, video/canvas `1`, scrim `::after` `2`, text content `3`.
- **Mobile drawer toggle**: `.icon-btn[aria-label="menu"]` toggles `body.sidebar-open`. The hamburger only displays below 1100px.

## Hosting

Deployed on Vercel at `https://lummm-five.vercel.app/`. Production branch is set to `claude/setup-lumina-literature-3Czkf` under **Settings → Environments → Production → Branch Tracking** (Vercel moved this out of the Git settings page — it used to live there). Every push to that branch auto-deploys to prod. If the setting ever gets reset to `main`, prod will serve stale builds and you have to manually **Promote to Production** from the Deployments tab after each push. The Vercel Toolbar appears only to logged-in team members; disable in Settings → Advanced if it bothers you.

**Important**: changing the Branch Tracking setting does **not** retroactively promote already-built preview deploys. After changing it, either re-deploy the latest commit from the Deployments tab or push a fresh commit to trigger a new prod build.

## Performance budget

- **Hero video**: keep under 2 MB. Re-encode any future hero with `ffmpeg -c:v libx264 -preset slower -crf 26 -vf "scale=1280:720:flags=lanczos,fps=24" -an -movflags +faststart -pix_fmt yuv420p`. The `+faststart` flag moves the moov atom to the head so streaming can begin before download finishes.
- **GPU compositing rule** (also in the 3d-motion skill): only animate `transform` and `opacity`. Never `top`/`left`/`width`/`height`/`margin`.
- **Long-lived video decodes**: any background-style video must be paused when offscreen via IntersectionObserver. ScrollTrigger's `onEnter` does not fire when the element starts already inside the active range, so don't rely on it for the initial play state.

## Security posture

Static frontend + one public Xano `GET /books`. No auth, no user data submitted, no cookies. The security headers are already in place so when Supabase / Firebase Auth lands, nothing has to be unlocked retroactively.

- **Security headers** live in `vercel.json` and apply to every route:
  - **CSP**: `default-src 'self'`; `style-src 'self' 'unsafe-inline' fonts.googleapis.com`; `font-src 'self' fonts.gstatic.com`; `img-src 'self' data: images.unsplash.com plus.unsplash.com i.postimg.cc x8ki-letl-twmt.n7.xano.io *.xano.io *.xanocdn.com`; `media-src 'self' d8j0ntlcm91z4.cloudfront.net` (right Trending mp4); `connect-src 'self' x8ki-letl-twmt.n7.xano.io` (Xano `/books`). `script-src 'self'` with no `'unsafe-inline'` or `'unsafe-eval'`. `frame-ancestors 'none'` kills clickjacking. **Any future external API URL (Supabase, Firebase, Stripe, etc.) must be added to `connect-src`** or fetch will be blocked. New cover-image origins go in `img-src`.
  - **HSTS** with 2-year `max-age`, `includeSubDomains`, `preload`
  - **X-Frame-Options: DENY**, **X-Content-Type-Options: nosniff**
  - **Referrer-Policy: strict-origin-when-cross-origin**
  - **Permissions-Policy** denies camera, mic, geolocation, payment, USB, motion sensors, MIDI, FLoC/Topics
  - **X-XSS-Protection: 0** (modern recommendation — CSP supersedes the legacy filter)
  - **Cross-Origin-Opener-Policy: same-origin**
- **Chat XSS fixed** — `appendMessage` in `js/app.js` uses `textContent` for the body and a `<template>` parse for the trusted avatar SVG. User input is never passed through `innerHTML`.
- **Xano payload sandboxing** — `js/books.js` builds every card via `createElement` + `textContent`. The `coverimage` URL is validated as `https://…` via `URL()` + regex, then `encodeURI`'d before being interpolated into `background-image`. A Xano record containing `<script>` or `");}body{…` in any field is rendered inert.
- **Input hardening** — search inputs `maxlength="120" autocomplete="off" spellcheck="false"`; the librarian chat prompt `maxlength="500" autocomplete="off"`. Caps the damage from paste-bombs.
- **No client-side persistence** — no `localStorage`, no `sessionStorage`, no cookies set by the frontend. There is nothing to leak.
- **No secrets in the frontend** — the Xano endpoint is intentionally public (no key in URL or header). When Supabase lands, only the anon/public key goes in the frontend (never the service-role key).

### When backend is added

1. Add the Supabase project URL to CSP `connect-src`.
2. Set up Row Level Security on every Supabase table before any client-side query — RLS is the security model, the anon key alone is not a secret.
3. If Firebase Auth is wired, allowlist `*.firebaseapp.com` + `*.googleapis.com` in `connect-src`, and `accounts.google.com` in `frame-src` if using popup OAuth.
4. Auth tokens go in `httpOnly` cookies (preferred) or `sessionStorage` (acceptable for SPAs that handle revocation); never `localStorage`.
5. Any user-generated content rendered later (reviews, comments) must go through `textContent`, never `innerHTML`, or through a sanitizer like DOMPurify with a strict allowlist.

## Planned (not yet wired)

- **Search**: `GET /books/search?q=` — would need an input on each wing + new debounced renderer path in `books.js`. Wing pages already have a search input UI; just isn't wired.
- **Cart / orders**: the "Acquire Volume" button on `book.html` and the "Add" button on each catalog card are placeholders. Needs auth first.
- Supabase for backend / data extensions (not Supabase Auth)
- Firebase Auth (decision pending — Supabase Auth would be simpler if no Firebase-specific features are needed)
- AI recommendations endpoint (post-auth)
- Two pending Meta AI videos (links the user has are `meta.ai/create/...` session URLs, not direct mp4s) — destination unclear, likely a third video showcase or to replace the right Trending card

## Skills

A custom skill lives at `.claude/skills/3d-motion/SKILL.md` covering magnetic tilt, scroll-driven 3D, `[data-reveal]` entries, 3D card fans, drag-to-rotate, idle float, scroll-snap depth sections, GSAP ScrollTrigger, and the GPU-composited performance rules. Reach for it when the user asks for any motion/animation work.

## Branch

Active development branch: `claude/setup-lumina-literature-3Czkf`. The `main` branch is empty/stale — do not push there without confirming with the user first.

## Known caveats

- The `meta.ai/create/...` URLs the user shares for AI-generated videos are **not** direct mp4 URLs. They have to download and drop into `public/videos/`, or paste a real CDN URL.
- GitHub's 100 MB hard limit per file applies. Current videos are well under.
- The Three.js hero scene (`hero3d.js`) is dormant on `index.html` because the page uses a `<video>` instead. It still runs if you remove the video tag or the `.has-video` class.
- **`data-reveal` on dynamic content is a footgun** — the reveal pass in `js/app.js` runs `gsap.utils.toArray('[data-reveal]')` once at matchMedia init, snapshotting existing DOM only. Any element added later that carries `data-reveal` inherits the `autoAlpha:0` start state with no animation to bring it back. This already burned us once on the catalog; see "Dynamic catalog fade-in" in the Animation system for the fix pattern.
- **Vercel "Production Branch" lives under Environments now**, not Git settings. The old CLAUDE.md note pointing to Settings → Git → Production Branch is wrong on current Vercel UI — it's Settings → Environments → Production → Branch Tracking.
- **Changing Branch Tracking does not retroactively promote existing preview deploys.** Either redeploy from the Deployments tab or push a new commit after the change.
- **Homepage is intentionally static.** Several rounds of experiments tried per-wing catalog showcases on `/` — the final decision is that the homepage stays cinematic/navigational and all live catalog rendering happens inside the wing pages. Don't add data-driven book grids to `index.html` without explicit confirmation.
