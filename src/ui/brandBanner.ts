/**
 * The KA-III banner as a DOM mark. Separate from ui/brand.ts so the banner generator
 * stays out of the boot bundle: it is only needed once the title screen appears.
 */

import { brandPulse, cached, quantise, type BrandPulse, type IndexedPixels } from '../art/brand';
import { bannerPixels } from '../art/brand/banner';
import { brandMotionReduced, mount, type MarkOpts } from './brand';

export function banner(p: BrandPulse): IndexedPixels {
  const r = quantise(p.red);
  const g = quantise(p.green);
  return cached(`b:${r}:${g}`, () => bannerPixels({ red: r, green: g }));
}

export function bannerMark(o: MarkOpts = {}): HTMLElement {
  const still = () => brandMotionReduced() || o.animate === false;
  // The banner's lights run a little behind the emblems so the two never pulse in sync.
  return mount('banner', banner(brandPulse(0, still())), (t) => banner(brandPulse(t + 1300, still())), o);
}
