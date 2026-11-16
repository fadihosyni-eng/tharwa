'use strict';
// Accounts, profiles and admin API against a running server that uses the JSON backend
// on an empty DATA_FILE (run-all.js starts it that way).
// Run: node tharwa-game/test/auth.js [baseUrl]
const assert = require('assert');
const BASE = process.argv[2] || 'http://localhost:8701';

// A tiny cookie-keeping client per user. Each one looks like its own IP (X-Forwarded-For)
// so the per-IP rate limits don't trip while the suite creates many rooms.
let ipSeq = 0;
function client() {
  let cookie = '';
  const ip = '10.9.0.' + (++ipSeq);
  return {
    async req(path, body, headers = {}) {
      const r = await fetch(BASE + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'X-Forwarded-For': ip, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      for (const c of set) { const kv = c.split(';')[0]; cookie = kv.endsWith('=') ? '' : kv; }
      const text = await r.text();
      let j = {};
      try { j = JSON.parse(text); } catch (e) { /* html */ }
      return { status: r.status, body: j, text, setCookie: set };
    },
  };
}

// First `state` event of a room (SSE).
async function snapshot(code) {
  const ctrl = new AbortController();
  const r = await fetch(`${BASE}/api/events?code=${code}`, { signal: ctrl.signal });
  const reader = r.body.getReader();
  let buf = '';
  for (;;) {
    const { value } = await reader.read();
    buf += Buffer.from(value).toString('utf8');
    const m = buf.match(/event: state\ndata: (.*)\n\n/);
    if (m) { ctrl.abort(); return JSON.parse(m[1]); }
  }
}

(async () => {
  const boss = client(), sami = client(), guest = client(), rana = client();

  // register: first account is admin, the next is a normal user
  assert.strictEqual((await guest.req('/api/site')).body.googleEnabled, false, 'Google button hidden without GOOGLE_CLIENT_ID');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'nomail', password: 'pass123' })).status, 400, 'email is required');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'badmail', email: 'not-an-email', password: 'pass123' })).status, 400, 'email must look valid');
  let r = await boss.req('/api/auth/register', { username: 'Boss', displayName: 'المدير', email: 'Boss@Example.com ', password: 'secret1' });
  assert.strictEqual(r.status, 200, 'register boss'); assert.strictEqual(r.body.user.role, 'admin', 'first user is admin');
  assert.strictEqual(r.body.user.username, 'boss', 'username lower-cased');
  assert(/HttpOnly/i.test(r.setCookie[0]) && /SameSite=Lax/i.test(r.setCookie[0]), 'session cookie is HttpOnly + SameSite=Lax');
  assert.strictEqual(r.body.user.email, 'boss@example.com', 'email trimmed + lower-cased');
  r = await sami.req('/api/auth/register', { username: 'sami_1', displayName: 'سامي', email: 'sami@example.com', password: 'pass123' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.role, 'user', 'second user is not admin');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'ab', password: 'pass123' })).status, 400, 'too short username');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'admin', password: 'pass123' })).status, 400, 'reserved username');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'sami_1', email: 'x1@example.com', password: 'pass123' })).status, 409, 'duplicate username');
  r = await guest.req('/api/auth/register', { username: 'sami_2', email: 'SAMI@example.com', password: 'pass123' });
  assert.deepStrictEqual([r.status, r.body.error], [409, 'هالإيميل مستعمل'], 'duplicate email');

  // me / logout / login
  assert.strictEqual((await sami.req('/api/auth/me')).body.user.username, 'sami_1');
  await sami.req('/api/auth/logout', {});
  assert.strictEqual((await sami.req('/api/auth/me')).body.user, null, 'logged out');
  assert.strictEqual((await sami.req('/api/auth/login', { username: 'sami_1', password: 'wrong!!' })).status, 401, 'wrong password');
  assert.strictEqual((await sami.req('/api/auth/login', { username: 'SAMI_1', password: 'pass123' })).status, 200, 'login');
  await sami.req('/api/auth/logout', {});
  assert.strictEqual((await sami.req('/api/auth/login', { username: 'Sami@Example.com', password: 'pass123' })).status, 200, 'login by email');
  // change email: needs the current password; the new one is unverified
  assert.strictEqual((await sami.req('/api/me/update', { email: 'sami2@example.com', password: 'nope!!' })).status, 400, 'email change needs the password');
  assert.strictEqual((await sami.req('/api/me/update', { email: 'boss@example.com', password: 'pass123' })).status, 409, 'cannot take another account\'s email');
  assert.strictEqual((await sami.req('/api/me/update', { email: 'sami2@example.com', password: 'pass123' })).status, 200);
  r = (await sami.req('/api/auth/me')).body.user;
  assert.deepStrictEqual([r.email, r.emailVerified, r.hasPassword, r.google], ['sami2@example.com', false, true, false]);
  assert.strictEqual((await guest.req('/api/u/sami_1')).body.user.email, undefined, 'email is never public');

  // profile pages
  assert.strictEqual((await guest.req('/u/sami_1')).status, 200, 'profile page');
  assert.strictEqual((await guest.req('/u/nobody_here')).status, 404, 'unknown profile page is 404');
  assert.strictEqual((await guest.req('/api/u/nobody_here')).status, 404);

  // settings update
  r = await sami.req('/api/me/update', { displayName: 'سامي الأسطورة', bio: 'بحب ثروة', avatar: 'a7', color: '#a78bfa', piece: 'rocket' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await sami.req('/api/me/update', { avatar: 'zzz' })).status, 400, 'unknown avatar rejected');
  r = await guest.req('/api/u/sami_1');
  assert.deepStrictEqual([r.body.user.displayName, r.body.user.bio, r.body.user.avatar], ['سامي الأسطورة', 'بحب ثروة', 'a7']);
  assert.strictEqual(r.body.user.passHash, undefined, 'no password hash in public profile');

  // admin API is hidden from normal users; cross-site writes are refused
  assert.strictEqual((await sami.req('/api/admin/overview')).status, 404, 'non-admin gets 404');
  assert.strictEqual((await sami.req('/admin')).status, 404, '/admin page is 404 for non-admins');
  assert.strictEqual((await boss.req('/api/admin/overview')).status, 200, 'admin overview');
  assert.strictEqual((await boss.req('/api/admin/settings', { maintenance: false }, { Origin: 'https://evil.example' })).status, 403, 'foreign Origin refused');

  // announcement shows on /api/site
  await boss.req('/api/admin/settings', { announcement: { on: true, text: 'أهلا بالكل 🎉' } });
  assert.strictEqual((await guest.req('/api/site')).body.announcement, 'أهلا بالكل 🎉');
  await boss.req('/api/admin/settings', { announcement: { on: false, text: 'أهلا بالكل 🎉' } });
  assert.strictEqual((await guest.req('/api/site')).body.announcement, '', 'announcement off');

  // points adjust
  const byMail = (await boss.req('/api/admin/users?q=sami2@example')).body.users;
  assert.strictEqual(byMail.length, 1, 'admin search by email');
  assert.strictEqual(byMail[0].email, 'sa***@example.com', 'email masked in the list');
  assert.strictEqual((await boss.req('/api/admin/user?id=' + byMail[0].id)).body.email, 'sami2@example.com', 'full email in the details view');
  const users = (await boss.req('/api/admin/users?q=sami')).body.users;
  const samiId = users.find((u) => u.username === 'sami_1').id;
  r = await boss.req('/api/admin/user', { id: samiId, action: 'points', amount: 25, reason: 'هدية' });
  assert.strictEqual(r.body.user.points, 25, 'admin adds points');
  assert.strictEqual((await boss.req('/api/admin/user', { id: (await boss.req('/api/auth/me')).body.user.id, action: 'unadmin' })).status, 400, 'cannot demote yourself');

  // a logged-in player gets their account name in the room; a finished game updates the stats
  r = await sami.req('/api/create', { name: 'ignored', isPrivate: true });
  const code = r.body.code, samiP = r.body;
  const rooms = (await boss.req('/api/admin/rooms')).body;
  assert(rooms.some((x) => x.code === code && x.players[0].name === 'سامي الأسطورة'), 'room listed with the account name');
  const g = await guest.req('/api/join', { code, name: 'ضيف' });
  const act = (who, me, type) => who.req('/api/act', { code, pid: me.pid, token: me.token, type });
  assert.strictEqual((await act(sami, samiP, 'start')).status, 200);
  await act(guest, g.body, 'leave'); // the guest leaves -> sami wins
  await new Promise((res) => setTimeout(res, 400));
  r = await guest.req('/api/u/sami_1');
  assert.deepStrictEqual([r.body.user.games, r.body.user.wins, r.body.user.points], [1, 1, 25 + 50], 'win vs a guest: only the win bonus (guests pay nothing)');
  assert.strictEqual(r.body.recent.length, 1); assert.strictEqual(r.body.recent[0].won, true);

  // stake transfer between two accounts: rana (100 pts) beats sami (75 pts) -> sami pays 20, rana gets 20 + 50
  r = await rana.req('/api/auth/register', { username: 'rana', displayName: 'رنا', email: 'rana@example.com', password: 'pass123' });
  const ranaId = (await boss.req('/api/admin/users?q=rana')).body.users[0].id;
  await boss.req('/api/admin/user', { id: ranaId, action: 'points', amount: 100, reason: 'رصيد' });
  const g2 = (await rana.req('/api/create', { name: 'x', isPrivate: true })).body;
  const s2 = (await sami.req('/api/join', { code: g2.code, name: 'x' })).body;
  await rana.req('/api/act', { code: g2.code, pid: g2.pid, token: g2.token, type: 'start' });
  await sami.req('/api/act', { code: g2.code, pid: s2.pid, token: s2.token, type: 'leave' });
  await new Promise((res) => setTimeout(res, 400));
  assert.strictEqual((await guest.req('/api/u/sami_1')).body.user.points, 75 - 20, 'loser pays the stake');
  assert.strictEqual((await guest.req('/api/u/rana')).body.user.points, 100 + 20 + 50, 'winner gets stakes + win bonus');
  const st2 = await snapshot(g2.code);
  assert.deepStrictEqual([st2.game.pointsResult[g2.pid], st2.game.pointsResult[s2.pid]], [70, -20], 'per-player result shown in the room');
  assert.strictEqual((await guest.req('/api/leaders')).body[0].username, 'rana', 'leaderboard sorted by points');

  // maps: buying needs points, deducts them, grants ownership; only owners can pick a paid map
  assert.strictEqual((await sami.req('/api/maps/buy', { id: 'gulf' })).status, 400, 'not enough points');
  await boss.req('/api/admin/user', { id: samiId, action: 'points', amount: 1000, reason: 'تجربة' });
  r = await sami.req('/api/maps/buy', { id: 'gulf' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.points, 55 + 1000 - 500, 'price deducted');
  assert((await sami.req('/api/maps')).body.maps.find((m) => m.id === 'gulf').owned, 'map owned after buying');
  assert.strictEqual((await sami.req('/api/maps/buy', { id: 'gulf' })).status, 409, 'cannot buy twice');
  const g3 = (await rana.req('/api/create', { name: 'x', isPrivate: true })).body;
  assert.strictEqual((await rana.req('/api/act', { code: g3.code, pid: g3.pid, token: g3.token, type: 'setMap', data: { id: 'gulf' } })).status, 403, 'non-owner cannot pick a paid map');
  const g4 = (await sami.req('/api/create', { name: 'x', isPrivate: true })).body;
  assert.strictEqual((await sami.req('/api/act', { code: g4.code, pid: g4.pid, token: g4.token, type: 'setMap', data: { id: 'gulf' } })).status, 200, 'owner picks the map');
  const st4 = await snapshot(g4.code);
  assert.strictEqual(st4.mapId, 'gulf');
  assert.strictEqual((await sami.req('/api/act', { code: g4.code, pid: g4.pid, token: g4.token, type: 'setCountry', data: { slot: 'c1', code: 'lb' } })).status, 409, 'country picker only on the classic map');

  // admin closes a room
  const r2 = await sami.req('/api/create', { name: 'x', isPrivate: true });
  assert.strictEqual((await boss.req('/api/admin/room', { code: r2.body.code, action: 'close' })).status, 200);
  assert.strictEqual((await guest.req('/api/room?code=' + r2.body.code)).status, 404, 'closed room is gone');

  // ban: cannot join rooms (with the old session) and cannot log in
  const open = await boss.req('/api/create', { name: 'x', isPrivate: true });
  await boss.req('/api/admin/user', { id: samiId, action: 'ban' });
  assert.strictEqual((await sami.req('/api/join', { code: open.body.code, name: 'سامي' })).status, 403, 'banned user cannot join');
  assert.strictEqual((await sami.req('/api/auth/me')).body.user, null, 'banned user counts as logged out');
  assert.strictEqual((await client().req('/api/auth/login', { username: 'sami_1', password: 'pass123' })).status, 403, 'banned user cannot log in');

  const log = (await boss.req('/api/admin/audit')).body;
  assert(['ban', 'points', 'closeRoom', 'settings'].every((a) => log.some((e) => e.action === a)), 'admin actions are in the audit log');
  // usernames: admins may rename to reserved names; users rename themselves (not reserved, once per 30 days)
  assert.strictEqual((await boss.req('/api/admin/user', { id: ranaId, action: 'rename', username: 'boss' })).status, 409, 'rename to a taken name');
  assert.strictEqual((await boss.req('/api/admin/user', { id: ranaId, action: 'rename', username: 'Bad Name!' })).status, 400, 'rename validates the format');
  assert.strictEqual((await boss.req('/api/admin/user', { id: ranaId, action: 'rename', username: 'Serva' })).status, 200, 'admin may use a reserved name');
  assert.strictEqual((await guest.req('/u/serva')).status, 200, 'profile URL follows the new name');
  assert.strictEqual((await guest.req('/api/u/rana')).status, 404, 'old profile URL is gone');
  assert((await boss.req('/api/admin/audit')).body.some((e) => e.action === 'rename' && e.detail && e.detail.to === 'serva'), 'rename audited');
  assert.strictEqual((await rana.req('/api/me/username', { username: 'admin' })).status, 400, 'users cannot take reserved names');
  assert.strictEqual((await rana.req('/api/me/username', { username: 'rana_x' })).status, 200, 'self rename');
  assert.strictEqual((await rana.req('/api/auth/me')).body.user.username, 'rana_x');
  assert.strictEqual((await rana.req('/api/me/username', { username: 'rana_y' })).status, 429, 'once per 30 days');
  console.log('AUTH OK — accounts, profiles, admin, results, bans');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
