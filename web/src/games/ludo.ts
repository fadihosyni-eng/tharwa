// «لودو» board. createLudo() shows the 3D board (Three.js, loaded on demand from ./ludo3d) when WebGL works,
// and falls back to createLudo2D() (SVG board + CSS die) otherwise, or if the 3D board fails / loses its context.
// Geometry (shared with the 3D board) lives in ./ludo3d/geom and must match games/ludo.js.
import { esc } from '../lib/client';
import type { Board, Ctx, Room } from './types';
import { START, STARS, CORNER_NAMES, BASE_ORIGIN, TRACK, HOME_COL, ARROW_ROT, cellPos, type Cell } from './ludo3d/geom';

const C = 40;                         // cell size in SVG units (board = 600)
const CORNER_COLORS = ['#f0585e', '#38c172', '#ffc53d', '#4f9df7'];
const center = ([x, y]: Cell): [number, number] => [(x + 0.5) * C, (y + 0.5) * C];
function posOf(corner: number, prog: number, i: number): [number, number] {
  const [x, y] = cellPos(corner, prog, i);
  return [x * C, y * C];
}
const starSVG = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${pts}" class="star"/>`;
};

function boardSVG() {
  const out: string[] = [];
  out.push('<defs>');
  CORNER_COLORS.forEach((c, k) => {
    out.push(`<radialGradient id="lt${k}" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".28" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="1"/></radialGradient>`);
    out.push(`<linearGradient id="lb${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity=".62"/></linearGradient>`);
  });
  out.push('<filter id="ltShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#000" flood-opacity=".55"/></filter>');
  out.push('</defs>');
  out.push(`<rect x="2" y="2" width="${15 * C - 4}" height="${15 * C - 4}" rx="22" class="bg"/>`);
  // bases
  BASE_ORIGIN.forEach(([ox, oy], k) => {
    out.push(`<g class="base" data-corner="${k}">
      <rect x="${ox * C + 6}" y="${oy * C + 6}" width="${6 * C - 12}" height="${6 * C - 12}" rx="20" fill="url(#lb${k})" class="base-out"/>
      <rect x="${(ox + 0.85) * C}" y="${(oy + 0.85) * C}" width="${4.3 * C}" height="${4.3 * C}" rx="16" class="base-in"/>
      ${[0, 1, 2, 3].map((i) => { const [x, y] = posOf(k, -1, i); return `<circle cx="${x}" cy="${y}" r="${C * 0.5}" class="spot" stroke="${CORNER_COLORS[k]}"/>`; }).join('')}
      <text x="${(ox + 3) * C}" y="${(oy + 5.55) * C}" class="base-name" data-name="${k}"></text>
    </g>`);
  });
  // track squares
  TRACK.forEach((cell, idx) => {
    const [x, y] = cell;
    const startOf = START.indexOf(idx);
    const fill = startOf >= 0 ? `style="fill:${CORNER_COLORS[startOf]}"` : '';
    out.push(`<rect x="${x * C + 1.5}" y="${y * C + 1.5}" width="${C - 3}" height="${C - 3}" rx="7" class="sq${startOf >= 0 ? ' start' : ''}" ${fill}/>`);
    if (STARS.includes(idx)) { const [cx, cy] = center(cell); out.push(starSVG(cx, cy, C * 0.33)); }
    if (startOf >= 0) {
      const [cx, cy] = center(cell);
      out.push(`<path d="M-8 -7 L6 0 L-8 7 Z" class="arrow" transform="translate(${cx} ${cy}) rotate(${ARROW_ROT[startOf]})"/>`);
    }
  });
  // home columns
  HOME_COL.forEach((list, k) => list.forEach(([x, y]) => out.push(`<rect x="${x * C + 1.5}" y="${y * C + 1.5}" width="${C - 3}" height="${C - 3}" rx="7" class="sq home" style="fill:${CORNER_COLORS[k]}"/>`)));
  // centre triangles
  const m = 7.5 * C, a = 6 * C, b = 9 * C;
  const tri = [[[a, a], [a, b]], [[a, a], [b, a]], [[b, a], [b, b]], [[a, b], [b, b]]];
  tri.forEach(([p, q], k) => out.push(`<polygon points="${p[0]},${p[1]} ${q[0]},${q[1]} ${m},${m}" fill="${CORNER_COLORS[k]}" class="tri"/>`));
  out.push(`<circle cx="${m}" cy="${m}" r="${C * 0.42}" class="hub"/>`);
  return out.join('');
}
const tokenSVG = (corner: number) => `
  <circle r="19" class="hit"/>
  <circle r="17" class="ring"/>
  <g filter="url(#ltShadow)"><circle r="13.5" fill="url(#lt${corner})" class="body"/></g>
  <circle r="6" class="cap" fill="${CORNER_COLORS[corner]}"/>`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// The die only ever shows the number actually rolled: the pips are on the front face only, the other five
// faces are blank, and it tumbles in whole turns so it always lands facing front (like «ثروة»'s dice).
// Before the first roll every face is blank.
const pipsHTML = (v: number) => Array.from({ length: 9 }, (_, k) => `<span class="${(PIPS[v] || []).includes(k) ? 'on' : ''}"></span>`).join('');
const dieHTML = () => `<div class="mg-die"><div class="tilt"><div class="cube">${['front', 'back', 'right', 'left', 'top', 'bottom'].map((p) => `<div class="face ${p}">${pipsHTML(0)}</div>`).join('')}</div></div></div>`;

export function createLudo2D(el: HTMLElement, under: HTMLElement, ctx: Ctx): Board {
  el.innerHTML = `<div class="mg-ludo"><svg viewBox="0 0 ${15 * C} ${15 * C}" class="mg-ludo-svg" role="img" aria-label="لوح لودو">${boardSVG()}<g class="tokens"></g></svg></div>`;
  under.innerHTML = `<div class="mg-ludo-ctrl">
    <button type="button" class="mg-dice-btn" aria-label="ارمي النرد" disabled>${dieHTML()}</button>
    <div class="mg-ludo-msg"><b class="mg-ludo-who"></b><span class="mg-ludo-note"></span></div>
    <button type="button" class="btn btn-gold mg-roll" disabled>ارمي النرد</button>
  </div>`;
  const svg = el.querySelector('svg')!;
  const layer = svg.querySelector<SVGGElement>('.tokens')!;
  const diceBtn = under.querySelector<HTMLButtonElement>('.mg-dice-btn')!;
  const rollBtn = under.querySelector<HTMLButtonElement>('.mg-roll')!;
  const who = under.querySelector<HTMLElement>('.mg-ludo-who')!;
  const note = under.querySelector<HTMLElement>('.mg-ludo-note')!;
  const tokens = new Map<string, SVGGElement>(); // "seat-i" -> <g>
  let seatsKey = '';
  let room: Room | null = null;
  let sending = false;
  let busyAnim = false;

  const canRoll = (r: Room) => r.status === 'playing' && !!r.turn && r.turn.pid === r.me && r.state.phase === 'roll';
  const canMove = (r: Room) => r.status === 'playing' && !!r.turn && r.turn.pid === r.me && r.state.phase === 'move';
  let spins = 0, shown = 0;
  const cube = diceBtn.querySelector<HTMLElement>('.cube')!;
  function setDie(v: number, animate: boolean) {
    if (v !== shown) {
      const front = cube.querySelector<HTMLElement>('.face.front')!;
      front.innerHTML = pipsHTML(v);
      front.classList.toggle('one', v === 1);
      shown = v;
    }
    if (!animate) return;
    // whole turns only: it tumbles (blank sides showing mid-spin) and lands on the front face
    spins++;
    cube.style.transition = 'transform .95s cubic-bezier(.2,.9,.25,1)';
    cube.style.transform = `rotateX(${spins * 720}deg) rotateY(${spins * 360}deg)`;
    diceBtn.classList.remove('bounce'); void diceBtn.offsetWidth; diceBtn.classList.add('bounce');
  }

  async function roll() {
    if (!room || sending || busyAnim || !canRoll(room)) return;
    sending = true;
    diceBtn.disabled = true; rollBtn.disabled = true;
    await ctx.act('roll');
    sending = false;
  }
  diceBtn.addEventListener('click', roll);
  rollBtn.addEventListener('click', roll);
  layer.addEventListener('click', async (e) => {
    const g = (e.target as Element).closest<SVGGElement>('.mg-lt');
    if (!g || !room || sending || busyAnim || !canMove(room)) return;
    const seat = Number(g.dataset.seat), i = Number(g.dataset.i);
    const mySeat = room.state.seats.indexOf(room.me);
    let pick = i;
    if (seat !== mySeat || !room.state.legal.includes(i)) {
      // clicked a stack: take one of my legal tokens on the same spot
      const [x, y] = posOf(room.state.corners[seat], room.state.tokens[seat][i], i);
      pick = room.state.legal.find((j: number) => { const [a, b] = posOf(room!.state.corners[mySeat], room!.state.tokens[mySeat][j], j); return Math.hypot(a - x, b - y) < 12; }) ?? -1;
      if (pick < 0) return;
    }
    sending = true;
    await ctx.act('move', { piece: pick });
    sending = false;
  });

  function buildTokens(r: Room) {
    const key = r.state.seats.join(',');
    if (key === seatsKey) return;
    seatsKey = key;
    layer.innerHTML = '';
    tokens.clear();
    r.state.seats.forEach((_: string, seat: number) => {
      const corner = r.state.corners[seat];
      for (let i = 0; i < 4; i++) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'mg-lt');
        g.dataset.seat = String(seat); g.dataset.i = String(i);
        g.innerHTML = tokenSVG(corner);
        layer.appendChild(g);
        tokens.set(seat + '-' + i, g);
      }
    });
  }
  const place = (g: SVGGElement, x: number, y: number, s = 1) => { g.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
  // Final positions for every token, spreading tokens that share a square.
  function layout(r: Room, instant: boolean) {
    const s = r.state;
    const groups = new Map<string, string[]>();
    s.seats.forEach((_: string, seat: number) => s.tokens[seat].forEach((p: number, i: number) => {
      const [x, y] = posOf(s.corners[seat], p, i);
      const k = p < 0 || p === 56 ? `${seat}-${i}-solo` : `${Math.round(x)},${Math.round(y)}`;
      groups.set(k, [...(groups.get(k) || []), `${seat}-${i}`]);
    }));
    const mySeat = r.me ? s.seats.indexOf(r.me) : -1;
    for (const ids of groups.values()) {
      ids.forEach((id, n) => {
        const g = tokens.get(id)!;
        const [seat, i] = id.split('-').map(Number);
        let [x, y] = posOf(s.corners[seat], s.tokens[seat][i], i);
        let sc = s.tokens[seat][i] === 56 ? 0.62 : 1;
        if (ids.length > 1) {
          const off = [[-6, -6], [6, 6], [6, -6], [-6, 6]][n % 4];
          x += off[0]; y += off[1]; sc = 0.78;
        }
        if (instant) g.style.transition = 'none';
        place(g, x, y, sc);
        if (instant) { void g.getBoundingClientRect(); g.style.transition = ''; }
        const legal = canMove(r) && seat === mySeat && s.legal.includes(i);
        g.classList.toggle('legal', legal);
        g.classList.toggle('gone', !!s.left[seat]);
        g.classList.toggle('mine', seat === mySeat);
        if (legal) layer.appendChild(g); // legal tokens on top so they can be clicked
      });
    }
  }
  async function walk(r: Room, seat: number, i: number, from: number, to: number) {
    const g = tokens.get(seat + '-' + i);
    if (!g) return;
    const corner = r.state.corners[seat];
    layer.appendChild(g);
    g.classList.add('walking');
    const steps = from < 0 ? [0] : Array.from({ length: to - from }, (_, k) => from + 1 + k);
    for (const p of steps) {
      const [x, y] = posOf(corner, p, i);
      place(g, x, y, p === 56 ? 0.62 : 1.12);
      await wait(140);
    }
    g.classList.remove('walking');
  }
  function paintNames(r: Room) {
    svg.querySelectorAll<SVGTextElement>('.base-name').forEach((t) => {
      const corner = Number(t.dataset.name);
      const seat = r.state.corners.indexOf(corner);
      const p = seat >= 0 ? ctx.player(r.state.seats[seat]) : undefined;
      t.textContent = p ? [...p.name].slice(0, 12).join('') : '';
    });
    svg.querySelectorAll<SVGGElement>('.base').forEach((b) => {
      const corner = Number(b.dataset.corner);
      const seat = r.state.corners.indexOf(corner);
      b.classList.toggle('empty', seat < 0);
      b.classList.toggle('turn', seat >= 0 && r.status === 'playing' && r.state.turn === seat);
    });
  }
  function paintCtrl(r: Room) {
    const s = r.state;
    const tp = r.turn ? ctx.player(r.turn.pid) : undefined;
    const mine = !!r.turn && r.turn.pid === r.me;
    const corner = s.corners[s.turn];
    diceBtn.style.setProperty('--c', CORNER_COLORS[corner]);
    diceBtn.disabled = !canRoll(r);
    rollBtn.disabled = !canRoll(r);
    rollBtn.hidden = !mine || s.phase !== 'roll';
    diceBtn.classList.toggle('ready', canRoll(r));
    if (r.status !== 'playing') { who.textContent = ''; return; }
    who.innerHTML = mine ? 'دورك' : `دور ${esc(tp ? tp.name : '')} <small>(${CORNER_NAMES[corner]})</small>`;
    if (!note.dataset.keep) note.textContent = mine ? (s.phase === 'roll' ? 'اضغط النرد لترمي' : 'اختار قطعة من القطع اللي عم تلمع') : '';
  }
  function flash(text: string) {
    note.textContent = text;
    note.dataset.keep = '1';
    setTimeout(() => { delete note.dataset.keep; if (room) paintCtrl(room); }, 1600);
  }

  return {
    hint: (r) => (r.state.phase === 'roll' ? 'اضغط النرد لترمي' : 'اختار قطعة لتحركها'),
    async render(r, animate) {
      const prevSeats = seatsKey;
      buildTokens(r);
      if (prevSeats !== seatsKey) animate = false;
      paintNames(r);
      if (animate) {
        busyAnim = true;
        // during the animation nothing is clickable
        layer.querySelectorAll('.legal').forEach((g) => g.classList.remove('legal'));
        diceBtn.disabled = true; rollBtn.disabled = true;
        try {
          for (const e of r.ev) {
            const pl = ctx.player(e.pid);
            if (e.t === 'roll') { ctx.sound('dice'); setDie(e.v, true); await wait(950); }
            else if (e.t === 'move') await walk(r, e.seat!, e.token, e.from, e.to);
            else if (e.t === 'capture') {
              ctx.sound('pay');
              const g = tokens.get(e.seat + '-' + e.token);
              if (g) { const [x, y] = posOf(r.state.corners[e.seat!], -1, e.token); g.style.transition = 'transform .45s ease-in'; place(g, x, y); await wait(460); g.style.transition = ''; }
              flash(`${pl ? pl.name : ''} رجعت قطعته عالبيت`);
            } else if (e.t === 'home') ctx.sound('coin');
            else if (e.t === 'forfeit') flash('تلات 6 ورا بعض — راح الدور');
            else if (e.t === 'pass') flash(e.pid === r.me ? 'ما في حركة بهالرقم' : `${pl ? pl.name : ''}: ما في حركة`);
            else if (e.t === 'finish') { ctx.sound('win'); flash(`${pl ? pl.name : ''} وصّل كل قطعه!`); }
          }
        } finally { busyAnim = false; }
      } else if (r.state.dice) setDie(r.state.dice, false);
      room = r;
      layout(r, !animate);
      paintCtrl(r);
    },
  };
}

// ---------------------------------------------------------------- 3D (default) with 2D fallback
function webglOK() {
  try {
    if (/[?&]ludo2d\b/.test(location.search)) return false;           // manual switch for testing / old devices
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch { return false; }
}

export function createLudo(el: HTMLElement, under: HTMLElement, ctx: Ctx): Board {
  if (!webglOK()) return createLudo2D(el, under, ctx);
  let impl: Board | null = null;
  let last: Room | null = null;
  const to2D = () => {
    impl = createLudo2D(el, under, ctx);
    if (last) Promise.resolve(impl.render(last, false)).catch(console.error);
  };
  el.innerHTML = '<div class="mg-l3 loading" aria-busy="true"><span class="mg-l3-spin"></span></div>';
  const ready: Promise<Board> = import('./ludo3d/board3d')
    .then((m) => m.createLudo3D(el, under, ctx, to2D))
    .catch((e) => { console.warn('[ludo] 3D board unavailable, using 2D', e); return createLudo2D(el, under, ctx); });
  return {
    hint: (r) => (impl && impl.hint ? impl.hint(r) : r.state.phase === 'roll' ? 'اضغط النرد لترمي' : 'اختار قطعة لتحركها'),
    async render(r, animate) {
      if (!impl) { impl = await ready; animate = false; }
      last = r;
      await impl.render(r, animate);
    },
  };
}
