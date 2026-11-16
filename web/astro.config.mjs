// «ثروة» web front-end (Astro, fully static). Pages fetch live data from /api/* in the browser.
// Build: `npm run build` → ./dist  (see README section in the hand-off notes for how to serve it).
import { defineConfig } from 'astro/config';

// The game server for local development (never the user's own 8700).
const BACKEND = process.env.THARWA_BACKEND || 'http://localhost:8703';

// Paths that still belong to the old vanilla client (public/ of the game server) during `astro dev`:
// the game room, the admin dashboard and their scripts/styles. In production they are served
// next to this build (see hand-off notes).
const LEGACY = ['/api', '/room', '/admin', '/style.css', '/app.js', '/account.js', '/art.js', '/flags.js', '/fx.js', '/brand', '/bg'];

// /u/<username> is one static page (u.html) that reads the name from location.pathname.
// In dev, rewrite /u/<name> to /u so Astro serves that page.
const rewriteProfile = (req, _res, next) => {
  const [path, query] = String(req.url || '').split('?');
  if (/^\/u\/[^/]+\/?$/.test(path)) req.url = '/u' + (query ? '?' + query : '');
  next();
};
const profileRewrite = {
  name: 'tharwa-profile-rewrite',
  configureServer(server) { server.middlewares.use(rewriteProfile); },
};
const proxy = Object.fromEntries(LEGACY.map((p) => [p, { target: BACKEND, ws: false }]));

export default defineConfig({
  site: process.env.SITE_URL || 'https://game.serva-g.com',
  output: 'static',
  trailingSlash: 'ignore',
  // login.html, settings.html, u.html … (served at /login, /settings, /u/* without a trailing slash)
  build: { format: 'file', assets: '_astro' },
  devToolbar: { enabled: false },
  server: { port: 4321 },
  vite: {
    plugins: [profileRewrite],
    // art.js / flags.js / fx.js are imported straight from the game's public/ folder (one source of truth).
    server: {
      fs: { allow: ['..'] },
      proxy,
    },
    // `npm run preview` (the built site) talks to the same backend. Astro's preview ignores user Vite
    // plugins, so /u/<name> → u.html is done with a proxy bypass there.
    preview: { proxy: { '^/u/[^/]+/?$': { target: BACKEND, bypass: () => '/u.html' }, ...proxy } },
  },
});
