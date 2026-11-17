// «لودو» 3D scene (Three.js): glossy navy board with a chrome rim, enamel lanes, embossed gold stars,
// glass pawns on chrome bases, the crystal die, particles, studio reflections and soft shadows.
// Units: 1 = one board cell; the board top is y = 0 and spans x, z in [-7.5, 7.5] (board-local).
// Rendering is on demand: frames are drawn only while something moves (tweens, die, pulses, camera).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** copies of `g`, each moved by one matrix, merged into a single geometry (one draw call) */
function placed(g: THREE.BufferGeometry, mats: THREE.Matrix4[]) { return mergeGeometries(mats.map((m) => g.clone().applyMatrix4(m))); }
const at = (x: number, y: number, z: number, rotY = 0) => new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
import { TRACK, HOME_COL, START, STARS, BASE_ORIGIN, ARROW_ROT, cellPos } from './geom';
import { Die } from './dice';

export const COLORS = [0xff3d5a, 0x1fd17e, 0xffc23a, 0x2f8dff];      // enamel colours (rich on navy)
export const COLORS_CSS = ['#ff3d5a', '#1fd17e', '#ffc23a', '#2f8dff'];
const GLASS = [0xff5470, 0x2ee08c, 0xffcf4a, 0x3d9bff];
export const PAWN_H = 0.86;

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const toWorld = (cx: number, cy: number) => new THREE.Vector3(cx - 7.5, 0, cy - 7.5);

export type Quality = { hi: boolean; dpr: number; shadow: number };
export function pickQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const mem = (navigator as any).deviceMemory as number | undefined;
  const phone = coarse || small;
  const hi = !phone && (mem === undefined || mem >= 4);
  const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
  return { hi, dpr, shadow: hi ? 2048 : 1024 };
}

// ---------------------------------------------------------------- textures drawn on a canvas (no downloads)
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function glowTexture() {
  return canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(0.6, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** the painted board top: navy lacquer, faint arabesque, glowing base courts and lane grooves */
function boardTexture(size: number) {
  return canvasTex(size, (g, s) => {
    const u = s / 15;
    const bg = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.75);
    bg.addColorStop(0, '#13285a'); bg.addColorStop(0.55, '#0b1838'); bg.addColorStop(1, '#050c22');
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    // arabesque: 8-point stars on a grid, very faint cyan
    g.strokeStyle = 'rgba(47,226,255,.07)'; g.lineWidth = Math.max(1, u * 0.03);
    for (let y = 0; y < 15; y += 1.5) for (let x = 0; x < 15; x += 1.5) {
      const cx = (x + 0.75) * u, cy = (y + 0.75) * u, r = u * 0.6;
      g.save(); g.translate(cx, cy);
      g.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      g.rotate(Math.PI / 4); g.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      g.restore();
    }
    // lane grooves under the tiles
    g.fillStyle = 'rgba(0,0,0,.35)';
    const groove = (x: number, y: number) => { rr(g, x * u + u * 0.02, y * u + u * 0.04, u * 0.96, u * 0.96, u * 0.14); g.fill(); };
    TRACK.forEach(([x, y]) => groove(x, y));
    HOME_COL.forEach((l) => l.forEach(([x, y]) => groove(x, y)));
    // base courts: dark glass with a coloured inner glow
    BASE_ORIGIN.forEach(([ox, oy], k) => {
      const x = (ox + 0.85) * u, y = (oy + 0.85) * u, w = 4.3 * u;
      const cg = g.createRadialGradient(x + w / 2, y + w / 2, w * 0.1, x + w / 2, y + w / 2, w * 0.75);
      const c = COLORS_CSS[k];
      cg.addColorStop(0, c + '33'); cg.addColorStop(0.7, '#060f2a'); cg.addColorStop(1, '#040a1e');
      rr(g, x, y, w, w, u * 0.5); g.fillStyle = cg; g.fill();
      g.strokeStyle = c + '66'; g.lineWidth = u * 0.04; g.stroke();
    });
    // thin cyan inlay along the edge
    g.strokeStyle = 'rgba(47,226,255,.35)'; g.lineWidth = u * 0.035;
    rr(g, u * 0.12, u * 0.12, s - u * 0.24, s - u * 0.24, u * 0.4); g.stroke();
  });
}
/** soft shadow + cyan under-glow below the floating board */
function underTexture() {
  return canvasTex(256, (g, s) => {
    g.filter = 'blur(18px)';
    g.fillStyle = 'rgba(0,0,0,.85)'; rr(g, s * 0.16, s * 0.18, s * 0.68, s * 0.68, s * 0.08); g.fill();
    g.filter = 'none';
  });
}
function rimGlowTexture() {
  return canvasTex(256, (g, s) => {
    g.filter = 'blur(14px)';
    g.strokeStyle = 'rgba(47,226,255,.9)'; g.lineWidth = s * 0.05;
    rr(g, s * 0.14, s * 0.14, s * 0.72, s * 0.72, s * 0.08); g.stroke();
    g.filter = 'none';
  });
}

// ---------------------------------------------------------------- geometry helpers
/** a Shape in board-local x/z (shape y = -z, so after rotateX(-PI/2) it lies on the board) */
function shapeXZ(pts: [number, number][]) {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
}
function roundRectPath(p: THREE.Path | THREE.Shape, cx: number, cz: number, half: number, r: number) {
  const x0 = cx - half, x1 = cx + half, y0 = -cz - half, y1 = -cz + half;
  p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r); p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1);
  p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r); p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}
function frameGeo(cx: number, cz: number, outer: number, rOut: number, inner: number, rIn: number, depth: number, bevel: number) {
  const s = roundRectPath(new THREE.Shape(), cx, cz, outer, rOut) as THREE.Shape;
  s.holes.push(roundRectPath(new THREE.Path(), cx, cz, inner, rIn) as THREE.Path);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  return g;
}
function starShape(r1: number, r2: number) {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? r2 : r1;
    k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

// ---------------------------------------------------------------- studio environment (reflections)
function studioEnv(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: 0x1a2c58, side: THREE.BackSide }));
  box.position.y = 4;
  env.add(box);
  const panel = (w: number, h: number, color: number, k: number, pos: [number, number, number], rot: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  panel(14, 9, 0xffffff, 3.2, [0, 9.8, -1], [Math.PI / 2, 0, 0]);         // big top softbox
  panel(18, 6, 0xcfe4ff, 2.2, [0, 6.5, -11.8], [0, 0, 0]);               // bright back wall (what tilted tops reflect)
  panel(3, 10, 0x2fe2ff, 3.2, [-11.8, 4, -2], [0, Math.PI / 2, 0]);       // cyan strip left
  panel(3, 10, 0x00b4ff, 2.6, [11.8, 4, 3], [0, -Math.PI / 2, 0]);        // cyan strip right
  panel(10, 3, 0xffc53d, 2.0, [3, 3, 11.8], [0, Math.PI, 0]);             // warm gold kicker (front)
  panel(24, 24, 0x2a3f70, 0.6, [0, -1.9, 0], [-Math.PI / 2, 0, 0]);       // soft floor bounce (chrome never goes black)
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  return tex;
}

// ---------------------------------------------------------------- pawns
const PS = 1.16; // pawn scale
const pawnProfile = {
  base: ([[0, 0], [0.33, 0], [0.355, 0.025], [0.355, 0.07], [0.33, 0.1], [0.27, 0.125], [0, 0.125]] as [number, number][]).map(([x, y]) => [x * PS, y * PS] as [number, number]),
  body: ([[0, 0.115], [0.265, 0.115], [0.25, 0.17], [0.2, 0.27], [0.15, 0.39], [0.125, 0.47], [0.185, 0.5], [0.2, 0.525], [0.185, 0.55], [0.12, 0.565], [0, 0.565]] as [number, number][]).map(([x, y]) => [x * PS, y * PS] as [number, number]),
};
export type Pawn = {
  seat: number; i: number; corner: number;
  group: THREE.Group;      // x/z on the board (+ halo, ring)
  inner: THREE.Group;      // hop height, squash, spin
  glass: THREE.MeshPhysicalMaterial;
  halo: THREE.Mesh; ring: THREE.Mesh; hit: THREE.Mesh;
  legal: boolean; gone: boolean;
};

export class LudoScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  readonly board = new THREE.Group();      // rotated so the viewer's corner is bottom-left
  readonly die: Die;
  readonly q: Quality;
  private glowTex: THREE.Texture;
  private baseMats: THREE.MeshPhysicalMaterial[] = [];
  private spotMats: THREE.MeshStandardMaterial[] = [];
  private pawnGeo: { base: THREE.BufferGeometry; body: THREE.BufferGeometry; core: THREE.BufferGeometry };
  private cores: THREE.MeshBasicMaterial[] = [];
  private coreMat(corner: number) {
    if (!this.cores[corner]) this.cores[corner] = new THREE.MeshBasicMaterial({ color: new THREE.Color(GLASS[corner]).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.4) });
    return this.cores[corner];
  }
  private chrome: THREE.MeshStandardMaterial;
  pawns = new Map<string, Pawn>();
  private particles: { pts: THREE.Points; vel: Float32Array; born: number; life: number }[] = [];
  private raf = 0;
  private until = 0;
  private continuous = 0;           // counter of things that need continuous frames
  turnCorner = -1;
  private camBase = { phi: 0.6, dist: 30, target: new THREE.Vector3() };
  private tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  private shake = 0;
  private intro = 1;                // 1 → 0 camera intro sweep
  private lastT = 0;
  private slowFrames = 0;
  onFrame: (() => void) | null = null;
  private w = 1; private h = 1;

  constructor(readonly host: HTMLElement) {
    this.q = pickQuality();
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(this.q.dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;   // updated only on frames where something moves (see frame())
    r.shadowMap.needsUpdate = true;
    r.setClearColor(0x000000, 0);
    this.renderer = r;
    host.appendChild(r.domElement);
    r.domElement.className = 'mg-l3-canvas';

    this.scene.environment = studioEnv(r);
    this.scene.environmentIntensity = 0.95;
    this.glowTex = glowTexture();
    this.chrome = new THREE.MeshStandardMaterial({ color: 0xe8f1ff, metalness: 1, roughness: 0.16, envMapIntensity: 1.35 });

    // lights: one key light with soft shadows + a cool hemisphere fill
    const hemi = new THREE.HemisphereLight(0xa8dcff, 0x0a1430, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff6e8, 2.1);
    key.position.set(-5, 14, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -9.5; sc.right = 9.5; sc.top = 9.5; sc.bottom = -9.5; sc.near = 4; sc.far = 30;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x2fe2ff, 0.7);
    rim.position.set(6, 5, -9);
    this.scene.add(rim);

    this.scene.add(this.board);
    this.buildBoard();
    this.pawnGeo = {
      base: new THREE.LatheGeometry(pawnProfile.base.map(([x, y]) => new THREE.Vector2(x, y)), 32),
      body: mergeGeometries([
        new THREE.LatheGeometry(pawnProfile.body.map(([x, y]) => new THREE.Vector2(x, y)), 32),
        new THREE.SphereGeometry(0.155 * PS, 28, 16).translate(0, 0.7 * PS, 0),
      ]),
      core: new THREE.SphereGeometry(0.11 * PS, 16, 12).scale(1, 2.0, 1),
    };
    this.die = new Die(this.q.hi, this.glowTex);
    this.die.root.visible = false;
    this.board.add(this.die.root, this.die.haloMesh);

    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick(400); });
  }

  // ------------------------------------------------------------ board build
  private buildBoard() {
    const B = this.board, q = this.q;
    // floating shadow + cyan under-glow (screen-space soft, cheap)
    const under = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: underTexture(), transparent: true, depthWrite: false, opacity: 0.9 }));
    under.rotation.x = -Math.PI / 2; under.position.set(0.6, -0.9, 0.9);
    this.scene.add(under);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(24.5, 24.5), new THREE.MeshBasicMaterial({ map: rimGlowTexture(), transparent: true, depthWrite: false, opacity: 0.55, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.85;
    this.scene.add(glow);

    // the slab (navy lacquer) + painted top
    const slab = new THREE.Mesh(new RoundedBoxGeometry(15.6, 0.7, 15.6, 3, 0.3), new THREE.MeshPhysicalMaterial({ color: 0x0a1736, roughness: 0.4, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 }));
    slab.position.y = -0.36; slab.receiveShadow = true;
    B.add(slab);
    const topMat = new THREE.MeshPhysicalMaterial({ map: boardTexture(q.hi ? 2048 : 1024), roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), topMat);
    top.rotation.x = -Math.PI / 2; top.position.y = 0.002; top.receiveShadow = true;
    B.add(top);
    // chrome rim
    const rimMesh = new THREE.Mesh(frameGeo(0, 0, 8.05, 0.75, 7.52, 0.4, 0.52, 0.09), this.chrome);
    rimMesh.position.y = -0.46; rimMesh.receiveShadow = true;
    B.add(rimMesh);

    // tiles (instanced enamel/glass)
    const tileGeo = new RoundedBoxGeometry(0.9, 0.16, 0.9, 2, 0.07);
    const tileMat = new THREE.MeshPhysicalMaterial({ roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25, sheen: 0.4, sheenColor: new THREE.Color(0x9fe6ff), sheenRoughness: 0.4 });
    const n = TRACK.length + 20;
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, n);
    tiles.receiveShadow = true;
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let k = 0;
    const put = (x: number, y: number, c: THREE.ColorRepresentation, lift = 0) => {
      const p = toWorld(x + 0.5, y + 0.5);
      m.makeTranslation(p.x, 0.06 + lift, p.z);
      tiles.setMatrixAt(k, m); tiles.setColorAt(k, col.set(c)); k++;
    };
    TRACK.forEach(([x, y], idx) => {
      const s = START.indexOf(idx);
      put(x, y, s >= 0 ? COLORS[s] : STARS.includes(idx) ? 0xf3ecd8 : 0xdde8f6);
    });
    HOME_COL.forEach((l, c) => l.forEach(([x, y]) => put(x, y, COLORS[c])));
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    B.add(tiles);

    // embossed gold stars on the safe squares
    const starGeo = new THREE.ExtrudeGeometry(starShape(0.3, 0.13), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
    starGeo.rotateX(-Math.PI / 2);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 0.85, roughness: 0.26, emissive: 0x8a5a00, emissiveIntensity: 0.55, envMapIntensity: 1.6 });
    B.add(new THREE.Mesh(placed(starGeo, STARS.map((idx) => { const [x, y] = TRACK[idx]; const p = toWorld(x + 0.5, y + 0.5); return at(p.x, 0.15, p.z); })), gold));
    // chrome arrows on the start squares (direction of travel)
    const arrow = new THREE.Shape();
    arrow.moveTo(0.26, 0); arrow.lineTo(-0.12, 0.22); arrow.lineTo(-0.04, 0); arrow.lineTo(-0.12, -0.22); arrow.closePath();
    const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, emissive: 0xffffff, emissiveIntensity: 0.25 });
    const arrowGeo = new THREE.ExtrudeGeometry(arrow, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    arrowGeo.rotateX(-Math.PI / 2);
    B.add(new THREE.Mesh(placed(arrowGeo, START.map((idx, c) => { const [x, y] = TRACK[idx]; const p = toWorld(x + 0.5, y + 0.5); return at(p.x, 0.15, p.z, (-ARROW_ROT[c] * Math.PI) / 180); })), white));

    // base courts: enamel frame + chrome spot rings
    const ringGeo = new THREE.TorusGeometry(0.4, 0.05, 10, 32);
    const ringAt: THREE.Matrix4[] = [];
    ringGeo.rotateX(Math.PI / 2);
    const spotGeo = new THREE.CircleGeometry(0.37, 40);
    spotGeo.rotateX(-Math.PI / 2);
    BASE_ORIGIN.forEach(([ox, oy], c) => {
      const ctr = toWorld(ox + 3, oy + 3);
      const mat = new THREE.MeshPhysicalMaterial({ color: COLORS[c], roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, emissive: COLORS[c], emissiveIntensity: 0.05 });
      this.baseMats.push(mat);
      const f = new THREE.Mesh(frameGeo(ctr.x, ctr.z, 2.82, 0.6, 2.18, 0.42, 0.14, 0.06), mat);
      f.position.y = 0.0; f.receiveShadow = true; f.castShadow = false;
      B.add(f);
      const spotMat = new THREE.MeshStandardMaterial({ color: COLORS[c], roughness: 0.35, metalness: 0.2, emissive: COLORS[c], emissiveIntensity: 0.25, transparent: true, opacity: 0.55 });
      this.spotMats.push(spotMat);
      const spotAt: THREE.Matrix4[] = [];
      for (let i = 0; i < 4; i++) {
        const [sx, sy] = cellPos(c, -1, i);
        const p = toWorld(sx, sy);
        ringAt.push(at(p.x, 0.03, p.z));
        spotAt.push(at(p.x, 0.012, p.z));
      }
      const spots = new THREE.Mesh(placed(spotGeo, spotAt), spotMat);
      spots.receiveShadow = true;
      B.add(spots);
    });
    const rings = new THREE.Mesh(placed(ringGeo, ringAt), this.chrome);
    rings.receiveShadow = true;
    B.add(rings);

    // centre: four enamel triangles rising to a chrome hub with the Serva logo
    const a = -1.5, b = 1.5;
    const tris: [number, number][][] = [[[a, a], [a, b], [0, 0]], [[a, a], [b, a], [0, 0]], [[b, a], [b, b], [0, 0]], [[a, b], [b, b], [0, 0]]];
    tris.forEach((pts, c) => {
      const g = new THREE.ExtrudeGeometry(shapeXZ(pts.map(([x, z]) => [x * 0.985, z * 0.985])), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: COLORS[c], roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, emissive: COLORS[c], emissiveIntensity: 0.08 }));
      mesh.receiveShadow = true;
      B.add(mesh);
    });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.26, 56), this.chrome);
    hub.position.y = 0.13; hub.castShadow = true; hub.receiveShadow = true;
    B.add(hub);
    const logoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1, transparent: true, emissive: 0xffffff, emissiveIntensity: 0.12 });
    new THREE.TextureLoader().load('/brand/serva-logo-512.webp', (t: THREE.Texture) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      logoMat.map = t; logoMat.emissiveMap = t; logoMat.needsUpdate = true; this.kick(100);
    });
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.54, 56), logoMat);
    logo.rotation.x = -Math.PI / 2; logo.position.y = 0.265;
    B.add(logo);
  }

  // ------------------------------------------------------------ pawns
  addPawn(seat: number, i: number, corner: number): Pawn {
    const group = new THREE.Group(), inner = new THREE.Group();
    const c = new THREE.Color(GLASS[corner]);
    const glass = new THREE.MeshPhysicalMaterial({
      color: c, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, specularIntensity: 1,
      emissive: c, emissiveIntensity: this.q.hi ? 0.22 : 0.3, envMapIntensity: 1.8,
      ...(this.q.hi ? { transmission: 0.55, thickness: 0.8, attenuationColor: c.clone(), attenuationDistance: 0.5 } : { transparent: true, opacity: 0.8 }),
    });
    const base = new THREE.Mesh(this.pawnGeo.base, this.chrome);
    const body = new THREE.Mesh(this.pawnGeo.body, glass);
    for (const mm of [base, body]) { mm.castShadow = true; }
    inner.add(base, body);
    // a glowing core inside the glass (seen through it): the "lit from within" crystal look
    const core = new THREE.Mesh(this.pawnGeo.core, this.coreMat(corner));
    core.position.y = 0.36 * PS;
    inner.add(core);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: this.glowTex, color: GLASS[corner], transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.17; halo.renderOrder = 2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.43, 0.53, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.18; ring.renderOrder = 3; ring.visible = false;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.3, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.6;
    group.add(inner, halo, ring, hit);
    this.board.add(group);
    const p: Pawn = { seat, i, corner, group, inner, glass, halo, ring, hit, legal: false, gone: false };
    hit.userData.pawn = p;
    this.pawns.set(seat + '-' + i, p);
    return p;
  }
  clearPawns() {
    for (const p of this.pawns.values()) { if (p.legal) this.continuous = Math.max(0, this.continuous - 1); this.board.remove(p.group); }
    this.pawns.clear();
  }
  setGone(p: Pawn, gone: boolean) {
    if (p.gone === gone) return;
    p.gone = gone;
    p.glass.transparent = gone || !this.q.hi; p.glass.opacity = gone ? 0.3 : this.q.hi ? 1 : 0.8; p.glass.needsUpdate = true;
    (p.halo.material as THREE.MeshBasicMaterial).opacity = gone ? 0.08 : 0.42;
  }
  setLegal(p: Pawn, legal: boolean) {
    if (p.legal === legal) return;
    p.legal = legal;
    p.ring.visible = legal;
    if (legal) this.continuous++; else { this.continuous = Math.max(0, this.continuous - 1); p.glass.emissiveIntensity = this.q.hi ? 0.22 : 0.3; p.inner.position.y = 0; }
    this.kick(60);
  }

  // ------------------------------------------------------------ effects
  burst(at: THREE.Vector3, color: number, n = 36, speed = 3.2, life = 0.9) {
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = at.x; pos[k * 3 + 1] = at.y; pos[k * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, up = 0.4 + Math.random() * 1.1, s = speed * (0.35 + Math.random() * 0.75);
      vel[k * 3] = Math.cos(a) * s; vel[k * 3 + 1] = up * s; vel[k * 3 + 2] = Math.sin(a) * s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: this.glowTex, color, size: 0.62, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 });
    const pts = new THREE.Points(g, mat);
    pts.renderOrder = 4;
    this.board.add(pts);
    this.particles.push({ pts, vel, born: performance.now(), life: life * 1000 });
    this.kick(life * 1000 + 50);
  }
  shakeCamera(amount = 0.18) { if (calm()) return; this.shake = Math.max(this.shake, amount); this.kick(500); }
  setTurnCorner(c: number) { this.turnCorner = c; this.kick(60); }
  private activeKey = '';
  /** corners without a player are dimmed (2- and 3-player games) */
  setActiveCorners(corners: number[]) {
    const key = corners.join(',');
    if (key === this.activeKey) return;
    this.activeKey = key;
    this.baseMats.forEach((m, c) => { const on = corners.includes(c); m.color.set(COLORS[c]); if (!on) m.color.lerp(new THREE.Color(0x14213f), 0.62); });
    this.spotMats.forEach((m, c) => { m.opacity = corners.includes(c) ? 0.55 : 0.12; });
    this.kick(60);
  }

  // ------------------------------------------------------------ view
  /** rotate the board so `corner` sits bottom-left, nearest the viewer */
  orient(corner: number) {
    const q = (3 - corner + 4) % 4;
    this.board.rotation.y = (-Math.PI / 2) * q;
    this.board.updateMatrixWorld(true);
  }
  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera();
    this.kick(80);
  }
  private fitCamera() {
    const portrait = this.h > this.w * 1.02;
    const phi = portrait ? 0.5 : 0.68;          // tilt from vertical (radians)
    const cam = this.camera;
    cam.fov = portrait ? 23 : 28;
    cam.updateProjectionMatrix();
    const pts: THREE.Vector3[] = [];
    for (const x of [-8.1, 8.1]) for (const z of [-8.1, 8.1]) for (const y of [-0.5, 0.2]) pts.push(new THREE.Vector3(x, y, z));
    pts.push(new THREE.Vector3(-7, 1.0, -7), new THREE.Vector3(7, 1.0, -7));
    const target = new THREE.Vector3(0, 0, 0);
    const extent = (d: number) => {
      cam.position.set(target.x, target.y + Math.cos(phi) * d, target.z + Math.sin(phi) * d);
      cam.lookAt(target); cam.updateMatrixWorld(true);
      let minX = 9, maxX = -9, minY = 9, maxY = -9;
      for (const p of pts) { const v = p.clone().project(cam); minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
      return { minX, maxX, minY, maxY };
    };
    for (let pass = 0; pass < 3; pass++) {
      let lo = 8, hi = 120;
      for (let k = 0; k < 30; k++) {
        const d = (lo + hi) / 2, e = extent(d);
        const m = Math.max(Math.abs(e.minX), Math.abs(e.maxX), Math.abs(e.minY), Math.abs(e.maxY));
        if (m > 0.965) lo = d; else hi = d;
      }
      const e = extent(hi);
      // re-centre vertically: move the target along z by the projected imbalance
      const off = (e.maxY + e.minY) / 2;
      target.z -= off * 4.5 * (pass === 0 ? 1 : 0.6);
      this.camBase.dist = hi;
    }
    this.camBase.phi = phi;
    this.camBase.target.copy(target);
    this.placeCamera();
  }
  private placeCamera() {
    const { phi, dist, target } = this.camBase;
    const ease = this.intro * this.intro * (3 - 2 * this.intro);  // smoothstep
    const p = phi + this.tilt.y * 0.06 + ease * 0.32;
    const yaw = this.tilt.x * 0.07 + ease * 0.55;
    const d = dist * (1 + ease * 0.18);
    const cam = this.camera;
    cam.position.set(target.x + Math.sin(yaw) * Math.sin(p) * d, target.y + Math.cos(p) * d, target.z + Math.cos(yaw) * Math.sin(p) * d);
    if (this.shake > 0.001) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
    cam.lookAt(target);
  }
  /** desktop hover parallax (-1..1); touch devices never call this */
  setTilt(x: number, y: number) { this.tilt.tx = x; this.tilt.ty = y; this.kick(900); }
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h, behind: p.z > 1 };
  }
  /** board-local → world */
  local(v: THREE.Vector3) { return this.board.localToWorld(v.clone()); }

  // ------------------------------------------------------------ picking
  private ray = new THREE.Raycaster();
  pick(clientX: number, clientY: number, filter: (p: Pawn) => boolean): Pawn | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const cands = [...this.pawns.values()].filter(filter);
    const hits = this.ray.intersectObjects(cands.map((p) => p.hit), false);
    if (hits.length) return hits[0].object.userData.pawn as Pawn;
    // generous fallback: nearest candidate within ~11% of the canvas width (fat-finger friendly)
    let best: Pawn | null = null, bd = Math.max(34, rect.width * 0.11);
    for (const p of cands) {
      const s = this.project(this.local(new THREE.Vector3(p.group.position.x, 0.4, p.group.position.z)));
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  hitsDie(clientX: number, clientY: number) {
    if (!this.die.root.visible) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const s = this.project(this.local(this.die.root.position));
    return Math.hypot(s.x - (clientX - rect.left), s.y - (clientY - rect.top)) < Math.max(40, rect.width * 0.07);
  }

  // ------------------------------------------------------------ loop
  hold() { this.continuous++; this.kick(30); }
  release() { this.continuous = Math.max(0, this.continuous - 1); this.kick(120); }
  kick(ms = 100) {
    this.shadowFrames = Math.max(this.shadowFrames, 2);
    this.until = Math.max(this.until, performance.now() + ms);
    if (!this.raf && !document.hidden) this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  startIntro() {
    if (calm()) { this.intro = 0; this.kick(100); return; }
    this.intro = 1;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1600);
      this.intro = 1 - (1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    this.kick(1700);
  }
  private lastDraw = 0;
  private shadowFrames = 3;
  private frame(t: number) {
    this.raf = 0;
    if (document.hidden) return;
    const idle = t >= this.until && !this.particles.length && this.shake <= 0.001 && Math.abs(this.tilt.x - this.tilt.tx) + Math.abs(this.tilt.y - this.tilt.ty) <= 0.002;
    if (idle && this.continuous > 0 && t - this.lastDraw < 30) { this.raf = requestAnimationFrame((tt) => this.frame(tt)); return; }
    this.lastDraw = t;
    if (!idle || this.shadowFrames > 0) { this.renderer.shadowMap.needsUpdate = true; if (this.shadowFrames > 0) this.shadowFrames--; }
    const dt = this.lastT ? Math.min(0.05, (t - this.lastT) / 1000) : 0.016;
    this.lastT = t;
    // adaptive quality: if frames are slow for a while, drop the pixel ratio once
    if (dt > 0.026) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 40 && this.renderer.getPixelRatio() > 1) {
      this.renderer.setPixelRatio(1); this.w = 0; this.resize(); this.slowFrames = 0;
    }
    this.update(t, dt);
    this.renderer.render(this.scene, this.camera);
    if (this.onFrame) this.onFrame();
    if (t < this.until || this.continuous > 0 || this.particles.length || this.shake > 0.001 || Math.abs(this.tilt.x - this.tilt.tx) + Math.abs(this.tilt.y - this.tilt.ty) > 0.002) {
      this.raf = requestAnimationFrame((tt) => this.frame(tt));
    } else this.lastT = 0;
  }
  private update(t: number, dt: number) {
    this.tilt.x += (this.tilt.tx - this.tilt.x) * Math.min(1, dt * 4);
    this.tilt.y += (this.tilt.ty - this.tilt.y) * Math.min(1, dt * 4);
    this.shake *= Math.pow(0.02, dt);
    this.placeCamera();
    // legal pawns: pulsing gold ring, glow and a gentle bob
    const pulse = 0.5 + 0.5 * Math.sin(t / 170);
    for (const p of this.pawns.values()) {
      if (!p.legal) continue;
      const rm = p.ring.material as THREE.MeshBasicMaterial;
      rm.opacity = 0.45 + pulse * 0.55;
      p.ring.scale.setScalar(1 + pulse * 0.18);
      p.glass.emissiveIntensity = 0.35 + pulse * 0.55;
      p.inner.position.y = 0.04 + pulse * 0.08;
    }
    // current player's base frame breathes
    this.baseMats.forEach((m, c) => { m.emissiveIntensity = c === this.turnCorner ? 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t / 380)) : 0.05; });
    // particles
    const now = performance.now();
    this.particles = this.particles.filter((pa) => {
      const age = (now - pa.born) / pa.life;
      if (age >= 1) { this.board.remove(pa.pts); pa.pts.geometry.dispose(); (pa.pts.material as THREE.Material).dispose(); return false; }
      const a = pa.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let k = 0; k < arr.length; k += 3) {
        pa.vel[k + 1] -= 7 * dt;
        arr[k] += pa.vel[k] * dt; arr[k + 1] = Math.max(0.05, arr[k + 1] + pa.vel[k + 1] * dt); arr[k + 2] += pa.vel[k + 2] * dt;
      }
      a.needsUpdate = true;
      (pa.pts.material as THREE.PointsMaterial).opacity = 1 - age * age;
      return true;
    });
  }
  /** render one frame now (used for the WebGL self-check) */
  renderNow() { this.renderer.render(this.scene, this.camera); }
}
