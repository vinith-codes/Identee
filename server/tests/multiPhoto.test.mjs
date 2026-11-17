// Several photos in one Assistant message (17 Nov 2026): the brain's "photos" step and a concept sheet that mixes
// the pictures — only real pictures, jobs, areas and styles pass; the stand-in brain asks when the words don't say.
import test from "node:test";
import assert from "node:assert/strict";
import { brainReply, cleanBrainAnswer, MAX_PHOTOS } from "../services/assistantBrain.js";
import { developPrompt, sheetPrompt } from "../services/conceptSheets.js";

process.env.AI_CHAT_PROVIDER = "mock";
const areas = [
  { key: "centre-front", label: "Centre front", free: true },
  { key: "left-chest", label: "Left chest", free: true },
  { key: "full-back", label: "Full back", free: true },
  { key: "left-sleeve", label: "Left sleeve", free: true },
];
const styles = ["Bold mascot", "Cartoon"];
const photoStyles = ["Cartoon", "Sketch"];
const photos = (n) => Array.from({ length: n }, (_, i) => ({ url: `/uploads/designs/p${i + 1}.jpg`, about: "" }));

test("a photos step: real pictures, jobs, areas and styles only; the same ask twice is one item", () => {
  const r = cleanBrainAnswer(
    {
      reply: "Your logo on the chest and your dog as a cartoon on the back.",
      steps: [
        {
          type: "photos",
          items: [
            { photo: 1, job: "photo", areas: ["left-chest", "nowhere"], cutOut: true },
            { photo: 2, job: "art", style: "Cartoon", areas: ["full-back"] },
            { photo: 2, job: "art", style: "Cartoon", areas: ["left-sleeve"] },
            { photo: 3, job: "copy" }, // only 2 pictures were sent
            { photo: 1, job: "teleport", areas: ["centre-front"] },
          ],
        },
      ],
    },
    { areas, styles, photoCount: 2, photoStyles },
  );
  const items = r.steps[0].items;
  assert.equal(r.steps[0].type, "photos");
  // (an unknown job becomes the photo itself, free — the same ask as the first item, so it is merged into it)
  assert.deepEqual(items.map((x) => [x.photo, x.job, x.areas]), [[1, "photo", ["left-chest", "centre-front"]], [2, "art", ["full-back", "left-sleeve"]]]);
  assert.equal(items[1].style, "Cartoon");
});

test("no photos sent: a photos step is dropped; a concept sheet keeps the pictures it mixes", () => {
  assert.equal(cleanBrainAnswer({ reply: "x", steps: [{ type: "photos", items: [{ photo: 1, job: "photo" }] }] }, { areas, styles }).steps.length, 0);
  const r = cleanBrainAnswer({ reply: "x", steps: [{ type: "concepts", photos: [2, 1, 2, 7], concepts: [{ title: "A", front: "picture 2 in the style of picture 1" }, { title: "B", front: "both" }] }] }, { areas, styles, photoCount: 2 });
  assert.deepEqual(r.steps[0].photos, [2, 1]);
  assert.equal(r.steps[0].logo, true);
});

test("the stand-in brain: places said → a plan; mixing words → one sheet from all; no words → it asks", async () => {
  const plan = await brainReply({ message: "put this logo on the chest and this photo on the back", areas, styles, photoStyles, photos: photos(2) });
  assert.equal(plan.steps[0].type, "photos");
  assert.deepEqual(plan.steps[0].items.map((x) => [x.photo, x.areas[0]]), [[1, "left-chest"], [2, "full-back"]]);
  const mix = await brainReply({ message: "mix these into one design", areas, styles, photoStyles, photos: photos(3) });
  assert.equal(mix.steps[0].type, "concepts");
  assert.deepEqual(mix.steps[0].photos, [1, 2, 3]);
  const ask = await brainReply({ message: "I attached 2 pictures — use them on my tee.", areas, styles, photoStyles, photos: photos(2) });
  assert.equal(ask.steps[0].type, "ask");
  assert.ok(ask.chips.includes("Mix them into one design"));
});

test("one picture works exactly as before (attached, no photos step)", async () => {
  const one = await brainReply({ message: "use our logo on the tees", areas, styles, attached: { url: "/uploads/x.png", about: "our logo" }, photos: photos(1) });
  assert.equal(one.steps[0].type, "concepts");
  assert.equal(one.steps[0].photos, undefined);
  assert.equal(MAX_PHOTOS, 6);
});

test("the picture instructions number the customer's pictures", () => {
  const c = [{ title: "A", front: "picture 2 in the style of picture 1" }, { title: "B", front: "x" }];
  assert.match(sheetPrompt({ concepts: c, pictures: 3 }), /3 attached images are the customer's own pictures, picture 1 to picture 3/);
  assert.doesNotMatch(sheetPrompt({ concepts: c, logo: true }), /picture 1 to/);
  assert.match(developPrompt({ concept: c[0], n: 1, piece: "front", pictures: 2 }), /After the concept sheet, the next 2 attached images/);
});
