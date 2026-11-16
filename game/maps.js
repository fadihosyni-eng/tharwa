'use strict';
// Board "maps" = a visual theme + the names on the 40 tiles. The tile layout, prices and rules
// never change, so the engine only reads names from room.tiles.
//   classic — the Arab-countries board (countries picked per room, see board.js)
//   others  — fixed set lists; each set may show a real flag (`flag`) or a neon emblem (no flag).
// Prices are in account points; admins can change price/enabled in «الخرائط» (stored in settings).
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
      sets: ['#8c6b3f', '#2fb5a8', '#c8584f', '#d99a3a', '#7d5bd6', '#e0b84a', '#2d8f5f', '#f4d27a'],
    },
    sets: [
      { flag: 'om', name: 'عُمان', cities: ['نزوى', 'صلالة', 'مسقط'] },
      { flag: 'bh', name: 'البحرين', cities: ['الرفاع', 'المحرق', 'المنامة'] },
      { flag: 'kw', name: 'الكويت', cities: ['الجهراء', 'الفروانية', 'أبراج الكويت'] },
      { flag: 'sa', name: 'السعودية — الساحل', cities: ['الخبر', 'الدمام', 'جدة'] },
      { flag: 'sa', name: 'السعودية — العاصمة', cities: ['الطائف', 'العُلا', 'الرياض'] },
      { flag: 'qa', name: 'قطر', cities: ['الخور', 'لوسيل', 'الدوحة'] },
      { flag: 'ae', name: 'أبوظبي', cities: ['العين', 'جزيرة ياس', 'أبوظبي'] },
      { flag: 'ae', name: 'دبي', cities: ['مرسى دبي', 'نخلة جميرا', 'برج خليفة'] },
    ],
    ports: ['ميناء صلالة', 'ميناء الدمام', 'ميناء حمد', 'ميناء جبل علي'],
    utils: ['شركة الطاقة', 'شركة الاتصالات'],
  },
  {
    id: 'levant', name: 'الشام القديمة', price: 750,
    description: 'حجر ورمل وزيتون: دمشق وحلب وبيروت والقدس وعمّان بنقشة عربية أصيلة.',
    bg: '/bg/map-levant.svg',
    theme: {
      boardBg: 'linear-gradient(180deg, #2c2218, #1b140d)', tile: '#3a2d20', tile2: '#4a3a29', line: 'rgba(214, 180, 120, .45)',
      accent: '#c9a45c', accent2: '#e9d3a0', text: '#f6ead4', centerBg: 'radial-gradient(circle at 50% 30%, #4a3a27, #241a11 72%)',
      sets: ['#8a5a3a', '#5f8f6f', '#b0563f', '#c98d3c', '#7a8f3a', '#a8443a', '#4f7b8f', '#d4a64a'],
    },
    sets: [
      { flag: 'ps', name: 'فلسطين — الجنوب', cities: ['الخليل', 'بيت لحم', 'غزة'] },
      { flag: 'jo', name: 'الأردن — الشمال', cities: ['العقبة', 'إربد', 'جرش'] },
      { flag: 'jo', name: 'الأردن — الجنوب', cities: ['وادي رم', 'مادبا', 'البتراء'] },
      { flag: 'lb', name: 'لبنان — الساحل', cities: ['جبيل', 'صيدا', 'صور'] },
      { flag: 'lb', name: 'لبنان — العاصمة', cities: ['جونية', 'بعلبك', 'بيروت'] },
      { flag: 'ps', name: 'فلسطين — الشمال', cities: ['نابلس', 'عكا', 'القدس'] },
      { flag: 'sy', name: 'سوريا — حلب', cities: ['حماة', 'حمص', 'قلعة حلب'] },
      { flag: 'sy', name: 'سوريا — دمشق', cities: ['باب توما', 'سوق الحميدية', 'الجامع الأموي'] },
    ],
    ports: ['ميناء اللاذقية', 'ميناء طرطوس', 'ميناء بيروت', 'ميناء العقبة'],
    utils: ['شركة الكهرباء', 'شركة المي'],
  },
  {
    id: 'neon', name: 'نيون 2077', price: 1000,
    description: 'مدينة المستقبل: أحياء نيون، أبراج خوارزميات، وشبكة ليزر وردية وزرقا.',
    bg: '/bg/map-neon.svg',
    theme: {
      boardBg: 'linear-gradient(180deg, #14021f, #05010d)', tile: '#0d0422', tile2: '#170833', line: 'rgba(0, 240, 255, .5)',
      accent: '#ff2fd6', accent2: '#00f0ff', text: '#f3eaff', centerBg: 'radial-gradient(circle at 50% 30%, #2a0742, #07010f 72%)',
      sets: ['#7b2cff', '#00e5ff', '#ff2fd6', '#ffe600', '#39ff88', '#ff6a00', '#00a2ff', '#ff3864'],
    },
    sets: [
      { name: 'حي الخردة', cities: ['زقاق الأسلاك', 'سوق القطع', 'مخزن الروبوتات'] },
      { name: 'المرفأ المعلّق', cities: ['رصيف الدرونز', 'برج الشحن', 'بوابة المدار'] },
      { name: 'شارع البكسل', cities: ['ممر الهولوغرام', 'ساحة الشاشات', 'قاعة الألعاب'] },
      { name: 'وادي الشرائح', cities: ['مصنع المعالجات', 'مختبر الكم', 'مركز البيانات'] },
      { name: 'سوق النيون', cities: ['بازار الليزر', 'حي الأضواء', 'برج الإعلانات'] },
      { name: 'المدينة العائمة', cities: ['جسر الضباب', 'الحديقة المعلّقة', 'قصر السحاب'] },
      { name: 'حي الذكاء', cities: ['أكاديمية الآلة', 'عقل المدينة', 'برج الخوارزميات'] },
      { name: 'قمة 2077', cities: ['منصة الإطلاق', 'مدار المجرّة', 'عرش النيون'] },
    ],
    ports: ['محطة المدار', 'بوابة الهايبرلوب', 'ميناء الدرونز', 'مهبط الصواريخ'],
    utils: ['مفاعل الاندماج', 'شبكة الكم'],
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
