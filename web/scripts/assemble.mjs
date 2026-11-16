// Builds one deployable static folder (web/site/) from the old client and the new Astro build:
//   ../public/*            → site/*          (art.js, style.css, app.js, account.js, bg/, brand/ … for /room and /admin)
//   ../public/index.html   → site/game.html  (the old single-page client: serve it for /room/<code> and /admin)
//   dist/*                 → site/*          (new pages win: index.html, login.html, register.html, settings.html,
//                                             store.html, leaders.html, u.html, 404.html, _astro/)
// Run `npm run build` first. Nothing outside web/ is written.
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const oldPublic = resolve(web, '..', 'public');
const dist = join(web, 'dist');
const out = join(web, 'site');

if (!existsSync(join(dist, 'index.html'))) { console.error('dist/ is missing — run `npm run build` first'); process.exit(1); }
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(oldPublic, out, { recursive: true, filter: (src) => resolve(src) !== join(oldPublic, 'index.html') });
copyFileSync(join(oldPublic, 'index.html'), join(out, 'game.html'));
cpSync(dist, out, { recursive: true });
console.log('site/ ready:', out);
