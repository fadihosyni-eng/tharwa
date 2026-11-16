'use strict';
// «أربعمية» (400) — 4 players in 2 partnerships (seats 0+2 against 1+3), 13 cards each, hearts («الكبّة») are always trumps.
// Rules implemented (common Lebanese / Syrian table rules):
//   * Deal and play go to the right (seat + 1); the deal rotates every hand.
//   * Bidding: one bid each, starting after the dealer: how many tricks YOU will take, 2..13. The minimum rises with
//     your own score: 30+ points -> at least 3, 40+ points -> at least 4.
//     If the four bids add up to less than 11, the cards are thrown in and the next dealer deals again.
//   * The player after the dealer leads the first trick. Follow suit if you can; otherwise any card. Highest heart wins,
//     otherwise the highest card of the suit led. All 13 tricks are played.
//   * Scoring per player: bid made (own tricks >= bid) -> + bid value, failed -> - bid value. The bid value is the bid,
//     doubled from 5 up: 2, 3, 4, then 5 -> 10, 6 -> 12 … 13 -> 26. Extra tricks score nothing.
//   * A partnership wins when one partner has 41 or more (room option 31 / 41 / 61) AND the other partner is above 0.
//     Checked after each hand; if both partnerships qualify, the higher combined score wins (a tie plays on).
// Bots bid their expected tricks (and the last bidder stretches a little to save a throw-in) and play with the
// same card sense as «طرنيب».
const D = require('./deck');
const C = require('./common');
const { gameErr } = require('../util');

const TARGETS = [41, 31, 61];
const TRUMP = 'H';
const MIN_TOTAL = 11;

const bidValue = (bid) => (bid >= 5 ? bid * 2 : bid);
const minBidFor = (score) => (score >= 40 ? 4 : score >= 30 ? 3 : 2);

function setup(pids, opts = {}) {
  const want = Number(opts.target || opts.bestOf);
  const s = {
    game: '400', seats: pids.slice(0, 4), target: TARGETS.includes(want) ? want : 41,
    scores: [0, 0, 0, 0], round: 0, history: [], over: false, winTeam: -1, gone: [false, false, false, false], redeals: 0,
    dealer: D.N - 1, phase: 'bid', trump: TRUMP,
  };
  startHand(s, D.N - 1, []);
  return s;
}
function startHand(s, dealer, events) {
  s.round++;
  D.freshDeal(s, dealer);
  s.trump = TRUMP;
  s.phase = 'bid';
  s.bids = [null, null, null, null];
  s.turn = D.next(dealer);
  events.push({ t: 'deal', round: s.round, dealer });
}
const curSeat = (s) => (s.over ? -1 : s.turn);
const current = (s) => (s.over ? null : s.seats[s.turn]);

function bidOptions(s, seat) {
  if (s.over || s.phase !== 'bid' || s.turn !== seat) return [];
  const out = [];
  for (let b = minBidFor(s.scores[seat]); b <= 13; b++) out.push(b);
  return out;
}
function actions(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || s.turn !== seat) return [];
  if (s.phase === 'bid') return bidOptions(s, seat).map((bid) => ({ type: 'bid', bid }));
  return D.legalPlays(s.hands[seat], s.trick).map((card) => ({ type: 'play', card }));
}

function apply(s, pid, a) {
  const seat = C.seatFor(s, pid);
  C.needTurn(s, seat, curSeat(s));
  const type = a && a.type;
  const events = [];
  if (s.phase === 'bid') {
    if (type !== 'bid') throw gameErr('هلق وقت الطلب: قدّيش رح تجيب؟');
    const bid = Number(a.bid);
    const min = minBidFor(s.scores[seat]);
    if (!Number.isInteger(bid) || bid < min || bid > 13) throw gameErr(`الطلب لازم يكون من ${min} لـ 13`);
    s.bids[seat] = bid;
    events.push({ t: 'bid', seat, bid });
    if (s.bids.every((b) => b !== null)) {
      const total = s.bids.reduce((x, y) => x + y, 0);
      if (total < MIN_TOTAL) {
        events.push({ t: 'redeal', dealer: s.dealer, total });
        s.redeals++;
        s.round--;
        startHand(s, D.next(s.dealer), events);
        return events;
      }
      s.phase = 'play';
      s.turn = D.next(s.dealer); // the first bidder leads
      events.push({ t: 'bids', total });
    } else s.turn = D.next(seat);
    return events;
  }
  if (type !== 'play') throw gameErr('العب ورقة');
  D.playCard(s, seat, a.card, events);
  if (s.trickNo === 13) endHand(s, events);
  return events;
}

// Team that wins now (or -1): a partner at/over the target with the other partner above zero.
function winningTeam(scores, target) {
  const ok = [0, 1].filter((t) => (scores[t] >= target && scores[t + 2] > 0) || (scores[t + 2] >= target && scores[t] > 0));
  if (!ok.length) return -1;
  if (ok.length === 1) return ok[0];
  const sum = (t) => scores[t] + scores[t + 2];
  return sum(0) === sum(1) ? -1 : sum(0) > sum(1) ? 0 : 1;
}
function endHand(s, events) {
  const delta = [0, 1, 2, 3].map((x) => (s.tricks[x] >= s.bids[x] ? 1 : -1) * bidValue(s.bids[x]));
  for (let x = 0; x < 4; x++) s.scores[x] += delta[x];
  const row = { round: s.round, dealer: s.dealer, bids: s.bids.slice(), taken: s.tricks.slice(), delta, scores: s.scores.slice() };
  s.history.push(row);
  events.push({ t: 'hand', ...row });
  const w = winningTeam(s.scores, s.target);
  if (w >= 0) {
    s.over = true; s.phase = 'over'; s.winTeam = w;
    events.push({ t: 'over', team: w });
    return;
  }
  startHand(s, D.next(s.dealer), events);
}

// ---------------------------------------------------------------- bot
function botBid(s, seat) {
  const est = D.handTricks(s.hands[seat], TRUMP);
  const min = minBidFor(s.scores[seat]);
  let bid = Math.max(min, Math.min(13, Math.floor(est + 0.25)));
  const others = s.bids.filter((b) => b !== null);
  if (others.length === 3) {
    const total = others.reduce((x, y) => x + y, 0);
    const need = MIN_TOTAL - total;
    if (bid < need && need <= est + 1.3) bid = Math.min(13, need); // stretch to save the hand
  }
  return { type: 'bid', bid };
}
function botAction(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || s.turn !== seat) return null;
  if (s.phase === 'bid') return botBid(s, seat);
  return { type: 'play', card: D.botTrickPlay(s, seat, {}) };
}

function view(s, pid) {
  const v = C.baseView(s, pid, curSeat(s));
  return {
    ...v, game: '400', target: s.target, scores: s.scores, history: s.history, bids: s.bids, winTeam: s.winTeam,
    bidOptions: v.me >= 0 ? bidOptions(s, v.me) : [], minTotal: MIN_TOTAL,
  };
}

module.exports = {
  slug: '400', name: 'أربعمية', minPlayers: 4, maxPlayers: 4, turnMs: 25000,
  options: { bestOf: TARGETS }, // the room's numeric option = target score
  setup, current, actions, apply, leave: C.leave, botAction, view, result: C.teamResult,
  _internal: { bidValue, minBidFor, winningTeam, endHand, startHand, botBid, TARGETS },
};
