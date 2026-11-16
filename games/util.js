'use strict';
// Small helpers shared by the game modules in games/ (pure: no timers, no I/O).
const crypto = require('crypto');

// A user-facing error: lib/minigames.js answers it with `status` and the Arabic message.
function gameErr(msg, status = 400) { const e = new Error(msg); e.userMsg = msg; e.status = status; return e; }

// Random integer in [0, n). Server dice and bot tie-breaks use crypto; tests may pass their own `rand`.
const randInt = (n) => crypto.randomInt(n);

function pick(list, rand = randInt) { return list[rand(list.length)]; }

module.exports = { gameErr, randInt, pick };
