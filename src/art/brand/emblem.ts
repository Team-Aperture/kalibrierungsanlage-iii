// TEMPORARY placeholder — replaced by the designed pixel-art emblem.
export type EmblemVariant = 'full' | 'simple' | 'screen' | 'badge';
export interface EmblemOpts { red?: number; green?: number; spark?: number }
export interface IndexedPixels { w: number; h: number; data: Uint8Array }
const SIZE: Record<EmblemVariant, number> = { full: 96, simple: 48, screen: 32, badge: 15 };
export function emblemPixels(variant: EmblemVariant, opts: EmblemOpts = {}): IndexedPixels {
  const s = SIZE[variant];
  const data = new Uint8Array(s * s).fill(255);
  const c = (s - 1) / 2;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
    if (r > s / 2) continue;
    data[y * s + x] = r > s / 2 - Math.max(1, s / 12) ? (dx < 0 ? ((opts.red ?? 0) > 0.5 ? 19 : 18) : (opts.green ?? 0) > 0.5 ? 25 : 24) : 1;
  }
  data[Math.round(s * 0.3) * s + Math.round(c)] = (opts.spark ?? 0) > 0.5 ? 27 : 20;
  return { w: s, h: s, data };
}
