// Table for «كونكان» (server: games/cards/konkan.js — rules and sources are in its header).
// Layout: the other players along the top (next player on your right), the stock and the discard pile on the side,
// every player's melds in their own zone in the middle, your bar (status, staged melds, actions) and your hand fanned
// at the bottom. The hand keeps its own order on this device: auto-sorted by suit or by rank, or arranged by dragging.
// Tap / click selects cards; drag a card onto a glowing meld to lay it off, onto the discard pile to throw it, or along
// the hand to move it. Live check of the selection (run / set, points, the opening minimum) before «نزّل».
import { esc, ui, avatarHTML } from '../../lib/client';
import type { Board, Ctx, Room, Player } from '../types';
import { cardImg, preloadCards, suitIcon, SUIT_AR, rankLabel } from './art';
import './cards.css';
import './konkan.css';

type St = any;
type Meld = { id: number; owner: number; type: 'set' | 'run'; cards: string[]; reps: string[]; rank?: string; suit?: string; lo?: number; hi?: number };
type Slot = { k: string; c: string };

// ---------------------------------------------------------------- rules shared with the server (live check only)
const JOKER = 'XX';
const RANKS = '23456789TJQKA';
const SUIT_ORDER = 'SHCD';
const isJoker = (c: string) => c === JOKER;
const rankNum = (c: string) => RANKS.indexOf(c[0]) + 2;
const posValue = (n: number) => (n === 1 ? 1 : n === 14 ? 11 : Math.min(10, n));
const RANK_AR: Record<string, string> = { A: 'آصات', K: 'شياب', Q: 'بنات', J: 'شباب', T: 'عشرات' };

/** Same as parseMeld() in games/cards/konkan.js. */
export function parseMeld(cards: string[]): { type: 'set' | 'run'; value: number; rank?: string; suit?: string } | null {
  if (cards.length < 3 || cards.length > 13) return null;
  const real = cards.filter((c) => !isJoker(c));
  const jokers = cards.length - real.length;
  if (real.length < 2) return null;
  const r0 = real[0][0];
  if (real.every((c) => c[0] === r0)) {
    if (cards.length > 4 || new Set(real.map((c) => c[1])).size !== real.length) return null;
    return { type: 'set', rank: r0, value: cards.length * posValue(rankNum(real[0])) };
  }
  const su = real[0][1];
  if (!real.every((c) => c[1] === su)) return null;
  for (const aceHigh of [true, false]) {
    const nums = real.map((c) => (c[0] === 'A' && !aceHigh ? 1 : rankNum(c))).sort((a, b) => a - b);
    if (nums.some((n, i) => i > 0 && n === nums[i - 1])) continue;
    const lo = nums[0], hi = nums[nums.length - 1];
    const gaps = hi - lo + 1 - nums.length;
    if (gaps > jokers) continue;
    let extra = jokers - gaps, top = hi, bottom = lo;
    while (extra > 0 && top < (aceHigh ? 14 : 13)) { top++; extra--; }
    while (extra > 0 && bottom > (aceHigh ? 2 : 1)) { bottom--; extra--; }
    if (extra > 0) continue;
    let value = 0;
    for (let n = bottom; n <= top; n++) value += posValue(n);
    return { type: 'run', suit: su, value };
  }
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = (a: Animation, ms: number) => Promise.race([a.finished.then(() => {}, () => {}), wait(ms + 120)]);
const sgn = (n: number) => `<bdi>${n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'}</bdi>`;
const num = (n: number) => (n < 0 ? '−' + Math.abs(n) : String(n));
const cardText = (c: string) => (isJoker(c) ? 'جوكر' : `${rankLabel(c)} ${SUIT_AR[c[1]]}`);
const cardChip = (c: string) => (isJoker(c) ? '<b class="kk-chip">جوكر</b>' : `<b class="kk-chip">${rankLabel(c)}${suitIcon(c[1], 14)}</b>`);
const repChip = (r: string) => (r[1] === '*' ? `${rankLabel(r)}` : `${rankLabel(r)}${suitIcon(r[1], 11)}`);
const KIND_AR: Record<string, string> = { out: 'سكّر', hand: 'هاند', konkan: 'كونكان', void: 'ملغية' };

export function createKonkan(el: HTMLElement, under: HTMLElement, ctx: Ctx): Board {
  preloadCards();
  el.innerHTML = `<div class="kk-table">
    <div class="kk-felt">
      <div class="kk-opps"></div>
      <div class="kk-mid">
        <div class="kk-side">
          <div class="kk-hud"></div>
          <button type="button" class="kk-pile kk-stock" aria-label="الكومة — اسحب ورقة"><span class="kk-pile-cards"></span><small class="kk-pile-n"></small></button>
          <button type="button" class="kk-pile kk-discard" aria-label="الأرض — آخر ورقة مرمية"><span class="kk-pile-cards"></span><small class="kk-pile-n"></small></button>
        </div>
        <div class="kk-board"></div>
      </div>
      <div class="kk-bar">
        <div class="kk-mine"></div>
        <div class="kk-center">
          <div class="kk-stage" hidden></div>
          <p class="kk-status" aria-live="polite"></p>
        </div>
        <div class="kk-acts"></div>
      </div>
      <div class="kk-pop" hidden></div>
    </div>
    <div class="kk-hand" role="group" aria-label="ورقك"></div>
  </div>`;
  under.innerHTML = `<div class="ct-under kk-under">
      <button type="button" class="btn sm" data-sheet>${ui('scroll')}ورقة الحساب</button>
      <span class="kk-sort" role="group" aria-label="ترتيب الورق">
        <button type="button" class="btn sm" data-sort="suit">${ui('cards')}رتّب بالنقشة</button>
        <button type="button" class="btn sm" data-sort="rank">${ui('chart')}رتّب بالرقم</button>
      </span>
      <button type="button" class="btn sm" data-rules>${ui('eye')}القوانين باختصار</button>
    </div>
    <div class="ct-sheet panel" hidden></div>`;
  const table = el.querySelector<HTMLElement>('.kk-table')!;
  const opps = el.querySelector<HTMLElement>('.kk-opps')!;
  const hud = el.querySelector<HTMLElement>('.kk-hud')!;
  const stockEl = el.querySelector<HTMLButtonElement>('.kk-stock')!;
  const discardEl = el.querySelector<HTMLButtonElement>('.kk-discard')!;
  const boardEl = el.querySelector<HTMLElement>('.kk-board')!;
  const pop = el.querySelector<HTMLElement>('.kk-pop')!;
  const mineEl = el.querySelector<HTMLElement>('.kk-mine')!;
  const stageEl = el.querySelector<HTMLElement>('.kk-stage')!;
  const statusEl = el.querySelector<HTMLElement>('.kk-status')!;
  const actsEl = el.querySelector<HTMLElement>('.kk-acts')!;
  const handEl = el.querySelector<HTMLElement>('.kk-hand')!;
  const sheet = under.querySelector<HTMLElement>('.ct-sheet')!;

  let room: Room | null = null;
  let st: St = null;
  let offset = 0;
  let sending = false;
  let animating = false;
  let sheetOpen = false;
  let overSheet = false;
  let popTimer = 0;
  let slots: Slot[] = [];
  let keyN = 0;
  let sortMode: 'suit' | 'rank' | 'free' = 'suit';
  try { const m = localStorage.getItem('kk_sort'); if (m === 'rank' || m === 'suit') sortMode = m; } catch { /* no storage */ }
  const selected = new Set<string>();
  let staged: string[][] = [];
  const fresh = new Set<string>();     // cards just drawn (highlighted once)
  let popMelds = new Set<number>();    // melds to animate after the next paint
  let lastRound = 0;

  const me = () => (st && st.me >= 0 ? st.me : -1);
  const base = () => (st && st.me >= 0 ? st.me : 0);
  const pidOf = (seat: number) => (st ? st.seats[seat] : '');
  const playerOf = (seat: number) => ctx.player(pidOf(seat));
  const nameOf = (seat: number) => { const p = playerOf(seat); return p ? p.name : ''; };
  const who = (seat: number) => (seat === me() ? 'إنت' : nameOf(seat));
  const playing = () => !!room && room.status === 'playing' && !!st && !st.over;
  const myTurn = () => playing() && st.turn >= 0 && st.turn === me();
  const drawPhase = () => myTurn() && st.phase === 'draw';
  const playPhase = () => myTurn() && st.phase === 'play';
  const opened = () => me() >= 0 && !!st.opened[me()];
  const slotOf = (k: string) => slots.find((s) => s.k === k);
  const cardsOf = (keys: string[]) => keys.map((k) => slotOf(k)!.c);
  const stagedKeys = () => new Set(staged.flat());
  const selKeys = () => slots.filter((s) => selected.has(s.k)).map((s) => s.k);
  const selCards = () => cardsOf(selKeys());

  // ---------------------------------------------------------------- hand order (local)
  const suitKey = (c: string) => (isJoker(c) ? 999 : SUIT_ORDER.indexOf(c[1]) * 20 + rankNum(c));
  const rankKey = (c: string) => (isJoker(c) ? 999 : rankNum(c) * 4 + SUIT_ORDER.indexOf(c[1]));
  function sortSlots() {
    if (sortMode === 'free') return;
    const key = sortMode === 'suit' ? suitKey : rankKey;
    slots.sort((a, b) => key(a.c) - key(b.c));
  }
  function reconcile(hand: string[]) {
    const pool = hand.slice();
    const keep: Slot[] = [];
    for (const s of slots) { const i = pool.indexOf(s.c); if (i >= 0) { pool.splice(i, 1); keep.push(s); } }
    const added = pool.map((c) => ({ k: 'k' + ++keyN, c }));
    const firstFill = !slots.length;
    const changed = added.length > 0 || keep.length !== slots.length;
    slots = keep.concat(added);
    sortSlots();
    const live = new Set(slots.map((s) => s.k));
    for (const k of [...selected]) if (!live.has(k)) selected.delete(k);
    staged = staged.filter((g) => g.every((k) => live.has(k)));
    if (changed) fresh.clear(); // the glow on a drawn card stays until the hand changes again
    if (!firstFill && added.length <= 2) for (const s of added) fresh.add(s.k);
  }

  // ---------------------------------------------------------------- avatars & plates
  function avatar(p: Player | undefined, size: number) {
    if (!p) return `<span class="mg-ava" style="--s:${size}px">?</span>`;
    if (p.isBot) return `<span class="mg-ava bot" style="--c:${p.color || '#2fe2ff'};--s:${size}px">${ui('robot')}</span>`;
    if (p.avatar) return `<span class="mg-ava-wrap" style="--c:${p.color || '#2fe2ff'}">${avatarHTML(p.avatar, size)}</span>`;
    return `<span class="mg-ava" style="--c:${p.color || '#2fe2ff'};--s:${size}px">${esc([...p.name][0] || '?')}</span>`;
  }
  function plateHTML(seat: number, mine: boolean) {
    const p = playerOf(seat);
    const turn = playing() && st.turn === seat;
    const gone = (st.gone && st.gone[seat]) || (p && p.left);
    const tags = [
      `<span class="ct-tag score" title="مجموع النقاط"><bdi>${num(st.scores[seat])}</bdi></span>`,
      st.opened[seat] ? '<span class="ct-tag ok" title="نزل">نازل</span>' : '<span class="ct-tag muted" title="لسا ما نزل">ما نزل</span>',
      mine ? '' : `<span class="ct-tag" title="ورق بإيده">${ui('cards')}${st.counts[seat]}</span>`,
    ].join('');
    const sub = gone ? 'انسحب' : st.dealer === seat ? 'الموزّع' : !mine && p && p.isBot ? 'كمبيوتر' : '';
    return `<div class="kk-plate${turn ? ' turn' : ''}${gone ? ' gone' : ''}" data-seat="${seat}">
      <span class="ct-ring">${avatar(p, mine ? 34 : 36)}</span>
      <span class="kk-pinfo"><span class="kk-pname"><b>${esc(mine ? 'إنت' : p ? p.name : '')}</b>${sub ? `<small>${sub}</small>` : ''}</span>
      <span class="ct-tags">${tags}</span></span>
      ${mine ? '' : `<span class="kk-backs" aria-hidden="true" style="--m:${(Math.min(st.counts[seat], 6) - 1) / 2}">${Array.from({ length: Math.min(st.counts[seat], 6) }, (_, i) => `<i style="--i:${i}">${cardImg('back')}</i>`).join('')}</span>`}
      <span class="ct-bubble" hidden></span>
    </div>`;
  }
  const order = () => Array.from({ length: st.n }, (_, i) => (base() + i) % st.n);
  function paintPlates() {
    const others = me() >= 0 ? order().slice(1) : order();
    opps.innerHTML = others.map((x) => plateHTML(x, false)).join('');
    opps.dataset.n = String(others.length);
    mineEl.innerHTML = me() >= 0 ? plateHTML(me(), true) : `<div class="kk-spect">${ui('eye')}عم تتفرّج</div>`;
  }

  // ---------------------------------------------------------------- piles & hud
  function paintPiles() {
    const nStock = st.stock;
    stockEl.querySelector('.kk-pile-cards')!.innerHTML = Array.from({ length: Math.min(4, Math.ceil(nStock / 12)) }, (_, i) => `<i style="--i:${i}">${cardImg('back')}</i>`).join('') || '<i class="empty"></i>';
    stockEl.querySelector('.kk-pile-n')!.textContent = `الكومة ${nStock}`;
    const top = st.discard;
    discardEl.querySelector('.kk-pile-cards')!.innerHTML = top ? `${st.discardCount > 1 ? '<i class="under"></i>' : ''}<i class="face" data-c="${top}">${cardImg(top)}</i>` : '<i class="empty"></i>';
    discardEl.querySelector('.kk-pile-n')!.textContent = !st.lastDiscard ? 'الأرض' : st.lastDiscard.seat === me() ? 'إنت رميتها' : `رماها ${nameOf(st.lastDiscard.seat)}`;
    const canDraw = drawPhase();
    stockEl.classList.toggle('live', canDraw);
    discardEl.classList.toggle('live', canDraw && !!st.canTake);
    stockEl.disabled = !canDraw;
    discardEl.title = canDraw && !st.canTake && top ? 'ما فيك تاخدها إلا إذا رح تنزّلها بنفس الدور' : '';
    hud.innerHTML = `<div class="kk-hud-row"><span>الجولة</span><b>${Math.min(st.round, st.rounds)}</b><small>من ${st.rounds}</small></div>
      <div class="kk-hud-row"><span>النزول</span><b>${st.minOpen}</b></div>${st.reshuffles ? `<div class="kk-hud-row small"><span>انخلطت الأرض</span><b>${st.reshuffles}</b></div>` : ''}`;
  }

  // ---------------------------------------------------------------- melds board
  function fitsFor(cards: string[]): Set<number> {
    const out = new Set<number>();
    if (!playPhase() || !opened()) return out;
    if (cards.length === 1) for (const id of (st.layoffs[cards[0]] || [])) out.add(id);
    if (cards.length === 2) {
      const key = cards.slice().sort().join();
      for (const s of st.swaps || []) if (s.cards.slice().sort().join() === key) out.add(s.meld);
    }
    return out;
  }
  function meldHTML(m: Meld, fit: boolean) {
    const p = parseMeld(m.cards);
    const label = m.type === 'run' ? `${suitIcon(m.suit!, 10)}` : '';
    return `<button type="button" class="kk-meld${fit ? ' fit' : ''}${popMelds.has(m.id) ? ' pop' : ''}" data-id="${m.id}" aria-label="${m.type === 'run' ? 'سلسلة' : 'مجموعة'}${fit ? ' — فيك تركّب عليها' : ''}">
      <span class="kk-mcards${m.cards.length > 5 ? ' long' : ''}">${m.cards.map((c, i) => `<span class="kk-mc${isJoker(c) ? ' joker' : ''}">${cardImg(c)}${isJoker(c) ? `<i class="kk-rep">${repChip(m.reps[i])}</i>` : ''}</span>`).join('')}</span>
      <small class="kk-mlbl" title="${m.type === 'run' ? 'سلسلة' : esc(RANK_AR[m.rank!] || 'مجموعة')}">${label}<em>${p ? p.value : ''}</em></small>
    </button>`;
  }
  function paintBoard() {
    const fit = fitsFor(selCards());
    const seats = me() >= 0 ? [...order().slice(1), me()] : order();
    boardEl.dataset.n = String(st.n);
    boardEl.innerHTML = seats.map((x) => {
      const melds: Meld[] = st.melds.filter((m: Meld) => m.owner === x);
      const mine = x === me();
      return `<section class="kk-zone${mine ? ' mine' : ''}${playing() && st.turn === x ? ' turn' : ''}" data-seat="${x}">
        <header><b>${esc(who(x))}</b>${st.opened[x] ? `<span class="ct-tag ok">نازل</span>` : '<span class="ct-tag muted">ما نزل</span>'}</header>
        <div class="kk-melds">${melds.length ? melds.map((m) => meldHTML(m, fit.has(m.id))).join('') : `<span class="kk-empty">${st.opened[x] ? '' : `لسا ما نزل ${st.minOpen}`}</span>`}</div>
      </section>`;
    }).join('');
    popMelds = new Set();
    fitBoard();
  }
  boardEl.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.kk-meld');
    if (!b) return;
    const keys = selKeys();
    const fit = fitsFor(cardsOf(keys));
    const id = Number(b.dataset.id);
    if (!fit.has(id)) {
      if (playPhase() && keys.length) nope(b);
      return;
    }
    layoff(id, keys);
  });

  // ---------------------------------------------------------------- hand
  let handSig = '';
  function paintHand(animateDeal = false) {
    const st2 = stagedKeys();
    const list = slots.filter((s) => !st2.has(s.k));
    handEl.classList.toggle('spectator', me() < 0);
    handEl.classList.toggle('active', myTurn());
    const must = st.mustUse;
    // same cards in the same order: keep the buttons (a drag or a focus in progress survives other players' moves)
    const sig = `${list.map((s) => s.k).join()}|${[...fresh].join()}|${must}|${animateDeal}`;
    if (sig === handSig && !animateDeal) { paintSelOnly(); return; }
    handSig = sig;
    let mustMarked = false;
    handEl.innerHTML = list.map((s, i) => {
      const isMust = !!must && s.c === must && !mustMarked;
      if (isMust) mustMarked = true;
      return `<button type="button" class="kk-hcard${selected.has(s.k) ? ' sel' : ''}${fresh.has(s.k) ? ' fresh' : ''}${isMust ? ' must' : ''}${animateDeal ? ' dealt' : ''}"
        data-k="${s.k}" data-c="${s.c}" style="--i:${i}" aria-pressed="${selected.has(s.k)}" aria-label="${cardText(s.c)}">${cardImg(s.c)}</button>`;
    }).join('');
    layoutHand();
  }
  function layoutHand() {
    const cards = [...handEl.querySelectorAll<HTMLElement>('.kk-hcard')];
    const n = cards.length;
    if (!n) return;
    const W = handEl.clientWidth;
    const cw = cards[0].offsetWidth || 84;
    const step = n > 1 ? Math.min(cw * 0.62, (W - cw - 8) / (n - 1)) : 0;
    const start = (W - (cw + step * (n - 1))) / 2;
    const mid = (n - 1) / 2;
    const spread = Math.min(2.2, 26 / n);
    cards.forEach((c, i) => {
      const d = i - mid;
      c.style.left = `${start + i * step}px`;
      c.style.setProperty('--rot', `${d * spread}deg`);
      c.style.setProperty('--dy', `${d * d * 0.5}px`);
      c.style.zIndex = String(i + 1);
    });
  }
  new ResizeObserver(() => layoutHand()).observe(handEl);
  // Meld cards are drawn as big as the table allows (48 px at 1440×900); a crowded table shrinks them step by step
  // (down to 34 px) so every zone stays fully visible instead of scrolling.
  function fitBoard() {
    if (matchMedia('(max-width: 760px)').matches) { boardEl.style.removeProperty('--mw'); return; }
    let mw = 48;
    boardEl.style.setProperty('--mw', mw + 'px');
    while (boardEl.scrollHeight > boardEl.clientHeight && mw > 34) { mw -= 2; boardEl.style.setProperty('--mw', mw + 'px'); }
  }
  let fitW = 0;
  new ResizeObserver(() => { if (boardEl.clientWidth !== fitW) { fitW = boardEl.clientWidth; fitBoard(); } }).observe(boardEl);
  function nope(b: Element) { b.classList.remove('nope'); void (b as HTMLElement).offsetWidth; b.classList.add('nope'); }
  function toggle(k: string) {
    if (selected.has(k)) selected.delete(k); else selected.add(k);
    paintSel();
  }
  function paintSelOnly() {
    handEl.querySelectorAll<HTMLElement>('.kk-hcard').forEach((b) => {
      const on = selected.has(b.dataset.k!);
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  // repaint only what depends on the selection
  function paintSel() {
    paintSelOnly();
    const fit = fitsFor(selCards());
    boardEl.querySelectorAll<HTMLElement>('.kk-meld').forEach((m) => m.classList.toggle('fit', fit.has(Number(m.dataset.id))));
    paintBar();
  }

  // drag: onto a meld = lay off, onto the discard pile = throw, along the hand = move the card
  let drag: { k: string; x0: number; y0: number; el: HTMLElement; ghost: HTMLElement | null; id: number } | null = null;
  handEl.addEventListener('pointerdown', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.kk-hcard');
    if (!b || e.button !== 0 || me() < 0) return;
    drag = { k: b.dataset.k!, x0: e.clientX, y0: e.clientY, el: b, ghost: null, id: e.pointerId };
    try { b.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
  });
  handEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      const g = document.createElement('div');
      g.className = 'kk-ghost';
      g.innerHTML = cardImg(slotOf(drag.k)!.c);
      document.body.appendChild(g);
      drag.ghost = g;
      drag.el.classList.add('dragging');
      const fit = fitsFor([slotOf(drag.k)!.c]);
      boardEl.querySelectorAll<HTMLElement>('.kk-meld').forEach((m) => m.classList.toggle('fit', fit.has(Number(m.dataset.id))));
      discardEl.classList.toggle('drop', canDiscard(1));
    }
    const g = drag.ghost;
    g.style.transform = `translate(${e.clientX - g.offsetWidth / 2}px, ${e.clientY - g.offsetHeight * 0.6}px) rotate(-4deg)`;
  });
  const endDrag = (e: PointerEvent, cancel: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.ghost) { if (!cancel) toggle(d.k); return; }
    d.ghost.remove();
    d.el.classList.remove('dragging');
    discardEl.classList.remove('drop');
    if (cancel) { paintSel(); return; }
    const at = document.elementFromPoint(e.clientX, e.clientY);
    const card = slotOf(d.k)!.c;
    const meld = at && at.closest<HTMLElement>('.kk-meld');
    if (meld) {
      const id = Number(meld.dataset.id);
      if (fitsFor([card]).has(id)) { layoff(id, [d.k]); return; }
      nope(meld); paintSel(); return;
    }
    if (at && at.closest('.kk-discard')) {
      if (canDiscard(1)) { discard(d.k); return; }
      nope(discardEl); paintSel(); return;
    }
    // move inside the hand
    const r = handEl.getBoundingClientRect();
    if (e.clientY > r.top - 60) {
      const others = [...handEl.querySelectorAll<HTMLElement>('.kk-hcard')].filter((x) => x.dataset.k !== d.k);
      let idx = 0;
      for (const o of others) { const b = o.getBoundingClientRect(); if (e.clientX > b.left + b.width / 2) idx++; }
      const visible = others.map((o) => o.dataset.k!);
      const target = idx < visible.length ? visible[idx] : null;
      const from = slots.findIndex((s) => s.k === d.k);
      const [moved] = slots.splice(from, 1);
      const to = target ? slots.findIndex((s) => s.k === target) : slots.length;
      slots.splice(to, 0, moved);
      sortMode = 'free';
      paintSortBtns();
      handSig = '';
      paintHand();
      paintSel();
      return;
    }
    paintSel();
  };
  handEl.addEventListener('pointerup', (e) => endDrag(e, false));
  handEl.addEventListener('pointercancel', (e) => endDrag(e, true));
  handEl.addEventListener('click', (e) => { // keyboard (Enter / Space) — pointer clicks are handled above
    if ((e as MouseEvent).detail !== 0) return;
    const b = (e.target as Element).closest<HTMLElement>('.kk-hcard');
    if (b) toggle(b.dataset.k!);
  });

  // ---------------------------------------------------------------- actions
  async function send(type: string, data: Record<string, unknown> = {}) {
    if (sending || animating) return false;
    sending = true;
    paintBar();
    const ok = await ctx.act(type, data);
    sending = false;
    if (!ok) paintBar();
    return ok;
  }
  const canDiscard = (n: number) => playPhase() && !st.mustUse && !staged.length && n === 1;
  async function layoff(id: number, keys: string[]) {
    const cards = cardsOf(keys);
    if (await send('layoff', { meld: id, cards })) { keys.forEach((k) => selected.delete(k)); }
  }
  async function discard(k: string) {
    const c = slotOf(k)!.c;
    if (await send('discard', { card: c })) selected.delete(k);
  }
  function plan() {
    const sel = selCards();
    const selP = sel.length ? parseMeld(sel) : null;
    const groups = staged.map((g) => cardsOf(g));
    if (selP) groups.push(sel);
    const parsed = groups.map((g) => parseMeld(g));
    const total = parsed.reduce((a, p) => a + (p ? p.value : 0), 0);
    const count = groups.reduce((a, g) => a + g.length, 0);
    const handN = slots.length;
    const must = st.mustUse;
    const hasMust = !must || groups.some((g) => g.includes(must));
    const ok = groups.length > 0 && parsed.every(Boolean) && (opened() || total >= st.minOpen) && handN - count >= 1 && hasMust && (!sel.length || !!selP);
    return { sel, selP, groups, total, count, handN, hasMust, ok };
  }
  function statusText(): string {
    if (!st || room!.status !== 'playing') return '';
    if (me() < 0) return st.turn >= 0 ? `دور ${esc(nameOf(st.turn))}` : '';
    if (!myTurn()) return st.turn >= 0 ? `ناطرين ${esc(nameOf(st.turn))}…` : '';
    if (st.phase === 'draw') {
      return st.canTake ? `اسحب من الكومة، أو خود ${cardChip(st.discard)} وانزّلها هلق` : 'اسحب ورقة من الكومة';
    }
    const p = plan();
    const parts: string[] = [];
    if (st.mustUse) parts.push(`أخدت ${cardChip(st.mustUse)} — لازم تنزّلها هالدور`);
    if (p.sel.length) {
      if (p.selP) parts.push(`${p.selP.type === 'run' ? 'سلسلة' : 'مجموعة'} صحيحة <b class="kk-num">${p.selP.value}</b> نقطة`);
      else if (p.sel.length === 1 && fitsFor(p.sel).size) parts.push('اضغط على تنزيلة مضيئة لتركّب الورقة، أو ارميها');
      else if (p.sel.length === 2 && fitsFor(p.sel).size) parts.push('حطّهن عالمجموعة المضيئة وخود الجوكر');
      else if (p.sel.length === 1) parts.push(st.mustUse ? 'اختار الورق اللي بدك تنزّله' : 'ارمي هالورقة أو اختار ورق لتنزيلة');
      else if (p.sel.length < 3) parts.push('التنزيلة بدها 3 أوراق ع الأقل');
      else parts.push('<span class="bad">هالورق مو سلسلة ولا مجموعة</span>');
    }
    if (!opened()) {
      if (p.groups.length) parts.push(`المجموع <b class="kk-num ${p.total >= st.minOpen ? 'ok' : ''}">${p.total}</b> من ${st.minOpen}`);
      else if (!p.sel.length) parts.push(`اختار ورق لأول نزلة (${st.minOpen} نقطة ع الأقل) أو ارمي ورقة`);
    } else if (!p.sel.length && !st.mustUse) parts.push('نزّل، ركّب على التنزيلات، وبالآخر ارمي ورقة');
    if (p.groups.length && p.handN - p.count < 1) parts.push('<span class="bad">لازم تخلّي ورقة لترميها</span>');
    return parts.join(' · ');
  }
  function paintStage() {
    if (!staged.length) { stageEl.hidden = true; stageEl.innerHTML = ''; return; }
    stageEl.hidden = false;
    stageEl.innerHTML = staged.map((g, i) => {
      const cards = cardsOf(g);
      const p = parseMeld(cards);
      return `<span class="kk-sg"><span class="kk-mcards">${cards.map((c) => `<span class="kk-mc">${cardImg(c)}</span>`).join('')}</span><em>${p ? p.value : 0}</em>
        <button type="button" class="kk-sg-x" data-unstage="${i}" aria-label="رجّع هالتنزيلة لإيدك">${ui('xmark')}</button></span>`;
    }).join('');
  }
  stageEl.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-unstage]');
    if (!b) return;
    staged.splice(Number(b.dataset.unstage), 1);
    paintHand(); paintStage(); paintSel();
  });
  function paintBar() {
    if (!st) return;
    statusEl.innerHTML = statusText();
    const btns: string[] = [];
    const busy = sending || animating;
    if (drawPhase()) {
      btns.push(`<button type="button" class="btn btn-cyan" data-a="draw" ${busy ? 'disabled' : ''}>${ui('cards')}اسحب</button>`);
      if (st.discard) btns.push(`<button type="button" class="btn" data-a="take" ${busy || !st.canTake ? 'disabled' : ''} title="${st.canTake ? '' : 'بتاخدها بس إذا رح تنزّلها هلق'}">${ui('hand')}خود ${cardChip(st.discard)}</button>`);
    } else if (playPhase()) {
      const p = plan();
      if (st.mustUse) btns.push(`<button type="button" class="btn" data-a="untake" ${busy ? 'disabled' : ''}>${ui('refresh')}رجّعها</button>`);
      if (!opened() && p.selP) btns.push(`<button type="button" class="btn" data-a="stage" ${busy ? 'disabled' : ''} title="حطّها على جنب وكمّل لتوصل ${st.minOpen}">${ui('pencil')}جهّز</button>`);
      btns.push(`<button type="button" class="btn btn-gold" data-a="meld" ${busy || !p.ok ? 'disabled' : ''}>${ui('check')}نزّل${p.ok ? ` <small>${p.total}</small>` : ''}</button>`);
      btns.push(`<button type="button" class="btn" data-a="discard" ${busy || !canDiscard(p.sel.length) ? 'disabled' : ''}>${ui('arrow')}ارمي</button>`);
    }
    actsEl.innerHTML = btns.join('');
    paintStage();
  }
  actsEl.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a!;
    if (a === 'draw') return void send('draw');
    if (a === 'take') return void send('take');
    if (a === 'untake') return void send('untake');
    if (a === 'stage') {
      const keys = selKeys();
      if (!parseMeld(cardsOf(keys))) return;
      staged.push(keys);
      selected.clear();
      paintHand(); paintSel();
      return;
    }
    if (a === 'meld') {
      const p = plan();
      if (!p.ok) return;
      const keys = selKeys();
      const groups = p.groups;
      if (await send('meld', { groups })) { staged = []; keys.forEach((k) => selected.delete(k)); }
      return;
    }
    if (a === 'discard') {
      const keys = selKeys();
      if (keys.length === 1) discard(keys[0]);
    }
  });
  stockEl.addEventListener('click', () => { if (drawPhase()) send('draw'); });
  discardEl.addEventListener('click', () => {
    if (!drawPhase()) {
      const keys = selKeys();
      if (keys.length === 1 && canDiscard(1)) discard(keys[0]);
      return;
    }
    if (st.canTake) send('take'); else nope(discardEl);
  });

  // ---------------------------------------------------------------- sort buttons, sheet, rules
  function paintSortBtns() {
    under.querySelectorAll<HTMLElement>('[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === sortMode));
  }
  under.querySelectorAll<HTMLElement>('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    sortMode = b.dataset.sort as 'suit' | 'rank';
    try { localStorage.setItem('kk_sort', sortMode); } catch { /* no storage */ }
    sortSlots(); paintSortBtns();
    if (st) { handSig = ''; paintHand(); paintSel(); }
  }));
  paintSortBtns();
  function sheetHTML() {
    const h: St[] = st.history || [];
    const seats = order();
    const head = `<th>#</th>${seats.map((x) => `<th>${esc(who(x))}</th>`).join('')}`;
    const rows = h.map((r) => `<tr><td>${r.round}<small>${KIND_AR[r.kind]}${r.winner >= 0 ? ` — ${esc(who(r.winner))}` : ''}</small></td>
      ${seats.map((x) => `<td class="${r.delta[x] < 0 ? 'ok' : r.delta[x] >= 100 ? 'bad' : ''}">${sgn(r.delta[x])}<small><bdi>${num(r.scores[x])}</bdi></small></td>`).join('')}</tr>`).join('');
    const total = `<tr class="kk-total"><td>المجموع</td>${seats.map((x) => `<td><b><bdi>${num(st.scores[x])}</bdi></b></td>`).join('')}</tr>`;
    return h.length ? `<table class="ct-tbl"><thead><tr>${head}</tr></thead><tbody>${rows}${total}</tbody></table><p class="muted kk-note">أقل مجموع بيربح بعد ${st.rounds} جولات.</p>`
      : '<p class="muted">لسا ما خلصت ولا جولة.</p>';
  }
  under.querySelector('[data-sheet]')!.addEventListener('click', () => {
    sheetOpen = !sheetOpen;
    sheet.hidden = !sheetOpen;
    if (sheetOpen && st) { sheet.innerHTML = `<h2>${ui('scroll')}ورقة الحساب</h2>${sheetHTML()}`; sheet.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  under.querySelector('[data-rules]')!.addEventListener('click', () => {
    showPop(`<h3>${ui('scroll')}كونكان باختصار</h3><ul class="kk-rules">
      <li>بدورك: اسحب من الكومة أو خود آخر ورقة مرمية (بس إذا رح تنزّلها بنفس الدور)، وبالآخر ارمي ورقة.</li>
      <li>سلسلة: 3+ متتالية من نفس النقشة. مجموعة: 3 أو 4 من نفس الرقم بنقشات مختلفة. الجوكر بيكمّل أي وحدة.</li>
      <li>أول نزلة ${st ? st.minOpen : 51} نقطة ع الأقل — فيك تجهّز أكتر من تنزيلة وتنزّلهن سوا.</li>
      <li>بعد ما تنزل: ركّب على كل التنزيلات، وخود الجوكر بالورقة اللي حل محلها.</li>
      <li>بتسكّر برمي آخر ورقة: −30. الباقي عليهم ورقهم، واللي ما نزل +100. هاند: −60 والباقي دبل.</li>
    </ul>`, 15000, true);
  });

  // ---------------------------------------------------------------- pop (round end, notes)
  function showPop(html: string, ms: number, wide = false) {
    clearTimeout(popTimer);
    pop.innerHTML = `<div class="kk-pop-card${wide ? ' wide' : ''}">${html}<button type="button" class="ct-pop-x" aria-label="سكّر">${ui('xmark')}</button></div>`;
    pop.hidden = false;
    table.classList.toggle('kk-popopen', wide);
    popTimer = window.setTimeout(hidePop, ms);
  }
  // while a big card (round end, rules) is open the hand is dimmed behind it
  function hidePop() { pop.hidden = true; clearTimeout(popTimer); table.classList.remove('kk-popopen'); }
  pop.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.ct-pop-x, [data-close]') || e.target === pop) hidePop();
  });
  function roundHTML(r: St) {
    const w = r.winner;
    const title = r.kind === 'void' ? 'خلص الورق — الجولة ملغية'
      : r.kind === 'konkan' ? `كونكان! ${esc(who(w))}`
        : r.kind === 'hand' ? `${esc(who(w))} نزل هاند!` : w === me() ? 'سكّرت!' : `سكّر ${esc(who(w))}`;
    const rows = order().map((x) => `<tr class="${x === w ? 'win' : ''}">
      <td><span class="kk-rname">${avatar(playerOf(x), 26)}<b>${esc(who(x))}</b></span></td>
      <td class="kk-rleft">${x === w ? `<span class="ct-tag ok">${KIND_AR[r.kind]}</span>` : r.left[x].length ? `<span class="kk-mcards">${r.left[x].map((c: string) => `<span class="kk-mc">${cardImg(c)}</span>`).join('')}</span>` : ''}</td>
      <td>${x === w ? '' : r.opened[x] ? '<span class="ct-tag ok">نازل</span>' : '<span class="ct-tag muted">ما نزل</span>'}</td>
      <td class="kk-rd ${r.delta[x] < 0 ? 'ok' : r.delta[x] > 0 ? 'bad' : ''}">${sgn(r.delta[x])}</td>
      <td class="kk-rt"><bdi>${num(r.scores[x])}</bdi></td></tr>`).join('');
    const note = r.kind === 'hand' ? 'هاند: كل النقاط دبل' : r.kind === 'konkan' ? 'كونكان: كل واحد +200' : r.kind === 'void' ? 'انخلطت الأرض مرتين وخلصت الكومة' : 'اللي ما نزل +100';
    return `<h3>${ui(r.kind === 'void' ? 'refresh' : 'trophy')}${title}</h3><p class="muted">الجولة ${r.round} من ${st ? st.rounds : 5} · ${note}</p>
      <table class="kk-rtbl"><thead><tr><th>اللاعب</th><th>ورقه</th><th></th><th>الجولة</th><th>المجموع</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="ct-panel-btns"><button type="button" class="btn btn-gold" data-close>${ui('play')}${st && st.over ? 'النتيجة' : 'كمّل'}</button></div>`;
  }

  // ---------------------------------------------------------------- animation
  function rectIn(node: Element) {
    const a = node.getBoundingClientRect(), b = table.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  }
  const plateEl = (seat: number) => table.querySelector<HTMLElement>(`.kk-plate[data-seat="${seat}"]`);
  async function fly(card: string, from: Element, to: Element, ms = 300) {
    const fr = rectIn(from), tr = rectIn(to);
    const node = document.createElement('div');
    node.className = 'kk-fly';
    node.innerHTML = cardImg(card);
    const w = 66, h = 92;
    node.style.cssText = `left:${tr.x + tr.w / 2 - w / 2}px;top:${tr.y + tr.h / 2 - h / 2}px;width:${w}px;height:${h}px`;
    table.appendChild(node);
    const dx = fr.x + fr.w / 2 - (tr.x + tr.w / 2), dy = fr.y + fr.h / 2 - (tr.y + tr.h / 2);
    await settle(node.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.6) rotate(${dx > 0 ? 10 : -10}deg)`, opacity: 0.85 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: ms, easing: 'cubic-bezier(.2,.8,.25,1)' }), ms);
    node.remove();
  }
  function bubble(seat: number, html: string, ms = 1600) {
    const p = plateEl(seat);
    const b = p && p.querySelector<HTMLElement>('.ct-bubble');
    if (!b) return;
    b.innerHTML = html;
    b.hidden = false;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    window.setTimeout(() => { b.hidden = true; }, ms);
  }
  async function dealAnim(n: number) {
    const jobs: Promise<unknown>[] = [];
    for (let k = 0; k < Math.min(8, n * 2); k++) {
      const seat = (base() + 1 + k) % n;
      const to = plateEl(seat) || handEl;
      jobs.push(wait(k * 60).then(() => fly('back', stockEl, to, 320)));
    }
    ctx.sound('card');
    await Promise.all(jobs);
  }
  // Plays room.ev over the table that still shows the previous state.
  async function playEvents(r: Room) {
    let dealt = false;
    for (const e of r.ev) {
      const seat = e.seat as number;
      const mine = seat === me() && me() >= 0;
      switch (e.t) {
        case 'draw': ctx.sound('card'); await fly('back', stockEl, mine ? handEl : plateEl(seat) || stockEl, 260); break;
        case 'take': ctx.sound('card'); await fly(e.card, discardEl, mine ? handEl : plateEl(seat) || discardEl, 300); bubble(seat, `أخد ${cardChip(e.card)}`); break;
        case 'untake': await fly(e.card, mine ? handEl : plateEl(seat) || discardEl, discardEl, 260); break;
        case 'discard': {
          const own = mine ? handEl.querySelector<HTMLElement>(`.kk-hcard[data-c="${e.card}"]`) : null;
          const from = own || plateEl(seat) || handEl;
          if (own) own.style.visibility = 'hidden';
          ctx.sound('card');
          await fly(e.card, from, discardEl, 300);
          if (e.out) { bubble(seat, 'سكّر!', 2200); ctx.sound(mine ? 'win' : 'bid'); }
          break;
        }
        case 'meld':
          for (const m of e.melds) popMelds.add(m.id);
          if (e.open) bubble(seat, `نزل <b>${e.value}</b>`, 2000);
          ctx.sound('build');
          await wait(250);
          break;
        case 'layoff':
          popMelds.add(e.meld);
          if (e.joker) bubble(seat, 'أخد الجوكر', 1800);
          ctx.sound('card');
          await wait(200);
          break;
        case 'reshuffle': showPop(`<h3>${ui('refresh')}خلصت الكومة</h3><p class="muted">انخلطت الأرض ورجعت كومة (${e.n} من 2)</p>`, 2200); await wait(400); break;
        case 'hand':
          ctx.sound(me() >= 0 && e.delta[me()] < 0 ? 'cash' : 'pay');
          showPop(roundHTML(e), 9000, true);
          await wait(600);
          break;
        case 'deal': dealt = true; await dealAnim(st ? st.n : 4); break;
        case 'left': bubble(seat, `${e.forfeit ? 'انسحب' : 'طلع'} — الكمبيوتر بيلعب عنه`, 2500); break;
        default: break;
      }
    }
    return dealt;
  }

  // ---------------------------------------------------------------- paint
  function paintAll(dealt: boolean) {
    table.classList.toggle('spect', me() < 0);
    paintPlates();
    paintPiles();
    paintBoard();
    paintHand(dealt);
    paintBar();
    if (st.over && !overSheet) { overSheet = true; sheetOpen = true; sheet.hidden = false; }
    if (!st.over) overSheet = false;
    if (sheetOpen) sheet.innerHTML = `<h2>${ui('scroll')}ورقة الحساب</h2>${sheetHTML()}`;
  }
  setInterval(() => {
    const box = table.querySelector<HTMLElement>('.kk-plate.turn');
    if (!room || !room.turn || !room.turn.endsAt || !st || !box) return;
    const left = Math.max(0, room.turn.endsAt - (Date.now() + offset));
    box.style.setProperty('--p', String(Math.min(1, left / room.turn.ms)));
    box.classList.toggle('low', left < 8000);
  }, 200);

  return {
    // what to do now is written once, in the bar next to the buttons (statusText); the room banner only says «دورك!»
    hint() { return ''; },
    async render(r, animate) {
      const prev = st;
      room = r;
      offset = r.now - Date.now();
      let dealt = false;
      if (animate && prev && r.ev.length && !document.hidden) {
        animating = true;
        paintBar();
        try { dealt = await playEvents(r); } catch (e) { console.error(e); }
        animating = false;
      }
      st = r.state;
      room = r;
      if (st.round !== lastRound) { if (lastRound) { staged = []; selected.clear(); } lastRound = st.round; }
      if (st.me < 0 || (prev && prev.round !== st.round)) slots = [];
      reconcile(st.hand || []);
      paintAll(dealt || (!prev && !st.over));
    },
  };
}
