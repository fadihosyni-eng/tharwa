// «لودو» board geometry, shared by the 2D (SVG) and 3D (Three.js) renderers. No dependencies, so it stays
// in the small main chunk. Must match games/ludo.js: 52-square track clockwise, corner k starts at track
// index START[k]; progress -1 = base, 0..50 track, 51..55 home column, 56 = home.
export type Cell = [number, number];

export const START = [0, 13, 26, 39];
export const STARS = [8, 21, 34, 47];
export const HOME = 56;
export const CORNER_NAMES = ['الأحمر', 'الأخضر', 'الأصفر', 'الأزرق'];
/** top-left cell of each corner's 6×6 base (corner 0 = top-left, clockwise) */
export const BASE_ORIGIN: Cell[] = [[0, 0], [9, 0], [9, 9], [0, 9]];

// the 52 shared squares, clockwise, starting at corner 0's start square (cell coordinates on a 15×15 grid)
export const TRACK: Cell[] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];
export const HOME_COL: Cell[][] = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
/** where finished tokens gather (cell units, centre triangle of each corner) */
export const HOME_SPOT: Cell[] = [[6.55, 7.5], [7.5, 6.55], [8.45, 7.5], [7.5, 8.45]];
/** start-square arrow direction in degrees: corner 0 moves right, 1 down, 2 left, 3 up */
export const ARROW_ROT = [0, 90, 180, 270];

/**
 * Centre of a token in board cell units (0..15 on both axes): base spots, track, home column, home.
 * The 2D renderer multiplies by its cell size; the 3D renderer maps it to world units.
 */
export function cellPos(corner: number, prog: number, i: number): Cell {
  if (prog < 0) { const [ox, oy] = BASE_ORIGIN[corner]; return [ox + (i % 2 ? 4 : 2), oy + (i < 2 ? 2 : 4)]; }
  if (prog <= 50) { const [x, y] = TRACK[(START[corner] + prog) % 52]; return [x + 0.5, y + 0.5]; }
  if (prog <= 55) { const [x, y] = HOME_COL[corner][prog - 51]; return [x + 0.5, y + 0.5]; }
  const [hx, hy] = HOME_SPOT[corner];
  const off = [[-7, -7], [7, -7], [-7, 7], [7, 7]][i];
  return [hx + (off[0] * (corner % 2 ? 1.3 : 0.6)) / 40, hy + (off[1] * (corner % 2 ? 0.6 : 1.3)) / 40];
}
