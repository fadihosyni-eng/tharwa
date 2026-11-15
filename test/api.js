'use strict';
// End-to-end check against a running server: two players, settings, start, turns.
// Run: node tharwa-game/test/api.js [baseUrl]   (default http://localhost:8700)
const assert = require('assert');
const BASE = process.argv[2] || 'http://localhost:8700';

async function call(path, body) {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
// Reads the first `state` event from the SSE stream.
async function snapshot(code, me) {
  const q = new URLSearchParams({ code, ...(me ? { pid: me.pid, token: me.token } : {}) });
  const ctrl = new AbortController();
  const r = await fetch(`${BASE}/api/events?${q}`, { signal: ctrl.signal });
  const reader = r.body.getReader();
  let buf = '';
  for (;;) {
    const { value } = await reader.read();
    buf += Buffer.from(value).toString('utf8');
    const m = buf.match(/event: state\ndata: (.*)\n\n/);
    if (m) { ctrl.abort(); return JSON.parse(m[1]); }
  }
}
const act = (code, me, type, data) => call('/api/act', { code, pid: me.pid, token: me.token, type, data });

(async () => {
  const host = await call('/api/create', { name: 'المضيف', isPrivate: true });
  assert.strictEqual(host.status, 200); const code = host.code;
  const guest = await call('/api/join', { code, name: 'الضيف' });
  assert.strictEqual(guest.status, 200, 'second player joins by code');

  // settings: only host, only allowed cash values
  assert.strictEqual((await act(code, guest, 'settings', { startingCash: 3000 })).status, 403, 'guest cannot change settings');
  assert.strictEqual((await act(code, host, 'settings', { startingCash: 700 })).status, 400, 'cash must be 500..3000 step 500');
  for (const cash of [500, 1000, 1500, 2000, 2500, 3000]) {
    assert.strictEqual((await act(code, host, 'settings', { startingCash: cash })).status, 200, 'cash ' + cash);
  }
  assert.strictEqual((await act(code, host, 'settings', { startingCash: 2000, maxPlayers: 3, turnTimer: 60 })).status, 200);
  assert.strictEqual((await act(code, host, 'settings', { maxPlayers: 1 })).status, 400, 'max players >= 2');

  // private room is not listed
  const list = await call('/api/rooms');
  assert(!JSON.stringify(list).includes(code), 'private room hidden from list');

  // bad token rejected
  assert.strictEqual((await call('/api/act', { code, pid: guest.pid, token: 'x', type: 'chat', data: { text: 'hi' } })).status, 403);
  assert.strictEqual((await act(code, guest, 'chat', { text: 'مرحبا 👋' })).status, 200);

  // countries: host picks; the board is Arab-only (Syria, Jordan, Iraq always on top)
  const ARAB = ['sy', 'eg', 'jo', 'lb', 'iq', 'sa', 'ae', 'qa', 'kw', 'bh', 'om', 'ye', 'ps', 'dz', 'ma', 'tn', 'ly', 'sd', 'so', 'mr', 'dj', 'km'];
  assert.strictEqual((await act(code, guest, 'setCountry', { slot: 'c1', code: 'jo' })).status, 403, 'only host picks countries');
  for (let k = 0; k < 5; k++) {
    assert.strictEqual((await act(code, host, 'shuffleMap', { mode: k % 2 ? 'mix' : 'arab' })).status, 200);
    const m = (await snapshot(code, host)).map;
    assert.deepStrictEqual([m.c8, m.c7, m.c6], ['sy', 'jo', 'iq'], 'Syria, Jordan, Iraq always the top three');
    assert(Object.values(m).every((c) => ARAB.includes(c)), 'shuffle gives only Arab countries (any mode)');
    assert.strictEqual(new Set(Object.values(m)).size, 8, 'shuffle gives 8 distinct countries');
  }
  assert.strictEqual((await act(code, host, 'setCountry', { slot: 'c1', code: 'lb' })).status, 200);
  assert.strictEqual((await act(code, host, 'setCountry', { slot: 'c1', code: 'xx' })).status, 400, 'unknown country rejected');
  assert.strictEqual((await act(code, host, 'setCountry', { slot: 'c2', code: 'us' })).status, 400, 'non-Arab country rejected');
  let lobby;
  lobby = await snapshot(code, host);
  assert.strictEqual(lobby.map.c1, 'lb', 'host-chosen country is on the board');
  assert.strictEqual((await act(code, guest, 'piece', { piece: lobby.players[0].piece })).status, 409, 'piece already taken');

  assert.strictEqual((await act(code, guest, 'start')).status, 403, 'only host starts');
  assert.strictEqual((await act(code, host, 'start')).status, 200);
  assert.strictEqual((await call('/api/join', { code, name: 'متأخر' })).status, 409, 'cannot join after start');

  let st = await snapshot(code, host);
  assert.strictEqual(st.status, 'playing');
  assert.deepStrictEqual(st.players.map((p) => p.money), [2000, 2000], 'everyone starts with the chosen cash');
  assert.strictEqual(st.chat[0].text, 'مرحبا 👋');
  assert.deepStrictEqual([st.map.c8, st.map.c7, st.map.c6], ['sy', 'jo', 'iq'], 'Syria, Jordan, Iraq always the top three');
  assert.strictEqual(new Set(Object.values(st.map)).size, 8, 'eight distinct countries');
  assert(Object.values(st.map).every((c) => ARAB.includes(c)), 'all eight countries are Arab');
  assert.strictEqual(new Set(Object.values(st.map)).size, 8, '8 different countries');
  assert(st.game.turnEndsAt > Date.now(), 'turn clock is running');

  const curId = st.game.order[st.game.turn];
  const cur = curId === host.pid ? host : guest, other = cur === host ? guest : host;

  // loan: cur lends other $300 at 10% for 3 rounds; other accepts
  assert.strictEqual((await act(code, cur, 'loanOffer', { to: other.pid, role: 'lend', amount: 300, interest: 10, rounds: 3 })).status, 200);
  st = await snapshot(code, host);
  const loan = st.game.loans[0];
  assert.strictEqual(loan.repay, 330);
  assert.strictEqual((await act(code, cur, 'loanAccept', { id: loan.id })).status, 400, 'proposer cannot accept own offer');
  assert.strictEqual((await act(code, other, 'loanAccept', { id: loan.id })).status, 200);
  st = await snapshot(code, host);
  const money = (pid) => st.players.find((p) => p.id === pid).money;
  assert.strictEqual(money(cur.pid), 1700, 'lender paid 300');
  assert.strictEqual(money(other.pid), 2300, 'borrower got 300');
  assert.strictEqual(st.game.loans[0].state, 'active');
  assert.strictEqual((await act(code, other, 'loanRepay', { id: loan.id })).status, 200, 'borrower repays early');
  st = await snapshot(code, host);
  assert.strictEqual(money(cur.pid), 2030, 'lender got 330 back');
  assert.strictEqual(st.game.loans.length, 0);
  assert.strictEqual((await act(code, other, 'roll')).status, 400, 'not your turn');
  assert.strictEqual((await act(code, cur, 'roll')).status, 200);
  st = await snapshot(code, host);
  assert.strictEqual(st.game.rollSeq, 1);
  const me = st.players.find((p) => p.id === cur.pid);
  console.log('rolled', st.game.dice, '-> tile', me.pos, 'phase', st.game.phase);

  // finish the turn whatever happened
  for (let k = 0; k < 6 && st.game.order[st.game.turn] === cur.pid; k++) {
    const ph = st.game.phase;
    const type = ph === 'buy' ? 'buy' : ph === 'roll' ? 'roll' : ph === 'done' ? 'end' : ph === 'debt' ? 'bankrupt' : null;
    if (!type) break;
    await act(code, cur, type);
    st = await snapshot(code, host);
  }
  assert.notStrictEqual(st.game.order[st.game.turn], cur.pid, 'turn passed to the other player');

  // auction queue: the current player sells 2 properties back to back (engine-level, deterministic)
  {
    const E = require('../game/engine'), B = require('../game/board');
    const room = { code: 'q', status: 'lobby', log: [], chat: [], map: B.randomMap(),
      settings: { maxPlayers: 3, startingCash: 1500, doubleRent: true, vacationCash: true, auction: true, noRentInJail: false, evenBuild: true, mortgage: true, randomOrder: false, turnTimer: 0 },
      players: [{ id: 'a', name: 'أ' }, { id: 'b', name: 'ب' }] };
    room.tiles = B.tilesFor(room.map);
    E.newGame(room);
    const g = room.game, seller = E.current(room), buyer = room.players.find((x) => x !== seller);
    g.props[5] = { owner: seller.id, houses: 0, mortgaged: false };
    g.props[15] = { owner: seller.id, houses: 0, mortgaged: false };
    E.act(room, seller.id, 'sellAuction', { idxs: [5, 15], min: 20 });
    assert.strictEqual(g.auction.idx, 5, 'first lot is up');
    assert.deepStrictEqual([g.auction.lot, g.auction.lots, g.auctionQueue.length], [1, 2, 1]);
    E.act(room, buyer.id, 'bid', { amount: 50 });
    E.endAuction(room);
    assert.strictEqual(g.props[5].owner, buyer.id, 'lot 1 sold to the bidder');
    assert.strictEqual(g.auction && g.auction.idx, 15, 'lot 2 starts right after');
    assert.strictEqual(g.auction.lot, 2);
    E.act(room, buyer.id, 'bid', { amount: 60 });
    E.endAuction(room);
    assert.strictEqual(g.props[15].owner, buyer.id, 'lot 2 sold');
    assert.strictEqual(g.auction, null); assert.strictEqual(g.auctionQueue.length, 0);
    assert(room.log.some((l) => l.text.includes('اللوت التالي')), 'next-lot log line');
    console.log('auction queue OK');
  }

  // leaving mid-game = bankrupt -> the other player wins
  assert.strictEqual((await act(code, other, 'leave')).status, 200);
  st = await snapshot(code, cur);
  assert.strictEqual(st.status, 'ended');
  assert.strictEqual(st.game.winner, cur.pid);
  console.log('API OK — room', code, 'winner', st.players.find((p) => p.id === st.game.winner).name);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
