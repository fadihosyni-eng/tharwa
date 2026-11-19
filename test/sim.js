'use strict';
// Plays many bot-only games straight through the engine and checks invariants.
// Run: node tharwa-game/test/sim.js [games]
const assert = require('assert');
const B = require('../game/board');
const E = require('../game/engine');
const Bot = require('../game/bot');

const GAMES = Number(process.argv[2]) || 200;
const MAX_STEPS = Number(process.env.MAX_STEPS) || 6000;

function makeRoom(n, cash) {
  const settings = {
    maxPlayers: 8, isPrivate: false, startingCash: cash, doubleRent: Math.random() < 0.7,
    vacationCash: Math.random() < 0.7, auction: Math.random() < 0.8, noRentInJail: Math.random() < 0.3,
    evenBuild: Math.random() < 0.8, mortgage: Math.random() < 0.9, randomOrder: true, turnTimer: 0,
  };
  const players = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'بوت ' + i, isBot: true }));
  return { code: 'test', settings, players, log: [], chat: [], status: 'lobby', game: null };
}

function check(room) {
  const g = room.game;
  for (const p of room.players) {
    assert(Number.isFinite(p.money), 'money is a number');
    assert(p.money >= 0, `money never negative (${p.name}: ${p.money})`);
    assert(p.pos >= 0 && p.pos < 40, 'position on board');
  }
  for (const [i, pr] of Object.entries(g.props)) {
    const owner = room.players.find((p) => p.id === pr.owner);
    assert(owner && !owner.bankrupt, `tile ${i} has a live owner`);
    assert(B.isProp(B.TILES[i]), 'only properties are owned');
    assert(pr.houses >= 0 && pr.houses <= 5, 'houses 0..5');
    if (pr.houses) assert(B.TILES[i].type === 'city' && !pr.mortgaged, 'houses only on unmortgaged cities');
  }
  for (const l of g.loans) {
    const ln = room.players.find((p) => p.id === l.lender), br = room.players.find((p) => p.id === l.borrower);
    assert(ln && br && !ln.bankrupt && !br.bankrupt, 'loans only between live players');
  }
  if (g.auction && g.auction.seller) assert.strictEqual(g.props[g.auction.idx].owner, g.auction.seller, 'seller still owns auctioned property');
  for (const d of g.debts) {
    assert(d.amount > 0, 'a debt is always a positive amount');
    if (d.to) { const c = room.players.find((p) => p.id === d.to); assert(c && !c.bankrupt, 'debts only to live players'); }
  }
  for (const o of g.debtOffers || []) {
    assert(room.status === 'playing' && g.debts.length, 'buy offers only while someone is in debt');
    assert.strictEqual(o.to, E.current(room).id, 'buy offers are made to the debtor');
    assert(g.props[o.idx] && g.props[o.idx].owner === o.to, 'offered property belongs to the debtor');
  }
  if (room.status === 'playing') {
    if (g.debts.length) assert.strictEqual(g.phase, 'debt');
    assert(!E.current(room).bankrupt, 'current player is alive');
  }
}

const stats = { ended: 0, capped: 0, steps: 0, trades: 0, auctions: 0, hotels: 0, bankrupt: 0 };
const t0 = Date.now();
for (let n = 0; n < GAMES; n++) {
  const room = makeRoom(2 + (n % 5), B.CASH_OPTIONS[n % B.CASH_OPTIONS.length]);
  E.newGame(room);
  let steps = 0;
  while (room.status === 'playing' && steps < MAX_STEPS) {
    steps++;
    const g = room.game;
    // occasionally a bot proposes a random trade to exercise trade code
    if (!process.env.NOTRADE && Math.random() < 0.03 && !g.auction) {
      const alive = E.active(room);
      const a = alive[Math.floor(Math.random() * alive.length)], b = alive.find((x) => x !== a);
      const mine = Object.keys(g.props).map(Number).filter((i) => g.props[i].owner === a.id);
      const theirs = Object.keys(g.props).map(Number).filter((i) => g.props[i].owner === b.id);
      if (b && (mine.length || theirs.length)) {
        try {
          E.act(room, a.id, 'tradePropose', { to: b.id, give: { props: mine.slice(0, 1), money: 0 }, get: { props: theirs.slice(0, 1), money: Math.min(50, b.money) } });
          stats.trades++;
        } catch (e) { if (!e.userMsg) throw e; }
      }
    }
    // occasionally: a loan offer, or the current player auctions one of their properties
    if (!process.env.NOTRADE && Math.random() < 0.02) {
      const alive = E.active(room);
      const a = alive[Math.floor(Math.random() * alive.length)], b = alive.find((x) => x !== a);
      if (b) {
        try {
          E.act(room, a.id, 'loanOffer', { to: b.id, role: Math.random() < 0.5 ? 'lend' : 'borrow', amount: 50 + Math.floor(Math.random() * 300), interest: [0, 10, 20, 30][Math.floor(Math.random() * 4)], rounds: [3, 5, 10][Math.floor(Math.random() * 3)] });
          stats.loans = (stats.loans || 0) + 1;
        } catch (e) { if (!e.userMsg) throw e; }
      }
    }
    if (!process.env.NOTRADE && Math.random() < 0.02 && !g.auction) {
      const c = E.current(room);
      const mine = Object.keys(g.props).map(Number).filter((i) => g.props[i].owner === c.id);
      if (mine.length) {
        try {
          E.act(room, c.id, 'sellAuction', { idx: mine[Math.floor(Math.random() * mine.length)], min: Math.random() < 0.5 ? 0 : 50 });
          stats.sellAuctions = (stats.sellAuctions || 0) + 1;
        } catch (e) { if (!e.userMsg) throw e; }
      }
    }
    // debt phase: another player offers to buy a debtor's property or sends money (never creates money)
    if (!process.env.NOTRADE && g.phase === 'debt' && Math.random() < 0.35) {
      const debtor = E.current(room), others = E.active(room).filter((x) => x !== debtor);
      const o = others[Math.floor(Math.random() * others.length)];
      const theirs = Object.keys(g.props).map(Number).filter((i) => g.props[i].owner === debtor.id);
      const total = () => room.players.reduce((s2, p) => s2 + p.money, 0) + g.pot;
      const before = total();
      try {
        if (theirs.length && Math.random() < 0.7) {
          E.act(room, o.id, 'debtOffer', { idx: theirs[Math.floor(Math.random() * theirs.length)], price: 10 * (1 + Math.floor(Math.random() * 40)) });
          stats.debtOffers = (stats.debtOffers || 0) + 1;
        } else {
          E.act(room, o.id, 'debtRelief', { amount: 10 * (1 + Math.floor(Math.random() * 20)) });
          stats.reliefs = (stats.reliefs || 0) + 1;
        }
      } catch (e) { if (!e.userMsg) throw e; }
      assert(total() <= before, 'debt help never creates money');
    }
    let acted = false;
    const order = [E.current(room), ...room.players.filter((p) => p !== E.current(room))];
    for (const p of order) {
      const a = Bot.decide(room, p);
      if (!a) continue;
      if (a.type === 'bid' && !g.auction) continue;
      try { E.act(room, p.id, a.type, a.data || {}); } catch (e) {
        if (!e.userMsg) throw e;
        throw new Error(`bot action rejected: ${JSON.stringify(a)} phase=${g.phase} -> ${e.userMsg}`);
      }
      acted = true;
      break;
    }
    if (!acted) {
      if (g.auction) { stats.auctions++; E.endAuction(room); }
      else throw new Error('stall in phase ' + g.phase);
    }
    check(room);
  }
  stats.steps += steps; stats.rounds = (stats.rounds || 0) + room.game.round;
  if (room.status === 'ended') stats.ended++; else stats.capped++;
  stats.bankrupt += room.players.filter((p) => p.bankrupt).length;
  if (room.game) stats.hotels += Object.values(room.game.props).filter((p) => p.houses === 5).length;
}
console.log(JSON.stringify({ games: GAMES, ...stats, ms: Date.now() - t0 }));
console.log('OK — no invariant broke');
