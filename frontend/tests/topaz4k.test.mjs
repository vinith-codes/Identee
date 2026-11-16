// Topaz + 4K (15 Nov 2026): photos keep their full size (up to 25 MB / 8000 px), the design room's small-photo note
// (own pixels under 75 DPI with the enlarger on; "Make it smaller" gives 100 DPI; words never get it), and which
// enlarger made a print-ready picture, as the order sheet and the admin's order window say it. Nothing is uploaded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_BYTES, MAX_SIDE, fitsAsIs, shrinkPhoto } from "../src/studio/shrinkPhoto.js";
import { SMALLER_DPI, SMALL_PHOTO, SOFT_OWN_DPI, checkDesign, printSharpness } from "../src/studio/designCheck.js";
import { adminEnlarger, readyLine, sheetEnlarger, sheetEnlargers } from "../src/studio/enlargerNote.js";

const MB = 1024 * 1024;

/* ---------- shrinkPhoto: the limits ---------- */

test("the phone sends photos up to 25 MB and 8000 px as they are", () => {
  assert.equal(MAX_BYTES, 25 * MB);
  assert.equal(MAX_SIDE, 8000);
  assert.equal(fitsAsIs({ type: "image/jpeg", size: 19 * MB }, 6000, 4000), true, "a 19 MB phone photo is not made smaller");
  assert.equal(fitsAsIs({ type: "image/png", size: 24 * MB }, 8000, 8000), true);
  assert.equal(fitsAsIs({ type: "image/webp", size: 3 * MB }, 3000, 2000), true);
  assert.equal(fitsAsIs({ type: "image/jpeg", size: 26 * MB }, 6000, 4000), false, "over 25 MB");
  assert.equal(fitsAsIs({ type: "image/jpeg", size: 5 * MB }, 9000, 6000), false, "over 8000 px");
  assert.equal(fitsAsIs({ type: "image/gif", size: 1 * MB }, 400, 400), false, "a kind the server doesn't keep as it is");
});

// a pretend browser: a picture of w × h, and a canvas whose JPEG is `bytesPerPx` bytes a pixel (null = can't draw it)
const fakeBrowser = (w, h, { bytesPerPx = 0.5, maxPixels = Infinity } = {}) => {
  const drawn = [];
  globalThis.createImageBitmap = async () => ({ width: w, height: h, close() {} });
  globalThis.document = {
    createElement: () => {
      const c = {
        width: 0,
        height: 0,
        getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }),
        toBlob: (done, type) => {
          drawn.push([c.width, c.height]);
          if (c.width * c.height > maxPixels) return done(null);
          done(new Blob([new Uint8Array(Math.round(c.width * c.height * bytesPerPx))], { type }));
        },
      };
      return c;
    },
  };
  return drawn;
};
const photo = (size, type = "image/jpeg") => ({ name: "photo.jpg", type, size });

test("a full-size phone photo under the limits goes up untouched", async () => {
  const drawn = fakeBrowser(6000, 4000);
  const f = photo(19 * MB);
  const out = await shrinkPhoto(f);
  assert.equal(out.file, f);
  assert.deepEqual([out.w, out.h], [6000, 4000]);
  assert.equal(drawn.length, 0, "nothing redrawn");
});

test("a photo over 8000 px is made 8000 px on its long side", async () => {
  fakeBrowser(12000, 9000, { bytesPerPx: 0.2 });
  const out = await shrinkPhoto(photo(20 * MB));
  assert.deepEqual([out.w, out.h], [8000, 6000]);
  assert.equal(out.file.type, "image/jpeg");
  assert.ok(out.file.size <= MAX_BYTES);
});

test("a photo still over 25 MB at 8000 px goes down in steps (6000, 4000, 3000)", async () => {
  const drawn = fakeBrowser(10000, 10000, { bytesPerPx: 0.5 }); // 8000² × 0.5 = 32 MB, 6000² × 0.5 = 18 MB
  const out = await shrinkPhoto(photo(40 * MB));
  assert.deepEqual([out.w, out.h], [6000, 6000]);
  assert.deepEqual(drawn.map(([w]) => w), [8000, 6000]);
});

test("a phone that can't draw 8000 px (an iPhone) gets the next size that it can", async () => {
  fakeBrowser(9000, 9000, { maxPixels: 16777216 });
  const out = await shrinkPhoto(photo(30 * MB));
  assert.deepEqual([out.w, out.h], [4000, 4000]);
});

/* ---------- the small-photo note ---------- */

// a 30 × 40 cm print area
const positions = [{ key: "front", label: "Full Front", side: "front" }];
const opts = (more = {}) => ({ fabricHex: "#141110", inkDefault: "#FFFFFF", cmOf: () => ({ wCm: 30, hCm: 40 }), canEnlarge: true, ...more });
// a picture pxW pixels wide placed `width` % of the 30 cm area wide
const pic = (pxW, width, more = {}) => ({ id: "p1", type: "image", position: "front", x: (100 - width) / 2, y: 20, width, height: width, pxW, ...more });
const dpiOf = (el) => el.pxW / ((((el.width / 100) * 30)) / 2.54);
const soft = (els, more) => checkDesign(els, positions, opts(more)).filter((i) => i.kind === "blurry");

test("the rule: warn under 75 DPI of the photo's own pixels, fix to 100 DPI", () => {
  assert.equal(SOFT_OWN_DPI, 75);
  assert.equal(SMALLER_DPI, 100);
  // 30 cm wide = 11.81 in: 885 px = 74.9 DPI (warned), 890 px = 75.4 DPI (not)
  assert.equal(soft([pic(885, 100)]).length, 1);
  assert.equal(soft([pic(890, 100)]).length, 0);
  assert.equal(printSharpness(885, 30).soft, true);
  assert.equal(printSharpness(890, 30).soft, false);
});

test("the note says it plainly and offers Make it smaller / Keep this size", () => {
  const [i] = soft([pic(600, 100)]);
  assert.equal(i.text, `Full Front: ${SMALL_PHOTO}`);
  assert.equal(SMALL_PHOTO, "This photo is small, so it may look soft printed this big.");
  assert.equal(i.fixLabel, "Make it smaller");
  assert.equal(i.keepLabel, "Keep this size");
});

test("Make it smaller: the biggest size with 100 DPI, around the same centre", () => {
  const el = pic(600, 80);
  const [i] = soft([el]);
  const fixed = { ...el, ...i.patch };
  assert.ok(Math.abs(dpiOf(fixed) - 100) < 0.01, `dpi ${dpiOf(fixed)}`);
  assert.ok(Math.abs(fixed.x + fixed.width / 2 - (el.x + el.width / 2)) < 1e-9, "same centre across");
  assert.ok(Math.abs(fixed.y + fixed.height / 2 - (el.y + el.height / 2)) < 1e-9, "same centre down");
  assert.ok(Math.abs(fixed.height / fixed.width - el.height / el.width) < 1e-9, "same shape");
  assert.equal(soft([fixed]).length, 0, "no note afterwards");
});

test("words never get the small-photo note", () => {
  const words = { id: "t1", type: "text", position: "front", text: "TEAM", x: 10, y: 10, width: 80, height: 20, fontSizePct: 10, color: "#FFFFFF", pxW: 10 };
  assert.equal(soft([words]).length, 0);
});

test("Keep this size: not asked again, unless the photo is made bigger", () => {
  const el = pic(600, 80);
  const kept = new Map([[el.id, 80]]);
  assert.equal(soft([el], { kept }).length, 0);
  assert.equal(soft([{ ...el, width: 70, height: 70 }], { kept }).length, 0, "smaller is fine");
  assert.equal(soft([{ ...el, width: 90, height: 90 }], { kept }).length, 1, "bigger: asked again");
});

test("a big 4K picture is never called small", () => {
  assert.equal(soft([pic(4096, 100)]).length, 0);
});

test("without the enlarger (the admin Studio) the old check is unchanged", () => {
  const [i] = checkDesign([pic(1000, 100)], positions, opts({ canEnlarge: false })); // 84.7 DPI
  assert.equal(i.kind, "blurry");
  assert.match(i.text, /will print blurry/);
  assert.equal(i.keepLabel, undefined);
});

/* ---------- which enlarger made a print-ready picture ---------- */

test("the order sheet says which enlarger made a PRINT-READY picture", () => {
  assert.equal(readyLine("1 Full Front (M, L)", 1, [300], sheetEnlargers(["topaz"])), "  1 Full Front (M, L): PRINT-READY picture (300 DPI, vector edge, enlarged with Topaz).");
  assert.equal(
    readyLine("1 Full Front (M, L)", 1, [300], sheetEnlargers(["real-esrgan-backup"])),
    "  1 Full Front (M, L): PRINT-READY picture (300 DPI, vector edge, enlarged with the backup enlarger (Topaz failed)).",
  );
  // not enlarged (big enough) or prepared before 15 Nov: the line as before
  assert.equal(readyLine("2 Left Chest (S)", 1, [600], sheetEnlargers([undefined])), "  2 Left Chest (S): PRINT-READY picture (600 DPI, vector edge).");
  assert.equal(readyLine("2 Left Chest (S)", 2, [], sheetEnlargers([])), "  2 Left Chest (S): PRINT-READY pictures (enlarged, vector edge).");
});

test("several pictures in one print: each enlarger named once", () => {
  assert.equal(sheetEnlargers(["topaz", "topaz", undefined]), "enlarged with Topaz");
  assert.equal(sheetEnlargers(["topaz", "real-esrgan-backup"]), "enlarged with Topaz; enlarged with the backup enlarger (Topaz failed)");
  assert.equal(sheetEnlarger("something-new"), "");
});

test("the admin's order window: Topaz, Real-ESRGAN, or a warning when Topaz failed", () => {
  assert.deepEqual(adminEnlarger("topaz"), { text: "enlarged with Topaz" });
  assert.deepEqual(adminEnlarger("real-esrgan"), { text: "enlarged with Real-ESRGAN" });
  assert.deepEqual(adminEnlarger("real-esrgan-backup"), { text: "Topaz failed — enlarged with the backup enlarger", warn: true });
  assert.equal(adminEnlarger(undefined), null);
});

test("the admin's order window: a picture made from the AI's 4K copy says so (16 Nov 2026)", () => {
  assert.deepEqual(adminEnlarger("topaz", true), { text: "4K copy by AI, enlarged with Topaz" });
  assert.deepEqual(adminEnlarger("real-esrgan-backup", true), { text: "4K copy by AI, Topaz failed — enlarged with the backup enlarger", warn: true });
  assert.deepEqual(adminEnlarger(undefined, true), { text: "4K copy by AI, not enlarged further" });
  assert.deepEqual(adminEnlarger("topaz", false), { text: "enlarged with Topaz" });
});
