// The IDENTEE neck label printed inside the back neck (13 Nov 2026 — studio/neckLabel.js, neckLabelArt.js, Room3D.jsx
// NeckLabel / the "label" camera and picture, DesignRoomPage.jsx, the cart and the order's design pictures).
// Placed on the real model files in public/models, the way the room loads them (Room3D.jsx useTeeGeometry).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { dipFrontNeck } from "../src/studio/neckDip.js";
import { TEE_MODELS } from "../src/studio/teeModel.js";
import { NECK_LABEL, LABEL_TAG, LABEL_VIEW, labelCloser, labelWords, labelSpot, pressLabel } from "../src/studio/neckLabel.js";

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// The first mesh of a .glb with its positions, normals and the node's place in the scene applied.
function loadTee(file) {
  const b = readFileSync(new URL(`../public/models/${file}`, import.meta.url));
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const bin = 20 + jsonLen + 8;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const read = (accIndex) => {
    const a = j.accessors[accIndex];
    const bv = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const [size, get, max] = {
      5120: [1, "getInt8", 127], 5121: [1, "getUint8", 255], 5122: [2, "getInt16", 32767],
      5123: [2, "getUint16", 65535], 5125: [4, "getUint32", 1], 5126: [4, "getFloat32", 1],
    }[a.componentType];
    const stride = bv.byteStride || size * n;
    const start = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Float64Array(a.count * n);
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < n; k++) {
        const v = view[get](start + i * stride + k * size, true);
        out[i * n + k] = a.normalized ? Math.max(v / max, -1) : v;
      }
    }
    return out;
  };
  const scene = j.scenes[j.scene || 0];
  let node = null;
  const parents = [];
  const find = (ids, chain) => ids.some((id) => {
    const nd = j.nodes[id];
    if (nd.mesh != null) return (node = nd), parents.push(...chain), true;
    return find(nd.children || [], [...chain, nd]);
  });
  find(scene.nodes, []);
  const matrixOf = (nd) => nd.matrix
    ? new THREE.Matrix4().fromArray(nd.matrix)
    : new THREE.Matrix4().compose(
      new THREE.Vector3(...(nd.translation || [0, 0, 0])),
      new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(nd.scale || [1, 1, 1])),
    );
  const world = [...parents, node].reduce((m, nd) => m.multiply(matrixOf(nd)), new THREE.Matrix4());
  const prim = j.meshes[node.mesh].primitives[0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(read(prim.attributes.POSITION)), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(Float32Array.from(read(prim.attributes.NORMAL)), 3));
  geo.setIndex(Array.from(read(prim.indices)));
  return geo.applyMatrix4(world);
}

// The tee as the room has it (useTeeGeometry): front collar dip, centred, toModel = raw z-up → tee space.
function roomTee(file, model) {
  const geo = loadTee(file);
  if (model.neckDip) dipFrontNeck(geo, model.neckDip);
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  if (model.hangHalfHeight) c.y = geo.boundingBox.max.y - model.hangHalfHeight;
  const offset = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
  geo.applyMatrix4(offset);
  const toModel = offset.clone().multiply(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
  const probe = new THREE.Mesh(geo);
  probe.userData.toModel = toModel;
  return { probe, toModel };
}

const seamY0 = (model, toModel) => new THREE.Vector3(0, 0, model.anchors.back.neck).applyMatrix4(toModel).y;

const MODELS = [
  ["oversized", "oversized-tee.glb", 76.2],
  ["oversizedCrop", "oversized-crop.glb", 50.8],
  ["regular", "regular-tee.glb", 68.6],
  ["collarCrop", "collar-crop-top.glb", 43.2],
];

test("every garment model gets the label on the INSIDE of the back neck, at its real size, just under the collar seam", (t) => {
  const W = NECK_LABEL.wCm / 100;
  const H = NECK_LABEL.hCm / 100;
  const GAP = NECK_LABEL.gapCm / 100;
  for (const [name, file, lengthCm] of MODELS) {
    const model = TEE_MODELS[name];
    const { probe, toModel } = roomTee(file, model);
    const spot = labelSpot(model, lengthCm);
    const built = pressLabel(probe, spot);
    assert.ok(built, `${name}: the label lands`);
    const pos = built.geo.getAttribute("position");
    const nor = built.geo.getAttribute("normal");
    assert.ok(pos.count / 3 >= 8, `${name}: ${pos.count / 3} pieces`);
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    const s = lengthCm / model.lengthCm;
    // its size on the model: the real size (the tag, its tab and shadow), ÷ the size scale (a few mm of curve allowed)
    assert.ok(Math.abs(box.max.x - box.min.x - W / s) < 0.004, `${name}: ${(box.max.x - box.min.x) * 100} cm wide`);
    assert.ok(Math.abs(box.max.y - box.min.y - H / s) < 0.004, `${name}: ${(box.max.y - box.min.y) * 100} cm high`);
    // in the middle of the back, its top just (÷ s) under the back collar seam, where it is sewn in
    assert.ok(Math.abs((box.max.x + box.min.x) / 2 - new THREE.Vector3(0, 0, 0).applyMatrix4(toModel).x) < 0.004, `${name}: centred`);
    const seamY = new THREE.Vector3(0, 0, model.anchors.back.neck).applyMatrix4(toModel).y;
    assert.ok(Math.abs(seamY - box.max.y - GAP / s) < 0.004, `${name}: top ${(seamY - box.max.y) * 100} cm under the seam`);
    // every piece faces the front (the inside of the back panel), so it never shows from behind
    let worst = { z: 1, y: 0 };
    for (let i = 0; i < nor.count; i++) if (nor.getZ(i) < worst.z) worst = { z: nor.getZ(i), y: pos.getY(i) };
    t.diagnostic(`${name}: most-turned corner normal z ${worst.z.toFixed(3)} at ${((seamY0(model, toModel) - worst.y) * 100).toFixed(2)} cm under the seam`);
    // each piece faces the front (as pressLabel keeps them); a corner may lean back a little where the fabric turns
    // at the collar seam — the outer back panel hides it from behind
    for (let i = 0; i < nor.count; i += 3) {
      const facing = (nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2)) / 3;
      assert.ok(facing >= 0.3, `${name}: piece ${i / 3} faces the front (${facing.toFixed(2)})`);
    }
    assert.ok(worst.z > -0.4, `${name}: no corner turned right round (${worst.z.toFixed(2)})`);
    // on the back panel's inside: in front of its outside, by no more than the fabric's thickness
    const both = new THREE.Mesh(probe.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const hits = new THREE.Raycaster(new THREE.Vector3(built.point.x, built.point.y, 5), new THREE.Vector3(0, 0, -1)).intersectObject(both);
    const outside = hits[hits.length - 1].point.z;
    assert.ok(built.point.z > outside && built.point.z - outside < 0.012, `${name}: ${(built.point.z - outside) * 1000} mm in front of the outside`);
    assert.ok(built.point.z < 0, `${name}: on the back half`);
    t.diagnostic(`${name}: ${pos.count / 3} pieces, ${((box.max.x - box.min.x) * 100).toFixed(2)} × ${((box.max.y - box.min.y) * 100).toFixed(2)} cm on the model, ${((seamY - box.max.y) * 100).toFixed(2)} cm under the seam, ${((built.point.z - outside) * 1000).toFixed(1)} mm inside the outer face`);
  }
});

test("bigger sizes: the same real size, so smaller on the one-size model; the gap under the seam shrinks the same way", () => {
  const m = TEE_MODELS.oversized;
  const M = labelSpot(m, 76.2);
  const XXL = labelSpot(m, 81.3);
  assert.ok(XXL.w < M.w && XXL.h < M.h);
  assert.ok(Math.abs(M.w * 76.2 - XXL.w * 81.3) < 1e-9);
  assert.ok(Math.abs(m.anchors.back.neck - (M.mid + M.h / 2) - (NECK_LABEL.gapCm / 100) * (72.4 / 76.2)) < 1e-9);
  // no size chart length: the model's own size
  assert.equal(labelSpot(m, 0).w, 0.06);
  // the picture = the woven tag (56 × 17.2 mm, as in the owner's picture) and its size tab, with room for the shadow;
  // its top in the neck seam
  assert.deepEqual({ w: NECK_LABEL.wCm, h: NECK_LABEL.hCm, gap: NECK_LABEL.gapCm }, { w: 6, h: 2.75, gap: 0.15 });
  assert.deepEqual([LABEL_TAG.w, LABEL_TAG.h, LABEL_TAG.tabH], [56, 17.2, 8.2]);
  assert.ok(LABEL_TAG.boxW >= LABEL_TAG.w + 2 && LABEL_TAG.boxH >= LABEL_TAG.h + LABEL_TAG.tabH + 1.5);
});

test("the words: only the size changes, as the shop names it (kids' and big sizes too)", () => {
  assert.deepEqual(labelWords("m"), { size: "M" });
  assert.deepEqual(labelWords(" 2xl "), { size: "2XL" });
  assert.deepEqual(labelWords("13-14"), { size: "13-14" });
  assert.equal(labelWords(undefined).size, "");
});

test("one woven tag for all colours: the owner's black label with cream words, nothing chosen by the tee colour", () => {
  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  };
  const lumOf = (h) => {
    const [r, g, b] = hex(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(lumOf(a), lumOf(b)) + 0.05) / (Math.min(lumOf(a), lumOf(b)) + 0.05);
  // the words on the tag read the same on every tee: well above 7 : 1; a black tag, cream words
  assert.ok(contrast(LABEL_TAG.cloth, LABEL_TAG.thread) > 14, `words ${contrast(LABEL_TAG.cloth, LABEL_TAG.thread).toFixed(1)} : 1`);
  assert.ok(lumOf(LABEL_TAG.cloth) < 0.01 && lumOf(LABEL_TAG.thread) > 0.7);
  // no ink rule by tee colour any more (the old printed label needed one — weak on reds and pinks)
  const room = src("../src/studio/Room3D.jsx");
  const comp = room.slice(room.indexOf("function NeckLabel"), room.indexOf("// Print areas that can be picked"));
  assert.doesNotMatch(comp, /colour=|colour\)|labelInkDark|onLight/);
  assert.match(comp, /neckLabelCanvas\(\{ size: label\.size \}\)/);
  // two-colour damask: no gold, and the fine bits as in the owner's picture (high-definition damask weaves them)
  assert.ok(LABEL_TAG.lineCapMm >= 1.3 && LABEL_TAG.tmCapMm >= 1.25 && LABEL_TAG.sizeCapMm >= 3.3 && LABEL_TAG.ruleThickMm >= 0.2);
  const art = src("../src/studio/neckLabelArt.js");
  assert.doesNotMatch(art, /gold|#C9A45C/i);
  // the long sizes lose the dashes and the tab widens ("13-14", "5XL")
  assert.match(art, /const dashes = size\.length <= 2;/);
});

test("the close-up looks down into the neck from the front, inside the room's camera limits", () => {
  const { up, out, picture } = LABEL_VIEW;
  const polar = Math.PI / 2 - Math.atan2(up, out); // from straight up
  assert.ok(polar > Math.PI * 0.28 && polar < Math.PI * 0.62, `polar ${polar / Math.PI}π`);
  // the room's closest camera distance (OrbitControls minDistance 1, tee scale 2.2)
  assert.ok(Math.hypot(up, out) * 2.2 >= 1);
  assert.ok(picture > 0.4 && picture < 1);
  // a phone's small view (~280 px high) comes a little nearer; a computer's keeps the full distance; never nearer
  // than `nearest` (0.65+), so the whole neck opening stays in view like the owner's pick
  assert.equal(labelCloser(700), 1);
  assert.equal(labelCloser(LABEL_VIEW.fullPx), 1);
  assert.ok(labelCloser(279) < 0.75 && labelCloser(279) >= LABEL_VIEW.nearest);
  assert.equal(labelCloser(120), LABEL_VIEW.nearest);
  assert.ok(LABEL_VIEW.nearest >= 0.65);
  // still well clear of the camera's near plane (0.05) and not inside the tee: ≥ 0.4 room units from the label
  assert.ok(Math.hypot(up, out) * 2.2 * LABEL_VIEW.nearest >= 0.4);
  // the room lets the camera that near only for the label close-up, and every other view puts the limit back
  const rig = src("../src/studio/Room3D.jsx");
  assert.match(rig, /setNearest\(1\);\s*\n\s*if \(request\.label\)/);
  assert.match(rig, /to = labelCamera\(l, labelCloser\(size\.height\)\);\s*\n\s*setNearest\(Math\.min\(1, to\.distanceTo\(look\)/);
  assert.match(rig, /const \[nearest, setNearest\] = useState\(1\);/);
  assert.match(rig, /minDistance=\{nearest\}/);
});

test("in the room: on the tee itself (it turns, folds and is photographed with it), never tappable, never a print area", () => {
  const room = src("../src/studio/Room3D.jsx");
  // drawn inside the tee's mesh, after its prints
  assert.match(room, /\{neckLabel && <NeckLabel probe=\{probe\} model=\{model\} label=\{neckLabel\} \/>\}\s*<\/mesh>/);
  // taps go through it to the tee; it has no areaKey, so the area camera, the print fade and the pictures' print
  // handling never treat it as a print; it folds with the tee in the Review reveal
  const comp = room.slice(room.indexOf("function NeckLabel"), room.indexOf("// Print areas that can be picked"));
  assert.match(comp, /raycast=\{noHit\}/);
  assert.doesNotMatch(comp, /areaKey/);
  assert.match(comp, /onBeforeCompile=\{foldable\}/);
  assert.match(comp, /name="neck-label"/);
  // the close-up: the tee's own front-facing place, the room's lean held, a closer picture
  assert.match(room, /holdLean\.current = !!request\.label;/);
  assert.match(room, /room === "boutique" && !dragging\.current && !holdLean\.current/);
  assert.match(room, /const label = view === "label" \? labelAt\(\) : null;/);
});

test("the design room: a Label view button, Review's Neck label close-up, and the label picture saved with the design", () => {
  const page = src("../src/studio/DesignRoomPage.jsx");
  assert.match(page, /const neckLabel = useMemo\(\(\) => \(NECK_LABEL\.on && model \? \{ \.\.\.labelWords\(sizeNow\), lengthCm \} : null\), \[model, sizeNow, lengthCm\]\);/);
  assert.match(page, /neckLabel=\{neckLabel\}/);
  assert.match(page, /onClick=\{goLabel\}/);
  assert.match(page, /className=\{`dr-labelshot\$\{sideShown === "label" \? " on" : ""\}`\}/);
  assert.match(page, /const label = api\.snapshot\("label"\);[^\n]*\n\s*if \(label\) out\.label = await cropMockup\(label\);/);
  // …and the 3D view gives no "label" picture when the tee has none (so a design saved with the label off has none)
  const rig = src("../src/studio/Room3D.jsx");
  assert.match(rig, /const shoot = view !== "label" \|\| !!label;/);
  assert.match(rig, /const url = shoot \? gl\.domElement\.toDataURL\("image\/jpeg", 0\.85\) : null;/);
  assert.match(page, /\.\.\.\(labelShot \? \{ label: labelShot \} : \{\}\)/);
  // the four side pictures stay four (Review's tiles, the try-on photo and the shop pictures use them by place)
  assert.match(page, /const SIDES = \[\["front", "Front"\], \["back", "Back"\], \["left", "Left"\], \["right", "Right"\]\];/);
});

test("nothing of the label reaches the print team: the print ZIP's previews are the four sides only", () => {
  const files = src("../src/studio/printFiles.js");
  assert.match(files, /for \(const side of \["front", "back", "left", "right"\]\) \{\s*const url = d\.mockups\?\.\[side\];/);
  assert.doesNotMatch(files, /mockups\??\.\??\[?["']?label/);
  assert.doesNotMatch(src("../src/pages/admin/OrderDesignsModal.jsx"), /label["']\]/);
});

test("saved and shown: the server keeps the label picture; the cart and the design pop-up (order page, My designs) show it", () => {
  const ctrl = src("../../server/controllers/customizationController.js");
  assert.match(ctrl, /const MOCKUP_VIEWS = \["front", "back", "left", "right", "label"\];/);
  assert.match(src("../../server/models/customizationModel.js"), /label: \{ type: String, default: null \},/);
  assert.match(src("../src/pages/CartPage.jsx"), /\{g\.design\.mockups\?\.label && \(/);
  const preview = src("../src/components/DesignPreview.jsx");
  assert.match(preview, /\["label", "Label"\],/);
  assert.match(preview, /\{mockups\.label && <Fact label="Neck label"/);
});
