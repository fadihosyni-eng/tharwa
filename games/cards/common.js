'use strict';
// Bits shared by the card game modules: seat checks, leaving, results for partnership games.
const { gameErr } = require('../util');
const D = require('./deck');

function seatFor(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0) throw gameErr('إنت مو لاعب بهالغرفة', 403);
  return seat;
}
function needTurn(s, seat, curSeat) {
  if (s.over) throw gameErr('اللعبة خلصت', 409);
  if (seat !== curSeat) throw gameErr('مو دورك', 409);
}
// A player who quits keeps their seat: the room manager plays it for them (bot moves) so the
// other three can finish; they rank last and never count as the winner.
function leave(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || s.gone[seat]) return [];
  s.gone[seat] = true;
  return [{ t: 'left', seat }];
}
// Partnership result: both partners of the winning team rank first (players who left go last).
// `winner` is one pid (the results/points code knows a single winner): the first winning partner still in.
function teamResult(s) {
  if (!s.over) return null;
  const t = s.winTeam;
  const order = (team) => [team, team + 2].sort((a, b) => s.gone[a] - s.gone[b]).map((x) => s.seats[x]);
  const win = order(t), lose = order(1 - t);
  const still = [t, t + 2].filter((x) => !s.gone[x]);
  const ranking = [...win, ...lose];
  ranking.sort((a, b) => s.gone[s.seats.indexOf(a)] - s.gone[s.seats.indexOf(b)]);
  return {
    winner: still.length ? s.seats[still[0]] : null, draw: !still.length, ranking, rounds: s.round,
    winners: win, team: true, scores: s.scores.slice(),
  };
}
// The parts of the view every card game shares. `me` = viewer's seat (-1 = spectator).
function baseView(s, pid, curSeat) {
  const me = s.seats.indexOf(pid);
  return {
    seats: s.seats, me, round: s.round, dealer: s.dealer, phase: s.phase, turn: s.over ? -1 : curSeat,
    hand: me >= 0 ? s.hands[me].slice() : [], counts: s.hands.map((h) => h.length),
    trick: s.trick, lastTrick: s.lastTrick, trump: s.trump || null, tricks: s.tricks, gone: s.gone, over: s.over,
    legal: me >= 0 && me === curSeat && s.phase === 'play' && !s.over ? D.legalPlays(s.hands[me], s.trick) : [],
  };
}

module.exports = { seatFor, needTurn, leave, teamResult, baseView };
