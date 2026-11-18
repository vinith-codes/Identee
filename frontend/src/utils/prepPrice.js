// utils/prepPrice.js — what "Prepare for print" will cost for one picture (18 Nov 2026: the button always showed one
// Topaz unit, "about ₹4.5", but VF-2026-0083's owl was billed 3 units, ₹13.5). Worked out the way the server does it
// (server/controllers/printFileController.js): the 4K copy first when the picture is under 4K, then how many times it is
// enlarged (enough for 600 DPI, at most 6× with Topaz / 4× with Real-ESRGAN, never over 90 MP), then the enlarger.

const PRINT_DPI = 600;
const MAX_PIXELS = 90e6;
// Google's 4K copy keeps the picture's shape at about 16.8 MP (4096×4096, 3712×4608 for 4:5, …)
const FOUR_K_COPY_PIXELS = 16.8e6;

/**
 * Topaz's billing units for the picture it gives back. Replicate lists sizes 12/24 MP = 1 unit, 36/48 = 2, 60 = 3,
 * 96 = 4, 132 = 5, 168 = 6, 336 = 11, 512 = 17; real bills: 67 MP and 68 MP = 3 units (16 + 18 Nov 2026). So each
 * listed size is taken as the middle of its band: the band ends halfway to the next unit's first listed size.
 */
const BANDS = [
  [30, 1],
  [54, 2],
  [78, 3],
  [114, 4],
  [150, 5],
  [252, 6],
];
export function topazUnitsFor(megapixels) {
  const band = BANDS.find(([max]) => megapixels <= max);
  return band ? band[1] : Math.max(7, Math.round(megapixels / 30.5));
}

/** Topaz only enlarges 2×, 4× or 6× (the next one up); the result is then resized to the exact size. */
export const topazFactor = (keep) => (keep <= 2.5 ? 2 : keep <= 4 ? 4 : 6);

/**
 * { width, height } the picture's pixels; printCm its print width; copyFirst: the AI's 4K copy is made first;
 * enlarger: { choice: "topaz" | "real-esrgan", priceInr, topazPricePerUnitInr, mock }
 * -> { inr, units, keep } (inr 0 = not enlarged, nothing to pay) or null when the size is not known yet
 */
export function prepEstimate({ width, height, printCm, copyFirst = false, enlarger }) {
  if (!width || !height || !printCm || !enlarger) return null;
  const useTopaz = enlarger.choice !== "real-esrgan";
  let W0 = width;
  let H0 = height;
  if (copyFirst) {
    const s = Math.sqrt(FOUR_K_COPY_PIXELS / (W0 * H0));
    W0 = Math.round(W0 * s);
    H0 = Math.round(H0 * s);
  }
  let keep = Math.min(useTopaz ? 6 : 4, Math.max(1, (PRINT_DPI * printCm) / 2.54 / W0));
  keep = Math.min(keep, Math.sqrt(MAX_PIXELS / (W0 * H0)));
  keep = Math.max(1, Math.round(keep * 4) / 4);
  if (keep <= 1 || enlarger.mock) return { inr: 0, units: 0, keep };
  if (!useTopaz) return { inr: Number(enlarger.priceInr) || 0, units: 0, keep };
  const f = topazFactor(keep);
  const units = topazUnitsFor((W0 * f * H0 * f) / 1e6);
  const perUnit = Number(enlarger.topazPricePerUnitInr ?? enlarger.priceInr) || 0;
  return { inr: Math.round(units * perUnit * 100) / 100, units, keep };
}

/** "about ₹13.5", "free — no enlarging needed", or the old one-unit words while the picture is still being measured */
export function prepPriceWords(est, enlarger) {
  if (enlarger?.mock) return "free (test)";
  if (!est) return enlarger?.priceInr ? `about ₹${enlarger.priceInr}+` : "";
  if (!est.inr) return "free — no enlarging needed";
  return `about ₹${est.inr}`;
}
