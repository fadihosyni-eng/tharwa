'use strict';
// «لودو» — 2 to 4 players, 4 tokens each, server-side dice.
//
// Track: 52 shared squares (absolute 0..51, clockwise). Corner k starts at absolute START[k].
// A token's progress: -1 = in base, 0..50 = on the shared track (0 = its start square),
// 51..55 = its own home column, 56 = home (finished).
// Rules:
//   - a 6 is needed to bring a token out of base (onto its start square);
//   - a 6 gives another roll; the third 6 in a row forfeits the turn (that roll is not played);
//   - landing on an opponent token on a normal square captures it (sent back to base) and gives another roll;
//     start squares and the four star squares are safe (no captures there, tokens can share them);
//   - a token needs the exact number to reach home; reaching home gives another roll;
//   - no legal move = the turn passes (a 6 still gives the extra roll);
//   - first to bring all 4 tokens home wins; the others are ranked by finishing order, then by progress.
// When only one distinct move is possible it is played automatically right after the roll.
const { gameErr, randInt } = require('./util');

const START = [0, 13, 26, 39];
const STARS = [8, 21, 34, 47];
const SAFE = new Set([...START, ...STARS]);
const HOME = 56;
const LAST_TRACK = 50;
const CORNERS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

const absOf = (corner, prog) => (START[corner] + prog) % 52;

function setup(players) {
  const n = Math.min(4, Math.max(2, players.length));
  const seats = players.slice(0, n);
  return {
    seats, corners: CORNERS[n], tokens: seats.map(() => [-1, -1, -1, -1]), turn: 0, phase: 'roll', dice: null, sixes: 0,
    finished: [], left: seats.map(() => false), over: false, rolls: 0, legal: [],
  };
}
const seatOf = (s, pid) => s.seats.indexOf(pid);
const current = (s) => (s.over ? null : s.seats[s.turn]);
const active = (s, k) => !s.left[k] && !s.finished.includes(k);

function canMove(prog, d) {
  if (prog === HOME) return false;
  if (prog < 0) return d === 6;
  return prog + d <= HOME;
}
function legalTokens(s, seat, d) {
  return s.tokens[seat].map((p, i) => (canMove(p, d) ? i : -1)).filter((i) => i >= 0);
}

function actions(s, pid) {
  const seat = seatOf(s, pid);
  if (s.over || seat !== s.turn) return [];
  if (s.phase === 'roll') return [{ type: 'roll' }];
  return s.legal.map((token) => ({ type: 'move', token }));
}

function nextTurn(s, events) {
  s.sixes = 0;
  s.dice = null; s.legal = []; s.phase = 'roll';
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const t = (s.turn + k) % n;
    if (active(s, t)) { s.turn = t; events.push({ t: 'turn', pid: s.seats[t], seat: t }); return; }
  }
}
function checkOver(s, events) {
  const still = s.seats.map((_, k) => k).filter((k) => active(s, k));
  if (still.length <= 1 && !s.over) {
    s.over = true; s.phase = 'over'; s.legal = []; s.dice = s.dice || null;
    events.push({ t: 'over', winner: s.finished.length ? s.seats[s.finished[0]] : (still.length ? s.seats[still[0]] : null) });
    return true;
  }
  return false;
}

// Moves token `i` of `seat` by the current dice. Returns true when the player earned another roll.
function moveToken(s, seat, i, events) {
  const d = s.dice, from = s.tokens[seat][i];
  const to = from < 0 ? 0 : from + d;
  s.tokens[seat][i] = to;
  events.push({ t: 'move', pid: s.seats[seat], seat, token: i, from, to });
  let again = d === 6;
  if (to <= LAST_TRACK) {
    const sq = absOf(s.corners[seat], to);
    if (!SAFE.has(sq)) {
      s.seats.forEach((_, o) => {
        if (o === seat || s.left[o]) return;
        s.tokens[o].forEach((p, j) => {
          if (p >= 0 && p <= LAST_TRACK && absOf(s.corners[o], p) === sq) {
            s.tokens[o][j] = -1;
            events.push({ t: 'capture', pid: s.seats[o], seat: o, token: j, from: p, by: s.seats[seat] });
            again = true;
          }
        });
      });
    }
  }
  if (to === HOME) {
    events.push({ t: 'home', pid: s.seats[seat], seat, token: i });
    again = true;
    if (s.tokens[seat].every((p) => p === HOME)) {
      s.finished.push(seat);
      events.push({ t: 'finish', pid: s.seats[seat], seat, place: s.finished.length });
      again = false;
    }
  }
  return again;
}
function afterMove(s, seat, again, events) {
  if (checkOver(s, events)) return;
  if (again && active(s, seat)) { s.phase = 'roll'; s.dice = null; s.legal = []; events.push({ t: 'again', pid: s.seats[seat], seat }); return; }
  nextTurn(s, events);
}

// ctx.dice (tests only) forces the roll; otherwise crypto dice.
function apply(s, pid, a, ctx = {}) {
  if (s.over) throw gameErr('اللعبة خلصت', 409);
  const seat = seatOf(s, pid);
  if (seat < 0) throw gameErr('إنت مو لاعب بهالغرفة', 403);
  if (seat !== s.turn) throw gameErr('مو دورك', 409);
  const events = [];
  if (a && a.type === 'roll') {
    if (s.phase !== 'roll') throw gameErr('حرّك قطعة أول', 409);
    const d = ctx.dice || (ctx.rand || randInt)(6) + 1;
    s.dice = d; s.rolls++;
    events.push({ t: 'roll', pid, seat, v: d });
    s.sixes = d === 6 ? s.sixes + 1 : 0; // only 6s in a row count
    if (s.sixes >= 3) {
      events.push({ t: 'forfeit', pid, seat, reason: 'three6' });
      nextTurn(s, events);
      return events;
    }
    const legal = legalTokens(s, seat, d);
    if (!legal.length) {
      events.push({ t: 'pass', pid, seat });
      if (d === 6) { s.phase = 'roll'; s.dice = d; s.legal = []; events.push({ t: 'again', pid, seat }); } else nextTurn(s, events);
      return events;
    }
    s.phase = 'move'; s.legal = legal;
    // Only one distinct outcome (one token, or several tokens on the same spot): play it now.
    if (new Set(legal.map((i) => s.tokens[seat][i])).size === 1) {
      const again = moveToken(s, seat, legal[0], events);
      s.legal = [];
      afterMove(s, seat, again, events);
    }
    return events;
  }
  if (a && a.type === 'move') {
    if (s.phase !== 'move') throw gameErr('ارمي النرد أول', 409);
    const i = Number(a.token);
    if (!Number.isInteger(i) || !s.legal.includes(i)) throw gameErr('هالقطعة ما فيها تتحرك بهالرقم');
    const again = moveToken(s, seat, i, events);
    s.legal = [];
    afterMove(s, seat, again, events);
    return events;
  }
  throw gameErr('حركة غير معروفة');
}

function leave(s, pid) {
  const seat = seatOf(s, pid);
  if (seat < 0 || s.over || s.left[seat]) return [];
  s.left[seat] = true;
  s.tokens[seat] = s.tokens[seat].map((p) => (p === HOME ? p : -1));
  const events = [{ t: 'left', pid, seat }];
  if (checkOver(s, events)) return events;
  if (s.turn === seat) nextTurn(s, events);
  return events;
}

// ---------------------------------------------------------------- bot
// Is the absolute square `sq` within reach (1..6 behind on the track) of an opponent token of `seat`?
function threatened(s, seat, sq) {
  if (SAFE.has(sq)) return false;
  for (let o = 0; o < s.seats.length; o++) {
    if (o === seat || !active(s, o)) continue;
    for (const p of s.tokens[o]) {
      if (p < 0 || p > LAST_TRACK) continue;
      const dist = (sq - absOf(s.corners[o], p) + 52) % 52;
      if (dist >= 1 && dist <= 6 && p + dist <= LAST_TRACK) return true;
    }
  }
  return false;
}
function scoreMove(s, seat, i, d) {
  const from = s.tokens[seat][i], to = from < 0 ? 0 : from + d, c = s.corners[seat];
  let score = to / 10; // tie-break: advance the furthest token
  if (to <= LAST_TRACK) {
    const sq = absOf(c, to);
    if (!SAFE.has(sq)) {
      for (let o = 0; o < s.seats.length; o++) {
        if (o === seat || s.left[o]) continue;
        for (const p of s.tokens[o]) if (p >= 0 && p <= LAST_TRACK && absOf(s.corners[o], p) === sq) score += 100 + p;
      }
    }
    if (SAFE.has(sq)) score += 25;
    if (threatened(s, seat, sq)) score -= 40;
  }
  if (to === HOME) score += 80;
  else if (to > LAST_TRACK && from <= LAST_TRACK) score += 50;
  if (from < 0) score += 60;
  if (from >= 0 && from <= LAST_TRACK && threatened(s, seat, absOf(c, from))) score += 30; // run away
  return score;
}
function botAction(s, pid) {
  const seat = seatOf(s, pid);
  if (s.over || seat !== s.turn) return null;
  if (s.phase === 'roll') return { type: 'roll' };
  let best = null, bestScore = -Infinity;
  for (const i of s.legal) {
    const v = scoreMove(s, seat, i, s.dice);
    if (v > bestScore) { bestScore = v; best = i; }
  }
  return best === null ? null : { type: 'move', token: best };
}

function ranking(s) {
  const rest = s.seats.map((_, k) => k).filter((k) => !s.finished.includes(k));
  const prog = (k) => s.tokens[k].reduce((n, p) => n + (p < 0 ? 0 : p + 1), 0);
  rest.sort((a, b) => (s.left[a] - s.left[b]) || (prog(b) - prog(a)));
  return [...s.finished, ...rest].map((k) => s.seats[k]);
}
function view(s) {
  return {
    seats: s.seats, corners: s.corners, tokens: s.tokens, turn: s.turn, phase: s.phase, dice: s.dice, sixes: s.sixes,
    legal: s.legal, finished: s.finished.map((k) => s.seats[k]), left: s.left, over: s.over, rolls: s.rolls,
    ranking: s.over ? ranking(s) : null,
  };
}
function result(s) {
  if (!s.over) return null;
  const r = ranking(s);
  return { winner: r[0] || null, draw: false, ranking: r, rounds: s.rolls };
}

module.exports = {
  slug: 'ludo', name: 'لودو', minPlayers: 2, maxPlayers: 4, turnMs: 15000, options: {},
  setup, current, actions, apply, leave, botAction, view, result,
  _internal: { START, STARS, SAFE, HOME, absOf, threatened },
};
