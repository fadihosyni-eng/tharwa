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
  { slug: 'tharwa', name: 'ثروة', description: 'لعبة المدن والعقارات — اشترِ، عمّر، وخلّي الكل يفلس', enabled: true, players: '2–8',
    minPlayers: 2, maxPlayers: 8, bots: true, tags: ['لوحية', 'استراتيجية', 'جماعية'], url: '/games/tharwa' },
  { slug: 'xo', name: 'إكس أو', description: 'تلاتة بخط واحد — جولة سريعة أو أفضل من 3 و5 جولات', enabled: true, players: '2',
    minPlayers: 2, maxPlayers: 2, bots: true, tags: ['سريعة', 'ذكاء', 'لاعبين اثنين'], url: '/games/xo' },
  { slug: 'connect4', name: 'أربعة بخط', description: 'نزّل الأقراص وصفّ أربعة بخط — أفقي، عمودي أو مايل', enabled: true, players: '2',
    minPlayers: 2, maxPlayers: 2, bots: true, tags: ['استراتيجية', 'ذكاء', 'لاعبين اثنين'], url: '/games/connect4' },
  { slug: 'ludo', name: 'لودو', description: 'ارمي النرد، طلّع قطعك واسبق الكل عالبيت — وكُل قطع غيرك', enabled: true, players: '2–4',
    minPlayers: 2, maxPlayers: 4, bots: true, tags: ['نرد', 'حظ', 'جماعية'], url: '/games/ludo' },
  { slug: 'tarneeb', name: 'طرنيب', description: 'شدّة بالفرق: اطلب اللمّات، اختار الطرنيب وجيب طلبك مع شريكك', enabled: true, players: '4',
    minPlayers: 4, maxPlayers: 4, bots: true, tags: ['cards', 'شدة', 'فرق', 'جماعية'], url: '/games/tarneeb' },
  { slug: '400', name: 'أربعمية', description: 'كل واحد بيطلب لمّاته والكبّة طرنيب دايماً — أول فريق بيوصل 41 بيربح', enabled: true, players: '4',
    minPlayers: 4, maxPlayers: 4, bots: true, tags: ['cards', 'شدة', 'فرق', 'جماعية'], url: '/games/400' },
  { slug: 'trix', name: 'تركس', description: '4 ممالك و5 ألعاب: الشيخ، البنات، الديناري، اللطوش والتركس', enabled: true, players: '4',
    minPlayers: 4, maxPlayers: 4, bots: true, tags: ['cards', 'شدة', 'جماعية'], url: '/games/trix' },
  { slug: 'konkan', name: 'كونكان', description: 'شدّتين وجوكرين: نزّل 51 بأول نزلة، ركّب على الكل وسكّر قبل غيرك', enabled: true, players: '2–4',
    minPlayers: 2, maxPlayers: 4, bots: true, tags: ['cards', 'شدة', 'جماعية'], url: '/games/konkan' },
];
// Saved games list (admin edits: enabled / name / description) on top of the defaults: new default
// games and new default fields still appear when an older list was saved before they existed.
function mergeGames(saved) {
  const list = Array.isArray(saved) ? saved.filter((g) => g && g.slug) : [];
  const out = GAMES_DEFAULT.map((d) => ({ ...d, ...(list.find((g) => g.slug === d.slug) || {}) }));
  for (const g of list) if (!GAMES_DEFAULT.some((d) => d.slug === g.slug)) out.push(g);
  return out;
}
const AD_DEFAULT = (slot) => ({ slot, enabled: false, type: 'image', image: '', link: '', html: '' });

let ctx; // { store, rooms, helpers: { httpErr, json, readBody, rateLimit, closeRoom, broadcast, log, cash, timers } }
let siteCache = null;

// ---------------------------------------------------------------- small helpers
const err = (status, msg) => ctx.helpers.httpErr(status, msg);
const notFound = () => err(404, 'الصفحة مو موجودة');
function cleanText(s, max) { return [...String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim()].slice(0, max).join(''); }
function cleanBio(s) { return [...String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '').trim()].slice(0, 160).join(''); }
function normUsername(s) { return String(s || '').trim().toLowerCase(); }
// Reserved names (admin, serva, …) are allowed only for names listed in ADMIN_USERS
// or when an admin renames an account ({ allowReserved: true }).
const adminList = () => String(process.env.ADMIN_USERS || '').split(',').map((s) => normUsername(s)).filter(Boolean);
function checkUsername(u, { allowReserved = false } = {}) {
  if (!/^[a-z0-9_]{3,20}$/.test(u)) throw err(400, 'اسم المستخدم لازم يكون من 3 لـ 20 حرف إنكليزي صغير أو رقم أو _');
  if (RESERVED.has(u) && !allowReserved && !adminList().includes(u)) throw err(400, 'هالاسم محجوز — اختار غيره');
}
const USERNAME_CHANGE_DAYS = 30;
// Email: trimmed, lower-cased, a sane shape, at most 254 characters.
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function checkEmail(e) {
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) throw err(400, 'الإيميل مو صحيح — مثلاً: name@gmail.com');
}
// «fa***@gmail.com» for lists; the full address only in the details view.
function maskEmail(e) {
  if (!e) return '';
  const [name, dom] = e.split('@');
  return name.slice(0, 2) + '***@' + dom;
}
const dupMsg = (e) => (e.field === 'email' ? 'هالإيميل مستعمل' : e.field === 'google' ? 'حساب Google هاد مربوط بحساب تاني' : 'اسم المستخدم مأخود');
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
// Behind Render / Cloudflare the proxy says the visitor's scheme in x-forwarded-proto (worker.js sets it from the URL).
const isHttps = (req) => !!(req.socket && req.socket.encrypted) || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
// Adds a cookie to the response (several Set-Cookie headers can be sent at once).
function addCookie(req, res, name, value, maxAgeSec, cookiePath = '/') {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${cookiePath}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isHttps(req)) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}
function setCookie(req, res, value, maxAgeSec) { addCookie(req, res, COOKIE, value, maxAgeSec); }
// What anyone may see about a user.
function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username, displayName: u.displayName, avatar: u.avatar, bio: u.bio, role: u.role,
    points: u.points, games: u.games, wins: u.wins, createdAt: u.createdAt, color: u.color, piece: u.piece,
  };
}
// What the user sees about their own account.
function selfUser(u) {
  return { ...publicUser(u), id: u.id, email: u.email || null, emailVerified: !!u.emailVerified, hasPassword: !!u.passHash, google: !!u.googleSub, usernameChangedAt: u.usernameChangedAt || null };
}
// What an admin sees in the users table (email masked; `full` only in the details view).
function adminUser(u, full = false) {
  return {
    id: u.id, ...publicUser(u), banned: !!u.banned, lastSeen: u.lastSeen,
    email: full ? u.email || null : maskEmail(u.email), emailVerified: !!u.emailVerified, google: !!u.googleSub, hasPassword: !!u.passHash,
  };
}

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
    games: mergeGames(games),
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
    maintenance: !!s.maintenance, registrationOpen: !!s.registrationOpen, googleEnabled: !!process.env.GOOGLE_CLIENT_ID,
    ads: s.ads.filter((a) => a.enabled && (a.type === 'html' ? a.html : a.image)),
    games: s.games.filter((g) => g.enabled).map((g) => ({
      ...g, live: g.slug === 'tharwa' ? players : (ctx.helpers.liveCount ? ctx.helpers.liveCount(g.slug) : 0),
    })),
  };
}

// ---------------------------------------------------------------- game results (called by server.js)
// Points move with results: every logged-in loser pays the stake (never below 0 points),
// the winner (if logged in) gets the stakes actually paid + the win bonus. Guests and bots
// neither pay nor get paid. The per-player change is stored with the result and shown in the room.
// A draw (no winner) moves no stake: everyone only gets perGame.
// Also used by lib/minigames.js with a room-like object: { code, gameSlug, players, game: { winner, round }, startedAt }.
async function recordGame(room) {
  const g = room.game, rules = (await getSite()).points;
  // One winner («ثروة», xo…) or a winning team (طرنيب، أربعمية: g.winners = both partners).
  const winIds = new Set(Array.isArray(g.winners) && g.winners.length ? g.winners : g.winner ? [g.winner] : []);
  const isWin = (p) => winIds.has(p.id);
  const winner = winIds.size ? room.players.find((p) => isWin(p)) : null;
  const humans = room.players.filter((p) => !p.isBot);
  const delta = {};
  let pot = 0;
  for (const p of humans) {
    if (!p.userId || isWin(p)) continue;
    const u = await ctx.store.getUser(p.userId);
    if (!u) continue;
    if (!winner) { delta[p.id] = rules.perGame || 0; continue; }
    const paid = Math.min(rules.stake || 0, Math.max(0, u.points + (rules.perGame || 0)));
    pot += paid;
    delta[p.id] = (rules.perGame || 0) - paid;
  }
  // Winners with an account share the stakes evenly (a team of two splits the pot).
  const paidWinners = humans.filter((p) => p.userId && isWin(p));
  paidWinners.forEach((p, i) => {
    const share = Math.floor(pot / paidWinners.length) + (i < pot % paidWinners.length ? 1 : 0);
    delta[p.id] = (rules.perGame || 0) + (rules.perWin || 0) + share;
  });
  for (const p of humans) {
    if (!p.userId || !(p.id in delta)) continue;
    const u = await ctx.store.addUserStats(p.userId, delta[p.id], 1, isWin(p) ? 1 : 0);
    if (u) p.points = u.points;
  }
  const players = room.players.map((p) => ({
    name: p.name, userId: p.userId || null, username: p.username || null, bot: !!p.isBot, won: isWin(p),
    delta: p.id in delta ? delta[p.id] : null,
  }));
  g.pointsResult = delta; // shown at the end of the game
  await ctx.store.addGameResult({
    roomCode: room.code, game: room.gameSlug || 'tharwa', map: room.gameSlug ? null : room.mapId || 'classic', players,
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
    json(res, 200, { user: me ? selfUser(me) : null });
    return true;
  }
  if (method === 'GET' && p.startsWith('/api/u/')) {
    const user = await ctx.store.getUserByName(normUsername(decodeURIComponent(p.slice(7))));
    if (!user) throw err(404, 'هالمستخدم مو موجود');
    const games = await ctx.store.listUserGames(user.id, 10);
    json(res, 200, {
      user: publicUser(user),
      recent: games.map((r) => ({
        at: r.createdAt, game: r.game || 'tharwa', rounds: r.rounds, durationMs: r.durationMs, players: r.players.length,
        // team games (طرنيب، أربعمية) store one winner name but mark both partners as won
        won: (r.players || []).some((x) => x.userId === user.id && x.won) || !!(r.winner && r.winner.userId === user.id), winner: r.winner ? r.winner.name : '',
      })),
    });
    return true;
  }
  if (method === 'GET' && p.startsWith('/api/auth/google/')) { await googleGet(req, res, p, u); return true; }
  if (method === 'GET' && p.startsWith('/api/admin/')) { await adminGet(req, res, p, u); return true; }
  if (method !== 'POST') throw err(405, 'مو مسموح');

  // ---- POST
  if (p === '/api/auth/register' || p === '/api/auth/login' || p === '/api/auth/google/complete') rateLimit(req, 'auth');
  const body = await readBody(req);

  if (p === '/api/auth/register') {
    const username = normUsername(body.username), email = normEmail(body.email);
    checkUsername(username); checkEmail(email); checkPassword(body.password);
    const user = await createAccount(req, { username, displayName: body.displayName, email, emailVerified: false, passHash: await hashPassword(body.password) });
    await startSession(req, res, user);
    json(res, 200, { user: selfUser(user) });
    return true;
  }
  if (p === '/api/auth/login') {
    // One field for both: «اسم المستخدم أو الإيميل».
    const id = normUsername(body.username || body.email);
    const user = id.includes('@') ? await ctx.store.getUserByEmail(normEmail(id)) : await ctx.store.getUserByName(id);
    const ok = user && user.passHash && await verifyPassword(String(body.password || ''), user.passHash);
    if (!ok) {
      if (user && !user.passHash && user.googleSub) throw err(401, 'هالحساب بيدخل بـ Google — اضغط «المتابعة بحساب Google»');
      throw err(401, 'اسم المستخدم/الإيميل أو كلمة السر غلط');
    }
    if (user.banned) throw err(403, 'حسابك موقوف — تواصل مع الإدارة');
    await startSession(req, res, user);
    json(res, 200, { user: selfUser(user) });
    return true;
  }
  if (p === '/api/auth/google/complete') {
    // Last step of a new Google sign-up: the person picks a username (and may edit the display name).
    const pend = takePending(req, false);
    if (!pend) throw err(400, 'انتهت مهلة التسجيل بـ Google — جرّب مرة تانية');
    const username = normUsername(body.username);
    checkUsername(username);
    const user = await createAccount(req, {
      username, displayName: body.displayName || pend.name, email: pend.email, emailVerified: true, passHash: null,
      googleSub: pend.sub, avatar: pend.picture || null,
    });
    takePending(req, true);
    addCookie(req, res, PENDING_COOKIE, '', 0);
    await startSession(req, res, user);
    json(res, 200, { user: selfUser(user) });
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
      if ('avatar' in body && body.avatar !== me.avatar) { if (!AVATAR_KEYS.has(body.avatar)) throw err(400, 'صورة غير معروفة'); patch.avatar = body.avatar; }
      if ('color' in body) { if (body.color !== null && !COLORS.includes(body.color)) throw err(400, 'لون غير معروف'); patch.color = body.color; }
      if ('piece' in body) { if (body.piece !== null && !PIECES.includes(body.piece)) throw err(400, 'قطعة غير معروفة'); patch.piece = body.piece; }
      if ('email' in body) {
        const email = normEmail(body.email);
        checkEmail(email);
        if (email !== me.email) {
          // Password accounts confirm with their password; Google-only accounts are already proven by Google.
          if (me.passHash && !await verifyPassword(String(body.password || ''), me.passHash)) throw err(400, 'كلمة السر غلط');
          patch.email = email; patch.emailVerified = false;
        }
      }
      let user;
      try { user = await ctx.store.updateUser(me.id, patch); } catch (e) { if (e.code === 'dup') throw err(409, dupMsg(e)); throw e; }
      json(res, 200, { user: selfUser(user) });
      return true;
    }
    if (p === '/api/me/username') {
      // Self-service rename: normal (non-reserved) names, once every 30 days.
      const username = normUsername(body.username);
      if (username === me.username) throw err(400, 'هاد اسمك الحالي');
      checkUsername(username);
      const next = (me.usernameChangedAt || 0) + USERNAME_CHANGE_DAYS * 86400000;
      if (Date.now() < next) throw err(429, `فيك تغيّر اسم المستخدم مرة كل ${USERNAME_CHANGE_DAYS} يوم — المرة الجاية بعد ${Math.ceil((next - Date.now()) / 86400000)} يوم`);
      let user;
      try { user = await ctx.store.updateUser(me.id, { username, usernameChangedAt: Date.now() }); } catch (e) { if (e.code === 'dup') throw err(409, dupMsg(e)); throw e; }
      json(res, 200, { user: selfUser(user) });
      return true;
    }
    if (p === '/api/me/password') {
      // Google-only accounts (no password yet) can set one without the current password.
      if (me.passHash && !await verifyPassword(String(body.current || ''), me.passHash)) throw err(400, 'كلمة السر الحالية غلط');
      checkPassword(body.next);
      await ctx.store.updateUser(me.id, { passHash: await hashPassword(body.next) });
      await ctx.store.deleteUserSessions(me.id);
      await startSession(req, res, me);
      json(res, 200, { ok: true });
      return true;
    }
    if (p === '/api/me/delete') {
      if (me.passHash ? !await verifyPassword(String(body.password || ''), me.passHash) : normUsername(body.password) !== me.username) {
        throw err(400, me.passHash ? 'كلمة السر غلط' : 'اكتب اسم المستخدم تبعك للتأكيد');
      }
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

// ---------------------------------------------------------------- account creation (password or Google)
async function createAccount(req, a) {
  const count = await ctx.store.countUsers();
  const site = await getSite();
  if (count > 0 && !site.registrationOpen) throw err(403, 'التسجيل مسكّر هلق');
  const admins = String(process.env.ADMIN_USERS || '').split(',').map((s) => normUsername(s)).filter(Boolean);
  const now = Date.now();
  try {
    return await ctx.store.createUser({
      id: crypto.randomBytes(8).toString('hex'), username: a.username, displayName: cleanText(a.displayName, 24) || a.username,
      passHash: a.passHash, email: a.email || null, emailVerified: !!a.emailVerified, googleSub: a.googleSub || null,
      role: count === 0 || admins.includes(a.username) ? 'admin' : 'user', bio: '', avatar: a.avatar || AVATARS[crypto.randomInt(AVATARS.length)],
      color: null, piece: null, points: 0, games: 0, wins: 0, banned: false, createdAt: now, lastSeen: now,
    });
  } catch (e) { if (e.code === 'dup') throw err(409, dupMsg(e)); throw e; }
}

// ---------------------------------------------------------------- Google sign-in (OpenID Connect, code flow + PKCE)
// Flow: /api/auth/google/start -> Google -> /api/auth/google/callback
//   known Google account -> log in · same verified email -> link + log in · new -> /register?google=1 (pick a username)
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const FLOW_COOKIE = 'tharwa_gflow', PENDING_COOKIE = 'tharwa_gpend';
const pending = new Map(); // token -> { sub, email, name, picture, exp } (new Google sign-ups, 15 min)
let googleFetch = (url, opts) => fetch(url, opts);
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function publicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = isHttps(req) ? 'https' : 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}
const redirectUri = (req) => publicUrl(req) + '/api/auth/google/callback';
function redirect(res, to) { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); }
const loginErr = (res, code) => redirect(res, '/login?err=' + encodeURIComponent(code));
function takePending(req, remove) {
  const t = readCookie(req, PENDING_COOKIE);
  const p = t && pending.get(t);
  if (!p || p.exp < Date.now()) { if (t) pending.delete(t); return null; }
  if (remove) pending.delete(t);
  return p;
}
let pendingTimer = null; // started by init(), not at load time (Cloudflare Workers forbid timers at global scope)
function cleanPending() { const now = Date.now(); for (const [k, v] of pending) if (v.exp < now) pending.delete(k); }
// Reads the claims of Google's ID token (it comes straight from Google over TLS in the code exchange).
function idTokenClaims(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64').toString('utf8')); } catch (e) { return null; }
}

async function googleGet(req, res, p, u) {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (p === '/api/auth/google/pending') {
    const pend = takePending(req, false);
    ctx.helpers.json(res, 200, pend ? { email: pend.email, name: pend.name, picture: pend.picture } : null);
    return;
  }
  try { ctx.helpers.rateLimit(req, 'google'); } catch (e) { loginErr(res, 'rate'); return; }
  if (!id) { loginErr(res, 'off'); return; }
  if (p === '/api/auth/google/start') {
    const state = b64url(crypto.randomBytes(24)), verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const link = u.searchParams.get('link') === '1' ? '1' : '0';
    addCookie(req, res, FLOW_COOKIE, `${state}.${verifier}.${link}`, 600, '/api/auth/google');
    const q = new URLSearchParams({
      client_id: id, redirect_uri: redirectUri(req), response_type: 'code', scope: 'openid email profile',
      state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
    });
    redirect(res, `${GOOGLE_AUTH}?${q}`);
    return;
  }
  if (p !== '/api/auth/google/callback') throw notFound();
  const flow = String(readCookie(req, FLOW_COOKIE) || '').split('.');
  addCookie(req, res, FLOW_COOKIE, '', 0, '/api/auth/google');
  if (u.searchParams.get('error')) { loginErr(res, 'cancel'); return; }
  const [state, verifier, link] = flow;
  if (!state || !verifier || u.searchParams.get('state') !== state) { loginErr(res, 'state'); return; }
  let info;
  try {
    const tr = await googleFetch(GOOGLE_TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: String(u.searchParams.get('code') || ''), client_id: id, client_secret: secret || '', redirect_uri: redirectUri(req), grant_type: 'authorization_code', code_verifier: verifier }).toString(),
    });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) throw new Error('token');
    const claims = idTokenClaims(tok.id_token);
    if (!claims || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== id || Number(claims.exp) * 1000 < Date.now()) throw new Error('claims');
    const ur = await googleFetch(GOOGLE_USERINFO, { headers: { Authorization: 'Bearer ' + tok.access_token } });
    info = await ur.json();
    if (!ur.ok || !info.sub || info.sub !== claims.sub) throw new Error('userinfo');
  } catch (e) { loginErr(res, 'google'); return; }
  const email = normEmail(info.email);
  if (!info.email_verified || !EMAIL_RE.test(email)) { loginErr(res, 'unverified'); return; }

  // Linking from settings (already logged in).
  const me = await currentUser(req);
  if (link === '1' && me) {
    const other = await ctx.store.getUserByGoogle(info.sub);
    if (other && other.id !== me.id) { redirect(res, '/settings?gerr=taken'); return; }
    const patch = { googleSub: info.sub };
    if (!me.email) { patch.email = email; patch.emailVerified = true; } else if (me.email === email) patch.emailVerified = true;
    try { await ctx.store.updateUser(me.id, patch); } catch (e) { redirect(res, '/settings?gerr=taken'); return; }
    redirect(res, '/settings?glinked=1');
    return;
  }
  let user = await ctx.store.getUserByGoogle(info.sub);
  if (!user) {
    const byEmail = await ctx.store.getUserByEmail(email);
    if (byEmail && byEmail.banned) { loginErr(res, 'banned'); return; }
    if (byEmail) user = await ctx.store.updateUser(byEmail.id, { googleSub: info.sub, emailVerified: true });
  }
  if (user) {
    if (user.banned) { loginErr(res, 'banned'); return; }
    await startSession(req, res, user);
    redirect(res, '/');
    return;
  }
  // New person: remember who they are for 15 minutes and ask for a username.
  const t = crypto.randomBytes(24).toString('hex');
  const picture = /^https:\/\/lh3\.googleusercontent\.com\/[\w\-./=%]+$/.test(String(info.picture || '')) ? info.picture : null;
  pending.set(t, { sub: info.sub, email, name: cleanText(info.name, 24), picture, exp: Date.now() + 15 * 60000 });
  addCookie(req, res, PENDING_COOKIE, t, 15 * 60);
  redirect(res, '/register?google=1');
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
    // «ثروة» rooms live in ctx.rooms; the mini/card games (إكس أو، لودو، طرنيب…) in lib/minigames.js
    const perGame = [{ slug: 'tharwa', name: 'ثروة', rooms: rooms.length, playing: rooms.filter((r) => r.status === 'playing').length, clients: rooms.reduce((n, r) => n + r.clients.size, 0) },
      ...(ctx.helpers.roomStats ? ctx.helpers.roomStats() : [])].filter((g) => g.rooms > 0);
    const sum = (k) => perGame.reduce((n, g) => n + g[k], 0);
    json(res, 200, {
      users: await ctx.store.countUsers(),
      online: sum('clients'),
      roomsLive: sum('rooms'), roomsPlaying: sum('playing'), perGame: perGame.map(({ clients, ...g }) => g),
      gamesToday: await ctx.store.countGames(today.getTime()), gamesTotal: await ctx.store.countGames(0),
      perDay: await ctx.store.gamesPerDay(14), backend: ctx.store.kind,
    });
    return;
  }
  if (p === '/api/admin/users') {
    const r = await ctx.store.listUsers({ q: cleanText(u.searchParams.get('q'), 40).toLowerCase(), limit: 100 });
    json(res, 200, { total: r.total, users: r.users.map((x) => adminUser(x)) });
    return;
  }
  if (p === '/api/admin/user') {
    const target = await ctx.store.getUser(String(u.searchParams.get('id') || ''));
    if (!target) throw err(404, 'المستخدم مو موجود');
    json(res, 200, adminUser(target, true));
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
      case 'rename': {
        // Admins may give any valid name, including reserved ones (e.g. «serva»).
        const username = normUsername(body.username);
        checkUsername(username, { allowReserved: true });
        try { await ctx.store.updateUser(target.id, { username }); } catch (e) { if (e.code === 'dup') throw err(409, dupMsg(e)); throw e; }
        await audit(me, 'rename', target.username, { to: username });
        json(res, 200, { ok: true, user: adminUser(await ctx.store.getUser(target.id)) });
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

function init(c) {
  ctx = c;
  if (!pendingTimer) { pendingTimer = setInterval(cleanPending, 60000); if (pendingTimer.unref) pendingTimer.unref(); }
  return ctx.store.init();
}

module.exports = { init, handle, currentUser, getSite, recordGame, publicUser, canUseMap, COLORS, PIECES };
// Tests only: replace the calls to Google's servers with a fake.
if (process.env.NODE_ENV === 'test') module.exports.__setGoogleFetch = (fn) => { googleFetch = fn; };
