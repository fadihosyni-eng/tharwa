'use strict';
// Visual & sound effects: 3D dice, floating money, confetti, synth sounds (no audio files).
(() => {
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const pips = (v) => Array.from({ length: 9 }, (_, k) => `<span class="${PIPS[v].includes(k) ? 'on' : ''}"></span>`).join('');
  const val = (v) => (PIPS[v] ? Number(v) : 1);

  // A die only ever shows the number that was actually rolled. Only the front face (the one that
  // ends up facing the player) carries pips — the other five faces are blank — so the tumble
  // (whole turns on X/Y/Z, bounce, blur) can never flash another number, not even a second copy
  // of the same face, and it always lands square on that front face (no re-roll at the end).
  const BLANK = '<span></span>'.repeat(9);
  const faces = (v) => ['f1', 'f6', 'f2', 'f5', 'f3', 'f4'].map((p, k) => (k
    ? `<div class="face ${p} blank" data-v="0">${BLANK}</div>`
    : `<div class="face ${p} lead${v === 1 ? ' v1 one' : ''}" data-v="${v}">${pips(v)}</div>`)).join('');
  function diceHTML(values = [5, 6]) {
    return values.map((v) => `<div class="die3d"><div class="tilt"><div class="cube">${faces(val(v))}</div></div></div>`).join('');
  }
  function paint(cube, v) {
    const all = [...cube.querySelectorAll('.face')];
    const lead = cube.querySelector('.face.f1, .face.front') || all[0];
    all.forEach((f) => {
      const want = f === lead ? v : 0;
      if (f.dataset.v === String(want)) return;
      f.innerHTML = want ? pips(want) : BLANK;
      f.dataset.v = String(want);
      f.classList.toggle('lead', f === lead);
      f.classList.toggle('blank', !want);
      f.classList.toggle('v1', want === 1);
      f.classList.toggle('one', want === 1); // Ludo's die marks the red «1» with .one
    });
  }
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  // Board dice (#dice): real 3D crystal dice (three + cannon-es, /tharwa/dice3d.js, loaded on demand).
  // The CSS dice below stay as the fallback (no WebGL, script failed, or `?dice2d` in the URL).
  let d3Load = null;
  function want3D() {
    if (/[?&]dice2d\b/.test(location.search)) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }
  function attach3D(root) {
    if (root._d3tried) return;
    root._d3tried = true;
    if (!want3D()) return;
    d3Load = d3Load || new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = '/tharwa/dice3d.js'; s.async = true;
      s.onload = () => (window.TharwaDice3D ? ok(window.TharwaDice3D) : fail(new Error('no dice')));
      s.onerror = fail;
      document.head.appendChild(s);
    });
    d3Load.then((M) => {
      if (!root.isConnected) return;
      const d = M.mount(root);
      if (!d) return;
      root._d3 = d;
      root.classList.add('d3');
      d.show(root._vals || [0, 0]);
    }).catch(() => { /* keep the CSS dice */ });
  }

  let spins = 0;
  function setDice(root, values, animate) {
    if (!root) return;
    if (root.id === 'dice') {
      root._vals = values.map(val);
      attach3D(root);
      if (root._d3) { if (animate) root._d3.roll(root._vals); else root._d3.show(root._vals); return; }
    }
    if (animate && calm()) animate = false;
    if (animate) spins++;
    const cubes = root.querySelectorAll('.cube');
    values.forEach((raw, k) => {
      const c = cubes[k];
      if (!c) return;
      const v = val(raw);
      paint(c, v); // the new value is on every face before the cube starts moving
      // whole turns only, so the resting pose is always the same flat front face
      const dir = k % 2 ? -1 : 1;
      const x = spins * 720, y = dir * spins * 360, z = dir * spins * 360;
      c.style.transition = animate ? `transform ${0.95 - k * 0.05}s cubic-bezier(.18,.85,.28,1)` : 'none';
      c.style.transform = `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`;
    });
    if (animate) {
      root.classList.remove('bounce', 'rolling'); void root.offsetWidth; root.classList.add('bounce', 'rolling');
      clearTimeout(root._rollT);
      root._rollT = setTimeout(() => root.classList.remove('rolling'), 1000);
    }
  }

  function floatText(x, y, text, kind = 'plus') {
    const el = document.createElement('div');
    el.className = 'float-money ' + kind;
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  function confetti(ms = 4200) {
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    const colors = ['#f5c04a', '#38d4c0', '#f0585e', '#a78bfa', '#5ad06b', '#4f9df7', '#fb923c', '#ffffff'];
    const parts = Array.from({ length: 170 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4, r: 4 + Math.random() * 6,
      a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      }
      if (t - t0 < ms) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }

  // ---------------------------------------------------------------- sound (WebAudio synth)
  const Sound = {
    on: (() => { try { return localStorage.getItem('tharwa_sound') !== '0'; } catch (e) { return true; } })(),
    ctx: null,
    toggle() {
      this.on = !this.on;
      try { localStorage.setItem('tharwa_sound', this.on ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.on) this.play('coin');
      return this.on;
    },
    ac() {
      if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this.ctx = new C(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(f, dur, type = 'sine', vol = 0.12, when = 0, slideTo) {
      const ac = this.ac(); if (!ac) return;
      const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.1, when = 0, freq = 1800, type = 'bandpass') {
      const ac = this.ac(); if (!ac) return;
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      f.type = type; f.frequency.value = freq; s.buffer = buf; g.gain.value = vol;
      s.connect(f).connect(g).connect(ac.destination); s.start(ac.currentTime + when);
    },
    play(name) {
      if (!this.on || document.hidden) return;
      try {
        switch (name) {
          case 'dice': for (let k = 0; k < 6; k++) this.noise(0.05, 0.16, k * 0.09 + Math.random() * 0.03); break;
          // Soft, round tones (sine/triangle) at ~0.08-0.12 so they are audible but not harsh.
          case 'coin': this.tone(1319, 0.1, 'sine', 0.1); this.tone(1760, 0.2, 'sine', 0.09, 0.07); this.tone(2637, 0.12, 'sine', 0.03, 0.07); break;
          case 'pay': this.tone(523, 0.12, 'triangle', 0.1, 0, 392); this.tone(392, 0.18, 'triangle', 0.08, 0.1, 294); break;
          case 'buy': [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.24, 'triangle', 0.09, k * 0.065)); break;
          // Hammer: three wooden knocks (pitch-dropping thud + short low noise), the last a bit stronger.
          case 'build': [0, 0.15, 0.3].forEach((w, k) => {
            const v = k === 2 ? 0.12 : 0.1;
            this.tone(170, 0.11, 'sine', v, w, 70); this.tone(340, 0.05, 'triangle', v * 0.45, w, 160);
            this.noise(0.05, v * 0.9, w, 900, 'lowpass');
          }); break;
          // Money being counted: 5 quick coin clinks with a little pitch jitter + paper flick.
          case 'cash': for (let k = 0; k < 5; k++) {
            const w = k * 0.085, f = 1568 + ((k * 197) % 420);
            this.tone(f, 0.09, 'sine', 0.09, w); this.tone(f * 1.5, 0.06, 'sine', 0.035, w + 0.005);
            this.noise(0.03, 0.05, w, 3200);
          } this.tone(2093, 0.3, 'sine', 0.07, 0.44); break;
          case 'turn': this.tone(880, 0.12, 'sine', 0.1); this.tone(1175, 0.22, 'sine', 0.09, 0.1); break;
          case 'card': this.tone(600, 0.25, 'sine', 0.06, 0, 1200); break;
          case 'jail': this.tone(220, 0.3, 'sawtooth', 0.06, 0, 110); this.tone(196, 0.35, 'sawtooth', 0.05, 0.2, 98); break;
          case 'bid': this.tone(740, 0.08, 'square', 0.05); break;
          case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, k) => this.tone(f, 0.28, 'triangle', 0.1, k * 0.13)); break;
          case 'bankrupt': [392, 330, 262, 196].forEach((f, k) => this.tone(f, 0.3, 'triangle', 0.08, k * 0.16)); break;
          default: break;
        }
      } catch (e) { /* audio not available */ }
    },
  };

  window.FX = { diceHTML, setDice, floatText, confetti, Sound };
})();
