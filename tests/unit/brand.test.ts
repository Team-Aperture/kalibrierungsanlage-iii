import { describe, expect, it } from 'vitest';
import { bannerPixels, BANNER_H, BANNER_W } from '../../src/art/brand/banner';
import { emblemPixels, type EmblemVariant } from '../../src/art/brand/emblem';
import { bootFrame, DOWN, scanlines, stepped, UP } from '../../src/art/brand/fx';
import { brandPulse, EMBLEM_SIZE, emblemBoot, PULSE_PERIOD, STILL } from '../../src/art/brand/index';
import { C, RAMP } from '../../src/art/palette';

const VARIANTS: Array<[EmblemVariant, number, number]> = [
  ['full', 95, 96],
  ['simple', 47, 48],
  ['screen', 31, 32],
  ['badge', 15, 15],
];

const RED = new Set<number>([C.RED_D, C.RED, C.SALMON]);
const GREEN = new Set<number>([C.G2, C.MINT, C.CYAN]);

function valid(data: Uint8Array): boolean {
  return data.every((v) => v === 255 || (v >= 0 && v < 28));
}

describe('Team_Aperture emblem', () => {
  for (const [variant, lo, hi] of VARIANTS) {
    it(`${variant}: square ${lo}–${hi} px, palette-only, transparent corners`, () => {
      for (const opts of [{}, { red: 1, green: 1, spark: 1 }, { red: 0.5, green: 0.25, spark: 0.75 }]) {
        const px = emblemPixels(variant, opts);
        expect(px.w).toBe(px.h);
        expect(px.w).toBeGreaterThanOrEqual(lo);
        expect(px.w).toBeLessThanOrEqual(hi);
        expect(px.data.length).toBe(px.w * px.h);
        expect(valid(px.data)).toBe(true);
        // A disc: the four corners stay transparent.
        for (const i of [0, px.w - 1, px.w * (px.h - 1), px.w * px.h - 1]) expect(px.data[i]).toBe(255);
      }
      // The size table used for blank boot frames matches the generator.
      expect(emblemPixels(variant).w).toBe(EMBLEM_SIZE[variant]);
      expect(emblemBoot(variant, 0).w).toBe(EMBLEM_SIZE[variant]);
    });

    it(`${variant}: red lives on the left, green on the right`, () => {
      const px = emblemPixels(variant);
      let redL = 0;
      let redR = 0;
      let greenL = 0;
      let greenR = 0;
      const mid = (px.w - 1) / 2;
      for (let y = 0; y < px.h; y++) {
        for (let x = 0; x < px.w; x++) {
          const c = px.data[y * px.w + x];
          if (x < mid) {
            if (RED.has(c)) redL++;
            if (GREEN.has(c)) greenL++;
          } else if (x > mid) {
            if (RED.has(c)) redR++;
            if (GREEN.has(c)) greenR++;
          }
        }
      }
      expect(redL).toBeGreaterThan(redR * 2);
      expect(greenR).toBeGreaterThan(greenL * 2);
    });

    it(`${variant}: the light pulse changes pixels without changing the shape`, () => {
      const rest = emblemPixels(variant);
      const peak = emblemPixels(variant, { red: 1, green: 1, spark: 1 });
      let changed = 0;
      for (let i = 0; i < rest.data.length; i++) {
        if (rest.data[i] !== peak.data[i]) changed++;
        // Same silhouette: transparency never changes with the light state.
        expect(peak.data[i] === 255).toBe(rest.data[i] === 255);
      }
      expect(changed).toBeGreaterThan(0);
      // Subtle: well under half of the emblem changes at the peak.
      expect(changed).toBeLessThan(rest.data.length * 0.35);
    });

    it(`${variant}: every pulse level the game uses is palette-only with the same silhouette`, () => {
      const rest = emblemPixels(variant);
      for (let t = 0; t < PULSE_PERIOD; t += 130) {
        const px = emblemPixels(variant, brandPulse(t));
        expect(valid(px.data)).toBe(true);
        for (let i = 0; i < px.data.length; i++) expect(px.data[i] === 255).toBe(rest.data[i] === 255);
      }
      // The still frame (reduced motion, wall paint) equals the resting look on the
      // narrow-feature variants (no dither speckle at the low levels).
      if (variant !== 'full') expect(emblemPixels(variant, STILL).data).toEqual(rest.data);
    });
  }
});

describe('KA-III banner', () => {
  it('fits the title-screen bounds and uses the palette only', () => {
    const px = bannerPixels();
    expect(px.w).toBe(BANNER_W);
    expect(px.h).toBe(BANNER_H);
    expect(BANNER_W).toBeGreaterThanOrEqual(256);
    expect(BANNER_W).toBeLessThanOrEqual(320);
    expect(BANNER_H).toBeLessThanOrEqual(104);
    expect(valid(px.data)).toBe(true);
    expect(valid(bannerPixels({ red: 1, green: 1 }).data)).toBe(true);
  });
});

describe('brand effects', () => {
  it('ramp steps never leave their ramp', () => {
    for (const ramp of [RAMP.red, RAMP.green, RAMP.steel]) {
      // Entries shared between ramps (void, brown-black, peach, white) step along their first ramp.
      for (const c of ramp.filter((v) => ![C.VOID, C.BR0, C.PEACH, C.WHITE].includes(v as never)).slice(0, -1)) {
        expect([...ramp, C.WHITE, C.VOID, C.BR0]).toContain(UP[c]);
        expect([...ramp, C.VOID, C.BR0]).toContain(DOWN[c]);
      }
    }
    expect(stepped(C.RED, 1)).toBe(C.SALMON);
    // The emblem's dark red (brown-black under the red floor glow) brightens into red.
    expect(UP[C.BR0]).toBe(C.RED_D);
    // …and the spark's peach dims to a neutral amber, not to the red side.
    expect(DOWN[C.PEACH]).toBe(C.AMBER);
    expect(stepped(C.MINT, -1)).toBe(C.G2);
    expect(stepped(255, 2)).toBe(255);
  });

  it('boot reveal starts dark, ends on the source, keeps palette and size', () => {
    const src = emblemPixels('screen');
    expect(bootFrame(src, 0).data.every((v) => v === 255)).toBe(true);
    expect(bootFrame(src, 1)).toBe(src);
    for (let p = 0.05; p < 1; p += 0.07) {
      const f = bootFrame(src, p);
      expect(f.w).toBe(src.w);
      expect(f.h).toBe(src.h);
      expect(valid(f.data)).toBe(true);
    }
    expect(valid(scanlines(src).data)).toBe(true);
  });

  it('pulse: red and green breathe in turns, one spark per period', () => {
    let sparks = 0;
    let prev = 0;
    // The flare starts ~90 ms before each crossing, so stop well before the fourth one.
    for (let t = 0; t < PULSE_PERIOD * 3 - 200; t += 20) {
      const p = brandPulse(t);
      for (const v of [p.red, p.green, p.spark]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      if (p.spark >= 0.75 && prev < 0.75) sparks++;
      prev = p.spark;
    }
    // Exactly one spark per period: at t = 0, 1 and 2 periods.
    expect(sparks).toBe(3);
    const a = brandPulse(PULSE_PERIOD / 4);
    expect(a.red).toBeGreaterThan(a.green);
    const b = brandPulse((PULSE_PERIOD * 3) / 4);
    expect(b.green).toBeGreaterThan(b.red);
  });

  it('reduced motion is a fixed resting state', () => {
    expect(brandPulse(0, true)).toEqual(brandPulse(12345, true));
  });
});
