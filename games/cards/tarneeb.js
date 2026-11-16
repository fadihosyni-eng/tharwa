'use strict';
// «طرنيب» — 4 players in 2 partnerships (partners sit opposite: seats 0+2 against 1+3), 13 cards each.
// Rules implemented (common Levantine / Lebanese-Syrian table rules):
//   * Deal and play go to the right (seat + 1). The deal rotates every hand; the player after the dealer bids first.
//   * Bidding: each bid is a number of tricks 7..13 and must be higher than the last bid. A player who passes is out
//     of this auction. The auction ends when everyone else has passed after a bid (or someone bids 13).
//     If all four pass, the cards are thrown in and the next dealer deals again.
//   * The winning bidder names the trump suit («الطرنيب») and leads the first trick.
//   * Follow suit if you can; otherwise play any card (trumping is never forced). Highest trump wins the trick,
//     otherwise the highest card of the suit led. The trick winner leads the next one. All 13 tricks are played.
//   * Scoring: contract made (bidding team took >= bid) -> bidding team scores the tricks it took, the other team 0.
//     Contract failed -> bidding team loses the bid (minus), the other team scores the tricks it took.
//   * The game is to 41 points (room option 31 / 41 / 61). It is checked after each hand: a team at or above the
//     target wins; if both are, the higher score wins; a tie at the top plays another hand.
// Bots bid from hand strength (honours + long trump suit + expected partner help), name their best suit,
// and play with basic card sense (cash winners, second hand low, win cheaply, don't over-take the partner, ruff cheaply).
const D = require('./deck');
const C = require('./common');
const { gameErr } = require('../util');

const TARGETS = [41, 31, 61];
const MIN_BID = 7, MAX_BID = 13;

function setup(pids, opts = {}) {
  // lib/minigames.js forwards one numeric room option (`bestOf`); for the card games it carries the target score.
  const want = Number(opts.target || opts.bestOf);
  const s = {
    game: 'tarneeb', seats: pids.slice(0, 4), target: TARGETS.includes(want) ? want : 41,
    scores: [0, 0], round: 0, history: [], over: false, winTeam: -1, gone: [false, false, false, false], redeals: 0,
    dealer: D.N - 1, phase: 'bid', trump: null,
  };
  startHand(s, D.N - 1, []);
  return s;
}
function startHand(s, dealer, events) {
  s.round++;
  D.freshDeal(s, dealer);
  s.phase = 'bid';
  s.bids = [null, null, null, null];   // null = not bid yet, 0 = passed, n = last bid
  s.highBid = 0; s.bidder = -1; s.bid = 0; s.trump = null;
  s.turn = D.next(dealer);
  events.push({ t: 'deal', round: s.round, dealer });
}
const curSeat = (s) => (s.over ? -1 : s.phase === 'trump' ? s.bidder : s.turn);
const current = (s) => (s.over ? null : s.seats[curSeat(s)]);

function bidOptions(s, seat) {
  if (s.over || s.phase !== 'bid' || curSeat(s) !== seat) return [];
  const out = [];
  for (let b = Math.max(MIN_BID, s.highBid + 1); b <= MAX_BID; b++) out.push(b);
  return out;
}
function actions(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || curSeat(s) !== seat) return [];
  if (s.phase === 'bid') return [...bidOptions(s, seat).map((bid) => ({ type: 'bid', bid })), { type: 'pass' }];
  if (s.phase === 'trump') return D.SUITS.split('').map((suit) => ({ type: 'trump', suit }));
  return D.legalPlays(s.hands[seat], s.trick).map((card) => ({ type: 'play', card }));
}

// Next seat in the auction that has not passed (or -1 when the auction is over).
function closeAuction(s, events) {
  const active = [0, 1, 2, 3].filter((x) => s.bids[x] !== 0);
  if (s.highBid === 0 && active.length === 0) {
    events.push({ t: 'redeal', dealer: s.dealer });
    s.redeals++;
    s.round--; // a thrown-in hand is not a round
    startHand(s, D.next(s.dealer), events);
    return true;
  }
  if (s.highBid === MAX_BID || (s.highBid > 0 && active.length === 1 && active[0] === s.bidder)) {
    s.bid = s.highBid;
    s.phase = 'trump';
    events.push({ t: 'contract', seat: s.bidder, bid: s.bid });
    return true;
  }
  return false;
}
function advanceBid(s, seat) {
  let x = D.next(seat);
  while (s.bids[x] === 0) x = D.next(x);
  s.turn = x;
}

function apply(s, pid, a) {
  const seat = C.seatFor(s, pid);
  C.needTurn(s, seat, curSeat(s));
  const type = a && a.type;
  const events = [];
  if (s.phase === 'bid') {
    if (type === 'pass') {
      s.bids[seat] = 0;
      events.push({ t: 'pass', seat });
    } else if (type === 'bid') {
      const bid = Number(a.bid);
      if (!Number.isInteger(bid) || bid < MIN_BID || bid > MAX_BID) throw gameErr(`الطلب لازم يكون من ${MIN_BID} لـ ${MAX_BID}`);
      if (bid <= s.highBid) throw gameErr(`لازم تطلب أكتر من ${s.highBid}`);
      s.bids[seat] = bid; s.highBid = bid; s.bidder = seat;
      events.push({ t: 'bid', seat, bid });
    } else throw gameErr('هلق وقت الطلب: اطلب أو باس');
    if (!closeAuction(s, events)) advanceBid(s, seat);
    return events;
  }
  if (s.phase === 'trump') {
    if (type !== 'trump' || typeof a.suit !== 'string' || a.suit.length !== 1 || !D.SUITS.includes(a.suit)) throw gameErr('اختار الطرنيب');
    s.trump = a.suit;
    s.phase = 'play';
    s.turn = s.bidder; // the bidder leads
    events.push({ t: 'trump', seat, suit: a.suit });
    return events;
  }
  if (type !== 'play') throw gameErr('العب ورقة');
  D.playCard(s, seat, a.card, events);
  if (s.trickNo === 13) endHand(s, events);
  return events;
}

function endHand(s, events) {
  const bt = D.teamOf(s.bidder);
  const taken = [s.tricks[0] + s.tricks[2], s.tricks[1] + s.tricks[3]];
  const made = taken[bt] >= s.bid;
  const delta = [0, 0];
  if (made) delta[bt] = taken[bt];
  else { delta[bt] = -s.bid; delta[1 - bt] = taken[1 - bt]; }
  s.scores[0] += delta[0]; s.scores[1] += delta[1];
  const row = { round: s.round, dealer: s.dealer, bidder: s.bidder, bid: s.bid, trump: s.trump, taken, made, delta, scores: s.scores.slice() };
  s.history.push(row);
  events.push({ t: 'hand', ...row });
  const top = Math.max(s.scores[0], s.scores[1]);
  if (top >= s.target && s.scores[0] !== s.scores[1]) {
    s.over = true; s.phase = 'over';
    s.winTeam = s.scores[0] > s.scores[1] ? 0 : 1;
    events.push({ t: 'over', team: s.winTeam });
    return;
  }
  startHand(s, D.next(s.dealer), events);
}

// ---------------------------------------------------------------- bot
function bestTrump(hand) {
  let best = 'S', v = -1;
  for (const su of D.SUITS) {
    const t = D.handTricks(hand, su) + D.bySuit(hand, su).length * 0.05;
    if (t > v) { v = t; best = su; }
  }
  return { suit: best, tricks: v };
}
function botBid(s, seat) {
  const { tricks } = bestTrump(s.hands[seat]);
  const p = D.partner(seat);
  if (s.bidder === p) return { type: 'pass' }; // partner holds the contract: don't push the price up
  const partnerHelp = s.bids[p] > 0 ? 3.4 : s.bids[p] === 0 ? 2.2 : 2.7;
  const can = Math.floor(tricks + partnerHelp + 0.15);
  const need = Math.max(MIN_BID, s.highBid + 1);
  if (can >= need && need <= MAX_BID) return { type: 'bid', bid: need };
  return { type: 'pass' };
}
function botAction(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || curSeat(s) !== seat) return null;
  if (s.phase === 'bid') return botBid(s, seat);
  if (s.phase === 'trump') return { type: 'trump', suit: bestTrump(s.hands[seat]).suit };
  return { type: 'play', card: D.botTrickPlay(s, seat, { wantTrumpLead: D.teamOf(seat) === D.teamOf(s.bidder) }) };
}

function view(s, pid) {
  const cs = curSeat(s);
  const v = C.baseView(s, pid, cs);
  return {
    ...v, game: 'tarneeb', target: s.target, scores: s.scores, history: s.history,
    bids: s.bids, highBid: s.highBid, bidder: s.bidder, bid: s.bid, winTeam: s.winTeam,
    bidOptions: v.me >= 0 ? bidOptions(s, v.me) : [],
  };
}

module.exports = {
  slug: 'tarneeb', name: 'طرنيب', minPlayers: 4, maxPlayers: 4, turnMs: 25000,
  options: { bestOf: TARGETS }, // the room's numeric option = target score
  setup, current, actions, apply, leave: C.leave, botAction, view, result: C.teamResult,
  _internal: { curSeat, endHand, startHand, bestTrump, botBid, TARGETS },
};
