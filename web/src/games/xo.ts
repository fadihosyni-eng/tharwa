// «إكس أو» board: 3×3 buttons with drawn X / O marks, winning line glow, best-of score.
import { esc } from '../lib/client';
import type { Board, Ctx, Room } from './types';

const X_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M26 26 L74 74"/><path pathLength="1" d="M74 26 L26 74"/></svg>';
const O_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle pathLength="1" cx="50" cy="50" r="27"/></svg>';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createXO(el: HTMLElement, under: HTMLElement, ctx: Ctx): Board {
  el.innerHTML = `<div class="mg-xo">
    <div class="mg-xo-score" hidden></div>
    <div class="mg-xo-grid" role="grid" aria-label="لوح إكس أو">${Array.from({ length: 9 }, (_, i) => `<button type="button" class="mg-xo-cell" data-i="${i}" aria-label="خانة ${i + 1}"></button>`).join('')}</div>
  </div>`;
  under.innerHTML = '';
  const cells = [...el.querySelectorAll<HTMLButtonElement>('.mg-xo-cell')];
  const score = el.querySelector<HTMLElement>('.mg-xo-score')!;
  let room: Room | null = null;
  let sending = false;

  el.querySelector('.mg-xo-grid')!.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.mg-xo-cell');
    if (!b || !room || sending || !canPlay(room) || b.classList.contains('filled')) return;
    sending = true;
    b.classList.add('pending');
    await ctx.act('place', { cell: Number(b.dataset.i) });
    b.classList.remove('pending');
    sending = false;
  });
  const canPlay = (r: Room) => r.status === 'playing' && !!r.turn && r.turn.pid === r.me && !r.state.over;

  function paintBoard(board: number[], line: number[] | null, fresh: number, r: Room) {
    cells.forEach((c, i) => {
      const v = board[i];
      const html = v === 0 ? X_SVG : v === 1 ? O_SVG : '';
      const kind = v === 0 ? 'x' : v === 1 ? 'o' : '';
      if (c.dataset.kind !== kind) { c.innerHTML = html; c.dataset.kind = kind; }
      c.classList.toggle('filled', v >= 0);
      c.classList.toggle('x', v === 0);
      c.classList.toggle('o', v === 1);
      c.classList.toggle('new', i === fresh);
      c.classList.toggle('win', !!line && line.includes(i));
      c.disabled = !(canPlay(r) && v < 0);
    });
    el.querySelector('.mg-xo-grid')!.classList.toggle('my-turn', canPlay(r));
  }
  function paintScore(r: Room) {
    const s = r.state;
    if (!s || s.bestOf <= 1) { score.hidden = true; return; }
    const px = ctx.player(s.seats[0]), po = ctx.player(s.seats[1]);
    score.hidden = false;
    score.innerHTML = `<span class="x">X ${esc(px ? px.name : '')}</span><b>${s.score[0]} : ${s.score[1]}</b><span class="o">${esc(po ? po.name : '')} O</span><small>الجولة ${Math.min(s.round, s.bestOf)} من ${s.bestOf}</small>`;
  }

  return {
    hint: () => 'اختار خانة فاضية',
    async render(r, animate) {
      room = r;
      const s = r.state;
      const place = animate ? r.ev.find((e) => e.t === 'place') : null;
      const roundEnd = animate ? r.ev.find((e) => e.t === 'round') : null;
      if (place) ctx.sound('bid');
      if (roundEnd && s.lastRound) {
        // show the finished round (with its winning line) before the fresh board of the next round
        paintBoard(s.lastRound.board, s.lastRound.line, place ? place.cell : -1, { ...r, status: 'ended' } as Room);
        paintScore(r);
        await wait(1500);
        paintBoard(s.board, null, -1, r);
        return;
      }
      paintBoard(s.board, s.line, place ? place.cell : -1, r);
      paintScore(r);
    },
  };
}
