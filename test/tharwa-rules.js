'use strict';
// «ثروة»: the «لا إيجار للمسجون» room option, and bankrupt players staying in the room as spectators.
// Run: node tharwa-game/test/tharwa-rules.js [baseUrl]   — without a base URL only the engine part runs.
const assert = require('assert');
const B = require('../game/board');
const E = require('../game/engine');

// ---------------------------------------------------------------- engine: no rent while the owner is in jail
function room(noRentInJail) {
  const r = {
    code: 'jail', status: 'lobby', log: [], chat: [], game: null,
    settings: { maxPlayers: 4, startingCash: 1500, doubleRent: true, vacationCash: true, auction: true, noRentInJail, evenBuild: true, mortgage: true, randomOrder: false, turnTimer: 0 },
    players: [{ id: 'a', name: 'أحمد' }, { id: 'b', name: 'باسل' }],
  };
  E.newGame(r);
  return r;
}
// Rolls a 2 and a 3 for `a`, who stands 5 squares before a city owned by `b`.
function landOnOwned(r, ownerInJail) {
  const city = B.TILES.find((t) => t.idx > 5 && t.type === 'city').idx;
  const [a, b] = r.players;
  a.pos = city - 5;
  r.game.props[city] = { owner: 'b', houses: 0, mortgaged: false };
  if (ownerInJail) { b.pos = B.JAIL; b.inJail = true; }
  const real = Math.random, dice = [0.2, 0.4];
  let k = 0;
  Math.random = () => dice[k++ % 2];
  try { E.act(r, 'a', 'roll'); } finally { Math.random = real; }
  assert.strictEqual(a.pos, city, 'landed on the owned city');
  return { a, b, rent: B.TILES[city].rent[0] };
}

{ // option on + owner in jail: nothing paid, everyone gets a «norent» notice
  const r = room(true);
  const { a, b } = landOnOwned(r, true);
  assert.strictEqual(a.money, 1500, 'visitor paid nothing');
  assert.strictEqual(b.money, 1500, 'jailed owner got nothing');
  assert.strictEqual(r.game.notice.kind, 'norent', 'no-rent notice for the clients');
  assert.strictEqual(r.game.notice.to, 'b');
  assert(/بالسجن — ما في إيجار/.test(r.log[r.log.length - 1].text), 'log says why');
}
{ // option on + owner free: normal rent
  const r = room(true);
  const { a, b, rent } = landOnOwned(r, false);
  assert.strictEqual(a.money, 1500 - rent);
  assert.strictEqual(b.money, 1500 + rent);
  assert.strictEqual(r.game.notice.kind, 'rent');
}
{ // option off + owner in jail: rent is paid as usual
  const r = room(false);
  const { a, b, rent } = landOnOwned(r, true);
  assert.strictEqual(a.money, 1500 - rent, 'without the option a jailed owner still collects');
  assert.strictEqual(b.money, 1500 + rent);
}
console.log('no rent in jail OK');

// ---------------------------------------------------------------- server: a bankrupt player stays in the room
async function api(BASE) {
  const call = async (path, body) => {
    const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.66.0.1' }, body: JSON.stringify(body) } : {});
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const snapshot = async (code, me) => {
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
  };
  const host = await call('/api/create', { name: 'المضيف', isPrivate: true });
  const guest = await call('/api/join', { code: host.code, name: 'الضيف' });
  const act = (me, type, data) => call('/api/act', { code: host.code, pid: me.pid, token: me.token, type, data });
  assert.strictEqual((await act(host, 'settings', { noRentInJail: true })).status, 200);
  assert.strictEqual((await snapshot(host.code, host)).settings.noRentInJail, true, 'option saved on the room');
  assert.strictEqual((await act(host, 'addBot')).status, 200);
  assert.strictEqual((await act(host, 'start')).status, 200);
  assert.strictEqual((await act(guest, 'bankrupt')).status, 200, 'guest gives up');
  let st = await snapshot(host.code, guest);
  const g = st.players.find((p) => p.id === guest.pid);
  assert(g && g.bankrupt && !g.left, 'bankrupt guest is still listed, not «left»');
  assert.strictEqual(st.status, 'playing', 'the game goes on (host + bot)');
  const info = await call(`/api/room?code=${host.code}&pid=${guest.pid}`);
  assert.strictEqual(info.member, true, 'a reload keeps the seat (spectator, not a stranger)');
  assert.strictEqual((await act(guest, 'chat', { text: 'لسا هون' })).status, 200, 'bankrupt player can still chat');
  assert.strictEqual((await act(guest, 'roll')).status, 400, 'but cannot play this game any more');
  // host gives up too -> bot wins; the host restarts and the bankrupt guest plays the next game
  assert.strictEqual((await act(host, 'bankrupt')).status, 200);
  st = await snapshot(host.code, host);
  assert.strictEqual(st.status, 'ended');
  assert.strictEqual((await act(host, 'restart')).status, 200);
  assert.strictEqual((await act(host, 'start')).status, 200);
  st = await snapshot(host.code, guest);
  const g2 = st.players.find((p) => p.id === guest.pid);
  assert(g2 && !g2.bankrupt && st.game.order.includes(guest.pid), 'the spectator is back in the next game');
  console.log('bankrupt player stays as spectator OK');
}

(async () => {
  if (process.argv[2]) await api(process.argv[2]);
  console.log('THARWA RULES OK');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
