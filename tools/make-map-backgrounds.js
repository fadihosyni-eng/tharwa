'use strict';
// Generates the centre backgrounds of the premium board maps (public/bg/map-*.svg).
// Run: node tharwa-game/tools/make-map-backgrounds.js
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'public', 'bg');

// Small deterministic random so the files don't change between runs.
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const W = 800, H = 800;
const wrap = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>\n`;

// ---------------------------------------------------------------- Gulf nights: stars, moon, towers, dunes (gold on navy)
function gulf() {
  let stars = '';
  for (let i = 0; i < 90; i++) stars += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * 380).toFixed(1)}" r="${(rnd() * 1.6 + 0.4).toFixed(2)}" fill="#ffe7a8" opacity="${(rnd() * 0.6 + 0.25).toFixed(2)}"/>`;
  // skyline: a row of towers, the tallest one in the middle (Burj-like)
  let towers = '';
  let x = 40;
  while (x < W - 40) {
    const w = 26 + rnd() * 34, h = 90 + rnd() * 170;
    towers += `<rect x="${x.toFixed(1)}" y="${(600 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#gTower)"/>`;
    for (let wy = 600 - h + 12; wy < 590; wy += 16) for (let wx = x + 6; wx < x + w - 6; wx += 10) if (rnd() > 0.55) towers += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="3" height="5" fill="#ffd36b" opacity=".75"/>`;
    x += w + 8 + rnd() * 10;
  }
  const burj = '<path d="M392 600 L396 300 L400 170 L404 300 L408 600 Z M380 600 L388 380 L412 380 L420 600 Z" fill="url(#gTower)"/><path d="M400 170 V120" stroke="#ffc53d" stroke-width="2"/>';
  return wrap(`<linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b22"/><stop offset=".7" stop-color="#1a1f4a"/><stop offset="1" stop-color="#3a2a3a"/></linearGradient>
    <linearGradient id="gTower" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f5a"/><stop offset="1" stop-color="#0b0f2a"/></linearGradient>
    <linearGradient id="gDune" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9963c"/><stop offset="1" stop-color="#6a4512"/></linearGradient>`,
  `<rect width="${W}" height="${H}" fill="url(#gSky)"/>${stars}
    <circle cx="620" cy="140" r="46" fill="#ffe7a8"/><circle cx="642" cy="128" r="42" fill="#0d1230"/>
    ${towers}${burj}
    <path d="M0 610 Q200 560 400 610 T800 600 V800 H0 Z" fill="url(#gDune)" opacity=".9"/>
    <path d="M0 680 Q240 630 480 690 T800 670 V800 H0 Z" fill="#8a5c1c" opacity=".85"/>
    <path d="M0 610 Q200 560 400 610 T800 600" fill="none" stroke="#ffd36b" stroke-width="2" opacity=".6"/>`);
}

// ---------------------------------------------------------------- Old Levant: 8-point star arabesque on warm stone
function levant() {
  const tile = 100;
  const star = (cx, cy, r) => {
    const pts = [];
    for (let k = 0; k < 16; k++) { const rr = k % 2 ? r * 0.62 : r, a = (k * Math.PI) / 8; pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
    return `<polygon points="${pts.join(' ')}"/>`;
  };
  let body = '';
  for (let y = 0; y <= H; y += tile) for (let x = 0; x <= W; x += tile) {
    body += star(x, y, 34) + `<rect x="${x + 36}" y="${y + 36}" width="28" height="28" transform="rotate(45 ${x + 50} ${y + 50})"/>`;
  }
  return wrap(`<radialGradient id="lStone" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#6b5236"/><stop offset="1" stop-color="#2a1f14"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#lStone)"/>
    <g fill="none" stroke="#e9d3a0" stroke-width="2" opacity=".35">${body}</g>
    <g fill="none" stroke="#9fb35a" stroke-width="1.2" opacity=".35"><circle cx="400" cy="400" r="300"/><circle cx="400" cy="400" r="240"/></g>`);
}

// ---------------------------------------------------------------- Neon 2077: perspective grid, sun, scanlines (magenta/cyan)
function neon() {
  let grid = '';
  for (let i = -12; i <= 12; i++) grid += `<path d="M400 470 L${400 + i * 90} 800"/>`;
  for (let k = 0; k < 9; k++) { const y = 470 + Math.pow(k / 8, 2) * 330; grid += `<path d="M0 ${y.toFixed(1)} H800"/>`; }
  let lines = '';
  for (let y = 0; y < 470; y += 6) lines += `<rect x="0" y="${y}" width="800" height="2" fill="#000" opacity=".18"/>`;
  return wrap(`<linearGradient id="nSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05010d"/><stop offset=".6" stop-color="#2a0742"/><stop offset="1" stop-color="#5a0a6a"/></linearGradient>
    <linearGradient id="nSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe600"/><stop offset=".55" stop-color="#ff2fd6"/><stop offset="1" stop-color="#7b2cff"/></linearGradient>`,
  `<rect width="${W}" height="${H}" fill="url(#nSky)"/>
    <circle cx="400" cy="380" r="150" fill="url(#nSun)" opacity=".9"/>${lines}
    <rect x="0" y="470" width="800" height="330" fill="#0a0016"/>
    <g stroke="#00f0ff" stroke-width="1.6" opacity=".7">${grid}</g>
    <path d="M0 470 H800" stroke="#ff2fd6" stroke-width="3"/>`);
}

for (const [name, svg] of [['map-gulf.svg', gulf()], ['map-levant.svg', levant()], ['map-neon.svg', neon()]]) {
  fs.writeFileSync(path.join(OUT, name), svg);
  console.log('wrote', name, (svg.length / 1024).toFixed(1) + ' KB');
}
