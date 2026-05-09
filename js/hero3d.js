import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const PALETTE = [
  { cover: 0x2a1410, gilt: 0xd4a04c, accent: 0x6b3a25 }, // burgundy + gold
  { cover: 0x102230, gilt: 0xc9b27a, accent: 0x224058 }, // midnight + brass
  { cover: 0x2c2418, gilt: 0xe3c477, accent: 0x4d3a22 }  // walnut + champagne
];

function makeBook({ width = 2.6, height = 3.6, depth = 0.85, palette = PALETTE[0] }) {
  const group = new THREE.Group();

  const coverMat = new THREE.MeshPhysicalMaterial({
    color: palette.cover,
    roughness: 0.62,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.55,
    sheen: 0.4,
    sheenColor: new THREE.Color(palette.accent)
  });
  const coverGeo = new RoundedBoxGeometry(width, height, depth, 5, 0.06);
  const cover = new THREE.Mesh(coverGeo, coverMat);
  cover.castShadow = true;
  cover.receiveShadow = true;
  group.add(cover);

  const pagesMat = new THREE.MeshPhysicalMaterial({
    color: 0xece3cf,
    roughness: 0.92,
    metalness: 0,
    sheen: 0.1
  });
  const pagesGeo = new THREE.BoxGeometry(width - 0.16, height - 0.22, depth - 0.06);
  const pages = new THREE.Mesh(pagesGeo, pagesMat);
  pages.position.x = 0.04;
  pages.castShadow = true;
  group.add(pages);

  const giltMat = new THREE.MeshPhysicalMaterial({
    color: palette.gilt,
    metalness: 1.0,
    roughness: 0.18,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    emissive: palette.gilt,
    emissiveIntensity: 0.045
  });

  const frameThickness = 0.025;
  const frameInset = 0.18;
  const frameZ = depth / 2 + 0.002;
  const fW = width - frameInset * 2;
  const fH = height - frameInset * 2;
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(fW, frameThickness, frameThickness), giltMat);
  frameTop.position.set(0, fH / 2, frameZ);
  group.add(frameTop);
  const frameBot = frameTop.clone();
  frameBot.position.y = -fH / 2;
  group.add(frameBot);
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, fH, frameThickness), giltMat);
  frameL.position.set(-fW / 2, 0, frameZ);
  group.add(frameL);
  const frameR = frameL.clone();
  frameR.position.x = fW / 2;
  group.add(frameR);

  const plateGeo = new RoundedBoxGeometry(width * 0.6, height * 0.13, 0.04, 4, 0.015);
  const plate = new THREE.Mesh(plateGeo, giltMat);
  plate.position.set(0, 0, frameZ + 0.018);
  plate.castShadow = true;
  group.add(plate);

  const inlay = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.55, height * 0.09, 0.005),
    new THREE.MeshPhysicalMaterial({ color: palette.accent, roughness: 0.5, metalness: 0.4 })
  );
  inlay.position.set(0, 0, frameZ + 0.04);
  group.add(inlay);

  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, height * 0.55, 0.006),
    new THREE.MeshPhysicalMaterial({
      color: palette.gilt, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide
    })
  );
  ribbon.position.set(width * 0.32, -height * 0.05, depth / 2 + 0.003);
  ribbon.rotation.z = 0.04;
  group.add(ribbon);

  return group;
}

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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new RoomEnvironment();
  const envTexture = pmrem.fromScene(envScene, 0.04).texture;

  const scene = new THREE.Scene();
  scene.environment = envTexture;
  scene.fog = new THREE.Fog(0x06121a, 12, 28);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  camera.position.set(0, 0.6, 11);
  camera.lookAt(0.4, 0, 0);

  const ambient = new THREE.AmbientLight(0x1a2a36, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff1d6, 1.4);
  key.position.set(5, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x4ea3a0, 0.55);
  fill.position.set(-6, 2, 4);
  scene.add(fill);

  const rim = new THREE.SpotLight(0xd6b27a, 1.6, 24, Math.PI / 5, 0.6, 1);
  rim.position.set(-3, 4, -5);
  scene.add(rim);

  const stage = new THREE.Group();
  scene.add(stage);

  const mainBook = makeBook({ palette: PALETTE[0], width: 3.2, height: 4.4, depth: 1.05 });
  mainBook.position.set(2.2, 0.2, 0);
  mainBook.rotation.set(-0.18, -0.55, 0.06);
  stage.add(mainBook);

  const sideBookA = makeBook({ palette: PALETTE[1], width: 2.4, height: 3.2, depth: 0.8 });
  sideBookA.position.set(-1.4, -1.6, -1.6);
  sideBookA.rotation.set(0.4, 0.6, -0.18);
  stage.add(sideBookA);

  const sideBookB = makeBook({ palette: PALETTE[2], width: 2.6, height: 3.6, depth: 0.9 });
  sideBookB.position.set(0.6, 1.9, -2.2);
  sideBookB.rotation.set(-0.5, 0.25, 0.12);
  stage.add(sideBookB);

  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x07151e,
    roughness: 0.4,
    metalness: 0.05,
    transparent: true,
    opacity: 0.95
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.2;
  floor.receiveShadow = true;
  scene.add(floor);

  const PARTICLE_COUNT = 110;
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 1;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({
      color: 0xd6b27a,
      size: 0.035,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(particles);

  const resize = () => {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    if (!w || !h) return;
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
    target.x = ((e.clientX - r.left) / r.width  - 0.5) * 1.4;
    target.y = ((e.clientY - r.top)  / r.height - 0.5) * 0.8;
  });
  hero.addEventListener('mouseleave', () => { target.x = 0; target.y = 0; });

  const scroll = { progress: 0 };
  ScrollTrigger.create({
    trigger: hero,
    start: 'top top',
    end: '+=120%',
    scrub: 1.2,
    onUpdate: (self) => { scroll.progress = self.progress; }
  });

  if (!reduceMotion) {
    [mainBook, sideBookA, sideBookB].forEach((b, i) => {
      const fromZ = b.position.z - 8 - i * 2;
      gsap.from(b.position, { z: fromZ, duration: 1.6, delay: 0.15 + i * 0.1, ease: 'expo.out' });
      gsap.from(b.rotation, {
        x: '+=' + Math.PI * 0.4,
        y: '+=' + Math.PI * 0.7,
        duration: 1.6, delay: 0.15 + i * 0.1, ease: 'expo.out'
      });
    });
  }

  let visible = true;
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 });
  io.observe(hero);

  const clock = new THREE.Clock();
  const baseMain = mainBook.rotation.y;
  const baseA = sideBookA.rotation.y;
  const baseB = sideBookB.rotation.y;

  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const t = clock.getElapsedTime();

    if (!reduceMotion) {
      mainBook.rotation.y  = baseMain + Math.sin(t * 0.25) * 0.12;
      mainBook.rotation.x += 0.0003;
      mainBook.position.y  = 0.2 + Math.sin(t * 0.5) * 0.08;
      sideBookA.rotation.y = baseA + Math.sin(t * 0.3 + 1.2) * 0.18;
      sideBookA.position.y = -1.6 + Math.sin(t * 0.4 + 0.8) * 0.12;
      sideBookB.rotation.y = baseB + Math.sin(t * 0.22 + 2.1) * 0.14;
      sideBookB.position.y = 1.9 + Math.sin(t * 0.45 + 1.6) * 0.1;
      particles.rotation.y += 0.0006;
    }

    const sp = scroll.progress;
    stage.rotation.y = sp * Math.PI * 0.35;
    stage.position.z = sp * -2.5;

    const desiredX = target.x * 1.1;
    const desiredY = 0.6 - target.y * 0.6 - sp * 0.8;
    const desiredZ = 11 + sp * 4;
    camera.position.x += (desiredX - camera.position.x) * 0.05;
    camera.position.y += (desiredY - camera.position.y) * 0.05;
    camera.position.z += (desiredZ - camera.position.z) * 0.05;
    camera.lookAt(0.4, 0, 0);

    renderer.render(scene, camera);
  }
  tick();
}
