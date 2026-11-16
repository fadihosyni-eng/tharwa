'use strict';
// Accounts UI for «ثروة»: header, login/register, public profile (/u/<name>), settings and the admin dashboard.
// app.js calls ACC.load() at boot, ACC.route(path) for account pages, and uses ACC.headerHTML()/ACC.bindHeader().
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const app = () => document.getElementById('app');
  const COLORS = ['#f5c04a', '#38d4c0', '#f0585e', '#a78bfa', '#5ad06b', '#f472b6', '#4f9df7', '#fb923c'];
  const USER_RE = /^[a-z0-9_]{3,20}$/;

  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    let j = {};
    try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) { const e = new Error(j.error || 'صار خطأ، جرّب مرة تانية'); e.status = r.status; throw e; }
    return j;
  }
  function toast(msg, kind = 'err') {
    const box = $('#toasts'); if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
  }
  const dateAr = (ms) => new Date(ms).toLocaleDateString('ar-SY-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeAgo = (ms) => {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'هلق'; if (m < 60) return `قبل ${m} د`;
    const h = Math.round(m / 60); if (h < 24) return `قبل ${h} س`;
    return `قبل ${Math.round(h / 24)} يوم`;
  };

  const ACC = { me: null, site: { announcement: '', ads: [], games: [], maintenance: false, registrationOpen: true } };

  // ---------------------------------------------------------------- avatar
  function avatarHTML(key, size = 40, color) {
    const k = String(key || 'a1');
    if (/^https:\/\/lh3\.googleusercontent\.com\//.test(k)) return `<span class="ava" style="--s:${size}px"><img src="${esc(k)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`;
    if (k.startsWith('piece:')) return `<span class="ava piece" style="--s:${size}px;--pc:${color || '#00b4ff'}"><span class="tk">${ART.piece(k.slice(6))}</span></span>`;
    return `<span class="ava" style="--s:${size}px">${ART.avatar(k)}</span>`;
  }
  ACC.avatarHTML = avatarHTML;

  // ---------------------------------------------------------------- loading
  ACC.load = async () => {
    const [me, site] = await Promise.all([api('/api/auth/me').catch(() => ({ user: null })), api('/api/site').catch(() => null)]);
    ACC.me = me.user; if (site) ACC.site = site;
  };

  // ---------------------------------------------------------------- header (home + account pages)
  ACC.headerHTML = () => {
    const me = ACC.me;
    const right = me
      ? `<div class="acc-menu"><button class="acc-btn" id="accBtn" type="button" aria-haspopup="true">${avatarHTML(me.avatar, 32, me.color)}<span>${esc(me.displayName)}</span><small>⭐ ${fmtN(me.points)}</small><i>▾</i></button>
          <div class="acc-drop" id="accDrop" hidden>
            <a href="/u/${esc(me.username)}">👤 بروفايلي</a><a href="/settings">⚙️ الإعدادات</a>
            ${me.role === 'admin' ? '<a href="/admin">🛡️ لوحة التحكم</a>' : ''}
            <button type="button" id="accOut">🚪 تسجيل الخروج</button></div></div>`
      : `<div class="row" style="gap:8px"><a class="btn sm" href="/login">تسجيل الدخول</a><a class="btn sm gold" href="/register">إنشاء حساب</a></div>`;
    const ann = ACC.site.announcement ? `<div class="announce">📢 ${esc(ACC.site.announcement)}</div>` : '';
    const here = location.pathname;
    const nav = `<nav class="topnav"><a href="/store" class="${here === '/store' ? 'on' : ''}">${ART.ui('store')}<span>المتجر</span></a><a href="/leaders" class="${here === '/leaders' ? 'on' : ''}">${ART.ui('trophy')}<span>المتصدرين</span></a></nav>`;
    return `<header class="topbar"><a class="mini-logo" href="/">ثروة<span>.</span></a>${nav}<div class="topbar-end">${right}</div></header>${ann}`;
  };
  ACC.bindHeader = (root = document) => {
    const btn = $('#accBtn', root), drop = $('#accDrop', root);
    if (btn) {
      btn.onclick = (e) => { e.stopPropagation(); drop.hidden = !drop.hidden; };
      document.addEventListener('click', () => { drop.hidden = true; });
      $('#accOut', root).onclick = async () => { await api('/api/auth/logout', {}).catch(() => {}); location.href = '/'; };
    }
  };
  // Ad slot: image ads link out; HTML ads run inside a sandboxed iframe (no access to the site or its cookies).
  ACC.adHTML = (slot) => {
    const ad = (ACC.site.ads || []).find((a) => a.slot === slot);
    if (!ad) return '';
    if (ad.type === 'html') return `<div class="ad-slot ad-${slot}"><small>إعلان</small><iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy" srcdoc="${esc(ad.html)}" title="إعلان"></iframe></div>`;
    const img = `<img src="${esc(ad.image)}" alt="إعلان" loading="lazy" referrerpolicy="no-referrer">`;
    return `<div class="ad-slot ad-${slot}"><small>إعلان</small>${ad.link ? `<a href="${esc(ad.link)}" target="_blank" rel="noopener sponsored nofollow">${img}</a>` : img}</div>`;
  };

  // ---------------------------------------------------------------- router
  ACC.route = (path) => {
    let m;
    if (path === '/login' || path === '/register') return renderAuth(path === '/register' ? 'register' : 'login');
    if ((m = path.match(/^\/u\/([^/]+)\/?$/))) return renderProfile(decodeURIComponent(m[1]).toLowerCase());
    if (path === '/settings') return ACC.me ? renderSettings() : (location.href = '/login?next=/settings');
    if (path === '/admin') return ACC.me && ACC.me.role === 'admin' ? renderAdmin() : renderNotFound();
    if (path === '/leaders') return renderLeaders();
    if (path === '/store') return renderStore();
    return false;
  };
  function shell(inner, cls = '') {
    app().innerHTML = `<div class="acc-page ${cls}">${ACC.headerHTML()}<main class="acc-main">${inner}</main></div>`;
    ACC.bindHeader();
  }
  function renderNotFound(msg = 'الصفحة مو موجودة') {
    document.title = 'مو موجود — ثروة';
    shell(`<div class="panel nf"><div class="nf-code">404</div><h2>${esc(msg)}</h2><p class="hint">يمكن الرابط غلط أو انمسح.</p><a class="btn gold" href="/">ارجع للصفحة الرئيسية</a></div>`);
  }

  // ---------------------------------------------------------------- login / register
  const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
  // Google's «G» (official colours) for the sign-in button.
  const G_LOGO = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  const GOOGLE_ERRORS = {
    off: 'الدخول بـ Google مو مفعّل هلق.', cancel: 'لغيت الدخول بـ Google.', state: 'انتهت صلاحية المحاولة — جرّب مرة تانية.',
    google: 'ما قدرنا نتأكد من حساب Google — جرّب مرة تانية.', unverified: 'إيميل حساب Google مو مؤكَّد.',
    banned: 'حسابك موقوف — تواصل مع الإدارة.', rate: 'كتير محاولات — استنى دقيقة وجرّب.',
  };
  const googleBtn = () => (ACC.site.googleEnabled
    ? `<a class="btn-google" href="/api/auth/google/start">${G_LOGO}<span>المتابعة بحساب Google</span></a><div class="or-sep"><span>أو</span></div>` : '');
  function renderAuth(mode) {
    if (ACC.me) { location.href = '/'; return; }
    const qs = new URLSearchParams(location.search);
    if (mode === 'register' && qs.get('google') === '1') { renderGoogleFinish(); return; }
    document.title = (mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب') + ' — ثروة';
    const next = qs.get('next');
    const gErr = qs.get('err') && (GOOGLE_ERRORS[qs.get('err')] || 'صار خطأ بالدخول بـ Google.');
    const closed = mode === 'register' && !ACC.site.registrationOpen;
    shell(`<div class="auth-card panel">
      <div class="auth-tabs"><a href="/login" class="${mode === 'login' ? 'on' : ''}">تسجيل الدخول</a><a href="/register" class="${mode === 'register' ? 'on' : ''}">إنشاء حساب</a></div>
      <h2>${mode === 'login' ? 'أهلين فيك من جديد 👋' : 'اعمل حسابك ببلاش ✨'}</h2>
      <p class="hint">${mode === 'login' ? 'ادخل لتجمع نقاط وتحفظ نتايجك.' : 'حسابك بيحفظ اسمك وصورتك ونقاطك وكل ألعابك.'}</p>
      ${closed ? '<div class="form-err show">التسجيل مسكّر هلق من الإدارة.</div>' : ''}
      ${gErr ? `<div class="form-err show">${esc(gErr)}</div>` : ''}
      ${closed ? '' : googleBtn()}
      <form id="authForm" novalidate>
        ${mode === 'login'
    ? '<label class="field"><span>اسم المستخدم أو الإيميل</span><input name="username" autocomplete="username" dir="ltr" maxlength="254" placeholder="sami_99 أو name@gmail.com" required><small class="fhint"></small></label>'
    : `<label class="field"><span>اسم المستخدم</span><input name="username" autocomplete="username" dir="ltr" maxlength="20" placeholder="مثلاً: sami_99" required><small class="fhint">3–20: أحرف إنكليزية صغيرة، أرقام، أو _ — بيصير رابط بروفايلك</small></label>
        <label class="field"><span>الإيميل</span><input name="email" type="email" autocomplete="email" dir="ltr" maxlength="254" placeholder="name@gmail.com" required><small class="fhint">لحماية حسابك — ما بيظهر لحدا</small></label>
        <label class="field"><span>اسمك الظاهر</span><input name="displayName" maxlength="24" placeholder="مثلاً: سامي"><small class="fhint">هيك رح يشوفك اللاعبين (فيك تغيّره بعدين)</small></label>`}
        <label class="field"><span>كلمة السر</span><div class="pw"><input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" dir="ltr" required><button type="button" class="pw-eye" title="إظهار">👁</button></div><small class="fhint">${mode === 'register' ? '6 أحرف على الأقل' : ''}</small></label>
        ${mode === 'register' ? '<label class="field"><span>أكّد كلمة السر</span><input name="password2" type="password" autocomplete="new-password" dir="ltr"></label>' : ''}
        <div class="form-err" id="authErr"></div>
        <button class="btn gold big block" id="authGo" ${closed ? 'disabled' : ''}>${mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
      </form></div>`, 'auth');
    const f = $('#authForm'), errBox = $('#authErr'), go = $('#authGo');
    $('.pw-eye').onclick = () => { const i = f.password; i.type = i.type === 'password' ? 'text' : 'password'; };
    const setErr = (name, msg, hint) => {
      const field = f[name] && f[name].closest('.field');
      if (!field) return;
      field.classList.toggle('bad', !!msg);
      const h = field.querySelector('.fhint');
      if (h) { if (!h.dataset.hint) h.dataset.hint = h.textContent; h.textContent = msg || hint || h.dataset.hint; }
    };
    f.username.addEventListener('input', () => {
      f.username.value = f.username.value.toLowerCase().replace(/\s/g, '');
      if (mode === 'register') setErr('username', f.username.value && !USER_RE.test(f.username.value) ? 'بس أحرف إنكليزية صغيرة وأرقام و _ (3–20)' : '');
    });
    if (f.email) {
      f.email.addEventListener('input', () => { f.email.value = f.email.value.replace(/\s/g, ''); setErr('email', ''); });
      f.email.addEventListener('blur', () => { const v = f.email.value.toLowerCase(); setErr('email', v && !EMAIL_RE.test(v) ? 'الإيميل مو صحيح — مثلاً: name@gmail.com' : ''); });
    }
    f.onsubmit = async (e) => {
      e.preventDefault();
      errBox.classList.remove('show');
      const v = Object.fromEntries(new FormData(f));
      const email = String(v.email || '').trim().toLowerCase();
      let bad = '';
      if (mode === 'login' && !(v.username || '').trim()) bad = 'اكتب اسم المستخدم أو الإيميل';
      else if (mode === 'register' && !USER_RE.test(v.username || '')) bad = 'اسم المستخدم لازم يكون 3–20 حرف إنكليزي صغير أو رقم أو _';
      else if (mode === 'register' && !EMAIL_RE.test(email)) { bad = 'الإيميل مو صحيح — مثلاً: name@gmail.com'; setErr('email', bad); }
      else if ((v.password || '').length < 6) bad = 'كلمة السر لازم تكون 6 أحرف على الأقل';
      else if (mode === 'register' && v.password !== v.password2) bad = 'كلمتين السر مو متطابقين';
      if (bad) { errBox.textContent = bad; errBox.classList.add('show'); return; }
      go.disabled = true; go.classList.add('loading'); const label = go.textContent; go.textContent = 'لحظة…';
      try {
        const r = await api('/api/auth/' + mode, { username: v.username, email, password: v.password, displayName: v.displayName });
        ACC.me = r.user;
        toast(mode === 'login' ? `أهلين ${r.user.displayName} 👋` : 'انعمل حسابك ✔', 'ok');
        location.href = next && /^\/[a-z0-9/_-]*$/i.test(next) ? next : '/';
      } catch (er) {
        if (/الإيميل/.test(er.message)) setErr('email', er.message);
        if (/اسم المستخدم مأخود|محجوز/.test(er.message)) setErr('username', er.message);
        errBox.textContent = er.message; errBox.classList.add('show');
        go.disabled = false; go.classList.remove('loading'); go.textContent = label;
      }
    };
    f.username.focus();
  }
  // New Google sign-up: Google already gave the email (verified), name and photo — only the username is left.
  async function renderGoogleFinish() {
    document.title = 'كمّل حسابك — ثروة';
    const pend = await api('/api/auth/google/pending').catch(() => null);
    if (!pend) { location.href = '/login?err=state'; return; }
    shell(`<div class="auth-card panel">
      <div class="g-who">${pend.picture ? avatarHTML(pend.picture, 56) : G_LOGO}<div><b>${esc(pend.name || 'أهلين!')}</b><small dir="ltr">${esc(pend.email)}</small></div></div>
      <h2>آخر خطوة: اختار اسم مستخدم</h2>
      <p class="hint">إيميلك مؤكَّد من Google. اختار اسم بيصير رابط بروفايلك.</p>
      <form id="gForm" novalidate>
        <label class="field"><span>اسم المستخدم</span><input name="username" dir="ltr" maxlength="20" placeholder="مثلاً: sami_99" required><small class="fhint">3–20: أحرف إنكليزية صغيرة، أرقام، أو _</small></label>
        <label class="field"><span>اسمك الظاهر</span><input name="displayName" maxlength="24" value="${esc(pend.name || '')}"></label>
        <div class="form-err" id="gErr"></div>
        <button class="btn gold big block" id="gGo">إنشاء الحساب</button>
      </form></div>`, 'auth');
    const f = $('#gForm'), er = $('#gErr'), go = $('#gGo');
    f.username.addEventListener('input', () => {
      f.username.value = f.username.value.toLowerCase().replace(/\s/g, '');
      f.username.closest('.field').classList.toggle('bad', !!f.username.value && !USER_RE.test(f.username.value));
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      er.classList.remove('show');
      if (!USER_RE.test(f.username.value)) { er.textContent = 'اسم المستخدم لازم يكون 3–20 حرف إنكليزي صغير أو رقم أو _'; er.classList.add('show'); return; }
      go.disabled = true; go.textContent = 'لحظة…';
      try {
        await api('/api/auth/google/complete', { username: f.username.value, displayName: f.displayName.value });
        toast('انعمل حسابك ✔', 'ok'); location.href = '/';
      } catch (x) { er.textContent = x.message; er.classList.add('show'); go.disabled = false; go.textContent = 'إنشاء الحساب'; }
    };
    f.username.focus();
  }

  // ---------------------------------------------------------------- public profile
  async function renderProfile(username) {
    shell('<div class="panel"><div class="hint">عم حمّل…</div></div>');
    let d;
    try { d = await api('/api/u/' + encodeURIComponent(username)); } catch (e) { renderNotFound('هالمستخدم مو موجود'); return; }
    const u = d.user, mine = ACC.me && ACC.me.username === u.username;
    document.title = `${u.displayName} (@${u.username}) — ثروة`;
    const rate = u.games ? Math.round((u.wins / u.games) * 100) : 0;
    const games = d.recent.length ? d.recent.map((g) => `<div class="game-row ${g.won ? 'won' : ''}"><span class="g-res">${g.won ? '🏆 ربح' : '🎲 لعب'}</span>
        <span>${g.players} لاعبين · ${g.rounds} جولة · ${Math.max(1, Math.round(g.durationMs / 60000))} د</span><small>${g.won ? '' : 'الفائز: ' + esc(g.winner)} ${timeAgo(g.at)}</small></div>`).join('')
      : '<div class="hint">لسا ما لعب ولا لعبة.</div>';
    shell(`<div class="profile">
      <section class="panel prof-card">
        ${avatarHTML(u.avatar, 104, u.color)}
        <div class="prof-id"><h1>${esc(u.displayName)} ${u.role === 'admin' ? '<span class="badge">🛡️ أدمن</span>' : ''}</h1>
          <div class="handle" dir="ltr">@${esc(u.username)}</div>
          ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
          <div class="hint">📅 انضم ${dateAr(u.createdAt)}</div></div>
        ${mine ? '<a class="btn" href="/settings">✏️ تعديل الحساب</a>' : ''}
      </section>
      <section class="stats">
        <div class="stat gold"><b>⭐ ${fmtN(u.points)}</b><span>نقاط</span></div>
        <div class="stat"><b>${fmtN(u.games)}</b><span>لعبة</span></div>
        <div class="stat"><b>${fmtN(u.wins)}</b><span>فوز</span></div>
        <div class="stat"><b>${rate}%</b><span>نسبة الفوز</span></div>
      </section>
      <section class="panel"><div class="lbl">آخر الألعاب</div>${games}</section>
    </div>`);
  }

  // ---------------------------------------------------------------- leaderboard
  async function renderLeaders() {
    document.title = 'المتصدرين — ثروة';
    shell('<div class="panel"><div class="hint">عم حمّل…</div></div>');
    const list = await api('/api/leaders').catch(() => []);
    const rows = list.map((u, i) => {
      const rate = u.games ? Math.round((u.wins / u.games) * 100) : 0;
      return `<a class="lead-row ${i < 3 ? 'top' + (i + 1) : ''}" href="/u/${esc(u.username)}"><span class="lead-rank">${i < 3 ? ART.ui('medal') : i + 1}</span>
        ${avatarHTML(u.avatar, 38, u.color)}<span><b>${esc(u.displayName)}</b><small dir="ltr">@${esc(u.username)}</small></span>
        <span class="lead-games hint">${u.wins} فوز من ${u.games} · ${rate}%</span><span class="lead-pts">${fmtN(u.points)} ${ART.ui('star')}</span></a>`;
    }).join('');
    shell(`<div class="store-head"><h1>${ART.ui('trophy')} المتصدرين</h1><span class="hint">أعلى 50 لاعب بالنقاط — النقاط بتنربح من الألعاب وبتنخسر كمان</span></div>
      <section class="panel">${rows || '<div class="hint">لسا ما في لاعبين بنقاط.</div>'}</section>`);
  }

  // ---------------------------------------------------------------- store (maps)
  const GRID = (i) => (i <= 10 ? [11, 11 - i] : i < 20 ? [11 - (i - 10), 1] : i <= 30 ? [1, 1 + (i - 20)] : [1 + (i - 30), 11]);
  function miniBoard(m, tiles, defaultSets) {
    const th = m.theme || {}, slots = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
    const color = (k) => (th.sets ? th.sets[slots.indexOf(k)] : defaultSets[k].color);
    const cells = tiles.map((t, i) => {
      const [r, c] = GRID(i);
      return `<i class="${t.type === 'city' ? 'c' : ''}" style="grid-row:${r};grid-column:${c};${t.type === 'city' ? `--sc:${color(t.set)}` : ''}"></i>`;
    }).join('');
    const vars = [th.boardBg && `--mb-board:${th.boardBg}`, th.tile && `--mb-tile:${th.tile}`, th.line && `--mb-line:${th.line}`, th.centerBg && `--mb-center:${th.centerBg}`,
      th.accent && `--mb-accent:${th.accent}`, m.bg && `--mb-bg:url('${m.bg}')`].filter(Boolean).join(';');
    return `<div class="mini-board" style="${vars}">${cells}<div class="mb-center"><b>${esc(m.name)}</b></div></div>`;
  }
  async function renderStore() {
    document.title = 'المتجر — ثروة';
    shell('<div class="panel"><div class="hint">عم حمّل…</div></div>');
    const [{ maps, points }, board] = await Promise.all([api('/api/maps'), api('/api/board')]);
    const cards = maps.map((m) => {
      const action = m.owned ? `<span class="badge green">${ART.ui('check')} مملوكة</span>`
        : !ACC.me ? '<a class="btn sm" href="/login?next=/store">سجّل دخول لتشتري</a>'
          : `<button class="btn gold sm" data-buy="${m.id}" data-price="${m.price}" ${points < m.price ? 'disabled title="ما معك نقاط كافية"' : ''}>اشترِ بـ ${fmtN(m.price)} ${ART.ui('star')}</button>`;
      return `<article class="map-card ${m.owned ? 'owned' : ''}">${miniBoard(m, board.tiles, board.sets)}
        <h3>${esc(m.name)} ${m.price ? `<span class="price">${fmtN(m.price)} ${ART.ui('star')}</span>` : '<span class="badge green">مجانية</span>'}</h3>
        <p>${esc(m.description)}</p>
        <div class="map-meta"><span class="hint">${m.sets ? m.sets.slice(-1)[0].name + ' أغلى منطقة' : '22 دولة عربية'}</span>${action}</div></article>`;
    }).join('');
    shell(`<div class="store-head"><h1>${ART.ui('store')} المتجر — خرائط اللوح</h1>${ACC.me ? `<span class="my-pts">${ART.ui('star')} معك ${fmtN(points)} نقطة</span>` : ''}</div>
      <p class="hint">كل خريطة بتغيّر شكل اللوح وأسماء المدن. صاحب الغرفة بيختار الخريطة من اللوبي، والكل بيلعب عليها.</p>
      <div class="store-grid">${cards}</div>`);
    $$('[data-buy]').forEach((b) => {
      b.onclick = async () => {
        const m = maps.find((x) => x.id === b.dataset.buy);
        if (!(await confirmBox(`تشتري «${m.name}» بـ ${m.price} نقطة؟`, 'اشتري'))) return;
        b.disabled = true; b.classList.add('loading');
        try { const r = await api('/api/maps/buy', { id: m.id }); ACC.me.points = r.points; toast('صارت الخريطة إلك — اختارها من لوبي الغرفة', 'ok'); renderStore(); } catch (e) { toast(e.message); b.disabled = false; b.classList.remove('loading'); }
      };
    });
  }

  // ---------------------------------------------------------------- settings
  function renderSettings() {
    const me = ACC.me;
    document.title = 'الإعدادات — ثروة';
    const avatars = [...ART.AVATAR_KEYS, ...ART.PIECE_KEYS.map((k) => 'piece:' + k)];
    if (/^https:/.test(me.avatar)) avatars.unshift(me.avatar); // Google photo stays selectable
    const qs = new URLSearchParams(location.search);
    if (qs.get('glinked')) { toast('انربط حسابك بـ Google ✔', 'ok'); history.replaceState(null, '', '/settings'); }
    if (qs.get('gerr')) { toast('حساب Google هاد مربوط بحساب تاني'); history.replaceState(null, '', '/settings'); }
    shell(`<div class="settings">
      <h1>⚙️ إعدادات الحساب</h1>
      <form class="panel set-sec" id="fProfile">
        <h3>الملف الشخصي</h3>
        <div class="set-head">${avatarHTML(me.avatar, 72, me.color)}<div><b>${esc(me.displayName)}</b><div class="handle" dir="ltr">@${esc(me.username)}</div><a href="/u/${esc(me.username)}" class="hint">شوف بروفايلك ←</a></div></div>
        <label class="field"><span>الاسم الظاهر</span><input name="displayName" maxlength="24" value="${esc(me.displayName)}" required></label>
        <label class="field"><span>نبذة عنك <small id="bioCount"></small></span><textarea name="bio" maxlength="160" rows="3" placeholder="شي قصير عنك…">${esc(me.bio)}</textarea></label>
        <div class="field"><span>الصورة</span><div class="ava-grid">${avatars.map((k) => `<button type="button" class="ava-pick ${k === me.avatar ? 'on' : ''}" data-ava="${k}" title="${k}">${avatarHTML(k, 46, me.color)}</button>`).join('')}</div></div>
        <div class="field"><span>لونك باللعبة</span><div class="color-row"><button type="button" class="sw-pick ${!me.color ? 'on' : ''}" data-color="">تلقائي</button>${COLORS.map((c) => `<button type="button" class="sw-pick ${me.color === c ? 'on' : ''}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div></div>
        <div class="field"><span>قطعتك المفضّلة</span><div class="color-row"><button type="button" class="pc-pick ${!me.piece ? 'on' : ''}" data-piece="">تلقائي</button>${ART.PIECE_KEYS.map((k) => `<button type="button" class="pc-pick ${me.piece === k ? 'on' : ''}" data-piece="${k}" title="${ART.pieceLabel(k)}"><span class="tk" style="--pc:${me.color || '#00b4ff'}">${ART.piece(k)}</span></button>`).join('')}</div></div>
        <div class="form-err" id="profErr"></div>
        <button class="btn gold" id="profSave">حفظ التغييرات</button>
      </form>
      <form class="panel set-sec" id="fEmail">
        <h3>📧 الإيميل ${me.email ? (me.emailVerified ? '<span class="badge green">مؤكَّد</span>' : '<span class="badge">مو مؤكَّد</span>') : ''}</h3>
        ${me.email ? '' : '<div class="nudge">ضيف إيميلك لحماية حسابك — بيساعدك ترجع لحسابك وتربطه بـ Google.</div>'}
        <label class="field"><span>الإيميل</span><input name="email" type="email" dir="ltr" maxlength="254" value="${esc(me.email || '')}" placeholder="name@gmail.com"></label>
        ${me.hasPassword ? '<label class="field"><span>كلمة السر الحالية (للتأكيد)</span><input name="password" type="password" autocomplete="current-password" dir="ltr"></label>' : ''}
        <div class="form-err" id="emailErr"></div>
        <button class="btn">${me.email ? 'غيّر الإيميل' : 'ضيف الإيميل'}</button>
      </form>
      <form class="panel set-sec" id="fUser">
        <h3>🏷️ اسم المستخدم</h3>
        <p class="hint">رابط بروفايلك: <b dir="ltr">/u/${esc(me.username)}</b> — فيك تغيّره مرة كل 30 يوم.</p>
        <label class="field"><span>اسم المستخدم الجديد</span><input name="username" dir="ltr" maxlength="20" value="${esc(me.username)}"></label>
        <div class="form-err" id="userErr"></div>
        <button class="btn">غيّر اسم المستخدم</button>
      </form>
      <section class="panel set-sec">
        <h3>${G_LOGO} حساب Google</h3>
        ${me.google ? '<p class="g-linked">مربوط بـ Google ✓ — فيك تدخل بكبسة وحدة.</p>'
    : ACC.site.googleEnabled ? '<p class="hint">اربط حسابك بـ Google لتدخل بكبسة وحدة بدون كلمة سر.</p><a class="btn-google" href="/api/auth/google/start?link=1">' + G_LOGO + '<span>ربط حساب Google</span></a>'
      : '<p class="hint">الدخول بـ Google مو مفعّل هلق.</p>'}
      </section>
      <form class="panel set-sec" id="fPass">
        <h3>🔑 ${me.hasPassword ? 'تغيير كلمة السر' : 'حط كلمة سر'}</h3>
        ${me.hasPassword ? '<label class="field"><span>كلمة السر الحالية</span><input name="current" type="password" autocomplete="current-password" dir="ltr"></label>'
    : '<p class="hint">حسابك بيدخل بـ Google بس. إذا حطيت كلمة سر، بتقدر تدخل كمان بالإيميل أو اسم المستخدم.</p>'}
        <label class="field"><span>كلمة السر الجديدة</span><input name="next" type="password" autocomplete="new-password" dir="ltr"><small class="fhint">6 أحرف على الأقل</small></label>
        <div class="form-err" id="passErr"></div>
        <button class="btn">${me.hasPassword ? 'غيّر كلمة السر' : 'حط كلمة السر'}</button>
      </form>
      <form class="panel set-sec danger-zone" id="fDel">
        <h3>🗑️ حذف الحساب</h3>
        <p class="hint">رح ينمسح حسابك ونقاطك نهائياً. ما في رجعة.</p>
        <label class="field"><span>${me.hasPassword ? 'اكتب كلمة السر للتأكيد' : 'اكتب اسم المستخدم تبعك للتأكيد'}</span><input name="password" type="${me.hasPassword ? 'password' : 'text'}" dir="ltr"></label>
        <div class="form-err" id="delErr"></div>
        <button class="btn danger">احذف حسابي نهائياً</button>
      </form>
    </div>`);
    const fp = $('#fProfile'), sel = { avatar: me.avatar, color: me.color || null, piece: me.piece || null };
    const count = () => { $('#bioCount').textContent = `(${[...fp.bio.value].length}/160)`; };
    fp.bio.oninput = count; count();
    const pick = (attr, key) => $$(`[data-${attr}]`, fp).forEach((b) => {
      b.onclick = () => { sel[key] = b.dataset[attr] || null; $$(`[data-${attr}]`, fp).forEach((x) => x.classList.toggle('on', x === b)); };
    });
    pick('ava', 'avatar'); pick('color', 'color'); pick('piece', 'piece');
    const busy = (btn, on, text) => { btn.disabled = on; if (text) btn.textContent = text; };
    const showErr = (id, msg) => { const e = $(id); e.textContent = msg; e.classList.toggle('show', !!msg); };
    fp.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#profSave'); showErr('#profErr', '');
      if (!fp.displayName.value.trim()) { showErr('#profErr', 'الاسم ما فيه يكون فاضي'); return; }
      busy(btn, true, 'عم احفظ…');
      try {
        const r = await api('/api/me/update', { displayName: fp.displayName.value, bio: fp.bio.value, avatar: sel.avatar, color: sel.color, piece: sel.piece });
        ACC.me = r.user; toast('انحفظ ✔', 'ok'); renderSettings();
      } catch (er) { showErr('#profErr', er.message); busy(btn, false, 'حفظ التغييرات'); }
    };
    $('#fPass').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; showErr('#passErr', '');
      if (f.next.value.length < 6) { showErr('#passErr', 'كلمة السر الجديدة لازم تكون 6 أحرف على الأقل'); return; }
      try {
        await api('/api/me/password', { current: f.current ? f.current.value : '', next: f.next.value });
        toast(me.hasPassword ? 'تغيّرت كلمة السر ✔' : 'صار عندك كلمة سر ✔', 'ok');
        ACC.me = (await api('/api/auth/me')).user; renderSettings();
      } catch (er) { showErr('#passErr', er.message); }
    };
    $('#fEmail').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, email = f.email.value.trim().toLowerCase(); showErr('#emailErr', '');
      if (!EMAIL_RE.test(email)) { showErr('#emailErr', 'الإيميل مو صحيح — مثلاً: name@gmail.com'); return; }
      try { const r = await api('/api/me/update', { email, password: f.password ? f.password.value : '' }); ACC.me = r.user; toast('انحفظ الإيميل ✔', 'ok'); renderSettings(); } catch (er) { showErr('#emailErr', er.message); }
    };
    $('#fUser').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.username.value.trim().toLowerCase(); showErr('#userErr', '');
      if (!USER_RE.test(v)) { showErr('#userErr', 'اسم المستخدم لازم يكون 3–20 حرف إنكليزي صغير أو رقم أو _'); return; }
      if (!(await confirmBox(`رابط بروفايلك رح يصير /u/${v} والرابط القديم بيبطل. متأكد؟`, 'غيّر'))) return;
      try { const r = await api('/api/me/username', { username: v }); ACC.me = r.user; toast('تغيّر اسم المستخدم ✔', 'ok'); renderSettings(); } catch (er) { showErr('#userErr', er.message); }
    };
    $('#fDel').onsubmit = async (e) => {
      e.preventDefault();
      showErr('#delErr', '');
      if (!(await confirmBox('أكيد بدك تحذف حسابك نهائياً؟'))) return;
      try { await api('/api/me/delete', { password: e.target.password.value }); location.href = '/'; } catch (er) { showErr('#delErr', er.message); }
    };
  }

  // ---------------------------------------------------------------- small modal helpers
  function modal(title, body) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-back" data-back><div class="modal"><div class="modal-head">${title}<button class="x-btn close" data-x>✕</button></div><div class="modal-body">${body}</div></div></div>`;
    const close = () => { root.innerHTML = ''; };
    root.querySelector('[data-x]').onclick = close;
    root.querySelector('[data-back]').onclick = (e) => { if (e.target.hasAttribute('data-back')) close(); };
    return { root, close };
  }
  function confirmBox(text, yes = 'أكيد') {
    return new Promise((resolve) => {
      const m = modal('تأكيد', `<div>${esc(text)}</div><div class="row"><button class="btn danger" data-y>${esc(yes)}</button><button class="btn" data-n>لا</button></div>`);
      m.root.querySelector('[data-y]').onclick = () => { m.close(); resolve(true); };
      m.root.querySelector('[data-n]').onclick = () => { m.close(); resolve(false); };
    });
  }

  // ---------------------------------------------------------------- admin dashboard
  const ADMIN_TABS = [['overview', '📊 نظرة عامة'], ['users', '👥 المستخدمين'], ['rooms', '🎲 الغرف'], ['settings', '⚙️ الإعدادات'],
    ['ads', '📣 الإعلانات'], ['maps', '🗺️ الخرائط'], ['games', '🕹️ الألعاب'], ['audit', '📜 السجل']];
  let adminTab = 'overview';
  function renderAdmin() {
    document.title = 'لوحة التحكم — ثروة';
    shell(`<div class="admin">
      <section class="adm-body" id="admBody"><div class="hint">عم حمّل…</div></section>
      <nav class="adm-nav panel">${ADMIN_TABS.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === adminTab ? 'on' : ''}">${t}</button>`).join('')}</nav>
    </div>`, 'wide');
    $$('[data-tab]').forEach((b) => { b.onclick = () => { adminTab = b.dataset.tab; $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); loadTab(); }; });
    loadTab();
  }
  async function loadTab() {
    const body = $('#admBody');
    body.innerHTML = '<div class="hint">عم حمّل…</div>';
    try { await TABS[adminTab](body); } catch (e) { body.innerHTML = `<div class="form-err show">${esc(e.message)}</div>`; }
  }
  const TABS = {
    async overview(body) {
      const d = await api('/api/admin/overview');
      const max = Math.max(1, ...d.perDay.map((x) => x.n));
      const W = 560, H = 160, bw = W / d.perDay.length;
      const bars = d.perDay.map((x, i) => {
        const h = Math.round((x.n / max) * (H - 30));
        return `<g><rect x="${i * bw + 4}" y="${H - 18 - h}" width="${bw - 8}" height="${Math.max(h, 1)}" rx="4" fill="url(#gBar)"><title>${x.day}: ${x.n}</title></rect>
          <text x="${i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${x.day.slice(8)}</text>${x.n ? `<text x="${i * bw + bw / 2}" y="${H - 22 - h}" text-anchor="middle" class="v">${x.n}</text>` : ''}</g>`;
      }).join('');
      body.innerHTML = `<h2>📊 نظرة عامة</h2>
        <div class="cards">
          <div class="card"><span>المستخدمين</span><b>${fmtN(d.users)}</b></div>
          <div class="card"><span>متصلين هلق</span><b>${fmtN(d.online)}</b></div>
          <div class="card"><span>غرف شغالة</span><b>${fmtN(d.roomsLive)}</b><small>${d.roomsPlaying} عم يلعبوا</small></div>
          <div class="card"><span>ألعاب اليوم</span><b>${fmtN(d.gamesToday)}</b></div>
          <div class="card"><span>كل الألعاب</span><b>${fmtN(d.gamesTotal)}</b></div>
        </div>
        <div class="panel"><div class="lbl">الألعاب آخر 14 يوم <small>التخزين: ${d.backend === 'postgres' ? 'Postgres ✔' : 'ملف محلي (للتجربة)'}</small></div>
          <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="الألعاب باليوم"><defs><linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fe2ff"/><stop offset="1" stop-color="#00b4ff" stop-opacity=".5"/></linearGradient></defs>${bars}</svg></div>`;
    },
    async users(body) {
      body.innerHTML = `<h2>👥 المستخدمين</h2><div class="adm-tools"><input id="uq" placeholder="دوّر بالاسم أو اسم المستخدم…" value="${esc(TABS.q || '')}"><span class="hint" id="uTotal"></span></div><div class="tbl-wrap" id="uTbl"></div>`;
      let t;
      $('#uq').oninput = (e) => { TABS.q = e.target.value; clearTimeout(t); t = setTimeout(draw, 250); };
      async function draw() {
        const d = await api('/api/admin/users?q=' + encodeURIComponent(TABS.q || ''));
        $('#uTotal').textContent = `${d.total} مستخدم`;
        $('#uTbl').innerHTML = `<table class="tbl"><thead><tr><th>المستخدم</th><th>الإيميل</th><th>الدور</th><th>نقاط</th><th>ألعاب</th><th>فوز</th><th>الحالة</th><th>انضم</th><th>آخر ظهور</th><th></th></tr></thead><tbody>${d.users.map((u) => `
          <tr data-id="${u.id}"><td><a href="/u/${esc(u.username)}" target="_blank" class="u-cell">${avatarHTML(u.avatar, 28, u.color)}<span><b>${esc(u.displayName)}</b><small dir="ltr">@${esc(u.username)}</small></span></a></td>
          <td dir="ltr" class="mail">${u.email ? esc(u.email) + (u.emailVerified ? ' ✔' : '') : '<span class="hint">—</span>'}${u.google ? ' <span class="badge">G</span>' : ''}</td>
          <td>${u.role === 'admin' ? '<span class="badge">🛡️ أدمن</span>' : 'مستخدم'}</td><td>⭐ ${fmtN(u.points)}</td><td>${u.games}</td><td>${u.wins}</td>
          <td>${u.banned ? '<span class="badge red">موقوف</span>' : '<span class="badge green">فعّال</span>'}</td><td>${dateAr(u.createdAt)}</td><td>${timeAgo(u.lastSeen)}</td>
          <td class="acts"><button class="btn sm" data-a="${u.banned ? 'unban' : 'ban'}">${u.banned ? 'فك الإيقاف' : 'إيقاف'}</button>
            <button class="btn sm" data-a="points">${ART.ui('star')} +/− نقاط</button>
            <button class="btn sm" data-a="${u.role === 'admin' ? 'unadmin' : 'admin'}">${ART.ui('shield')} ${u.role === 'admin' ? 'شيل لوحة التحكم' : 'أعطيه لوحة التحكم'}</button><button class="btn sm" data-a="resetPassword">كلمة سر مؤقتة</button>
            <button class="btn sm" data-a="details">تفاصيل</button><button class="btn sm" data-a="rename">غيّر اسم المستخدم</button>
            <button class="btn sm danger" data-a="delete">حذف</button></td></tr>`).join('') || '<tr><td colspan="10" class="hint">ما في نتايج</td></tr>'}</tbody></table>`;
        $$('#uTbl [data-a]').forEach((b) => { b.onclick = () => userAction(b.closest('tr').dataset.id, b.dataset.a, draw); });
      }
      await draw();
    },
    async rooms(body) {
      const list = await api('/api/admin/rooms');
      const st = { lobby: 'باللوبي', playing: 'عم يلعبوا', ended: 'خلصت' };
      body.innerHTML = `<h2>🎲 الغرف الشغالة <button class="btn sm" id="rRef">🔄 تحديث</button></h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الكود</th><th>صاحب الغرفة</th><th>اللاعبين</th><th>الحالة</th><th>الجولة</th><th>بلّشت</th><th></th></tr></thead><tbody>
        ${list.map((r) => `<tr><td dir="ltr"><b>${esc(r.code)}</b>${r.isPrivate ? ' 🔒' : ''}</td><td>${esc(r.host)}</td>
          <td>${r.players.map((p) => (p.bot ? '🤖' : p.username ? '👤' : '') + esc(p.name)).join('، ')}<small class="hint"> · ${r.watchers} متصل</small></td>
          <td>${st[r.status] || r.status}</td><td>${r.round || '—'}</td><td>${r.startedAt ? timeAgo(r.startedAt) : timeAgo(r.createdAt)}</td>
          <td class="acts"><a class="btn sm" href="/room/${esc(r.code)}" target="_blank">👀 تفرّج</a><button class="btn sm danger" data-close="${esc(r.code)}">سكّر الغرفة</button></td></tr>`).join('') || '<tr><td colspan="7" class="hint">ما في غرف هلق</td></tr>'}</tbody></table></div>`;
      $('#rRef').onclick = loadTab;
      $$('[data-close]').forEach((b) => {
        b.onclick = async () => {
          if (!(await confirmBox(`تسكير الغرفة ${b.dataset.close}؟ كل اللي فيها رح يطلعوا.`, 'سكّرها'))) return;
          try { await api('/api/admin/room', { code: b.dataset.close, action: 'close' }); toast('انسكّرت الغرفة', 'ok'); loadTab(); } catch (e) { toast(e.message); }
        };
      });
    },
    async settings(body) {
      const s = await api('/api/admin/settings');
      const sw = (name, on, label, desc) => `<div class="set-row"><div class="st"><b>${label}</b><small>${desc}</small></div><label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></label></div>`;
      body.innerHTML = `<h2>⚙️ إعدادات الموقع</h2><form class="panel set-sec" id="fSite">
        <h3>📢 إعلان أعلى الموقع</h3>
        ${sw('annOn', s.announcement.on, 'إظهار الإعلان', 'بيظهر بالصفحة الرئيسية وفوق الغرف')}
        <label class="field"><span>نص الإعلان</span><input name="annText" maxlength="300" value="${esc(s.announcement.text)}" placeholder="مثلاً: بطولة ثروة يوم الجمعة الساعة 8 🎉"></label>
        <h3>🛠️ الموقع</h3>
        ${sw('maintenance', s.maintenance, 'وضع الصيانة', 'بس الأدمن بيقدر يعمل غرف، والباقي بيشوفوا رسالة')}
        ${sw('registrationOpen', s.registrationOpen, 'التسجيل مفتوح', 'إذا سكّرته ما حدا جديد بيقدر يعمل حساب')}
        <h3>🎲 إعدادات الغرف الافتراضية</h3>
        <div class="grid3"><label class="field"><span>المبلغ الابتدائي</span><select name="startingCash">${[500, 1000, 1500, 2000, 2500, 3000].map((v) => `<option ${v === s.defaultRoom.startingCash ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>عدد اللاعبين</span><select name="maxPlayers">${[2, 3, 4, 5, 6, 7, 8].map((v) => `<option ${v === s.defaultRoom.maxPlayers ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>وقت الدور (ثانية)</span><select name="turnTimer">${[0, 60, 90, 120].map((v) => `<option value="${v}" ${v === s.defaultRoom.turnTimer ? 'selected' : ''}>${v || 'بدون'}</option>`).join('')}</select></label></div>
        <h3>⭐ النقاط</h3>
        <div class="grid3"><label class="field"><span>نقاط الفوز</span><input name="perWin" type="number" min="0" value="${s.points.perWin}" dir="ltr"></label>
          <label class="field"><span>رهان كل لعبة (بيدفعه الخسران للفايز)</span><input name="stake" type="number" min="0" value="${s.points.stake}" dir="ltr"></label>
          <label class="field"><span>نقاط المشاركة (لكل لاعب)</span><input name="perGame" type="number" min="0" value="${s.points.perGame}" dir="ltr"></label></div>
        <div class="form-err" id="siteErr"></div><button class="btn gold">حفظ الإعدادات</button></form>`;
      $('#fSite').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target, er = $('#siteErr'); er.classList.remove('show');
        try {
          await api('/api/admin/settings', {
            announcement: { on: f.annOn.checked, text: f.annText.value }, maintenance: f.maintenance.checked, registrationOpen: f.registrationOpen.checked,
            defaultRoom: { startingCash: Number(f.startingCash.value), maxPlayers: Number(f.maxPlayers.value), turnTimer: Number(f.turnTimer.value) },
            points: { perWin: Number(f.perWin.value), perGame: Number(f.perGame.value), stake: Number(f.stake.value) },
          });
          toast('انحفظت الإعدادات ✔', 'ok');
        } catch (x) { er.textContent = x.message; er.classList.add('show'); }
      };
    },
    async ads(body) {
      const s = await api('/api/admin/settings');
      const names = { home_top: 'أعلى الصفحة الرئيسية', home_bottom: 'أسفل الصفحة الرئيسية', room_side: 'جنب اللوح (بالغرفة)' };
      body.innerHTML = `<h2>📣 الإعلانات</h2><p class="hint">إعلانات الـHTML بتشتغل جوّا إطار معزول (sandbox) — ما بتقدر توصل للموقع أو لحسابات اللاعبين.</p>
        ${s.ads.map((a) => `<form class="panel set-sec ad-form" data-slot="${a.slot}">
          <h3>${names[a.slot]} <code dir="ltr">${a.slot}</code></h3>
          <div class="set-row"><div class="st"><b>مفعّل</b></div><label class="switch"><input type="checkbox" name="enabled" ${a.enabled ? 'checked' : ''}><span></span></label></div>
          <div class="seg-row"><label><input type="radio" name="type" value="image" ${a.type !== 'html' ? 'checked' : ''}> صورة + رابط</label><label><input type="radio" name="type" value="html" ${a.type === 'html' ? 'checked' : ''}> كود HTML</label></div>
          <label class="field t-image"><span>رابط الصورة</span><input name="image" dir="ltr" value="${esc(a.image)}" placeholder="https://…/banner.png"></label>
          <label class="field t-image"><span>الرابط عند الضغط</span><input name="link" dir="ltr" value="${esc(a.link)}" placeholder="https://…"></label>
          <label class="field t-html"><span>كود HTML</span><textarea name="html" rows="4" dir="ltr" maxlength="5000">${esc(a.html)}</textarea></label>
          <div class="ad-preview"></div><div class="form-err"></div><button class="btn gold">حفظ</button></form>`).join('')}`;
      $$('.ad-form').forEach((f) => {
        const sync = () => {
          const html = f.type.value === 'html';
          $$('.t-image', f).forEach((x) => { x.hidden = html; }); $$('.t-html', f).forEach((x) => { x.hidden = !html; });
          const prevSite = ACC.site; ACC.site = { ads: [{ slot: f.dataset.slot, type: f.type.value, image: f.image.value, link: f.link.value, html: f.html.value }] };
          $('.ad-preview', f).innerHTML = (html ? f.html.value : f.image.value) ? '<small class="hint">معاينة:</small>' + ACC.adHTML(f.dataset.slot) : '';
          ACC.site = prevSite;
        };
        f.oninput = sync; sync();
        f.onsubmit = async (e) => {
          e.preventDefault();
          const er = $('.form-err', f); er.classList.remove('show');
          try {
            await api('/api/admin/ad', { slot: f.dataset.slot, enabled: f.enabled.checked, type: f.type.value, image: f.image.value, link: f.link.value, html: f.html.value });
            toast('انحفظ الإعلان ✔', 'ok');
          } catch (x) { er.textContent = x.message; er.classList.add('show'); }
        };
      });
    },
    async maps(body) {
      const s = await api('/api/admin/settings');
      body.innerHTML = `<h2>🗺️ الخرائط</h2><p class="hint">الخرائط بتنباع بالمتجر بالنقاط. فيك تسكّر خريطة، تغيّر سعرها، أو تهديها لمستخدم.</p>
        ${s.maps.map((m) => `<form class="panel set-sec map-form" data-id="${m.id}"><div class="set-row" style="border:0">
          <div class="st"><b>${esc(m.name)}</b><small>${esc(m.description)}</small></div>
          ${m.id === 'classic' ? '<span class="badge green">مجانية دايماً</span>' : `<label class="switch"><input type="checkbox" name="enabled" ${m.enabled ? 'checked' : ''}><span></span></label>`}</div>
          ${m.id === 'classic' ? '' : `<div class="grid3"><label class="field"><span>السعر (نقاط)</span><input name="price" type="number" min="0" value="${m.price}" dir="ltr"></label></div><button class="btn gold">حفظ</button>`}</form>`).join('')}
        <form class="panel set-sec" id="fGrant"><h3>🎁 إهداء خريطة</h3><div class="grid3">
          <label class="field"><span>اسم المستخدم</span><input name="username" dir="ltr" placeholder="sami_99"></label>
          <label class="field"><span>الخريطة</span><select name="id">${s.maps.filter((m) => m.id !== 'classic').map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label></div>
          <div class="form-err" id="grantErr"></div><button class="btn gold">أهدِ الخريطة</button></form>`;
      $$('.map-form').forEach((f) => {
        f.onsubmit = async (e) => {
          e.preventDefault();
          try { await api('/api/admin/map', { id: f.dataset.id, enabled: f.enabled.checked, price: Number(f.price.value) }); toast('انحفظ ✔', 'ok'); } catch (x) { toast(x.message); }
        };
      });
      $('#fGrant').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target, er = $('#grantErr'); er.classList.remove('show');
        try { await api('/api/admin/grantMap', { username: f.username.value, id: f.id.value }); toast('انهدت الخريطة ✔', 'ok'); f.reset(); } catch (x) { er.textContent = x.message; er.classList.add('show'); }
      };
    },
    async games(body) {
      const s = await api('/api/admin/settings');
      body.innerHTML = `<h2>🕹️ الألعاب</h2><p class="hint">كل لعبة مفعّلة بتطلع ككرت بالصفحة الرئيسية. الألعاب الجديدة بتنضاف هون لما تجهز.</p>
        ${s.games.map((g) => `<form class="panel set-sec game-form" data-slug="${esc(g.slug)}"><div class="set-row" style="border:0">
          <div class="st"><b>${esc(g.name)}</b><small dir="ltr">${esc(g.slug)} · ${esc(g.players || '')} لاعبين</small></div>
          <label class="switch"><input type="checkbox" name="enabled" ${g.enabled ? 'checked' : ''}><span></span></label></div>
          <label class="field"><span>الاسم</span><input name="name" maxlength="40" value="${esc(g.name)}"></label>
          <label class="field"><span>الوصف</span><input name="description" maxlength="160" value="${esc(g.description || '')}"></label>
          <button class="btn gold">حفظ</button></form>`).join('')}`;
      $$('.game-form').forEach((f) => {
        f.onsubmit = async (e) => {
          e.preventDefault();
          try { await api('/api/admin/game', { slug: f.dataset.slug, enabled: f.enabled.checked, name: f.name.value, description: f.description.value }); toast('انحفظ ✔', 'ok'); } catch (x) { toast(x.message); }
        };
      });
    },
    async audit(body) {
      const list = await api('/api/admin/audit');
      const names = { ban: 'إيقاف', unban: 'فك إيقاف', admin: 'تعيين أدمن', unadmin: 'شيل أدمن', resetPassword: 'كلمة سر مؤقتة', points: 'تعديل نقاط',
        delete: 'حذف مستخدم', rename: 'تغيير اسم مستخدم', closeRoom: 'تسكير غرفة', settings: 'تعديل الإعدادات', ad: 'تعديل إعلان', game: 'تعديل لعبة', map: 'تعديل خريطة', grantMap: 'إهداء خريطة' };
      body.innerHTML = `<h2>📜 سجل الإدارة</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>الأدمن</th><th>العملية</th><th>على</th><th>تفاصيل</th></tr></thead><tbody>
        ${list.map((e) => `<tr><td>${new Date(e.at).toLocaleString('ar-SY-u-nu-latn')}</td><td dir="ltr">@${esc(e.adminName)}</td><td>${names[e.action] || esc(e.action)}</td><td dir="ltr">${esc(e.target || '—')}</td>
          <td><code dir="ltr">${e.detail ? esc(JSON.stringify(e.detail)).slice(0, 140) : ''}</code></td></tr>`).join('') || '<tr><td colspan="5" class="hint">لسا ما في شي</td></tr>'}</tbody></table></div>`;
    },
  };
  async function userAction(id, action, redraw) {
    try {
      if (action === 'details') {
        const u = await api('/api/admin/user?id=' + encodeURIComponent(id));
        modal('تفاصيل المستخدم', `<div class="u-cell">${avatarHTML(u.avatar, 48, u.color)}<span><b>${esc(u.displayName)}</b><small dir="ltr">@${esc(u.username)}</small></span></div>
          <div class="kv"><span>الإيميل</span><b dir="ltr">${u.email ? esc(u.email) : '—'}</b></div>
          <div class="kv"><span>الإيميل مؤكَّد</span><b>${u.emailVerified ? 'إي' : 'لا'}</b></div>
          <div class="kv"><span>Google</span><b>${u.google ? 'مربوط' : 'لا'}</b></div><div class="kv"><span>كلمة سر</span><b>${u.hasPassword ? 'إي' : 'لا (Google بس)'}</b></div>
          <div class="kv"><span>النقاط</span><b>${fmtN(u.points)}</b></div><div class="kv"><span>انضم</span><b>${dateAr(u.createdAt)}</b></div>`);
        return;
      }
      if (action === 'rename') {
        const m = modal('غيّر اسم المستخدم', `<p class="hint">الأدمن بيقدر يستعمل الأسماء المحجوزة (مثل serva). رابط البروفايل رح يتغيّر.</p>
          <label class="field"><span>الاسم الجديد</span><input id="rnName" dir="ltr" maxlength="20" placeholder="serva"></label><div class="form-err" id="rnErr"></div><div class="row"><button class="btn gold" id="rnGo">غيّر</button></div>`);
        $('#rnGo', m.root).onclick = async () => {
          try { await api('/api/admin/user', { id, action, username: $('#rnName', m.root).value.trim().toLowerCase() }); m.close(); toast('تغيّر اسم المستخدم ✔', 'ok'); redraw(); } catch (e) { const er = $('#rnErr', m.root); er.textContent = e.message; er.classList.add('show'); }
        };
        $('#rnName', m.root).focus();
        return;
      }
      if (action === 'points') {
        const m = modal('± تعديل النقاط', `<label class="field"><span>العدد (موجب بيزيد، سالب بينقّص)</span><input id="pAmt" type="number" dir="ltr" placeholder="مثلاً 100 أو -50"></label>
          <label class="field"><span>السبب</span><input id="pWhy" maxlength="120" placeholder="مثلاً: جائزة بطولة"></label><div class="form-err" id="pErr"></div><div class="row"><button class="btn gold" id="pGo">تطبيق</button></div>`);
        $('#pGo', m.root).onclick = async () => {
          try { await api('/api/admin/user', { id, action, amount: Number($('#pAmt', m.root).value), reason: $('#pWhy', m.root).value }); m.close(); toast('تعدّلت النقاط ✔', 'ok'); redraw(); } catch (e) { const er = $('#pErr', m.root); er.textContent = e.message; er.classList.add('show'); }
        };
        $('#pAmt', m.root).focus();
        return;
      }
      const ask = { ban: 'إيقاف هالمستخدم؟ ما رح يقدر يدخل أو يلعب.', delete: 'حذف هالمستخدم نهائياً؟', resetPassword: 'توليد كلمة سر مؤقتة؟ القديمة رح تبطل.', unadmin: 'شيل صلاحية الأدمن؟', admin: 'تعطيه صلاحية أدمن كاملة؟' }[action];
      if (ask && !(await confirmBox(ask))) return;
      const r = await api('/api/admin/user', { id, action });
      if (r.tempPassword) modal('🔑 كلمة السر المؤقتة', `<p>انسخها وابعتها للمستخدم — <b>ما رح تنعرض مرة تانية</b>:</p><div class="temp-pw" dir="ltr">${esc(r.tempPassword)}</div>`);
      else toast('تم ✔', 'ok');
      redraw();
    } catch (e) { toast(e.message); }
  }

  window.ACC = ACC;
})();
