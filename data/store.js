'use strict';
// Persistent storage for accounts, sessions, site settings, game results and the admin log.
//
// Two backends with the SAME async methods:
//   • Postgres  — used when process.env.DATABASE_URL is set (e.g. a free Neon database on Render).
//                 Needs the `pg` package (listed in package.json; Render runs `npm install`).
//   • JSON file — used otherwise (local dev / tests). File: process.env.DATA_FILE or data/local.json.
// Render's free disk is wiped on every sleep/redeploy, so production MUST use DATABASE_URL.
//
// Timestamps are numbers (ms since epoch) in both backends.
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- shared helpers
const USER_FIELDS = ['id', 'username', 'displayName', 'passHash', 'role', 'bio', 'avatar', 'color', 'piece',
  'points', 'games', 'wins', 'banned', 'createdAt', 'lastSeen'];
function dupErr() { const e = new Error('username taken'); e.code = 'dup'; return e; }
function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
function bucketDays(times, days) {
  const out = [];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let k = days - 1; k >= 0; k--) out.push({ day: dayKey(today.getTime() - k * 86400000), n: 0 });
  const idx = Object.fromEntries(out.map((d, i) => [d.day, i]));
  for (const t of times) { const i = idx[dayKey(t)]; if (i !== undefined) out[i].n++; }
  return out;
}

// ---------------------------------------------------------------- JSON file backend
function jsonStore(file) {
  let db = { users: [], sessions: [], settings: {}, results: [], audit: [], seq: { result: 0, audit: 0 } };
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tmp = file + '.tmp';
      fs.writeFile(tmp, JSON.stringify(db), (e) => { if (!e) fs.rename(tmp, file, () => {}); });
    }, 150);
  };
  const flushSync = () => { clearTimeout(timer); fs.writeFileSync(file, JSON.stringify(db)); };
  const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);
  const findUser = (id) => db.users.find((u) => u.id === id);
  return {
    kind: 'json',
    async init() {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { /* new file */ }
      process.on('exit', () => { try { flushSync(); } catch (e) { /* ignore */ } });
    },
    // users
    async createUser(u) {
      if (db.users.some((x) => x.username === u.username)) throw dupErr();
      db.users.push(clone(u)); save(); return clone(u);
    },
    async getUser(id) { return clone(findUser(id)); },
    async getUserByName(username) { return clone(db.users.find((u) => u.username === username)); },
    async updateUser(id, patch) {
      const u = findUser(id); if (!u) return null;
      for (const k of Object.keys(patch)) if (USER_FIELDS.includes(k) && k !== 'id') u[k] = patch[k];
      save(); return clone(u);
    },
    async addUserStats(id, dPoints, dGames, dWins) {
      const u = findUser(id); if (!u) return null;
      u.points += dPoints; u.games += dGames; u.wins += dWins; save(); return clone(u);
    },
    async deleteUser(id) {
      db.users = db.users.filter((u) => u.id !== id);
      db.sessions = db.sessions.filter((s) => s.userId !== id); save();
    },
    async listUsers({ q = '', limit = 50, offset = 0 } = {}) {
      const s = q.toLowerCase();
      const all = db.users.filter((u) => !s || u.username.includes(s) || u.displayName.toLowerCase().includes(s))
        .sort((a, b) => b.createdAt - a.createdAt);
      return { total: all.length, users: all.slice(offset, offset + limit).map(clone) };
    },
    async countUsers() { return db.users.length; },
    // sessions
    async addSession(hash, userId, expiresAt) { db.sessions.push({ hash, userId, createdAt: Date.now(), expiresAt }); save(); },
    async getSessionUser(hash) {
      const s = db.sessions.find((x) => x.hash === hash);
      if (!s || s.expiresAt < Date.now()) return null;
      return clone(findUser(s.userId));
    },
    async deleteSession(hash) { db.sessions = db.sessions.filter((s) => s.hash !== hash); save(); },
    async deleteUserSessions(userId) { db.sessions = db.sessions.filter((s) => s.userId !== userId); save(); },
    // settings (key -> JSON value)
    async getSetting(key, fallback) { return key in db.settings ? clone(db.settings[key]) : fallback; },
    async setSetting(key, value) { db.settings[key] = clone(value); save(); },
    // game results
    async addGameResult(r) {
      const row = { id: ++db.seq.result, ...clone(r) };
      db.results.push(row); save(); return row.id;
    },
    async listUserGames(userId, limit = 10) {
      return db.results.filter((r) => (r.userIds || []).includes(userId)).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(clone);
    },
    async countGames(since = 0) { return db.results.filter((r) => r.createdAt >= since).length; },
    async gamesPerDay(days) {
      const since = Date.now() - days * 86400000;
      return bucketDays(db.results.filter((r) => r.createdAt >= since).map((r) => r.createdAt), days);
    },
    // admin audit log
    async addAudit(e) { db.audit.push({ id: ++db.seq.audit, at: Date.now(), ...clone(e) }); if (db.audit.length > 2000) db.audit.shift(); save(); },
    async listAudit(limit = 100) { return db.audit.slice(-limit).reverse().map(clone); },
  };
}

// ---------------------------------------------------------------- Postgres backend
function pgStore(url) {
  const { Pool } = require('pg'); // only needed in production
  const pool = new Pool({ connectionString: url, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }, max: 5 });
  const q = (text, params) => pool.query(text, params);
  const toUser = (r) => (r ? {
    id: r.id, username: r.username, displayName: r.display_name, passHash: r.pass_hash, role: r.role, bio: r.bio,
    avatar: r.avatar, color: r.color, piece: r.piece, points: r.points, games: r.games, wins: r.wins, banned: r.banned,
    createdAt: Number(r.created_at), lastSeen: Number(r.last_seen),
  } : null);
  const COL = { displayName: 'display_name', passHash: 'pass_hash', createdAt: 'created_at', lastSeen: 'last_seen' };
  const toResult = (r) => ({
    id: r.id, roomCode: r.room_code, game: r.game, players: r.players, userIds: r.user_ids, winner: r.winner,
    rounds: r.rounds, durationMs: Number(r.duration_ms), createdAt: Number(r.created_at),
  });
  return {
    kind: 'postgres',
    async init() {
      await q(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, pass_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user', bio TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT 'a1',
          color TEXT, piece TEXT, points INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0, banned BOOLEAN NOT NULL DEFAULT FALSE,
          created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
        CREATE TABLE IF NOT EXISTS game_results (
          id SERIAL PRIMARY KEY, room_code TEXT, game TEXT NOT NULL DEFAULT 'tharwa', players JSONB NOT NULL,
          user_ids TEXT[] NOT NULL DEFAULT '{}', winner JSONB, rounds INTEGER, duration_ms BIGINT, created_at BIGINT NOT NULL);
        CREATE INDEX IF NOT EXISTS game_results_created ON game_results (created_at);
        CREATE TABLE IF NOT EXISTS audit (
          id SERIAL PRIMARY KEY, at BIGINT NOT NULL, admin_id TEXT, admin_name TEXT, action TEXT NOT NULL,
          target TEXT, detail JSONB);`);
    },
    async createUser(u) {
      try {
        const r = await q(`INSERT INTO users (id, username, display_name, pass_hash, role, bio, avatar, color, piece, points, games, wins, banned, created_at, last_seen)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [u.id, u.username, u.displayName, u.passHash, u.role, u.bio, u.avatar, u.color, u.piece, u.points, u.games, u.wins, u.banned, u.createdAt, u.lastSeen]);
        return toUser(r.rows[0]);
      } catch (e) { if (e.code === '23505') throw dupErr(); throw e; }
    },
    async getUser(id) { return toUser((await q('SELECT * FROM users WHERE id=$1', [id])).rows[0]); },
    async getUserByName(username) { return toUser((await q('SELECT * FROM users WHERE username=$1', [username])).rows[0]); },
    async updateUser(id, patch) {
      const keys = Object.keys(patch).filter((k) => USER_FIELDS.includes(k) && k !== 'id');
      if (!keys.length) return this.getUser(id);
      const sets = keys.map((k, i) => `${COL[k] || k}=$${i + 2}`).join(', ');
      return toUser((await q(`UPDATE users SET ${sets} WHERE id=$1 RETURNING *`, [id, ...keys.map((k) => patch[k])])).rows[0]);
    },
    async addUserStats(id, dPoints, dGames, dWins) {
      return toUser((await q('UPDATE users SET points=points+$2, games=games+$3, wins=wins+$4 WHERE id=$1 RETURNING *', [id, dPoints, dGames, dWins])).rows[0]);
    },
    async deleteUser(id) { await q('DELETE FROM users WHERE id=$1', [id]); },
    async listUsers({ q: s = '', limit = 50, offset = 0 } = {}) {
      const like = '%' + String(s).toLowerCase().replace(/[%_\\]/g, '\\$&') + '%';
      const where = s ? 'WHERE username LIKE $1 OR LOWER(display_name) LIKE $1' : '';
      const args = s ? [like] : [];
      const total = Number((await q(`SELECT COUNT(*) FROM users ${where}`, args)).rows[0].count);
      const rows = (await q(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ${Number(limit) | 0} OFFSET ${Number(offset) | 0}`, args)).rows;
      return { total, users: rows.map(toUser) };
    },
    async countUsers() { return Number((await q('SELECT COUNT(*) FROM users')).rows[0].count); },
    async addSession(hash, userId, expiresAt) {
      await q('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)', [hash, userId, Date.now(), expiresAt]);
    },
    async getSessionUser(hash) {
      const r = await q('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=$1 AND s.expires_at > $2', [hash, Date.now()]);
      return toUser(r.rows[0]);
    },
    async deleteSession(hash) { await q('DELETE FROM sessions WHERE token_hash=$1', [hash]); },
    async deleteUserSessions(userId) { await q('DELETE FROM sessions WHERE user_id=$1', [userId]); },
    async getSetting(key, fallback) {
      const r = (await q('SELECT value FROM settings WHERE key=$1', [key])).rows[0];
      return r ? r.value : fallback;
    },
    async setSetting(key, value) {
      await q('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, JSON.stringify(value)]);
    },
    async addGameResult(r) {
      const row = await q(`INSERT INTO game_results (room_code, game, players, user_ids, winner, rounds, duration_ms, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [r.roomCode, r.game, JSON.stringify(r.players), r.userIds, JSON.stringify(r.winner), r.rounds, r.durationMs, r.createdAt]);
      return row.rows[0].id;
    },
    async listUserGames(userId, limit = 10) {
      const r = await q('SELECT * FROM game_results WHERE $1 = ANY(user_ids) ORDER BY created_at DESC LIMIT $2', [userId, limit]);
      return r.rows.map(toResult);
    },
    async countGames(since = 0) { return Number((await q('SELECT COUNT(*) FROM game_results WHERE created_at >= $1', [since])).rows[0].count); },
    async gamesPerDay(days) {
      const since = Date.now() - days * 86400000;
      const r = await q('SELECT created_at FROM game_results WHERE created_at >= $1', [since]);
      return bucketDays(r.rows.map((x) => Number(x.created_at)), days);
    },
    async addAudit(e) {
      await q('INSERT INTO audit (at, admin_id, admin_name, action, target, detail) VALUES ($1,$2,$3,$4,$5,$6)',
        [Date.now(), e.adminId, e.adminName, e.action, e.target || null, JSON.stringify(e.detail || null)]);
    },
    async listAudit(limit = 100) {
      const r = await q('SELECT * FROM audit ORDER BY id DESC LIMIT $1', [limit]);
      return r.rows.map((x) => ({ id: x.id, at: Number(x.at), adminId: x.admin_id, adminName: x.admin_name, action: x.action, target: x.target, detail: x.detail }));
    },
  };
}

function createStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return jsonStore(process.env.DATA_FILE || path.join(__dirname, 'local.json'));
}

module.exports = { createStore };
