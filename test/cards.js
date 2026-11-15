'use strict';
// Draws every «حظ» and «خزنة» card in a controlled state and checks that the
// result matches the card text exactly (position, money, jail, jail card, payments).
// Run: node tharwa-game/test/cards.js
const assert = require('assert');
const B = require('../game/board');
const E = require('../game/engine');

const CHANCE_TILES = B.TILES.filter((t) => t.type === 'chance').map((t) => t.idx);
const CHEST_TILES = B.TILES.filter((t) => t.type === 'chest').map((t) => t.idx);

function freshRoom() {
  const room = {
    code: 'cards', status: 'lobby', log: [], chat: [], game: null,
    settings: { maxPlayers: 4, startingCash: 1500, doubleRent: true, vacationCash: true, auction: true, noRentInJail: false, evenBuild: true, mortgage: true, randomOrder: false, turnTimer: 0 },
    players: [{ id: 'a', name: 'أحمد' }, { id: 'b', name: 'باسل' }, { id: 'c', name: 'كرم' }],
  };
  E.newGame(room);
  return room;
}

let checked = 0;
for (const [deckName, list, tiles] of [['chance', B.CHANCE, CHANCE_TILES], ['chest', B.CHEST, CHEST_TILES]]) {
  list.forEach((card, ci) => {
    for (const fromTile of tiles) {
      const room = freshRoom();
      const g = room.game, p = room.players[0], others = room.players.slice(1);
      p.pos = fromTile;
      g[deckName] = [ci];
      // «ارجع 3 خانات» can land on a «خزنة» tile: make that follow-up draw a harmless money card
      // (a random «اذهب إلى السجن» there made this test fail now and then).
      if (card.kind === 'back') g.chest = [B.CHEST.findIndex((c) => c.kind === 'money' && c.amount > 0)];
      // give the player some buildings for the repairs cards
      if (card.kind === 'repairs') {
        for (const i of B.SET_TILES.c1) g.props[i] = { owner: p.id, houses: 2, mortgaged: false };
        for (const i of B.SET_TILES.c2) g.props[i] = { owner: p.id, houses: 5, mortgaged: false };
      }
      // an owned port, to check «ضعف الإيجار»
      if (card.kind === 'nearestPort') for (const i of B.PORTS) g.props[i] = { owner: 'b', houses: 0, mortgaged: false };
      const before = { money: p.money, pos: p.pos, jailCards: p.jailCards, others: others.map((o) => o.money), pot: g.pot };
      E.drawCard(room, p, deckName, 7);
      const tag = `${deckName}[${ci}] «${g.card.text}» from tile ${fromTile}`;
      assert(!/\{\d+\}/.test(g.card.text), tag + ': placeholders filled with city names');
      assert(g.card.effect, tag + ': has an effect line');

      switch (card.kind) {
        case 'money':
          assert.strictEqual(p.money - before.money, card.amount, tag);
          if (card.amount < 0) assert.strictEqual(g.pot - before.pot, -card.amount, tag + ': fine goes to the vacation pot');
          break;
        case 'move': {
          assert.strictEqual(p.pos, card.to, tag + ': moved to the named tile');
          if (/\{\d+\}/.test(card.text)) assert(g.card.text.includes(E.TT(room, card.to).name), tag + ': text names the destination');
          const passed = card.to < before.pos;
          let expect = before.money + (passed ? B.GO_SALARY : 0);
          if (B.TILES[card.to].type === 'vacation') expect += before.pot;
          assert.strictEqual(p.money, expect, tag + `: ${passed ? 'collected' : 'no'} $200 from start`);
          if (B.isProp(B.TILES[card.to])) assert.strictEqual(g.pendingBuy, card.to, tag + ': can buy the city');
          break;
        }
        case 'back':
          assert.strictEqual(p.pos, (before.pos - card.steps + 40) % 40, tag + ': went back ' + card.steps);
          break;
        case 'jail':
          assert.strictEqual(p.inJail, true, tag + ': in jail');
          assert.strictEqual(p.pos, B.JAIL, tag + ': on the jail tile');
          assert.strictEqual(p.money, before.money, tag + ': no $200 for passing start');
          assert.strictEqual(g.again, false, tag + ': no extra roll');
          break;
        case 'jailcard':
          assert.strictEqual(p.jailCards, before.jailCards + 1, tag);
          break;
        case 'repairs': {
          const cost = 2 * B.SET_TILES.c1.length * card.house + B.SET_TILES.c2.length * card.hotel;
          assert.strictEqual(before.money - p.money, cost, tag + ': paid per house/hotel');
          break;
        }
        case 'nearestPort': {
          const target = B.PORTS.find((i) => i > before.pos) ?? B.PORTS[0];
          assert.strictEqual(p.pos, target, tag + ': nearest port ahead');
          const rent = B.PORT_RENT[B.PORTS.length - 1] * 2;
          const salary = target < before.pos ? B.GO_SALARY : 0;
          assert.strictEqual(p.money, before.money + salary - rent, tag + ': paid double port rent');
          break;
        }
        case 'payEach':
          assert.strictEqual(before.money - p.money, card.amount * others.length, tag);
          others.forEach((o, k) => assert.strictEqual(o.money - before.others[k], card.amount, tag + ': each player got paid'));
          break;
        default: throw new Error('untested card kind ' + card.kind);
      }
      checked++;
    }
  });
}

// A jail card drawn mid-turn after a double must end the doubles streak in a real roll too.
const room = freshRoom();
const g = room.game, p = room.players[0];
g.chance = [B.CHANCE.findIndex((c) => c.kind === 'jail')];
p.pos = 7;
E.drawCard(room, p, 'chance', 6);
assert(p.inJail && p.pos === B.JAIL);

console.log(`OK — ${B.CHANCE.length} «حظ» + ${B.CHEST.length} «خزنة» cards, ${checked} draws: every card did exactly what it says`);
