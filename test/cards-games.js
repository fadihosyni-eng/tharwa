'use strict';
// Card games (games/cards/): deck, follow-suit, trick winners, bidding, scoring, hidden hands, bots, AFK auto-play.
// Run: node tharwa-game/test/cards-games.js [baseUrl]   — with a base URL the room API is checked too.
const assert = require('assert');
const D = require('../games/cards/deck');
const TAR = require('../games/cards/tarneeb');
const FH = require('../games/cards/fourhundred');
const TRX = require('../games/cards/trix');

const PIDS = ['a', 'b', 'c', 'd'];
const throwsMsg = (fn, re, what) => assert.throws(fn, (e) => !!e.userMsg && (!re || re.test(e.userMsg)), what);
const MODS = { tarneeb: TAR, 400: FH, trix: TRX };

// ---------------------------------------------------------------- deck & tricks
function testDeck() {
  for (let k = 0; k < 200; k++) {
    const hands = D.deal(k % 4);
    assert.strictEqual(hands.length, 4);
    for (const h of hands) assert.strictEqual(h.length, 13, '13 cards each');
    const all = [].concat(...hands);
    assert.strictEqual(new Set(all).size, 52, '52 unique cards');
    assert(all.every(D.isCard));
  }
  // the shuffle really moves cards around (crypto randomness)
  const firsts = new Set(Array.from({ length: 60 }, () => D.shuffle(D.newDeck())[0]));
  assert(firsts.size > 15, 'shuffle varies');
  const t = (cards) => cards.map((card, seat) => ({ seat, card }));
  assert.strictEqual(D.trickWinner(t(['2S', 'AS', 'KH', '3S']), null), 1, 'highest of the led suit wins without trumps');
  assert.strictEqual(D.trickWinner(t(['2S', 'AS', 'KH', '3S']), 'H'), 2, 'a trump beats the led suit');
  assert.strictEqual(D.trickWinner(t(['2S', 'AD', '3H', 'QH']), 'H'), 3, 'higher trump wins');
  assert.strictEqual(D.trickWinner(t(['5C', 'AD', 'KS', '6C']), 'H'), 3, 'off-suit aces never win');
  assert.deepStrictEqual(D.legalPlays(['AS', '2S', 'KH'], [{ seat: 0, card: '5S' }]), ['AS', '2S'], 'must follow suit');
  assert.deepStrictEqual(D.legalPlays(['KH', '2D'], [{ seat: 0, card: '5S' }]), ['KH', '2D'], 'void: anything');
  console.log('deck, deal, trick winner OK');
}

// Plays legal moves until `pred(s)` holds.
function botUntil(M, s, pred, limit = 5000) {
  for (let n = 0; n < limit && !pred(s) && !M.result(s); n++) { const p = M.current(s); M.apply(s, p, M.botAction(s, p)); }
}
function checkFollowSuit(M, s) {
  // find a player who can follow but also holds another suit, then try an off-suit card
  for (let n = 0; n < 400 && !M.result(s); n++) {
    const p = M.current(s);
    const seat = s.seats.indexOf(p);
    if ((s.phase === 'play') && s.trick.length) {
      const led = D.suitOf(s.trick[0].card);
      const hand = s.hands[seat];
      const off = hand.find((c) => D.suitOf(c) !== led);
      if (off && hand.some((c) => D.suitOf(c) === led)) {
        throwsMsg(() => M.apply(s, p, { type: 'play', card: off }), /لازم/, 'follow suit enforced');
        const other = s.hands.findIndex((h, i) => i !== seat && h.length);
        throwsMsg(() => M.apply(s, p, { type: 'play', card: s.hands[other][0] }), /مو معك/, 'card not in hand');
        throwsMsg(() => M.apply(s, s.seats[(seat + 1) % 4], { type: 'play', card: s.hands[(seat + 1) % 4][0] }), /دورك/, 'out of turn');
        return true;
      }
    }
    M.apply(s, p, M.botAction(s, p));
  }
  return false;
}
function checkHidden(M, s) {
  const doubled = new Set(Object.keys(s.doubled || {}));
  for (let seat = 0; seat < 4; seat++) {
    const v = M.view(s, s.seats[seat]);
    assert.deepStrictEqual(v.hand, s.hands[seat], 'own hand visible');
    assert.deepStrictEqual(v.counts, s.hands.map((h) => h.length), 'card counts');
    assert(!('hands' in v), 'no hands field');
    const json = JSON.stringify(v);
    for (let o = 0; o < 4; o++) {
      if (o === seat) continue;
      for (const c of s.hands[o]) if (!doubled.has(c)) assert(!json.includes(`"${c}"`), `${M.slug}: seat ${seat} sees ${c} of seat ${o}`);
    }
  }
  const spec = M.view(s, null);
  assert.deepStrictEqual(spec.hand, [], 'spectators see no hand');
  assert.strictEqual(spec.me, -1);
}

// ---------------------------------------------------------------- طرنيب
function testTarneeb() {
  let s = TAR.setup(PIDS, { bestOf: 31 });
  assert.strictEqual(s.target, 31);
  assert.strictEqual(TAR.setup(PIDS, { bestOf: 1 }).target, 41, 'default target 41');
  assert.strictEqual(TAR.current(s), 'a', 'player after the dealer bids first');
  assert.strictEqual(s.phase, 'bid');
  checkHidden(TAR, s);
  throwsMsg(() => TAR.apply(s, 'a', { type: 'bid', bid: 6 }), /7/, 'bid below 7');
  throwsMsg(() => TAR.apply(s, 'a', { type: 'bid', bid: 14 }), /13/, 'bid above 13');
  throwsMsg(() => TAR.apply(s, 'a', { type: 'play', card: s.hands[0][0] }), /الطلب/, 'no play while bidding');
  throwsMsg(() => TAR.apply(s, 'b', { type: 'pass' }), /دورك/, 'bid out of turn');
  TAR.apply(s, 'a', { type: 'bid', bid: 7 });
  throwsMsg(() => TAR.apply(s, 'b', { type: 'bid', bid: 7 }), /أكتر/, 'must bid higher');
  TAR.apply(s, 'b', { type: 'pass' });
  TAR.apply(s, 'c', { type: 'bid', bid: 8 });
  TAR.apply(s, 'd', { type: 'pass' });
  assert.strictEqual(TAR.current(s), 'a', 'passed player b is skipped');
  TAR.apply(s, 'a', { type: 'pass' });
  assert.strictEqual(s.phase, 'trump', 'everyone else passed -> contract');
  assert.strictEqual(TAR.current(s), 'c');
  assert.strictEqual(s.bid, 8);
  throwsMsg(() => TAR.apply(s, 'c', { type: 'trump', suit: 'X' }), /الطرنيب/);
  throwsMsg(() => TAR.apply(s, 'c', { type: 'trump', suit: ['S'] }), /الطرنيب/);
  TAR.apply(s, 'c', { type: 'trump', suit: 'D' });
  assert.strictEqual(s.trump, 'D');
  assert.strictEqual(TAR.current(s), 'c', 'the bidder leads');
  assert(checkFollowSuit(TAR, s), 'found a follow-suit spot');
  checkHidden(TAR, s);

  // 13 ends the auction at once; four passes = redeal by the next dealer
  s = TAR.setup(PIDS);
  TAR.apply(s, 'a', { type: 'bid', bid: 13 });
  assert.strictEqual(s.phase, 'trump'); assert.strictEqual(s.bidder, 0);
  s = TAR.setup(PIDS);
  const oldHands = JSON.stringify(s.hands);
  for (const p of PIDS) TAR.apply(s, p, { type: 'pass' });
  assert.strictEqual(s.redeals, 1); assert.strictEqual(s.round, 1, 'a thrown-in hand is not a round');
  assert.strictEqual(s.dealer, 0); assert.strictEqual(TAR.current(s), 'b');
  assert.notStrictEqual(JSON.stringify(s.hands), oldHands, 'new cards');

  // scoring: made -> bidding team scores tricks taken; failed -> minus bid, opponents score their tricks
  const { endHand } = TAR._internal;
  s = TAR.setup(PIDS);
  Object.assign(s, { bidder: 0, bid: 8, trump: 'S', tricks: [5, 1, 4, 3] });
  endHand(s, []);
  assert.deepStrictEqual(s.scores, [9, 0], 'made 8 with 9 tricks: +9');
  Object.assign(s, { bidder: 1, bid: 10, tricks: [3, 4, 3, 3] });
  endHand(s, []);
  assert.deepStrictEqual(s.scores, [15, -10], 'team 1 failed 10 (took 7): -10, team 0 +6');
  assert.strictEqual(s.history.length, 2);
  assert.deepStrictEqual(s.history[1].delta, [6, -10]);
  Object.assign(s, { scores: [34, 20], bidder: 2, bid: 7, tricks: [4, 3, 3, 3] });
  endHand(s, []);
  assert(s.over && s.winTeam === 0, 'team 0 reaches 41 and wins');
  assert.deepStrictEqual(TAR.result(s).winners, ['a', 'c']);
  s = TAR.setup(PIDS);
  Object.assign(s, { scores: [40, 40], bidder: 1, bid: 9, tricks: [4, 3, 3, 3] });
  endHand(s, []);
  assert(s.over && s.winTeam === 0, 'both teams could not reach together: 47 vs 31');
  s = TAR.setup(PIDS);
  Object.assign(s, { scores: [30, 36], bidder: 0, bid: 7, tricks: [3, 3, 4, 3] }); // team0 7 made -> 37, team1 36
  endHand(s, []);
  assert(!s.over, 'nobody at 41 yet');
  console.log('tarneeb rules + scoring OK');
}

// ---------------------------------------------------------------- أربعمية
function testFourHundred() {
  const { bidValue, minBidFor, winningTeam, endHand } = FH._internal;
  assert.deepStrictEqual([2, 3, 4, 5, 6, 13].map(bidValue), [2, 3, 4, 10, 12, 26], '5+ doubles');
  assert.deepStrictEqual([0, 29, 30, 39, 40, 55].map(minBidFor), [2, 2, 3, 3, 4, 4]);
  let s = FH.setup(PIDS);
  assert.strictEqual(s.trump, 'H', 'hearts are always trumps');
  checkHidden(FH, s);
  throwsMsg(() => FH.apply(s, 'a', { type: 'bid', bid: 1 }), /2/, 'min bid 2');
  throwsMsg(() => FH.apply(s, 'a', { type: 'pass' }), /الطلب/, 'no pass in 400');
  for (const p of PIDS) FH.apply(s, p, { type: 'bid', bid: 2 });
  assert.strictEqual(s.redeals, 1, 'total 8 < 11 -> redeal');
  assert.strictEqual(s.phase, 'bid'); assert.strictEqual(FH.current(s), 'b', 'next dealer');
  for (const [p, b] of [['b', 3], ['c', 3], ['d', 3], ['a', 2]]) FH.apply(s, p, { type: 'bid', bid: b });
  assert.strictEqual(s.phase, 'play', 'total 11 plays');
  assert.strictEqual(FH.current(s), 'b', 'first bidder leads');
  assert(checkFollowSuit(FH, s));
  checkHidden(FH, s);
  // the minimum bid rises with the player's score
  s = FH.setup(PIDS);
  s.scores = [31, 0, 44, 0];
  throwsMsg(() => FH.apply(s, 'a', { type: 'bid', bid: 2 }), /3/, '30+ must bid 3');
  assert.deepStrictEqual(FH.view(s, 'a').bidOptions[0], 3);
  // scoring
  s = FH.setup(PIDS);
  Object.assign(s, { bids: [3, 5, 2, 4], tricks: [3, 4, 2, 4] });
  endHand(s, []);
  assert.deepStrictEqual(s.scores, [3, -10, 2, 4]);
  assert.strictEqual(winningTeam([41, 0, 1, 0], 41), 0);
  assert.strictEqual(winningTeam([45, 0, 0, 0], 41), -1, 'partner must be above zero');
  assert.strictEqual(winningTeam([41, 50, 2, 1], 41), 1, 'both qualify: higher total');
  assert.strictEqual(winningTeam([20, 10, 30, 41], 41), 1);
  s = FH.setup(PIDS);
  Object.assign(s, { scores: [36, 0, 3, 0], bids: [5, 2, 2, 2], tricks: [6, 2, 3, 2] });
  endHand(s, []);
  assert(s.over && s.winTeam === 0, '36 + 10 = 46 with partner positive');
  assert.deepStrictEqual(FH.result(s).ranking.slice(0, 2).sort(), ['a', 'c']);
  console.log('400 rules + scoring OK');
}

// ---------------------------------------------------------------- تركس
function testTrix() {
  const { trixLegal, contractScore, CONTRACTS } = TRX._internal;
  let s = TRX.setup(PIDS);
  assert.strictEqual(s.phase, 'choose'); assert.strictEqual(TRX.current(s), 'a', 'seat 0 owns the first kingdom');
  assert.strictEqual(TRX.actions(s, 'a').length, 5);
  throwsMsg(() => TRX.apply(s, 'a', { type: 'contract', contract: 'poker' }), /المملكة/);
  checkHidden(TRX, s);
  // layout legality
  const lay = { S: null, H: { lo: 9, hi: 12 }, D: null, C: null };
  assert.deepStrictEqual(trixLegal(['JS', 'QS', '8H', 'KH', 'TH', '2D'], lay).sort(), ['8H', 'JS', 'KH'].sort());
  assert.deepStrictEqual(trixLegal(['AH', '7H'], lay), []);
  // King contract: stops when K♥ is taken; doubling
  const play = (st) => { const p = TRX.current(st); TRX.apply(st, p, TRX.botAction(st, p)); };
  for (let k = 0; k < 30; k++) {
    s = TRX.setup(PIDS);
    TRX.apply(s, 'a', { type: 'contract', contract: 'king' });
    const holder = s.hands.findIndex((h) => h.includes('KH'));
    assert.strictEqual(s.phase, 'double'); assert.strictEqual(TRX.current(s), PIDS[holder], 'only the K♥ holder is asked');
    throwsMsg(() => TRX.apply(s, PIDS[holder], { type: 'double', cards: ['QS'] }), /تدبّل/);
    TRX.apply(s, PIDS[holder], { type: 'double', cards: ['KH'] });
    assert.strictEqual(s.doubled.KH, holder);
    assert.strictEqual(TRX.current(s), 'a', 'owner leads');
    const round = s.round;
    while (s.round === round) play(s);
    const row = s.history[0];
    const taker = [0, 1, 2, 3].find((x) => row.delta[x] <= -150);
    assert(taker !== undefined, 'doubled K♥: -150');
    if (taker !== holder) assert.strictEqual(row.delta[holder], 75, 'doubler +75');
    assert(row.tricks.reduce((a, b) => a + b, 0) <= 13);
    assert.strictEqual(s.phase, 'choose'); assert.strictEqual(TRX.actions(s, 'a').length, 4, 'king used');
  }
  // direct scoring examples
  const fake = (contract, taken, doubled = {}, extra = {}) => contractScore({ contract, taken, doubled, tricks: taken.map((t) => t.length / 4), finished: [], ...extra });
  assert.deepStrictEqual(fake('king', [[], ['KH', '2S', '3S', '4S'], [], []]), [0, -75, 0, 0]);
  assert.deepStrictEqual(fake('king', [[], ['KH', '2S', '3S', '4S'], [], []], { KH: 3 }), [0, -150, 0, 75]);
  assert.deepStrictEqual(fake('king', [[], [], [], ['KH', '2S', '3S', '4S']], { KH: 3 }), [0, 0, 0, -150], 'own doubled king');
  assert.deepStrictEqual(fake('queens', [['QS', 'QH', 'AS', 'AH'], ['QD', '2C', '3C', '4C'], [], ['QC', '5C', '6C', '7C']], { QH: 1, QC: 3 }),
    [-75, -25 + 25, 0, -50]);
  assert.deepStrictEqual(fake('diamonds', [['2D', '3D', 'AS', '4D'], [], ['5S', '6D', '7S', '8S'], []]), [-30, 0, -10, 0]);
  assert.deepStrictEqual(fake('tricks', [Array(16).fill('2S'), Array(8).fill('2S'), [], Array(28).fill('2S')]), [-60, -30, 0, -105]);
  assert.deepStrictEqual(fake('trix', [[], [], [], []], {}, { finished: [2, 0, 3, 1] }), [150, 50, 200, 100]);
  // trix contract flow
  s = TRX.setup(PIDS);
  TRX.apply(s, 'a', { type: 'contract', contract: 'trix' });
  assert.strictEqual(s.phase, 'trix');
  let guard = 0;
  while (s.phase === 'trix' && guard++ < 500) {
    const p = TRX.current(s), seat = PIDS.indexOf(p);
    const legal = trixLegal(s.hands[seat], s.layout);
    assert(legal.length, 'the player to move can always lay a card (others were passed)');
    const bad = s.hands[seat].find((c) => !legal.includes(c));
    if (bad) throwsMsg(() => TRX.apply(s, p, { type: 'play', card: bad }), /ما بتنحط/);
    play(s);
  }
  const tr = s.history[0];
  assert.strictEqual(tr.contract, 'trix');
  assert.deepStrictEqual([...tr.delta].sort((a, b) => a - b), [50, 100, 150, 200]);
  // full game: each owner plays each contract once; undoubled contracts sum to their fixed totals
  s = TRX.setup(PIDS);
  botUntil(TRX, s, () => false, 20000);
  const res = TRX.result(s);
  assert(res, 'trix game ends');
  assert.strictEqual(s.history.length, 20);
  for (let o = 0; o < 4; o++) assert.deepStrictEqual(s.history.filter((h) => h.owner === o).map((h) => h.contract).sort(), [...CONTRACTS].sort());
  const SUM = { king: -75, queens: -100, diamonds: -130, tricks: -195, trix: 500 };
  for (const h of s.history) if (!Object.keys(h.doubled).length) assert.strictEqual(h.delta.reduce((a, b) => a + b, 0), SUM[h.contract], h.contract + ' total');
  assert.deepStrictEqual(s.scores, s.history[19].scores);
  assert.strictEqual(res.ranking.length, 4);
  // follow suit in a trick contract + hidden hands
  s = TRX.setup(PIDS);
  TRX.apply(s, 'a', { type: 'contract', contract: 'tricks' });
  assert(checkFollowSuit(TRX, s));
  checkHidden(TRX, s);
  console.log('trix rules + scoring OK');
}

// ---------------------------------------------------------------- bots: thousands of games, never illegal
function testBots() {
  const counts = { tarneeb: 1200, 400: 1200, trix: 300 };
  for (const [slug, M] of Object.entries(MODS)) {
    const t0 = Date.now();
    let moves = 0;
    for (let g = 0; g < counts[slug]; g++) {
      const s = M.setup(PIDS, { bestOf: [41, 31, 61][g % 3] });
      if (g % 50 === 7) M.leave(s, PIDS[g % 4]); // a player quits: their seat keeps being played
      let n = 0;
      while (!M.result(s)) {
        const p = M.current(s);
        const a = M.botAction(s, p);
        assert(M.actions(s, p).some((x) => JSON.stringify(x) === JSON.stringify(a)), `${slug} bot made an illegal move ${JSON.stringify(a)}`);
        M.apply(s, p, a);
        if (++n > 20000) throw new Error(slug + ' never ends');
      }
      moves += n;
      const r = M.result(s);
      assert.strictEqual(r.ranking.length, 4);
      assert.strictEqual(new Set(r.ranking).size, 4);
      if (g % 50 === 7) assert.notStrictEqual(r.winner, PIDS[g % 4], 'a player who left never wins');
      if (g % 100 === 0) JSON.stringify(M.view(s, PIDS[0]));
    }
    console.log(`${slug}: ${counts[slug]} bot games (${moves} moves) in ${Date.now() - t0}ms, no illegal move`);
  }
}

// ---------------------------------------------------------------- AFK auto-play through the room manager
async function testAfk() {
  const MG = require('../lib/minigames');
  const T = MG._test;
  for (const [slug, M] of Object.entries(MODS)) {
    const fast = { ...M, turnMs: 40 }; // a 40 ms turn clock
    const room = T.newRoom(fast, { isPrivate: true, max: 4, opts: {} });
    const h = T.addPlayer(room, 'إنسان', false);
    for (let k = 0; k < 3; k++) T.addPlayer(room, 'بوت', true);
    h.conns = 1; // "watching", so the clock runs
    T.startGame(room);
    assert.strictEqual(M.current(room.state), h.id, slug + ': the human acts first');
    const seq0 = room.seq;
    for (let k = 0; k < 120 && !h.auto; k++) await new Promise((r) => setTimeout(r, 50));
    assert(h.auto, slug + ': two missed turns -> auto-play');
    assert(room.seq >= seq0 + 2, slug + ': game went on');
    const seq1 = room.seq;
    await new Promise((r) => setTimeout(r, 2500));
    assert(room.seq > seq1, slug + ': auto-played seat keeps playing');
    clearTimeout(room.timer);
    room.status = 'ended';
    MG.rooms.delete(room.code);
  }
  console.log('AFK auto-play OK');
}

// ---------------------------------------------------------------- room API (needs a running server with the games registered)
async function testApi(BASE) {
  let ipN = 0;
  const call = async (path, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.77.${Math.floor(ipN / 200)}.${ipN++ % 200}` };
    const r = await fetch(BASE + path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  };
  const snapshot = async (code, me) => {
    const q = new URLSearchParams({ code, ...(me ? { pid: me.pid, token: me.token } : {}) });
    const ctrl = new AbortController();
    const r = await fetch(`${BASE}/api/g/events?${q}`, { signal: ctrl.signal });
    const reader = r.body.getReader();
    let buf = '';
    for (;;) {
      const { value } = await reader.read();
      buf += Buffer.from(value).toString('utf8');
      const m = buf.match(/event: state\ndata: (.*)\n\n/);
      if (m) { ctrl.abort(); return JSON.parse(m[1]); }
    }
  };
  const site = await call('/api/site');
  for (const slug of Object.keys(MODS)) {
    const g = site.games.find((x) => x.slug === slug);
    assert(g && g.enabled && g.tags.includes('cards') && g.maxPlayers === 4, slug + ' in the registry with the cards tag');
    // vs computer: you + 3 bots, the game starts at once
    const me = await call('/api/g/create', { game: slug, name: 'لاعب', vsBot: true, bestOf: 31 });
    assert.strictEqual(me.status, 200, slug + ' create vs bots');
    const st = await snapshot(me.code, me);
    assert.strictEqual(st.status, 'playing');
    assert.strictEqual(st.players.filter((p) => p.isBot).length, 3);
    assert.strictEqual(st.state.hand.length, 13);
    assert(!('hands' in st.state));
    const spec = await snapshot(me.code, null);
    assert.deepStrictEqual(spec.state.hand, [], 'spectator sees no cards');
    if (slug !== 'trix') assert.strictEqual(st.state.target, 31, 'target option travels');
    // two humans as partners + 2 bots (host adds a bot first so the friend sits opposite)
    const host = await call('/api/g/create', { game: slug, name: 'المضيف', isPrivate: true });
    await call('/api/g/act', { code: host.code, pid: host.pid, token: host.token, type: 'addBot' });
    const friend = await call('/api/g/join', { code: host.code, name: 'صاحبي' });
    assert.strictEqual(friend.status, 200);
    await call('/api/g/act', { code: host.code, pid: host.pid, token: host.token, type: 'addBot' });
    const go = await call('/api/g/act', { code: host.code, pid: host.pid, token: host.token, type: 'start' });
    assert.strictEqual(go.status, 200);
    const a = await snapshot(host.code, host), b = await snapshot(host.code, friend);
    assert.strictEqual(Math.abs(a.state.me - b.state.me), 2, 'host and friend sit opposite (partners)');
    const json = JSON.stringify(a);
    assert(!b.state.hand.some((c) => json.includes(`"${c}"`)), 'host does not see the friend\'s cards');
    // a wrong move is refused
    const cur = a.turn.pid === host.pid ? host : a.turn.pid === friend.pid ? friend : null;
    if (cur) {
      const r = await call('/api/g/act', { code: host.code, pid: cur.pid, token: cur.token, type: 'play', card: 'ZZ' });
      assert.strictEqual(r.status, 400);
    }
    for (const p of [me, host, friend]) await call('/api/g/act', { code: p.code || host.code, pid: p.pid, token: p.token, type: 'leave' });
  }
  console.log('card games room API OK');
}

(async () => {
  testDeck();
  testTarneeb();
  testFourHundred();
  testTrix();
  testBots();
  await testAfk();
  if (process.argv[2]) await testApi(process.argv[2]);
  console.log('CARD GAMES TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
