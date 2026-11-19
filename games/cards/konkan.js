'use strict';
// «كونكان» (Konkan / Conquian) — Levantine rummy, 2–4 players, each for themselves.
// Rules implemented (Jawaker's «قوانين لعبة الكونكان», blog.jawaker.com/concan-rules, cross-checked with
// dananeer.io/ar/games/konkan, balotk.com/games/kankan and the Lebanese «14» / Quatorze on Wikipedia):
//   * Deck: two 52-card packs + 2 jokers = 106 cards, crypto shuffle. Card values: 2–10 face value, J Q K = 10,
//     A = 11 (1 when it is the low ace of an A-2-3 run), joker = 15 in hand / the card it stands for in a meld.
//   * Deal: 14 cards each; the player after the dealer (on the dealer's right) gets 15 and starts by discarding,
//     without drawing. The rest is the face-down stock; the discards form the face-up pile («الأرض»).
//     The deal moves one seat every round.
//   * Turn: draw the top stock card OR take the top discard, lay down / lay off if you want, then discard one card.
//     Taking the discard is allowed only to use it on the table in the same turn: the player's next table action
//     must contain that card (a not-yet-opened player must open with it). The server refuses the take when no such
//     use exists, and «رجّعها» puts the card back (then you draw from the stock) as long as nothing was laid.
//   * Melds: a run («سلسلة») = 3–13 consecutive cards of one suit (A-2-3 … Q-K-A, no wrap-around);
//     a set («مجموعة») = 3–4 cards of one rank in different suits. A joker stands for any card, but every meld needs
//     at least 2 real cards. In a run the joker fills the gap, otherwise it extends the top end (the bottom when the
//     top is already the ace).
//   * Opening («النزول»): the first lay-down must total at least 51 points (room option: 71, «كونكان 71»), in one
//     move — any number of melds together. Before opening you cannot lay off.
//   * After opening: lay new melds freely and lay off cards on any meld on the table (yours or others').
//     Joker swap: a joker in a run is taken back by laying the real card it stands for (it goes to your hand);
//     in a 3-card set (2 real + joker) only by laying BOTH missing suits; a joker in a 4-card set stays.
//   * You must keep one card to discard: you go out by discarding your last card. That ends the round.
//   * Round score (lowest wins): the player who goes out −30. Others: the value of the cards left in hand when they
//     opened, +100 when they never opened. «هاند» (all cards laid in one turn by a player who had not opened, without
//     laying off on other players' melds): −60, and every other score is doubled (+200 for unopened players).
//     «كونكان» (a hand made of exactly one run of 10+ cards and one set: 10 + 4 or 11 + 3): −60 and every other
//     player +200; in the last round it wins the whole game.
//   * Stock exhausted: the discards (all but the top one) are reshuffled, at most twice a round; the third time the
//     round is void (0 for everybody).
//   * 5 rounds; the lowest total wins (equal lowest = draw). Players who gave up («انسحاب») rank last.
// Left out on purpose: Jawaker's team mode and its «طلب الكونكان» call in round 5 (the konkan simply counts when made).
// Bots: an exact meld planner (best partition of the hand into melds), take the discard only when it is used at once,
// open as soon as they reach the minimum, lay down and lay off everything they can, take jokers back, keep partial
// melds and throw the most expensive loose card that does not feed the next player.
const D = require('./deck');
const C = require('./common');
const { gameErr } = require('../util');

const JOKER = 'XX';
const OPENS = [51, 71];
const ROUNDS = 5;
const MAX_RESHUFFLES = 2;
const HAND_SIZE = 14;
const SUITS = 'SHCD'; // display / sort order (suits alternate light and deep blue)

const isJoker = (c) => c === JOKER;
const isCardK = (c) => isJoker(c) || D.isCard(c);
const rankNum = (c) => D.rankOf(c); // 2..14 (A = 14)
const rankCode = (n) => (n === 1 || n === 14 ? 'A' : D.RANKS[n - 2]);
// What a card costs left in hand at the end of a round.
const penalty = (c) => (isJoker(c) ? 15 : c[0] === 'A' ? 11 : Math.min(10, rankNum(c)));
// Value of a position in a meld (opening count): n = 1..14, the low ace is 1.
const posValue = (n) => (n === 1 ? 1 : n === 14 ? 11 : Math.min(10, n));

function fullDeck() {
  return [...D.newDeck(), ...D.newDeck(), JOKER, JOKER];
}
function sortHand(hand) {
  const key = (c) => (isJoker(c) ? 99 : SUITS.indexOf(c[1]) * 20 + rankNum(c));
  return hand.slice().sort((a, b) => key(a) - key(b));
}
// Multiset helpers (two packs: a hand may hold the same card twice).
function hasAll(hand, cards) {
  const left = hand.slice();
  for (const c of cards) {
    const i = left.indexOf(c);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}
function removeAll(hand, cards) {
  for (const c of cards) hand.splice(hand.indexOf(c), 1);
}

// ---------------------------------------------------------------- melds
const setOrder = (cards) => cards.slice().sort((a, b) => (isJoker(a) - isJoker(b)) || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]));
// -> { type: 'set', rank, cards, reps, value } | { type: 'run', suit, lo, hi, cards, reps, value } | null
// `reps` = the card each slot stands for (a joker in a set stands for '<rank>*').
function parseMeld(cards) {
  if (!Array.isArray(cards) || cards.length < 3 || cards.length > 13 || !cards.every(isCardK)) return null;
  const real = cards.filter((c) => !isJoker(c));
  const jokers = cards.length - real.length;
  if (real.length < 2) return null;
  const r0 = real[0][0];
  if (real.every((c) => c[0] === r0)) {
    if (cards.length > 4 || new Set(real.map((c) => c[1])).size !== real.length) return null;
    const ordered = setOrder(cards);
    const reps = ordered.map((c) => (isJoker(c) ? r0 + '*' : c));
    return { type: 'set', rank: r0, cards: ordered, reps, value: cards.length * posValue(rankNum(real[0])) };
  }
  const su = real[0][1];
  if (!real.every((c) => c[1] === su)) return null;
  for (const aceHigh of [true, false]) {
    const nums = real.map((c) => (c[0] === 'A' && !aceHigh ? 1 : rankNum(c))).sort((a, b) => a - b);
    if (nums.some((n, i) => i && n === nums[i - 1])) continue;
    const lo = nums[0], hi = nums[nums.length - 1];
    const gaps = hi - lo + 1 - nums.length;
    if (gaps > jokers) continue;
    let extra = jokers - gaps, top = hi, bottom = lo;
    const maxR = aceHigh ? 14 : 13, minR = aceHigh ? 2 : 1;
    while (extra > 0 && top < maxR) { top++; extra--; }
    while (extra > 0 && bottom > minR) { bottom--; extra--; }
    if (extra > 0) continue;
    const out = [], reps = [];
    let value = 0;
    for (let n = bottom; n <= top; n++) {
      const rep = rankCode(n) + su;
      out.push(nums.includes(n) ? rep : JOKER);
      reps.push(rep);
      value += posValue(n);
    }
    return { type: 'run', suit: su, lo: bottom, hi: top, cards: out, reps, value };
  }
  return null;
}
const meldValue = (cards) => { const p = parseMeld(cards); return p ? p.value : 0; };

// Laying `cards` (1 card, or 2 for a set's joker swap) on table meld `m`.
// -> { meld: updated copy, back: jokers returned to the hand } | null when it does not fit.
function tryLayoff(m, cards) {
  if (!Array.isArray(cards) || !cards.every(isCardK)) return null;
  if (cards.length === 2) {
    // a 3-card set with a joker: both missing suits take the joker back
    if (m.type !== 'set' || m.cards.length !== 3 || !m.cards.includes(JOKER) || cards.some(isJoker)) return null;
    if (!cards.every((c) => c[0] === m.rank) || cards[0][1] === cards[1][1]) return null;
    const real = m.cards.filter((c) => !isJoker(c));
    if (real.length !== 2 || cards.some((c) => real.some((x) => x[1] === c[1]))) return null;
    const all = setOrder([...real, ...cards]);
    return { meld: { ...m, cards: all, reps: all.slice() }, back: [JOKER] };
  }
  if (cards.length !== 1) return null;
  const c = cards[0];
  if (m.type === 'set') {
    if (m.cards.length >= 4) return null;
    if (!isJoker(c) && (c[0] !== m.rank || m.cards.some((x) => !isJoker(x) && x[1] === c[1]))) return null;
    const all = setOrder([...m.cards, c]);
    return { meld: { ...m, cards: all, reps: all.map((x) => (isJoker(x) ? m.rank + '*' : x)) }, back: [] };
  }
  const full = m.hi - m.lo >= 12;
  const at = (n, side) => {
    const rep = rankCode(n) + m.suit;
    return side > 0
      ? { meld: { ...m, hi: n, cards: [...m.cards, c], reps: [...m.reps, rep] }, back: [] }
      : { meld: { ...m, lo: n, cards: [c, ...m.cards], reps: [rep, ...m.reps] }, back: [] };
  };
  if (isJoker(c)) {
    if (full) return null;
    return m.hi < 14 ? at(m.hi + 1, 1) : at(m.lo - 1, -1);
  }
  if (c[1] !== m.suit) return null;
  const k = m.reps.findIndex((r, i) => isJoker(m.cards[i]) && r === c);
  if (k >= 0) { // the real card takes the joker's place
    const list = m.cards.slice();
    list[k] = c;
    return { meld: { ...m, cards: list }, back: [JOKER] };
  }
  if (full) return null;
  const r = rankNum(c);
  if (r === m.hi + 1) return at(r, 1);
  if (c[0] === 'A' && m.lo === 2) return at(1, -1);
  if (r === m.lo - 1) return at(r, -1);
  return null;
}

// ---------------------------------------------------------------- planner (bots + "can you use the discard?")
// Every meld that can be made from a hand, as card lists (duplicates in the hand are interchangeable).
function candidates(cnt, J) {
  const out = new Map();
  const add = (cards) => {
    const k = cards.slice().sort().join(',');
    if (out.has(k)) return;
    const p = parseMeld(cards);
    if (p) out.set(k, { cards, value: p.value, pen: cards.reduce((a, x) => a + penalty(x), 0), jokers: cards.filter(isJoker).length });
  };
  const js = (n) => Array(n).fill(JOKER);
  for (const r of D.RANKS) {
    const suits = [...SUITS].filter((s) => cnt.get(r + s) > 0);
    if (suits.length < 2) continue;
    for (let mask = 1; mask < 1 << suits.length; mask++) {
      const T = suits.filter((_, i) => mask & (1 << i)).map((s) => r + s);
      if (T.length < 2) continue;
      for (let j = 0; j <= Math.min(J, 4 - T.length); j++) if (T.length + j >= 3) add([...T, ...js(j)]);
    }
  }
  for (const su of SUITS) {
    const code = [];
    for (let n = 1; n <= 14; n++) code[n] = cnt.get(rankCode(n) + su) > 0 ? rankCode(n) + su : null;
    for (let a = 1; a <= 12; a++) {
      const real = [];
      let missing = 0;
      for (let b = a; b <= Math.min(14, a + 12); b++) {
        if (code[b]) real.push(code[b]); else missing++;
        if (missing > J) break;
        if (b - a >= 2 && real.length >= 2) add([...real, ...js(missing)]);
      }
    }
  }
  return [...out.values()];
}
// Best way to lay `hand` down as melds. score 'pen' = most penalty points off the hand, 'open' = highest opening
// count. `require` = this card must be in a meld; `keep` = cards that must stay in the hand (one to discard).
// -> { value, melds: [[cards]], used } | null when nothing satisfies the constraints.
function plan(hand, { require = null, score = 'pen', keep = 1 } = {}) {
  const cnt = new Map();
  let J = 0;
  for (const c of hand) if (isJoker(c)) J++; else cnt.set(c, (cnt.get(c) || 0) + 1);
  const cands = candidates(cnt, J);
  const order = [...cnt.keys()].sort();
  const pos = new Map(order.map((c, i) => [c, i]));
  const byFirst = new Map();
  for (const m of cands) {
    const first = m.cards.filter((x) => !isJoker(x)).reduce((a, x) => (pos.get(x) < pos.get(a) ? x : a));
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(m);
  }
  const val = (m) => (score === 'open' ? m.value : m.pen);
  for (const list of byFirst.values()) list.sort((a, b) => val(b) - val(a));
  let rem = hand.reduce((a, c) => a + penalty(c), 0); // upper bound of what is still to gain
  const total = hand.length;
  let best = null;
  const chosen = [];
  let nodes = 0;
  const fits = (m) => {
    const need = new Map();
    for (const x of m.cards) if (!isJoker(x)) need.set(x, (need.get(x) || 0) + 1);
    for (const [x, n] of need) if ((cnt.get(x) || 0) < n) return false;
    return true;
  };
  const take = (m, d) => { for (const x of m.cards) if (!isJoker(x)) cnt.set(x, cnt.get(x) + d); };
  function rec(i, jLeft, got, used) {
    if (++nodes > 60000) return; // safety valve (never reached by real hands)
    while (i < order.length && cnt.get(order[i]) === 0) i++;
    if (best && got + rem <= best.value) return;
    if (i === order.length) {
      if (total - used < keep) return;
      if (require && !chosen.some((m) => m.cards.includes(require))) return;
      if (!best || got > best.value) best = { value: got, melds: chosen.map((m) => m.cards.slice()), used };
      return;
    }
    const code = order[i];
    for (const m of byFirst.get(code) || []) {
      if (m.jokers > jLeft || !fits(m)) continue;
      const lost = m.pen;
      take(m, -1); chosen.push(m); rem -= lost;
      rec(i, jLeft - m.jokers, got + val(m), used + m.cards.length);
      take(m, 1); chosen.pop(); rem += lost;
    }
    cnt.set(code, cnt.get(code) - 1); rem -= penalty(code);
    rec(i, jLeft, got, used);
    cnt.set(code, cnt.get(code) + 1); rem += penalty(code);
  }
  rec(0, J, 0, 0);
  return best;
}

// ---------------------------------------------------------------- game state
function setup(pids, opts = {}) {
  const n = Math.max(2, Math.min(4, pids.length));
  const want = Number(opts.bestOf);
  const s = {
    game: 'konkan', seats: pids.slice(0, n), n, minOpen: OPENS.includes(want) ? want : 51, rounds: ROUNDS,
    round: 0, scores: Array(n).fill(0), history: [], over: false, gone: Array(n).fill(false), konkan: -1,
    dealer: n - 1, phase: 'play', turn: 0, hands: [], stock: [], discard: [], melds: [], mid: 0, opened: [],
    reshuffles: 0, mustUse: null, tStartOpened: false, tOther: false, tMelds: [], lastDiscard: null,
  };
  startRound(s, []);
  return s;
}
const nextSeat = (s, x) => (x + 1) % s.n;
function startRound(s, events) {
  s.round++;
  if (s.round > 1) s.dealer = nextSeat(s, s.dealer);
  const deck = D.shuffle(fullDeck());
  s.hands = s.seats.map(() => []);
  const first = nextSeat(s, s.dealer);
  for (let k = 0; k < HAND_SIZE; k++) for (let i = 0; i < s.n; i++) s.hands[(first + i) % s.n].push(deck.pop());
  s.hands[first].push(deck.pop());
  s.hands = s.hands.map(sortHand);
  s.stock = deck; s.discard = []; s.melds = []; s.opened = Array(s.n).fill(false);
  s.reshuffles = 0; s.lastDiscard = null;
  beginTurn(s, first, 'play'); // the 15-card player only discards
  events.push({ t: 'deal', round: s.round, dealer: s.dealer, first });
}
function beginTurn(s, seat, phase = 'draw') {
  s.turn = seat; s.phase = phase; s.mustUse = null;
  s.tStartOpened = s.opened[seat]; s.tOther = false; s.tMelds = [];
}
const curSeat = (s) => (s.over ? -1 : s.turn);
const current = (s) => (s.over ? null : s.seats[s.turn]);
const topDiscard = (s) => (s.discard.length ? s.discard[s.discard.length - 1] : null);

// Can `seat` use `card` (the top discard) on the table this turn?
function canUse(s, seat, card) {
  if (!card) return false;
  const hand = s.hands[seat].concat(card);
  if (s.opened[seat]) {
    if (s.melds.some((m) => tryLayoff(m, [card]))) return true;
    return !!plan(hand, { require: card, score: 'pen', keep: 1 });
  }
  const p = plan(hand, { require: card, score: 'open', keep: 1 });
  return !!p && p.value >= s.minOpen;
}

function drawStock(s, seat, events) {
  if (!s.stock.length) {
    if (s.reshuffles >= MAX_RESHUFFLES || s.discard.length < 2) { endRound(s, -1, events); return; }
    const top = s.discard.pop();
    s.stock = D.shuffle(s.discard);
    s.discard = [top];
    s.reshuffles++;
    events.push({ t: 'reshuffle', n: s.reshuffles });
  }
  s.hands[seat].push(s.stock.pop());
  s.phase = 'play';
  events.push({ t: 'draw', seat });
}

function cardList(x, max) {
  if (!Array.isArray(x) || !x.length || x.length > max) return null;
  const out = x.map(String);
  return out.every(isCardK) ? out : null;
}
const needCard = (hand) => { if (hand.length < 1) throw gameErr('لازم تخلّي ورقة بإيدك لترميها'); };

function apply(s, pid, a) {
  const seat = C.seatFor(s, pid);
  C.needTurn(s, seat, curSeat(s));
  const type = a && a.type;
  const events = [];
  const hand = s.hands[seat];
  if (s.phase === 'draw') {
    if (type === 'draw') { drawStock(s, seat, events); return events; }
    if (type === 'take') {
      const card = topDiscard(s);
      if (!card) throw gameErr('ما في ورق عالأرض');
      if (!canUse(s, seat, card)) {
        throw gameErr(s.opened[seat] ? 'ما فيك تاخد هالورقة إلا إذا رح تنزّلها هلق' : `ما فيك تاخدها: لازم تنزل فيها ${s.minOpen} نقطة هالدور`);
      }
      s.discard.pop();
      hand.push(card);
      s.mustUse = card;
      s.phase = 'play';
      events.push({ t: 'take', seat, card });
      return events;
    }
    throw gameErr('اسحب ورقة من الكومة أو خود الورقة المرمية');
  }
  switch (type) {
    case 'draw': case 'take': throw gameErr('سحبت ورقتك هالدور');
    case 'untake': {
      if (!s.mustUse) throw gameErr('ما أخدت شي من الأرض');
      const card = s.mustUse;
      removeAll(hand, [card]);
      s.discard.push(card);
      s.mustUse = null;
      s.phase = 'draw';
      events.push({ t: 'untake', seat, card });
      return events;
    }
    case 'meld': {
      const raw = Array.isArray(a.groups) ? a.groups : a.cards ? [a.cards] : null;
      if (!raw || !raw.length || raw.length > 6) throw gameErr('اختار ورق لتنزّله');
      const groups = raw.map((g) => cardList(g, 13));
      if (groups.some((g) => !g)) throw gameErr('ورقة غلط');
      const parsed = groups.map(parseMeld);
      if (parsed.some((p) => !p)) throw gameErr('هالورق مو سلسلة ولا مجموعة صحيحة');
      const all = [].concat(...groups);
      if (!hasAll(hand, all)) throw gameErr('هالورق مو كلّه معك');
      if (hand.length - all.length < 1) throw gameErr('لازم تخلّي ورقة بإيدك لترميها');
      const value = parsed.reduce((x, p) => x + p.value, 0);
      if (!s.opened[seat] && value < s.minOpen) throw gameErr(`أول نزلة لازم تكون ${s.minOpen} نقطة ع الأقل — هي ${value}`);
      if (s.mustUse && !all.includes(s.mustUse)) throw gameErr('لازم تنزّل الورقة اللي أخدتها من الأرض');
      removeAll(hand, all);
      const open = !s.opened[seat];
      s.opened[seat] = true;
      s.mustUse = null;
      const made = parsed.map((p) => {
        const m = { id: ++s.mid, owner: seat, type: p.type, cards: p.cards, reps: p.reps };
        if (p.type === 'set') m.rank = p.rank; else Object.assign(m, { suit: p.suit, lo: p.lo, hi: p.hi });
        s.melds.push(m);
        s.tMelds.push(m.id);
        return m;
      });
      events.push({ t: 'meld', seat, open, value, melds: made.map((m) => ({ id: m.id, cards: m.cards })) });
      return events;
    }
    case 'layoff': {
      if (!s.opened[seat]) throw gameErr(`لازم تنزل ${s.minOpen} أول قبل ما تركّب ورق`);
      const m = s.melds.find((x) => x.id === Number(a.meld));
      if (!m) throw gameErr('هالتنزيلة مو موجودة');
      const cards = cardList(a.cards || (a.card ? [a.card] : null), 2);
      if (!cards) throw gameErr('ورقة غلط');
      if (!hasAll(hand, cards)) throw gameErr('هالورقة مو معك');
      const r = tryLayoff(m, cards);
      if (!r) throw gameErr('هالورقة ما بتركب على هالتنزيلة');
      if (s.mustUse && !cards.includes(s.mustUse)) throw gameErr('لازم تنزّل الورقة اللي أخدتها من الأرض');
      needCard({ length: hand.length - cards.length + r.back.length });
      removeAll(hand, cards);
      hand.push(...r.back);
      Object.assign(m, r.meld);
      if (m.owner !== seat) s.tOther = true;
      s.mustUse = null;
      events.push({ t: 'layoff', seat, meld: m.id, owner: m.owner, cards, joker: r.back.length > 0 });
      return events;
    }
    case 'discard': {
      if (s.mustUse) throw gameErr('لازم تنزّل الورقة اللي أخدتها من الأرض قبل ما ترمي');
      const card = String(a.card || '');
      if (!hand.includes(card)) throw gameErr('هالورقة مو معك');
      removeAll(hand, [card]);
      s.discard.push(card);
      s.lastDiscard = { seat, card };
      const out = !hand.length;
      events.push({ t: 'discard', seat, card, out });
      if (out) endRound(s, seat, events);
      else beginTurn(s, nextSeat(s, seat));
      return events;
    }
    default: throw gameErr('حركة مو معروفة');
  }
}

// What kind of finish: 'out' (normal), 'hand' (everything in one turn), 'konkan' (hand = one 10+ run + one set).
function finishKind(s) {
  if (s.tStartOpened || s.tOther) return 'out';
  const mine = s.melds.filter((m) => s.tMelds.includes(m.id));
  if (mine.length === 2) {
    const run = mine.find((m) => m.type === 'run'), set = mine.find((m) => m.type === 'set');
    if (run && set && run.cards.length >= 10 && run.cards.length + set.cards.length === HAND_SIZE) return 'konkan';
  }
  return 'hand';
}
function roundScore(s, w, kind) {
  const delta = Array(s.n).fill(0);
  if (w < 0) return delta; // void round
  const dbl = kind !== 'out';
  for (let x = 0; x < s.n; x++) {
    if (x === w) delta[x] = dbl ? -60 : -30;
    else if (kind === 'konkan') delta[x] = 200;
    else if (!s.opened[x]) delta[x] = dbl ? 200 : 100;
    else delta[x] = s.hands[x].reduce((a, c) => a + penalty(c), 0) * (dbl ? 2 : 1);
  }
  return delta;
}
function endRound(s, w, events) {
  const kind = w < 0 ? 'void' : finishKind(s);
  const delta = roundScore(s, w, kind);
  for (let x = 0; x < s.n; x++) s.scores[x] += delta[x];
  const row = {
    round: s.round, winner: w, kind, delta, scores: s.scores.slice(), opened: s.opened.slice(),
    left: s.hands.map((h) => sortHand(h)),
  };
  s.history.push(row);
  events.push({ t: 'hand', ...row, wait: 4500 });
  if (kind === 'konkan' && s.round === s.rounds) s.konkan = w;
  if (s.round >= s.rounds) {
    s.over = true; s.phase = 'over';
    events.push({ t: 'over' });
    return;
  }
  startRound(s, events);
}

// ---------------------------------------------------------------- legal actions (coarse: melds are not enumerated)
function actions(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || s.turn !== seat) return [];
  if (s.phase === 'draw') {
    const out = [{ type: 'draw' }];
    if (canUse(s, seat, topDiscard(s))) out.push({ type: 'take' });
    return out;
  }
  const hand = s.hands[seat];
  const out = [];
  const lay = (cards) => {
    if (!s.opened[seat]) return;
    for (const m of s.melds) {
      const r = tryLayoff(m, cards);
      if (r && hand.length - cards.length + r.back.length >= 1) out.push({ type: 'layoff', meld: m.id, cards });
    }
  };
  if (s.mustUse) { out.push({ type: 'untake' }); lay([s.mustUse]); return out; }
  for (const c of new Set(hand)) { out.push({ type: 'discard', card: c }); lay([c]); }
  return out;
}

// ---------------------------------------------------------------- bots
function minus(hand, cards) { const h = hand.slice(); removeAll(h, cards); return h; }
// Loose cards that still help: a card of the same rank (other suit) or a neighbour of the same suit.
function links(hand, c) {
  if (isJoker(c)) return 9;
  const others = minus(hand, [c]).filter((x) => !isJoker(x));
  let n = new Set(others.filter((x) => x[0] === c[0] && x[1] !== c[1]).map((x) => x[1])).size;
  const nums = (x) => (x[0] === 'A' ? [1, 14] : [rankNum(x)]);
  for (const x of others) {
    if (x[1] !== c[1] || x === c) continue;
    const d = Math.min(...nums(x).map((a) => Math.min(...nums(c).map((b) => Math.abs(a - b)))));
    if (d === 1) n += 1; else if (d === 2) n += 0.5;
  }
  return n;
}
function botDiscard(s, seat) {
  const hand = s.hands[seat];
  const opened = s.opened[seat];
  const p = plan(hand, { score: opened ? 'pen' : 'open', keep: 1 });
  let pool = p ? minus(hand, [].concat(...p.melds)) : hand.slice();
  if (!pool.some((c) => !isJoker(c))) pool = hand.slice();
  const real = pool.filter((c) => !isJoker(c));
  if (real.length) pool = real;
  const nx = nextSeat(s, seat);
  const feeds = (c) => s.opened[nx] && s.melds.some((m) => tryLayoff(m, [c]));
  let best = pool[0], bv = -Infinity;
  for (const c of pool) {
    const v = penalty(c) * (opened ? 1 : 0.4) - 7 * links(pool, c) - 2 * links(hand, c) - (feeds(c) ? 25 : 0);
    if (v > bv) { bv = v; best = c; }
  }
  return best;
}
function botPlay(s, seat) {
  const hand = s.hands[seat];
  const opened = s.opened[seat];
  if (s.mustUse) {
    const card = s.mustUse;
    if (!opened) {
      const p = plan(hand, { require: card, score: 'open', keep: 1 });
      return p && p.value >= s.minOpen ? { type: 'meld', groups: p.melds } : { type: 'untake' };
    }
    const p = plan(hand, { require: card, score: 'pen', keep: 1 });
    if (p) return { type: 'meld', groups: p.melds };
    const m = s.melds.find((x) => tryLayoff(x, [card]));
    return m ? { type: 'layoff', meld: m.id, cards: [card] } : { type: 'untake' };
  }
  if (!opened) {
    const p = plan(hand, { score: 'open', keep: 1 });
    if (p && p.value >= s.minOpen) return { type: 'meld', groups: p.melds };
    return { type: 'discard', card: botDiscard(s, seat) };
  }
  // take jokers back from the table
  for (const m of s.melds) {
    if (!m.cards.includes(JOKER)) continue;
    if (m.type === 'run') {
      const rep = m.reps.find((r, i) => isJoker(m.cards[i]) && hand.includes(r));
      if (rep) return { type: 'layoff', meld: m.id, cards: [rep] };
    } else if (m.cards.length === 3 && hand.length >= 3) {
      const miss = [...SUITS].filter((su) => !m.cards.some((x) => !isJoker(x) && x[1] === su)).map((su) => m.rank + su);
      if (miss.length === 2 && miss.every((c) => hand.includes(c))) return { type: 'layoff', meld: m.id, cards: miss };
    }
  }
  const p = plan(hand, { score: 'pen', keep: 1 });
  if (p && p.melds.length) return { type: 'meld', groups: p.melds };
  if (hand.length > 1) {
    const order = hand.slice().sort((a, b) => penalty(b) - penalty(a));
    for (const c of order) {
      if (isJoker(c) && hand.length > 3) continue;
      const m = s.melds.find((x) => tryLayoff(x, [c]));
      if (m) return { type: 'layoff', meld: m.id, cards: [c] };
    }
  }
  return { type: 'discard', card: botDiscard(s, seat) };
}
function botAction(s, pid) {
  const seat = s.seats.indexOf(pid);
  if (seat < 0 || s.over || s.turn !== seat) return null;
  if (s.phase === 'draw') return canUse(s, seat, topDiscard(s)) ? { type: 'take' } : { type: 'draw' };
  return botPlay(s, seat);
}

// ---------------------------------------------------------------- view
function view(s, pid) {
  const me = s.seats.indexOf(pid);
  const mine = me >= 0 && me === s.turn && !s.over;
  const v = {
    game: 'konkan', seats: s.seats, n: s.n, me, round: s.round, rounds: s.rounds, dealer: s.dealer, phase: s.phase,
    turn: s.over ? -1 : s.turn, over: s.over, gone: s.gone, minOpen: s.minOpen,
    hand: me >= 0 ? s.hands[me].slice() : [], counts: s.hands.map((h) => h.length),
    stock: s.stock.length, discard: topDiscard(s), discardCount: s.discard.length, reshuffles: s.reshuffles,
    melds: s.melds, opened: s.opened, scores: s.scores, history: s.history, konkan: s.konkan,
    mustUse: s.mustUse, lastDiscard: s.lastDiscard,
    canTake: false, layoffs: {}, swaps: [],
  };
  if (mine && s.phase === 'draw') v.canTake = canUse(s, me, topDiscard(s));
  if (mine && s.phase === 'play' && s.opened[me]) {
    const hand = s.hands[me];
    for (const c of new Set(hand)) {
      if (s.mustUse && c !== s.mustUse) continue;
      const ids = s.melds.filter((m) => { const r = tryLayoff(m, [c]); return r && hand.length - 1 + r.back.length >= 1; }).map((m) => m.id);
      if (ids.length) v.layoffs[c] = ids;
    }
    if (!s.mustUse) {
      for (const m of s.melds) {
        if (m.type !== 'set' || m.cards.length !== 3 || !m.cards.includes(JOKER)) continue;
        const miss = [...SUITS].filter((su) => !m.cards.some((x) => !isJoker(x) && x[1] === su)).map((su) => m.rank + su);
        if (miss.length === 2 && hasAll(hand, miss) && hand.length >= 3) v.swaps.push({ meld: m.id, cards: miss });
      }
    }
  }
  return v;
}
function result(s) {
  if (!s.over) return null;
  const order = [...Array(s.n).keys()].sort((a, b) => s.gone[a] - s.gone[b]
    || (b === s.konkan) - (a === s.konkan) || s.scores[a] - s.scores[b]);
  const top = order[0];
  const tie = s.konkan < 0 && order.filter((x) => !s.gone[x] && s.scores[x] === s.scores[top]).length > 1;
  return {
    winner: s.gone[top] || tie ? null : s.seats[top], draw: !!s.gone[top] || tie, ranking: order.map((x) => s.seats[x]),
    rounds: s.round, scores: s.scores.slice(),
  };
}

module.exports = {
  slug: 'konkan', name: 'كونكان', minPlayers: 2, maxPlayers: 4, turnMs: 60000,
  options: { bestOf: OPENS }, // the room's numeric option = the opening minimum (51 / 71)
  setup, current, actions, apply, leave: C.leave, botAction, view, result,
  _internal: { JOKER, OPENS, ROUNDS, parseMeld, meldValue, tryLayoff, plan, penalty, canUse, startRound, endRound, roundScore, finishKind, botPlay, botDiscard, sortHand, fullDeck },
};
