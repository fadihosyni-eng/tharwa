'use strict';
// Visual & sound effects: 3D dice, floating money, confetti, synth sounds (no audio files).
(() => {
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const pips = (v) => Array.from({ length: 9 }, (_, k) => `<span class="${PIPS[v].includes(k) ? 'on' : ''}"></span>`).join('');
  // Face placement: 1 front, 6 back, 2 right, 5 left, 3 top, 4 bottom.
  const ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };

  function diceHTML() {
    const one = `<div class="die3d"><div class="tilt"><div class="cube">${[1, 6, 2, 5, 3, 4].map((v) => `<div class="face f${v}">${pips(v)}</div>`).join('')}</div></div></div>`;
    return one + one;
  }
  let spins = 0;
  function setDice(root, values, animate) {
    if (animate) spins++;
    const cubes = root.querySelectorAll('.cube');
    values.forEach((v, k) => {
      const c = cubes[k];
      if (!c) return;
      const [x, y] = ROT[v] || ROT[1];
      const extra = spins * 720 + k * 360;
      c.style.transition = animate ? 'transform 0.95s cubic-bezier(.2,.9,.25,1)' : 'none';
      c.style.transform = `rotateX(${x + extra}deg) rotateY(${y + extra}deg)`;
    });
    if (animate) {
      root.classList.remove('bounce'); void root.offsetWidth; root.classList.add('bounce');
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
