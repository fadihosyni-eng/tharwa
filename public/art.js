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
    // Polished tile icons (flat gradients + soft isometric depth, one shared style).
    start: `<defs><linearGradient id="tiStart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#f0a91c"/></linearGradient></defs>
      <ellipse cx="24" cy="42" rx="17" ry="3.2" fill="#000" opacity=".28"/>
      <path d="M44 16 H24 V7 L4 22 L24 37 V28 H44 Z" fill="#9a6a08"/>
      <path d="M44 13 H24 V4 L4 19 L24 34 V25 H44 Z" fill="url(#tiStart)" stroke="#7a5200" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M40 16.5 H21.5 V10.5" fill="none" stroke="#fff6d8" stroke-width="2" stroke-linecap="round" opacity=".75"/>`,
    jail: `<defs><linearGradient id="tiJailL" x1="0" x2="1"><stop offset="0" stop-color="#3a4f6b"/><stop offset="1" stop-color="#2a3a52"/></linearGradient></defs>
      <ellipse cx="24" cy="43" rx="17" ry="3" fill="#000" opacity=".3"/>
      <path d="M6 14 L24 6 L42 14 L24 22 Z" fill="#5d7593"/>
      <path d="M6 14 L24 22 V42 L6 34 Z" fill="url(#tiJailL)"/><path d="M24 22 L42 14 V34 L24 42 Z" fill="#1d2a3c"/>
      <g stroke="#cfe0f2" stroke-width="2.2" stroke-linecap="round"><path d="M10.5 18 V34.5 M15 20 V36.5 M19.5 22 V38.5"/></g>
      <g stroke="#8fa6bf" stroke-width="2.2" stroke-linecap="round"><path d="M28.5 22 V38.5 M33 20 V36.5 M37.5 18 V34.5"/></g>
      <circle cx="24" cy="13.5" r="3" fill="#ffc53d"/>`,
    vacation: `<defs><linearGradient id="tiSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fd8ff"/><stop offset="1" stop-color="#0a7fc4"/></linearGradient></defs>
      <circle cx="35" cy="11" r="6" fill="#ffd34d"/><circle cx="35" cy="11" r="9" fill="#ffd34d" opacity=".18"/>
      <path d="M2 34 Q24 27 46 34 V46 H2 Z" fill="url(#tiSea)"/><path d="M2 39 Q24 33 46 39 V46 H2 Z" fill="#f2d49b"/>
      <path d="M21.5 18 L19 41" stroke="#f3f7fb" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M5 19 Q21 2 38 18 Q32 14.5 26.5 18.5 Q21.5 13.5 16 18.5 Q10.5 14.5 5 19 Z" fill="#ff5d73"/>
      <path d="M21.4 5.5 Q17.5 12 16 18.5 Q21.5 13.5 26.5 18.5 Q25.5 11.5 21.4 5.5 Z" fill="#fff"/>`,
    gotojail: `<defs><linearGradient id="tiBadge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa8ff"/><stop offset="1" stop-color="#1a4fb8"/></linearGradient></defs>
      <ellipse cx="24" cy="43" rx="14" ry="3" fill="#000" opacity=".3"/>
      <path d="M24 4 L40 10 V22 Q40 34 24 41 Q8 34 8 22 V10 Z" fill="url(#tiBadge)" stroke="#0d2a66" stroke-width="1.6"/>
      <path d="M24 9 L35 13.2 V22 Q35 30.5 24 36 Q13 30.5 13 22 V13.2 Z" fill="none" stroke="#bfe0ff" stroke-width="1.3" opacity=".8"/>
      <polygon points="${starPts(24, 22, 8, 0.45)}" fill="#ffc53d" stroke="#8a5a00" stroke-width=".9"/>`,
    port: `<defs><linearGradient id="tiPort" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1fb6ff"/><stop offset="1" stop-color="#075a9c"/></linearGradient></defs>
      <circle cx="24" cy="24" r="20" fill="url(#tiPort)"/><circle cx="24" cy="24" r="20" fill="none" stroke="#bfeaff" stroke-opacity=".5" stroke-width="1.5"/>
      <g fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="24" cy="12.5" r="3.2"/><path d="M24 15.7 V36"/><path d="M17 20 H31"/><path d="M12 28 Q14 36 24 36 Q34 36 36 28"/><path d="M12 28 L10 31 M12 28 L15 29.5 M36 28 L38 31 M36 28 L33 29.5"/></g>`,
    power: `<defs><linearGradient id="tiBolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset="1" stop-color="#ffb800"/></linearGradient></defs>
      <circle cx="24" cy="24" r="20" fill="#2a2410"/><circle cx="24" cy="24" r="20" fill="none" stroke="#ffd34d" stroke-opacity=".45" stroke-width="1.6"/>
      <path d="M27 5 L12 27 H22 L19 43 L36 19 H26 Z" fill="url(#tiBolt)" stroke="#8a5a00" stroke-width="1.3" stroke-linejoin="round"/>`,
    net: `<defs><linearGradient id="tiNet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fe2ff"/><stop offset="1" stop-color="#0a8db8"/></linearGradient></defs>
      <circle cx="24" cy="24" r="20" fill="#0b2b33"/><circle cx="24" cy="24" r="20" fill="none" stroke="#2fe2ff" stroke-opacity=".4" stroke-width="1.6"/>
      <g fill="none" stroke="url(#tiNet)" stroke-width="3.4" stroke-linecap="round"><path d="M9 21 Q24 7 39 21"/><path d="M14 27 Q24 18 34 27"/><path d="M19 33 Q24 29 29 33"/></g>
      <circle cx="24" cy="37.5" r="3" fill="#2fe2ff"/>`,
    taxIncome: `<defs><linearGradient id="tiCoin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset="1" stop-color="#d99a1c"/></linearGradient></defs>
      <ellipse cx="24" cy="43" rx="15" ry="3" fill="#000" opacity=".28"/>
      <g stroke="#8a5a00" stroke-width="1.2"><ellipse cx="24" cy="36" rx="13" ry="4.5" fill="#c98b16"/><rect x="11" y="30" width="26" height="6" fill="#c98b16" stroke="none"/><ellipse cx="24" cy="30" rx="13" ry="4.5" fill="url(#tiCoin)"/>
        <ellipse cx="24" cy="24" rx="13" ry="4.5" fill="#c98b16"/><rect x="11" y="18" width="26" height="6" fill="#c98b16" stroke="none"/><ellipse cx="24" cy="18" rx="13" ry="4.5" fill="url(#tiCoin)"/></g>
      <rect x="26" y="4" width="16" height="20" rx="2" fill="#f3f7fb" stroke="#7f9bbd" stroke-width="1.2"/><path d="M29.5 9 H38.5 M29.5 13 H38.5 M29.5 17 H35" stroke="#7f9bbd" stroke-width="1.4" stroke-linecap="round"/>`,
    taxLuxury: `<defs><linearGradient id="tiGem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f6ff"/><stop offset=".5" stop-color="#5fd0ff"/><stop offset="1" stop-color="#1a6fc4"/></linearGradient></defs>
      <ellipse cx="24" cy="44" rx="13" ry="2.6" fill="#000" opacity=".28"/>
      <path d="M12 8 H36 L45 19 L24 42 L3 19 Z" fill="url(#tiGem)" stroke="#0d4f94" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M3 19 H45 M12 8 L18 19 L24 8 L30 19 L36 8 M18 19 L24 42 L30 19" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.2" stroke-linejoin="round"/>`,
    chance: `<defs><linearGradient id="tiCard" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="1" stop-color="#ff6a2b"/></linearGradient></defs>
      <ellipse cx="24" cy="44" rx="13" ry="2.6" fill="#000" opacity=".28"/>
      <rect x="13" y="6" width="26" height="36" rx="5" fill="#8a3a0c" transform="rotate(8 26 24)"/>
      <g transform="rotate(-6 24 24)"><rect x="10" y="5" width="26" height="36" rx="5" fill="url(#tiCard)" stroke="#a8430e" stroke-width="1.5"/>
        <rect x="13.5" y="8.5" width="19" height="29" rx="3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>
        <text x="23" y="31" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" font-family="Tajawal, Arial">؟</text></g>`,
    chest: `<defs><linearGradient id="tiChest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c47a35"/><stop offset="1" stop-color="#7a4318"/></linearGradient></defs>
      <ellipse cx="24" cy="43" rx="18" ry="3" fill="#000" opacity=".3"/>
      <path d="M6 22 L24 15 L42 22 L24 29 Z" fill="#e0a356"/>
      <path d="M6 22 L24 29 V41 L6 34 Z" fill="url(#tiChest)"/><path d="M24 29 L42 22 V34 L24 41 Z" fill="#5e3210"/>
      <path d="M6 22 Q6 9 24 6 Q42 9 42 22 L24 15 Z" fill="#b5692a"/><path d="M6 22 Q6 9 24 6" fill="none" stroke="#ffc53d" stroke-width="2"/>
      <path d="M15 18.5 V36.5 M33 18.5 V36.5" stroke="#ffc53d" stroke-width="2.2" opacity=".9"/>
      <rect x="21.5" y="27" width="5" height="6" rx="1" fill="#ffc53d" stroke="#7a4f00" stroke-width=".8"/>`,
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

  // ---------------------------------------------------------------- UI icon set (24x24, 1.75 rounded strokes, currentColor)
  // One style for every interface icon. Subtle fills use currentColor at low opacity so icons theme with their text.
  const F = 'fill="currentColor" fill-opacity=".16"';
  const UI = {
    dice: `<rect x="3.5" y="3.5" width="17" height="17" rx="4" ${F}/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/>`,
    gavel: `<path d="M13.5 3.5 L20.5 10.5 M10.5 6.5 L17.5 13.5" /><path d="M12 5 L19 12 L16.5 14.5 L9.5 7.5 Z" ${F}/><path d="M12.5 11 L4 19.5"/><path d="M3 21 H12"/>`,
    check: `<circle cx="12" cy="12" r="9" ${F}/><path d="M7.5 12.5 L10.5 15.5 L16.5 9"/>`,
    xmark: `<circle cx="12" cy="12" r="9" ${F}/><path d="M8.5 8.5 L15.5 15.5 M15.5 8.5 L8.5 15.5"/>`,
    handshake: `<path d="M2.5 11 L6 7.5 L9.5 8.5 L12 7 L15 7.5 L21.5 12" /><path d="M6 7.5 L2.5 11 L8 16.5 Q9.2 17.7 10.4 16.5 L11 16 Q12.2 17.2 13.4 16 L14 15.4 Q15.2 16.6 16.4 15.4 L17 14.8 Q18.2 16 19.4 14.8 L21.5 12" ${F}/><path d="M12 7 L8.8 10.2 Q8 11 8.8 11.8 Q9.6 12.6 10.4 11.8 L12.5 9.8"/>`,
    moneybag: `<path d="M9 3.5 H15 L13.5 7 H10.5 Z" ${F}/><path d="M10.5 7 Q4 11 4.5 16 Q5 20.5 12 20.5 Q19 20.5 19.5 16 Q20 11 13.5 7"  ${F}/><path d="M12 10.5 V17.5 M14 12 Q12.8 11 11.3 11.5 Q10 12.2 11 13.4 Q12.3 14.3 13.3 15 Q14 16.2 12.6 16.8 Q11 17.2 9.9 16"/>`,
    cash: `<rect x="2.5" y="6" width="19" height="12" rx="2.5" ${F}/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5 V14.5 M18 9.5 V14.5"/>`,
    house: `<path d="M3.5 11 L12 4 L20.5 11"/><path d="M5.5 9.5 V20 H18.5 V9.5" ${F}/><path d="M10 20 V14.5 H14 V20"/>`,
    hotel: `<rect x="5" y="3.5" width="14" height="17" rx="1.5" ${F}/><path d="M9 7.5 H10 M14 7.5 H15 M9 11 H10 M14 11 H15 M9 14.5 H10 M14 14.5 H15"/><path d="M10.5 20.5 V17.5 H13.5 V20.5"/>`,
    sound: `<path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z" ${F}/><path d="M15.5 9 Q17.5 12 15.5 15 M18 6.5 Q22 12 18 17.5"/>`,
    mute: `<path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z" ${F}/><path d="M16 9.5 L21 14.5 M21 9.5 L16 14.5"/>`,
    chat: `<path d="M4 5.5 H20 V16 H11 L6.5 19.5 V16 H4 Z" ${F}/><path d="M8 9.5 H16 M8 12.5 H13"/>`,
    lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${F}/><path d="M8 10.5 V7.5 Q8 3.5 12 3.5 Q16 3.5 16 7.5 V10.5"/><path d="M12 14.5 V16.5"/>`,
    unlock: `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${F}/><path d="M8 10.5 V7.5 Q8 3.5 12 3.5 Q15.5 3.5 16 6.5"/><path d="M12 14.5 V16.5"/>`,
    bank: `<path d="M3 9 L12 4 L21 9 Z" ${F}/><path d="M3 9 H21 M5.5 9 V17 M10 9 V17 M14 9 V17 M18.5 9 V17 M3.5 17 H20.5 M2.5 20.5 H21.5"/>`,
    globe: `<circle cx="12" cy="12" r="8.5" ${F}/><path d="M3.5 12 H20.5 M12 3.5 Q7.5 12 12 20.5 Q16.5 12 12 3.5"/>`,
    map: `<path d="M3.5 6 L9 4 L15 6 L20.5 4 V18 L15 20 L9 18 L3.5 20 Z" ${F}/><path d="M9 4 V18 M15 6 V20"/>`,
    warn: `<path d="M12 3.5 L21.5 20 H2.5 Z" ${F}/><path d="M12 9.5 V14"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>`,
    gamepad: `<path d="M6.5 7.5 H17.5 Q21 7.5 21.5 12 L22 16.5 Q22 19 19.5 18.5 L16.5 15.5 H7.5 L4.5 18.5 Q2 19 2 16.5 L2.5 12 Q3 7.5 6.5 7.5 Z" ${F}/><path d="M7.5 10 V13.5 M5.8 11.8 H9.2"/><circle cx="16" cy="10.8" r=".9" fill="currentColor"/><circle cx="17.8" cy="13" r=".9" fill="currentColor"/>`,
    star: `<path d="M12 3.5 L14.6 8.9 L20.5 9.6 L16.1 13.6 L17.3 19.5 L12 16.5 L6.7 19.5 L7.9 13.6 L3.5 9.6 L9.4 8.9 Z" fill="currentColor" fill-opacity=".3"/>`,
    ticket: `<path d="M3.5 7 H20.5 V10 Q18.5 10 18.5 12 Q18.5 14 20.5 14 V17 H3.5 V14 Q5.5 14 5.5 12 Q5.5 10 3.5 10 Z" ${F}/><path d="M14 7.5 V9 M14 11.3 V12.7 M14 15 V16.5"/>`,
    skull: `<path d="M12 3.5 Q4.5 3.5 4.5 10.5 Q4.5 14 7 15.5 V19.5 H17 V15.5 Q19.5 14 19.5 10.5 Q19.5 3.5 12 3.5 Z" ${F}/><circle cx="9" cy="11" r="1.6" fill="currentColor"/><circle cx="15" cy="11" r="1.6" fill="currentColor"/><path d="M10.5 19.5 V17 M13.5 19.5 V17"/>`,
    crane: `<path d="M5 20.5 V4 L19.5 4 M5 7 L11 4 M5 4 L19.5 4 L15 8"/><path d="M15 4 V10.5"/><rect x="12.5" y="10.5" width="5" height="4" rx=".8" ${F}/><path d="M2.5 20.5 H10"/>`,
    timer: `<circle cx="12" cy="13" r="7.5" ${F}/><path d="M12 9.5 V13 L14.5 15 M10 2.5 H14 M12 2.5 V5.5"/>`,
    robot: `<rect x="5" y="8" width="14" height="11" rx="3" ${F}/><path d="M12 4.5 V8 M3 12.5 V15 M21 12.5 V15 M9.5 16 H14.5"/><circle cx="12" cy="4" r="1" fill="currentColor"/><circle cx="9.5" cy="12.3" r="1.3" fill="currentColor"/><circle cx="14.5" cy="12.3" r="1.3" fill="currentColor"/>`,
    hourglass: `<path d="M6.5 3.5 H17.5 M6.5 20.5 H17.5 M7.5 3.5 Q7.5 9 12 12 Q16.5 9 16.5 3.5 M7.5 20.5 Q7.5 15 12 12 Q16.5 15 16.5 20.5"/><path d="M9 19.5 Q12 16.5 15 19.5 Z" ${F}/>`,
    users: `<circle cx="9" cy="8.5" r="3.3" ${F}/><path d="M3 19.5 Q3.5 13.5 9 13.5 Q14.5 13.5 15 19.5"/><circle cx="16.5" cy="9" r="2.6"/><path d="M16 13.5 Q20.5 13.5 21 18.5"/>`,
    online: `<circle cx="12" cy="12" r="5" fill="currentColor" fill-opacity=".85" stroke="none"/>`,
    tools: `<path d="M14.5 4.5 Q18 3.5 19.5 6.5 L17 9 L15 7 Z" ${F}/><path d="M17 9 L6 20 Q4.5 21.5 3.5 20.5 Q2.5 19.5 4 18 L15 7 M14.5 4.5 Q11 5.5 12.5 9"/><path d="M5 5 L11.5 11.5 M4 4 L6 6"/>`,
    trophy: `<path d="M7.5 3.5 H16.5 V10 Q16.5 14.5 12 14.5 Q7.5 14.5 7.5 10 Z" ${F}/><path d="M7.5 5.5 H4 Q4 10 7.8 10.5 M16.5 5.5 H20 Q20 10 16.2 10.5 M12 14.5 V18 M8 20.5 H16 M9 18 H15"/>`,
    user: `<circle cx="12" cy="8" r="4" ${F}/><path d="M4.5 20.5 Q5 14 12 14 Q19 14 19.5 20.5"/>`,
    megaphone: `<path d="M3.5 10 V14 H7 L17 19 V5 L7 10 Z" ${F}/><path d="M7 14 L8.5 19.5 H11 L10 15.3 M19.5 9.5 Q21 12 19.5 14.5"/>`,
    bolt: `<path d="M13.5 2.5 L5.5 13.5 H11 L10 21.5 L18.5 10.5 H13 Z" ${F}/>`,
    refresh: `<path d="M19.5 12 Q19.5 19 12 19.5 Q5.5 19.5 4.5 13 M4.5 12 Q4.5 5 12 4.5 Q18.5 4.5 19.5 11"/><path d="M19.5 6.5 V11 H15 M4.5 17.5 V13 H9"/>`,
    crown: `<path d="M3.5 8 L8 12 L12 5 L16 12 L20.5 8 L18.5 18 H5.5 Z" ${F}/><path d="M5.5 20.5 H18.5"/>`,
    offline: `<path d="M3 3 L21 21"/><path d="M8.5 16 Q12 13.5 15.5 16 M5 12.5 Q8 10 11.5 9.8 M19 12.5 Q17.5 11.2 15.8 10.5 M2 9 Q4.5 6.8 7.5 6"/><circle cx="12" cy="19.5" r=".9" fill="currentColor"/>`,
    pin: `<path d="M9 3.5 H15 L14 9 L17.5 12.5 H6.5 L10 9 Z" ${F}/><path d="M12 12.5 V20.5"/>`,
    chartUp: `<path d="M3.5 20.5 H20.5 M3.5 20.5 V3.5"/><path d="M6.5 16 L11 11.5 L14 14 L20 7.5 M16 7.5 H20 V11.5"/>`,
    hand: `<path d="M8 12 V5.5 Q8 4 9.3 4 Q10.5 4 10.5 5.5 V11 M10.5 10 V4.2 Q10.5 3 11.8 3 Q13 3 13 4.2 V10.5 M13 10 V5 Q13 3.8 14.3 3.8 Q15.5 3.8 15.5 5 V11.5 M15.5 8 Q15.5 6.8 16.8 6.8 Q18 6.8 18 8 V14 Q18 20.5 12 20.5 Q8 20.5 6.5 17 L4.5 12.5 Q4 11 5.3 10.6 Q6.5 10.3 7.2 11.4 L8 12.5"  ${F}/>`,
    eye: `<path d="M2.5 12 Q7 5 12 5 Q17 5 21.5 12 Q17 19 12 19 Q7 19 2.5 12 Z" ${F}/><circle cx="12" cy="12" r="3"/>`,
    beach: `<path d="M3.5 20.5 Q12 16 20.5 20.5"/><path d="M12 10 L9.5 20"/><path d="M4 10.5 Q11 2 19.5 9 Q16 8 13 10.5 Q10 8 7 10.5 Q5.5 9.5 4 10.5 Z" ${F}/><circle cx="19" cy="4.5" r="1.8"/>`,
    scale: `<path d="M12 3.5 V20.5 M7 20.5 H17 M4.5 7 H19.5 M12 5 L12 7"/><path d="M4.5 7 L2.5 13 Q4.5 15.5 6.5 13 Z M19.5 7 L17.5 13 Q19.5 15.5 21.5 13 Z" ${F}/>`,
    gear: `<circle cx="12" cy="12" r="3"/><path d="M12 2.8 L13.4 5.3 L16.2 4.6 L16.6 7.4 L19.4 8 L18.7 10.8 L21.2 12 L18.7 13.2 L19.4 16 L16.6 16.6 L16.2 19.4 L13.4 18.7 L12 21.2 L10.6 18.7 L7.8 19.4 L7.4 16.6 L4.6 16 L5.3 13.2 L2.8 12 L5.3 10.8 L4.6 8 L7.4 7.4 L7.8 4.6 L10.6 5.3 Z" ${F}/>`,
    shield: `<path d="M12 3 L19.5 6 V11.5 Q19.5 17.5 12 21 Q4.5 17.5 4.5 11.5 V6 Z" ${F}/><path d="M8.5 12 L11 14.5 L15.5 9.5"/>`,
    wave: `<path d="M7.5 12.5 L5 9.5 Q4.3 8.4 5.4 7.8 Q6.4 7.3 7.2 8.3 L10.5 12.5 M9 8.5 L7.2 5.8 Q6.6 4.8 7.6 4.3 Q8.6 3.8 9.3 4.8 L12.5 9.5 M11.2 7 L10.5 5.6 Q10 4.6 11 4.2 Q12 3.8 12.6 4.8 L15.2 9.5 Q17 8 18.5 9 Q19.5 9.8 18.6 11 L15 16.5 Q12.5 20.5 8.5 19 Q5.5 17.5 6.5 14 L7.5 12.5" ${F}/><path d="M17 3.5 Q19.5 4.2 20.5 6.5 M3.5 16.5 Q3.8 18.8 5.5 20"/>`,
    key: `<circle cx="8" cy="15" r="4.5" ${F}/><path d="M11.2 11.8 L20 3 M16.5 6.5 L19 9 M14.5 8.5 L16.5 10.5"/>`,
    chart: `<path d="M3.5 20.5 H20.5"/><rect x="5" y="12" width="3.5" height="8.5" rx="1" ${F}/><rect x="10.3" y="7" width="3.5" height="13.5" rx="1" ${F}/><rect x="15.5" y="3.5" width="3.5" height="17" rx="1" ${F}/>`,
    scroll: `<path d="M6.5 3.5 H17.5 Q19.5 3.5 19.5 5.5 V18.5 Q19.5 20.5 17.5 20.5 H8.5 Q6.5 20.5 6.5 18.5 Z" ${F}/><path d="M6.5 6.5 H3.5 V5.5 Q3.5 3.5 5.5 3.5 H6.5 M10 8 H16 M10 11.5 H16 M10 15 H14"/>`,
    logout: `<path d="M13.5 4.5 H18.5 V19.5 H13.5"/><path d="M3.5 12 H14 M9.5 7.5 L14 12 L9.5 16.5"/>`,
    sparkle: `<path d="M12 3 L13.8 10.2 L21 12 L13.8 13.8 L12 21 L10.2 13.8 L3 12 L10.2 10.2 Z" ${F}/>`,
    calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" ${F}/><path d="M3.5 9.5 H20.5 M8 3 V6.5 M16 3 V6.5"/><circle cx="8.5" cy="13.5" r=".9" fill="currentColor"/><circle cx="12" cy="13.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="13.5" r=".9" fill="currentColor"/>`,
    pencil: `<path d="M15.5 4.5 L19.5 8.5 L8.5 19.5 H4.5 V15.5 Z" ${F}/><path d="M13 7 L17 11"/>`,
    trash: `<path d="M4 6.5 H20 M9.5 6.5 V4 H14.5 V6.5"/><path d="M6 6.5 L7 20 Q7.1 20.5 7.6 20.5 H16.4 Q16.9 20.5 17 20 L18 6.5" ${F}/><path d="M10 10.5 V16.5 M14 10.5 V16.5"/>`,
    party: `<path d="M3.5 20.5 L8.5 7 L17 15.5 Z" ${F}/><path d="M12 6 Q13 3.5 15.5 4 M15.5 9 Q18 7.5 20.5 9 M18 3.5 V5 M20.5 12.5 H19"/>`,
    siren: `<path d="M6.5 17 V12 Q6.5 6.5 12 6.5 Q17.5 6.5 17.5 12 V17" ${F}/><path d="M4 20.5 H20 M5 17 H19 M12 2.5 V4 M4.5 5 L5.6 6.1 M19.5 5 L18.4 6.1"/>`,
    receipt: `<path d="M5.5 3.5 H18.5 V20.5 L16 19 L13.5 20.5 L11 19 L8.5 20.5 L5.5 19 Z" ${F}/><path d="M9 8 H15 M9 11.5 H15 M9 15 H12.5"/>`,
    cards: `<rect x="8" y="3.5" width="12" height="16" rx="2" transform="rotate(10 14 11.5)" ${F}/><rect x="4" y="5" width="12" height="16" rx="2" ${F}/><path d="M10 10 Q10 8.5 11.3 8.5 Q12.5 8.5 12.5 10 Q12.5 11 11 11.8 V13 M11 15.3 V15.4"/>`,
    chest: `<path d="M3.5 10.5 H20.5 V19.5 H3.5 Z" ${F}/><path d="M3.5 10.5 Q3.5 4.5 12 4.5 Q20.5 4.5 20.5 10.5"/><rect x="10.3" y="9.3" width="3.4" height="4" rx=".8"/>`,
    arrow: `<path d="M20 12 H4 M10 6 L4 12 L10 18"/>`,
    anchor: `<circle cx="12" cy="5.5" r="2"/><path d="M12 7.5 V20.5 M8 10.5 H16 M4.5 13.5 Q5.5 20.5 12 20.5 Q18.5 20.5 19.5 13.5"/>`,
    tag: `<path d="M3.5 12.5 V4.5 Q3.5 3.5 4.5 3.5 H12.5 L20.5 11.5 L11.5 20.5 Z" ${F}/><circle cx="8" cy="8" r="1.5"/>`,
    store: `<path d="M4 9 L5.5 3.5 H18.5 L20 9" ${F}/><path d="M4 9 Q4 11.5 6.7 11.5 Q9.3 11.5 9.3 9 Q9.3 11.5 12 11.5 Q14.7 11.5 14.7 9 Q14.7 11.5 17.3 11.5 Q20 11.5 20 9 M5.5 11.5 V20.5 H18.5 V11.5 M10 20.5 V15.5 H14 V20.5"/>`,
    play: `<path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" fill-opacity=".3"/>`,
    coins: `<ellipse cx="9" cy="7" rx="5.5" ry="2.5" ${F}/><path d="M3.5 7 V11 Q3.5 13.5 9 13.5 Q14.5 13.5 14.5 11 V7"/><ellipse cx="15" cy="14" rx="5.5" ry="2.5" ${F}/><path d="M9.5 14 V17.5 Q9.5 20 15 20 Q20.5 20 20.5 17.5 V14"/>`,
    mail: `<rect x="3" y="5.5" width="18" height="13" rx="2.5" ${F}/><path d="M3.8 7 L12 13 L20.2 7"/>`,
    medal: `<path d="M8 3.5 L12 10 L16 3.5" /><circle cx="12" cy="15" r="5.5" ${F}/><path d="M12 12.5 L12.8 14.3 L14.7 14.5 L13.3 15.8 L13.7 17.7 L12 16.8 L10.3 17.7 L10.7 15.8 L9.3 14.5 L11.2 14.3 Z" fill="currentColor"/>`,
  };
  const ui = (name, cls = '') => `<svg class="ui-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI[name] || UI.sparkle}</svg>`;

  // Emoji that older code / server log lines still use -> icon names. iconize() swaps them for
  // SVG icons in rendered UI; user content (chat messages, bios, names) is left exactly as typed.
  const EMOJI = {
    '🎲': 'dice', '🔨': 'gavel', '✔': 'check', '✅': 'check', '👌': 'check', '❌': 'xmark', '🤝': 'handshake', '💰': 'moneybag',
    '💵': 'cash', '💸': 'cash', '🏠': 'house', '🏨': 'hotel', '🔊': 'sound', '🔇': 'mute', '💬': 'chat', '🔒': 'lock', '🔓': 'unlock',
    '🏦': 'bank', '🌍': 'globe', '🗺': 'map', '⚠': 'warn', '🎮': 'gamepad', '🕹': 'gamepad', '⭐': 'star', '🎫': 'ticket', '💀': 'skull',
    '🏗': 'crane', '⏱': 'timer', '⏰': 'timer', '🤖': 'robot', '⏳': 'hourglass', '👥': 'users', '🟢': 'online', '🛠': 'tools', '🏆': 'trophy',
    '👤': 'user', '📢': 'megaphone', '📣': 'megaphone', '⚡': 'bolt', '🔄': 'refresh', '👑': 'crown', '📴': 'offline', '📌': 'pin',
    '📈': 'chartUp', '🙏': 'hand', '👀': 'eye', '👁': 'eye', '🏖': 'beach', '⚖': 'scale', '⚙': 'gear', '🛡': 'shield', '👋': 'wave',
    '🔑': 'key', '📊': 'chart', '📜': 'scroll', '🚪': 'logout', '✨': 'sparkle', '📅': 'calendar', '✏': 'pencil', '🗑': 'trash',
    '🎉': 'party', '🚓': 'siren', '🧾': 'receipt', '🎴': 'cards', '🧰': 'chest', '➡': 'arrow', '⚓': 'anchor', '🏷': 'tag', '⛔': 'xmark',
    '🛒': 'store', '🪙': 'coins', '🥇': 'medal', '🙂': 'user', '🎁': 'party', '▶': 'play', '📧': 'mail', '✉': 'mail',
  };
  const EMOJI_RE = new RegExp('(' + Object.keys(EMOJI).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')️?', 'gu');
  const RAW_SEL = '.chat-msg, .bio, [data-raw], textarea, input, script, style, svg, title, option';
  function iconizeNode(node) {
    if (node.nodeType === 3) {
      const t = node.nodeValue;
      if (!t || !EMOJI_RE.test(t)) return;
      EMOJI_RE.lastIndex = 0;
      const parent = node.parentElement;
      if (!parent || parent.closest(RAW_SEL)) return;
      const tpl = document.createElement('template');
      const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      tpl.innerHTML = esc(t).replace(EMOJI_RE, (m, e) => ui(EMOJI[e], 'em'));
      node.replaceWith(tpl.content);
      return;
    }
    if (node.nodeType !== 1 || node.matches(RAW_SEL)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const list = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (EMOJI_RE.test(n.nodeValue)) { EMOJI_RE.lastIndex = 0; list.push(n); }
    EMOJI_RE.lastIndex = 0;
    list.forEach(iconizeNode);
  }
  // Keep the whole page emoji-free as it re-renders.
  function autoIconize() {
    iconizeNode(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') iconizeNode(m.target);
        else m.addedNodes.forEach(iconizeNode);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ---------------------------------------------------------------- buildings (isometric, Serva palette)
  // House: small cube with a pitched cyan roof, lit/shadow faces, door + window.
  const HOUSE = svg(`<ellipse cx="10" cy="19" rx="7" ry="1.4" fill="#000" opacity=".35"/>
    <path d="M3 9.5 L10 13 V19 L3 15.5 Z" fill="#f4f9ff"/><path d="M10 13 L17 9.5 V15.5 L10 19 Z" fill="#b7cde4"/>
    <path d="M10 13 L17 9.5 L13.5 4.2 Z" fill="#dbe9f6"/>
    <path d="M6.5 2.9 L13.5 4.2 L17 9.5 L10 6.6 Z" fill="#0b7fc0"/>
    <path d="M3 9.5 L10 13 L13.5 4.2 L6.5 2.9 Z" fill="#20bfff"/><path d="M6.5 2.9 L13.5 4.2" stroke="#bff0ff" stroke-width=".7"/>
    <path d="M5.4 12.6 L7.4 13.6 V17.2 L5.4 16.2 Z" fill="#2a4a6b"/><path d="M12.4 13.4 L14.6 12.3 V14.3 L12.4 15.4 Z" fill="#ffd36b"/>`, '0 0 20 20', 'house');
  // Hotel: taller tower, window grid, gold roof and sign.
  const HOTEL = svg(`<ellipse cx="12" cy="28.5" rx="9" ry="1.6" fill="#000" opacity=".35"/>
    <path d="M4 9 L12 13 V28 L4 24 Z" fill="#f7faff"/><path d="M12 13 L20 9 V24 L12 28 Z" fill="#c2d2e6"/>
    <path d="M4 9 L12 5 L20 9 L12 13 Z" fill="#ffc53d"/><path d="M4 9 L12 13 L20 9" fill="none" stroke="#8a5a00" stroke-width=".6"/>
    <path d="M8.2 3.6 L15.8 3.6 L15.8 6.4 L8.2 6.4 Z" fill="#f0a91c"/><text x="12" y="5.9" text-anchor="middle" font-size="2.6" font-weight="900" fill="#3a2200" font-family="Arial">H</text>
    <g fill="#ffd36b"><path d="M5.6 13 L7.4 13.9 V15.5 L5.6 14.6 Z M8.6 14.5 L10.4 15.4 V17 L8.6 16.1 Z M5.6 17.2 L7.4 18.1 V19.7 L5.6 18.8 Z M8.6 18.7 L10.4 19.6 V21.2 L8.6 20.3 Z"/></g>
    <g fill="#5f7fa6"><path d="M13.6 15.4 L15.4 14.5 V16.1 L13.6 17 Z M16.6 13.9 L18.4 13 V14.6 L16.6 15.5 Z M13.6 19.6 L15.4 18.7 V20.3 L13.6 21.2 Z M16.6 18.1 L18.4 17.2 V18.8 L16.6 19.7 Z"/></g>
    <path d="M7.4 22.4 L9.8 23.6 V27 L7.4 25.8 Z" fill="#2a4a6b"/>`, '0 0 24 30', 'hotel');

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

  // ---------------------------------------------------------------- Blender renders (public/tharwa/img, tools/blender/tharwa_assets.py)
  // Chrome / crystal miniatures with a soft baked contact shadow; transparent PNG, 2 sizes each (srcset).
  const IMG = '/tharwa/img/';
  const RENDERS = typeof window !== 'undefined' && !!window.THARWA_RENDERS;
  const rimg = (name, s1, s2, cls, alt = '') => `<img class="${cls}" src="${IMG}${name}-${s1}.png" srcset="${IMG}${name}-${s1}.png 1x, ${IMG}${name}-${s2}.png 2x" alt="${alt}" draggable="false" decoding="async">`;
  const RENDER_ICONS = { start: 'corner-start', jail: 'corner-jail', vacation: 'corner-vacation', gotojail: 'corner-gotojail' };
  const HOUSE_IMG = rimg('house', 64, 128, 'house bimg');
  const HOTEL_IMG = rimg('hotel', 64, 128, 'hotel bimg');
  const COIN_IMG = rimg('coin', 64, 128, 'money-img');
  const BILL_IMG = rimg('bill', 64, 128, 'money-img');

  window.ART = {
    icon: (name) => svg(ICONS[name] || ICONS.coin),
    // corner tiles (GO, jail, rest, go-to-jail): rendered 3D icons; any other name keeps its SVG
    cornerIcon: (name) => (RENDER_ICONS[name] ? rimg(RENDER_ICONS[name], 128, 256, 'corner-img') : svg(ICONS[name] || ICONS.coin)),
    // The game room (public/index.html sets window.THARWA_RENDERS) shows the rendered miniatures; the Astro pages keep the SVG.
    piece: (key) => (RENDERS ? rimg('piece-' + (PIECES[key] ? key : 'star'), 128, 256, 'piece-img', (PIECES[key] || PIECES.star).label)
      : svg((PIECES[key] || PIECES.star).art, '0 0 24 24', 'piece-svg')),
    pieceSvg: (key) => svg((PIECES[key] || PIECES.star).art, '0 0 24 24', 'piece-svg'),
    pieceLabel: (key) => (PIECES[key] || PIECES.star).label,
    PIECE_KEYS, HOUSE: HOUSE_IMG, HOTEL: HOTEL_IMG, HOUSE_SVG: HOUSE, HOTEL_SVG: HOTEL, GLOBE, BILL: BILL_IMG, BILL_SVG: BILL, COIN: COIN_IMG, avatar, AVATAR_KEYS, ui, UI_KEYS: Object.keys(UI), iconize: iconizeNode, autoIconize,
  };
})();
