'use strict';
// Google sign-in, tested in-process with a fake Google (no network): the token exchange and
// userinfo calls go through A.__setGoogleFetch (only available when NODE_ENV=test).
// Run: node tharwa-game/test/google.js
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.DATA_FILE = path.join(os.tmpdir(), `tharwa-google-test-${process.pid}-${Date.now()}.json`);
for (const f of [process.env.DATA_FILE, process.env.DATA_FILE + ".tmp"]) { try { fs.unlinkSync(f); } catch (e) { /* none */ } }
const assert = require('assert');
const { createStore } = require('../data/store');
const A = require('../lib/accounts');

function httpErr(status, msg) { const e = new Error(msg); e.userMsg = msg; e.status = status; return e; }
// Minimal request/response doubles + a cookie jar per "browser".
function browser() {
  const jar = {};
  async function call(method, url, body) {
    const u = new URL(url, 'http://localhost:9999');
    const req = { method, url, body, headers: { host: 'localhost:9999', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, socket: {} };
    const res = {
      status: 200, headers: {}, body: '',
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
      writeHead(st, h = {}) { this.status = st; for (const [k, v] of Object.entries(h)) this.setHeader(k, v); return this; },
      end(b) { this.body = b || ''; },
    };
    try { await A.handle(req, res, u); } catch (e) { res.status = e.status || 500; res.body = JSON.stringify({ error: e.userMsg || e.message }); }
    for (const c of [].concat(res.headers['set-cookie'] || [])) {
      const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/Max-Age=0/.test(c) || !v) delete jar[k]; else jar[k] = v;
    }
    let json = null;
    try { json = JSON.parse(res.body); } catch (e) { /* redirect */ }
    return { status: res.status, location: res.headers.location, json };
  }
  return { call, jar };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// The fake Google answers the token exchange and userinfo for `profile`.
function fakeGoogle(profile, claims = {}) {
  A.__setGoogleFetch(async (url, opts) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      assert(String(opts.body).includes('code_verifier='), 'PKCE verifier sent');
      const idt = [b64({ alg: 'none' }), b64({ iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, sub: profile.sub, ...claims }), 'sig'].join('.');
      return { ok: true, json: async () => ({ access_token: 'at-' + profile.sub, id_token: idt }) };
    }
    if (url.includes('/userinfo')) return { ok: true, json: async () => profile };
    throw new Error('unexpected url ' + url);
  });
}
async function googleSignIn(b, profile, claims, opts = {}) {
  fakeGoogle(profile, claims);
  const start = await b.call('GET', '/api/auth/google/start' + (opts.link ? '?link=1' : ''));
  assert.strictEqual(start.status, 302);
  const to = new URL(start.location);
  assert.strictEqual(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.strictEqual(to.searchParams.get('client_id'), process.env.GOOGLE_CLIENT_ID);
  assert.strictEqual(to.searchParams.get('redirect_uri'), 'http://localhost:9999/api/auth/google/callback');
  assert.strictEqual(to.searchParams.get('scope'), 'openid email profile');
  assert.strictEqual(to.searchParams.get('code_challenge_method'), 'S256');
  const state = opts.badState ? 'wrong' : to.searchParams.get('state');
  return b.call('GET', `/api/auth/google/callback?code=abc&state=${state}`);
}

(async () => {
  const store = createStore();
  await A.init({ store, rooms: new Map(), helpers: {
    httpErr, rateLimit() {}, readBody: async (req) => req.body || {}, closeRoom() {}, broadcast() {}, log() {}, cash: [1500], timers: [0],
    json(res, status, obj) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); },
  } });
  assert.strictEqual((await browser().call('GET', '/api/site')).json.googleEnabled, true, 'googleEnabled with a client id');

  // 1) new Google user -> pending username step -> account with a verified email, no password
  const nour = browser();
  const pic = 'https://lh3.googleusercontent.com/a/ACg8ocK-photo=s96-c';
  let r = await googleSignIn(nour, { sub: 'g-new', email: 'Nour@Gmail.com', email_verified: true, name: 'نور', picture: pic });
  assert.strictEqual(r.location, '/register?google=1', 'new user goes to the username step');
  r = await nour.call('GET', '/api/auth/google/pending');
  assert.deepStrictEqual([r.json.email, r.json.name, r.json.picture], ['nour@gmail.com', 'نور', pic], 'name + picture prefilled');
  r = await nour.call('POST', '/api/auth/google/complete', { username: 'noor' });
  assert.strictEqual(r.status, 200, 'account created');
  assert.deepStrictEqual([r.json.user.email, r.json.user.emailVerified, r.json.user.hasPassword, r.json.user.google, r.json.user.avatar], ['nour@gmail.com', true, false, true, pic]);
  assert.strictEqual((await nour.call('POST', '/api/auth/google/complete', { username: 'noor2' })).status, 400, 'pending sign-up can only be used once');
  // signing in again with the same Google account logs straight in
  const nour2 = browser();
  r = await googleSignIn(nour2, { sub: 'g-new', email: 'nour@gmail.com', email_verified: true, name: 'نور' });
  assert.strictEqual(r.location, '/');
  assert.strictEqual((await nour2.call('GET', '/api/auth/me')).json.user.username, 'noor', 'logged in by google_sub');
  // a Google-only account can set a password later (no current password needed)
  assert.strictEqual((await nour2.call('POST', '/api/me/password', { next: 'newpass1' })).status, 200);
  assert.strictEqual((await browser().call('POST', '/api/auth/login', { username: 'nour@gmail.com', password: 'newpass1' })).status, 200, 'then logs in with email + password');

  // 2) existing password account with the same verified email -> linked
  const omar = browser();
  r = await omar.call('POST', '/api/auth/register', { username: 'omar', email: 'omar@example.com', password: 'pass123' });
  assert.strictEqual(r.status, 200);
  const omarG = browser();
  r = await googleSignIn(omarG, { sub: 'g-omar', email: 'OMAR@example.com', email_verified: true, name: 'Omar' });
  assert.strictEqual(r.location, '/', 'existing email -> logged in');
  const me = (await omarG.call('GET', '/api/auth/me')).json.user;
  assert.deepStrictEqual([me.username, me.google, me.emailVerified, me.hasPassword], ['omar', true, true, true], 'google linked to the existing account');

  // 3) banned users are refused
  const omarRow = await store.getUserByName('omar');
  await store.updateUser(omarRow.id, { banned: true });
  r = await googleSignIn(browser(), { sub: 'g-omar', email: 'omar@example.com', email_verified: true });
  assert.strictEqual(r.location, '/login?err=banned', 'banned -> refused');

  // 4) bad flows
  assert.strictEqual((await googleSignIn(browser(), { sub: 'g-x', email: 'x@gmail.com', email_verified: true }, {}, { badState: true })).location, '/login?err=state', 'state must match');
  assert.strictEqual((await googleSignIn(browser(), { sub: 'g-y', email: 'y@gmail.com', email_verified: false })).location, '/login?err=unverified', 'unverified email refused');
  assert.strictEqual((await googleSignIn(browser(), { sub: 'g-z', email: 'z@gmail.com', email_verified: true }, { aud: 'someone-else' })).location, '/login?err=google', 'ID token for another app refused');
  // linking from settings: a logged-in account links a Google account
  const lina = browser();
  await lina.call('POST', '/api/auth/register', { username: 'lina', email: 'lina@example.com', password: 'pass123' });
  r = await googleSignIn(lina, { sub: 'g-lina', email: 'lina.other@gmail.com', email_verified: true }, {}, { link: true });
  assert.strictEqual(r.location, '/settings?glinked=1');
  assert.strictEqual((await lina.call('GET', '/api/auth/me')).json.user.google, true, 'linked from settings');
  // a reserved name is allowed when it is listed in ADMIN_USERS (and that account becomes admin)
  process.env.ADMIN_USERS = 'serva';
  r = await browser().call('POST', '/api/auth/register', { username: 'serva', email: 'owner@example.com', password: 'pass123' });
  assert.deepStrictEqual([r.status, r.json.user.role], [200, 'admin'], 'reserved name from ADMIN_USERS');
  assert.strictEqual((await browser().call('POST', '/api/auth/register', { username: 'admin', email: 'a2@example.com', password: 'pass123' })).status, 400, 'other reserved names still refused');
  process.env.ADMIN_USERS = '';
  // without a client id the button is hidden and /start refuses politely
  process.env.GOOGLE_CLIENT_ID = '';
  assert.strictEqual((await browser().call('GET', '/api/site')).json.googleEnabled, false);
  assert.strictEqual((await browser().call('GET', '/api/auth/google/start')).location, '/login?err=off');
  console.log('GOOGLE OK — new user, link by email, link from settings, banned, bad state/aud/unverified');
})().catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => { for (const f of [process.env.DATA_FILE, process.env.DATA_FILE + '.tmp']) { try { fs.unlinkSync(f); } catch (e) { /* none */ } } setTimeout(() => process.exit(), 50); });
