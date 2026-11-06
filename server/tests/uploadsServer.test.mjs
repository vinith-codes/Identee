// Pictures on our own server (utils/uploadsServer.js, utils/imageStorage.js): the small bits that must never go wrong.
import test from "node:test";
import assert from "node:assert/strict";
import { snapWidth, safeRel, WIDTHS } from "../utils/uploadsServer.js";
import path from "path";
import { localRelPath, parseCloudinaryUrl, localFilePath, UPLOADS_DIR } from "../utils/imageStorage.js";

test("snapWidth picks the first listed width that is big enough", () => {
  assert.equal(snapWidth(240), 240);
  assert.equal(snapWidth(241), 400);
  assert.equal(snapWidth("600"), 600);
  assert.equal(snapWidth(1700), 2000);
  assert.equal(snapWidth(99999), WIDTHS[WIDTHS.length - 1]); // never bigger than the largest
  assert.equal(snapWidth(0), null);
  assert.equal(snapWidth("abc"), null);
  assert.equal(snapWidth(undefined), null);
});

test("safeRel keeps a request inside the uploads folder", () => {
  assert.equal(safeRel("/products/x.png"), "products/x.png");
  assert.equal(safeRel("/a%20b/c.webp"), "a b/c.webp");
  assert.equal(safeRel("/../server.js"), null);
  assert.equal(safeRel("/products/../../.env"), null);
  assert.equal(safeRel("/.sizes/x.webp"), null); // the copies are not served as files of their own
  assert.equal(safeRel("/products/.hidden"), null);
  assert.equal(safeRel(""), null);
});

test("localRelPath reads our own picture paths and nothing else", () => {
  assert.equal(localRelPath("/uploads/products/x.png"), "products/x.png");
  assert.equal(localRelPath("uploads/garments/y.webp?w=600"), "garments/y.webp");
  assert.equal(localRelPath("https://backend.identee.co.in/uploads/designs/z.png"), "designs/z.png");
  assert.equal(localRelPath("https://res.cloudinary.com/x/image/upload/v1/identee/a.png"), null);
  assert.equal(localRelPath("/uploads/../.env"), null);
  assert.equal(localRelPath(""), null);
});

test("parseCloudinaryUrl still reads the old links", () => {
  assert.deepEqual(parseCloudinaryUrl("https://res.cloudinary.com/vy728xfe/image/upload/v1791826926/identee/ai-designs/abc.png"), { resourceType: "image", publicId: "identee/ai-designs/abc" });
  assert.equal(parseCloudinaryUrl("/uploads/products/x.png"), null);
});

test("localFilePath finds our pictures in the uploads folder next to server.js, whatever folder the server started in", () => {
  assert.equal(localFilePath("/uploads/mockups/a.jpg"), path.join(UPLOADS_DIR, "mockups/a.jpg"));
  assert.equal(path.basename(path.dirname(UPLOADS_DIR)), "server");
  assert.equal(localFilePath("/uploads/../.env"), null);
  assert.equal(localFilePath("https://res.cloudinary.com/x/image/upload/v1/identee/a.png"), null);
});
