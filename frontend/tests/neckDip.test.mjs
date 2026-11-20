// Front and back told apart at a glance (13 Nov 2026, feedback 1 — studio/neckDip.js, teeModel.js neckDip,
// AreaThumb.jsx): the oversized 3D tee's front collar is drawn 3 cm lower, and the "Where to print" Front cards draw
// the lower front neckline. Measured on the real model files in public/models.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { dipFrontNeck } from "../src/studio/neckDip.js";
import { TEE_MODELS, placeArea } from "../src/studio/teeModel.js";

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// The first mesh of a .glb, with its node's place in the scene applied — what useTeeGeometry gets from
// floatGeometry(src.geometry).applyMatrix4(src.matrixWorld). (The tee files are one node with one mesh.)
function loadTee(file) {
  const b = readFileSync(new URL(`../public/models/${file}`, import.meta.url));
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const bin = 20 + jsonLen + 8; // the binary chunk's data
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
  geo.setIndex(Array.from(read(prim.indices)));
  return geo.applyMatrix4(world);
}

// The collar's top at the centre line: the highest point of the front half and of the back half.
function collar(geo) {
  const p = geo.getAttribute("position");
  let front = -Infinity;
  let back = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getX(i)) > 0.01) continue;
    if (p.getZ(i) > 0) front = Math.max(front, p.getY(i));
    if (p.getZ(i) < -0.03) back = Math.max(back, p.getY(i));
  }
  return { front, back };
}

const OVERSIZED = [["oversized-tee.glb", TEE_MODELS.oversized], ["oversized-crop.glb", TEE_MODELS.oversizedCrop]];

test("the oversized tee's front collar now sits about 6 cm below the back one; the back collar does not move", () => {
  for (const [file, model] of OVERSIZED) {
    const geo = loadTee(file);
    const before = collar(geo);
    assert.ok(before.back - before.front < 0.03, `${file}: the model itself has front and back almost level`);
    dipFrontNeck(geo, model.neckDip);
    const after = collar(geo);
    assert.ok(Math.abs(before.front - model.neckDip.by - after.front) < 0.001, `${file}: the front collar is 3 cm lower`);
    assert.equal(after.back, before.back, `${file}: the back collar stays`);
    assert.ok(after.back - after.front > 0.055, `${file}: front ${(after.back - after.front) * 100} cm below the back`);
  }
});

test("only the front of the neck moves: not the back half, not past the neck opening, not more than 15 cm down", () => {
  const { neckDip } = TEE_MODELS.oversized;
  const geo = loadTee("oversized-tee.glb");
  const was = Float32Array.from(geo.getAttribute("position").array);
  dipFrontNeck(geo, neckDip);
  const now = geo.getAttribute("position").array;
  let moved = 0;
  for (let i = 0; i < now.length; i += 3) {
    assert.equal(now[i], was[i]); // x never changes
    assert.equal(now[i + 2], was[i + 2]); // z never changes
    if (now[i + 1] === was[i + 1]) continue;
    moved++;
    assert.ok(now[i + 1] < was[i + 1], "a point only ever moves down");
    assert.ok(was[i + 2] > -0.04, "nothing on the back half moves");
    assert.ok(Math.abs(was[i]) < neckDip.half, "nothing past the neck opening (the shoulders) moves");
    assert.ok(was[i + 1] > neckDip.neck - 0.15, "nothing more than 15 cm under the collar moves");
  }
  assert.ok(moved > 500 && moved < 3000, `a small patch moves (${moved} of ${now.length / 3} points)`);
});

test("the tee keeps its size and middle, so the Review, cart and order pictures keep their framing", () => {
  for (const [file, model] of OVERSIZED) {
    const geo = loadTee(file);
    geo.computeBoundingBox();
    const box = geo.boundingBox.clone();
    dipFrontNeck(geo, model.neckDip);
    geo.computeBoundingBox();
    assert.deepEqual(geo.boundingBox.min.toArray(), box.min.toArray(), file);
    assert.deepEqual(geo.boundingBox.max.toArray(), box.max.toArray(), file);
  }
});

test("front prints move down with the collar: the same gap from the collar as before, on the real model", () => {
  const fullFront = { key: "full-front", side: "front", cm: { standard: [35, 52] }, cmBySize: { M: [35, 52] }, collarCm: { M: 6 }, place: { align: "centre", topCm: -2 } };
  const centreFront = { key: "centre-front", side: "front", cm: { standard: [28, 32] }, place: { align: "centre", topCm: 0 } };
  const old = { ...TEE_MODELS.oversized, anchors: { ...TEE_MODELS.oversized.anchors, front: { top: 1.58 - 0.08, neck: 1.58 } } };
  const geo = loadTee("oversized-tee.glb");
  const before = collar(geo).front;
  dipFrontNeck(geo, TEE_MODELS.oversized.neckDip);
  const after = collar(geo).front;
  for (const pos of [fullFront, centreFront]) {
    const gapBefore = before - placeArea(old, pos, "M", 76.2).top;
    const gapAfter = after - placeArea(TEE_MODELS.oversized, pos, "M", 76.2).top;
    assert.ok(Math.abs(gapAfter - gapBefore) < 0.001, `${pos.key}: ${gapBefore} → ${gapAfter}`);
  }
});

test("the 3D tee settings: front anchors 3 cm lower and still 8 cm apart (printFiles.js EST_START); only the oversized tees dip", () => {
  const est = Number(/EST_START = \{ front: (\d+(?:\.\d+)?)/.exec(src("../src/studio/printFiles.js"))[1]);
  for (const name of ["oversized", "oversizedCrop"]) {
    const { neckDip, anchors } = TEE_MODELS[name];
    assert.ok(neckDip, name);
    assert.ok(Math.abs(anchors.front.neck - (neckDip.neck - neckDip.by)) < 1e-9, `${name}: the front neck anchor moved with the collar`);
    assert.ok(Math.abs(anchors.front.neck - anchors.front.top - est / 100) < 1e-9, `${name}: front top ${est} cm under the neck`);
    assert.equal(anchors.back.neck, 1.6096, `${name}: the back is unchanged`);
  }
  // the round neck already shows a clear front opening (4.9 cm lower than its back): left alone
  for (const name of ["regular", "coord", "collarCrop"]) assert.equal(TEE_MODELS[name].neckDip, undefined, name);
  const regular = collar(loadTee("regular-tee.glb"));
  assert.ok(regular.back - regular.front > 0.045, "the round neck's own front collar is already well below the back");
  // the room lowers it before the centring and makes the shape again when the setting changes
  const room = src("../src/studio/Room3D.jsx");
  assert.match(room, /if \(dip\) dipFrontNeck\(geo, dip\);[\s\S]{0,200}geo\.computeBoundingBox\(\);/);
  assert.match(room, /\}, \[gltf, hang, dip, k, half\]\);/); // (19 Nov 2026: and the size chart's width — teeWiden.test.mjs)
});

// Lowest point (largest y) of an SVG path made of M / L / Q / Z commands, as drawn.
function lowestY(d) {
  const t = d.match(/[MLQZ]|-?\d+(?:\.\d+)?/g);
  let at = [0, 0];
  let low = -Infinity;
  for (let i = 0; i < t.length;) {
    const c = t[i++];
    if (c === "Z") continue;
    const num = () => Number(t[i++]);
    if (c === "M" || c === "L") at = [num(), num()];
    else if (c === "Q") {
      const q = [num(), num()];
      const to = [num(), num()];
      for (let s = 0; s <= 1; s += 1 / 64) low = Math.max(low, (1 - s) ** 2 * at[1] + 2 * (1 - s) * s * q[1] + s ** 2 * to[1]);
      at = to;
    }
    low = Math.max(low, at[1]);
  }
  return low;
}

test("the Front cards draw the lower front neckline (clear of every print box); the Back cards keep the plain back collar", () => {
  const jsx = src("../src/studio/AreaThumb.jsx");
  const path = (name) => new RegExp(`const ${name} = "([^"]+)"`).exec(jsx)[1];
  const tee = path("TEE");
  const neck = path("FRONT_NECK");
  // the shared outline's collar (the back one) dips to y 9 at the centre; the front neckline to y 23
  const backCollar = lowestY(`M${/L(84 6 Q100 \d+ 116 6)/.exec(tee)[1]}`);
  assert.equal(Math.round(backCollar), 9);
  assert.equal(Math.round(lowestY(neck)), 23);
  // 14 units of 170 apart: about 4 px on a 58 px phone card (was 5 units, about 1.5 px)
  assert.ok(lowestY(neck) - backCollar >= 12);
  // the highest front print box (Full Front, 2 cm above the main print's top) starts well under it
  const mainTop = Number(/MAIN_TOP = \{ front: (\d+)/.exec(jsx)[1]);
  const unitsPerCm = Number(/TEE_UNITS_PER_CM = (\d+(?:\.\d+)?)/.exec(jsx)[1]);
  assert.ok(mainTop - 2 * unitsPerCm > lowestY(neck) + 10);
  // drawn on front and sleeve cards only, under the box; the back and the shorts get none
  assert.match(jsx, /\{!shorts && position\.side !== "back" && <path className="neck" d=\{FRONT_NECK\} \/>\}\s*\{print \?/);
  assert.match(jsx, /<path className="tee" d=\{shorts \? SHORTS : TEE\}/);
  const css = src("../src/studio/designRoom.css");
  assert.match(css, /\.dr-thumb \.neck \{ fill: rgba\(0, 0, 0, \.2\);/);
  assert.match(css, /\.dr-thumb\.on-dark \.neck \{ fill: rgba\(0, 0, 0, \.4\); stroke: rgba\(255, 240, 210, \.6\); \}/);
});
