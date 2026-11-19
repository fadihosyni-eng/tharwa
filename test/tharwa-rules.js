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

// ---------------------------------------------------------------- engine: rent timing (notice follows the walk)
{ // the rent notice names the move it belongs to, so clients show it (and the money fly) only after the walk
  const r = room(false);
  landOnOwned(r, false);
  const g = r.game, last = g.moves[g.moves.length - 1];
  assert.strictEqual(last.pid, 'a', 'the walk is recorded');
  assert.strictEqual(g.notice.kind, 'rent');
  assert.strictEqual(g.notice.moveSeq, last.seq, 'rent notice waits for this exact walk');
  assert(g.notice.seq > 0 && g.notice.paid === g.notice.amount, 'full rent paid');
}
{ // a card that moves the player: the card waits for the dice walk, the rent waits for the card's move
  const r = room(false);
  const g = r.game, [a] = r.players;
  const ch = B.TILES.find((t) => t.type === 'chance').idx;
  a.pos = ch - 4;
  const realCards = B.CHANCE.slice();
  const moveIdx = B.CHANCE.findIndex((c) => c.kind === 'move' && B.isProp(B.TILES[c.to]));
  g.chance = [moveIdx];
  g.props[B.CHANCE[moveIdx].to] = { owner: 'b', houses: 0, mortgaged: false };
  const real = Math.random;
  let k = 0;
  Math.random = () => [0.0, 0.5][k++ % 2]; // dice 1 + 4 = 5 steps
  a.pos = ch - 5;
  try { E.act(r, 'a', 'roll'); } finally { Math.random = real; }
  assert.strictEqual(g.card && g.card.kind, 'move', 'drew the moving card');
  const walk = g.moves[g.moves.length - 2], cardMove = g.moves[g.moves.length - 1];
  assert.strictEqual(walk.to, ch, 'dice walk ends on «حظ»');
  assert.strictEqual(g.card.moveSeq, walk.seq, 'card shows after the dice walk');
  assert.strictEqual(g.notice.moveSeq, cardMove.seq, 'rent shows after the card move');
  assert.deepStrictEqual(B.CHANCE, realCards);
}
console.log('rent / card timing order OK');

{ // a roll names the throw it answers: a stale or double click (lost the race to the autopilot) does nothing
  const r = room(false);
  const g = r.game, a = r.players[0];
  const seq = g.rollSeq;
  a.pos = 0;
  const real = Math.random; let k = 0;
  Math.random = () => [0.2, 0.4][k++ % 2]; // 2 + 3, no double
  try {
    E.act(r, 'a', 'roll', { seq }); // the real click
    const after = { pos: a.pos, money: a.money, rollSeq: g.rollSeq, moves: g.moveSeq, log: r.log.length };
    assert.strictEqual(after.rollSeq, seq + 1, 'rolled once');
    E.act(r, 'a', 'roll', { seq }); // the same click again (double click / autopilot already rolled): ignored, no error
    assert.deepStrictEqual({ pos: a.pos, money: a.money, rollSeq: g.rollSeq, moves: g.moveSeq, log: r.log.length }, after, 'stale roll changed nothing');
    assert.throws(() => E.act(r, 'a', 'roll'), /وقتها/, 'a roll without seq is still checked as before');
  } finally { Math.random = real; }
}
console.log('stale roll ignored OK');

// ---------------------------------------------------------------- engine: debts, partial payment, bankruptcy
const total = (r) => r.players.reduce((s, p) => s + p.money, 0) + r.game.pot;
// `a` lands on b's city with a big rent and too little cash.
function debtRoom(cashA, rent) {
  const r = room(false);
  const [a, b] = r.players;
  const city = B.TILES.find((t) => t.idx > 5 && t.type === 'city').idx;
  a.money = cashA;
  r.game.props[city] = { owner: 'b', houses: 0, mortgaged: false };
  // the engine's own rent path, with this room's tile charging `rent`
  E.TT(r, city);
  r.tiles = r.tiles.slice();
  r.tiles[city] = { ...r.tiles[city], rent: [rent, ...r.tiles[city].rent.slice(1)] };
  a.pos = city - 5;
  const realR = Math.random; let k = 0;
  Math.random = () => [0.2, 0.4][k++ % 2]; // dice 2 + 3
  try { E.act(r, 'a', 'roll'); } finally { Math.random = realR; }
  return { r, a, b, city };
}
{ // 23: partial payment — the creditor gets the cash now, the rest stays a debt
  const { r, a, b } = debtRoom(100, 400);
  assert.strictEqual(a.money, 0, 'debtor paid all he had');
  assert.strictEqual(b.money, 1500 + 100, 'creditor received the partial payment at once');
  assert.strictEqual(r.game.phase, 'debt');
  assert.strictEqual(E.owedTo(r, 'b'), 300, 'the rest is still owed');
  assert.strictEqual(r.game.notice.paid, 100, 'notice says what was paid now');
}
{ // 23: the creditor buys a property from the debtor; the price cancels the debt first, the rest is cash
  const { r, a, b } = debtRoom(100, 400);
  const own = B.TILES.find((t) => t.type === 'city' && t.idx > 20).idx;
  r.game.props[own] = { owner: 'a', houses: 0, mortgaged: false };
  const before = total(r);
  assert.throws(() => E.act(r, 'a', 'debtOffer', { idx: own, price: 100 }), /دينك/, 'the debtor cannot offer to himself');
  E.act(r, 'b', 'debtOffer', { idx: own, price: 450 });
  assert.strictEqual(r.game.debtOffers.length, 1, 'offer is pending');
  assert.throws(() => E.act(r, 'b', 'debtOfferAccept', { id: r.game.debtOffers[0].id }), /دورك/, 'only the debtor accepts');
  E.act(r, 'a', 'debtOfferAccept', { id: r.game.debtOffers[0].id });
  assert.strictEqual(r.game.props[own].owner, 'b', 'property moved to the creditor');
  assert.strictEqual(r.game.debts.length, 0, 'debt cleared');
  assert.strictEqual(a.money, 150, '300 cancelled the debt, 150 paid in cash');
  assert.strictEqual(b.money, 1600 - 150);
  assert.strictEqual(total(r), before, 'money conserved');
  assert.notStrictEqual(r.game.phase, 'debt', 'out of the debt phase');
}
{ // 23: a computer creditor offers to buy a free property of the debtor (a valid offer), once
  const Bot = require('../game/bot');
  const { r, a } = debtRoom(0, 400);
  const own = B.TILES.find((t) => t.type === 'city' && t.idx > 20).idx;
  r.game.props[own] = { owner: 'a', houses: 0, mortgaged: false };
  const d = Bot.decide(r, r.players[1]);
  assert.strictEqual(d && d.type, 'debtOffer', 'the creditor bot makes an offer');
  E.act(r, 'b', d.type, d.data);
  assert.strictEqual(Bot.decide(r, r.players[1]), null, 'only one offer at a time');
  E.act(r, 'a', 'debtOfferDecline', { id: r.game.debtOffers[0].id });
  assert.strictEqual(Bot.decide(r, r.players[1]), null, 'a declined offer is not repeated this turn');
  void a;
}
{ // 23: a smaller price only reduces the debt; the creditor can also send money / forgive
  const { r, a, b } = debtRoom(0, 400);
  const own = B.TILES.find((t) => t.type === 'port').idx;
  r.game.props[own] = { owner: 'a', houses: 0, mortgaged: true };
  E.act(r, 'b', 'debtOffer', { idx: own, price: 150 });
  E.act(r, 'a', 'debtOfferAccept', { id: r.game.debtOffers[0].id });
  assert.strictEqual(E.owedTo(r, 'b'), 250, 'debt reduced by the price');
  assert.strictEqual(r.game.props[own].mortgaged, true, 'a mortgaged property stays mortgaged');
  assert.strictEqual(r.game.phase, 'debt', 'still in debt');
  const before = total(r);
  E.act(r, 'b', 'debtRelief', { amount: 300 });
  assert.strictEqual(r.game.debts.length, 0, '250 forgiven');
  assert.strictEqual(a.money, 50, '50 more arrived as cash');
  assert.strictEqual(b.money, 1500 - 50);
  assert.strictEqual(total(r), before, 'money conserved');
}
{ // 22: bankruptcy in debt — cash to the creditor, every property back to the bank (free, no houses, unmortgaged)
  const { r, a, b } = debtRoom(0, 900);
  const g = r.game;
  const set = B.SET_TILES.c2;
  for (const i of set) g.props[i] = { owner: 'a', houses: 2, mortgaged: false };
  const port = B.TILES.find((t) => t.type === 'port').idx;
  g.props[port] = { owner: 'a', houses: 0, mortgaged: true };
  a.money = 120; // e.g. cash that came in later
  g.loans.push({ id: 99, lender: 'b', borrower: 'a', proposer: 'a', amount: 100, interest: 0, rounds: 3, repay: 100, state: 'active', dueRound: 9 });
  const bBefore = b.money;
  E.act(r, 'a', 'bankrupt');
  assert(a.bankrupt, 'a is bankrupt');
  assert.strictEqual(b.money, bBefore + 120, 'creditor got all the cash (debt first)');
  for (const i of [...set, port]) assert.strictEqual(g.props[i], undefined, `tile ${i} is free for sale again`);
  assert(!Object.values(g.props).some((pr) => pr.owner === 'a'), 'nothing left with the bankrupt player');
  assert.strictEqual(g.debts.length, 0);
  assert.strictEqual(g.loans.length, 0, 'his loans are closed');
  assert.strictEqual(g.notice.kind, 'bankrupt');
  assert.strictEqual(g.notice.freed, 4);
}
{ // 22: leftover cash after the debts settles his loans
  const { r, a, b } = debtRoom(0, 300);
  const c = { id: 'c', name: 'جود', money: 1500, pos: 0, inJail: false, jailTurns: 0, bankrupt: false, jailCards: 0 };
  r.players.push(c); r.game.order.push('c');
  a.money = 500; // pays the 300 debt to b, then 200 of the 250 loan from c
  r.game.loans.push({ id: 7, lender: 'c', borrower: 'a', proposer: 'a', amount: 250, interest: 0, rounds: 3, repay: 250, state: 'active', dueRound: 9 });
  const bm = b.money;
  E.bankrupt(r, a);
  assert.strictEqual(b.money, bm + 300, 'debt paid first');
  assert.strictEqual(c.money, 1500 + 200, 'the loan gets what is left');
}
{ // 22: bankruptcy owing the bank: the cash goes to the bank (or the vacation pot), properties freed
  const r = room(false);
  const [a] = r.players;
  r.game.props[1] = { owner: 'a', houses: 0, mortgaged: false };
  a.money = 40;
  r.game.debts.push({ to: null, toPot: true, amount: 200, total: 200, paid: 0, reason: 'ضريبة' });
  r.game.phase = 'debt';
  const pot = r.game.pot;
  E.act(r, 'a', 'bankrupt');
  assert.strictEqual(r.game.pot, pot + 40, 'cash went to the bank pot');
  assert.strictEqual(r.game.props[1], undefined, 'property free again');
}
console.log('debt / partial payment / bankruptcy OK');

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
  // colours: picked in the lobby, unique per room, validated by the server
  let lob = await snapshot(host.code, host);
  const colorOf = (st, pid) => st.players.find((p) => p.id === pid).color;
  assert(Array.isArray(lob.colors) && lob.colors.length >= 8, 'palette sent to clients');
  assert.strictEqual(new Set(lob.players.map((p) => p.color)).size, lob.players.length, 'everyone (bot too) has a different colour');
  assert.strictEqual((await act(host, 'color', { color: colorOf(lob, guest.pid) })).status, 409, 'a taken colour is refused');
  assert.strictEqual((await act(host, 'color', { color: '#123456' })).status, 400, 'unknown colour refused');
  const free = lob.colors.find((c) => !lob.players.some((p) => p.color === c));
  assert.strictEqual((await act(host, 'color', { color: free })).status, 200, 'a free colour is taken');
  lob = await snapshot(host.code, host);
  assert.strictEqual(colorOf(lob, host.pid), free);
  assert.strictEqual(new Set(lob.players.map((p) => p.color)).size, lob.players.length, 'still unique after the change');
  console.log('lobby colours OK');
  assert.strictEqual((await act(host, 'start')).status, 200);
  assert.strictEqual((await act(host, 'color', { color: lob.colors.find((c) => !lob.players.some((p) => p.color === c)) })).status, 409, 'colours are locked once the game starts');
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
