'use strict';
// «تركس» — 4 players, each for themselves, 13 cards each. Rules implemented (common Lebanese / Syrian «تركس»):
//   * 4 kingdoms («ممالك»). Seat 0 owns the first kingdom, then seat 1, 2, 3 (to the right). Each kingdom has the same
//     5 contracts and the owner plays each one once, in the order they choose after seeing their new hand:
//       ملك الكبّة (king)    whoever takes K♥ in a trick: −75. The hand stops once K♥ is taken.
//       البنات (queens)      each queen taken: −25. Stops once all 4 queens are taken.
//       الديناري (diamonds)  each ♦ taken: −10. Stops once all 13 diamonds are taken.
//       اللطوش (tricks)      each trick taken: −15 (all 13 tricks are played).
//       تركس (trix)          layout game: +200 / +150 / +100 / +50 by the order players go out.
//     A kingdom's 5 contracts add up to zero (−500 penalties, +500 trix), 20 hands in all.
//   * Trick contracts: no trumps, follow suit if you can, highest card of the suit led wins; the owner leads first.
//   * Doubling («دبل»), only in King and Queens: right after the owner picks the contract, every player holding K♥
//     (King) / a queen (Queens) may double it, in turn from the owner; doubled cards are shown to everyone.
//     A doubled card is worth double to whoever takes it (K♥ −150, queen −50), and if the taker is not the one who
//     doubled, the doubler earns the base value (K♥ +75, queen +25). Taking your own doubled card: just the double penalty.
//   * Trix: the four jacks start the four rows; a row grows up from its jack (Q K A) and down (10 9 … 2) one card at a
//     time. In turn from the owner, you must lay a legal card if you have one, otherwise you pass (passes are automatic).
//     First player out +200, second +150, third +100, last +50.
//   * Highest total after the 20 hands wins; equal top scores = draw.
// Bots pick the contract their hand suits best, double when the card is well guarded, duck under winners, dump
// penalty cards on other players' tricks, and in trix keep their own runs flowing.
const D = require('./deck');
const C = require('./common');
const { gameErr } = require('../util');

const CONTRACTS = ['king', 'queens', 'diamonds', 'tricks', 'trix'];
const NAMES = { king: 'ملك الكبّة', queens: 'البنات', diamonds: 'الديناري', tricks: 'اللطوش', trix: 'تركس' };
const TRIX_POINTS = [200, 150, 100, 50];
const isQueen = (c) => c[0] === 'Q';

function setup(pids) {
  const s = {
    game: 'trix', seats: pids.slice(0, 4), scores: [0, 0, 0, 0], round: 0, history: [], over: false,
    gone: [false, false, false, false], kingdom: 0, done: [[], [], [], []], phase: 'choose', contract: null,
    doubled: {}, dblQueue: [], layout: null, finished: [], trump: null, dealer: D.N - 1,
  };
  startDeal(s, []);
  return s;
}
const owner = (s) => s.kingdom;
function startDeal(s, events) {
  s.round++;
  D.freshDeal(s, (owner(s) + D.N - 1) % D.N);
  s.phase = 'choose'; s.contract = null; s.doubled = {}; s.dblQueue = []; s.layout = null; s.finished = []; s.trump = null;
  s.turn = owner(s);
  events.push({ t: 'deal', round: s.round, owner: owner(s) });
}
const curSeat = (s) => (s.over ? -1 : s.phase === 'choose' ? owner(s) : s.phase === 'double' ? s.dblQueue[0] : s.turn);
const current = (s) => (s.over ? null : s.seats[curSeat(s)]);
const remaining = (s) => CONTRACTS.filter((c) => !s.done[owner(s)].includes(c));
const doubleable = (s, seat) => s.hands[seat].filter((c) => (s.contract === 'king' ? c === 'KH' : s.contract === 'queens' ? isQueen(c) : false));

// ---------------------------------------------------------------- trix layout
function trixLegal(hand, layout) {
  return hand.filter((c) => {
    const row = layout[D.suitOf(c)], r = D.rankOf(c);
    if (!row) return r === 11;
    return r === row.hi + 1 || r === row.lo - 1;
  });
}
// Moves the turn to the next player still in who can lay a card; players who cannot are passed automatically.
function trixAdvance(s, from, events) {
  let x = from;
  for (let k = 0; k < 8; k++) {
    x = D.next(x);
    if (s.finished.includes(x)) continue;
    if (trixLegal(s.hands[x], s.layout).length) { s.turn = x; return; }
    events.push({ t: 'tpass', seat: x });
  }
  throw new Error('trix: nobody can play'); // cannot happen: an unplayed card always extends a row or is a jack
}

function subsets(list) {
  const out = [];
  for (let m = 0; m < 1 << list.length; m++) out.push(list.filter((_, i) => m & (1 << i)));
  return out;
}
function actions(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || curSeat(s) !== seat) return [];
  if (s.phase === 'choose') return remaining(s).map((c) => ({ type: 'contract', contract: c }));
  if (s.phase === 'double') return subsets(doubleable(s, seat)).map((cards) => ({ type: 'double', cards }));
  if (s.phase === 'trix') return trixLegal(s.hands[seat], s.layout).map((card) => ({ type: 'play', card }));
  return D.legalPlays(s.hands[seat], s.trick).map((card) => ({ type: 'play', card }));
}

function beginPlay(s, events) {
  if (s.contract === 'trix') {
    s.phase = 'trix';
    s.layout = { S: null, H: null, D: null, C: null };
    s.finished = [];
    if (trixLegal(s.hands[owner(s)], s.layout).length) s.turn = owner(s);
    else { events.push({ t: 'tpass', seat: owner(s) }); trixAdvance(s, owner(s), events); }
    return;
  }
  s.phase = 'play';
  s.turn = owner(s); // the owner leads
}

function apply(s, pid, a) {
  const seat = C.seatFor(s, pid);
  C.needTurn(s, seat, curSeat(s));
  const type = a && a.type;
  const events = [];
  if (s.phase === 'choose') {
    if (type !== 'contract' || !remaining(s).includes(a.contract)) throw gameErr('اختار لعبة من المملكة');
    s.contract = a.contract;
    s.done[seat].push(a.contract);
    events.push({ t: 'contract', seat, contract: a.contract });
    if (s.contract === 'king' || s.contract === 'queens') {
      for (let k = 0, x = owner(s); k < D.N; k++, x = D.next(x)) if (doubleable(s, x).length) s.dblQueue.push(x);
      if (s.dblQueue.length) { s.phase = 'double'; return events; }
    }
    beginPlay(s, events);
    return events;
  }
  if (s.phase === 'double') {
    if (type !== 'double') throw gameErr('دبّل أو لا؟');
    const can = doubleable(s, seat);
    const cards = Array.isArray(a.cards) ? [...new Set(a.cards.map(String))] : [];
    if (cards.some((c) => !can.includes(c))) throw gameErr('ما فيك تدبّل هالورقة');
    for (const c of cards) s.doubled[c] = seat;
    events.push({ t: 'double', seat, cards });
    s.dblQueue.shift();
    if (!s.dblQueue.length) beginPlay(s, events);
    return events;
  }
  if (type !== 'play') throw gameErr('العب ورقة');
  if (s.phase === 'trix') {
    const card = String(a.card || '');
    const hand = s.hands[seat];
    if (!hand.includes(card)) throw gameErr('هالورقة مو معك');
    if (!trixLegal(hand, s.layout).includes(card)) throw gameErr('هالورقة ما بتنحط هلق — لازم شب أو ورقة لاصقة بالصف');
    hand.splice(hand.indexOf(card), 1);
    const su = D.suitOf(card), r = D.rankOf(card);
    const row = s.layout[su];
    if (!row) s.layout[su] = { lo: 11, hi: 11 };
    else if (r > row.hi) row.hi = r; else row.lo = r;
    s.played.push(card);
    events.push({ t: 'lay', seat, card });
    if (!hand.length) {
      s.finished.push(seat);
      events.push({ t: 'out', seat, place: s.finished.length });
      if (s.finished.length === D.N - 1) {
        const lastSeat = [0, 1, 2, 3].find((x) => !s.finished.includes(x));
        s.finished.push(lastSeat);
        events.push({ t: 'out', seat: lastSeat, place: D.N });
        endContract(s, events);
        return events;
      }
    }
    trixAdvance(s, seat, events);
    return events;
  }
  D.playCard(s, seat, a.card, events);
  if (s.trick.length === 0 && contractDone(s)) endContract(s, events);
  return events;
}

function contractDone(s) {
  if (s.trickNo === 13) return true;
  const taken = [].concat(...s.taken);
  if (s.contract === 'king') return taken.includes('KH');
  if (s.contract === 'queens') return taken.filter(isQueen).length === 4;
  if (s.contract === 'diamonds') return taken.filter((c) => D.suitOf(c) === 'D').length === 13;
  return false;
}
function contractScore(s) {
  const delta = [0, 0, 0, 0];
  if (s.contract === 'trix') {
    s.finished.forEach((x, i) => { delta[x] += TRIX_POINTS[i]; });
    return delta;
  }
  for (let x = 0; x < D.N; x++) {
    for (const c of s.taken[x]) {
      const d = s.doubled[c];
      if (s.contract === 'king' && c === 'KH') {
        if (d === undefined) delta[x] -= 75;
        else { delta[x] -= 150; if (d !== x) delta[d] += 75; }
      } else if (s.contract === 'queens' && isQueen(c)) {
        if (d === undefined) delta[x] -= 25;
        else { delta[x] -= 50; if (d !== x) delta[d] += 25; }
      } else if (s.contract === 'diamonds' && D.suitOf(c) === 'D') delta[x] -= 10;
    }
    if (s.contract === 'tricks') delta[x] -= 15 * s.tricks[x];
  }
  return delta;
}
function endContract(s, events) {
  const delta = contractScore(s);
  for (let x = 0; x < D.N; x++) s.scores[x] += delta[x];
  const row = {
    round: s.round, owner: owner(s), contract: s.contract, delta, scores: s.scores.slice(),
    doubled: { ...s.doubled }, tricks: s.tricks.slice(), finished: s.finished.slice(),
  };
  s.history.push(row);
  events.push({ t: 'hand', ...row });
  if (s.done[owner(s)].length === CONTRACTS.length) {
    s.kingdom++;
    if (s.kingdom === D.N) {
      s.over = true; s.phase = 'over';
      events.push({ t: 'over' });
      return;
    }
    events.push({ t: 'kingdom', owner: s.kingdom });
  }
  startDeal(s, events);
}

// ---------------------------------------------------------------- bots
const AVG = { king: -18.75, queens: -25, diamonds: -32.5, tricks: -48.75, trix: 125 };
function estimate(hand, c) {
  const len = (su) => D.bySuit(hand, su).length;
  const has = (x) => hand.includes(x);
  const highs = hand.filter((x) => D.rankOf(x) >= 12);
  if (c === 'king') {
    const h = len('H');
    if (has('KH')) return -75 * (h <= 2 ? 0.75 : h <= 4 ? 0.4 : 0.25);
    return -75 * (0.12 + (has('AH') ? 0.25 : 0) + (h === 0 ? 0.05 : 0));
  }
  if (c === 'queens') {
    let e = 0;
    for (const q of hand.filter(isQueen)) { const l = len(D.suitOf(q)); e -= 25 * (l <= 2 ? 0.8 : l <= 3 ? 0.5 : 0.3); }
    for (const x of hand.filter((y) => D.rankOf(y) >= 13)) e -= 25 * (len(D.suitOf(x)) <= 2 ? 0.3 : 0.15);
    return e;
  }
  if (c === 'diamonds') {
    const d = D.bySuit(hand, 'D');
    return -10 * (d.filter((x) => D.rankOf(x) >= 10).length * 1.3 + d.length * 0.35 + highs.filter((x) => D.suitOf(x) !== 'D').length * 0.25);
  }
  if (c === 'tricks') return -15 * (hand.filter((x) => x[0] === 'A').length + hand.filter((x) => x[0] === 'K').length * 0.7 + hand.filter((x) => x[0] === 'Q').length * 0.35 + 1);
  // trix: jacks and cards next to them get you out early
  let t = 0;
  for (const su of D.SUITS) {
    if (has('J' + su)) t += 1.5 + (has('Q' + su) ? 0.5 : 0) + (has('T' + su) ? 0.5 : 0);
  }
  const lows = hand.filter((x) => D.rankOf(x) <= 4 || D.rankOf(x) === 14).length;
  return 60 + t * 28 - lows * 6;
}
function botContract(s, seat) {
  const hand = s.hands[seat];
  let best = null, bv = -Infinity;
  for (const c of remaining(s)) {
    const v = estimate(hand, c) - AVG[c];
    if (v > bv) { bv = v; best = c; }
  }
  return { type: 'contract', contract: best };
}
function botDouble(s, seat) {
  const hand = s.hands[seat];
  const len = (su) => D.bySuit(hand, su).length;
  const cards = doubleable(s, seat).filter((c) => {
    if (c === 'KH') {
      const shortSide = Math.min(...['S', 'D', 'C'].map(len));
      return len('H') >= 4 || (shortSide <= 1 && len('H') >= 2);
    }
    return len(D.suitOf(c)) >= 4 && !hand.includes('A' + D.suitOf(c)) && !hand.includes('K' + D.suitOf(c));
  });
  return { type: 'double', cards };
}
function penalty(s, c) {
  const k = s.doubled[c] !== undefined ? 2 : 1;
  if (s.contract === 'king') return c === 'KH' ? 75 * k : 0;
  if (s.contract === 'queens') return isQueen(c) ? 25 * k : 0;
  if (s.contract === 'diamonds') return D.suitOf(c) === 'D' ? 10 : 0;
  return 0;
}
function botAvoidPlay(s, seat) {
  const hand = s.hands[seat];
  const legal = D.legalPlays(hand, s.trick);
  if (legal.length === 1) return legal[0];
  const r = D.rankOf;
  const out = (su) => 13 - D.bySuit(s.played, su).length - D.bySuit(hand, su).length; // cards of the suit still with the others
  if (!s.trick.length) {
    if (s.contract === 'king' && !hand.includes('KH') && !s.played.includes('KH')) {
      const hearts = legal.filter((c) => D.suitOf(c) === 'H' && r(c) < 13);
      if (hearts.length) return D.low(hearts); // flush the king out
    }
    if (s.contract === 'queens') {
      // lead low under queens we don't hold, to make their holders take them
      const safe = legal.filter((c) => !isQueen(c) && r(c) < 12 && out(D.suitOf(c)) > 0);
      if (safe.length) return safe.sort((a, b) => r(a) - r(b) || out(D.suitOf(b)) - out(D.suitOf(a)))[0];
    }
    const pool = legal.filter((c) => penalty(s, c) === 0 && out(D.suitOf(c)) > 0);
    const list = pool.length ? pool : legal;
    return list.slice().sort((a, b) => r(a) - r(b) || out(D.suitOf(b)) - out(D.suitOf(a)))[0];
  }
  const led = D.suitOf(s.trick[0].card);
  const win = s.trick[D.trickWinner(s.trick, null)];
  const last = s.trick.length === D.N - 1;
  if (legal.every((c) => D.suitOf(c) === led)) {
    const ducks = legal.filter((c) => r(c) < r(win.card));
    if (ducks.length) {
      // under someone else's winner: unload the most expensive card we can
      return ducks.slice().sort((a, b) => penalty(s, b) - penalty(s, a) || r(b) - r(a))[0];
    }
    const clean = legal.filter((c) => penalty(s, c) === 0);
    if (last) {
      const trickPen = s.trick.reduce((n, x) => n + penalty(s, x.card), 0);
      void trickPen; // we take it anyway: shed our highest clean card
      return clean.length ? D.high(clean) : D.low(legal);
    }
    return clean.length ? D.low(clean) : D.low(legal);
  }
  // void in the led suit: throw the most dangerous card
  const lenOf = (c) => D.bySuit(hand, D.suitOf(c)).length;
  return legal.slice().sort((a, b) => penalty(s, b) - penalty(s, a) || r(b) - r(a) || lenOf(a) - lenOf(b))[0];
}
function botTrix(s, seat) {
  const hand = s.hands[seat];
  const legal = trixLegal(hand, s.layout);
  const score = (c) => {
    const su = D.suitOf(c), rk = D.rankOf(c);
    const own = (x) => x >= 2 && x <= 14 && hand.includes(D.RANKS[x - 2] + su);
    if (rk === 11) return (own(12) ? 2.5 : -1.5) + (own(10) ? 2.5 : -1.5);
    const nxt = rk > 11 ? rk + 1 : rk - 1;
    if (rk === 14 || rk === 2) return 2;
    let v = own(nxt) ? 3 : -1;
    // run length we can lay on our own in that direction
    for (let x = nxt; own(x); x += rk > 11 ? 1 : -1) v += 0.5;
    return v;
  };
  return legal.slice().sort((a, b) => score(b) - score(a))[0];
}
function botAction(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || curSeat(s) !== seat) return null;
  if (s.phase === 'choose') return botContract(s, seat);
  if (s.phase === 'double') return botDouble(s, seat);
  if (s.phase === 'trix') return { type: 'play', card: botTrix(s, seat) };
  return { type: 'play', card: botAvoidPlay(s, seat) };
}

function view(s, pid) {
  const cs = curSeat(s);
  const v = C.baseView(s, pid, cs);
  const mine = v.me >= 0 && v.me === cs && !s.over;
  return {
    ...v, game: 'trix', scores: s.scores, history: s.history, kingdom: s.kingdom, owner: s.over ? -1 : owner(s),
    done: s.done, contract: s.contract, doubled: s.doubled, layout: s.layout, finished: s.finished,
    legal: mine && s.phase === 'trix' ? trixLegal(s.hands[v.me], s.layout) : v.legal,
    contracts: mine && s.phase === 'choose' ? remaining(s) : [],
    canDouble: mine && s.phase === 'double' ? doubleable(s, v.me) : [],
    dblWaiting: s.phase === 'double' ? s.dblQueue.length : 0,
  };
}
function result(s) {
  if (!s.over) return null;
  const order = [0, 1, 2, 3].sort((a, b) => s.gone[a] - s.gone[b] || s.scores[b] - s.scores[a]);
  const top = order[0];
  const tie = order.filter((x) => !s.gone[x] && s.scores[x] === s.scores[top]).length > 1;
  return {
    winner: s.gone[top] || tie ? null : s.seats[top], draw: s.gone[top] || tie, ranking: order.map((x) => s.seats[x]),
    rounds: s.round, scores: s.scores.slice(),
  };
}

module.exports = {
  slug: 'trix', name: 'تركس', minPlayers: 4, maxPlayers: 4, turnMs: 25000,
  setup, current, actions, apply, leave: C.leave, botAction, view, result,
  _internal: { CONTRACTS, NAMES, trixLegal, contractScore, contractDone, endContract, startDeal, curSeat, estimate, botAvoidPlay },
};
