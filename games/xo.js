'use strict';
// «إكس أو» — tic-tac-toe for 2 players, optional best-of-3/5 match. Seat 0 plays X, seat 1 plays O.
// The starting seat alternates every round. Bot: full minimax (it never misses a win or a needed block);
// it makes a random "human" move now and then (BOT_SLIP) so the game stays winnable.
const { gameErr, randInt, pick } = require('./util');

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const BEST_OF = [1, 3, 5];
const BOT_SLIP = 0.15; // chance per bot move to play a random safe move instead of the minimax one

function lineOf(board) {
  for (const l of LINES) if (board[l[0]] >= 0 && board[l[0]] === board[l[1]] && board[l[0]] === board[l[2]]) return l;
  return null;
}
const full = (board) => board.every((c) => c >= 0);

function setup(players, opts = {}) {
  const bestOf = BEST_OF.includes(Number(opts.bestOf)) ? Number(opts.bestOf) : 1;
  return {
    seats: players.slice(0, 2), board: Array(9).fill(-1), turn: 0, starter: 0, bestOf,
    score: [0, 0], round: 1, rounds: [], line: null, over: false, winner: -1, draw: false, moves: 0, left: [false, false],
  };
}
const seatOf = (s, pid) => s.seats.indexOf(pid);
const current = (s) => (s.over ? null : s.seats[s.turn]);

function actions(s, pid) {
  if (s.over || s.seats[s.turn] !== pid) return [];
  const out = [];
  s.board.forEach((c, i) => { if (c < 0) out.push({ type: 'place', cell: i }); });
  return out;
}

// Ends the round (win or draw) and either finishes the match or sets up the next round.
function endRound(s, winnerSeat, events) {
  s.rounds.push({ board: s.board.slice(), line: s.line, winner: winnerSeat });
  if (winnerSeat >= 0) s.score[winnerSeat]++;
  const target = Math.floor(s.bestOf / 2) + 1;
  const played = s.rounds.length;
  const decided = s.score[0] >= target || s.score[1] >= target;
  // Drawn rounds count as played: after bestOf rounds the higher score wins, a level score is a draw.
  if (decided || played >= s.bestOf) {
    s.over = true;
    s.winner = s.score[0] === s.score[1] ? -1 : (s.score[0] > s.score[1] ? 0 : 1);
    s.draw = s.winner < 0;
    events.push({ t: 'over', winner: s.winner >= 0 ? s.seats[s.winner] : null });
    return;
  }
  events.push({ t: 'round', round: s.round, winner: winnerSeat >= 0 ? s.seats[winnerSeat] : null });
  s.round++;
  s.starter = 1 - s.starter;
  s.turn = s.starter;
  s.board = Array(9).fill(-1);
  s.line = null;
}

function apply(s, pid, a) {
  if (s.over) throw gameErr('اللعبة خلصت', 409);
  const seat = seatOf(s, pid);
  if (seat < 0) throw gameErr('إنت مو لاعب بهالغرفة', 403);
  if (seat !== s.turn) throw gameErr('مو دورك', 409);
  if (!a || a.type !== 'place') throw gameErr('حركة غير معروفة');
  const cell = Number(a.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw gameErr('خانة غلط');
  if (s.board[cell] >= 0) throw gameErr('هالخانة مليانة');
  s.board[cell] = seat;
  s.moves++;
  const events = [{ t: 'place', pid, seat, cell }];
  const line = lineOf(s.board);
  if (line) { s.line = line; endRound(s, seat, events); return events; }
  if (full(s.board)) { endRound(s, -1, events); return events; }
  s.turn = 1 - seat;
  return events;
}

// Player left mid-match: the other player wins.
function leave(s, pid) {
  const seat = seatOf(s, pid);
  if (seat < 0 || s.over) return [];
  s.left[seat] = true;
  s.over = true; s.winner = 1 - seat; s.draw = false;
  return [{ t: 'over', winner: s.seats[1 - seat], forfeit: pid }];
}

// ---------------------------------------------------------------- bot (minimax)
// Score from `me`'s point of view: +10 win (sooner is better), -10 loss, 0 draw.
const memo = new Map(); // board + side to move + me -> value (the game tree is tiny, so this stays small)
function minimax(board, toMove, me, depth) {
  const key = board.join(',') + '|' + toMove + me + depth;
  if (memo.has(key)) return memo.get(key);
  const v = search(board, toMove, me, depth);
  memo.set(key, v);
  return v;
}
function search(board, toMove, me, depth) {
  const l = lineOf(board);
  if (l) return board[l[0]] === me ? 10 - depth : depth - 10;
  if (full(board)) return 0;
  let best = toMove === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i] >= 0) continue;
    board[i] = toMove;
    const v = minimax(board, 1 - toMove, me, depth + 1);
    board[i] = -1;
    best = toMove === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}
function bestMoves(board, me) {
  let best = -Infinity, list = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] >= 0) continue;
    board[i] = me;
    const v = minimax(board, 1 - me, me, 1);
    board[i] = -1;
    if (v > best) { best = v; list = [i]; } else if (v === best) list.push(i);
  }
  return { best, list };
}
function botAction(s, pid, rand = randInt) {
  const me = seatOf(s, pid);
  if (s.over || me !== s.turn) return null;
  const b = s.board.slice();
  const free = b.map((c, i) => (c < 0 ? i : -1)).filter((i) => i >= 0);
  const wins = (seat) => free.filter((i) => { b[i] = seat; const w = !!lineOf(b); b[i] = -1; return w; });
  const myWin = wins(me);
  if (myWin.length) return { type: 'place', cell: pick(myWin, rand) };
  const block = wins(1 - me);
  if (block.length) return { type: 'place', cell: pick(block, rand) };
  if (rand(1000) < BOT_SLIP * 1000) return { type: 'place', cell: pick(free, rand) };
  return { type: 'place', cell: pick(bestMoves(b, me).list, rand) };
}

function view(s) {
  return {
    seats: s.seats, board: s.board, turn: s.turn, bestOf: s.bestOf, score: s.score, round: s.round,
    lastRound: s.rounds.length ? s.rounds[s.rounds.length - 1] : null, line: s.line, over: s.over,
    winner: s.winner >= 0 ? s.seats[s.winner] : null, draw: s.draw, moves: s.moves,
  };
}
function result(s) {
  if (!s.over) return null;
  const w = s.winner >= 0 ? s.seats[s.winner] : null;
  return { winner: w, draw: !w, ranking: w ? [w, s.seats[1 - s.winner]] : s.seats.slice(), rounds: s.rounds.length };
}

module.exports = {
  slug: 'xo', name: 'إكس أو', minPlayers: 2, maxPlayers: 2, turnMs: 30000,
  options: { bestOf: BEST_OF },
  setup, current, actions, apply, leave, botAction, view, result,
  _internal: { lineOf, bestMoves, minimax },
};
