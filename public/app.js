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
    chatOpen: false, chatUnread: 0, chatLastT: null,
    modal: null, trade: null, built: false, homeTimer: null, cardTimer: null,
  };
  // Tiles of the current room: city/country names come from the room's country map.
  const T = (i) => (S.tiles || S.board.tiles)[i];
  const SET = (k) => S.board.sets[k];
  function resolveTiles(map) {
    S.tiles = S.board.tiles.map((t) => {
      if (t.type !== 'city') return t;
      const code = map && map[t.set], c = code && S.board.countries[code];
      return { ...t, country: code, countryName: c ? c.name : '', name: c ? c.cities[t.rank] : '' };
    });
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
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }
  const credsKey = (c) => 'tharwa_room_' + c;
  function getCreds(code) { try { return JSON.parse(store.get(credsKey(code)) || 'null'); } catch (e) { return null; } }
  function nickname() { return ($('#nick') && $('#nick').value.trim()) || store.get('tharwa_name') || ''; }

  // ================================================================ boot
  async function boot() {
    try { S.board = await api('/api/board'); } catch (e) { app.innerHTML = '<div class="home"><div class="hint">ما قدرت أوصل للسيرفر</div></div>'; return; }
    const m = location.pathname.match(/^\/room\/([a-z0-9]{5})\/?$/i);
    if (m) { S.code = m[1].toLowerCase(); enterRoom(); } else renderHome();
  }

  // ================================================================ home
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
    <div class="home">
      <button class="icon-btn home-snd" id="sndBtn" title="الصوت">${FX.Sound.on ? '🔊' : '🔇'}</button>
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
      <div class="home-card">
        <input id="nick" maxlength="16" placeholder="اسمك باللعبة…" value="${esc(store.get('tharwa_name') || '')}">
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
    </div>`;
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
      <div class="home-card"><input id="nick" maxlength="16" placeholder="اسمك باللعبة…" value="${esc(store.get('tharwa_name') || '')}">
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
    const mapKey = JSON.stringify(st.map || {});
    if (mapKey !== S.mapKey) {
      S.mapKey = mapKey;
      resolveTiles(st.map);
      if (S.built) {
        $$('#board .tile').forEach((el) => {
          const i = Number(el.dataset.i), t = T(i);
          if (t.type === 'city') { el.innerHTML = tileInner(t, i); el.title = t.name + ' — ' + t.countryName; }
        });
      }
    }
    if (!S.built) buildLayout();
    document.title = (st.status === 'playing' ? '🎲 ' : '') + 'ثروة — غرفة ' + st.code;
    processMoves(st);
    updateBoard(st);
    updateDice(st);
    updateCard(st);
    updateNotice(st);
    updateBuildMode(st);
    updateCenter(st);
    updateSide(st);
    updateChat(st);
    if (S.modal && S.modal.kind === 'tile') renderModal();
    if (S.modal && S.modal.kind === 'trade' && !meP(st)) closeModal();
    if (S.modal && S.modal.kind === 'sellmany' && st.game && st.game.auction) closeModal();
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
  function effects(prev, st) {
    if (!prev || !prev.game || !st.game || prev.status === 'lobby') return;
    const pg = prev.game, g = st.game, me = S.me ? S.me.pid : null;
    for (const p of st.players) {
      const o = prev.players.find((x) => x.id === p.id);
      if (!o) continue;
      const d = (p.money || 0) - (o.money || 0);
      if (d) {
        const kind = d > 0 ? 'plus' : 'minus', txt = (d > 0 ? '+' : '−') + fmt(Math.abs(d));
        const m = document.querySelector(`[data-prow="${p.id}"] .pmoney`);
        if (m) { const r = m.getBoundingClientRect(); FX.floatText(r.left + r.width / 2, r.top, txt, kind); if (!owedBy(st, p)) countUp(m, o.money || 0, p.money || 0); }
        const tok = document.getElementById('tok-' + p.id);
        if (tok && !document.hidden) { const r = tok.getBoundingClientRect(); FX.floatText(r.left + r.width / 2, r.top - 6, txt, kind + ' small'); }
        if (p.id === me) FX.Sound.play(d > 0 ? 'coin' : 'pay');
      }
      if (p.inJail && !o.inJail) FX.Sound.play('jail');
      if (p.bankrupt && !o.bankrupt) FX.Sound.play('bankrupt');
    }
    for (const [k, pr] of Object.entries(g.props)) {
      const o = pg.props[k];
      if (!o || o.owner !== pr.owner) { flashTile(k); FX.Sound.play('buy'); }
      else if (pr.houses > o.houses) {
        flashTile(k); popBuilding(k);
        if (!(S.lastBuild && S.lastBuild.idx === Number(k) && Date.now() - S.lastBuild.t < 2500)) FX.Sound.play('build');
      }
    }
    if (g.auction && pg.auction && g.auction.bid !== pg.auction.bid) FX.Sound.play('bid');
    if (me) tradeEffects(prev, st, me);
    if (st.status === 'playing' && me && g.order[g.turn] === me && pg.order[pg.turn] !== me) { banner('دورك! 🎲'); FX.Sound.play('turn'); }
    if (st.status === 'ended' && prev.status !== 'ended') { FX.confetti(); FX.Sound.play('win'); }
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
      </aside>
      <main class="col col-board"><div class="board" id="board"></div></main>
      <aside class="col col-a">
        <div class="top-row"><a class="mini-logo" href="/" title="الصفحة الرئيسية">ثروة<span>.</span></a>
          <a class="serva-chip" href="${SERVA_URL}" target="_blank" rel="noopener" title="لعبة من Serva"><img src="/brand/serva-logo-160.webp" alt="Serva" width="34" height="34"></a>
          <button class="icon-btn" id="sndBtn" title="الصوت">${FX.Sound.on ? '🔊' : '🔇'}</button></div>
      </aside>
    </div>
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
    window.addEventListener('resize', () => layoutTokens());
    // The landscape board can change size without a window resize (e.g. emulated viewports, side panel growth).
    if (window.ResizeObserver) new ResizeObserver(() => layoutTokens()).observe($('#board'));
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
    if (i % 10 === 0) return `${tileIcon(t)}<div class="tname">${esc(t.name)}</div>${t.type === 'vacation' ? '<div class="pot" data-pot></div>' : ''}${t.type === 'start' ? `<div class="pot">+${fmt(S.board.goSalary)}</div>` : ''}${t.type === 'jail' ? '<div class="visit">زيارة</div>' : ''}`;
    // Property strip: transparent with the price while for sale; filled with the
    // owner's colour (and their piece + buildings) once someone buys it.
    const band = `<div class="band"><span class="bprice">${fmt(t.price)}</span><span class="bown"></span><span class="bld"></span></div>`;
    if (t.type === 'city') return `${band}<div class="tbody">${flag(t.country, 'on-tile')}<div class="tname">${esc(t.name)}</div></div>`;
    if (t.price) return `${band}<div class="tbody">${tileIcon(t)}<div class="tname">${esc(t.name)}</div></div>`;
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
        <div class="dice3" id="dice">${FX.diceHTML()}</div>
        <div class="c-actions" id="cActions"></div>
        <div class="c-log" id="cLog"></div>
        <div id="cCard"></div>
        <div id="cNotice"></div>
        <div id="cBanner"></div>
      </div><div class="tokens" id="tokens"></div>`;
    FX.setDice($('#dice'), [5, 6], false);
    b.addEventListener('click', (e) => {
      if (e.target.closest('.card2')) { $('#cCard').innerHTML = ''; return; }
      if (e.target.closest('.n-close')) { $('#cNotice').innerHTML = ''; return; }
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
    if (!g) { S.queue = []; S.moveSeq = 0; st.players.forEach((p) => { S.disp[p.id] = 0; }); return; }
    const moves = g.moves || [];
    if (S.moveSeq < 0) {
      S.moveSeq = moves.reduce((m, x) => Math.max(m, x.seq), 0);
      st.players.forEach((p) => { S.disp[p.id] = p.pos; });
      return;
    }
    const fresh = moves.filter((m) => m.seq > S.moveSeq);
    if (fresh.length) {
      S.moveSeq = fresh[fresh.length - 1].seq;
      S.queue.push(...fresh);
      runQueue();
    }
    if (!S.running) st.players.forEach((p) => { S.disp[p.id] = p.pos ?? 0; });
  }
  async function runQueue() {
    if (S.running) return;
    S.running = true;
    while (S.queue.length) {
      const m = S.queue.shift();
      // Hidden tab (timers throttled) or a backlog of moves: jump straight there.
      if (document.hidden || S.queue.length > 3) { S.disp[m.pid] = m.to; continue; }
      if (m.jump || m.steps <= 0) { S.disp[m.pid] = m.to; layoutTokens(); await sleep(260); continue; }
      S.disp[m.pid] = m.from;
      const stepMs = Math.max(55, Math.min(135, 1800 / m.steps));
      for (let k = 0; k < m.steps; k++) {
        if (document.hidden) { S.disp[m.pid] = m.to; break; }
        S.disp[m.pid] = (S.disp[m.pid] + 1) % 40; layoutTokens(); hop(m.pid); await sleep(stepMs);
      }
      await sleep(120);
    }
    S.running = false;
    if (S.room) {
      S.room.players.forEach((p) => { S.disp[p.id] = p.pos ?? 0; });
      layoutTokens();
      updateCenter(S.room);
    }
  }
  function hop(pid) {
    const tk = document.querySelector('#tok-' + pid + ' .tk');
    if (!tk) return;
    tk.classList.remove('hop'); void tk.offsetWidth; tk.classList.add('hop');
  }
  function layoutTokens() {
    const board = $('#board'), layer = $('#tokens');
    if (!board || !layer || !S.room) return;
    const st = S.room, g = st.game;
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
      const per = n > 4 ? 3 : 2, rows = Math.ceil(n / per), cols = Math.min(n, per);
      // Big glowing tokens: clamp(22, tile*0.6, 40), shrunk only as much as needed so a group fits its tile.
      const tw = tile.offsetWidth, th = tile.offsetHeight;
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
    FX.setDice($('#dice'), g.dice, !first);
    if (!first) FX.Sound.play('dice');
  }
  function updateCard(st) {
    const g = st.game;
    if (!g) { S.cardSeq = 0; return; }
    if (S.cardSeq < 0) { S.cardSeq = g.cardSeq; return; }
    if (!g.card || g.card.seq <= S.cardSeq) return;
    S.cardSeq = g.card.seq;
    const who = st.players.find((p) => p.id === g.card.pid);
    const wait = S.running ? 900 : 0;
    clearTimeout(S.cardTimer);
    const card = g.card;
    setTimeout(() => {
      const deck = card.deck, title = deck === 'chance' ? 'بطاقة حظ' : 'بطاقة خزنة';
      // One face only (no 3D back/front), so the details always show.
      $('#cCard').innerHTML = `<div class="card2 ${deck}" title="اضغط لتسكير">
          <div class="c2-head"><span class="c2-icon">${ART.icon(deck)}</span><b>${title}</b><small>${esc(who ? who.name : '')}</small></div>
          <div class="c2-text">${esc(card.text)}</div>
          ${card.effect ? `<div class="c2-effect">${esc(card.effect)}</div>` : ''}
        </div>`;
      FX.Sound.play('card');
      clearTimeout(S.cardTimer);
      S.cardTimer = setTimeout(() => { $('#cCard').innerHTML = ''; }, 7000);
    }, wait);
  }

  // Big centred notice everyone sees (e.g. «سيرفا دفع $140 إيجار لـ بوت سامي»).
  function updateNotice(st) {
    const g = st.game;
    if (!g) { S.noticeSeq = 0; return; }
    if (S.noticeSeq < 0) { S.noticeSeq = g.noticeSeq || 0; return; }
    if (!g.notice || g.notice.seq <= S.noticeSeq) return;
    S.noticeSeq = g.notice.seq;
    const n = g.notice;
    const from = st.players.find((p) => p.id === n.from), to = st.players.find((p) => p.id === n.to);
    if (n.kind !== 'rent' || !from || !to) return;
    const av = (p) => `<span class="tk nav" style="--pc:${p.color}">${ART.piece(p.piece)}</span>`;
    const html = `<div class="notice"><button class="n-close" type="button" title="سكّر">✕</button>
        <div class="n-avs">${av(from)}<span class="n-arrow">←</span>${av(to)}</div>
        <div class="n-main">💸 <b style="color:${from.color}">${esc(from.name)}</b> دفع <span class="n-amt">${fmt(n.amount)}</span> إيجار لـ <b style="color:${to.color}">${esc(to.name)}</b></div>
        <div class="n-sub">🏠 ${esc(n.tile)}</div>
      </div>`;
    clearTimeout(S.noticeShow);
    S.noticeShow = setTimeout(() => {
      const box = $('#cNotice');
      if (!box) return;
      box.innerHTML = html;
      clearTimeout(S.noticeTimer);
      S.noticeTimer = setTimeout(() => { box.innerHTML = ''; }, 4000);
      FX.Sound.play('cash');
      flyCash(n.from, n.to);
    }, S.running ? 900 : 0);
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
      el.innerHTML = k % 2 ? ART.icon('coin') : ART.BILL;
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
      const i = Number(el.dataset.i), on = S.buildMode && list.includes(i);
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
      head = `<div class="deed-head" style="--sc:${SET(t.set).color}">${flag(t.country, 'mid')}<div class="dh-text"><b>${esc(t.name)}</b><small>${esc(t.countryName)}</small></div></div>`;
      rows = [['الإيجار', fmt(t.rent[0])], ['مع الدولة كاملة', fmt(t.rent[0] * (S.room.settings.doubleRent ? 2 : 1))], ['بيت واحد', fmt(t.rent[1])], ['4 بيوت', fmt(t.rent[4])], ['فندق', fmt(t.rent[5])]];
    } else if (t.type === 'port') {
      head = `<div class="deed-head plain"><span class="dh-icon">${ART.icon('port')}</span><div class="dh-text"><b>${esc(t.name)}</b><small>ميناء</small></div></div>`;
      rows = S.board.portRent.map((v, k) => [`${k + 1} ${k ? 'موانئ' : 'ميناء'}`, fmt(v)]);
    } else {
      head = `<div class="deed-head plain"><span class="dh-icon">${ART.icon(iconName(t))}</span><div class="dh-text"><b>${esc(t.name)}</b><small>شركة</small></div></div>`;
      rows = [['شركة وحدة', 'النرد × 4'], ['الشركتين', 'النرد × 10']];
    }
    return `<div class="deed">${head}<div class="deed-body">${rows.map(([l, v]) => `<div class="drow"><span>${l}</span><b>${v}</b></div>`).join('')}</div><div class="deed-price">${fmt(t.price)}</div></div>`;
  }
  function updateCenter(st) {
    const top = $('#cTop'), actions = $('#cActions'), logEl = $('#cLog');
    if (!top) return;
    const g = st.game, me = meP(st);
    logEl.innerHTML = st.log.slice(-7).reverse().map((l) => `<div>${esc(l.text)}</div>`).join('');

    $('#center').classList.remove('compact');
    if (st.status === 'lobby') {
      const codes = Object.keys(S.board.sets).map((k) => st.map && st.map[k]).filter(Boolean);
      const ring = codes.map((c, k) => `<span class="ring-flag" style="--a:${(k * 360) / codes.length}deg">${flag(c, 'lg')}</span>`).join('');
      top.innerHTML = `<div class="emblem"><div class="ring">${ring}</div><div class="brand">ثروة<span>.</span></div></div>
        <div class="sub">${st.players.length}/${st.settings.maxPlayers} لاعبين بالغرفة — كل لاعب بيبلّش بـ ${fmt(st.settings.startingCash)}</div>`;
      if (!me) actions.innerHTML = '<div class="spectator">أنت متفرّج</div>';
      else if (isHost(st)) {
        actions.innerHTML = btn('start', '▶ ابدأ اللعبة', 'gold big', st.players.length < 2) +
          (st.players.length < 2 ? '<div class="hint">بدك لاعبين اثنين على الأقل — ابعت الرابط لصاحبك أو ضيف لاعب آلي</div>' : '');
      } else actions.innerHTML = '<div class="hint">بانتظار صاحب الغرفة يبدأ اللعبة…</div>';
      return;
    }
    if (st.status === 'ended') {
      const w = st.players.find((p) => p.id === g.winner);
      top.innerHTML = `<div class="winner"><div class="trophy">${ART.icon('trophy')}</div>${w ? `<span class="tk big" style="--pc:${w.color}">${ART.piece(w.piece)}</span>` : ''}<div>${esc(w ? w.name : '—')} ربح اللعبة!</div></div>`;
      actions.innerHTML = isHost(st) ? btn('restart', '🔄 لعبة جديدة بنفس الغرفة', 'gold big') : '<div class="hint">بانتظار صاحب الغرفة يبدأ لعبة جديدة</div>';
      return;
    }

    const cur = st.players.find((p) => p.id === g.order[g.turn]);
    top.innerHTML = `<div class="turn"><span class="dot" style="background:${cur.color}"></span>دور <b>${esc(cur.name)}</b>${g.autopilot ? ' <small class="hint">(تلقائي)</small>' : ''}${g.turnEndsAt ? ' <span class="timer" id="turnTimer"></span>' : ''}</div>`;
    let h = '';
    if (g.auction) h = auctionHTML(st, me);
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
          h = `<div class="offer2">${deedHTML(g.pendingBuy)}<div class="offer-side">
              <div>بدك تشتري <b>${esc(t.name)}</b>؟</div><small class="hint">معك ${fmt(me.money)}</small>
              ${btn('buy', 'اشتري ' + fmt(t.price), 'gold', me.money < t.price)}${btn('skip', st.settings.auction ? 'لا — للمزاد 🔨' : 'لا شكراً')}</div></div>`;
          break;
        }
        case 'debt': {
          const tot = g.debts.reduce((s, d) => s + d.amount, 0);
          h = `<div class="debt">⚠️ عليك دين <b>${fmt(tot)}</b><br><small>بيع بيوت أو ارهن عقارات (اضغط على عقارك باللوح أو من «أملاكي») — الدين بينسدّ لحاله أول ما يصير معك مصاري</small></div><div class="row">${btn('bankrupt', '💀 أعلن الإفلاس', 'danger')}</div>`;
          break;
        }
        case 'done': h = btn('end', 'إنهاء الدور ✔', 'gold big') + buildBtn(st); break;
        default: break;
      }
    } else if (cur.isBot || g.autopilot) h = `<div class="hint">${esc(cur.name)} عم يفكّر…</div>`;
    else h = `<div class="hint">بانتظار ${esc(cur.name)}…</div>`;
    actions.innerHTML = h;
    $('#center').classList.toggle('compact', h.includes('class="deed"'));
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
      ${a.min || (pr && pr.mortgaged) ? `<div class="hint">${a.min ? `أقل سعر ${fmt(a.min)}` : ''}${a.min && pr && pr.mortgaged ? ' · ' : ''}${pr && pr.mortgaged ? 'مرهونة' : ''}</div>` : ''}
      <div class="a-bid">${a.bid ? fmt(a.bid) : '—'}</div>
      <div class="a-who">${b ? `<span class="pdot" style="background:${b.color}"></span> ${esc(b.name)}` : 'لسا ما حدا زاود'}</div>
      ${a.lots > 1 ? `<div class="a-lots"><b>لوت ${a.lot} من ${a.lots}</b>${(st.game.auctionQueue || []).map((l) => `<span class="lot-chip">${esc(T(l.idx).name)}</span>`).join('')}</div>` : ''}
      <div class="a-timer"><div class="a-bar" id="aucBar"></div></div><div class="hint" id="aucTimer"></div>
      ${foot}
    </div></div>`;
  }
  function tick() {
    const st = S.room;
    if (!st || !st.game || st.status !== 'playing') return;
    const g = st.game;
    const tt = $('#turnTimer');
    if (tt && g.turnEndsAt) {
      const s = Math.max(0, Math.ceil((g.turnEndsAt - nowSrv()) / 1000));
      tt.textContent = '⏱ ' + s + ' ث';
      tt.classList.toggle('low', s <= 10);
    }
    const at = $('#aucTimer');
    if (at && g.auction) {
      const left = Math.max(0, g.auction.endsAt - nowSrv());
      at.textContent = '⏱ بيسكّر بعد ' + Math.ceil(left / 1000) + ' ثانية';
      const bar = $('#aucBar');
      if (bar) { bar.style.width = Math.min(100, (left / 8000) * 100) + '%'; bar.classList.toggle('low', left < 2500); }
    }
  }
  async function onCenterAction(el) {
    const a = el.dataset.a;
    if (a === 'info') { openTile(Number(el.dataset.i)); return; }
    if (a === 'bid') { act('bid', { amount: Number(el.dataset.v) }); return; }
    if (a === 'buildMode') { setBuildMode(!S.buildMode); return; }
    if (a === 'bankrupt') { if (await confirmBox('أكيد بدك تعلن الإفلاس؟ رح تطلع من اللعبة.')) act('bankrupt'); return; }
    el.disabled = true;
    act(a).then(() => { el.disabled = false; });
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
    const name = `<span class="pname">${esc(p.name)}${S.me && p.id === S.me.pid ? ' <small class="hint">(أنت)</small>' : ''}</span><span class="icons">${icons}</span>`;
    if (st.status === 'lobby') {
      const kick = isHost(st) && p.id !== st.hostId ? `<button class="x-btn" data-kick="${p.id}" title="طلّعه">✕</button>` : '';
      return `<div class="prow" data-prow="${p.id}">${avatar}${name}${kick}</div>`;
    }
    const canDeal = st.status === 'playing' && me && !me.bankrupt && p.id !== me.id && !p.bankrupt;
    const trade = canDeal ? `<button class="btn sm" data-trade="${p.id}" title="تبادل عقارات ومصاري">🤝</button><button class="btn sm" data-loan="${p.id}" title="قرض">💰</button>` : '';
    const worth = netWorth(st, p), owed = owedBy(st, p);
    const cash = owed > 0 ? -owed : p.money;
    const chips = ownedBy(st, p.id).map((i) => {
      const t = T(i), pr = g.props[i];
      const c = t.type === 'city' ? SET(t.set).color : '#8ea3b8';
      return `<i class="pchip ${pr.mortgaged ? 'mort' : ''}" style="background:${c}" title="${esc(t.name)}"></i>`;
    }).join('');
    // Compact row: avatar | name over money (money on the right, under the name) | deal buttons.
    const money = p.bankrupt ? '<span class="pmoney">—</span>'
      : `<span class="pmoney ${owed > 0 ? 'neg' : ''}" data-money="${p.money}">${sfmt(cash)}</span>${owed > 0 ? '<small class="debt-tag">عليه دين</small>' : ''}`;
    return `<div class="prow big ${isCur ? 'turn-on' : ''} ${p.bankrupt || p.left ? 'dead' : ''}" data-prow="${p.id}">
      <div class="prow-top">${avatar}<div class="pinfo"><div class="pline">${name}</div><div class="pline">${money}</div></div>${trade ? `<span class="pdeal">${trade}</span>` : ''}</div>
      ${p.bankrupt ? '' : `<div class="worth"><div class="worth-bar"><i style="width:${maxWorth ? Math.max(0, Math.round((worth / maxWorth) * 100)) : 0}%;background:${p.color}"></i></div><small class="${worth < 0 ? 'neg' : ''}">الثروة ${sfmt(worth)}</small></div>
      ${chips ? `<div class="pchips">${chips}</div>` : ''}`}
    </div>`;
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
  function countriesHTML(st) {
    const keys = Object.keys(S.board.sets).reverse();
    const host = isHost(st);
    return `<div class="panel"><div class="lbl"><span>🌍 دول اللوح</span>${host ? '<button class="btn sm" data-shuffle>🎲 دول عشوائية</button>' : ''}</div>
      <div class="country-list">${keys.map((k, n) => {
        const code = st.map && st.map[k], c = code && S.board.countries[code];
        if (!c) return '';
        return `<${host ? 'button' : 'div'} class="country ${host ? 'pick' : ''}" ${host ? `data-slot="${k}"` : ''}><span class="sw" style="background:${SET(k).color}"></span>${flag(code, 'sm')}<b>${esc(c.name)}</b><small>${S.board.fixed && S.board.fixed[k] === code ? (n === 0 ? 'ثابتة · الأغلى' : 'ثابتة') : n === keys.length - 1 ? 'الأرخص' : ''}</small></${host ? 'button' : 'div'}>`;
      }).join('')}</div>
      <div class="hint" style="text-align:start;margin-top:6px">سوريا والأردن والعراق دايماً موجودين، والباقي 5 دول عربية عشوائية${host ? ' — اضغط على أي دولة لتختار بدالها.' : '. صاحب الغرفة بيختار الدول.'}</div></div>`;
  }
  // Host picks a country for one board slot.
  function openCountryPicker(slot) {
    S.modal = { kind: 'country', slot };
    const st = S.room, map = st.map || {}, cur = map[slot];
    const arab = S.board.arab.filter((c) => S.board.countries[c]);
    const slotOf = (code) => Object.keys(map).find((k) => map[k] === code);
    const btns = (list) => list.map((code) => {
      const used = slotOf(code);
      return `<button class="cpick ${code === cur ? 'on' : ''}" data-code="${code}">${flag(code, 'mid0')}<span>${esc(S.board.countries[code].name)}</span>${used && used !== slot ? `<i class="used" style="background:${SET(used).color}" title="موجودة عاللوح — رح تتبادل"></i>` : ''}</button>`;
    }).join('');
    const body = `<div class="hint" style="text-align:start">اختار دولة لخانة اللون <span class="sw-inline" style="background:${SET(slot).color}"></span>. إذا الدولة موجودة بمكان تاني عاللوح، بيتبدّلوا.</div>
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
    return `<span class="sw" style="background:${sw}"></span>${t.type === 'city' ? flag(t.country, 'sm') : `<span class="mini-icon">${ART.icon(iconName(t))}</span>`}${esc(t.name)}`;
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
  function openLoan(toId) {
    const st = S.room, me = meP(st), them = st.players.find((p) => p.id === toId);
    if (!me || !them) return;
    S.modal = { kind: 'loan' };
    S.loan = { to: toId, role: 'lend', amount: 200, interest: 10, rounds: 5 };
    renderLoan();
  }
  function renderLoan() {
    const st = S.room, me = meP(st), L = S.loan, them = st.players.find((p) => p.id === L.to);
    if (!me || !them) { closeModal(); return; }
    const repay = Math.round(L.amount * (1 + L.interest / 100));
    const lender = L.role === 'lend' ? me : them;
    const seg = (key, opts) => opts.map(([v, l]) => `<button class="chip ${L[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${l}</button>`).join('');
    const body = `
      <div class="seg2">${seg('role', [['lend', '💰 بدي أقرضه'], ['borrow', '🙏 بدي أستلف منه']])}</div>
      <div class="set-row" style="border:0"><div class="st"><b>المبلغ</b><small>${esc(lender.name)} معه ${fmt(lender.money)}</small></div>
        <input type="number" id="loanAmount" min="10" step="10" value="${L.amount}" style="width:120px" dir="ltr"></div>
      <div class="cash-opts four">${[100, 200, 500, 1000].map((v) => `<button class="chip ${L.amount === v ? 'on' : ''}" data-amt="${v}">${fmt(v)}</button>`).join('')}</div>
      <div class="lbl">الفايدة</div><div class="cash-opts four">${seg('interest', [[0, '0%'], [10, '10%'], [20, '20%'], [30, '30%']])}</div>
      <div class="lbl">بيرجعهن خلال</div><div class="cash-opts">${seg('rounds', [[3, '3 جولات'], [5, '5 جولات'], [10, '10 جولات']])}</div>
      <div class="loan-sum">${L.role === 'lend' ? `بتعطي <b>${esc(them.name)}</b>` : `بتاخد من <b>${esc(them.name)}</b>`} <b dir="ltr">${fmt(L.amount)}</b>،
        وبيرجعوا <b dir="ltr">${fmt(repay)}</b> ${L.role === 'lend' ? 'إلك' : 'منك'} بعد ${L.rounds} جولات.
        <br><small class="hint">إذا ما رجّع بوقتها، المبلغ بيصير دين عليه متل الإيجار.</small></div>
      <div class="row"><button class="btn gold" id="loanSend">ابعت العرض</button><button class="btn ghost" data-close2>إلغاء</button></div>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell('💰 قرض مع ' + esc(them.name), body);
    bindModal(root);
    root.querySelector('[data-close2]').onclick = closeModal;
    $$('[data-k]', root).forEach((b) => { b.onclick = () => { const k = b.dataset.k; L[k] = k === 'role' ? b.dataset.v : Number(b.dataset.v); renderLoan(); }; });
    $$('[data-amt]', root).forEach((b) => { b.onclick = () => { L.amount = Number(b.dataset.amt); renderLoan(); }; });
    $('#loanAmount').onchange = (e) => { L.amount = Math.max(10, Math.floor(Number(e.target.value) || 0)); renderLoan(); };
    $('#loanSend').onclick = async () => {
      L.amount = Math.max(10, Math.floor(Number($('#loanAmount').value) || 0));
      try {
        await api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type: 'loanOffer', data: L });
        closeModal(); toast('انبعت عرض القرض ✔', 'ok');
      } catch (e) { toast(e.message); }
    };
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
      h += piecesHTML(st);
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
      if (me && !me.bankrupt && st.status === 'playing') h += '<button class="btn ghost sm" data-leave>انسحاب من اللعبة</button>';
      if (S.me && (st.status === 'ended' || (me && me.bankrupt))) h += '<a class="btn ghost sm" href="/">الصفحة الرئيسية</a>';
    }
    el.innerHTML = h;
  }
  async function onSideClick(e) {
    const t = e.target;
    const cash = t.closest('[data-cash]');
    if (cash && !cash.disabled) { act('settings', { startingCash: Number(cash.dataset.cash) }); return; }
    if (t.closest('[data-addbot]')) { act('addBot'); return; }
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
    if (t.closest('[data-leave]')) {
      const playing = S.room.status === 'playing';
      if (!(await confirmBox(playing ? 'إذا انسحبت رح تعتبر مفلس وأملاكك بترجع للبنك. أكيد؟' : 'أكيد بدك تطلع من الغرفة؟'))) return;
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
      if (!S.chatOpen) S.chatUnread += st.chat.filter((m) => m.t > S.chatLastT && !(S.me && m.pid === S.me.pid)).length;
      S.chatLastT = lastT;
    }
    renderChatBadge();
    const key = n ? lastT + ':' + n : '0';
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.innerHTML = n
      ? st.chat.map((m) => `<div class="chat-msg"><b style="color:${m.color}">${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('')
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
        <div class="kv"><span>الدولة</span><b style="direction:rtl;display:flex;align-items:center;gap:6px">${flag(t.country, 'sm')} ${esc(t.countryName)}</b></div>`;
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
    root.innerHTML = modalShell(`${t.type === 'city' ? flag(t.country, 'lg') : `<span class="head-icon">${ART.icon(iconName(t))}</span>`}${esc(t.name)}`, body, '', band);
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
    const art = t.type === 'city' ? flag(t.country, 'sm') : `<span class="mini-icon">${ART.icon(iconName(t))}</span>`;
    const tags = (pr && pr.mortgaged ? '<i class="md-tag">مرهونة</i>' : '') + (disabled ? '<i class="md-tag warn">فيها أبنية</i>' : '');
    return `<button type="button" class="mdeed ${on ? 'on' : ''}" style="--sc:${col}" ${attrs} ${disabled ? 'disabled' : ''}>
      <span class="md-band"></span><span class="md-art">${art}</span><b>${esc(t.name)}</b><small>${t.type === 'city' ? esc(t.countryName) + ' · ' : ''}${fmt(t.price)}</small>${tags}</button>`;
  }
  const avatarOf = (p) => `<span class="tk av" style="--pc:${p.color}">${ART.piece(p.piece)}</span>`;

  // ---------------------------------------------------------------- trade modal (offer / counter-offer)
  function openTrade(toId, prefill) {
    S.trade = prefill || { to: toId, give: new Set(), get: new Set(), giveMoney: 0, getMoney: 0 };
    S.modal = { kind: 'trade' };
    renderTrade();
  }
  function tradeBalance(st, give, get, giveMoney, getMoney) {
    const v = (set) => [...set].reduce((s2, i) => s2 + propValue(st, i), 0);
    return (v(give) + giveMoney) - (v(get) + getMoney); // > 0: good for the other side
  }
  function balanceText(diff, total) {
    if (Math.abs(diff) <= Math.max(10, total * 0.05)) return '<span class="bal even">⚖️ متوازنة</span>';
    return diff > 0 ? `<span class="bal them">الصفقة لصالحه بـ ${fmt(diff)}</span>` : `<span class="bal me">الصفقة لصالحك بـ ${fmt(-diff)}</span>`;
  }
  function renderTrade() {
    const st = S.room, me = meP(st), them = st.players.find((p) => p.id === S.trade.to);
    if (!me || !them || st.status !== 'playing') { closeModal(); return; }
    const T2 = S.trade;
    // drop selections that are no longer valid
    for (const i of [...T2.give]) if (!st.game.props[i] || st.game.props[i].owner !== me.id) T2.give.delete(i);
    for (const i of [...T2.get]) if (!st.game.props[i] || st.game.props[i].owner !== them.id) T2.get.delete(i);
    const cards = (pid, set, side) => {
      const list = ownedBy(st, pid);
      if (!list.length) return `<div class="hint">${pid === me.id ? 'ما عندك عقارات' : 'ما عنده عقارات'}</div>`;
      return list.map((i) => miniDeed(st, i, `data-tp="${side}" data-i="${i}"`, set.has(i), hasBuildings(st, i))).join('');
    };
    const chips = (side, max) => [50, 100, 500].map((v) => `<button type="button" class="chip" data-add="${side}" data-v="${v}">+${fmt(v)}</button>`).join('') +
      `<button type="button" class="chip" data-add="${side}" data-v="all">${side === 'give' ? 'كل اللي معي' : 'كل اللي معه'}</button><button type="button" class="chip" data-add="${side}" data-v="0">صفر</button>`;
    const names = (set, money) => [...[...set].map((i) => esc(T(i).name)), money ? fmt(money) : ''].filter(Boolean).join('، ') || 'ولا شي';
    const diff = tradeBalance(st, T2.give, T2.get, T2.giveMoney, T2.getMoney);
    const total = tradeBalance(st, T2.give, new Set(), T2.giveMoney, 0) + tradeBalance(st, T2.get, new Set(), T2.getMoney, 0);
    const body = `
      <div class="deal-top">
        <div class="deal-who">${avatarOf(me)}<div><b>أنت</b><small>معك ${fmt(me.money)}</small></div></div>
        <div class="deal-x">⇄</div>
        <div class="deal-who">${avatarOf(them)}<div><b>${esc(them.name)}</b><small>معه ${fmt(them.money)}</small></div></div>
      </div>
      <div class="trade-grid">
        <div class="trade-col"><h4>بتعطي</h4><div class="mdeeds">${cards(me.id, T2.give, 'give')}</div>
          <label class="money-in">💵 مصاري بتعطيها <input type="number" min="0" max="${me.money}" step="10" id="tGiveMoney" value="${T2.giveMoney || ''}" placeholder="$0" dir="ltr"></label>
          <div class="chips-row">${chips('give')}</div></div>
        <div class="trade-col"><h4>بتاخد من ${esc(them.name)}</h4><div class="mdeeds">${cards(them.id, T2.get, 'get')}</div>
          <label class="money-in">💵 مصاري بتاخدها <input type="number" min="0" max="${them.money}" step="10" id="tGetMoney" value="${T2.getMoney || ''}" placeholder="$0" dir="ltr"></label>
          <div class="chips-row">${chips('get')}</div></div>
      </div>
      <div class="deal-sum"><span>بتعطي: <b>${names(T2.give, T2.giveMoney)}</b></span><span class="deal-x sm">⇄</span><span>بتاخد: <b>${names(T2.get, T2.getMoney)}</b></span>${balanceText(diff, total)}</div>
      <div class="deal-err" id="tErr"></div>
      <div class="hint">العقارات اللي بدولتها أبنية لازم تنباع أبنيتها قبل التبادل.</div>
      <div class="row"><button class="btn gold" id="tSend">ابعت العرض 🤝</button><button class="btn ghost" data-close2>إلغاء</button></div>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell(T2.counterOf ? '↩️ عرض مضاد لـ ' + esc(them.name) : '🤝 صفقة مع ' + esc(them.name), body, 'wide deal');
    bindModal(root);
    root.querySelector('[data-close2]').onclick = closeModal;
    $$('[data-tp]', root).forEach((b) => {
      b.onclick = () => {
        const set = T2[b.dataset.tp], i = Number(b.dataset.i);
        if (set.has(i)) set.delete(i); else set.add(i);
        renderTrade();
      };
    });
    $$('[data-add]', root).forEach((b) => {
      b.onclick = () => {
        const side = b.dataset.add, key = side === 'give' ? 'giveMoney' : 'getMoney', max = side === 'give' ? me.money : them.money;
        const v = b.dataset.v;
        T2[key] = v === 'all' ? max : v === '0' ? 0 : Math.min(max, (T2[key] || 0) + Number(v));
        renderTrade();
      };
    });
    const money = (id, key, max) => {
      $(id).onchange = (e) => { T2[key] = Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))); renderTrade(); };
    };
    money('#tGiveMoney', 'giveMoney', me.money);
    money('#tGetMoney', 'getMoney', them.money);
    $('#tSend').onclick = async () => {
      T2.giveMoney = Math.max(0, Math.floor(Number($('#tGiveMoney').value) || 0));
      T2.getMoney = Math.max(0, Math.floor(Number($('#tGetMoney').value) || 0));
      const errEl = $('#tErr');
      const bad = !T2.give.size && !T2.get.size ? 'لازم تختار عقار واحد على الأقل (منك أو منه)'
        : T2.giveMoney > me.money ? `ما معك ${fmt(T2.giveMoney)}`
          : T2.getMoney > them.money ? `${them.name} ما معه ${fmt(T2.getMoney)}` : '';
      if (bad) { errEl.textContent = '⚠️ ' + bad; return; }
      const data = { to: T2.to, give: { props: [...T2.give], money: T2.giveMoney }, get: { props: [...T2.get], money: T2.getMoney } };
      try {
        await api('/api/act', { code: S.code, pid: S.me.pid, token: S.me.token, type: 'tradePropose', data });
        if (T2.counterOf) act('tradeDecline', { id: T2.counterOf });
        closeModal();
        toast(T2.counterOf ? 'انبعت العرض المضاد ✔' : 'انبعت العرض ✔', 'ok');
      } catch (e) { errEl.textContent = '⚠️ ' + e.message; }
    };
  }
  // Incoming offer: same visual format, with accept / decline / counter.
  function openOffer(id) {
    const st = S.room, me = meP(st), tr = st && st.game && st.game.trades.find((t) => t.id === id);
    if (!me || !tr || tr.to !== me.id) { closeModal(); return; }
    const from = st.players.find((p) => p.id === tr.from);
    S.modal = { kind: 'offer', id };
    const side = (props, money) => `${props.length ? props.map((i) => miniDeed(st, i, 'tabindex="-1"', true)).join('') : ''}${money ? `<div class="md-money">💵 ${fmt(money)}</div>` : ''}${!props.length && !money ? '<div class="hint">ولا شي</div>' : ''}`;
    const diff = tradeBalance(st, new Set(tr.get.props), new Set(tr.give.props), tr.get.money, tr.give.money);
    const total = tradeBalance(st, new Set(tr.give.props), new Set(), tr.give.money, 0) + tradeBalance(st, new Set(tr.get.props), new Set(), tr.get.money, 0);
    const body = `
      <div class="deal-top">
        <div class="deal-who">${avatarOf(from)}<div><b>${esc(from.name)}</b><small>معه ${fmt(from.money)}</small></div></div>
        <div class="deal-x">⇄</div>
        <div class="deal-who">${avatarOf(me)}<div><b>أنت</b><small>معك ${fmt(me.money)}</small></div></div>
      </div>
      <div class="trade-grid">
        <div class="trade-col"><h4>بيعطيك</h4><div class="mdeeds ro">${side(tr.give.props, tr.give.money)}</div></div>
        <div class="trade-col"><h4>بدو منك</h4><div class="mdeeds ro">${side(tr.get.props, tr.get.money)}</div></div>
      </div>
      <div class="deal-sum">${balanceText(diff, total)}</div>
      <div class="row"><button class="btn gold" data-o="acc">✅ قبول</button><button class="btn danger" data-o="dec">❌ رفض</button><button class="btn" data-o="ctr">↩️ عرض مضاد</button></div>`;
    const root = $('#modal-root');
    root.innerHTML = modalShell(`🤝 عرض من ${esc(from.name)}`, body, 'wide deal');
    bindModal(root);
    root.querySelector('[data-o="acc"]').onclick = () => { act('tradeAccept', { id }); closeModal(); };
    root.querySelector('[data-o="dec"]').onclick = () => { act('tradeDecline', { id }); closeModal(); };
    root.querySelector('[data-o="ctr"]').onclick = () => {
      openTrade(tr.from, { to: tr.from, give: new Set(tr.get.props), get: new Set(tr.give.props), giveMoney: tr.get.money, getMoney: tr.give.money, counterOf: id });
    };
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
      FX.Sound.play('turn');
      if (!S.modal) openOffer(tr.id); else offerBanner(tr, st.players.find((p) => p.id === tr.from));
    }
    // my offers that disappeared -> accepted or declined?
    const newLog = st.log.filter((l) => !prev.log.some((o) => o.t === l.t && o.text === l.text)).map((l) => l.text);
    for (const tr of pt) {
      if (tr.from !== meId || nt.some((x) => x.id === tr.id)) continue;
      const other = name(tr.to);
      if (newLog.some((t) => t.includes(`✅ ${other} قبل صفقة`))) { toast(`✅ ${other} قبل عرضك`, 'ok'); FX.Sound.play('buy'); }
      else if (newLog.some((t) => t.includes(`❌ ${other} رفض صفقة`))) { toast(`❌ ${other} رفض عرضك`); FX.Sound.play('pay'); }
    }
    // offer to me withdrawn while its modal is open
    if (S.modal && S.modal.kind === 'offer' && !nt.some((x) => x.id === S.modal.id)) closeModal();
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.room) { layoutTokens(); updateCenter(S.room); } });
  boot();
})();
