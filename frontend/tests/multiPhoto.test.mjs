// Several photos in one chat message (studio/multiPhoto.js, 17 Nov 2026): the cap, the free rules, the plan's areas
// and what it uses of today's pictures — decided before anything is made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PHOTOS, roomFor, tooManyLine, picturesNeeded, limitLine, photosFromWords, planPhotos, photoNumberIn, areasIn, makeActFor, noWordsLine } from "../src/studio/multiPhoto.js";
import { AREAS, PHOTO_STYLES, STYLES } from "./helpers.mjs";

const PHOTOS = [1, 2, 3].map((n) => ({ url: `/uploads/designs/p${n}.jpg`, w: 2000, h: 2000 }));
const rules = (text, count = 2) => photosFromWords(text, count, { areas: AREAS, photoStyles: PHOTO_STYLES });

test("the cap: 6 at a time, the rest left out with a plain message", () => {
  assert.equal(MAX_PHOTOS, 6);
  assert.deepEqual(roomFor(0, 4), { take: 4, extra: 0 });
  assert.deepEqual(roomFor(4, 5), { take: 2, extra: 3 });
  assert.deepEqual(roomFor(6, 1), { take: 0, extra: 1 });
  assert.match(tooManyLine(3, 4), /up to 6 photos.*kept the first 2.*left out 3/);
  assert.match(tooManyLine(1, 6), /6 are already waiting/);
});

test("which photo a part of the message is about", () => {
  assert.equal(photoNumberIn("the second one on the back", 3), 2);
  assert.equal(photoNumberIn("photo 3 as a cartoon", 3), 3);
  assert.equal(photoNumberIn("photo 3 as a cartoon", 2), null);
  assert.equal(photoNumberIn("the last one", 3), 3);
  assert.equal(photoNumberIn("my logo", 3), null);
});

test("areas by a word of their name: the chest, the sleeve", () => {
  assert.deepEqual(areasIn("the logo on the chest", AREAS), ["left-chest"]);
  assert.deepEqual(areasIn("on the sleeve", AREAS), ["left-sleeve"]);
  assert.deepEqual(areasIn("on the full back", AREAS), ["full-back"]);
  assert.deepEqual(areasIn("nothing here", AREAS), []);
});

test("rules: 'this logo on the chest and this photo on the back' — each its own place, the logo as it is (free)", () => {
  const r = rules("put this logo on the chest and this photo on the back");
  assert.equal(r.mix, undefined);
  assert.deepEqual(r.items.map((x) => [x.photo, x.job, x.areas[0]]), [[1, "photo", "left-chest"], [2, "photo", "full-back"]]);
  assert.equal(picturesNeeded(r.items), 0);
});

test("rules: ordinals pick the photo, and each part keeps its own wish", () => {
  const r = rules("the second one as a cartoon on the front, the first on the back", 2);
  const byPhoto = Object.fromEntries(r.items.map((x) => [x.photo, x]));
  assert.equal(byPhoto[2].job, "art");
  assert.equal(byPhoto[2].style, "Cartoon");
  assert.equal(byPhoto[2].areas[0], "centre-front");
  assert.equal(byPhoto[1].areas[0], "full-back");
});

test("rules: mixing words ask for one design (the brain's concept sheet)", () => {
  assert.deepEqual(rules("mix these into one design"), { mix: true });
  assert.deepEqual(rules("combine them"), { mix: true });
  assert.deepEqual(rules("copy this tee's style using my photo, in the style of the first"), { mix: true });
});

test("rules: no clear words — every photo on its own place, background removed, free", () => {
  const r = rules("", 3);
  assert.equal(r.items.length, 3);
  assert.ok(r.items.every((x) => x.job === "photo" && x.cutOut && !x.skip));
  const cartoons = rules("make them cartoons", 2);
  assert.ok(cartoons.items.every((x) => x.job === "art" && x.style === "Cartoon"));
});

test("rules: a photo the words don't mention is shown unticked", () => {
  const r = rules("the first on the back", 3);
  assert.deepEqual(r.items.map((x) => [x.photo, !!x.skip]), [[1, false], [2, true], [3, true]]);
});

test("plan: each photo its own free area, never two on one", () => {
  const p = planPhotos({ items: [{ photo: 1, job: "photo", areas: ["full-back"] }, { photo: 2, job: "copy", areas: ["full-back"] }, { photo: 3, job: "art", style: "Sketch" }], photos: PHOTOS, areas: AREAS, styles: STYLES, photoStyles: PHOTO_STYLES });
  const keys = p.items.map((x) => x.areaKeys[0]);
  assert.equal(keys[0], "full-back");
  assert.equal(new Set(keys).size, 3, `all different: ${keys}`);
  assert.equal(p.items[2].style, "Sketch");
  assert.equal(p.need, 2); // the copy and the art; the photo itself is free
});

test("plan: the same photo asked the same way twice is made once, on both areas", () => {
  const p = planPhotos({ items: [{ photo: 1, job: "copy", areas: ["centre-front"] }, { photo: 1, job: "copy", areas: ["full-back"] }], photos: PHOTOS, areas: AREAS });
  assert.equal(p.items.length, 1);
  assert.deepEqual(p.items[0].areaKeys, ["centre-front", "full-back"]);
  assert.equal(p.need, 1);
});

test("plan: the page's overlap rule is used; photo numbers out of range are dropped", () => {
  // centre front and left chest overlap on this garment
  const fits = (k, taken) => !taken.includes(k) && !(k === "left-chest" && taken.includes("centre-front")) && !(k === "centre-front" && taken.includes("left-chest"));
  const p = planPhotos({ items: [{ photo: 1, job: "photo", areas: ["centre-front"] }, { photo: 2, job: "photo", areas: ["left-chest"] }, { photo: 9, job: "photo" }], photos: PHOTOS, areas: AREAS, fits });
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].areaKeys[0], "centre-front");
  assert.notEqual(p.items[1].areaKeys[0], "left-chest");
});

test("today's pictures: said plainly before making", () => {
  assert.match(limitLine(0, 3), /All free/);
  assert.match(limitLine(2, 5), /Uses 2 .*5 left/);
  assert.match(limitLine(3, 2), /needs 3 pictures and you have 2 left today\. Leave one out/);
  assert.match(limitLine(1, 0), /used up/);
  assert.equal(picturesNeeded([{ job: "photo" }, { job: "photo", enhance: true }, { job: "copy" }, { job: "art", skip: true }]), 2);
});

test("a plan row becomes the one-photo act, carrying its own photo", () => {
  const p = planPhotos({ items: [{ photo: 2, job: "inspired", areas: ["full-back"], subject: "a tiger" }], photos: PHOTOS, areas: AREAS, styles: STYLES });
  const a = makeActFor(p.items[0]);
  assert.equal(a.type, "photoMake");
  assert.equal(a.photo.url, PHOTOS[1].url);
  assert.deepEqual(a.areaKeys, ["full-back"]);
  assert.equal(a.subject, "a tiger");
  assert.equal(a.style, STYLES[0]);
  assert.match(noWordsLine(3), /3 pictures/);
});

test("the brain reads several photos and their plan in the chat history", async () => {
  const { toHistory } = await import("../src/studio/chatStore.js");
  assert.deepEqual(toHistory({ from: "me", photos: PHOTOS.slice(0, 2), text: "logo on the chest" }), { who: "customer", text: "(sent 2 photos) logo on the chest" });
  assert.deepEqual(toHistory({ from: "me", photo: PHOTOS[0] }), { who: "customer", text: "(sent a photo)" }); // one photo: as before
  const plan = planPhotos({ items: [{ photo: 1, job: "photo", areas: ["left-chest"] }, { photo: 2, job: "art", areas: ["full-back"], skip: true }], photos: PHOTOS, areas: AREAS, photoStyles: PHOTO_STYLES });
  assert.match(toHistory({ photosPlan: plan }).text, /photo 1: photo on left-chest \| photo 2: not used/);
});
