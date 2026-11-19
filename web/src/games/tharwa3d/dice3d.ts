// «ثروة» 3D crystal dice (three + cannon-es), bundled to public/tharwa/dice3d.js by web/scripts/build-tharwa-dice.mjs.
// Loaded lazily by public/fx.js for the board dice (#dice). If WebGL is missing, fx.js keeps the CSS dice.
//
// Layout: one transparent canvas covers the whole board centre (pointer-events: none), so a throw flies over the
// centre: the dice come in from the thrower's side in an arc, hit the table (an invisible plane), bounce 2–3 times,
// roll and settle side by side near the middle. They stay there ~1.2 s, then glide to their resting spot — the
// #dice element next to «دور …», which is only an empty placeholder — at a readable size.
//
// Owner rule (strict): a die only ever shows the number that was actually rolled.
//   1. The throw is simulated with cannon-es BEFORE anything moves (fixed 120 Hz steps, a few ms); throws that
//      don't land flat, apart and near the middle are thrown away.
//   2. While the recorded throw plays back, both dice have NO pips at all: all six faces are blank crystal.
//   3. Only after the throw has finished, the face that actually points up gets the pips of the server's value,
//      then the die squares up and tips that face towards the camera so the number reads at once.
//      The client never picks a number; it only picks which blank face receives the server's number.
//   4. A new roll clears the pips first, so an old number can't linger.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

const H = 0.5;                 // die half size (edge = 1 world unit)
const STEP = 1 / 120;
const MAX_STEPS = 260;
const CAM_TILT = 35;           // camera tilt away from straight down (degrees)
const FACE_TILT = THREE.MathUtils.degToRad(16); // landed face tipped towards the viewer
const PRESENT_MS = 340;        // squaring up + lining up side by side after landing
const HOLD_MS = 1200;          // the value stays big in the middle this long
const GLIDE_MS = 560;          // then the dice glide to their resting spot
const GHOSTS = 3;              // motion trail copies per die while flying
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
type Throw = { frames: Float32Array[]; count: number; ok: boolean; impact: number };
/** screen direction from the board centre towards the thrower (x right, y down); {0,1} = from the bottom */
export type From = { x: number; y: number };
type RollOpts = { from?: From; onImpact?: () => void };

type Aim = { x: number; z: number };
function oneThrow(c: Court, from: From, aim: Aim, rnd: () => number): Throw {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -58, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.22;
  world.defaultContactMaterial.restitution = 0.42;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
  const th = 0.5, wh = 12;
  for (const [x, z, sx, sz] of [[c.x1 + th, cz, th, hz + th], [c.x0 - th, cz, th, hz + th], [cx, c.z1 + th, hx + th, th], [cx, c.z0 - th, hx + th, th]]) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(sx, wh / 2, sz)) });
    b.position.set(x, wh / 2, z); world.addBody(b);
  }
  // entry point: on the thrower's side, just inside the edge of the centre area
  let dx = from.x, dz = from.y;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  if (!from.x && !from.y) { dx = 0; dz = 1; }
  const reach = Math.min(Math.abs(dx) > 1e-3 ? (hx - 0.8) / Math.abs(dx) : Infinity, Math.abs(dz) > 1e-3 ? (hz - 0.8) / Math.abs(dz) : Infinity);
  const ex = cx + dx * reach, ez = cz + dz * reach;
  const px = -dz, pz = dx; // across the throw: the two dice leave the hand a little apart
  let impact = -1;
  const dice = [0, 1].map((k) => {
    const d = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(H, H, H)), linearDamping: 0.12, angularDamping: 0.18 });
    d.allowSleep = true; d.sleepSpeedLimit = 0.25; d.sleepTimeLimit = 0.1;
    const side = (k ? 1 : -1) * (0.45 + rnd() * 0.25);
    d.position.set(ex + px * side, 2.4 + rnd() * 0.9, ez + pz * side);
    d.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    // thrown towards the landing spot (an empty part of the centre, see BoardDice.findSpot)
    const ax = aim.x - ex, az = aim.z - ez, dist = Math.hypot(ax, az) || 1;
    const v = (5.2 + rnd() * 2.4) * Math.sqrt(Math.max(1, dist) / 3.2);
    const lateral = (rnd() - 0.5) * 1.4;
    d.velocity.set((ax / dist) * v + px * lateral, 3.4 + rnd() * 2.2, (az / dist) * v + pz * lateral);
    d.angularVelocity.set((rnd() - 0.5) * 36, (rnd() - 0.5) * 26, (rnd() - 0.5) * 36);
    d.addEventListener('collide', (e: { body: CANNON.Body }) => { if (impact < 0 && e.body === floor) impact = count; });
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
    if (count > 40 && dice.every((d) => d.sleepState === CANNON.Body.SLEEPING)) { count++; break; }
  }
  const near = (d: CANNON.Body) => Math.abs(d.position.x - aim.x) < 1.7 && Math.abs(d.position.z - aim.z) < 1.3;
  const ok = dice.every((d) => {
    const q = new THREE.Quaternion(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w);
    return upFace(q).dot > 0.995 && Math.abs(d.position.y - H) < 0.03 && near(d);
  }) && Math.hypot(dice[0].position.x - dice[1].position.x, dice[0].position.z - dice[1].position.z) > 1.2;
  return { frames, count, ok, impact: impact < 0 ? 0 : impact };
}
function simulate(c: Court, from: From, aim: Aim): Throw {
  let best: Throw | null = null;
  for (let a = 0; a < 40; a++) {
    const t = oneThrow(c, from, aim, Math.random), s = t.count * STEP;
    if (t.ok && s >= 0.75 && s <= 1.45) return t;
    if (t.ok && (!best || !best.ok || Math.abs(s - 1.1) < Math.abs(best.count * STEP - 1.1))) best = t;
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

type Mats = { pip: THREE.Material; ring: THREE.Material; glow: THREE.Material; ghost: THREE.MeshBasicMaterial[]; body: THREE.Material; core: THREE.Material; shell: THREE.Material };
type Geos = { pip: THREE.BufferGeometry; ring: THREE.BufferGeometry; glow: THREE.BufferGeometry; body: THREE.BufferGeometry; core: THREE.BufferGeometry; ghost: THREE.BufferGeometry; shell: THREE.BufferGeometry };

/** dark studio for reflections: black room, one white soft-box above, cyan strips on the sides and behind */
function studioEnv() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x010409);
  const box = (w: number, h: number, color: number, power: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(5, 1.4, 0xffffff, 5, 0, 7, 3);
  box(1.2, 6, 0x2fe2ff, 3.2, -7, 2, 1);
  box(1.2, 6, 0x00b4ff, 3.2, 7, 2, -1);
  box(9, 0.7, 0x2fe2ff, 2.2, 0, 1.5, -7);
  box(3, 0.6, 0xffffff, 2.5, 2, 4, 6);
  return s;
}

class Die {
  root = new THREE.Group();
  ghosts: THREE.Mesh[] = [];
  private pips: THREE.Group | null = null;
  value = 0;
  face = -1;
  constructor(private m: Mats, private g: Geos) {
    const body = new THREE.Mesh(g.body, m.body);
    body.castShadow = true;
    const core = new THREE.Mesh(g.core, m.core); // the inner cyan glow seen through the crystal
    const shell = new THREE.Mesh(g.shell, m.shell); shell.renderOrder = 6;
    this.root.add(core, body, shell);
    for (let k = 0; k < GHOSTS; k++) { const gh = new THREE.Mesh(g.ghost, m.ghost[k]); gh.visible = false; gh.renderOrder = -1; this.ghosts.push(gh); }
  }
  blank() { if (this.pips) { this.root.remove(this.pips); this.pips = null; } this.value = 0; this.face = -1; }
  /** put `v` pips on the face that points up right now (and only there) */
  showOnTop(v: number) {
    this.blank();
    if (!(v >= 1 && v <= 6)) return;
    const face = upFace(this.root.quaternion).face;
    const [n, u, w] = FACES[face];
    const grp = new THREE.Group(), s = 0.25;
    const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const flat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const [a, b] of PIPS[v]) {
      const big = v === 1 ? 1.45 : 1;
      // bright pip in a dark navy socket (reads as a recessed dot), with a soft cyan halo
      const ring = new THREE.Mesh(this.g.ring, this.m.ring);
      ring.position.copy(n).multiplyScalar(H + 0.002).addScaledVector(u, a * s).addScaledVector(w, b * s);
      ring.quaternion.copy(along); ring.scale.set(big, 1, big); ring.renderOrder = 3;
      const pip = new THREE.Mesh(this.g.pip, this.m.pip);
      pip.position.copy(ring.position).addScaledVector(n, 0.006);
      pip.quaternion.copy(along); pip.scale.set(big, 1, big); pip.renderOrder = 4;
      const gl = new THREE.Mesh(this.g.glow, this.m.glow);
      gl.position.copy(pip.position).addScaledVector(n, 0.01); gl.quaternion.copy(flat); gl.scale.setScalar(big); gl.renderOrder = 5;
      grp.add(ring, pip, gl);
    }
    this.root.add(grp); this.pips = grp; this.value = v; this.face = face;
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
  frame(f: Float32Array, i: number, target: THREE.Object3D = this.root) {
    const o = Math.max(0, i) * 7;
    target.position.set(f[o], f[o + 1], f[o + 2]);
    target.quaternion.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
  }
}

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Mode = 'rest' | 'throw' | 'present' | 'hold' | 'glide';

class BoardDice {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  private dice: Die[];
  private glowMat: THREE.MeshBasicMaterial;
  private court: Court = { x0: -3, x1: 3, z0: -2, z1: 2 };
  private canvas: HTMLCanvasElement;
  private slot: HTMLElement;
  private host: HTMLElement;
  private values: number[] = [0, 0];
  private mode: Mode = 'rest';
  private t0 = 0;
  private th: Throw | null = null;
  private impactDone = false;
  private onImpact: (() => void) | null = null;
  private from = { pos: [new THREE.Vector3(), new THREE.Vector3()], quat: [new THREE.Quaternion(), new THREE.Quaternion()], scale: 1 };
  private to = { pos: [new THREE.Vector3(), new THREE.Vector3()], quat: [new THREE.Quaternion(), new THREE.Quaternion()], scale: 1 };
  private rest = { pos: [new THREE.Vector3(), new THREE.Vector3()], scale: 0.5 };
  private bigPx = 84;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private watch = 0;
  private kick = 0;
  private aim = { x: 0, z: 0 };
  private spot = { x: 0, y: 0 }; // landing spot on screen (px in the centre)
  private checkAt = 0;
  private slotKey = '';
  /** for the dice-rule self-check (window.__tharwaDice) */
  get state() { return { rolling: this.mode === 'throw', mode: this.mode, shown: this.dice.map((d) => d.value), want: this.values.slice() }; }

  constructor(slot: HTMLElement) {
    this.slot = slot;
    this.host = (slot.closest('.center') as HTMLElement) || slot.parentElement || slot;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dice3d-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps the blue blue (ACES turned it lavender)
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(this.renderer);
    // a dark studio with a few bright soft-boxes: the glass reflects mostly darkness plus sharp white/cyan highlights
    // (a bright room environment is what made the dice look pale / pastel)
    this.scene.environment = pm.fromScene(studioEnv(), 0.02).texture;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xeaf8ff, 2.6);
    key.position.set(3, 12, 7); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0006;
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    this.scene.add(key, key.target, new THREE.HemisphereLight(0x5fc8ff, 0x020818, 0.28));
    const rim = new THREE.PointLight(0x2fe2ff, 40, 30); rim.position.set(-5, 5, -4); this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.38 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);

    // deep sapphire crystal like the owner's blue cards: dark navy glass, strong clear-coat highlights,
    // neon-cyan bevelled edges (a fresnel glow added to the shader) and a dim cyan core inside
    const body = new THREE.MeshPhysicalMaterial({
      color: 0x07205e, roughness: 0.12, metalness: 0.15, ior: 1.5, transparent: true, opacity: 0.95,
      clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.9, specularIntensity: 1,
      emissive: 0x020c33, emissiveIntensity: 1, iridescence: 0.15, iridescenceIOR: 1.3,
    });
    // neon edges: light the bevels (where two local coordinates are both near the surface) + a faint fresnel rim
    body.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 a3 = abs(vLocalPos) * 2.0;
        float mx = max(a3.x, max(a3.y, a3.z)), mn = min(a3.x, min(a3.y, a3.z)), md = a3.x + a3.y + a3.z - mx - mn;
        float edge = smoothstep(0.8, 0.98, md);
        float rimF = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(0.08, 0.8, 1.0) * (edge * 3.4 + rimF * 0.35);`);
    };
    body.customProgramCacheKey = () => 'tharwa-dice-edges';
    const core = new THREE.MeshBasicMaterial({ color: 0x0a58d8, toneMapped: false });
    // a soft neon outline just outside the die (back faces of a slightly bigger box, added light)
    const shell = new THREE.MeshBasicMaterial({ color: 0x1ccfff, transparent: true, opacity: 0.45, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x5fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ghost = [0.22, 0.12, 0.05].map((o) => new THREE.MeshBasicMaterial({ color: 0x2fc8ff, transparent: true, opacity: o, depthWrite: false, toneMapped: false }));
    const mats: Mats = { pip: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), ring: new THREE.MeshBasicMaterial({ color: 0x020a26 }), glow: this.glowMat, ghost, body, core, shell };
    const geos: Geos = {
      pip: new THREE.CylinderGeometry(0.105, 0.105, 0.02, 28), ring: new THREE.CylinderGeometry(0.14, 0.14, 0.02, 28), glow: new THREE.PlaneGeometry(0.44, 0.44),
      body: new RoundedBoxGeometry(1, 1, 1, 6, 0.17), core: new RoundedBoxGeometry(0.6, 0.6, 0.6, 3, 0.16), ghost: new RoundedBoxGeometry(1, 1, 1, 2, 0.17),
      shell: new RoundedBoxGeometry(1.08, 1.08, 1.08, 4, 0.2),
    };
    this.dice = [0, 1].map(() => new Die(mats, geos));
    this.dice.forEach((d) => { this.scene.add(d.root); d.ghosts.forEach((g) => this.scene.add(g)); });

    this.host.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.host);
    // the resting spot follows the «دور …» line when the centre re-flows (cheap rect check, no rendering when idle)
    this.watch = window.setInterval(() => { if (this.mode === 'rest' && this.slotMoved()) { this.computeRest(); this.pose(this.values); this.draw(); } }, 300);
    document.addEventListener('visibilitychange', this.onVis);
    this.layout();
  }

  private onVis = () => {
    if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; if (this.mode !== 'rest') this.toRest(); }
    else this.draw();
  };
  private slotMoved() {
    const s = this.slot.getBoundingClientRect(), h = this.host.getBoundingClientRect();
    const k = [s.left - h.left, s.top - h.top, s.width, s.height].map((v) => Math.round(v)).join(',');
    if (k === this.slotKey) return false;
    this.slotKey = k; return true;
  }

  /** the canvas covers the board centre; the camera looks down at ~35°, the centre area is the physics table */
  private layout() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const W = r.width, Hh = r.height;
    this.renderer.setSize(W, Hh, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = Hh + 'px';
    this.bigPx = Math.max(44, Math.min(90, Hh * 0.135, W * 0.11)); // die edge on screen while landing
    const cam = this.cam;
    cam.aspect = W / Hh;
    const dist = Hh / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * this.bigPx);
    const e = THREE.MathUtils.degToRad(90 - CAM_TILT);
    cam.position.set(0, Math.sin(e) * dist, Math.cos(e) * dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // the table: the centre area on the plane through the dice centres, a little inside the edges
    const m = 0.04;
    const tl = this.toPlane(m * W, 0.06 * Hh, H), tr = this.toPlane((1 - m) * W, 0.06 * Hh, H);
    const bl = this.toPlane(m * W, (1 - m) * Hh, H), br = this.toPlane((1 - m) * W, (1 - m) * Hh, H);
    const x0 = Math.max(tl.x, bl.x) + 0.6, x1 = Math.min(tr.x, br.x) - 0.6;
    let z0 = Math.max(tl.z, tr.z) + 0.9, z1 = Math.min(bl.z, br.z) - 0.6;
    if (z1 < z0 + 1) { const zm = (z0 + z1) / 2; z0 = zm - 0.5; z1 = zm + 0.5; }
    this.court = { x0: x0 - H, x1: x1 + H, z0: z0 - H, z1: z1 + H };
    this.slotKey = '';
    this.slotMoved();
    this.computeRest();
    if (this.mode === 'rest') this.pose(this.values);
    this.draw();
  }
  /** screen point (px, relative to the canvas) -> point on the horizontal plane y = h */
  private toPlane(px: number, py: number, h: number) {
    const r = this.host.getBoundingClientRect();
    const ray = new THREE.Raycaster(), hit = new THREE.Vector3();
    ray.setFromCamera(new THREE.Vector2((px / r.width) * 2 - 1, -((py / r.height) * 2 - 1)), this.cam);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), hit) ? hit.clone() : new THREE.Vector3();
  }
  /** pixels per world unit at a point (how big a die of scale 1 looks there) */
  private ppu(p: THREE.Vector3) {
    const r = this.host.getBoundingClientRect();
    const a = p.clone().project(this.cam), b = p.clone().add(new THREE.Vector3(1, 0, 0)).project(this.cam);
    return Math.hypot((b.x - a.x) * r.width / 2, (b.y - a.y) * r.height / 2);
  }
  /** resting spot: the #dice placeholder (next to «دور …»), two dice side by side at a readable size */
  private computeRest() {
    const s = this.slot.getBoundingClientRect(), h = this.host.getBoundingClientRect();
    if (!s.width || !s.height || !h.width) return;
    const restPx = Math.max(24, Math.min(48, s.height * 0.86, s.width / 2.5));
    const sx = s.left - h.left + s.width / 2, sy = s.top - h.top + s.height / 2;
    let scale = 0.5;
    for (let k = 0; k < 2; k++) { // plane height depends on the scale: two passes settle it
      const c = this.toPlane(sx, sy, H * scale);
      scale = restPx / Math.max(1, this.ppu(c));
    }
    const c = this.toPlane(sx, sy, H * scale);
    const gap = 0.62 * scale + 0.06 * scale;
    this.rest.scale = scale;
    this.rest.pos[0].set(c.x + gap, H * scale, c.z);
    this.rest.pos[1].set(c.x - gap, H * scale, c.z);
  }

  /** dice at rest in their spot, the given values facing the camera (no throw) */
  private pose(values: number[]) {
    this.dice.forEach((d, k) => {
      d.blank();
      d.root.position.copy(this.rest.pos[k]);
      d.root.scale.setScalar(this.rest.scale);
      d.root.quaternion.setFromEuler(new THREE.Euler(0, k ? -0.08 : 0.06, 0));
      d.showOnTop(values[k]);
      if (d.face >= 0) d.root.quaternion.copy(d.presentQuat(FACE_TILT));
      d.ghosts.forEach((g) => { g.visible = false; });
    });
    this.glowMat.opacity = 0.75;
  }
  private toRest() { this.mode = 'rest'; this.th = null; this.computeRest(); this.pose(this.values); this.draw(); }

  show(values: number[]) { this.values = values.slice(0, 2); this.toRest(); }

  roll(values: number[], opts: RollOpts = {}) {
    this.values = values.slice(0, 2);
    this.onImpact = opts.onImpact || null;
    if (document.hidden || calm()) { this.show(values); if (this.onImpact) this.onImpact(); return; }
    this.dice.forEach((d) => { d.blank(); d.root.scale.setScalar(1); }); // every face blank before anything moves
    // land in an empty part of the centre (never on the buttons, chips, log or panels)
    const s = this.findSpot();
    this.spot = s.px; this.aim = s.aim;
    this.th = simulate(this.court, opts.from || { x: 0, y: 1 }, this.aim);
    this.impactDone = false;
    this.mode = 'throw'; this.t0 = performance.now();
    this.dice.forEach((d, k) => d.frame(this.th!.frames[k], 0));
    this.draw();
  }

  /** the throw is over: pips on the face that is up, then square up and line up side by side */
  private land() {
    const t = this.th!;
    this.dice.forEach((d, k) => { d.frame(t.frames[k], t.count - 1); d.ghosts.forEach((g) => { g.visible = false; }); });
    // first value on the right-hand die (the board reads right to left)
    const order = this.dice[0].root.position.x >= this.dice[1].root.position.x ? [0, 1] : [1, 0];
    this.dice[order[0]].showOnTop(this.values[0]);
    this.dice[order[1]].showOnTop(this.values[1]);
    const mid = this.dice[0].root.position.clone().add(this.dice[1].root.position).multiplyScalar(0.5);
    const cc = new THREE.Vector3(this.aim.x, H, this.aim.z);
    mid.lerp(cc, 0.92); mid.y = H;
    this.dice.forEach((d, k) => {
      this.from.pos[k].copy(d.root.position); this.from.quat[k].copy(d.root.quaternion);
      this.to.quat[k].copy(d.presentQuat(FACE_TILT));
      this.to.pos[k].copy(mid).add(new THREE.Vector3(order[0] === k ? 0.72 : -0.72, 0, 0));
    });
    this.glowMat.opacity = 0;
    this.mode = 'present'; this.t0 = performance.now();
  }

  private loop = () => {
    this.raf = 0;
    if (document.hidden) return;
    const now = performance.now();
    if (this.mode === 'throw' && this.th) {
      // window.__tharwaDiceSlow (tests only) plays the throw in slow motion so single frames can be checked
      const slow = Number((window as any).__tharwaDiceSlow) || 1;
      const t = this.th, i = Math.floor(((now - this.t0) / 1000) / STEP / slow);
      if (!this.impactDone && i >= t.impact) { this.impactDone = true; try { this.onImpact?.(); } catch { /* sound only */ } }
      if (i >= t.count - 1) this.land();
      else {
        this.dice.forEach((d, k) => {
          d.frame(t.frames[k], i);
          // a short trail while the die is flying fast
          const f = t.frames[k], o = i * 7, p = Math.max(0, i - 3) * 7;
          const fast = Math.hypot(f[o] - f[p], f[o + 1] - f[p + 1], f[o + 2] - f[p + 2]) > 0.22;
          d.ghosts.forEach((g, n) => { g.visible = fast; if (fast) d.frame(f, i - (n + 1) * 3, g); });
        });
      }
    }
    if (this.mode === 'present') {
      const k = Math.min(1, (now - this.t0) / PRESENT_MS), e = ease(k);
      this.dice.forEach((d, j) => {
        d.root.quaternion.copy(this.from.quat[j]).slerp(this.to.quat[j], e);
        d.root.position.lerpVectors(this.from.pos[j], this.to.pos[j], e);
        d.root.position.y = H + 0.12 * Math.sin(e * Math.PI / 2);
      });
      this.glowMat.opacity = 0.75 * e;
      if (k >= 1) { this.mode = 'hold'; this.t0 = now; }
    }
    // the centre can change under the dice (e.g. the buttons come back after the walk): if they would cover
    // anything, they leave for their resting spot at once
    if (this.mode === 'hold' && now >= this.checkAt) {
      this.checkAt = now + 120;
      if (this.covering()) { this.mode = 'hold'; this.t0 = now - HOLD_MS; }
    }
    if (this.mode === 'hold' && now - this.t0 >= HOLD_MS) {
      this.computeRest();
      this.dice.forEach((d, j) => { this.from.pos[j].copy(d.root.position); });
      this.mode = 'glide'; this.t0 = now;
    }
    if (this.mode === 'glide') {
      const k = Math.min(1, (now - this.t0) / GLIDE_MS), e = easeIO(k);
      const sc = 1 + (this.rest.scale - 1) * e;
      this.dice.forEach((d, j) => {
        d.root.position.lerpVectors(this.from.pos[j], this.rest.pos[j], e);
        d.root.position.y += Math.sin(e * Math.PI) * 0.5; // a small lift on the way
        d.root.scale.setScalar(sc);
      });
      if (k >= 1) { this.mode = 'rest'; this.pose(this.values); this.slotKey = ''; this.slotMoved(); }
    }
    this.renderer.render(this.scene, this.cam);
    if (this.mode !== 'rest') this.draw();
  };
  // requestAnimationFrame can be slowed down a lot (a window in the background): a timer keeps the throw moving,
  // so the dice never sit on top of the buttons for longer than planned
  private draw() {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(this.loop);
    clearTimeout(this.kick);
    if (this.mode !== 'rest') this.kick = window.setTimeout(() => { if (this.raf) { cancelAnimationFrame(this.raf); this.loop(); } }, 120);
  }

  // ---------------------------------------------------------------- where to land
  /** rectangles (px, relative to the centre) the dice must not cover; `predict` reserves room for the action buttons */
  private obstacles(predict: boolean) {
    const h = this.host.getBoundingClientRect(), out: { l: number; t: number; r: number; b: number }[] = [];
    const sel = '#cTop > *, .dice-spot, .offer-chip, #cActions button, #cActions .deed, #cActions .debt-box, #cActions .auction, #cActions .hint, '
      + '#cActions .offer2, #cActions .build-hint, #cActions .debt, #cActions .spectator, #cLog > div, .card2, .rent-pill, .banner, .winner, .emblem, .sub';
    this.host.querySelectorAll(sel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out.push({ l: r.left - h.left, t: r.top - h.top, r: r.right - h.left, b: r.bottom - h.top });
    });
    const a = predict && this.host.querySelector('#cActions');
    if (a) {
      const r = a.getBoundingClientRect(), cx = (r.left + r.right) / 2 - h.left, cy = (r.top + r.bottom) / 2 - h.top;
      const w = Math.max(r.width, 360) / 2, hh = Math.max(r.height, 150) / 2;
      out.push({ l: cx - w, t: cy - hh, r: cx + w, b: cy + hh });
    }
    return out;
  }
  private foot() { return { w: this.bigPx * 2.75, h: this.bigPx * 1.5 }; }
  private overlap(cx: number, cy: number, obs: { l: number; t: number; r: number; b: number }[], pad = 8) {
    const f = this.foot(), l = cx - f.w / 2 - pad, r = cx + f.w / 2 + pad, t = cy - f.h / 2 - pad, b = cy + f.h / 2 + pad;
    let area = 0;
    for (const o of obs) area += Math.max(0, Math.min(r, o.r) - Math.max(l, o.l)) * Math.max(0, Math.min(b, o.b) - Math.max(t, o.t));
    return area;
  }
  /** the empty place of the centre closest to its middle that fits both dice (screen px + the matching table point) */
  private findSpot() {
    const h = this.host.getBoundingClientRect(), f = this.foot(), obs = this.obstacles(true);
    const W = h.width, Hh = h.height, m = 6;
    const x0 = m + f.w / 2, x1 = W - m - f.w / 2, y0 = Hh * 0.06 + f.h / 2, y1 = Hh - m - f.h / 2;
    let best = { px: { x: W / 2, y: Hh / 2 }, aim: { x: 0, z: 0 } }, bestScore = Infinity;
    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 10; j++) {
        const x = x1 > x0 ? x0 + ((x1 - x0) * i) / 12 : W / 2, y = y1 > y0 ? y0 + ((y1 - y0) * j) / 10 : Hh / 2;
        // the dice must also stay inside the table: judge the spot where they will really end up
        const w = this.toPlane(x, y, H);
        const aim = { x: Math.min(this.court.x1 - 1.25, Math.max(this.court.x0 + 1.25, w.x)), z: Math.min(this.court.z1 - 0.8, Math.max(this.court.z0 + 0.8, w.z)) };
        const p = new THREE.Vector3(aim.x, H, aim.z).project(this.cam);
        const px = { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * Hh };
        const score = this.overlap(px.x, px.y, obs) * 1000 + Math.hypot((px.x - W / 2) * 0.8, px.y - Hh * 0.45);
        if (score < bestScore) { bestScore = score; best = { px, aim }; }
      }
    }
    return best;
  }
  /** are the landed dice on top of something now? (their real outline on screen) */
  private covering() {
    const h = this.host.getBoundingClientRect(), r = this.bigPx * 0.62;
    const pts = this.dice.map((d) => { const p = d.root.position.clone().project(this.cam); return { x: (p.x + 1) / 2 * h.width, y: (1 - p.y) / 2 * h.height }; });
    const l = Math.min(pts[0].x, pts[1].x) - r, rr = Math.max(pts[0].x, pts[1].x) + r, t = Math.min(pts[0].y, pts[1].y) - r, b = Math.max(pts[0].y, pts[1].y) + r;
    return this.obstacles(false).some((o) => Math.min(rr, o.r) > Math.max(l, o.l) && Math.min(b, o.b) > Math.max(t, o.t));
  }

  dispose() {
    cancelAnimationFrame(this.raf); this.ro?.disconnect(); clearInterval(this.watch); clearTimeout(this.kick);
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
