// studio/textStart.js
//
// How big new words start in a print area ("Add a heading" / "Add a small line" in the design room).
// Letter size is kept as % of the area's HEIGHT (fontSizePct). The old fixed 12 % / 7 % suits tall areas (Centre
// Front 28 × 32 cm → 3.8 cm letters), but in a wide, short strip it gave tiny words: Chest Line 26 × 7 cm got 0.8 cm
// letters in the middle of a 26 cm strip, Back Neck 7 × 4 cm a 3 mm small line. So a wide area's letters follow its
// width too (the same share of the width a tall area's letters have of its height), up to half its height (a third
// for a small line). Areas as tall as they are wide, or taller, start exactly as before. Long words are still
// shrunk to fit afterwards (addText).

const HEADING = { pct: 12, maxPct: 50 };
const SMALL = { pct: 7, maxPct: 30 };

/** fontSizePct for new words in an area W × H (any unit, only the shape counts). */
export function startFontPct(W, H, small = false) {
  const { pct, maxPct } = small ? SMALL : HEADING;
  if (!(W > 0) || !(H > 0)) return pct;
  return Math.max(pct, Math.min(maxPct, pct * (W / H)));
}

/**
 * Where new words go down the area (y, % of its height), for the n-th words already in it (0 = the first).
 * The first words in a wide area whose letters were made bigger sit in the middle; others stack from the top as
 * before (18 % steps) but never hang below the area.
 */
export function startTextY({ n = 0, heightPct, grown = false }) {
  if (grown && n === 0) return Math.max(0, 50 - heightPct / 2);
  const y = 18 + (n % 4) * 18;
  return Math.max(0, Math.min(y, 98 - heightPct));
}
