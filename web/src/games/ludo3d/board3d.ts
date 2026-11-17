// «لودو» 3D board: drives LudoScene from the room state and plays the server events
// (roll → crystal die thrown with physics, move → pawn hops square by square, capture → knock-back,
// home → sparkle). Loaded on demand (dynamic import from ../ludo.ts), so three/cannon/gsap never ship
// with the other pages.
import * as THREE from 'three';
import gsap from 'gsap';
import { esc } from '../../lib/client';
import type { Board, Ctx, Room } from '../types';
import { LudoScene, toWorld, COLORS, COLORS_CSS, type Pawn } from './scene';
import { simulateThrow, upFace, STEP_S, DIE, type Collider } from './dice';
import { cellPos, CORNER_NAMES, HOME, BASE_ORIGIN } from './geom';
import * as sfx from './sfx';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DIE_ICON = '<svg class="mg-l3-dice-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.2" cy="8.2" r="1.6" fill="currentColor"/><circle cx="15.8" cy="8.2" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="8.2" cy="15.8" r="1.6" fill="currentColor"/><circle cx="15.8" cy="15.8" r="1.6" fill="currentColor"/></svg>';
const H = DIE / 2;
// Animations run on real time even when frames are throttled (background-ish pane, slow phone):
// the board must keep pace with the server instead of crawling behind it.
gsap.ticker.lagSmoothing(0);

export function createLudo3D(el: HTMLElement, under: HTMLElement, ctx: Ctx, onFail: () => void): Board {
  el.innerHTML = `<div class="mg-l3"><div class="mg-l3-stage"></div><div class="mg-l3-labels"></div></div>`;
  under.innerHTML = `<div class="mg-l3-ctrl"><div class="mg-l3-toast" role="status" aria-live="polite"></div>
    <div class="mg-l3-info"><span class="mg-l3-dot"></span><div class="mg-l3-txt"><b class="mg-l3-who"></b><small class="mg-l3-note"></small></div></div>
    <button type="button" class="btn btn-gold mg-l3-roll" disabled>${DIE_ICON}<span>ارمي النرد</span></button>
  </div>`;
  const stage = el.querySelector<HTMLElement>('.mg-l3-stage')!;
  const labelsEl = el.querySelector<HTMLElement>('.mg-l3-labels')!;
  const toastEl = under.querySelector<HTMLElement>('.mg-l3-toast')!;
  const rollBtn = under.querySelector<HTMLButtonElement>('.mg-l3-roll')!;
  const who = under.querySelector<HTMLElement>('.mg-l3-who')!;
  const note = under.querySelector<HTMLElement>('.mg-l3-note')!;
  const dot = under.querySelector<HTMLElement>('.mg-l3-dot')!;
  const ctrl = under.querySelector<HTMLElement>('.mg-l3-ctrl')!;

  const S = new LudoScene(stage);           // throws if WebGL is unusable → caller falls back to 2D
  const die = S.die;
  // test hook (dev server or ?ludodebug): lets a page-side monitor verify the dice rule frame by frame
  const dbg = { S, die, upFace, lastRoll: 0, moving: false, rolls: [] as number[] };
  if (import.meta.env.DEV || /[?&]ludodebug(?:[=&]|$)/.test(location.search)) (window as any).__ludo3d = dbg;
  sfx.routeRoomSounds();
  sfx.preload();

  let room: Room | null = null;
  let seatsKey = '';
  let busy = false;           // playing events: nothing clickable
  let sending = false;
  let oriented = -2;
  let dieCorner = -1;         // court the die currently sits in
  let readyTween: gsap.core.Tween | null = null;
  let introDone = false;
  const labels = new Map<number, HTMLElement>(); // corner → label

  const mySeat = (r: Room) => (r.me ? r.state.seats.indexOf(r.me) : -1);
  const canRoll = (r: Room) => r.status === 'playing' && !!r.turn && r.turn.pid === r.me && r.state.phase === 'roll';
  const canMove = (r: Room) => r.status === 'playing' && !!r.turn && r.turn.pid === r.me && r.state.phase === 'move';
  const courtCentre = (corner: number) => { const [ox, oy] = BASE_ORIGIN[corner]; return toWorld(ox + 3, oy + 3); };

  // ---------------------------------------------------------------- WebGL loss → 2D
  let dead = false;
  S.renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (dead) return;
    dead = true;
    console.warn('[ludo3d] WebGL context lost — switching to 2D');
    ro.disconnect(); stopReady(); S.onFrame = null;
    onFail();
  });

  // ---------------------------------------------------------------- sizing
  const ro: ResizeObserver = new ResizeObserver(() => { if (!dead) { S.resize(); placeLabels(); } });
  ro.observe(stage);
  S.resize();
  S.onFrame = placeLabels;

  // ---------------------------------------------------------------- input
  let down: { x: number; y: number; t: number } | null = null;
  const cv = S.renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down) return;
    const ok = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 14 && performance.now() - down.t < 900;
    down = null;
    if (ok) tap(e.clientX, e.clientY);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const rc = cv.getBoundingClientRect();
    S.setTilt(((e.clientX - rc.left) / rc.width) * 2 - 1, ((e.clientY - rc.top) / rc.height) * 2 - 1);
    if (!room || busy) { cv.style.cursor = ''; return; }
    const hot = (canMove(room) && !!S.pick(e.clientX, e.clientY, (p) => p.legal)) || (canRoll(room) && S.hitsDie(e.clientX, e.clientY));
    cv.style.cursor = hot ? 'pointer' : '';
  });
  cv.addEventListener('pointerleave', () => S.setTilt(0, 0));
  rollBtn.addEventListener('click', () => roll());
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (dead || !room || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
    if ((e.key === ' ' || e.key === 'Enter') && canRoll(room) && t === document.body) { e.preventDefault(); roll(); }
    else if (/^[1-4]$/.test(e.key) && canMove(room)) move(Number(e.key) - 1);
  });

  function tap(x: number, y: number) {
    if (!room || busy || sending) return;
    if (canMove(room)) { const p = S.pick(x, y, (pp) => pp.legal); if (p) move(p.i); return; }
    if (canRoll(room) && S.hitsDie(x, y)) roll();
  }
  async function roll() {
    if (!room || sending || busy || !canRoll(room)) return;
    sending = true;
    rollBtn.disabled = true;
    stopReady();
    die.blank();                         // blank before anything moves
    sfx.preload();
    // a little "pick up" hop while the server answers
    if (die.root.visible) { S.kick(400); gsap.to(die.root.position, { y: H + 0.5, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' }); }
    const ok = await ctx.act('roll');
    sending = false;
    if (!ok && room) paintCtrl(room);
  }
  async function move(i: number) {
    if (!room || sending || busy || !canMove(room)) return;
    const seat = mySeat(room);
    if (!room.state.legal.includes(i) || seat < 0) return;
    sending = true;
    for (const p of S.pawns.values()) S.setLegal(p, false);
    const ok = await ctx.act('move', { piece: i });
    sending = false;
    if (!ok && room) refreshLegal(room);
  }

  // ---------------------------------------------------------------- pawns
  function buildPawns(r: Room) {
    const key = r.state.seats.join(',') + '|' + r.state.corners.join(',');
    if (key === seatsKey) return false;
    seatsKey = key;
    S.clearPawns();
    r.state.seats.forEach((_: string, seat: number) => { for (let i = 0; i < 4; i++) S.addPawn(seat, i, r.state.corners[seat]); });
    return true;
  }
  /** final spot of every pawn (stacked pawns fan out a little and shrink) */
  function targets(r: Room) {
    const s = r.state;
    const groups = new Map<string, string[]>();
    const out = new Map<string, { x: number; z: number; sc: number }>();
    s.seats.forEach((_: string, seat: number) => s.tokens[seat].forEach((p: number, i: number) => {
      const [x, y] = cellPos(s.corners[seat], p, i);
      const k = p < 0 || p === HOME ? `${seat}-${i}-solo` : `${x.toFixed(2)},${y.toFixed(2)}`;
      groups.set(k, [...(groups.get(k) || []), `${seat}-${i}`]);
    }));
    for (const ids of groups.values()) ids.forEach((id, n) => {
      const [seat, i] = id.split('-').map(Number);
      const prog = s.tokens[seat][i];
      let [x, y] = cellPos(s.corners[seat], prog, i);
      let sc = prog === HOME ? 0.62 : 1;
      if (ids.length > 1) { const off = [[-0.16, -0.16], [0.16, 0.16], [0.16, -0.16], [-0.16, 0.16]][n % 4]; x += off[0]; y += off[1]; sc = 0.8; }
      const w = toWorld(x, y);
      out.set(id, { x: w.x, z: w.z, sc });
    });
    return out;
  }
  function layout(r: Room, instant: boolean) {
    const t = targets(r);
    for (const [id, p] of S.pawns) {
      const g = t.get(id);
      if (!g) continue;
      const moved = Math.hypot(p.group.position.x - g.x, p.group.position.z - g.z) > 0.01 || Math.abs(p.inner.scale.x - g.sc) > 0.01;
      if (instant || !moved) { if (moved || instant) { gsap.killTweensOf(p.group.position); p.group.position.set(g.x, 0, g.z); p.inner.scale.setScalar(g.sc); } }
      else { gsap.to(p.group.position, { x: g.x, z: g.z, duration: 0.28, ease: 'power2.out' }); gsap.to(p.inner.scale, { x: g.sc, y: g.sc, z: g.sc, duration: 0.28 }); S.kick(330); }
      S.setGone(p, !!r.state.left[p.seat]);
    }
    S.kick(80);
  }
  function refreshLegal(r: Room) {
    const me = mySeat(r);
    const on = canMove(r) && !busy;
    for (const p of S.pawns.values()) S.setLegal(p, on && p.seat === me && r.state.legal.includes(p.i));
  }

  // ---------------------------------------------------------------- animations
  function hop(seat: number, i: number, from: number, to: number, corner: number) {
    const p = S.pawns.get(seat + '-' + i);
    if (!p) return Promise.resolve();
    gsap.killTweensOf(p.group.position);
    const steps = from < 0 ? [0] : Array.from({ length: to - from }, (_, k) => from + 1 + k);
    const tl = gsap.timeline();
    let t = 0;
    steps.forEach((prog, n) => {
      const [x, y] = cellPos(corner, prog, i);
      const w = toWorld(x, y);
      const out = from < 0;
      const dur = out ? 0.42 : 0.15;
      const hgt = out ? 1.3 : prog === HOME ? 0.9 : 0.5;
      tl.to(p.group.position, { x: w.x, z: w.z, duration: dur, ease: 'none' }, t);
      tl.to(p.inner.position, { y: hgt, duration: dur / 2, ease: 'power2.out' }, t);
      tl.to(p.inner.position, { y: 0, duration: dur / 2, ease: 'power2.in' }, t + dur / 2);
      const sc = prog === HOME ? 0.62 : 1;
      tl.to(p.inner.scale, { x: sc * 1.14, y: sc * 0.82, z: sc * 1.14, duration: 0.05, ease: 'power1.out' }, t + dur);
      tl.to(p.inner.scale, { x: sc, y: sc, z: sc, duration: 0.07, ease: 'power1.out' }, t + dur + 0.05);
      tl.call(() => sfx.play(n % 2 ? 'hop2' : 'hop1', { rate: 0.94 + Math.random() * 0.14 }), [], t + dur);
      t += dur + 0.012;
    });
    S.kick(tl.duration() * 1000 + 120);
    return new Promise<void>((res) => tl.eventCallback('onComplete', () => res()));
  }
  async function knockBack(seat: number, i: number, corner: number) {
    const p = S.pawns.get(seat + '-' + i);
    if (!p) return;
    const at = new THREE.Vector3(p.group.position.x, 0.5, p.group.position.z);
    S.burst(at, COLORS[corner], 42, 3.6, 0.9);
    S.burst(at, 0xffffff, 16, 2.4, 0.6);
    S.shakeCamera(0.22);
    sfx.play('capture');
    const [x, y] = cellPos(corner, -1, i);
    const w = toWorld(x, y);
    const tl = gsap.timeline();
    tl.to(p.group.position, { x: w.x, z: w.z, duration: 0.62, ease: 'power1.inOut' }, 0.05);
    tl.to(p.inner.position, { y: 2.4, duration: 0.3, ease: 'power2.out' }, 0.05);
    tl.to(p.inner.position, { y: 0, duration: 0.32, ease: 'bounce.out' }, 0.35);
    tl.fromTo(p.inner.rotation, { x: 0, z: 0 }, { x: Math.PI * 2, z: Math.PI * 0.5, duration: 0.6, ease: 'power1.out' }, 0.05);
    tl.set(p.inner.rotation, { x: 0, z: 0 });
    S.kick(tl.duration() * 1000 + 150);
    await new Promise<void>((res) => tl.eventCallback('onComplete', () => res()));
  }
  function sparkleHome(corner: number) {
    sfx.play('home');
    S.burst(new THREE.Vector3(0, 0.6, 0), COLORS[corner], 46, 3.4, 1.1);
    S.burst(new THREE.Vector3(0, 0.6, 0), 0xffd36a, 30, 2.6, 1.2);
  }

  // ---------------------------------------------------------------- the die
  function stopReady() {
    if (readyTween) { readyTween.kill(); readyTween = null; S.release(); }
  }
  function startReady() {
    if (readyTween || !die.root.visible) return;
    S.hold();
    readyTween = gsap.to(die.root.position, { y: H + 0.16, duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: gsap.isTweening(die.root.position) ? 0.75 : 0 });
  }
  /** park the (blank) die in a court, gliding there if it is somewhere else */
  function parkDie(corner: number, instant: boolean) {
    if (corner < 0) return;
    const c = courtCentre(corner);
    if (!die.root.visible || instant) {
      die.rest(c.x, c.z, 0.4 + corner * 0.5);
      die.root.visible = true; dieCorner = corner; S.kick(60); return;
    }
    if (dieCorner === corner) return;
    dieCorner = corner;
    stopReady();
    const p = die.root.position;
    const q0 = die.root.quaternion.clone(), spin = { a: 0 }, UP = new THREE.Vector3(0, 1, 0);
    const tl = gsap.timeline();
    // the old number fades out and is removed BEFORE the die moves (it never travels showing a number)
    tl.to(die, { pipOpacity: 0, duration: 0.12 }, 0);
    tl.call(() => die.blank(), [], 0.12);
    tl.to(p, { x: c.x, z: c.z, duration: 0.55, ease: 'power2.inOut' }, 0.13);
    tl.to(p, { y: H + 1.1, duration: 0.27, ease: 'power2.out' }, 0.13);
    tl.to(p, { y: H, duration: 0.28, ease: 'power2.in' }, 0.4);
    // spin around the world up axis only, so whatever face is up stays up
    tl.to(spin, { a: Math.PI, duration: 0.55, onUpdate: () => { die.root.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(UP, spin.a).multiply(q0)); } }, 0.13);
    tl.eventCallback('onUpdate', () => die.haloMesh.position.set(p.x, 0.02, p.z));
    S.kick(800);
  }
  async function throwDie(seat: number, v: number) {
    const s = room ? room.state : null;
    const corner = s ? s.corners[seat] : seat;
    stopReady();
    gsap.killTweensOf(die.root.position);
    gsap.killTweensOf(die.root.rotation);
    gsap.killTweensOf(die);
    die.blank();                                   // RULE: no pips while it moves
    dbg.lastRoll = v; dbg.moving = true; dbg.rolls.push(v);
    const c = courtCentre(corner);
    const dir = new THREE.Vector3(c.x, 0, c.z).normalize();
    // pawns waiting in this court are obstacles; empty spots only have the low chrome ring
    const colliders: Collider[] = [0, 1, 2, 3].map((i) => {
      const [x, y] = cellPos(corner, -1, i);
      const w = toWorld(x, y);
      const occupied = !!s && s.seats.some((_: string, k: number) => s.corners[k] === corner && s.tokens[k][i] < 0);
      return { x: w.x, z: w.z, r: occupied ? 0.37 : 0.44, h: occupied ? 0.9 : 0.1 };
    });
    const th = simulateThrow(c.x, c.z, 2.1, dir.x, dir.z, colliders);
    dieCorner = corner;
    sfx.play(Math.random() < 0.5 ? 'roll1' : 'roll2', { rate: 0.95 + Math.random() * 0.1 });
    // swoop from wherever it is to the first frame of the throw
    const q0 = new THREE.Quaternion(th.frames[3], th.frames[4], th.frames[5], th.frames[6]);
    const start = new THREE.Vector3(th.frames[0], th.frames[1], th.frames[2]);
    S.hold();
    if (!die.root.visible) { die.root.visible = true; die.root.position.copy(start).add(new THREE.Vector3(0, 2, 0)); }
    const from = die.root.position.clone(), qf = die.root.quaternion.clone();
    await new Promise<void>((res) => gsap.to({ k: 0 }, {
      k: 1, duration: 0.16, ease: 'power1.in', onComplete: res,
      onUpdate() { const k = (this as any).targets()[0].k; die.root.position.lerpVectors(from, start, k); die.root.quaternion.slerpQuaternions(qf, q0, k); die.haloMesh.position.set(die.root.position.x, 0.02, die.root.position.z); },
    }));
    const last = th.count - 1;
    const speed = Math.max(1, (last * STEP_S) / 1.25);
    await new Promise<void>((res) => gsap.to({ t: 0 }, {
      t: last, duration: (last * STEP_S) / speed, ease: 'none', onComplete: res,
      onUpdate() { die.setFrameLerp(th.frames, (this as any).targets()[0].t, th.count); },
    }));
    die.setFrame(th.frames, last);
    if (!th.flat) {                                 // never happened in testing; settle it flat to be safe
      const e = new THREE.Euler().setFromQuaternion(die.root.quaternion);
      const snap = (a: number) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
      die.root.quaternion.setFromEuler(new THREE.Euler(snap(e.x), e.y, snap(e.z)));
      die.root.position.y = H;
    }
    // it may have stopped next to a pawn: hop (pure translation, the up face stays up) to the court centre,
    // the one spot in a court that never hides a waiting pawn from the camera
    const p = die.root.position;
    if (Math.hypot(p.x - c.x, p.z - c.z) > 0.05) {
      const tl = gsap.timeline();
      tl.to(p, { x: c.x, z: c.z, duration: 0.3, ease: 'power2.inOut' }, 0);
      tl.to(p, { y: H + 0.32, duration: 0.15, ease: 'power2.out' }, 0);
      tl.to(p, { y: H, duration: 0.15, ease: 'power2.in' }, 0.15);
      tl.eventCallback('onUpdate', () => die.haloMesh.position.set(p.x, 0.02, p.z));
      await new Promise<void>((res) => tl.eventCallback('onComplete', () => res()));
    }
    S.release();
    dbg.moving = false;
    // settled: only now the rolled number appears, on the face that points up
    die.showOnTop(v);
    sfx.play('reveal');
    gsap.to(die, { pipOpacity: 1, duration: 0.22, ease: 'power1.out' });
    S.burst(new THREE.Vector3(die.root.position.x, 0.75, die.root.position.z), 0x2fe2ff, 18, 1.6, 0.6);
    S.kick(400);
    await wait(330);
  }

  // ---------------------------------------------------------------- labels, controls, messages
  function placeLabels() {
    if (!room) return;
    for (const [corner, elx] of labels) {
      const c = S.local(courtCentre(corner));
      c.z += 2.5; c.y = 0.15;
      const s = S.project(c);
      elx.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
  function paintLabels(r: Room) {
    const s = r.state;
    const used = new Set<number>();
    s.seats.forEach((pid: string, seat: number) => {
      const corner = s.corners[seat];
      used.add(corner);
      let elx = labels.get(corner);
      if (!elx) { elx = document.createElement('div'); elx.className = 'mg-l3-label'; labelsEl.appendChild(elx); labels.set(corner, elx); }
      const p = ctx.player(pid);
      const name = p ? [...p.name].slice(0, 12).join('') : '';
      const html = `<i style="--c:${COLORS_CSS[corner]}"></i><span>${esc(name)}</span>${pid === r.me ? '<em>إنت</em>' : ''}`;
      if (elx.dataset.html !== html) { elx.innerHTML = html; elx.dataset.html = html; }
      elx.classList.toggle('turn', r.status === 'playing' && s.turn === seat);
      elx.classList.toggle('gone', !!s.left[seat]);
      elx.style.setProperty('--c', COLORS_CSS[corner]);
    });
    for (const [c, elx] of labels) if (!used.has(c)) { elx.remove(); labels.delete(c); }
    placeLabels();
  }
  function paintCtrl(r: Room) {
    const s = r.state;
    const tp = r.turn ? ctx.player(r.turn.pid) : undefined;
    const mine = !!r.turn && r.turn.pid === r.me;
    const corner = s.corners[s.turn];
    dot.style.setProperty('--c', COLORS_CSS[corner] || '#2fe2ff');
    ctrl.style.setProperty('--c', COLORS_CSS[corner] || '#2fe2ff');
    rollBtn.disabled = busy || sending || !canRoll(r);
    rollBtn.hidden = !(r.status === 'playing' && mine && s.phase === 'roll'); // only when it is my roll
    ctrl.hidden = r.status !== 'playing';
    rollBtn.classList.toggle('ready', !rollBtn.disabled);
    if (r.status !== 'playing') { who.textContent = ''; note.textContent = ''; return; }
    who.innerHTML = mine ? 'دورك' : `دور ${esc(tp ? tp.name : '')} <small>(${CORNER_NAMES[corner]})</small>`;
    if (!note.dataset.keep) note.textContent = mine ? (s.phase === 'roll' ? 'اضغط الزر أو النرد عاللوح' : `طلعلك ${s.dice} — اختار قطعة من اللي عم تلمع`) : mySeat(r) >= 0 ? 'استنّى دورك' : '';
  }
  let toastTimer = 0;
  function flash(text: string) {
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.classList.remove('on'); }, 1800);
  }

  // ---------------------------------------------------------------- render
  return {
    hint: (r) => (r.state.phase === 'roll' ? 'اضغط النرد لترمي' : 'اختار قطعة لتحركها'),
    async render(r, animate) {
      if (dead) return;
      const fresh = buildPawns(r);
      if (fresh) animate = false;
      if (document.hidden) animate = false;
      const me = mySeat(r);
      const viewCorner = me >= 0 ? r.state.corners[me] : r.state.corners[0];
      if (viewCorner !== oriented) { S.orient(viewCorner); oriented = viewCorner; }
      room = r;
      paintLabels(r);
      if (animate && r.ev.length) {
        busy = true;
        for (const p of S.pawns.values()) S.setLegal(p, false);
        stopReady();
        rollBtn.disabled = true;
        try {
          for (const e of r.ev) {
            const pl = ctx.player(e.pid);
            const corner = e.seat != null ? r.state.corners[e.seat] : 0;
            if (e.t === 'roll') await throwDie(e.seat!, e.v);
            else if (e.t === 'move') await hop(e.seat!, e.token, e.from, e.to, corner);
            else if (e.t === 'capture') { flash(`${pl ? pl.name : ''} رجعت قطعته عالبيت`); await knockBack(e.seat!, e.token, corner); }
            else if (e.t === 'home') sparkleHome(corner);
            else if (e.t === 'forfeit') flash('تلات 6 ورا بعض — راح الدور');
            else if (e.t === 'pass') flash(e.pid === r.me ? 'ما في حركة بهالرقم' : `${pl ? pl.name : ''}: ما في حركة`);
            else if (e.t === 'finish') flash(`${pl ? pl.name : ''} وصّل كل قطعه!`);
          }
        } catch (err) { console.error(err); } finally { busy = false; }
      } else if (r.state.dice && die.value !== r.state.dice) {
        // page (re)load mid-turn, or a skipped animation: show the rolled value resting in the roller's court
        const c = courtCentre(r.state.corners[r.state.turn]);
        die.rest(c.x, c.z, 0.4);
        die.root.visible = true; dieCorner = r.state.corners[r.state.turn];
        dbg.lastRoll = r.state.dice; dbg.moving = false;
        die.showOnTop(r.state.dice); die.pipOpacity = 1;
      }
      layout(r, !animate);
      if (fresh && !introDone) {
        introDone = true;
        S.startIntro();
        let k = 0;
        for (const p of S.pawns.values()) { gsap.from(p.inner.position, { y: 3.5, duration: 0.7, delay: 0.25 + (k++) * 0.035, ease: 'bounce.out' }); }
        S.kick(2200);
      }
      // the die waits in the court of the player whose turn it is
      if (r.status === 'playing' && r.state.phase === 'roll') {
        const tc = r.state.corners[r.state.turn];
        if (tc !== dieCorner || !die.root.visible) parkDie(tc, !die.root.visible);
      }
      S.setTurnCorner(r.status === 'playing' ? r.state.corners[r.state.turn] : -1);
      S.setActiveCorners(r.state.corners.filter((_: number, k: number) => !r.state.left[k]));
      refreshLegal(r);
      paintCtrl(r);
      if (canRoll(r) && !busy) startReady(); else stopReady();
    },
  };
}
