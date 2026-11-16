'use strict';
// Shared deck + trick engine for the card games («طرنيب»، «أربعمية»، «تركس»). Pure: no timers, no I/O.
// A card is a 2-letter string <rank><suit>: rank in 2 3 4 5 6 7 8 9 T J Q K A, suit in S H D C
// (the same names as the card images: /cards/AS.webp). Seats 0..3 in play order: the next player is
// seat + 1 (shown to the player's right, counter-clockwise, like the Levantine games). Partners sit opposite
// (seat and seat + 2).
const crypto = require('crypto');
const { gameErr } = require('../util');

const RANKS = '23456789TJQKA';
const SUITS = 'SHDC';
const SUIT_NAME = { S: 'بستوني', H: 'كبّة', D: 'ديناري', C: 'سباتي' };
const N = 4;

const rankOf = (c) => RANKS.indexOf(c[0]) + 2;   // 2..14 (A = 14)
const suitOf = (c) => c[1];
const next = (seat) => (seat + 1) % N;
const partner = (seat) => (seat + 2) % N;
const teamOf = (seat) => seat % 2;
const isCard = (c) => typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);

function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}
// Fisher–Yates with crypto randomness (tests may pass their own `rand(n)` -> [0, n)).
function shuffle(list, rand = (n) => crypto.randomInt(n)) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 4 hands of 13, dealt one at a time starting with the player after the dealer.
function deal(dealer = N - 1, rand) {
  const d = shuffle(newDeck(), rand);
  const hands = [[], [], [], []];
  let seat = next(dealer);
  for (const c of d) { hands[seat].push(c); seat = next(seat); }
  return hands.map((h) => sortHand(h));
}
// Display order: suits alternate colour (♠ ♥ ♣ ♦), high cards first inside a suit.
const SORT_SUITS = 'SHCD';
function sortHand(hand) {
  return hand.slice().sort((a, b) => SORT_SUITS.indexOf(suitOf(a)) - SORT_SUITS.indexOf(suitOf(b)) || rankOf(b) - rankOf(a));
}

// Must follow the led suit when you can; otherwise anything goes.
function legalPlays(hand, trick) {
  if (!trick.length) return hand.slice();
  const led = suitOf(trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand.slice();
}
// Does `c` beat `best` in a trick led with `led` (trump may be null)?
function beats(c, best, led, trump) {
  const cs = suitOf(c), bs = suitOf(best);
  if (cs === bs) return rankOf(c) > rankOf(best);
  if (trump && cs === trump) return true;
  return false; // a card of another non-trump suit never beats (`led` kept for clarity at call sites)
}
// Index (into `trick`) of the card that wins it.
function trickWinner(trick, trump) {
  const led = suitOf(trick[0].card);
  let w = 0;
  for (let i = 1; i < trick.length; i++) if (beats(trick[i].card, trick[w].card, led, trump)) w = i;
  return w;
}

// ---------------------------------------------------------------- shared trick play on a state
// Uses s.hands, s.trick [{seat, card}], s.turn, s.trump, s.played (cards seen this deal), s.tricks (count per seat),
// s.taken (cards captured per seat), s.lastTrick, s.trickNo. Returns the winning seat when the trick is complete, else -1.
function playCard(s, seat, card, events) {
  if (!isCard(card)) throw gameErr('ورقة غلط');
  const hand = s.hands[seat];
  if (!hand.includes(card)) throw gameErr('هالورقة مو معك');
  if (!legalPlays(hand, s.trick).includes(card)) throw gameErr(`لازم تلعب ${SUIT_NAME[suitOf(s.trick[0].card)]} إذا معك`);
  hand.splice(hand.indexOf(card), 1);
  s.trick.push({ seat, card });
  s.played.push(card);
  if (s.trick.length > 1 && suitOf(card) !== suitOf(s.trick[0].card) && !s.voids[seat].includes(suitOf(s.trick[0].card))) s.voids[seat].push(suitOf(s.trick[0].card));
  events.push({ t: 'play', seat, card });
  if (s.trick.length < N) { s.turn = next(seat); return -1; }
  const w = s.trick[trickWinner(s.trick, s.trump)].seat;
  s.tricks[w]++;
  for (const x of s.trick) s.taken[w].push(x.card);
  s.lastTrick = { cards: s.trick, winner: w, no: s.trickNo };
  s.trickNo++;
  events.push({ t: 'trick', winner: w, cards: s.trick.map((x) => x.card) });
  s.trick = [];
  s.turn = w;
  return w;
}
function freshDeal(s, dealer, rand) {
  s.dealer = dealer;
  s.hands = deal(dealer, rand);
  s.trick = []; s.played = []; s.tricks = [0, 0, 0, 0]; s.taken = [[], [], [], []];
  s.lastTrick = null; s.trickNo = 0; s.voids = [[], [], [], []];
}

// ---------------------------------------------------------------- bot card sense (trick-winning games)
// A card is a "master" when every higher card of its suit is already played or in our own hand.
function isMaster(card, hand, played) {
  const su = suitOf(card);
  for (let r = rankOf(card) + 1; r <= 14; r++) {
    const c = RANKS[r - 2] + su;
    if (!played.includes(c) && !hand.includes(c)) return false;
  }
  return true;
}
const low = (cards) => cards.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
const high = (cards) => cards.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
const bySuit = (cards, su) => cards.filter((c) => suitOf(c) === su);
// Cheapest card: non-trumps before trumps, then by rank.
const cheapest = (cards, trump) => cards.slice().sort((a, b) => (suitOf(a) === trump) - (suitOf(b) === trump) || rankOf(a) - rankOf(b))[0];
// Card to throw away when we cannot (or need not) win: lowest card of the shortest non-trump suit
// (that builds voids for trumping later); trumps only when nothing else is left.
function discard(hand, cards, trump) {
  const side = cards.filter((c) => suitOf(c) !== trump);
  const pool = side.length ? side : cards;
  return pool.slice().sort((a, b) => bySuit(hand, suitOf(a)).length - bySuit(hand, suitOf(b)).length || rankOf(a) - rankOf(b))[0];
}

// The play for a team game where every trick counts (طرنيب، أربعمية). `wantTrumpLead` = this side should pull trumps.
function botTrickPlay(s, seat, { wantTrumpLead = false } = {}) {
  const hand = s.hands[seat], trump = s.trump, played = s.played;
  const legal = legalPlays(hand, s.trick);
  if (legal.length === 1) return legal[0];
  if (!s.trick.length) {
    const masters = legal.filter((c) => isMaster(c, hand, played));
    const trumpsOut = 13 - bySuit(played, trump).length - bySuit(hand, trump).length;
    const sideMasters = masters.filter((c) => suitOf(c) !== trump);
    const trumpMasters = masters.filter((c) => suitOf(c) === trump);
    // pull the opponents' trumps first when we hold the top trump and trumps are still out
    if (trumpMasters.length && trumpsOut > 0 && (wantTrumpLead || bySuit(hand, trump).length >= 4)) return high(trumpMasters);
    if (sideMasters.length) {
      // cash a winner in a suit the others still hold (a suit everybody else is void in would just get trumped)
      const safe = sideMasters.filter((c) => 13 - bySuit(played, suitOf(c)).length - bySuit(hand, suitOf(c)).length > 0);
      if (safe.length && trumpsOut === 0) return high(safe);
      if (safe.length) return safe.sort((a, b) => bySuit(played, suitOf(a)).length - bySuit(played, suitOf(b)).length)[0];
    }
    const side = legal.filter((c) => suitOf(c) !== trump);
    if (!side.length) return trumpMasters.length ? high(trumpMasters) : low(legal);
    // lead low from our longest side suit (keeps honours for later, finds partner's winners)
    let best = null;
    for (const su of SUITS) {
      if (su === trump) continue;
      const cs = bySuit(side, su);
      if (cs.length && (!best || cs.length > best.length)) best = cs;
    }
    return low(best);
  }
  const led = suitOf(s.trick[0].card);
  const win = s.trick[trickWinner(s.trick, trump)];
  const last = s.trick.length === N - 1;
  const winners = legal.filter((c) => beats(c, win.card, led, trump));
  const following = legal.every((c) => suitOf(c) === led);
  const throwAway = () => (following ? low(legal) : discard(hand, legal, trump));
  if (win.seat === partner(seat)) {
    // partner has it: don't waste a card unless the last opponent can still take it
    const opp = next(seat);
    const trumpsOut = trump ? 13 - bySuit(played, trump).length - bySuit(hand, trump).length : 0;
    const oppCanTrump = !!trump && suitOf(win.card) !== trump && trumpsOut > 0 && s.voids[opp].includes(led) && !s.voids[opp].includes(trump);
    if (last || (isMaster(win.card, hand, played) && !oppCanTrump) || !winners.length) return throwAway();
    const sure = winners.filter((c) => suitOf(c) === led && isMaster(c, hand, played));
    return sure.length ? cheapest(sure, trump) : throwAway();
  }
  if (winners.length) {
    if (last) return cheapest(winners, trump);
    const ledW = winners.filter((c) => suitOf(c) === led);
    if (ledW.length) {
      const sure = ledW.filter((c) => isMaster(c, hand, played));
      if (sure.length) return cheapest(sure, trump);
      return s.trick.length === 1 ? low(legal) : high(ledW); // second hand low, third hand high
    }
    return cheapest(winners, trump); // void in the led suit: ruff as cheaply as possible
  }
  return throwAway();
}

// Rough count of tricks a hand takes with `trump` as trumps (bidding helper).
function handTricks(hand, trump) {
  let t = 0;
  for (const su of SUITS) {
    const cs = bySuit(hand, su);
    const len = cs.length;
    const has = (r) => cs.some((c) => c[0] === r);
    if (su === trump) {
      t += (has('A') ? 1 : 0) + (has('K') ? (len >= 2 ? 0.9 : 0.4) : 0) + (has('Q') ? (len >= 3 ? 0.6 : 0.2) : 0) + (has('J') && len >= 4 ? 0.3 : 0);
      t += Math.max(0, len - 3) * 0.9;
    } else {
      t += (has('A') ? 0.95 : 0) + (has('K') ? (len >= 2 ? 0.7 : 0.25) : 0) + (has('Q') && len >= 3 && (has('K') || has('A')) ? 0.35 : 0);
      if (trump && len <= 1) {
        const tl = bySuit(hand, trump).length;
        if (tl >= 3) t += (len === 0 ? 0.8 : 0.45) * Math.min(1, (tl - 2) / 2);
      }
    }
  }
  return t;
}

module.exports = {
  RANKS, SUITS, SUIT_NAME, N, rankOf, suitOf, next, partner, teamOf, isCard,
  newDeck, shuffle, deal, sortHand, legalPlays, beats, trickWinner, playCard, freshDeal,
  isMaster, low, high, bySuit, cheapest, discard, botTrickPlay, handTricks,
};
