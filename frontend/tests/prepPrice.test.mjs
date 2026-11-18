// Prepare for print's price (18 Nov 2026): VF-2026-0083's owl showed "about ₹4.5" (one Topaz unit) but was billed
// 3 units, ₹13.5 — the price now follows the picture's size the way the server enlarges it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepEstimate, prepPriceWords, topazFactor, topazUnitsFor } from "../src/utils/prepPrice.js";

const topaz = { choice: "topaz", priceInr: 4.5, topazPricePerUnitInr: 4.5 };

test("Topaz units: Replicate's listed sizes, and the real bills of 67 MP and 68 MP (3 units)", () => {
  for (const [mp, u] of [[12, 1], [24, 1], [36, 2], [48, 2], [60, 3], [67.1, 3], [68.4, 3], [96, 4], [132, 5], [168, 6], [336, 11], [512, 17]]) assert.equal(topazUnitsFor(mp), u, `${mp} MP`);
  assert.equal(topazFactor(1.5), 2);
  assert.equal(topazFactor(3), 4);
  assert.equal(topazFactor(5), 6);
});

test("the owl of VF-2026-0083: 3712×4608 at 23.7 cm → 1.5×, Topaz 2× = 68 MP → 3 units → ₹13.5 (the real bill)", () => {
  const est = prepEstimate({ width: 3712, height: 4608, printCm: 23.7, enlarger: topaz });
  assert.deepEqual(est, { inr: 13.5, units: 3, keep: 1.5 });
  assert.equal(prepPriceWords(est, topaz), "about ₹13.5");
});

test("a 4K square at a small print: Topaz 2× of 4096² = 67 MP → 3 units (the 16 Nov bill)", () => {
  assert.equal(prepEstimate({ width: 4096, height: 4096, printCm: 25, enlarger: topaz }).units, 3);
});

test("under 4K: worked out on the AI's 4K copy (about 16.8 MP, same shape)", () => {
  const small = prepEstimate({ width: 1024, height: 1024, printCm: 28, copyFirst: true, enlarger: topaz });
  const asCopy = prepEstimate({ width: 4099, height: 4099, printCm: 28, enlarger: topaz });
  assert.equal(small.units, asCopy.units);
  assert.ok(small.keep < 2.5);
});

test("already big enough: not enlarged, nothing to pay; Real-ESRGAN: its one price; test enlarger: free", () => {
  const big = prepEstimate({ width: 8000, height: 8000, printCm: 10, enlarger: topaz });
  assert.equal(big.inr, 0);
  assert.equal(prepPriceWords(big, topaz), "free — no enlarging needed");
  assert.equal(prepEstimate({ width: 3712, height: 4608, printCm: 23.7, enlarger: { choice: "real-esrgan", priceInr: 1 } }).inr, 1);
  assert.equal(prepPriceWords(null, { mock: true }), "free (test)");
  assert.equal(prepPriceWords(null, topaz), "about ₹4.5+"); // still measuring
  assert.equal(prepEstimate({ width: 0, height: 0, printCm: 20, enlarger: topaz }), null);
});

test("the admin window uses the per-picture price on the button, its question, Prepare all and Send", () => {
  const src = fs.readFileSync(new URL("../src/pages/admin/OrderDesignsModal.jsx", import.meta.url), "utf8");
  assert.match(src, /prepPriceWords\(prepEstimate\(\{ width: px\?\.w, height: px\?\.h, printCm, copyFirst, enlarger \}\), enlarger\)/);
  assert.match(src, /prepare\(index, printCm, copyFirst \? long : 0, prepPrice\)/);
  assert.match(src, /It costs \$\{prepCost\(todo\)\}/);
  assert.doesNotMatch(src, /prepPrice \* notReady\.length/);
});
