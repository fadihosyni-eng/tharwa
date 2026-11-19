'use strict';
// «انسحاب» (forfeit) in every small game, through the room API (lib/minigames.js):
//   xo / أربعة بخط: the opponent wins;  لودو: the player's pieces leave, the others play on;
//   card games: the computer plays the seat to the end, the player ranks last and never wins.
// After giving up the player stays in the room as a spectator until they leave, and can join the rematch.
// Run: node tharwa-game/test/forfeit.js <baseUrl>
const assert = require('assert');

const BASE = process.argv[2];
if (!BASE) { console.log('forfeit: needs a base URL (run through test/run-all.js)'); process.exit(0); }

let ipN = 0;
async function call(path, body) {
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.8.${Math.floor(ipN / 200)}.${ipN++ % 200}` };
  const r = await fetch(BASE + path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
const act = (room, me, type, extra = {}) => call('/api/g/act', { code: room, pid: me.pid, token: me.token, type, ...extra });
// One SSE state (as `me`, or as a spectator).
async function snapshot(code, me) {
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
}
const pl = (st, me) => st.players.find((p) => p.id === me.pid);
// A room with `humans` players (the first one hosts), filled up with bots, started.
async function table(game, humans, extra = {}) {
  const host = await call('/api/g/create', { game, name: 'مضيف', isPrivate: true, ...extra });
  assert.strictEqual(host.status, 200, game + ' room created');
  const list = [host];
  for (let k = 1; k < humans; k++) {
    const g = await call('/api/g/join', { code: host.code, name: 'ضيف' + k });
    assert.strictEqual(g.status, 200, game + ' join');
    list.push(g);
  }
  let st = await snapshot(host.code, host);
  while (st.players.length < st.max) { assert.strictEqual((await act(host.code, host, 'addBot')).status, 200); st = await snapshot(host.code, host); }
  assert.strictEqual((await act(host.code, host, 'start')).status, 200, game + ' started');
  return { code: host.code, list };
}

(async () => {
  // ---------------------------------------------------------------- xo: two players
  {
    const { code, list: [a, b] } = await table('xo', 2, { bestOf: 3 });
    const pre = await call('/api/g/create', { game: 'xo', name: 'لوبي', isPrivate: true });
    assert.strictEqual((await act(pre.code, pre, 'forfeit')).status, 409, 'no forfeit in the lobby');
    assert.strictEqual((await act(code, a, 'forfeit')).status, 200);
    let st = await snapshot(code, a);
    assert.strictEqual(st.status, 'ended', 'xo: forfeit ends the match');
    assert.strictEqual(st.result.winner, b.pid, 'xo: the opponent wins');
    assert.strictEqual(st.me, a.pid, 'xo: the player who gave up is still in the room');
    assert(pl(st, a).left && pl(st, a).forfeit, 'xo: marked as forfeited');
    assert.strictEqual((await act(code, a, 'forfeit')).status, 409, 'no second forfeit');
    assert.strictEqual((await act(code, a, 'chat', { text: 'مبروك' })).status, 200, 'a forfeited player can still chat');
    // both want another game: the one who gave up is back at the table
    assert.strictEqual((await act(code, a, 'rematch')).status, 200);
    assert.strictEqual((await act(code, b, 'rematch')).status, 200);
    st = await snapshot(code, a);
    assert.strictEqual(st.status, 'playing', 'xo: rematch with the player who gave up');
    assert(!pl(st, a).left && !pl(st, a).forfeit && pl(st, a).seat >= 0, 'xo: seated again');
  }
  // ---------------------------------------------------------------- connect4 vs the computer
  {
    const me = await call('/api/g/create', { game: 'connect4', name: 'أنا', vsBot: true });
    assert.strictEqual((await act(me.code, me, 'forfeit')).status, 200);
    const st = await snapshot(me.code, me);
    assert.strictEqual(st.status, 'ended');
    const bot = st.players.find((p) => p.isBot);
    assert.strictEqual(st.result.winner, bot.id, 'connect4: the computer wins');
    assert.strictEqual((await act(me.code, me, 'drop', { col: 3 })).status, 409, 'no moves after giving up');
  }
  // ---------------------------------------------------------------- ludo: 2 humans + 1 bot
  {
    const { code, list: [a, b] } = await table('ludo', 2, { players: 3 });
    assert.strictEqual((await act(code, a, 'forfeit')).status, 200);
    let st = await snapshot(code, b);
    assert.strictEqual(st.status, 'playing', 'ludo: the others play on');
    const seat = st.state.seats.indexOf(a.pid);
    assert(st.state.left[seat], 'ludo: the seat is out');
    assert(st.state.tokens[seat].every((t) => t < 0), 'ludo: the pieces left the board');
    assert.notStrictEqual(st.turn.pid, a.pid, 'ludo: never the turn of the player who gave up');
    st = await snapshot(code, a);
    assert.strictEqual(st.me, a.pid, 'ludo: still watching');
    assert.strictEqual((await act(code, a, 'roll')).status, 409, 'ludo: no rolls after giving up');
    // then they leave the room for good; the game goes on for the others
    assert.strictEqual((await act(code, a, 'leave')).status, 200);
    st = await snapshot(code, b);
    assert.strictEqual(st.status, 'playing');
    assert(!pl(st, a).forfeit && pl(st, a).left, 'ludo: gone from the room');
    assert.strictEqual((await act(code, b, 'forfeit')).status, 200);
    st = await snapshot(code, b);
    assert.strictEqual(st.status, 'ended', 'ludo: nobody left to play: the computer finishes at once');
    assert.notStrictEqual(st.result.winner, b.pid);
    assert.deepStrictEqual(st.result.ranking.slice(-2).sort(), [a.pid, b.pid].sort(), 'ludo: players who quit rank last');
  }
  // ---------------------------------------------------------------- ludo vs 3 bots
  {
    const me = await call('/api/g/create', { game: 'ludo', name: 'أنا', vsBot: true, players: 4 });
    assert.strictEqual((await act(me.code, me, 'forfeit')).status, 200);
    const st = await snapshot(me.code, me);
    assert.strictEqual(st.status, 'ended', 'ludo vs bots: finished right away');
    assert.strictEqual(st.result.ranking[st.result.ranking.length - 1], me.pid, 'ludo vs bots: last');
  }
  // ---------------------------------------------------------------- card games
  for (const game of ['tarneeb', '400', 'trix', 'konkan']) {
    const { code, list: [a, b] } = await table(game, 2);
    assert.strictEqual((await act(code, a, 'forfeit')).status, 200);
    let st = await snapshot(code, b);
    assert.strictEqual(st.status, 'playing', game + ': the others play on');
    const seat = st.state.seats.indexOf(a.pid);
    assert(st.state.gone[seat], game + ': the computer plays the seat');
    assert.strictEqual((await snapshot(code, a)).me, a.pid, game + ': still watching');
    assert.strictEqual((await act(code, b, 'forfeit')).status, 200);
    st = await snapshot(code, a);
    assert.strictEqual(st.status, 'ended', game + ': no human plays any more: finished at once');
    const winners = st.result.winners || [st.result.winner];
    assert(!winners.includes(a.pid) && !winners.includes(b.pid), game + ': players who gave up never win');
    assert.deepStrictEqual(st.result.ranking.slice(-2).sort(), [a.pid, b.pid].sort(), game + ': players who gave up rank last');
    assert.strictEqual((await act(code, a, 'leave')).status, 200);
    assert.strictEqual((await snapshot(code, b)).status, 'ended', game + ': room stays open for the last spectator');
    assert.strictEqual((await act(code, b, 'leave')).status, 200);
    assert.strictEqual((await call('/api/g/room?code=' + code)).status, 404, game + ': room closed when everyone left');
  }
  console.log('FORFEIT OK — xo, connect4, ludo, tarneeb, 400, trix, konkan');
})().catch((e) => { console.error(e); process.exit(1); });
