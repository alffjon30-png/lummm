import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initHero3D() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (hero.classList.contains('has-video') || hero.querySelector('.hero-video')) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  hero.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    canvas.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x06121a, 9, 24);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  scene.add(new THREE.AmbientLight(0x1a2a36, 0.9));
  const gold = new THREE.DirectionalLight(0xd6b27a, 1.6);
  gold.position.set(4, 3, 6);
  scene.add(gold);
  const teal = new THREE.PointLight(0x4ea3a0, 1.6, 22);
  teal.position.set(-4, -2, 4);
  scene.add(teal);
  const purple = new THREE.PointLight(0xa17ad1, 0.7, 18);
  purple.position.set(2, 4, -3);
  scene.add(purple);

  const books = new THREE.Group();
  scene.add(books);

  const palette = [0xd6b27a, 0x4ea3a0, 0xa17ad1, 0xb88a52, 0xec7d4a, 0x8c5fc8];
  const BOOK_COUNT = 11;

  for (let i = 0; i < BOOK_COUNT; i++) {
    const w = 0.9 + Math.random() * 0.5;
    const h = 1.4 + Math.random() * 0.5;
    const d = 0.18 + Math.random() * 0.18;
    const geo = new THREE.BoxGeometry(w, h, d);
    const color = palette[i % palette.length];
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.35,
      roughness: 0.45,
      emissive: color,
      emissiveIntensity: 0.07
    });
    const book = new THREE.Mesh(geo, mat);
    const r = 3.5 + Math.random() * 3.5;
    const ang = (i / BOOK_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    book.position.set(
      Math.cos(ang) * r,
      (Math.random() - 0.5) * 4.5,
      Math.sin(ang) * r - 2
    );
    book.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 0.7
    );
    book.userData = {
      spin: (Math.random() - 0.5) * 0.5,
      tilt: (Math.random() - 0.5) * 0.3,
      floatPhase: Math.random() * Math.PI * 2,
      floatAmp: 0.15 + Math.random() * 0.25,
      baseY: book.position.y
    };
    books.add(book);
  }

  // Drifting particle dust
  const PARTICLE_COUNT = 240;
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 13;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({
      color: 0xd6b27a,
      size: 0.045,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(particles);

  const resize = () => {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(hero);

  const target = { x: 0, y: 0 };
  hero.addEventListener('mousemove', (e) => {
    const r = hero.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 1.6;
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.9;
  });
  hero.addEventListener('mouseleave', () => {
    target.x = 0; target.y = 0;
  });

  const scroll = { progress: 0 };
  ScrollTrigger.create({
    trigger: hero,
    start: 'top top',
    end: '+=120%',
    scrub: 1.2,
    onUpdate: (self) => { scroll.progress = self.progress; }
  });

  if (!reduceMotion) {
    books.children.forEach((b, i) => {
      const targetZ = b.position.z;
      b.position.z = targetZ - 14;
      gsap.to(b.position, {
        z: targetZ, duration: 1.6, delay: i * 0.05, ease: 'power3.out'
      });
      gsap.from(b.rotation, {
        x: '+=' + Math.PI * 2,
        y: '+=' + Math.PI,
        duration: 1.6, delay: i * 0.05, ease: 'power3.out'
      });
    });
  }

  let visible = true;
  const io = new IntersectionObserver(
    ([entry]) => { visible = entry.isIntersecting; },
    { threshold: 0 }
  );
  io.observe(hero);

  const clock = new THREE.Clock();

  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const t = clock.getElapsedTime();

    if (!reduceMotion) {
      books.children.forEach((b) => {
        b.rotation.x += b.userData.tilt * 0.005;
        b.rotation.y += b.userData.spin * 0.005;
        b.position.y = b.userData.baseY + Math.sin(t * 0.6 + b.userData.floatPhase) * b.userData.floatAmp;
      });
      particles.rotation.y += 0.0009;
    }

    const sp = scroll.progress;
    books.rotation.y = sp * Math.PI * 0.7;
    books.rotation.x = sp * Math.PI * 0.15;
    books.position.z = sp * -3.5;

    const desiredX = target.x * 1.4;
    const desiredY = -target.y * 0.9 - sp * 1.4;
    const desiredZ = 10 + sp * 7;

    camera.position.x += (desiredX - camera.position.x) * 0.06;
    camera.position.y += (desiredY - camera.position.y) * 0.06;
    camera.position.z += (desiredZ - camera.position.z) * 0.06;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }
  tick();
}
