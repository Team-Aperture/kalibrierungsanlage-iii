/** Hand-authored 16×16 inventory icons (palette indices via character maps). */

import { PALETTE_U32 } from './palette';

const MAPS: Record<string, { rows: string[]; colors: Record<string, number> }> = {
  sicherung: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.kkkkkkkkkkkkkk.',
      'kbbkwwwwwwwwkbbk',
      'kbbkwmmwwmmwkbbk',
      'kaakwmwwwwmwkaak',
      'kaakwmmwwmmwkaak',
      'kbbkwmwwwwmwkbbk',
      'kbbkwmwwmmwwkbbk',
      '.kkkkkkkkkkkkkk.',
      '................',
      '................',
      '................',
    ],
    colors: { a: 15, b: 26, k: 1, w: 10, m: 7 },
  },
  kurbel: {
    rows: [
      '................',
      '..........kk....',
      '.........kwwk...',
      '.........kwsk...',
      '..........kssk..',
      '...........kssk.',
      '......kkkkkkssk.',
      '.....kwwwwwwwsk.',
      '.....ksssssssk..',
      '.....kssk.kkk...',
      '.....kssk.......',
      '.....kbbk.......',
      '.....kbbk.......',
      '.....kbbk.......',
      '......kk........',
      '................',
    ],
    colors: { k: 1, w: 10, s: 7, b: 17 },
  },
};

export function iconCanvas(id: string): HTMLCanvasElement {
  const def = MAPS[id];
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  if (!def) return cv;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(16, 16);
  const u32 = new Uint32Array(img.data.buffer);
  def.rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const c = def.colors[row[x]];
      if (c !== undefined) u32[y * 16 + x] = PALETTE_U32[c];
    }
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}
