// «لودو» board: SVG 15×15 board, 3D dice (same cube as «ثروة»), tokens that walk square by square.
// Geometry must match games/ludo.js: 52-square track clockwise, corner k starts at track index START[k],
// progress -1 = base, 0..50 track, 51..55 home column, 56 = home.
import { esc } from '../lib/client';
import type { Board, Ctx, Room } from './types';

const C = 40;                         // cell size in SVG units (board = 600)
const START = [0, 13, 26, 39];
const STARS = [8, 21, 34, 47];
const CORNER_COLORS = ['#f0585e', '#38c172', '#ffc53d', '#4f9df7'];
const CORNER_NAMES = ['الأحمر', 'الأخضر', 'الأصفر', 'الأزرق'];
const BASE_ORIGIN: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];

// the 52 shared squares, clockwise, starting at corner 0's start square (cell coordinates)
const TRACK: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];
const HOME_COL: [number, number][][] = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
const HOME_SPOT: [number, number][] = [[6.55, 7.5], [7.5, 6.55], [8.45, 7.5], [7.5, 8.45]];
const ARROW_ROT = [0, 90, 180, 270]; // start-square arrow: corner 0 moves right, 1 down, 2 left, 3 up

const center = ([x, y]: [number, number]): [number, number] => [(x + 0.5) * C, (y + 0.5) * C];
function posOf(corner: number, prog: number, i: number): [number, number] {
  if (prog < 0) { const [ox, oy] = BASE_ORIGIN[corner]; return [(ox + (i % 2 ? 4 : 2)) * C, (oy + (i < 2 ? 2 : 4)) * C]; }
  if (prog <= 50) return center(TRACK[(START[corner] + prog) % 52]);
  if (prog <= 55) return center(HOME_COL[corner][prog - 51]);
  const [hx, hy] = HOME_SPOT[corner];
  const off = [[-7, -7], [7, -7], [-7, 7], [7, 7]][i];
  return [hx * C + off[0] * (corner % 2 ? 1.3 : 0.6), hy * C + off[1] * (corner % 2 ? 0.6 : 1.3)];
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
const dieHTML = () => `<div class="mg-die"><div class="tilt"><div class="cube">${[1, 6, 2, 5, 3, 4].map((v) => `<div class="face f${v}">${Array.from({ length: 9 }, (_, k) => `<span class="${PIPS[v].includes(k) ? 'on' : ''}"></span>`).join('')}</div>`).join('')}</div></div></div>`;

export function createLudo(el: HTMLElement, under: HTMLElement, ctx: Ctx): Board {
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
  const setDie = (v: number, animate: boolean) => window.FX.setDice(diceBtn, [v], animate);
  setDie(6, false);

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
    await ctx.act('move', { token: pick });
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
