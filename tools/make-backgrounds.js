'use strict';
// Generates the game's background art (SVG) in the serva-s.com look:
// navy #030816, neon cyan #00b4ff / #2fe2ff, star gold #ffc53d.
// The page background itself is CSS (navy gradient + soft aurora glows); these files add a
// faint Arabic star lattice and a whisper of grain on top of it.
// Run: node tharwa-game/tools/make-backgrounds.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'bg');
fs.mkdirSync(OUT, { recursive: true });

// deterministic random so the art is stable between runs
let seed = 1948;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const r1 = (n) => Math.round(n * 10) / 10;
const save = (name, svg) => { fs.writeFileSync(path.join(OUT, name), svg.replace(/\n\s+/g, '\n')); console.log('wrote', name, Math.round(svg.length / 1024) + ' KB'); };

// ---------------------------------------------------------------- Arabic eight-point star lattice (tiles seamlessly)
// Very faint line art: khatam stars (two interlaced squares) on a square grid, joined by diagonal
// bridges and small diamonds. Drawn at full strength here; the page sets how faint it is.
function arabesque() {
  const S = 120, R = 30, C = S / 2;
  const star = (cx, cy) => {
    const sq = (rot) => [0, 1, 2, 3].map((k) => {
      const a = ((rot + k * 90) * Math.PI) / 180;
      return `${r1(cx + R * Math.cos(a))} ${r1(cy + R * Math.sin(a))}`;
    });
    const p1 = sq(0), p2 = sq(45);
    const oct = Array.from({ length: 8 }, (_, k) => {
      const a = ((22.5 + k * 45) * Math.PI) / 180, r = R * 0.42;
      return `${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`;
    });
    return `<path d="M${p1.join(' L')} Z M${p2.join(' L')} Z"/><path d="M${oct.join(' L')} Z" stroke-opacity=".55"/>`;
  };
  const d = R * Math.SQRT1_2; // where a star's diagonal tip sits
  const parts = [];
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S], [C, C]]) parts.push(star(x, y));
  // diagonal bridges between the centre star and the corner stars
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    parts.push(`<path d="M${r1(C + sx * d)} ${r1(C + sy * d)} L${r1(C + sx * (C - d))} ${r1(C + sy * (C - d))}"/>`);
  }
  // little diamonds at the edge midpoints, linking the stars along the grid lines
  for (const [x, y] of [[C, 0], [C, S], [0, C], [S, C]]) {
    const q = 9;
    parts.push(`<path d="M${x} ${y - q} L${x + q} ${y} L${x} ${y + q} L${x - q} ${y} Z" stroke-opacity=".7"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><g fill="none" stroke="#7fdcff" stroke-width="1" stroke-linejoin="round">${parts.join('')}</g></svg>`;
}

// ---------------------------------------------------------------- film grain (tiny, tiles seamlessly)
function grain() {
  const S = 180;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 .75  0 0 0 0 .88  0 0 0 0 1  0 0 0 .55 0"/></filter>
    <rect width="${S}" height="${S}" filter="url(#n)"/></svg>`;
}

// ---------------------------------------------------------------- neon city skyline (wide strip)
function skyline() {
  const W = 1600, H = 340;
  const layer = (base, minH, maxH, fill, stroke, winOpacity, count) => {
    let x = -20, out = '';
    for (let k = 0; k < count && x < W; k++) {
      const w = 40 + Math.floor(rand() * 70), h = minH + Math.floor(rand() * (maxH - minH));
      const top = base - h;
      const roof = pick(['flat', 'flat', 'spire', 'step', 'dome']);
      let shape = `M${x} ${base} V${top} H${x + w} V${base} Z`;
      if (roof === 'spire') shape += ` M${x + w / 2 - 3} ${top} V${top - 30} H${x + w / 2 + 3} V${top} Z`;
      if (roof === 'step') shape += ` M${x + 10} ${top} V${top - 14} H${x + w - 10} V${top} Z`;
      if (roof === 'dome') shape += ` M${x + 8} ${top} A${w / 2 - 8} ${w / 3} 0 0 1 ${x + w - 8} ${top} Z`;
      out += `<path d="${shape}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
      // lit windows
      for (let wy = top + 10; wy < base - 12; wy += 14) {
        for (let wx = x + 8; wx < x + w - 10; wx += 12) {
          if (rand() < 0.38) out += `<rect x="${wx}" y="${wy}" width="5" height="7" fill="${rand() < 0.8 ? '#2fe2ff' : '#ffc53d'}" fill-opacity="${r1(winOpacity * (0.4 + rand() * 0.6))}"/>`;
        }
      }
      x += w + Math.floor(rand() * 14) - 4;
    }
    return out;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030816" stop-opacity="0"/><stop offset="1" stop-color="#030816" stop-opacity=".9"/></linearGradient>
      <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00b4ff" stop-opacity="0"/><stop offset="1" stop-color="#00b4ff" stop-opacity=".22"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${layer(H, 120, 260, '#0a1a3c', '#1f3a6b', 0.45, 40)}
    ${layer(H, 60, 170, '#07122c', '#00b4ff55', 0.9, 40)}
    <rect width="${W}" height="${H}" fill="url(#fade)"/>
    <path d="M0 ${H - 1} H${W}" stroke="#2fe2ff" stroke-opacity=".5" stroke-width="2"/>
  </svg>`;
}

// ---------------------------------------------------------------- board centre rings
function rings() {
  const C = 300, parts = [];
  for (let k = 1; k <= 6; k++) {
    const r = k * 44;
    parts.push(`<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="#00b4ff" stroke-opacity="${r1(0.16 - k * 0.018)}" stroke-width="${k % 2 ? 1.2 : 0.8}" ${k % 2 ? '' : 'stroke-dasharray="4 8"'}/>`);
  }
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180, r0 = a % 45 === 0 ? 90 : 220, r2 = 280;
    parts.push(`<line x1="${r1(C + r0 * Math.cos(rad))}" y1="${r1(C + r0 * Math.sin(rad))}" x2="${r1(C + r2 * Math.cos(rad))}" y2="${r1(C + r2 * Math.sin(rad))}" stroke="#2fe2ff" stroke-opacity="${a % 45 === 0 ? 0.12 : 0.05}" stroke-width="1"/>`);
  }
  for (let k = 0; k < 24; k++) {
    const a = rand() * Math.PI * 2, r = 60 + rand() * 220;
    parts.push(`<circle cx="${r1(C + r * Math.cos(a))}" cy="${r1(C + r * Math.sin(a))}" r="${r1(1 + rand() * 1.8)}" fill="#2fe2ff" fill-opacity="${r1(0.15 + rand() * 0.35)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
    <defs><radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#00b4ff" stop-opacity=".18"/><stop offset=".55" stop-color="#0b2150" stop-opacity=".25"/><stop offset="1" stop-color="#030816" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${C}" cy="${C}" r="300" fill="url(#core)"/>${parts.join('')}</svg>`;
}

save('arabesque.svg', arabesque());
save('grain.svg', grain());
// skyline + rings keep the exact random sequence they were first drawn with
seed = 10457844;
save('skyline.svg', skyline());
save('rings.svg', rings());
