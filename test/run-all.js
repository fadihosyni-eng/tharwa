'use strict';
// Runs every test against a temporary server on its own port, so a live game
// on 8700 is never touched. Run: node tharwa-game/test/run-all.js
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '8701';
const BASE = `http://localhost:${PORT}`;
// Accounts go to a throw-away JSON file, never to a real database.
const DATA_FILE = path.join(os.tmpdir(), `tharwa-test-${process.pid}.json`);

function run(file, args = []) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(file + ' failed');
}

(async () => {
  run('cards.js');
  run('maps.js');
  run('sim.js', ['150']);
  run('turn-timer.js'); // «ثروة»: a player back after the turn timer keeps the turn (own server on TEST_PORT+2)
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT, DATA_FILE, DATABASE_URL: '', ADMIN_USERS: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }, stdio: 'ignore' });
  try {
    for (let k = 0; k < 40; k++) {
      try { const r = await fetch(BASE + '/api/board'); if (r.ok) break; } catch (e) { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    const net = await (await fetch(BASE + '/api/net')).json();
    console.log('invite addresses:', net.map((n) => `${n.kind} ${n.url}`).join(' | ') || '(none)');
    if (!Array.isArray(net)) throw new Error('/api/net did not return a list');
    run('api.js', [BASE]);
    run('auth.js', [BASE]);
    run('tharwa-rules.js', [BASE]); // «لا إيجار للمسجون» + bankrupt players stay as spectators
    run('google.js');
    // spam protection: one IP cannot create rooms without limit
    let limited = false;
    for (let k = 0; k < 14; k++) {
      const r = await fetch(BASE + '/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'spam', isPrivate: true }) });
      if (r.status === 429) { limited = true; break; }
    }
    if (!limited) throw new Error('room creation is not rate limited');
    const fwd = await (await fetch(BASE + '/api/net', { headers: { 'X-Forwarded-For': '8.8.8.8' } })).json();
    if (fwd.length) throw new Error('/api/net leaks addresses to remote clients');
    console.log('spam limit + address privacy OK');
    // Last: it runs a while, and this runner's own pooled connection would go stale meanwhile.
    run('minigames.js', [BASE]); // إكس أو، أربعة بخط، لودو: rules, bots, room API
    run('cards-games.js', [BASE]); // طرنيب، أربعمية، تركس: deck, rules, scoring, bots, AFK, room API
    run('konkan.js', [BASE]); // كونكان: melds, opening, joker rules, scoring, 1,200 bot games, AFK, room API
    run('forfeit.js', [BASE]); // «انسحاب» in every small game
    console.log('ALL TESTS PASSED');
  } finally {
    srv.kill();
    for (const f of [DATA_FILE, DATA_FILE + '.tmp']) { try { fs.unlinkSync(f); } catch (e) { /* not there */ } }
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
