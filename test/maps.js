'use strict';
// Every map: no tile name used twice, no country (flag) used by two sets, no foreign ports.
const B = require('../game/board');
const M = require('../game/maps');
const assert = require('assert');

function check(label, tiles) {
  const named = tiles.filter((t) => ['city', 'port', 'util'].includes(t.type));
  const names = named.map((t) => t.name);
  const dupName = names.find((n, i) => names.indexOf(n) !== i);
  assert(!dupName, `${label}: name repeated «${dupName}»`);
  const flags = {};
  tiles.filter((t) => t.type === 'city' && t.country).forEach((t) => { (flags[t.country] = flags[t.country] || new Set()).add(t.set); });
  for (const [c, sets] of Object.entries(flags)) assert(sets.size === 1, `${label}: country ${c} used by ${sets.size} sets`);
  // a port/company must not just repeat a city name on the same board ("ميناء X" with X a city)
  const cities = new Set(tiles.filter((t) => t.type === 'city').map((t) => t.name));
  for (const t of named.filter((t) => t.type === 'port')) {
    const base = t.name.replace(/^ميناء\s+/, '');
    assert(!cities.has(base), `${label}: port «${t.name}» repeats city «${base}»`);
  }
}
for (const m of M.MAPS) if (m.sets) check(m.name, M.tilesForMap(m.id));
// classic: every possible country in every slot, plus many random rooms
const ports = B.TILES.filter((t) => t.type === 'port').map((t) => t.name.replace(/^ميناء\s+/, ''));
const allCities = Object.values(B.COUNTRIES).flatMap((c) => c.cities);
for (const p of ports) assert(!allCities.includes(p), `classic: port «${p}» repeats a city`);
for (const [code, c] of Object.entries(B.COUNTRIES)) assert(!c.cities.includes(c.name), `classic: ${code} city equals country name`);
for (let i = 0; i < 300; i++) check('classic', B.tilesFor(B.randomMap()));
console.log('MAPS OK — no repeated names or countries on any map');
