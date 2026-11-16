'use strict';
// Rules, bots and room API of the small games (games/ + lib/minigames.js).
// Run: node tharwa-game/test/minigames.js [baseUrl]   — without a base URL only the rules/bot tests run.
const assert = require('assert');
const { GAMES } = require('../games');
const XO = GAMES.xo, C4 = GAMES.connect4, L = GAMES.ludo;

const throwsMsg = (fn, re, what) => assert.throws(fn, (e) => !!e.userMsg && (!re || re.test(e.userMsg)), what);
const noSlip = (n) => (n === 1000 ? 999 : 0);                                      // xo bot without random slips

// ---------------------------------------------------------------- إكس أو
function testXO() {
  let s = XO.setup(['a', 'b']);
  assert.strictEqual(XO.current(s), 'a');
  throwsMsg(() => XO.apply(s, 'b', { type: 'place', cell: 0 }), /دورك/, 'out of turn');
  XO.apply(s, 'a', { type: 'place', cell: 0 });
  throwsMsg(() => XO.apply(s, 'b', { type: 'place', cell: 0 }), /مليانة/, 'occupied cell');
  throwsMsg(() => XO.apply(s, 'b', { type: 'place', cell: 9 }), /خانة/, 'bad cell');
  throwsMsg(() => XO.apply(s, 'x', { type: 'place', cell: 1 }), null, 'stranger');
  for (const [p, c] of [['b', 3], ['a', 1], ['b', 4], ['a', 2]]) XO.apply(s, p, { type: 'place', cell: c });
  assert.deepStrictEqual(XO.result(s).winner, 'a', 'top row wins');
  assert.deepStrictEqual(s.line, [0, 1, 2]);
  throwsMsg(() => XO.apply(s, 'b', { type: 'place', cell: 8 }), /خلصت/, 'no moves after the end');

  s = XO.setup(['a', 'b']);
  for (const [p, c] of [['a', 2], ['b', 0], ['a', 4], ['b', 1], ['a', 6]]) XO.apply(s, p, { type: 'place', cell: c });
  assert.strictEqual(XO.result(s).winner, 'a', 'anti-diagonal wins');

  s = XO.setup(['a', 'b']); // X O X / X O O / O X X  = draw
  for (const [p, c] of [['a', 0], ['b', 1], ['a', 2], ['b', 4], ['a', 3], ['b', 5], ['a', 7], ['b', 6], ['a', 8]]) XO.apply(s, p, { type: 'place', cell: c });
  assert(XO.result(s).draw && !XO.result(s).winner, 'full board without a line is a draw');

  // best of 3: the starter alternates, first to 2 round wins takes the match
  s = XO.setup(['a', 'b'], { bestOf: 3 });
  const winRound = (w, l) => { for (const [p, c] of [[w, 0], [l, 3], [w, 1], [l, 4], [w, 2]]) XO.apply(s, p, { type: 'place', cell: c }); };
  winRound('a', 'b');
  assert(!XO.result(s), 'match goes on after round 1');
  assert.strictEqual(s.round, 2); assert.strictEqual(XO.current(s), 'b', 'round 2 starts with the other player');
  winRound('b', 'a');
  assert.deepStrictEqual(s.score, [1, 1]);
  winRound('a', 'b');
  assert.strictEqual(XO.result(s).winner, 'a', 'a wins 2-1');

  // leaving = the other player wins
  s = XO.setup(['a', 'b']); XO.leave(s, 'a');
  assert.strictEqual(XO.result(s).winner, 'b');

  // bot: takes a win, blocks a loss, never loses with perfect play
  s = XO.setup(['a', 'b']);
  for (const [p, c] of [['a', 0], ['b', 4], ['a', 1]]) XO.apply(s, p, { type: 'place', cell: c });
  assert.strictEqual(XO.botAction(s, 'b').cell, 2, 'bot blocks the top row');
  s = XO.setup(['a', 'b']);
  for (const [p, c] of [['a', 0], ['b', 4], ['a', 8], ['b', 3]]) XO.apply(s, p, { type: 'place', cell: c });
  XO.apply(s, 'a', { type: 'place', cell: 1 });
  assert.strictEqual(XO.botAction(s, 'b').cell, 5, 'bot completes its own row instead of blocking');
  let botLosses = 0;
  for (let g = 0; g < 300; g++) {
    s = XO.setup(g % 2 ? ['bot', 'rnd'] : ['rnd', 'bot']);
    while (!XO.result(s)) {
      const p = XO.current(s);
      const legal = XO.actions(s, p);
      const a = p === 'bot' ? XO.botAction(s, p, noSlip) : legal[Math.floor(Math.random() * legal.length)];
      assert(legal.some((x) => x.cell === a.cell), 'bot move is legal');
      XO.apply(s, p, a);
    }
    if (XO.result(s).winner === 'rnd') botLosses++;
  }
  assert.strictEqual(botLosses, 0, 'minimax bot never loses to a random player');
  console.log('xo rules + bot OK');
}

// ---------------------------------------------------------------- أربعة بخط
function playC4(cols, players = ['a', 'b']) {
  const s = C4.setup(players);
  cols.forEach((c, k) => C4.apply(s, players[k % 2], { type: 'drop', col: c }));
  return s;
}
function testC4() {
  let s = playC4([0, 1, 0, 1, 0, 1, 0]);
  assert.strictEqual(C4.result(s).winner, 'a', 'vertical four');
  s = playC4([0, 0, 1, 1, 2, 2, 3]);
  assert.strictEqual(C4.result(s).winner, 'a', 'horizontal four');
  // diagonal "/": a at (0,0) (1,1) (2,2) (3,3)
  s = playC4([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.strictEqual(C4.result(s).winner, 'a', 'rising diagonal');
  // diagonal "\": a at (3,0) (2,1) (1,2) (0,3)
  s = playC4([3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0]);
  assert.strictEqual(C4.result(s).winner, 'a', 'falling diagonal');
  assert.strictEqual(s.line.length, 4);

  s = C4.setup(['a', 'b']);
  throwsMsg(() => C4.apply(s, 'b', { type: 'drop', col: 0 }), /دورك/, 'out of turn');
  throwsMsg(() => C4.apply(s, 'a', { type: 'drop', col: 7 }), /عمود/, 'bad column');
  s = playC4([0, 0, 0, 0, 0, 0]);
  throwsMsg(() => C4.apply(s, 'a', { type: 'drop', col: 0 }), /مليان/, 'full column');
  assert(!C4.actions(s, 'a').some((x) => x.col === 0), 'full column is not offered');

  // draw: a full board without four in a row
  s = playC4([3, 1, 5, 3, 2, 1, 5, 1, 2, 6, 5, 6, 2, 2, 1, 2, 3, 4, 1, 5, 6, 2, 1, 3, 4, 6, 6, 5, 0, 6, 0, 3, 5, 4, 4, 3, 4, 0, 4, 0, 0, 0]);
  assert(C4.result(s).draw && C4.result(s).winner === null && s.moves === 42, 'full board = draw');

  // bot: wins when it can, blocks when it must
  s = playC4([0, 6, 1, 6, 2]); // a has 0,1,2 on row 0 — b (bot) must block col 3
  assert.strictEqual(C4.botAction(s, 'b').col, 3, 'bot blocks the open three');
  s = playC4([0, 6, 1, 6, 2, 6]); // b has three in col 6 — a (bot side) wins at 3
  assert.strictEqual(C4.botAction(s, 'a').col, 3, 'bot takes the win');
  let wins = 0;
  for (let g = 0; g < 16; g++) {
    s = C4.setup(g % 2 ? ['bot', 'rnd'] : ['rnd', 'bot']);
    while (!C4.result(s)) {
      const p = C4.current(s);
      const legal = C4.actions(s, p);
      const a = p === 'bot' ? C4.botAction(s, p) : legal[Math.floor(Math.random() * legal.length)];
      assert(legal.some((x) => x.col === a.col), 'bot move is legal');
      C4.apply(s, p, a);
    }
    if (C4.result(s).winner === 'bot') wins++;
  }
  assert(wins >= 15, 'alpha-beta bot beats a random player (' + wins + '/16)');
  console.log('connect4 rules + bot OK');
}

// ---------------------------------------------------------------- لودو
function testLudo() {
  const { SAFE, absOf } = L._internal;
  let s = L.setup(['a', 'b']);
  assert.deepStrictEqual(s.corners, [0, 2], 'two players sit in opposite corners');
  throwsMsg(() => L.apply(s, 'a', { type: 'move', token: 0 }), /النرد/, 'move before rolling');
  let ev = L.apply(s, 'a', { type: 'roll' }, { dice: 3 });
  assert(ev.some((e) => e.t === 'pass'), 'no token can leave base without a 6');
  assert.strictEqual(L.current(s), 'b', 'turn passes');
  ev = L.apply(s, 'b', { type: 'roll' }, { dice: 6 });
  assert.strictEqual(s.tokens[1][0], 0, 'a 6 brings a token out (auto: all base tokens are the same move)');
  assert.strictEqual(L.current(s), 'b', 'a 6 gives another roll');
  assert.strictEqual(s.phase, 'roll');
  L.apply(s, 'b', { type: 'roll' }, { dice: 6 }); // two tokens possible now: one out + base
  assert.strictEqual(s.phase, 'move');
  assert.deepStrictEqual(s.legal.sort(), [0, 1, 2, 3]);
  throwsMsg(() => L.apply(s, 'b', { type: 'roll' }), /حرّك/, 'cannot roll twice');
  L.apply(s, 'b', { type: 'move', token: 0 });
  assert.strictEqual(s.tokens[1][0], 6);
  ev = L.apply(s, 'b', { type: 'roll' }, { dice: 6 });
  assert(ev.some((e) => e.t === 'forfeit'), 'third 6 in a row forfeits the turn');
  assert.strictEqual(L.current(s), 'a');
  assert.strictEqual(s.tokens[1][0], 6, 'the third 6 is not played');

  // three 6s only count when in a row
  s = L.setup(['a', 'b']);
  s.tokens[0] = [5, 10, -1, -1];
  L.apply(s, 'a', { type: 'roll' }, { dice: 6 }); L.apply(s, 'a', { type: 'move', token: 0 });
  L.apply(s, 'a', { type: 'roll' }, { dice: 6 }); L.apply(s, 'a', { type: 'move', token: 0 });
  assert.strictEqual(s.sixes, 2);

  // capture on a normal square: victim goes home, mover rolls again
  s = L.setup(['a', 'b']);
  // b (corner 2) token at progress 1 → absolute 27. a (corner 0) token at progress 25 → absolute 25; roll 2 → 27.
  s.tokens[1] = [1, -1, -1, -1];
  s.tokens[0] = [25, -1, -1, -1];
  assert(!SAFE.has(absOf(0, 27)));
  ev = L.apply(s, 'a', { type: 'roll' }, { dice: 2 });
  assert(ev.some((e) => e.t === 'capture'), 'capture event');
  assert.strictEqual(s.tokens[1][0], -1, 'captured token is back in base');
  assert.strictEqual(L.current(s), 'a', 'capture gives another roll');

  // no capture on a star square: both tokens share it
  s = L.setup(['a', 'b']);
  // star at absolute 34 = b's progress 8; a reaches 34 from 30 with a 4
  s.tokens[1] = [8, -1, -1, -1];
  s.tokens[0] = [30, -1, -1, -1];
  ev = L.apply(s, 'a', { type: 'roll' }, { dice: 4 });
  assert(!ev.some((e) => e.t === 'capture'), 'star square is safe');
  assert.strictEqual(s.tokens[1][0], 8);
  assert.strictEqual(s.tokens[0][0], 34);
  // no capture on someone's start square
  s = L.setup(['a', 'b']);
  s.tokens[1] = [0, -1, -1, -1]; // b's start = absolute 26
  s.tokens[0] = [24, -1, -1, -1];
  ev = L.apply(s, 'a', { type: 'roll' }, { dice: 2 });
  assert(!ev.some((e) => e.t === 'capture'), 'start square is safe');

  // exact roll to reach home
  s = L.setup(['a', 'b']);
  s.tokens[0] = [53, 56, 56, 56];
  ev = L.apply(s, 'a', { type: 'roll' }, { dice: 5 });
  assert(ev.some((e) => e.t === 'pass'), '53 + 5 overshoots home: no move');
  assert.strictEqual(s.tokens[0][0], 53);
  L.apply(s, 'b', { type: 'roll' }, { dice: 2 });
  ev = L.apply(s, 'a', { type: 'roll' }, { dice: 3 });
  assert.strictEqual(s.tokens[0][0], 56, 'exact roll reaches home');
  assert(L.result(s) && L.result(s).winner === 'a', 'all four home wins');
  assert.deepStrictEqual(L.result(s).ranking, ['a', 'b']);

  // 4 players: ranking by finishing order, then progress; game goes on until one is left
  s = L.setup(['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(s.corners, [0, 1, 2, 3]);
  s.tokens = [[55, 56, 56, 56], [10, -1, -1, -1], [55, 56, 56, 56], [40, 30, -1, -1]];
  L.apply(s, 'a', { type: 'roll' }, { dice: 1 });
  assert(!L.result(s), 'game continues after the first player finishes');
  assert.strictEqual(L.current(s), 'b');
  L.apply(s, 'b', { type: 'roll' }, { dice: 1 });
  L.apply(s, 'c', { type: 'roll' }, { dice: 1 });
  assert(!L.result(s));
  L.leave(s, 'b');
  assert(L.result(s), 'ends when only one player is left');
  assert.deepStrictEqual(L.result(s).ranking, ['a', 'c', 'd', 'b']);

  // illegal moves
  s = L.setup(['a', 'b']);
  s.tokens[0] = [5, -1, -1, -1];
  L.apply(s, 'a', { type: 'roll' }, { dice: 6 });
  assert.deepStrictEqual(s.legal.sort(), [0, 1, 2, 3]);
  s = L.setup(['a', 'b']);
  s.tokens[0] = [5, 9, -1, -1];
  L.apply(s, 'a', { type: 'roll' }, { dice: 2 });
  throwsMsg(() => L.apply(s, 'a', { type: 'move', token: 2 }), /ما فيها/, 'base token cannot move on a 2');
  throwsMsg(() => L.apply(s, 'b', { type: 'roll' }), /دورك/, 'out of turn');

  // bot: prefers a capture, then leaving base
  s = L.setup(['a', 'b']);
  s.tokens[0] = [25, 3, -1, -1]; s.tokens[1] = [1, -1, -1, -1];
  L.apply(s, 'a', { type: 'roll' }, { dice: 2 });
  assert.strictEqual(L.botAction(s, 'a').token, 0, 'bot captures');
  s = L.setup(['a', 'b']);
  s.tokens[0] = [12, -1, -1, -1]; s.tokens[1] = [-1, -1, -1, -1];
  L.apply(s, 'a', { type: 'roll' }, { dice: 6 });
  assert.notStrictEqual(L.botAction(s, 'a').token, 0, 'bot brings a token out on a 6');

  // many bot-vs-bot games: every bot move is legal and every game ends
  const t0 = Date.now();
  let games = 0;
  for (let g = 0; g < 400; g++) {
    const players = ['a', 'b', 'c', 'd'].slice(0, 2 + (g % 3));
    s = L.setup(players);
    let steps = 0;
    while (!L.result(s)) {
      const p = L.current(s);
      const a = L.botAction(s, p);
      assert(L.actions(s, p).some((x) => x.type === a.type && x.token === a.token), 'ludo bot move is legal');
      L.apply(s, p, a);
      for (const t of s.tokens.flat()) assert(t >= -1 && t <= 56, 'token progress in range');
      if (++steps > 20000) throw new Error('ludo game does not end');
    }
    games++;
  }
  console.log(`ludo rules + ${games} bot games OK (${Date.now() - t0} ms)`);
}

function testBotsAllGames() {
  for (const [slug, mod] of Object.entries(GAMES)) {
    for (let g = 0; g < (slug === 'connect4' ? 12 : 120); g++) {
      const pids = ['p1', 'p2', 'p3', 'p4'].slice(0, slug === 'ludo' ? 2 + (g % 3) : 2);
      const s = mod.setup(pids, { bestOf: [1, 3, 5][g % 3] });
      let n = 0;
      while (!mod.result(s)) {
        const p = mod.current(s);
        const a = mod.botAction(s, p);
        assert(mod.actions(s, p).some((x) => JSON.stringify(x) === JSON.stringify(a)), slug + ' bot made an illegal move');
        mod.apply(s, p, a);
        if (++n > 20000) throw new Error(slug + ' never ends');
      }
      const v = mod.view(s, pids[0]);
      assert(v && JSON.stringify(v), slug + ' view serialises');
    }
  }
  console.log('bot-vs-bot (all games, illegal-move check) OK');
}

// ---------------------------------------------------------------- room API (needs a running server)
async function testApi(BASE) {
  let ipN = 0;
  const call = async (path, body, ip) => {
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip || `10.9.${Math.floor(ipN / 200)}.${ipN++ % 200}` };
    const r = await fetch(BASE + path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j, _list: Array.isArray(j) ? j : null };
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
  // Keeps an SSE stream open (bots only move while a human is watching).
  const watch = (code, me) => {
    const ctrl = new AbortController();
    const q = new URLSearchParams({ code, pid: me.pid, token: me.token });
    fetch(`${BASE}/api/g/events?${q}`, { signal: ctrl.signal }).then((r) => r.body.getReader().read()).catch(() => {});
    return () => ctrl.abort();
  };
  const act = (code, me, type, extra = {}) => call('/api/g/act', { code, pid: me.pid, token: me.token, type, ...extra });

  // registry
  const site = await call('/api/site');
  for (const slug of ['tharwa', 'xo', 'connect4', 'ludo']) {
    const g = site.games.find((x) => x.slug === slug);
    assert(g && g.url === '/games/' + slug && g.enabled, slug + ' listed in /api/site');
  }
  assert.strictEqual(site.games.find((x) => x.slug === 'ludo').maxPlayers, 4);

  assert.strictEqual((await call('/api/g/create', { game: 'chess', name: 'x' })).status, 400, 'unknown game');

  // xo: private room, join, rejoin, start, illegal moves, a full game, rematch
  const host = await call('/api/g/create', { game: 'xo', name: 'المضيف', isPrivate: true, bestOf: 1 });
  assert.strictEqual(host.status, 200); const code = host.code;
  assert(!(await call('/api/g/rooms?game=xo'))._list.some((r) => r.code === code), 'private room not listed');
  const guest = await call('/api/g/join', { code, name: 'الضيف' });
  assert.strictEqual(guest.status, 200); assert.strictEqual(guest.game, 'xo');
  assert.strictEqual((await call('/api/g/join', { code, name: 'تالت' })).status, 409, 'xo room is full at 2');
  let st = await snapshot(code, guest);
  assert.strictEqual(st.me, guest.pid, 'rejoin with token = same player');
  assert.strictEqual(st.players.length, 2);
  assert.strictEqual((await snapshot(code)).me, null, 'no token = spectator');
  assert.strictEqual((await call('/api/g/act', { code, pid: guest.pid, token: 'bad', type: 'chat', text: 'x' })).status, 403, 'bad token');
  assert.strictEqual((await act(code, guest, 'start')).status, 403, 'only host starts');
  assert.strictEqual((await act(code, host, 'place', { cell: 0 })).status, 409, 'no moves in the lobby');
  assert.strictEqual((await act(code, host, 'start')).status, 200);
  st = await snapshot(code, host);
  assert.strictEqual(st.status, 'playing');
  assert(st.turn && st.turn.endsAt > Date.now(), 'turn clock runs');
  const first = st.turn.pid === host.pid ? host : guest, second = first === host ? guest : host;
  assert.strictEqual((await act(code, second, 'place', { cell: 0 })).status, 409, 'not your turn');
  assert.strictEqual((await act(code, first, 'place', { cell: 11 })).status, 400, 'bad cell');
  for (const [p, c] of [[first, 0], [second, 3], [first, 1], [second, 4]]) assert.strictEqual((await act(code, p, 'place', { cell: c })).status, 200);
  assert.strictEqual((await act(code, second, 'place', { cell: 0 })).status, 409, 'not your turn (still)');
  assert.strictEqual((await act(code, first, 'place', { cell: 0 })).status, 400, 'occupied');
  assert.strictEqual((await act(code, first, 'place', { cell: 2 })).status, 200);
  st = await snapshot(code, host);
  assert.strictEqual(st.status, 'ended');
  assert.strictEqual(st.result.winner, first.pid, 'top row wins through the API');
  assert.strictEqual((await act(code, host, 'rematch')).status, 200);
  st = await snapshot(code, host);
  assert.strictEqual(st.status, 'ended', 'rematch waits for every player');
  assert.deepStrictEqual(st.rematch, [host.pid]);
  assert.strictEqual((await act(code, guest, 'rematch')).status, 200);
  st = await snapshot(code, host);
  assert.strictEqual(st.status, 'playing', 'rematch starts when all agreed');
  assert.notStrictEqual(st.turn.pid, first.pid, 'the other player starts the rematch');
  // leaving mid-game = forfeit
  assert.strictEqual((await act(code, guest, 'leave')).status, 200);
  st = await snapshot(code, host);
  assert.strictEqual(st.status, 'ended');
  assert.strictEqual(st.result.winner, host.pid, 'the player who stays wins');
  assert.strictEqual((await call('/api/g/join', { code: 'zzzzz', name: 'x' })).status, 404);

  // ludo vs bots: 4 seats filled with 3 bots, starts at once, bots play while watched
  const lu = await call('/api/g/create', { game: 'ludo', name: 'أنا', vsBot: true, players: 4 });
  assert.strictEqual(lu.status, 200);
  st = await snapshot(lu.code, lu);
  assert.strictEqual(st.status, 'playing');
  assert.strictEqual(st.players.length, 4);
  assert.strictEqual(st.players.filter((p) => p.isBot).length, 3);
  assert.deepStrictEqual(st.state.corners, [0, 1, 2, 3]);
  assert(!(await call('/api/g/rooms?game=ludo'))._list.some((r) => r.code === lu.code), 'vs-bot rooms are private');
  const stop = watch(lu.code, lu);
  // play my own turns quickly until the bots have moved a few times
  for (let k = 0; k < 80; k++) {
    st = await snapshot(lu.code, lu);
    if (st.turn && st.turn.pid === lu.pid) {
      if (st.state.phase === 'roll') assert.strictEqual((await act(lu.code, lu, 'roll')).status, 200);
      else assert.strictEqual((await act(lu.code, lu, 'move', { token: st.state.legal[0] })).status, 200);
    } else await new Promise((r) => setTimeout(r, 250));
    if (st.state.rolls >= 6) break;
  }
  stop();
  assert(st.state.rolls >= 6, 'bots keep the ludo game moving (' + st.state.rolls + ' rolls)');
  assert.strictEqual((await act(lu.code, lu, 'move', { token: 9 })).status >= 400, true, 'illegal ludo action refused');

  // quick play: the second player lands in the first one's public room
  const q1 = await call('/api/g/quick', { game: 'connect4', name: 'سريع1' });
  const q2 = await call('/api/g/quick', { game: 'connect4', name: 'سريع2' });
  assert.strictEqual(q1.code, q2.code, 'quick play joins the open room');
  const listed = (await call('/api/g/rooms?game=connect4'))._list.find((r) => r.code === q1.code);
  assert(listed && listed.players === 2 && listed.max === 2 && listed.game === 'connect4' && listed.status === 'lobby', 'public room listed');
  assert.strictEqual((await call('/api/g/rooms?game=nope')).status, 400);
  // connect4 vs bot: the bot answers my move
  const c4 = await call('/api/g/create', { game: 'connect4', name: 'أنا', vsBot: true });
  const stop2 = watch(c4.code, c4);
  st = await snapshot(c4.code, c4);
  if (st.turn.pid === c4.pid) assert.strictEqual((await act(c4.code, c4, 'drop', { col: 3 })).status, 200);
  let answered = false;
  for (let k = 0; k < 30 && !answered; k++) {
    await new Promise((r) => setTimeout(r, 200));
    st = await snapshot(c4.code, c4);
    answered = st.state.moves >= 1 && st.turn.pid === c4.pid;
  }
  stop2();
  assert(answered, 'connect4 bot made its move');

  // host settings: ludo seats
  const lh = await call('/api/g/create', { game: 'ludo', name: 'مضيف', isPrivate: true, players: 3 });
  assert.strictEqual((await snapshot(lh.code, lh)).max, 3);
  assert.strictEqual((await act(lh.code, lh, 'opts', { max: 5 })).status, 400);
  assert.strictEqual((await act(lh.code, lh, 'start')).status, 409, 'cannot start alone');
  assert.strictEqual((await act(lh.code, lh, 'addBot')).status, 200);
  assert.strictEqual((await act(lh.code, lh, 'start')).status, 200);

  // accounts: logged-in players play under their display name; the stake rule moves points (loser pays the winner)
  const user = (ip) => {
    let cookie = '';
    return async (path, body) => {
      const headers = { 'X-Forwarded-For': ip, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) };
      const r = await fetch(BASE + path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
      for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) cookie = c.split(';')[0];
      return { status: r.status, ...(await r.json().catch(() => ({}))) };
    };
  };
  const tag = Date.now().toString(36).slice(-5);
  const ua = user('10.77.0.1'), ub = user('10.77.0.2');
  assert.strictEqual((await ua('/api/auth/register', { username: 'mga_' + tag, displayName: 'لاعب أ', email: `mga_${tag}@example.com`, password: 'pass123' })).status, 200);
  assert.strictEqual((await ub('/api/auth/register', { username: 'mgb_' + tag, displayName: 'لاعب ب', email: `mgb_${tag}@example.com`, password: 'pass123' })).status, 200);
  const rules = { perWin: 50, stake: 20 };
  const pts = async (u) => (await u('/api/auth/me')).user.points;
  const a0 = await pts(ua), b0 = await pts(ub);
  const A1 = await ua('/api/g/create', { game: 'xo', name: 'تجاهل', isPrivate: true });
  const B1 = await ub('/api/g/join', { code: A1.code, name: 'تجاهل' });
  st = await snapshot(A1.code, A1);
  assert.deepStrictEqual(st.players.map((p) => p.name), ['لاعب أ', 'لاعب ب'], 'account display names are used');
  assert.strictEqual((await ub('/api/g/join', { code: A1.code, name: 'x' })).pid, B1.pid, 'same account re-joins as the same player');
  const actU = (u, me, type, extra) => u('/api/g/act', { code: A1.code, pid: me.pid, token: me.token, type, ...extra });
  const winGame = async (w, wu, l, lu) => {
    st = await snapshot(A1.code, A1);
    const firstIsW = st.turn.pid === w.pid;
    const seqMoves = firstIsW ? [[w, wu, 0], [l, lu, 3], [w, wu, 1], [l, lu, 4], [w, wu, 2]] : [[l, lu, 8], [w, wu, 0], [l, lu, 7], [w, wu, 1], [l, lu, 3], [w, wu, 2]];
    for (const [p, u, c] of seqMoves) assert.strictEqual((await actU(u, p, 'place', { cell: c })).status, 200);
    for (let k = 0; k < 20; k++) { st = await snapshot(A1.code, A1); if (st.result && st.result.points) break; await new Promise((r) => setTimeout(r, 100)); }
    assert.strictEqual(st.result.winner, w.pid);
  };
  assert.strictEqual((await actU(ua, A1, 'start')).status, 200);
  await winGame(A1, ua, B1, ub);
  const a1 = await pts(ua), b1 = await pts(ub);
  const paid1 = Math.min(rules.stake, b0);
  assert.strictEqual(a1, a0 + rules.perWin + paid1, 'winner gets win bonus + stake');
  assert.strictEqual(b1, b0 - paid1, 'loser pays the stake');
  assert.strictEqual(st.result.points[A1.pid], rules.perWin + paid1, 'points shown in the room');
  await actU(ua, A1, 'rematch'); await actU(ub, B1, 'rematch');
  await winGame(B1, ub, A1, ua);
  assert.strictEqual(await pts(ua), a1 - Math.min(rules.stake, a1));
  assert.strictEqual(await pts(ub), b1 + rules.perWin + Math.min(rules.stake, a1));
  const prof = await ua('/api/u/mga_' + tag);
  assert(prof.recent.length >= 2 && prof.recent[0].game === 'xo', 'results are stored with the game slug');

  // rate limit on room creation per address
  let limited = false;
  for (let k = 0; k < 14 && !limited; k++) if ((await call('/api/g/create', { game: 'xo', name: 's', isPrivate: true }, '10.200.0.1')).status === 429) limited = true;
  assert(limited, '/api/g/create is rate limited');
  console.log('minigames room API OK');
}

(async () => {
  testXO();
  testC4();
  testLudo();
  testBotsAllGames();
  if (process.argv[2]) await testApi(process.argv[2]);
  console.log('MINIGAMES TESTS PASSED');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
