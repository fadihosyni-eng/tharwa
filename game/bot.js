'use strict';
// Simple computer player. Also drives "autopilot" for timed-out or disconnected
// humans (autopilot only rolls, skips buying, ends turns and resolves debts).
const B = require('./board');
const E = require('./engine');

function setProgress(room, pid, set) {
  let mine = 0, others = 0;
  for (const i of B.SET_TILES[set]) {
    const pr = room.game.props[i];
    if (pr) { if (pr.owner === pid) mine++; else others++; }
  }
  return { mine, others, total: B.SET_TILES[set].length };
}
function wouldComplete(room, pid, idx) {
  const t = B.TILES[idx];
  if (t.type !== 'city') return false;
  const s = setProgress(room, pid, t.set);
  return s.others === 0 && s.mine === s.total - 1;
}
function blocksRival(room, pid, idx) {
  const t = B.TILES[idx];
  if (t.type !== 'city') return false;
  const owners = new Set(B.SET_TILES[t.set].filter((i) => i !== idx).map((i) => {
    const pr = room.game.props[i]; return pr ? pr.owner : null;
  }));
  const [only] = owners;
  return owners.size === 1 && only && only !== pid;
}
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function value(room, props) {
  return props.reduce((s, i) => {
    const pr = room.game.props[i], t = B.TILES[i];
    return s + (pr && pr.mortgaged ? t.price / 2 : t.price);
  }, 0);
}

function evalTrade(room, p, tr) {
  if (tr.get.money > p.money) return false;
  let recv = value(room, tr.give.props) + tr.give.money;
  let send = value(room, tr.get.props) + tr.get.money;
  for (const i of tr.get.props) {
    const t = B.TILES[i];
    if (t.type !== 'city') continue;
    const s = setProgress(room, p.id, t.set);
    if (s.mine === s.total) return false;          // never break a finished set
    if (s.mine >= s.total - 1) send *= 1.6;
  }
  for (const i of tr.give.props) if (wouldComplete(room, p.id, i)) recv += B.TILES[i].price;
  return recv > 0 && recv >= send * 1.2;
}

// Offer cash for the one city that completes a set (max one offer per round).
function tradeIdea(room, p) {
  const g = room.game;
  if (g.offerRound && g.offerRound[p.id] === g.round) return null;
  for (const set of Object.keys(B.SET_TILES)) {
    const ids = B.SET_TILES[set];
    const mine = ids.filter((i) => g.props[i] && g.props[i].owner === p.id);
    if (mine.length !== ids.length - 1) continue;
    const miss = ids.find((i) => !g.props[i] || g.props[i].owner !== p.id);
    const pr = g.props[miss];
    if (!pr || ids.some((i) => g.props[i] && g.props[i].houses > 0)) continue;
    const owner = room.players.find((x) => x.id === pr.owner);
    if (!owner || owner.bankrupt) continue;
    const offer = Math.round((B.TILES[miss].price * (ids.length === 2 ? 2.2 : 1.6)) / 10) * 10;
    if (p.money - offer < 150) continue;
    return { type: 'tradePropose', data: { to: owner.id, give: { props: [], money: offer }, get: { props: [miss], money: 0 } } };
  }
  return null;
}

function decide(room, p, opt = {}) {
  const g = room.game;
  if (!g || room.status !== 'playing' || p.bankrupt) return null;
  const auto = !!opt.autopilot;

  if (!auto) {
    const tr = g.trades.find((t) => t.to === p.id);
    if (tr) return { type: evalTrade(room, p, tr) ? 'tradeAccept' : 'tradeDecline', data: { id: tr.id } };
    // Loan offers: borrow when short of cash, lend when rich and paid interest.
    const ln = (g.loans || []).find((l) => l.state === 'offer' && l.proposer !== p.id && (l.lender === p.id || l.borrower === p.id));
    if (ln) {
      const ok = ln.borrower === p.id ? p.money < 400 && ln.interest <= 20 : p.money - ln.amount >= 400 && ln.interest >= 10;
      return { type: ok ? 'loanAccept' : 'loanDecline', data: { id: ln.id } };
    }
  }

  if (g.auction) {
    if (auto) return null;
    const a = g.auction;
    if (a.bidder === p.id || a.seller === p.id) return null;
    const t = B.TILES[a.idx], pr = g.props[a.idx];
    const keen = wouldComplete(room, p.id, a.idx) || blocksRival(room, p.id, a.idx);
    const factor = (keen ? 1.45 : 0.7 + (hash(p.id + a.idx) % 35) / 100) * (pr && pr.mortgaged ? 0.6 : 1);
    const cap = Math.min(p.money - 60, Math.round(t.price * factor));
    const step = a.bid < 100 ? 10 : a.bid < 400 ? 20 : 50;
    const next = Math.max(a.min || 0, a.bid === 0 ? Math.max(10, Math.round((t.price * 0.4) / 10) * 10) : a.bid + step);
    return next <= cap ? { type: 'bid', data: { amount: next } } : null;
  }

  // A creditor (computer player) offers to buy one of the debtor's free properties, the debt counting as payment.
  if (!auto && g.phase === 'debt' && E.current(room) !== p && E.owedTo(room, p.id) > 0 && !(g.debtOffers || []).some((o) => o.from === p.id)) {
    const debtor = E.current(room), owed = E.owedTo(room, p.id);
    let best = null;
    for (const [k, pr] of Object.entries(g.props)) {
      const i = Number(k), t = B.TILES[i];
      if (pr.owner !== debtor.id || (g.auction && g.auction.idx === i) || (g.debtNo || []).includes(p.id + ':' + i)) continue;
      if (t.type === 'city' && B.SET_TILES[t.set].some((j) => g.props[j] && g.props[j].houses > 0)) continue;
      const price = Math.round(Math.min(t.price * (pr.mortgaged ? 0.5 : 0.9), owed + Math.max(0, p.money - 200)) / 10) * 10;
      if (price >= t.mortgage && (!best || t.price > best.t.price)) best = { i, t, price };
    }
    if (best) return { type: 'debtOffer', data: { idx: best.i, price: best.price } };
  }

  if (E.current(room) !== p) return null;

  switch (g.phase) {
    case 'roll':
      if (p.inJail && !g.rolled) {
        if (p.jailCards > 0) return { type: 'jailCard' };
        const freeProps = B.TILES.filter((t, i) => B.isProp(t) && !g.props[i]).length;
        if (!auto && p.money >= B.JAIL_FINE + 250 && freeProps > 6) return { type: 'payJail' };
      }
      return { type: 'roll' };

    case 'buy': {
      if (auto) return { type: 'skip' };
      const t = B.TILES[g.pendingBuy];
      const keen = wouldComplete(room, p.id, g.pendingBuy) || blocksRival(room, p.id, g.pendingBuy);
      if (p.money >= t.price && (p.money - t.price >= 100 || keen)) return { type: 'buy' };
      return { type: 'skip' };
    }

    case 'debt': {
      let best = null;
      for (const [k, pr] of Object.entries(g.props)) {
        const i = Number(k);
        if (pr.owner === p.id && pr.houses > 0 && !E.cannotSell(room, p, i)) {
          if (best === null || pr.houses > g.props[best].houses) best = i;
        }
      }
      if (best !== null) return { type: 'sell', data: { idx: best } };
      // an offer to buy one of my properties that pays at least what the bank would lend on it
      const offers = (g.debtOffers || []).filter((o) => o.to === p.id).sort((a, b) => b.price - a.price);
      const fair = offers.find((o) => o.price >= B.TILES[o.idx].mortgage);
      if (fair) return { type: 'debtOfferAccept', data: { id: fair.id } };
      const cands = Object.keys(g.props).map(Number).filter((i) => !E.cannotMortgage(room, p, i));
      if (cands.length) {
        const score = (i) => {
          const t = B.TILES[i];
          return (t.type === 'city' && E.ownsSet(room, p.id, t.set) ? 1000 : 0) + t.price;
        };
        cands.sort((a, b) => score(a) - score(b));
        return { type: 'mortgage', data: { idx: cands[0] } };
      }
      if (offers.length) return { type: 'debtOfferAccept', data: { id: offers[0].id } };
      return { type: 'bankrupt' };
    }

    case 'done': {
      if (!auto) {
        const due = (g.loans || []).find((l) => l.state === 'active' && l.borrower === p.id && p.money - l.repay >= 500);
        if (due) return { type: 'loanRepay', data: { id: due.id } };
        for (const [k, pr] of Object.entries(g.props)) {
          const i = Number(k);
          if (pr.owner === p.id && pr.mortgaged && !E.cannotUnmortgage(room, p, i) && p.money - B.TILES[i].unmortgage >= 500) {
            return { type: 'unmortgage', data: { idx: i } };
          }
        }
        const idea = tradeIdea(room, p);
        if (idea) return idea;
        const opts = [];
        for (const [k, pr] of Object.entries(g.props)) {
          const i = Number(k), t = B.TILES[i];
          if (pr.owner === p.id && t.type === 'city' && !E.cannotBuild(room, p, i) && p.money - t.houseCost >= 150) opts.push(i);
        }
        opts.sort((a, b) => (g.props[a].houses - g.props[b].houses) || (B.TILES[b].price - B.TILES[a].price));
        if (opts.length) return { type: 'build', data: { idx: opts[0] } };
      }
      return { type: 'end' };
    }
    default: return null;
  }
}

module.exports = { decide, evalTrade };
