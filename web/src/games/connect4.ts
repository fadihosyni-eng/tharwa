// «أربعة بخط» board: 7×6 grid, discs fall into place, column buttons, winning four glow.
import type { Board, Ctx, Room } from './types';

const W = 7, H = 6;

export function createConnect4(el: HTMLElement, under: HTMLElement, ctx: Ctx): Board {
  // grid rows top→bottom; cell index = row * 7 + col with row 0 at the bottom (as on the server)
  const cellsHTML: string[] = [];
  for (let gr = 0; gr < H; gr++) for (let c = 0; c < W; c++) {
    const i = (H - 1 - gr) * W + c;
    cellsHTML.push(`<div class="mg-c4-cell" data-i="${i}"><span class="mg-c4-disc"></span></div>`);
  }
  el.innerHTML = `<div class="mg-c4">
    <div class="mg-c4-preview" aria-hidden="true">${Array.from({ length: W }, (_, c) => `<span data-c="${c}"></span>`).join('')}</div>
    <div class="mg-c4-frame">
      <div class="mg-c4-grid">${cellsHTML.join('')}</div>
      <div class="mg-c4-cols">${Array.from({ length: W }, (_, c) => `<button type="button" data-c="${c}" aria-label="عمود ${c + 1}"></button>`).join('')}</div>
    </div>
  </div>`;
  under.innerHTML = '';
  const cells = new Map<number, HTMLElement>();
  el.querySelectorAll<HTMLElement>('.mg-c4-cell').forEach((c) => cells.set(Number(c.dataset.i), c));
  const cols = [...el.querySelectorAll<HTMLButtonElement>('.mg-c4-cols button')];
  const preview = [...el.querySelectorAll<HTMLElement>('.mg-c4-preview span')];
  let room: Room | null = null;
  let sending = false;

  const canPlay = (r: Room) => r.status === 'playing' && !!r.turn && r.turn.pid === r.me && !r.state.over;
  const mySeat = (r: Room) => (r.me ? r.state.seats.indexOf(r.me) : -1);
  const full = (r: Room, c: number) => r.state.board[(H - 1) * W + c] >= 0;

  cols.forEach((b) => {
    const c = Number(b.dataset.c);
    b.addEventListener('mouseenter', () => { if (room && canPlay(room)) preview.forEach((p, k) => p.className = k === c ? 'on s' + mySeat(room!) : ''); });
    b.addEventListener('mouseleave', () => preview.forEach((p) => p.className = ''));
    b.addEventListener('click', async () => {
      if (!room || sending || !canPlay(room) || full(room, c)) return;
      sending = true;
      preview.forEach((p) => p.className = '');
      await ctx.act('drop', { col: c });
      sending = false;
    });
  });

  return {
    hint: () => 'اختار عمود لتنزّل قرصك',
    async render(r, animate) {
      room = r;
      const s = r.state;
      const drop = animate ? r.ev.find((e) => e.t === 'drop') : null;
      for (const [i, cell] of cells) {
        const v = s.board[i];
        const disc = cell.firstElementChild as HTMLElement;
        disc.className = 'mg-c4-disc' + (v >= 0 ? ' s' + v : '');
        cell.classList.toggle('win', !!s.line && s.line.includes(i));
        cell.classList.toggle('last', s.last === i && !s.line);
        if (drop && i === drop.row * W + drop.col) {
          disc.style.setProperty('--fall', String(H - drop.row));
          disc.classList.add('drop');
        }
      }
      const play = canPlay(r);
      cols.forEach((b, c) => { b.disabled = !play || full(r, c); });
      el.querySelector('.mg-c4')!.classList.toggle('my-turn', play);
      if (drop) {
        ctx.sound('bid');
        await new Promise((res) => setTimeout(res, 420));
      }
    },
  };
}
