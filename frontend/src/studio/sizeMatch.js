// "Find my size": height, weight and body shape → the best size on a garment's own size chart.
//
// The body is estimated, not measured: chest girth grows with √(weight ÷ height) (a body is
// roughly a cylinder), waist and hips follow from BMI and the shape the customer picks. The
// garment's chart gives its chest (flat × 2) and length in inches; each size is scored by how
// close its room around the body is to what this fit is meant to have (oversized ≈ twice a
// regular tee's room), and its length to what suits the height. All in cm inside.
// These are estimates — the client can tune the numbers below after trying it on real people.

const IN = 2.54;

export const WHO = {
  men: { label: "Men", height: [140, 210, 170], weight: [35, 160, 68], k: 15.0, waist: 0.8, lenK: 0.415 },
  women: { label: "Women", height: [135, 200, 158], weight: [30, 150, 56], k: 14.6, waist: 0.76, lenK: 0.405 },
  kids: { label: "Kids", height: [95, 175, 125], weight: [12, 70, 25], k: 14.2, waist: 0.85, lenK: 0.42 },
};

// the customer's picks: -1 · 0 · +1
export const SHAPES = [
  { key: "chest", label: "Chest", options: ["Slimmer", "Average", "Broader"] },
  { key: "stomach", label: "Stomach", options: ["Flatter", "Average", "Rounder"] },
  { key: "hips", label: "Hips", options: ["Narrower", "Average", "Fuller"] },
];
export const FEELS = ["Snug", "Just right", "Roomy"];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (n, [a, b, c]) => (n < 0 ? a : n > 0 ? c : b);

// "4-6", "13-14", "8Y" — not "2XL"
export const isKidSize = (s) => /^\d+(\s*[-–]\s*\d+)?\s*(y|yr|yrs|years)?$/i.test(String(s).trim());
export const isCrop = (garment) => /crop/i.test(`${garment?.key || ""} ${garment?.label || ""}`);

// The estimated body, in cm.
export function estimateBody({ who = "men", heightCm, weightKg, chest = 0, stomach = 0, hips = 0 }) {
  const w = WHO[who] || WHO.men;
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  const chestCm = w.k * Math.sqrt(weightKg / m) * (1 + 0.05 * chest);
  const waistRatio = who === "kids" ? w.waist : clamp(w.waist + 0.012 * (bmi - 20), 0.7, 1.1);
  const waistCm = chestCm * waistRatio * (1 + pick(stomach, [-0.05, 0, 0.08]));
  const hipsCm = chestCm * (who === "women" ? 1.06 : 0.97) * (1 + pick(hips, [-0.04, 0, 0.06]));
  // a tee hangs straight: the widest of chest, tummy (plus a little room) and — for women — hips decides
  const needCm = Math.max(chestCm, waistCm + 3, who === "women" ? hipsCm - 6 : 0);
  return { bmi, chestCm, waistCm, hipsCm, needCm, idealLengthCm: heightCm * w.lenK };
}

// The room (cm around the body) a fit is meant to have; the customer's "feel" moves it.
function idealRoom(garment, who, feel) {
  const oversized = garment?.fit === "oversized";
  const base = who === "kids" ? 9 : oversized ? 21 : 8;
  return base + feel * (oversized ? 6 : 5);
}

// The sizes this garment sells that the chart describes — kids' sizes for kids, else grown-ups'.
export function sizesFor(garment, who) {
  const sold = garment?.sizes?.length ? garment.sizes : (garment?.sizeChart || []).map((r) => r.size);
  const rows = sold.map((s) => garment?.sizeChart?.find((r) => r.size === s)).filter((r) => r && r.chest > 0);
  const kids = rows.filter((r) => isKidSize(r.size));
  const grown = rows.filter((r) => !isKidSize(r.size));
  if (who === "kids") return kids.length ? kids : rows;
  return grown.length ? grown : rows;
}

const marker = (diff, spread) => clamp(diff / spread, -1, 1); // -1 … 1 on the snug–roomy track

// Every size, scored, best first is `best`. Each has rows for the result's three tracks.
export function rankSizes(garment, answers) {
  const who = answers.who || "men";
  const feel = answers.feel || 0;
  const body = estimateBody(answers);
  const room = idealRoom(garment, who, feel);
  const crop = isCrop(garment);
  const oversized = garment?.fit === "oversized";
  const lenTarget = body.idealLengthCm + (oversized ? 3 : 0);
  const sized = sizesFor(garment, who).map((r) => {
    const teeCm = r.chest * IN;
    const lengthCm = (r.length || 0) * IN;
    const chestRoom = teeCm - body.chestCm;
    const tummyRoom = teeCm - (body.waistCm + 3);
    const roomNow = teeCm - body.needCm;
    const lenDiff = lengthCm ? lengthCm - lenTarget : 0;
    let score = 98 - 2 * Math.abs(roomNow - room);
    if (roomNow < room - 8) score -= (room - 8 - roomNow) * 1.5; // tight is worse than loose
    if (!crop && lengthCm) score -= 0.8 * Math.max(0, Math.abs(lenDiff) - 3);
    const raw = score; // ranks sizes even when all are far off
    score = Math.round(clamp(score, 35, 98));
    const word = (d, lo, hi, [a, b, c]) => (d < lo ? a : d > hi ? c : b);
    return {
      size: r.size,
      row: r,
      score,
      raw,
      teeCm,
      lengthCm,
      tracks: [
        { key: "chest", label: "Chest", value: marker(chestRoom - room, 12), word: word(chestRoom - room, -4, 5, ["Snug", "Ideal", "Roomy"]), ends: ["Snug", "Roomy"] },
        { key: "stomach", label: "Stomach", value: marker(tummyRoom - (room - 2), 12), word: word(tummyRoom - (room - 2), -4, 6, ["Snug", "Ideal", "Roomy"]), ends: ["Snug", "Roomy"] },
        crop
          ? { key: "length", label: "Length", value: 0, word: "Cropped style", ends: ["Short", "Long"], neutral: true }
          : { key: "length", label: "Length", value: marker(lenDiff, 9), word: lengthCm ? word(lenDiff, -4, 5, ["Short", "Ideal", "Long"]) : "—", ends: ["Short", "Long"] },
      ],
    };
  });
  const best = sized.reduce((a, b) => (b.raw > a.raw ? b : a), sized[0]);
  return { body, sizes: sized, best, room };
}

// A short line under the result.
export function fitNote(garment, ranked, chosen) {
  if (!ranked.sizes.length) return "";
  const i = ranked.sizes.indexOf(chosen);
  const roomNow = chosen.teeCm - ranked.body.needCm;
  if (i === ranked.sizes.length - 1 && roomNow < ranked.room - 6) return `${chosen.size} is our largest size, and it may still feel close-fitting on you.`;
  if (i === 0 && roomNow > ranked.room + 8) return `${chosen.size} is our smallest size, and it will still feel roomy on you.`;
  if (garment?.fit === "oversized") return "Oversized cut: the loose, dropped-shoulder look is how it's meant to fit. Go one size down for a closer fit.";
  if (isCrop(garment)) return "Cropped by design: it ends above the waist.";
  return "Regular fit: true to size, with easy room through the body.";
}

export const matchWord = (score) => (score >= 88 ? "A confident match for your measurements." : score >= 76 ? "A good match. You're close to the next size." : "The closest size we have for you.");

// units
export const cmToFtIn = (cm) => {
  const total = Math.round(cm / IN);
  return { ft: Math.floor(total / 12), inch: total % 12 };
};
export const kgToLb = (kg) => Math.round(kg * 2.20462);
