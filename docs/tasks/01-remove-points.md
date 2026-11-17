# Task 01: remove the points system completely

The owner's decision: «بدي تشيل نظام النقاط بالكامل خلي الخرائط بنحطها بمصاري بدل نقاط».
Payment for maps will come later. **Don't build any payment now.**

Read `docs/tasks/00-RULES.md` first.

## Required
1. **Server:**
   - `lib/accounts.js` `recordGame`: no more points change after games. Remove stake, perGame and perWin, but keep recording game results, wins and the number of games.
   - Remove the admin's «+/− نقاط» action and the points settings from admin and from `/api/site`.
   - `/api/maps/buy` returns a clear 410 «الشرا بالنقاط انشال».
   - Don't delete columns from the database; just stop using them.
2. **Leaderboard:** sort by wins, then fewer games played, then the older account.
3. **Admin:**
   - Keep giving and removing a map from any user (the existing `grantMap`), and make it easy to find in the user's details.
   - Map prices become USD numbers the admin can edit, stored in place of the points price. Defaults: classic free, and the rest $0.99 / $1.99 / $2.99 by level.
4. **The interface:** remove every points display from everywhere:
   - the header, the home account card, the profile, the leaderboard;
   - game result cards («+50»), the badges in the players list, settings, admin;
   - the «ثروة» room (`public/app.js`, `public/account.js`), and the rules texts that mention «نقاط».

   The leaderboard shows: wins, number of games, win rate.
5. **The store:**
   - every map with its $ price and a «قريباً» button (disabled), plus the note «الدفع رح يتفعّل قريباً»;
   - owned maps show «عندك»;
   - classic stays free and selectable;
   - nothing looks broken or fake.
6. **Tests:** update `test/auth.js`, `test/api.js`, `test/minigames.js`, `test/cards-games.js` and any test that depends on points.

## Screenshots
In `showcase/agent/01/`: the store, the leaderboard, a profile, a game result card, a user's details in admin with giving a map — computer and phone.

## The report
`agent-reports/01.md` per the rules, ending with `STATUS: DONE`.
