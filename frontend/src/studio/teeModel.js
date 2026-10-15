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
    anchors: {
      front: { top: 1.58 - 0.08, neck: 1.58 },
      back: { top: 1.6096 - 0.07, neck: 1.6096 },
      left: { top: 1.5286 - 0.05, lateral: 0.0314 }, // wearer's left sleeve (raw +x)
      right: { top: 1.5174 - 0.05, lateral: 0.0444 }, // wearer's right sleeve (raw −x)
    },
  },
  // Regular-fit round-neck tee — the boys', girls' and kids' round necks (and the co-ord set's tee).
  // Converted from the Sketchfab file (inches) to metres, front facing +z, one mesh; measured in
  // identee-private-assets/3D-models/regular-tee-measurements.json.
  regular: {
    url: "/models/regular-tee.glb",
    credit: { text: "3D tee: “Tshirt” by Tabbuso, CC BY 4.0", href: "https://sketchfab.com/3d-models/tshirt-5a21282b2e454d1696547148f617d3d0" },
    lengthCm: 62.6, // shoulder top → hem at the centre, ≈ size S
    anchors: {
      // the main print's top: 8 cm (front) / 7 cm (back) below the neckline, as on the oversized tee
      front: { top: 1.6328 - 0.08, neck: 1.6328 },
      back: { top: 1.6802 - 0.07, neck: 1.6802 },
      // the sleeves are short (≈14 cm at their outer side): the print's top sits so it is centred on the sleeve
      left: { top: 1.535, lateral: 0.072 },
      right: { top: 1.545, lateral: 0.069 },
    },
  },
};

// Which 3D model a garment uses (null = no 3D model → flat studio).
export const modelForGarment = (garment) => {
  if (!garment) return null;
  if (garment.fit === "oversized" || /oversized/i.test(garment.category || "") || /oversized/i.test(garment.key || "")) {
    return TEE_MODELS.oversized;
  }
  // regular-fit round-neck tees (and the co-ord set's tee)
  if (/round.?neck|co-?ord/i.test(`${garment.category || ""} ${garment.key || ""}`)) return TEE_MODELS.regular;
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
  const place = position.place || { align: "centre", topCm: 0 };
  const collar = position.collarCm?.[size];
  const top = collar != null && anchor.neck != null ? anchor.neck - collar / 100 / s : anchor.top - ((place.topCm || 0) / 100) / s;
  if (position.side === "left" || position.side === "right") {
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
