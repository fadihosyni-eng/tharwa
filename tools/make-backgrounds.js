'use strict';
// Generates the game's background art (SVG) in the serva-s.com look:
// navy #030816, neon cyan #00b4ff / #2fe2ff, star gold #ffc53d.
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

// ---------------------------------------------------------------- circuit pattern (tiles seamlessly)
function circuit() {
  const S = 240, paths = [], nodes = [];
  for (let k = 0; k < 14; k++) {
    let x = Math.round(rand() * 12) * 20, y = Math.round(rand() * 12) * 20;
    let d = `M${x} ${y}`;
    const steps = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < steps; s++) {
      const len = (1 + Math.floor(rand() * 3)) * 20;
      const dir = pick(['h', 'v', 'd']);
      if (dir === 'h') x += rand() < 0.5 ? len : -len;
      else if (dir === 'v') y += rand() < 0.5 ? len : -len;
      else { const sx = rand() < 0.5 ? 1 : -1, sy = rand() < 0.5 ? 1 : -1; x += sx * 20; y += sy * 20; }
      d += ` L${x} ${y}`;
    }
    paths.push(d);
    nodes.push([x, y]);
  }
  const body = (dx, dy) => `<g transform="translate(${dx} ${dy})">
    <g fill="none" stroke="#00b4ff" stroke-opacity=".10" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g fill="#2fe2ff" fill-opacity=".22">${nodes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4"/>`).join('')}</g>
    <g fill="none" stroke="#2fe2ff" stroke-opacity=".12">${nodes.slice(0, 5).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</g></g>`;
  // draw 9 copies so traces crossing an edge wrap around
  const copies = [];
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) copies.push(body(dx, dy));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${copies.join('')}</svg>`;
}

// ---------------------------------------------------------------- star dust pattern
function stars() {
  const S = 320, dots = [];
  for (let k = 0; k < 60; k++) {
    const big = rand() < 0.12;
    dots.push(`<circle cx="${r1(rand() * S)}" cy="${r1(rand() * S)}" r="${big ? 1.4 : r1(0.4 + rand() * 0.6)}" fill="${rand() < 0.25 ? '#2fe2ff' : '#e8f0f8'}" fill-opacity="${r1(big ? 0.55 : 0.12 + rand() * 0.3)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${dots.join('')}</svg>`;
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

save('circuit.svg', circuit());
save('stars.svg', stars());
save('skyline.svg', skyline());
save('rings.svg', rings());
