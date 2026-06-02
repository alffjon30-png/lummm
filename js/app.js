import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { initHero3D } from './hero3d.js';
import { initBooks, initBookDetail } from './books.js';
import { initSearch } from './search.js';
import { initAuth } from './auth.js';
import { initFavorites } from './favorites.js';

gsap.registerPlugin(ScrollTrigger);

const reduceMotionGlobal = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduceMotionGlobal) {
  const lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.6
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

const progressBar = document.createElement('div');
progressBar.className = 'scroll-progress';
document.body.appendChild(progressBar);
ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate: (self) => {
    progressBar.style.transform = `scaleX(${self.progress})`;
  }
});

function splitChars(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (!text.trim()) return;
    const frag = document.createDocumentFragment();
    [...text].forEach((ch) => {
      if (ch === ' ') {
        frag.appendChild(document.createTextNode(' '));
        return;
      }
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = ch;
      frag.appendChild(span);
    });
    node.replaceWith(frag);
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
    [...node.childNodes].forEach(splitChars);
  }
}

const heroH1 = document.querySelector('.hero h1');
if (heroH1 && !reduceMotionGlobal) {
  [...heroH1.childNodes].forEach(splitChars);
  gsap.set(heroH1.querySelectorAll('.char'), { autoAlpha: 0, y: 56, rotateX: -85 });
}

initHero3D();
initBooks();
initBookDetail();
initSearch();
initAuth();
initFavorites();

const heroVideo = document.querySelector('.hero-video');
if (heroVideo) {
  heroVideo.muted = true;
  heroVideo.setAttribute('muted', '');
  heroVideo.setAttribute('playsinline', '');
  heroVideo.playsInline = true;
  heroVideo.defaultMuted = true;
  let heroPlayed = false;
  const tryPlayHero = () => {
    if (heroPlayed) return;
    const p = heroVideo.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { heroPlayed = true; }).catch(() => {});
    }
  };
  ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach((evt) => {
    heroVideo.addEventListener(evt, tryPlayHero, { passive: true });
  });
  if (heroVideo.readyState >= 2) tryPlayHero();
  tryPlayHero();
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    tryPlayHero();
  } else {
    document.addEventListener('DOMContentLoaded', tryPlayHero, { once: true });
  }
  ['touchstart', 'click', 'pointerdown', 'scroll'].forEach((evt) => {
    document.addEventListener(evt, tryPlayHero, { once: true, passive: true });
  });
  let heroInView = true;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        heroInView = entry.isIntersecting;
        if (heroInView) {
          tryPlayHero();
        } else if (!heroVideo.paused) {
          heroVideo.pause();
        }
      });
    }, { threshold: 0.05 });
    io.observe(heroVideo);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && heroInView) tryPlayHero();
  });
}


const mm = gsap.matchMedia();

mm.add(
  {
    isDesktop: '(min-width: 900px)',
    isMobile: '(max-width: 899px)',
    reduceMotion: '(prefers-reduced-motion: reduce)'
  },
  (ctx) => {
    const { isDesktop, reduceMotion } = ctx.conditions;
    const dur = reduceMotion ? 0 : 0.9;

    gsap.defaults({ ease: 'power2.out', duration: dur });

    const hero = document.querySelector('.hero');
    if (hero) {
      const heroItems = [...hero.querySelectorAll('[data-reveal]')].filter((el) => el.tagName !== 'H1');
      gsap.fromTo(
        heroItems,
        { autoAlpha: 0, y: 28 },
        {
          autoAlpha: 1, y: 0, duration: dur,
          stagger: 0.1, ease: 'power3.out', delay: 0.25
        }
      );

      const heroH1 = hero.querySelector('h1');
      if (heroH1 && !reduceMotion) {
        const chars = heroH1.querySelectorAll('.char');
        if (chars.length) {
          gsap.to(chars, {
            autoAlpha: 1, y: 0, rotateX: 0,
            duration: 1.05, ease: 'power3.out',
            stagger: { each: 0.022, from: 'start' },
            delay: 0.45
          });
        } else {
          gsap.fromTo(heroH1, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: dur, delay: 0.4 });
        }
      }
    }

    const cardSelectors = '.volume-card, .thumb, .book, .feature-card, .notes-card, .aura-panel, .insight, .rec, .themes-block, .ambient';

    const others = gsap.utils
      .toArray('[data-reveal]')
      .filter((el) => !hero || !hero.contains(el))
      .filter((el) => !el.matches(cardSelectors));

    others.forEach((el) => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 32 },
        {
          autoAlpha: 1, y: 0, duration: dur, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
        }
      );
    });

    const D3 = !reduceMotion;
    function entrance3D(els, opts) {
      const o = Object.assign(
        { rotY: 12, rotX: 5, z: -100, y: 50, stagger: 0.08, dur: 1.1, perspective: 1400, start: 'top 85%' },
        opts || {}
      );
      els.forEach((el, i) => {
        const initRotY = typeof o.rotY === 'function' ? o.rotY(i) : o.rotY;
        if (D3) {
          gsap.set(el, {
            transformPerspective: o.perspective,
            transformOrigin: '50% 50%',
            rotationY: initRotY,
            rotationX: o.rotX,
            z: o.z,
            autoAlpha: 0,
            y: o.y
          });
          gsap.to(el, {
            rotationY: 0, rotationX: 0, z: 0, autoAlpha: 1, y: 0,
            duration: o.dur, ease: 'power3.out', delay: i * o.stagger,
            scrollTrigger: { trigger: o.trigger || el, start: o.start, toggleActions: 'play none none none' }
          });
        } else {
          gsap.fromTo(el,
            { autoAlpha: 0, y: 40 },
            {
              autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: i * 0.06,
              scrollTrigger: { trigger: o.trigger || el, start: o.start, toggleActions: 'play none none none' }
            }
          );
        }
      });
    }

    gsap.utils.toArray('.volume-card').forEach((card, i) => {
      const layer = card.querySelector('.bg, video.card-video');
      if (layer) {
        gsap.to(layer, {
          yPercent: -12, scale: 1.1, ease: 'none',
          scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      }

      const startRot = i === 0 ? 14 : -14;

      gsap.set(card, {
        transformPerspective: 1400,
        transformOrigin: '50% 50%',
        rotationY: startRot,
        rotationX: 8,
        z: -120,
        autoAlpha: 0,
        y: 80
      });

      gsap.to(card, {
        rotationY: i === 0 ? 6 : -6,
        rotationX: 3,
        z: 0,
        autoAlpha: 1,
        y: 0,
        duration: 1.3,
        ease: 'power3.out',
        delay: i * 0.14,
        scrollTrigger: {
          trigger: '.trending',
          start: 'top 82%',
          toggleActions: 'play none none none'
        }
      });

      gsap.to(card, {
        rotationY: 0,
        rotationX: 0,
        scale: 1.015,
        ease: 'none',
        scrollTrigger: {
          trigger: '.trending',
          start: 'top 60%',
          end: 'bottom 40%',
          scrub: 1.1
        }
      });
    });

    const thumbs = gsap.utils.toArray('.thumb');
    if (thumbs.length) {
      entrance3D(thumbs, {
        trigger: document.querySelector('.curated-grid') || thumbs[0],
        rotY: (i) => (i % 2 === 0 ? -14 : 14),
        rotX: 6, z: -130, y: 60, stagger: 0.1, perspective: 1400
      });
    }

    const catalogBooks = gsap.utils.toArray('.catalog .book');
    if (catalogBooks.length) {
      entrance3D(catalogBooks, {
        trigger: document.querySelector('.catalog'),
        rotY: 18, rotX: 6, z: -150, y: 70, stagger: 0.1, perspective: 1500, start: 'top 82%'
      });
    }

    const featureCards = gsap.utils.toArray('.feature-card');
    if (featureCards.length) {
      entrance3D(featureCards, {
        rotY: -12, rotX: 5, z: -110, y: 60, stagger: 0, perspective: 1500, dur: 1.2
      });
    }

    const notesCards = gsap.utils.toArray('.notes-card');
    if (notesCards.length) {
      entrance3D(notesCards, {
        rotY: 12, rotX: 4, z: -90, y: 50, stagger: 0, perspective: 1400, dur: 1.1, start: 'top 86%'
      });
    }

    const sideRail = gsap.utils.toArray('.aura-panel, .insight, .themes-block');
    if (sideRail.length) {
      entrance3D(sideRail, {
        rotY: 14, rotX: 4, z: -90, y: 50, stagger: 0.12, perspective: 1400, start: 'top 88%'
      });
    }

    const recs = gsap.utils.toArray('.rec');
    if (recs.length) {
      entrance3D(recs, {
        rotY: (i) => (i % 2 === 0 ? -10 : 10),
        rotX: 4, z: -70, y: 30, stagger: 0.1, perspective: 1300, dur: 0.9, start: 'top 92%'
      });
    }

    gsap.utils.toArray('video.card-video').forEach((video) => {
      video.muted = true;
      ScrollTrigger.create({
        trigger: video,
        start: 'top 95%',
        end: 'bottom 5%',
        onEnter: () => video.play().catch(() => {}),
        onEnterBack: () => video.play().catch(() => {}),
        onLeave: () => video.pause(),
        onLeaveBack: () => video.pause()
      });
    });

    if (!reduceMotion) {
      const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (canHover) {
        const tiltSelectors = '.book, .thumb, .feature-card, .notes-card, .aura-panel, .insight, .rec';
        gsap.utils.toArray(tiltSelectors).forEach((el) => {
          el.style.transformStyle = 'preserve-3d';
          el.style.willChange = 'transform';
          let queued = false;
          const onMove = (e) => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
              const r = el.getBoundingClientRect();
              const x = (e.clientX - r.left) / r.width - 0.5;
              const y = (e.clientY - r.top) / r.height - 0.5;
              gsap.to(el, {
                rotateY: x * 10,
                rotateX: -y * 8,
                scale: 1.015,
                transformPerspective: 1000,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: 'auto'
              });
              queued = false;
            });
          };
          const onLeave = () => {
            gsap.to(el, {
              rotateY: 0, rotateX: 0, scale: 1,
              duration: 0.8, ease: 'elastic.out(1, 0.5)',
              overwrite: 'auto'
            });
          };
          el.addEventListener('mousemove', onMove, { passive: true });
          el.addEventListener('mouseleave', onLeave);
        });
      }

      gsap.utils.toArray('.btn-light, .btn-ghost, .ask-librarian, .review-btn, .composer .send').forEach((btn) => {
        const strength = btn.classList.contains('ask-librarian') || btn.classList.contains('send') ? 0.45 : 0.28;
        let raf = null;
        const onMove = (e) => {
          if (raf) return;
          raf = requestAnimationFrame(() => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            gsap.to(btn, { x: x * strength, y: y * strength, duration: 0.4, ease: 'power3.out' });
            raf = null;
          });
        };
        btn.addEventListener('mousemove', onMove);
        btn.addEventListener('mouseleave', () => {
          gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' });
        });
      });
    }

  }
);

if (!reduceMotionGlobal) {
  const main = document.querySelector('main');
  if (main) {
    gsap.fromTo(main,
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.05 }
    );
  }

  const here = window.location.pathname.replace(/\/$/, '') || '/index.html';
  document.querySelectorAll('a[href$=".html"]').forEach((link) => {
    let url;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin) return;
    const target = url.pathname.replace(/\/$/, '') || '/index.html';
    if (target === here) return;

    link.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      const m = document.querySelector('main');
      gsap.to(m, {
        autoAlpha: 0, y: -18, duration: 0.32, ease: 'power2.in',
        onComplete: () => { window.location.href = link.href; }
      });
    });
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      const m = document.querySelector('main');
      if (m) gsap.set(m, { autoAlpha: 1, y: 0 });
    }
  });
}

const kickVideos = () => {
  document.querySelectorAll('video[autoplay]').forEach((v) => {
    v.muted = true;
    v.play().catch(() => {});
  });
};
['touchstart', 'click', 'pointerdown'].forEach((evt) => {
  document.addEventListener(evt, kickVideos, { once: true, passive: true });
});
window.addEventListener('load', kickVideos, { once: true });

const menuBtn = document.querySelector('.icon-btn[aria-label="menu"]');
const sidebar = document.querySelector('.sidebar');
if (menuBtn && sidebar) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.body.classList.toggle('sidebar-open');
  });
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('sidebar-open')) return;
    if (sidebar.contains(e.target)) return;
    document.body.classList.remove('sidebar-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.body.classList.remove('sidebar-open');
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1100) document.body.classList.remove('sidebar-open');
  });
}

const composer = document.getElementById('composer');
const promptInput = document.getElementById('prompt');
const msgsEl = document.getElementById('chat-msgs');

const BOT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
const USER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.7c1-2 2.9-3.2 5-3.2s4 1.2 5 3.2"/></svg>';

if (composer && promptInput && msgsEl) {
  const replies = [
    'A worthy question. Let me consult the index — give me a moment.',
    'I would point you toward the Memoir & Memory thread; its volumes carry that exact register.',
    'There is a quiet shelf in the Philosophy wing that mirrors that mood.',
    'A few volumes glimmer faintly with that resonance. Shall I bring them forth?'
  ];

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = promptInput.value.trim();
    if (!text) return;
    appendMessage('user', text);
    promptInput.value = '';
    setTimeout(() => {
      const reply = replies[Math.floor(Math.random() * replies.length)];
      appendMessage('bot', reply);
    }, 500);
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      promptInput.value = chip.textContent.trim();
      promptInput.focus();
    });
  });

  function appendMessage(kind, body) {
    const row = document.createElement('div');
    row.className = `msg-row ${kind}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    const tmpl = document.createElement('template');
    tmpl.innerHTML = kind === 'user' ? USER_ICON : BOT_ICON;
    avatar.appendChild(tmpl.content);

    const msg = document.createElement('div');
    msg.className = `msg ${kind}`;
    msg.textContent = body;

    row.appendChild(avatar);
    row.appendChild(msg);
    msgsEl.appendChild(row);
    gsap.from(row, { autoAlpha: 0, y: 12, duration: 0.4, ease: 'power2.out' });
    row.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}
