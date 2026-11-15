'use strict';
// Simplified round-badge flags drawn as inline SVG (20x20 square, shown in a circle).
// Windows does not render flag emoji, so every flag is drawn here.
(() => {
  const pts = (arr) => arr.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' ');
  function starPts(cx, cy, r, rot = -90) {
    const out = [];
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.4 : r, a = ((rot + k * 36) * Math.PI) / 180;
      out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    return pts(out);
  }
  const star = (cx, cy, r, fill, rot) => `<polygon points="${starPts(cx, cy, r, rot)}" fill="${fill}"/>`;
  const bg = (c) => `<rect width="20" height="20" fill="${c}"/>`;
  const h3 = (a, b, c) => `<rect width="20" height="6.67" fill="${a}"/><rect y="6.67" width="20" height="6.66" fill="${b}"/><rect y="13.33" width="20" height="6.67" fill="${c}"/>`;
  const v3 = (a, b, c) => `<rect width="6.67" height="20" fill="${a}"/><rect x="6.67" width="6.66" height="20" fill="${b}"/><rect x="13.33" width="6.67" height="20" fill="${c}"/>`;

  const usStripes = [1, 3, 5, 7, 9, 11].map((i) => `<rect y="${((i * 20) / 13).toFixed(2)}" width="20" height="1.54" fill="#fff"/>`).join('');
  const usStars = [1.6, 4.0, 6.4, 8.8].flatMap((y) => [1.5, 3.9, 6.3, 8.7].map((x) => `<circle cx="${x}" cy="${y}" r="0.55" fill="#fff"/>`)).join('');
  const qatarEdge = (() => {
    const p = [[0, 0], [6, 0]];
    for (let k = 0; k < 9; k++) p.push([8.6, ((k + 0.5) * 20) / 9], [6, ((k + 1) * 20) / 9]);
    p.push([0, 20]);
    return pts(p);
  })();
  const pentagram = (() => {
    const v = [0, 1, 2, 3, 4].map((k) => { const a = ((-90 + k * 72) * Math.PI) / 180; return [10 + 4.8 * Math.cos(a), 10.6 + 4.8 * Math.sin(a)]; });
    const o = [v[0], v[2], v[4], v[1], v[3]];
    return 'M' + o.map((q) => q.map((n) => n.toFixed(2)).join(' ')).join(' L') + ' Z';
  })();

  // Crescent = big circle minus a smaller offset circle (opening to the right).
  function crescent(cx, cy, r1, dx, r2, fill) {
    const a = (r1 * r1 - r2 * r2 + dx * dx) / (2 * dx), h = Math.sqrt(r1 * r1 - a * a);
    const x = (cx + a).toFixed(2), y1 = (cy - h).toFixed(2), y2 = (cy + h).toFixed(2);
    return `<path d="M${x} ${y1}A${r1} ${r1} 0 1 0 ${x} ${y2}A${r2} ${r2} 0 1 1 ${x} ${y1}Z" fill="${fill}"/>`;
  }
  const serrated = (x0, x1, n) => {
    const p = [[0, 0], [x0, 0]];
    for (let k = 0; k < n; k++) p.push([x1, ((k + 0.5) * 20) / n], [x0, ((k + 1) * 20) / n]);
    p.push([0, 20]);
    return pts(p);
  };

  const F = {
    dz: '<rect width="10" height="20" fill="#006233"/><rect x="10" width="10" height="20" fill="#fff"/>' + crescent(9.6, 10, 5, 1.3, 4, '#d21034') + star(12.4, 10, 2, '#d21034', 180),
    bh: bg('#ce1126') + `<polygon points="${serrated(5, 8, 5)}" fill="#fff"/>`,
    km: '<rect width="20" height="5" fill="#ffd100"/><rect y="5" width="20" height="5" fill="#fff"/><rect y="10" width="20" height="5" fill="#ce1126"/><rect y="15" width="20" height="5" fill="#3a75c4"/>'
      + '<polygon points="0,0 10,10 0,20" fill="#3d8e33"/>' + crescent(3.6, 10, 3, 1, 2.5, '#fff'),
    dj: '<rect width="20" height="10" fill="#6ab2e7"/><rect y="10" width="20" height="10" fill="#12ad2b"/><polygon points="0,0 11,10 0,20" fill="#fff"/>' + star(3.8, 10, 2, '#d7141a'),
    iq: h3('#ce1126', '#ffffff', '#000000') + '<text x="10" y="11.4" text-anchor="middle" font-size="3.4" font-weight="700" fill="#007a3d" font-family="Tahoma, Arial">الله أكبر</text>',
    ly: '<rect width="20" height="5" fill="#e70013"/><rect y="5" width="20" height="10" fill="#000"/><rect y="15" width="20" height="5" fill="#239e46"/>' + crescent(9.6, 10, 3, 0.9, 2.4, '#fff') + star(11.7, 10, 1.3, '#fff', 180),
    mr: bg('#00a95c') + '<rect width="20" height="3.2" fill="#d01c1f"/><rect y="16.8" width="20" height="3.2" fill="#d01c1f"/>'
      + '<path d="M5.4 8.6A4.8 4.8 0 0 0 14.6 8.6A4.6 3.8 0 0 1 5.4 8.6Z" fill="#ffd700"/>' + star(10, 8.2, 1.9, '#ffd700'),
    om: '<rect width="20" height="6.67" fill="#fff"/><rect y="6.67" width="20" height="6.66" fill="#db161b"/><rect y="13.33" width="20" height="6.67" fill="#008000"/><rect width="6" height="20" fill="#db161b"/>',
    ps: h3('#000000', '#ffffff', '#009736') + '<polygon points="0,0 10,10 0,20" fill="#ee2a35"/>',
    sa: bg('#006c35') + '<text x="10" y="9.6" text-anchor="middle" font-size="3.1" font-weight="700" fill="#fff" font-family="Tahoma, Arial">لا إله إلا الله</text>'
      + '<text x="10" y="12.6" text-anchor="middle" font-size="2.6" font-weight="700" fill="#fff" font-family="Tahoma, Arial">محمد رسول الله</text>'
      + '<path d="M4.5 14.6H15.2" stroke="#fff" stroke-width="0.7" stroke-linecap="round"/><path d="M14.6 13.9L15.8 14.6L14.6 15.3" fill="#fff"/>',
    so: bg('#4189dd') + star(10, 10.4, 4.6, '#fff'),
    sd: h3('#d21034', '#ffffff', '#000000') + '<polygon points="0,0 9,10 0,20" fill="#007229"/>',
    ye: h3('#ce1126', '#ffffff', '#000000'),
    us: bg('#b22234') + usStripes + '<rect width="10" height="10.77" fill="#3c3b6e"/>' + usStars,
    sy: h3('#007a3d', '#ffffff', '#000000') + star(4.6, 10, 2.1, '#ce1126') + star(10, 10, 2.1, '#ce1126') + star(15.4, 10, 2.1, '#ce1126'),
    gb: bg('#012169') + '<path d="M0 0L20 20M20 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L20 20M20 0L0 20" stroke="#c8102e" stroke-width="1.4"/>'
      + '<path d="M10 0V20M0 10H20" stroke="#fff" stroke-width="6"/><path d="M10 0V20M0 10H20" stroke="#c8102e" stroke-width="3.4"/>',
    tr: bg('#e30a17') + '<circle cx="8" cy="10" r="4.8" fill="#fff"/><circle cx="9.3" cy="10" r="3.9" fill="#e30a17"/>' + star(13.4, 10, 2.1, '#fff', 180),
    de: h3('#000000', '#dd0000', '#ffce00'),
    fr: v3('#0055a4', '#ffffff', '#ef4135'),
    it: v3('#009246', '#ffffff', '#ce2b37'),
    es: bg('#aa151b') + '<rect y="5" width="20" height="10" fill="#f1bf00"/>',
    jp: bg('#ffffff') + '<circle cx="10" cy="10" r="5.6" fill="#bc002d"/>',
    cn: bg('#ee1c25') + star(6, 6.5, 3.4, '#ffde00') + star(11, 2.8, 1.1, '#ffde00', -60) + star(13, 5, 1.1, '#ffde00', -30) + star(13, 8, 1.1, '#ffde00', 0) + star(11, 10.2, 1.1, '#ffde00', 20),
    br: bg('#009c3b') + '<polygon points="10,2.5 18.5,10 10,17.5 1.5,10" fill="#ffdf00"/><circle cx="10" cy="10" r="4.3" fill="#002776"/><path d="M5.9 9.1Q10 7.7 14.2 10.7" stroke="#fff" stroke-width="0.8" fill="none"/>',
    ar: h3('#74acdf', '#ffffff', '#74acdf') + '<circle cx="10" cy="10" r="1.9" fill="#f6b40e"/>',
    ru: h3('#ffffff', '#0039a6', '#d52b1e'),
    ua: '<rect width="20" height="10" fill="#0057b7"/><rect y="10" width="20" height="10" fill="#ffd700"/>',
    nl: h3('#ae1c28', '#ffffff', '#21468b'),
    se: bg('#006aa7') + '<rect x="5.6" width="3" height="20" fill="#fecc00"/><rect y="8.5" width="20" height="3" fill="#fecc00"/>',
    ch: bg('#da291c') + '<rect x="8.4" y="4" width="3.2" height="12" fill="#fff"/><rect x="4" y="8.4" width="12" height="3.2" fill="#fff"/>',
    gr: bg('#0d5eaf') + [2.22, 6.67, 11.11, 15.56].map((y) => `<rect y="${y}" width="20" height="2.22" fill="#fff"/>`).join('')
      + '<rect width="11.11" height="11.11" fill="#0d5eaf"/><rect x="4.44" width="2.22" height="11.11" fill="#fff"/><rect y="4.44" width="11.11" height="2.22" fill="#fff"/>',
    in: h3('#ff9933', '#ffffff', '#138808') + '<circle cx="10" cy="10" r="2.3" fill="none" stroke="#000080" stroke-width="0.6"/><circle cx="10" cy="10" r="0.6" fill="#000080"/>',
    eg: h3('#ce1126', '#ffffff', '#000000') + '<path d="M10 7.6L11.6 9 11.2 12.2 10 12.8 8.8 12.2 8.4 9Z" fill="#c09300"/>',
    ae: h3('#00732f', '#ffffff', '#000000') + '<rect width="5.5" height="20" fill="#ff0000"/>',
    jo: h3('#000000', '#ffffff', '#007a3d') + '<polygon points="0,0 10,10 0,20" fill="#ce1126"/>' + star(3.6, 10, 1.5, '#fff'),
    lb: bg('#ed1c24') + '<rect y="5" width="20" height="10" fill="#fff"/><polygon points="10,5.6 13.4,10.6 11.8,10.6 14.4,13.6 5.6,13.6 8.2,10.6 6.6,10.6" fill="#00a651"/><rect x="9.4" y="13.6" width="1.2" height="1.4" fill="#00a651"/>',
    qa: bg('#8a1538') + `<polygon points="${qatarEdge}" fill="#fff"/>`,
    kw: h3('#007a3d', '#ffffff', '#ce1126') + '<polygon points="0,0 6,6.67 6,13.33 0,20" fill="#000"/>',
    ma: bg('#c1272d') + `<path d="${pentagram}" fill="none" stroke="#006233" stroke-width="0.9" stroke-linejoin="round"/>`,
    tn: bg('#e70013') + '<circle cx="10" cy="10" r="5" fill="#fff"/><circle cx="10" cy="10" r="3.7" fill="#e70013"/><circle cx="11" cy="10" r="3" fill="#fff"/>' + star(11.4, 10, 1.8, '#e70013', 180),
  };

  window.flagSVG = (code) => `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${F[code] || bg('#556677')}</svg>`;
  window.FLAG_CODES = Object.keys(F);
})();
