// «ثروة» 3D crystal dice (three + cannon-es), bundled to public/tharwa/dice3d.js by web/scripts/build-tharwa-dice.mjs.
// Loaded lazily by public/fx.js for the board dice (#dice). If WebGL is missing or anything fails, fx.js shows the
// CSS dice instead (same place, same values).
//
// Layout (owner): the dice live in their home spot only — the #dice element under «دور …», where the CSS dice sit.
// A small transparent canvas covers that spot plus a margin to the left and right (pointer-events: none), so a throw
// can never cover the turn label, the buttons or the log. The camera looks straight down (orthographic): a die at
// rest is a flat, face-on square exactly the size and place of a CSS die.
//
// Real dice (owner): every face has its pips the whole time (opposite faces add up to 7).
//   1. The throw is simulated with cannon-es BEFORE anything moves (fixed 120 Hz steps, a few ms); throws that don't
//      land flat, in order and next to the home spots are thrown away.
//   2. The simulation tells which face will end up on top. The die is then numbered (a valid die: opposite faces
//      sum to 7) so that this face carries the server's value. So the die really rolls and stops on the rolled
//      number — no swap or snap at the end; a short settle only slides it onto its exact spot and squares it up,
//      keeping the same face on top.
//   3. The first value is always on the right-hand die (the board reads right to left), like the CSS dice.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

const H = 0.5;                 // die half size (edge = 1 world unit = one CSS die on screen)
const STEP = 1 / 120;
const MAX_STEPS = 240;         // 2.0 s of physics at most
const SETTLE_MS = 240;         // slide onto the exact home spot + square up (same face on top)
const MARGIN_X = 1.6;          // tumbling room left and right of the home spot (in dice)
const MARGIN_Y_PX = 4;         // above / below: a few px of the gap that is always empty (chips may appear below mid-throw)
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
// face normals in the order of the box geometry's material groups: +x, -x, +y, -y, +z, -z (opposites are pairs)
const NORMALS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
const OPP = [1, 0, 3, 2, 5, 4];
function upFace(q: THREE.Quaternion) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
  let face = 0, dot = -2;
  NORMALS.forEach((n, k) => { const d = n.dot(up); if (d > dot) { dot = d; face = k; } });
  return { face, dot };
}
/** a valid die (opposite faces sum to 7) with `v` on face `f` */
function numbering(f: number, v: number, rnd: () => number): number[] {
  const nums = [0, 0, 0, 0, 0, 0];
  nums[f] = v; nums[OPP[f]] = 7 - v;
  const pairs = [1, 2, 3].filter((a) => a !== v && a !== 7 - v).map((a) => (rnd() < 0.5 ? [a, 7 - a] : [7 - a, a]));
  const rest = [0, 2, 4].filter((k) => k !== f && k !== OPP[f] && OPP[k] !== f);
  rest.forEach((k, i) => { nums[k] = pairs[i][0]; nums[OPP[k]] = pairs[i][1]; });
  return nums;
}

type Court = { x0: number; x1: number; z0: number; z1: number };
type Throw = { frames: Float32Array[]; count: number; ok: boolean; impact: number; up: number[] };
/** screen direction from the board centre towards the thrower (x right, y down) */
export type From = { x: number; y: number };
type RollOpts = { from?: From; onImpact?: () => void };

/** one throw: both dice come in from one side of the home strip, tumble and stop next to their home spots.
 *  home[0] = the right-hand spot (first value), home[1] = the left-hand one. */
function oneThrow(c: Court, home: THREE.Vector3[], fromLeft: boolean, rnd: () => number): Throw {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -50, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.35;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
  const th = 0.5, wh = 12;
  for (const [x, z, sx, sz] of [[c.x1 + th, cz, th, hz + th], [c.x0 - th, cz, th, hz + th], [cx, c.z1 + th, hx + th, th], [cx, c.z0 - th, hx + th, th]]) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(sx, wh / 2, sz)) });
    b.position.set(x, wh / 2, z); world.addBody(b);
  }
  const dir = fromLeft ? 1 : -1; // direction of travel along x
  let impact = -1, count = 0;
  // the die that must end further along the travel direction starts in front
  const lead = fromLeft ? 0 : 1; // travelling right: the right-hand die (0) leads; travelling left: the left-hand die (1)
  const dice = [0, 1].map((k) => {
    const d = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(H, H, H)), linearDamping: 0.15, angularDamping: 0.2 });
    d.allowSleep = true; d.sleepSpeedLimit = 0.25; d.sleepTimeLimit = 0.1;
    // both dice leave the hand at the edge of the strip, the leading one a die-length ahead
    const startX = (fromLeft ? c.x0 + 0.62 : c.x1 - 0.62) + (k === lead ? dir * 1.15 : 0);
    d.position.set(startX, 1.0 + rnd() * 0.6, home[k].z + (rnd() - 0.5) * 0.12);
    d.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    const dist = Math.abs(home[k].x - startX);
    const v = (2.6 + rnd() * 1.6) * Math.sqrt(Math.max(0.6, dist)) * (k === lead ? 1.12 : 1);
    d.velocity.set(dir * v, 1.5 + rnd() * 1.5, 0);
    // rolling along x: mostly a spin about z (plus a little wobble)
    d.angularVelocity.set((rnd() - 0.5) * 6, (rnd() - 0.5) * 6, -dir * (14 + rnd() * 12));
    d.addEventListener('collide', (e: { body: CANNON.Body }) => { if (impact < 0 && e.body === floor) impact = count; });
    world.addBody(d);
    return d;
  });
  const frames = [new Float32Array(MAX_STEPS * 7), new Float32Array(MAX_STEPS * 7)];
  for (; count < MAX_STEPS; count++) {
    world.step(STEP);
    dice.forEach((d, k) => {
      const o = count * 7, f = frames[k];
      f[o] = d.position.x; f[o + 1] = d.position.y; f[o + 2] = d.position.z;
      f[o + 3] = d.quaternion.x; f[o + 4] = d.quaternion.y; f[o + 5] = d.quaternion.z; f[o + 6] = d.quaternion.w;
    });
    if (count > 40 && dice.every((d) => d.sleepState === CANNON.Body.SLEEPING)) { count++; break; }
  }
  const q = dice.map((d) => new THREE.Quaternion(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w));
  const ok = dice.every((d, k) => upFace(q[k]).dot > 0.995 && Math.abs(d.position.y - H) < 0.03
    && Math.abs(d.position.x - home[k].x) < 0.7 && Math.abs(d.position.z - home[k].z) < 0.35)
    && dice[0].position.x - dice[1].position.x > 1.02; // right-hand die really on the right, not touching
  return { frames, count: Math.min(count, MAX_STEPS), ok, impact: impact < 0 ? 0 : impact, up: q.map((x) => upFace(x).face) };
}
function simulate(c: Court, home: THREE.Vector3[], fromLeft: boolean): Throw {
  let best: Throw | null = null;
  for (let a = 0; a < 36; a++) {
    const t = oneThrow(c, home, fromLeft, Math.random), s = t.count * STEP;
    if (t.ok && s >= 0.6 && s <= 1.6) return t;
    if (t.ok && (!best || !best.ok)) best = t;
    else if (!best) best = t;
  }
  return best!;
}

// ---------------------------------------------------------------- look: deep sapphire crystal, neon edges, white pips
const FACE_PX = 128;
function faceCanvases(v: number) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = FACE_PX; return c; };
  const col = mk(), glow = mk();
  const g = col.getContext('2d')!, e = glow.getContext('2d')!;
  const grd = g.createRadialGradient(FACE_PX * 0.35, FACE_PX * 0.3, 4, FACE_PX / 2, FACE_PX / 2, FACE_PX * 0.75);
  grd.addColorStop(0, '#1a4bb8'); grd.addColorStop(0.6, '#0b2a78'); grd.addColorStop(1, '#061848');
  g.fillStyle = grd; g.fillRect(0, 0, FACE_PX, FACE_PX);
  e.fillStyle = '#000'; e.fillRect(0, 0, FACE_PX, FACE_PX);
  const r = v === 1 ? FACE_PX * 0.13 : FACE_PX * 0.095, s = FACE_PX * 0.25;
  for (const [a, b] of PIPS[v]) {
    const x = FACE_PX / 2 + a * s, y = FACE_PX / 2 + b * s;
    g.fillStyle = '#020a26'; g.beginPath(); g.arc(x, y, r * 1.28, 0, Math.PI * 2); g.fill(); // socket
    for (const [ctx, blur] of [[g, 10], [e, 14]] as [CanvasRenderingContext2D, number][]) {
      ctx.shadowColor = '#5fe8ff'; ctx.shadowBlur = blur; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
  const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: tex(col), emissiveMap: tex(glow) };
}
function faceMaterial(v: number) {
  const { map, emissiveMap } = faceCanvases(v);
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.18, metalness: 0.2 });
  // neon edges: light the bevels (where two local coordinates are both near the surface)
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 a3 = abs(vLocalPos) * 2.0;
      float mx = max(a3.x, max(a3.y, a3.z)), mn = min(a3.x, min(a3.y, a3.z)), md = a3.x + a3.y + a3.z - mx - mn;
      totalEmissiveRadiance += vec3(0.08, 0.8, 1.0) * smoothstep(0.8, 0.98, md) * 2.6;`);
  };
  m.customProgramCacheKey = () => 'tharwa-dice-face';
  return m;
}

class Die {
  root = new THREE.Group();
  body: THREE.Mesh;
  nums = [3, 4, 1, 6, 2, 5];
  constructor(geo: THREE.BufferGeometry, private mats: THREE.Material[], shell: THREE.Mesh) {
    this.body = new THREE.Mesh(geo, this.mats.slice(0, 6));
    this.body.castShadow = true;
    this.root.add(this.body, shell);
    this.number(this.nums);
  }
  /** paint the six faces (mats[n - 1] has n pips) */
  number(nums: number[]) { this.nums = nums.slice(); this.body.material = nums.map((n) => this.mats[n - 1]); }
  /** the number on the face that points up now */
  get value() { return this.nums[upFace(this.root.quaternion).face]; }
  frame(f: Float32Array, i: number) {
    const o = Math.max(0, i) * 7;
    this.root.position.set(f[o], f[o + 1], f[o + 2]);
    this.root.quaternion.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
  }
  /** same face on top, squared to the screen (the smallest turn about the vertical axis) */
  squareQuat() {
    const q = this.root.quaternion.clone(), f = upFace(q).face, n = NORMALS[f];
    const cands = NORMALS.filter((x, k) => k !== f && k !== OPP[f]);
    let best = cands[0], bd = -2;
    for (const c of cands) { const d = c.clone().applyQuaternion(q).x; if (d > bd) { bd = d; best = c; } }
    const local = new THREE.Matrix4().makeBasis(best, n, best.clone().cross(n));
    const world = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0).cross(new THREE.Vector3(0, 1, 0)));
    return new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.invert()));
  }
}

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

type Mode = 'rest' | 'throw' | 'settle';

class BoardDice {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private dice: Die[];
  private court: Court = { x0: -3, x1: 3, z0: -1, z1: 1 };
  private home = [new THREE.Vector3(0.67, H, 0), new THREE.Vector3(-0.67, H, 0)];
  private canvas: HTMLCanvasElement;
  private slot: HTMLElement;
  private host: HTMLElement;
  private values: number[] = [0, 0];
  private mode: Mode = 'rest';
  private t0 = 0;
  private th: Throw | null = null;
  private impactDone = false;
  private onImpact: (() => void) | null = null;
  private from = { pos: [new THREE.Vector3(), new THREE.Vector3()], quat: [new THREE.Quaternion(), new THREE.Quaternion()] };
  private to = { quat: [new THREE.Quaternion(), new THREE.Quaternion()] };
  private px = 60; // px per world unit = the CSS die size
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private mo: MutationObserver | null = null;
  private watch = 0;
  private kick = 0;
  private guard = 0;
  private slotKey = '';
  private anchor = { x: 0, y: 0, left: 0, top: 0 }; // where the home spot was when the canvas was placed
  failed = false;
  onFail: ((values: number[]) => void) | null = null;
  /** for the dice self-check (window.__tharwaDice) */
  get state() {
    return { rolling: this.mode === 'throw', mode: this.mode, want: this.values.slice(),
      // what the player sees: the right-hand die first (top faces)
      shown: this.mode === 'throw' ? [0, 0] : this.dice.map((d) => d.value) };
  }
  /** screen centres (px, page) of the two dice, right-hand first — for the self-check */
  get centres() {
    const r = this.canvas.getBoundingClientRect();
    return this.dice.map((d) => { const p = d.root.position.clone().project(this.cam); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, v: d.value }; });
  }

  constructor(slot: HTMLElement) {
    this.slot = slot;
    this.host = (slot.closest('.center') as HTMLElement) || slot.parentElement || slot;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dice3d-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); // the canvas is small now
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps the blue blue
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // plain lights (no environment map: building one blocked the page for 1-2 s)
    const key = new THREE.DirectionalLight(0xeaf8ff, 2.4);
    key.position.set(-2, 10, -3); key.castShadow = true;
    key.shadow.mapSize.set(512, 512); key.shadow.bias = -0.0006;
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    const spec = new THREE.PointLight(0xffffff, 40, 30); spec.position.set(1.5, 7, 2);
    const side = new THREE.PointLight(0x00b4ff, 20, 20); side.position.set(4, 2, 1);
    this.scene.add(key, key.target, spec, side, new THREE.HemisphereLight(0x8fd8ff, 0x020818, 0.6));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);

    const mats = [1, 2, 3, 4, 5, 6].map(faceMaterial);
    const geo = new RoundedBoxGeometry(1, 1, 1, 5, 0.16);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x1ccfff, transparent: true, opacity: 0.4, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const shellGeo = new RoundedBoxGeometry(1.07, 1.07, 1.07, 3, 0.19);
    this.dice = [0, 1].map(() => new Die(geo, mats, new THREE.Mesh(shellGeo, shellMat)));
    this.dice.forEach((d) => this.scene.add(d.root));

    // A busy GPU (e.g. a heavy game on the same PC) can take the WebGL context away: the 2D dice take over.
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.fail(new Error('WebGL context lost')); });
    this.host.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => { if (this.mode === 'rest') this.layout(false); });
    this.ro.observe(this.host);
    // follow the home spot when the centre re-flows (cheap rect check; draws only when it moved)
    this.watch = window.setInterval(() => { if (this.mode === 'rest' && this.slotMoved()) this.layout(false); }, 120);
    // and at once when the centre changes (the DOM change is seen before the next paint, so the dice never lag behind)
    this.mo = new MutationObserver(() => { try { if (this.mode === 'rest') { if (this.slotMoved()) this.layout(false); } else this.follow(); } catch (e) { this.fail(e); } });
    this.mo.observe(this.host, { childList: true, subtree: true, characterData: true });
    document.addEventListener('visibilitychange', this.onVis);
    this.layout();
    this.warmUp();
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

  /** the canvas covers the home spot (the CSS dice) plus room left and right; the camera looks straight down */
  // `repose`: put the dice back in the resting pose (new values); otherwise only follow the spot, same faces and turn
  private layout(repose = true) {
    const h = this.host.getBoundingClientRect(), cssDice = [...this.slot.querySelectorAll('.die3d')] as HTMLElement[];
    const s = this.slot.getBoundingClientRect();
    if (!h.width || !s.width || cssDice.length < 2) return;
    this.slotKey = ''; this.slotMoved();
    const r0 = cssDice[0].getBoundingClientRect(), r1 = cssDice[1].getBoundingClientRect(); // [0] = first value (right-hand in RTL)
    this.px = Math.max(16, r0.width);
    const mx = MARGIN_X * this.px;
    const left = Math.max(0, s.left - h.left - mx), right = Math.min(h.width, s.right - h.left + mx);
    // above / below: only the empty gap, never over the «دور …» line or the buttons
    const spot = (this.slot.parentElement as HTMLElement) || this.slot;
    const near = (el: Element | null, next: boolean): DOMRect | null => {
      for (let e = el; e; e = next ? e.nextElementSibling : e.previousElementSibling) {
        const r = e.getBoundingClientRect();
        if (r.height > 0 && getComputedStyle(e).display !== 'none') return r;
      }
      return null;
    };
    const above = near(spot.previousElementSibling, false), below = near(spot.nextElementSibling, true);
    const gapUp = above ? Math.max(0, s.top - above.bottom - 1) : MARGIN_Y_PX, gapDown = below ? Math.max(0, below.top - s.bottom - 1) : MARGIN_Y_PX;
    const top = s.top - h.top - Math.min(MARGIN_Y_PX, gapUp), bottom = s.bottom - h.top + Math.min(MARGIN_Y_PX, gapDown);
    const W = right - left, Hh = bottom - top;
    Object.assign(this.canvas.style, { left: left + 'px', top: top + 'px', width: W + 'px', height: Hh + 'px' });
    this.anchor = { x: s.left - h.left, y: s.top - h.top, left, top };
    this.renderer.setSize(W, Hh, false);
    const u = (v: number) => v / this.px;
    Object.assign(this.cam, { left: -u(W) / 2, right: u(W) / 2, top: u(Hh) / 2, bottom: -u(Hh) / 2 });
    this.cam.position.set(0, 30, 0); this.cam.up.set(0, 0, -1); this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld(true);
    // home spots: the centres of the (hidden) CSS dice, in table units; screen down = +z
    const toWorld = (r: DOMRect) => new THREE.Vector3(u(r.left + r.width / 2 - h.left - left - W / 2), H, u(r.top + r.height / 2 - h.top - top - Hh / 2));
    this.home = [toWorld(r0), toWorld(r1)];
    this.court = { x0: -u(W) / 2, x1: u(W) / 2, z0: -u(Hh) / 2, z1: u(Hh) / 2 };
    if (this.mode === 'rest') { if (repose) this.pose(this.values); else this.dice.forEach((d, k) => d.root.position.copy(this.home[k])); }
    this.draw();
  }

  /** dice at rest on their home spots, the values on top, face-on and squared (no throw) */
  private pose(values: number[]) {
    this.dice.forEach((d, k) => {
      const v = values[k] >= 1 && values[k] <= 6 ? values[k] : 1;
      d.root.position.copy(this.home[k]);
      d.root.quaternion.identity();
      d.number(numbering(2, v, () => 0.3)); // face +y (index 2) on top
    });
  }
  /** during a throw the centre can re-flow (the roll button becomes «…»): the canvas moves with the home spot */
  private follow() {
    const s = this.slot.getBoundingClientRect(), h = this.host.getBoundingClientRect();
    const dx = s.left - h.left - this.anchor.x, dy = s.top - h.top - this.anchor.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    this.canvas.style.left = this.anchor.left + dx + 'px';
    this.canvas.style.top = this.anchor.top + dy + 'px';
  }
  /** resting pose with the values, drawn at once (even if animation frames are not coming) */
  private toRest() {
    this.mode = 'rest'; this.th = null; clearTimeout(this.guard);
    this.layout(); this.pose(this.values);
    try { this.renderer.render(this.scene, this.cam); } catch { /* drawn on the next frame */ }
    this.draw();
  }

  // ---------------------------------------------------------------- safety
  // Whatever happens the dice end on their spot with the server's values: a throw that has not settled in 2.0 s
  // settles at once, a watchdog puts them at rest if frames stop coming, and any error in the 3D path hands over to
  // the 2D dice (fx.js) with the right values.
  private fail(e: unknown) {
    if (this.failed) return;
    this.failed = true;
    console.warn('3D dice off:', e);
    try { this.dispose(); } catch { /* already gone */ }
    try { this.onFail?.(this.values.slice()); } catch { /* nothing more to do */ }
  }
  /** compile every shader at load so the first throw never stalls */
  private warmUp() {
    try {
      const r = this.renderer as unknown as { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
      const done = () => this.draw();
      if (r.compileAsync) r.compileAsync(this.scene, this.cam).then(done, done);
      else { this.renderer.compile(this.scene, this.cam); done(); }
    } catch (e) { this.fail(e); }
  }
  private watchdog = () => {
    try {
      if (this.mode === 'throw' && this.th) this.land();
      if (this.mode !== 'rest') {
        clearTimeout(this.guard);
        this.guard = window.setTimeout(() => { try { if (this.mode !== 'rest') this.toRest(); } catch (e) { this.fail(e); } }, SETTLE_MS + 600);
        this.draw();
      }
    } catch (e) { this.fail(e); }
  };

  show(values: number[]) {
    this.values = values.slice(0, 2);
    try { this.toRest(); } catch (e) { this.fail(e); }
  }

  roll(values: number[], opts: RollOpts = {}) {
    this.values = values.slice(0, 2);
    this.onImpact = opts.onImpact || null;
    try {
      if (document.hidden || calm()) { this.toRest(); if (this.onImpact) this.onImpact(); return; }
      this.layout();
      const from = opts.from || { x: 0, y: 1 };
      const th = simulate(this.court, this.home, from.x < -1); // a thrower on the left throws from the left
      if (!th || !th.count || th.frames.some((f) => !Number.isFinite(f[(th.count - 1) * 7]))) throw new Error('bad throw');
      // number each die so that the face that will end on top carries the server's value
      this.dice.forEach((d, k) => d.number(numbering(th.up[k], this.values[k] >= 1 && this.values[k] <= 6 ? this.values[k] : 1, Math.random)));
      this.th = th;
      this.impactDone = false;
      this.mode = 'throw'; this.t0 = performance.now();
      this.dice.forEach((d, k) => d.frame(th.frames[k], 0));
      clearTimeout(this.guard);
      this.guard = window.setTimeout(this.watchdog, 2000);
      this.draw();
    } catch (e) { this.fail(e); }
  }

  /** the throw is over (the right numbers are already on top): slide onto the exact spots and square up */
  private land() {
    const t = this.th!;
    this.dice.forEach((d, k) => {
      d.frame(t.frames[k], t.count - 1);
      this.from.pos[k].copy(d.root.position); this.from.quat[k].copy(d.root.quaternion);
      this.to.quat[k].copy(d.squareQuat());
    });
    this.mode = 'settle'; this.t0 = performance.now();
  }

  private loop = () => {
    try { this.step(); } catch (e) { this.fail(e); }
  };
  private step() {
    this.raf = 0;
    if (document.hidden || this.failed) return;
    if (this.mode !== 'rest') this.follow();
    const now = performance.now();
    if (this.mode === 'throw' && this.th) {
      // window.__tharwaDiceSlow (tests only) plays the throw in slow motion so single frames can be checked
      const slow = Number((window as any).__tharwaDiceSlow) || 1;
      const t = this.th, i = Math.floor(((now - this.t0) / 1000) / STEP / slow);
      if (!this.impactDone && i >= t.impact) { this.impactDone = true; try { this.onImpact?.(); } catch { /* sound only */ } }
      if (i >= t.count - 1 || (slow === 1 && now - this.t0 > 2000)) this.land(); // never longer than 2 s
      else this.dice.forEach((d, k) => d.frame(t.frames[k], i));
    }
    if (this.mode === 'settle') {
      const k = Math.min(1, (now - this.t0) / SETTLE_MS), e = ease(k);
      this.dice.forEach((d, j) => {
        d.root.quaternion.copy(this.from.quat[j]).slerp(this.to.quat[j], e);
        d.root.position.lerpVectors(this.from.pos[j], this.home[j], e);
      });
      if (k >= 1) { this.mode = 'rest'; this.th = null; clearTimeout(this.guard); if (this.slotMoved()) this.layout(false); }
    }
    this.renderer.render(this.scene, this.cam);
    if (this.mode !== 'rest') this.draw();
  }
  // requestAnimationFrame can be slowed down a lot (a window in the background): a timer keeps the throw moving
  private draw() {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(this.loop);
    clearTimeout(this.kick);
    if (this.mode !== 'rest') this.kick = window.setTimeout(() => { if (this.raf) { cancelAnimationFrame(this.raf); this.loop(); } }, 120);
  }

  dispose() {
    cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.mo?.disconnect(); clearInterval(this.watch); clearTimeout(this.kick); clearTimeout(this.guard);
    document.removeEventListener('visibilitychange', this.onVis);
    this.renderer.dispose(); this.canvas.remove();
  }
}

function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

(window as any).TharwaDice3D = {
  /** `onFail(values)`: the 3D dice gave up (an error): the caller shows its 2D dice with these values */
  mount(slot: HTMLElement, onFail?: (values: number[]) => void) {
    if (!webgl()) return null;
    try { const d = new BoardDice(slot); d.onFail = onFail || null; (window as any).__tharwaDice = d; return d; } catch (e) { console.warn('3D dice off:', e); return null; }
  },
};
