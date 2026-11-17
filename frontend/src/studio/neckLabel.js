// studio/neckLabel.js
//
// The IDENTEE neck label inside the back neck of every garment (13 Nov 2026; since 14 Nov the owner's woven label):
// a black cloth tag sewn into the neck seam — the tee-and-sparkles mark | "identee™", "DESIGN • CUSTOMIZE • WEAR" in
// cream — with a black size tab under it. The same label on all the shop's colours and garments.
// Customers see it on the 3D tee in the design room (so the front picture shows it through the neck opening too) and
// as a close-up: the room's "Label" view, Review's "Neck label" picture, the cart and the order's design pictures.
// Nothing of it goes to the print team — the blank tees carry it already — so no print file, sheet or ZIP ever
// includes it (printFiles.js takes only the four sides' pictures).
//
// This file: what it says, its look and where it sits on the 3D model (no drawing — that is neckLabelArt.js).
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";

// The tag at its real size (mm) and colours: the owner's own label picture (14 Nov 2026, "keep this label for all") —
// a black woven tag with cream words and a black size tab — on every garment and every shop colour. All the sizes and
// places below are measured off that picture (its tag taken as 56 mm wide), so the room draws it the same.
// Two-colour damask: no gold, no care symbols. boxW × boxH = the picture pressed on the tee: the tag, its tab and room
// for the shadow under them (the tag's top edge is the picture's top edge). Row places are mm from the tag's top.
export const LABEL_TAG = {
  w: 56, // the main tag
  h: 18,
  tabH: 7.4, // the size tab: how far it shows under the tag,
  tabTuck: 2, // how much of it is under the tag,
  tabMinW: 17.65, // and its width: every size has "— size —" in it, the dashes shorter for wider sizes, and the
  // tab wider only when they would get shorter than dashMinMm ("2XL", "13-14")
  // row 1: the tee mark | identee™
  markTopMm: 2.9, // the mark (the tee and its two sparkles): its top and height
  markMm: 8.75,
  barTopMm: 4, // the bar between the mark and the word
  barMm: 8.1,
  barWMm: 0.36,
  gapMarkMm: 3.35, // mark — bar
  gapWordMm: 3.6, // bar — word
  wordMm: 5.6, // "identee": the height of its d, at most,
  wordWMm: 26.7, // and its width, at most
  baseMm: 11.1, // its baseline
  tmCapMm: 1.25, // ™: its height,
  tmTopMm: 4.85, // its top (a little above the d),
  tmBackMm: 0.9, // and how far it starts back over the last "e"
  // row 2: —— DESIGN • CUSTOMIZE • WEAR ——
  lineCapMm: 1.3,
  lineWMm: 34, // the words' width (the letters, narrowed to lineSqueeze, spaced out to it)
  lineSqueeze: 0.88,
  dotMm: 0.58, // the dots between the words,
  dotGapMm: 1.7, // with this much clear each side
  lineBaseMm: 15.05,
  ruleMm: 5.6, // the line each side of the words,
  ruleGapMm: 1.85, // its gap to them,
  ruleThickMm: 0.2, // and its thickness
  // the size tab: — L —
  sizeCapMm: 3.35,
  sizeSqueeze: 0.9, // the size's letters a little narrow, as in the owner's "L"
  sizeMidMm: 3.65, // the size's middle, under the tag's bottom edge
  dashMinMm: 2,
  dashGapMm: 1.95,
  tabPadMm: 1.85,
  boxW: 60,
  boxH: 27.5,
  stitchInMm: 0.8, // the stitching down both ends of the tag and of the tab, this far in
  cloth: "#121110", // black damask
  thread: "#F3EDE5", // the cream-white words (after the weave ~#EEE8E2, as in the owner's picture): 17 : 1 on the black
  edge: "#2E2B27", // the fine edge where the cloth turns (so the tag keeps its shape on a black tee too)
  stitch: "#36322E", // the faint dark grey stitching
};

export const NECK_LABEL = {
  on: true, // false hides it everywhere (the room, Review and new pictures)
  wCm: LABEL_TAG.boxW / 10, // the picture on the garment, the same real size on every size
  hCm: LABEL_TAG.boxH / 10,
  gapCm: 0.15, // its top (the tag's top) just under the back collar seam, where it is sewn in
};

// The close-up, like the sample the owner picked (13 Nov 2026): in front of the tee and a little above it, looking
// down into the neck at the label (model metres; the room scales them with the tee). The pictures are taken closer.
// A small 3D view (a phone's, ~280 px high) comes a little nearer, down to `nearest` of the way: the neck opening
// then fills the phone's width, like the owner's pick, and the label is bigger. Never nearer — closer still shows
// only the back panel, the look the owner did not pick. Views `fullPx` high or more keep the full distance.
export const LABEL_VIEW = { up: 0.12, out: 0.45, picture: 0.62, fullPx: 400, nearest: 0.7 };

/** How much nearer the room's label close-up comes for a 3D view this many pixels high (1 = the full distance). */
export const labelCloser = (viewPx) => Math.min(1, Math.max(LABEL_VIEW.nearest, viewPx / LABEL_VIEW.fullPx));

/** What changes from tee to tee: only the size on the tab, as the shop names it ("M", "2XL", "13-14"). */
export function labelWords(size) {
  return { size: String(size || "").trim().toUpperCase() };
}

/**
 * Where the label sits on a model for a garment size, raw (z-up) metres: its middle height on the centre line and
 * its size on the model (the model is one size: a bigger size's label is smaller on it, as the prints are).
 */
export function labelSpot(model, sizeLengthCm) {
  const s = (sizeLengthCm || model.lengthCm) / model.lengthCm;
  const w = NECK_LABEL.wCm / 100 / s;
  const h = NECK_LABEL.hCm / 100 / s;
  const top = model.anchors.back.neck - NECK_LABEL.gapCm / 100 / s;
  return { w, h, mid: top - h / 2 };
}

const BACKWARDS = new THREE.Vector3(0, 0, -1);
const FORWARDS = new THREE.Vector3(0, 0, 1);

/**
 * The label pressed onto the INSIDE of the back panel: { geo, point } in the tee's own space, or null.
 * A line through the tee from the front, at the label's height on the centre line, ends on the back panel's
 * outside; a second one from just in front of it finds the panel's inside (the fabric the wearer's neck touches).
 * Only the pieces facing the front are kept, so nothing shows from behind or on the panel's outer layer.
 * @param {THREE.Mesh} probe   the tee (identity transform), probe.userData.toModel = raw → tee space
 */
export function pressLabel(probe, spot) {
  const p = new THREE.Vector3(0, 0, spot.mid).applyMatrix4(probe.userData.toModel);
  // both sides of every piece of fabric count here (the probe itself only sees fronts)
  const both = new THREE.Mesh(probe.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(new THREE.Vector3(p.x, p.y, 5), BACKWARDS);
  const through = ray.intersectObject(both, false);
  if (!through.length) return null;
  const outside = through[through.length - 1].point;
  ray.set(new THREE.Vector3(p.x, p.y, outside.z + 0.02), BACKWARDS);
  const inside = ray.intersectObject(both, false)[0];
  if (!inside) return null;
  // pressed straight on from the front: the words run left to right, upright, for someone looking into the neck
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, FORWARDS));
  const geo = new DecalGeometry(probe, inside.point.clone(), new THREE.Euler().setFromQuaternion(q), new THREE.Vector3(spot.w, spot.h, 0.03));
  if (!keepFront(geo)) {
    geo.dispose();
    return null; // (a model without an inner layer: nothing to print on from inside)
  }
  return { geo, point: inside.point.clone() };
}

// Keeps the pieces whose fabric faces the front of the tee (the inside of the back panel). Returns how many.
function keepFront(geo) {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  const P = [];
  const N = [];
  const U = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    let facing = 0;
    for (let k = 0; k < 3; k++) facing += v.fromBufferAttribute(nor, i + k).dot(FORWARDS);
    if (facing / 3 < 0.3) continue;
    for (let k = 0; k < 3; k++) {
      P.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      N.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
      U.push(uv.getX(i + k), uv.getY(i + k));
    }
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  return P.length / 9;
}
