// Site chrome shared by every header (the normal site header and the homepage's «مدينة Serva» header):
// the account area (#acct: login / «إنشاء حساب», or the avatar menu) and the announcement / maintenance banners (#banners).
import { $, esc, fmtN, ui, api, avatarHTML, loadSession, session, type Me } from './client';

function accountHTML(me: Me | null) {
  if (!me) {
    return `<a class="btn btn-ghost sm" href="/login">${ui('user')}<span>تسجيل الدخول</span></a>
      <a class="btn btn-gold sm hide-xs" href="/register">إنشاء حساب</a>`;
  }
  return `<div class="acc-menu">
    <button class="acc-btn" id="accBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="accDrop">
      ${avatarHTML(me.avatar, 32, me.color)}<span class="acc-name">${esc(me.displayName)}</span>
      <span class="pts-pill">${ui('star')}<b>${fmtN(me.points)}</b></span>
    </button>
    <div class="acc-drop" id="accDrop" role="menu" hidden>
      <div class="acc-head">${avatarHTML(me.avatar, 44, me.color)}<div><b>${esc(me.displayName)}</b><small dir="ltr">@${esc(me.username)}</small></div></div>
      <a role="menuitem" href="/u/${encodeURIComponent(me.username)}">${ui('user')}<span>بروفايلي</span></a>
      <a role="menuitem" href="/settings">${ui('gear')}<span>الإعدادات</span></a>
      ${me.role === 'admin' ? `<a role="menuitem" href="/admin">${ui('shield')}<span>لوحة التحكم</span></a>` : ''}
      <hr>
      <button role="menuitem" type="button" id="accOut">${ui('logout')}<span>تسجيل الخروج</span></button>
    </div></div>`;
}

function bannersHTML() {
  const s = session.site;
  let out = '';
  if (s.maintenance) out += `<div class="banner warn" role="status">${ui('tools')}<span>الموقع بالصيانة هلق — ما فيك تعمل غرف جديدة، جرّب بعد شوي.</span></div>`;
  let hidden = '';
  try { hidden = sessionStorage.getItem('tharwa_ann_hidden') || ''; } catch { /* private mode */ }
  if (s.announcement && hidden !== s.announcement) {
    out += `<div class="banner" role="status">${ui('megaphone')}<span class="ann-text"></span><button type="button" class="icon-btn" id="annX" aria-label="إخفاء الإعلان">${ui('xmark')}</button></div>`;
  }
  return out;
}

function setMenu(open: boolean) {
  const btn = $('#accBtn'), drop = $('#accDrop');
  if (!btn || !drop) return;
  drop.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}

function render() {
  const acct = $('#acct'), banners = $('#banners');
  if (acct) acct.innerHTML = accountHTML(session.me);
  if (banners) {
    banners.innerHTML = bannersHTML();
    const t = $('.ann-text', banners);
    if (t) { t.textContent = session.site.announcement; window.ART.iconize(t); }
    $('#annX', banners)?.addEventListener('click', (e) => {
      try { sessionStorage.setItem('tharwa_ann_hidden', session.site.announcement); } catch { /* private mode */ }
      (e.currentTarget as HTMLElement).closest('.banner')?.remove();
      document.dispatchEvent(new CustomEvent('tharwa:banners'));
    });
  }
  $('#accBtn')?.addEventListener('click', (e) => { e.stopPropagation(); setMenu(!!$('#accDrop')?.hidden); });
  $('#accOut')?.addEventListener('click', async () => {
    await api('/api/auth/logout', {}).catch(() => {});
    location.href = '/';
  });
  document.dispatchEvent(new CustomEvent('tharwa:banners'));
}

let mounted = false;
export function mountChrome() {
  if (mounted) return;
  mounted = true;
  document.addEventListener('click', (e) => { const d = $('#accDrop'); if (d && !d.contains(e.target as Node)) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  document.addEventListener('tharwa:session', render);
  loadSession();
}
