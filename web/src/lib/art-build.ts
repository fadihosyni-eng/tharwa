// Build-time access to the game's own SVG art (public/art.js, flags.js, fx.js).
// The scripts only define pure string builders at load time, so they run here against a tiny
// fake `window` and the static pages get the exact same icons as the game — nothing redrawn.
import artSrc from '../../../public/art.js?raw';
import flagsSrc from '../../../public/flags.js?raw';
import fxSrc from '../../../public/fx.js?raw';

type Win = { ART: TharwaArt; FX: TharwaFx; flagSVG(code: string): string };
const win = {} as Win;
for (const src of [artSrc, flagsSrc, fxSrc]) new Function('window', 'localStorage', 'document', src)(win, undefined, undefined);

export const ART = win.ART;
export const ui = (name: string, cls = '') => win.ART.ui(name, cls);
export const flag = (code: string) => win.flagSVG(code);
export const diceHTML = () => win.FX.diceHTML();
export const PIECE_COLORS = ['#f5c04a', '#38d4c0', '#f0585e', '#a78bfa', '#5ad06b', '#f472b6', '#4f9df7', '#fb923c'];
