'use strict';
// Game rules for «ثروة». Pure state machine: the server owns timers and I/O.
const B = require('./board');

const AUCTION_MS = 8000;      // first window of an auction
const AUCTION_BUMP_MS = 5000; // each bid keeps at least this much time left
const MAX_TRADES = 12;

const rnd = (n) => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
function err(msg) { const e = new Error(msg); e.userMsg = msg; e.status = 400; return e; }

const P = (room, id) => room.players.find((p) => p.id === id);
// Room-specific tile (city/country names come from the room's random country map).
function TT(room, i) {
  if (!room.tiles) { room.map = room.map || B.randomMap(); room.tiles = B.tilesFor(room.map); }
  return room.tiles[i];
}
function log(room, text) {
  room.log.push({ t: Date.now(), text });
  if (room.log.length > 150) room.log.splice(0, room.log.length - 150);
}
function current(room) { const g = room.game; return g ? P(room, g.order[g.turn]) : null; }
function active(room) {
  const g = room.game; if (!g) return [];
  return g.order.map((id) => P(room, id)).filter((p) => p && !p.bankrupt);
}

// ---------------------------------------------------------------- lifecycle
function newGame(room) {
  const s = room.settings;
  const order = room.players.map((p) => p.id);
  if (s.randomOrder) shuffle(order);
  room.game = {
    order, turn: 0, round: 1,
    phase: 'roll', rolled: false, again: false, doubles: 0,
    dice: [1, 1], rollSeq: 0,
    props: {}, pot: 0,
    chance: shuffle(B.CHANCE.map((_, i) => i)),
    chest: shuffle(B.CHEST.map((_, i) => i)),
    pendingBuy: null, auction: null, auctionQueue: [], debts: [],
    card: null, cardSeq: 0,
    notice: null, noticeSeq: 0,
    moves: [], moveSeq: 0,
    trades: [], tradeSeq: 1,
    loans: [], loanSeq: 1,
    turnEndsAt: null, autopilot: false, debtExtended: false,
    winner: null, startedAt: Date.now(),
  };
  for (const p of room.players) {
    Object.assign(p, { money: s.startingCash, pos: 0, inJail: false, jailTurns: 0, bankrupt: false, jailCards: 0 });
  }
  room.status = 'playing';
  log(room, `🎲 بدأت اللعبة! كل لاعب معه ${fmt(s.startingCash)}`);
  startTurn(room);
}

function startTurn(room) {
  const g = room.game;
  Object.assign(g, {
    phase: 'roll', rolled: false, again: false, doubles: 0, pendingBuy: null,
    autopilot: false, debtExtended: false,
  });
  g.turnEndsAt = room.settings.turnTimer ? Date.now() + room.settings.turnTimer * 1000 : null;
  // Loans that fall due are collected at the start of the borrower's turn.
  const p = current(room);
  for (const ln of g.loans.filter((l) => l.state === 'active' && l.borrower === p.id && g.round >= l.dueRound)) {
    g.loans = g.loans.filter((x) => x !== ln);
    const lender = P(room, ln.lender);
    if (!lender || lender.bankrupt) continue;
    log(room, `⏰ استحق قرض ${p.name}: لازم يرجّع ${fmt(ln.repay)} لـ ${lender.name}`);
    charge(room, p, ln.repay, lender, false, 'قرض');
  }
  settle(room);
}

function nextTurn(room) {
  const g = room.game, n = g.order.length;
  g.auctionQueue = [];
  for (let k = 1; k <= n; k++) {
    const j = (g.turn + k) % n;
    const p = P(room, g.order[j]);
    if (p && !p.bankrupt) { if (j <= g.turn) g.round++; g.turn = j; break; }
  }
  startTurn(room);
}

// Recompute the current player's phase from the state.
function settle(room) {
  if (room.status !== 'playing') return;
  const g = room.game, p = current(room);
  if (g.debts.length) g.phase = 'debt';
  else if (g.auction) g.phase = 'auction';
  else if (g.pendingBuy != null) g.phase = 'buy';
  else if (!g.rolled || (g.again && !p.inJail)) g.phase = 'roll';
  else g.phase = 'done';
}

// ---------------------------------------------------------------- money
function bankReceive(room, amount, toPot) {
  if (toPot && room.settings.vacationCash) room.game.pot += amount;
}

// Charge the CURRENT player. Pays what it can; the rest becomes a debt.
function charge(room, p, amount, to, toPot, reason) {
  amount = Math.max(0, Math.round(amount));
  if (!amount) return;
  const pay = Math.min(amount, Math.max(0, p.money));
  p.money -= pay;
  if (to) to.money += pay; else bankReceive(room, pay, toPot);
  if (pay < amount) {
    room.game.debts.push({ to: to ? to.id : null, toPot: !!toPot, amount: amount - pay, reason });
    log(room, `⚠️ ${p.name} ما معه كفاية — عليه دين ${fmt(amount - pay)}`);
  }
}

function payDebts(room, p) {
  const g = room.game;
  while (g.debts.length && p.money > 0) {
    const d = g.debts[0];
    const pay = Math.min(d.amount, p.money);
    p.money -= pay; d.amount -= pay;
    const to = d.to ? P(room, d.to) : null;
    if (to && !to.bankrupt) to.money += pay; else if (!d.to) bankReceive(room, pay, d.toPot);
    if (d.amount <= 0) g.debts.shift();
  }
  if (!g.debts.length) log(room, `✅ ${p.name} سدّد ديونه`);
}

// ---------------------------------------------------------------- ownership & rent
function ownedCount(room, ownerId, type) {
  const g = room.game;
  return B.TILES.filter((t, i) => t.type === type && g.props[i] && g.props[i].owner === ownerId).length;
}
function ownsSet(room, ownerId, set) {
  return B.SET_TILES[set].every((i) => room.game.props[i] && room.game.props[i].owner === ownerId);
}
function setHouses(room, set) { return B.SET_TILES[set].map((i) => (room.game.props[i] ? room.game.props[i].houses : 0)); }

function rentFor(room, idx, diceSum) {
  const g = room.game, t = TT(room, idx), pr = g.props[idx];
  if (!pr || pr.mortgaged) return 0;
  if (t.type === 'city') {
    if (pr.houses > 0) return t.rent[pr.houses];
    const full = ownsSet(room, pr.owner, t.set);
    return t.rent[0] * (full && room.settings.doubleRent ? 2 : 1);
  }
  if (t.type === 'port') return B.PORT_RENT[ownedCount(room, pr.owner, 'port') - 1];
  if (t.type === 'util') return diceSum * (ownedCount(room, pr.owner, 'util') >= 2 ? 10 : 4);
  return 0;
}

// ---------------------------------------------------------------- movement
function pushMove(room, m) {
  const g = room.game;
  g.moves.push({ ...m, seq: ++g.moveSeq });
  if (g.moves.length > 8) g.moves.splice(0, g.moves.length - 8);
}
function moveBy(room, p, steps) {
  const from = p.pos;
  const to = (((from + steps) % 40) + 40) % 40;
  if (steps > 0 && to < from) {
    p.money += B.GO_SALARY;
    log(room, `💵 ${p.name} مرّ بالانطلاق وقبض ${fmt(B.GO_SALARY)}`);
  }
  p.pos = to;
  pushMove(room, { pid: p.id, from, to, steps, jump: steps <= 0 });
}
function moveTo(room, p, target) {
  const steps = (target - p.pos + 40) % 40;
  if (steps) moveBy(room, p, steps);
}
function goJail(room, p) {
  const from = p.pos;
  p.pos = B.JAIL; p.inJail = true; p.jailTurns = 0;
  room.game.again = false;
  pushMove(room, { pid: p.id, from, to: B.JAIL, steps: 0, jump: true });
}

function resolve(room, p, diceSum, opt = {}) {
  const g = room.game, s = room.settings, idx = p.pos, t = TT(room, idx);
  if (B.isProp(t)) {
    const pr = g.props[idx];
    if (!pr) { g.pendingBuy = idx; return; }
    if (pr.owner === p.id) return;
    if (pr.mortgaged) { log(room, `${t.name} مرهونة — ما في إيجار`); return; }
    const owner = P(room, pr.owner);
    if (s.noRentInJail && owner.inJail) { log(room, `${owner.name} بالسجن — ما في إيجار على ${t.name}`); return; }
    const rent = rentFor(room, idx, diceSum) * (opt.mult || 1);
    log(room, `💸 ${p.name} دفع إيجار ${fmt(rent)} لـ ${owner.name} (${t.name})`);
    // Big centred notice for everyone (clients show it once per seq, like cards).
    g.notice = { kind: 'rent', from: p.id, to: owner.id, amount: rent, tile: t.name, seq: ++g.noticeSeq };
    charge(room, p, rent, owner, false, 'إيجار ' + t.name);
    return;
  }
  switch (t.type) {
    case 'tax': {
      const amt = t.percent ? Math.floor((Math.max(0, p.money) * t.percent) / 100) : t.amount;
      if (amt > 0) { log(room, `🧾 ${p.name} دفع ${t.name} ${fmt(amt)}`); charge(room, p, amt, null, true, t.name); }
      break;
    }
    case 'chance': case 'chest': drawCard(room, p, t.type, diceSum); break;
    case 'gotojail': log(room, `🚓 ${p.name} انقبض عليه — عالسجن!`); goJail(room, p); break;
    case 'vacation':
      if (s.vacationCash && g.pot > 0) { log(room, `🏖️ ${p.name} أخد صندوق الاستراحة ${fmt(g.pot)}`); p.money += g.pot; g.pot = 0; }
      break;
    default: break;
  }
}

function drawCard(room, p, deck, diceSum) {
  const g = room.game, list = deck === 'chance' ? B.CHANCE : B.CHEST;
  if (!g[deck].length) g[deck] = shuffle(list.map((_, i) => i));
  const c = list[g[deck].shift()];
  const text = c.text.replace(/\{(\d+)\}/g, (_, n) => TT(room, Number(n)).name);
  g.card = { deck, text, kind: c.kind, pid: p.id, seq: ++g.cardSeq, effect: '' };
  log(room, `${deck === 'chance' ? '🎴 حظ' : '🧰 خزنة'} لـ ${p.name}: ${text}`);
  const entry = room.log[room.log.length - 1];
  const from = p.pos;
  const arrive = () => `➡️ ${TT(room, p.pos).name}${p.pos < from ? ` (+${fmt(B.GO_SALARY)} من الانطلاق)` : ''}`;
  let effect = '';
  // Every card does exactly what its text says; `effect` is shown on the card.
  switch (c.kind) {
    case 'money':
      if (c.amount >= 0) p.money += c.amount; else charge(room, p, -c.amount, null, true, 'بطاقة');
      effect = c.amount >= 0 ? `💵 +${fmt(c.amount)}` : `💸 −${fmt(-c.amount)}`;
      break;
    case 'move': moveTo(room, p, c.to); effect = arrive(); resolve(room, p, diceSum); break;
    case 'back': moveBy(room, p, -c.steps); effect = `⬅️ ${TT(room, p.pos).name}`; resolve(room, p, diceSum); break;
    case 'jail': goJail(room, p); effect = '🔒 راح عالسجن'; break;
    case 'jailcard': p.jailCards++; effect = '🎫 صار معه بطاقة خروج من السجن'; break;
    case 'repairs': {
      let houses = 0, hotels = 0;
      for (const pr of Object.values(g.props)) if (pr.owner === p.id) { if (pr.houses === 5) hotels++; else houses += pr.houses; }
      const amt = houses * c.house + hotels * c.hotel;
      if (amt) charge(room, p, amt, null, true, 'صيانة');
      effect = amt ? `💸 −${fmt(amt)} (${houses} بيت، ${hotels} فندق)` : 'ما عنده أبنية — ما دفع شي';
      break;
    }
    case 'nearestPort': {
      const target = B.PORTS.find((i) => i > p.pos);
      moveTo(room, p, target === undefined ? B.PORTS[0] : target);
      effect = '⚓ ' + arrive().slice(3);
      resolve(room, p, diceSum, { mult: 2 });
      break;
    }
    case 'payEach': {
      const others = active(room).filter((o) => o.id !== p.id);
      for (const o of others) charge(room, p, c.amount, o, false, 'بطاقة');
      effect = `💸 −${fmt(c.amount * others.length)} (${others.length} لاعبين)`;
      break;
    }
    default: break;
  }
  g.card.effect = effect;
  if (entry && effect) entry.text += ` ← ${effect}`;
}

// ---------------------------------------------------------------- turn actions
function doRoll(room, p) {
  const g = room.game;
  const d1 = 1 + rnd(6), d2 = 1 + rnd(6), sum = d1 + d2, dbl = d1 === d2;
  g.dice = [d1, d2]; g.rollSeq++; g.rolled = true; g.again = false;
  log(room, `🎲 ${p.name} رمى ${d1} و ${d2}${dbl ? ' (دبل!)' : ''}`);
  if (p.inJail) {
    if (dbl) { p.inJail = false; p.jailTurns = 0; log(room, `🔓 ${p.name} طلع من السجن بالدبل`); }
    else {
      p.jailTurns++;
      if (p.jailTurns < 3) return;
      p.inJail = false; p.jailTurns = 0;
      log(room, `${p.name} دفع غرامة السجن ${fmt(B.JAIL_FINE)} بعد 3 محاولات`);
      charge(room, p, B.JAIL_FINE, null, true, 'غرامة السجن');
    }
    moveBy(room, p, sum); resolve(room, p, sum);
    return;
  }
  if (dbl) {
    g.doubles++;
    if (g.doubles >= 3) { log(room, `🚓 ${p.name} رمى 3 دبل ورا بعض — عالسجن!`); goJail(room, p); return; }
    g.again = true;
  }
  moveBy(room, p, sum); resolve(room, p, sum);
}

function buy(room, p) {
  const g = room.game, idx = g.pendingBuy, t = TT(room, idx);
  if (p.money < t.price) throw err('ما معك مصاري كافية');
  p.money -= t.price;
  g.props[idx] = { owner: p.id, houses: 0, mortgaged: false };
  g.pendingBuy = null;
  log(room, `🏷️ ${p.name} اشترى ${t.name} بـ ${fmt(t.price)}`);
}

function skipBuy(room, p) {
  const g = room.game, idx = g.pendingBuy;
  g.pendingBuy = null;
  if (room.settings.auction && active(room).length > 1) {
    g.auction = { idx, bid: 0, bidder: null, endsAt: Date.now() + AUCTION_MS };
    log(room, `🔨 ${p.name} ما اشترى ${TT(room, idx).name} — بلّش المزاد!`);
  } else {
    log(room, `${p.name} ما اشترى ${TT(room, idx).name}`);
  }
}

function bid(room, p, amount) {
  const a = room.game.auction;
  if (!a) throw err('ما في مزاد هلق');
  if (a.seller === p.id) throw err('ما فيك تزاود على عقارك');
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= a.bid) throw err('لازم المزايدة تكون أعلى من ' + fmt(a.bid));
  if (a.min && amount < a.min) throw err('أقل سعر بهالمزاد ' + fmt(a.min));
  if (amount > p.money) throw err('ما معك ' + fmt(amount));
  a.bid = amount; a.bidder = p.id;
  a.endsAt = Math.max(a.endsAt, Date.now() + AUCTION_BUMP_MS);
  log(room, `🔨 ${p.name} زاود ${fmt(amount)}`);
}

// A player puts one or more of their own properties up for auction (money goes to them).
// `idxs` (1..8) are auctioned one after another; a single `idx` still works.
function sellAuction(room, p, data) {
  const g = room.game;
  if (current(room) !== p) throw err('بتقدر تعرض عقارك بالمزاد بدورك بس');
  if (!['roll', 'done', 'debt'].includes(g.phase)) throw err('مو وقتها هلق');
  if (active(room).length < 2) throw err('ما في حدا يشتري');
  const raw = Array.isArray(data && data.idxs) ? data.idxs : [data && data.idx];
  const idxs = [...new Set(raw.map(Number))];
  if (!idxs.length || idxs.length > 8 || idxs.some((i) => !Number.isInteger(i))) throw err('اختار من عقار لـ 8 عقارات');
  for (const idx of idxs) {
    const t = TT(room, idx), pr = g.props[idx];
    if (!t || !pr || pr.owner !== p.id) throw err('هالعقار مو إلك');
    if (t.type === 'city' && setHouses(room, t.set).some((h) => h > 0)) throw err(`بيع الأبنية بـ ${t.countryName} أول`);
  }
  const min = Math.max(0, Math.min(100000, Math.floor(Number(data && data.min) || 0)));
  g.auctionQueue = idxs.slice(1).map((idx) => ({ idx, min, seller: p.id }));
  startSellerLot(room, p, idxs[0], min, 1, idxs.length);
}
function startSellerLot(room, p, idx, min, lot, lots) {
  const g = room.game, t = TT(room, idx), pr = g.props[idx];
  g.auction = { idx, bid: 0, bidder: null, endsAt: Date.now() + AUCTION_MS, seller: p.id, min, lot, lots };
  if (lot === 1) log(room, `🔨 ${p.name} عرض ${t.name} للبيع بالمزاد${min ? ` (أقل سعر ${fmt(min)})` : ''}${pr.mortgaged ? ' — مرهونة' : ''}${lots > 1 ? ` — ${lots} لوتات ورا بعض` : ''}`);
  else log(room, `🔨 اللوت التالي: ${t.name} (${lot} من ${lots})${pr.mortgaged ? ' — مرهونة' : ''}`);
}
// After a seller lot ends: start the next queued lot that is still valid.
function nextQueuedLot(room, prev) {
  const g = room.game, q = g.auctionQueue || [];
  let lot = prev.lot || 1;
  while (q.length) {
    const next = q.shift();
    lot++;
    const seller = P(room, next.seller), pr = g.props[next.idx], t = TT(room, next.idx);
    if (!seller || seller.bankrupt || current(room) !== seller || active(room).length < 2) { g.auctionQueue = []; return; }
    if (!pr || pr.owner !== seller.id || (t.type === 'city' && setHouses(room, t.set).some((h) => h > 0))) continue;
    startSellerLot(room, seller, next.idx, next.min, lot, prev.lots || lot);
    return;
  }
}

function endAuction(room) {
  const g = room.game, a = g.auction;
  if (!a) return;
  g.auction = null;
  const t = TT(room, a.idx), w = a.bidder ? P(room, a.bidder) : null;
  if (a.seller) {
    const seller = P(room, a.seller), pr = g.props[a.idx];
    if (w && !w.bankrupt && w.money >= a.bid && pr && pr.owner === a.seller && seller && !seller.bankrupt) {
      w.money -= a.bid; seller.money += a.bid; pr.owner = w.id;
      log(room, `🏆 ${w.name} اشترى ${t.name} من ${seller.name} بالمزاد بـ ${fmt(a.bid)}`);
    } else {
      log(room, `ما حدا اشترى ${t.name} — بقيت مع صاحبها`);
    }
    if (g.auctionQueue && g.auctionQueue.length) nextQueuedLot(room, a);
  } else if (w && !w.bankrupt && w.money >= a.bid && !g.props[a.idx]) {
    w.money -= a.bid;
    g.props[a.idx] = { owner: w.id, houses: 0, mortgaged: false };
    log(room, `🏆 ${w.name} ربح المزاد على ${t.name} بـ ${fmt(a.bid)}`);
  } else {
    log(room, `ما حدا اشترى ${t.name} — بقيت للبنك`);
  }
  const c = current(room);
  if (g.debts.length && c && c.money > 0) payDebts(room, c);
  pruneTrades(room);
  settle(room);
}

// ---------------------------------------------------------------- loans between players
const LOAN_INTEREST = [0, 10, 20, 30];
const LOAN_ROUNDS = [3, 5, 10];
function proposeLoan(room, p, data) {
  const g = room.game, other = P(room, data && data.to);
  if (!other || other.bankrupt || other.id === p.id) throw err('اختار لاعب تاني');
  const role = data.role === 'borrow' ? 'borrow' : 'lend';
  const amount = Math.floor(Number(data.amount));
  if (!Number.isFinite(amount) || amount < 10 || amount > 100000) throw err('المبلغ لازم يكون $10 أو أكتر');
  const interest = Number(data.interest), rounds = Number(data.rounds);
  if (!LOAN_INTEREST.includes(interest)) throw err('الفايدة غير صحيحة');
  if (!LOAN_ROUNDS.includes(rounds)) throw err('المدة غير صحيحة');
  const lender = role === 'lend' ? p : other, borrower = role === 'lend' ? other : p;
  if (lender.money < amount) throw err(`${lender.name} ما معه ${fmt(amount)}`);
  if (g.loans.filter((l) => l.state === 'offer' && l.proposer === p.id).length >= 2) throw err('عندك عرضين قرض معلّقين — استنى الرد');
  g.loans.push({
    id: g.loanSeq++, lender: lender.id, borrower: borrower.id, proposer: p.id, amount, interest, rounds,
    repay: Math.round(amount * (1 + interest / 100)), state: 'offer', at: Date.now(),
  });
  log(room, role === 'lend' ? `💰 ${p.name} عرض يقرض ${other.name} ${fmt(amount)}` : `🙏 ${p.name} طلب قرض ${fmt(amount)} من ${other.name}`);
}
function findLoan(room, id) { return room.game.loans.find((l) => l.id === Number(id)); }
function acceptLoan(room, p, id) {
  const g = room.game, ln = findLoan(room, id);
  if (!ln || ln.state !== 'offer' || ln.proposer === p.id || (ln.lender !== p.id && ln.borrower !== p.id)) throw err('عرض القرض مو موجود');
  const lender = P(room, ln.lender), borrower = P(room, ln.borrower);
  if (!lender || !borrower || lender.bankrupt || borrower.bankrupt) { g.loans = g.loans.filter((x) => x !== ln); throw err('اللاعب طلع من اللعبة'); }
  if (lender.money < ln.amount) throw err(`${lender.name} ما معه ${fmt(ln.amount)} هلق`);
  lender.money -= ln.amount; borrower.money += ln.amount;
  ln.state = 'active'; ln.dueRound = g.round + ln.rounds;
  log(room, `🤝 ${lender.name} أقرض ${borrower.name} ${fmt(ln.amount)} — بيرجعهن ${fmt(ln.repay)} بالجولة ${ln.dueRound}`);
}
function declineLoan(room, p, id) {
  const g = room.game, ln = findLoan(room, id);
  if (!ln || ln.state !== 'offer' || (ln.lender !== p.id && ln.borrower !== p.id)) throw err('عرض القرض مو موجود');
  g.loans = g.loans.filter((x) => x !== ln);
  log(room, ln.proposer === p.id ? `${p.name} سحب عرض القرض` : `❌ ${p.name} رفض عرض القرض`);
}
function repayLoan(room, p, id) {
  const g = room.game, ln = findLoan(room, id);
  if (!ln || ln.state !== 'active' || ln.borrower !== p.id) throw err('ما عليك هالقرض');
  if (p.money < ln.repay) throw err('ما معك ' + fmt(ln.repay));
  const lender = P(room, ln.lender);
  p.money -= ln.repay;
  if (lender && !lender.bankrupt) lender.money += ln.repay;
  g.loans = g.loans.filter((x) => x !== ln);
  log(room, `✅ ${p.name} سدّد قرضه لـ ${lender ? lender.name : ''} (${fmt(ln.repay)})`);
}

// ---------------------------------------------------------------- building & mortgage
function cannotBuild(room, p, idx) {
  const g = room.game, t = TT(room, idx), pr = g.props[idx];
  if (!t || t.type !== 'city' || !pr || pr.owner !== p.id) return 'هالعقار مو إلك';
  if (!ownsSet(room, p.id, t.set)) return `لازم تملك كل مدن ${t.countryName}`;
  if (B.SET_TILES[t.set].some((i) => g.props[i].mortgaged)) return 'في مدينة مرهونة بهالدولة';
  if (pr.houses >= 5) return 'فيها فندق خلص';
  if (room.settings.evenBuild && pr.houses > Math.min(...setHouses(room, t.set))) return 'لازم تعمّر بالتساوي على مدن الدولة';
  if (p.money < t.houseCost) return 'ما معك مصاري كافية';
  return null;
}
function cannotSell(room, p, idx) {
  const g = room.game, t = TT(room, idx), pr = g.props[idx];
  if (!t || t.type !== 'city' || !pr || pr.owner !== p.id) return 'هالعقار مو إلك';
  if (!pr.houses) return 'ما في أبنية';
  if (room.settings.evenBuild && pr.houses < Math.max(...setHouses(room, t.set))) return 'لازم تبيع بالتساوي';
  return null;
}
function cannotMortgage(room, p, idx) {
  const g = room.game, t = TT(room, idx), pr = g.props[idx];
  if (!room.settings.mortgage) return 'الرهن مسكّر بهالغرفة';
  if (!t || !pr || pr.owner !== p.id) return 'هالعقار مو إلك';
  if (pr.mortgaged) return 'مرهونة أصلاً';
  if (t.type === 'city' && setHouses(room, t.set).some((h) => h > 0)) return 'بيع الأبنية بالدولة أول';
  return null;
}
function cannotUnmortgage(room, p, idx) {
  const g = room.game, t = TT(room, idx), pr = g.props[idx];
  if (!t || !pr || pr.owner !== p.id) return 'هالعقار مو إلك';
  if (!pr.mortgaged) return 'مو مرهونة';
  if (p.money < t.unmortgage) return 'ما معك مصاري كافية';
  return null;
}

function build(room, p, idx) {
  const e = cannotBuild(room, p, idx); if (e) throw err(e);
  const t = TT(room, idx), pr = room.game.props[idx];
  p.money -= t.houseCost; pr.houses++;
  log(room, pr.houses === 5 ? `🏨 ${p.name} عمّر فندق بـ ${t.name}` : `🏠 ${p.name} عمّر بيت بـ ${t.name}`);
}
function sellHouse(room, p, idx) {
  const e = cannotSell(room, p, idx); if (e) throw err(e);
  const t = TT(room, idx), pr = room.game.props[idx];
  pr.houses--; p.money += Math.floor(t.houseCost / 2);
  log(room, `${p.name} باع بناء بـ ${t.name} بـ ${fmt(Math.floor(t.houseCost / 2))}`);
}
function mortgage(room, p, idx) {
  const e = cannotMortgage(room, p, idx); if (e) throw err(e);
  const t = TT(room, idx);
  room.game.props[idx].mortgaged = true; p.money += t.mortgage;
  log(room, `🏦 ${p.name} رهن ${t.name} بـ ${fmt(t.mortgage)}`);
}
function unmortgage(room, p, idx) {
  const e = cannotUnmortgage(room, p, idx); if (e) throw err(e);
  const t = TT(room, idx);
  room.game.props[idx].mortgaged = false; p.money -= t.unmortgage;
  log(room, `${p.name} فكّ رهن ${t.name} بـ ${fmt(t.unmortgage)}`);
}

// ---------------------------------------------------------------- trades
function normSide(x) {
  x = x || {};
  const props = [...new Set((Array.isArray(x.props) ? x.props : []).map(Number)
    .filter((i) => Number.isInteger(i) && i >= 0 && i < 40))];
  const money = Math.max(0, Math.floor(Number(x.money) || 0));
  return { props, money };
}
function checkSide(room, owner, side) {
  const g = room.game;
  for (const i of side.props) {
    const pr = g.props[i], t = TT(room, i);
    if (!pr || pr.owner !== owner.id) throw err(`${t.name} مو ملك ${owner.name}`);
    if (g.auction && g.auction.idx === i) throw err(`${t.name} معروضة بالمزاد هلق`);
    if (t.type === 'city' && setHouses(room, t.set).some((h) => h > 0)) {
      throw err(`لازم تنباع الأبنية بـ ${t.countryName} قبل التبادل`);
    }
  }
  if (side.money > owner.money) throw err(`${owner.name} ما معه ${fmt(side.money)}`);
}
function proposeTrade(room, p, data) {
  const g = room.game, to = P(room, data && data.to);
  if (!to || to.bankrupt || to.id === p.id) throw err('اختار لاعب تاني');
  const give = normSide(data.give), get = normSide(data.get);
  if (!give.props.length && !get.props.length) throw err('لازم يكون في عقار واحد على الأقل بالصفقة');
  checkSide(room, p, give); checkSide(room, to, get);
  if (g.trades.filter((t) => t.from === p.id).length >= 3) throw err('عندك 3 عروض معلّقة — استنى الرد');
  if (g.trades.length >= MAX_TRADES) g.trades.shift();
  g.trades.push({ id: g.tradeSeq++, from: p.id, to: to.id, give, get, at: Date.now() });
  (g.offerRound = g.offerRound || {})[p.id] = g.round;
  log(room, `🤝 ${p.name} عرض صفقة على ${to.name}`);
}
function acceptTrade(room, p, id) {
  const g = room.game, tr = g.trades.find((t) => t.id === Number(id));
  if (!tr || tr.to !== p.id) throw err('العرض مو موجود');
  const from = P(room, tr.from);
  g.trades = g.trades.filter((t) => t !== tr);
  if (!from || from.bankrupt) throw err('اللاعب طلع من اللعبة');
  checkSide(room, from, tr.give); checkSide(room, p, tr.get);
  for (const i of tr.give.props) g.props[i].owner = p.id;
  for (const i of tr.get.props) g.props[i].owner = from.id;
  from.money += tr.get.money - tr.give.money;
  p.money += tr.give.money - tr.get.money;
  log(room, `✅ ${p.name} قبل صفقة ${from.name}`);
}
// Drop offers that can no longer happen (assets moved, buildings added, money gone).
function pruneTrades(room) {
  const g = room.game;
  g.trades = g.trades.filter((tr) => {
    const from = P(room, tr.from), to = P(room, tr.to);
    if (!from || !to || from.bankrupt || to.bankrupt) return false;
    try { checkSide(room, from, tr.give); checkSide(room, to, tr.get); return true; } catch (e) { return false; }
  });
  // Loan offers the lender can no longer afford are dropped too.
  g.loans = g.loans.filter((l) => {
    const lender = P(room, l.lender), borrower = P(room, l.borrower);
    if (!lender || !borrower || lender.bankrupt || borrower.bankrupt) return false;
    return l.state !== 'offer' || lender.money >= l.amount;
  });
}
function declineTrade(room, p, id) {
  const g = room.game, tr = g.trades.find((t) => t.id === Number(id));
  if (!tr || (tr.to !== p.id && tr.from !== p.id)) throw err('العرض مو موجود');
  g.trades = g.trades.filter((t) => t !== tr);
  const other = P(room, tr.to === p.id ? tr.from : tr.to);
  log(room, tr.to === p.id ? `❌ ${p.name} رفض صفقة ${other ? other.name : ''}` : `${p.name} سحب عرضه`);
}

// ---------------------------------------------------------------- bankruptcy
function bankrupt(room, p) {
  const g = room.game, isCur = current(room) === p;
  let cash = Math.max(0, p.money);
  for (const [i, pr] of Object.entries(g.props)) {
    if (pr.owner === p.id && pr.houses) { cash += Math.floor(TT(room, i).houseCost / 2) * pr.houses; pr.houses = 0; }
  }
  let heir = null;
  if (isCur && g.debts.length) {
    const biggest = g.debts.filter((d) => d.to).sort((a, b) => b.amount - a.amount)[0];
    if (biggest) heir = P(room, biggest.to);
    for (const d of g.debts) {
      const pay = Math.min(cash, d.amount); cash -= pay;
      const to = d.to ? P(room, d.to) : null;
      if (to && !to.bankrupt) to.money += pay; else if (!d.to) bankReceive(room, pay, d.toPot);
    }
    g.debts = [];
  }
  for (const [i, pr] of Object.entries(g.props)) {
    if (pr.owner !== p.id) continue;
    if (heir && !heir.bankrupt) pr.owner = heir.id; else delete g.props[i];
  }
  Object.assign(p, { money: 0, bankrupt: true, inJail: false, jailCards: 0 });
  g.trades = g.trades.filter((t) => t.from !== p.id && t.to !== p.id);
  g.loans = g.loans.filter((l) => l.lender !== p.id && l.borrower !== p.id);
  if (g.auction && g.auction.seller === p.id) g.auction = null;
  if (g.auctionQueue && g.auctionQueue.some((l) => l.seller === p.id)) g.auctionQueue = [];
  if (g.auction && g.auction.bidder === p.id) { g.auction.bidder = null; g.auction.bid = 0; }
  log(room, heir ? `💀 ${p.name} أفلس — أملاكه راحت لـ ${heir.name}` : `💀 ${p.name} أفلس — أملاكه رجعت للبنك`);

  const alive = active(room);
  if (alive.length <= 1) {
    g.winner = alive[0] ? alive[0].id : null;
    g.auction = null; g.phase = 'ended'; g.turnEndsAt = null;
    room.status = 'ended';
    log(room, `🏆 ${alive[0] ? alive[0].name : '—'} ربح اللعبة!`);
    return;
  }
  if (isCur) { g.auction = null; nextTurn(room); }
}

// ---------------------------------------------------------------- dispatcher
const MANAGE = new Set(['build', 'sell', 'mortgage', 'unmortgage']);

function act(room, pid, type, data = {}) {
  if (room.status !== 'playing') throw err('اللعبة مو شغالة');
  const g = room.game, p = P(room, pid);
  if (!p || p.bankrupt) throw err('ما عاد فيك تلعب بهالجولة');
  const isCur = current(room) === p;
  const need = (phase) => {
    if (!isCur) throw err('مو دورك');
    if (g.phase !== phase) throw err('مو وقتها هلق');
  };
  if (MANAGE.has(type) && g.auction) throw err('استنى المزاد يخلص');
  const idx = Number(data && data.idx);

  switch (type) {
    case 'roll': need('roll'); doRoll(room, p); break;
    case 'buy': need('buy'); buy(room, p); break;
    case 'skip': need('buy'); skipBuy(room, p); break;
    case 'end': need('done'); nextTurn(room); break;
    case 'payJail':
      need('roll');
      if (!p.inJail || g.rolled) throw err('مو بالسجن');
      if (p.money < B.JAIL_FINE) throw err('ما معك مصاري كافية');
      charge(room, p, B.JAIL_FINE, null, true, 'غرامة السجن');
      p.inJail = false; p.jailTurns = 0;
      log(room, `🔓 ${p.name} دفع ${fmt(B.JAIL_FINE)} وطلع من السجن`);
      break;
    case 'jailCard':
      need('roll');
      if (!p.inJail || !p.jailCards || g.rolled) throw err('ما عندك بطاقة خروج');
      p.jailCards--; p.inJail = false; p.jailTurns = 0;
      log(room, `🔓 ${p.name} استخدم بطاقة الخروج من السجن`);
      break;
    case 'bid': bid(room, p, data && data.amount); break;
    case 'build': build(room, p, idx); break;
    case 'sell': sellHouse(room, p, idx); break;
    case 'mortgage': mortgage(room, p, idx); break;
    case 'unmortgage': unmortgage(room, p, idx); break;
    case 'tradePropose': proposeTrade(room, p, data); break;
    case 'tradeAccept': acceptTrade(room, p, data && data.id); break;
    case 'tradeDecline': case 'tradeCancel': declineTrade(room, p, data && data.id); break;
    case 'sellAuction': if (g.auction) throw err('في مزاد شغّال'); sellAuction(room, p, data); break;
    case 'loanOffer': proposeLoan(room, p, data || {}); break;
    case 'loanAccept': acceptLoan(room, p, data && data.id); break;
    case 'loanDecline': declineLoan(room, p, data && data.id); break;
    case 'loanRepay': repayLoan(room, p, data && data.id); break;
    case 'bankrupt': bankrupt(room, p); break;
    default: throw err('أمر غير معروف');
  }

  if (room.status === 'playing') {
    const c = current(room);
    if (g.debts.length && c.money > 0) payDebts(room, c);
    pruneTrades(room);
    settle(room);
  }
}

module.exports = {
  TT, newGame, act, endAuction, drawCard, current, active, log, err, fmt, P,
  rentFor, ownsSet, cannotBuild, cannotSell, cannotMortgage, cannotUnmortgage, bankrupt,
};
