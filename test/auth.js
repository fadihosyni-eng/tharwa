'use strict';
// Accounts, profiles and admin API against a running server that uses the JSON backend
// on an empty DATA_FILE (run-all.js starts it that way).
// Run: node tharwa-game/test/auth.js [baseUrl]
const assert = require('assert');
const BASE = process.argv[2] || 'http://localhost:8701';

// A tiny cookie-keeping client per user.
function client() {
  let cookie = '';
  return {
    async req(path, body, headers = {}) {
      const r = await fetch(BASE + path, {
        method: body ? 'POST' : 'GET',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
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

(async () => {
  const boss = client(), sami = client(), guest = client();

  // register: first account is admin, the next is a normal user
  let r = await boss.req('/api/auth/register', { username: 'Boss', displayName: 'المدير', password: 'secret1' });
  assert.strictEqual(r.status, 200, 'register boss'); assert.strictEqual(r.body.user.role, 'admin', 'first user is admin');
  assert.strictEqual(r.body.user.username, 'boss', 'username lower-cased');
  assert(/HttpOnly/i.test(r.setCookie[0]) && /SameSite=Lax/i.test(r.setCookie[0]), 'session cookie is HttpOnly + SameSite=Lax');
  r = await sami.req('/api/auth/register', { username: 'sami_1', displayName: 'سامي', password: 'pass123' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.role, 'user', 'second user is not admin');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'ab', password: 'pass123' })).status, 400, 'too short username');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'admin', password: 'pass123' })).status, 400, 'reserved username');
  assert.strictEqual((await guest.req('/api/auth/register', { username: 'sami_1', password: 'pass123' })).status, 409, 'duplicate username');

  // me / logout / login
  assert.strictEqual((await sami.req('/api/auth/me')).body.user.username, 'sami_1');
  await sami.req('/api/auth/logout', {});
  assert.strictEqual((await sami.req('/api/auth/me')).body.user, null, 'logged out');
  assert.strictEqual((await sami.req('/api/auth/login', { username: 'sami_1', password: 'wrong!!' })).status, 401, 'wrong password');
  assert.strictEqual((await sami.req('/api/auth/login', { username: 'SAMI_1', password: 'pass123' })).status, 200, 'login');

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
  assert.deepStrictEqual([r.body.user.games, r.body.user.wins, r.body.user.points], [1, 1, 25 + 10 + 50], 'game recorded with points');
  assert.strictEqual(r.body.recent.length, 1); assert.strictEqual(r.body.recent[0].won, true);

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
  console.log('AUTH OK — accounts, profiles, admin, results, bans');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
