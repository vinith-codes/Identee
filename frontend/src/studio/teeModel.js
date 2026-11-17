// studio/teeModel.js
//
// The 3D garments the Design Room can show, and where each print area sits
// on them. Measurements come from the model itself (see
// identee-private-assets/3D-models/oversized-tee-panel-measurements.json):
// the model is in metres, z-up as exported ("raw" space below).
//
// Print sizes stay true to size: the model is one fixed size, so for a
// bigger garment size every print (and gap) is drawn smaller on it, by
// size length ÷ model length — the same rule as the flat preview.

export const TEE_MODELS = {
  oversized: {
    url: "/models/oversized-tee.glb",
    credit: { text: "3D tee: “oversized_t-shirt” by ap-school, CC BY 4.0", href: "https://sketchfab.com/3d-models/oversized-t-shirt-e6f9b60f58404ccaa40e8e3bdb4edc95" },
    lengthCm: 72.4, // the model's pattern length (shoulder top → hem), ≈ size S/M
    // Where the MAIN print of each side starts (its top edge), raw metres.
    // Front/back: below the neckline at the centre line (estimates — the print
    // team's sheet doesn't cover the main areas). Sleeves: below the sleeve top.
    // neck = the collar line at the centre (the print team measures from the collar seam): areas with the print team's
    // start line (collarCm) are measured down from it.
    // The model's front collar is only ~3 cm below its back one, so the Front and Back views looked alike (13 Nov 2026,
    // feedback 1). The room draws the front collar 3 cm lower (neckDip.js): neck = the model's own front collar seam
    // before that, by = how much lower, half = half the neck opening's width (metres).
    neckDip: { neck: 1.58, by: 0.03, half: 0.09 },
    // how far the 3D sleeve reaches below its top seam (data/panelModel.js KINDS sleeve3d): a tap on fabric facing
    // sideways within this reach is on the sleeve ("Anywhere", free placement phase 3)
    sleeveDrop: 0.207,
    // half the body's width below the sleeves (raw metres, measured on the model: the hanging sleeve's lower part is
    // further out): at the sleeves' heights, fabric further out than this is the sleeve, whichever way it faces
    bodyHalf: 0.193,
    anchors: {
      // 3 cm lower with the collar (neckDip), so prints keep their distance from the collar seam. Keep top 8 cm
      // under neck: printFiles.js EST_START.front says the same.
      front: { top: 1.58 - 0.03 - 0.08, neck: 1.58 - 0.03 },
      back: { top: 1.6096 - 0.07, neck: 1.6096 },
      // shoulder = the sleeve's top seam (the sleeve mesh's top): a print in a free place on a sleeve is measured down from it
      left: { top: 1.5286 - 0.05, lateral: 0.0314, shoulder: 1.5286 }, // wearer's left sleeve (raw +x)
      right: { top: 1.5174 - 0.05, lateral: 0.0444, shoulder: 1.5174 }, // wearer's right sleeve (raw −x)
    },
  },
  // Regular-fit round-neck tee — the boys', girls' and kids' round necks (and the co-ord set's tee).
  // Converted from the Sketchfab file (inches) to metres, front facing +z, one mesh; measured in
  // identee-private-assets/3D-models/regular-tee-measurements.json.
  regular: {
    url: "/models/regular-tee.glb",
    credit: { text: "3D tee: “Tshirt” by Tabbuso, CC BY 4.0", href: "https://sketchfab.com/3d-models/tshirt-5a21282b2e454d1696547148f617d3d0" },
    lengthCm: 62.6, // shoulder top → hem at the centre, ≈ size S
    sleeveDrop: 0.102,
    bodyHalf: 0.17, // (measured at its waist: the regular tee is cut straight)
    anchors: {
      // the main print's top: 8 cm (front) / 7 cm (back) below the neckline, as on the oversized tee
      front: { top: 1.6328 - 0.08, neck: 1.6328 },
      back: { top: 1.6802 - 0.07, neck: 1.6802 },
      // the sleeves are short (≈14 cm at their outer side): the print's top sits so it is centred on the sleeve
      // shoulder: the sleeves' top seam, one line for both (the outer sleeve tops at 1.561 and 1.559 — the two sleeves
      // are alike; measured 14 Nov 2026, free-placement-plan/work/phase2/review-print/glbRegular.cjs)
      left: { top: 1.535, lateral: 0.072, shoulder: 1.56 },
      right: { top: 1.545, lateral: 0.069, shoulder: 1.56 },
    },
  },
  // Oversized Crop: the oversized tee cut to 2/3 of its length (crop 20" ÷ tee 30" at M), same print anchors.
  oversizedCrop: {
    url: "/models/oversized-crop.glb",
    credit: { text: "3D tee: “oversized_t-shirt” by ap-school, CC BY 4.0 (cropped)", href: "https://sketchfab.com/3d-models/oversized-t-shirt-e6f9b60f58404ccaa40e8e3bdb4edc95" },
    lengthCm: 48.3,
    hangHalfHeight: 0.355, // hang from the shoulders at the full tee's height (half the oversized tee's 0.71 m)
    neckDip: { neck: 1.58, by: 0.03, half: 0.09 }, // the same collar as the oversized tee (same heights to 0.1 mm)
    sleeveDrop: 0.207,
    bodyHalf: 0.193,
    anchors: {
      front: { top: 1.58 - 0.03 - 0.08, neck: 1.58 - 0.03 }, // lowered with the collar, as on the oversized tee
      back: { top: 1.6096 - 0.07, neck: 1.6096 },
      left: { top: 1.5286 - 0.05, lateral: 0.0314, shoulder: 1.5286 },
      right: { top: 1.5174 - 0.05, lateral: 0.0444, shoulder: 1.5174 },
    },
  },
  // Crop Top with Collar: a polo with the buttons, button strip and pocket removed, the front slit opened into a
  // V and the body cropped (identee-private-assets/3D-models/build_crop_polo.py).
  collarCrop: {
    url: "/models/collar-crop-top.glb",
    credit: { text: "3D top: “T-shirt Polo Lengan Pendek” by Ikal.Ichwan, CC BY 4.0 (cropped)", href: "https://sketchfab.com/3d-models/t-shirt-polo-lengan-pendek-74c33d16b31346f1a46a55c3ec8e8a78" },
    lengthCm: 42.6, // shoulder top → hem
    hangHalfHeight: 0.355,
    sleeveDrop: 0.197,
    bodyHalf: 0.175,
    anchors: {
      // the front prints start 1.5 cm below the bottom of the V (1.470), clear of the opening
      front: { top: 1.455, neck: 1.6057 },
      back: { top: 1.638 - 0.07, neck: 1.638 },
      left: { top: 1.6217 - 0.05, lateral: 0.0676, shoulder: 1.6217 },
      right: { top: 1.6225 - 0.05, lateral: 0.0686, shoulder: 1.6225 },
    },
  },
};

// Co-ord set: the regular round-neck tee with shorts below it, shown as one outfit. The shorts are their own
// model (`bottom`); print areas on the "shorts" side are placed on it (its anchors, its length per size).
// identee-private-assets/3D-models/build_shorts.py
TEE_MODELS.coord = {
  ...TEE_MODELS.regular,
  outfit: { scale: 0.8, lift: 0.19 }, // the whole outfit a little smaller and raised, so tee and shorts both fit the view
  bottom: {
    url: "/models/coord-shorts.glb",
    credit: { text: "3D shorts: “Male Tshirt and Shorts” by kanesk06, CC BY 4.0", href: "https://sketchfab.com/3d-models/male-tshirt-and-shorts-plain-texture-06b9009696a64e1f87b5400ddbab1cdd" },
    lengthCm: 44.1, // waistband top → hem, ≈ size S/M
    // where it sits against the tee: both models are at body height already; lifted so the waistband tucks
    // under the tee's hem, and back a little so it hangs under the tee's middle (metres)
    offset: [0, 0.1, -0.03],
    anchors: {
      // the leg prints' top: 25 cm below the top of the waistband (estimate); legs centred at x ±0.0966
      shorts: { top: 1.0149 - 0.25, neck: 1.0149 },
    },
  },
};
TEE_MODELS.coord.credit = {
  text: "3D: “Tshirt” by Tabbuso, “Male Tshirt and Shorts” by kanesk06, CC BY 4.0",
  href: TEE_MODELS.coord.bottom.credit.href,
};

// Which 3D model a garment uses (null = no 3D model → flat studio).
export const modelForGarment = (garment) => {
  if (!garment) return null;
  const name = `${garment.category || ""} ${garment.key || ""}`;
  if (/co-?ord/i.test(name)) return TEE_MODELS.coord;
  if (/crop/i.test(name)) {
    if (/collar|polo/i.test(name)) return TEE_MODELS.collarCrop;
    if (/oversized/i.test(name)) return TEE_MODELS.oversizedCrop;
  }
  if (garment.fit === "oversized" || /oversized/i.test(garment.category || "") || /oversized/i.test(garment.key || "")) {
    return TEE_MODELS.oversized;
  }
  // regular-fit round-neck tees
  if (/round.?neck/i.test(name)) return TEE_MODELS.regular;
  return null;
};

export const SIZE_GROUPS = { XS: "small", S: "small", M: "standard", L: "standard", XL: "standard", "2XL": "large", "3XL": "large" };
export const groupOf = (size) => SIZE_GROUPS[size] || "standard";

// Print size (cm) of a position for a garment size: the exact size for
// that garment size when the server sends one (cmBySize), else the older
// three-group sizes.
export const areaCm = (position, size) => position.cmBySize?.[size] || position.cm[groupOf(size)] || position.cm.standard;

// Areas that overlap on the tee can't both carry a print. Returns the used
// areas that block `key` ([] = free to use).
export const blockersOf = (key, positions, usedKeys) => {
  const pos = positions.find((p) => p.key === key);
  if (!pos?.conflicts?.length) return [];
  return positions.filter((p) => p.key !== key && pos.conflicts.includes(p.key) && usedKeys.includes(p.key));
};

// Pairs of used areas that overlap: [[posA, posB], …] (older designs may have some).
export const clashesIn = (positions, usedKeys) => {
  const used = positions.filter((p) => usedKeys.includes(p.key));
  const out = [];
  used.forEach((p, i) => used.slice(i + 1).forEach((q) => p.conflicts?.includes(q.key) && out.push([p, q])));
  return out;
};

/**
 * Where a print area sits on the model, in raw metres.
 * @returns {{ side, x, lateral, top, w, h }}
 *   front/back: x = left-right (raw x), top = top edge height (raw z)
 *   sleeves:    lateral = raw y of the sleeve's outer centre line
 */
export function placeArea(model, position, size, sizeLengthCm) {
  const s = sizeLengthCm / model.lengthCm; // >1 for sizes longer than the model
  const [wCm, hCm] = areaCm(position, size);
  const w = wCm / 100 / s;
  const h = hCm / 100 / s;
  const anchor = model.anchors[position.side] || model.anchors.front;
  // a print in a free place (data/panelModel.js) may sit a little differently on each size group: placeBySize
  const place = position.placeBySize?.[size] || position.place || { align: "centre", topCm: 0 };
  const collar = position.collarCm?.[size];
  const sleeve = position.side === "left" || position.side === "right";
  // the line collarCm is measured from: the collar seam, or on a sleeve its top seam (only a free place has collarCm
  // on a sleeve; the sleeve areas keep their own start)
  const line = sleeve ? anchor.shoulder : anchor.neck;
  const top = collar != null && line != null ? line - collar / 100 / s : anchor.top - ((place.topCm || 0) / 100) / s;
  if (sleeve) {
    return { side: position.side, lateral: anchor.lateral, top, w, h };
  }
  const gap = ((place.gapCm || 0) / 100) / s;
  // wearer's left is raw +x (on the back as well)
  const x = place.align === "wearer-left" ? gap + w / 2 : place.align === "wearer-right" ? -(gap + w / 2) : 0;
  return { side: position.side, x, top, w, h };
}

// Raw (z-up) model point of an area's centre, before the ray finds the surface.
export function areaCentreRaw(spot) {
  if (spot.side === "left" || spot.side === "right") return [0, spot.lateral, spot.top - spot.h / 2];
  return [spot.x, 0, spot.top - spot.h / 2];
}

/**
 * "Anywhere" (free placement phase 3, 15 Nov 2026): a point tapped on the tee, in cm on the tee size — the exact
 * inverse of placeArea for a print in a free place (its top below the collar seam, collarCm; its middle across).
 * @param raw  the point in raw model metres (z up, + x = the wearer's left)
 * @returns {{ side, down, across }}  down: cm below the collar seam (a sleeve: below its top seam); across: cm from the
 *   centre line, + = the wearer's left (a sleeve: 0 — its prints sit on the sleeve's centre line)
 */
export function pointToCm(model, raw, side, sizeLengthCm) {
  const s = sizeLengthCm / model.lengthCm;
  const anchor = model.anchors[side] || model.anchors.front;
  const sleeve = side === "left" || side === "right";
  const line = sleeve ? anchor.shoulder : anchor.neck;
  return { side, down: (line - raw[2]) * 100 * s, across: sleeve ? 0 : raw[0] * 100 * s };
}

/**
 * Which side of the tee a tapped point is on: a sleeve where the point is out past the body (bodyHalf) within the
 * sleeve's reach below its top seam — seen from the front most of the sleeve faces the camera, so where it is decides,
 * not which way it faces — or where the fabric faces sideways (normal, raw) out there (the strip by the armhole and the
 * shoulder); else the front or the back — the half being looked at.
 */
export function sideAtPoint(model, raw, normal, lookingAtFront) {
  for (const [side, out] of [["left", 1], ["right", -1]]) {
    const a = model.anchors[side];
    if (!a?.shoulder) continue;
    const reach = raw[2] >= a.shoulder - (model.sleeveDrop || 0.2);
    if (model.bodyHalf && raw[0] * out > model.bodyHalf + 0.012 && raw[2] <= a.shoulder && reach) return side;
    if (normal[0] * out > 0.55 && raw[0] * out > 0.12 && raw[2] <= a.shoulder + 0.03 && reach) return side;
  }
  return lookingAtFront ? "front" : "back";
}
