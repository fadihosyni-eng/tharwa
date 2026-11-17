# Serva Games: project handover (2026-11-17)

This document is for whoever continues the work (Gemini Antigravity, or any developer). Read `README_AR.md` too.

## Quick summary
- **The live site:** https://serva-g.com (`game.serva-g.com` and `www` redirect to it).
- **The platform:** Serva Games, an online games platform in Arabic (RTL) with 7 games:
  - ثروة (Monopoly-like);
  - إكس أو, أربعة بخط, لودو;
  - card games: طرنيب, أربعمية, تركس.
- **The old version** is still running at https://tharwa.onrender.com (Render, GitHub `main` branch). **Don't push to `main`**, or Render will change.

## Branches (GitHub: fadihosyni-eng/tharwa)
| Branch | What's in it |
|---|---|
| `cloudflare` | The same as what's live on serva-g.com today (pushed copy of the local `main`). |
| `dev/pro-graphics` | **Current, unfinished work**: Ludo 3D, game checks, site fixes. Not uploaded yet. |
| `main` (GitHub) | The old Render version. Don't touch it. |

## Architecture
- **Server:** `server.js` (Node with no framework), which runs locally and inside Cloudflare:
  - `worker.js` + `wrangler.jsonc`: one Durable Object per uploaded version, running `server.js` through `cloudflare:node`;
  - static files from `web/site`.
- **Game ثروة:** `game/` (rules, bots, maps) + the old client `public/` (`app.js`, `style.css`, `fx.js`). Room: `/room/<code>`.
- **New games:**
  - `games/` (xo, connect4, ludo) + `games/cards/` (tarneeb, fourhundred, trix);
  - room manager `lib/minigames.js` (`/api/g/*`, SSE);
  - client `web/src/games/**`, page `/play/<slug>/<code>`.
- **Accounts:** `lib/accounts.js` (accounts, sessions, Google sign-in, admin, game results), storage `data/store.js`.
- **Front end:** Astro 7 in `web/`. Pages: `/`, `/games`, `/games/<slug>`, `/store`, `/leaders`, `/u/<name>`, `/settings`, `/login`, `/register`, `/privacy`. `npm --prefix web run build && npm --prefix web run assemble` builds them into `web/site/`.
- **Database:** Supabase Postgres via Cloudflare Hyperdrive «tharwa-db» (caching off). A direct connection from the Worker fails on Supabase's certificate, so Hyperdrive is required.

## Accounts and settings (no secrets here)
- **Cloudflare:** the saleh83277 account (Free Workers plan), which owns the domain serva-g.com.
  - Worker `tharwa` and Worker `serva-g-redirect` (`cf-redirect/`).
  - Secrets on the Worker: `ADMIN_USERS`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL` (old, unused; the connection goes through Hyperdrive).
  - `PUBLIC_URL` and `GOOGLE_CLIENT_ID` live in `wrangler.jsonc`.
- **Google sign-in:** Google Cloud project `tharwa-514918` (account fadihosyni@gmail.com), app «ثروة», published (In production).
- **Owner's account on the site:** `serva` (admin).
- ⚠️ **The database password was exposed in a chat screenshot.** Change it in Supabase, then update it in Hyperdrive and in Render.

## Running, testing, uploading
```bash
TEST_PORT=8711 node test/run-all.js   # all tests (port 8701 may be busy)
npx wrangler dev --port 8713           # full local copy as on Cloudflare (STORE=memory from .dev.vars)
npx wrangler deploy                    # upload to serva-g.com (builds web automatically) — closes open rooms
```
- Before uploading, make sure nobody is playing: `curl https://serva-g.com/api/rooms` should return `[]`.
- **While testing in the browser, mute the sound:** `localStorage.setItem('tharwa_sound','0')`. The owner found it very annoying.
- A running `wrangler dev` doesn't pick up a rebuild of `web/site` (pages break). Restart it after building.

## Current status: work not finished yet (branch `dev/pro-graphics`)
1. **Ludo 3D** (Three.js + cannon-es + GSAP): almost finished. It stopped at the last phone check. Files: `web/src/games/ludo3d/**`, `web/public/ludo3d/**`, `web/src/games/ludo.ts`.
   - Notes to fix:
     - the die lands on the red base and covers a piece on phones;
     - the «ارمي النرد» button shows during the computer's turn;
     - the «ما في حركة» message covers the top of the board.
   - **Strict dice rule:** the die shows only the rolled number; its faces are blank while it rolls.
2. **Game checks (QA):** 12 bugs fixed (details below) plus the last fixes:
   - ثروة city names on phones split mid-word;
   - the chat button covers «بيع بالمزاد»;
   - the «غرف شغالة» counter in admin;
   - the أربعمية score box.

   These are on the branch; check them in the browser before uploading.
3. **Removing the points system: NOT started yet.** Owner's decision:
   - remove points completely (no stake, nothing shown in the interface);
   - leaderboard ranked by wins;
   - maps sold for real money later, with the payment method decided later. Recommended: codes sold on the serva-s.com store, plus a «فعّل كودك» page;
   - in the meantime, the store shows prices in $ with «قريباً», and admin grants maps manually (`grantMap`).
4. **Payments:** postponed by the owner's decision.

### The 12 bugs fixed by the checks
- إكس أو: the grid (rows unequal), the score reversed in RTL, the board running off the screen, the result card not showing who won.
- Every game: names disappearing after refreshing the page, the points badge «50+», points in the header not updating.
- Server: the computer played before round-end and trick animations finished.
- Card games on phones: the hand was hidden under the bottom bar.
- أربعة بخط on phones: the column stayed lit after a tap.
- Profile: the game history didn't say which game, and a winning partner showed as losing.

### Known issues still open
- Ludo with 3–4 players: the game continues after the first winner until only one player is left.
- Admin counts only ثروة rooms (fix in progress on the branch).
- Card games: no button to choose your partner. Seats follow join order.
- Konkan not built.

## The owner's rules (important)
- **Replies to the owner:** Arabic (Syrian dialect).
- **Look:** dark navy `#030816` with cyan `#00b4ff`/`#2fe2ff` and gold, Tajawal font. **No emoji anywhere.** Use SVG icons from `public/art.js` `ART.ui`.
- **Serva logo:** never redraw it. Use the files in `public/brand/`.
- **Cards:** all blue, no red. Art in `web/public/cards/*.webp`; originals in `C:\Users\Serva\Desktop\تات\card-art-originals\`.
- **Dice:** show only the number actually rolled.
- **Quality:** the owner wants professional work and games that look real, not flat drawings.
- **Asking first:** don't download anything large and don't add paid services without the owner's approval.

## Installed tools
- **Blender 5.2.4:** `C:\Users\Serva\Tools\blender-5.2.4-windows-x64\blender.exe`. Run headless with `-b -P script.py`. Example: `tools/blender/render_die.py`.
- **Web libraries** (in `web/`): pixi.js 8.22.0, three 0.187.0, gsap 3.15.0, cannon-es 0.20.0.
- **Free CC0 Kenney packs** in `C:\Users\Serva\Tools\kenney\`: sounds (casino, interface, ui, impact, music), boardgame-pack, board-game-icons, domino-pack, city-kit-commercial.
- **Screenshots of the work:** `showcase/` (not in git).
