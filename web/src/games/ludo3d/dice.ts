// The crystal die. Owner rule (strict): the die only ever shows the number that was actually rolled.
//
// How that is guaranteed:
//   1. The throw is simulated with cannon-es BEFORE anything moves on screen (fixed 120 Hz steps, ~1 ms of
//      work), recording every frame. Throws that don't settle flat, or take too long, are thrown away.
//   2. While the recorded throw plays back, the die has NO pip meshes at all: all six faces are blank crystal.
//   3. Only after the die has settled, the face that is actually pointing up (read back from the final
//      orientation) gets the pips of the server's value, which light up. The server value is authoritative:
//      the client never chooses a number, it only chooses which blank face receives it.
//   4. Pips are removed before the next throw starts (the die is blank again while it waits/shakes).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

export const DIE = 0.8;                // edge length in board cells
const H = DIE / 2;
const STEP = 1 / 120;
const MAX_STEPS = 360;                 // 3 s of simulated time
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
// local face normals and two tangents for laying out pips on each face
const FACES: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],
  [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
];

export type Collider = { x: number; z: number; r: number; h: number };
export type Throw = { frames: Float32Array; count: number; flat: boolean };

/** index into FACES of the local face that points up for orientation q, and how straight it points (1 = flat) */
export function upFace(q: THREE.Quaternion): { face: number; dot: number } {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert()); // world up in die-local space
  let face = 0, dot = -2;
  FACES.forEach(([n], k) => { const d = n.dot(up); if (d > dot) { dot = d; face = k; } });
  return { face, dot };
}

/**
 * Simulates a throw into the square court centred at (cx, cz) (board-local units, half size `half`),
 * from the side facing (dirX, dirZ) (unit vector pointing from the board centre to the court).
 * Returns the recorded frames (x, y, z, qx, qy, qz, qw per step). Retries until a throw settles flat
 * within the time budget.
 */
export function simulateThrow(cx: number, cz: number, half: number, dirX: number, dirZ: number, colliders: Collider[], rnd = Math.random): Throw {
  let best: Throw | null = null;
  for (let attempt = 0; attempt < 14; attempt++) {
    const t = oneThrow(cx, cz, half, dirX, dirZ, colliders, rnd);
    if (t.flat && t.count * STEP <= 1.25) return t;
    if (t.flat && (!best || !best.flat || t.count < best.count)) best = t;
    else if (!best) best = t;
  }
  return best!;
}

function oneThrow(cx: number, cz: number, half: number, dirX: number, dirZ: number, colliders: Collider[], rnd: () => number): Throw {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -62, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.32;
  world.defaultContactMaterial.restitution = 0.34;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  // court walls (invisible, a bit taller than the enamel rim so the die can't jump out)
  const wallH = 1.4, th = 0.3;
  const walls: [number, number, number, number][] = [
    [cx + half + th, cz, th, half + th], [cx - half - th, cz, th, half + th],
    [cx, cz + half + th, half + th, th], [cx, cz - half - th, half + th, th],
  ];
  for (const [x, z, hx, hz] of walls) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, wallH / 2, hz)) });
    b.position.set(x, wallH / 2, z);
    world.addBody(b);
  }
  for (const c of colliders) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(c.r, c.r, c.h, 12) });
    b.position.set(c.x, c.h / 2, c.z);
    world.addBody(b);
  }
  const die = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(H, H, H)), linearDamping: 0.08, angularDamping: 0.12 });
  die.allowSleep = true;
  die.sleepSpeedLimit = 0.18;
  die.sleepTimeLimit = 0.12;
  // start high on the court's inner side (towards the board centre), thrown outwards into the court
  const side = (rnd() - 0.5) * half * 1.1;
  const px = -dirZ, pz = dirX; // perpendicular
  die.position.set(cx - dirX * half * 0.55 + px * side, 1.9 + rnd() * 0.5, cz - dirZ * half * 0.55 + pz * side);
  die.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
  const speed = 4.5 + rnd() * 2.5;
  const swirl = (rnd() - 0.5) * 2.4;
  die.velocity.set(dirX * speed + px * swirl, -3 - rnd() * 2, dirZ * speed + pz * swirl);
  die.angularVelocity.set((rnd() - 0.5) * 34, (rnd() - 0.5) * 22, (rnd() - 0.5) * 34);
  world.addBody(die);

  const frames = new Float32Array(MAX_STEPS * 7);
  let count = 0;
  for (; count < MAX_STEPS; count++) {
    world.step(STEP);
    const o = count * 7;
    frames[o] = die.position.x; frames[o + 1] = die.position.y; frames[o + 2] = die.position.z;
    frames[o + 3] = die.quaternion.x; frames[o + 4] = die.quaternion.y; frames[o + 5] = die.quaternion.z; frames[o + 6] = die.quaternion.w;
    if (die.sleepState === CANNON.Body.SLEEPING && count > 20) { count++; break; }
  }
  const q = new THREE.Quaternion(die.quaternion.x, die.quaternion.y, die.quaternion.z, die.quaternion.w);
  const flat = upFace(q).dot > 0.995 && Math.abs(die.position.y - H) < 0.03;
  return { frames, count, flat };
}

// ---------------------------------------------------------------- the mesh
export class Die {
  readonly root = new THREE.Group();   // position/orientation (board-local)
  readonly body: THREE.Mesh;
  private pips: THREE.Group | null = null;
  private pipMat: THREE.MeshBasicMaterial;
  private pipGlowMat: THREE.MeshBasicMaterial;
  private pipGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.024, 28);
  private pipGlowGeo = new THREE.PlaneGeometry(0.36, 0.36);
  private halo: THREE.Mesh;
  /** the value currently shown (0 = blank) — for the dice-rule self-check */
  value = 0;
  /** index into FACES of the face carrying the pips (-1 = none) */
  pipFace = -1;
  /** number of pip meshes currently attached */
  get pipCount() { return this.pips ? this.pips.children.filter((c: THREE.Object3D) => (c as THREE.Mesh).material === this.pipMat).length : 0; }

  constructor(hi: boolean, glowTex: THREE.Texture) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: hi ? 0x8cc4ff : 0x3d7dff, roughness: 0.03, metalness: hi ? 0 : 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
      ior: 1.7, emissive: 0x0d42ff, emissiveIntensity: hi ? 0.3 : 0.42, envMapIntensity: 2.8, specularIntensity: 1, iridescence: 0.45, iridescenceIOR: 1.35,
      ...(hi ? { transmission: 0.62, thickness: 1.2, dispersion: 1.5, attenuationColor: new THREE.Color(0x1f64ff), attenuationDistance: 0.9 } : { transparent: true, opacity: 0.88 }),
    });
    this.body = new THREE.Mesh(new RoundedBoxGeometry(DIE, DIE, DIE, 5, 0.13), mat);
    this.body.castShadow = true;
    // glowing heart of the crystal (blank — it carries no number)
    const core = new THREE.Mesh(new RoundedBoxGeometry(DIE * 0.5, DIE * 0.5, DIE * 0.5, 2, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5fd6ff).multiplyScalar(1.6) }));
    this.root.add(core, this.body);
    // pips are lit from within: unlit bright white-cyan discs + a soft additive glow, readable from any angle
    this.pipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeafcff).multiplyScalar(1.6), transparent: true, opacity: 0 });
    this.pipGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x2fe2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    // soft cyan glow on the board under the die (stays flat, follows x/z)
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x2fe2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.renderOrder = 2;
  }
  get haloMesh() { return this.halo; }
  get pipOpacity() { return this.pipMat.opacity; }
  set pipOpacity(v: number) { this.pipMat.opacity = v; this.pipGlowMat.opacity = v * 0.9; (this.halo.material as THREE.MeshBasicMaterial).opacity = v * 0.55; }

  /** remove every pip: all six faces blank */
  blank() {
    if (this.pips) { this.root.remove(this.pips); this.pips = null; }
    this.value = 0;
    this.pipFace = -1;
    this.pipOpacity = 0;
  }
  /** put `v` pips on the face that currently points up (and only there) */
  showOnTop(v: number) {
    this.blank();
    if (!(v >= 1 && v <= 6)) return;
    this.root.updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    this.root.getWorldQuaternion(q);
    const { face } = upFace(q);
    const [n, u, w] = FACES[face];
    const g = new THREE.Group();
    const s = DIE * 0.235;
    const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);   // cylinder axis → face normal
    const flat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);    // plane normal → face normal
    for (const [a, b] of PIP_LAYOUT[v]) {
      const big = v === 1 ? 1.6 : 1;
      const m = new THREE.Mesh(this.pipGeo, this.pipMat);
      m.position.copy(n).multiplyScalar(H + 0.004).addScaledVector(u, a * s).addScaledVector(w, b * s);
      m.quaternion.copy(along);
      m.scale.set(big, 1, big);
      const glow = new THREE.Mesh(this.pipGlowGeo, this.pipGlowMat);
      glow.position.copy(m.position).addScaledVector(n, 0.012);
      glow.quaternion.copy(flat);
      glow.scale.setScalar(big);
      glow.renderOrder = 5;
      g.add(m, glow);
    }
    this.root.add(g);
    this.pips = g;
    this.value = v;
    this.pipFace = face;
  }
  /** resting pose with face 2 (+Y) up, used when the page loads mid-game (no throw to replay) */
  rest(x: number, z: number, yaw = 0.35) {
    this.root.position.set(x, H, z);
    this.root.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
    this.halo.position.set(x, 0.02, z);
  }
  setFrame(frames: Float32Array, i: number) {
    const o = i * 7;
    this.root.position.set(frames[o], frames[o + 1], frames[o + 2]);
    this.root.quaternion.set(frames[o + 3], frames[o + 4], frames[o + 5], frames[o + 6]);
    this.halo.position.set(frames[o], 0.02, frames[o + 2]);
  }
  /** interpolated frame (t in steps, fractional) */
  setFrameLerp(frames: Float32Array, t: number, count: number) {
    const i = Math.min(count - 1, Math.floor(t)), j = Math.min(count - 1, i + 1), f = Math.min(1, t - i);
    const a = i * 7, b = j * 7;
    this.root.position.set(
      frames[a] + (frames[b] - frames[a]) * f, frames[a + 1] + (frames[b + 1] - frames[a + 1]) * f, frames[a + 2] + (frames[b + 2] - frames[a + 2]) * f);
    const qa = new THREE.Quaternion(frames[a + 3], frames[a + 4], frames[a + 5], frames[a + 6]);
    const qb = new THREE.Quaternion(frames[b + 3], frames[b + 4], frames[b + 5], frames[b + 6]);
    this.root.quaternion.copy(qa.slerp(qb, f));
    this.halo.position.set(this.root.position.x, 0.02, this.root.position.z);
  }
}
export const STEP_S = STEP;
