// Browser-side play actions shared by the home page and /games/<slug>:
// quick play, vs computer, private room, join by code, open-room lists and «continue where you left off».
//   ثروة  → the original game server: /api/quick, /api/create, /api/rooms, /api/room; creds in tharwa_room_<code>; room at /room/<code>
//   other → /api/g/*: quick | create | join → {code, pid, token}; creds in g_room_<code>; room at /play/<slug>/<code>
import { api, ApiError, session, esc, ui, modal, $ } from '../../lib/client';

export const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  keys(): string[] { try { return Object.keys(localStorage); } catch { return []; } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

export const isTharwa = (slug: string) => slug === 'tharwa';
export const roomUrl = (slug: string, code: string) =>
  isTharwa(slug) ? '/room/' + encodeURIComponent(code) : `/play/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`;

/** Account name when logged in, otherwise the saved guest nickname. */
export const savedName = () => (session.me && session.me.displayName) || store.get('tharwa_name') || '';
export const rememberName = (n: string) => { if (n && !session.me) store.set('tharwa_name', n); };

type Creds = { code: string; pid: string; token: string };
function saveCreds(slug: string, r: Creds) {
  if (isTharwa(slug)) store.set('tharwa_room_' + r.code, JSON.stringify({ pid: r.pid, token: r.token }));
  else store.set('g_room_' + r.code, JSON.stringify({ pid: r.pid, token: r.token, game: slug, at: Date.now() }));
}

/** A friendly message for API failures. When starting a game, a 404 means the server has no such game (yet);
 *  when joining, the server's own message («the room is gone») is shown. */
export function playError(e: unknown, slug: string, joining = false) {
  if (!(e instanceof ApiError)) return 'ما قدرنا نوصل للسيرفر — تأكّد من النت وجرّب كمان مرة.';
  if (!isTharwa(slug) && e.status === 404 && !joining) return 'هاللعبة لسا عم تتجهّز على السيرفر — جرّب بعد شوي.';
  return e.message || 'صار خطأ، جرّب مرة تانية';
}

export type Mode = 'quick' | 'bot' | 'private';
/** Starts a game and returns the room URL to go to. Throws on failure (nothing is faked). */
export async function start(slug: string, mode: Mode, name: string): Promise<string> {
  let r: Creds;
  if (isTharwa(slug)) {
    if (mode === 'quick') r = await api<Creds>('/api/quick', { name });
    else {
      r = await api<Creds>('/api/create', { name, isPrivate: true });
      // «ضد الكمبيوتر»: a private room with two bots already seated (the host presses start in the lobby).
      if (mode === 'bot') {
        for (let i = 0; i < 2; i++) {
          await api('/api/act', { code: r.code, pid: r.pid, token: r.token, type: 'addBot', data: {} }).catch(() => {});
        }
      }
    }
  } else if (mode === 'quick') {
    r = await api<Creds>('/api/g/quick', { game: slug, name });
  } else {
    r = await api<Creds>('/api/g/create', { game: slug, name, isPrivate: true, ...(mode === 'bot' ? { vsBot: true } : {}) });
  }
  if (!r || !r.code || !r.pid || !r.token) throw new ApiError('صار خطأ، جرّب مرة تانية');
  saveCreds(slug, r);
  return roomUrl(slug, r.code);
}

/** Join a room by code (ثروة: the room page itself does the joining, as before). */
export async function join(slug: string, code: string, name: string): Promise<string> {
  if (isTharwa(slug)) return roomUrl(slug, code.toLowerCase());
  const r = await api<Creds>('/api/g/join', { code: code.toLowerCase(), name });
  if (!r || !r.code || !r.pid || !r.token) throw new ApiError('صار خطأ، جرّب مرة تانية');
  saveCreds(slug, r);
  return roomUrl(slug, r.code);
}

export const validCode = (slug: string, c: string) => (isTharwa(slug) ? /^[a-z0-9]{5}$/.test(c) : /^[a-z0-9]{4,8}$/.test(c));

// ---------------------------------------------------------------- open rooms
export type OpenRoom = { slug: string; code: string; title: string; count: number; max: number; extra: string };
/** Open public rooms of one game. Resolves null when the server has no rooms list for it (yet). */
export async function openRooms(slug: string): Promise<OpenRoom[] | null> {
  if (isTharwa(slug)) {
    const list = await api<{ code: string; host: string; count: number; max: number; cash: number }[]>('/api/rooms');
    return list.map((r) => ({
      slug, code: r.code, title: r.host ? `غرفة ${r.host}` : 'غرفة مفتوحة', count: r.count, max: r.max,
      extra: `يبلّش بـ $${Math.round(Number(r.cash) || 0).toLocaleString('en-US')}`,
    }));
  }
  try {
    const list = await api<{ code: string; game?: string; players: number | unknown[]; max: number; status?: string; host?: string }[]>(
      '/api/g/rooms?game=' + encodeURIComponent(slug));
    return (Array.isArray(list) ? list : [])
      .filter((r) => r && r.code && (!r.game || r.game === slug) && (!r.status || r.status === 'lobby' || r.status === 'waiting'))
      .map((r) => {
        const count = Array.isArray(r.players) ? r.players.length : Number(r.players) || 0;
        return { slug, code: String(r.code), title: r.host ? `غرفة ${r.host}` : 'غرفة مفتوحة', count, max: Number(r.max) || 0, extra: '' };
      })
      .filter((r) => !r.max || r.count < r.max);
  } catch (e) {
    if ((e as ApiError).status === 404) return null;
    throw e;
  }
}

export function roomItemHTML(r: OpenRoom, gameName?: string, art?: string) {
  const lead = art ? `<img class="ri-art" src="${esc(art)}" alt="" width="48" height="30" loading="lazy" decoding="async">` : '';
  const meta = [gameName ? `<b class="ri-game">${esc(gameName)}</b>` : '', `${ui('users')} ${r.count}/${r.max || '?'}`, r.extra ? esc(r.extra) : '']
    .filter(Boolean).join('<i class="dot-sep"></i>');
  return `<div class="room-item">${lead}<div class="ri-text"><b>${esc(r.title)}</b><small>${meta}</small></div>
    <button type="button" class="btn btn-gold sm" data-room="${esc(r.code)}" data-slug="${esc(r.slug)}">ادخل</button></div>`;
}

// ---------------------------------------------------------------- «continue where you left off»
export type ResumeRoom = { slug: string; code: string; status: string };
/** Rooms this browser still has a seat in. ثروة rooms are checked with /api/room, the other games with /api/g/room. */
export async function myRooms(gameSlugs: string[]): Promise<ResumeRoom[]> {
  const keys = store.keys();
  const out: ResumeRoom[] = [];
  const tharwa = keys.filter((k) => /^tharwa_room_[a-z0-9]{5}$/.test(k)).slice(-8);
  await Promise.all(tharwa.map(async (k) => {
    const code = k.slice(12);
    try {
      const c = JSON.parse(store.get(k) || '{}');
      const r = await api<{ status: string; member: boolean }>(`/api/room?code=${code}&pid=${encodeURIComponent(c.pid || '')}`);
      if (r.member && r.status !== 'over') out.push({ slug: 'tharwa', code, status: r.status });
    } catch (e) { if ((e as ApiError).status === 404) store.del(k); /* the room is gone: forget its seat */ }
  }));
  const g = keys.filter((k) => /^g_room_[A-Za-z0-9]{3,12}$/.test(k)).slice(-8);
  await Promise.all(g.map(async (k) => {
    const code = k.slice(7);
    try {
      const r = await api<{ code: string; game: string; status: string }>('/api/g/room?code=' + encodeURIComponent(code));
      if (r && gameSlugs.includes(r.game) && (r.status === 'lobby' || r.status === 'playing')) out.push({ slug: r.game, code: r.code || code, status: r.status });
    } catch (e) { if ((e as ApiError).status === 404) store.del(k); /* the room is gone: forget its seat */ }
  }));
  return out;
}

// ---------------------------------------------------------------- name prompt (guests joining from a list)
/** Resolves the player name: the account name, the saved guest name, or asks once in a small dialog. */
export function askName(): Promise<string | null> {
  const known = savedName();
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const m = modal('شو اسمك باللعبة؟', `<form id="nameForm" class="name-form">
      <input class="input" id="nameIn" maxlength="16" placeholder="اسمك باللعبة…" autocomplete="nickname" required>
      <button class="btn btn-gold block" type="submit">يلّا نلعب</button></form>`);
    let done = false;
    const finish = (v: string | null) => { if (done) return; done = true; m.close(); resolve(v); };
    const input = $('#nameIn', m.root) as HTMLInputElement;
    input.focus();
    $('#nameForm', m.root)!.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = input.value.trim();
      if (!n) { input.focus(); return; }
      rememberName(n);
      finish(n);
    });
    $('[data-x]', m.root)!.addEventListener('click', () => finish(null));
    $('[data-back]', m.root)!.addEventListener('click', (e) => { if ((e.target as Element).hasAttribute('data-back')) finish(null); });
  });
}

/** Which game a room code belongs to (null when no open/running room has it). */
export async function findRoom(code: string, gameSlugs: string[]): Promise<{ slug: string; code: string; status: string } | null> {
  if (gameSlugs.includes('tharwa') && /^[a-z0-9]{5}$/i.test(code)) {
    const r = await api<{ code: string; status: string }>('/api/room?code=' + code.toLowerCase()).catch(() => null);
    if (r) return { slug: 'tharwa', code: code.toLowerCase(), status: r.status };
  }
  const g = await api<{ code: string; game: string; status: string }>('/api/g/room?code=' + encodeURIComponent(code)).catch(() => null);
  if (g && gameSlugs.includes(g.game)) return { slug: g.game, code: g.code || code, status: g.status };
  return null;
}
