// Kenney CC0 samples (web/public/ludo3d/sfx, converted to small mono mp3). They go through the site's own
// AudioContext (window.FX.Sound) and obey its mute switch (localStorage `tharwa_sound` = '0' → silent),
// so the speaker button in the room silences these too. Samples load lazily; until a sample is decoded
// the call is simply skipped (or falls back to the site's synth sound for turn/win/lose).
const BASE = '/ludo3d/sfx/';
const NAMES = ['roll1', 'roll2', 'reveal', 'hop1', 'hop2', 'capture', 'home', 'turn', 'win', 'lose'] as const;
export type Sfx = (typeof NAMES)[number];
const VOLUME: Partial<Record<Sfx, number>> = { hop1: 0.22, hop2: 0.22, reveal: 0.3, roll1: 0.4, roll2: 0.4, capture: 0.4, home: 0.32, turn: 0.28, win: 0.3, lose: 0.26 };

type SoundApi = { on: boolean; ac(): AudioContext | null; play(n: string): void };
const fx = (): SoundApi | null => { try { return (window as any).FX.Sound as SoundApi; } catch { return null; } };
const muted = () => { const s = fx(); return !s || !s.on || document.hidden; };

const buffers = new Map<Sfx, AudioBuffer>();
let loading: Promise<void> | null = null;

/** start fetching + decoding (only once there is an AudioContext, i.e. after sound is allowed) */
export function preload() {
  if (loading || muted()) return;
  const s = fx();
  const ac = s && s.ac();
  if (!ac) return;
  loading = Promise.all(NAMES.map(async (n) => {
    try {
      const r = await fetch(BASE + n + '.mp3');
      if (!r.ok) return;
      buffers.set(n, await ac.decodeAudioData(await r.arrayBuffer()));
    } catch { /* this one stays silent */ }
  })).then(() => undefined);
}

export function play(name: Sfx, opts: { rate?: number; gain?: number; when?: number } = {}) {
  if (muted()) return;
  const s = fx()!;
  const ac = s.ac();
  if (!ac) return;
  if (!loading) preload();
  const buf = buffers.get(name);
  if (!buf) return;
  try {
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf;
    src.playbackRate.value = opts.rate || 1;
    g.gain.value = (VOLUME[name] ?? 0.3) * (opts.gain ?? 1);
    src.connect(g).connect(ac.destination);
    src.start(ac.currentTime + (opts.when || 0));
  } catch { /* audio not available */ }
}

/**
 * The room (room.ts) plays 'turn', 'win' and 'bankrupt' through window.FX.Sound.play with synth tones.
 * On the 3D Ludo page those are swapped for the Kenney samples once decoded (the mute switch still applies:
 * FX.Sound.play is a no-op when sound is off, and so is this wrapper).
 */
export function routeRoomSounds() {
  const s = fx() as (SoundApi & { __ludo3d?: boolean }) | null;
  if (!s || s.__ludo3d) return;
  s.__ludo3d = true;
  const orig = s.play.bind(s);
  const map: Record<string, Sfx> = { turn: 'turn', win: 'win', bankrupt: 'lose' };
  s.play = (n: string) => {
    const k = map[n];
    if (k && buffers.has(k)) { play(k); return; }
    orig(n);
  };
}
