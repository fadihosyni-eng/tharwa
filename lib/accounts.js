'use strict';
// Accounts, profiles, site settings, ads, games registry and the admin API.
// server.js calls init(ctx) once, then handle(req, res, url) for every /api/auth, /api/me,
// /api/u, /api/site and /api/admin request (returns false when the path is not ours).
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const M = require('../game/maps');

const SESSION_DAYS = 30;
const COOKIE = 'tharwa_sid';
const RESERVED = new Set(['admin', 'admins', 'api', 'room', 'rooms', 'u', 'user', 'users', 'settings', 'login', 'logout',
  'register', 'signup', 'serva', 'tharwa', 'root', 'support', 'help', 'about', 'system', 'moderator', 'mod', 'null', 'undefined']);
const AVATARS = Array.from({ length: 24 }, (_, i) => 'a' + (i + 1));
const PIECES = ['car', 'plane', 'ship', 'crown', 'rocket', 'diamond', 'star', 'hat'];
const COLORS = ['#f5c04a', '#38d4c0', '#f0585e', '#a78bfa', '#5ad06b', '#f472b6', '#4f9df7', '#fb923c'];
const AVATAR_KEYS = new Set([...AVATARS, ...PIECES.map((p) => 'piece:' + p)]);
const AD_SLOTS = ['home_top', 'home_bottom', 'room_side'];

// Site-wide settings (stored under key "site"), with defaults.
const SITE_DEFAULTS = {
  announcement: { on: false, text: '' },
  maintenance: false,
  registrationOpen: true,
  defaultRoom: { startingCash: 1500, maxPlayers: 4, turnTimer: 0 },
  // stake: what each logged-in loser pays the winner; perWin: bonus for winning; perGame: given to everyone who played.
  points: { perWin: 50, perGame: 0, stake: 20 },
};
const GAMES_DEFAULT = [
  { slug: 'tharwa', name: 'ثروة', description: 'لعبة المدن والعقارات — اشترِ، عمّر، وخلّي الكل يفلس', enabled: true, players: '2–8' },
];
const AD_DEFAULT = (slot) => ({ slot, enabled: false, type: 'image', image: '', link: '', html: '' });

let ctx; // { store, rooms, helpers: { httpErr, json, readBody, rateLimit, closeRoom, broadcast, log, cash, timers } }
let siteCache = null;

// ---------------------------------------------------------------- small helpers
const err = (status, msg) => ctx.helpers.httpErr(status, msg);
const notFound = () => err(404, 'الصفحة مو موجودة');
function cleanText(s, max) { return [...String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim()].slice(0, max).join(''); }
function cleanBio(s) { return [...String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '').trim()].slice(0, 160).join(''); }
function normUsername(s) { return String(s || '').trim().toLowerCase(); }
function checkUsername(u) {
  if (!/^[a-z0-9_]{3,20}$/.test(u)) throw err(400, 'اسم المستخدم لازم يكون من 3 لـ 20 حرف إنكليزي صغير أو رقم أو _');
  if (RESERVED.has(u)) throw err(400, 'هالاسم محجوز — اختار غيره');
}
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 6) throw err(400, 'كلمة السر لازم تكون 6 أحرف على الأقل');
  if (p.length > 200) throw err(400, 'كلمة السر طويلة كتير');
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  const [kind, salt, hex] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hex) return false;
  const key = await scrypt(String(pw), salt, 64), want = Buffer.from(hex, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
const tokenHash = (t) => crypto.createHash('sha256').update((process.env.COOKIE_SECRET || '') + t).digest('hex');
function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const isHttps = (req) => !!req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
function setCookie(req, res, value, maxAgeSec) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
// What anyone may see about a user.
function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username, displayName: u.displayName, avatar: u.avatar, bio: u.bio, role: u.role,
    points: u.points, games: u.games, wins: u.wins, createdAt: u.createdAt, color: u.color, piece: u.piece,
  };
}
// What an admin sees in the users table.
function adminUser(u) { return { id: u.id, ...publicUser(u), banned: !!u.banned, lastSeen: u.lastSeen }; }

// ---------------------------------------------------------------- sessions
// The logged-in user of this request, or null. Banned users count as logged out,
// except for callers that pass { allowBanned: true } to show them a clear refusal.
async function currentUser(req, { allowBanned = false } = {}) {
  const t = readCookie(req, COOKIE);
  if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const u = await ctx.store.getSessionUser(tokenHash(t));
  if (!u || (u.banned && !allowBanned)) return null;
  if (Date.now() - (u.lastSeen || 0) > 60000) { u.lastSeen = Date.now(); ctx.store.updateUser(u.id, { lastSeen: u.lastSeen }).catch(() => {}); }
  return u;
}
async function startSession(req, res, user) {
  const t = crypto.randomBytes(32).toString('hex');
  await ctx.store.addSession(tokenHash(t), user.id, Date.now() + SESSION_DAYS * 86400000);
  setCookie(req, res, t, SESSION_DAYS * 86400);
}

// ---------------------------------------------------------------- site settings / ads / games
async function getSite() {
  if (siteCache) return siteCache;
  const s = await ctx.store.getSetting('site', {});
  const ads = await ctx.store.getSetting('ads', {});
  const games = await ctx.store.getSetting('games', GAMES_DEFAULT);
  siteCache = {
    ...SITE_DEFAULTS, ...s,
    announcement: { ...SITE_DEFAULTS.announcement, ...(s.announcement || {}) },
    defaultRoom: { ...SITE_DEFAULTS.defaultRoom, ...(s.defaultRoom || {}) },
    points: { ...SITE_DEFAULTS.points, ...(s.points || {}) },
    ads: AD_SLOTS.map((slot) => ({ ...AD_DEFAULT(slot), ...(ads[slot] || {}), slot })),
    games: Array.isArray(games) && games.length ? games : GAMES_DEFAULT,
  };
  return siteCache;
}
async function saveSite(patch) {
  const cur = await getSite();
  const { ads, games, ...rest } = { ...cur, ...patch };
  await ctx.store.setSetting('site', rest);
  siteCache = null;
  return getSite();
}
// Public view of the site settings (what the home page and rooms need).
async function publicSite() {
  const s = await getSite();
  const players = [...ctx.rooms.values()].reduce((n, r) => n + r.players.filter((p) => !p.isBot && !p.left).length, 0);
  return {
    announcement: s.announcement.on && s.announcement.text ? s.announcement.text : '',
    maintenance: !!s.maintenance, registrationOpen: !!s.registrationOpen,
    ads: s.ads.filter((a) => a.enabled && (a.type === 'html' ? a.html : a.image)),
    games: s.games.filter((g) => g.enabled).map((g) => ({ ...g, live: g.slug === 'tharwa' ? players : 0 })),
  };
}

// ---------------------------------------------------------------- game results (called by server.js)
// Points move with results: every logged-in loser pays the stake (never below 0 points),
// the winner (if logged in) gets the stakes actually paid + the win bonus. Guests and bots
// neither pay nor get paid. The per-player change is stored with the result and shown in the room.
async function recordGame(room) {
  const g = room.game, rules = (await getSite()).points;
  const winner = room.players.find((p) => p.id === g.winner);
  const humans = room.players.filter((p) => !p.isBot);
  const delta = {};
  let pot = 0;
  for (const p of humans) {
    if (!p.userId || p.id === g.winner) continue;
    const u = await ctx.store.getUser(p.userId);
    if (!u) continue;
    const paid = Math.min(rules.stake || 0, Math.max(0, u.points + (rules.perGame || 0)));
    pot += paid;
    delta[p.id] = (rules.perGame || 0) - paid;
  }
  if (winner && winner.userId && !winner.isBot) delta[winner.id] = (rules.perGame || 0) + (rules.perWin || 0) + pot;
  for (const p of humans) {
    if (!p.userId || !(p.id in delta)) continue;
    const won = p.id === g.winner;
    const u = await ctx.store.addUserStats(p.userId, delta[p.id], 1, won ? 1 : 0);
    if (u) p.points = u.points;
  }
  const players = room.players.map((p) => ({
    name: p.name, userId: p.userId || null, username: p.username || null, bot: !!p.isBot, won: p.id === g.winner,
    delta: p.id in delta ? delta[p.id] : null,
  }));
  g.pointsResult = delta; // shown at the end of the game
  await ctx.store.addGameResult({
    roomCode: room.code, game: 'tharwa', map: room.mapId || 'classic', players,
    userIds: [...new Set(humans.filter((p) => p.userId).map((p) => p.userId))],
    winner: winner ? { name: winner.name, userId: winner.userId || null, username: winner.username || null } : null,
    rounds: g.round || 0, durationMs: Date.now() - (room.startedAt || Date.now()), createdAt: Date.now(),
  });
}

// ---------------------------------------------------------------- maps (store)
async function mapsConfig() { return ctx.store.getSetting('maps', {}); }
async function mapsFor(user) {
  const list = M.publicMaps(await mapsConfig());
  const owned = user ? new Set(await ctx.store.listUserMaps(user.id)) : new Set();
  return list.map((m) => ({ ...m, owned: m.price === 0 || owned.has(m.id) || m.id === 'classic' }));
}
// Can this account put this map on a room? (classic: everyone; others: owned + enabled)
async function canUseMap(userId, mapId) {
  const m = M.publicMaps(await mapsConfig()).find((x) => x.id === mapId);
  if (!m || !m.enabled) return false;
  if (m.id === 'classic' || m.price === 0) return true;
  if (!userId) return false;
  return (await ctx.store.listUserMaps(userId)).includes(mapId);
}

// ---------------------------------------------------------------- request handling
async function handle(req, res, u) {
  const p = u.pathname;
  if (!(p.startsWith('/api/auth/') || p.startsWith('/api/me/') || p.startsWith('/api/u/') || p === '/api/site' || p.startsWith('/api/admin/')
    || p === '/api/leaders' || p === '/api/maps' || p === '/api/maps/buy')) return false;
  const { json, readBody, rateLimit } = ctx.helpers;
  const method = req.method;

  if (method === 'GET' && p === '/api/site') { json(res, 200, await publicSite()); return true; }
  if (method === 'GET' && p === '/api/leaders') {
    json(res, 200, (await ctx.store.topUsers(50)).map((x) => publicUser(x)));
    return true;
  }
  if (method === 'GET' && p === '/api/maps') {
    const me = await currentUser(req);
    json(res, 200, { maps: (await mapsFor(me)).filter((m) => m.enabled), points: me ? me.points : null });
    return true;
  }
  if (method === 'GET' && p === '/api/auth/me') {
    const me = await currentUser(req);
    json(res, 200, { user: me ? { ...publicUser(me), id: me.id } : null });
    return true;
  }
  if (method === 'GET' && p.startsWith('/api/u/')) {
    const user = await ctx.store.getUserByName(normUsername(decodeURIComponent(p.slice(7))));
    if (!user) throw err(404, 'هالمستخدم مو موجود');
    const games = await ctx.store.listUserGames(user.id, 10);
    json(res, 200, {
      user: publicUser(user),
      recent: games.map((r) => ({
        at: r.createdAt, rounds: r.rounds, durationMs: r.durationMs, players: r.players.length,
        won: !!(r.winner && r.winner.userId === user.id), winner: r.winner ? r.winner.name : '',
      })),
    });
    return true;
  }
  if (method === 'GET' && p.startsWith('/api/admin/')) { await adminGet(req, res, p, u); return true; }
  if (method !== 'POST') throw err(405, 'مو مسموح');

  // ---- POST
  if (p === '/api/auth/register' || p === '/api/auth/login') rateLimit(req, 'auth');
  const body = await readBody(req);

  if (p === '/api/auth/register') {
    const username = normUsername(body.username);
    checkUsername(username); checkPassword(body.password);
    const displayName = cleanText(body.displayName, 24) || username;
    const count = await ctx.store.countUsers();
    const site = await getSite();
    if (count > 0 && !site.registrationOpen) throw err(403, 'التسجيل مسكّر هلق');
    const admins = String(process.env.ADMIN_USERS || '').split(',').map((s) => normUsername(s)).filter(Boolean);
    const now = Date.now();
    let user;
    try {
      user = await ctx.store.createUser({
        id: crypto.randomBytes(8).toString('hex'), username, displayName, passHash: await hashPassword(body.password),
        role: count === 0 || admins.includes(username) ? 'admin' : 'user', bio: '', avatar: AVATARS[crypto.randomInt(AVATARS.length)],
        color: null, piece: null, points: 0, games: 0, wins: 0, banned: false, createdAt: now, lastSeen: now,
      });
    } catch (e) { if (e.code === 'dup') throw err(409, 'اسم المستخدم مأخود'); throw e; }
    await startSession(req, res, user);
    json(res, 200, { user: { ...publicUser(user), id: user.id } });
    return true;
  }
  if (p === '/api/auth/login') {
    const user = await ctx.store.getUserByName(normUsername(body.username));
    const ok = user && await verifyPassword(String(body.password || ''), user.passHash);
    if (!ok) throw err(401, 'اسم المستخدم أو كلمة السر غلط');
    if (user.banned) throw err(403, 'حسابك موقوف — تواصل مع الإدارة');
    await startSession(req, res, user);
    json(res, 200, { user: { ...publicUser(user), id: user.id } });
    return true;
  }
  if (p === '/api/auth/logout') {
    const t = readCookie(req, COOKIE);
    if (t) await ctx.store.deleteSession(tokenHash(t));
    setCookie(req, res, '', 0);
    json(res, 200, { ok: true });
    return true;
  }

  if (p === '/api/maps/buy') {
    const me = await currentUser(req);
    if (!me) throw err(401, 'لازم تسجّل دخول لتشتري');
    const m = (await mapsFor(me)).find((x) => x.id === String(body.id || '') && x.enabled);
    if (!m) throw err(404, 'الخريطة مو موجودة');
    if (m.owned) throw err(409, 'هالخريطة عندك من قبل');
    if (me.points < m.price) throw err(400, `ما معك نقاط كافية — بدك ${m.price} ⭐ ومعك ${me.points}`);
    const u = await ctx.store.addUserStats(me.id, -m.price, 0, 0);
    await ctx.store.addUserMap(me.id, m.id);
    json(res, 200, { ok: true, points: u.points, map: m.id });
    return true;
  }

  // ---- logged-in user's own account
  if (p.startsWith('/api/me/')) {
    const me = await currentUser(req);
    if (!me) throw err(401, 'لازم تسجّل دخول');
    if (p === '/api/me/update') {
      const patch = {};
      if ('displayName' in body) { patch.displayName = cleanText(body.displayName, 24); if (!patch.displayName) throw err(400, 'الاسم ما فيه يكون فاضي'); }
      if ('bio' in body) patch.bio = cleanBio(body.bio);
      if ('avatar' in body) { if (!AVATAR_KEYS.has(body.avatar)) throw err(400, 'صورة غير معروفة'); patch.avatar = body.avatar; }
      if ('color' in body) { if (body.color !== null && !COLORS.includes(body.color)) throw err(400, 'لون غير معروف'); patch.color = body.color; }
      if ('piece' in body) { if (body.piece !== null && !PIECES.includes(body.piece)) throw err(400, 'قطعة غير معروفة'); patch.piece = body.piece; }
      const user = await ctx.store.updateUser(me.id, patch);
      json(res, 200, { user: { ...publicUser(user), id: user.id } });
      return true;
    }
    if (p === '/api/me/password') {
      if (!await verifyPassword(String(body.current || ''), me.passHash)) throw err(400, 'كلمة السر الحالية غلط');
      checkPassword(body.next);
      await ctx.store.updateUser(me.id, { passHash: await hashPassword(body.next) });
      await ctx.store.deleteUserSessions(me.id);
      await startSession(req, res, me);
      json(res, 200, { ok: true });
      return true;
    }
    if (p === '/api/me/delete') {
      if (!await verifyPassword(String(body.password || ''), me.passHash)) throw err(400, 'كلمة السر غلط');
      await ctx.store.deleteUser(me.id);
      setCookie(req, res, '', 0);
      json(res, 200, { ok: true });
      return true;
    }
    throw notFound();
  }

  if (p.startsWith('/api/admin/')) { await adminPost(req, res, p, body); return true; }
  throw notFound();
}

// ---------------------------------------------------------------- admin
async function needAdmin(req) {
  const me = await currentUser(req);
  if (!me || me.role !== 'admin') throw notFound(); // looks like the page does not exist
  return me;
}
const audit = (me, action, target, detail) => ctx.store.addAudit({ adminId: me.id, adminName: me.username, action, target, detail });
function roomRow(r) {
  const host = r.players.find((p) => p.id === r.hostId);
  return {
    code: r.code, host: host ? host.name : '—', players: r.players.filter((p) => !p.left).map((p) => ({ name: p.name, bot: !!p.isBot, username: p.username || null })),
    status: r.status, round: r.game ? r.game.round : 0, createdAt: r.createdAt, startedAt: r.startedAt || null,
    isPrivate: !!r.settings.isPrivate, watchers: r.clients.size,
  };
}
async function adminGet(req, res, p, u) {
  await needAdmin(req);
  const { json } = ctx.helpers;
  if (p === '/api/admin/overview') {
    const rooms = [...ctx.rooms.values()];
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    json(res, 200, {
      users: await ctx.store.countUsers(),
      online: rooms.reduce((n, r) => n + r.clients.size, 0),
      roomsLive: rooms.length, roomsPlaying: rooms.filter((r) => r.status === 'playing').length,
      gamesToday: await ctx.store.countGames(today.getTime()), gamesTotal: await ctx.store.countGames(0),
      perDay: await ctx.store.gamesPerDay(14), backend: ctx.store.kind,
    });
    return;
  }
  if (p === '/api/admin/users') {
    const r = await ctx.store.listUsers({ q: cleanText(u.searchParams.get('q'), 40).toLowerCase(), limit: 100 });
    json(res, 200, { total: r.total, users: r.users.map(adminUser) });
    return;
  }
  if (p === '/api/admin/rooms') { json(res, 200, [...ctx.rooms.values()].map(roomRow)); return; }
  if (p === '/api/admin/settings') { const s = await getSite(); json(res, 200, { ...s, maps: M.publicMaps(await mapsConfig()) }); return; }
  if (p === '/api/admin/audit') { json(res, 200, await ctx.store.listAudit(200)); return; }
  throw notFound();
}
function int(v, min, max, msg) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw err(400, msg);
  return n;
}
function checkUrl(s, msg) {
  const v = String(s || '').trim();
  if (!v) return '';
  let url;
  try { url = new URL(v); } catch (e) { throw err(400, msg); }
  if (!['http:', 'https:'].includes(url.protocol)) throw err(400, msg);
  return url.toString();
}
async function adminPost(req, res, p, body) {
  const me = await needAdmin(req);
  const { json } = ctx.helpers;
  if (p === '/api/admin/user') {
    const target = await ctx.store.getUser(String(body.id || ''));
    if (!target) throw err(404, 'المستخدم مو موجود');
    const action = String(body.action || '');
    let extra = {};
    switch (action) {
      case 'ban':
        if (target.id === me.id) throw err(400, 'ما فيك توقف حسابك');
        // Sessions are kept so the banned person gets «حسابك موقوف» instead of silently playing as a guest.
        await ctx.store.updateUser(target.id, { banned: true });
        break;
      case 'unban': await ctx.store.updateUser(target.id, { banned: false }); break;
      case 'admin': await ctx.store.updateUser(target.id, { role: 'admin' }); break;
      case 'unadmin':
        if (target.id === me.id) throw err(400, 'ما فيك تشيل صلاحية الأدمن عن حالك');
        await ctx.store.updateUser(target.id, { role: 'user' });
        break;
      case 'resetPassword': {
        const temp = crypto.randomBytes(5).toString('hex');
        await ctx.store.updateUser(target.id, { passHash: await hashPassword(temp) });
        await ctx.store.deleteUserSessions(target.id);
        extra = { tempPassword: temp };
        break;
      }
      case 'points': {
        const delta = int(body.amount, -1000000, 1000000, 'عدد النقاط غير صحيح');
        if (!delta) throw err(400, 'اكتب عدد النقاط');
        const reason = cleanText(body.reason, 120);
        const u2 = await ctx.store.addUserStats(target.id, delta, 0, 0);
        await audit(me, 'points', target.username, { delta, reason, total: u2.points });
        json(res, 200, { ok: true, user: adminUser(u2) });
        return;
      }
      case 'delete':
        if (target.id === me.id) throw err(400, 'ما فيك تمسح حسابك من هون');
        await ctx.store.deleteUser(target.id);
        break;
      default: throw err(400, 'عملية غير معروفة');
    }
    await audit(me, action, target.username, null); // never log the temporary password
    const after = action === 'delete' ? null : await ctx.store.getUser(target.id);
    json(res, 200, { ok: true, user: after ? adminUser(after) : null, ...extra });
    return;
  }
  if (p === '/api/admin/room') {
    const room = ctx.rooms.get(String(body.code || '').toLowerCase());
    if (!room) throw err(404, 'الغرفة مو موجودة');
    if (body.action !== 'close') throw err(400, 'عملية غير معروفة');
    ctx.helpers.log(room, '⛔ أغلق الأدمن الغرفة');
    ctx.helpers.broadcast(room);
    ctx.helpers.closeRoom(room);
    await audit(me, 'closeRoom', room.code, null);
    json(res, 200, { ok: true });
    return;
  }
  if (p === '/api/admin/settings') {
    const cur = await getSite(), patch = {};
    if (body.announcement) patch.announcement = { on: !!body.announcement.on, text: cleanText(body.announcement.text, 300) };
    if ('maintenance' in body) patch.maintenance = !!body.maintenance;
    if ('registrationOpen' in body) patch.registrationOpen = !!body.registrationOpen;
    if (body.defaultRoom) {
      const d = body.defaultRoom, cash = ctx.helpers.cash;
      const startingCash = Number(d.startingCash ?? cur.defaultRoom.startingCash);
      if (!cash.includes(startingCash)) throw err(400, 'المبلغ الابتدائي لازم يكون من ' + cash.join('، '));
      const turnTimer = Number(d.turnTimer ?? cur.defaultRoom.turnTimer);
      if (!ctx.helpers.timers.includes(turnTimer)) throw err(400, 'وقت الدور غير صحيح');
      patch.defaultRoom = { startingCash, maxPlayers: int(d.maxPlayers ?? cur.defaultRoom.maxPlayers, 2, 8, 'عدد اللاعبين من 2 لـ 8'), turnTimer };
    }
    if (body.points) {
      patch.points = {
        perWin: int(body.points.perWin ?? cur.points.perWin, 0, 100000, 'نقاط الفوز غير صحيحة'),
        perGame: int(body.points.perGame ?? cur.points.perGame, 0, 100000, 'نقاط اللعب غير صحيحة'),
        stake: int(body.points.stake ?? cur.points.stake, 0, 100000, 'رهان اللعبة غير صحيح'),
      };
    }
    const s = await saveSite(patch);
    await audit(me, 'settings', null, patch);
    json(res, 200, s);
    return;
  }
  if (p === '/api/admin/ad') {
    const slot = String(body.slot || '');
    if (!AD_SLOTS.includes(slot)) throw err(400, 'مكان الإعلان غير معروف');
    const type = body.type === 'html' ? 'html' : 'image';
    const ad = {
      slot, enabled: !!body.enabled, type,
      image: checkUrl(body.image, 'رابط الصورة لازم يبلّش بـ http أو https'),
      link: checkUrl(body.link, 'رابط الإعلان لازم يبلّش بـ http أو https'),
      html: String(body.html || '').slice(0, 5000),
    };
    if (ad.enabled && type === 'image' && !ad.image) throw err(400, 'حط رابط الصورة');
    if (ad.enabled && type === 'html' && !ad.html.trim()) throw err(400, 'حط كود الإعلان');
    const ads = await ctx.store.getSetting('ads', {});
    ads[slot] = ad;
    await ctx.store.setSetting('ads', ads);
    siteCache = null;
    await audit(me, 'ad', slot, { enabled: ad.enabled, type });
    json(res, 200, await getSite());
    return;
  }
  if (p === '/api/admin/map') {
    const m = M.BY_ID[String(body.id || '')];
    if (!m) throw err(404, 'الخريطة مو موجودة');
    const cfg = await mapsConfig(), c = { ...(cfg[m.id] || {}) };
    if ('enabled' in body && m.id !== 'classic') c.enabled = !!body.enabled;
    if ('price' in body && m.id !== 'classic') c.price = int(body.price, 0, 1000000, 'السعر غير صحيح');
    cfg[m.id] = c;
    await ctx.store.setSetting('maps', cfg);
    await audit(me, 'map', m.id, c);
    json(res, 200, M.publicMaps(cfg));
    return;
  }
  if (p === '/api/admin/grantMap') {
    const m = M.BY_ID[String(body.id || '')];
    const target = await ctx.store.getUserByName(normUsername(body.username));
    if (!m) throw err(404, 'الخريطة مو موجودة');
    if (!target) throw err(404, 'المستخدم مو موجود');
    await ctx.store.addUserMap(target.id, m.id);
    await audit(me, 'grantMap', target.username, { map: m.id });
    json(res, 200, { ok: true });
    return;
  }
  if (p === '/api/admin/game') {
    const games = (await getSite()).games.map((g) => ({ ...g }));
    const g = games.find((x) => x.slug === String(body.slug || ''));
    if (!g) throw err(404, 'اللعبة مو موجودة');
    if ('enabled' in body) g.enabled = !!body.enabled;
    if ('name' in body) g.name = cleanText(body.name, 40) || g.name;
    if ('description' in body) g.description = cleanText(body.description, 160);
    await ctx.store.setSetting('games', games);
    siteCache = null;
    await audit(me, 'game', g.slug, { enabled: g.enabled, name: g.name });
    json(res, 200, await getSite());
    return;
  }
  throw notFound();
}

function init(c) { ctx = c; return ctx.store.init(); }

module.exports = { init, handle, currentUser, getSite, recordGame, publicUser, canUseMap, COLORS, PIECES };
