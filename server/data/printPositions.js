// IDENTEE print positions and maximum print sizes (width x height, cm).
//
// Two ways an area gets its size:
//   1. `cm` — one size from "IDENTEE_PRODUCT_DETAILS.pdf" (Print Position &
//      Size Guide): the size is for M / L / XL; XS / S are 4 cm smaller,
//      2XL / 3XL are 4 cm larger. (Centre Front, the chests, Full Back, sleeves.)
//   2. `bySize` — the exact size for each garment size, from the print team's
//      measurement sheet of 10 Oct 2026 (their groups: S–M, L–XL, 2XL–3XL;
//      XS is not sold, it uses the S size if a garment has it).
//      (Full Front, Vertical Front, Front Right Vertical, Top Back, Centre
//      Back, Vertical Back.)
//   3. `estimate: true` (free placement phase 1, 14 Nov 2026): places the
//      print team has not measured yet — Chest Line, Mid Front, Front Left
//      Vertical, Lower Left / Right, Mid Back, Lower Back, Back Neck. Their
//      sizes and start lines are our ESTIMATES (checked on the 3D tee at XS,
//      M and 3XL: docs/FREE_PLACEMENT.md); the admin page says so.
//
// PRINT_AREA_CATALOG lists every place. The admin turns areas on per garment
// and can change any size (Admin → Customizable → set-up wizard → Print
// areas). A garment with no saved print-area settings offers every area that
// has a size, except the `optIn` ones: those only show where the admin turns
// them on (a polo or a crop top must not suddenly get a Lower Back).
//
// `place` says where an area sits relative to its side's MAIN print
// (centre front / full back / sleeve), in cm at size M:
//   align: centre | wearer-left | wearer-right   (left/right = the wearer's)
//   gapCm: distance from the centre line to the print's inner edge
//   topCm: how far the print's top is below the main print's top
// `collarCm` (when given) is the print team's start line: how far the print's
// top edge is below the collar SEAM (where the collar rib joins the body, at the centre — confirmed by the print team), per garment size — from their sheet of
// 14 Oct 2026 (groups S–M, L–XL, 2XL–3XL). It wins over topCm wherever a real
// distance matters (the 3D tee, the print pack). Areas without it (Centre
// Front, the chests, Full Back, sleeves) still use estimates; their topCm
// values below are chosen so the measured areas sit right next to them.
// An area with collarCm keeps a matching topCm (collarCm at M − the side's
// usual start line: front 8, back 7 cm under the collar, as on the 3D tee):
// the overlap rule, the card drawings and the admin preview read topCm.
//
// `hint` is a few words for the customer ("One line of words across the
// chest"); `aka` are other names customers use for the place ("nape", "back
// of the neck"): the Assistant and the chat edits understand those too.
//
// Served to the customizer by GET /api/customizations/print-positions.

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

export const SIZE_GROUPS = [
  { key: "small", label: "XS – S", sizes: ["XS", "S"] },
  { key: "standard", label: "M – XL", sizes: ["M", "L", "XL"] },
  { key: "large", label: "2XL – 3XL", sizes: ["2XL", "3XL"] },
];

const GROUP_STEP_CM = 4;
const MIN_CM = 2;

// The print team's sheet: [w, h] for S–M, L–XL, 2XL–3XL -> one entry per size.
const sheet = (sm, lxl, big) => ({ XS: sm, S: sm, M: sm, L: lxl, XL: lxl, "2XL": big, "3XL": big });
// Start lines below the collar (cm), same groups.
const FRONT_START = sheet(6, 7, 8);
const BACK_START = sheet(8, 10, 12);
// Our own size groups (XS–S, M–XL, 2XL–3XL, as SIZE_GROUPS) -> one entry per size, for the estimated places.
const groups = (small, standard, large) => ({ XS: small, S: small, M: standard, L: standard, XL: standard, "2XL": large, "3XL": large });
const same = (v) => groups(v, v, v);
// The low places are measured up from the hem, so their start line moves with every size's length (one inch a size).
// Worked out on the 3D tee (teeModel.js placeArea, the oversized model's hem, the size chart's length): the print's
// bottom sits about 6 cm above the hem on every size. Its 3D front is shorter than the chart's length less the neck
// drop, so on a real tee they may sit a few cm higher: ESTIMATE until the print team checks them on a tee.
const LOWER_FRONT_START = { XS: 42, S: 44, M: 46, L: 48, XL: 50.5, "2XL": 52.5, "3XL": 54.5 };
const LOWER_BACK_START = { XS: 51.5, S: 54, M: 55, L: 57.5, XL: 60, "2XL": 61.5, "3XL": 64 };

export const PRINT_AREA_CATALOG = [
  { key: "centre-front", label: "Centre Front", hint: "Big print on the chest", aka: ["centre front", "center front", "middle of the chest", "main front"], side: "front", main: true, cm: [28, 32], place: { align: "centre", topCm: 0 } },
  { key: "left-chest", label: "Left Chest", hint: "Small logo on the left chest", aka: ["left chest", "left pocket", "pocket", "chest pocket"], side: "front", cm: [12, 13], place: { align: "wearer-left", gapCm: 4, topCm: 0 } },
  { key: "right-chest", label: "Right Chest", hint: "Small logo on the right chest", aka: ["right chest", "right pocket"], side: "front", cm: [12, 13], place: { align: "wearer-right", gapCm: 4, topCm: 0 } },
  // one line of words across the chest, on the print team's front start line
  { key: "chest-line", label: "Chest Line", hint: "One line of words across the chest", aka: ["chest line", "line across the chest", "words across the chest", "name across the chest", "text across the chest", "slogan across the chest", "quote across the chest", "chest strip"], side: "front", estimate: true, optIn: true, cm: [26, 7], bySize: groups([22, 6], [26, 7], [30, 8]), collarCm: FRONT_START, place: { align: "centre", topCm: -2 } },
  // the flat part under the chest ("belly")
  { key: "mid-front", label: "Mid Front", hint: "Across the belly, under the chest", aka: ["mid front", "middle of the front", "belly", "stomach", "tummy"], side: "front", estimate: true, optIn: true, cm: [26, 14], bySize: groups([22, 12], [26, 14], [30, 16]), collarCm: groups(28, 30, 32), place: { align: "centre", topCm: 22 } },
  { key: "full-front", label: "Full Front", hint: "The whole front", aka: ["full front", "whole front", "entire front"], side: "front", cm: [35, 52], bySize: sheet([35, 52], [35, 52], [37, 54]), collarCm: FRONT_START, place: { align: "centre", topCm: -2 } },
  { key: "vertical-front", label: "Vertical Front", hint: "Tall strip down the middle", aka: ["vertical front", "strip down the front", "front strip", "middle strip"], side: "front", cm: [10, 52], bySize: sheet([10, 52], [10, 52], [10, 54]), collarCm: FRONT_START, place: { align: "centre", topCm: -2 } },
  // the mirror of the print team's Front Right Vertical (same sizes, start line and gap from the centre)
  { key: "front-left-vertical", label: "Front Left Vertical", hint: "Tall strip down the left side", aka: ["front left vertical", "left strip", "left vertical", "down the left side"], side: "front", estimate: true, optIn: true, cm: [10, 52], bySize: sheet([10, 52], [10, 52], [10, 54]), collarCm: FRONT_START, place: { align: "wearer-left", gapCm: 8, topCm: -2 } },
  { key: "front-right-vertical", label: "Front Right Vertical", hint: "Tall strip down the right side", aka: ["front right vertical", "right strip", "right vertical", "down the right side"], side: "front", cm: [10, 52], bySize: sheet([10, 52], [10, 52], [10, 54]), collarCm: FRONT_START, place: { align: "wearer-right", gapCm: 8, topCm: -2 } },
  // small prints near the hem, 6 cm from the centre line. On a real Oversized tee (27-34 cm from the centre to the side
  // seam, half its chest) that leaves 10 cm or more to the seam on every size. Not the planned 8 cm: the 3D tee's body
  // is narrower than the real tee (about 37 cm across at XS against 53 cm), and at 8 cm the print sat on the edge of
  // the 3D body and wrapped round its side in the preview. 6 cm also keeps them clear of Vertical Front.
  { key: "lower-left", label: "Lower Left", hint: "Small print low on the front, left", aka: ["lower left", "bottom left", "left hem", "low on the left"], side: "front", estimate: true, optIn: true, cm: [10, 10], bySize: same([10, 10]), collarCm: LOWER_FRONT_START, place: { align: "wearer-left", gapCm: 6, topCm: 38 } },
  { key: "lower-right", label: "Lower Right", hint: "Small print low on the front, right", aka: ["lower right", "bottom right", "right hem", "low on the right"], side: "front", estimate: true, optIn: true, cm: [10, 10], bySize: same([10, 10]), collarCm: LOWER_FRONT_START, place: { align: "wearer-right", gapCm: 6, topCm: 38 } },
  { key: "full-back", label: "Full Back", hint: "Big print on the back", aka: ["full back", "whole back", "entire back"], side: "back", main: true, cm: [38, 42], place: { align: "centre", topCm: 0 } },
  // a small mark just under the back collar, on the outside (the IDENTEE label is inside). 4 cm tall (not 6), so it
  // ends 6.5 cm under the collar on every size: above Full Back (its top is about 7 cm under the collar) and above the
  // print team's 8 cm start line of Top Back / Centre Back / Vertical Back. The usual pairing, a small nape mark with a
  // big back print, works, and the two prints never touch.
  { key: "nape", label: "Back Neck", hint: "Small mark just under the back collar", aka: ["nape", "back neck", "back of the neck", "behind the neck", "under the back collar", "below the back collar"], side: "back", estimate: true, optIn: true, cm: [7, 4], bySize: same([7, 4]), collarCm: same(2.5), place: { align: "centre", topCm: -4.5 } },
  { key: "top-back", label: "Top Back", hint: "Wide strip across the shoulders", aka: ["top back", "upper back", "across the shoulders", "top of the back"], side: "back", cm: [35, 10], bySize: sheet([35, 10], [35, 10], [37, 10]), collarCm: BACK_START, place: { align: "centre", topCm: 1 } },
  { key: "centre-back", label: "Centre Back", hint: "Tall print on the whole back", aka: ["centre back", "center back"], side: "back", cm: [35, 52], bySize: sheet([35, 52], [35, 52], [37, 54]), collarCm: BACK_START, place: { align: "centre", topCm: 1 } },
  // the middle of the back, under Top Back (a 1 cm gap or more on every size, so both can be used)
  { key: "mid-back", label: "Mid Back", hint: "Middle of the back", aka: ["mid back", "middle of the back", "back middle"], side: "back", estimate: true, optIn: true, cm: [30, 20], bySize: groups([26, 18], [30, 20], [34, 22]), collarCm: groups(19, 21, 23), place: { align: "centre", topCm: 14 } },
  // a wide strip above the back hem (bottom about 6 cm above it, measured like Lower Left)
  { key: "lower-back", label: "Lower Back", hint: "Wide strip near the bottom of the back", aka: ["lower back", "bottom of the back", "small of the back", "back hem"], side: "back", estimate: true, optIn: true, cm: [30, 10], bySize: groups([26, 9], [30, 10], [34, 11]), collarCm: LOWER_BACK_START, place: { align: "centre", topCm: 48 } },
  { key: "vertical-back", label: "Vertical Back", hint: "Tall strip down the spine", aka: ["vertical back", "strip down the back", "down the spine", "back strip"], side: "back", cm: [10, 51], bySize: sheet([10, 51], [10, 51], [10, 54]), collarCm: BACK_START, place: { align: "centre", topCm: 1 } },
  { key: "left-sleeve", label: "Left Sleeve", hint: "Small print on the left sleeve", aka: ["left sleeve", "left arm"], side: "left", main: true, cm: [9, 10], place: { align: "centre", topCm: 0 } },
  { key: "right-sleeve", label: "Right Sleeve", hint: "Small print on the right sleeve", aka: ["right sleeve", "right arm"], side: "right", main: true, cm: [9, 10], place: { align: "centre", topCm: 0 } },
  // The co-ord set's shorts ("Bottom Print – Left / Right Leg"): the front of each leg, measured from the top of the
  // waistband (the shorts' start line is 25 cm below it at M — ESTIMATE until the print team gives sizes).
  // gapCm: the shorts' centre line to the print's inner edge, so a 10 cm print sits in the middle of the leg.
  { key: "left-leg", label: "Shorts – Left Leg", hint: "Front of the left leg", aka: ["left leg"], side: "shorts", main: true, cm: [10, 10], place: { align: "wearer-left", gapCm: 4.7, topCm: 0 } },
  { key: "right-leg", label: "Shorts – Right Leg", hint: "Front of the right leg", aka: ["right leg"], side: "shorts", cm: [10, 10], place: { align: "wearer-right", gapCm: 4.7, topCm: 0 } },
];

export const CATALOG_BY_KEY = Object.fromEntries(PRINT_AREA_CATALOG.map((a) => [a.key, a]));

// [w, h] for M–XL -> one entry per size (the guide's ±4 cm rule)
const ruleSizes = ([w, h]) => {
  const small = [Math.max(MIN_CM, w - GROUP_STEP_CM), Math.max(MIN_CM, h - GROUP_STEP_CM)];
  const large = [w + GROUP_STEP_CM, h + GROUP_STEP_CM];
  return { XS: small, S: small, M: [w, h], L: [w, h], XL: [w, h], "2XL": large, "3XL": large };
};

const validCm = (cm) =>
  Array.isArray(cm) && cm.length === 2 && cm.every((n) => Number.isFinite(n) && n >= MIN_CM && n <= 80);

// A complete, valid { size: [w, h] } map, or null. Sizes left out take the
// nearest size that has one.
export const cleanBySize = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const given = {};
  for (const size of SIZES) {
    const v = raw[size];
    const cm = Array.isArray(v) ? v.map(Number) : v && typeof v === "object" ? [Number(v.width ?? v.w), Number(v.height ?? v.h)] : null;
    if (validCm(cm)) given[size] = cm;
  }
  if (!Object.keys(given).length) return null;
  const out = {};
  SIZES.forEach((size, i) => {
    if (given[size]) {
      out[size] = given[size];
      return;
    }
    const near = SIZES.map((s, j) => [Math.abs(i - j), s])
      .sort((a, b) => a[0] - b[0])
      .find(([, s]) => given[s]);
    out[size] = given[near[1]];
  });
  return out;
};

// The garment's saved setting for one area, if any.
const overrideFor = (garment, key) => garment?.printAreas?.find((p) => p.key === key);

// Is this area switched on in the garment's saved settings? An opt-in place counts only when its saved row also
// carries a size: the admin page saves one with every row it switches on, while the girls', boys' and kids' round
// necks carry an old "offered" on Lower Left / Lower Right from before those places had a size (it did nothing then,
// and must not switch them on for customers now).
const offeredIn = (garment, area) => {
  const o = overrideFor(garment, area.key);
  if (!o?.offered) return false;
  return !area.optIn || validCm([Number(o.width), Number(o.height)]) || !!cleanBySize(o.bySize);
};

// { cmBySize, exact } for one area on this garment, or null when it has no
// size. Order: the garment's own exact sizes → its single size (±4 rule) →
// the catalog's exact sizes → the catalog's single size.
const sizesFor = (area, garment) => {
  const o = overrideFor(garment, area.key);
  const exact = cleanBySize(o?.bySize);
  if (exact) return { cmBySize: exact, exact: true };
  if (o && validCm([Number(o.width), Number(o.height)])) {
    return { cmBySize: ruleSizes([Number(o.width), Number(o.height)]), exact: false };
  }
  if (area.bySize) return { cmBySize: area.bySize, exact: true };
  return validCm(area.cm) ? { cmBySize: ruleSizes(area.cm), exact: false } : null;
};

// Sizes on the garment's own chart that the print team's sheet doesn't have yet. Kids' age sizes
// ("4-6", "11") take the S size scaled by their chest against S (ESTIMATE until the print team gives
// kids sizes), so a print is never wider than a child's tee; 4XL / 5XL take the 3XL size.
const REGULAR_S_CHEST_IN = 38;
const withChartSizes = (cmBySize, garment) => {
  const chart = Array.isArray(garment?.sizeChart) ? garment.sizeChart : [];
  const sChest = chart.find((r) => r.size === "S")?.chest || REGULAR_S_CHEST_IN;
  const out = { ...cmBySize };
  for (const row of chart) {
    if (out[row.size] || !(row.chest > 0)) continue;
    out[row.size] =
      row.chest >= sChest ? cmBySize["3XL"] : cmBySize.S.map((v) => Math.max(MIN_CM, Math.round(v * (row.chest / sChest))));
  }
  return out;
};

// The start line for those chart sizes too — on the new (opt-in) places only, so the older places and every design
// on them stay exactly where they were. 4XL / 5XL keep the 3XL line; a kids' size scales the S line by its chest the
// same way as its print size, so a low print (Lower Left, Lower Back) stays on a child's shorter tee. Never closer
// than 2.5 cm to the collar.
const collarWithChart = (area, garment) => {
  if (!area.collarCm || !area.optIn) return area.collarCm || null;
  const chart = Array.isArray(garment?.sizeChart) ? garment.sizeChart : [];
  const sChest = chart.find((r) => r.size === "S")?.chest || REGULAR_S_CHEST_IN;
  const out = { ...area.collarCm };
  for (const row of chart) {
    if (out[row.size] != null || !(row.chest > 0)) continue;
    out[row.size] = row.chest >= sChest ? area.collarCm["3XL"] : Math.max(2.5, Math.round(area.collarCm.S * (row.chest / sChest) * 2) / 2);
  }
  return out;
};

// `cm` keeps the older three-group shape for code that still reads it.
const groupsOf = (cmBySize) => ({ small: cmBySize.S, standard: cmBySize.L, large: cmBySize["2XL"] });

const toPosition = (area, sized, garment) => ({
  key: area.key,
  label: area.label,
  hint: area.hint || "",
  aka: area.aka || [],
  side: area.side,
  main: !!area.main,
  place: area.place,
  collarCm: collarWithChart(area, garment),
  cmBySize: sized.cmBySize,
  exact: sized.exact,
  cm: groupsOf(sized.cmBySize),
});

/* ---------- overlaps ---------- */
// Where an area lies on its side, in cm: x from the centre line (wearer's
// left is +), y down from the side's main print top. Uses the largest size.
const rectOf = (pos) => {
  const [w, h] = pos.cmBySize["3XL"];
  const place = pos.place || { align: "centre", topCm: 0 };
  const gap = place.gapCm || 0;
  const x0 = place.align === "wearer-left" ? gap : place.align === "wearer-right" ? -(gap + w) : -w / 2;
  const y0 = place.topCm || 0;
  return { x0, x1: x0 + w, y0, y1: y0 + h };
};
const OVERLAP_CM = 1; // areas that only touch (1 cm or less) don't count
const overlap = (a, b) => {
  if (a.side !== b.side) return false;
  const ra = rectOf(a);
  const rb = rectOf(b);
  return (
    Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0) > OVERLAP_CM &&
    Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0) > OVERLAP_CM
  );
};
// Adds `conflicts` (keys of the offered areas each one overlaps): only one
// area of an overlapping set can carry a print.
const withConflicts = (positions) =>
  positions.map((p) => ({
    ...p,
    conflicts: positions.filter((q) => q.key !== p.key && overlap(p, q)).map((q) => q.key),
  }));

// [[labelA, labelB], …] for used areas that overlap (empty = fine).
export const overlappingPairs = (usedKeys, positions) => {
  const used = positions.filter((p) => usedKeys.includes(p.key));
  const pairs = [];
  used.forEach((p, i) =>
    used.slice(i + 1).forEach((q) => {
      if (p.conflicts?.includes(q.key)) pairs.push([p.label, q.label]);
    }),
  );
  return pairs;
};

// The areas offered when a garment has no saved print-area settings (tee areas only: the shorts
// areas are only for a garment that turns them on, the co-ord set; the optIn places only where the
// admin turns them on, so a polo, a kids' tee or a crop top keeps the areas it had).
export const DEFAULT_OFFERED = PRINT_AREA_CATALOG.filter((a) => a.cm && a.side !== "shorts" && !a.optIn).map((a) => a.key);

/**
 * Print positions a customer can use on this garment.
 * @returns {{ positions: object[], scales: Object<string, number[]> }}
 *   positions — offered areas: cmBySize ({ size: [w, h] }) and conflicts
 *   scales    — per side, the main print's M–XL cm, which sets the
 *               cm-to-photo scale even when the main print isn't offered
 */
export const positionsForGarment = (garment) => {
  const configured = Array.isArray(garment?.printAreas) && garment.printAreas.length > 0;
  const positions = [];
  const scales = {};
  for (const area of PRINT_AREA_CATALOG) {
    const sized = sizesFor(area, garment);
    if (area.main && sized) scales[area.side] = sized.cmBySize.L;
    const offered = configured ? offeredIn(garment, area) : DEFAULT_OFFERED.includes(area.key);
    if (offered && sized) positions.push(toPosition(area, { ...sized, cmBySize: withChartSizes(sized.cmBySize, garment) }, garment));
  }
  return { positions: withConflicts(positions), scales };
};

// Every catalog area with this garment's settings — for the admin wizard.
export const catalogForGarment = (garment) => {
  const configured = Array.isArray(garment?.printAreas) && garment.printAreas.length > 0;
  return PRINT_AREA_CATALOG.map((area) => {
    const sized = sizesFor(area, garment);
    return {
      key: area.key,
      label: area.label,
      hint: area.hint || "",
      side: area.side,
      main: !!area.main,
      place: area.place,
      collarCm: collarWithChart(area, garment), // the print pack reads the start line from here
      cm: sized ? groupsOf(sized.cmBySize) : null,
      // the print pack reads the page size from here. A new (opt-in) place gets the chart sizes too (kids, 4XL / 5XL),
      // so its page is the size the customer designed on; the older places keep the page they always printed with
      // (old orders print exactly as before)
      cmBySize: sized ? (area.optIn ? withChartSizes(sized.cmBySize, garment) : sized.cmBySize) : null,
      exact: sized ? sized.exact : false,
      guideCm: area.cm,
      guideBySize: area.bySize || null,
      estimate: !!area.estimate, // our own sizes until the print team measures the place (the admin page says so)
      offered: configured ? offeredIn(garment, area) : DEFAULT_OFFERED.includes(area.key),
    };
  });
};

/* ---------- free places (spots, phase 2: data/panelModel.js) ---------- */
// The biggest print a free place can be, per size and side ({ size: { front, back, left, right: [w, h] } }): the
// biggest box the print team already presses — their Full Front / Centre Back (35 x 52 cm, 37 x 54 at 2XL–3XL), with
// this garment's own sizes when the admin changed them — and on a sleeve the bigger of its sleeve area and 10 x 10 cm
// (the most Indian DTF shops press on a sleeve). So it follows the catalog when the print team gives real sizes.
// Sent to the design room with the print areas; panelModel.js maxPrintFor has the same numbers for when it is missing.
const MAX_PRINT_FROM = ["full-front", "centre-back"];
const SLEEVE_MAX_CM = [10, 10];
export const maxPrintBySize = (garment) => {
  const sized = (keys) => keys.map((k) => sizesFor(CATALOG_BY_KEY[k], garment)).filter(Boolean).map((s) => withChartSizes(s.cmBySize, garment));
  const body = sized(MAX_PRINT_FROM);
  const sleeves = sized(["left-sleeve", "right-sleeve"]);
  const chart = Array.isArray(garment?.sizeChart) ? garment.sizeChart.map((r) => r.size) : [];
  const out = {};
  for (const size of [...new Set([...SIZES, ...chart])]) {
    const biggest = body.map((m) => m[size]).filter(Boolean).sort((a, b) => b[0] * b[1] - a[0] * a[1])[0] || [35, 52];
    const sleeve = sleeves.map((m) => m[size]).filter(Boolean).reduce((a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1])], SLEEVE_MAX_CM);
    out[size] = { front: biggest, back: biggest, left: sleeve, right: sleeve };
  }
  return out;
};

// A free place in the AI's area lists keeps the words the design room sent for it ("24 x 6 cm, 40 cm below the collar
// seam, centred"), so "make Front 1 bigger" knows what Front 1 is. Every other area keeps exactly the fields it had.
export const spotWhereOf = (a) => (/^spot-\d+$/.test(String(a?.key || "")) && a?.where ? { where: String(a.where).slice(0, 100) } : {});

// The AI's area lists (the Assistant, Improve idea, chat edits, photo plans) keep up to this many areas, so a
// garment with every place switched on loses none of them (the catalog has 22).
export const AI_AREAS_MAX = 40;

// The area list the AI reads: each area with a few words on where it is and the names customers use for it, so
// "put it on the nape" or "a line across the chest" finds the right key. Keys not in the catalog stay as they are
// (a free place keeps its own "where": spotWhereOf).
export const aiAreas = (areas = []) =>
  areas.map((a) => {
    const c = CATALOG_BY_KEY[a?.key];
    return c ? { ...a, where: c.hint, words: c.aka.slice(0, 4) } : a;
  });

// Back-compat: the positions offered when no garment is given.
export const PRINT_POSITIONS = positionsForGarment(null).positions;
export const POSITION_BY_KEY = Object.fromEntries(PRINT_POSITIONS.map((p) => [p.key, p]));

export const sizeGroupOf = (size) =>
  SIZE_GROUPS.find((g) => g.sizes.includes(String(size).toUpperCase()))?.key || "standard";

// Physical print size (cm) of a position for a garment size.
export const printSizeCm = (positionKey, size, garment = null) => {
  const p = positionsForGarment(garment).positions.find((x) => x.key === positionKey);
  if (!p) return null;
  const [w, h] = p.cmBySize[String(size).toUpperCase()] || p.cmBySize.L;
  return { width: w, height: h };
};
