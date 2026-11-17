// «ثروة» 3D crystal dice (three + cannon-es), bundled to public/tharwa/dice3d.js by web/scripts/build-tharwa-dice.mjs.
// Loaded lazily by public/fx.js for the board dice (#dice). If WebGL is missing, fx.js keeps the CSS dice.
//
// Layout: the dice live in their own glass tray (#dice.d3, a block of the centre column above the buttons and the log).
// The canvas covers only that tray, so a die can never land on (or be drawn over) the centre text.
//
// Owner rule (strict): a die only ever shows the number that was actually rolled.
//   1. The throw is simulated with cannon-es BEFORE anything moves (fixed 120 Hz steps, a few ms); throws that
//      don't land flat, apart and inside the tray are thrown away.
//   2. While the recorded throw plays back, both dice have NO pips at all: all six faces are blank crystal.
//   3. Only after the throw has finished, the face that actually points up gets the pips of the server's value,
//      then the die squares up and tips that face towards the camera so the number reads at once.
//      The client never picks a number; it only picks which blank face receives the server's number.
//   4. A new roll clears the pips first, so an old number can't linger.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

const H = 0.5;                 // die half size (edge = 1 world unit)
const STEP = 1 / 120;
const MAX_STEPS = 300;
const ELEV = 66;               // camera elevation (degrees): mostly top-down, a little 3/4
const PRESENT_MS = 260;        // squaring-up after landing
const TILT = THREE.MathUtils.degToRad(14); // landed face tipped towards the camera
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
// local face normal + two in-face axes (for laying out pips)
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
  world.defaultContactMaterial.restitution = 0.3;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
  const th = 0.5, wh = 8;
  for (const [x, z, sx, sz] of [[c.x1 + th, cz, th, hz + th], [c.x0 - th, cz, th, hz + th], [cx, c.z1 + th, hx + th, th], [cx, c.z0 - th, hx + th, th]]) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(sx, wh / 2, sz)) });
    b.position.set(x, wh / 2, z); world.addBody(b);
  }
  // both dice come in from the right end of the tray (RTL), tumbling to the left
  const dice = [0, 1].map((k) => {
    const d = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(H, H, H)), linearDamping: 0.1, angularDamping: 0.15 });
    d.allowSleep = true; d.sleepSpeedLimit = 0.2; d.sleepTimeLimit = 0.1;
    d.position.set(c.x1 - 0.6 - k * 0.9 - rnd() * 0.2, 1.5 + rnd() * 0.5, cz + (k ? 1 : -1) * Math.max(0, hz - 0.6) * (0.5 + rnd() * 0.5));
    d.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    d.velocity.set(-(4 + rnd() * 3) * Math.min(1.4, hx / 1.6), -2 - rnd() * 2, (rnd() - 0.5) * 2);
    d.angularVelocity.set((rnd() - 0.5) * 34, (rnd() - 0.5) * 24, (rnd() - 0.5) * 34);
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
  const inside = (d: CANNON.Body) => d.position.x > c.x0 + 0.45 && d.position.x < c.x1 - 0.45 && d.position.z > c.z0 + 0.45 && d.position.z < c.z1 - 0.45;
  const ok = dice.every((d) => {
    const q = new THREE.Quaternion(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w);
    return upFace(q).dot > 0.995 && Math.abs(d.position.y - H) < 0.03 && inside(d);
  }) && Math.hypot(dice[0].position.x - dice[1].position.x, dice[0].position.z - dice[1].position.z) > 1.25;
  return { frames, count, ok };
}
function simulate(c: Court): Throw {
  let best: Throw | null = null;
  for (let a = 0; a < 30; a++) {
    const t = oneThrow(c, Math.random);
    if (t.ok && t.count * STEP <= 1.3) return t;
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
  face = -1;
  constructor(private pipMat: THREE.Material, private ringMat: THREE.Material, private glowMat: THREE.Material,
    private pipGeo: THREE.BufferGeometry, private ringGeo: THREE.BufferGeometry, private glowGeo: THREE.BufferGeometry, body: THREE.Material, core: THREE.Material) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 5, 0.16), body);
    m.castShadow = true;
    const c = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.5, 0.5, 2, 0.1), core);
    this.root.add(c, m);
  }
  blank() { if (this.pips) { this.root.remove(this.pips); this.pips = null; } this.value = 0; this.face = -1; }
  /** put `v` pips on the face that points up right now (and only there) */
  showOnTop(v: number) {
    this.blank();
    if (!(v >= 1 && v <= 6)) return;
    this.root.updateMatrixWorld(true);
    const q = new THREE.Quaternion(); this.root.getWorldQuaternion(q);
    const face = upFace(q).face;
    const [n, u, w] = FACES[face];
    const g = new THREE.Group(), s = 0.25;
    const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const flat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const [a, b] of PIPS[v]) {
      const big = v === 1 ? 1.5 : 1;
      // opaque white pip in a dark navy socket: reads on any screen, no transparency sorting involved
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
      ring.position.copy(n).multiplyScalar(H + 0.002).addScaledVector(u, a * s).addScaledVector(w, b * s);
      ring.quaternion.copy(along); ring.scale.set(big, 1, big); ring.renderOrder = 3;
      const m = new THREE.Mesh(this.pipGeo, this.pipMat);
      m.position.copy(ring.position).addScaledVector(n, 0.008);
      m.quaternion.copy(along); m.scale.set(big, 1, big); m.renderOrder = 4;
      const gl = new THREE.Mesh(this.glowGeo, this.glowMat);
      gl.position.copy(m.position).addScaledVector(n, 0.01); gl.quaternion.copy(flat); gl.scale.setScalar(big); gl.renderOrder = 5;
      g.add(ring, m, gl);
    }
    this.root.add(g); this.pips = g; this.value = v; this.face = face;
  }
  /** orientation that keeps `face` up, squared to the screen axes and tipped by `tilt` towards the camera (+z) */
  presentQuat(tilt: number) {
    const q = this.root.quaternion.clone();
    const [n, u, w] = FACES[this.face];
    // of the four in-face directions, keep the one already closest to world +x (smallest turn)
    const cands = [u, u.clone().negate(), w, w.clone().negate()];
    let best = cands[0], bd = -2;
    for (const c of cands) { const d = c.clone().applyQuaternion(q).x; if (d > bd) { bd = d; best = c; } }
    const local = new THREE.Matrix4().makeBasis(best, n, best.clone().cross(n));
    const world = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0).cross(new THREE.Vector3(0, 1, 0)));
    const r = new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.invert()));
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt).multiply(r);
  }
  setFrame(f: Float32Array, i: number) {
    const o = i * 7;
    this.root.position.set(f[o], f[o + 1], f[o + 2]);
    this.root.quaternion.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
  }
}

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

class BoardDice {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  private dice: Die[];
  private glowMat: THREE.MeshBasicMaterial;
  private court: Court = { x0: -1.5, x1: 1.5, z0: -1, z1: 1 };
  private rest: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(0.8, H, 0), new THREE.Vector3(-0.8, H, 0)];
  private canvas: HTMLCanvasElement;
  private slot: HTMLElement;
  private values: number[] = [0, 0];
  private anim: { t: Throw; t0: number; values: number[] } | null = null;
  private present: { t0: number; from: THREE.Quaternion[]; to: THREE.Quaternion[]; y0: number[] } | null = null;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  /** for the dice-rule self-check (window.__tharwaDice) */
  get state() { return { rolling: !!this.anim, shown: this.dice.map((d) => d.value), want: this.values.slice() }; }

  constructor(slot: HTMLElement) {
    this.slot = slot;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dice3d-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xe6f6ff, 1.8);
    key.position.set(2, 9, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    this.scene.add(key, new THREE.HemisphereLight(0x8fdcff, 0x061230, 0.8));
    const rim = new THREE.PointLight(0x2fe2ff, 14, 14); rim.position.set(-3, 3, -3); this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.42 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);

    const body = new THREE.MeshPhysicalMaterial({
      color: 0x1a5cff, roughness: 0.07, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.6,
      emissive: 0x0a2fb8, emissiveIntensity: 0.5, envMapIntensity: 1.15, iridescence: 0.3, iridescenceIOR: 1.3,
    });
    const core = new THREE.MeshBasicMaterial({ color: 0x1b7dff });
    const pipMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x041033 });
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x7fe9ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pipGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 28), ringGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.02, 28), glowGeo = new THREE.PlaneGeometry(0.42, 0.42);
    this.dice = [0, 1].map(() => new Die(pipMat, ringMat, this.glowMat, pipGeo, ringGeo, glowGeo, body, core));
    this.dice.forEach((d) => this.scene.add(d.root));

    this.slot.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.slot);
    document.addEventListener('visibilitychange', this.onVis);
    this.layout();
  }

  private onVis = () => {
    if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; if (this.anim) this.finish(true); if (this.present) this.endPresent(); }
    else this.draw();
  };

  /** the canvas covers the tray (#dice) only; the camera looks down on it and the tray interior is the physics court */
  private layout() {
    const s = this.slot.getBoundingClientRect();
    if (!s.width || !s.height) return;
    const W = s.width, Hh = s.height;
    this.renderer.setSize(W, Hh, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = Hh + 'px';
    const die = this.slot.querySelector('.die3d') as HTMLElement | null;
    const px = Math.max(16, Math.min(Hh * 0.38, (die?.getBoundingClientRect().width || 40) * 0.9)); // px per die edge
    const cam = this.cam;
    cam.aspect = W / Hh;
    const dist = Hh / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * px);
    const e = THREE.MathUtils.degToRad(ELEV);
    cam.position.set(0, Math.sin(e) * dist, Math.cos(e) * dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // tray corners on the plane through the dice centres, a little inside the tray border
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -H), hit = new THREE.Vector3();
    const at = (fx: number, fy: number) => { ray.setFromCamera(new THREE.Vector2(fx * 2 - 1, -(fy * 2 - 1)), cam); return ray.ray.intersectPlane(plane, hit) ? hit.clone() : new THREE.Vector3(); };
    const m = 0.08;
    const tl = at(m, m * 1.4), tr = at(1 - m, m * 1.4), bl = at(m, 1 - m), br = at(1 - m, 1 - m);
    // the far edge is wider than the near one (perspective): use the inner rectangle
    // range of the die CENTRES: a full die (+ its height and the presenting tilt) must stay inside the tray on screen
    const x0 = Math.max(tl.x, bl.x) + 0.62, x1 = Math.min(tr.x, br.x) - 0.62;
    let z0 = Math.max(tl.z, tr.z) + 0.95, z1 = Math.min(bl.z, br.z) - 0.62;
    if (z1 < z0) { const zm = (z0 + z1) / 2; z0 = zm - 0.05; z1 = zm + 0.05; }
    this.court = { x0: x0 - H, x1: x1 + H, z0: z0 - H, z1: z1 + H };
    const off = Math.min(0.85, Math.max(0.62, (x1 - x0) / 4)), zr = (z0 + z1) / 2;
    this.rest = [new THREE.Vector3(off, H, zr), new THREE.Vector3(-off, H, zr)];
    if (!this.anim && !this.present) this.pose(this.values);
    this.draw();
  }

  /** dice at rest in the tray, the given values facing the camera (no throw) */
  private pose(values: number[]) {
    this.dice.forEach((d, k) => {
      d.blank();
      d.root.position.copy(this.rest[k]);
      d.root.quaternion.setFromEuler(new THREE.Euler(0, k ? -0.12 : 0.1, 0));
      d.showOnTop(values[k]);
      if (d.face >= 0) { d.root.quaternion.copy(d.presentQuat(TILT)); d.root.position.y = H + 0.1; }
    });
    this.glowMat.opacity = 0.7;
  }

  show(values: number[]) { this.values = values.slice(0, 2); this.anim = null; this.present = null; this.pose(this.values); this.draw(); }

  roll(values: number[]) {
    this.values = values.slice(0, 2);
    if (document.hidden || calm()) { this.show(values); return; }
    this.present = null;
    this.dice.forEach((d) => d.blank()); // every face blank before anything moves
    this.anim = { t: simulate(this.court), t0: performance.now(), values: this.values.slice() };
    this.draw();
  }

  private finish(instant = false) {
    const a = this.anim!; this.anim = null;
    this.dice.forEach((d, k) => d.setFrame(a.t.frames[k], a.t.count - 1));
    // first value on the right-hand die (the board reads right to left)
    const order = this.dice[0].root.position.x >= this.dice[1].root.position.x ? [0, 1] : [1, 0];
    this.dice[order[0]].showOnTop(a.values[0]);
    this.dice[order[1]].showOnTop(a.values[1]);
    this.present = { t0: performance.now(), from: this.dice.map((d) => d.root.quaternion.clone()), to: this.dice.map((d) => d.presentQuat(TILT)), y0: this.dice.map((d) => d.root.position.y) };
    this.glowMat.opacity = 0;
    if (instant) this.endPresent();
  }
  private endPresent() {
    const p = this.present!; this.present = null;
    this.dice.forEach((d, k) => { d.root.quaternion.copy(p.to[k]); d.root.position.y = p.y0[k] + 0.1; });
    this.glowMat.opacity = 0.7;
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
    }
    if (!this.anim && this.present) {
      const p = this.present, k = Math.min(1, (now - p.t0) / PRESENT_MS), e = ease(k);
      this.dice.forEach((d, j) => { d.root.quaternion.copy(p.from[j]).slerp(p.to[j], e); d.root.position.y = p.y0[j] + 0.1 * Math.sin(e * Math.PI / 2); });
      this.glowMat.opacity = 0.7 * e;
      if (k >= 1) this.endPresent();
    }
    this.renderer.render(this.scene, this.cam);
    if (this.anim || this.present) this.raf = requestAnimationFrame(this.loop);
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
