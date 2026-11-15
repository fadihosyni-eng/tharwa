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

  // countries: host picks, Arab shuffle, then back to the mixed board
  assert.strictEqual((await act(code, guest, 'setCountry', { slot: 'c1', code: 'jo' })).status, 403, 'only host picks countries');
  assert.strictEqual((await act(code, host, 'shuffleMap', { mode: 'arab' })).status, 200);
  let lobby = await snapshot(code, host);
  const ARAB = ['sy', 'eg', 'jo', 'lb', 'iq', 'sa', 'ae', 'qa', 'kw', 'bh', 'om', 'ye', 'ps', 'dz', 'ma', 'tn', 'ly', 'sd', 'so', 'mr', 'dj', 'km'];
  assert(Object.values(lobby.map).every((c) => ARAB.includes(c)), 'Arab shuffle gives only Arab countries');
  assert.strictEqual((await act(code, host, 'shuffleMap', { mode: 'mix' })).status, 200);
  assert.strictEqual((await act(code, host, 'setCountry', { slot: 'c1', code: 'lb' })).status, 200);
  assert.strictEqual((await act(code, host, 'setCountry', { slot: 'c1', code: 'xx' })).status, 400, 'unknown country rejected');
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
  assert.deepStrictEqual([st.map.c8, st.map.c7, st.map.c6], ['us', 'sy', 'gb'], 'USA, Syria, UK always on the board');
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

  // leaving mid-game = bankrupt -> the other player wins
  assert.strictEqual((await act(code, other, 'leave')).status, 200);
  st = await snapshot(code, cur);
  assert.strictEqual(st.status, 'ended');
  assert.strictEqual(st.game.winner, cur.pid);
  console.log('API OK — room', code, 'winner', st.players.find((p) => p.id === st.game.winner).name);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
