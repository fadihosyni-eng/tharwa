// Shared browser helpers for every page: API calls, session (me + site), toasts, modals, avatars.
// window.ART comes from the game's own art.js (bundled from ../public, one source of truth).
import '../../../public/art.js';

export type Me = {
  id: string; username: string; displayName: string; avatar: string; bio: string; role: string;
  points: number; games: number; wins: number; createdAt: number; color: string | null; piece: string | null;
  email: string | null; emailVerified: boolean; hasPassword: boolean; google: boolean; usernameChangedAt: number | null;
};
export type Ad = { slot: string; type: 'image' | 'html'; image: string; link: string; html: string };
export type Game = { slug: string; name: string; description?: string; players?: string; live?: number };
export type Site = {
  announcement: string; maintenance: boolean; registrationOpen: boolean; googleEnabled: boolean; ads: Ad[]; games: Game[];
};

export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
export const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const fmtN = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('en-US');
export const ui = (name: string, cls = '') => window.ART.ui(name, cls);
export const USER_RE = /^[a-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export const COLORS = ['#f5c04a', '#38d4c0', '#f0585e', '#a78bfa', '#5ad06b', '#f472b6', '#4f9df7', '#fb923c'];

export const dateAr = (ms: number) => new Date(ms).toLocaleDateString('ar-SY-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
export const timeAgo = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'هلق';
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.round(h / 24)} يوم`;
};

// ---------------------------------------------------------------- API
export class ApiError extends Error { status = 0; }
export async function api<T = any>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body !== undefined
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }
    : { credentials: 'same-origin' });
  let j: any = {};
  try { j = await r.json(); } catch { /* empty body */ }
  if (!r.ok) { const e = new ApiError((j && j.error) || 'صار خطأ، جرّب مرة تانية'); e.status = r.status; throw e; }
  return j as T;
}

// ---------------------------------------------------------------- session (loaded once per page)
const SITE_EMPTY: Site = { announcement: '', maintenance: false, registrationOpen: true, googleEnabled: false, ads: [], games: [] };
export const session: { me: Me | null; site: Site; ok: boolean } = { me: null, site: SITE_EMPTY, ok: true };
let loading: Promise<typeof session> | null = null;
export function loadSession(force = false) {
  if (!loading || force) {
    loading = Promise.all([
      api<{ user: Me | null }>('/api/auth/me').catch(() => ({ user: null })),
      api<Site>('/api/site').catch(() => null),
    ]).then(([me, site]) => {
      session.me = me.user;
      session.ok = !!site;
      if (site) session.site = { ...SITE_EMPTY, ...site };
      document.dispatchEvent(new CustomEvent('tharwa:session', { detail: session }));
      return session;
    });
  }
  return loading;
}
export function setMe(me: Me | null) {
  session.me = me;
  document.dispatchEvent(new CustomEvent('tharwa:session', { detail: session }));
}

// ---------------------------------------------------------------- avatars
export function avatarHTML(key: string | null | undefined, size = 40, color?: string | null) {
  const k = String(key || 'a1');
  if (/^https:\/\/lh3\.googleusercontent\.com\//.test(k)) {
    return `<span class="ava" style="--s:${size}px"><img src="${esc(k)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`;
  }
  if (k.startsWith('piece:')) {
    return `<span class="ava piece" style="--s:${size}px;--pc:${esc(color || '#00b4ff')}"><span class="tk">${window.ART.piece(k.slice(6))}</span></span>`;
  }
  return `<span class="ava" style="--s:${size}px">${window.ART.avatar(k)}</span>`;
}

// ---------------------------------------------------------------- toasts
// Server messages sometimes carry emoji; ART.iconize swaps them for the matching SVG icons.
export function toast(msg: string, kind: 'err' | 'ok' = 'err') {
  const box = $('#toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  t.innerHTML = ui(kind === 'ok' ? 'check' : 'warn');
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  box.appendChild(t);
  window.ART.iconize(span);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3200);
}
// Puts a message into a .form-err box (emoji → icons).
export function showErr(box: HTMLElement | null, msg: string) {
  if (!box) return;
  box.textContent = msg;
  box.classList.toggle('show', !!msg);
  if (msg) window.ART.iconize(box);
}

// ---------------------------------------------------------------- modal
export function modal(title: string, bodyHTML: string) {
  const root = $('#modal-root')!;
  root.innerHTML = `<div class="modal-back" data-back><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <div class="modal-head"><b id="mTitle">${esc(title)}</b><button type="button" class="icon-btn" data-x aria-label="إغلاق">${ui('xmark')}</button></div>
    <div class="modal-body">${bodyHTML}</div></div></div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('[data-x]', root)!.addEventListener('click', close);
  $('[data-back]', root)!.addEventListener('click', (e) => { if ((e.target as Element).hasAttribute('data-back')) close(); });
  return { root, close };
}
export function confirmBox(text: string, yes = 'أكيد', danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal('تأكيد', `<p class="modal-text">${esc(text)}</p><div class="modal-actions"><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-y>${esc(yes)}</button><button type="button" class="btn" data-n>لا</button></div>`);
    let done = false;
    const finish = (v: boolean) => { if (done) return; done = true; m.close(); resolve(v); };
    $('[data-y]', m.root)!.addEventListener('click', () => finish(true));
    $('[data-n]', m.root)!.addEventListener('click', () => finish(false));
    $('[data-x]', m.root)!.addEventListener('click', () => finish(false));
    ($('[data-y]', m.root) as HTMLButtonElement).focus();
  });
}

// ---------------------------------------------------------------- misc
export function busy(btn: HTMLButtonElement | null, on: boolean, text?: string) {
  if (!btn) return;
  if (on && !btn.dataset.label) btn.dataset.label = btn.innerHTML;
  btn.disabled = on;
  btn.classList.toggle('loading', on);
  if (on && text) btn.textContent = text;
  if (!on && btn.dataset.label) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
}
// Only same-site relative paths are allowed as ?next= targets.
export const safeNext = (next: string | null) => (next && /^\/[a-z0-9/_-]*$/i.test(next) && !next.startsWith('//') ? next : '/');

// Ad slot: image ads link out; HTML ads run inside a sandboxed iframe (no access to the site or its cookies).
export function adHTML(slot: string) {
  const ad = (session.site.ads || []).find((a) => a.slot === slot);
  if (!ad) return '';
  if (ad.type === 'html') {
    return `<div class="ad-slot"><small>إعلان</small><iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy" srcdoc="${esc(ad.html)}" title="إعلان"></iframe></div>`;
  }
  const img = `<img src="${esc(ad.image)}" alt="إعلان" loading="lazy" referrerpolicy="no-referrer">`;
  return `<div class="ad-slot"><small>إعلان</small>${ad.link ? `<a href="${esc(ad.link)}" target="_blank" rel="noopener sponsored nofollow">${img}</a>` : img}</div>`;
}
// Fills every [data-ad="slot"] placeholder on the page.
export function mountAds() {
  $$('[data-ad]').forEach((el) => { el.innerHTML = adHTML(el.dataset.ad || ''); el.hidden = !el.innerHTML; });
}
// "Loading", "error" and "empty" states share one look.
export const stateHTML = (kind: 'loading' | 'error' | 'empty', text: string) =>
  `<div class="state state-${kind}">${kind === 'loading' ? '<span class="spinner" aria-hidden="true"></span>' : ui(kind === 'error' ? 'warn' : 'sparkle')}<span>${esc(text)}</span></div>`;
