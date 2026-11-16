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
const SERVER_PATH = /^\/(?:api\/|admin\/?$)/;
// Static pages that need a rewrite (the URL keeps its path): the game room uses the old client
// (web/site/game.html), and every profile uses the one Astro page u.html, which reads the name from the URL.
const REWRITES = [[/^\/room\/[^/]+\/?$/, '/game'], [/^\/u\/[^/]+\/?$/, '/u']];

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
        // Supabase signs its TLS with its own CA, which a Worker socket can't trust, so the direct
        // connection is cut during the handshake. Hyperdrive (binding HYPERDRIVE) does TLS to Supabase
        // for us; the Worker talks to Hyperdrive inside Cloudflare without TLS.
        if (this.env.HYPERDRIVE && this.env.HYPERDRIVE.connectionString) {
          process.env.DATABASE_URL = this.env.HYPERDRIVE.connectionString;
          process.env.PGSSL = 'disable';
        }
        // No silent memory fallback in production: on an empty store the first sign-up becomes admin.
        // Local dev sets STORE=memory explicitly in .dev.vars.
        if (!process.env.DATABASE_URL && !process.env.STORE) {
          console.error('[tharwa] DATABASE_URL is not set — refusing to start (set the secret, or STORE=memory for local dev)');
          throw new Error('DATABASE_URL missing');
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
      // A short, password-free reason helps diagnose a broken DATABASE_URL from outside.
      const why = String((e && (e.code || e.message)) || 'unknown').replace(/\w+:\/\/[^\s]*/g, '<url>').slice(0, 160);
      return Response.json({ error: 'السيرفر عم يقلّع — جرّب بعد شوي', why }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return handleAsNodeRequest(port, request);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One canonical address (PUBLIC_URL): other hostnames of this Worker (e.g. serva-g.com, www) redirect to it,
    // so login cookies and the Google callback always live on the same host.
    if (env.PUBLIC_URL) {
      const canon = new URL(env.PUBLIC_URL);
      if (url.host !== canon.host && !url.hostname.endsWith('.workers.dev') && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return Response.redirect(canon.origin + url.pathname + url.search, 301);
      }
    }
    for (const [re, to] of REWRITES) {
      if (re.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL(to + url.search, url), request));
    }
    if (!SERVER_PATH.test(url.pathname)) return env.ASSETS.fetch(request);
    // Tell the Node server how the visitor reached us (cookies get `Secure` on https).
    // Any value the visitor sent is replaced, so it cannot be faked.
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
    headers.set('x-forwarded-host', url.host);
    // One game server per deployed version: a Durable Object that is already running is not always restarted
    // by a deploy, and would keep old code and old settings. Rooms reset on deploy either way.
    const ver = (env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || 'dev';
    const stub = env.THARWA.get(env.THARWA.idFromName('main-' + ver));
    return stub.fetch(new Request(request, { headers }));
  },
};
