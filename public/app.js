'use strict';
(() => {
  // ================================================================ utils
  const app = document.getElementById('app');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const sfmt = (n) => (n < 0 ? '-' : '') + fmt(Math.abs(n)); // signed: «-$300»
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };

  const S = {
    board: null, code: null, me: null, room: null, es: null, offset: 0,
    disp: {}, moveSeq: -1, rollSeq: -1, cardSeq: -1, noticeSeq: -1, queue: [], running: false,
    walked: -1, afterQ: [], held: {}, diceUntil: 0, sndAt: 0,
    chatOpen: false, chatUnread: 0, chatLastT: null,
    modal: null, trade: null, built: false, homeTimer: null, cardTimer: null,
  };
  // Tiles of the current room: city/country names come from the room's country map.
  const T = (i) => (S.tiles || S.board.tiles)[i];
  const SLOT_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
  // Current board map (theme + names). Classic = countries picked per room.
  const MAP = () => (S.maps || []).find((m) => m.id === (S.room && S.room.mapId)) || null;
  const SET = (k) => {
    const m = MAP(), c = m && m.theme && m.theme.sets && m.theme.sets[SLOT_KEYS.indexOf(k)];
    return c ? { ...S.board.sets[k], color: c } : S.board.sets[k];
  };
  function resolveTiles(map, mapId) {
    const m = mapId && mapId !== 'classic' ? (S.maps || []).find((x) => x.id === mapId) : null;
    let port = 0, util = 0;
    S.tiles = S.board.tiles.map((t) => {
      if (m && m.sets) {
        if (t.type === 'city') { const set = m.sets[SLOT_KEYS.indexOf(t.set)]; return { ...t, country: set.flag || null, countryName: set.name, name: set.cities[t.rank] }; }
        if (t.type === 'port' && m.ports) return { ...t, name: m.ports[port++] };
        if (t.type === 'util' && m.utils) return { ...t, name: m.utils[util++] };
        return t;
      }
      if (t.type !== 'city') return t;
      const code = map && map[t.set], c = code && S.board.countries[code];
      return { ...t, country: code, countryName: c ? c.name : '', name: c ? c.cities[t.rank] : '' };
    });
  }
  // Theme variables of the room's map on the room element.
  function applyTheme() {
    const room = $('.room'), m = MAP();
    if (!room) return;
    const th = (m && m.theme) || {};
    room.classList.toggle('themed', !!(m && m.id !== 'classic'));
    room.dataset.map = m ? m.id : 'classic';
    const vars = { '--tile': th.tile, '--tile2': th.tile2, '--m-line': th.line, '--m-accent': th.accent, '--m-accent2': th.accent2,
      '--m-text': th.text, '--m-board': th.boardBg, '--m-center': th.centerBg, '--m-bg': m && m.bg && m.id !== 'classic' ? `url('${m.bg}')` : null };
    for (const [k, v] of Object.entries(vars)) { if (v) room.style.setProperty(k, v); else room.style.removeProperty(k); }
  }
  // Flag of the tile's country, or a glowing emblem for maps without flags.
  function mark(t, cls) {
    if (t.country) return flag(t.country, cls);
    return `<span class="flag emblem ${cls}" style="--ec:${SET(t.set).color}"><i></i></span>`;
  }
  const flag = (code, cls = '') => `<span class="flag ${cls}">${window.flagSVG(code)}</span>`;
  // Official Serva logo (resized copy of the original, never redrawn).
  const SERVA_URL = 'https://serva-s.com';
  const BY_SERVA = `<a class="by-serva" href="${SERVA_URL}" target="_blank" rel="noopener" title="serva-s.com"><img src="/brand/serva-logo-160.webp" alt="Serva" width="40" height="40"><span>لعبة من <b>Serva</b></span></a>`;
  const meP = (st = S.room) => (st && S.me ? st.players.find((p) => p.id === S.me.pid) : null);
  const isHost = (st = S.room) => !!(S.me && st && st.hostId === S.me.pid);
  const nowSrv = () => Date.now() + S.offset;

  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    let j = {};
    try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) { const e = new Error(j.error || 'صار خطأ، جرّب مرة تانية'); e.status = r.status; throw e; }
    return j;
  }
  function act(type, data = {}) {
    if (!S.me) return Promise.resolve();
    return api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type, data }).catch((e) => toast(e.message));
  }
  function toast(msg, kind = 'err') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    if (kind === 'err') FX.Sound.play('error');
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }
  const credsKey = (c) => 'tharwa_room_' + c;
  function getCreds(code) { try { return JSON.parse(store.get(credsKey(code)) || 'null'); } catch (e) { return null; } }
  function nickname() { return (ACC.me && ACC.me.displayName) || ($('#nick') && $('#nick').value.trim()) || store.get('tharwa_name') || ''; }
  // Name field: locked to the account name when logged in.
  const nickField = () => (ACC.me
    ? `<div class="nick-acc">${ACC.avatarHTML(ACC.me.avatar, 34, ACC.me.color)}<input id="nick" value="${esc(ACC.me.displayName)}" readonly title="من حسابك — بتغيّره من الإعدادات"><small>من حسابك</small></div>`
    : `<input id="nick" maxlength="16" placeholder="اسمك باللعبة…" value="${esc(store.get('tharwa_name') || '')}">`);

  // ================================================================ boot
  async function boot() {
    ART.autoIconize(); // every emoji in the UI becomes a matching SVG icon
    try { [S.board, { maps: S.maps }] = await Promise.all([api('/api/board'), api('/api/maps'), ACC.load()]); } catch (e) { app.innerHTML = '<div class="home"><div class="hint">ما قدرت أوصل للسيرفر</div></div>'; return; }
    if (ACC.route(location.pathname.replace(/\/$/, '') || '/') !== false) return; // login, profile, settings, admin
    const m = location.pathname.match(/^\/room\/([a-z0-9]{5})\/?$/i);
    if (m) { S.code = m[1].toLowerCase(); enterRoom(); } else renderHome();
  }

  // ================================================================ home
  // One card per enabled game (from the admin «الألعاب» registry). «ثروة» leads to the play card below.
  function gamesHTML() {
    const games = ACC.site.games || [];
    if (!games.length) return '';
    return `<section class="games"><h3>🕹️ الألعاب</h3><div class="game-cards">${games.map((g) => `<button type="button" class="game-card" data-game="${esc(g.slug)}">
      <span class="gc-art">${g.slug === 'tharwa' ? `<span class="gc-logo">ثروة<span>.</span></span>` : '🎮'}</span>
      <b>${esc(g.name)}</b><small>${esc(g.description || '')}</small><span class="gc-meta">👥 ${esc(g.players || '')} لاعبين${g.live ? ` · 🟢 ${g.live} عم يلعبوا هلق` : ''}</span><span class="btn sm gold">العب</span></button>`).join('')}</div></section>`;
  }
  function renderHome() {
    document.title = 'ثروة — لعبة المدن والعقارات';
    const orbit = ['sy', 'sa', 'jo', 'lb', 'eg', 'iq', 'ps', 'ae', 'ma', 'qa', 'kw', 'dz'];
    const features = [
      ['port', '22 دولة عربية بأعلامها', 'سوريا والأردن والعراق دايماً عاللوح، والباقي 5 دول عربية بتختارها'],
      ['gavel', 'مزادات وقروض', 'زاود، بيع عقارك بالمزاد، أو أقرض صاحبك بفايدة'],
      ['chest', 'بطاقات حظ وخزنة', 'بطاقات بتقلب اللعبة بلحظة'],
      ['trophy', 'آخر واحد بيربح', 'عمّر فنادق وخلّي الكل يفلس'],
    ];
    app.innerHTML = `
    ${ACC.headerHTML()}
    <div class="home">
      <button class="icon-btn home-snd" id="sndBtn" title="الصوت">${FX.Sound.on ? '🔊' : '🔇'}</button>
      ${ACC.adHTML('home_top')}
      <div class="hero">
        <div class="orbit">
          <div class="orbit-ring">${orbit.map((c, k) => `<span class="orb" style="--a:${(k * 360) / orbit.length}deg">${flag(c, 'lg')}</span>`).join('')}</div>
          <div class="dice3 hero-dice" id="heroDice" title="ارمي!">${FX.diceHTML()}</div>
        </div>
        <div class="logo">ثروة<span>.</span></div>
        <div class="tagline">اشترِ المدن العربية، عمّر الفنادق، وخلّي منافسينك يفلسوا</div>
        ${BY_SERVA}
        <div class="pieces-row">${ART.PIECE_KEYS.map((k, i) => `<span class="tk" style="--pc:${['#f5c04a', '#38d4c0', '#f0585e', '#a78bfa', '#5ad06b', '#f472b6', '#4f9df7', '#fb923c'][i]};--d:${i * 0.12}s">${ART.piece(k)}</span>`).join('')}</div>
      </div>
      <div class="features">${features.map(([ic, t, d]) => `<div class="feature"><span class="f-icon">${ART.icon(ic)}</span><b>${t}</b><small>${d}</small></div>`).join('')}</div>
      ${ACC.site.maintenance ? '<div class="announce warn">🛠️ الموقع بالصيانة هلق — ما فيك تعمل غرف جديدة، جرّب بعد شوي.</div>' : ''}
      ${gamesHTML()}
      ${ACC.me ? `<a class="panel my-card" href="/u/${esc(ACC.me.username)}">${ACC.avatarHTML(ACC.me.avatar, 48, ACC.me.color)}<div><b>حسابي — ${esc(ACC.me.displayName)}</b><small dir="ltr">@${esc(ACC.me.username)}</small></div>
        <div class="my-stats"><span>⭐ <b>${ACC.me.points}</b> نقطة</span><span>🏆 <b>${ACC.me.wins}</b> فوز</span><span>🎲 <b>${ACC.me.games}</b> لعبة</span></div></a>` : ''}
      <div class="home-card" id="playCard">
        ${nickField()}
        <button class="btn gold big" id="quickBtn">🎲 العب الآن</button>
        <button class="btn" id="createBtn">🔒 إنشاء غرفة خاصة</button>
        <div class="join-code"><input id="codeIn" maxlength="5" placeholder="عندك كود غرفة؟" dir="ltr"><button class="btn" id="joinBtn">انضم</button></div>
      </div>
      <div class="home-grid">
        <div class="panel"><h3>غرف مفتوحة</h3><div id="roomList"><div class="hint">عم دوّر…</div></div></div>
        <div class="panel"><h3>كيف تلعب</h3>
          <ul class="howto">
            <li>كل لاعب بيبلّش بمبلغ بيحدده صاحب الغرفة (من $500 لـ $3000).</li>
            <li>ارمي النردين وامشِ — الدبل بيعطيك دور كمان.</li>
            <li>اشترِ المدن والموانئ والشركات، واللي بيوقف عندك بيدفعلك إيجار.</li>
            <li>جمّع كل مدن الدولة لتعمّر بيوت وفنادق ويصير الإيجار نار.</li>
            <li>بطاقات «حظ» و«خزنة» ممكن تعطيك مصاري أو تاخد منك أو تنقلك.</li>
            <li>🤝 تبادل عقارات ومصاري، 💰 أقرض أو استلف من اللاعبين بفايدة.</li>
            <li>🏦 ارهن عقاراتك للبنك، أو 🔨 بيعها بالمزاد لأعلى سعر.</li>
            <li>🌍 اللوح كله دول عربية: سوريا والأردن والعراق دايماً موجودين، والباقي 5 دول بيختارهن صاحب الغرفة من الـ22 دولة عربية.</li>
            <li>آخر واحد بيضل بدون إفلاس هو الفائز.</li>
          </ul>
        </div>
      </div>
      ${ACC.adHTML('home_bottom')}
    </div>`;
    ACC.bindHeader();
    $$('[data-game]').forEach((b) => { b.onclick = () => { $('#playCard').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#quickBtn').focus(); }; });
    const go = async (path, extra = {}) => {
      const name = nickname();
      if (!name) { toast('اكتب اسمك أول'); $('#nick').focus(); return; }
      store.set('tharwa_name', name);
      try {
        const r = await api(path, { name, ...extra });
        store.set(credsKey(r.code), JSON.stringify({ pid: r.pid, token: r.token }));
        location.href = '/room/' + r.code;
      } catch (e) { toast(e.message); }
    };
    const heroRoll = () => FX.setDice($('#heroDice'), [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)], true);
    FX.setDice($('#heroDice'), [6, 6], false);
    setTimeout(heroRoll, 300);
    $('#heroDice').onclick = () => { heroRoll(); FX.Sound.play('dice'); };
    $('#sndBtn').onclick = () => { $('#sndBtn').textContent = FX.Sound.toggle() ? '🔊' : '🔇'; };
    $('#quickBtn').onclick = () => go('/api/quick');
    $('#createBtn').onclick = () => go('/api/create', { isPrivate: true });
    $('#joinBtn').onclick = () => {
      const c = $('#codeIn').value.trim().toLowerCase();
      if (!/^[a-z0-9]{5}$/.test(c)) { toast('الكود لازم يكون 5 حروف'); return; }
      store.set('tharwa_name', nickname());
      location.href = '/room/' + c;
    };
    $('#roomList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-room]');
      if (!b) return;
      store.set('tharwa_name', nickname());
      location.href = '/room/' + b.dataset.room;
    });
    const refresh = async () => {
      try {
        const list = await api('/api/rooms');
        $('#roomList').innerHTML = list.length
          ? list.map((r) => `<div class="room-item"><div><b>غرفة ${esc(r.host)}</b><br><small>${r.count}/${r.max} لاعبين · يبلّش بـ ${fmt(r.cash)}</small></div><button class="btn sm gold" data-room="${esc(r.code)}">ادخل</button></div>`).join('')
          : '<div class="hint">ما في غرف مفتوحة هلق — اضغط «العب الآن» لتعمل وحدة.</div>';
      } catch (e) { /* offline */ }
    };
    refresh();
    S.homeTimer = setInterval(refresh, 4000);
  }

  // ================================================================ joining a room
  function renderGone() {
    if (S.es) S.es.close();
    app.innerHTML = `<div class="home"><div class="hero"><div class="logo">ثروة<span>.</span></div>${BY_SERVA}</div>
      <div class="home-card panel" style="text-align:center"><b>الغرفة مو موجودة أو انتهت</b><a class="btn gold" href="/">ارجع للصفحة الرئيسية</a></div></div>`;
  }
  async function enterRoom() {
    let info;
    S.me = getCreds(S.code);
    try { info = await api(`/api/room?code=${S.code}&pid=${S.me ? S.me.pid : ''}`); } catch (e) { renderGone(); return; }
    if (S.me && !info.member) { store.del(credsKey(S.code)); S.me = null; }
    if (!S.me && info.status === 'lobby' && info.count < info.max) { renderJoin(info); return; }
    connect();
  }
  function renderJoin(info) {
    app.innerHTML = `<div class="home"><div class="hero"><div class="logo">ثروة<span>.</span></div>
      <div class="tagline">انعزمت على غرفة <b dir="ltr">${esc(S.code)}</b> — ${info.count}/${info.max} لاعبين</div>${BY_SERVA}</div>
      <div class="home-card">${nickField()}
      <button class="btn gold big" id="enterBtn">ادخل الغرفة</button>
      <button class="btn ghost" id="watchBtn">بس بدي اتفرّج</button></div></div>`;
    const join = async () => {
      const name = nickname();
      if (!name) { toast('اكتب اسمك أول'); return; }
      store.set('tharwa_name', name);
      try {
        const r = await api('/api/join', { code: S.code, name });
        S.me = { pid: r.pid, token: r.token };
        store.set(credsKey(S.code), JSON.stringify(S.me));
        connect();
      } catch (e) { toast(e.message); }
    };
    $('#enterBtn').onclick = join;
    $('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    $('#watchBtn').onclick = () => connect();
    $('#nick').focus();
  }
  function connect() {
    clearInterval(S.homeTimer);
    if (S.es) S.es.close();
    const q = new URLSearchParams({ code: S.code });
    if (S.me) { q.set('pid', S.me.pid); q.set('token', S.me.token); }
    S.es = new EventSource('/api/events?' + q.toString());
    S.es.addEventListener('state', (ev) => {
      const st = JSON.parse(ev.data);
      S.offset = st.now - Date.now();
      onState(st);
    });
    S.es.addEventListener('gone', () => renderGone());
    S.es.onerror = async () => {
      if (S.es.readyState === 2) {
        try { await api('/api/room?code=' + S.code); setTimeout(connect, 1500); } catch (e) { renderGone(); }
      }
    };
  }

  // ================================================================ state
  function onState(st) {
    const prev = S.room;
    S.room = st;
    if (S.me && !meP(st)) {
      store.del(credsKey(S.code)); S.me = null;
      if (prev) toast('صرت متفرّج بهالغرفة', 'ok');
    }
    const mapKey = (st.mapId || 'classic') + JSON.stringify(st.map || {});
    if (mapKey !== S.mapKey) {
      S.mapKey = mapKey;
      resolveTiles(st.map, st.mapId);
      if (S.built) {
        $$('#board .tile').forEach((el) => {
          const i = Number(el.dataset.i), t = T(i);
          if (t.type === 'city' || t.type === 'port' || t.type === 'util') { el.innerHTML = tileInner(t, i); el.title = t.name + (t.countryName ? ' — ' + t.countryName : ''); delete el.dataset.fit; }
          const bld = el.querySelector('.bld'); if (bld) delete bld.dataset.h;
          const bown = el.querySelector('.bown'); if (bown) delete bown.dataset.k;
        });
        fitNames();
      }
    }
    if (!S.built) buildLayout();
    applyTheme();
    fitNames(); // owner bands / houses change the room a name has
    document.title = (st.status === 'playing' ? '● ' : '') + 'ثروة — غرفة ' + st.code;
    updateDice(st); // first: the walk waits for the dice to land
    processMoves(st);
    holdMoney(prev, st);
    updateBoard(st);
    updateCard(st);
    updateNotice(st);
    updateBuildMode(st);
    updateCenter(st);
    updateOffers(st);
    updateSide(st);
    updateChat(st);
    if (S.modal && S.modal.kind === 'tile') renderModal();
    if (S.modal && S.modal.kind === 'trade' && !meP(st)) closeModal();
    if (S.modal && S.modal.kind === 'sellmany' && st.game && st.game.auction) closeModal();
    if (S.modal && S.modal.kind === 'debtbuy') { if (!debtorNow(st)) closeModal(); else if (!document.activeElement || document.activeElement.id !== 'dbPrice') renderDebtBuy(); }
    if (S.modal && S.modal.kind === 'debtgive' && !debtorNow(st)) closeModal();
    effects(prev, st);
  }

  // ---------------------------------------------------------------- effects (diff old/new state)
  function countUp(el, from, to) {
    const t0 = performance.now(), dur = 650;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    })(t0);
  }
  function flashTile(i) {
    const tile = document.querySelector(`#board .tile[data-i="${i}"]`);
    if (!tile) return;
    tile.classList.remove('flash'); void tile.offsetWidth; tile.classList.add('flash');
  }
  function banner(text) {
    const b = $('#cBanner');
    if (!b) return;
    b.innerHTML = `<div class="banner">${text}</div>`;
    clearTimeout(S.bannerTimer);
    S.bannerTimer = setTimeout(() => { b.innerHTML = ''; }, 1700);
  }
  // One money change on screen: floating «+$200 / −$140» over the row and the token, the row counts up.
  function moneyFx(p, from, to, st) {
    const d = to - from;
    if (!d) return;
    const kind = d > 0 ? 'plus' : 'minus', txt = (d > 0 ? '+' : '−') + fmt(Math.abs(d));
    const m = document.querySelector(`[data-prow="${p.id}"] .pmoney`);
    if (m) { const r = m.getBoundingClientRect(); FX.floatText(r.left + r.width / 2, r.top, txt, kind); if (!owedBy(st, p)) countUp(m, from, to); }
    const tok = document.getElementById('tok-' + p.id);
    if (tok && !document.hidden) { const r = tok.getBoundingClientRect(); FX.floatText(r.left + r.width / 2, r.top - 6, txt, kind + ' small'); }
    // my own money: a coin / payment sound, unless a rent/tax notice just played its own
    // (checked a moment later: the notice for the same walk is shown right after the money moves)
    if (S.me && p.id === S.me.pid) setTimeout(() => { if (Date.now() - S.sndAt > 900) FX.Sound.play(d > 0 ? 'receive' : 'pay'); }, 40);
  }
  // Money that changed together with a walk (rent, tax, cards, salary) stays at its old value on screen
  // until the piece has arrived; then it moves, with the notice and the flying cash.
  function holdMoney(prev, st) {
    const g = st.game;
    if (!prev || !prev.game || !g || st.status !== 'playing' || !(g.moveSeq > S.walked)) return;
    let any = false;
    for (const p of st.players) {
      const o = prev.players.find((x) => x.id === p.id);
      if (o && o.money !== p.money && !(p.id in S.held)) { S.held[p.id] = o.money; any = true; }
    }
    if (any) afterWalk(g.moveSeq, releaseMoney);
  }
  function releaseMoney() {
    const held = S.held, st = S.room;
    S.held = {};
    if (!st || !Object.keys(held).length) return;
    updateSide(st);
    for (const p of st.players) if (p.id in held) moneyFx(p, held[p.id], p.money || 0, st);
  }
  function effects(prev, st) {
    if (!prev || !prev.game || !st.game || prev.status === 'lobby') return;
    const pg = prev.game, g = st.game, me = S.me ? S.me.pid : null;
    for (const p of st.players) {
      const o = prev.players.find((x) => x.id === p.id);
      if (!o) continue;
      if (!(p.id in S.held)) moneyFx(p, o.money || 0, p.money || 0, st);
      if (p.inJail && !o.inJail) afterWalk(g.moveSeq, () => FX.Sound.play('jail'));
      if (p.bankrupt && !o.bankrupt && p.id === me) FX.Sound.play('lose');
    }
    for (const [k, pr] of Object.entries(g.props)) {
      const o = pg.props[k];
      if (!o || o.owner !== pr.owner) { flashTile(k); FX.Sound.play('buy'); }
      else if (pr.houses > o.houses) {
        flashTile(k); popBuilding(k);
        if (!(S.lastBuild && S.lastBuild.idx === Number(k) && Date.now() - S.lastBuild.t < 2500)) FX.Sound.play(pr.houses === 5 ? 'hotel' : 'build');
      } else if (pr.mortgaged !== o.mortgaged) FX.Sound.play('mortgage');
    }
    if (g.auction && pg.auction && g.auction.bid !== pg.auction.bid) FX.Sound.play('bid');
    if (me) tradeEffects(prev, st, me);
    if (st.status === 'playing' && me && g.order[g.turn] === me && pg.order[pg.turn] !== me) {
      afterWalk(g.moveSeq, () => { banner('دورك! 🎲'); FX.Sound.play('turn'); });
    }
    if (st.status === 'ended' && prev.status !== 'ended') {
      FX.confetti();
      FX.Sound.play(!me || g.winner === me ? 'win' : 'lose');
    }
  }

  // ---------------------------------------------------------------- after the walk
  // Things that belong to a move (rent, tax, a card, the money) wait until that walk has been animated.
  function afterWalk(seq, fn, pause = 0) {
    if (seq == null || seq <= S.walked) { fn(); return; }
    S.afterQ.push({ seq, fn, pause });
  }
  // Marks moves up to `seq` as shown and runs what waited for them. Returns how long the board should pause
  // before the next move (a card is read before the card's own move starts).
  function walkDone(seq) {
    S.walked = Math.max(S.walked, seq);
    const ready = S.afterQ.filter((t) => t.seq <= S.walked);
    S.afterQ = S.afterQ.filter((t) => t.seq > S.walked);
    let pause = 0;
    for (const t of ready) { try { t.fn(); } catch (e) { console.error(e); } pause = Math.max(pause, t.pause || 0); }
    return pause;
  }

  // ================================================================ layout
  function buildLayout() {
    S.built = true;
    app.innerHTML = `
    <div class="room">
      <aside class="col col-b" id="sideCol">
        <div id="sideB" class="side-inner"></div>
        <div class="panel share">
          <div class="lbl">شارك الغرفة مع أصحابك</div>
          <div class="share-row"><input readonly id="shareUrl" value="${esc(location.origin + '/room/' + S.code)}"><button class="btn sm" id="copyBtn">نسخ</button></div>
          <div class="room-code">كود الغرفة: <b>${esc(S.code)}</b></div>
          <div id="netLinks" class="net-links"></div>
        </div>
        ${ACC.adHTML('room_side')}
      </aside>
      <main class="col col-board"><div class="board" id="board"></div></main>
      <aside class="col col-a">
        <div class="top-row"><a class="mini-logo" href="/" title="الصفحة الرئيسية">ثروة<span>.</span></a>
          <a class="serva-chip" href="${SERVA_URL}" target="_blank" rel="noopener" title="لعبة من Serva"><img src="/brand/serva-logo-160.webp" alt="Serva" width="34" height="34"></a>
          <button class="icon-btn" id="sndBtn" title="الصوت">${FX.Sound.on ? '🔊' : '🔇'}</button>
          ${ACC.me ? `<a class="acc-chip" href="/u/${esc(ACC.me.username)}" target="_blank" title="${esc(ACC.me.displayName)} — بروفايلي">${ACC.avatarHTML(ACC.me.avatar, 38, ACC.me.color)}</a>`
    : '<a class="icon-btn acc-in" href="/login" target="_blank" title="تسجيل الدخول">👤</a>'}</div>
      </aside>
    </div>
    ${ACC.site.announcement ? `<div class="announce room-ann" id="roomAnn">📢 ${esc(ACC.site.announcement)}<button class="x-btn" type="button" onclick="this.parentNode.remove()">✕</button></div>` : ''}
    <button class="chat-fab" id="chatFab" type="button" title="الدردشة" aria-label="الدردشة" aria-expanded="false">💬<span class="chat-badge" id="chatBadge" hidden>0</span></button>
    <div class="chat-drawer" id="chatDrawer" role="dialog" aria-label="الدردشة" aria-hidden="true">
      <div class="chat-head"><b>💬 الدردشة</b><button class="x-btn" id="chatClose" type="button" title="سكّر">✕</button></div>
      <div class="chat-list" id="chatList"></div>
      <form class="chat-form" id="chatForm"><input id="chatIn" maxlength="200" placeholder="اكتب رسالة…" autocomplete="off"><button class="btn sm">إرسال</button></form>
    </div>`;
    buildBoard();
    $('#sndBtn').onclick = () => { $('#sndBtn').textContent = FX.Sound.toggle() ? '🔊' : '🔇'; };
    loadNetLinks();
    $('#copyBtn').onclick = async () => {
      try { await navigator.clipboard.writeText($('#shareUrl').value); toast('انتسخ الرابط ✔', 'ok'); }
      catch (e) { $('#shareUrl').select(); document.execCommand('copy'); toast('انتسخ الرابط ✔', 'ok'); }
    };
    $('#chatForm').onsubmit = (e) => {
      e.preventDefault();
      const v = $('#chatIn').value.trim();
      if (!v) return;
      if (!S.me) { toast('المتفرّج ما بيقدر يكتب'); return; }
      $('#chatIn').value = '';
      act('chat', { text: v });
    };
    $('#chatFab').onclick = () => toggleChat();
    $('#chatClose').onclick = () => toggleChat(false);
    $('#sideB').addEventListener('click', onSideClick);
    $('#sideB').addEventListener('change', onSideChange);
    window.addEventListener('resize', () => { layoutTokens(); dockChat(); });
    // The landscape board can change size without a window resize (e.g. emulated viewports, side panel growth).
    if (window.ResizeObserver) new ResizeObserver(() => { layoutTokens(); fitNames(); }).observe($('#board'));
    dockChat();
    fitNames();
    // a web font that arrives late changes every name's width: fit all tiles again
    const refit = () => { $$('#board .tile').forEach((t) => { delete t.dataset.fit; }); fitNames(); };
    if (document.fonts) { document.fonts.ready.then(refit); document.fonts.addEventListener('loadingdone', refit); }
    setInterval(tick, 250);
  }

  // A "localhost" link only works on this PC: offer the Radmin VPN / same Wi-Fi links instead.
  async function loadNetLinks() {
    const box = $('#netLinks');
    if (!box || !/^(localhost|127\.|\[?::1)/.test(location.hostname)) return;
    let list = [];
    try { list = await api('/api/net'); } catch (e) { return; }
    const usable = list.filter((n) => n.kind !== 'vpn');
    if (!usable.length) return;
    const label = (n) => (n.kind === 'radmin' ? '🎮 لأصحابك على Radmin VPN' : '🏠 لأصحابك على نفس الواي فاي');
    box.innerHTML = `<div class="hint" style="text-align:start;margin-top:8px">رابط localhost بيشتغل عندك بس. ابعت لأصحابك واحد من هدول:</div>
      ${usable.map((n, k) => `<div class="net-row"><small>${label(n)}</small><div class="share-row"><input readonly value="${esc(n.url + '/room/' + S.code)}"><button class="btn sm" data-net="${k}">نسخ</button></div></div>`).join('')}`;
    $('#shareUrl').value = usable[0].url + '/room/' + S.code;
    $$('[data-net]', box).forEach((b) => {
      b.onclick = async () => {
        const v = usable[Number(b.dataset.net)].url + '/room/' + S.code;
        try { await navigator.clipboard.writeText(v); } catch (e) { const i = b.previousElementSibling; i.select(); document.execCommand('copy'); }
        toast('انتسخ الرابط ✔', 'ok');
      };
    });
  }

  // ================================================================ board
  function gridPos(i) {
    if (i <= 10) return [11, 11 - i];
    if (i < 20) return [11 - (i - 10), 1];
    if (i <= 30) return [1, 1 + (i - 20)];
    return [1 + (i - 30), 11];
  }
  function sideOf(i) { if (i % 10 === 0) return 'corner'; if (i < 10) return 'b'; if (i < 20) return 'l'; if (i < 30) return 't'; return 'r'; }
  function iconName(t) {
    if (t.type === 'util') return t.icon === '⚡' ? 'power' : 'net';
    if (t.type === 'tax') return t.percent ? 'taxIncome' : 'taxLuxury';
    return t.type; // start, jail, vacation, gotojail, port, chance, chest
  }
  const tileIcon = (t) => `<div class="ticon">${ART.icon(iconName(t))}</div>`;
  function tileInner(t, i) {
    if (i % 10 === 0) return `<div class="ticon">${ART.cornerIcon(iconName(t))}</div><div class="tname">${esc(t.name)}</div>${t.type === 'vacation' ? '<div class="pot" data-pot></div>' : ''}${t.type === 'start' ? `<div class="pot">+${fmt(S.board.goSalary)}</div>` : ''}${t.type === 'jail' ? '<div class="visit">زيارة</div>' : ''}`;
    // Property strip: transparent with the price while for sale; filled with the
    // owner's colour (and their piece + buildings) once someone buys it.
    // .mlabel: «مرهونة» on the striped strip (shown only while mortgaged; a mortgaged tile never has buildings)
    const band = `<div class="band"><span class="bprice">${fmt(t.price)}</span><span class="bown"></span><span class="bld"></span><span class="mlabel">مرهونة</span></div>`;
    // .towner: the owner's name in their colour (filled by updateBoard once someone buys it)
    if (t.type === 'city') return `${band}<div class="tbody">${mark(t, 'on-tile')}<div class="tname">${esc(t.name)}</div><div class="towner"></div></div>`;
    if (t.price) return `${band}<div class="tbody">${tileIcon(t)}<div class="tname">${esc(t.name)}</div><div class="towner"></div></div>`;
    const sub = t.type === 'tax' ? (t.percent ? t.percent + '%' : fmt(t.amount)) : '';
    return `<div class="tbody">${tileIcon(t)}<div class="tname">${esc(t.name)}</div>${sub ? `<div class="tprice">${sub}</div>` : ''}</div>`;
  }
  function buildBoard() {
    const b = $('#board');
    b.innerHTML = S.board.tiles.map((_, i) => {
      const t = T(i), [r, c] = gridPos(i), side = sideOf(i);
      return `<div class="tile ${side === 'corner' ? 'corner' : 'side-' + side} type-${t.type}" data-i="${i}" style="grid-row:${r};grid-column:${c}" title="${esc(t.name)}">${tileInner(t, i)}</div>`;
    }).join('') + `<div class="center" id="center">
        <div class="center-art"><img src="/brand/serva-logo-512.webp" alt="" width="512" height="512"></div>
        <div id="cTop"></div>
        <div class="dice-spot"><div class="dice3" id="dice">${FX.diceHTML()}</div></div>
        <div class="c-offers" id="cOffers"></div>
        <div class="c-actions" id="cActions"></div>
        <div class="c-log" id="cLog"></div>
        <div id="cCard"></div>
        <div id="cNotice"></div>
        <div id="cBanner"></div>
      </div><div class="tokens" id="tokens"></div>`;
    FX.setDice($('#dice'), [5, 6], false);
    b.addEventListener('click', (e) => {
      if (e.target.closest('.card2')) { $('#cCard').innerHTML = ''; return; }
      const tile = e.target.closest('.tile');
      if (tile && S.buildMode) {
        // Build mode: a glowing city builds at once; any other tile does nothing.
        if (tile.classList.contains('buildable')) {
          const idx = Number(tile.dataset.i);
          S.lastBuild = { idx, t: Date.now() };
          FX.Sound.play('build');
          tile.classList.remove('buildable');
          act('build', { idx });
        }
        return;
      }
      if (tile) { openTile(Number(tile.dataset.i)); return; }
      const ov = e.target.closest('[data-ov]');
      if (ov) { const [k, id] = ov.dataset.ov.split(':'); openOfferView(k, Number(id)); return; }
      const a = e.target.closest('[data-a]');
      if (a) onCenterAction(a);
    });
  }
  function updateBoard(st) {
    const g = st.game;
    $$('#board .tile').forEach((el) => {
      const i = Number(el.dataset.i), t = T(i), pr = g && g.props[i];
      const owner = pr && st.players.find((p) => p.id === pr.owner);
      el.classList.toggle('owned', !!owner);
      el.classList.toggle('mortgaged', !!(pr && pr.mortgaged));
      if (owner) el.style.setProperty('--owner', owner.color); else el.style.removeProperty('--owner');
      const focus = g && st.status === 'playing' && ((g.auction && g.auction.idx === i) || (g.phase === 'buy' && g.pendingBuy === i));
      el.classList.toggle('focus', !!focus);
      if (t.type === 'city') {
        const h = pr ? pr.houses : 0, bld = el.querySelector('.bld');
        if (bld.dataset.h !== String(h)) { bld.dataset.h = h; bld.innerHTML = h === 5 ? ART.HOTEL : ART.HOUSE.repeat(h); }
        el.classList.toggle('bld-many', h >= 3 && h < 5);
      }
      const town = el.querySelector('.towner');
      if (town) {
        const key = owner ? owner.id + owner.name + owner.color : '';
        if (town.dataset.k !== key) { town.dataset.k = key; town.textContent = owner ? owner.name : ''; town.style.setProperty('--oc', owner ? owner.color : ''); }
        el.title = t.name + (t.countryName ? ' — ' + t.countryName : '') + (owner ? ' · ملك ' + owner.name : '');
      }
      const bown = el.querySelector('.bown');
      if (bown) {
        const key = owner ? owner.id + owner.piece : '';
        if (bown.dataset.k !== key) { bown.dataset.k = key; bown.innerHTML = owner ? ART.piece(owner.piece) : ''; }
      }
      if (t.type === 'vacation') {
        const pot = el.querySelector('[data-pot]');
        pot.textContent = st.settings.vacationCash && g ? fmt(g.pot) : '';
      }
    });
    layoutTokens();
  }

  // ---------------------------------------------------------------- tokens
  function processMoves(st) {
    const g = st.game;
    if (!g) { S.queue = []; S.moveSeq = 0; S.walked = 0; S.afterQ = []; S.held = {}; st.players.forEach((p) => { S.disp[p.id] = 0; }); return; }
    const moves = g.moves || [];
    if (S.moveSeq < 0) {
      S.moveSeq = Math.max(g.moveSeq || 0, moves.reduce((m, x) => Math.max(m, x.seq), 0));
      S.walked = S.moveSeq; // what happened before we arrived is not replayed
      st.players.forEach((p) => { S.disp[p.id] = p.pos; });
      return;
    }
    const fresh = moves.filter((m) => m.seq > S.moveSeq);
    if (fresh.length) {
      S.moveSeq = fresh[fresh.length - 1].seq;
      S.queue.push(...fresh);
      runQueue();
    }
    if (!S.running) {
      st.players.forEach((p) => { S.disp[p.id] = p.pos ?? 0; });
      if ((g.moveSeq || 0) > S.walked) walkDone(g.moveSeq); // moves older than the 8 kept by the server
    }
  }
  async function runQueue() {
    if (S.running) return;
    S.running = true;
    // the piece starts walking once the dice have landed
    // (3D dice: until they have really landed, at most 1.5 s longer, e.g. when the browser slows animations down)
    const d3 = () => { const d = $('#dice'); return d && d._d3 && d._d3.state && d._d3.state.rolling; };
    while (!document.hidden && (performance.now() < S.diceUntil || (d3() && performance.now() < S.diceUntil + 1200))) await sleep(50);
    while (S.queue.length) {
      const m = S.queue.shift();
      // Hidden tab (timers throttled) or a backlog of moves: jump straight there.
      if (document.hidden || S.queue.length > 3) { S.disp[m.pid] = m.to; walkDone(m.seq); continue; }
      if (m.jump || m.steps <= 0) {
        S.disp[m.pid] = m.to; layoutTokens(); FX.Sound.play('step'); await sleep(260);
      } else {
        S.disp[m.pid] = m.from;
        const stepMs = Math.max(70, Math.min(150, 1900 / m.steps));
        for (let k = 0; k < m.steps; k++) {
          if (document.hidden) { S.disp[m.pid] = m.to; break; }
          S.disp[m.pid] = (S.disp[m.pid] + 1) % 40; layoutTokens(); hop(m.pid);
          FX.Sound.play(S.disp[m.pid] === 0 && m.steps > 0 ? 'salary' : 'step');
          await sleep(stepMs);
        }
        await sleep(140);
      }
      const pause = walkDone(m.seq);
      if (pause && S.queue.length && !document.hidden) await sleep(pause);
    }
    S.running = false;
    if (S.room) {
      S.room.players.forEach((p) => { S.disp[p.id] = p.pos ?? 0; });
      layoutTokens();
      if (S.room.game && (S.room.game.moveSeq || 0) > S.walked) walkDone(S.room.game.moveSeq);
      updateCenter(S.room);
      updateSide(S.room);
    }
  }
  function hop(pid) {
    const tk = document.querySelector('#tok-' + pid + ' .tk');
    if (!tk) return;
    tk.classList.remove('hop'); void tk.offsetWidth; tk.classList.add('hop');
  }
  // Every tile name is shown in full: it breaks only between words (CSS keep-all), on at most 2 lines, never with «…».
  // When a tile is too small (an owned tile also has the owner line), its flag / icon gets smaller first (desktop),
  // then that tile's name font — never split inside a word. Phones only lower the font (the flag keeps its size there).
  const PHONE = '(max-width: 820px)';
  let fitQueued = false;
  function fitTile(tile, phone) {
    const n = tile.querySelector('.tname');
    if (!n) return;
    const body = n.parentElement; // .tbody, or the corner tile itself
    const mk = phone ? null : body.querySelector(':scope > .flag, :scope > .ticon');
    const own = tile.querySelector('.towner');
    // nothing that changes the room a name has → keep the last fit
    const key = [phone, tile.offsetWidth, tile.offsetHeight, n.textContent, own ? own.textContent : '', tile.classList.contains('mortgaged')].join('|');
    if (tile.dataset.fit === key) return;
    n.style.fontSize = '';
    if (own) own.style.fontSize = '';
    if (mk) { mk.style.removeProperty('--fs'); mk.style.width = mk.style.height = ''; }
    if (!n.clientWidth) { delete tile.dataset.fit; return; }
    // the owner's name: a slightly smaller font before it is cut with «…» (desktop; phones hide it)
    if (own && own.textContent && own.clientWidth) {
      let os = parseFloat(getComputedStyle(own).fontSize);
      while (os > 7.5 && own.scrollWidth > own.clientWidth + 0.5) { os -= 0.25; own.style.fontSize = os + 'px'; }
    }
    const tr = tile.getBoundingClientRect();
    const br = body === tile ? tr : body.getBoundingClientRect();
    const top = Math.max(br.top, tr.top) + 1.5, bottom = Math.min(br.bottom, tr.bottom) - 1.5; // clear of the tile's rounded border
    const out = () => { // the name (or anything above / below it) pushed out of its tile
      for (const c of body.children) {
        if (c.classList.contains('band') || getComputedStyle(c).position === 'absolute') continue;
        const r = c.getBoundingClientRect();
        if (r.height && (r.top < top - 0.5 || r.bottom > bottom + 0.5)) return true;
      }
      return false;
    };
    const wide = () => n.scrollWidth > n.clientWidth + 0.5;     // a word wider than the tile
    const tall = () => n.scrollHeight > n.clientHeight + 0.5;   // more than 2 lines
    let fs = parseFloat(getComputedStyle(n).fontSize);
    const min = phone ? 4.1 : 8;
    const smaller = () => { fs -= 0.25; n.style.fontSize = fs + 'px'; };
    while (fs > min && (wide() || tall())) smaller();
    if (mk) {
      let ms = mk.getBoundingClientRect().height;
      const mmin = tile.classList.contains('corner') ? 22 : 14;
      while (ms > mmin && out()) {
        ms -= 1;
        if (mk.classList.contains('flag')) mk.style.setProperty('--fs', ms + 'px'); else mk.style.width = mk.style.height = ms + 'px';
      }
    }
    while (fs > min && out()) smaller();
    tile.dataset.fit = key;
  }
  function fitNames() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => {
      fitQueued = false;
      const phone = matchMedia(PHONE).matches;
      for (const tile of $$('#board .tile')) fitTile(tile, phone);
      layoutTokens(); // tokens stand next to the names, which may have moved
    });
  }
  // Phones: the chat button sits in the top bar (next to sound/account) instead of floating over the controls.
  function dockChat() {
    const fab = $('#chatFab'), bar = $('.col-a .top-row');
    if (!fab || !bar) return;
    const phone = matchMedia(PHONE).matches;
    if (phone && fab.parentNode !== bar) bar.appendChild(fab);
    else if (!phone && fab.parentNode === bar) $('#chatDrawer').before(fab);
  }

  // Where tokens stand on a tile (desktop), in board coordinates: on the property strip of the left/right columns,
  // else in the part of the tile above the name (the strip + flag on the bottom row, the flag / icon elsewhere).
  // null = no room there (the token goes back to the tile centre).
  function tokenZone(board, tile) {
    const b = board.getBoundingClientRect(), ox = b.left + board.clientLeft, oy = b.top + board.clientTop;
    const band = tile.querySelector('.band');
    if (band && (tile.classList.contains('side-l') || tile.classList.contains('side-r'))) {
      const r = band.getBoundingClientRect();
      return r.width >= 14 ? { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height, vertical: true } : null;
    }
    const n = tile.querySelector('.tname');
    if (!n) return null;
    const t = tile.getBoundingClientRect(), top = n.getBoundingClientRect().top - 2;
    return top - t.top >= 14 ? { x: t.left - ox, y: t.top - oy, w: t.width, h: top - t.top, vertical: false } : null;
  }
  function layoutTokens() {
    const board = $('#board'), layer = $('#tokens');
    if (!board || !layer || !S.room) return;
    const st = S.room, g = st.game, phone = matchMedia(PHONE).matches;
    const alive = st.players.filter((p) => !p.bankrupt && !p.left);
    const groups = {};
    alive.forEach((p) => { const d = S.disp[p.id] ?? 0; (groups[d] = groups[d] || []).push(p); });
    const curId = g && st.status === 'playing' ? g.order[g.turn] : null;
    for (const p of alive) {
      let el = document.getElementById('tok-' + p.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'token'; el.id = 'tok-' + p.id;
        el.style.transition = 'none';
        layer.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = ''; }));
      }
      const key = p.piece + p.color;
      if (el.dataset.k !== key) {
        el.dataset.k = key;
        el.innerHTML = `<div class="tk" style="--pc:${p.color}">${ART.piece(p.piece)}</div>`;
      }
      el.title = p.name;
      el.classList.toggle('current', p.id === curId);
      const d = S.disp[p.id] ?? 0;
      const tile = board.querySelector(`.tile[data-i="${d}"]`);
      if (!tile) continue;
      const grp = groups[d], k = grp.indexOf(p), n = grp.length;
      const tw = tile.offsetWidth, th = tile.offsetHeight;
      // Desktop: the tokens stand beside the name, never on it (see tokenZone), in one row shrunk to fit.
      const z = !phone && tokenZone(board, tile);
      if (z) {
        const along = z.vertical ? z.h : z.w, across = z.vertical ? z.w : z.h;
        // a piece is drawn ~28% taller than its box (upwards): on the side columns it must not reach the tile above
        const stacked = !z.vertical && (tile.classList.contains('side-l') || tile.classList.contains('side-r'));
        const size = Math.max(14, Math.min(40, Math.max(22, Math.min(tw, th) * 0.6), z.vertical ? across * 0.84 : stacked ? across / 1.28 : across, along / (1 + 0.8 * (n - 1))));
        const step = n > 1 ? Math.max(0, Math.min(size * 0.8, (along - size) / (n - 1))) : 0;
        const a = (along - step * (n - 1)) / 2 + k * step, c = across / 2 + (stacked ? size * 0.14 : 0);
        const cx = z.x + (z.vertical ? c : a), cy = z.y + (z.vertical ? a : c);
        el.style.width = el.style.height = size + 'px';
        el.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px)`;
        continue;
      }
      const per = n > 4 ? 3 : 2, rows = Math.ceil(n / per), cols = Math.min(n, per);
      // Big glowing tokens: clamp(22, tile*0.6, 40), shrunk only as much as needed so a group fits its tile.
      const fit = Math.min(tw / (1 + 0.8 * (cols - 1)), th / (1 + 0.8 * (rows - 1)));
      const size = Math.max(16, Math.min(Math.max(22, Math.min(40, Math.min(tw, th) * 0.6)), n > 1 ? fit : Infinity));
      const col = k % per, row = Math.floor(k / per);
      const cx = tile.offsetLeft + tile.offsetWidth / 2 + (col - (cols - 1) / 2) * size * 0.8;
      const cy = tile.offsetTop + tile.offsetHeight / 2 + (row - (rows - 1) / 2) * size * 0.8;
      el.style.width = el.style.height = size + 'px';
      el.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px)`;
    }
    $$('.token', layer).forEach((el) => { if (!alive.some((p) => 'tok-' + p.id === el.id)) el.remove(); });
  }

  // ---------------------------------------------------------------- dice & card
  function updateDice(st) {
    const g = st.game;
    if (!g) { S.rollSeq = 0; return; }
    if (g.rollSeq === S.rollSeq) return;
    const first = S.rollSeq < 0;
    S.rollSeq = g.rollSeq;
    const dice = $('#dice');
    // the dice fly in from the thrower: from the bottom for me, from the roller's piece for everyone else
    const cur = g.order && st.players.find((p) => p.id === g.order[g.turn]);
    let from = { x: 0, y: 1 };
    if (cur && !(S.me && cur.id === S.me.pid)) {
      const tok = document.getElementById('tok-' + cur.id), c = $('#center');
      if (tok && c) {
        const a = tok.getBoundingClientRect(), b = c.getBoundingClientRect();
        from = { x: a.left + a.width / 2 - (b.left + b.width / 2), y: a.top + a.height / 2 - (b.top + b.height / 2) };
      }
    }
    FX.setDice(dice, g.dice, !first, { from, onImpact: () => FX.Sound.play('dice-roll') });
    // the piece walks once the dice have landed (3D throw ~1–1.5 s, CSS dice ~0.9 s; runQueue also waits for the 3D state)
    if (!first && !document.hidden) S.diceUntil = performance.now() + (dice && dice.classList.contains('d3') ? 1000 : 900);
  }
  function updateCard(st) {
    const g = st.game;
    if (!g) { S.cardSeq = 0; return; }
    if (S.cardSeq < 0) { S.cardSeq = g.cardSeq; return; }
    if (!g.card || g.card.seq <= S.cardSeq) return;
    S.cardSeq = g.card.seq;
    const who = st.players.find((p) => p.id === g.card.pid);
    const card = g.card;
    // shown when the piece reaches the «حظ» / «خزنة» square; a card that moves the player is read first (pause)
    afterWalk(card.moveSeq, () => {
      const deck = card.deck, title = deck === 'chance' ? 'بطاقة حظ' : 'بطاقة خزنة';
      // Dark-glass card in the style of the blue playing cards: it lands face down (Serva back) and flips over.
      // The front stays in normal flow (it sizes the card) and ends facing the player, so the text always shows.
      $('#cCard').innerHTML = `<div class="card2 flip3 ${deck}" title="اضغط لتسكير">
          <div class="c3-inner">
            <div class="c3-front">
              <div class="c2-head"><span class="c2-icon">${ART.icon(deck)}</span><b>${title}</b><small>${esc(who ? who.name : '')}</small></div>
              <div class="c2-text">${esc(card.text)}</div>
              ${card.effect ? `<div class="c2-effect">${esc(card.effect)}</div>` : ''}
            </div>
            <div class="c3-back" aria-hidden="true"><img src="/tharwa/card-back.webp" alt="" draggable="false"></div>
          </div>
        </div>`;
      FX.Sound.play('card');
      clearTimeout(S.cardTimer);
      S.cardTimer = setTimeout(() => { $('#cCard').innerHTML = ''; }, 7000);
    }, card.kind === 'move' || card.kind === 'back' || card.kind === 'nearestPort' || card.kind === 'jail' ? 1500 : 0);
  }

  // Big centred notice everyone sees (rent, tax, a sale to the creditor, a bankruptcy). It waits for the walk.
  function updateNotice(st) {
    const g = st.game;
    if (!g) { S.noticeSeq = 0; return; }
    if (S.noticeSeq < 0) { S.noticeSeq = g.noticeSeq || 0; return; }
    if (!g.notice || g.notice.seq <= S.noticeSeq) return;
    S.noticeSeq = g.notice.seq;
    const n = g.notice;
    const P = (id) => st.players.find((p) => p.id === id);
    const from = P(n.from), to = n.to ? P(n.to) : null;
    if (!from) return;
    const av = (p) => `<span class="tk rp-av" style="--pc:${p.color}" title="${esc(p.name)}">${ART.piece(p.piece)}</span>`;
    const nm = (p) => `<span class="rp-name" style="--nc:${p.color}">${esc(p.name)}</span>`;
    const bank = `<span class="rp-av rp-bank">${ART.ui('bank')}</span>`;
    const owe = n.amount - (n.paid ?? n.amount);
    let html = '', fly = false, snd = 'pay';
    if (n.kind === 'norent' && to) {
      // «لا إيجار للمسجون»: the owner is in jail, so the visitor pays nothing.
      html = `${av(from)}<span class="rp-arrow">${ART.ui('lock')}</span>
        <div class="rp-mid"><b class="rp-amt">بلا إيجار</b><small>${nm(to)} صاحب ${esc(n.tile)} بالسجن — ما في إيجار</small></div>
        <span class="rp-arrow">${ART.ui('lock')}</span>${av(to)}`;
      snd = 'jail';
    } else if (n.kind === 'rent' && to) {
      html = `${av(from)}<span class="rp-arrow">${ART.ui('arrow')}</span>
        <div class="rp-mid"><b class="rp-amt">${fmt(n.paid ?? n.amount)}</b><small>${nm(from)} دفع إيجار ${esc(n.tile)} لـ ${nm(to)}</small>
        ${owe > 0 ? `<small class="rp-owe">ما معه كل المبلغ: دفع ${fmt(n.paid)} من ${fmt(n.amount)} — ضل عليه ${fmt(owe)}</small>` : ''}</div>
        <span class="rp-arrow">${ART.ui('arrow')}</span>${av(to)}`;
      fly = (n.paid ?? n.amount) > 0;
      snd = S.me && to.id === S.me.pid ? 'receive' : 'pay';
    } else if (n.kind === 'tax') {
      html = `${av(from)}<span class="rp-arrow">${ART.ui('arrow')}</span>
        <div class="rp-mid"><b class="rp-amt">${fmt(n.paid ?? n.amount)}</b><small>${nm(from)} دفع ${esc(n.tile)} للبنك</small>
        ${owe > 0 ? `<small class="rp-owe">ضل عليه ${fmt(owe)} للبنك</small>` : ''}</div>
        <span class="rp-arrow">${ART.ui('arrow')}</span>${bank}`;
    } else if (n.kind === 'debtsale' && to) {
      html = `${av(from)}<span class="rp-arrow">${ART.ui('handshake')}</span>
        <div class="rp-mid"><b class="rp-amt">${fmt(n.amount)}</b><small>${nm(from)} باع ${esc(n.tile)} لـ ${nm(to)}</small>
        <small class="rp-sub">${n.cancel ? `${fmt(n.cancel)} انحسبوا من الدين` : ''}${n.cancel && n.paid ? ' · ' : ''}${n.paid ? `${fmt(n.paid)} مصاري` : ''}</small></div>
        <span class="rp-arrow">${ART.ui('handshake')}</span>${av(to)}`;
      snd = 'trade-ok';
    } else if (n.kind === 'bankrupt') {
      const parts = (n.paidTo || []).filter((x) => x.amount > 0).map((x) => `${fmt(x.amount)} لـ ${x.to ? nm(P(x.to) || { name: '', color: '#fff' }) : 'البنك'}`);
      html = `${av(from)}<span class="rp-arrow">${ART.ui('skull')}</span>
        <div class="rp-mid"><b class="rp-amt rp-bust">${esc(from.name)} أفلس</b>
        <small>${parts.length ? `مصاريه راحت: ${parts.join('، ')}` : 'ما كان معه مصاري'}</small>
        ${n.freed ? `<small class="rp-sub">${n.freed} ${n.freed === 1 ? 'عقار رجع للبنك وصار' : 'عقارات رجعوا للبنك وصاروا'} للبيع من جديد</small>` : ''}</div>
        <span class="rp-arrow">${ART.ui('bank')}</span>${bank}`;
      snd = 'lose';
    } else return;
    afterWalk(n.moveSeq, () => {
      const box = $('#cNotice');
      if (!box) return;
      box.innerHTML = `<div class="rent-pill ${n.kind}" role="status">${html}</div>`;
      clearTimeout(S.noticeTimer);
      S.noticeTimer = setTimeout(() => { box.innerHTML = ''; }, n.kind === 'bankrupt' ? 5000 : 3600);
      S.sndAt = Date.now();
      FX.Sound.play(snd);
      if (fly) flyCash(n.from, n.to);
    });
  }
  // Rent: 7 notes/coins fly on a curve from the payer's token to the owner's token
  // (or between their rows in the players list), then the owner's token glows.
  function flyCash(fromId, toId) {
    if (document.hidden) return;
    const anchor = (pid) => document.getElementById('tok-' + pid) || document.querySelector(`[data-prow="${pid}"] .tk.av`);
    const a = anchor(fromId), b = anchor(toId);
    if (!a || !b) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x0 = ra.left + ra.width / 2, y0 = ra.top + ra.height / 2, x1 = rb.left + rb.width / 2, y1 = rb.top + rb.height / 2;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    // control point: lift the curve above the straight line
    const cx = (x0 + x1) / 2 + (y1 - y0) * 0.18, cy = Math.min(y0, y1) - Math.max(60, dist * 0.35);
    const N = 7, DUR = 760, STAGGER = 115;
    for (let k = 0; k < N; k++) {
      const el = document.createElement('div');
      el.className = 'cash-fly ' + (k % 2 ? 'coin' : 'bill');
      el.innerHTML = k % 2 ? ART.COIN : ART.BILL; // rendered coin / banknote sprites
      document.body.appendChild(el);
      const jitter = (k - (N - 1) / 2) * 7;
      const frames = [];
      for (let s = 0; s <= 12; s++) {
        const t = s / 12, u = 1 - t;
        const x = u * u * x0 + 2 * u * t * (cx + jitter) + t * t * x1;
        const y = u * u * y0 + 2 * u * t * (cy - Math.abs(jitter)) + t * t * y1;
        frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${(k % 2 ? 1 : -1) * t * 300}deg) scale(${0.7 + 0.5 * Math.sin(t * Math.PI)})`, opacity: t > 0.92 ? 0 : 1 });
      }
      const anim = el.animate(frames, { duration: DUR, delay: k * STAGGER, easing: 'cubic-bezier(.35,.1,.35,1)', fill: 'both' });
      anim.onfinish = () => el.remove();
      setTimeout(() => el.remove(), DUR + k * STAGGER + 500);
    }
    setTimeout(() => {
      const tk = b.classList.contains('tk') ? b : b.querySelector('.tk');
      if (!tk) return;
      tk.classList.remove('cash-glow'); void tk.offsetWidth; tk.classList.add('cash-glow');
      setTimeout(() => tk.classList.remove('cash-glow'), 900);
    }, DUR + (N - 1) * STAGGER - 120);
  }
  // A new house/hotel pops in on its tile (everyone sees it).
  function popBuilding(i) {
    const bld = document.querySelector(`#board .tile[data-i="${i}"] .bld`);
    const last = bld && bld.lastElementChild;
    if (!last) return;
    last.classList.remove('pop'); void last.getBoundingClientRect(); last.classList.add('pop');
  }

  // ---------------------------------------------------------------- build mode
  // Mirrors engine.cannotBuild(): which of my cities can get a house/hotel right now.
  function buildableTiles(st) {
    const g = st.game, me = meP(st);
    if (!g || !me || me.bankrupt) return [];
    const out = [];
    for (const [k, pr] of Object.entries(g.props)) {
      const i = Number(k), t = T(i);
      if (t.type !== 'city' || pr.owner !== me.id || pr.houses >= 5) continue;
      const set = S.board.setTiles[t.set];
      if (!set.every((j) => g.props[j] && g.props[j].owner === me.id && !g.props[j].mortgaged)) continue;
      if (st.settings.evenBuild && pr.houses > Math.min(...set.map((j) => g.props[j].houses))) continue;
      if (me.money < t.houseCost) continue;
      out.push(i);
    }
    return out;
  }
  // Build mode can be used on my own turn, before rolling or when the turn is done.
  function buildTime(st) {
    const g = st.game, me = meP(st);
    return !!(g && me && !me.bankrupt && st.status === 'playing' && !g.auction && g.order[g.turn] === me.id && (g.phase === 'roll' || g.phase === 'done'));
  }
  function setBuildMode(on) {
    S.buildMode = on;
    if (S.room) { updateBuildMode(S.room); updateCenter(S.room); }
  }
  function updateBuildMode(st) {
    const board = $('#board');
    if (!board) return;
    let list = [];
    if (S.buildMode) {
      if (!buildTime(st)) S.buildMode = false;
      else {
        list = buildableTiles(st);
        if (!list.length) { S.buildMode = false; toast('ما في شي تقدر تعمّره هلق', 'ok'); }
      }
    }
    board.classList.toggle('build-on', !!S.buildMode);
    $$('#board .tile').forEach((el) => {
      const i = Number(el.dataset.i), on = !!(S.buildMode && list.includes(i)); // boolean: toggle(x, undefined) would flip every tile on each update
      el.classList.toggle('buildable', on);
      let badge = el.querySelector('.bbadge');
      if (!on) { if (badge) badge.remove(); return; }
      const t = T(i), pr = st.game.props[i];
      const txt = (pr.houses === 4 ? '🏨 ' : '🏠 ') + fmt(t.houseCost);
      if (!badge) { badge = document.createElement('div'); badge.className = 'bbadge'; el.appendChild(badge); }
      if (badge.textContent !== txt) badge.textContent = txt;
    });
  }

  // ---------------------------------------------------------------- center
  function btn(a, label, cls = '', disabled = false, extra = '') {
    return `<button class="btn ${cls}" data-a="${a}" ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`;
  }
  // Title-deed card for a property (used when buying and in auctions).
  function deedHTML(i) {
    const t = T(i);
    let head, rows;
    if (t.type === 'city') {
      head = `<div class="deed-head" style="--sc:${SET(t.set).color}">${mark(t, 'mid')}<div class="dh-text"><b>${esc(t.name)}</b><small>${esc(t.countryName)}</small></div></div>`;
      rows = [['الإيجار', fmt(t.rent[0])], ['مع الدولة كاملة', fmt(t.rent[0] * (S.room.settings.doubleRent ? 2 : 1))], ['بيت واحد', fmt(t.rent[1])], ['4 بيوت', fmt(t.rent[4])], ['فندق', fmt(t.rent[5])]];
    } else if (t.type === 'port') {
      head = `<div class="deed-head plain"><span class="dh-icon">${ART.icon('port')}</span><div class="dh-text"><b>${esc(t.name)}</b><small>ميناء</small></div></div>`;
      rows = S.board.portRent.map((v, k) => [`${k + 1} ${k ? 'موانئ' : 'ميناء'}`, fmt(v)]);
    } else {
      head = `<div class="deed-head plain"><span class="dh-icon">${ART.icon(iconName(t))}</span><div class="dh-text"><b>${esc(t.name)}</b><small>شركة</small></div></div>`;
      rows = [['شركة وحدة', 'النرد × 4'], ['الشركتين', 'النرد × 10']];
    }
    return `<div class="deed">${head}${ownerTag(i)}<div class="deed-body">${rows.map(([l, v]) => `<div class="drow"><span>${l}</span><b>${v}</b></div>`).join('')}</div><div class="deed-price">${fmt(t.price)}</div></div>`;
  }
  // «ملك فلان» strip in the owner's colour on a deed / property card (nothing while the bank owns it).
  function ownerTag(i) {
    const st = S.room, pr = st && st.game && st.game.props[i];
    const o = pr && st.players.find((p) => p.id === pr.owner);
    if (!o) return '';
    return `<div class="deed-owner" style="--oc:${o.color}"><span class="tk do-av" style="--pc:${o.color}">${ART.piece(o.piece)}</span><span>ملك <b>${esc(o.name)}</b></span>${pr.mortgaged ? '<i class="do-tag">مرهونة</i>' : ''}</div>`;
  }
  function updateCenter(st) {
    const top = $('#cTop'), actions = $('#cActions'), logEl = $('#cLog');
    if (!top) return;
    const g = st.game, me = meP(st);
    const logHTML = st.log.slice(-7).reverse().map((l) => `<div>${esc(l.text)}</div>`).join('');
    // while a piece is still walking the log waits too (it would tell the rent before the piece arrives)
    if (logHTML !== S.logHTML && !(S.running && S.logHTML)) { S.logHTML = logHTML; logEl.innerHTML = logHTML; }
    const setTop = (h) => { if (h !== S.topHTML) { S.topHTML = h; top.innerHTML = h; } };

    $('#center').classList.remove('compact');
    if (st.status === 'lobby') {
      const m = MAP(), themed = m && m.id !== 'classic';
      const codes = themed ? m.sets.map((x) => x.flag).filter(Boolean) : Object.keys(S.board.sets).map((k) => st.map && st.map[k]).filter(Boolean);
      const ring = codes.map((c, k) => `<span class="ring-flag" style="--a:${(k * 360) / codes.length}deg">${flag(c, 'lg')}</span>`).join('');
      setTop(`<div class="emblem"><div class="ring">${ring}</div><div class="brand">ثروة<span>.</span></div></div>
        <div class="sub">${st.players.length}/${st.settings.maxPlayers} لاعبين بالغرفة — كل لاعب بيبلّش بـ ${fmt(st.settings.startingCash)}</div>`);
      if (!me) setActions(actions, null, '<div class="spectator">أنت متفرّج</div>');
      else if (isHost(st)) {
        setActions(actions, null, btn('start', '▶ ابدأ اللعبة', 'gold big', st.players.length < 2) +
          (st.players.length < 2 ? '<div class="hint">بدك لاعبين اثنين على الأقل — ابعت الرابط لصاحبك أو ضيف لاعب آلي</div>' : ''));
      } else setActions(actions, null, '<div class="hint">بانتظار صاحب الغرفة يبدأ اللعبة…</div>');
      return;
    }
    if (st.status === 'ended') {
      const w = st.players.find((p) => p.id === g.winner);
      // Points won/lost by each account in this game (filled in by the server right after the end).
      const pr = g.pointsResult || {};
      const lines = st.players.filter((p) => p.id in pr).map((p) => `<div class="pts-line ${pr[p.id] >= 0 ? 'up' : 'down'}"><span class="tk" style="--pc:${p.color}">${ART.piece(p.piece)}</span><b>${esc(p.name)}</b><span class="pts-d">${pr[p.id] >= 0 ? '+' : '−'}${Math.abs(pr[p.id])} ${ART.ui('star')}</span></div>`).join('');
      setTop(`<div class="winner"><div class="trophy">${ART.icon('trophy')}</div>${w ? `<span class="tk big" style="--pc:${w.color}">${ART.piece(w.piece)}</span>` : ''}<div>${esc(w ? w.name : '—')} ربح اللعبة!</div></div>${lines ? `<div class="pts-res">${lines}</div>` : ''}`);
      setActions(actions, null, isHost(st) ? btn('restart', '🔄 لعبة جديدة بنفس الغرفة', 'gold big') : '<div class="hint">بانتظار صاحب الغرفة يبدأ لعبة جديدة</div>');
      return;
    }

    const cur = st.players.find((p) => p.id === g.order[g.turn]);
    setTop(`<div class="turn"><span class="dot" style="background:${cur.color}"></span>دور <b>${esc(cur.name)}</b>${g.autopilot ? ' <small class="hint">(تلقائي)</small>' : ''}${g.turnEndsAt ? ' <span class="timer" id="turnTimer"></span>' : ''}</div>`);
    let h = '', key = null;
    if (g.auction) { h = auctionHTML(st, me); key = `auc:${g.auction.idx}:${g.auction.lot || 1}`; }
    else if (S.running) h = '<div class="hint">…</div>';
    else if (me && cur.id === me.id) {
      switch (g.phase) {
        case 'roll':
          if (me.inJail && !g.rolled) {
            h = `<div class="hint">🔒 أنت بالسجن (محاولة ${me.jailTurns + 1} من 3) — جيب دبل لتطلع ببلاش</div><div class="row">${btn('roll', '🎲 ارمي النرد', 'gold')}${btn('payJail', 'ادفع ' + fmt(S.board.jailFine) + ' واطلع', '', me.money < S.board.jailFine)}${me.jailCards ? btn('jailCard', '🎫 استخدم بطاقة الخروج') : ''}</div>`;
          } else h = btn('roll', g.rolled ? '🎲 دبل! ارمي مرة تانية' : '🎲 ارمي النرد', 'gold big');
          h += buildBtn(st);
          break;
        case 'buy': {
          const t = T(g.pendingBuy);
          key = 'buy:' + g.pendingBuy;
          h = `<div class="offer2">${deedHTML(g.pendingBuy)}<div class="offer-side" data-live="side">
              <div>بدك تشتري <b>${esc(t.name)}</b>؟</div><small class="hint">معك ${fmt(me.money)}</small>
              ${btn('buy', 'اشتري ' + fmt(t.price), 'gold', me.money < t.price)}${btn('skip', st.settings.auction ? 'لا — للمزاد 🔨' : 'لا شكراً')}</div></div>`;
          break;
        }
        case 'debt': key = 'debt'; h = debtorHTML(st, me); break;
        case 'done': h = btn('end', 'إنهاء الدور ✔', 'gold big') + buildBtn(st); break;
        default: break;
      }
    } else if (g.phase === 'debt' && g.debts.length && me && !me.bankrupt) { key = 'debtw'; h = debtWatchHTML(st, me, cur); }
    else if (cur.isBot || g.autopilot) h = `<div class="hint">${esc(cur.name)} عم يفكّر…</div>`;
    else h = `<div class="hint">بانتظار ${esc(cur.name)}…</div>`;
    setActions(actions, key, h);
    $('#center').classList.toggle('compact', h.includes('class="deed"'));
  }
  // Updates the centre actions without re-creating what is already on screen: with the same `key`
  // (same auction lot / buy offer / debt) only the [data-live] parts change, so the deed and the
  // auction box never flash or replay their entry animation. The bid amount ticks to its new value.
  function setActions(el, key, html) {
    if (S.actHTML === html && el.dataset.key === (key || '')) return;
    if (key && el.dataset.key === key) {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      const fresh = [...tpl.content.querySelectorAll('[data-live]')];
      if (fresh.length && fresh.every((n) => el.querySelector(`[data-live="${n.dataset.live}"]`))) {
        for (const n of fresh) {
          const cur = el.querySelector(`[data-live="${n.dataset.live}"]`);
          if (cur.dataset.src === n.innerHTML) continue;
          const before = cur.dataset.src;
          cur.dataset.src = n.innerHTML;
          if (n.dataset.live === 'bid' && before !== undefined) {
            const from = Number(cur.dataset.v || 0), to = Number(n.dataset.v || 0);
            cur.dataset.v = to;
            if (to > 0) { countUp(cur, from, to); cur.classList.remove('bump'); void cur.offsetWidth; cur.classList.add('bump'); } else cur.innerHTML = n.innerHTML;
          } else cur.innerHTML = n.innerHTML;
        }
        S.actHTML = html;
        return;
      }
    }
    el.dataset.key = key || '';
    el.innerHTML = html;
    S.actHTML = html;
    $$('[data-live]', el).forEach((n) => { n.dataset.src = n.innerHTML; });
  }
  // ---------------------------------------------------------------- debt phase (centre)
  const debtTotal = (g) => g.debts.reduce((s, d) => s + d.amount, 0);
  const owedToMe = (g, pid) => g.debts.filter((d) => d.to === pid).reduce((s, d) => s + d.amount, 0);
  function whoChip(p) {
    return p ? `<span class="who-chip" style="--pc:${p.color}"><span class="tk" style="--pc:${p.color}">${ART.piece(p.piece)}</span>${esc(p.name)}</span>`
      : `<span class="who-chip bank"><span class="tk">${ART.ui('bank')}</span>البنك</span>`;
  }
  // The debtor: what he owes and to whom, what was already paid, buy offers from the creditors, and his ways out.
  function debtorHTML(st, me) {
    const g = st.game, P = (id) => st.players.find((p) => p.id === id);
    const rows = g.debts.map((d) => `<div class="debt-row">${whoChip(d.to ? P(d.to) : null)}<span class="dr-why">${esc(d.reason || '')}</span>
      <span class="dr-num">${d.paid ? `<small>دفعت ${fmt(d.paid)}</small>` : ''}<b>${fmt(d.amount)}</b></span></div>`).join('');
    const offers = (g.debtOffers || []).filter((o) => o.to === me.id).map((o) => {
      const b = P(o.from), cancel = Math.min(owedToMe(g, o.from), o.price), cash = o.price - cancel;
      return `<div class="debt-offer">${whoChip(b)}<span>بدو يشتري <b>${esc(T(o.idx).name)}</b> بـ <b class="gold-t">${fmt(o.price)}</b>
        <small>${cancel ? `${fmt(cancel)} بينقصوا من دينك` : ''}${cancel && cash ? ' + ' : ''}${cash ? `${fmt(cash)} مصاري` : ''}</small></span>
        <span class="row">${btn('dacc', 'قبول', 'gold sm', false, `data-id="${o.id}"`)}${btn('ddec', 'رفض', 'sm', false, `data-id="${o.id}"`)}</span></div>`;
    }).join('');
    const canSell = ownedBy(st, me.id).length && !st.game.auction;
    return `<div class="debt-box" data-live="debt">
      <div class="debt-head">${ART.ui('warn')}<span>عليك دين</span><b>${fmt(debtTotal(g))}</b></div>
      <div class="debt-rows">${rows}</div>
      ${offers ? `<div class="debt-offers"><div class="do-title">عروض شراء لعقاراتك</div>${offers}</div>` : ''}
      <small class="hint">بيع بيوت أو ارهن (اضغط على عقارك) أو بيع للي إله الدين — كل مصاري بتجيك بتروح للدين لحالها.</small>
      <div class="row">${canSell ? btn('sellmany', '🔨 بيع بالمزاد') : ''}${btn('bankrupt', '💀 أعلن الإفلاس', 'danger')}</div></div>`;
  }
  // Everybody else (the creditor first of all) during someone's debt: buy one of his properties, or send / forgive money.
  function debtWatchHTML(st, me, debtor) {
    const g = st.game, mine = owedToMe(g, me.id);
    const sellable = ownedBy(st, debtor.id).filter((i) => !hasBuildings(st, i) && !(g.auction && g.auction.idx === i));
    const my = (g.debtOffers || []).filter((o) => o.from === me.id).map((o) => `<div class="debt-offer mine"><span>عرضك: <b>${esc(T(o.idx).name)}</b> بـ <b class="gold-t">${fmt(o.price)}</b> <small>بانتظار ردّه</small></span>${btn('ddec', 'اسحب', 'sm', false, `data-id="${o.id}"`)}</div>`).join('');
    return `<div class="debt-box watch" data-live="debtw">
      <div class="debt-head">${whoChip(debtor)}<span>عليه دين</span><b>${fmt(debtTotal(g))}</b></div>
      ${mine ? `<div class="debt-mine">منهن <b>${fmt(mine)}</b> إلك — اللي معه انبعتلك، والباقي بيوصلك أول ما يجيه مصاري</div>` : ''}
      ${my}
      <div class="row">${btn('debtBuy', '🏷️ اشتري منه عقار', mine ? 'gold' : '', !sellable.length)}${btn('debtGive', mine ? '💵 سامحه / ابعتله مصاري' : '💵 ابعتله مصاري')}</div>
      ${mine && sellable.length ? '<small class="hint">إذا اشتريت منه، سعر العقار بينحسب من الدين اللي إلك أول.</small>' : ''}</div>`;
  }

  function buildBtn(st) {
    if (S.buildMode) return `${btn('buildMode', '✔ خلصت', 'build-btn on')}<div class="build-hint">🏗️ اضغط على مدينة مضوية لتعمّر — Esc للخروج</div>`;
    const n = buildableTiles(st).length;
    return btn('buildMode', '🏗️ عمّر', 'build-btn', !n, n ? '' : 'title="لازم تملك كل مدن دولة ويكون معك حق البيت"');
  }
  function auctionHTML(st, me) {
    const a = st.game.auction, t = T(a.idx), b = a.bidder && st.players.find((p) => p.id === a.bidder);
    const seller = a.seller && st.players.find((p) => p.id === a.seller);
    const pr = st.game.props[a.idx];
    const can = me && !me.bankrupt && a.bidder !== me.id && a.seller !== me.id;
    const base = Math.max(a.min || 0, 10);
    const opts = a.bid === 0
      ? (a.min ? [a.min, a.min + 50, a.min + 100] : [base, Math.max(20, Math.round(t.price / 2 / 10) * 10), t.price])
      : [a.bid + 10, a.bid + 50, a.bid + 100];
    let foot = '';
    if (can) foot = `<div class="row">${opts.map((v) => btn('bid', fmt(v), v > me.money ? '' : 'gold sm', v > me.money, `data-v="${v}"`)).join('')}</div>`;
    else if (me && a.seller === me.id) foot = '<div class="hint">عم تبيع عقارك — المصاري رح توصلك إنت 💰</div>';
    else if (me && a.bidder === me.id) foot = '<div class="hint">أنت صاحب أعلى مزايدة 👌</div>';
    return `<div class="offer2 auction-wrap">${deedHTML(a.idx)}<div class="auction">
      <div class="a-title"><span class="a-gavel">${ART.icon('gavel')}</span> ${seller ? `<span><b>${esc(seller.name)}</b> عم يبيع <b>${esc(t.name)}</b></span>` : `مزاد على <b>${esc(t.name)}</b>`}</div>
      <div class="hint" data-live="min">${a.min ? `أقل سعر ${fmt(a.min)}` : ''}${a.min && pr && pr.mortgaged ? ' · ' : ''}${pr && pr.mortgaged ? 'مرهونة' : ''}</div>
      <div class="a-bid" data-live="bid" data-v="${a.bid}">${a.bid ? fmt(a.bid) : '—'}</div>
      <div class="a-who" data-live="who">${b ? `<span class="tk a-av" style="--pc:${b.color}">${ART.piece(b.piece)}</span> ${esc(b.name)}` : 'لسا ما حدا زاود'}</div>
      <div class="a-lots" data-live="lots">${a.lots > 1 ? `<b>لوت ${a.lot} من ${a.lots}</b>${(st.game.auctionQueue || []).map((l) => `<span class="lot-chip">${esc(T(l.idx).name)}</span>`).join('')}` : ''}</div>
      <div class="a-timer"><div class="a-bar" id="aucBar"></div></div><div class="hint" id="aucTimer"></div>
      <div class="a-foot" data-live="foot">${foot}</div>
    </div></div>`;
  }
  function tick() {
    const st = S.room;
    if (!st || !st.game || st.status !== 'playing') return;
    const g = st.game;
    const tt = $('#turnTimer');
    if (tt && g.turnEndsAt) {
      const s = Math.max(0, Math.ceil((g.turnEndsAt - nowSrv()) / 1000));
      tt.textContent = s + ' ث';
      tt.classList.toggle('low', s <= 10);
    }
    const at = $('#aucTimer');
    if (at && g.auction) {
      const left = Math.max(0, g.auction.endsAt - nowSrv());
      at.textContent = 'بيسكّر بعد ' + Math.ceil(left / 1000) + ' ثانية';
      const bar = $('#aucBar');
      if (bar) { bar.style.width = Math.min(100, (left / 8000) * 100) + '%'; bar.classList.toggle('low', left < 2500); }
    }
  }
  async function onCenterAction(el) {
    const a = el.dataset.a;
    if (a === 'info') { openTile(Number(el.dataset.i)); return; }
    if (a === 'bid') { act('bid', { amount: Number(el.dataset.v) }); return; }
    if (a === 'buildMode') { setBuildMode(!S.buildMode); return; }
    if (a === 'dacc') { act('debtOfferAccept', { id: Number(el.dataset.id) }); return; }
    if (a === 'ddec') { act('debtOfferDecline', { id: Number(el.dataset.id) }); return; }
    if (a === 'debtBuy') { openDebtBuy(); return; }
    if (a === 'debtGive') { openDebtGive(); return; }
    if (a === 'sellmany') { openSellMany(); return; }
    if (a === 'roll') FX.Sound.play('dice-shake');
    if (a === 'bankrupt') { if (await confirmBox('أكيد بدك تعلن الإفلاس؟ المصاري اللي معك بتروح للي إله الدين، وكل عقاراتك بترجع للبنك وبتصير للبيع من جديد. بتضل بالغرفة تتفرّج وفيك تلعب الجولة الجاية.')) act('bankrupt'); return; }
    el.disabled = true;
    // a roll names the throw it answers: a late or double click (e.g. after the autopilot already rolled) does nothing
    act(a, a === 'roll' && S.room && S.room.game ? { seq: S.room.game.rollSeq } : {}).then(() => { el.disabled = false; });
  }

  // ---------------------------------------------------------------- side panel
  const TOGGLES = [
    ['isPrivate', 'غرفة خاصة', 'ما بتظهر بقائمة الغرف — بس بالرابط'],
    ['doubleRent', 'ضعف الإيجار للدولة الكاملة', 'إذا ملكت كل مدن الدولة بدون بيوت، الإيجار بيتضاعف'],
    ['vacationCash', 'صندوق الاستراحة', 'الضرائب والغرامات بتتجمّع، واللي بيوقف عالاستراحة بياخدها'],
    ['auction', 'المزاد', 'إذا اللاعب ما اشترى العقار، بينعرض بالمزاد للكل'],
    ['noRentInJail', 'لا إيجار للمسجون', 'صاحب العقار ما بيقبض إيجار وهو بالسجن'],
    ['evenBuild', 'البناء بالتساوي', 'لازم تعمّر بيوت الدولة بالتساوي'],
    ['mortgage', 'الرهن', 'بتقدر ترهن عقاراتك للبنك بنص سعرها'],
    ['randomOrder', 'ترتيب عشوائي', 'ترتيب الأدوار بيتحدّد عشوائي ببداية اللعبة'],
  ];
  // Unpaid debt of a player. The engine keeps money >= 0 and puts the shortfall in
  // g.debts, which always belongs to the current player; we show it as negative money.
  function owedBy(st, p) {
    const g = st.game;
    if (!g || !g.debts || !g.debts.length || p.bankrupt || g.order[g.turn] !== p.id) return 0;
    return g.debts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  }
  function netWorth(st, p) {
    const g = st.game;
    if (!g || p.bankrupt) return 0;
    let w = p.money;
    for (const [k, pr] of Object.entries(g.props)) {
      if (pr.owner !== p.id) continue;
      const t = T(Number(k));
      w += pr.mortgaged ? t.price / 2 : t.price;
      if (pr.houses) w += pr.houses * t.houseCost;
    }
    return w - owedBy(st, p);
  }
  function playerRow(p, st, maxWorth) {
    const g = st.game, me = meP(st);
    const isCur = g && st.status === 'playing' && g.order[g.turn] === p.id;
    const icons = (p.id === st.hostId ? '👑' : '') + (p.isBot ? '🤖' : '') + (!p.connected && !p.left ? '📴' : '') + (p.inJail ? '🔒' : '') + (p.bankrupt ? '💀' : '') + (p.jailCards ? '🎫' : '');
    const avatar = `<span class="tk av" style="--pc:${p.color}">${ART.piece(p.piece)}</span>`;
    const nm = p.username ? `<a href="/u/${esc(p.username)}" target="_blank" class="plink" title="@${esc(p.username)}">${esc(p.name)}</a>` : esc(p.name);
    const pts = p.points != null ? `<small class="ptag" title="نقاط الحساب">⭐ ${p.points}</small>` : '';
    const watching = p.bankrupt && !p.left && st.status !== 'lobby' ? ' <small class="hint">مفلس · بيتفرّج</small>' : '';
    const name = `<span class="pname">${nm}${S.me && p.id === S.me.pid ? ' <small class="hint">(أنت)</small>' : ''}${watching}</span>${pts}<span class="icons">${icons}</span>`;
    if (st.status === 'lobby') {
      const kick = isHost(st) && p.id !== st.hostId ? `<button class="x-btn" data-kick="${p.id}" title="طلّعه">✕</button>` : '';
      return `<div class="prow" data-prow="${p.id}">${avatar}${name}${kick}</div>`;
    }
    const canDeal = st.status === 'playing' && me && !me.bankrupt && p.id !== me.id && !p.bankrupt;
    const trade = canDeal ? `<button class="btn sm" data-trade="${p.id}" title="تبادل عقارات ومصاري">🤝</button><button class="btn sm" data-loan="${p.id}" title="قرض">💰</button>` : '';
    // while a walk is still on screen the row keeps the old money (it changes when the piece arrives)
    const held = p.id in S.held ? S.held[p.id] : null;
    const worth = netWorth(st, p), owed = held != null ? 0 : owedBy(st, p);
    const cash = held != null ? held : owed > 0 ? -owed : p.money;
    const chips = ownedBy(st, p.id).map((i) => {
      const t = T(i), pr = g.props[i];
      const c = t.type === 'city' ? SET(t.set).color : '#8ea3b8';
      return `<i class="pchip ${pr.mortgaged ? 'mort' : ''}" style="background:${c}" title="${esc(t.name)}"></i>`;
    }).join('');
    // Compact row: avatar | name over money (money on the right, under the name) | deal buttons.
    const money = p.bankrupt ? '<span class="pmoney">—</span>'
      : `<span class="pmoney ${owed > 0 ? 'neg' : ''}" data-money="${held != null ? held : p.money}">${sfmt(cash)}</span>${owed > 0 ? '<small class="debt-tag">عليه دين</small>' : ''}`;
    return `<div class="prow big ${isCur ? 'turn-on' : ''} ${p.bankrupt || p.left ? 'dead' : ''}" data-prow="${p.id}">
      <div class="prow-top">${avatar}<div class="pinfo"><div class="pline">${name}</div><div class="pline">${money}</div></div>${trade ? `<span class="pdeal">${trade}</span>` : ''}</div>
      ${p.bankrupt ? '' : `<div class="worth"><div class="worth-bar"><i style="width:${maxWorth ? Math.max(0, Math.round((worth / maxWorth) * 100)) : 0}%;background:${p.color}"></i></div><small class="${worth < 0 ? 'neg' : ''}">الثروة ${sfmt(worth)}</small></div>
      ${chips ? `<div class="pchips">${chips}</div>` : ''}`}
    </div>`;
  }
  // Lobby: pick your colour (unique in the room; the server checks it too). Taken colours show who has them.
  function colorsHTML(st) {
    const me = meP(st);
    if (!me) return '';
    const list = st.colors || [];
    return `<div class="panel"><div class="lbl">لونك باللعبة <small>كل لاعب إله لون</small></div><div class="color-grid">${list.map((c) => {
      const owner = st.players.find((p) => p.color === c);
      const mine = owner && owner.id === me.id;
      return `<button type="button" class="color-btn ${mine ? 'on' : ''} ${owner && !mine ? 'taken' : ''}" data-color="${c}" style="--c:${c}" ${owner && !mine ? 'disabled' : ''}
        title="${owner ? esc(owner.name) : 'متاح'}"><i></i>${owner && !mine ? `<small>${esc(owner.name)}</small>` : mine ? '<small>لونك</small>' : ''}</button>`;
    }).join('')}</div></div>`;
  }
  // Lobby: pick your piece.
  function piecesHTML(st) {
    const me = meP(st);
    if (!me) return '';
    return `<div class="panel"><div class="lbl">قطعتك باللعبة</div><div class="piece-grid">${ART.PIECE_KEYS.map((k) => {
      const owner = st.players.find((p) => p.piece === k);
      const mine = owner && owner.id === me.id;
      return `<button class="piece-btn ${mine ? 'on' : ''}" data-piece="${k}" ${owner && !mine ? 'disabled' : ''} title="${ART.pieceLabel(k)}">
        <span class="tk" style="--pc:${owner ? owner.color : '#2a3a4d'}">${ART.piece(k)}</span><small>${owner && !mine ? esc(owner.name) : ART.pieceLabel(k)}</small></button>`;
    }).join('')}</div></div>`;
  }
  // The 8 countries on this room's board, most valuable first.
  // Board map picker (lobby). Paid maps need to be owned by the host's account.
  function mapsHTML(st) {
    const host = isHost(st), cur = MAP() || { id: 'classic', name: 'كلاسيك عربي' };
    const list = (S.maps || []).filter((m) => m.enabled);
    const cards = list.map((m) => {
      const can = host && m.owned;
      const tag = m.id === cur.id ? '<small class="m-on">مختارة</small>' : m.owned ? '' : `<small class="m-price">${m.price} ${ART.ui('star')}</small>`;
      return `<${can ? 'button' : 'div'} class="map-pick ${m.id === cur.id ? 'on' : ''} ${m.owned ? '' : 'locked'}" ${can ? `data-mapid="${m.id}"` : ''} style="--a:${(m.theme && m.theme.accent) || '#00b4ff'};--b:${(m.theme && m.theme.tile2) || '#0e1c3d'}">
        <span class="mp-sw">${(m.theme && m.theme.sets ? m.theme.sets : Object.values(S.board.sets).map((x) => x.color)).slice(0, 8).map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <b>${esc(m.name)}</b>${tag}${m.owned ? '' : ART.ui('lock', 'm-lock')}</${can ? 'button' : 'div'}>`;
    }).join('');
    return `<div class="panel"><div class="lbl"><span>🗺️ خريطة اللوح</span><a class="btn sm" href="/store" target="_blank">🛒 المتجر</a></div>
      <div class="map-picks">${cards}</div>
      <div class="hint" style="text-align:start;margin-top:6px">${host ? (ACC.me ? 'الخرائط المقفولة بتشتريها بالنقاط من المتجر.' : 'سجّل دخول لتستعمل الخرائط اللي اشتريتها.') : 'صاحب الغرفة بيختار الخريطة.'}</div></div>`;
  }
  function themedSetsHTML() {
    const m = MAP();
    return `<div class="panel"><div class="lbl"><span>🌍 مناطق «${esc(m.name)}»</span></div><div class="country-list">${m.sets.slice().reverse().map((set, n) => {
      const k = SLOT_KEYS[7 - n];
      return `<div class="country"><span class="sw" style="background:${SET(k).color}"></span>${set.flag ? flag(set.flag, 'sm') : `<span class="flag emblem sm" style="--ec:${SET(k).color}"><i></i></span>`}<b>${esc(set.name)}</b><small>${n === 0 ? 'الأغلى' : n === 7 ? 'الأرخص' : ''}</small></div>`;
    }).join('')}</div></div>`;
  }
  function countriesHTML(st) {
    if (MAP() && MAP().id !== 'classic') return themedSetsHTML();
    const keys = Object.keys(S.board.sets).reverse();
    const host = isHost(st);
    return `<div class="panel"><div class="lbl"><span>🌍 دول اللوح</span>${host ? '<button class="btn sm" data-shuffle>🎲 دول عشوائية</button>' : ''}</div>
      <div class="country-list">${keys.map((k, n) => {
        const code = st.map && st.map[k], c = code && S.board.countries[code];
        if (!c) return '';
        const pick = host && !(S.board.fixed && S.board.fixed[k] === code); // Syria, Jordan, Iraq can't be changed
        return `<${pick ? 'button' : 'div'} class="country ${pick ? 'pick' : ''}" ${pick ? `data-slot="${k}"` : ''}><span class="sw" style="background:${SET(k).color}"></span>${flag(code, 'sm')}<b>${esc(c.name)}</b><small>${S.board.fixed && S.board.fixed[k] === code ? (n === 0 ? 'ثابتة · الأغلى' : 'ثابتة') : n === keys.length - 1 ? 'الأرخص' : ''}</small></${pick ? 'button' : 'div'}>`;
      }).join('')}</div>
      <div class="hint" style="text-align:start;margin-top:6px">سوريا والأردن والعراق دايماً موجودين، والباقي 5 دول عربية عشوائية${host ? ' — اضغط على أي دولة لتختار بدالها.' : '. صاحب الغرفة بيختار الدول.'}</div></div>`;
  }
  // Host picks a country for one board slot.
  function openCountryPicker(slot) {
    S.modal = { kind: 'country', slot };
    const st = S.room, map = st.map || {}, cur = map[slot];
    const arab = S.board.arab.filter((c) => S.board.countries[c]);
    const slotOf = (code) => Object.keys(map).find((k) => map[k] === code);
    // countries whose flags look alike can't be on the board together: picking one removes its look-alike
    const groups = S.board.lookalike || [];
    const twins = (code) => Object.keys(map).filter((k) => k !== slot && map[k] && map[k] !== code && groups.some((g) => g.includes(code) && g.includes(map[k]))).map((k) => map[k]);
    const btns = (list) => list.map((code) => {
      // unavailable: a fixed country or a look-alike of one (the server refuses it with the same reason)
      const na = code !== cur && S.board.unavailable && S.board.unavailable[code];
      if (na) return `<button class="cpick na" disabled title="${esc(na)}" style="opacity:.5;cursor:not-allowed">${flag(code, 'mid0')}<span>${esc(S.board.countries[code].name)}</span><small class="cp-out">${ART.ui('lock')}مو متاحة — ${esc(na)}</small></button>`;
      const used = slotOf(code), out = code === cur ? [] : twins(code);
      const outNames = out.map((c) => S.board.countries[c] ? S.board.countries[c].name : c).join('، ');
      return `<button class="cpick ${code === cur ? 'on' : ''} ${out.length ? 'twin' : ''}" data-code="${code}" title="${used && used !== slot ? 'موجودة عاللوح — رح تتبادل' : ''}${out.length ? `${used && used !== slot ? ' · ' : ''}علمها بيشبه علم ${esc(outNames)} — ${esc(outNames)} رح تطلع من اللوح` : ''}">${flag(code, 'mid0')}<span>${esc(S.board.countries[code].name)}</span>${used && used !== slot ? `<i class="used" style="background:${SET(used).color}"></i>` : ''}${out.length ? `<small class="cp-out">${ART.ui('warn')}بتطلع ${esc(outNames)}</small>` : ''}</button>`;
    }).join('');
    const body = `<div class="hint" style="text-align:start">اختار دولة لخانة اللون <span class="sw-inline" style="background:${SET(slot).color}"></span>. إذا الدولة موجودة بمكان تاني عاللوح، بيتبدّلوا. والدول اللي أعلامها بتتشابه ما بيكونوا عاللوح سوا: إذا اخترت وحدة منهن، الشبيهة بتطلع (مكتوبة تحت اسمها).</div>
      <h4 class="pick-h">الدول العربية</h4><div class="cgrid">${btns(arab)}</div>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell('🌍 اختار دولة', body, 'wide');
    bindModal(root);
    $$('[data-code]', root).forEach((b) => { b.onclick = () => { act('setCountry', { slot, code: b.dataset.code }); closeModal(); }; });
  }
  function settingsHTML(st) {
    const s = st.settings, host = isHost(st), dis = host ? '' : 'disabled';
    const cash = S.board.cashOptions.map((v) => `<button class="chip ${v === s.startingCash ? 'on' : ''}" data-cash="${v}" ${dis}>${fmt(v)}</button>`).join('');
    const maxOpts = [2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${n === s.maxPlayers ? 'selected' : ''}>${n}</option>`).join('');
    const timerOpts = [[0, 'بدون'], [60, '60 ثانية'], [90, '90 ثانية'], [120, '120 ثانية']].map(([v, l]) => `<option value="${v}" ${v === s.turnTimer ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="panel">
      <div class="lbl">إعدادات الغرفة ${host ? '' : '<small>(بس صاحب الغرفة بيغيّرها)</small>'}</div>
      <div class="set-row" style="border:0;padding-bottom:0"><div class="st"><b>💵 المبلغ الابتدائي</b><small>كل لاعب بيبلّش بهالمبلغ</small></div></div>
      <div class="cash-opts">${cash}</div>
      <div class="set-row"><div class="st"><b>عدد اللاعبين الأقصى</b><small>كم لاعب بيقدر يفوت</small></div><select data-set="maxPlayers" ${dis}>${maxOpts}</select></div>
      <div class="set-row"><div class="st"><b>وقت الدور</b><small>إذا خلص الوقت، اللعبة بتكمّل عنك</small></div><select data-set="turnTimer" ${dis}>${timerOpts}</select></div>
      ${TOGGLES.map(([k, title, desc]) => `<div class="set-row"><div class="st"><b>${title}</b><small>${desc}</small></div><label class="switch"><input type="checkbox" data-toggle="${k}" ${s[k] ? 'checked' : ''} ${dis}><span></span></label></div>`).join('')}
    </div>`;
  }
  function ownedBy(st, pid) {
    const g = st.game;
    if (!g) return [];
    return Object.keys(g.props).map(Number).filter((i) => g.props[i].owner === pid).sort((a, b) => a - b);
  }
  function propLabel(i) {
    const t = T(i);
    const sw = t.type === 'city' ? SET(t.set).color : '#4b5d73';
    return `<span class="sw" style="background:${sw}"></span>${t.type === 'city' ? mark(t, 'sm') : `<span class="mini-icon">${ART.icon(iconName(t))}</span>`}${esc(t.name)}`;
  }
  function tradeSummary(st, side) {
    const parts = side.props.map((i) => esc(T(i).name));
    if (side.money) parts.push(fmt(side.money));
    return parts.length ? parts.join('، ') : 'ولا شي';
  }
  function loansHTML(st, me) {
    const g = st.game, name = (id) => { const p = st.players.find((x) => x.id === id); return p ? esc(p.name) : ''; };
    const mine = (g.loans || []).filter((l) => l.lender === me.id || l.borrower === me.id);
    if (!mine.length) return '';
    const terms = (l) => `${fmt(l.amount)} — بيرجعوا ${fmt(l.repay)} (${l.interest}%) خلال ${l.rounds} جولات`;
    return `<div class="panel"><div class="lbl">💰 القروض</div>${mine.map((l) => {
      if (l.state === 'offer') {
        if (l.proposer === me.id) {
          return `<div class="trade-card">⏳ ${l.lender === me.id ? `عرضت تقرض <b>${name(l.borrower)}</b>` : `طلبت قرض من <b>${name(l.lender)}</b>`}<br>${terms(l)}<div class="row"><button class="btn sm" data-ldec="${l.id}">اسحب العرض</button></div></div>`;
        }
        return `<div class="trade-card">💰 ${l.lender === me.id ? `<b>${name(l.borrower)}</b> بدو يستلف منك` : `<b>${name(l.lender)}</b> بدو يقرضك`}<br>${terms(l)}
          <div class="row"><button class="btn sm gold" data-lacc="${l.id}">قبول</button><button class="btn sm danger" data-ldec="${l.id}">رفض</button></div></div>`;
      }
      const left = l.dueRound - g.round;
      const when = left > 0 ? `بعد ${left} ${left === 1 ? 'جولة' : 'جولات'}` : 'هالجولة';
      if (l.borrower === me.id) {
        return `<div class="trade-card loan-due">📌 عليك ترجّع <b>${fmt(l.repay)}</b> لـ <b>${name(l.lender)}</b> ${when}<div class="row"><button class="btn sm gold" data-lrep="${l.id}" ${me.money < l.repay ? 'disabled' : ''}>سدّد هلق</button></div></div>`;
      }
      return `<div class="trade-card">📈 <b>${name(l.borrower)}</b> رح يرجعلك <b>${fmt(l.repay)}</b> ${when}</div>`;
    }).join('')}</div>`;
  }
  function updateSide(st) {
    const el = $('#sideB'), me = meP(st), g = st.game;
    let h = '';
    if (!S.me) h += '<div class="spectator">👀 أنت عم تتفرّج</div>';
    const list = g ? g.order.map((id) => st.players.find((p) => p.id === id)).filter(Boolean) : st.players;
    const maxWorth = Math.max(1, ...list.map((p) => netWorth(st, p)));
    h += `<div class="panel"><div class="lbl"><span>اللاعبين (${st.players.filter((p) => !p.left).length}${st.status === 'lobby' ? '/' + st.settings.maxPlayers : ''})</span>${g ? `<small>الجولة ${g.round}</small>` : ''}</div>
      ${list.map((p) => playerRow(p, st, maxWorth)).join('')}
      ${st.status === 'lobby' && isHost(st) && st.players.length < st.settings.maxPlayers ? '<button class="btn sm block" data-addbot>🤖 ضيف لاعب آلي</button>' : ''}
    </div>`;
    if (st.status === 'lobby') {
      h += colorsHTML(st);
      h += piecesHTML(st);
      h += mapsHTML(st);
      h += countriesHTML(st);
      h += settingsHTML(st);
      if (S.me) h += '<button class="btn ghost sm" data-leave>اطلع من الغرفة</button>';
    } else {
      if (st.settings.vacationCash) h += `<div class="panel pot-box"><span>🏖️ صندوق الاستراحة</span><b>${fmt(g.pot)}</b></div>`;
      if (me && g.trades.length) {
        const mine = g.trades.filter((t) => t.to === me.id || t.from === me.id);
        if (mine.length) {
          h += `<div class="panel"><div class="lbl">الصفقات</div>${mine.map((t) => {
            const from = st.players.find((p) => p.id === t.from), to = st.players.find((p) => p.id === t.to);
            if (t.to === me.id) {
              return `<div class="trade-card">🤝 <b>${esc(from ? from.name : '')}</b> بيعرض عليك:<br>بيعطيك: ${tradeSummary(st, t.give)}<br>بدو منك: ${tradeSummary(st, t.get)}<div class="row">${'<button class="btn sm gold" data-tacc="' + t.id + '">قبول</button><button class="btn sm danger" data-tdec="' + t.id + '">رفض</button>'}</div></div>`;
            }
            return `<div class="trade-card">⏳ عرضك على <b>${esc(to ? to.name : '')}</b>:<br>بتعطي: ${tradeSummary(st, t.give)}<br>بتاخد: ${tradeSummary(st, t.get)}<div class="row"><button class="btn sm" data-tdec="${t.id}">اسحب العرض</button></div></div>`;
          }).join('')}</div>`;
        }
      }
      if (me) h += loansHTML(st, me);
      if (me) {
        const mine = ownedBy(st, me.id);
        const canSell = mine.length && st.status === 'playing' && !g.auction && g.order[g.turn] === me.id && ['roll', 'done', 'debt'].includes(g.phase) && !me.bankrupt;
        h += `<div class="panel"><div class="lbl"><span>أملاكي (${mine.length})</span>${mine.length ? `<button class="btn sm" data-sellmany ${canSell ? '' : 'disabled title="بدورك بس، وما يكون في مزاد"'}>🔨 بيع بالمزاد</button>` : ''}</div><div class="props-list">${mine.length ? mine.map((i) => {
          const pr = g.props[i];
          const meta = pr.mortgaged ? 'مرهونة' : pr.houses === 5 ? '🏨' : pr.houses ? '🏠×' + pr.houses : '';
          return `<div class="prop-item" data-prop="${i}">${propLabel(i)}<span class="meta">${meta}</span></div>`;
        }).join('') : '<div class="hint">لسا ما اشتريت شي</div>'}</div></div>`;
      }
      const s = st.settings;
      h += `<div class="panel"><details><summary>قواعد هالغرفة</summary><ul class="rules-list">
        <li>المبلغ الابتدائي: ${fmt(s.startingCash)}</li>
        ${TOGGLES.filter(([k]) => k !== 'isPrivate').map(([k, title]) => `<li>${title}: ${s[k] ? '✅' : '❌'}</li>`).join('')}
        <li>وقت الدور: ${s.turnTimer ? s.turnTimer + ' ثانية' : 'بدون'}</li></ul></details></div>`;
      // Giving up = bankruptcy: the player stays in the room as a spectator (board, chat, the end, the next game).
      if (me && !me.bankrupt && st.status === 'playing') h += '<button class="btn ghost sm" data-giveup>انسحاب (أعلن الإفلاس وكمّل تفرّج)</button>';
      if (me && me.bankrupt && st.status === 'playing') h += '<div class="panel hint" style="text-align:center">💀 أفلست — عم تتفرّج عاللعبة. إذا صاحب الغرفة بلّش جولة جديدة بتلعب معهم.</div>';
      if (S.me && (st.status === 'ended' || (me && me.bankrupt))) h += '<button class="btn ghost sm" data-leave>اطلع من الغرفة</button>';
    }
    el.innerHTML = h;
  }
  async function onSideClick(e) {
    const t = e.target;
    const cash = t.closest('[data-cash]');
    if (cash && !cash.disabled) { act('settings', { startingCash: Number(cash.dataset.cash) }); return; }
    if (t.closest('[data-addbot]')) { act('addBot'); return; }
    const mp = t.closest('[data-mapid]');
    if (mp) { act('setMap', { id: mp.dataset.mapid }); return; }
    const sh = t.closest('[data-shuffle]');
    if (sh) { act('shuffleMap'); return; }
    const slot = t.closest('[data-slot]');
    if (slot) { openCountryPicker(slot.dataset.slot); return; }
    const loanBtn = t.closest('[data-loan]');
    if (loanBtn) { openLoan(loanBtn.dataset.loan); return; }
    const la = t.closest('[data-lacc]');
    if (la) { act('loanAccept', { id: Number(la.dataset.lacc) }); return; }
    const ld = t.closest('[data-ldec]');
    if (ld) { act('loanDecline', { id: Number(ld.dataset.ldec) }); return; }
    const lr = t.closest('[data-lrep]');
    if (lr) { act('loanRepay', { id: Number(lr.dataset.lrep) }); return; }
    const col = t.closest('[data-color]');
    if (col && !col.disabled) { act('color', { color: col.dataset.color }); return; }
    const pc = t.closest('[data-piece]');
    if (pc && !pc.disabled) { act('piece', { piece: pc.dataset.piece }); return; }
    const kick = t.closest('[data-kick]');
    if (kick) { act('kick', { pid: kick.dataset.kick }); return; }
    const tr = t.closest('[data-trade]');
    if (tr) { openTrade(tr.dataset.trade); return; }
    const acc = t.closest('[data-tacc]');
    if (acc) { act('tradeAccept', { id: Number(acc.dataset.tacc) }); return; }
    const dec = t.closest('[data-tdec]');
    if (dec) { act('tradeDecline', { id: Number(dec.dataset.tdec) }); return; }
    if (t.closest('[data-sellmany]')) { openSellMany(); return; }
    const prop = t.closest('[data-prop]');
    if (prop) { openTile(Number(prop.dataset.prop)); return; }
    if (t.closest('[data-giveup]')) {
      if (await confirmBox('إذا انسحبت بتعتبر مفلس: مصاريك بتروح للي إله دين عليك (إذا في)، وعقاراتك بترجع للبنك وبتصير للبيع. بتضل بالغرفة تتفرّج. أكيد؟')) act('bankrupt');
      return;
    }
    if (t.closest('[data-leave]')) {
      const me = meP();
      const playing = S.room.status === 'playing' && me && !me.bankrupt;
      if (!(await confirmBox(playing ? 'إذا طلعت رح تعتبر مفلس وأملاكك بترجع للبنك. أكيد؟' : 'أكيد بدك تطلع من الغرفة؟'))) return;
      await act('leave');
      store.del(credsKey(S.code));
      location.href = '/';
    }
  }
  function onSideChange(e) {
    const t = e.target;
    if (t.dataset.toggle) act('settings', { [t.dataset.toggle]: t.checked });
    else if (t.dataset.set) act('settings', { [t.dataset.set]: Number(t.value) });
  }

  // ---------------------------------------------------------------- chat
  // The chat lives in a drawer behind the 💬 button; new messages from others bump the badge.
  function updateChat(st) {
    const list = $('#chatList');
    if (!list) return;
    $('#chatIn').disabled = !S.me;
    const n = st.chat.length, lastT = n ? st.chat[n - 1].t : 0;
    if (S.chatLastT === null) S.chatLastT = lastT; // what is already there on arrival counts as read
    else if (lastT > S.chatLastT) {
      const fresh = st.chat.filter((m) => m.t > S.chatLastT && !(S.me && m.pid === S.me.pid)).length;
      if (fresh) FX.Sound.play('chat');
      if (!S.chatOpen) S.chatUnread += fresh;
      S.chatLastT = lastT;
    }
    renderChatBadge();
    const key = n ? lastT + ':' + n : '0';
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.innerHTML = n
      ? st.chat.map((m) => {
        if (m.sys || !m.pid) return `<div class="chat-msg sys"><div class="cm-text">${esc(m.text)}</div></div>`; // system line: dim, no name
        const p = st.players.find((x) => x.id === m.pid), c = (p && p.color) || m.color || '#2fe2ff';
        const mine = S.me && m.pid === S.me.pid;
        const time = new Date(m.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `<div class="chat-msg ${mine ? 'me' : ''}" style="--nc:${c}"><div class="cm-head"><b class="cm-name">${esc(p ? p.name : m.name)}</b><time>${time}</time></div><div class="cm-text">${esc(m.text)}</div></div>`;
      }).join('')
      : '<div class="chat-empty">💬 لسا ما في رسائل</div>';
    list.scrollTop = list.scrollHeight;
  }
  function renderChatBadge() {
    const b = $('#chatBadge');
    if (!b) return;
    b.hidden = !S.chatUnread;
    b.textContent = S.chatUnread > 99 ? '99+' : String(S.chatUnread);
    $('#chatFab').classList.toggle('has-new', !!S.chatUnread);
  }
  function toggleChat(open = !S.chatOpen) {
    const d = $('#chatDrawer'), fab = $('#chatFab');
    if (!d) return;
    S.chatOpen = open;
    d.classList.toggle('open', open);
    d.setAttribute('aria-hidden', open ? 'false' : 'true');
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    fab.classList.toggle('on', open);
    if (open) {
      S.chatUnread = 0;
      renderChatBadge();
      const list = $('#chatList');
      list.scrollTop = list.scrollHeight;
      if (S.me && window.innerWidth > 820) setTimeout(() => $('#chatIn').focus(), 60);
    } else if (document.activeElement === $('#chatIn')) $('#chatIn').blur();
  }

  // ================================================================ modals
  function closeModal() { S.modal = null; S.trade = null; $('#modal-root').innerHTML = ''; }
  function modalShell(head, body, cls = '', band = '') {
    return `<div class="modal-back" data-close-back><div class="modal ${cls}">${band ? `<div class="modal-band" style="background:${band}"></div>` : ''}
      <div class="modal-head">${head}<button class="x-btn close" data-close>✕</button></div><div class="modal-body">${body}</div></div></div>`;
  }
  function bindModal(root) {
    root.querySelector('[data-close]').onclick = closeModal;
    root.querySelector('[data-close-back]').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close-back')) closeModal(); });
  }
  function confirmBox(text) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      S.modal = { kind: 'confirm' };
      root.innerHTML = modalShell('تأكيد', `<div>${esc(text)}</div><div class="row"><button class="btn danger" data-yes>أكيد</button><button class="btn" data-no>لا</button></div>`);
      const done = (v) => { S.modal = null; root.innerHTML = ''; resolve(v); };
      root.querySelector('[data-yes]').onclick = () => done(true);
      root.querySelector('[data-no]').onclick = () => done(false);
      root.querySelector('[data-close]').onclick = () => done(false);
    });
  }
  function openTile(i) { S.modal = { kind: 'tile', i }; renderModal(); }
  function tileDesc(t) {
    const s = S.room ? S.room.settings : {};
    switch (t.type) {
      case 'start': return `كل ما تمرّ من هون بتقبض ${fmt(S.board.goSalary)}.`;
      case 'jail': return `إذا انسجنت: جيب دبل لتطلع، أو ادفع ${fmt(S.board.jailFine)}، أو استخدم بطاقة الخروج. بعد 3 محاولات بتدفع الغرامة إجباري. إذا وقفت هون عادي، أنت بس زائر.`;
      case 'vacation': return s.vacationCash ? 'كل الضرائب والغرامات بتتجمّع هون، واللي بيوقف عالخانة بياخدها كلها.' : 'استراحة — ما بيصير شي.';
      case 'gotojail': return 'روح عالسجن مباشرة وما بتقبض من الانطلاق.';
      case 'tax': return t.percent ? `بتدفع ${t.percent}% من مصاريك.` : `بتدفع ${fmt(t.amount)}.`;
      case 'chance': return 'اسحب بطاقة حظ: ممكن تربح، تخسر، أو تتنقّل.';
      case 'chest': return 'اسحب بطاقة من الخزنة: مصاري، غرامات، أو مفاجآت.';
      default: return '';
    }
  }
  function renderModal() {
    const root = $('#modal-root');
    if (!S.modal || S.modal.kind !== 'tile') return;
    const i = S.modal.i, t = T(i), st = S.room, g = st && st.game;
    const pr = g && g.props[i];
    const owner = pr && st.players.find((p) => p.id === pr.owner);
    const me = meP(st);
    let body = '';
    if (t.type === 'city') {
      const r = t.rent, h = pr ? pr.houses : -1;
      const rows = [['الإيجار', r[0], h === 0], ['مع الدولة كاملة', r[0] * (st.settings.doubleRent ? 2 : 1), false],
        ['بيت 1', r[1], h === 1], ['بيتين', r[2], h === 2], ['3 بيوت', r[3], h === 3], ['4 بيوت', r[4], h === 4], ['🏨 فندق', r[5], h === 5]];
      body += `<table class="rent">${rows.map(([l, v, now]) => `<tr class="${now ? 'now' : ''}"><td>${l}</td><td>${fmt(v)}</td></tr>`).join('')}</table>
        <div class="kv"><span>سعر البيت/الفندق</span><b>${fmt(t.houseCost)}</b></div>
        <div class="kv"><span>الدولة</span><b style="direction:rtl;display:flex;align-items:center;gap:6px">${mark(t, 'sm')} ${esc(t.countryName)}</b></div>`;
    } else if (t.type === 'port') {
      body += `<table class="rent">${S.board.portRent.map((v, k) => `<tr><td>إذا عندك ${k + 1} ${k ? 'موانئ' : 'ميناء'}</td><td>${fmt(v)}</td></tr>`).join('')}</table>`;
    } else if (t.type === 'util') {
      body += '<div>إذا عندك شركة وحدة: الإيجار = مجموع النرد × 4<br>إذا عندك الشركتين: مجموع النرد × 10</div>';
    } else body += `<div>${tileDesc(t)}</div>`;
    if (t.price) {
      body += `<div class="kv"><span>السعر</span><b>${fmt(t.price)}</b></div><div class="kv"><span>قيمة الرهن</span><b>${fmt(t.mortgage)}</b></div>`;
      body += `<div class="kv"><span>المالك</span><b style="direction:rtl">${owner ? `<span class="pdot" style="background:${owner.color}"></span> ${esc(owner.name)}${pr.mortgaged ? ' (مرهونة)' : ''}` : 'للبيع — البنك'}</b></div>`;
    }
    if (me && owner && owner.id === me.id && st.status === 'playing' && !me.bankrupt) {
      const b = [];
      if (t.type === 'city') {
        const fullSet = S.board.setTiles[t.set].every((j) => g.props[j] && g.props[j].owner === me.id);
        if (fullSet && pr.houses < 5) b.push(`<button class="btn gold sm" data-m="build">${pr.houses === 4 ? '🏨 عمّر فندق' : '🏠 عمّر بيت'} (${fmt(t.houseCost)})</button>`);
        if (pr.houses > 0) b.push(`<button class="btn sm" data-m="sell">بيع بناء (+${fmt(Math.floor(t.houseCost / 2))})</button>`);
        if (!fullSet) body += `<div class="hint" style="text-align:start">🏠 لتعمّر بيوت لازم تملك كل مدن ${esc(t.countryName)}.</div>`;
      }
      if (st.settings.mortgage) {
        b.push(pr.mortgaged ? `<button class="btn sm" data-m="unmortgage">فك الرهن (${fmt(t.unmortgage)})</button>` : `<button class="btn sm" data-m="mortgage">🏦 ارهن (+${fmt(t.mortgage)})</button>`);
      }
      body += `<div class="row">${b.join('')}</div>`;
      if (st.settings.mortgage) body += `<div class="hint" style="text-align:start">🏦 الرهن: بتاخد نص سعرها من البنك هلق، وما بتقبض إيجارها لحتى تفكّ الرهن بـ ${fmt(t.unmortgage)}.</div>`;
      const built = t.type === 'city' && S.board.setTiles[t.set].some((j) => g.props[j] && g.props[j].houses > 0);
      const myTurn = g.order[g.turn] === me.id && ['roll', 'done', 'debt'].includes(g.phase);
      if (!g.auction && myTurn && !built) {
        body += `<div class="sell-auc"><b>🔨 بيعها بالمزاد</b><small class="hint">كل اللاعبين بيزاودوا، والمصاري بتوصلك إنت</small>
          <div class="row"><input type="number" id="aucMin" min="0" step="10" placeholder="أقل سعر (اختياري)" dir="ltr"><button class="btn sm gold" data-m="sellAuction">ابدأ المزاد</button></div></div>`;
      } else if (!g.auction && !built) {
        body += '<div class="hint" style="text-align:start">🔨 بتقدر تبيعها بالمزاد بدورك.</div>';
      } else if (built) {
        body += '<div class="hint" style="text-align:start">🔨 لتبيعها بالمزاد أو تبادلها، بيع الأبنية بالدولة أول.</div>';
      }
    }
    const band = t.type === 'city' ? SET(t.set).color : '';
    const keepMin = $('#aucMin') ? $('#aucMin').value : '';
    const hadFocus = document.activeElement && document.activeElement.id === 'aucMin';
    root.innerHTML = modalShell(`${t.type === 'city' ? mark(t, 'lg') : `<span class="head-icon">${ART.icon(iconName(t))}</span>`}${esc(t.name)}`, (t.price ? ownerTag(i) : '') + body, 'tile-card', band);
    bindModal(root);
    if ($('#aucMin')) { $('#aucMin').value = keepMin; if (hadFocus) $('#aucMin').focus(); }
    $$('[data-m]', root).forEach((b) => {
      b.onclick = () => {
        if (b.dataset.m === 'sellAuction') {
          act('sellAuction', { idx: i, min: Math.max(0, Math.floor(Number($('#aucMin').value) || 0)) });
          closeModal();
          return;
        }
        act(b.dataset.m, { idx: i });
      };
    });
  }

  // ---------------------------------------------------------------- deals: shared mini deed cards
  function hasBuildings(st, i) {
    const t = T(i), g = st.game;
    return t.type === 'city' && S.board.setTiles[t.set].some((j) => g.props[j] && g.props[j].houses > 0);
  }
  const propValue = (st, i) => (st.game.props[i] && st.game.props[i].mortgaged ? T(i).price / 2 : T(i).price);
  function miniDeed(st, i, attrs = '', on = false, disabled = false) {
    const t = T(i), pr = st.game.props[i];
    const col = t.type === 'city' ? SET(t.set).color : '#4b5d73';
    const art = t.type === 'city' ? mark(t, 'sm') : `<span class="mini-icon">${ART.icon(iconName(t))}</span>`;
    const tags = (pr && pr.mortgaged ? '<i class="md-tag">مرهونة</i>' : '') + (disabled ? '<i class="md-tag warn">فيها أبنية</i>' : '');
    return `<button type="button" class="mdeed ${on ? 'on' : ''}" style="--sc:${col}" ${attrs} ${disabled ? 'disabled' : ''}>
      <span class="md-band"></span><span class="md-art">${art}</span><b>${esc(t.name)}</b><small>${t.type === 'city' ? esc(t.countryName) + ' · ' : ''}${fmt(t.price)}</small>${tags}</button>`;
  }
  const avatarOf = (p) => `<span class="tk av" style="--pc:${p.color}">${ART.piece(p.piece)}</span>`;

  // ---------------------------------------------------------------- deal modal: «تبادل» (trade) and «قرض» (loan) in one window
  // One window, two tabs, the partner can be switched without closing; each side is clearly «بتعطي» / «بتاخد»,
  // amounts come from quick chips, a live preview shows the result, and one big button sends it.
  function openTrade(toId, prefill) { openDeal(toId, 'trade', prefill); }
  function openLoan(toId) { openDeal(toId, 'loan'); }
  function openDeal(toId, tab, prefill) {
    S.trade = prefill || { to: toId, give: new Set(), get: new Set(), giveMoney: 0, getMoney: 0 };
    S.loan = { to: toId, role: 'lend', amount: 200, interest: 10, rounds: 5 };
    S.modal = { kind: 'trade', tab };
    renderDeal();
  }
  function renderDeal() { if (S.modal && S.modal.tab === 'loan') renderLoan(); else renderTrade(); }
  function dealHead(me, them, tab, counter) {
    const others = S.room.players.filter((p) => p.id !== me.id && !p.bankrupt && !p.left);
    const tabs = counter ? '' : `<div class="deal-tabs">
        <button type="button" class="dtab ${tab === 'trade' ? 'on' : ''}" data-tab="trade">${ART.ui('handshake')}<span>تبادل عقارات</span></button>
        <button type="button" class="dtab ${tab === 'loan' ? 'on' : ''}" data-tab="loan">${ART.ui('moneybag')}<span>قرض</span></button></div>`;
    return `${tabs}<div class="deal-partners">${others.map((p) => `<button type="button" class="dp ${p.id === them.id ? 'on' : ''}" data-to="${p.id}" style="--pc:${p.color}" ${counter ? 'disabled' : ''}>
      <span class="tk" style="--pc:${p.color}">${ART.piece(p.piece)}</span><b>${esc(p.name)}</b><small>${fmt(p.money)}</small></button>`).join('')}</div>`;
  }
  function bindDealHead(root) {
    $$('[data-tab]', root).forEach((b) => { b.onclick = () => { S.modal.tab = b.dataset.tab; renderDeal(); }; });
    $$('[data-to]', root).forEach((b) => {
      b.onclick = () => {
        const to = b.dataset.to;
        if (S.modal.tab === 'trade' && S.trade.to !== to) S.trade = { to, give: new Set(), get: new Set(), giveMoney: 0, getMoney: 0 };
        S.loan.to = to;
        renderDeal();
      };
    });
  }
  function tradeBalance(st, give, get, giveMoney, getMoney) {
    const v = (set) => [...set].reduce((s2, i) => s2 + propValue(st, i), 0);
    return (v(give) + giveMoney) - (v(get) + getMoney); // > 0: good for the other side
  }
  function balanceText(diff, total) {
    if (Math.abs(diff) <= Math.max(10, total * 0.05)) return '<span class="bal even">⚖️ متوازنة</span>';
    return diff > 0 ? `<span class="bal them">لصالحه بـ ${fmt(diff)}</span>` : `<span class="bal me">لصالحك بـ ${fmt(-diff)}</span>`;
  }
  // «بعد الصفقة»: both players' cash and property count after the deal.
  function tradePreview(st, me, them, T2) {
    const myAfter = me.money - T2.giveMoney + T2.getMoney, theirAfter = them.money + T2.giveMoney - T2.getMoney;
    const n = (p) => ownedBy(st, p.id).length;
    const col = (p, label, after, props) => `<div class="pv-col" style="--pc:${p.color}"><b>${label}</b>
      <span class="pv-money"><s>${fmt(p.money)}</s>${ART.ui('arrow')}<b class="${after < 0 ? 'neg' : ''}">${fmt(after)}</b></span>
      <small>${props} ${props === 1 ? 'عقار' : 'عقارات'}</small></div>`;
    const diff = tradeBalance(st, T2.give, T2.get, T2.giveMoney, T2.getMoney);
    const total = tradeBalance(st, T2.give, new Set(), T2.giveMoney, 0) + tradeBalance(st, T2.get, new Set(), T2.getMoney, 0);
    return `<div class="pv-title">بعد الصفقة</div><div class="pv-cols">${col(me, 'أنت', myAfter, n(me) - T2.give.size + T2.get.size)}
      ${col(them, esc(them.name), theirAfter, n(them) + T2.give.size - T2.get.size)}</div>${balanceText(diff, total)}`;
  }
  function renderTrade() {
    const st = S.room, me = meP(st), them = st && st.players.find((p) => p.id === S.trade.to);
    if (!me || !them || them.bankrupt || st.status !== 'playing') { closeModal(); return; }
    const T2 = S.trade;
    // drop selections that are no longer valid
    for (const i of [...T2.give]) if (!st.game.props[i] || st.game.props[i].owner !== me.id) T2.give.delete(i);
    for (const i of [...T2.get]) if (!st.game.props[i] || st.game.props[i].owner !== them.id) T2.get.delete(i);
    T2.giveMoney = Math.min(T2.giveMoney, me.money); T2.getMoney = Math.min(T2.getMoney, them.money);
    const cards = (pid, set, side) => {
      const list = ownedBy(st, pid);
      if (!list.length) return `<div class="hint">${pid === me.id ? 'ما عندك عقارات' : 'ما عنده عقارات'}</div>`;
      return list.map((i) => miniDeed(st, i, `data-tp="${side}" data-i="${i}"`, set.has(i), hasBuildings(st, i))).join('');
    };
    const moneyBox = (side, max) => `<div class="money-box"><span class="mb-ico">${ART.ui('cash')}</span>
      <input type="number" min="0" max="${max}" step="10" data-money="${side}" value="${T2[side + 'Money'] || ''}" placeholder="$0" dir="ltr">
      <div class="chips-row">${[50, 100, 200, 500].map((v) => `<button type="button" class="chip" data-add="${side}" data-v="${v}">+${fmt(v)}</button>`).join('')}
      <button type="button" class="chip" data-add="${side}" data-v="all">الكل (${fmt(max)})</button><button type="button" class="chip ghost" data-add="${side}" data-v="0">مسح</button></div></div>`;
    const body = `${dealHead(me, them, 'trade', T2.counterOf)}
      <div class="deal2">
        <section class="dside give"><h4><span class="dtag">بتعطي</span><small>من عندك · معك ${fmt(me.money)}</small></h4>
          <div class="mdeeds">${cards(me.id, T2.give, 'give')}</div>${moneyBox('give', me.money)}</section>
        <div class="deal-mid" aria-hidden="true">${ART.ui('handshake')}</div>
        <section class="dside get"><h4><span class="dtag">بتاخد</span><small>من ${esc(them.name)} · معه ${fmt(them.money)}</small></h4>
          <div class="mdeeds">${cards(them.id, T2.get, 'get')}</div>${moneyBox('get', them.money)}</section>
      </div>
      <div class="deal-preview" id="dealPrev">${tradePreview(st, me, them, T2)}</div>
      <div class="deal-err" id="tErr"></div>
      <div class="hint">العقارات اللي بدولتها أبنية لازم تنباع أبنيتها قبل التبادل.</div>
      <button type="button" class="btn gold big block deal-go" id="tSend">${ART.ui('handshake')} ${T2.counterOf ? 'ابعت العرض المضاد' : 'ابعت العرض'} لـ ${esc(them.name)}</button>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell(T2.counterOf ? '🔄 عرض مضاد لـ ' + esc(them.name) : '🤝 صفقة مع ' + esc(them.name), body, 'wide deal');
    bindModal(root); bindDealHead(root);
    const refresh = () => {
      $('#dealPrev').innerHTML = tradePreview(st, me, them, T2);
      $$('[data-money]', root).forEach((inp) => { const v = T2[inp.dataset.money + 'Money']; if (Number(inp.value || 0) !== v) inp.value = v || ''; });
    };
    $$('[data-tp]', root).forEach((b) => {
      b.onclick = () => {
        const set = T2[b.dataset.tp], i = Number(b.dataset.i);
        if (set.has(i)) set.delete(i); else set.add(i);
        renderTrade();
      };
    });
    $$('[data-add]', root).forEach((b) => {
      b.onclick = () => {
        const side = b.dataset.add, key = side + 'Money', max = side === 'give' ? me.money : them.money, v = b.dataset.v;
        T2[key] = v === 'all' ? max : v === '0' ? 0 : Math.min(max, (T2[key] || 0) + Number(v));
        refresh();
      };
    });
    $$('[data-money]', root).forEach((inp) => {
      inp.oninput = () => {
        const side = inp.dataset.money, max = side === 'give' ? me.money : them.money;
        T2[side + 'Money'] = Math.max(0, Math.min(max, Math.floor(Number(inp.value) || 0)));
        $('#dealPrev').innerHTML = tradePreview(st, me, them, T2);
      };
      inp.onchange = refresh;
    });
    $('#tSend').onclick = async () => {
      const errEl = $('#tErr');
      const bad = !T2.give.size && !T2.get.size ? 'لازم تختار عقار واحد على الأقل (منك أو منه)'
        : T2.giveMoney > me.money ? `ما معك ${fmt(T2.giveMoney)}`
          : T2.getMoney > them.money ? `${them.name} ما معه ${fmt(T2.getMoney)}` : '';
      if (bad) { errEl.textContent = '⚠️ ' + bad; FX.Sound.play('error'); return; }
      const data = { to: T2.to, give: { props: [...T2.give], money: T2.giveMoney }, get: { props: [...T2.get], money: T2.getMoney } };
      try {
        await api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type: 'tradePropose', data });
        if (T2.counterOf) act('tradeDecline', { id: T2.counterOf });
        closeModal();
        FX.Sound.play('trade-send');
        toast(T2.counterOf ? 'انبعت العرض المضاد ✔' : 'انبعت العرض ✔', 'ok');
      } catch (e) { errEl.textContent = '⚠️ ' + e.message; FX.Sound.play('error'); }
    };
  }
  function renderLoan() {
    const st = S.room, me = meP(st), L = S.loan, them = st && st.players.find((p) => p.id === L.to);
    if (!me || !them || them.bankrupt || st.status !== 'playing') { closeModal(); return; }
    const lender = L.role === 'lend' ? me : them, borrower = L.role === 'lend' ? them : me;
    const seg = (key, opts) => opts.map(([v, l]) => `<button type="button" class="chip ${L[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${l}</button>`).join('');
    const role = (v, title, sub) => `<button type="button" class="role-btn ${L.role === v ? 'on' : ''}" data-k="role" data-v="${v}"><b>${title}</b><small>${sub}</small></button>`;
    const body = `${dealHead(me, them, 'loan')}
      <div class="loan-role">${role('lend', 'بدي أقرضه', `بتعطي ${esc(them.name)} مصاري هلق`)}${role('borrow', 'بدي أستلف منه', `${esc(them.name)} بيعطيك مصاري هلق`)}</div>
      <div class="loan-grid">
        <div class="lg-row"><span class="lg-l">المبلغ</span><input type="number" id="loanAmount" min="10" step="10" value="${L.amount}" dir="ltr">
          <div class="chips-row">${[100, 200, 300, 500, 1000].map((v) => `<button type="button" class="chip ${L.amount === v ? 'on' : ''}" data-amt="${v}">${fmt(v)}</button>`).join('')}</div>
          <small class="hint lg-note">${esc(lender.name)} معه ${fmt(lender.money)}</small></div>
        <div class="lg-row"><span class="lg-l">الفايدة</span><div class="chips-row">${seg('interest', [[0, '0%'], [10, '10%'], [20, '20%'], [30, '30%']])}</div></div>
        <div class="lg-row"><span class="lg-l">بيرجعهن خلال</span><div class="chips-row">${seg('rounds', [[3, '3 جولات'], [5, '5 جولات'], [10, '10 جولات']])}</div></div>
      </div>
      <div class="deal-preview loan" id="loanPrev">${loanPreview(st, lender, borrower, L)}</div>
      <div class="deal-err" id="lErr"></div>
      <button type="button" class="btn gold big block deal-go" id="loanSend">${ART.ui('moneybag')} ابعت عرض القرض لـ ${esc(them.name)}</button>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell('💰 قرض مع ' + esc(them.name), body, 'wide deal');
    bindModal(root); bindDealHead(root);
    $$('[data-k]', root).forEach((b) => { b.onclick = () => { const k = b.dataset.k; L[k] = k === 'role' ? b.dataset.v : Number(b.dataset.v); renderLoan(); }; });
    $$('[data-amt]', root).forEach((b) => { b.onclick = () => { L.amount = Number(b.dataset.amt); renderLoan(); }; });
    $('#loanAmount').oninput = (e) => { L.amount = Math.max(0, Math.floor(Number(e.target.value) || 0)); $('#loanPrev').innerHTML = loanPreview(st, lender, borrower, L); };
    $('#loanSend').onclick = async () => {
      L.amount = Math.max(10, Math.floor(Number($('#loanAmount').value) || 0));
      try {
        await api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type: 'loanOffer', data: L });
        closeModal(); FX.Sound.play('trade-send'); toast('انبعت عرض القرض ✔', 'ok');
      } catch (e) { $('#lErr').textContent = '⚠️ ' + e.message; FX.Sound.play('error'); }
    };
  }
  function loanPreview(st, lender, borrower, L) {
    const repay = Math.round(L.amount * (1 + L.interest / 100)), due = st.game.round + L.rounds;
    const leg = (a, b, amt, when) => `<div class="pv-step"><small>${when}</small><span class="pv-who"><span class="tk" style="--pc:${a.color}">${ART.piece(a.piece)}</span>${ART.ui('arrow')}<span class="tk" style="--pc:${b.color}">${ART.piece(b.piece)}</span></span>
      <b>${fmt(amt)}</b><small>${esc(a.name)} بيعطي ${esc(b.name)}</small></div>`;
    return `<div class="pv-title">شو رح يصير</div><div class="pv-steps">${leg(lender, borrower, L.amount, 'هلق')}${leg(borrower, lender, repay, `بالجولة ${due} (بعد ${L.rounds} جولات)`)}</div>
      <small class="hint">${L.interest ? `الفايدة ${L.interest}% = ${fmt(repay - L.amount)}. ` : 'بلا فايدة. '}إذا ما رجّع بوقتها، المبلغ بيصير دين عليه متل الإيجار.</small>`;
  }

  // ---------------------------------------------------------------- offers everyone can see (chips under the dice)
  // Every pending trade / loan / buy-from-debtor offer shows as a small «عرض» chip in the board centre.
  // Clicking one opens it: the target can answer (accept / decline as before), everyone else just reads it.
  function allOffers(st) {
    const g = st.game;
    if (!g || st.status !== 'playing') return [];
    return [
      ...(g.trades || []).map((t) => ({ kind: 'trade', id: t.id, from: t.from, to: t.to })),
      ...(g.loans || []).filter((l) => l.state === 'offer').map((l) => ({ kind: 'loan', id: l.id, from: l.proposer, to: l.proposer === l.lender ? l.borrower : l.lender })),
      ...(g.debtOffers || []).map((o) => ({ kind: 'debt', id: o.id, from: o.from, to: o.to })),
    ];
  }
  function updateOffers(st) {
    const box = $('#cOffers');
    if (!box) return;
    const list = allOffers(st), P = (id) => st.players.find((p) => p.id === id);
    const label = { trade: 'تبادل', loan: 'قرض', debt: 'شراء' };
    const mine = (o) => S.me && o.to === S.me.pid;
    const html = list.slice(-5).map((o) => {
      const a = P(o.from), b = P(o.to);
      if (!a || !b) return '';
      return `<button type="button" class="offer-chip ${mine(o) ? 'mine' : ''}" data-ov="${o.kind}:${o.id}" title="عرض ${label[o.kind]}: ${esc(a.name)} ← ${esc(b.name)}">
        <span class="oc-tag">عرض</span><span class="tk" style="--pc:${a.color}">${ART.piece(a.piece)}</span>${ART.ui('arrow')}<span class="tk" style="--pc:${b.color}">${ART.piece(b.piece)}</span><small>${label[o.kind]}</small></button>`;
    }).join('') + (list.length > 5 ? `<span class="offer-more">+${list.length - 5}</span>` : '');
    if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
    // an open offer window closes by itself once the offer is gone
    if (S.modal && S.modal.kind === 'offer' && !list.some((o) => o.kind === S.modal.ok && o.id === S.modal.id)) closeModal();
  }
  function openOffer(id) { openOfferView('trade', id); }
  function openOfferView(kind, id) {
    const st = S.room, g = st && st.game, me = meP(st), P = (x) => st.players.find((p) => p.id === x);
    if (!g) return;
    const sideHTML = (props, money) => `${props.map((i) => miniDeed(st, i, 'tabindex="-1"', true)).join('')}${money ? `<div class="md-money">${ART.ui('cash')} ${fmt(money)}</div>` : ''}${!props.length && !money ? '<div class="hint">ولا شي</div>' : ''}`;
    const head = (a, b) => `<div class="deal-top">
        <div class="deal-who">${avatarOf(a)}<div><b>${esc(a.name)}</b><small>معه ${fmt(a.money)}</small></div></div>
        <div class="deal-x">${ART.ui('arrow')}</div>
        <div class="deal-who">${avatarOf(b)}<div><b>${me && b.id === me.id ? 'أنت' : esc(b.name)}</b><small>معه ${fmt(b.money)}</small></div></div></div>`;
    let title = '', body = '', btns = '';
    if (kind === 'trade') {
      const tr = g.trades.find((t) => t.id === id);
      if (!tr) return;
      const from = P(tr.from), to = P(tr.to);
      const target = me && tr.to === me.id;
      title = target ? `🤝 عرض تبادل من ${esc(from.name)} إلك` : `🤝 عرض تبادل من ${esc(from.name)} لـ ${esc(to.name)}`;
      const diff = tradeBalance(st, new Set(tr.get.props), new Set(tr.give.props), tr.get.money, tr.give.money);
      const total = tradeBalance(st, new Set(tr.give.props), new Set(), tr.give.money, 0) + tradeBalance(st, new Set(tr.get.props), new Set(), tr.get.money, 0);
      body = `${head(from, to)}<div class="deal2 ro">
        <section class="dside give"><h4><span class="dtag">${esc(from.name)} بيعطي</span></h4><div class="mdeeds ro">${sideHTML(tr.give.props, tr.give.money)}</div></section>
        <div class="deal-mid" aria-hidden="true">${ART.ui('handshake')}</div>
        <section class="dside get"><h4><span class="dtag">${esc(from.name)} بياخد</span></h4><div class="mdeeds ro">${sideHTML(tr.get.props, tr.get.money)}</div></section></div>
        ${target ? `<div class="deal-sum">${balanceText(diff, total).replace('لصالحه', 'لصالح ' + esc(from.name)).replace('لصالحك', 'لصالحك')}</div>` : ''}`;
      if (target) btns = `<button class="btn gold big" data-o="tacc">✅ قبول</button><button class="btn danger" data-o="tdec">❌ رفض</button><button class="btn" data-o="ctr">🔄 عرض مضاد</button>`;
      else if (me && tr.from === me.id) btns = '<button class="btn" data-o="tdec">اسحب العرض</button>';
      S.modal = { kind: 'offer', ok: 'trade', id };
      FX.Sound.play('click');
      showOfferModal(title, body, btns, { tacc: () => act('tradeAccept', { id }), tdec: () => act('tradeDecline', { id }),
        ctr: () => openTrade(tr.from, { to: tr.from, give: new Set(tr.get.props), get: new Set(tr.give.props), giveMoney: tr.get.money, getMoney: tr.give.money, counterOf: id }) });
      return;
    }
    if (kind === 'loan') {
      const l = (g.loans || []).find((x) => x.id === id && x.state === 'offer');
      if (!l) return;
      const lender = P(l.lender), borrower = P(l.borrower), from = P(l.proposer), to = l.proposer === l.lender ? borrower : lender;
      const target = me && to.id === me.id;
      title = `💰 عرض قرض من ${esc(from.name)}`;
      body = `${head(from, to)}<div class="deal-preview loan">${loanPreview(st, lender, borrower, l)}</div>
        <div class="deal-sum"><span>${l.proposer === l.lender ? `${esc(lender.name)} بدو يقرض ${esc(borrower.name)}` : `${esc(borrower.name)} بدو يستلف من ${esc(lender.name)}`} — فايدة ${l.interest}%</span></div>`;
      if (target) btns = '<button class="btn gold big" data-o="lacc">✅ قبول</button><button class="btn danger" data-o="ldec">❌ رفض</button>';
      else if (me && l.proposer === me.id) btns = '<button class="btn" data-o="ldec">اسحب العرض</button>';
      S.modal = { kind: 'offer', ok: 'loan', id };
      showOfferModal(title, body, btns, { lacc: () => act('loanAccept', { id }), ldec: () => act('loanDecline', { id }) });
      return;
    }
    const o = (g.debtOffers || []).find((x) => x.id === id);
    if (!o) return;
    const buyer = P(o.from), debtor = P(o.to), cancel = Math.min(owedToMe(g, o.from), o.price), cash = o.price - cancel;
    const target = me && debtor.id === me.id;
    title = `🏷️ ${esc(buyer.name)} بدو يشتري من ${target ? 'عندك' : esc(debtor.name)}`;
    body = `${head(buyer, debtor)}<div class="debt-buy-view">${deedHTML(o.idx)}<div class="dbv-side"><div class="dbv-price">${fmt(o.price)}</div>
      ${cancel ? `<div class="dbv-line">${fmt(cancel)} بينقصوا من الدين اللي إله</div>` : ''}${cash ? `<div class="dbv-line">${fmt(cash)} مصاري ${target ? 'إلك' : 'لـ ' + esc(debtor.name)}</div>` : ''}</div></div>`;
    if (target) btns = '<button class="btn gold big" data-o="dacc">✅ قبول البيع</button><button class="btn danger" data-o="ddec">❌ رفض</button>';
    else if (me && o.from === me.id) btns = '<button class="btn" data-o="ddec">اسحب العرض</button>';
    S.modal = { kind: 'offer', ok: 'debt', id };
    showOfferModal(title, body, btns, { dacc: () => act('debtOfferAccept', { id }), ddec: () => act('debtOfferDecline', { id }) });
  }
  function showOfferModal(title, body, btns, handlers) {
    const root = $('#modal-root');
    root.innerHTML = modalShell(title, body + (btns ? `<div class="row offer-btns">${btns}</div>` : '<div class="hint">عرض للفرجة بس — صاحب العلاقة هو اللي بيقبل أو بيرفض.</div>'), 'wide deal offer-view');
    bindModal(root);
    $$('[data-o]', root).forEach((b) => {
      b.onclick = () => { const f = handlers[b.dataset.o]; if (b.dataset.o !== 'ctr') closeModal(); if (f) f(); };
    });
  }
  function offerBanner(tr, from) {
    const box = $('#offerBanner') || Object.assign(document.createElement('div'), { id: 'offerBanner' });
    if (!box.isConnected) document.body.appendChild(box);
    box.className = 'offer-banner';
    box.innerHTML = `<span>🤝 عرض جديد من <b>${esc(from ? from.name : '')}</b></span><button class="btn sm gold" type="button">افتحه</button><button class="x-btn" type="button">✕</button>`;
    box.querySelector('.btn').onclick = () => { box.remove(); openOffer(tr.id); };
    box.querySelector('.x-btn').onclick = () => box.remove();
    clearTimeout(S.offerBannerT);
    S.offerBannerT = setTimeout(() => box.remove(), 12000);
  }
  function tradeEffects(prev, st, meId) {
    const pt = prev.game.trades || [], nt = st.game.trades || [];
    const name = (id) => { const p = st.players.find((x) => x.id === id); return p ? p.name : ''; };
    // new offer to me -> pop it up
    for (const tr of nt) {
      if (tr.to !== meId || pt.some((x) => x.id === tr.id)) continue;
      FX.Sound.play('trade-send');
      if (!S.modal) openOffer(tr.id); else offerBanner(tr, st.players.find((p) => p.id === tr.from));
    }
    // a loan offer or a buy offer to me: a sound and a toast (the chip under the dice opens it)
    const pl = prev.game.loans || [], pd = prev.game.debtOffers || [];
    for (const l of st.game.loans || []) {
      if (l.state === 'offer' && l.proposer !== meId && (l.lender === meId || l.borrower === meId) && !pl.some((x) => x.id === l.id)) { FX.Sound.play('trade-send'); toast(`💰 عرض قرض من ${name(l.proposer)} — شوفه تحت النرد أو بـ «القروض»`, 'ok'); }
    }
    for (const o of st.game.debtOffers || []) {
      if (o.to === meId && !pd.some((x) => x.id === o.id)) { FX.Sound.play('trade-send'); toast(`🏷️ ${name(o.from)} بدو يشتري ${T(o.idx).name} بـ ${fmt(o.price)}`, 'ok'); }
    }
    // my offers that disappeared -> accepted or declined?
    const newLog = st.log.filter((l) => !prev.log.some((o) => o.t === l.t && o.text === l.text)).map((l) => l.text);
    for (const tr of pt) {
      if (tr.from !== meId || nt.some((x) => x.id === tr.id)) continue;
      const other = name(tr.to);
      if (newLog.some((t) => t.includes(`✅ ${other} قبل صفقة`))) { toast(`✅ ${other} قبل عرضك`, 'ok'); FX.Sound.play('trade-ok'); }
      else if (newLog.some((t) => t.includes(`❌ ${other} رفض صفقة`))) { toast(`❌ ${other} رفض عرضك`); FX.Sound.play('trade-no'); }
    }
    for (const l of pl) {
      if (l.proposer !== meId || l.state !== 'offer' || (st.game.loans || []).some((x) => x.id === l.id && x.state === 'offer')) continue;
      if ((st.game.loans || []).some((x) => x.id === l.id && x.state === 'active')) { toast('✅ انقبل عرض القرض', 'ok'); FX.Sound.play('trade-ok'); }
      else if (newLog.some((t) => t.includes('رفض عرض القرض'))) { toast('❌ انرفض عرض القرض'); FX.Sound.play('trade-no'); }
    }
    for (const o of pd) {
      if (o.from !== meId || (st.game.debtOffers || []).some((x) => x.id === o.id)) continue;
      if (st.game.props[o.idx] && st.game.props[o.idx].owner === meId) { toast(`✅ صار ${T(o.idx).name} إلك`, 'ok'); FX.Sound.play('trade-ok'); }
      else if (newLog.some((t) => t.includes('رفض يبيع'))) { toast('❌ انرفض عرض الشراء'); FX.Sound.play('trade-no'); }
    }
  }

  // ---------------------------------------------------------------- debt: buy from the debtor / send money (other players)
  function debtorNow(st) {
    const g = st && st.game;
    return g && st.status === 'playing' && g.debts.length ? st.players.find((p) => p.id === g.order[g.turn]) : null;
  }
  function openDebtBuy() {
    const st = S.room, debtor = debtorNow(st);
    if (!debtor || !meP(st)) return;
    const list = ownedBy(st, debtor.id).filter((i) => !hasBuildings(st, i));
    S.dbuy = { idx: list.includes(S.dbuy && S.dbuy.idx) ? S.dbuy.idx : list[0], price: 0 };
    S.modal = { kind: 'debtbuy' };
    renderDebtBuy();
  }
  function renderDebtBuy() {
    const st = S.room, me = meP(st), debtor = debtorNow(st), D = S.dbuy;
    if (!me || !debtor || debtor.id === me.id) { closeModal(); return; }
    const g = st.game, owed = owedToMe(g, me.id);
    const list = ownedBy(st, debtor.id);
    if (D.idx == null || !list.includes(D.idx)) D.idx = list.find((i) => !hasBuildings(st, i));
    const t = D.idx != null ? T(D.idx) : null;
    if (t && !D.price) D.price = Math.min(t.price, Math.max(t.mortgage, owed)) || t.mortgage;
    const chips = t ? [[t.mortgage, 'قيمة الرهن'], [Math.round(t.price * 0.75 / 10) * 10, '75%'], [t.price, 'السعر الكامل'], ...(owed ? [[owed, 'قد دينه إلك']] : [])]
      .map(([v, l]) => `<button type="button" class="chip ${D.price === v ? 'on' : ''}" data-pr="${v}"><b>${fmt(v)}</b><small>${l}</small></button>`).join('') : '';
    const body = `<div class="hint" style="text-align:start">اختار عقار من عقارات <b>${esc(debtor.name)}</b> وحط سعرك. إذا قبل، ${owed ? `السعر بينحسب أول من الدين اللي إلك (${fmt(owed)})، والباقي بتدفعه مصاري.` : 'بتدفعله السعر مصاري وبيروح لديونه.'}</div>
      <div class="mdeeds">${list.map((i) => miniDeed(st, i, `data-db="${i}"`, i === D.idx, hasBuildings(st, i))).join('') || '<div class="hint">ما عنده عقارات</div>'}</div>
      ${t ? `<div class="money-box big"><span class="mb-ico">${ART.ui('tag')}</span><input type="number" id="dbPrice" min="10" step="10" value="${D.price}" dir="ltr"><div class="chips-row">${chips}</div></div>
      <div class="deal-preview" id="dbPrev">${debtBuyPreview(me, debtor, t, D.price, owed)}</div>
      <div class="deal-err" id="dbErr"></div>
      <button type="button" class="btn gold big block deal-go" id="dbSend">${ART.ui('tag')} اعرض تشتري ${esc(t.name)}</button>` : ''}`;
    const root = $('#modal-root');
    root.innerHTML = modalShell(`🏷️ اشتري من ${esc(debtor.name)}`, body, 'wide deal');
    bindModal(root);
    $$('[data-db]', root).forEach((b) => { b.onclick = () => { D.idx = Number(b.dataset.db); D.price = 0; renderDebtBuy(); }; });
    $$('[data-pr]', root).forEach((b) => { b.onclick = () => { D.price = Number(b.dataset.pr); renderDebtBuy(); }; });
    if (!t) return;
    $('#dbPrice').oninput = (e) => { D.price = Math.max(0, Math.floor(Number(e.target.value) || 0)); $('#dbPrev').innerHTML = debtBuyPreview(me, debtor, t, D.price, owed); };
    $('#dbSend').onclick = async () => {
      try {
        await api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type: 'debtOffer', data: { idx: D.idx, price: D.price } });
        closeModal(); FX.Sound.play('trade-send'); toast(`انبعت عرضك لـ ${debtor.name} ✔`, 'ok');
      } catch (e) { $('#dbErr').textContent = '⚠️ ' + e.message; FX.Sound.play('error'); }
    };
  }
  function debtBuyPreview(me, debtor, t, price, owed) {
    const cancel = Math.min(owed, price), cash = price - cancel;
    return `<div class="pv-title">إذا قبل</div><div class="pv-cols">
      <div class="pv-col" style="--pc:${me.color}"><b>أنت</b><span>بتاخد <b>${esc(t.name)}</b></span><small>${cancel ? `بينمسح ${fmt(cancel)} من دينه إلك` : ''}${cancel && cash ? ' · ' : ''}${cash ? `بتدفع ${fmt(cash)} مصاري` : ''}${!cash && !cancel ? '—' : ''}</small>
        <span class="pv-money"><s>${fmt(me.money)}</s>${ART.ui('arrow')}<b class="${me.money - cash < 0 ? 'neg' : ''}">${fmt(me.money - cash)}</b></span></div>
      <div class="pv-col" style="--pc:${debtor.color}"><b>${esc(debtor.name)}</b><span>دينه بينقص <b>${fmt(price)}</b></span><small>${cash ? `${fmt(cash)} بتروح لديونه` : 'كله من الدين اللي إلك'}</small></div></div>`;
  }
  function openDebtGive() {
    const st = S.room;
    if (!debtorNow(st) || !meP(st)) return;
    S.modal = { kind: 'debtgive' };
    S.dgive = S.dgive || { amount: 0 };
    renderDebtGive();
  }
  function renderDebtGive() {
    const st = S.room, me = meP(st), debtor = debtorNow(st), G = S.dgive;
    if (!me || !debtor || debtor.id === me.id) { closeModal(); return; }
    const g = st.game, owed = owedToMe(g, me.id), tot = debtTotal(g);
    if (!G.amount) G.amount = owed || Math.min(100, tot);
    const chips = [[50, ''], [100, ''], [200, ''], ...(owed ? [[owed, 'كل اللي إلي']] : []), [tot, 'كل دينه']]
      .filter(([v], k, a) => a.findIndex(([x]) => x === v) === k)
      .map(([v, l]) => `<button type="button" class="chip ${G.amount === v ? 'on' : ''}" data-ga="${v}"><b>${fmt(v)}</b>${l ? `<small>${l}</small>` : ''}</button>`).join('');
    const body = `<div class="hint" style="text-align:start">${owed ? `<b>${esc(debtor.name)}</b> عليه إلك ${fmt(owed)}. المبلغ بيمسح من هالدين أول (بتسامحه)، واللي بيزيد بيوصله مصاري منك.` : `بتبعت لـ <b>${esc(debtor.name)}</b> مصاري من عندك لتساعده يسدّ دينه.`}</div>
      <div class="money-box big"><span class="mb-ico">${ART.ui('cash')}</span><input type="number" id="dgAmount" min="1" step="10" value="${G.amount}" dir="ltr"><div class="chips-row">${chips}</div></div>
      <div class="deal-preview" id="dgPrev">${debtGivePreview(me, debtor, G.amount, owed)}</div>
      <div class="deal-err" id="dgErr"></div>
      <button type="button" class="btn gold big block deal-go" id="dgSend">${ART.ui('cash')} ${owed ? 'سامحه / ابعت' : 'ابعتله'}</button>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell(`🪙 ساعد ${esc(debtor.name)}`, body, 'deal');
    bindModal(root);
    $$('[data-ga]', root).forEach((b) => { b.onclick = () => { G.amount = Number(b.dataset.ga); renderDebtGive(); }; });
    $('#dgAmount').oninput = (e) => { G.amount = Math.max(0, Math.floor(Number(e.target.value) || 0)); $('#dgPrev').innerHTML = debtGivePreview(me, debtor, G.amount, owed); };
    $('#dgSend').onclick = async () => {
      try {
        await api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type: 'debtRelief', data: { amount: G.amount } });
        S.dgive = null; closeModal(); FX.Sound.play('receive');
      } catch (e) { $('#dgErr').textContent = '⚠️ ' + e.message; FX.Sound.play('error'); }
    };
  }
  function debtGivePreview(me, debtor, amount, owed) {
    const cancel = Math.min(owed, amount), cash = amount - cancel;
    return `<div class="pv-cols"><div class="pv-col" style="--pc:${me.color}"><b>أنت</b>${cancel ? `<small>بتسامحه بـ ${fmt(cancel)}</small>` : ''}
      <span class="pv-money"><s>${fmt(me.money)}</s>${ART.ui('arrow')}<b class="${me.money - cash < 0 ? 'neg' : ''}">${fmt(me.money - cash)}</b></span></div>
      <div class="pv-col" style="--pc:${debtor.color}"><b>${esc(debtor.name)}</b><small>دينه بينقص ${fmt(amount)}</small></div></div>`;
  }

  // ---------------------------------------------------------------- sell several properties by auction
  function openSellMany() {
    const st = S.room, me = meP(st);
    if (!me) return;
    S.modal = { kind: 'sellmany' };
    S.sell = S.sell || { sel: new Set(), min: 0 };
    renderSellMany();
  }
  function renderSellMany() {
    const st = S.room, me = meP(st), L = S.sell;
    if (!me || !st.game) { closeModal(); return; }
    const mine = ownedBy(st, me.id);
    for (const i of [...L.sel]) if (!mine.includes(i) || hasBuildings(st, i)) L.sel.delete(i);
    const body = `<div class="hint" style="text-align:start">اختار العقارات (لـ 8) — رح ينعرضوا واحد ورا التاني، وكل لوت بياخد مزاده لحاله.</div>
      <div class="mdeeds">${mine.map((i) => miniDeed(st, i, `data-sl="${i}"`, L.sel.has(i), hasBuildings(st, i))).join('')}</div>
      <label class="money-in">أقل سعر لكل لوت (اختياري) <input type="number" min="0" step="10" id="sellMin" value="${L.min || ''}" placeholder="$0" dir="ltr"></label>
      <div class="deal-sum"><span>${L.sel.size ? `رح ينعرضوا <b>${L.sel.size}</b> ${L.sel.size === 1 ? 'عقار' : 'عقارات'}: ${[...L.sel].map((i) => esc(T(i).name)).join(' ← ')}` : 'لسا ما اخترت شي'}</span></div>
      <div class="row"><button class="btn gold" id="sellGo" ${L.sel.size ? '' : 'disabled'}>🔨 ابدأ المزاد</button><button class="btn ghost" data-close2>إلغاء</button></div>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell('🔨 بيع بالمزاد', body, 'wide deal');
    bindModal(root);
    root.querySelector('[data-close2]').onclick = closeModal;
    $$('[data-sl]', root).forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.sl);
        if (L.sel.has(i)) L.sel.delete(i); else if (L.sel.size < 8) L.sel.add(i); else toast('أكتر شي 8 عقارات');
        renderSellMany();
      };
    });
    $('#sellMin').onchange = (e) => { L.min = Math.max(0, Math.floor(Number(e.target.value) || 0)); };
    $('#sellGo').onclick = async () => {
      L.min = Math.max(0, Math.floor(Number($('#sellMin').value) || 0));
      try {
        await api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type: 'sellAuction', data: { idxs: [...L.sel], min: L.min } });
        S.sell = null; closeModal();
      } catch (e) { toast(e.message); }
    };
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (S.modal && S.modal.kind !== 'confirm') { closeModal(); return; }
    if (S.buildMode) { setBuildMode(false); return; }
    if (S.chatOpen) toggleChat(false);
  });
  // A soft click for interface buttons (game actions in the board centre have their own matching sounds).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.btn, .chip, .dtab, .dp, .color-btn, .piece-btn, .mdeed, .role-btn, .offer-chip, .icon-btn, .chat-fab');
    if (!b || b.disabled || b.closest('#cActions') || b.id === 'sndBtn') return;
    FX.Sound.play('click');
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.room) { layoutTokens(); updateCenter(S.room); } });
  boot();
})();
