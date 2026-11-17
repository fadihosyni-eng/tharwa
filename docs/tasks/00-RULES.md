# Rules for every task (read before any work)

You are an agent working on the Serva Games project. The supervisor (Claude) reviews your work after you finish. Read `HANDOFF.md` first; it explains the project.

## Mandatory
1. **Branch:** work on `dev/pro-graphics` only. **No `git commit`, no `git push`, no `wrangler deploy`.** The supervisor commits and uploads after review.
2. **Database:** don't touch the real database or the Cloudflare/Google settings. Test locally only, with `STORE=memory` (from `.dev.vars`).
3. **Ports:** don't use or restart port 8700. Use ports from 8720 to 8729 and 4340 to 4349.
4. **Sound:** keep sound off in the browser while testing: `localStorage.setItem('tharwa_sound','0')`. The owner finds the sounds annoying.
5. **Language and look:** the interface is Arabic RTL (Syrian dialect, like the current texts). **No emoji anywhere**; use SVG icons from `public/art.js` (`ART.ui`). Don't redraw the Serva logo; use `public/brand/`.
6. **Quality:** the owner wants professional work. Every change must look good on the computer (1440×900) and on the phone (390×844), with no horizontal scrolling.
7. **Tests:**
   - `TEST_PORT=8721 node test/run-all.js` must pass;
   - `npm --prefix web run build` must succeed;
   - if you change behaviour, update or add tests.
8. **Stay in scope:** don't change files outside what the task needs.
9. **Stop the servers** you started before you finish.

## When you finish (very important)
Write a report to `agent-reports/<task-number>.md` containing:
- what you changed (files);
- what you tested and how (with the end of the test output);
- screenshots, if any (save them to `showcase/agent/<task-number>/`);
- what you couldn't do and why.

Then write the last line of the report on its own: `STATUS: DONE`, or `STATUS: BLOCKED` with the reason.
