'use strict';
// Every «ثروة» map, and many random classic boards (also after the host swaps countries):
//   - no country (flag) on two sets, and no two flags that look alike (board.js LOOKALIKE);
//   - a set's flag is that set's country, and every flag code is drawn by public/flags.js;
//   - no tile name twice, and no distinctive word shared by two sets / ports / companies /
//     special tiles («بوابة المدار» next to «محطة المدار», «علي صبيح» next to «ميناء جبل علي»);
//   - the 8 set colours are far enough apart to tell the sets apart.
// Run: node tharwa-game/test/maps.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const B = require('../game/board');
const M = require('../game/maps');

const FLAGS = fs.readFileSync(path.join(__dirname, '..', 'public', 'flags.js'), 'utf8');
const hasFlag = (code) => new RegExp(`^\\s+${code}:`, 'm').test(FLAGS);

// ---------------------------------------------------------------- names
// Normalised words: no diacritics, one alef, ة = ه, ى = ي, no leading «ال» / «لل».
const norm = (w) => w.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/^(?:ال|لل)(?=.{3})/, '');
// Generic place words that may appear in many names without making them look alike.
const GENERIC = new Set(['ميناء', 'شركه', 'شبكه', 'مدينه', 'عاصمه', 'حي', 'برج', 'ابراج', 'سوق', 'ساحه', 'شارع', 'ممر', 'مركز',
  'مصنع', 'مختبر', 'قاعه', 'بوابه', 'محطه', 'رصيف', 'وادي', 'قمه', 'قصر', 'جسر', 'حديقه', 'منصه', 'مهبط', 'مفاعل',
  'اكاديميه', 'زقاق', 'مخزن', 'بازار', 'جزر', 'جزيره', 'قلعه', 'طريق', 'سد', 'عرش', 'مرسي', 'واحه', 'مخيم', 'مملكه',
  'ام', 'ابو', 'اذهب'].map(norm));
const words = (name) => String(name).split(/\s+/).map(norm).filter((w) => w && !GENERIC.has(w));
// Pairs that share a word but read clearly differently: «سلطنة عُمان» (Oman) next to «عمّان» (Amman).
const ALLOW = [['سلطنة عُمان', 'عمّان']];
const allowed = (a, b) => ALLOW.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

// `groups`: [{ id, names: [...] }] — each set (name + cities), each port, each company, the special tiles.
function checkWords(label, groups) {
  const seen = new Map();
  for (const g of groups) {
    for (const n of g.names) {
      for (const w of words(n)) {
        const other = seen.get(w);
        assert(!other || other.id === g.id || allowed(n, other.name), `${label}: «${n}» looks like «${other && other.name}» (shared word «${w}»)`);
        seen.set(w, { id: g.id, name: n });
      }
    }
  }
}
const SPECIAL = { id: 'special', names: B.TILES.filter((t) => !B.isProp(t)).map((t) => t.name) };

// ---------------------------------------------------------------- colours (CIE76 ΔE in Lab)
function lab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
function checkColours(label, colours) {
  assert.strictEqual(colours.length, 8, `${label}: 8 set colours`);
  for (const c of colours) assert(/^#[0-9a-f]{6}$/i.test(c), `${label}: colour ${c}`);
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      const d = dE(colours[i], colours[j]);
      assert(d >= 25, `${label}: set colours ${i + 1} (${colours[i]}) and ${j + 1} (${colours[j]}) look the same (ΔE ${d.toFixed(1)})`);
    }
  }
}

// ---------------------------------------------------------------- one board
function checkBoard(label, tiles) {
  assert.strictEqual(tiles.length, 40, `${label}: 40 tiles`);
  const named = tiles.filter((t) => B.isProp(t));
  for (const t of named) assert(typeof t.name === 'string' && t.name.trim(), `${label}: tile ${t.idx} has a name`);
  const names = named.map((t) => t.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  assert(!dup, `${label}: name repeated «${dup}»`);
  // sets: one country each, never on two sets, no look-alike flags, set name = country name
  const bySet = {};
  for (const t of tiles.filter((x) => x.type === 'city')) (bySet[t.set] = bySet[t.set] || []).push(t);
  const flagOf = {};
  for (const [set, ts] of Object.entries(bySet)) {
    assert.strictEqual(new Set(ts.map((t) => t.country || '')).size, 1, `${label}: set ${set} mixes countries`);
    assert.strictEqual(new Set(ts.map((t) => t.countryName)).size, 1, `${label}: set ${set} mixes names`);
    if (ts[0].country) flagOf[set] = ts[0].country;
  }
  const setNames = Object.values(bySet).map((ts) => ts[0].countryName);
  const dupSet = setNames.find((n, i) => setNames.indexOf(n) !== i);
  assert(!dupSet, `${label}: two sets called «${dupSet}»`);
  const flags = Object.entries(flagOf);
  for (const [set, code] of flags) {
    assert(B.COUNTRIES[code], `${label}: unknown country ${code}`);
    assert(hasFlag(code), `${label}: public/flags.js does not draw ${code}`);
    assert.strictEqual(bySet[set][0].countryName, B.COUNTRIES[code].name, `${label}: set ${set} shows the flag of ${code} but is called «${bySet[set][0].countryName}»`);
    for (const [set2, code2] of flags) {
      if (set2 <= set) continue;
      assert(code !== code2, `${label}: ${B.COUNTRIES[code].name} on two sets (${set}, ${set2})`);
      assert(!B.lookAlike(code, code2), `${label}: ${B.COUNTRIES[code].name} and ${B.COUNTRIES[code2].name} have look-alike flags`);
    }
  }
  // no distinctive word shared between different sets / ports / companies / special tiles
  const groups = Object.entries(bySet).map(([set, ts]) => ({ id: set, names: [ts[0].countryName, ...ts.map((t) => t.name)] }));
  tiles.filter((t) => t.type === 'port' || t.type === 'util').forEach((t) => groups.push({ id: 'tile' + t.idx, names: [t.name] }));
  groups.push(SPECIAL);
  checkWords(label, groups);
}

// a classic country map: 8 slots, Arab countries only, no duplicates, no look-alikes
function checkCountryMap(label, map) {
  const codes = B.SLOTS.map((s) => map[s]);
  for (const c of codes) assert(c && B.COUNTRIES[c] && B.ARAB.includes(c), `${label}: bad country ${c} in ${JSON.stringify(map)}`);
  assert.strictEqual(new Set(codes).size, 8, `${label}: duplicate country in ${JSON.stringify(map)}`);
  for (const a of codes) for (const b of codes) assert(!B.lookAlike(a, b), `${label}: look-alike flags ${a}/${b} in ${JSON.stringify(map)}`);
  checkBoard(label, B.tilesFor(map));
}

// ---------------------------------------------------------------- themed maps
for (const m of M.MAPS) {
  checkColours(m.name, (m.theme && m.theme.sets) || Object.values(B.SETS).map((s) => s.color));
  if (!m.sets) continue;
  assert.strictEqual(m.sets.length, 8, `${m.name}: 8 sets`);
  for (const s of m.sets) assert(s.name && Array.isArray(s.cities) && s.cities.length === 3, `${m.name}: set «${s.name}» needs 3 cities`);
  assert.strictEqual((m.ports || []).length, 4, `${m.name}: 4 ports`);
  assert.strictEqual((m.utils || []).length, 2, `${m.name}: 2 companies`);
  checkBoard(m.name, M.tilesForMap(m.id));
}
const mapNames = M.MAPS.map((m) => m.name);
assert.strictEqual(new Set(mapNames).size, mapNames.length, 'two maps with the same name');

// ---------------------------------------------------------------- classic
// Any two countries can meet on a board (the host picks them), so all names must differ.
{
  const groups = Object.entries(B.COUNTRIES).map(([code, c]) => ({ id: code, names: [c.name, ...c.cities] }));
  B.TILES.filter((t) => t.type === 'port' || t.type === 'util').forEach((t) => groups.push({ id: 'tile' + t.idx, names: [t.name] }));
  groups.push(SPECIAL);
  checkWords('classic (all countries)', groups);
  for (const [code, c] of Object.entries(B.COUNTRIES)) {
    assert.strictEqual(c.cities.length, 3, `classic: ${code} needs 3 cities`);
    assert(hasFlag(code), `classic: public/flags.js does not draw ${code}`);
  }
  assert.deepStrictEqual([...B.ARAB].sort(), Object.keys(B.COUNTRIES).sort(), 'classic: ARAB = every country');
  for (const g of B.LOOKALIKE) for (const c of g) assert(B.COUNTRIES[c], `LOOKALIKE: unknown ${c}`);
}
// random boards: Syria, Jordan, Iraq stay on top; the rest is random and always valid
const seen = new Set();
for (let i = 0; i < 2000; i++) {
  const map = B.randomMap();
  for (const [slot, code] of Object.entries(B.FIXED)) assert.strictEqual(map[slot], code, `classic: ${slot} is ${code}`);
  B.SLOTS.forEach((s) => seen.add(map[s]));
  checkCountryMap('classic random', map);
}
for (const c of B.ARAB) {
  const blocked = Object.values(B.FIXED).some((f) => B.lookAlike(f, c));
  assert.strictEqual(seen.has(c), !blocked, `classic: ${c} ${blocked ? 'must not' : 'should'} show up on random boards`);
}
// Syria, Jordan and Iraq always stay in their slots (c8, c7, c6)
const hasFixed = (label, map) => {
  for (const [slot, code] of Object.entries(B.FIXED)) assert.strictEqual(map[slot], code, `${label}: ${B.COUNTRIES[code].name} must stay in ${slot}`);
};
// a refused pick: 409 with an Arabic reason, the same reason /api/board gives the picker
function refused(map, slot, code, re) {
  let e = null;
  try { B.setCountry(map, slot, code); } catch (x) { e = x; }
  assert(e && e.status === 409 && e.userMsg && re.test(e.userMsg), `setCountry ${slot}=${code} must be refused (${e && e.userMsg})`);
  return e.userMsg;
}
{
  const map = B.randomMap();
  assert.strictEqual(refused(map, 'c2', 'eg', /^علم مصر بيشبه علم العراق، والعراق ثابت باللوح$/), B.UNAVAILABLE.eg);
  assert.strictEqual(refused(map, 'c3', 'ye', /علم اليمن بيشبه علم العراق/), B.UNAVAILABLE.ye);
  assert.strictEqual(refused(map, 'c1', 'ps', /علم فلسطين بيشبه علم الأردن، والأردن ثابت باللوح/), B.UNAVAILABLE.ps);
  refused(map, 'c8', 'eg', /سوريا ثابتة باللوح/);           // a fixed slot can't change
  refused(map, 'c6', 'ma', /العراق ثابت باللوح/);
  refused(map, 'c1', 'sy', /سوريا ثابتة بمكانها/);          // a fixed country can't move
  refused(map, 'c2', 'iq', /العراق ثابت بمكانه/);
  assert.deepStrictEqual(Object.keys(B.UNAVAILABLE).sort(), ['eg', 'iq', 'jo', 'ps', 'sy', 'ye'], 'unavailable picks');
  assert.deepStrictEqual(B.publicBoard().unavailable, B.UNAVAILABLE, '/api/board tells the picker');
  for (const [slot, code] of Object.entries(B.FIXED)) assert.deepStrictEqual(B.setCountry(map, slot, code), map, 're-picking a fixed country changes nothing');
}
// the host puts every allowed country in every free slot; every other pick is refused
for (const slot of B.SLOTS) {
  for (const code of B.ARAB) {
    const before = B.randomMap();
    if (B.pickRefusal(slot, code)) { refused(before, slot, code, /ثابت/); continue; }
    const after = B.setCountry(before, slot, code);
    assert.strictEqual(after[slot], code, `setCountry put ${code} in ${slot}`);
    checkCountryMap(`classic setCountry ${slot}=${code}`, after);
    hasFixed(`classic setCountry ${slot}=${code}`, after);
    // countries that do not clash with the new one stay on the board
    for (const s of B.SLOTS) {
      if (s !== slot && before[s] !== code && !B.lookAlike(before[s], code)) assert.strictEqual(after[s], before[s], `setCountry kept ${before[s]} in ${s}`);
    }
    const moved = B.SLOTS.find((s) => before[s] === code);
    if (moved && moved !== slot) assert.strictEqual(after[moved], before[slot], `setCountry swapped ${code} with ${before[slot]}`);
  }
}
// random chains of picks (refused ones leave the board as it was)
for (let i = 0; i < 300; i++) {
  let map = B.randomMap();
  for (let k = 0; k < 25; k++) {
    const slot = B.SLOTS[Math.floor(Math.random() * 8)], code = B.ARAB[Math.floor(Math.random() * B.ARAB.length)];
    try { map = B.setCountry(map, slot, code); } catch (e) { assert.strictEqual(e.status, 409, e.message); }
    checkCountryMap('classic swaps', map);
    hasFixed('classic swaps', map);
  }
}
assert.throws(() => B.setCountry(B.randomMap(), 'c9', 'sy'), /bad slot/);
assert.throws(() => B.setCountry(B.randomMap(), 'c1', 'fr'), /bad country/);
console.log('MAPS OK — every map and 2000+ classic boards: no repeated or look-alike countries, names or colours');
