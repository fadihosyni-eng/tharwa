'use strict';
// «ثروة» regression: a player who comes back after their turn timer ran out keeps their turn.
// Bug: /api/act turned the autopilot off, but turnEndsAt stayed in the past, so the next clock tick
// (≤ 1 s later) turned it on again and the computer played the rest of the turn under the player's
// fingers: their next click («ارمي النرد» after a double, «اشتري», «إنهاء الدور») got «مو وقتها هلق».
// The server runs in this process with a fast clock (a 60 s turn timer runs out in 3 s).
// Run: node tharwa-game/test/turn-timer.js
const assert = require('assert');

const SPEED = 20;
const realNow = Date.now, t0 = realNow();
Date.now = () => t0 + (realNow() - t0) * SPEED;
process.env.PORT = String(Number(process.env.TEST_PORT || 8701) + 2);
process.env.STORE = 'memory';
process.env.DATABASE_URL = '';
process.env.ADMIN_USERS = '';
const server = require('../server');

const BASE = 'http://localhost:' + process.env.PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (url, body) => fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ ok: r.ok, body: await r.json() }));

async function until(what, fn, ms = 20000) {
  const end = realNow() + ms;
  while (realNow() < end) { const v = fn(); if (v) return v; await sleep(25); }
  throw new Error('timed out waiting for ' + what);
}

(async () => {
  await server.start();
  const { body: me } = await post('/api/create', { name: 'لاعب', isPrivate: true });
  const act = (type, data = {}) => post('/api/act', { code: me.code, pid: me.pid, token: me.token, type, data });
  assert((await act('settings', { turnTimer: 60 })).ok, 'turn timer set');
  assert((await act('addBot')).ok, 'bot added');

  // live state over SSE, like the browser (bots only play while a player watches)
  let st = null;
  const ctl = new AbortController();
  const sse = await fetch(`${BASE}/api/events?code=${me.code}&pid=${me.pid}&token=${me.token}`, { signal: ctl.signal });
  (async () => {
    const rd = sse.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const m = buf.slice(0, k).match(/^event: state\ndata: (.*)$/s);
        buf = buf.slice(k + 2);
        if (m) st = JSON.parse(m[1]);
      }
    }
  })().catch(() => {});

  assert((await act('start')).ok, 'game started');
  const myTurn = () => st && st.status === 'playing' && st.game.order[st.game.turn] === me.pid;
  // my turn, the timer runs out and the computer takes over (still before the roll)
  await until('my timed-out turn', () => myTurn() && st.game.phase === 'roll' && st.game.autopilot);
  const seq = st.game.rollSeq;
  // I click «ارمي النرد» right away: it works and I get my turn back
  const r = await act('roll');
  assert(r.ok, 'roll after the timeout: ' + JSON.stringify(r.body));
  await until('my roll', () => st.game.rollSeq > seq);
  // for the next 1.5 s (30 s of game time) the computer must not take the turn away again
  const end = realNow() + 1500;
  while (realNow() < end) {
    if (myTurn()) assert(!st.game.autopilot, 'autopilot came back right after the player acted (phase ' + st.game.phase + ')');
    await sleep(25);
  }
  if (myTurn()) {
    const next = { roll: 'roll', buy: 'skip', done: 'end', debt: null, auction: null }[st.game.phase];
    if (next) { const r2 = await act(next); assert(r2.ok, `«${next}» after coming back: ${JSON.stringify(r2.body)}`); }
  }
  const timeouts = st.log.filter((l) => /خلص وقت/.test(l.text)).length;
  assert.strictEqual(timeouts, 1, 'one «time is up» message for the turn, not one per second');
  ctl.abort();
  console.log('TURN TIMER OK — a player who comes back after the timeout keeps the turn');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
