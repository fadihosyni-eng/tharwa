// «ثروة» on Cloudflare Workers.
//
//   visitor ──► Worker (this file's default export, ~1 ms CPU: only forwards)
//                 ├─ static files (/, /style.css, /room/xyz, /login …) → Workers Static Assets (./public)
//                 └─ /api/*, /u/<name>, /admin → the ONE Durable Object «main»
//                                                  which runs the unchanged Node server (server.js)
//                                                  through the node:http bridge (handleAsNodeRequest).
//
// Rooms, bots and turn timers live in the Durable Object's memory, exactly like `node server.js`
// keeps them in the process: one object = one game server for the whole site.
// Plain Node (`node server.js`, Render) does not use this file.
import { DurableObject } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import indexHtml from './public/index.html'; // bundled as text: server.js serves it for /u/<name> and /admin

// Paths the Node server must answer (everything else is a static file / the single-page app).
// Keep in sync with "run_worker_first" in wrangler.jsonc.
const SERVER_PATH = /^\/(?:api\/|u\/|admin\/?$)/;

export class Tharwa extends DurableObject {
  // Loads and starts server.js once. Not done at global scope: Workers forbid timers, random
  // values and I/O there, and server.js starts its clock and opens the store when it starts.
  // Concurrent first requests all wait on the same promise; a failed start is retried next time.
  boot() {
    if (!this.ready) {
      this.ready = (async () => {
        // Vars and secrets → process.env (nodejs_compat already does this, checked with wrangler dev;
        // repeated so it keeps working if that default ever changes).
        for (const [k, v] of Object.entries(this.env)) if (typeof v === 'string') process.env[k] = v;
        // A closed tab is noticed only after a few failed writes here, so ping live streams more often.
        if (!process.env.SSE_PING_MS) process.env.SSE_PING_MS = '5000';
        if (!process.env.DATABASE_URL && !process.env.STORE) {
          console.warn('[tharwa] DATABASE_URL is not set — accounts are kept in memory only and are lost on restart');
          process.env.STORE = 'memory';
        }
        const mod = await import('./server.js');
        const { start } = mod.start ? mod : mod.default;
        return start({ indexHtml });
      })().catch((e) => { this.ready = null; throw e; });
    }
    return this.ready;
  }

  async fetch(request) {
    let port;
    try {
      port = await this.boot();
    } catch (e) {
      console.error('[tharwa] server could not start:', e && e.message);
      return Response.json({ error: 'السيرفر عم يقلّع — جرّب بعد شوي' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return handleAsNodeRequest(port, request);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!SERVER_PATH.test(url.pathname)) return env.ASSETS.fetch(request);
    // Tell the Node server how the visitor reached us (cookies get `Secure` on https).
    // Any value the visitor sent is replaced, so it cannot be faked.
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
    headers.set('x-forwarded-host', url.host);
    const stub = env.THARWA.get(env.THARWA.idFromName('main'));
    return stub.fetch(new Request(request, { headers }));
  },
};
