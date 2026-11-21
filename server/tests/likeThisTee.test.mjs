// "Design a t-shirt like this" (21 Nov 2026): a picture of a whole tee is shown to the brain, read print by print
// (front, back, each sleeve) and made into concepts LIKE it — the picture goes to the sheet and the pieces as a
// reference, not as a logo. A photo sent a message earlier still counts (photoEarlier). Sheets fill the frame.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanBrainAnswer, brainReply, pictureRules, PIECES, TEE_PHOTO_CHOICES } from "../services/assistantBrain.js";
import { sheetPrompt, developPrompt, conceptWords, piecesOf, pieceRatio, matchPrompt } from "../services/conceptSheets.js";

const areas = [
  { key: "centre-front", label: "Centre front", free: true },
  { key: "full-back", label: "Full back", free: true },
  { key: "left-sleeve", label: "Left sleeve", free: true },
  { key: "right-sleeve", label: "Right sleeve", free: true },
];
const styles = ["Bold mascot", "Cartoon"];
const conceptsStep = (extra = {}) => ({
  reply: "x",
  steps: [{ type: "concepts", reference: true, logo: true, concepts: [{ title: "Close copy", front: "ID logo on the left chest", back: "IDENTEE down the back", sleeve: "words on the left sleeve", sleeve2: "band on the outside of the right sleeve" }, { title: "Red", front: "same in red" }], ...extra }],
});

test("the right sleeve is a piece of its own", () => {
  assert.deepEqual(PIECES, ["front", "back", "sleeve", "sleeve2"]);
  assert.deepEqual(piecesOf({ front: "a", sleeve: "b", sleeve2: "c" }), ["front", "sleeve", "sleeve2"]);
  assert.equal(pieceRatio("sleeve2"), "3:4");
  assert.equal(pieceRatio("sleeve2", "1:2"), "1:2");
});

test("a reference sheet is kept only when a picture came with the message (and it is never a logo sheet)", () => {
  const withPic = cleanBrainAnswer(conceptsStep(), { areas, styles, sheets: [], picture: true }).steps[0];
  assert.equal(withPic.reference, true);
  assert.equal(withPic.logo, false);
  assert.equal(withPic.concepts[0].sleeve, "words on the left sleeve");
  assert.equal(withPic.concepts[0].sleeve2, "band on the outside of the right sleeve");
  const noPic = cleanBrainAnswer(conceptsStep(), { areas, styles, sheets: [], picture: false }).steps[0];
  assert.equal(Boolean(noPic.reference), false);
  // a right sleeve with no left sleeve is just "the sleeve"
  const lone = cleanBrainAnswer({ reply: "x", steps: [{ type: "concepts", concepts: [{ title: "A", front: "a", sleeve2: "only right" }, { title: "B", front: "b" }] }] }, { areas, styles, sheets: [] }).steps[0];
  assert.equal(lone.concepts[0].sleeve, "only right");
  assert.equal(lone.concepts[0].sleeve2 || null, null);
});

test("the picture rules: read every print, copy the whole tee, DTF limits, and an earlier photo is not dropped", () => {
  const now = pictureRules({ url: "/uploads/a.jpg", about: "design a t-shirt like this", image: { data: "x" } });
  assert.match(now, /WITH THIS MESSAGE/);
  assert.match(now, /the image above/);
  assert.match(now, /reference: true/);
  assert.match(now, /read EVERY print/i);
  assert.match(now, /sleeve2 = the right one/);
  assert.match(now, /stops just short of the edge/);
  assert.match(now, /Leave out the label inside the neck/);
  const earlier = pictureRules({ url: "/uploads/a.jpg", about: "", earlier: true });
  assert.match(earlier, /earlier in this chat and it is NOT used yet/);
  assert.match(earlier, /Never fall back to an older topic/);
  assert.doesNotMatch(earlier, /the image above/);
});

test("mock brain: a whole-tee picture + 'like this' (or 'new inspired designs') gives a reference sheet with both sleeves", async () => {
  process.env.AI_CHAT_PROVIDER = "mock";
  try {
    for (const message of ["design a t-shirt like this", "New inspired designs"]) {
      const r = await brainReply({ message, areas, styles, attached: { url: "/uploads/tee.jpg", about: "", earlier: message !== "design a t-shirt like this" } });
      const st = r.steps.find((s) => s.type === "concepts");
      assert.ok(st, message);
      assert.equal(st.reference, true);
      assert.equal(st.logo, false);
      assert.equal(st.concepts.length, 3);
      assert.ok(st.concepts.every((c) => c.front && c.back && c.sleeve && c.sleeve2));
    }
    // no picture: "like this" is not a reference sheet
    const none = await brainReply({ message: "design a t-shirt like this", areas, styles });
    assert.ok(!none.steps.some((s) => s.reference));
  } finally {
    delete process.env.AI_CHAT_PROVIDER;
  }
});

test("the sheet: tees fill the frame, small numerals, both sleeves named; the reference line only with a picture", () => {
  const concepts = [{ title: "A", front: "logo", sleeve: "words", sleeve2: "band" }, { title: "B", front: "x" }, { title: "C", front: "y" }];
  const p = sheetPrompt({ concepts, reference: true });
  assert.match(p, /FILL THE FRAME/);
  assert.match(p, /about 80% of its height/);
  assert.match(p, /no taller than one-tenth/);
  assert.match(p, /left sleeve, right sleeve/);
  assert.match(p, /EXACTLY/);
  assert.match(conceptWords(concepts[0]), /left sleeve: words.*right sleeve: band/);
  assert.doesNotMatch(sheetPrompt({ concepts }), /EXACTLY/);
});

test("a piece: the right sleeve is named, and the reference tee goes along only when it is not a logo sheet", () => {
  const concept = { title: "A", front: "logo", sleeve: "words", sleeve2: "band" };
  const right = developPrompt({ concept, n: 1, piece: "sleeve2", reference: true });
  assert.match(right, /right sleeve/);
  assert.match(right, /second attached image is the t-shirt/);
  const left = developPrompt({ concept, n: 1, piece: "sleeve" });
  assert.match(left, /left sleeve/);
  assert.doesNotMatch(left, /second attached image is the t-shirt/);
  assert.doesNotMatch(developPrompt({ concept, n: 1, piece: "front", reference: true, logo: true }), /second attached image is the t-shirt/);
  // one sleeve only: still just "sleeve"
  assert.doesNotMatch(developPrompt({ concept: { title: "B", front: "x", sleeve: "y" }, n: 2, piece: "sleeve" }), /left sleeve/);
  assert.match(matchPrompt({ piece: "sleeve2" }), /right sleeve/);
});

// (21 Nov 2026) "like this" (a copy) and "new inspired designs" (new designs with its feel) are two different sheets
test("inspired is kept only on a reference sheet; the rules name both ways", () => {
  const step = (raw) => cleanBrainAnswer({ reply: "x", steps: [{ type: "concepts", concepts: [{ title: "A", front: "a" }, { title: "B", front: "b" }], ...raw }] }, { areas, styles, sheets: [], picture: true }).steps[0];
  assert.equal(step({ reference: true, inspired: true }).inspired, true);
  assert.equal(Boolean(step({ reference: true }).inspired), false);
  assert.equal(Boolean(step({ inspired: true }).inspired), false); // no reference: no inspired
  const rules = pictureRules({ url: "/uploads/a.jpg", about: "" });
  assert.match(rules, /NEW DESIGNS INSPIRED BY IT[\s\S]*inspired: true/);
  assert.match(rules, /Never its logo or brand words/);
  assert.match(rules, /ONE LIKE IT[\s\S]*inspired: false/);
});

test("mock brain: 'new inspired designs' → an inspired sheet; 'like this' → a copy sheet", async () => {
  process.env.AI_CHAT_PROVIDER = "mock";
  try {
    const attached = { url: "/uploads/tee.jpg", about: "" };
    const ins = (await brainReply({ message: "New inspired designs", areas, styles, attached })).steps.find((s) => s.type === "concepts");
    assert.equal(ins.inspired, true);
    assert.match(ins.concepts[0].title, /inspired/);
    const copy = (await brainReply({ message: "design a t-shirt like this", areas, styles, attached })).steps.find((s) => s.type === "concepts");
    assert.equal(Boolean(copy.inspired), false);
    assert.match(copy.concepts[0].front, /as in the picture/);
  } finally {
    delete process.env.AI_CHAT_PROVIDER;
  }
});

test("the sheet: inspired asks for new designs (no copying); the copy sheet copies; both keep the printing limits", () => {
  const concepts = [{ title: "A", front: "x" }, { title: "B", front: "y" }, { title: "C", front: "z" }];
  const ins = sheetPrompt({ concepts, reference: true, inspired: true });
  assert.match(ins, /ONLY as inspiration/);
  assert.match(ins, /do not copy the picture's artwork, logo or brand words/);
  assert.doesNotMatch(ins, /stays EXACTLY as it is/);
  assert.match(ins, /stops a little short of the collar/);
  const copy = sheetPrompt({ concepts, reference: true });
  assert.match(copy, /Copy its layout and look/);
  assert.doesNotMatch(copy, /ONLY as inspiration/);
  assert.match(copy, /stops a little short of the collar/);
  // inspired alone (no reference picture) adds nothing
  assert.doesNotMatch(sheetPrompt({ concepts, inspired: true }), /inspiration/);
});

// (21 Nov 2026, real test): vague lettering ("stencil typography") was printed as the words; titles/labels took space
test("lettering needs its exact words; the sheet has no titles or labels and never prints a description", () => {
  const rules = pictureRules({ url: "/uploads/a.jpg", about: "" });
  assert.match(rules, /every print with lettering gives its EXACT words in quotes/);
  assert.match(rules, /say so \("brush strokes, no words"\)/);
  const two = sheetPrompt({ concepts: [{ title: "A", front: "x", sleeve: "a", sleeve2: "b" }, { title: "B", front: "y" }, { title: "C", front: "z" }] });
  assert.match(two, /no titles, no concept names, no captions, no "FRONT" \/ "BACK" labels/);
  assert.match(two, /tiny "L" and "R"/);
  assert.match(two, /Only words given in quotes are printed/);
  assert.match(two, /never print a description/);
  assert.doesNotMatch(sheetPrompt({ concepts: [{ title: "A", front: "x", sleeve: "a" }, { title: "B", front: "y" }] }), /tiny "L"/);
});

test("the sheet shows each sleeve inset once and draws no neck label or tags", () => {
  const p = sheetPrompt({ concepts: [{ title: "A", front: "x", sleeve: "a", sleeve2: "b" }, { title: "B", front: "y" }, { title: "C", front: "z" }] });
  assert.match(p, /each sleeve inset shown ONCE per concept/);
  assert.match(p, /Draw no neck label, size tag, hem tag or brand tab/);
});

// (21 Nov 2026) a tee photo with unclear words: always the same two buttons, and each button leads its own way
test("tee photo, unclear words: two fixed buttons; tapping each one gives the copy or the inspired sheet", async () => {
  assert.deepEqual(TEE_PHOTO_CHOICES, ["Make one like this", "New designs inspired by it"]);
  const rules = pictureRules({ url: "/uploads/a.jpg", about: "" });
  assert.match(rules, /never print the photo of the tee itself as it is/);
  assert.ok(rules.includes(JSON.stringify(TEE_PHOTO_CHOICES)));
  process.env.AI_CHAT_PROVIDER = "mock";
  try {
    const attached = { url: "/uploads/tee.jpg", about: "" };
    const ask = (await brainReply({ message: "hmm", areas, styles, attached })).steps[0];
    assert.equal(ask.type, "ask");
    assert.deepEqual(ask.options, TEE_PHOTO_CHOICES);
    const waiting = { ...attached, earlier: true };
    const copy = (await brainReply({ message: TEE_PHOTO_CHOICES[0], areas, styles, attached: waiting })).steps.find((s) => s.type === "concepts");
    assert.equal(copy.reference, true);
    assert.equal(Boolean(copy.inspired), false);
    const ins = (await brainReply({ message: TEE_PHOTO_CHOICES[1], areas, styles, attached: waiting })).steps.find((s) => s.type === "concepts");
    assert.equal(ins.inspired, true);
  } finally {
    delete process.env.AI_CHAT_PROVIDER;
  }
});

test("a laid-out side is drawn with every part where it sits, for the whole print area (not large and centred)", () => {
  const concept = { title: "A", front: "small logo on the left chest, brush strokes from the hem", back: "x" };
  const laid = developPrompt({ concept, n: 1, piece: "front", layout: true });
  assert.match(laid, /the whole front print area of the tee, edge to edge/);
  assert.match(laid, /do NOT gather them in the middle/);
  assert.doesNotMatch(laid, /large and centred/);
  assert.match(developPrompt({ concept, n: 1, piece: "front" }), /large and centred/);
});
