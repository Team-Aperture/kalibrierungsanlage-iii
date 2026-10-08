// TEMPORARY placeholder — replaced by the designed pixel-art banner.
export interface BannerOpts { red?: number; green?: number }
export interface IndexedPixels { w: number; h: number; data: Uint8Array }
export const BANNER_W = 288;
export const BANNER_H = 92;
export function bannerPixels(opts: BannerOpts = {}): IndexedPixels {
  const data = new Uint8Array(BANNER_W * BANNER_H).fill(4);
  for (let x = 0; x < BANNER_W; x++) { data[x] = 9; data[(BANNER_H - 1) * BANNER_W + x] = 2; }
  for (let y = 30; y < 40; y++) for (let x = 10; x < 18; x++) data[y * BANNER_W + x] = (opts.red ?? 0) > 0.5 ? 19 : 18;
  for (let y = 30; y < 40; y++) for (let x = 270; x < 278; x++) data[y * BANNER_W + x] = (opts.green ?? 0) > 0.5 ? 25 : 24;
  return { w: BANNER_W, h: BANNER_H, data };
}
