'use strict';
// «ثروة» board: 40 tiles, 8 colour sets (price tiers), 4 ports, 2 companies.
// Each room fills the 8 sets with world countries: USA, Syria and the UK are
// always on the board (the three most valuable sets); the other five are drawn
// at random from POOL and shuffled.

// Colour of each price tier (cheap -> expensive).
const SETS = {
  c1: { color: '#a86b3c' },
  c2: { color: '#4fb7ea' },
  c3: { color: '#d65a9c' },
  c4: { color: '#f0892a' },
  c5: { color: '#e3474e' },
  c6: { color: '#e9c33b' },
  c7: { color: '#2fae6c' },
  c8: { color: '#4a68dc' },
};

// Cities are listed cheap -> expensive. Two-city sets use the last two.
const COUNTRIES = {
  us: { name: 'أمريكا', cities: ['شيكاغو', 'لوس أنجلوس', 'نيويورك'] },
  sy: { name: 'سوريا', cities: ['حمص', 'حلب', 'دمشق'] },
  gb: { name: 'بريطانيا', cities: ['ليفربول', 'مانشستر', 'لندن'] },
  tr: { name: 'تركيا', cities: ['أنطاليا', 'أنقرة', 'إسطنبول'] },
  de: { name: 'ألمانيا', cities: ['هامبورغ', 'ميونخ', 'برلين'] },
  fr: { name: 'فرنسا', cities: ['ليون', 'مرسيليا', 'باريس'] },
  it: { name: 'إيطاليا', cities: ['ميلانو', 'فينيسيا', 'روما'] },
  es: { name: 'إسبانيا', cities: ['إشبيلية', 'برشلونة', 'مدريد'] },
  jp: { name: 'اليابان', cities: ['أوساكا', 'كيوتو', 'طوكيو'] },
  cn: { name: 'الصين', cities: ['شنتشن', 'بكين', 'شنغهاي'] },
  br: { name: 'البرازيل', cities: ['سلفادور', 'ريو', 'ساو باولو'] },
  ar: { name: 'الأرجنتين', cities: ['قرطبة', 'روساريو', 'بوينس آيرس'] },
  ru: { name: 'روسيا', cities: ['قازان', 'بطرسبرغ', 'موسكو'] },
  ua: { name: 'أوكرانيا', cities: ['أوديسا', 'لفيف', 'كييف'] },
  nl: { name: 'هولندا', cities: ['لاهاي', 'روتردام', 'أمستردام'] },
  se: { name: 'السويد', cities: ['مالمو', 'غوتنبرغ', 'ستوكهولم'] },
  ch: { name: 'سويسرا', cities: ['بازل', 'جنيف', 'زيورخ'] },
  gr: { name: 'اليونان', cities: ['كريت', 'سالونيك', 'أثينا'] },
  in: { name: 'الهند', cities: ['كلكتا', 'دلهي', 'مومباي'] },
  eg: { name: 'مصر', cities: ['الأقصر', 'الإسكندرية', 'القاهرة'] },
  ae: { name: 'الإمارات', cities: ['الشارقة', 'أبوظبي', 'دبي'] },
  jo: { name: 'الأردن', cities: ['العقبة', 'إربد', 'عمّان'] },
  lb: { name: 'لبنان', cities: ['صور', 'صيدا', 'بيروت'] },
  qa: { name: 'قطر', cities: ['الخور', 'الوكرة', 'الدوحة'] },
  kw: { name: 'الكويت', cities: ['الجهراء', 'الأحمدي', 'الكويت'] },
  ma: { name: 'المغرب', cities: ['فاس', 'الرباط', 'مراكش'] },
  tn: { name: 'تونس', cities: ['صفاقس', 'سوسة', 'تونس'] },
  iq: { name: 'العراق', cities: ['أربيل', 'البصرة', 'بغداد'] },
  sa: { name: 'السعودية', cities: ['الدمام', 'جدة', 'الرياض'] },
  bh: { name: 'البحرين', cities: ['الرفاع', 'المحرق', 'المنامة'] },
  om: { name: 'عُمان', cities: ['نزوى', 'صلالة', 'مسقط'] },
  ye: { name: 'اليمن', cities: ['تعز', 'عدن', 'صنعاء'] },
  ps: { name: 'فلسطين', cities: ['نابلس', 'غزة', 'القدس'] },
  dz: { name: 'الجزائر', cities: ['قسنطينة', 'وهران', 'الجزائر'] },
  ly: { name: 'ليبيا', cities: ['مصراتة', 'بنغازي', 'طرابلس'] },
  sd: { name: 'السودان', cities: ['بورتسودان', 'أم درمان', 'الخرطوم'] },
  so: { name: 'الصومال', cities: ['كيسمايو', 'هرجيسا', 'مقديشو'] },
  mr: { name: 'موريتانيا', cities: ['كيفة', 'نواذيبو', 'نواكشوط'] },
  dj: { name: 'جيبوتي', cities: ['تاجورة', 'علي صبيح', 'جيبوتي'] },
  km: { name: 'جزر القمر', cities: ['موتسامودو', 'فومبوني', 'موروني'] },
};
// The 22 Arab League countries.
const ARAB = ['sy', 'eg', 'jo', 'lb', 'iq', 'sa', 'ae', 'qa', 'kw', 'bh', 'om', 'ye', 'ps', 'dz', 'ma', 'tn', 'ly', 'sd', 'so', 'mr', 'dj', 'km'];
const FIXED = { c8: 'us', c7: 'sy', c6: 'gb' };
const POOL = Object.keys(COUNTRIES).filter((k) => !Object.values(FIXED).includes(k));
const RANDOM_SLOTS = ['c1', 'c2', 'c3', 'c4', 'c5'];
const SLOTS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

const r5 = (x) => (x < 20 ? Math.round(x) : Math.round(x / 5) * 5);
// [base, 1 house, 2, 3, 4, hotel]
function rentTable(price) {
  const b = Math.max(2, Math.round(price * 0.07));
  return [b, r5(b * 5), r5(b * 14), r5(b * 38), r5(b * 50), r5(b * 62)];
}

const city = (set, rank, price) => ({ type: 'city', set, rank, price });
const port = (name) => ({ type: 'port', name, price: 200, icon: '⚓' });
const util = (name, icon) => ({ type: 'util', name, price: 150, icon });

const TILES = [
  { type: 'start', name: 'انطلاق', icon: '🚀' },
  city('c1', 1, 60),
  { type: 'chest', name: 'خزنة', icon: '🧰' },
  city('c1', 2, 60),
  { type: 'tax', name: 'ضريبة الدخل', percent: 10, icon: '💰' },
  port('ميناء سنغافورة'),
  city('c2', 0, 100),
  { type: 'chance', name: 'حظ', icon: '🎴' },
  city('c2', 1, 100),
  city('c2', 2, 120),
  { type: 'jail', name: 'السجن', icon: '🔒' },
  city('c3', 0, 140),
  util('شركة الكهرباء', '⚡'),
  city('c3', 1, 140),
  city('c3', 2, 160),
  port('ميناء روتردام'),
  city('c4', 0, 180),
  { type: 'chest', name: 'خزنة', icon: '🧰' },
  city('c4', 1, 180),
  city('c4', 2, 200),
  { type: 'vacation', name: 'استراحة', icon: '🏖️' },
  city('c5', 0, 220),
  { type: 'chance', name: 'حظ', icon: '🎴' },
  city('c5', 1, 220),
  city('c5', 2, 240),
  port('ميناء اللاذقية'),
  city('c6', 0, 260),
  city('c6', 1, 260),
  util('شركة الإنترنت', '📶'),
  city('c6', 2, 280),
  { type: 'gotojail', name: 'اذهب للسجن', icon: '🚓' },
  city('c7', 0, 300),
  city('c7', 1, 300),
  { type: 'chest', name: 'خزنة', icon: '🧰' },
  city('c7', 2, 320),
  port('ميناء نيويورك'),
  { type: 'chance', name: 'حظ', icon: '🎴' },
  city('c8', 1, 350),
  { type: 'tax', name: 'رسوم رفاهية', amount: 100, icon: '💎' },
  city('c8', 2, 400),
];

const SET_TILES = {};
TILES.forEach((t, i) => {
  t.idx = i;
  if (t.type === 'city') {
    t.rent = rentTable(t.price);
    t.houseCost = i < 10 ? 50 : i < 20 ? 100 : i < 30 ? 150 : 200;
    (SET_TILES[t.set] = SET_TILES[t.set] || []).push(i);
  }
  if (t.price) {
    t.mortgage = t.price / 2;
    t.unmortgage = Math.ceil((t.price / 2) * 1.1);
  }
});
if (TILES.length !== 40) throw new Error('board must have 40 tiles');

// ---------------------------------------------------------------- country maps
function shuffled(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// mode 'mix': USA, Syria, UK on top + 5 random from the world.
// mode 'arab': Syria on top + 7 random Arab countries.
function randomMap(mode = 'mix') {
  if (mode === 'arab') {
    const rest = shuffled(ARAB.filter((c) => c !== 'sy'));
    const map = { c8: 'sy' };
    SLOTS.slice(0, 7).forEach((slot, k) => { map[slot] = rest[k]; });
    return map;
  }
  const pool = shuffled(POOL);
  const map = { ...FIXED };
  RANDOM_SLOTS.forEach((slot, k) => { map[slot] = pool[k]; });
  return map;
}
// Put a chosen country in a slot (swaps if it is already on the board).
function setCountry(map, slot, code) {
  if (!SLOTS.includes(slot)) throw new Error('bad slot');
  if (!COUNTRIES[code]) throw new Error('bad country');
  const next = { ...map };
  const other = SLOTS.find((s) => next[s] === code);
  if (other) next[other] = next[slot];
  next[slot] = code;
  return next;
}
// Room-specific copy of the board with city and country names filled in.
function tilesFor(map) {
  return TILES.map((t) => {
    if (t.type !== 'city') return t;
    const code = map[t.set], c = COUNTRIES[code];
    return { ...t, country: code, countryName: c.name, name: c.cities[t.rank] };
  });
}

const PORT_RENT = [25, 50, 100, 200];
const PORTS = TILES.filter((t) => t.type === 'port').map((t) => t.idx);
const JAIL = 10;
const JAIL_FINE = 50;
const GO_SALARY = 200;
const CASH_OPTIONS = [500, 1000, 1500, 2000, 2500, 3000];

// {n} in a card text is replaced by the name of tile n on the room's board.
const CHANCE = [
  { kind: 'move', to: 0, text: 'تقدّم إلى نقطة الانطلاق واقبض $200' },
  { kind: 'move', to: 29, text: 'رحلة عمل إلى {29} — إذا مرّيت بالانطلاق اقبض $200' },
  { kind: 'move', to: 21, text: 'تقدّم إلى {21} — إذا مرّيت بالانطلاق اقبض $200' },
  { kind: 'move', to: 39, text: 'عطلة بـ{39}! تقدّم لهونيك' },
  { kind: 'nearestPort', text: 'تقدّم لأقرب ميناء — إذا إله صاحب ادفع ضعف الإيجار، وإذا مرّيت بالانطلاق اقبض $200' },
  { kind: 'back', steps: 3, text: 'نسيت جزدانك! ارجع 3 خانات' },
  { kind: 'jail', text: 'اذهب إلى السجن مباشرة بدون ما تمرّ بالانطلاق' },
  { kind: 'jailcard', text: 'بطاقة خروج مجاني من السجن — احتفظ فيها' },
  { kind: 'money', amount: 150, text: 'مشروعك الصغير نجح: اقبض $150' },
  { kind: 'money', amount: -20, text: 'مخالفة سرعة: ادفع $20' },
  { kind: 'money', amount: 50, text: 'أرباح أسهم: اقبض $50' },
  { kind: 'repairs', house: 25, hotel: 100, text: 'صيانة عقاراتك: ادفع $25 عن كل بيت و$100 عن كل فندق' },
  { kind: 'payEach', amount: 25, text: 'عزمت الكل عالعشا: ادفع $25 لكل لاعب' },
  { kind: 'money', amount: -15, text: 'رسوم بنكية: ادفع $15' },
  { kind: 'move', to: 5, text: 'رحلة بحرية! تقدّم إلى {5} — إذا مرّيت بالانطلاق اقبض $200' },
  { kind: 'move', to: 11, text: 'زيارة عمل لـ{11} — إذا مرّيت بالانطلاق اقبض $200' },
  { kind: 'move', to: 20, text: 'خود استراحة! تقدّم إلى خانة الاستراحة — إذا مرّيت بالانطلاق اقبض $200' },
  { kind: 'money', amount: 100, text: 'ربحت باليانصيب: اقبض $100' },
  { kind: 'money', amount: -50, text: 'تصليح سيارة: ادفع $50' },
  { kind: 'back', steps: 2, text: 'غلطت بالطريق: ارجع خانتين' },
];

const CHEST = [
  { kind: 'money', amount: 200, text: 'خطأ بنكي لصالحك: اقبض $200' },
  { kind: 'money', amount: -50, text: 'فاتورة طبيب: ادفع $50' },
  { kind: 'money', amount: 50, text: 'بعت أغراض قديمة أونلاين: اقبض $50' },
  { kind: 'jailcard', text: 'بطاقة خروج مجاني من السجن — احتفظ فيها' },
  { kind: 'jail', text: 'اذهب إلى السجن مباشرة' },
  { kind: 'move', to: 0, text: 'تقدّم إلى نقطة الانطلاق واقبض $200' },
  { kind: 'money', amount: 20, text: 'استرداد ضريبي: اقبض $20' },
  { kind: 'money', amount: -100, text: 'قسط التأمين: ادفع $100' },
  { kind: 'money', amount: 100, text: 'ورثة من قريب بعيد: اقبض $100' },
  { kind: 'money', amount: -50, text: 'رسوم مدرسة: ادفع $50' },
  { kind: 'repairs', house: 40, hotel: 115, text: 'ترميم شامل: ادفع $40 عن كل بيت و$115 عن كل فندق' },
  { kind: 'money', amount: 25, text: 'شغل حر عالإنترنت: اقبض $25' },
  { kind: 'money', amount: 10, text: 'ربحت مسابقة صغيرة: اقبض $10' },
  { kind: 'money', amount: 100, text: 'مكافأة سنوية: اقبض $100' },
  { kind: 'money', amount: 150, text: 'أرباح مشروعك: اقبض $150' },
  { kind: 'money', amount: -40, text: 'فاتورة كهربا: ادفع $40' },
  { kind: 'money', amount: 75, text: 'عيدية من الأهل: اقبض $75' },
  { kind: 'jailcard', text: 'محامي شاطر: بطاقة خروج مجاني من السجن' },
  { kind: 'money', amount: -30, text: 'تبرّعت لجمعية خيرية: ادفع $30' },
];

const isProp = (t) => t.type === 'city' || t.type === 'port' || t.type === 'util';

function publicBoard() {
  return {
    tiles: TILES, sets: SETS, setTiles: SET_TILES, portRent: PORT_RENT, countries: COUNTRIES, fixed: FIXED, arab: ARAB,
    jailFine: JAIL_FINE, goSalary: GO_SALARY, cashOptions: CASH_OPTIONS,
  };
}

module.exports = {
  SETS, TILES, SET_TILES, COUNTRIES, FIXED, PORT_RENT, PORTS, JAIL, JAIL_FINE, GO_SALARY,
  CASH_OPTIONS, CHANCE, CHEST, isProp, publicBoard, randomMap, tilesFor, setCountry, ARAB, SLOTS,
};
