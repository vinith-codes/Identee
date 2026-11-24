// (24 Nov 2026) a ready design's new name goes on its shop tees — which names change
import test from "node:test";
import assert from "node:assert/strict";
import { backTitles, renamesOf, teeName } from "../services/trendTeeNames.js";

test("titles: the name, or Design <n>; a repeated name gets a number (as the Make-shop-tees button)", () => {
  assert.deepEqual(backTitles([{ name: "" }, { name: "Neon" }, { name: "neon" }, {}]), ["Design 1", "Neon", "neon 2", "Design 4"]);
  assert.equal(teeName("gta", "Neon Drive"), "GTA · Neon Drive");
});

test("only a renamed design (matched by its picture) changes; added, removed and unchanged ones don't", () => {
  const before = [{ url: "/a.png", name: "Design 77" }, { url: "/b.png", name: "Palm Night" }, { url: "/c.png", name: "" }];
  const after = [{ url: "/a.png", name: "Vice Beach Crew" }, { url: "/b.png", name: "Palm Night" }, { url: "/d.png", name: "New one" }];
  assert.deepEqual(renamesOf("gta", before, after), [{ from: "GTA · Design 77", to: "GTA · Vice Beach Crew" }]);
});

test("an empty name used to be 'Design <n>' from its place in the list", () => {
  const before = [{ url: "/a.png", name: "" }, { url: "/b.png", name: "" }];
  const after = [{ url: "/a.png", name: "" }, { url: "/b.png", name: "Sunset Ride" }];
  assert.deepEqual(renamesOf("gta", before, after), [{ from: "GTA · Design 2", to: "GTA · Sunset Ride" }]);
});

test("a change of capitals only is not a rename", () => {
  assert.deepEqual(renamesOf("gta", [{ url: "/a.png", name: "neon drive" }], [{ url: "/a.png", name: "Neon Drive" }]), []);
});
