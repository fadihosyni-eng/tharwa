// Client for /play/<slug> (start page) and /play/<slug>/<code> (the room) of the small games.
// Server: lib/minigames.js. Credentials per room in localStorage `g_room_<code>` = {"pid","token"};
// the nickname in `tharwa_name` (same key as «ثروة»). Logged-in players play under their account name.
import { $, $$, esc, ui, api, avatarHTML, loadSession, session, toast, confirmBox, busy, showErr, stateHTML } from '../lib/client';
import '../../../public/fx.js';
import { byslug } from './meta';
import type { Board, Ctx, Room, Player } from './types';
import { createXO } from './xo';
import { createConnect4 } from './connect4';
import { createLudo } from './ludo';
import { createCardGame } from './cards/table';
// Team card games report both winning partners in result.winners.
const isWinner = (r: Room, pid: string | null | undefined) => !!r.result && !!pid && (r.result.winner === pid || ((r.result as { winners?: string[] }).winners || []).includes(pid));

const app = $('#mgApp')!;
const slug = app.dataset.slug || '';
const meta = byslug(slug)!;
const NAME_KEY = 'tharwa_name';

// ---------------------------------------------------------------- storage (private mode / blocked storage safe)
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
type Creds = { pid: string; token: string };
function readCreds(code: string): Creds | null {
  try { const c = JSON.parse(store.get('g_room_' + code) || 'null'); return c && c.pid && c.token ? c : null; } catch { return null; }
}
function saveCreds(code: string, c: Creds) { store.set('g_room_' + code, JSON.stringify({ pid: c.pid, token: c.token, game: slug, at: Date.now() })); }
const savedName = () => (store.get(NAME_KEY) || '').slice(0, 16);
const roomUrl = (code: string) => `/play/${slug}/${code}`;
const sound = (n: string) => { try { window.FX.Sound.play(n); } catch { /* no audio */ } };

const parts = location.pathname.split('/').filter(Boolean);
const urlCode = (parts[2] || '').toLowerCase();
if (/^[a-z0-9]{5}$/.test(urlCode)) roomPage(urlCode); else landing();

// ================================================================ start page
function landing() {
  const box = $('#mgLanding')!;
  box.hidden = false;
  const nameIn = $<HTMLInputElement>('#mgName')!;
  nameIn.value = savedName();
  const err = $('#mgErr');
  loadSession().then((s) => {
    if (s.me) $('#mgWho')!.innerHTML = `<div class="mg-as">${avatarHTML(s.me.avatar, 34, s.me.color)}<span>بتلعب باسم <b>${esc(s.me.displayName)}</b> وبتجمع نقاط بحسابك</span></div>`;
  });
  $$('.mg-seg', box).forEach((seg) => seg.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    $$('button', seg).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  const segVal = (id: string) => { const b = $(`#${id} [aria-checked="true"]`); return b ? Number(b.getAttribute('data-v')) : undefined; };
  const name = () => {
    if (session.me) return session.me.displayName;
    const n = nameIn.value.trim();
    if (!n) { showErr(err, 'اكتب اسمك أول'); nameIn.focus(); return null; }
    store.set(NAME_KEY, n);
    return n;
  };
  const go = (r: { code: string; pid: string; token: string }) => { saveCreds(r.code, r); location.assign(roomUrl(r.code)); };
  $$<HTMLButtonElement>('[data-mode]', box).forEach((btn) => btn.addEventListener('click', async () => {
    const n = name();
    if (n === null) return;
    showErr(err, '');
    busy(btn, true);
    try {
      const mode = btn.dataset.mode;
      const opts = { players: segVal('mgSeatsPick'), bestOf: segVal('mgBestOf') };
      if (mode === 'quick') go(await api('/api/g/quick', { game: slug, name: n }));
      else go(await api('/api/g/create', { game: slug, name: n, isPrivate: true, vsBot: mode === 'bot', ...opts }));
    } catch (e) { showErr(err, (e as Error).message); busy(btn, false); }
  }));
  $('#mgJoin')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $<HTMLInputElement>('#mgCode')!.value.trim().toLowerCase();
    if (!/^[a-z0-9]{5}$/.test(code)) { showErr(err, 'الكود 5 حروف/أرقام إنكليزي'); return; }
    if (readCreds(code)) { location.assign(roomUrl(code)); return; }
    const n = name();
    if (n === null) return;
    try {
      const r = await api<{ code: string; pid: string; token: string; game: string }>('/api/g/join', { code, name: n });
      saveCreds(r.code, r);
      location.assign(`/play/${r.game}/${r.code}`);
    } catch (e2) { showErr(err, (e2 as Error).message); }
  });
  const list = $('#mgRoomList')!;
  list.innerHTML = stateHTML('loading', 'عم نجيب الغرف…');
  const refresh = async () => {
    try {
      const rooms = await api<{ code: string; players: number; max: number; status: string; host: string }[]>('/api/g/rooms?game=' + slug);
      list.innerHTML = rooms.length ? rooms.map((r) => `<div class="mg-room-item">
          <span class="mg-ri-ico">${ui(r.status === 'lobby' ? 'hourglass' : 'gamepad')}</span>
          <span class="mg-ri-txt"><b>${esc(r.host || 'غرفة')}</b><small>${r.players}/${r.max} لاعبين · ${r.status === 'lobby' ? 'ناطرين لاعبين' : 'عم يلعبوا'}</small></span>
          <a class="btn sm ${r.status === 'lobby' && r.players < r.max ? 'btn-cyan' : ''}" href="${roomUrl(r.code)}">${r.status === 'lobby' && r.players < r.max ? 'ادخل' : 'تفرّج'}</a>
        </div>`).join('') : stateHTML('empty', 'ما في غرف مفتوحة هلق — اعمل وحدة أو العب أونلاين وبنلاقيلك خصم');
    } catch { list.innerHTML = stateHTML('error', 'ما قدرنا نجيب الغرف'); }
  };
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 6000);
}

// ================================================================ the room
function roomPage(code: string) {
  $('#mgRoom')!.hidden = false;
  $('#mgCodeLbl')!.textContent = code;
  document.title = `${meta.name} — غرفة ${code}`;
  const boardEl = $('#mgBoard')!, under = $('#mgUnder')!, overlay = $('#mgOverlay')!, status = $('#mgStatus')!;
  let creds = readCreds(code);
  let cur: Room | null = null;
  let lastSeq = -1;
  let offset = 0;              // server clock - local clock
  let board: Board | null = null;
  let es: EventSource | null = null;
  let hideResult = false;      // the viewer closed the result card to look at the board
  let lastTurnPid: string | null = null;
  let endedSeqSounded = -1;
  let drawing: Room | null = null; // the state being drawn right now (newer than `cur` until paint() runs)
  let pointsSeen = -1;            // seq whose points were already pushed to the header

  const ctx: Ctx = {
    me: () => (cur && cur.me) || null,
    // Boards ask for names while they draw, before `cur` is updated (on the first state after a refresh `cur` is still null).
    player: (pid) => { const src = drawing || cur; return src ? src.players.find((p) => p.id === pid) : undefined; },
    sound,
    async act(type, data = {}) {
      if (!creds) return false;
      try { await api('/api/g/act', { code, pid: creds.pid, token: creds.token, type, ...data }); return true; } catch (e) { toast((e as Error).message); return false; }
    },
  };
  const makeBoard = () => {
    if (slug === 'xo') return createXO(boardEl, under, ctx);
    if (slug === 'connect4') return createConnect4(boardEl, under, ctx);
    if (meta.cards) return createCardGame(slug, boardEl, under, ctx);
    return createLudo(boardEl, under, ctx);
  };

  // ---- sound toggle, invite, leave
  const soundBtn = $<HTMLButtonElement>('#mgSound')!;
  const paintSound = () => { const on = window.FX.Sound.on; soundBtn.innerHTML = ui(on ? 'sound' : 'mute'); soundBtn.setAttribute('aria-label', on ? 'اسكت الصوت' : 'شغّل الصوت'); };
  paintSound();
  soundBtn.addEventListener('click', () => { window.FX.Sound.toggle(); paintSound(); });
  const inviteUrl = () => location.origin + roomUrl(code);
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl()); toast('انسخ رابط الدعوة — ابعته لأصحابك', 'ok'); } catch { window.prompt('انسخ الرابط:', inviteUrl()); }
  };
  $('#mgInvite')!.addEventListener('click', copyInvite);
  $('#mgLeave')!.addEventListener('click', async () => {
    const meP = cur && cur.me ? ctx.player(cur.me) : null;
    if (meP && cur && cur.status === 'playing' && !meP.left) {
      if (!(await confirmBox('إذا طلعت هلق بتنحسب خسارة عليك. أكيد بدك تطلع؟', 'اطلع'))) return;
    }
    if (meP) await ctx.act('leave');
    store.del('g_room_' + code);
    location.assign(`/games/${slug}`); // the game page (play panel, open rooms)
  });

  // ---- chat
  $('#mgChatForm')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = $<HTMLInputElement>('#mgChatIn')!;
    const text = inp.value.trim();
    if (!text) return;
    if (!creds || !(cur && cur.me)) { toast('ادخل اللعبة لتقدر تكتب'); return; }
    if (await ctx.act('chat', { text })) inp.value = '';
  });

  // ---- live stream
  const queue: Room[] = [];
  let rendering = false;
  async function pump() {
    if (rendering) return;
    rendering = true;
    try {
      while (queue.length) {
        const r = queue.shift()!;
        const fresh = r.seq !== lastSeq;
        const restart = r.ev.some((e) => e.t === 'start');
        const animate = !!cur && fresh && r.seq === lastSeq + 1 && !restart && queue.length < 3 && !document.hidden && !!cur.state && !!r.state;
        if (!board && r.state) board = makeBoard();
        if (board && r.state) {
          drawing = r;
          try { await board.render(r, animate); } catch (e) { console.error(e); } finally { drawing = null; }
        }
        if (restart && fresh) hideResult = false;
        cur = r;
        lastSeq = r.seq;
        paint(r);
      }
    } finally { rendering = false; }
  }
  function onState(r: Room) {
    offset = r.now - Date.now();
    if (creds && !r.me && queue.length === 0 && !cur) {
      // our seat is gone (dropped from the lobby, or an old link): forget it and continue as a viewer
      store.del('g_room_' + code);
      creds = null;
    }
    queue.push(r);
    pump();
  }
  function connect() {
    const q = new URLSearchParams({ code, ...(creds ? { pid: creds.pid, token: creds.token } : {}) });
    es = new EventSource('/api/g/events?' + q);
    es.addEventListener('state', (e) => onState(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('gone', () => { es && es.close(); closed('الغرفة انسكّرت'); });
    es.onerror = () => {
      if (es && es.readyState === EventSource.CLOSED) setTimeout(check, 2500);
    };
  }
  async function check() {
    try {
      const info = await api<{ code: string; game: string }>('/api/g/room?code=' + code);
      if (info.game !== slug) { location.replace(`/play/${info.game}/${code}`); return; }
      connect();
    } catch (e) {
      closed((e as Error).message || 'الغرفة مو موجودة أو انتهت');
    }
  }
  function closed(msg: string) {
    status.innerHTML = '';
    overlay.hidden = false;
    overlay.dataset.html = '';
    overlay.innerHTML = `<div class="mg-ov-card">${ui('warn')}<h2>${esc(msg)}</h2><p class="muted">يمكن الرابط قديم، أو كل اللاعبين طلعوا.</p>
      <div class="mg-ov-btns"><a class="btn btn-gold" href="/games/${slug}">${ui('play')}العب ${esc(meta.name)}</a><a class="btn" href="/">${ui('house')}الرئيسية</a></div></div>`;
  }
  check();

  // ---- painting (everything except the board itself)
  const isHost = (r: Room) => !!r.me && r.hostId === r.me;
  function avatar(p: Player, size: number) {
    if (p.isBot) return `<span class="mg-ava bot" style="--c:${p.color};--s:${size}px">${ui('robot')}</span>`;
    if (p.avatar) return `<span class="mg-ava-wrap" style="--c:${p.color}">${avatarHTML(p.avatar, size)}</span>`;
    return `<span class="mg-ava" style="--c:${p.color};--s:${size}px">${esc([...p.name][0] || '?')}</span>`;
  }
  const mark = (r: Room, p: Player) => {
    if (r.game === 'xo') return p.seat === 0 ? '<b class="mg-mark x">X</b>' : p.seat === 1 ? '<b class="mg-mark o">O</b>' : '';
    return `<i class="mg-swatch" style="--c:${p.color}"></i>`;
  };
  function paint(r: Room) {
    const me = r.me ? r.players.find((p) => p.id === r.me) : null;
    // players
    $('#mgCount')!.textContent = `${r.players.filter((p) => !p.left).length}/${r.max}`;
    $('#mgPlayers')!.innerHTML = r.players.map((p) => {
      const turn = r.turn && r.turn.pid === p.id;
      const tags = [
        p.id === r.me ? '<span class="badge cyan">إنت</span>' : '',
        p.id === r.hostId ? `<span class="badge">${ui('crown')}صاحب الغرفة</span>` : '',
        p.isBot ? '<span class="badge muted">كمبيوتر</span>' : '',
        !p.isBot && !p.connected && !p.left ? `<span class="badge muted">${ui('offline')}مو متصل</span>` : '',
        p.auto && !p.left ? '<span class="badge muted">تلقائي</span>' : '',
        p.left ? '<span class="badge muted">طلع</span>' : '',
        r.status === 'ended' && r.rematch.includes(p.id) ? `<span class="badge green">${ui('check')}جاهز</span>` : '',
      ].join('');
      const pts = r.result && r.result.points && p.id in r.result.points ? r.result.points[p.id] : null;
      const kick = r.status === 'lobby' && isHost(r) && p.id !== r.me ? `<button type="button" class="icon-btn mg-kick" data-kick="${esc(p.id)}" aria-label="طلّع ${esc(p.name)}">${ui('xmark')}</button>` : '';
      return `<li class="mg-player${turn ? ' turn' : ''}${p.left ? ' left' : ''}" style="--c:${p.color}">
        ${avatar(p, 38)}
        <span class="mg-pl-txt"><span class="mg-pl-name">${mark(r, p)}<b>${esc(p.name)}</b></span><span class="mg-pl-tags">${tags}</span></span>
        ${pts !== null ? `<span class="mg-pts ${pts >= 0 ? 'up' : 'down'}" dir="ltr">${pts >= 0 ? '+' : '−'}${Math.abs(pts)}</span>` : p.points !== null ? `<span class="mg-pts">${ui('star')}${p.points}</span>` : ''}
        ${kick}
      </li>`;
    }).join('');
    $$<HTMLButtonElement>('[data-kick]').forEach((b) => b.addEventListener('click', () => ctx.act('kick', { target: b.dataset.kick })));


    // status line + turn timer
    if (r.status === 'lobby') status.innerHTML = `<span class="mg-st-ico">${ui('hourglass')}</span><span>ناطرين اللاعبين — ${r.players.length} من ${r.max}</span>`;
    else if (r.status === 'playing' && r.turn) {
      const tp = ctx.player(r.turn.pid);
      const mine = r.turn.pid === r.me;
      const hint = mine && board && board.hint ? board.hint(r) : '';
      status.innerHTML = `<span class="mg-st-dot" style="--c:${tp ? tp.color : '#fff'}"></span>
        <span class="mg-st-txt">${mine ? '<b class="mg-yours">دورك!</b>' : `دور <b>${esc(tp ? tp.name : '')}</b>`}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
        ${r.turn.endsAt ? '<span class="mg-timer" aria-hidden="true"><i></i></span><span class="mg-secs"></span>' : ''}`;
      status.classList.toggle('mine', mine);
      if (mine && lastTurnPid !== r.me) sound('turn');
    } else if (r.status === 'ended') {
      status.innerHTML = `<span class="mg-st-ico">${ui('trophy')}</span><span>${esc(resultLine(r))}</span>`;
      status.classList.remove('mine');
    }
    if (r.status !== 'playing') status.classList.remove('mine');
    lastTurnPid = r.turn ? r.turn.pid : null;

    // overlay: lobby card / result card
    // (re-drawn only when it changed, so a half-typed name in the join box survives chat messages)
    const ov = r.status === 'lobby' ? lobbyCard(r, me || null) : r.status === 'ended' && !hideResult ? resultCard(r, me || null) : '';
    if (ov !== overlay.dataset.html) {
      overlay.dataset.html = ov;
      overlay.innerHTML = ov;
      overlay.hidden = !ov;
      if (r.status === 'lobby') wireLobby(overlay, r); else if (ov) wireResult(r);
    }
    if (r.status === 'ended' && hideResult && !under.querySelector('.mg-result-chip')) showResultChip();
    if (r.status !== 'ended') under.querySelector('.mg-result-chip')?.remove();
    // the header's points chip: reload the account once this game's points are in
    if (r.status === 'ended' && session.me && r.me && r.result && r.result.points && r.me in r.result.points && pointsSeen !== r.seq) {
      pointsSeen = r.seq;
      loadSession(true);
    }
    if (r.status === 'ended' && endedSeqSounded !== r.seq) {
      endedSeqSounded = r.seq;
      if (r.result && r.me && isWinner(r, r.me)) { sound('win'); try { (window.FX as any).confetti(); } catch { /* no canvas */ } }
      else if (r.result && r.me && !r.result.draw) sound('bankrupt');
    }
    // chat
    const log = $('#mgChatLog')!;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = r.chat.length ? r.chat.map((m) => m.pid
      ? `<p><b style="color:${(ctx.player(m.pid) || { color: 'var(--cyan2)' }).color}">${esc(m.name)}:</b> ${esc(m.text)}</p>`
      : `<p class="sys">${esc(m.text)}</p>`).join('') : '<p class="sys">ما في رسائل لسا</p>';
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  function resultLine(r: Room) {
    if (!r.result) return 'خلصت اللعبة';
    if (r.result.draw) return 'تعادل';
    const w = ctx.player(r.result.winner);
    if (r.me && isWinner(r, r.me)) return 'إنت ربحت!';
    return `ربح ${w ? w.name : ''}`;
  }

  function lobbyButtons(r: Room) {
    const full = r.players.length >= r.max;
    const opts = r.game === 'ludo'
      ? `<div class="mg-opt"><span class="mg-label">عدد المقاعد</span><div class="mg-seg" data-opt="max">${[2, 3, 4].map((n) => `<button type="button" data-v="${n}" aria-checked="${r.max === n}" ${n < r.players.length ? 'disabled' : ''}>${n}</button>`).join('')}</div></div>`
      : r.game === 'xo'
        ? `<div class="mg-opt"><span class="mg-label">المباراة</span><div class="mg-seg" data-opt="bestOf">${[[1, 'جولة'], [3, 'من 3'], [5, 'من 5']].map(([v, l]) => `<button type="button" data-v="${v}" aria-checked="${(r.opts.bestOf || 1) === v}">${l}</button>`).join('')}</div></div>`
        : meta.cards // card games: the room's numeric option is the target score; partners sit 1+3 and 2+4
          ? `${meta.cards.targets ? `<div class="mg-opt"><span class="mg-label">اللعب للـ</span><div class="mg-seg" data-opt="bestOf">${meta.cards.targets.map((v) => `<button type="button" data-v="${v}" aria-checked="${(meta.cards!.targets!.includes(r.opts.bestOf || 0) ? r.opts.bestOf : 41) === v}">${v}</button>`).join('')}</div></div>` : ''}${meta.cards.teams ? '<p class="muted mg-small">المقعد 1 و3 فريق، و2 و4 فريق. بدّك صاحبك شريكك؟ ضيف كمبيوتر قبل ما يفوت.</p>' : ''}`
          : '';
    return `${opts}<div class="mg-ov-btns">
      <button type="button" class="btn" data-lobby="addBot" ${full ? 'disabled' : ''}>${ui('robot')}ضيف كمبيوتر</button>
      <button type="button" class="btn btn-gold" data-lobby="start" ${r.players.length < r.min ? 'disabled' : ''}>${ui('play')}ابدأ</button>
    </div>`;
  }
  function lobbyCard(r: Room, me: Player | null) {
    const full = r.players.length >= r.max;
    let body: string;
    if (!me) {
      body = full ? '<p class="muted">الغرفة مليانة — فيك تتفرّج</p>'
        : session.me ? `<div class="mg-ov-btns"><button type="button" class="btn btn-gold big" data-join>${ui('play')}ادخل اللعبة باسم ${esc(session.me.displayName)}</button></div>`
          : `<form class="mg-join-row" data-joinform><input class="mg-input" maxlength="16" placeholder="اسمك" value="${esc(savedName())}" aria-label="اسمك" /><button class="btn btn-gold" type="submit">${ui('play')}ادخل اللعبة</button></form>`;
    } else if (isHost(r)) body = lobbyButtons(r) + `<p class="muted mg-small">بتقدر تبلّش لما يصيروا ${r.min} لاعبين أو أكتر — ضيف كمبيوتر إذا ما في حدا.</p>`;
    else body = `<p class="muted">ناطرين صاحب الغرفة يبلّش اللعبة…</p>`;
    return `<div class="mg-ov-card">
      <h2>${ui('users')}ناطرين اللاعبين <small>${r.players.length}/${r.max}</small></h2>
      <div class="mg-seats">${Array.from({ length: r.max }, (_, i) => {
        const p = r.players[i];
        return p ? `<span class="mg-seat on" style="--c:${p.color}">${avatar(p, 44)}<small>${esc(p.name)}</small></span>` : `<span class="mg-seat"><span class="mg-ava empty">?</span><small>فاضي</small></span>`;
      }).join('')}</div>
      <div class="mg-invite"><span class="ltr">${esc(inviteUrl().replace(/^https?:\/\//, ''))}</span><button type="button" class="btn sm" data-copy>${ui('users')}انسخ الدعوة</button></div>
      ${body}
    </div>`;
  }
  function wireLobby(root: HTMLElement, r: Room) {
    $$<HTMLButtonElement>('[data-lobby]', root).forEach((b) => b.addEventListener('click', async () => { busy(b, true); await ctx.act(b.dataset.lobby!); busy(b, false); }));
    $$('[data-opt]', root).forEach((seg) => seg.addEventListener('click', (e) => {
      const b = (e.target as Element).closest('button');
      if (!b || (b as HTMLButtonElement).disabled) return;
      ctx.act('opts', { [seg.getAttribute('data-opt')!]: Number(b.getAttribute('data-v')) });
    }));
    const copy = $('[data-copy]', root);
    if (copy) copy.addEventListener('click', copyInvite);
    const join = async (name: string) => {
      try {
        const j = await api<{ code: string; pid: string; token: string }>('/api/g/join', { code, name });
        creds = { pid: j.pid, token: j.token };
        saveCreds(code, creds);
        if (es) es.close();
        cur = null; lastSeq = -1;
        connect();
      } catch (e) { toast((e as Error).message); }
    };
    const jb = $('[data-join]', root);
    if (jb) jb.addEventListener('click', () => join(session.me ? session.me.displayName : savedName()));
    const jf = $<HTMLFormElement>('[data-joinform]', root);
    if (jf) jf.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = $<HTMLInputElement>('input', jf)!.value.trim();
      if (!n) { toast('اكتب اسمك أول'); return; }
      store.set(NAME_KEY, n);
      join(n);
    });
    void r;
  }
  function resultCard(r: Room, me: Player | null) {
    const res = r.result;
    if (!res) return '';
    const won = !!me && isWinner(r, me.id);
    const title = res.draw ? 'تعادل!' : won ? 'مبروك، ربحت!' : me && !me.left ? 'المرة الجاية إلك' : `ربح ${esc((ctx.player(res.winner) || { name: '' }).name)}`;
    const rank = res.ranking.length > 2 || r.game === 'ludo'
      ? `<ol class="mg-rank">${res.ranking.map((pid, i) => { const p = ctx.player(pid); return p ? `<li style="--c:${p.color}"><span class="mg-place">${i + 1}</span>${avatar(p, 30)}<b>${esc(p.name)}</b>${p.left ? '<small class="muted">طلع</small>' : ''}</li>` : ''; }).join('')}</ol>`
      : '';
    let pts = '';
    if (me && res.points && me.id in res.points) {
      const d = res.points[me.id];
      pts = `<p class="mg-delta ${d >= 0 ? 'up' : 'down'}">${ui('star')}${d >= 0 ? '+' : '−'}${Math.abs(d)} نقطة</p>`;
    } else if (me && !session.me && !me.isBot) pts = `<p class="muted mg-small"><a href="/login?next=${encodeURIComponent(location.pathname)}">سجّل دخول</a> لتجمع نقاط من كل لعبة بتربحها.</p>`;
    else if (me && session.me && !res.points) pts = '<p class="muted mg-small">عم نحسب النقاط…</p>';
    const voted = me && r.rematch.includes(me.id);
    const waiting = r.players.filter((p) => !p.isBot && !p.left && !r.rematch.includes(p.id)).map((p) => p.name);
    const again = me && !me.left
      ? `<button type="button" class="btn btn-gold big" data-again ${voted ? 'disabled' : ''}>${ui('refresh')}${voted ? 'ناطرين الباقيين' : 'جولة كمان'}</button>`
      : '';
    return `<div class="mg-ov-card result ${won ? 'won' : ''}">
      <span class="mg-res-ico">${ui(res.draw ? 'handshake' : won ? 'trophy' : 'medal')}</span>
      <h2>${title}</h2>
      ${r.game === 'xo' && r.state && r.state.bestOf > 1 ? `<p class="muted">النتيجة: ${[0, 1].map((k) => `<bdi>${esc((ctx.player(r.state.seats[k]) || { name: k ? 'O' : 'X' }).name)}: <b>${r.state.score[k]}</b></bdi>`).join(' · ')}</p>` : ''}
      ${rank}${pts}
      ${voted && waiting.length ? `<p class="muted mg-small">ناطرين: ${esc(waiting.join('، '))}</p>` : ''}
      <div class="mg-ov-btns">${again}<button type="button" class="btn" data-look>${ui('eye')}شوف اللوح</button><a class="btn btn-ghost" href="/games">${ui('gamepad')}ألعاب تانية</a></div>
    </div>`;
  }
  function wireResult(r: Room) {
    const a = $<HTMLButtonElement>('[data-again]', overlay);
    if (a) a.addEventListener('click', async () => { busy(a, true); if (!(await ctx.act('rematch'))) busy(a, false); });
    const look = $('[data-look]', overlay);
    if (look) look.addEventListener('click', () => { hideResult = true; overlay.hidden = true; overlay.dataset.html = ''; showResultChip(); });
    void r;
  }
  function showResultChip() {
    under.querySelector('.mg-result-chip')?.remove();
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-gold mg-result-chip';
    b.innerHTML = `${ui('trophy')}النتيجة وجولة كمان`;
    b.addEventListener('click', () => { hideResult = false; b.remove(); overlay.dataset.html = ''; if (cur) paint(cur); });
    under.prepend(b);
  }

  // turn clock
  setInterval(() => {
    if (!cur || !cur.turn || !cur.turn.endsAt) return;
    const left = Math.max(0, cur.turn.endsAt - (Date.now() + offset));
    const bar = $<HTMLElement>('.mg-timer i', status), secs = $('.mg-secs', status);
    if (bar) { bar.style.width = (100 * Math.min(1, left / cur.turn.ms)) + '%'; bar.classList.toggle('low', left < 6000); }
    if (secs) secs.textContent = Math.ceil(left / 1000) + 'ث';
  }, 200);
}
