---
name: 3d-motion
description: Apply when adding, refining, or designing motion/animation on the web — magnetic mouse/touch tilt, scroll-driven 3D parallax, [data-reveal] entry animations, 3D card fans, drag-to-rotate, idle floating, scroll-snap depth sections, or GSAP ScrollTrigger timelines. Enforces the rule that only `transform` and `opacity` animate, prefers `IntersectionObserver` over scroll-position reads, and keeps everything GPU-composited. Triggers: "3d", "tilt", "parallax", "scroll animation", "magnetic", "reveal", "carousel", "drag rotate", "scrollytelling", "gsap", "scrolltrigger", "motion design".
---


# 3D Motion & Animation

## Mission

Every interactive element must feel **alive**. The page should respond to the user's body — their scroll, their touch, their mouse — as if the UI exists in physical space. No static layouts. No flat transitions. Every surface has depth, weight, and momentum.

## Core Philosophy

- **Scroll = camera movement** through a 3D world, not a flat list
- **Touch/mouse = gravity** that pulls elements toward the user's finger
- **Enter/exit = physics** — things don't appear, they arrive; they don't disappear, they depart
- **Depth is hierarchy** — important things are closer (`translateZ` positive), background elements recede (`translateZ` negative)
- **Every frame must be GPU-composited** — only animate `transform` and `opacity`, never `width`, `height`, `top`, `left`, `margin`

---

## Required Setup (always include this in every project)

```css
/* Global 3D foundation */
*, *::before, *::after {
  box-sizing: border-box;
}

:root {
  --perspective: 1000px;
  --tilt-max: 15deg;
  --float-distance: 20px;
  --spring-duration: 0.6s;
  --spring-easing: cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot spring */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-quart: cubic-bezier(0.76, 0, 0.24, 1);
}

.scene {
  perspective: var(--perspective);
  perspective-origin: 50% 40%; /* slightly above center for natural look */
}

.card-3d, .tilt-target, .float-element {
  transform-style: preserve-3d;
  will-change: transform;
  backface-visibility: hidden;
}
```

---

## 1. Mouse/Touch Tilt (Magnetic Tilt Effect)

**Rule:** Every card, hero image, product shot, or featured element must tilt toward the cursor/finger in 3D.

```js
// 3D Tilt — attach to any .tilt-target element
function initTilt(el) {
  const TILT_MAX = 15;
  const SCALE_ON_HOVER = 1.04;
  const SHINE = true;

  // Create shine layer
  if (SHINE) {
    const shine = document.createElement('div');
    shine.className = 'tilt-shine';
    shine.style.cssText = `
      position:absolute;inset:0;border-radius:inherit;
      background:radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 70%);
      pointer-events:none;opacity:0;transition:opacity 0.3s;
    `;
    el.style.position = 'relative';
    el.appendChild(shine);
  }

  function getAngle(e, rect) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width  - 0.5; // -0.5 to 0.5
    const y = (clientY - rect.top)  / rect.height - 0.5;
    return { x, y };
  }

  let rafId;
  let currentRX = 0, currentRY = 0;
  let targetRX  = 0, targetRY  = 0;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function animate() {
    currentRX = lerp(currentRX, targetRX, 0.12);
    currentRY = lerp(currentRY, targetRY, 0.12);
    el.style.transform = `
      perspective(800px)
      rotateX(${currentRX}deg)
      rotateY(${currentRY}deg)
      scale3d(${targetRX === 0 ? 1 : SCALE_ON_HOVER},
              ${targetRX === 0 ? 1 : SCALE_ON_HOVER},
              ${targetRX === 0 ? 1 : SCALE_ON_HOVER})
    `;
    rafId = requestAnimationFrame(animate);
  }
  rafId = requestAnimationFrame(animate);

  function onMove(e) {
    const rect = el.getBoundingClientRect();
    const { x, y } = getAngle(e, rect);
    targetRY =  x * TILT_MAX * 2;
    targetRX = -y * TILT_MAX * 2;

    if (SHINE) {
      const shine = el.querySelector('.tilt-shine');
      shine.style.opacity = '1';
      shine.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.25) 0%, transparent 60%)`;
    }
  }

  function onLeave() {
    targetRX = 0;
    targetRY = 0;
    if (SHINE) el.querySelector('.tilt-shine').style.opacity = '0';
  }

  el.addEventListener('mousemove',  onMove,  { passive: true });
  el.addEventListener('touchmove',  onMove,  { passive: true });
  el.addEventListener('mouseleave', onLeave);
  el.addEventListener('touchend',   onLeave);

  return () => {
    cancelAnimationFrame(rafId);
    el.removeEventListener('mousemove',  onMove);
    el.removeEventListener('touchmove',  onMove);
    el.removeEventListener('mouseleave', onLeave);
    el.removeEventListener('touchend',   onLeave);
  };
}

// Init all tilt elements
document.querySelectorAll('.tilt-target').forEach(initTilt);
```

---

## 2. Scroll-Driven 3D (The Main Event)

**Rule:** Scrolling must feel like flying through a scene. Use `IntersectionObserver` for entry triggers and `scroll` events for real-time parallax.

### 2a. Scroll-Linked Perspective Tilt (Hero Section)

```js
// Hero tilts forward as you scroll into it — feels like diving in
function initScrollTilt(heroEl) {
  const MAX_TILT       = 12; // degrees
  const PARALLAX_DEPTH = 60; // px

  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const heroH    = heroEl.offsetHeight;
    const progress = Math.min(scrolled / heroH, 1); // 0 → 1

    const tiltX      = progress *  MAX_TILT;
    const translateZ = progress * -PARALLAX_DEPTH;

    heroEl.style.transform = `
      perspective(1200px)
      rotateX(${tiltX}deg)
      translateZ(${translateZ}px)
    `;
    heroEl.style.opacity = 1 - progress * 0.4;
  }, { passive: true });
}
```

### 2b. Staggered 3D Reveal on Scroll Entry

```js
// Elements fly in from depth as they enter the viewport
function initScrollReveal() {
  const els = document.querySelectorAll('[data-reveal]');

  // Set initial state
  els.forEach((el, i) => {
    const dir   = el.dataset.reveal || 'up'; // up | left | right | zoom | flip
    const delay = el.dataset.delay  || i * 80;

    const initialStates = {
      up:    'perspective(800px) translateY(60px)  translateZ(-80px)  rotateX(8deg)',
      left:  'perspective(800px) translateX(-80px) translateZ(-60px)  rotateY(12deg)',
      right: 'perspective(800px) translateX(80px)  translateZ(-60px)  rotateY(-12deg)',
      zoom:  'perspective(800px) scale3d(0.8, 0.8, 0.8) translateZ(-120px)',
      flip:  'perspective(800px) rotateY(90deg) translateZ(-40px)',
    };

    el.style.cssText += `
      transform: ${initialStates[dir]};
      opacity: 0;
      transition: transform 0.9s var(--ease-out-expo) ${delay}ms,
                  opacity   0.7s ease ${delay}ms;
    `;
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.transform = 'perspective(800px) translate3d(0,0,0) rotateX(0) rotateY(0) scale3d(1,1,1)';
        entry.target.style.opacity   = '1';
        observer.unobserve(entry.target); // fire once
      }
    });
  }, { threshold: 0.15 });

  els.forEach(el => observer.observe(el));
}

initScrollReveal();
```

**Usage in HTML:**

```html
<div data-reveal="up"   data-delay="0">Card 1</div>
<div data-reveal="left" data-delay="100">Card 2</div>
<div data-reveal="flip" data-delay="200">Card 3</div>
```

### 2c. Multi-Layer Parallax (Deep 3D Scene)

```js
// Layers move at different speeds — background slower, foreground faster
function initParallax() {
  const layers = document.querySelectorAll('[data-depth]');
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    layers.forEach(layer => {
      const depth   = parseFloat(layer.dataset.depth); // 0.1 (far) → 1.0 (close)
      const yOffset = -(scrollY * depth * 0.4);
      const zOffset = depth * 40;
      layer.style.transform = `translate3d(0, ${yOffset}px, ${zOffset}px)`;
    });
  }, { passive: true });
}
initParallax();
```

**Usage:**

```html
<div class="scene">
  <div data-depth="0.1"><!-- stars / background --></div>
  <div data-depth="0.4"><!-- mid scene --></div>
  <div data-depth="0.8"><!-- foreground elements --></div>
  <div data-depth="1.0"><!-- closest / hero content --></div>
</div>
```

---

## 3. 3D Card Fan / Carousel

**Rule:** When displaying multiple cards (features, team, products), arrange them in a 3D arc — not a flat row.

```css
.card-fan {
  perspective: 1400px;
  perspective-origin: 50% 50%;
  display: flex;
  justify-content: center;
  gap: 0; /* overlap intentionally */
}

.card-fan .card:nth-child(1) { transform: rotateY(-35deg) translateZ(-80px) translateX(-20px); z-index: 1; }
.card-fan .card:nth-child(2) { transform: rotateY(-15deg) translateZ(-20px) translateX(-10px); z-index: 5; }
.card-fan .card:nth-child(3) { transform: rotateY(0deg)   translateZ(20px);                    z-index: 10; }
.card-fan .card:nth-child(4) { transform: rotateY(15deg)  translateZ(-20px) translateX(10px);  z-index: 5; }
.card-fan .card:nth-child(5) { transform: rotateY(35deg)  translateZ(-80px) translateX(20px);  z-index: 1; }

.card-fan .card {
  transform-style: preserve-3d;
  transition: transform 0.5s var(--spring-easing);
  will-change: transform;
}

/* Hover: bring hovered card forward and push others back */
.card-fan:hover .card { filter: brightness(0.7); }
.card-fan .card:hover {
  transform: rotateY(0deg) translateZ(60px) scale(1.05) !important;
  filter: brightness(1);
  z-index: 20;
}
```

---

## 4. Touch Drag 3D Rotate (Mobile-First)

**Rule:** On mobile, the user can drag/swipe to rotate a 3D object or scene.

```js
function init3DDrag(el) {
  let isDragging = false;
  let startX, startY;
  let rotX = 0, rotY = 0;
  let velX = 0, velY = 0;
  let lastX, lastY;

  function getPos(e) {
    return e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };
  }

  function onStart(e) {
    isDragging = true;
    const pos = getPos(e);
    startX = lastX = pos.x;
    startY = lastY = pos.y;
    velX = velY = 0;
    el.style.transition = 'none';
  }

  function onMove(e) {
    if (!isDragging) return;
    const pos = getPos(e);
    const dx = pos.x - lastX;
    const dy = pos.y - lastY;
    velX = dx;
    velY = dy;
    rotY += dx * 0.4;
    rotX -= dy * 0.4;
    rotX = Math.max(-45, Math.min(45, rotX)); // clamp X
    el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    lastX = pos.x;
    lastY = pos.y;
  }

  function onEnd() {
    isDragging = false;
    // Momentum / inertia
    function inertia() {
      if (Math.abs(velX) < 0.1 && Math.abs(velY) < 0.1) return;
      velX *= 0.92;
      velY *= 0.92;
      rotY += velX * 0.3;
      rotX -= velY * 0.3;
      el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      requestAnimationFrame(inertia);
    }
    requestAnimationFrame(inertia);
  }

  el.addEventListener('mousedown',  onStart);
  el.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('mouseup',   onEnd);
  window.addEventListener('touchend',  onEnd);
}

document.querySelectorAll('.draggable-3d').forEach(init3DDrag);
```

---

## 5. Floating Animation (Idle State)

**Rule:** 3D objects should never sit completely still. Apply a subtle idle float loop.

```css
@keyframes float-3d {
  0%   { transform: perspective(800px) translateY(0px)   rotateX(0deg)  rotateZ(0deg); }
  25%  { transform: perspective(800px) translateY(-12px) rotateX(3deg)  rotateZ(0.5deg); }
  50%  { transform: perspective(800px) translateY(-18px) rotateX(0deg)  rotateZ(-0.5deg); }
  75%  { transform: perspective(800px) translateY(-8px)  rotateX(-2deg) rotateZ(0.3deg); }
  100% { transform: perspective(800px) translateY(0px)   rotateX(0deg)  rotateZ(0deg); }
}

@keyframes float-shadow {
  0%   { transform: scale(1);    opacity: 0.3; }
  50%  { transform: scale(0.85); opacity: 0.15; }
  100% { transform: scale(1);    opacity: 0.3; }
}

.float-element {
  animation: float-3d 4s ease-in-out infinite;
  will-change: transform;
}

.float-element::after {
  content: '';
  position: absolute;
  bottom: -20px;
  left: 10%;
  width: 80%;
  height: 20px;
  background: radial-gradient(ellipse, rgba(0,0,0,0.25) 0%, transparent 70%);
  animation: float-shadow 4s ease-in-out infinite;
  border-radius: 50%;
}
```

---

## 6. Scroll-Snap 3D Sections

**Rule:** Full-page sections should snap into view with a 3D transition — previous section recedes back, new one arrives from depth.

```css
.snap-container {
  height: 100vh;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  perspective: 1px; /* enables true CSS scroll parallax */
}

.snap-section {
  height: 100vh;
  scroll-snap-align: start;
  transform-style: preserve-3d;
  transition: transform 0.8s var(--ease-in-out-quart),
              opacity   0.8s ease;
}

/* Sections entering from depth */
.snap-section.is-entering {
  transform: perspective(1000px) translateZ(-200px) scale(0.9);
  opacity: 0;
}
.snap-section.is-active {
  transform: perspective(1000px) translateZ(0px) scale(1);
  opacity: 1;
}
.snap-section.is-leaving {
  transform: perspective(1000px) translateZ(100px) scale(1.05);
  opacity: 0;
}
```

```js
// Drive section classes from IntersectionObserver
const sections = document.querySelectorAll('.snap-section');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.remove('is-entering', 'is-leaving');
      entry.target.classList.add('is-active');
    } else {
      entry.target.classList.remove('is-active');
      const rect = entry.target.getBoundingClientRect();
      entry.target.classList.add(rect.top > 0 ? 'is-entering' : 'is-leaving');
    }
  });
}, { threshold: 0.5 });

sections.forEach(s => sectionObserver.observe(s));
```

---

## 7. GSAP ScrollTrigger (When Vanilla JS Isn't Enough)

**Rule:** For complex timeline-driven 3D sequences (product reveals, story scrollytelling), use GSAP + ScrollTrigger. Always load from CDN.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
```

```js
gsap.registerPlugin(ScrollTrigger);

// Object spins and flies forward as you scroll through a section
gsap.timeline({
  scrollTrigger: {
    trigger: '.product-section',
    start:   'top center',
    end:     'bottom center',
    scrub:   1.5,   // smooth lag behind scroll
    pin:     true,  // pin section while animating
  }
})
.from('.product-3d', {
  rotateY: -90,
  rotateX: 20,
  z:       -400,
  opacity: 0,
  duration: 1,
  ease:    'power3.out'
})
.to('.product-3d', {
  rotateY: 360,
  z:       80,
  duration: 2,
  ease:    'none'
})
.to('.product-3d', {
  rotateX: -10,
  z:       0,
  scale:   0.9,
  opacity: 0,
  duration: 0.8
});
```

---

## Performance Rules (NON-NEGOTIABLE)

| ✅ Do | ❌ Never |
|---|---|
| Animate `transform` and `opacity` only | Animate `width`, `height`, `top`, `left`, `margin`, `padding` |
| Use `will-change: transform` on animated els | Apply `will-change` to everything (wastes GPU memory) |
| Use `requestAnimationFrame` for JS animation | Use `setInterval` or `setTimeout` for animation |
| Use `passive: true` on scroll/touch listeners | Block scroll with non-passive listeners |
| Use `transform3d()` or `translateZ(0)` to force GPU layer | Mix GPU and CPU layers on same element |
| Debounce resize handlers | Recalculate layout on every resize event |
| Use `IntersectionObserver` for scroll triggers | Read `getBoundingClientRect()` on every scroll event |

---

## React-Specific Implementation

When working in React, use this pattern:

```jsx
import { useRef, useEffect } from 'react';

function TiltCard({ children }) {
  const ref     = useRef(null);
  const raf     = useRef(null);
  const target  = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;

    function animate() {
      current.current.x += (target.current.x - current.current.x) * 0.1;
      current.current.y += (target.current.y - current.current.y) * 0.1;
      el.style.transform = `
        perspective(800px)
        rotateX(${current.current.y}deg)
        rotateY(${current.current.x}deg)
      `;
      raf.current = requestAnimationFrame(animate);
    }
    raf.current = requestAnimationFrame(animate);

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x =  ((e.clientX - rect.left) / rect.width  - 0.5) * 20;
      const y = -((e.clientY - rect.top)  / rect.height - 0.5) * 20;
      target.current = { x, y };
    };
    const onLeave = () => { target.current = { x: 0, y: 0 }; };

    el.addEventListener('mousemove',  onMove, { passive: true });
    el.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf.current);
      el.removeEventListener('mousemove',  onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
      {children}
    </div>
  );
}
```

---

## Quick Reference Cheatsheet

```
Mouse tilt effect    → .tilt-target class + initTilt()
Scroll reveal        → data-reveal="up|left|right|zoom|flip" + data-delay="ms"
Parallax depth       → data-depth="0.1–1.0" + initParallax()
3D card fan layout   → .card-fan > .card (CSS only)
Drag to rotate       → .draggable-3d class + init3DDrag()
Idle floating        → .float-element class (CSS only)
Scroll-snap sections → .snap-container > .snap-section + observer JS
GSAP scroll timeline → ScrollTrigger with scrub + pin
```

---

## 8. Three.js Premium Hero Scene (the "$10k agency look")

**Rule:** When a section needs a *bespoke 3D object* as the hero — like the Lagunitas IPA, CrazyCap, Cadence, or Keychrone reference sites — the recipe is **PBR materials + environment map + studio lighting + scroll-tied motion**, not floating colored cubes.

### 8a. Tone-mapped renderer + room environment for instant reflections

```js
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic, not flat
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Generate an indoor environment map — gives metals real reflections for free
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
```

### 8b. Three-point lighting (key + fill + rim)

```js
scene.add(new THREE.AmbientLight(0x1a2a36, 0.55));

const key = new THREE.DirectionalLight(0xfff1d6, 1.4); // warm key
key.position.set(5, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0005;
key.shadow.radius = 4;
scene.add(key);

scene.add(Object.assign(new THREE.DirectionalLight(0x4ea3a0, 0.55), { // cool fill
  position: new THREE.Vector3(-6, 2, 4)
}));

const rim = new THREE.SpotLight(0xd6b27a, 1.6, 24, Math.PI / 5, 0.6, 1); // gold rim
rim.position.set(-3, 4, -5);
scene.add(rim);
```

### 8c. PBR materials that read as real

Use `MeshPhysicalMaterial` (extends Standard with clearcoat + sheen). Pair `metalness` near 1.0 with low `roughness` for gold/brass; keep leather at `metalness: 0.08, roughness: 0.62` plus a subtle clearcoat:

```js
// Gold gilt
new THREE.MeshPhysicalMaterial({
  color: 0xd4a04c,
  metalness: 1.0,
  roughness: 0.18,
  clearcoat: 0.6,
  clearcoatRoughness: 0.2,
  emissive: 0xd4a04c,
  emissiveIntensity: 0.045
});

// Leather cover
new THREE.MeshPhysicalMaterial({
  color: 0x2a1410,
  roughness: 0.62,
  metalness: 0.08,
  clearcoat: 0.35,
  clearcoatRoughness: 0.55,
  sheen: 0.4,
  sheenColor: new THREE.Color(0x6b3a25)
});

// Paper / pages
new THREE.MeshPhysicalMaterial({
  color: 0xece3cf,
  roughness: 0.92,
  metalness: 0,
  sheen: 0.1
});
```

### 8d. Soft-edge geometry — never use sharp `BoxGeometry` for hero objects

```js
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 5 segments, 0.06 radius — light catches the corners
const cover = new RoundedBoxGeometry(width, height, depth, 5, 0.06);
```

Build composite objects (a book = cover + pages + spine + gilt frame + title plate + ribbon) by grouping multiple meshes into a `THREE.Group`. Each piece gets its own material so reflections behave correctly.

### 8e. Shadow-catching floor

A horizontal plane below the object catches the directional shadow and grounds it in space — the difference between "floating in void" and "sitting on a surface".

```js
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshPhysicalMaterial({ color: 0x07151e, roughness: 0.4, metalness: 0.05 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.2;
floor.receiveShadow = true;
scene.add(floor);
```

### 8f. Scroll-tied camera dolly + idle drift (the motion recipe)

The reference sites all share this motion fingerprint: **slow idle rotation always**, **scroll dollies the camera back and rotates the stage**, **mouse parallax glides the camera horizontally**.

```js
const scroll = { progress: 0 };
ScrollTrigger.create({
  trigger: hero,
  start: 'top top',
  end:   '+=120%',
  scrub: 1.2,
  onUpdate: (self) => { scroll.progress = self.progress; }
});

const target = { x: 0, y: 0 };
hero.addEventListener('mousemove', (e) => {
  const r = hero.getBoundingClientRect();
  target.x = ((e.clientX - r.left) / r.width  - 0.5) * 1.4;
  target.y = ((e.clientY - r.top)  / r.height - 0.5) * 0.8;
});

function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();

  // Idle: every object always breathes
  mainBook.rotation.y = baseRot + Math.sin(t * 0.25) * 0.12;
  mainBook.position.y = base + Math.sin(t * 0.5) * 0.08;

  // Scroll: rotate the whole stage, dolly camera back
  stage.rotation.y = scroll.progress * Math.PI * 0.35;
  stage.position.z = scroll.progress * -2.5;

  // Mouse: smoothed lerp, never instant
  camera.position.x += (target.x * 1.1 - camera.position.x) * 0.05;
  camera.position.y += (-target.y * 0.6 + 0.6 - scroll.progress * 0.8 - camera.position.y) * 0.05;
  camera.position.z += (11 + scroll.progress * 4 - camera.position.z) * 0.05;
  camera.lookAt(0.4, 0, 0);

  renderer.render(scene, camera);
}
```

### 8g. Entrance: fly each piece in from depth

```js
[mainBook, sideBookA, sideBookB].forEach((b, i) => {
  const fromZ = b.position.z - 8 - i * 2;
  gsap.from(b.position, { z: fromZ, duration: 1.6, delay: 0.15 + i * 0.1, ease: 'expo.out' });
  gsap.from(b.rotation, {
    x: '+=' + Math.PI * 0.4, y: '+=' + Math.PI * 0.7,
    duration: 1.6, delay: 0.15 + i * 0.1, ease: 'expo.out'
  });
});
```

### 8h. Performance & lifecycle

- `IntersectionObserver` on the hero so `tick()` short-circuits when offscreen — never render a hidden canvas
- `ResizeObserver` to keep the canvas/camera in sync (don't listen to `window.resize`, the hero can resize without window resizing — sidebar collapse, layout shift, etc.)
- `setPixelRatio(Math.min(devicePixelRatio, 2))` — past 2× DPR you're paying GPU cost no one can see

### 8i. When you need a real model (GLTF)

The procedural approach above maxes out at "premium-feeling primitives". For *photorealistic* products (cameras, headphones, watches), load a `.glb`:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

new GLTFLoader().load('/models/book.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = c.receiveShadow = true;
      c.material.envMapIntensity = 0.9;
    }
  });
  scene.add(model);
});
```

Source `.glb` files from Sketchfab (CC0 / CC-BY), Poly Haven, or commission on Fiverr. Keep them under 5 MB; compress with `gltf-transform optimize` if larger. Drop into `public/models/` (Vite serves it at `/models/...`).
