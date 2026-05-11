# Motion Stack — Handoff Brief

You are a fresh chat working on a **new repo** for a custom animation/motion stack. The user just finished a sibling project — **Lumina Literature** (a cinematic literary archive site) — and learned a lot about what works and what doesn't when shipping premium scroll/3D motion on the web. This document is the distilled knowledge from that project. Read it before writing any animation code.

---

## What was just built (context, not to be copied verbatim)

A Vite multi-page static site at https://lummm-five.vercel.app/ with six pages (one landing hero + four "wing" pages + an AI-chat page). Single stylesheet, no framework. Stack:

- **GSAP 3.12 + ScrollTrigger** for everything timeline-based
- **Lenis** for smooth scroll, ticked into `ScrollTrigger.update`
- **Three.js** for a procedural-book hero (kept as a fallback path; the live site uses a video instead)
- **IntersectionObserver** for play/pause of background videos
- A custom skill at `.claude/skills/3d-motion/SKILL.md` (783 lines) documenting the motion grammar

What shipped in motion terms:
- Char-by-char hero headline reveal (`splitChars()` walks text nodes, wraps each glyph in `<span class="char">`, preserves `<br>` / `<em>`)
- A pinned 3D "scroll stack" on a Trending Volumes section — one card scales back into Z while the next emerges from behind
- Magnetic CTAs (rAF-throttled `mousemove`, elastic snapback on `mouseleave`)
- `[data-reveal]` declarative fade/lift entries
- 3D entrance helper (`entrance3D`) with per-card `rotationY`/`rotationX`/`z` starts that resolve to identity at scroll-trigger
- Inner-card parallax for `.bg` / `.card-video` layers
- Scroll-progress bar across the viewport top

---

## Lessons earned (read these — they're the actual deliverables)

### 1. GPU-composite or it'll jank

Only animate `transform` and `opacity`. Never `top`/`left`/`width`/`height`/`margin`/`box-shadow`. Use `translate3d` / `rotateX` / `scale` / `rotateY` to force layer promotion. Lenis + ScrollTrigger + parallax + a background video already pushes mid-range laptops; one mistakenly-animated layout property will visibly stutter.

### 2. ScrollTrigger `onEnter` does NOT fire if the element starts already inside the active range

This is the single most painful gotcha. If you write:
```js
ScrollTrigger.create({
  trigger: heroVideo,
  start: 'top 95%',
  end: 'bottom 5%',
  onEnter: () => video.play()
})
```
…and the hero video is at the top of the page (so it's *already* between start and end at page load), **`onEnter` will not fire**. Mobile users will see the poster forever.

**Fix**: use `IntersectionObserver` instead — it fires synchronously after observation begins, regardless of initial state.
```js
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => e.isIntersecting ? video.play() : video.pause());
}, { threshold: 0.05 });
io.observe(video);
```

### 3. Mobile autoplay is fragile — belt + suspenders

A muted, `playsinline`, `autoplay` video should autoplay on mobile. In practice:
- iOS Low Power Mode silently blocks it
- Some Android data-saver modes strip the autoplay attribute at network layer
- The `muted` HTML attribute alone isn't always honored; set `video.muted = true` programmatically too
- First user gesture unlocks it — listen for `touchstart`/`click`/`pointerdown`/`scroll` (passive, `{ once: true }`) and call `play()` again

Set up a `tryPlay()` function with an internal `played` flag, then bind it to: script load, `loadedmetadata`/`loadeddata`/`canplay`/`canplaythrough`, `DOMContentLoaded`, first touch/click/pointer/scroll, and `visibilitychange`. Belt and suspenders — but on real devices it's the difference between a working hero and a poster image.

### 4. Always pause background videos when offscreen

A 720p H.264 loop continuously decoding off-viewport adds ~5-10% sustained CPU on a laptop. Multiply across cards and you'll feel the lag in unrelated scroll animations. IntersectionObserver pause is non-negotiable for any decorative video.

### 5. Video file size dominates first paint

The motion code is rarely the bottleneck; the asset is. Target hero videos under 2 MB. The recipe that worked:
```bash
ffmpeg -i src.mp4 \
  -c:v libx264 -preset slower -crf 26 \
  -vf "scale=1280:720:flags=lanczos,fps=24" \
  -an \
  -movflags +faststart \
  -pix_fmt yuv420p \
  out.mp4
```
- `crf 26` is visually lossless for muted background loops; soft motion masks artifacts
- `preset slower` buys ~15% better compression at the same quality vs `medium`
- `fps=24` is cinematic and saves ~20% over 30fps with no perceived loss
- `-an` strips the audio track (always strip for muted backgrounds)
- `+faststart` puts the moov atom at the head so the browser starts decoding before the file finishes downloading
- A 12 MB 10 Mbps source became 1.6 MB at 1.3 Mbps with no perceivable difference

### 6. `gsap.matchMedia()` is the right responsive primitive

Don't write `if (window.innerWidth > 900)` once at load — use `gsap.matchMedia()` with named conditions:
```js
mm.add({
  isDesktop: '(min-width: 900px)',
  isMobile: '(max-width: 899px)',
  reduceMotion: '(prefers-reduced-motion: reduce)'
}, (ctx) => {
  const { isDesktop, reduceMotion } = ctx.conditions;
  // build animations here
  // return cleanup function — runs when conditions change
});
```
This gives you free cleanup on resize past a breakpoint *and* a no-op fallback for users who set reduced-motion. Wire **every** non-trivial motion path through `prefers-reduced-motion`.

### 7. Lenis + ScrollTrigger wiring

One line that's worth memorizing:
```js
const lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.6 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```
Skip the Lenis init entirely under `prefers-reduced-motion`. `touchMultiplier: 1.6` matters on iOS — the default feels sluggish there.

### 8. Magnetic CTAs — the recipe that doesn't feel gimmicky

- Pull strength `~0.28` for normal buttons, `~0.45` for "hero" CTAs — any more and it looks broken
- Throttle `mousemove` with rAF (one transform per frame, no more)
- Reset with `gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' })` — elastic on reset is what sells it
- Guard with `matchMedia('(hover: hover) and (pointer: fine)')` so it never runs on touch devices

### 9. Char-split for headline reveals

Walk text nodes recursively, wrap each grapheme in `<span class="char">`, preserve `<br>` and inline children like `<em>`. Then animate `rotateX -85 → 0`, `y 56 → 0`, `autoAlpha 0 → 1` with `stagger: { each: 0.022, from: 'start' }` and `duration: 1.05`. 22ms stagger is the sweet spot — slower than 22 reads as sluggish, faster than 18 reads as a blur.

### 10. Don't pin sections shorter than 100vh

The pinned 3D stack section is 140vh of scroll for ~70vh of pinned content. Pin durations shorter than 100vh feel like the page froze briefly; longer than ~180vh feels punitive. Scrub value `1.2` is the sweet spot — instant scrub (`true`) is jittery on touchpads, scrub `2` is mushy.

---

## Decisions log — things considered and rejected

| Considered | Rejected because |
|---|---|
| Framer Motion | Heavier than GSAP, weaker scroll story, weaker timeline ergonomics |
| Three.js for the hero | A 1.6 MB looping video looks more cinematic with 1/100th the GPU cost |
| `preload="auto"` on all videos | Saturates the network pipe at first paint; use it only on the LCP hero |
| Pausing videos via ScrollTrigger | `onEnter` doesn't fire when starting in-view — see Lesson 2 |
| Per-device feature flags in code | Use `gsap.matchMedia()` instead — declarative and cleanup-aware |
| `box-shadow` for hover lifts | Animating shadow paints every frame; use a stacked `::after` with `opacity` instead |
| Webfonts via `@import` | Use `<link rel="preconnect">` + `<link rel="preload" as="font">` for FOIT control |

---

## Defaults for the new stack

These are the eight values that, when you can't decide, just use:

| Property | Default | Why |
|---|---|---|
| Ease (in) | `power3.out` | Fast settle, no overshoot |
| Ease (snap-back) | `elastic.out(1, 0.45)` | Reads as "premium," not toy |
| Reveal duration | `0.9s` | Long enough to read motion, short enough to not block content |
| Stagger | `0.08s` | One beat per card |
| Scrub | `1.2` | Smooth without lag |
| Threshold | `0.05` | IntersectionObserver — trigger near edges, not mid-element |
| Perspective | `1400` | Enough depth to feel 3D without fisheye |
| `start: 'top 88%'` | for entries — fires just before user sees it |

---

## Workflow rules that helped

- **Single stylesheet, append-only layers**. Don't split CSS across modules until the file passes ~2000 lines. Specificity collisions are easier to grep than to debug across files.
- **CSS variables for every color**, hex literals only inside gradient stops. Theming a whole wing took one line because of this.
- **Inline SVG icons**, never an icon library. `stroke-width: 1.6` for body, `1.8` for buttons. Consistent stroke weight is what makes the icon set look bespoke.
- **`data-reveal` attribute** for any element that should fade in on scroll — declarative, no per-element JS.
- **Vercel auto-deploy**: set Production Branch to the feature branch you're actually pushing to, otherwise every push silently serves a stale build.

---

## Existing skill to copy over

`.claude/skills/3d-motion/SKILL.md` from the Lumina repo (783 lines) covers magnetic tilt, scroll-driven 3D, `[data-reveal]` entries, 3D card fans, drag-to-rotate, idle float, scroll-snap depth sections, GSAP ScrollTrigger patterns, and the GPU-composited performance rules. Pull it into the new repo as-is — it's the working motion grammar. Triggers: "3d", "tilt", "parallax", "scroll animation", "magnetic", "reveal", "carousel", "drag rotate", "scrollytelling", "gsap", "scrolltrigger", "motion design".

---

## Suggested starting point for the new repo

```
.
├── index.html
├── vite.config.js
├── package.json          # gsap, lenis, vite
├── src/
│   ├── main.js           # Lenis + ScrollTrigger wiring, matchMedia block
│   ├── motion/
│   │   ├── reveal.js     # [data-reveal] handler
│   │   ├── magnetic.js   # CTA magnetic pull
│   │   ├── chars.js      # splitChars + reveal
│   │   └── video.js      # IntersectionObserver play/pause + autoplay bootstrap
│   └── styles/
│       └── tokens.css    # CSS variables — colors, easings, durations
└── .claude/
    └── skills/
        └── 3d-motion/    # copy from Lumina
```

Treat `motion/` as the new stack's surface area. Each file exports one function that takes a root element (or defaults to `document`) and wires its scope. Compose them in `main.js`. That's the architecture that ended up wanting to exist by the end of Lumina — start there.

---

## What this brief is NOT

- Not a spec for the next product. The user will describe that themselves.
- Not a copy-paste codebase. The patterns above are the deliverable; rewrite them for the new repo's needs.
- Not exhaustive. Ask the user about: target browsers, accessibility level (AA/AAA), whether the motion should be a library others consume or a one-off site, and whether they want TypeScript this time.
