'use strict';
// Hand-drawn SVG art for «ثروة»: tile icons, player pieces, buildings, decorations.
(() => {
  const svg = (inner, vb = '0 0 48 48', cls = '') => `<svg class="${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

  function starPts(cx, cy, r, inner = 0.42, rot = -90) {
    const out = [];
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * inner : r, a = ((rot + k * 36) * Math.PI) / 180;
      out.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2));
    }
    return out.join(' ');
  }

  // ---------------------------------------------------------------- tile icons (48x48)
  const ICONS = {
    start: `<defs><linearGradient id="artGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset="1" stop-color="#e0a526"/></linearGradient></defs>
      <path d="M45 17 H22 V7 L3 24 L22 41 V31 H45 Z" fill="url(#artGold)" stroke="#7a4f00" stroke-width="2" stroke-linejoin="round"/>
      <path d="M41 21 H19 V15" fill="none" stroke="#fff6d6" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
    jail: `<rect x="5" y="5" width="38" height="38" rx="7" fill="#33475e" stroke="#16212d" stroke-width="2"/>
      <rect x="10" y="10" width="28" height="28" rx="4" fill="#f2b04a"/>
      <circle cx="24" cy="22" r="6" fill="#ffd9a8"/><path d="M21 21.5h1.6M25.4 21.5H27M21.5 25.2q2.5 1.6 5 0" stroke="#5b3a12" stroke-width="1.3" stroke-linecap="round" fill="none"/>
      <path d="M14 38 Q24 27 34 38 Z" fill="#ff7a2f"/><path d="M17 34h14M15.5 36.5h17" stroke="#fff" stroke-width="1.2" opacity=".7"/>
      <g stroke="#dfe7f0" stroke-width="2.8" stroke-linecap="round"><path d="M15 8V40M21 8V40M27 8V40M33 8V40"/></g>`,
    vacation: `<circle cx="37" cy="11" r="6.5" fill="#ffd34d"/><g stroke="#ffd34d" stroke-width="1.8" stroke-linecap="round"><path d="M37 1.5v2M46.5 11h-2M43.7 4.3l-1.4 1.4"/></g>
      <path d="M2 40 Q24 31 46 40 V46 H2 Z" fill="#f2d49b"/><path d="M2 43 Q12 40 22 43" stroke="#e2bb72" stroke-width="1.5" fill="none"/>
      <path d="M23.5 19 L20.5 41" stroke="#7a5230" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M5 21 Q23 -1 41 21 Q35 17 29 21 Q23 16 17 21 Q11 17 5 21 Z" fill="#f0585e"/>
      <path d="M23 6 Q19 13 17 21 Q23 16 29 21 Q27 13 23 6 Z" fill="#fff"/>`,
    gotojail: `<rect x="9" y="35" width="30" height="8" rx="2.5" fill="#2a3a4d"/>
      <path d="M12 35 V25 Q12 13 24 13 Q36 13 36 25 V35 Z" fill="#e3474e"/>
      <path d="M16.5 25 Q16.5 17.5 24 17.5" stroke="#fff" stroke-opacity=".75" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <g stroke="#ffd34d" stroke-width="2.8" stroke-linecap="round"><path d="M24 3.5V8M7 11L10.5 14.5M41 11L37.5 14.5M3 26H7.5M45 26H40.5"/></g>`,
    port: `<path d="M3 46 Q8.5 43 14 46 T25 46 T36 46 T47 46" stroke="#4fb7ea" stroke-width="2.2" fill="none"/>
      <path d="M3 28 H45 L38.5 41 H9.5 Z" fill="#3a6fd8" stroke="#1d3f8a" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M8 32 H40" stroke="#fff" stroke-width="1.6" opacity=".6"/>
      <rect x="11" y="17" width="22" height="11" rx="2" fill="#e9eff6"/>
      <g fill="#4fb7ea"><rect x="14" y="20" width="3.4" height="3.4" rx=".6"/><rect x="20.3" y="20" width="3.4" height="3.4" rx=".6"/><rect x="26.6" y="20" width="3.4" height="3.4" rx=".6"/></g>
      <rect x="25.5" y="7" width="5.5" height="10" fill="#f0585e"/><rect x="25.5" y="7" width="5.5" height="2.8" fill="#1b2633"/>
      <path d="M34 6 q3 -3 6 -1" stroke="#9fb3c8" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`,
    power: `<circle cx="24" cy="24" r="20" fill="#3a3214"/><circle cx="24" cy="24" r="20" fill="none" stroke="#ffd34d" stroke-opacity=".35" stroke-width="2"/>
      <path d="M27.5 4 L11 27.5 H22.5 L19 44 L37.5 19 H26 Z" fill="#ffd34d" stroke="#b8860b" stroke-width="1.6" stroke-linejoin="round"/>`,
    net: `<circle cx="24" cy="24" r="21" fill="#10343a"/>
      <g fill="none" stroke="#38d4c0" stroke-width="4" stroke-linecap="round"><path d="M8 20 Q24 5 40 20"/><path d="M13.5 26.5 Q24 17 34.5 26.5"/><path d="M19 33 Q24 28.5 29 33"/></g>
      <circle cx="24" cy="38.5" r="3.6" fill="#38d4c0"/>`,
    taxIncome: `<path d="M17.5 6.5 H30.5 L27.3 13.5 H20.7 Z" fill="#c9962b" stroke="#8a6200" stroke-width="1.2"/>
      <path d="M20.7 13.5 Q6 22 7.5 33 Q9 44 24 44 Q39 44 40.5 33 Q42 22 27.3 13.5 Z" fill="#e9b949" stroke="#a5781a" stroke-width="1.6"/>
      <path d="M13 26 Q14 21 18 18.5" stroke="#fff3c4" stroke-width="2" fill="none" stroke-linecap="round"/>
      <text x="24" y="38" text-anchor="middle" font-size="17" font-weight="900" fill="#6b4a00" font-family="Arial, sans-serif">$</text>`,
    taxLuxury: `<path d="M12 7 H36 L45 18 L24 43 L3 18 Z" fill="#8fe0ff" stroke="#2a8fc0" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M3 18 H45 M12 7 L18 18 L24 7 L30 18 L36 7 M18 18 L24 43 L30 18" fill="none" stroke="#2a8fc0" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M8 18 L14 9" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>`,
    chance: `<g transform="rotate(-9 24 24)"><rect x="10" y="4" width="28" height="40" rx="5" fill="#ff8a3d" stroke="#c45a12" stroke-width="2"/>
      <rect x="13.5" y="7.5" width="21" height="33" rx="3" fill="none" stroke="#ffd2b0" stroke-width="1.2" stroke-dasharray="2 2"/>
      <text x="24" y="33" text-anchor="middle" font-size="24" font-weight="900" fill="#fff" font-family="Arial, sans-serif">?</text></g>`,
    chest: `<path d="M6 20 Q6 8 24 8 Q42 8 42 20 Z" fill="#a0612b" stroke="#5e3612" stroke-width="1.6"/>
      <rect x="6" y="20" width="36" height="21" rx="2.5" fill="#b8722f" stroke="#5e3612" stroke-width="1.6"/>
      <path d="M6 20 H42" stroke="#ffd34d" stroke-width="3.2"/>
      <path d="M13.5 9 V41 M34.5 9 V41" stroke="#ffd34d" stroke-width="2.6"/>
      <rect x="20.5" y="16.5" width="7" height="10" rx="1.8" fill="#ffd34d" stroke="#8a6200" stroke-width="1"/>
      <circle cx="24" cy="21" r="1.3" fill="#5e3612"/>
      <path d="M9 16 Q12 11 18 10" stroke="#d99a5a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    coin: `<circle cx="24" cy="24" r="19" fill="#f5c04a" stroke="#b07d10" stroke-width="2.5"/><circle cx="24" cy="24" r="13.5" fill="none" stroke="#fff3c4" stroke-width="1.6" opacity=".8"/>
      <text x="24" y="31" text-anchor="middle" font-size="20" font-weight="900" fill="#8a5c00" font-family="Arial, sans-serif">$</text>`,
    gavel: `<rect x="6" y="38" width="22" height="6" rx="2" fill="#7a4f2a"/>
      <g transform="rotate(-40 26 20)"><rect x="14" y="13" width="22" height="11" rx="3" fill="#b8722f" stroke="#5e3612" stroke-width="1.5"/><rect x="23" y="24" width="4" height="22" rx="2" fill="#8a5a2e"/></g>`,
    trophy: `<path d="M14 6 H34 V18 Q34 30 24 31 Q14 30 14 18 Z" fill="#f5c04a" stroke="#a5781a" stroke-width="1.6"/>
      <path d="M14 10 H7 Q7 21 15 22 M34 10 H41 Q41 21 33 22" fill="none" stroke="#f5c04a" stroke-width="3"/>
      <rect x="21" y="31" width="6" height="6" fill="#d99a1e"/><rect x="14" y="37" width="20" height="6" rx="1.5" fill="#7a4f2a"/>
      <path d="M19 10 Q19 20 23 24" stroke="#fff3c4" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`,
  };

  // ---------------------------------------------------------------- player pieces (24x24, white)
  const W = '#fff', SH = 'rgba(0,0,0,.32)';
  const PIECES = {
    car: { label: 'سيارة', art: `<path d="M4.5 11.5 L6.4 7.6 Q7 6.5 8.3 6.5 H15.7 Q17 6.5 17.6 7.6 L19.5 11.5 H20 Q21.5 11.5 21.5 13 V16 Q21.5 17 20.5 17 H3.5 Q2.5 17 2.5 16 V13 Q2.5 11.5 4 11.5 Z" fill="${W}"/>
      <path d="M7.4 11.2 L8.5 8.3 H11.3 V11.2 Z M12.7 11.2 V8.3 H15.5 L16.6 11.2 Z" fill="${SH}"/>
      <circle cx="7" cy="17" r="2.4" fill="#1b2633" stroke="${W}" stroke-width="1.3"/><circle cx="17" cy="17" r="2.4" fill="#1b2633" stroke="${W}" stroke-width="1.3"/>` },
    plane: { label: 'طيارة', art: `<path d="M12 1.8 C13.1 1.8 13.6 2.9 13.6 4.2 V9.2 L21.5 13.4 V15.6 L13.6 13.1 V18.2 L16.2 20.2 V21.8 L12 20.7 L7.8 21.8 V20.2 L10.4 18.2 V13.1 L2.5 15.6 V13.4 L10.4 9.2 V4.2 C10.4 2.9 10.9 1.8 12 1.8 Z" fill="${W}"/>` },
    ship: { label: 'سفينة', art: `<path d="M2.5 13.5 H21.5 L18.7 19.5 H5.3 Z" fill="${W}"/><rect x="6.3" y="8.3" width="10.4" height="5.2" rx="0.9" fill="${W}"/>
      <rect x="12.6" y="3.6" width="2.8" height="4.7" fill="${W}"/><path d="M8.4 10.6h1.5M11.2 10.6h1.5M14 10.6h1.5" stroke="${SH}" stroke-width="1.5"/>` },
    crown: { label: 'تاج', art: `<path d="M3 7.5 L7.5 11.5 L12 4.5 L16.5 11.5 L21 7.5 L19 16.8 H5 Z" fill="${W}"/><rect x="5" y="17.6" width="14" height="2.6" rx="0.9" fill="${W}"/>
      <circle cx="3" cy="7.2" r="1.4" fill="${W}"/><circle cx="12" cy="4.2" r="1.4" fill="${W}"/><circle cx="21" cy="7.2" r="1.4" fill="${W}"/><circle cx="12" cy="13" r="1.3" fill="${SH}"/>` },
    rocket: { label: 'صاروخ', art: `<path d="M12 2 C15.2 4.6 16.4 8.2 16.4 12 V15.5 H7.6 V12 C7.6 8.2 8.8 4.6 12 2 Z" fill="${W}"/>
      <path d="M7.6 11.5 L4.4 15 V18.2 L7.6 16.6 Z M16.4 11.5 L19.6 15 V18.2 L16.4 16.6 Z" fill="${W}"/><circle cx="12" cy="9" r="2" fill="${SH}"/>
      <path d="M9.4 16.4 Q12 23 14.6 16.4 Z" fill="#ffd34d"/>` },
    diamond: { label: 'ألماسة', art: `<path d="M6.5 4 H17.5 L21.5 9 L12 20.5 L2.5 9 Z" fill="${W}"/>
      <path d="M2.5 9 H21.5 M6.5 4 L9.3 9 L12 4 L14.7 9 L17.5 4 M9.3 9 L12 20.5 L14.7 9" fill="none" stroke="${SH}" stroke-width="0.9"/>` },
    star: { label: 'نجمة', art: `<polygon points="${starPts(12, 12.6, 10, 0.45)}" fill="${W}"/>` },
    hat: { label: 'قبعة', art: `<rect x="7" y="3.8" width="10" height="12.4" rx="1.2" fill="${W}"/><rect x="7" y="12" width="10" height="2.4" fill="${SH}"/>
      <ellipse cx="12" cy="17.6" rx="9.2" ry="2.7" fill="${W}"/>` },
  };
  const PIECE_KEYS = Object.keys(PIECES);

  // ---------------------------------------------------------------- buildings & decorations
  const HOUSE = svg('<path d="M1 5.2 L5 1.2 L9 5.2 V9.2 H1 Z" fill="#3ecf8e" stroke="#0b3d24" stroke-width=".9" stroke-linejoin="round"/><rect x="4" y="6" width="2" height="3.2" fill="#0b3d24" opacity=".55"/>', '0 0 10 10', 'house');
  const HOTEL = svg('<rect x="1" y="1.5" width="16" height="8.2" rx="1.2" fill="#f0585e" stroke="#5c0f12" stroke-width=".9"/><g fill="#ffe1e2"><rect x="3" y="3.4" width="2" height="1.8"/><rect x="6.3" y="3.4" width="2" height="1.8"/><rect x="9.7" y="3.4" width="2" height="1.8"/><rect x="13" y="3.4" width="2" height="1.8"/></g><rect x="7.6" y="6.4" width="2.8" height="3.3" fill="#5c0f12"/>', '0 0 18 11', 'hotel');

  // Small banknote for the rent «cash flying» animation.
  const BILL = svg('<rect x="1" y="3" width="30" height="16" rx="2.5" fill="#3ecf8e" stroke="#0b5d36" stroke-width="1.4"/><rect x="4" y="6" width="24" height="10" rx="1.5" fill="none" stroke="#c9ffe2" stroke-width=".9" opacity=".8"/><circle cx="16" cy="11" r="4.2" fill="#0b5d36" opacity=".85"/><text x="16" y="13.6" text-anchor="middle" font-size="7" font-weight="900" fill="#c9ffe2" font-family="Arial">$</text>', '0 0 32 22', 'bill');

  // Wireframe globe used as a watermark behind the board centre.
  const GLOBE = svg(`<g fill="none" stroke="currentColor" stroke-width="1.2">
      <circle cx="100" cy="100" r="92"/>
      <ellipse cx="100" cy="100" rx="30" ry="92"/><ellipse cx="100" cy="100" rx="62" ry="92"/><path d="M100 8V192"/>
      <ellipse cx="100" cy="100" rx="92" ry="30"/><path d="M8 100H192"/><path d="M22 52 H178 M22 148 H178" />
    </g>`, '0 0 200 200', 'globe');

  // ---------------------------------------------------------------- profile avatars (48x48, 12 drawings x 2 palettes)
  // Palettes use the Serva colours: navy/cyan and navy/gold.
  const PAL = [
    { bg: '#0b2150', ring: '#00b4ff', a: '#2fe2ff', b: '#ffc53d', skin: '#f6c9a0', dark: '#06122e' },
    { bg: '#1a1033', ring: '#ffc53d', a: '#ffc53d', b: '#2fe2ff', skin: '#d9a273', dark: '#120a24' },
  ];
  const AV_DRAW = [
    // 1 person, short hair
    (c) => `<circle cx="24" cy="20" r="8.5" fill="${c.skin}"/><path d="M15.5 18 Q16 9.5 24 9.5 Q32 9.5 32.5 18 Q29 13.5 24 14 Q19 13.5 15.5 18Z" fill="${c.dark}"/>
      <path d="M9 44 Q10 31 24 31 Q38 31 39 44Z" fill="${c.a}"/><circle cx="21" cy="20.5" r="1.1" fill="${c.dark}"/><circle cx="27" cy="20.5" r="1.1" fill="${c.dark}"/><path d="M21.5 24.2 Q24 25.8 26.5 24.2" stroke="${c.dark}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
    // 2 person, hijab
    (c) => `<path d="M12 44 Q12 30 24 29 Q36 30 36 44Z" fill="${c.b}"/><path d="M14.5 26 Q13 8 24 8 Q35 8 33.5 26 Q31 33 24 33 Q17 33 14.5 26Z" fill="${c.a}"/>
      <ellipse cx="24" cy="20.5" rx="6.6" ry="7.6" fill="${c.skin}"/><circle cx="21.4" cy="20" r="1" fill="${c.dark}"/><circle cx="26.6" cy="20" r="1" fill="${c.dark}"/><path d="M22 23.6 Q24 25 26 23.6" stroke="${c.dark}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
    // 3 person, beard + shmagh
    (c) => `<path d="M9 44 Q10 31 24 31 Q38 31 39 44Z" fill="${c.dark}" stroke="${c.a}" stroke-width="1.2"/><circle cx="24" cy="20" r="8.5" fill="${c.skin}"/>
      <path d="M15.5 21 Q16 30 24 30 Q32 30 32.5 21 Q29 26 24 25.5 Q19 26 15.5 21Z" fill="#3a2a1c"/><path d="M13 19 Q13 7 24 7 Q35 7 35 19 L33 16 Q24 11 15 16Z" fill="#fff"/>
      <path d="M13 19 Q14 12 24 12 Q34 12 35 19" stroke="${c.b}" stroke-width="1.6" fill="none"/><circle cx="21" cy="19.5" r="1.1" fill="${c.dark}"/><circle cx="27" cy="19.5" r="1.1" fill="${c.dark}"/>`,
    // 4 cat
    (c) => `<path d="M12 22 L13 8 L21 15 Q24 14 27 15 L35 8 L36 22 Q36 37 24 37 Q12 37 12 22Z" fill="${c.a}"/><path d="M15 12 L16 17 L19 15Z M33 12 L32 17 L29 15Z" fill="${c.b}"/>
      <ellipse cx="19.5" cy="23" rx="2" ry="2.6" fill="${c.dark}"/><ellipse cx="28.5" cy="23" rx="2" ry="2.6" fill="${c.dark}"/><path d="M22.5 28 L25.5 28 L24 29.6Z" fill="#ff7a8a"/>
      <path d="M24 29.6 Q22 31.5 20.5 30.5 M24 29.6 Q26 31.5 27.5 30.5 M9 27 L17 27.5 M9 30.5 L17 29.5 M39 27 L31 27.5 M39 30.5 L31 29.5" stroke="${c.dark}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
    // 5 fox
    (c) => `<path d="M10 14 L18 18 L24 16 L30 18 L38 14 L35 28 Q30 38 24 39 Q18 38 13 28Z" fill="#ff8a3d"/><path d="M15 27 Q19 31 24 39 Q29 31 33 27 Q29 30 24 30 Q19 30 15 27Z" fill="#fff4e6"/>
      <path d="M10 14 L17 18 L14 23Z M38 14 L31 18 L34 23Z" fill="${c.dark}" opacity=".5"/><circle cx="19.5" cy="24" r="1.6" fill="${c.dark}"/><circle cx="28.5" cy="24" r="1.6" fill="${c.dark}"/><circle cx="24" cy="35.5" r="1.8" fill="${c.dark}"/>`,
    // 6 owl
    (c) => `<path d="M12 16 L16 9 L20 14 Q24 12 28 14 L32 9 L36 16 Q38 40 24 40 Q10 40 12 16Z" fill="#8a6a4a"/><path d="M17 31 Q24 27 31 31 Q31 38 24 38 Q17 38 17 31Z" fill="#d9c09a"/>
      <circle cx="19" cy="21" r="5" fill="#fff"/><circle cx="29" cy="21" r="5" fill="#fff"/><circle cx="19" cy="21" r="2.6" fill="${c.dark}"/><circle cx="29" cy="21" r="2.6" fill="${c.dark}"/>
      <circle cx="19.8" cy="20.2" r=".8" fill="#fff"/><circle cx="29.8" cy="20.2" r=".8" fill="#fff"/><path d="M22.5 25 L25.5 25 L24 28Z" fill="${c.b}"/>`,
    // 7 bear
    (c) => `<circle cx="14" cy="13" r="5" fill="#a0673a"/><circle cx="34" cy="13" r="5" fill="#a0673a"/><circle cx="14" cy="13" r="2.4" fill="#e3b081"/><circle cx="34" cy="13" r="2.4" fill="#e3b081"/>
      <circle cx="24" cy="24" r="13" fill="#a0673a"/><ellipse cx="24" cy="29" rx="6" ry="4.6" fill="#e3b081"/><ellipse cx="24" cy="27" rx="2.2" ry="1.6" fill="${c.dark}"/>
      <circle cx="19" cy="21.5" r="1.5" fill="${c.dark}"/><circle cx="29" cy="21.5" r="1.5" fill="${c.dark}"/><path d="M22 30.5 Q24 32 26 30.5" stroke="${c.dark}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
    // 8 falcon
    (c) => `<path d="M14 40 Q10 24 18 14 Q24 8 31 12 Q36 15 35 22 L40 25 L34 26 Q34 36 26 40Z" fill="#7b5a3c"/><path d="M18 30 Q24 24 30 30 Q29 38 24 39 Q19 38 18 30Z" fill="#efe2c8"/>
      <circle cx="28" cy="18" r="3.2" fill="#ffd34d"/><circle cx="28.4" cy="18" r="1.6" fill="${c.dark}"/><path d="M35 22 L40 25 L34 26Z" fill="${c.b}"/><path d="M20 18 Q24 21 26 24" stroke="${c.dark}" stroke-width="1.4" fill="none" opacity=".6"/>`,
    // 9 rocket
    (c) => `<path d="M24 6 Q33 13 32 28 L16 28 Q15 13 24 6Z" fill="#eef5ff"/><circle cx="24" cy="18" r="4" fill="${c.a}" stroke="${c.dark}" stroke-width="1.4"/>
      <path d="M16 22 L10 31 L16 30Z M32 22 L38 31 L32 30Z" fill="${c.b}"/><path d="M18 28 L30 28 L28 33 L20 33Z" fill="#9fb3cc"/><path d="M20 33 Q24 44 28 33Z" fill="#ff8a3d"/><path d="M22 33 Q24 39 26 33Z" fill="#ffd34d"/>`,
    // 10 dice
    (c) => `<rect x="10" y="10" width="28" height="28" rx="6" fill="#fbfbfb" stroke="${c.a}" stroke-width="2"/><g fill="${c.dark}"><circle cx="17" cy="17" r="2.6"/><circle cx="31" cy="17" r="2.6"/><circle cx="24" cy="24" r="2.6"/><circle cx="17" cy="31" r="2.6"/><circle cx="31" cy="31" r="2.6"/></g>`,
    // 11 palm tree
    (c) => `<path d="M6 41 Q24 34 42 41 V44 H6Z" fill="#f2d49b"/><path d="M24.5 19 Q26 30 23 41" stroke="#8a5a30" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M24 19 Q14 11 6 17 Q15 15 24 19Z M24 19 Q34 10 42 16 Q33 14 24 19Z M24 19 Q19 8 11 8 Q19 11 24 19Z M24 19 Q30 7 38 8 Q30 11 24 19Z" fill="#3ecf8e"/><circle cx="23" cy="21" r="2" fill="#7a4f20"/><circle cx="26.5" cy="21.5" r="2" fill="#7a4f20"/>`,
    // 12 lantern (fanoos) with crescent
    (c) => `<path d="M24 5 V9" stroke="${c.b}" stroke-width="2" stroke-linecap="round"/><path d="M18 12 L30 12 L33 17 L15 17Z" fill="${c.b}"/><path d="M16 17 L32 17 L30 34 L18 34Z" fill="${c.a}" opacity=".35" stroke="${c.b}" stroke-width="1.6"/>
      <path d="M24 19 Q27 25 24 31 Q21 25 24 19Z" fill="#ffd34d"/><path d="M17 34 L31 34 L28 39 L20 39Z" fill="${c.b}"/><path d="M38 9 A6 6 0 1 0 41 19 A4.6 4.6 0 1 1 38 9Z" fill="#ffd34d"/>`,
  ];
  const AVATAR_KEYS = Array.from({ length: 24 }, (_, i) => 'a' + (i + 1));
  function avatar(key) {
    const n = Number(String(key || '').slice(1)) || 1, k = (n - 1) % 12, c = PAL[Math.floor((n - 1) / 12) % 2];
    return svg(`<circle cx="24" cy="24" r="23" fill="${c.bg}"/><g clip-path="circle(23px at 24px 24px)">${AV_DRAW[k](c)}</g><circle cx="24" cy="24" r="22.5" fill="none" stroke="${c.ring}" stroke-width="1.6" opacity=".9"/>`, '0 0 48 48', 'avatar-svg');
  }

  window.ART = {
    icon: (name) => svg(ICONS[name] || ICONS.coin),
    piece: (key) => svg((PIECES[key] || PIECES.star).art, '0 0 24 24', 'piece-svg'),
    pieceLabel: (key) => (PIECES[key] || PIECES.star).label,
    PIECE_KEYS, HOUSE, HOTEL, GLOBE, BILL, avatar, AVATAR_KEYS,
  };
})();
