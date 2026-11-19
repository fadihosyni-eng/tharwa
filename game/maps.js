'use strict';
// Board "maps" = a visual theme + the names on the 40 tiles. The tile layout, prices and rules
// never change, so the engine only reads names from room.tiles.
//   classic — the Arab-countries board (countries picked per room, see board.js)
//   others  — fixed set lists; each set may show a real flag (`flag`) or a neon emblem (no flag).
// Prices are in account points; admins can change price/enabled in «الخرائط» (stored in settings).
// Rules (checked by test/maps.js): no country or name twice on a board, no two look-alike flags
// (board.js LOOKALIKE), a flag always matches its set name, and the 8 set colours are easy to tell apart.
const B = require('./board');

const MAPS = [
  {
    id: 'classic', name: 'كلاسيك عربي', price: 0,
    description: 'اللوح الأصلي: 22 دولة عربية بأعلامها، وصاحب الغرفة بيختار الدول.',
    bg: '/bg/rings.svg',
    theme: {}, // the default Serva look
  },
  {
    id: 'gulf', name: 'ليالي الخليج', price: 500,
    description: 'فخامة الخليج: ذهب على كحلي، أبراج دبي والدوحة والرياض تحت سما الصحرا.',
    bg: '/bg/map-gulf.svg',
    theme: {
      boardBg: 'linear-gradient(180deg, #0b1230, #05081a)', tile: '#0e1733', tile2: '#152150', line: 'rgba(255, 197, 61, .42)',
      accent: '#ffc53d', accent2: '#ffe08a', text: '#fff7e0', centerBg: 'radial-gradient(circle at 50% 30%, #1a2350, #070b1f 72%)',
      sets: ['#8c6b3f', '#2fb5a8', '#c8584f', '#d9823a', '#7d5bd6', '#4f8fe0', '#3f9a4a', '#e0e6ef'],
    },
    sets: [
      // Yemen (not a Gulf state, flag like Iraq's) and Bahrain (flag like Qatar's) became two Gulf landmark sets.
      { name: 'الربع الخالي', cities: ['مخيم الكثبان', 'رمال الشيبة', 'واحة ليوا'] },
      { name: 'جزر اللؤلؤ', cities: ['قلعة عراد', 'طريق اللؤلؤ', 'المنامة'] },
      { flag: 'om', name: 'سلطنة عُمان', cities: ['نزوى', 'صلالة', 'مسقط'] },
      { flag: 'kw', name: 'الكويت', cities: ['الجهراء', 'الفروانية', 'أبراج الكويت'] },
      { flag: 'iq', name: 'العراق', cities: ['الفاو', 'أم قصر', 'البصرة'] },
      { flag: 'qa', name: 'قطر', cities: ['الخور', 'لوسيل', 'الدوحة'] },
      { flag: 'sa', name: 'السعودية', cities: ['الخبر', 'جدة', 'الرياض'] },
      { flag: 'ae', name: 'الإمارات', cities: ['أبوظبي', 'نخلة جميرا', 'برج خليفة'] },
    ],
    ports: ['ميناء الدقم', 'ميناء الملك عبدالعزيز', 'ميناء حمد', 'ميناء جبل علي'],
    utils: ['شركة الطاقة', 'شركة الاتصالات'],
  },
  {
    id: 'levant', name: 'الشرق القديم', price: 750,
    description: 'حجر ورمل وزيتون: دمشق والقدس وبيروت وبغداد، والبتراء والأهرامات وسبأ، بنقشة عربية أصيلة.',
    bg: '/bg/map-levant.svg',
    theme: {
      boardBg: 'linear-gradient(180deg, #2c2218, #1b140d)', tile: '#3a2d20', tile2: '#4a3a29', line: 'rgba(214, 180, 120, .45)',
      accent: '#c9a45c', accent2: '#e9d3a0', text: '#f6ead4', centerBg: 'radial-gradient(circle at 50% 30%, #4a3a27, #241a11 72%)',
      sets: ['#7a5236', '#5f8f6f', '#c0583a', '#d4892a', '#7a8f3a', '#8e4a78', '#4f7b8f', '#3fc1c9'],
    },
    sets: [
      // Yemen, Egypt and Jordan have flags like Iraq's and Palestine's, so they are shown as
      // ancient-site sets with an emblem instead of a flag.
      { name: 'مملكة سبأ', cities: ['شبام حضرموت', 'سد مأرب', 'عرش بلقيس'] },
      { flag: 'sa', name: 'السعودية', cities: ['تبوك', 'الجوف', 'مدائن صالح'] },
      { name: 'الأهرامات', cities: ['سقارة', 'أبو الهول', 'هرم خوفو'] },
      { flag: 'iq', name: 'العراق', cities: ['الموصل', 'أربيل', 'بغداد'] },
      { name: 'البتراء', cities: ['وادي موسى', 'السيق', 'الدير'] },
      { flag: 'lb', name: 'لبنان', cities: ['صور', 'بعلبك', 'بيروت'] },
      { flag: 'ps', name: 'فلسطين', cities: ['نابلس', 'عكا', 'القدس'] },
      { flag: 'sy', name: 'سوريا', cities: ['قلعة حلب', 'سوق الحميدية', 'الجامع الأموي'] },
    ],
    ports: ['ميناء اللاذقية', 'ميناء طرطوس', 'ميناء صيدا', 'ميناء العقبة'],
    utils: ['شركة الكهرباء', 'شركة المي'],
  },
  {
    id: 'neon', name: 'نيون 2077', price: 1000,
    description: 'مدينة المستقبل: أحياء نيون، أبراج خوارزميات، وشبكة ليزر وردية وزرقا.',
    bg: '/bg/map-neon.svg',
    theme: {
      boardBg: 'linear-gradient(180deg, #14021f, #05010d)', tile: '#0d0422', tile2: '#170833', line: 'rgba(0, 240, 255, .5)',
      accent: '#ff2fd6', accent2: '#00f0ff', text: '#f3eaff', centerBg: 'radial-gradient(circle at 50% 30%, #2a0742, #07010f 72%)',
      sets: ['#7b2cff', '#00ffd0', '#ff8fe8', '#ffe600', '#39ff88', '#ff6a00', '#00a2ff', '#ff3864'],
    },
    sets: [
      { name: 'حي الخردة', cities: ['زقاق الأسلاك', 'سوق القطع', 'مخزن الروبوتات'] },
      { name: 'المرفأ المعلّق', cities: ['رصيف المناطيد', 'برج الشحن', 'بوابة النجوم'] },
      { name: 'شارع البكسل', cities: ['ممر الهولوغرام', 'ساحة الشاشات', 'قاعة الألعاب'] },
      { name: 'وادي الشرائح', cities: ['مصنع المعالجات', 'مختبر الكم', 'مركز البيانات'] },
      { name: 'سوق النيون', cities: ['بازار الليزر', 'حي الأضواء', 'برج الإعلانات'] },
      { name: 'المدينة العائمة', cities: ['جسر الضباب', 'الحديقة المعلّقة', 'قصر السحاب'] },
      { name: 'حي الذكاء', cities: ['أكاديمية الآلة', 'عقل المدينة', 'برج الخوارزميات'] },
      { name: 'قمة 2077', cities: ['منصة الإطلاق', 'قبة المجرّة', 'عرش المستقبل'] },
    ],
    ports: ['محطة المدار', 'بوابة الهايبرلوب', 'ميناء الدرونز', 'مهبط الصواريخ'],
    utils: ['مفاعل الاندماج', 'شبكة الألياف'],
  },
];
const BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));
const SLOTS = B.SLOTS; // c1..c8, cheap -> expensive

// Room tiles for a themed map (the classic map uses B.tilesFor(countryMap) instead).
function tilesForMap(id) {
  const m = BY_ID[id];
  if (!m || !m.sets) return null;
  let port = 0, util = 0;
  return B.TILES.map((t) => {
    if (t.type === 'city') {
      const set = m.sets[SLOTS.indexOf(t.set)];
      return { ...t, country: set.flag || null, countryName: set.name, name: set.cities[t.rank] };
    }
    if (t.type === 'port' && m.ports) return { ...t, name: m.ports[port++] };
    if (t.type === 'util' && m.utils) return { ...t, name: m.utils[util++] };
    return t;
  });
}
// What clients need to draw any map (names, colours, background, price).
function publicMaps(config = {}) {
  return MAPS.map((m) => {
    const c = config[m.id] || {};
    return {
      id: m.id, name: m.name, description: m.description, bg: m.bg, theme: m.theme,
      price: Number.isFinite(c.price) ? c.price : m.price,
      enabled: m.id === 'classic' ? true : c.enabled !== false,
      sets: m.sets || null, ports: m.ports || null, utils: m.utils || null,
    };
  });
}

module.exports = { MAPS, BY_ID, tilesForMap, publicMaps };
