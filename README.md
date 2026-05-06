# Lumina Literature

A cinematic, dark-themed web app for a curated literary archive — built as a static site with GSAP animations.

## Pages
- `index.html` — Hero landing (Volume II · Infinity, Trending Volumes, Curated Segments)
- `marketplace.html` — Marketplace · The Medical Wing (Anatomia Universale, Curator's Notes, Catalog)
- `librarian.html` — The Librarian's Study (AI-style chat with curated recommendations)

## Stack
- Static HTML / CSS / JS — no build step
- [GSAP](https://gsap.com) + ScrollTrigger via CDN for entrance, scroll, and chat animations
- Cormorant Garamond + Inter via Google Fonts

## Run

Install once:
```bash
npm install
```

Dev server with hot reload:
```bash
npm run dev      # http://localhost:5173
```

Production build + preview:
```bash
npm run build    # outputs to ./dist
npm run preview  # serves ./dist
```

Or, with no Node at all, just serve the folder:
```bash
python3 -m http.server 8080
```

## Animations
Driven by `js/app.js`:
- Hero entrance: staggered `gsap.from` reveal (autoAlpha + y).
- Section reveals: `ScrollTrigger` on every `[data-reveal]` element.
- Volume cards: subtle parallax on the `.bg` layer via `scrub`.
- Chat: each appended message animates in (`gsap.from` autoAlpha + y).
- Wrapped in `gsap.matchMedia()` to respect `prefers-reduced-motion`.
