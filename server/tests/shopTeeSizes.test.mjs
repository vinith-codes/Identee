// Add sizes to every shop tee at once (19 Nov 2026: XS, 4XL and 5XL from the client's measurement sheet).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withSizes, withStock } from "../services/shopTeeSizes.js";

const ALL = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const OLD = ["S", "M", "L", "XL", "2XL", "3XL"];

test("the new sizes go in the garment's order; nothing the garment doesn't sell is added", () => {
  assert.deepEqual(withSizes(OLD, ["XS", "4XL", "5XL"], ALL), ALL);
  assert.deepEqual(withSizes(["M", "L"], ["XS"], ALL), ["XS", "M", "L"]); // a tee the admin gave only M + L keeps them
  assert.deepEqual(withSizes(OLD, ["XS", "4XL", "5XL"], ["S", "M", "L", "XL", "2XL", "3XL", "4XL"]), [...OLD, "4XL"]);
  assert.deepEqual(withSizes(ALL, ["XS"], ALL), ALL); // already there: no change
  assert.deepEqual(withSizes(OLD, ["XS"], []), OLD); // garment unknown: left as it was
  assert.deepEqual(withSizes(["4-6", "M"], ["XS"], ALL), ["XS", "M", "4-6"]); // a size the garment dropped is not removed
});

test("a new size gets the tee's stock (printed on demand: 9999); the old sizes keep theirs", () => {
  const stock = OLD.map((size) => ({ size, stock: size === "M" ? 5 : 9999 }));
  const out = withStock(stock, ALL);
  assert.deepEqual(out.map((s) => s.size), ALL);
  assert.equal(out.find((s) => s.size === "M").stock, 5);
  assert.equal(out.find((s) => s.size === "XS").stock, 9999);
  assert.equal(out.find((s) => s.size === "5XL").stock, 9999);
  assert.deepEqual(withStock([], ["XS"]), [{ size: "XS", stock: 0 }]);
});

test("the route is admin-only and counts first (dryRun unless dryRun: false)", () => {
  const routes = fs.readFileSync(new URL("../routes/studioRoutes.js", import.meta.url), "utf8");
  assert.match(routes, /router\.post\("\/add-sizes", protect, admin, addSizesToShopTees\)/);
  const ctrl = fs.readFileSync(new URL("../controllers/studioController.js", import.meta.url), "utf8");
  assert.match(ctrl, /dryRun: req\.body\?\.dryRun !== false/);
  const svc = fs.readFileSync(new URL("../services/shopTeeSizes.js", import.meta.url), "utf8");
  assert.match(svc, /ReadyDesign\.find\(\{ status: "published" \}\)/);
  assert.doesNotMatch(svc, /\$set: \{[^}]*(mockups|price|images)/); // pictures and prices are not touched
});
