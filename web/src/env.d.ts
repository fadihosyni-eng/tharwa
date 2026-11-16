/// <reference types="astro/client" />

// Globals set by the shared art/flag/effect scripts of the game (public/art.js, flags.js, fx.js).
interface TharwaArt {
  icon(name: string): string;
  piece(key: string): string;
  pieceLabel(key: string): string;
  avatar(key: string): string;
  ui(name: string, cls?: string): string;
  iconize(node: Node): void;
  PIECE_KEYS: string[];
  AVATAR_KEYS: string[];
  UI_KEYS: string[];
}
interface TharwaFx {
  diceHTML(values?: number[]): string;
  setDice(root: Element, values: number[], animate: boolean): void;
  Sound: { on: boolean; toggle(): boolean; play(name: string): void };
}
interface Window {
  ART: TharwaArt;
  FX: TharwaFx;
  flagSVG(code: string): string;
}
declare module '*?raw' {
  const src: string;
  export default src;
}
