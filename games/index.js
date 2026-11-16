'use strict';
// Registry of the small online games run by lib/minigames.js («ثروة» itself lives in game/).
// Every module exposes the same interface:
//   slug, name, minPlayers, maxPlayers, turnMs (turn clock), options
//   setup(pids, opts)            -> state            (pids in seat order)
//   current(state)               -> pid to act now, or null when the game is over
//   actions(state, pid)          -> legal actions for pid (empty when it is not their turn)
//   apply(state, pid, action, ctx) -> events[]       (mutates state; throws an error with .userMsg when illegal)
//   leave(state, pid)            -> events[]         (player quit mid-game: forfeit)
//   botAction(state, pid)        -> action           (also used for AFK auto-moves)
//   view(state, pid)             -> what the clients see
//   result(state)                -> null while playing, else { winner, draw, ranking, rounds }
const xo = require('./xo');
const connect4 = require('./connect4');
const ludo = require('./ludo');
const tarneeb = require('./cards/tarneeb');
const fourHundred = require('./cards/fourhundred');
const trix = require('./cards/trix');

const GAMES = { xo, connect4, ludo, tarneeb, 400: fourHundred, trix };
module.exports = { GAMES, get: (slug) => GAMES[String(slug || '')] || null };
