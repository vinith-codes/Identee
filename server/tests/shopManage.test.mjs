// Manage Shop your IDENTEE (24 Nov 2026): the collections' settings, the bulk price check and a tee's row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCollections, withSettings, DEFAULT_HOME } from "../utils/shopCollections.js";
import { cleanPrice, teeRow, ACTIONS } from "../controllers/shopManageController.js";

test("cleanCollections keeps only clean names, text, order and home", () => {
  const c = cleanCollections({ order: ["Ayyappa", "gta", "gta", "<x>"], items: { ayyappa: { name: "  Ayyappa   Swami ", text: "x".repeat(300), home: 1, evil: "y" }, "": { name: "z" } } });
  assert.deepEqual(c.order, ["ayyappa", "gta", "x"]);
  assert.deepEqual(Object.keys(c.items), ["ayyappa"]);
  assert.equal(c.items.ayyappa.name, "Ayyappa Swami");
  assert.equal(c.items.ayyappa.text.length, 200);
  assert.equal(c.items.ayyappa.home, true);
  assert.equal(c.items.ayyappa.evil, undefined);
});

test("withSettings: the admin's order first, names on, home picks; nothing saved = GTA + Ayyappa on the home page", () => {
  const list = [{ key: "scene", name: "SCENE" }, { key: "gta", name: "GTA" }, { key: "ayyappa", name: "AYYAPPA" }];
  const plain = withSettings(list, null);
  assert.deepEqual(plain.map((c) => c.key), ["scene", "gta", "ayyappa"]);
  assert.deepEqual(plain.filter((c) => c.home).map((c) => c.key).sort(), [...DEFAULT_HOME].sort());
  const set = withSettings(list, { order: ["ayyappa", "scene"], items: { ayyappa: { name: "Ayyappa Swami", text: "Devotional", home: true }, gta: { name: "", text: "", home: false } } });
  assert.deepEqual(set.map((c) => c.key), ["ayyappa", "scene", "gta"]);
  assert.equal(set[0].name, "Ayyappa Swami");
  assert.equal(set[0].custom, true);
  assert.equal(set.find((c) => c.key === "gta").home, false); // saved as off
  assert.equal(set.find((c) => c.key === "scene").home, false); // not in the saved list: the default
});

test("cleanPrice: whole rupees, the struck price above the price", () => {
  assert.deepEqual(cleanPrice({ price: "449", oldPrice: "799" }), { price: 449, oldPrice: 799 });
  assert.deepEqual(cleanPrice({ price: 499 }), { price: 499, oldPrice: 0 });
  assert.ok(cleanPrice({ price: 0 }).error);
  assert.ok(cleanPrice({ price: 500, oldPrice: 400 }).error);
  assert.ok(ACTIONS.includes("delete") && ACTIONS.includes("colourOut"));
});

test("teeRow: collection, style, colours with the taken-out ones marked, the back picture for a locked-logo tee", () => {
  const d = {
    _id: "1",
    name: "GTA · Vinewood",
    status: "ready",
    garmentType: "oversized-tee",
    color: "black",
    colours: [{ slug: "black", mockups: { front: "f.png", back: "b.png" } }, { slug: "white", mockups: {} }],
    hiddenColours: ["white"],
    product: { style: "Oversized", gender: "Unisex" },
    elements: [{ side: "front", fixed: true }, { side: "back", type: "image" }],
  };
  const g = { label: "Oversized Tee", colours: [{ slug: "black", name: "Black", hex: "#111" }, { slug: "white", name: "White", hex: "#fff" }] };
  const r = teeRow(d, g, { price: 699, oldPrice: 899 });
  assert.equal(r.collection, "gta");
  assert.equal(r.inShop, false);
  assert.equal(r.style, "Oversized");
  assert.deepEqual(r.colours.map((c) => [c.name, c.hidden]), [["Black", false], ["White", true]]);
  assert.equal(r.picture, "b.png");
  assert.equal(r.price, 699);
});
