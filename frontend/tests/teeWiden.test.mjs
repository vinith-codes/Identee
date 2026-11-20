// The 3D tee drawn to the size chart's shape (19 Nov 2026: the client's measurement sheet — the Oversized M is
// 24.5" across × 28.5" long, the 3D model 22" × 28.5"; the round neck M 22.5" × 27.5").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TEE_MODELS, unwidenX, widenDepth, widenFor, widenX } from "../src/studio/teeModel.js";

const O = TEE_MODELS.oversized;
const R = TEE_MODELS.regular;
// the live charts (chest all round = the sheet's flat × 2)
const oversized = { XS: [47, 26.5], M: [49, 28.5], "3XL": [53, 32.5], "5XL": [55, 34.5] };
const round = { XS: [43, 25.5], M: [45, 27.5], "5XL": [51, 33.5] };
const row = ([chest, length]) => ({ chest, length });

test("each size is drawn as wide as its chart says (its width ÷ length, as on the real tee)", () => {
  for (const [model, chart] of [[O, oversized], [R, round]]) {
    for (const [size, r] of Object.entries(chart)) {
      const k = widenFor(model, row(r));
      // on the drawn tee: flat chest (model × k) ÷ length (model's), against the chart's — the same shape
      const drawn = (model.flatChestCm * k) / model.lengthCm;
      const real = r[0] / 2 / r[1];
      assert.ok(Math.abs(drawn - real) < 0.002, `${size}: ${drawn.toFixed(3)} vs ${real.toFixed(3)}`);
    }
  }
  assert.equal(widenFor(O, row(oversized.M)), 1.115); // about 11 % wider than the model at M
  assert.equal(widenFor(O, row(oversized.XS)), 1.151);
  assert.equal(widenFor(O, row(oversized["5XL"])), 1.034);
  assert.equal(widenFor(R, row(round.M)), 1.056);
  assert.equal(widenFor(R, row(round["5XL"])), 0.982); // the round neck 5XL is a touch narrower than the model
});

test("no chart, or a model without a measured chest: drawn as modelled; never stretched past 25 %", () => {
  assert.equal(widenFor(O, null), 1);
  assert.equal(widenFor(O, { chest: 0, length: 30 }), 1);
  assert.equal(widenFor(TEE_MODELS.oversizedCrop, row(oversized.M)), 1);
  assert.equal(widenFor(TEE_MODELS.collarCrop, row(oversized.M)), 1);
  assert.equal(widenFor(O, { chest: 90, length: 20 }), 1.25);
  assert.equal(widenFor(O, { chest: 20, length: 40 }), 0.85);
});

test("the body stretches, the sleeves only move out with it; the tap goes back to the model's own place", () => {
  const k = 1.115;
  const half = O.bodyHalf;
  assert.equal(widenX(0, k, half), 0); // the centre line stays
  assert.ok(Math.abs(widenX(0.1, k, half) - 0.1115) < 1e-9);
  assert.ok(Math.abs(widenX(-half, k, half) + half * k) < 1e-9);
  // a sleeve point keeps its distance from the body's edge
  assert.ok(Math.abs(widenX(half + 0.05, k, half) - (half * k + 0.05)) < 1e-9);
  for (const x of [-0.3, -0.2, -0.1, 0, 0.05, 0.193, 0.25, 0.31]) assert.ok(Math.abs(unwidenX(widenX(x, k, half), k, half) - x) < 1e-9, `x ${x}`);
  assert.equal(widenDepth(0.1, k, half), k);
  assert.equal(widenDepth(half + 0.2, k, half), 1);
  assert.ok(widenDepth(half + 0.03, k, half) < k && widenDepth(half + 0.03, k, half) > 1);
});

test("the Design Room, the shop pictures and the admin Studio all draw the size's shape; taps find their side on the model", () => {
  const room = fs.readFileSync(new URL("../src/studio/Room3D.jsx", import.meta.url), "utf8");
  assert.match(room, /if \(k !== 1\) widenGeometry\(geo, k, half\);/);
  assert.match(room, /sideAtPoint\(model, asModelled,/);
  assert.match(room, /useTeeGeometry\(model, widen\)/);
  for (const f of ["../src/studio/DesignRoomPage.jsx", "../src/studio/MockupCamera.jsx", "../src/pages/admin/studio/StudioRoom.jsx"]) {
    const src = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /widenFor\(/, f);
    assert.match(src, /widen=\{(teeWiden|widen)\}/, f);
  }
});

test("a phone's Front view steps back just enough for the whole wide tee; a computer's and the Back view stay put", async () => {
  const THREE = await import("three");
  const { fitDistance } = await import("../src/studio/teeModel.js");
  // a box tee 1.53 room units across (the Oversized XS, 0.695 m × 2.2) and 0.37 deep
  const pts = [];
  for (const x of [-0.3475, 0.3475]) for (const z of [-0.085, 0.085]) pts.push(x, 0, z);
  const pos = new THREE.BufferAttribute(new Float32Array(pts), 3);
  const tan = Math.tan((16 * Math.PI) / 180);
  const at = (w, h) => fitDistance(pos, 2.2, tan * (w / h) * 0.96, 1);
  // 375 × 686 phone view: past the old 4.3, so it steps back; the sleeve tip then sits at 96 % of the half width
  const phone = at(375, 686);
  assert.ok(phone > 4.3 && phone < 5.5, `phone ${phone}`);
  const ndc = (0.3475 * 2.2) / (phone - 0.085 * 2.2) / (tan * (375 / 686));
  assert.ok(Math.abs(ndc - 0.96) < 1e-6, `edge ${ndc}`);
  // a computer's wide view: well inside 4.3, so nothing moves
  assert.ok(at(1200, 700) < 4.3 && at(800, 700) < 4.3);
  const room = fs.readFileSync(new URL("../src/studio/Room3D.jsx", import.meta.url), "utf8");
  assert.match(room, /const FIT_ACROSS = 0\.96;/);
  assert.match(room, /if \(need > Math\.abs\(to\.z\)\) to\.z = sign \* need;/); // only ever further back
  assert.match(room, /const most = request\.view === "back" \? Math\.abs\(VIEWS\.back\[2\]\) : 9;/); // the Back view's wall
  assert.match(room, /else refit\.current = request;/); // the page's first Front, asked for while the tee loads
});
