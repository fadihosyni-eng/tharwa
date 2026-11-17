// «ثروة» 3D crystal dice (three + cannon-es), bundled to public/tharwa/dice3d.js by web/scripts/build-tharwa-dice.mjs.
// Loaded lazily by public/fx.js for the board dice (#dice). If WebGL is missing, fx.js keeps the CSS dice.
//
// Owner rule (strict): a die only ever shows the number that was actually rolled.
//   1. The throw is simulated with cannon-es BEFORE anything moves (fixed 120 Hz steps, a few ms), throws that
//      don't land flat and apart inside the court are thrown away.
//   2. While the recorded throw plays back, both dice have NO pips at all: all six faces are blank crystal.
//   3. Only after the throw has finished, the face that actually points up gets the pips of the server's value.
//      The client never picks a number; it only picks which blank face receives the server's number.
//   4. A new roll (or a resize / hidden tab) clears the pips first, so an old number can't linger.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

const H = 0.5;                 // die half size (edge = 1 world unit)
const STEP = 1 / 120;
const MAX_STEPS = 300;
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
const FACES: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],
  [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
];
function upFace(q: THREE.Quaternion) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
  let face = 0, dot = -2;
  FACES.forEach(([n], k) => { const d = n.dot(up); if (d > dot) { dot = d; face = k; } });
  return { face, dot };
}

type Court = { x0: number; x1: number; z0: number; z1: number };
type Throw = { frames: Float32Array[]; count: number; ok: boolean };

function oneThrow(c: Court, rnd: () => number): Throw {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -70, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.32;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
  const th = 0.5, wh = 8;
  for (const [x, z, sx, sz] of [[c.x1 + th, cz, th, hz + th], [c.x0 - th, cz, th, hz + th], [cx, c.z1 + th, hx + th, th], [cx, c.z0 - th, hx + th, th]]) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(sx, wh / 2, sz)) });
    b.position.set(x, wh / 2, z); world.addBody(b);
  }
  const dice = [0, 1].map((k) => {
    const d = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(H, H, H)), linearDamping: 0.1, angularDamping: 0.14 });
    d.allowSleep = true; d.sleepSpeedLimit = 0.2; d.sleepTimeLimit = 0.1;
    const side = k ? 1 : -1;
    d.position.set(cx + side * (hx * 0.45) + (rnd() - 0.5) * 0.3, 3.2 + rnd() * 0.8, c.z0 + 0.6 + rnd() * 0.3);
    d.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    d.velocity.set(-side * (0.5 + rnd() * 1.5), -3 - rnd() * 2, 4 + rnd() * 3);
    d.angularVelocity.set((rnd() - 0.5) * 36, (rnd() - 0.5) * 24, (rnd() - 0.5) * 36);
    world.addBody(d);
    return d;
  });
  const frames = [new Float32Array(MAX_STEPS * 7), new Float32Array(MAX_STEPS * 7)];
  let count = 0;
  for (; count < MAX_STEPS; count++) {
    world.step(STEP);
    dice.forEach((d, k) => {
      const o = count * 7, f = frames[k];
      f[o] = d.position.x; f[o + 1] = d.position.y; f[o + 2] = d.position.z;
      f[o + 3] = d.quaternion.x; f[o + 4] = d.quaternion.y; f[o + 5] = d.quaternion.z; f[o + 6] = d.quaternion.w;
    });
    if (count > 30 && dice.every((d) => d.sleepState === CANNON.Body.SLEEPING)) { count++; break; }
  }
  const ok = dice.every((d) => {
    const q = new THREE.Quaternion(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w);
    return upFace(q).dot > 0.995 && Math.abs(d.position.y - H) < 0.03;
  }) && dice[0].position.distanceTo(dice[1].position) > 1.05;
  return { frames, count, ok };
}
function simulate(c: Court): Throw {
  let best: Throw | null = null;
  for (let a = 0; a < 24; a++) {
    const t = oneThrow(c, Math.random);
    if (t.ok && t.count * STEP <= 1.35) return t;
    if (t.ok && (!best || !best.ok || t.count < best.count)) best = t;
    else if (!best) best = t;
  }
  return best!;
}

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

class Die {
  root = new THREE.Group();
  private pips: THREE.Group | null = null;
  value = 0;
  constructor(private pipMat: THREE.MeshBasicMaterial, private glowMat: THREE.MeshBasicMaterial, private pipGeo: THREE.BufferGeometry, private glowGeo: THREE.BufferGeometry, body: THREE.Material, core: THREE.Material) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 5, 0.16), body);
    m.castShadow = true;
    const c = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.52, 0.52, 2, 0.1), core);
    this.root.add(c, m);
  }
  blank() { if (this.pips) { this.root.remove(this.pips); this.pips = null; } this.value = 0; }
  showOnTop(v: number) {
    this.blank();
    if (!(v >= 1 && v <= 6)) return;
    this.root.updateMatrixWorld(true);
    const q = new THREE.Quaternion(); this.root.getWorldQuaternion(q);
    const [n, u, w] = FACES[upFace(q).face];
    const g = new THREE.Group(), s = 0.25;
    const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const flat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const [a, b] of PIPS[v]) {
      const big = v === 1 ? 1.55 : 1;
      const m = new THREE.Mesh(this.pipGeo, this.pipMat);
      m.position.copy(n).multiplyScalar(H + 0.004).addScaledVector(u, a * s).addScaledVector(w, b * s);
      m.quaternion.copy(along); m.scale.set(big, 1, big);
      const gl = new THREE.Mesh(this.glowGeo, this.glowMat);
      gl.position.copy(m.position).addScaledVector(n, 0.012); gl.quaternion.copy(flat); gl.scale.setScalar(big); gl.renderOrder = 5;
      g.add(m, gl);
    }
    this.root.add(g); this.pips = g; this.value = v;
  }
  setFrame(f: Float32Array, i: number) {
    const o = i * 7;
    this.root.position.set(f[o], f[o + 1], f[o + 2]);
    this.root.quaternion.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
  }
}

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

class BoardDice {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  private dice: Die[];
  private pipMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private court: Court = { x0: -1.5, x1: 1.5, z0: -1, z1: 1 };
  private rest: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.8, H, 0), new THREE.Vector3(0.8, H, 0)];
  private canvas: HTMLCanvasElement;
  private host: HTMLElement;
  private slot: HTMLElement;
  private values: number[] = [0, 0];
  private anim: { t: Throw; t0: number; values: number[] } | null = null;
  private fade = 1;
  private fadeT0 = 0;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  /** for the dice-rule self-check (window.__tharwaDice) */
  get state() { return { rolling: !!this.anim, shown: this.dice.map((d) => d.value), want: this.values.slice() }; }

  constructor(slot: HTMLElement) {
    this.slot = slot;
    this.host = (slot.closest('.center') as HTMLElement) || slot.parentElement!;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dice3d-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xdff4ff, 1.7);
    key.position.set(3, 9, 4); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    key.shadow.radius = 4;
    this.scene.add(key, new THREE.HemisphereLight(0x7fd8ff, 0x061230, 0.9));
    const rim = new THREE.PointLight(0x2fe2ff, 12, 12); rim.position.set(-3, 3, -3); this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.38 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);

    const glow = glowTexture();
    const body = new THREE.MeshPhysicalMaterial({
      color: 0x0f4fe8, roughness: 0.06, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.6,
      emissive: 0x0628a8, emissiveIntensity: 0.55, envMapIntensity: 1.1, iridescence: 0.3, iridescenceIOR: 1.3,
      transparent: true, opacity: 0.93,
    });
    const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1f8dff).multiplyScalar(0.9) });
    this.pipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2fdff).multiplyScalar(1.4), transparent: true, opacity: 1 });
    this.glowMat = new THREE.MeshBasicMaterial({ map: glow, color: 0x2fe2ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const pipGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.03, 28), glowGeo = new THREE.PlaneGeometry(0.4, 0.4);
    this.dice = [0, 1].map(() => new Die(this.pipMat, this.glowMat, pipGeo, glowGeo, body, core));
    this.dice.forEach((d) => this.scene.add(d.root));

    this.host.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.host); this.ro.observe(this.slot);
    document.addEventListener('visibilitychange', this.onVis);
    this.layout();
  }

  private onVis = () => {
    if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; if (this.anim) this.finish(); }
    else this.draw();
  };

  /** fit the camera to the centre area and turn the slot rectangle into the physics court */
  private layout() {
    const r = this.host.getBoundingClientRect(), s = this.slot.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const W = r.width, Hh = r.height;
    this.renderer.setSize(W, Hh, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = Hh + 'px';
    const dies = this.slot.querySelectorAll('.die3d');
    const px = Math.max(18, (dies[0] as HTMLElement | undefined)?.getBoundingClientRect().width || 48) * 0.92; // px per die edge
    const cam = this.cam;
    cam.aspect = W / Hh;
    const dist = Hh / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * px);
    const elev = THREE.MathUtils.degToRad(62);
    cam.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // ground point under a screen pixel of the centre area
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -H), hit = new THREE.Vector3();
    const at = (x: number, y: number) => {
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / W) * 2 - 1, -((y - r.top) / Hh) * 2 + 1), cam);
      return ray.ray.intersectPlane(plane, hit) ? hit.clone() : new THREE.Vector3();
    };
    // shift the world so the slot centre is at the origin of the court
    const mid = at(s.left + s.width / 2, s.top + s.height / 2);
    const a = at(s.left, s.top), b = at(s.right, s.bottom);
    const padX = 0.35, padZ = 0;
    this.court = { x0: Math.min(a.x, b.x) - padX, x1: Math.max(a.x, b.x) + padX, z0: Math.min(a.z, b.z) - padZ, z1: Math.max(a.z, b.z) + padZ };
    const hx = Math.max(1.2, (this.court.x1 - this.court.x0) / 2);
    this.court.x0 = mid.x - hx; this.court.x1 = mid.x + hx;
    const hz = Math.max(0.6, (this.court.z1 - this.court.z0) / 2);
    this.court.z0 = mid.z - hz; this.court.z1 = mid.z + hz;
    const off = Math.min(hx - 0.55, 0.62 + (hx - 1.2) * 0.4);
    this.rest = [new THREE.Vector3(mid.x + off, H, mid.z), new THREE.Vector3(mid.x - off, H, mid.z)];
    if (!this.anim) this.pose(this.values);
    this.draw();
  }

  /** dice at rest in the slot, the given values on top (no throw) */
  private pose(values: number[]) {
    this.dice.forEach((d, k) => {
      d.blank();
      d.root.position.copy(this.rest[k]);
      d.root.quaternion.setFromEuler(new THREE.Euler(0, k ? -0.22 : 0.18, 0));
      d.showOnTop(values[k]);
    });
    this.fade = 1; this.setPipOpacity(1);
  }
  private setPipOpacity(v: number) { this.pipMat.opacity = v; this.glowMat.opacity = 0.85 * v; }

  show(values: number[]) { this.values = values.slice(0, 2); this.anim = null; this.pose(this.values); this.draw(); }

  roll(values: number[]) {
    this.values = values.slice(0, 2);
    if (document.hidden || calm()) { this.show(values); return; }
    this.dice.forEach((d) => d.blank()); // every face blank before anything moves
    this.anim = { t: simulate(this.court), t0: performance.now(), values: this.values.slice() };
    this.loop();
  }

  private finish() {
    const a = this.anim!; this.anim = null;
    this.dice.forEach((d, k) => d.setFrame(a.t.frames[k], a.t.count - 1));
    // first value on the right-hand die (the board reads right to left)
    const order = this.dice[0].root.position.x >= this.dice[1].root.position.x ? [0, 1] : [1, 0];
    this.dice[order[0]].showOnTop(a.values[0]);
    this.dice[order[1]].showOnTop(a.values[1]);
    this.fade = 0; this.fadeT0 = performance.now(); this.setPipOpacity(0);
    if (document.hidden) { this.fade = 1; this.setPipOpacity(1); }
  }

  private loop = () => {
    this.raf = 0;
    if (document.hidden) return;
    const now = performance.now();
    if (this.anim) {
      // window.__tharwaDiceSlow (tests only) plays the throw in slow motion so single frames can be checked
      const slow = Number((window as any).__tharwaDiceSlow) || 1;
      const a = this.anim, i = Math.floor(((now - a.t0) / 1000) / STEP * 1.05 / slow);
      if (i >= a.t.count - 1) this.finish();
      else this.dice.forEach((d, k) => d.setFrame(a.t.frames[k], i));
    } else if (this.fade < 1) {
      this.fade = Math.min(1, (now - this.fadeT0) / 180);
      this.setPipOpacity(this.fade);
    }
    this.renderer.render(this.scene, this.cam);
    if (this.anim || this.fade < 1) this.raf = requestAnimationFrame(this.loop);
  };
  private draw() { if (!this.raf && !document.hidden) this.raf = requestAnimationFrame(this.loop); }

  dispose() {
    cancelAnimationFrame(this.raf); this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.renderer.dispose(); this.canvas.remove();
  }
}

function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

(window as any).TharwaDice3D = {
  mount(slot: HTMLElement) {
    if (!webgl()) return null;
    try { const d = new BoardDice(slot); (window as any).__tharwaDice = d; return d; } catch (e) { console.warn('3D dice off:', e); return null; }
  },
};
