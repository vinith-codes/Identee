// Admin Studio print check (26 Oct 2026): the DTF rules and the one-button fix that makes a design pass them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dtfFixes, dtfIssues } from "../src/pages/admin/studio/studioCheck.js";

// a 30 × 40 cm print area
const positions = [{ key: "front", label: "Full Front", side: "front", cmBySize: { M: [30, 40] } }];
const opts = { size: "M" };

test("a picture filling the area is moved 1 cm inside and shrunk only as much as it must", () => {
  const el = { id: "p1", type: "image", position: "front", x: 0, y: 0, width: 100, height: 100 };
  assert.match(dtfIssues([el], positions, opts).join(" "), /0 cm from the edge/);
  const [fix] = dtfFixes([el], positions, opts);
  const fixed = { ...el, ...fix.patch };
  assert.equal(dtfIssues([fixed], positions, opts).length, 0, "passes afterwards");
  // the 1.1 cm margin on a 30 cm wide area = 3.67 %; still almost the whole area
  assert.ok(fixed.width > 90 && fixed.width < 93, `width ${fixed.width}`);
  assert.ok(Math.abs(fixed.x + fixed.width / 2 - 50) < 0.01, "kept centred");
});

test("a small picture near the edge is only moved, not shrunk", () => {
  const el = { id: "p2", type: "image", position: "front", x: 1, y: 60, width: 30, height: 20 };
  const [fix] = dtfFixes([el], positions, opts);
  assert.equal(fix.patch.width, undefined);
  assert.ok(fix.patch.x >= 3.6, `x ${fix.patch.x}`);
  assert.equal(dtfIssues([{ ...el, ...fix.patch }], positions, opts).length, 0);
});

test("a picture already inside needs nothing", () => {
  const el = { id: "p3", type: "image", position: "front", x: 10, y: 10, width: 50, height: 50 };
  assert.deepEqual(dtfFixes([el], positions, opts), []);
});

test("small words get 8.5 mm letters, a thin outline 0.45 mm, and see-through words go solid", () => {
  const el = { id: "t1", type: "text", text: "hi", position: "front", x: 30, y: 30, width: 20, height: 4, fontSizePct: 1, strokeWidthPct: 2, opacity: 0.6 };
  const [fix] = dtfFixes([el], positions, opts);
  assert.equal(fix.measure, true);
  assert.ok(Math.abs((fix.patch.fontSizePct / 100) * 40 - 0.85) < 0.001);
  const strokeMm = ((fix.patch.strokeWidthPct / 100) * (fix.patch.fontSizePct / 100) * 40 * 10) / 2;
  assert.ok(Math.abs(strokeMm - 0.45) < 0.001, `stroke ${strokeMm}`);
  assert.equal(fix.patch.opacity, 1);
  assert.equal(dtfIssues([{ ...el, ...fix.patch }], positions, opts).length, 0);
});

test("a see-through picture stays see-through unless it is faint", () => {
  const soft = { id: "p4", type: "image", position: "front", x: 10, y: 10, width: 50, height: 50, opacity: 0.6 };
  const faint = { ...soft, id: "p5", opacity: 0.2 };
  assert.deepEqual(dtfFixes([soft], positions, opts), []);
  assert.equal(dtfFixes([faint], positions, opts)[0].patch.opacity, 1);
});
