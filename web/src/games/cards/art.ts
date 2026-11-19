// Card faces for the card games. Image first: /cards/<rank><suit>.webp (the owner's art, 360×504) when the file
// exists in web/public/cards/; otherwise a crisp SVG drawn in the same style — dark glass card, neon blue frame,
// chrome rank letters, crystal pips (all blue: deep electric blue for ♠ ♣, light sky-cyan for ♥ ♦), «SERVA» mark.
// The list of image files is read at build time (Vite glob keys only — the loaders are never called, so nothing extra
// is downloaded), which means no 404 probes in the browser.
const files = import.meta.glob('/public/cards/*.webp', { query: '?url', import: 'default' });
const HAVE = new Set(Object.keys(files).map((k) => k.split('/').pop()!.replace('.webp', '')));

export const RANKS = '23456789TJQKA';
export const SUITS = 'SHDC';
export const SUIT_AR: Record<string, string> = { S: 'بستوني', H: 'كبّة', D: 'ديناري', C: 'سباتي' };
const RANK_TXT: Record<string, string> = { T: '10' };
export const rankLabel = (c: string) => RANK_TXT[c[0]] || c[0];

// ---------------------------------------------------------------- suit shapes (100×100 box)
const circ = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
export const SUIT_PATH: Record<string, string> = {
  S: 'M50 5C42 18 12 38 12 60c0 17 17 27 32 17c-2 9-6 15-12 19h36c-6-4-10-10-12-19c15 10 32 0 32-17C88 38 58 18 50 5Z',
  H: 'M50 93C38 82 8 60 8 33C8 18 19 8 32 8c9 0 15 5 18 12c3-7 9-12 18-12c13 0 24 10 24 25c0 27-30 49-42 60Z',
  D: 'M50 4Q64 28 86 50Q64 72 50 96Q36 72 14 50Q36 28 50 4Z',
  C: circ(50, 29, 19) + circ(28, 58, 19) + circ(72, 58, 19) + 'M46 56Q45 82 33 96h34Q55 82 54 56Z',
};
const TINT: Record<string, [string, string, string]> = {
  S: ['#8cc8ff', '#1f6dff', '#0a2580'], C: ['#8cc8ff', '#1f6dff', '#0a2580'],   // deep electric blue
  H: ['#d8fbff', '#3fe0ff', '#0a78a8'], D: ['#d8fbff', '#3fe0ff', '#0a78a8'],   // light sky-cyan
};
const DEFS = (su: string) => {
  const [a, b, c] = TINT[su];
  return `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1a3c"/><stop offset=".55" stop-color="#050c20"/><stop offset="1" stop-color="#081430"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="${b}" stop-opacity=".22"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
<linearGradient id="pip" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".45" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset=".51" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".38" stop-color="#cbd7e4"/><stop offset=".52" stop-color="#6c7f95"/><stop offset=".7" stop-color="#eef4fa"/><stop offset="1" stop-color="#9aabbf"/></linearGradient>
</defs>`;
};
// One crystal pip of `su`, centred at (x, y), `size` wide, optionally upside down.
function pip(su: string, x: number, y: number, size: number, flip = false) {
  const k = size / 100;
  const t = `translate(${x - size / 2} ${y - size / 2}) scale(${k})${flip ? ' rotate(180 50 50)' : ''}`;
  const d = SUIT_PATH[su];
  return `<g transform="${t}"><path d="${d}" fill="url(#pip)" stroke="#d9ecff" stroke-opacity=".85" stroke-width="${(1.6 / k).toFixed(2)}"/><path d="${d}" fill="url(#gloss)"/></g>`;
}
const L = 84, M = 125, R = 166, TOP = 96, SPAN = 158;
const LAYOUTS: Record<string, [number, number][]> = {
  '2': [[M, 0], [M, 1]],
  '3': [[M, 0], [M, 0.5], [M, 1]],
  '4': [[L, 0], [R, 0], [L, 1], [R, 1]],
  '5': [[L, 0], [R, 0], [M, 0.5], [L, 1], [R, 1]],
  '6': [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '7': [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '8': [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [M, 0.75], [L, 1], [R, 1]],
  '9': [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [M, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  T: [[L, 0], [R, 0], [M, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [M, 5 / 6], [L, 1], [R, 1]],
};
const CROWN: Record<string, string> = {
  // king: 5-point crown · queen: tiara with arcs · jack: knight's shield
  K: 'M78 128l10-44 18 26 19-36 19 36 18-26 10 44Z M80 132h90v12H80Z',
  Q: 'M82 130c4-18 12-30 22-36c-2 12 4 20 21 20s23-8 21-20c10 6 18 18 22 36Z M84 134h82v10H84Z',
  J: 'M96 86h58v26c0 20-12 32-29 40c-17-8-29-20-29-40Z',
};
const GEMS: Record<string, string> = {
  K: '<circle cx="88" cy="84" r="4"/><circle cx="125" cy="74" r="5"/><circle cx="162" cy="84" r="4"/>',
  Q: '<circle cx="125" cy="106" r="5"/><circle cx="104" cy="96" r="3.5"/><circle cx="146" cy="96" r="3.5"/>',
  J: '',
};
function corner(card: string) {
  const r = rankLabel(card), su = card[1];
  const fs = r.length > 1 ? 40 : 50;
  return `<text x="${r.length > 1 ? 34 : 32}" y="62" text-anchor="middle" font-family="'Arial Black',Arial,Helvetica,sans-serif" font-weight="900" font-size="${fs}" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.2" letter-spacing="${r.length > 1 ? -3 : 0}">${r}</text>${pip(su, 32, 86, 30)}`;
}
function faceBody(card: string) {
  const r = card[0], su = card[1];
  if (r === 'A') {
    return `<circle cx="125" cy="168" r="78" fill="url(#glow)"/>${pip(su, 125, 165, 118)}
      <text x="125" y="276" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="17" letter-spacing="5" fill="url(#chrome)">SERVA</text>
      <rect x="104" y="286" width="42" height="2.5" rx="1.2" fill="#3fd0ff" opacity=".8"/>`;
  }
  if (LAYOUTS[r]) {
    const big = r === '2' || r === '3' ? 46 : r === '9' || r === 'T' ? 36 : 40;
    return LAYOUTS[r].map(([x, f]) => pip(su, x, TOP + f * SPAN, big, f > 0.5)).join('');
  }
  // court cards: emblem frame, chrome crown, crystal pip, monogram, «SERVA»
  return `<circle cx="125" cy="170" r="74" fill="url(#glow)"/>
    <rect x="66" y="66" width="118" height="208" rx="20" fill="none" stroke="#2fa8ff" stroke-opacity=".35" stroke-width="5"/>
    <rect x="66" y="66" width="118" height="208" rx="20" fill="none" stroke="#9fe9ff" stroke-width="1.3"/>
    <path d="${CROWN[r]}" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.2" stroke-linejoin="round"/>
    <g fill="url(#pip)" stroke="#d9ecff" stroke-width=".8">${GEMS[r]}</g>
    ${pip(su, 125, 196, 62)}
    <text x="125" y="258" text-anchor="middle" font-family="'Arial Black',Arial,Helvetica,sans-serif" font-weight="900" font-size="22" fill="url(#chrome)" opacity=".9">${r === 'K' ? 'KING' : r === 'Q' ? 'QUEEN' : 'JACK'}</text>
    <text x="125" y="300" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="12" letter-spacing="4" fill="url(#chrome)" opacity=".85">SERVA</text>`;
}
const FRAME = `<rect x="1" y="1" width="248" height="348" rx="20" fill="url(#bg)"/>
<rect x="9" y="9" width="232" height="332" rx="15" fill="none" stroke="#1d7dff" stroke-opacity=".35" stroke-width="12"/>
<rect x="9" y="9" width="232" height="332" rx="15" fill="none" stroke="#2f9bff" stroke-opacity=".75" stroke-width="5"/>
<rect x="9" y="9" width="232" height="332" rx="15" fill="none" stroke="#a8f0ff" stroke-width="1.8"/>`;

export function faceSVG(card: string) {
  const su = card[1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350">${DEFS(su)}${FRAME}${faceBody(card)}${corner(card)}<g transform="rotate(180 125 175)">${corner(card)}</g></svg>`;
}
export function backSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350">${DEFS('S')}${FRAME}
  <circle cx="125" cy="160" r="70" fill="url(#glow)"/>
  <ellipse cx="125" cy="160" rx="88" ry="28" fill="none" stroke="#3fd0ff" stroke-width="2" opacity=".7" transform="rotate(-18 125 160)"/>
  <circle cx="125" cy="160" r="46" fill="url(#pip)" opacity=".9"/>
  <text x="125" y="186" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="76" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.5">S</text>
  <text x="125" y="268" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="30" letter-spacing="3" fill="url(#chrome)">SERVA</text></svg>`;
}
// The joker («الجوكر», كونكان): same glass card, a crystal jester cap with chrome bells, «JOKER» down the corners.
export function jokerSVG() {
  const letters = (x: number) => 'JOKER'.split('').map((ch, i) => `<text x="${x}" y="${50 + i * 25}" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="22" fill="url(#chrome)" stroke="#0a1730" stroke-width="1">${ch}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350">${DEFS('H')}${FRAME}
  <circle cx="125" cy="168" r="86" fill="url(#glow)"/>
  <ellipse cx="125" cy="170" rx="92" ry="30" fill="none" stroke="#3fd0ff" stroke-width="1.6" opacity=".45" transform="rotate(-14 125 170)"/>
  <path d="M74 214C72 174 62 144 50 120C86 128 101 150 108 172C110 132 118 98 125 74C132 98 140 132 142 172C149 150 164 128 200 120C188 144 178 174 176 214Z" fill="url(#pip)" stroke="#d9ecff" stroke-width="2" stroke-linejoin="round"/>
  <path d="M74 214C72 174 62 144 50 120C86 128 101 150 108 172C110 132 118 98 125 74C132 98 140 132 142 172C149 150 164 128 200 120C188 144 178 174 176 214Z" fill="url(#gloss)"/>
  <circle cx="50" cy="120" r="10" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.2"/><circle cx="125" cy="72" r="11" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.2"/><circle cx="200" cy="120" r="10" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.2"/>
  <rect x="68" y="208" width="114" height="20" rx="7" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.2"/>
  ${pip('D', 96, 218, 13)}${pip('S', 125, 218, 13)}${pip('D', 154, 218, 13)}
  <text x="125" y="270" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="32" letter-spacing="4" fill="url(#chrome)" stroke="#0a1730" stroke-width="1.2">JOKER</text>
  <text x="125" y="300" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="12" letter-spacing="4" fill="url(#chrome)" opacity=".85">SERVA</text>
  ${letters(30)}<g transform="rotate(180 125 175)">${letters(30)}</g></svg>`;
}
export const isJokerCard = (c: string) => c === 'XX';

const svgUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const cache = new Map<string, string>();
const broken = new Set<string>();
/** URL of a face ('AS') or of the back ('back'). */
export function cardSrc(card: string) {
  let u = cache.get(card);
  if (u) return u;
  u = HAVE.has(card) && !broken.has(card) ? `/cards/${card}.webp` : svgUrl(card === 'back' ? backSVG() : isJokerCard(card) ? jokerSVG() : faceSVG(card));
  cache.set(card, u);
  return u;
}
/** Starts loading every image face once; a file that fails to decode falls back to the SVG. */
let preloaded = false;
export function preloadCards() {
  if (preloaded) return;
  preloaded = true;
  for (const name of HAVE) {
    const img = new Image();
    img.decoding = 'async';
    img.onerror = () => {
      broken.add(name); cache.delete(name);
      document.querySelectorAll<HTMLImageElement>(`img[data-card="${name}"]`).forEach((el) => { el.src = cardSrc(name); });
    };
    img.src = `/cards/${name}.webp`;
  }
}
/** <img> for a card face (or the back when `card` is '' / 'back'). */
export function cardImg(card: string, cls = '') {
  const name = card && card !== 'back' ? card : 'back';
  const alt = name === 'back' ? '' : isJokerCard(name) ? 'جوكر' : `${rankLabel(name)} ${SUIT_AR[name[1]]}`;
  return `<img class="ct-face ${cls}" src="${cardSrc(name)}" data-card="${name}" alt="${alt}" draggable="false">`;
}
/** Small inline suit symbol for text (status, panels). */
export function suitIcon(su: string, size = 18) {
  const [a, b] = TINT[su];
  return `<svg class="ct-suit" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="si${su}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path d="${SUIT_PATH[su]}" fill="url(#si${su})" stroke="#d9ecff" stroke-width="3"/></svg>`;
}
