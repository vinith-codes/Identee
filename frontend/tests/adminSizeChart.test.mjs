// The admin garment set-up's Sizes step (20 Nov 2026): its starting chart is the client's measurement sheet of
// 19 Nov (as live), and it knows 4XL / 5XL — before, saving the step dropped the 4XL and 5XL rows of a live garment.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ALL_SIZES, sheetSizeChart } from "../src/utils/productSheet.js";

test("the Sizes step offers XS to 5XL", () => {
  assert.deepEqual(ALL_SIZES, ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]);
});

test("the starting charts are the client's sheet as live: chest all round (flat × 2), length, no shoulder", () => {
  const at = (fit, size) => sheetSizeChart(fit).find((r) => r.size === size);
  // oversized: the sheet's M is 24.5" flat × 28.5" long
  assert.deepEqual(at("oversized", "M"), { size: "M", chest: 49, shoulder: "", length: 28.5 });
  assert.deepEqual(at("oversized", "XS"), { size: "XS", chest: 47, shoulder: "", length: 26.5 });
  assert.deepEqual(at("oversized", "5XL"), { size: "5XL", chest: 55, shoulder: "", length: 34.5 });
  // round neck (men's and ladies' the same): M 22.5" flat × 27.5"
  assert.deepEqual(at("regular", "M"), { size: "M", chest: 45, shoulder: "", length: 27.5 });
  assert.deepEqual(at("regular", "XS"), { size: "XS", chest: 43, shoulder: "", length: 25.5 });
  assert.deepEqual(at("regular", "5XL"), { size: "5XL", chest: 51, shoulder: "", length: 33.5 });
  // every size one inch more chest and one more length than the size before
  for (const fit of ["oversized", "regular"]) {
    const rows = sheetSizeChart(fit);
    assert.equal(rows.length, 9);
    rows.slice(1).forEach((r, i) => {
      assert.equal(r.chest - rows[i].chest, 1, `${fit} ${r.size} chest`);
      assert.equal(r.length - rows[i].length, 1, `${fit} ${r.size} length`);
    });
  }
});

test("the step keeps a live garment's own 4XL / 5XL rows when it is saved", () => {
  const src = fs.readFileSync(new URL("../src/pages/admin/GarmentSetupWizard.jsx", import.meta.url), "utf8");
  // the chart is built over ALL_SIZES (from productSheet.js), the garment's own rows first
  assert.match(src, /return ALL_SIZES\.map\(\(size\) => garment\.sizeChart\.find\(\(r\) => r\.size === size\) \|\| sheet\.find/);
  assert.match(src, /sizeChart: chart\.filter\(\(r\) => sizes\.includes\(r\.size\)\)/);
  const live = { sizes: ALL_SIZES, sizeChart: sheetSizeChart("oversized") };
  const chart = ALL_SIZES.map((size) => live.sizeChart.find((r) => r.size === size));
  assert.deepEqual(chart.filter((r) => live.sizes.includes(r.size)).map((r) => r.size), ALL_SIZES);
});
