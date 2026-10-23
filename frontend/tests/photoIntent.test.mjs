// What the free rules read from a customer's words about a photo they sent (studio/photoIntent.js), 23 Oct 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { photoJobFrom, areasFromWords, areaFromWords, SAME_THEME } from "../src/studio/photoIntent.js";
import { AREAS, PHOTO_STYLES } from "./helpers.mjs";

const job = (text) => photoJobFrom(text, { areas: AREAS, photoStyles: PHOTO_STYLES });

test("areas named in the words, in the order written", () => {
  assert.deepEqual(areasFromWords("on the full back and the left chest", AREAS), ["full-back", "left-chest"]);
  assert.equal(areaFromWords("put it on the back", AREAS), "full-back");
  assert.equal(areaFromWords("no area here", AREAS), null);
});

test("copy: only the design / the same design / copy this", () => {
  for (const t of ["I want only the design", "same design please", "copy this", "the print on this tee"]) assert.equal(job(t)?.job, "copy", t);
});

test("copy with a change keeps the change", () => {
  const r = job("same design but change the name to RAJ");
  assert.equal(r.job, "copy");
  assert.match(r.change, /RAJ/);
});

test("inspired: like this but with something new", () => {
  const r = job("something like this but with a tiger");
  assert.equal(r.job, "inspired");
  assert.equal(r.subject, "tiger");
});

test("art: the photo redrawn in a style", () => {
  assert.deepEqual([job("my dog as a cartoon")?.job, job("my dog as a cartoon")?.style], ["art", "Cartoon"]);
  assert.equal(job("make it a pencil sketch")?.style, "Sketch");
});

test("photo: printed itself, with or without its background", () => {
  assert.deepEqual([job("print my photo as it is")?.job, job("print my photo as it is")?.cutOut], ["photo", false]);
  assert.deepEqual([job("remove the background")?.job, job("remove the background")?.cutOut], ["photo", true]);
});

test("add this to my tee on the back", () => {
  const r = job("add this to my tee on the back");
  assert.equal(r.job, "add");
  assert.equal(r.areaKey, "full-back");
});

/* ---------- 23 Oct 2026: a reference photo makes a NEW design; only clear words make a copy ---------- */

test("a design like this / similar / reference / in this style → a new design on the same theme", () => {
  for (const t of ["make a design like this", "I want something similar", "use this as reference", "make one in this style", "based on this, make my tee", "inspired by this", "same vibe for my tee", "design like this for my cricket team"]) {
    const r = job(t);
    assert.equal(r?.job, "inspired", t);
    assert.equal(r.subject, SAME_THEME, t);
  }
});

test("clear words still make a copy", () => {
  for (const t of ["same design like this", "copy this exactly", "exactly like this", "I want this exact design", "recreate this print", "only the design please"]) assert.equal(job(t)?.job, "copy", t);
});

test("like this but with a tiger keeps the new subject", () => {
  const r = job("make a design like this but with a tiger");
  assert.equal(r.job, "inspired");
  assert.equal(r.subject, "tiger");
});

test("the photo itself is not a reference: as it is / like it is", () => {
  assert.equal(job("print my photo as it is")?.job, "photo");
  assert.equal(job("print my photo like it is")?.job, "photo");
});

test("an art style named still redraws the photo", () => {
  assert.equal(job("make it like this as a cartoon")?.job, "art");
});

test("unclear words return nothing (the Assistant asks)", () => {
  assert.equal(job("hmm"), null);
});
