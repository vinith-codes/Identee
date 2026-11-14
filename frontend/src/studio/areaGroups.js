// studio/areaGroups.js
//
// The print areas as the customer sees them listed — the "Where to print" cards and "Where should it go?"
// (PlaceSheet.jsx): grouped Front / Back / Sleeves (Shorts for the co-ord set), and in each group the side's main
// spot first, then the other big prints, then the chest prints, bands and strips (top to bottom, the order the
// server's catalog lists them in), then the small hits (Lower Left / Right, Back Neck). Free placement phase 1,
// 14 Nov 2026: a tee can offer 11 front places now, so the order has to read well.
import { areaCm } from "./teeModel";

export const AREA_GROUPS = [
  ["Front", ["front"]],
  ["Back", ["back"]],
  ["Sleeves", ["left", "right"]],
  ["Shorts", ["shorts"]], // the co-ord set's shorts (only shown for a garment that has shorts areas)
];
export const groupOfSide = (side) => AREA_GROUPS.find(([, sides]) => sides.includes(side))?.[0] || AREA_GROUPS[0][0];

const BIG_CM2 = 900; // Full Front, Centre Back (35 × 52)
const SMALL_CM2 = 120; // Lower Left / Right (10 × 10), Back Neck (7 × 4)

// 0 main · 1 big · 2 chest, bands and strips · 3 small hits — measured at M, so the order stays put when the size changes
const rankOf = (p) => {
  if (p.main) return 0;
  const [w, h] = areaCm(p, "M");
  return w * h >= BIG_CM2 ? 1 : w * h <= SMALL_CM2 ? 3 : 2;
};

/** The areas of one group in list order (a new list; the same rank keeps the order they came in). */
export const listOrder = (list = []) =>
  list
    .map((p, i) => [rankOf(p), i, p])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, , p]) => p);

/** [[title, sides, areas in list order]] for the groups this garment has areas in. */
export const areaGroups = (positions = []) =>
  AREA_GROUPS.map(([title, sides]) => [title, sides, listOrder(positions.filter((p) => sides.includes(p.side)))]).filter(([, , list]) => list.length);
