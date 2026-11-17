# Task 02: finish Ludo 3D

Ludo 3D is almost done (Three.js + cannon-es + GSAP). Files: `web/src/games/ludo3d/**`, `web/public/ludo3d/**`, `web/src/games/ludo.ts`.
Read `docs/tasks/00-RULES.md` first.

## Fix these notes
1. On the phone, the 3D die lands on the red base and covers a piece. Make it land in a place that never covers pieces (the centre of the board, or a side tray).
2. The «ارمي النرد» button shows during the computer's turn. Hide it, or show a clear «دور بوت …» state.
3. The «ما في حركة بهالرقم» message covers the top of the board. Make it a small toast that doesn't cover the board.

## Strict rule (the owner's)
The die shows **only the number actually rolled**. Its faces are blank while it rolls, and pips appear only on the top face (the server's value) after it settles. Prove this with several quick screenshots during the roll.

## Check
- A full game against 3 bots on computer and phone.
- A game with two tabs as two players.
- No errors in the console. Smooth performance on the phone.
- Fallback to the 2D board if WebGL isn't available.

## Screenshots
In `showcase/agent/02/`: before and after for each note, the board on computer and phone, the die mid-roll (blank) and after it settles.

## The report
`agent-reports/02.md` per the rules, ending with `STATUS: DONE`.
