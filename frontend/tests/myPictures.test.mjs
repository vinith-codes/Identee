// "My pictures" (23 Oct 2026): which typed messages open the customer's earlier pictures (free, no AI), and which
// pictures come first for the words they typed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstState, replyTo, smartCanAnswer, wantsMyPictures } from "../src/studio/assistantScript.js";
import { matchPictures, pictureLabel } from "../src/studio/pictureHelpers.js";
import { makeCtx } from "./helpers.mjs";

test("asking for earlier pictures opens My pictures", () => {
  for (const t of ["My pictures", "use my lion from before", "show my old designs", "my pictures please", "the tiger I made yesterday", "show my photos"]) assert.equal(wantsMyPictures(t), true, t);
});

test("the Assistant's own buttons and normal requests don't", () => {
  for (const t of ["Check my design", "Add to my design", "Continue my design", "put my photo on the back", "draw a lion", "make it bigger"]) assert.equal(wantsMyPictures(t), false, t);
});

test("it is answered at once, without the smart chat", () => {
  const ctx = makeCtx({ ai: { smart: true } });
  assert.equal(smartCanAnswer("use my lion from before", ctx, firstState()), false);
  const { out } = replyTo("use my lion from before", ctx, firstState());
  const card = out.find((m) => m.mypics);
  assert.ok(card);
  assert.equal(card.find, "use my lion from before");
});

test("a visitor is asked to log in first", () => {
  const { out } = replyTo("My pictures", makeCtx({ ai: { loggedIn: false } }), firstState());
  assert.equal(out.some((m) => m.mypics), false);
  assert.ok(out.some((m) => m.chips?.includes("Log in")));
});

test("matching pictures come first, the rest after", () => {
  const pics = [
    { id: "1", kind: "ai", about: "a retro sunset", style: "Retro badge" },
    { id: "2", kind: "ai", about: "a lion with a crown", style: "Bold mascot" },
    { id: "3", kind: "photo", about: "college logo", style: "" },
  ];
  assert.deepEqual(matchPictures(pics, "use my lion from before").map((p) => p.id), ["2", "1", "3"]);
  assert.deepEqual(matchPictures(pics, "my college logo").map((p) => p.id), ["3", "1", "2"]);
  assert.deepEqual(matchPictures(pics, "my pictures").map((p) => p.id), ["1", "2", "3"]);
  assert.equal(pictureLabel(pics[1]), "A lion with a crown");
  assert.equal(pictureLabel(pics[2]), "College logo");
  assert.equal(pictureLabel({ kind: "photo", about: "" }), "Your photo");
});
