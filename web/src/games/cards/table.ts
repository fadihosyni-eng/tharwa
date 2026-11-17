// Card table for «طرنيب»، «أربعمية»، «تركس» (server: games/cards/*.js). One renderer for all three:
// your hand fanned at the bottom, the other three around the table (names, avatars, turn ring + timer, card backs),
// the trick in the middle (or the trix rows), a decision panel (bid / trump / contract / double), the game's HUD,
// a per-hand summary and the score sheet under the table. Seats are shown relative to the viewer: the next player
// (seat + 1) sits on your right, your partner opposite.
import { esc, ui, avatarHTML } from '../../lib/client';
import type { Board, Ctx, Room, Player } from '../types';
import { cardImg, preloadCards, suitIcon, SUIT_AR, rankLabel } from './art';
import './cards.css';

type St = any;
const POS = ['bottom', 'right', 'top', 'left'] as const;
type Pos = (typeof POS)[number];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CONTRACT_AR: Record<string, string> = { king: 'ملك الكبّة', queens: 'البنات', diamonds: 'الديناري', tricks: 'اللطوش', trix: 'تركس' };
const CONTRACT_NOTE: Record<string, string> = {
  king: 'اللي بياكل الشيخ: −75', queens: 'كل بنت: −25', diamonds: 'كل ديناري: −10', tricks: 'كل لمّة: −15', trix: '+200 / +150 / +100 / +50',
};
const CONTRACT_ICO: Record<string, string> = { king: 'crown', queens: 'star', diamonds: 'coins', tricks: 'cards', trix: 'chart' };
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// An animation's end, but never later than `ms` (hidden tabs pause animations; the render queue must not hang).
const settle = (a: Animation, ms: number) => Promise.race([a.finished.then(() => {}, () => {}), wait(ms + 120)]);
const sgn = (n: number) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');

export function createCardGame(slug: string, el: HTMLElement, under: HTMLElement, ctx: Ctx): Board {
  preloadCards();
  el.innerHTML = `<div class="ct-table" data-game="${slug}">
    <div class="ct-felt">
      <div class="ct-hud"></div>
      ${POS.map((p) => `<div class="ct-seat" data-pos="${p}"><div class="ct-backs"></div><div class="ct-plate"></div><div class="ct-bubble" hidden></div></div>`).join('')}
      <div class="ct-center">
        <div class="ct-trick">${POS.map((p) => `<div class="ct-slot" data-pos="${p}"></div>`).join('')}</div>
        <div class="ct-layout" hidden></div>
        <div class="ct-wait" hidden></div>
      </div>
      <div class="ct-panel" hidden></div>
      <div class="ct-pop" hidden></div>
      <div class="ct-fx"></div>
    </div>
    <div class="ct-hand" role="group" aria-label="ورقك"></div>
  </div>`;
  under.innerHTML = `<div class="ct-under">
      <button type="button" class="btn sm" data-sheet>${ui('scroll')}ورقة الحساب</button>
      <button type="button" class="btn sm" data-last disabled>${ui('eye')}آخر لمّة</button>
    </div>
    <div class="ct-sheet panel" hidden></div>`;
  const table = el.querySelector<HTMLElement>('.ct-table')!;
  const felt = el.querySelector<HTMLElement>('.ct-felt')!;
  const hud = el.querySelector<HTMLElement>('.ct-hud')!;
  const handEl = el.querySelector<HTMLElement>('.ct-hand')!;
  const panel = el.querySelector<HTMLElement>('.ct-panel')!;
  const pop = el.querySelector<HTMLElement>('.ct-pop')!;
  const fx = el.querySelector<HTMLElement>('.ct-fx')!;
  const layoutEl = el.querySelector<HTMLElement>('.ct-layout')!;
  const waitEl = el.querySelector<HTMLElement>('.ct-wait')!;
  const sheet = under.querySelector<HTMLElement>('.ct-sheet')!;
  const seatEl = (p: Pos) => el.querySelector<HTMLElement>(`.ct-seat[data-pos="${p}"]`)!;
  const slotEl = (p: Pos) => el.querySelector<HTMLElement>(`.ct-slot[data-pos="${p}"]`)!;

  let room: Room | null = null;
  let st: St = null;
  let offset = 0;
  let selected = '';
  let sending = false;
  let popTimer = 0;
  let panelKey = '';
  let sheetOpen = false;
  let dblPick = new Set<string>();
  let overSheet = false;   // the score sheet opens by itself once at the end of a game
  let animating = false;   // replaying queued events: the table shows an older state, so no input

  const meSeat = () => (st && st.me >= 0 ? st.me : -1);
  const base = () => (st && st.me >= 0 ? st.me : 0);
  const posOf = (seat: number) => POS[(seat - base() + 4) % 4];
  const pidOf = (seat: number) => (st ? st.seats[seat] : '');
  const playerOf = (seat: number) => ctx.player(pidOf(seat));
  const nameOf = (seat: number) => { const p = playerOf(seat); return p ? p.name : ''; };
  const teams = slug !== 'trix';
  const myTurn = () => !!room && room.status === 'playing' && !!st && st.turn >= 0 && st.turn === meSeat() && !st.over;
  const teamName = (t: number) => (meSeat() >= 0 ? (t === meSeat() % 2 ? 'نحنا' : 'هنّي') : t === 0 ? 'الفريق ١' : 'الفريق ٢');

  // ---------------------------------------------------------------- avatars & seats
  function avatar(p: Player | undefined, size: number) {
    if (!p) return `<span class="mg-ava" style="--s:${size}px">?</span>`;
    if (p.isBot) return `<span class="mg-ava bot" style="--c:${p.color || '#2fe2ff'};--s:${size}px">${ui('robot')}</span>`;
    if (p.avatar) return `<span class="mg-ava-wrap" style="--c:${p.color || '#2fe2ff'}">${avatarHTML(p.avatar, size)}</span>`;
    return `<span class="mg-ava" style="--c:${p.color || '#2fe2ff'};--s:${size}px">${esc([...p.name][0] || '?')}</span>`;
  }
  function seatTags(seat: number) {
    const t: string[] = [];
    if (slug === 'tarneeb') {
      const b = st.bids ? st.bids[seat] : null;
      if (st.phase === 'bid' || st.phase === 'trump') {
        if (b === 0) t.push('<span class="ct-tag muted">باس</span>');
        else if (b) t.push(`<span class="ct-tag ${st.bidder === seat ? 'gold' : ''}">${b}</span>`);
      } else if (st.phase === 'play') {
        if (st.bidder === seat) t.push(`<span class="ct-tag gold" title="الطالب">${ui('star')}${st.bid}</span>`);
        t.push(`<span class="ct-tag" title="اللمّات">${ui('cards')}${st.tricks[seat]}</span>`);
      }
    } else if (slug === '400') {
      const b = st.bids[seat];
      if (b !== null) t.push(`<span class="ct-tag ${st.phase === 'play' && st.tricks[seat] >= b ? 'ok' : ''}" title="جاب / طلب">${st.phase === 'play' ? `${st.tricks[seat]}/` : ''}${b}</span>`);
      t.push(`<span class="ct-tag score ${st.scores[seat] < 0 ? 'neg' : ''}" title="النقاط">${st.scores[seat]}</span>`);
    } else {
      if (st.owner === seat) t.push(`<span class="ct-tag gold" title="صاحب المملكة">${ui('crown')}</span>`);
      t.push(`<span class="ct-tag score ${st.scores[seat] < 0 ? 'neg' : ''}" title="النقاط">${st.scores[seat]}</span>`);
      if (st.phase === 'play') t.push(`<span class="ct-tag" title="اللمّات">${ui('cards')}${st.tricks[seat]}</span>`);
      const place = st.phase === 'trix' ? st.finished.indexOf(seat) : -1;
      if (place >= 0) t.push(`<span class="ct-tag ok">${['الأول', 'التاني', 'التالت', 'الرابع'][place]}</span>`);
    }
    return t.join('');
  }
  function paintSeats() {
    for (let seat = 0; seat < 4; seat++) {
      const pos = posOf(seat);
      const box = seatEl(pos);
      const p = playerOf(seat);
      const turn = room!.status === 'playing' && st.turn === seat;
      const partner = teams && meSeat() >= 0 && seat === (meSeat() + 2) % 4;
      box.dataset.seat = String(seat);
      box.classList.toggle('turn', turn);
      box.classList.toggle('gone', !!(st.gone && st.gone[seat]) || !!(p && p.left));
      box.classList.toggle('team-a', teams && seat % 2 === 0);
      box.classList.toggle('team-b', teams && seat % 2 === 1);
      const label = pos === 'bottom' && meSeat() >= 0 ? 'إنت' : p ? p.name : '';
      box.querySelector('.ct-plate')!.innerHTML = `<span class="ct-ring">${avatar(p, pos === 'bottom' ? 34 : 40)}</span>
        <span class="ct-who"><b>${esc(label)}</b>${partner ? '<small>شريكك</small>' : p && p.isBot ? '<small>كمبيوتر</small>' : ''}</span>
        <span class="ct-tags">${seatTags(seat)}</span>`;
      if (pos !== 'bottom') paintBacks(pos, st.counts[seat]);
    }
  }
  function paintBacks(pos: Pos, n: number) {
    const box = seatEl(pos).querySelector<HTMLElement>('.ct-backs')!;
    if (box.childElementCount === n) return;
    box.innerHTML = Array.from({ length: n }, () => `<span class="ct-back">${cardImg('back')}</span>`).join('');
    box.dataset.n = String(n);
  }

  // ---------------------------------------------------------------- hand
  function paintHand(animateDeal = false) {
    const hand: string[] = st.hand || [];
    const legal = new Set<string>(myTurn() ? st.legal || [] : []);
    const playing = myTurn() && (st.phase === 'play' || st.phase === 'trix');
    if (!playing || !legal.has(selected)) selected = '';
    handEl.classList.toggle('active', playing);
    handEl.classList.toggle('spectator', meSeat() < 0);
    handEl.innerHTML = hand.map((c, i) => {
      const ok = !playing || legal.has(c);
      return `<button type="button" class="ct-hcard${ok ? '' : ' off'}${playing && ok ? ' legal' : ''}${c === selected ? ' sel' : ''}${animateDeal ? ' dealt' : ''}"
        data-card="${c}" style="--i:${i}" aria-label="${rankLabel(c)} ${SUIT_AR[c[1]]}" ${playing && !ok ? 'aria-disabled="true"' : ''}>${cardImg(c)}</button>`;
    }).join('');
    layoutHand();
  }
  function layoutHand() {
    const cards = [...handEl.querySelectorAll<HTMLElement>('.ct-hcard')];
    const n = cards.length;
    if (!n) return;
    const W = handEl.clientWidth;
    const cw = cards[0].offsetWidth || 80;
    const step = n > 1 ? Math.min(cw * 0.64, (W - cw - 8) / (n - 1)) : 0;
    const total = cw + step * (n - 1);
    const start = (W - total) / 2;
    const mid = (n - 1) / 2;
    const spread = Math.min(2.4, 26 / n);
    cards.forEach((c, i) => {
      const d = i - mid;
      c.style.left = `${start + i * step}px`;
      c.style.setProperty('--rot', `${d * spread}deg`);
      c.style.setProperty('--dy', `${Math.abs(d) * Math.abs(d) * 0.55}px`);
      c.style.zIndex = String(i + 1);
    });
  }
  new ResizeObserver(() => layoutHand()).observe(handEl);
  handEl.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.ct-hcard');
    if (!b || !st || sending || animating) return;
    const card = b.dataset.card!;
    if (!myTurn() || !(st.phase === 'play' || st.phase === 'trix')) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
    if (!(st.legal || []).includes(card)) {
      b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
      if (st.phase === 'play' && st.trick.length) ctx.sound('jail');
      return;
    }
    // phones: first tap lifts the card, second tap plays it (cards overlap, so no accidental plays)
    if (coarse() && selected !== card) {
      selected = card;
      handEl.querySelectorAll('.ct-hcard.sel').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      return;
    }
    sending = true;
    b.classList.add('pending');
    const ok = await ctx.act('play', { card });
    sending = false;
    if (!ok) b.classList.remove('pending');
  });

  // ---------------------------------------------------------------- center: trick & trix rows
  function paintTrick(trick: { seat: number; card: string }[]) {
    for (const p of POS) slotEl(p).innerHTML = '';
    for (const x of trick) slotEl(posOf(x.seat)).innerHTML = `<span class="ct-tcard">${cardImg(x.card)}</span>`;
  }
  function paintLayout(layout: St) {
    const on = !!layout;
    layoutEl.hidden = !on;
    el.querySelector<HTMLElement>('.ct-trick')!.hidden = on;
    if (!on) return;
    layoutEl.innerHTML = 'SHDC'.split('').map((su) => {
      const row = layout[su];
      if (!row) return `<div class="ct-row empty" data-suit="${su}"><span class="ct-row-ph">${suitIcon(su, 26)}<small>J</small></span></div>`;
      const R = '23456789TJQKA';
      const hi = row.hi > 11 ? R[row.hi - 2] + su : '';
      const lo = row.lo < 11 ? R[row.lo - 2] + su : '';
      return `<div class="ct-row" data-suit="${su}">
        <span class="ct-lc hi">${hi ? cardImg(hi) : ''}</span>
        <span class="ct-lc mid">${cardImg('J' + su)}</span>
        <span class="ct-lc lo">${lo ? cardImg(lo) : ''}</span></div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- HUD (scores, contract, trump)
  function paintHud() {
    if (slug === 'tarneeb') {
      const t = meSeat() >= 0 ? meSeat() % 2 : 0;
      const contract = st.bidder >= 0 && (st.phase === 'play' || st.phase === 'trump')
        ? `<div class="ct-hud-row"><span>الطلب</span><b>${st.bid || st.highBid}</b><small>${esc(nameOf(st.bidder))}</small>${st.trump ? `<span class="ct-trump" title="الطرنيب">${suitIcon(st.trump, 22)}</span>` : ''}</div>` : '';
      const taken = st.phase === 'play' ? `<div class="ct-hud-row small"><span>اللمّات</span><b>${st.tricks[t] + st.tricks[t + 2]}</b><i>–</i><b>${st.tricks[1 - t] + st.tricks[3 - t]}</b></div>` : '';
      hud.innerHTML = `<div class="ct-hud-score"><span class="a">${teamName(t)} <b>${st.scores[t]}</b></span><span class="b">${teamName(1 - t)} <b>${st.scores[1 - t]}</b></span><small>للـ${st.target}</small></div>${contract}${taken}`;
    } else if (slug === '400') {
      const t = meSeat() >= 0 ? meSeat() % 2 : 0;
      const sum = (x: number) => st.scores[x] + st.scores[x + 2];
      const total = st.bids.filter((b: number | null) => b !== null).reduce((a: number, b: number) => a + b, 0);
      // each team's total plus every player's own score: the win rule is per player (one partner reaches the target)
      const who = (x: number) => esc(x === meSeat() ? 'إنت' : (nameOf(x).split(' ').filter((w) => w && w !== 'بوت')[0] || nameOf(x)));
      const own = (x: number) => `<i class="${st.scores[x] < 0 ? 'neg' : ''}">${who(x)} <bdi>${st.scores[x]}</bdi></i>`;
      const team = (k: number, cls: string) => `<span class="${cls}">${teamName(k)} <b>${sum(k)}</b><em>${own(k)}${own(k + 2)}</em></span>`;
      hud.innerHTML = `<div class="ct-hud-score fh">${team(t, 'a')}${team(1 - t, 'b')}<small class="ct-rule">بيربح الفريق لما واحد منّو يوصل ${st.target} وشريكه فوق الصفر</small></div>
        <div class="ct-hud-row"><span>الطرنيب</span><span class="ct-trump">${suitIcon('H', 22)}</span><span>الطلبات</span><b>${total}</b></div>`;
    } else {
      const contract = st.contract ? `<div class="ct-hud-row"><span class="ct-hud-ico">${ui(CONTRACT_ICO[st.contract])}</span><b>${CONTRACT_AR[st.contract]}</b></div>` : '';
      const dbl = Object.keys(st.doubled || {});
      const dblRow = dbl.length ? `<div class="ct-hud-row small"><span>دبل</span>${dbl.map((c) => `<span class="ct-mini">${cardImg(c)}</span>`).join('')}</div>` : '';
      hud.innerHTML = st.over ? '<div class="ct-hud-score trix"><span>خلصت الممالك الأربعة</span></div>'
        : `<div class="ct-hud-score trix"><span>مملكة <b>${esc(nameOf(st.owner))}</b></span><small>اللعبة ${Math.min(st.round, 20)} من 20</small></div>${contract}${dblRow}`;
    }
  }

  // ---------------------------------------------------------------- decision panel
  function panelHTML(): string {
    if (!myTurn()) return '';
    if (slug === 'tarneeb' && st.phase === 'bid') {
      const opts: number[] = st.bidOptions || [];
      return `<h3>${ui('gavel')}قدّيش بتطلب؟</h3>
        <p class="muted">${st.highBid ? `أعلى طلب ${st.highBid} — ${esc(nameOf(st.bidder))}` : 'ما حدا طلب لسا (أقل شي 7)'}</p>
        <div class="ct-bids">${[7, 8, 9, 10, 11, 12, 13].map((b) => `<button type="button" class="ct-bid" data-bid="${b}" ${opts.includes(b) ? '' : 'disabled'}>${b}</button>`).join('')}</div>
        <button type="button" class="btn ct-pass" data-pass>باس</button>`;
    }
    if (slug === 'tarneeb' && st.phase === 'trump') {
      return `<h3>${ui('crown')}اختار الطرنيب</h3><p class="muted">طلبك ${st.bid} — إنت بتبلّش اللعب</p>
        <div class="ct-suits">${'SHDC'.split('').map((su) => `<button type="button" class="ct-suit-btn" data-suit="${su}">${suitIcon(su, 34)}<span>${SUIT_AR[su]}</span></button>`).join('')}</div>`;
    }
    if (slug === '400' && st.phase === 'bid') {
      const opts: number[] = st.bidOptions || [];
      const total = st.bids.filter((b: number | null) => b !== null).reduce((a: number, b: number) => a + b, 0);
      const left = st.bids.filter((b: number | null) => b === null).length;
      return `<h3>${ui('gavel')}قدّيش رح تجيب؟</h3>
        <p class="muted">مجموع الطلبات ${total}${left === 1 ? ` — لازم يصير ${st.minTotal} ع الأقل وإلا بينعاد التوزيع` : ''}</p>
        <div class="ct-bids wide">${opts.map((b) => `<button type="button" class="ct-bid" data-bid="${b}">${b}<small>${b >= 5 ? b * 2 : b}</small></button>`).join('')}</div>
        <p class="muted ct-note">من 5 وطالع الطلب بينحسب دبل</p>`;
    }
    if (slug === 'trix' && st.phase === 'choose') {
      const left: string[] = st.contracts || [];
      return `<h3>${ui('crown')}مملكتك — اختار اللعبة</h3>
        <div class="ct-contracts">${['king', 'queens', 'diamonds', 'tricks', 'trix'].map((c) => `<button type="button" class="ct-con" data-contract="${c}" ${left.includes(c) ? '' : 'disabled'}>
          <span class="ct-con-ico">${ui(CONTRACT_ICO[c])}</span><b>${CONTRACT_AR[c]}</b><small>${left.includes(c) ? CONTRACT_NOTE[c] : 'انلعبت'}</small></button>`).join('')}</div>`;
    }
    if (slug === 'trix' && st.phase === 'double') {
      const can: string[] = st.canDouble || [];
      return `<h3>${ui('bolt')}بدّك تدبّل؟</h3>
        <p class="muted">${st.contract === 'king' ? 'إذا دبّلت الشيخ وأكله غيرك: هو −150 وإنت +75' : 'البنت المدبّلة: اللي بياكلها −50 وإنت +25'}</p>
        <div class="ct-dbl">${can.map((c) => `<button type="button" class="ct-dbl-card${dblPick.has(c) ? ' on' : ''}" data-dcard="${c}" aria-pressed="${dblPick.has(c)}">${cardImg(c)}</button>`).join('')}</div>
        <div class="ct-panel-btns"><button type="button" class="btn btn-gold" data-double>${ui('bolt')}دبّل${can.length > 1 ? ' المختار' : ''}</button><button type="button" class="btn" data-nodouble>بلا دبل</button></div>`;
    }
    return '';
  }
  function paintPanel() {
    const html = panelHTML();
    const key = html ? `${st.phase}|${st.round}|${room!.seq}` : '';
    if (!html) { panel.hidden = true; panel.innerHTML = ''; panelKey = ''; return; }
    if (key === panelKey) return;
    if (!panelKey.startsWith('double|' + st.round)) dblPick = new Set();
    panelKey = key;
    panel.innerHTML = `<div class="ct-panel-card">${panelHTML()}</div>`;
    panel.hidden = false;
  }
  panel.addEventListener('click', async (e) => {
    const t = e.target as Element;
    const btn = t.closest<HTMLButtonElement>('button');
    if (!btn || btn.disabled || sending || animating) return;
    const send = async (type: string, data: Record<string, unknown> = {}) => {
      sending = true;
      panel.querySelectorAll('button').forEach((b) => b.setAttribute('disabled', ''));
      const ok = await ctx.act(type, data);
      sending = false;
      if (!ok) { panelKey = ''; paintPanel(); }
    };
    if (btn.dataset.bid) return send('bid', { bid: Number(btn.dataset.bid) });
    if ('pass' in btn.dataset) return send('pass');
    if (btn.dataset.suit) return send('trump', { suit: btn.dataset.suit });
    if (btn.dataset.contract) return send('contract', { contract: btn.dataset.contract });
    if (btn.dataset.dcard) {
      const c = btn.dataset.dcard;
      if (dblPick.has(c)) dblPick.delete(c); else dblPick.add(c);
      btn.classList.toggle('on', dblPick.has(c));
      btn.setAttribute('aria-pressed', String(dblPick.has(c)));
      return;
    }
    if ('double' in btn.dataset) {
      const can: string[] = st.canDouble || [];
      const cards = can.length === 1 ? can : [...dblPick];
      if (!cards.length) { btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope'); return; }
      return send('double', { cards });
    }
    if ('nodouble' in btn.dataset) return send('double', { cards: [] });
  });

  // "waiting for …" line in the middle while someone else decides
  function paintWait() {
    let txt = '';
    if (room!.status === 'playing' && st.turn >= 0 && st.turn !== meSeat()) {
      const n = esc(nameOf(st.turn));
      if (st.phase === 'bid') txt = `${n} عم يطلب…`;
      else if (st.phase === 'trump') txt = `${n} عم يختار الطرنيب…`;
      else if (st.phase === 'choose') txt = `${n} عم يختار لعبة من مملكته…`;
      else if (st.phase === 'double') txt = `${n} عم يقرّر يدبّل…`;
    }
    waitEl.hidden = !txt;
    waitEl.innerHTML = txt;
  }

  // ---------------------------------------------------------------- score sheet & last trick
  function sheetHTML() {
    const h: St[] = st.history || [];
    if (!h.length) return '<p class="muted">لسا ما خلصت ولا جولة.</p>';
    if (slug === 'tarneeb') {
      const t = meSeat() >= 0 ? meSeat() % 2 : 0;
      return `<table class="ct-tbl"><thead><tr><th>#</th><th>الطالب</th><th>الطلب</th><th>${teamName(t)}</th><th>${teamName(1 - t)}</th></tr></thead><tbody>${h.map((r) => `<tr>
        <td>${r.round}</td><td>${esc(nameOf(r.bidder))} ${suitIcon(r.trump, 14)}</td><td class="${r.made ? 'ok' : 'bad'}">${r.bid} ${r.made ? ui('check') : ui('xmark')}</td>
        <td>${sgn(r.delta[t])}<small>${r.scores[t]}</small></td><td>${sgn(r.delta[1 - t])}<small>${r.scores[1 - t]}</small></td></tr>`).join('')}</tbody></table>`;
    }
    const order = [0, 1, 2, 3].map((k) => (base() + k) % 4);
    const head = `<th>#</th>${slug === 'trix' ? '<th>اللعبة</th>' : ''}${order.map((x) => `<th>${esc(x === meSeat() ? 'إنت' : nameOf(x))}</th>`).join('')}`;
    return `<table class="ct-tbl"><thead><tr>${head}</tr></thead><tbody>${h.map((r) => `<tr><td>${r.round}</td>${slug === 'trix' ? `<td>${CONTRACT_AR[r.contract]}<small>${esc(nameOf(r.owner))}</small></td>` : ''}
      ${order.map((x) => `<td class="${slug === '400' ? (r.delta[x] > 0 ? 'ok' : 'bad') : ''}">${slug === '400' ? `<span class="ct-bt">${r.taken[x]}/${r.bids[x]}</span> ` : ''}${sgn(r.delta[x])}<small>${r.scores[x]}</small></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  under.querySelector('[data-sheet]')!.addEventListener('click', () => {
    sheetOpen = !sheetOpen;
    sheet.hidden = !sheetOpen;
    if (sheetOpen && st) { sheet.innerHTML = `<h2>${ui('scroll')}ورقة الحساب</h2>${sheetHTML()}`; sheet.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  const lastBtn = under.querySelector<HTMLButtonElement>('[data-last]')!;
  lastBtn.addEventListener('click', () => {
    if (!st || !st.lastTrick) return;
    const lt = st.lastTrick;
    showPop(`<h3>${ui('eye')}آخر لمّة</h3><div class="ct-last">${lt.cards.map((x: St) => `<figure class="${x.seat === lt.winner ? 'win' : ''}">${cardImg(x.card)}<figcaption>${esc(x.seat === meSeat() ? 'إنت' : nameOf(x.seat))}</figcaption></figure>`).join('')}</div>
      <p class="muted">أكلها <b>${esc(lt.winner === meSeat() ? 'إنت' : nameOf(lt.winner))}</b></p>`, 4000);
  });

  function showPop(html: string, ms: number) {
    clearTimeout(popTimer);
    pop.innerHTML = `<div class="ct-pop-card">${html}<button type="button" class="ct-pop-x" aria-label="سكّر">${ui('xmark')}</button></div>`;
    pop.hidden = false;
    popTimer = window.setTimeout(() => { pop.hidden = true; }, ms);
  }
  pop.addEventListener('click', () => { pop.hidden = true; clearTimeout(popTimer); });

  function handSummary(r: St) {
    if (slug === 'tarneeb') {
      const bt = r.bidder % 2;
      const t = meSeat() >= 0 ? meSeat() % 2 : 0;
      return `<h3>${r.made ? ui('check') : ui('xmark')}${esc(teamName(bt))} ${r.made ? 'جابوا الطلب' : 'كسروا'}</h3>
        <p class="muted">الطلب ${r.bid} ${suitIcon(r.trump, 16)} — جابوا ${r.taken[bt]} لمّة</p>
        <div class="ct-sum-grid two"><div class="${r.delta[t] > 0 ? 'ok' : r.delta[t] < 0 ? 'bad' : ''}"><span>${esc(teamName(t))}</span><b>${sgn(r.delta[t])}</b></div>
        <div class="${r.delta[1 - t] > 0 ? 'ok' : r.delta[1 - t] < 0 ? 'bad' : ''}"><span>${esc(teamName(1 - t))}</span><b>${sgn(r.delta[1 - t])}</b></div></div>`;
    }
    const order = [0, 1, 2, 3].map((k) => (base() + k) % 4);
    const title = slug === 'trix' ? `${CONTRACT_AR[r.contract]} — ${esc(nameOf(r.owner))}` : `نتيجة الجولة ${r.round}`;
    return `<h3>${ui('scroll')}${title}</h3><div class="ct-sum-grid">${order.map((x) => `<div class="${r.delta[x] > 0 ? 'ok' : r.delta[x] < 0 ? 'bad' : ''}">
      <span>${esc(x === meSeat() ? 'إنت' : nameOf(x))}</span>${slug === '400' ? `<small>${r.taken[x]}/${r.bids[x]}</small>` : ''}<b>${sgn(r.delta[x])}</b></div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- animation helpers
  function rectIn(node: Element) {
    const a = node.getBoundingClientRect(), b = table.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  }
  function seatAnchor(seat: number) {
    const s = seatEl(posOf(seat));
    const backs = s.querySelector('.ct-backs');
    return rectIn(backs && backs.childElementCount && posOf(seat) !== 'bottom' ? backs : s.querySelector('.ct-plate')!);
  }
  async function fly(card: string, from: { x: number; y: number; w: number; h: number }, to: Element, ms = 280) {
    const tr = rectIn(to);
    const node = document.createElement('div');
    node.className = 'ct-fly';
    node.innerHTML = cardImg(card);
    const w = tr.w || 60, h = tr.h || 84;
    node.style.cssText = `left:${tr.x}px;top:${tr.y}px;width:${w}px;height:${h}px`;
    table.appendChild(node);
    const dx = from.x + from.w / 2 - (tr.x + w / 2), dy = from.y + from.h / 2 - (tr.y + h / 2);
    const sc = Math.max(0.35, Math.min(1.3, from.w / w));
    await settle(node.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(${dx > 0 ? 12 : -12}deg)`, opacity: 0.9 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: ms, easing: 'cubic-bezier(.2,.8,.25,1)' }), ms);
    node.remove();
  }
  function bubble(seat: number, html: string, ms = 1400) {
    const b = seatEl(posOf(seat)).querySelector<HTMLElement>('.ct-bubble')!;
    b.innerHTML = html;
    b.hidden = false;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(Number(b.dataset.t || 0));
    b.dataset.t = String(window.setTimeout(() => { b.hidden = true; }, ms));
  }
  async function sweep(winner: number) {
    await wait(650);
    const target = seatAnchor(winner);
    const cards = POS.map((p) => slotEl(p).querySelector<HTMLElement>('.ct-tcard')).filter(Boolean) as HTMLElement[];
    const anims = cards.map((c) => {
      const r = rectIn(c);
      const dx = target.x + target.w / 2 - (r.x + r.w / 2), dy = target.y + target.h / 2 - (r.y + r.h / 2);
      return settle(c.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }), 420);
    });
    await Promise.all(anims);
    for (const p of POS) slotEl(p).innerHTML = '';
  }
  async function dealAnim() {
    fx.innerHTML = '';
    const c = rectIn(felt.querySelector('.ct-center')!);
    const jobs: Promise<unknown>[] = [];
    for (let k = 0; k < 8; k++) {
      const seat = (base() + 1 + k) % 4;
      const to = seatAnchor(seat);
      const node = document.createElement('div');
      node.className = 'ct-fly small';
      node.innerHTML = cardImg('back');
      node.style.cssText = `left:${c.x + c.w / 2 - 22}px;top:${c.y + c.h / 2 - 31}px`;
      table.appendChild(node);
      const dx = to.x + to.w / 2 - (c.x + c.w / 2), dy = to.y + to.h / 2 - (c.y + c.h / 2);
      jobs.push(settle(node.animate([{ transform: 'scale(.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.15 }, { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 0.2 }],
        { duration: 380, delay: k * 55, easing: 'ease-in', fill: 'forwards' }), 380 + k * 55).then(() => node.remove()));
    }
    ctx.sound('card');
    await Promise.all(jobs);
  }

  // Plays room.ev on top of the previously painted table (prev state still on screen).
  async function playEvents(r: Room, prev: St, next: St) {
    let dealt = false;
    const layout = prev && prev.layout ? JSON.parse(JSON.stringify(prev.layout)) : null;
    const counts = prev ? prev.counts.slice() : [13, 13, 13, 13];
    for (const e of r.ev) {
      switch (e.t) {
        case 'play': {
          const seat = e.seat!;
          let from;
          const own = seat === meSeat() ? handEl.querySelector<HTMLElement>(`.ct-hcard[data-card="${e.card}"]`) : null;
          if (own) { from = rectIn(own); own.remove(); layoutHand(); } else {
            from = seatAnchor(seat);
            counts[seat] = Math.max(0, counts[seat] - 1);
            if (posOf(seat) !== 'bottom') paintBacks(posOf(seat), counts[seat]);
          }
          const slot = slotEl(posOf(seat));
          slot.innerHTML = `<span class="ct-tcard">${cardImg(e.card)}</span>`;
          const tc = slot.querySelector<HTMLElement>('.ct-tcard')!;
          tc.style.visibility = 'hidden';
          ctx.sound('card');
          await fly(e.card, from, tc);
          tc.style.visibility = '';
          break;
        }
        case 'trick':
          if (e.winner === meSeat() || (teams && meSeat() >= 0 && e.winner === (meSeat() + 2) % 4)) ctx.sound('coin');
          await sweep(e.winner);
          break;
        case 'lay': {
          const seat = e.seat!;
          let from;
          const own = seat === meSeat() ? handEl.querySelector<HTMLElement>(`.ct-hcard[data-card="${e.card}"]`) : null;
          if (own) { from = rectIn(own); own.remove(); layoutHand(); } else {
            from = seatAnchor(seat);
            counts[seat] = Math.max(0, counts[seat] - 1);
            if (posOf(seat) !== 'bottom') paintBacks(posOf(seat), counts[seat]);
          }
          if (layout) {
            const su = e.card[1], rk = '23456789TJQKA'.indexOf(e.card[0]) + 2;
            if (!layout[su]) layout[su] = { lo: 11, hi: 11 }; else if (rk > layout[su].hi) layout[su].hi = rk; else layout[su].lo = rk;
            paintLayout(layout);
            const target = layoutEl.querySelector<HTMLElement>(`.ct-row[data-suit="${su}"] .ct-lc.${rk === 11 ? 'mid' : rk > 11 ? 'hi' : 'lo'}`);
            if (target) { target.style.visibility = 'hidden'; ctx.sound('card'); await fly(e.card, from, target, 240); target.style.visibility = ''; }
          }
          break;
        }
        case 'tpass': bubble(e.seat!, 'باس', 900); await wait(120); break;
        case 'out': bubble(e.seat!, `طلع ${['الأول', 'التاني', 'التالت', 'الرابع'][e.place - 1]}`, 2000); if (e.seat === meSeat()) ctx.sound('win'); break;
        case 'bid': bubble(e.seat!, `<b>${e.bid}</b>`); ctx.sound('bid'); await wait(200); break;
        case 'pass': bubble(e.seat!, 'باس'); await wait(150); break;
        case 'trump': bubble(e.seat!, `الطرنيب ${suitIcon(e.suit, 20)}`, 2200); ctx.sound('build'); await wait(300); break;
        case 'contract':
          if (slug === 'trix') { bubble(e.seat!, CONTRACT_AR[e.contract], 2000); ctx.sound('build'); }
          else bubble(e.seat!, `طلب <b>${e.bid}</b>`, 1600);
          await wait(250);
          break;
        case 'double': bubble(e.seat!, e.cards.length ? `دبل ${e.cards.map((c: string) => rankLabel(c) + suitIcon(c[1], 14)).join(' ')}` : 'بلا دبل', 1800); if (e.cards.length) ctx.sound('bid'); await wait(200); break;
        case 'redeal': showPop(`<h3>${ui('refresh')}توزيع جديد</h3><p class="muted">${slug === '400' ? `مجموع الطلبات ${e.total} أقل من 11` : 'كل اللاعبين قالوا باس'}</p>`, 1800); await wait(500); break;
        case 'hand': showPop(handSummary(e), slug === 'trix' ? 3800 : 4500); ctx.sound(e.delta && meSeat() >= 0 && e.delta[teams && slug === 'tarneeb' ? meSeat() % 2 : meSeat()] >= 0 ? 'cash' : 'pay'); await wait(500); break;
        case 'deal': dealt = true; paintTrick([]); await dealAnim(); break;
        case 'left': bubble(e.seat!, 'طلع — الكمبيوتر بيلعب عنه', 2500); break;
        default: break;
      }
    }
    void next;
    return dealt;
  }

  // ---------------------------------------------------------------- full paint
  function paintAll(dealt: boolean) {
    table.classList.toggle('spect', meSeat() < 0);
    paintSeats();
    paintHud();
    paintTrick(st.trick || []);
    paintLayout(st.phase === 'trix' ? st.layout : null);
    paintHand(dealt);
    paintPanel();
    paintWait();
    lastBtn.disabled = !st.lastTrick;
    if (st.over && !overSheet) { overSheet = true; sheetOpen = true; sheet.hidden = false; }
    if (!st.over) overSheet = false;
    if (sheetOpen) sheet.innerHTML = `<h2>${ui('scroll')}ورقة الحساب</h2>${sheetHTML()}`;
  }
  // turn ring + seconds on the player to move
  setInterval(() => {
    if (!room || !room.turn || !room.turn.endsAt || !st) { el.querySelectorAll<HTMLElement>('.ct-seat').forEach((x) => x.style.setProperty('--p', '0')); return; }
    const left = Math.max(0, room.turn.endsAt - (Date.now() + offset));
    const frac = Math.min(1, left / room.turn.ms);
    const box = el.querySelector<HTMLElement>('.ct-seat.turn');
    if (box) { box.style.setProperty('--p', String(frac)); box.classList.toggle('low', left < 6000); }
  }, 200);

  return {
    hint(r) {
      const s = r.state;
      if (!s) return '';
      if (s.phase === 'bid') return slug === '400' ? 'قدّيش رح تجيب لمّات؟' : 'اطلب من 7 لـ 13 أو قول باس';
      if (s.phase === 'trump') return 'اختار الطرنيب';
      if (s.phase === 'choose') return 'اختار لعبة من مملكتك';
      if (s.phase === 'double') return 'دبّل أو كمّل بلا دبل';
      if (s.phase === 'trix') return 'حط شب أو ورقة لاصقة بالصف';
      return s.trick && s.trick.length ? 'العب ورقة من نفس النقشة إذا معك' : 'بلّش اللمّة بأي ورقة';
    },
    async render(r, animate) {
      const prev = st;
      room = r;
      offset = r.now - Date.now();
      const next = r.state;
      let dealt = false;
      if (animate && prev && r.ev.length && !document.hidden) {
        animating = true;
        handEl.classList.remove('active');
        panel.hidden = true; panelKey = '';
        try { dealt = await playEvents(r, prev, next); } catch (e) { console.error(e); }
        animating = false;
      }
      st = next;
      room = r;
      paintAll(dealt || (!prev && next.phase !== 'over'));
    },
  };
}
