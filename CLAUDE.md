# Lumina Literature

A cinematic, dark-themed static web app for a curated literary archive. Three pages, no framework, premium motion design.

## Stack

- **Build**: Vite 6 (multi-page), no transpiler beyond ES modules
- **Animation**: GSAP 3.12 + ScrollTrigger; Lenis smooth scroll wired into ScrollTrigger
- **3D**: Three.js (only used on the index hero when no video is present)
- **Type**: Cormorant Garamond (serif) + Inter (sans), Google Fonts
- **No backend yet** — Supabase + Firebase Auth are planned but not wired

## Pages (entry points in `vite.config.js`)

| File | Route | Wing | Curator | Accent |
|---|---|---|---|---|
| `index.html` | `/` | — (hero landing) | — | gold |
| `marketplace.html` | `/marketplace.html` | The Medical Wing | Dr. Aris Thorne · Senior Curator | `--medical` cyan |
| `rare.html` | `/rare.html` | The Rare Editions Vault | Mme. Vivienne Aubert · Chief Archivist | `--rare` bronze |
| `philosophy.html` | `/philosophy.html` | The Philosophy Rotunda | Prof. Adrien Lavoie · Emeritus Reader | `--philosophy` amethyst |
| `scifi.html` | `/scifi.html` | The Speculative Wing | Dr. Kai Voronin · Speculative Curator | `--scifi` ember |
| `librarian.html` | `/librarian.html` | The Librarian's Study (AI chat) | The Archivist · Deep Library Access | gold |

**Index** has no sidebar. Hero plays `/videos/hero-0511.mp4` autoplay-muted-loop with a darkened scrim. The Three.js procedural-book scene (`js/hero3d.js`) is **dormant whenever the hero has `.has-video` or a `.hero-video` element** — it stays in the codebase and is fully functional, but the video takes the slot. To switch back to the procedural scene, remove the `<video>` element + `has-video` class from `index.html`. Trending Volumes uses pinned 3D scroll-stack on desktop, both cards play video. Curated Segments uses arrow-row layout linking to each wing.

**Wing pages** (marketplace / rare / philosophy / scifi) share a template: sidebar with `Segments` label + 4 cross-wing nav links + curator profile pinned at bottom; page head with accent pill ("Medical Accent: Cyan", "Philosophy · Amethyst" etc.) + accent bar; Collector's Highlight card with bespoke title/price/CTA; Curator's Notes card with stat row; 4-card catalog with type pills; "Transitioning to" divider linking the wings in a cycle (Medical → Philosophy & Ethics, Rare → Medical, Philosophy → Sci-Fi, Sci-Fi → Rare). The wing's accent color comes from `body.wing-{name}` setting `--wing`, `--wing-bg`, `--wing-border` CSS variables that everything wing-specific reads.

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
├── vite.config.js          # 6 entry points
├── package.json
├── css/styles.css          # Single stylesheet, layered sections (see below)
├── js/
│   ├── app.js              # Entry: Lenis, char split, ScrollTrigger, magnetic CTAs, chat, sidebar
│   └── hero3d.js           # Three.js scene; bails if hero has .has-video
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
- **Video viewport play/pause** — every `video.card-video, video.hero-video` plays only when its ScrollTrigger reports it intersecting; pauses otherwise.
- **Magnetic CTAs** — `.btn-light, .btn-ghost, .ask-librarian, .review-btn, .composer .send` pull toward cursor on `mousemove` (rAF-throttled), snap back with `elastic.out` on `mouseleave`.
- **Scroll progress bar** — fixed top, scaleX driven by `ScrollTrigger.create({ start: 0, end: 'max' })`.
- **Generic `[data-reveal]`** — fade-in scrubbed by `ScrollTrigger`. Trending cards are excluded when 3D stack is active.

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

## Conventions

- **Imagery**: Unsplash photo IDs as URL params (`?w=...&q=80`); local videos in `public/videos/` referenced as `/videos/filename.mp4`.
- **Icons**: inline SVG, `stroke-width: 1.6` or `1.8`, `fill: none, stroke: currentColor`. No icon library.
- **Colors**: only via CSS variables (`var(--gold)`, `var(--medical)` etc.). Hex literals confined to gradient stops.
- **Reveal entries**: add `data-reveal` to any element you want fading in on scroll. Hero items + section heads + cards already have it.
- **Z-index stacking inside hero**: photo backdrop `0`, video/canvas `1`, scrim `::after` `2`, text content `3`.
- **Mobile drawer toggle**: `.icon-btn[aria-label="menu"]` toggles `body.sidebar-open`. The hamburger only displays below 1100px.

## Planned (not yet wired)

- Supabase for backend / data (not Supabase Auth)
- Firebase Auth (decision pending — Supabase Auth would be simpler if no Firebase-specific features are needed)
- Two pending Meta AI videos (links the user has are `meta.ai/create/...` session URLs, not direct mp4s) — destination unclear, likely a third video showcase or to replace the right Trending card

## Skills

A custom skill lives at `.claude/skills/3d-motion/SKILL.md` covering magnetic tilt, scroll-driven 3D, `[data-reveal]` entries, 3D card fans, drag-to-rotate, idle float, scroll-snap depth sections, GSAP ScrollTrigger, and the GPU-composited performance rules. Reach for it when the user asks for any motion/animation work.

## Branch

Active development branch: `claude/setup-lumina-literature-3Czkf`. The `main` branch is empty/stale — do not push there without confirming with the user first.

## Known caveats

- The `meta.ai/create/...` URLs the user shares for AI-generated videos are **not** direct mp4 URLs. They have to download and drop into `public/videos/`, or paste a real CDN URL.
- GitHub's 100 MB hard limit per file applies. Current videos are well under.
- The Three.js hero scene (`hero3d.js`) is dormant on `index.html` because the page uses a `<video>` instead. It still runs if you remove the video tag or the `.has-video` class.
