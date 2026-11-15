'use strict';
// «ثروة» server — zero dependencies (Node built-ins only).
// HTTP for actions, Server-Sent Events for live room state.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const B = require('./game/board');
const E = require('./game/engine');
const Bot = require('./game/bot');

const PORT = Number(process.env.PORT) || 8700;
const PUB = path.join(__dirname, 'public');
const rooms = new Map();

const COLORS = ['#f5c04a', '#38d4c0', '#f0585e', '#a78bfa', '#5ad06b', '#f472b6', '#4f9df7', '#fb923c'];
const PIECES = ['car', 'plane', 'ship', 'crown', 'rocket', 'diamond', 'star', 'hat'];
const BOT_NAMES = ['سامي', 'ليلى', 'كريم', 'هدى', 'ماهر', 'رنا', 'زيد', 'نور'];
const DEFAULTS = {
  maxPlayers: 4, isPrivate: false, startingCash: 1500, doubleRent: true, vacationCash: true,
  auction: true, noRentInJail: false, evenBuild: true, mortgage: true, randomOrder: true, turnTimer: 0,
};
const BOOL_KEYS = ['isPrivate', 'doubleRent', 'vacationCash', 'auction', 'noRentInJail', 'evenBuild', 'mortgage', 'randomOrder'];
const TIMER_OPTIONS = [0, 60, 90, 120];
const AUTOPILOT_AFTER_MS = 20000;   // a disconnected player is auto-played after this
const LOBBY_DROP_MS = 30000;        // a disconnected player leaves the lobby after this
const IDLE_ROOM_MS = 15 * 60000;    // empty rooms are deleted after this
// Limits for running on the open internet.
const MAX_ROOMS = 300;
const MAX_CLIENTS_PER_ROOM = 40;
const CREATE_LIMIT = 10;            // new rooms/joins per IP per minute
const createLog = new Map();        // ip -> [timestamps]
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || '';
}
function rateLimit(req) {
  const ip = clientIp(req), now = Date.now();
  const list = (createLog.get(ip) || []).filter((t) => now - t < 60000);
  if (list.length >= CREATE_LIMIT) throw httpErr(429, 'كتير طلبات — استنى دقيقة وجرّب');
  list.push(now);
  createLog.set(ip, list);
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of createLog) if (!list.some((t) => now - t < 60000)) createLog.delete(ip);
}, 60000).unref();
const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];

// ---------------------------------------------------------------- helpers
const uid = () => crypto.randomBytes(6).toString('hex');
const token = () => crypto.randomBytes(16).toString('hex');
function roomCode() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => a[crypto.randomInt(a.length)]).join(''); } while (rooms.has(c));
  return c;
}
function cleanName(n) {
  const s = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim();
  return [...s].slice(0, 16).join('') || 'لاعب';
}
function httpErr(status, msg) { const e = new Error(msg); e.userMsg = msg; e.status = status; return e; }

function newRoom(isPrivate) {
  if (rooms.size >= MAX_ROOMS) throw httpErr(503, 'السيرفر مليان هلق — جرّب بعد شوي');
  const room = {
    code: roomCode(), hostId: null, settings: { ...DEFAULTS, isPrivate: !!isPrivate }, status: 'lobby',
    players: [], clients: new Set(), log: [], chat: [], game: null,
    createdAt: Date.now(), lastActive: Date.now(), botTimer: null,
  };
  rollMap(room);
  rooms.set(room.code, room);
  return room;
}
// Pick this room's countries: Syria, Jordan, Iraq always on top + 5 random Arab ones.
function rollMap(room) {
  room.map = B.randomMap();
  room.tiles = B.tilesFor(room.map);
}
function freeColor(room) { return COLORS.find((c) => !room.players.some((p) => p.color === c)) || COLORS[0]; }
function freePiece(room) { return PIECES.find((k) => !room.players.some((p) => p.piece === k)) || PIECES[0]; }
function addPlayer(room, name, isBot) {
  const p = {
    id: uid(), token: isBot ? null : token(), name: cleanName(name), color: freeColor(room), piece: freePiece(room),
    isBot: !!isBot, conns: 0, lastSeen: Date.now(),
  };
  room.players.push(p);
  if (!room.hostId && !isBot) room.hostId = p.id;
  return p;
}
function closeRoom(room) {
  clearTimeout(room.botTimer);
  for (const c of room.clients) { try { c.res.write('event: gone\ndata: {}\n\n'); c.res.end(); } catch (e) { /* closed */ } }
  rooms.delete(room.code);
}
// Returns false when the room was closed (no humans left).
function removePlayer(room, pid) {
  room.players = room.players.filter((p) => p.id !== pid);
  if (room.hostId === pid) {
    const h = room.players.find((p) => !p.isBot);
    room.hostId = h ? h.id : null;
  }
  if (!room.players.some((p) => !p.isBot)) { closeRoom(room); return false; }
  return true;
}

function publicRoom(room) {
  const g = room.game;
  return {
    code: room.code, hostId: room.hostId, settings: room.settings, status: room.status, now: Date.now(),
    map: room.map,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, piece: p.piece, isBot: p.isBot, connected: p.isBot || p.conns > 0,
      money: p.money, pos: p.pos, inJail: p.inJail, jailTurns: p.jailTurns, bankrupt: p.bankrupt,
      jailCards: p.jailCards, left: !!p.left,
    })),
    game: g ? { ...g, chance: undefined, chest: undefined } : null,
    log: room.log.slice(-60), chat: room.chat.slice(-80),
  };
}
function broadcast(room) {
  if (!rooms.has(room.code)) return;
  const msg = 'event: state\ndata: ' + JSON.stringify(publicRoom(room)) + '\n\n';
  for (const c of room.clients) c.res.write(msg);
}
function afterChange(room) { broadcast(room); pump(room); }

// ---------------------------------------------------------------- automation (bots & autopilot)
function isAuto(room, p) {
  if (p.bankrupt) return false;
  if (p.isBot) return true;
  if (p.conns === 0 && Date.now() - p.lastSeen > AUTOPILOT_AFTER_MS) return true;
  const g = room.game;
  return !!(g && g.autopilot && E.current(room) === p);
}
function pickAuto(room) {
  const g = room.game, cur = E.current(room);
  let list = room.players.filter((p) => isAuto(room, p));
  if (g.auction) list.sort(() => Math.random() - 0.5);
  else list.sort((a, b) => (b === cur) - (a === cur));
  for (const p of list) {
    const a = Bot.decide(room, p, { autopilot: !p.isBot });
    if (a) return { p, a };
  }
  return null;
}
function pump(room) {
  if (room.botTimer || room.status !== 'playing' || !rooms.has(room.code)) return;
  if (!room.players.some((p) => !p.isBot && p.conns > 0)) return; // pause when nobody watches
  if (!pickAuto(room)) return;
  const delay = room.game.auction ? 450 + Math.random() * 900 : 700 + Math.random() * 500;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!rooms.has(room.code) || room.status !== 'playing') return;
    const n = pickAuto(room);
    if (!n) return;
    try {
      E.act(room, n.p.id, n.a.type, n.a.data || {});
      n.p.fails = 0;
    } catch (e) {
      console.warn('[auto] rejected', n.p.name, n.a, e.userMsg || e.message);
      n.p.fails = (n.p.fails || 0) + 1;
      if (n.p.fails > 4) { try { E.act(room, n.p.id, 'bankrupt'); } catch (e2) { /* ignore */ } }
    }
    afterChange(room);
  }, delay);
}

// ---------------------------------------------------------------- lobby & room actions
function applySettings(room, data) {
  const s = room.settings;
  for (const [k, v] of Object.entries(data || {})) {
    if (BOOL_KEYS.includes(k)) s[k] = !!v;
    else if (k === 'maxPlayers') {
      const n = Math.floor(Number(v));
      if (n < 2 || n > 8) throw httpErr(400, 'عدد اللاعبين من 2 لـ 8');
      if (n < room.players.length) throw httpErr(400, 'في لاعبين أكتر من هالعدد بالغرفة');
      s.maxPlayers = n;
    } else if (k === 'startingCash') {
      const n = Number(v);
      if (!B.CASH_OPTIONS.includes(n)) throw httpErr(400, 'المبلغ لازم يكون من ' + B.CASH_OPTIONS.join('، '));
      s.startingCash = n;
    } else if (k === 'turnTimer') {
      const n = Number(v);
      if (!TIMER_OPTIONS.includes(n)) throw httpErr(400, 'وقت الدور غير صحيح');
      s.turnTimer = n;
    }
  }
}

function roomAct(room, p, type, data) {
  const host = room.hostId === p.id;
  const needHost = () => { if (!host) throw httpErr(403, 'بس صاحب الغرفة بيقدر يعمل هالشي'); };
  const needLobby = () => { if (room.status !== 'lobby') throw httpErr(409, 'اللعبة بلّشت'); };
  switch (type) {
    case 'settings': needHost(); needLobby(); applySettings(room, data); return true;
    case 'addBot': {
      needHost(); needLobby();
      if (room.players.length >= room.settings.maxPlayers) throw httpErr(409, 'الغرفة مليانة');
      const used = new Set(room.players.map((x) => x.name));
      const name = BOT_NAMES.map((n) => 'بوت ' + n).find((n) => !used.has(n)) || 'بوت';
      addPlayer(room, name, true);
      E.log(room, `🤖 انضاف ${name}`);
      return true;
    }
    case 'kick': {
      needHost(); needLobby();
      const t = room.players.find((x) => x.id === (data && data.pid));
      if (!t || t.id === p.id) throw httpErr(400, 'ما فيك تطلّع هاللاعب');
      E.log(room, `${t.name} انطلع من الغرفة`);
      removePlayer(room, t.id);
      return true;
    }
    case 'piece': {
      needLobby();
      const k = String((data && data.piece) || '');
      if (!PIECES.includes(k)) throw httpErr(400, 'قطعة غير معروفة');
      if (room.players.some((x) => x.id !== p.id && x.piece === k)) throw httpErr(409, 'هالقطعة مأخودة');
      p.piece = k;
      return true;
    }
    case 'setCountry': {
      needHost(); needLobby();
      const slot = String((data && data.slot) || ''), code = String((data && data.code) || '');
      if (!B.SLOTS.includes(slot) || !B.ARAB.includes(code) || !B.COUNTRIES[code]) throw httpErr(400, 'دولة غير معروفة');
      room.map = B.setCountry(room.map, slot, code);
      room.tiles = B.tilesFor(room.map);
      E.log(room, `🌍 ${p.name} حط ${B.COUNTRIES[code].name} عاللوح`);
      return true;
    }
    case 'shuffleMap': {
      needHost(); needLobby();
      rollMap(room); // `mode` is ignored: the board is always Arab-only
      const names = Object.keys(B.SETS).filter((k) => !B.FIXED[k]).map((k) => B.COUNTRIES[room.map[k]].name);
      E.log(room, '🌍 دول جديدة عاللوح: ' + names.join('، ') + ' — مع سوريا والأردن والعراق');
      return true;
    }
    case 'start':
      needHost(); needLobby();
      if (room.players.length < 2) throw httpErr(409, 'بدك لاعبين اثنين على الأقل');
      E.newGame(room);
      return true;
    case 'restart': {
      needHost();
      if (room.status !== 'ended') throw httpErr(409, 'اللعبة لسا ما خلصت');
      room.players = room.players.filter((x) => !x.left);
      room.status = 'lobby'; room.game = null;
      rollMap(room);
      E.log(room, '🔄 رجعنا عاللوبي — جاهزين للعبة جديدة بدول جديدة');
      return true;
    }
    case 'chat': {
      const text = String((data && data.text) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
      if (!text) return false;
      const now = Date.now();
      if (p.lastChat && now - p.lastChat < 400) throw httpErr(429, 'شوي شوي عالرسائل');
      p.lastChat = now;
      room.chat.push({ pid: p.id, name: p.name, color: p.color, text, t: now });
      if (room.chat.length > 120) room.chat.splice(0, room.chat.length - 120);
      return true;
    }
    case 'leave':
      if (room.status === 'lobby') { E.log(room, `${p.name} طلع من الغرفة`); removePlayer(room, p.id); return true; }
      if (room.status === 'playing' && !p.bankrupt) E.bankrupt(room, p);
      p.left = true;
      if (!room.players.some((x) => !x.isBot && !x.left)) { closeRoom(room); return false; }
      if (room.hostId === p.id) { const h = room.players.find((x) => !x.isBot && !x.left); room.hostId = h ? h.id : null; }
      return true;
    default:
      return null; // not a room action
  }
}

// ---------------------------------------------------------------- HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webp': 'image/webp',
};
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 32 * 1024) { reject(httpErr(413, 'الطلب كبير')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(httpErr(400, 'بيانات غلط')); } });
    req.on('error', reject);
  });
}
function serveStatic(pathname, res) {
  let file = pathname === '/' || /^\/room\/[a-z0-9]{5}\/?$/i.test(pathname) ? 'index.html' : pathname.slice(1);
  const full = path.normalize(path.join(PUB, file));
  if (!full.startsWith(PUB)) { res.writeHead(403).end(); return; }
  fs.readFile(full, (e, buf) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('مو موجود'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
function getRoom(code) {
  const room = rooms.get(String(code || '').toLowerCase());
  if (!room) throw httpErr(404, 'الغرفة مو موجودة أو انتهت');
  return room;
}
function auth(room, pid, tok) {
  const p = room.players.find((x) => x.id === pid);
  if (!p || p.isBot || !tok || p.token !== tok) throw httpErr(403, 'مو مسجّل بهالغرفة');
  return p;
}
function listRooms() {
  return [...rooms.values()]
    .filter((r) => r.status === 'lobby' && !r.settings.isPrivate && r.players.length < r.settings.maxPlayers)
    .map((r) => {
      const host = r.players.find((p) => p.id === r.hostId);
      return { code: r.code, host: host ? host.name : '', count: r.players.length, max: r.settings.maxPlayers, cash: r.settings.startingCash };
    })
    .slice(0, 30);
}

// Addresses friends can use to reach this PC (Radmin VPN / same Wi-Fi).
function netAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const kind = /radmin/i.test(name) ? 'radmin' : /proton|nord|wireguard|openvpn|tun|tap/i.test(name) ? 'vpn' : 'lan';
      out.push({ name, ip: a.address, kind, url: `http://${a.address}:${PORT}` });
    }
  }
  const rank = { radmin: 0, lan: 1, vpn: 2 };
  return out.sort((x, y) => rank[x.kind] - rank[y.kind]);
}

function sse(req, res, u) {
  const room = rooms.get(String(u.searchParams.get('code') || '').toLowerCase());
  if (!room) { json(res, 404, { error: 'gone' }); return; }
  if (room.clients.size >= MAX_CLIENTS_PER_ROOM) { json(res, 429, { error: 'الغرفة فيها متفرجين كتير' }); return; }
  const pid = u.searchParams.get('pid'), tok = u.searchParams.get('token');
  const p = room.players.find((x) => x.id === pid && !x.isBot && tok && x.token === tok) || null;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const client = { res, pid: p ? p.id : null };
  room.clients.add(client);
  room.lastActive = Date.now();
  if (p) { p.conns++; p.lastSeen = Date.now(); }
  res.write('event: state\ndata: ' + JSON.stringify(publicRoom(room)) + '\n\n');
  if (p && p.conns === 1) afterChange(room);
  const ka = setInterval(() => res.write(': ka\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ka);
    room.clients.delete(client);
    if (p) { p.conns = Math.max(0, p.conns - 1); p.lastSeen = Date.now(); }
    room.lastActive = Date.now();
    if (rooms.has(room.code)) broadcast(room);
  });
}

async function api(pathname, body, res) {
  if (pathname === '/api/create') {
    const room = newRoom(body.isPrivate);
    const p = addPlayer(room, body.name, false);
    E.log(room, `🏠 ${p.name} عمل الغرفة`);
    return json(res, 200, { code: room.code, pid: p.id, token: p.token });
  }
  if (pathname === '/api/quick') {
    const open = listRooms()[0];
    const room = open ? rooms.get(open.code) : newRoom(false);
    const p = addPlayer(room, body.name, false);
    E.log(room, open ? `👋 ${p.name} دخل الغرفة` : `🏠 ${p.name} عمل الغرفة`);
    broadcast(room);
    return json(res, 200, { code: room.code, pid: p.id, token: p.token });
  }
  if (pathname === '/api/join') {
    const room = getRoom(body.code);
    if (room.status !== 'lobby') throw httpErr(409, 'اللعبة بلّشت — فيك تتفرّج بس');
    if (room.players.length >= room.settings.maxPlayers) throw httpErr(409, 'الغرفة مليانة');
    const p = addPlayer(room, body.name, false);
    E.log(room, `👋 ${p.name} دخل الغرفة`);
    room.lastActive = Date.now();
    broadcast(room);
    return json(res, 200, { code: room.code, pid: p.id, token: p.token });
  }
  if (pathname === '/api/act') {
    const room = getRoom(body.code);
    const p = auth(room, body.pid, body.token);
    room.lastActive = Date.now();
    const type = String(body.type || '');
    const handled = roomAct(room, p, type, body.data || {});
    if (handled === null) {
      if (room.game && room.game.autopilot && E.current(room) === p) room.game.autopilot = false; // player is back
      E.act(room, p.id, type, body.data || {});
    }
    if (rooms.has(room.code)) afterChange(room);
    return json(res, 200, { ok: true });
  }
  throw httpErr(404, 'مو موجود');
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && u.pathname === '/api/events') return sse(req, res, u);
    if (req.method === 'GET' && u.pathname === '/api/board') return json(res, 200, B.publicBoard());
    if (req.method === 'GET' && u.pathname === '/api/rooms') return json(res, 200, listRooms());
    if (req.method === 'GET' && u.pathname === '/api/net') return json(res, 200, isLoopback(req) ? netAddresses() : []);
    if (req.method === 'GET' && u.pathname === '/api/room') {
      const room = getRoom(u.searchParams.get('code'));
      const pid = u.searchParams.get('pid');
      return json(res, 200, {
        code: room.code, status: room.status, count: room.players.length, max: room.settings.maxPlayers,
        member: !!room.players.find((p) => p.id === pid && !p.left),
      });
    }
    if (req.method === 'POST' && u.pathname.startsWith('/api/')) {
      if (['/api/create', '/api/quick', '/api/join'].includes(u.pathname)) rateLimit(req);
      return await api(u.pathname, await readBody(req), res);
    }
    if (req.method === 'GET') return serveStatic(u.pathname, res);
    res.writeHead(405).end();
  } catch (e) {
    if (!e.userMsg) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.userMsg || 'صار خطأ بالسيرفر' });
  }
});

// ---------------------------------------------------------------- clock (timers, cleanup, autopilot)
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    let changed = false;
    if (room.status === 'lobby') {
      for (const p of [...room.players]) {
        if (!p.isBot && p.conns === 0 && now - p.lastSeen > LOBBY_DROP_MS) {
          E.log(room, `${p.name} طلع (انقطع الاتصال)`);
          changed = true;
          if (!removePlayer(room, p.id)) break;
        }
      }
      if (!rooms.has(room.code)) continue;
    }
    if (room.status === 'playing') {
      const g = room.game;
      if (g.auction && now >= g.auction.endsAt) { E.endAuction(room); changed = true; }
      if (g.turnEndsAt) {
        if (g.phase === 'auction') g.turnEndsAt += 1000;
        else if (g.phase === 'debt' && !g.debtExtended) { g.turnEndsAt = Math.max(g.turnEndsAt, now + 60000); g.debtExtended = true; changed = true; }
        else if (now > g.turnEndsAt && !g.autopilot) {
          g.autopilot = true;
          E.log(room, `⏰ خلص وقت ${E.current(room).name} — اللعبة عم تكمّل عنه`);
          changed = true;
        }
      }
    }
    if (room.clients.size === 0 && now - room.lastActive > IDLE_ROOM_MS) { closeRoom(room); continue; }
    if (changed) broadcast(room);
    pump(room);
  }
}, 1000);

server.listen(PORT, () => console.log(`ثروة شغالة على http://localhost:${PORT}`));
