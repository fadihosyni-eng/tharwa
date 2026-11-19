'use strict';
// «كونكان» (games/cards/konkan.js): melds, the opening minimum, taking the discard, lay-offs, joker rules, scoring,
// hidden hands, 1,000+ bot games with no illegal move, AFK auto-play and the room API.
// Run: node tharwa-game/test/konkan.js [baseUrl]   — with a base URL the room API is checked too.
const assert = require('assert');
const K = require('../games/cards/konkan');
const I = K._internal;

const X = I.JOKER;
const throwsMsg = (fn, re, what) => assert.throws(fn, (e) => !!e.userMsg && (!re || re.test(e.userMsg)), what);
const total = (s) => s.hands.flat().length + s.stock.length + s.discard.length + s.melds.reduce((a, m) => a + m.cards.length, 0);

// A two-player state with chosen hands; seat 0 to move in `phase`.
function fixed(hands, { phase = 'play', discard = ['2C'], opened = [false, false], melds = [], minOpen = 51 } = {}) {
  const s = K.setup(['a', 'b'], { bestOf: minOpen });
  s.hands = hands.map((h) => h.slice());
  s.discard = discard.slice();
  s.melds = melds.map((m) => ({ ...m }));
  s.mid = 100;
  s.opened = opened.slice();
  s.turn = 0; s.phase = phase; s.mustUse = null; s.tStartOpened = opened[0]; s.tOther = false; s.tMelds = [];
  return s;
}
const meld = (id, owner, cards) => { const p = I.parseMeld(cards); const m = { id, owner, type: p.type, cards: p.cards, reps: p.reps }; if (p.type === 'set') m.rank = p.rank; else Object.assign(m, { suit: p.suit, lo: p.lo, hi: p.hi }); return m; };

// ---------------------------------------------------------------- melds
function testMelds() {
  const P = I.parseMeld;
  assert.strictEqual(P(['7S', '7H', '7D']).type, 'set');
  assert.strictEqual(P(['7S', '7H', '7D']).value, 21);
  assert.strictEqual(P(['7S', '7H', '7D', '7C']).value, 28);
  assert.strictEqual(P(['7S', '7S', '7H']), null, 'a set needs different suits (two packs)');
  assert.strictEqual(P(['7S', '7H', '7D', '7C', X]), null, 'a set has at most 4 cards');
  assert.strictEqual(P(['7S', '7H']), null, 'at least 3 cards');
  assert.strictEqual(P(['KS', 'KH', X]).value, 30, 'joker counts as the missing king');
  assert.strictEqual(P(['AS', 'AH', 'AD']).value, 33, 'aces 11 in a set');
  assert.deepStrictEqual(P(['5S', '6S', '7S']).reps, ['5S', '6S', '7S']);
  assert.strictEqual(P(['5S', '6S', '7S']).value, 18);
  assert.strictEqual(P(['5S', '6H', '7S']), null, 'a run is one suit');
  assert.strictEqual(P(['5S', '6S', '8S']), null, 'no gap without a joker');
  assert.deepStrictEqual(P(['5S', X, '7S']).reps, ['5S', '6S', '7S'], 'joker fills the gap');
  assert.deepStrictEqual(P(['5S', '6S', X]).reps, ['5S', '6S', '7S'], 'joker extends the top');
  assert.deepStrictEqual(P(['QS', 'KS', X]).reps, ['QS', 'KS', 'AS'], 'joker as the high ace');
  assert.deepStrictEqual(P(['KS', 'AS', X]).reps, ['QS', 'KS', 'AS'], 'top is the ace: the joker goes under');
  assert.deepStrictEqual(P(['AS', '2S', '3S']).reps, ['AS', '2S', '3S'], 'low ace');
  assert.strictEqual(P(['AS', '2S', '3S']).value, 6, 'low ace counts 1');
  assert.strictEqual(P(['QS', 'KS', 'AS']).value, 31, 'high ace counts 11');
  assert.strictEqual(P(['KS', 'AS', '2S']), null, 'no wrap-around');
  assert.strictEqual(P(['5S', X, X]), null, 'at least 2 real cards');
  assert.strictEqual(P(['5S', '5S', '6S']), null, 'no duplicate in a run');
  const all13 = ['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS'];
  assert(P(all13), '13-card run');
  assert.strictEqual(P([...all13.slice(1), 'AS', X]), null, 'at most 13 cards');
  console.log('melds OK');
}

// ---------------------------------------------------------------- opening, take, lay-off, joker swaps
function testPlay() {
  // opening under 51 refused, 51+ accepted (several melds together)
  let s = fixed([['7S', '7H', '7D', '2S', '3S', '4S', 'KH', 'KD', 'KC', '9C', '5D', '8H', 'JD', 'QC', 'AC'], ['2D', '3D']]);
  throwsMsg(() => K.apply(s, 'a', { type: 'meld', groups: [['7S', '7H', '7D'], ['2S', '3S', '4S']] }), /51/, '30 < 51');
  throwsMsg(() => K.apply(s, 'a', { type: 'layoff', meld: 1, cards: ['9C'] }), /51/, 'no lay-off before opening');
  K.apply(s, 'a', { type: 'meld', groups: [['7S', '7H', '7D'], ['2S', '3S', '4S'], ['KH', 'KD', 'KC']] });
  assert(s.opened[0] && s.melds.length === 3, '60 opens');
  throwsMsg(() => K.apply(s, 'a', { type: 'meld', groups: [['9C', '5D', '8H']] }), /سلسلة/, 'not a meld');
  throwsMsg(() => K.apply(s, 'a', { type: 'meld', groups: [['9C', '9C', '9C']] }), null, 'cards you do not hold');
  // 71 room
  s = fixed([['7S', '7H', '7D', 'QS', 'KS', 'AS', 'KH', 'KD', 'KC', '9C', '5D'], ['2D']], { minOpen: 71 });
  assert.strictEqual(s.minOpen, 71);
  throwsMsg(() => K.apply(s, 'a', { type: 'meld', groups: [['7S', '7H', '7D'], ['QS', 'KS', 'AS']] }), /71/, '52 < 71');
  K.apply(s, 'a', { type: 'meld', groups: [['7S', '7H', '7D'], ['QS', 'KS', 'AS'], ['KH', 'KD', 'KC']] });
  // you must keep a card to discard
  s = fixed([['7S', '7H', '7D', 'KH', 'KD', 'KC'], ['2D']], { opened: [true, false] });
  throwsMsg(() => K.apply(s, 'a', { type: 'meld', groups: [['7S', '7H', '7D'], ['KH', 'KD', 'KC']] }), /ترميها/, 'keep one card');

  // taking the discard: only when it is used at once
  s = fixed([['7S', '7H', '2C', '9D', 'JH'], ['2D']], { phase: 'draw', discard: ['5C', '7D'], opened: [true, false] });
  K.apply(s, 'a', { type: 'take' });
  assert.strictEqual(s.mustUse, '7D');
  throwsMsg(() => K.apply(s, 'a', { type: 'discard', card: '9D' }), /أخدتها/, 'cannot discard before using the taken card');
  throwsMsg(() => K.apply(s, 'a', { type: 'meld', groups: [['2C', '9D', 'JH']] }), null, 'next table action must use it');
  K.apply(s, 'a', { type: 'untake' });
  assert.deepStrictEqual(s.discard, ['5C', '7D'], 'untake puts it back');
  assert.strictEqual(s.phase, 'draw');
  K.apply(s, 'a', { type: 'take' });
  K.apply(s, 'a', { type: 'meld', groups: [['7S', '7H', '7D']] });
  assert.strictEqual(s.mustUse, null);
  K.apply(s, 'a', { type: 'discard', card: '9D' });
  assert.strictEqual(s.turn, 1);
  // a card you cannot use is refused
  s = fixed([['7S', '2H', '2C', '9D', 'JH'], ['2D']], { phase: 'draw', discard: ['KD'], opened: [true, false] });
  throwsMsg(() => K.apply(s, 'a', { type: 'take' }), /تنزّلها/, 'useless discard refused');
  // not opened: only when you open with it this turn
  s = fixed([['KS', 'KH', 'QD', 'QC', 'QH', 'JS', 'JH', 'JD', '2C', '5D', '8H', '3S', '9C', '4D'], ['2D']], { phase: 'draw', discard: ['KD'] });
  K.apply(s, 'a', { type: 'take' });
  throwsMsg(() => K.apply(s, 'a', { type: 'meld', groups: [['QD', 'QC', 'QH'], ['JS', 'JH', 'JD']] }), /51|أخدتها/, 'opening must include the taken card');
  K.apply(s, 'a', { type: 'meld', groups: [['KS', 'KH', 'KD'], ['QD', 'QC', 'QH'], ['JS', 'JH', 'JD']] });
  assert(s.opened[0]);
  s = fixed([['KS', 'KH', '2D', '5C', '8H'], ['2D']], { phase: 'draw', discard: ['KD'] });
  throwsMsg(() => K.apply(s, 'a', { type: 'take' }), /51/, 'unopened: 30 is not enough to take');

  // lay-off on own and others' melds, both ends, high / low ace
  const run = meld(1, 1, ['5S', '6S', '7S']);
  const set = meld(2, 1, ['9H', '9D', '9C']);
  s = fixed([['4S', '8S', '9S', '9H', '2D', 'AS', X, 'KC'], ['2D']], { opened: [true, true], melds: [run, set] });
  K.apply(s, 'a', { type: 'layoff', meld: 1, cards: ['8S'] });
  K.apply(s, 'a', { type: 'layoff', meld: 1, cards: ['4S'] });
  assert.deepStrictEqual(s.melds[0].cards, ['4S', '5S', '6S', '7S', '8S']);
  throwsMsg(() => K.apply(s, 'a', { type: 'layoff', meld: 2, cards: ['9H'] }), /بتركب/, 'same suit twice in a set');
  throwsMsg(() => K.apply(s, 'a', { type: 'layoff', meld: 2, cards: ['KC'] }), /بتركب/, 'wrong rank');
  assert.strictEqual(s.tOther, true, 'laid off on another player');
  const r1 = I.tryLayoff(meld(9, 0, ['2S', '3S', '4S']), ['AS']);
  assert.deepStrictEqual(r1.meld.reps, ['AS', '2S', '3S', '4S'], 'low ace below 2');
  const r2 = I.tryLayoff(meld(9, 0, ['QS', 'KS', X]), ['JS']);
  assert.deepStrictEqual(r2.meld.reps, ['JS', 'QS', 'KS', 'AS']);
  assert.strictEqual(I.tryLayoff(meld(9, 0, ['QS', 'KS', 'AS']), ['2S']), null, 'no wrap');
  // joker swap in a run: the real card takes its place, the joker goes to the hand
  s = fixed([['6S', '2D', '3C'], ['2D']], { opened: [true, true], melds: [meld(1, 1, ['5S', X, '7S'])] });
  K.apply(s, 'a', { type: 'layoff', meld: 1, cards: ['6S'] });
  assert.deepStrictEqual(s.melds[0].cards, ['5S', '6S', '7S']);
  assert(s.hands[0].includes(X), 'joker taken back');
  // joker in a 3-card set: only with both missing suits; in a 4-card set: never
  const s3 = meld(1, 1, ['8S', '8H', X]);
  assert.deepStrictEqual(I.tryLayoff(s3, ['8D']).back, [], 'one card just fills the set');
  assert.deepStrictEqual(I.tryLayoff(s3, ['8D', '8C']).back, [X], 'both missing suits free the joker');
  assert.strictEqual(I.tryLayoff(s3, ['8D', '8S']), null);
  const s4 = meld(2, 1, ['8S', '8H', '8D', X]);
  assert.strictEqual(I.tryLayoff(s4, ['8C']), null, 'a joker in a 4-card set stays');
  s = fixed([['8D', '8C', '2C'], ['2D']], { opened: [true, true], melds: [s3] });
  K.apply(s, 'a', { type: 'layoff', meld: 1, cards: ['8D', '8C'] });
  assert.strictEqual(s.melds[0].cards.length, 4);
  assert(!s.melds[0].cards.includes(X) && s.hands[0].includes(X));
  console.log('opening, take, lay-off, joker rules OK');
}

// ---------------------------------------------------------------- scoring
function testScoring() {
  // normal finish: −30, opened players pay their cards (joker 15, ace 11), unopened +100
  let s = K.setup(['a', 'b', 'c']);
  s.hands = [[], ['AS', X, '5D'], ['2C']];
  s.opened = [true, true, false];
  assert.deepStrictEqual(I.roundScore(s, 0, 'out'), [-30, 31, 100]);
  assert.deepStrictEqual(I.roundScore(s, 0, 'hand'), [-60, 62, 200], 'hand doubles');
  assert.deepStrictEqual(I.roundScore(s, 0, 'konkan'), [-60, 200, 200], 'konkan: everybody +200');
  assert.deepStrictEqual(I.roundScore(s, -1, 'void'), [0, 0, 0]);

  // a real "hand": unopened player lays 14 cards and throws the 15th
  s = fixed([['2S', '3S', '4S', '5S', '6S', '7S', '7H', '7D', 'KH', 'KD', 'KC', '9C', '9D', '9H', 'QD'], ['2D', '3D', '4C']]);
  K.apply(s, 'a', { type: 'meld', groups: [['2S', '3S', '4S', '5S', '6S'], ['7S', '7H', '7D'], ['KH', 'KD', 'KC'], ['9C', '9D', '9H']] });
  K.apply(s, 'a', { type: 'discard', card: 'QD' });
  let h = s.history[0];
  assert.strictEqual(h.kind, 'hand');
  assert.deepStrictEqual(h.delta, [-60, 200]);
  assert.strictEqual(s.round, 2, 'next round dealt');
  assert.strictEqual(s.hands.reduce((a, x) => a + x.length, 0), 29, '14 + 15 cards dealt');
  assert.strictEqual(total(s), 106);
  // opened earlier: a normal finish
  s = fixed([['QH', 'QD', 'QC', '9S'], ['2D', '3D', 'AH']], { opened: [true, true] });
  K.apply(s, 'a', { type: 'meld', groups: [['QH', 'QD', 'QC']] });
  K.apply(s, 'a', { type: 'discard', card: '9S' });
  h = s.history[0];
  assert.strictEqual(h.kind, 'out');
  assert.deepStrictEqual(h.delta, [-30, 16]);
  // konkan: 10-card run + 4-card set; in the last round it wins the game
  s = fixed([['2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'KH', 'KD', 'KC', 'KS', '4D'], ['2D']]);
  s.round = s.rounds;
  s.scores = [500, 0];
  K.apply(s, 'a', { type: 'meld', groups: [['2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS'], ['KH', 'KD', 'KC', 'KS']] });
  K.apply(s, 'a', { type: 'discard', card: '4D' });
  assert.strictEqual(s.history[0].kind, 'konkan');
  assert(s.over);
  const res = K.result(s);
  assert.strictEqual(res.winner, 'a', 'konkan in the last round wins despite the score');
  // lowest total wins after 5 rounds; equal lowest = draw
  s = K.setup(['a', 'b', 'c']);
  s.over = true; s.scores = [40, 12, 90];
  assert.strictEqual(K.result(s).winner, 'b');
  assert.deepStrictEqual(K.result(s).ranking, ['b', 'a', 'c']);
  s.scores = [12, 12, 90];
  assert(K.result(s).draw);
  s.gone[1] = true; s.scores = [40, 12, 90];
  assert.strictEqual(K.result(s).winner, 'a', 'a player who left never wins');
  // stock runs out: reshuffle twice, then the round is void
  s = fixed([['2S', '9D'], ['3D', '4C']], { phase: 'draw', discard: ['5C', '6C', '7C'] });
  s.stock = [];
  K.apply(s, 'a', { type: 'draw' });
  assert.strictEqual(s.reshuffles, 1);
  assert.deepStrictEqual(s.discard, ['7C']);
  s.stock = []; s.reshuffles = 2; s.phase = 'draw';
  K.apply(s, 'a', { type: 'draw' });
  assert.strictEqual(s.history[s.history.length - 1].kind, 'void');
  console.log('scoring OK');
}

// ---------------------------------------------------------------- deal, hidden hands
function testDealAndView() {
  for (const n of [2, 3, 4]) {
    const pids = ['a', 'b', 'c', 'd'].slice(0, n);
    const s = K.setup(pids);
    assert.strictEqual(total(s), 106, '106 cards');
    assert.strictEqual(s.hands[0].length, 15, 'player after the dealer gets 15');
    for (let x = 1; x < n; x++) assert.strictEqual(s.hands[x].length, 14);
    assert.strictEqual(s.phase, 'play', 'first player only discards');
    const all = [...s.hands.flat(), ...s.stock];
    assert.strictEqual(all.filter((c) => c === X).length, 2, 'two jokers');
    const v = K.view(s, 'b');
    assert.deepStrictEqual(v.hand, s.hands[1]);
    assert(!('hands' in v) && typeof v.stock === 'number', 'no other hands, no stock order');
    const others = JSON.stringify({ ...v, hand: [] });
    for (const c of s.hands[0]) if (!s.hands[1].includes(c) && c !== X) assert(!others.includes(`"${c}"`), 'other hands hidden');
    assert.deepStrictEqual(K.view(s, 'zz').hand, [], 'spectator sees no cards');
  }
  const firsts = new Set(Array.from({ length: 40 }, () => K.setup(['a', 'b']).hands[0].join()));
  assert(firsts.size > 35, 'shuffle varies');
  console.log('deal + hidden hands OK');
}

// ---------------------------------------------------------------- bots
function testBots(games) {
  const t0 = Date.now();
  let moves = 0, rounds = 0;
  const kinds = {};
  for (let g = 0; g < games; g++) {
    const n = 2 + (g % 3);
    const pids = ['a', 'b', 'c', 'd'].slice(0, n);
    const s = K.setup(pids, { bestOf: g % 5 === 0 ? 71 : 51 });
    if (g % 40 === 7) K.leave(s, pids[g % n]);
    let k = 0;
    while (!K.result(s)) {
      const p = K.current(s);
      const a = K.botAction(s, p);
      const hand0 = JSON.stringify(s.hands[s.turn]);
      try { K.apply(s, p, a); } catch (e) { throw new Error(`bot made an illegal move ${JSON.stringify(a)}: ${e.userMsg || e.message}\nhand ${hand0}`); }
      if (!s.over) assert.strictEqual(total(s), 106, 'cards are never lost');
      for (const m of s.melds) assert(I.parseMeld(m.cards), 'every table meld stays legal');
      if (++k > 6000) throw new Error('game never ends');
    }
    moves += k;
    rounds += s.history.length;
    for (const h of s.history) kinds[h.kind] = (kinds[h.kind] || 0) + 1;
    const r = K.result(s);
    assert.strictEqual(r.ranking.length, n);
    assert.strictEqual(new Set(r.ranking).size, n);
    if (g % 40 === 7) assert.notStrictEqual(r.winner, pids[g % n], 'a player who left never wins');
    if (g % 100 === 0) JSON.stringify(K.view(s, pids[0]));
  }
  console.log(`konkan: ${games} bot games (${moves} moves, ${rounds} rounds ${JSON.stringify(kinds)}) in ${Date.now() - t0}ms, no illegal move`);
}

// A bot (or AFK auto-play) that took the discard always uses it.
function testBotTakes() {
  let s = fixed([['7S', '7H', '2C', '9D', 'JH'], ['2D']], { phase: 'draw', discard: ['7D'], opened: [true, false] });
  assert.deepStrictEqual(K.botAction(s, 'a'), { type: 'take' });
  K.apply(s, 'a', K.botAction(s, 'a'));
  const a = K.botAction(s, 'a');
  assert.strictEqual(a.type, 'meld');
  K.apply(s, 'a', a);
  // a human who took and then went AFK: the auto move uses it
  s = fixed([['KS', 'KH', 'QD', 'QC', 'QH', 'JS', 'JH', 'JD', '2C', '5D', '8H', '3S', '9C', '4D'], ['2D']], { phase: 'draw', discard: ['KD'] });
  K.apply(s, 'a', { type: 'take' });
  K.apply(s, 'a', K.botAction(s, 'a'));
  assert(s.opened[0] && !s.mustUse);
  // the bot keeps partial melds and throws the loose expensive card
  s = fixed([['5S', '6S', 'KD', '9H', '9C', '2H', '3H', '4C', 'QC', 'JH', '8D', 'TC', '7C', 'AD', '2D'], ['2D']]);
  const d = K.botAction(s, 'a');
  assert.strictEqual(d.type, 'discard');
  assert(!['5S', '6S', '9H', '9C', '2H', '3H'].includes(d.card), 'keeps pairs and near-runs: threw ' + d.card);
  console.log('bot take / discard sense OK');
}

// ---------------------------------------------------------------- AFK auto-play through the room manager
async function testAfk() {
  const MG = require('../lib/minigames');
  const T = MG._test;
  const fast = { ...K, turnMs: 40 };
  const room = T.newRoom(fast, { isPrivate: true, max: 3, opts: {} });
  const h = T.addPlayer(room, 'إنسان', false);
  for (let k = 0; k < 2; k++) T.addPlayer(room, 'بوت', true);
  h.conns = 1;
  T.startGame(room);
  assert.strictEqual(K.current(room.state), h.id, 'the human acts first');
  const seq0 = room.seq;
  // the first missed turn may end with an auto-discard: the bots then play a full round before the second miss
  for (let k = 0; k < 500 && !h.auto; k++) await new Promise((r) => setTimeout(r, 50));
  assert(h.auto, 'two missed turns -> auto-play');
  assert(room.seq >= seq0 + 2, 'game went on');
  const seq1 = room.seq;
  await new Promise((r) => setTimeout(r, 3000));
  assert(room.seq > seq1, 'auto-played seat keeps playing');
  clearTimeout(room.timer);
  room.status = 'ended';
  MG.rooms.delete(room.code);
  console.log('AFK auto-play OK');
}

// ---------------------------------------------------------------- room API
async function testApi(BASE) {
  let ipN = 0;
  const call = async (path, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.79.${Math.floor(ipN / 200)}.${ipN++ % 200}` };
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
  const g = site.games.find((x) => x.slug === 'konkan');
  assert(g && g.enabled && g.tags.includes('cards') && g.minPlayers === 2 && g.maxPlayers === 4, 'konkan in the registry with the cards tag');
  const me = await call('/api/g/create', { game: 'konkan', name: 'لاعب', vsBot: true, players: 3, bestOf: 71 });
  assert.strictEqual(me.status, 200);
  const st = await snapshot(me.code, me);
  assert.strictEqual(st.status, 'playing');
  assert.strictEqual(st.players.filter((p) => p.isBot).length, 2);
  assert.strictEqual(st.state.minOpen, 71, 'opening option travels');
  assert([14, 15].includes(st.state.hand.length));
  assert(!('hands' in st.state) && !('stock' in st.state && Array.isArray(st.state.stock)));
  const spec = await snapshot(me.code, null);
  assert.deepStrictEqual(spec.state.hand, []);
  // two humans
  const host = await call('/api/g/create', { game: 'konkan', name: 'المضيف', isPrivate: true });
  const friend = await call('/api/g/join', { code: host.code, name: 'صاحبي' });
  assert.strictEqual(friend.status, 200);
  assert.strictEqual((await call('/api/g/act', { code: host.code, pid: host.pid, token: host.token, type: 'start' })).status, 200, '2 players can start');
  const a = await snapshot(host.code, host), b = await snapshot(host.code, friend);
  assert.strictEqual(a.state.n, 2);
  const json = JSON.stringify(a);
  const bOnly = b.state.hand.filter((c) => c !== 'XX' && !a.state.hand.includes(c));
  assert(!bOnly.some((c) => json.includes(`"${c}"`)), 'host does not see the friend\'s cards');
  const cur = a.turn.pid === host.pid ? host : friend;
  let r = await call('/api/g/act', { code: host.code, pid: cur.pid, token: cur.token, type: 'discard', card: 'ZZ' });
  assert.strictEqual(r.status, 400, 'bad card refused');
  const other = cur === host ? friend : host;
  r = await call('/api/g/act', { code: host.code, pid: other.pid, token: other.token, type: 'draw' });
  assert.strictEqual(r.status, 409, 'not your turn');
  const curHand = (cur === host ? a : b).state.hand;
  r = await call('/api/g/act', { code: host.code, pid: cur.pid, token: cur.token, type: 'discard', card: curHand[0] });
  assert.strictEqual(r.status, 200, 'first player discards');
  const a2 = await snapshot(host.code, other);
  assert.strictEqual(a2.state.phase, 'draw');
  assert.strictEqual(a2.state.discard, curHand[0]);
  for (const p of [me, host, friend]) await call('/api/g/act', { code: p.code || host.code, pid: p.pid, token: p.token, type: 'leave' });
  console.log('konkan room API OK');
}

(async () => {
  testMelds();
  testPlay();
  testScoring();
  testDealAndView();
  testBotTakes();
  testBots(Number(process.env.KONKAN_GAMES) || 1200);
  await testAfk();
  if (process.argv[2]) await testApi(process.argv[2]);
  console.log('KONKAN TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
