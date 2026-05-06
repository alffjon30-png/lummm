import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initHero3D } from './hero3d.js';

gsap.registerPlugin(ScrollTrigger);

initHero3D();

const mm = gsap.matchMedia();

mm.add(
  {
    isDesktop: '(min-width: 800px)',
    isMobile: '(max-width: 799px)',
    reduceMotion: '(prefers-reduced-motion: reduce)'
  },
  (ctx) => {
    const { reduceMotion } = ctx.conditions;
    const dur = reduceMotion ? 0 : 0.9;

    gsap.defaults({ ease: 'power2.out', duration: dur });

    const hero = document.querySelector('.hero');
    if (hero) {
      const heroItems = hero.querySelectorAll('[data-reveal]');
      gsap.fromTo(
        heroItems,
        { autoAlpha: 0, y: 28 },
        {
          autoAlpha: 1, y: 0, duration: dur,
          stagger: 0.12, ease: 'power3.out', delay: 0.15
        }
      );
    }

    const others = gsap.utils
      .toArray('[data-reveal]')
      .filter((el) => !hero || !hero.contains(el));

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

    gsap.utils.toArray('.volume-card').forEach((card) => {
      const bg = card.querySelector('.bg');
      if (!bg) return;
      gsap.to(bg, {
        yPercent: -8, ease: 'none',
        scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    if (!reduceMotion) {
      gsap.utils.toArray('.book, .thumb').forEach((el) => {
        el.addEventListener('mouseenter', () => gsap.to(el, { y: -4, duration: 0.25 }));
        el.addEventListener('mouseleave', () => gsap.to(el, { y: 0, duration: 0.25 }));
      });
    }
  }
);

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
    row.innerHTML = `
      <div class="msg-avatar">${kind === 'user' ? USER_ICON : BOT_ICON}</div>
      <div class="msg ${kind}">${body}</div>
    `;
    msgsEl.appendChild(row);
    gsap.from(row, { autoAlpha: 0, y: 12, duration: 0.4, ease: 'power2.out' });
    row.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}
