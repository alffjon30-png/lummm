// Lumina Literature — GSAP animations
gsap.registerPlugin(ScrollTrigger);

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
      gsap.from(heroItems, {
        autoAlpha: 0, y: 24, duration: dur, stagger: 0.12,
        ease: 'power3.out', clearProps: 'all'
      });
    }

    const others = gsap.utils.toArray('[data-reveal]').filter((el) => !hero || !hero.contains(el));
    others.forEach((el) => {
      gsap.from(el, {
        autoAlpha: 0, y: 28, duration: dur, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
      });
    });

    gsap.utils.toArray('.volume-card').forEach((card) => {
      const bg = card.querySelector('.bg');
      if (!bg) return;
      gsap.to(bg, {
        yPercent: -8, ease: 'none',
        scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    gsap.utils.toArray('.thumb, .book').forEach((el) => {
      el.addEventListener('mouseenter', () => gsap.to(el, { y: -4, duration: 0.25 }));
      el.addEventListener('mouseleave', () => gsap.to(el, { y: 0, duration: 0.25 }));
    });
  }
);

const composer = document.getElementById('composer');
const promptInput = document.getElementById('prompt');
const msgsEl = document.getElementById('chat-msgs');

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
    appendMessage('user', 'You', text);
    promptInput.value = '';
    setTimeout(() => {
      const reply = replies[Math.floor(Math.random() * replies.length)];
      appendMessage('bot', 'Librarian', reply);
    }, 500);
  });

  function appendMessage(kind, label, body) {
    const node = document.createElement('div');
    node.className = `msg ${kind}`;
    node.innerHTML = `<div class="meta">${label}</div>${body}`;
    msgsEl.appendChild(node);
    gsap.from(node, { autoAlpha: 0, y: 12, duration: 0.4, ease: 'power2.out', clearProps: 'all' });
    node.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}
