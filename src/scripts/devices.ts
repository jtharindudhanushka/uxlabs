// Real-time isometric "devices" (Three.js). One shared WebGL canvas renders
// every [data-device] element into its own viewport (scissor), so the page
// uses a single GPU context and skips anything off-screen.
//
//   <div data-device="brief"></div>                    single device, icon "brief"
//   <div data-device="website,commerce" data-variant="stack"></div>
//   <div data-device="layers" data-variant="stack3"></div>
//
// A device is a wireframe "ghost" until it is active (inside `.is-active`, or
// hovered, or data-active="true"), then it materialises into solid hardware
// with an iridescent band.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LOGO_PATHS } from '../components/logo-paths';

const ICONS: Record<string, string[]> = {
  brief: ['M7 3h7l4 4v14H7z', 'M14 3v4h4', 'M10 11h5M10 14h5M10 17h3'],
  draft: ['M4 5h16v14H4z', 'M4 9h16', 'M7 12h6v4H7zM15 12h2M15 15h2'],
  build: ['M9 8l-4 4 4 4', 'M15 8l4 4-4 4', 'M13 6l-2 12'],
  launch: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 13v6h14v-6'],
  responsive: ['M3 6h13v9H3z', 'M1 18h17', 'M18 9h4v11h-4z'],
  seo: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M20 20l-4-4'],
  analytics: ['M5 20V13', 'M12 20V8', 'M19 20V4', 'M3 20h18'],
  deploy: ['M21 3 3 10l7 3 3 7 8-17Z', 'M10 13l5-5'],
  hosting: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z'],
  cms: ['M5 4h14v5H5z', 'M5 11h14v4H5z', 'M5 17h14v3H5z'],
  website: ['M3 5h18v14H3z', 'M3 9h18', 'M6 7h.01M8 7h.01'],
  commerce: ['M6 8h12l-1 12H7z', 'M9 8a3 3 0 0 1 6 0'],
  layers: ['M12 4 3 9l9 5 9-5-9-5Z', 'M3 14l9 5 9-5'],
};

const W = 1;
const H = 0.26;
const R = 0.12;

const LILAC = new THREE.Color('#c084fc');
const VIOLET = new THREE.Color('#7a00da');

/* ---------- textures ---------- */
function iconTexture(key: string): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (key === 'logo') {
    // uxlabs wordmark, centred
    const s = (size * 0.62) / 520;
    ctx.translate((size - 520 * s) / 2, (size - 138 * s) / 2);
    ctx.scale(s, s);
    LOGO_PATHS.forEach((d) => ctx.fill(new Path2D(d)));
  } else {
    const s = (size * 0.66) / 24;
    ctx.translate(size / 2 - 12 * s, size / 2 - 12 * s);
    ctx.scale(s, s);
    ctx.lineWidth = 1.1;
    (ICONS[key] ?? ICONS.layers).forEach((d) => ctx.stroke(new Path2D(d)));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundedRectPoints(w: number, r: number, y: number, seg = 8): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const h = w / 2 - r;
  const corners = [
    [h, h, 0],
    [-h, h, Math.PI / 2],
    [-h, -h, Math.PI],
    [h, -h, (Math.PI * 3) / 2],
  ] as const;
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  }
  pts.push(pts[0].clone());
  return pts;
}

/* ---------- a single device ---------- */
interface Device {
  group: THREE.Group;
  solid: THREE.Material[];
  lines: THREE.LineBasicMaterial[];
  icon: THREE.MeshBasicMaterial;
  value: number; // 0 ghost → 1 solid
}

function buildDevice(iconKey: string, mats: SharedMaterials): Device {
  const group = new THREE.Group();

  const body = mats.body.clone();
  const band = mats.band.clone();
  const panel = mats.panel.clone();
  const screw = mats.screw.clone();
  const vent = mats.vent.clone();
  const solid = [body, band, panel, screw, vent];
  solid.forEach((m) => {
    m.transparent = true;
    m.opacity = 0;
  });

  const bodyMesh = new THREE.Mesh(mats.bodyGeo, body);
  bodyMesh.position.y = H / 2;
  group.add(bodyMesh);

  const bandMesh = new THREE.Mesh(mats.bandGeo, band);
  bandMesh.position.y = H * 0.42;
  group.add(bandMesh);

  const panelMesh = new THREE.Mesh(mats.panelGeo, panel);
  panelMesh.rotation.x = -Math.PI / 2;
  panelMesh.position.y = H + 0.002;
  group.add(panelMesh);

  const icon = new THREE.MeshBasicMaterial({ map: iconTexture(iconKey), transparent: true, opacity: 0.55, depthWrite: false });
  const iconMesh = new THREE.Mesh(mats.iconGeo, icon);
  iconMesh.rotation.x = -Math.PI / 2;
  iconMesh.position.y = H + 0.004;
  group.add(iconMesh);

  for (const [x, z] of [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]]) {
    const m = new THREE.Mesh(mats.screwGeo, screw);
    m.position.set(x, H + 0.003, z);
    group.add(m);
  }

  // Vent slots on the two faces the camera sees (+z and +x)
  const vents = new THREE.InstancedMesh(mats.ventGeo, vent, 22);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    m4.makeTranslation(-0.36 + i * 0.026, H * 0.5, W / 2 + 0.002);
    vents.setMatrixAt(i, m4);
  }
  const rotY = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    m4.makeTranslation(W / 2 + 0.002, H * 0.5, 0.14 + i * 0.026).multiply(rotY);
    vents.setMatrixAt(14 + i, m4);
  }
  group.add(vents);

  // Ghost outline: rims, band, panel, corner verticals, vents
  const lines: THREE.LineBasicMaterial[] = [];
  const lineMat = () => {
    const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    lines.push(m);
    return m;
  };
  const outline = (pts: THREE.Vector3[]) => group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat()));
  outline(roundedRectPoints(W, R, H));
  outline(roundedRectPoints(W, R, 0));
  outline(roundedRectPoints(W, R, H * 0.61));
  outline(roundedRectPoints(W, R, H * 0.23));
  outline(roundedRectPoints(W * 0.64, R * 0.55, H + 0.003));
  const k = W / 2 - R + R * Math.SQRT1_2;
  const verts: THREE.Vector3[] = [];
  for (const [x, z] of [[k, k], [-k, k], [k, -k], [W / 2, 0], [0, W / 2]]) {
    verts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, H, z));
  }
  for (let i = 0; i < 14; i++) {
    const x = -0.36 + i * 0.026;
    verts.push(new THREE.Vector3(x, H * 0.36, W / 2 + 0.003), new THREE.Vector3(x, H * 0.64, W / 2 + 0.003));
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(verts), lineMat()));

  return { group, solid, lines, icon, value: 0 };
}

interface SharedMaterials {
  body: THREE.MeshPhysicalMaterial;
  band: THREE.MeshPhysicalMaterial;
  panel: THREE.MeshPhysicalMaterial;
  screw: THREE.MeshStandardMaterial;
  vent: THREE.MeshBasicMaterial;
  bodyGeo: THREE.BufferGeometry;
  bandGeo: THREE.BufferGeometry;
  panelGeo: THREE.BufferGeometry;
  iconGeo: THREE.BufferGeometry;
  screwGeo: THREE.BufferGeometry;
  ventGeo: THREE.BufferGeometry;
}

function sharedMaterials(): SharedMaterials {
  const panelShape = new THREE.Shape();
  const pw = W * 0.64;
  const pr = R * 0.55;
  const p0 = -pw / 2;
  panelShape.moveTo(p0 + pr, p0);
  panelShape.lineTo(-p0 - pr, p0);
  panelShape.quadraticCurveTo(-p0, p0, -p0, p0 + pr);
  panelShape.lineTo(-p0, -p0 - pr);
  panelShape.quadraticCurveTo(-p0, -p0, -p0 - pr, -p0);
  panelShape.lineTo(p0 + pr, -p0);
  panelShape.quadraticCurveTo(p0, -p0, p0, -p0 - pr);
  panelShape.lineTo(p0, p0 + pr);
  panelShape.quadraticCurveTo(p0, p0, p0 + pr, p0);

  return {
    body: new THREE.MeshPhysicalMaterial({ color: '#0c0c0e', roughness: 0.55, metalness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.35 }),
    band: new THREE.MeshPhysicalMaterial({
      color: '#d8c4ff',
      roughness: 0.18,
      metalness: 1,
      iridescence: 1,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [220, 820],
    }),
    panel: new THREE.MeshPhysicalMaterial({ color: '#060607', roughness: 0.5, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    screw: new THREE.MeshStandardMaterial({ color: '#8a8a92', roughness: 0.3, metalness: 1 }),
    vent: new THREE.MeshBasicMaterial({ color: '#000000' }),
    bodyGeo: new RoundedBoxGeometry(W, H, W, 6, R),
    bandGeo: new RoundedBoxGeometry(W * 1.006, H * 0.38, W * 1.006, 6, R),
    panelGeo: new THREE.ShapeGeometry(panelShape, 6),
    iconGeo: new THREE.PlaneGeometry(W * 0.64, W * 0.64),
    screwGeo: new THREE.CylinderGeometry(0.016, 0.016, 0.006, 16),
    ventGeo: new THREE.BoxGeometry(0.008, H * 0.28, 0.004),
  };
}

/* ---------- a view: one element on the page ---------- */
interface View {
  el: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  rig: THREE.Group;
  devices: Device[];
  variant: string;
  guides: THREE.LineDashedMaterial | null;
  frame: number;
  hover: boolean;
  tilt: { x: number; y: number; tx: number; ty: number };
  explode: number;
  visible: boolean;
  motion: string; // explode | turn | drop | spin | turntable
  delay: number;
  entered: number; // seconds since first seen (drop-in)
  spin: number;
}

export function initDevices(opts: { reduceMotion: boolean; finePointer: boolean }) {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-device]'));
  if (!targets.length) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'device-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const mats = sharedMaterials();

  const resize = () => renderer.setSize(window.innerWidth, window.innerHeight, false);
  resize();
  window.addEventListener('resize', resize);

  const views: View[] = targets.map((el) => {
    const keys = (el.dataset.device || 'layers').split(',');
    const variant = el.dataset.variant || 'single';
    const scene = new THREE.Scene();
    scene.environment = env;
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.PointLight(VIOLET, 2.2, 6);
    rim.position.set(-1.6, 1.2, -1.4);
    scene.add(rim);

    const rig = new THREE.Group();
    scene.add(rig);

    const count = variant === 'stack3' ? 3 : variant === 'stack' ? Math.max(2, keys.length) : 1;
    const devices: Device[] = [];
    for (let i = 0; i < count; i++) {
      const d = buildDevice(keys[Math.min(i, keys.length - 1)], mats);
      rig.add(d.group);
      devices.push(d);
    }

    // Dashed guides between stacked devices
    let guides: THREE.LineDashedMaterial | null = null;
    if (count > 1) {
      guides = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, dashSize: 0.025, gapSize: 0.025 });
      const pts: THREE.Vector3[] = [];
      const k = W / 2 - R + R * Math.SQRT1_2;
      for (const [x, z] of [[k, k], [-k, k], [k, -k], [-k, -k], [0.4, 0.4], [-0.4, -0.4]]) {
        pts.push(new THREE.Vector3(x, -0.25, z), new THREE.Vector3(x, (count - 1) * (H + 0.64) + H + 0.25, z));
      }
      const g = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), guides);
      g.computeLineDistances();
      rig.add(g);
    }

    // True isometric orthographic camera
    const frame = count === 1 ? 0.92 : count === 2 ? 1.25 : 1.55;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, count === 1 ? H / 2 : (count - 1) * 0.35, 0);

    const view: View = {
      el,
      scene,
      camera,
      rig,
      devices,
      variant,
      guides,
      frame,
      hover: false,
      tilt: { x: 0, y: 0, tx: 0, ty: 0 },
      explode: 0,
      visible: false,
      motion: el.dataset.motion || 'none',
      delay: parseFloat(el.dataset.delay || '0'),
      entered: -1,
      spin: 0,
    };

    const zone = el.closest<HTMLElement>('[data-tilt-zone], [data-stage]') || el;
    zone.addEventListener('pointerenter', () => (view.hover = true));
    zone.addEventListener('pointerleave', () => {
      view.hover = false;
      view.tilt.tx = 0;
      view.tilt.ty = 0;
    });
    if (opts.finePointer && !opts.reduceMotion) {
      zone.addEventListener('pointermove', (e) => {
        const r = zone.getBoundingClientRect();
        view.tilt.ty = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
        view.tilt.tx = ((e.clientY - r.top) / r.height - 0.5) * 0.18;
      });
    }
    return view;
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = views.find((x) => x.el === e.target);
      if (v) v.visible = e.isIntersecting;
    });
  }, { rootMargin: '120px' });
  views.forEach((v) => io.observe(v.el));

  const clock = new THREE.Clock();
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05) || 0.016;
    const t = clock.elapsedTime;
    const ease = 1 - Math.pow(0.001, dt); // frame-rate independent smoothing
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();

    for (const v of views) {
      if (!v.visible) continue;
      const rect = v.el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.width < 2) continue;
      if (v.entered < 0) v.entered = 0;

      const active = v.el.dataset.active === 'true' || v.hover || !!v.el.closest('.is-active');
      // 0 when the element's centre is at the bottom of the screen, 1 at the top
      const p = Math.min(1, Math.max(0, 1 - (rect.top + rect.height / 2) / window.innerHeight));
      const smooth = (a: number, b: number) => {
        const x = Math.min(1, Math.max(0, (p - a) / (b - a)));
        return x * x * (3 - 2 * x);
      };
      v.entered += dt;

      // Each section moves differently
      let spinTarget = 0;
      let lift = 0;
      let gapTarget = active ? 1 : 0;
      switch (v.motion) {
        case 'explode': // packed flat, opens as it reaches the middle of the screen
          gapTarget = smooth(0.15, 0.55);
          break;
        case 'turn': // inactive stages sit turned; the active one clicks square
          spinTarget = active ? 0 : Math.PI / 4;
          lift = active ? 0.08 : 0;
          break;
        case 'spin': // rotates in as the card arrives
          spinTarget = (1 - smooth(0.05, 0.5)) * Math.PI * 0.75;
          break;
        case 'turntable': // slow turn while scrolling past
          spinTarget = (p - 0.5) * Math.PI * 0.9;
          break;
        case 'drop': { // placed into the cell, one after another
          const e = Math.min(1, Math.max(0, (v.entered - v.delay) / 0.9));
          lift = (1 - (1 - Math.pow(1 - e, 3))) * 1.6;
          break;
        }
      }
      v.spin += (spinTarget - v.spin) * (v.motion === 'turntable' || v.motion === 'spin' ? 1 : ease * 0.35);
      v.explode += (gapTarget - v.explode) * (v.motion === 'explode' ? 1 : ease * 0.5);
      const gap = v.motion === 'explode' ? 0.02 + v.explode * 0.62 : 0.42 + v.explode * 0.22;
      v.devices.forEach((d, i) => {
        const target =
          v.variant === 'stack3' ? (i === 1 ? 1 : 0) : v.variant === 'stack' ? (active || i === v.devices.length - 1 ? 1 : 0.4) : active ? 1 : 0;
        d.value += (target - d.value) * ease * 0.45;
        d.group.position.y = i * (H + gap);
        d.solid.forEach((m) => {
          m.opacity = d.value;
          m.depthWrite = d.value > 0.6;
        });
        d.lines.forEach((m) => (m.opacity = 0.55 - d.value * 0.3));
        d.icon.opacity = 0.5 + d.value * 0.5;
        d.icon.color.copy(LILAC).lerp(new THREE.Color(0xffffff), 1 - d.value * 0.6);
      });
      if (v.guides) v.guides.opacity = 0.18 + v.explode * 0.2;

      // Pointer tilt + idle float
      v.tilt.x += (v.tilt.tx - v.tilt.x) * ease * 0.4;
      v.tilt.y += (v.tilt.ty - v.tilt.y) * ease * 0.4;
      v.rig.rotation.set(v.tilt.x, v.tilt.y + v.spin, 0);
      v.rig.position.y = lift + (opts.reduceMotion ? 0 : Math.sin(t * 1.1 + rect.left * 0.01) * 0.025);

      const aspect = rect.width / rect.height;
      const f = v.frame;
      v.camera.left = -f * aspect;
      v.camera.right = f * aspect;
      v.camera.top = f;
      v.camera.bottom = -f;
      v.camera.updateProjectionMatrix();

      const y = window.innerHeight - rect.bottom;
      renderer.setViewport(rect.left, y, rect.width, rect.height);
      renderer.setScissor(rect.left, y, rect.width, rect.height);
      renderer.render(v.scene, v.camera);
    }
  };
  return tick;
}
