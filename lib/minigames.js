'use strict';
// Room manager for the small online games in games/ (إكس أو، أربعة بخط، لودو).
// Same model as «ثروة» rooms in server.js: rooms live in memory, one SSE stream per viewer,
// actions are POSTed. API (all under /api/g/):
//   POST create {game, name, isPrivate?, vsBot?, players?, bestOf?} -> {code, pid, token}
//   POST join   {code, name}                                       -> {code, pid, token, game}
//   POST quick  {game, name}                                       -> {code, pid, token}   (open public room or a new one)
//   GET  rooms?game=slug                                           -> [{code, game, players, max, status, host}]
//   GET  room?code=                                                -> {code, game, status, players, max}
//   GET  events?code=&pid=&token=   (SSE; without pid/token = spectator)
//   POST act    {code, pid, token, type, ...}  type: start | addBot | kick {target} | opts {max?, bestOf?} | rematch | leave
//                                              | chat {text} | game moves: xo {type:'place', cell} · connect4 {type:'drop', col}
//                                              · ludo {type:'roll'} / {type:'move', piece}  (piece = 0..3)
// Nothing runs at load time: server.js calls init(helpers) and start() inside its own start().
const crypto = require('crypto');
const G = require('../games');
const A = require('./accounts');

const MAX_ROOMS = 300;
const MAX_CLIENTS_PER_ROOM = 40;
const LOBBY_DROP_MS = 30000;       // a disconnected player leaves the lobby after this
const IDLE_ROOM_MS = 10 * 60000;   // a room nobody watches is closed after this
const AUTO_AFTER_TIMEOUTS = 2;     // after this many missed turns in a row the player is auto-played
const CHAT_KEEP = 60;
const BOT_NAMES = ['سامي', 'ليلى', 'كريم', 'هدى', 'ماهر', 'رنا', 'زيد', 'نور'];
// Seat colours. Ludo colours follow the board corner (red, green, yellow, blue).
const PALETTE = {
  xo: ['#2fe2ff', '#ffc53d'],
  connect4: ['#f0585e', '#ffc53d'],
  ludo: ['#f0585e', '#38c172', '#ffc53d', '#4f9df7'],
  // Card games: partners share a colour (seats 1+3 vs 2+4); trix is every player for themselves.
  tarneeb: ['#2fe2ff', '#ffc53d', '#2fe2ff', '#ffc53d'],
  400: ['#2fe2ff', '#ffc53d', '#2fe2ff', '#ffc53d'],
  trix: ['#2fe2ff', '#ffc53d', '#a78bfa', '#5ad06b'],
};

let H = null;                      // helpers from server.js: { httpErr, json, readBody, rateLimit }
const rooms = new Map();
let clock = null;

const ssePing = () => Number(process.env.SSE_PING_MS) || 20000;
const err = (status, msg) => (H ? H.httpErr(status, msg) : Object.assign(new Error(msg), { status, userMsg: msg }));
const uid = () => crypto.randomBytes(6).toString('hex');
const newToken = () => crypto.randomBytes(16).toString('hex');
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
const humans = (room) => room.players.filter((p) => !p.isBot);
const seated = (room) => room.players.filter((p) => !p.left);

// ---------------------------------------------------------------- rooms & players
function newRoom(mod, { isPrivate, max, opts }) {
  if (rooms.size >= MAX_ROOMS) throw err(503, 'السيرفر مليان هلق — جرّب بعد شوي');
  const room = {
    code: roomCode(), slug: mod.slug, mod, hostId: null, isPrivate: !!isPrivate,
    max: Math.min(mod.maxPlayers, Math.max(mod.minPlayers, Math.floor(Number(max)) || mod.maxPlayers)),
    opts: cleanOpts(mod, opts), status: 'lobby', players: [], clients: new Set(), chat: [],
    state: null, seq: 0, ev: [], createdAt: Date.now(), lastActive: Date.now(), timer: null, deadline: 0,
    recorded: false, result: null, points: null, rematch: new Set(), startedAt: 0, played: 0,
  };
  rooms.set(room.code, room);
  return room;
}
function cleanOpts(mod, o = {}) {
  const out = {};
  if (mod.options && mod.options.bestOf) out.bestOf = mod.options.bestOf.includes(Number(o.bestOf)) ? Number(o.bestOf) : 1;
  return out;
}
function addPlayer(room, name, isBot, user) {
  const p = {
    id: uid(), token: isBot ? null : newToken(), name: cleanName(user ? user.displayName : name), avatar: user ? user.avatar : null,
    isBot: !!isBot, conns: 0, lastSeen: Date.now(), left: false, afk: 0, auto: false,
  };
  if (user) Object.assign(p, { userId: user.id, username: user.username, points: user.points });
  room.players.push(p);
  if (!room.hostId && !isBot) room.hostId = p.id;
  room.lastActive = Date.now();
  return p;
}
function addBot(room) {
  const used = new Set(room.players.map((x) => x.name));
  const name = BOT_NAMES.map((n) => 'بوت ' + n).find((n) => !used.has(n)) || 'بوت';
  return addPlayer(room, name, true);
}
function pickHost(room) {
  if (room.players.some((p) => p.id === room.hostId && !p.left)) return;
  const h = room.players.find((p) => !p.isBot && !p.left);
  room.hostId = h ? h.id : null;
}
function closeRoom(room) {
  clearTimeout(room.timer);
  for (const c of room.clients) { try { c.res.write('event: gone\ndata: {}\n\n'); c.res.end(); } catch (e) { /* closed */ } }
  room.clients.clear();
  rooms.delete(room.code);
}
// Removes a player from a lobby / finished room. Returns false when the room was closed.
function removePlayer(room, pid) {
  room.players = room.players.filter((p) => p.id !== pid);
  room.rematch.delete(pid);
  pickHost(room);
  if (!room.players.some((p) => !p.isBot && !p.left)) { closeRoom(room); return false; }
  return true;
}
function sysChat(room, text) {
  room.chat.push({ pid: null, name: '', text, t: Date.now() });
  if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
}

// ---------------------------------------------------------------- views
function seatColor(room, pid, index) {
  const pal = PALETTE[room.slug] || PALETTE.xo;
  const st = room.state;
  if (st) {
    const k = st.seats.indexOf(pid);
    if (k >= 0) return pal[st.corners ? st.corners[k] : k];
  }
  return pal[index % pal.length];
}
function publicRoom(room, viewer) {
  const st = room.state;
  const cur = room.status === 'playing' && st ? room.mod.current(st) : null;
  return {
    code: room.code, game: room.slug, name: room.mod.name, status: room.status, hostId: room.hostId, isPrivate: room.isPrivate,
    min: room.mod.minPlayers, max: room.max, opts: room.opts, now: Date.now(), me: viewer || null,
    players: room.players.map((p, i) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: seatColor(room, p.id, i), isBot: p.isBot, connected: p.isBot || p.conns > 0,
      left: p.left, auto: p.auto, username: p.username || null, points: p.userId ? p.points || 0 : null,
      seat: st ? st.seats.indexOf(p.id) : -1,
    })),
    state: st ? room.mod.view(st, viewer) : null,
    turn: cur ? { pid: cur, endsAt: room.deadline || null, ms: room.mod.turnMs } : null,
    result: room.result ? { ...room.result, points: room.points } : null,
    rematch: [...room.rematch], seq: room.seq, ev: room.ev, chat: room.chat.slice(-40),
  };
}
function broadcast(room) {
  if (!rooms.has(room.code)) return;
  for (const c of room.clients) {
    try { c.res.write('event: state\ndata: ' + JSON.stringify(publicRoom(room, c.pid)) + '\n\n'); } catch (e) { /* closed */ }
  }
}

// ---------------------------------------------------------------- game flow
function startGame(room) {
  const list = seated(room);
  if (list.length < room.mod.minPlayers) throw err(409, `بدك ${room.mod.minPlayers} لاعبين على الأقل`);
  // Seats rotate every new game so the first move changes hands.
  const shift = room.played % list.length;
  const order = list.slice(shift).concat(list.slice(0, shift));
  room.players = room.players.filter((p) => !p.left);
  for (const p of room.players) { p.afk = 0; p.auto = false; }
  room.state = room.mod.setup(order.map((p) => p.id), room.opts);
  room.status = 'playing';
  room.startedAt = Date.now();
  room.recorded = false; room.result = null; room.points = null;
  room.rematch.clear();
  room.played++;
  room.seq++; room.ev = [{ t: 'start' }];
  sysChat(room, 'بلّشت اللعبة');
  resetDeadline(room);
  schedule(room);
}
// How long the clients need to show the last events (dice spin, token steps) before the next auto move.
function animMs(room) {
  let ms = 0;
  for (const e of room.ev) {
    if (e.t === 'roll') ms += 1000;
    else if (e.t === 'move') ms += (e.from < 0 ? 1 : e.to - e.from) * 140 + 150;
    else if (e.t === 'capture') ms += 400;
    else if (e.t === 'drop') ms += 450;
    else if (e.t === 'round') ms += 1500;  // إكس أو: the finished round stays on screen before the fresh board
    // card games: a card flies to the table, a full trick is swept to its winner, a new deal, the hand summary
    else if (e.t === 'play' || e.t === 'lay') ms += 300;
    else if (e.t === 'trick') ms += 1100;
    else if (e.t === 'deal') ms += 900;
    else if (e.t === 'hand') ms += 1500;
  }
  return ms;
}
function resetDeadline(room) {
  const pid = room.status === 'playing' ? room.mod.current(room.state) : null;
  const p = pid && room.players.find((x) => x.id === pid);
  room.deadline = p && !p.isBot && !p.auto && !p.left ? Date.now() + room.mod.turnMs + animMs(room) : 0;
}
function schedule(room) {
  clearTimeout(room.timer);
  room.timer = null;
  if (room.status !== 'playing' || !rooms.has(room.code)) return;
  if (!room.players.some((p) => !p.isBot && !p.left && p.conns > 0)) return; // pause while nobody is watching
  const pid = room.mod.current(room.state);
  const p = room.players.find((x) => x.id === pid);
  if (!p) return;
  const auto = p.isBot || p.auto || p.left;
  const delay = auto ? 650 + Math.floor(Math.random() * 350) + animMs(room) : Math.max(0, room.deadline - Date.now());
  room.timer = setTimeout(() => {
    room.timer = null;
    if (!rooms.has(room.code) || room.status !== 'playing' || room.mod.current(room.state) !== pid) return;
    if (!auto) {
      p.afk++;
      if (p.afk >= AUTO_AFTER_TIMEOUTS && !p.auto) { p.auto = true; sysChat(room, `${p.name} مو موجود — اللعبة عم تلعب عنه`); }
    }
    const a = room.mod.botAction(room.state, pid);
    if (!a) return;
    try { play(room, p, a); } catch (e) { console.warn('[minigames] auto move rejected', room.slug, e.userMsg || e.message); }
  }, delay);
}
function play(room, p, action) {
  const events = room.mod.apply(room.state, p.id, action);
  room.seq++;
  room.ev = events;
  room.lastActive = Date.now();
  afterMove(room);
}
function afterMove(room) {
  const res = room.mod.result(room.state);
  if (res) finish(room, res);
  else { resetDeadline(room); schedule(room); }
  broadcast(room);
}
function finish(room, res) {
  clearTimeout(room.timer); room.timer = null;
  room.status = 'ended'; room.deadline = 0;
  room.result = res;
  sysChat(room, 'خلصت اللعبة');
  if (room.recorded) return;
  room.recorded = true;
  // The account side (points, stats, history) is the same code «ثروة» uses: losers pay the stake to the winner.
  const shim = {
    code: room.code, gameSlug: room.slug, mapId: null, startedAt: room.startedAt,
    players: room.players, game: { winner: res.winner, winners: res.winners || null, round: res.rounds || 0 },
  };
  A.recordGame(shim).then(() => { room.points = shim.game.pointsResult || null; broadcast(room); })
    .catch((e) => console.error('[minigames results]', e.message));
}
function leaveRoom(room, p) {
  if (room.status === 'playing') {
    p.left = true;
    room.rematch.delete(p.id);
    sysChat(room, `${p.name} طلع من اللعبة`);
    const events = room.mod.leave(room.state, p.id);
    room.seq++; room.ev = events;
    pickHost(room);
    if (!room.players.some((x) => !x.isBot && !x.left)) {
      const res = room.mod.result(room.state);
      if (res) finish(room, res);
      closeRoom(room);
      return false;
    }
    afterMove(room);
    return true;
  }
  sysChat(room, `${p.name} طلع من الغرفة`);
  const still = removePlayer(room, p.id);
  if (still && room.status === 'ended') voteCheck(room);
  return still;
}
// «جولة كمان»: every human still in the room has to agree; then the same table plays again.
function voteRematch(room, p) {
  if (room.status !== 'ended') throw err(409, 'اللعبة لسا ما خلصت');
  room.rematch.add(p.id);
  room.players = room.players.filter((x) => !x.left);
  pickHost(room);
  const waiting = room.players.filter((x) => !x.isBot && !room.rematch.has(x.id));
  if (waiting.length) return;
  if (room.players.length >= room.mod.minPlayers) startGame(room);
  else { room.status = 'lobby'; room.state = null; room.result = null; room.points = null; room.rematch.clear(); room.seq++; room.ev = []; }
}

function roomAct(room, p, body) {
  const type = String(body.type || '');
  const host = room.hostId === p.id;
  const needHost = () => { if (!host) throw err(403, 'بس صاحب الغرفة بيقدر يعمل هالشي'); };
  const needLobby = () => { if (room.status !== 'lobby') throw err(409, 'اللعبة بلّشت'); };
  switch (type) {
    case 'start': needHost(); needLobby(); startGame(room); return;
    case 'addBot':
      needHost(); needLobby();
      if (room.players.length >= room.max) throw err(409, 'الغرفة مليانة');
      sysChat(room, `انضاف ${addBot(room).name}`);
      return;
    case 'kick': {
      needHost(); needLobby();
      const t = room.players.find((x) => x.id === body.target);
      if (!t || t.id === p.id) throw err(400, 'ما فيك تطلّع هاللاعب');
      sysChat(room, `${t.name} انطلع من الغرفة`);
      removePlayer(room, t.id);
      return;
    }
    case 'opts': {
      needHost(); needLobby();
      if ('max' in body) {
        const n = Math.floor(Number(body.max));
        if (!(n >= room.mod.minPlayers && n <= room.mod.maxPlayers)) throw err(400, 'عدد اللاعبين غلط');
        if (n < room.players.length) throw err(400, 'في لاعبين أكتر من هالعدد بالغرفة');
        room.max = n;
      }
      if ('bestOf' in body) room.opts = cleanOpts(room.mod, { ...room.opts, bestOf: body.bestOf });
      return;
    }
    case 'rematch': voteRematch(room, p); return;
    case 'leave': leaveRoom(room, p); return;
    case 'chat': {
      const text = String(body.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
      if (!text) return;
      const now = Date.now();
      if (p.lastChat && now - p.lastChat < 400) throw err(429, 'شوي شوي عالرسائل');
      p.lastChat = now;
      room.chat.push({ pid: p.id, name: p.name, text, t: now });
      if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
      return;
    }
    default: {
      if (room.status !== 'playing') throw err(409, 'اللعبة مو شغالة');
      if (p.left) throw err(409, 'طلعت من هاللعبة');
      p.afk = 0; p.auto = false; // the player is back
      const { code, pid, token, type: t, ...rest } = body;
      play(room, p, { type: t, ...rest });
    }
  }
}

// ---------------------------------------------------------------- HTTP
function getRoom(code) {
  const room = rooms.get(String(code || '').toLowerCase());
  if (!room) throw err(404, 'الغرفة مو موجودة أو انتهت');
  return room;
}
function auth(room, pid, tok) {
  const p = room.players.find((x) => x.id === pid);
  if (!p || p.isBot || !tok || p.token !== tok) throw err(403, 'مو مسجّل بهالغرفة');
  return p;
}
async function roomUser(req) {
  const u = await A.currentUser(req, { allowBanned: true });
  if (u && u.banned) throw err(403, 'حسابك موقوف — ما فيك تدخل غرف');
  return u;
}
// The game must exist and be switched on in the admin's games list; maintenance blocks new rooms.
async function gameFor(slug, user) {
  const mod = G.get(slug);
  if (!mod) throw err(400, 'لعبة غير معروفة');
  const site = await A.getSite();
  if (site.maintenance && !(user && user.role === 'admin')) throw err(503, 'الموقع بالصيانة هلق — جرّب بعد شوي');
  const entry = (site.games || []).find((g) => g.slug === mod.slug);
  if (entry && entry.enabled === false) throw err(403, 'هاللعبة مسكّرة هلق');
  return mod;
}
function openRooms(slug) {
  return [...rooms.values()]
    .filter((r) => (!slug || r.slug === slug) && !r.isPrivate && (r.status === 'lobby' || r.status === 'playing'))
    .sort((a, b) => (a.status === 'lobby' ? 0 : 1) - (b.status === 'lobby' ? 0 : 1) || b.createdAt - a.createdAt)
    .slice(0, 30)
    .map((r) => {
      const host = r.players.find((p) => p.id === r.hostId);
      return { code: r.code, game: r.slug, players: seated(r).length, max: r.max, status: r.status, host: host ? host.name : '' };
    });
}
function joinExisting(room, user) {
  if (!user) return null;
  return room.players.find((p) => p.userId === user.id && !p.left) || null;
}
function join(room, name, user) {
  const again = joinExisting(room, user);
  if (again) return again;
  if (room.status !== 'lobby') throw err(409, 'اللعبة بلّشت — فيك تتفرّج بس');
  if (room.players.length >= room.max) throw err(409, 'الغرفة مليانة');
  const p = addPlayer(room, name, false, user);
  sysChat(room, `${p.name} دخل الغرفة`);
  broadcast(room);
  return p;
}

function sse(req, res, u) {
  const room = rooms.get(String(u.searchParams.get('code') || '').toLowerCase());
  if (!room) { H.json(res, 404, { error: 'gone' }); return; }
  if (room.clients.size >= MAX_CLIENTS_PER_ROOM) { H.json(res, 429, { error: 'الغرفة فيها متفرجين كتير' }); return; }
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
  res.write('event: state\ndata: ' + JSON.stringify(publicRoom(room, client.pid)) + '\n\n');
  if (p && p.conns === 1) { broadcast(room); if (!room.timer) schedule(room); }
  const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch (e) { /* closed */ } }, ssePing());
  let gone = false;
  const onGone = () => {
    if (gone) return;
    gone = true;
    clearInterval(ka);
    room.clients.delete(client);
    if (p) { p.conns = Math.max(0, p.conns - 1); p.lastSeen = Date.now(); }
    room.lastActive = Date.now();
    if (rooms.has(room.code)) broadcast(room);
  };
  req.on('close', onGone);
  res.on('close', onGone);
}

// Returns true when the request was ours (/api/g/*).
async function handle(req, res, u) {
  const path = u.pathname;
  if (!path.startsWith('/api/g/')) return false;
  const { json, readBody, rateLimit } = H;
  if (req.method === 'GET') {
    if (path === '/api/g/events') { sse(req, res, u); return true; }
    if (path === '/api/g/rooms') {
      const slug = u.searchParams.get('game');
      if (slug && !G.get(slug)) throw err(400, 'لعبة غير معروفة');
      json(res, 200, openRooms(slug));
      return true;
    }
    if (path === '/api/g/room') {
      const room = getRoom(u.searchParams.get('code'));
      json(res, 200, { code: room.code, game: room.slug, status: room.status, players: seated(room).length, max: room.max, isPrivate: room.isPrivate });
      return true;
    }
    throw err(404, 'مو موجود');
  }
  if (req.method !== 'POST') throw err(405, 'طريقة غير مسموحة');
  if (['/api/g/create', '/api/g/join', '/api/g/quick'].includes(path)) rateLimit(req, 'g');
  const body = await readBody(req);
  if (path === '/api/g/create') {
    const user = await roomUser(req);
    const mod = await gameFor(body.game, user);
    const vsBot = !!body.vsBot;
    const room = newRoom(mod, { isPrivate: vsBot || !!body.isPrivate, max: body.players, opts: body });
    const p = addPlayer(room, body.name, false, user);
    sysChat(room, `${p.name} عمل الغرفة`);
    if (vsBot) {
      while (room.players.length < room.max) addBot(room);
      startGame(room);
    }
    json(res, 200, { code: room.code, pid: p.id, token: p.token });
    return true;
  }
  if (path === '/api/g/quick') {
    const user = await roomUser(req);
    const mod = await gameFor(body.game, user);
    const open = [...rooms.values()]
      .filter((r) => r.slug === mod.slug && !r.isPrivate && r.status === 'lobby' && r.players.length < r.max)
      .sort((a, b) => b.players.length - a.players.length)[0];
    const room = open || newRoom(mod, { isPrivate: false, max: mod.maxPlayers, opts: {} });
    const p = open ? join(room, body.name, user) : addPlayer(room, body.name, false, user);
    if (!open) sysChat(room, `${p.name} عمل الغرفة`);
    json(res, 200, { code: room.code, pid: p.id, token: p.token });
    return true;
  }
  if (path === '/api/g/join') {
    const user = await roomUser(req);
    const room = getRoom(body.code);
    await gameFor(room.slug, user);
    const p = join(room, body.name, user);
    json(res, 200, { code: room.code, pid: p.id, token: p.token, game: room.slug });
    return true;
  }
  if (path === '/api/g/act') {
    const room = getRoom(body.code);
    const p = auth(room, body.pid, body.token);
    room.lastActive = Date.now();
    roomAct(room, p, body);
    if (rooms.has(room.code)) broadcast(room);
    json(res, 200, { ok: true });
    return true;
  }
  throw err(404, 'مو موجود');
}

// ---------------------------------------------------------------- clock
function tick() {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    let changed = false;
    if (room.status === 'lobby' || room.status === 'ended') {
      for (const p of [...room.players]) {
        if (!p.isBot && p.conns === 0 && now - p.lastSeen > LOBBY_DROP_MS) {
          if (room.status === 'lobby') sysChat(room, `${p.name} طلع (انقطع الاتصال)`);
          changed = true;
          if (!removePlayer(room, p.id)) break;
        }
      }
      if (!rooms.has(room.code)) continue;
    }
    if (room.status === 'playing' && !room.timer) schedule(room);
    if (room.clients.size === 0 && now - room.lastActive > IDLE_ROOM_MS) { closeRoom(room); continue; }
    if (changed) {
      if (room.status === 'ended') voteCheck(room);
      broadcast(room);
    }
  }
}
// After someone dropped out of a finished room, the remaining votes may already be enough.
function voteCheck(room) {
  if (room.rematch.size && !room.players.some((x) => !x.isBot && !room.rematch.has(x.id))) {
    const any = room.players.find((x) => room.rematch.has(x.id));
    if (any) voteRematch(room, any);
  }
}

function init(helpers) { H = helpers; }
function start() { if (!clock) clock = setInterval(tick, 1000); }
function stop() {
  clearInterval(clock); clock = null;
  for (const r of rooms.values()) clearTimeout(r.timer);
}
// Players (humans still in) per game, for the live counter on the home page.
function liveCount(slug) {
  let n = 0;
  for (const r of rooms.values()) if (r.slug === slug) n += r.players.filter((p) => !p.isBot && !p.left).length;
  return n;
}

// Open rooms per game for the admin overview: [{ slug, name, rooms, playing, clients }] (games with no rooms left out).
function roomStats() {
  const by = new Map();
  for (const r of rooms.values()) {
    const s = by.get(r.slug) || { slug: r.slug, name: r.mod.name, rooms: 0, playing: 0, clients: 0 };
    s.rooms++; if (r.status === 'playing') s.playing++; s.clients += r.clients.size;
    by.set(r.slug, s);
  }
  return [...by.values()];
}

module.exports = { init, start, stop, handle, liveCount, roomStats, rooms, _test: { newRoom, addPlayer, startGame, publicRoom, roomAct, animMs } };
