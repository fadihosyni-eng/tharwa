'use strict';
// «أربعة بخط» — Connect Four for 2 players on a 7×6 board. Discs fall to the lowest free cell of a column;
// four in a row (horizontal, vertical or either diagonal) wins; a full board is a draw.
// Board: flat array, index = row * 7 + col, row 0 = bottom. Seat 0 = red (starts), seat 1 = yellow.
// Bot: negamax with alpha-beta pruning, depth 5, centre-first move ordering and a window heuristic.
const { gameErr, randInt, pick } = require('./util');

const W = 7, H = 6;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const DEPTH = 5;
const WIN = 1000000;

function setup(players) {
  return { seats: players.slice(0, 2), board: Array(W * H).fill(-1), heights: Array(W).fill(0), turn: 0, over: false, winner: -1, draw: false, line: null, moves: 0, last: null };
}
const seatOf = (s, pid) => s.seats.indexOf(pid);
const current = (s) => (s.over ? null : s.seats[s.turn]);

// The four cells through (r, c) that make a line for `seat`, or null.
function lineAt(board, r, c, seat) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const sgn of [1, -1]) {
      let rr = r + dr * sgn, cc = c + dc * sgn;
      while (rr >= 0 && rr < H && cc >= 0 && cc < W && board[rr * W + cc] === seat) { cells.push([rr, cc]); rr += dr * sgn; cc += dc * sgn; }
    }
    if (cells.length >= 4) {
      cells.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) * (dc < 0 ? -1 : 1));
      return cells.map(([y, x]) => y * W + x);
    }
  }
  return null;
}

function actions(s, pid) {
  if (s.over || s.seats[s.turn] !== pid) return [];
  return ORDER.filter((c) => s.heights[c] < H).sort((a, b) => a - b).map((col) => ({ type: 'drop', col }));
}

function apply(s, pid, a) {
  if (s.over) throw gameErr('اللعبة خلصت', 409);
  const seat = seatOf(s, pid);
  if (seat < 0) throw gameErr('إنت مو لاعب بهالغرفة', 403);
  if (seat !== s.turn) throw gameErr('مو دورك', 409);
  if (!a || a.type !== 'drop') throw gameErr('حركة غير معروفة');
  const col = Number(a.col);
  if (!Number.isInteger(col) || col < 0 || col >= W) throw gameErr('عمود غلط');
  if (s.heights[col] >= H) throw gameErr('هالعمود مليان');
  const row = s.heights[col]++;
  s.board[row * W + col] = seat;
  s.moves++;
  s.last = row * W + col;
  const events = [{ t: 'drop', pid, seat, col, row }];
  const line = lineAt(s.board, row, col, seat);
  if (line) {
    Object.assign(s, { over: true, winner: seat, line });
    events.push({ t: 'over', winner: pid });
  } else if (s.moves >= W * H) {
    Object.assign(s, { over: true, draw: true });
    events.push({ t: 'over', winner: null });
  } else s.turn = 1 - seat;
  return events;
}

function leave(s, pid) {
  const seat = seatOf(s, pid);
  if (seat < 0 || s.over) return [];
  Object.assign(s, { over: true, winner: 1 - seat, draw: false });
  return [{ t: 'over', winner: s.seats[1 - seat], forfeit: pid }];
}

// ---------------------------------------------------------------- bot
// Heuristic for `me`: every window of 4 cells scores by how many of mine / theirs / empty it holds,
// plus a bonus for discs in the centre column (they take part in the most lines).
const WINDOWS = (() => {
  const out = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const er = r + dr * 3, ec = c + dc * 3;
      if (er < 0 || er >= H || ec < 0 || ec >= W) continue;
      out.push([0, 1, 2, 3].map((k) => (r + dr * k) * W + (c + dc * k)));
    }
  }
  return out;
})();
function evaluate(board, me) {
  let score = 0;
  for (let r = 0; r < H; r++) { const v = board[r * W + 3]; if (v === me) score += 3; else if (v === 1 - me) score -= 3; }
  for (const w of WINDOWS) {
    let mine = 0, theirs = 0;
    for (const i of w) { if (board[i] === me) mine++; else if (board[i] === 1 - me) theirs++; }
    if (mine && theirs) continue;
    if (mine === 3) score += 5; else if (mine === 2) score += 2;
    if (theirs === 3) score -= 4; else if (theirs === 2) score -= 1;
  }
  return score;
}
function negamax(board, heights, seat, depth, alpha, beta, moves) {
  if (moves >= W * H) return 0;
  // immediate win for the side to move
  for (const c of ORDER) {
    if (heights[c] >= H) continue;
    const r = heights[c];
    board[r * W + c] = seat;
    const won = lineAt(board, r, c, seat);
    board[r * W + c] = -1;
    if (won) return WIN + depth;
  }
  if (depth === 0) return evaluate(board, seat);
  let best = -Infinity;
  for (const c of ORDER) {
    if (heights[c] >= H) continue;
    const r = heights[c]++;
    board[r * W + c] = seat;
    const v = -negamax(board, heights, 1 - seat, depth - 1, -beta, -alpha, moves + 1);
    board[r * W + c] = -1;
    heights[c]--;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function botAction(s, pid, rand = randInt, depth = DEPTH) {
  const me = seatOf(s, pid);
  if (s.over || me !== s.turn) return null;
  const board = s.board.slice(), heights = s.heights.slice();
  let best = -Infinity, list = [];
  for (const c of ORDER) {
    if (heights[c] >= H) continue;
    const r = heights[c]++;
    board[r * W + c] = me;
    const v = lineAt(board, r, c, me) ? WIN * 2 : -negamax(board, heights, 1 - me, depth - 1, -Infinity, Infinity, s.moves + 1);
    board[r * W + c] = -1;
    heights[c]--;
    if (v > best) { best = v; list = [c]; } else if (v === best) list.push(c);
  }
  return list.length ? { type: 'drop', col: pick(list, rand) } : null;
}

function view(s) {
  return { seats: s.seats, board: s.board, turn: s.turn, over: s.over, winner: s.winner >= 0 ? s.seats[s.winner] : null, draw: s.draw, line: s.line, moves: s.moves, last: s.last, cols: W, rows: H };
}
function result(s) {
  if (!s.over) return null;
  const w = s.winner >= 0 ? s.seats[s.winner] : null;
  return { winner: w, draw: !w, ranking: w ? [w, s.seats[1 - s.winner]] : s.seats.slice(), rounds: s.moves };
}

module.exports = {
  slug: 'connect4', name: 'أربعة بخط', minPlayers: 2, maxPlayers: 2, turnMs: 30000, options: {},
  setup, current, actions, apply, leave, botAction, view, result,
  _internal: { lineAt, evaluate, W, H },
};
