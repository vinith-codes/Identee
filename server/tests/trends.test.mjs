// "Trending now" / the GTA Studio (23 Nov 2026): the mockup's three options, and the words the picture AI gets for the
// sheet and for the picked option's pieces (services/trends.js). The sheet is made by POST /api/ai/concepts with
// { trend, photoUrl }, the pieces by POST /api/ai/develop with { trend, photoUrl }.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_TREND, publicTrend, trendConcepts, trendLikenessLine, trendPiecePrompt, trendSheetLine } from "../services/trends.js";

const NO_GAME = (words) => assert.ok(!/GTA|Grand Theft|Vice City/i.test(words), "no game's name in the instruction");

test("the first trend is GTA style, switched on, with a scene of its own", () => {
  assert.equal(FIRST_TREND.key, "gta");
  assert.equal(FIRST_TREND.name, "GTA style");
  assert.equal(FIRST_TREND.active, true);
  assert.ok(FIRST_TREND.look.length > 40 && FIRST_TREND.setting.length > 40);
  NO_GAME(FIRST_TREND.look + FIRST_TREND.setting);
});

// (23 Nov 2026, the owner: the front is the trend's own logo on every tee — the photo makes the BACK)
test("the mockup shows three BACK designs: the poster, just the person, the cover of panels — the front is left to the trend's own picture", () => {
  const c = trendConcepts(FIRST_TREND);
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.poster), [["back"], [], ["back"]]);
  assert.ok(c.every((x) => !x.front && x.back), "every option is a back, none draws a front");
  assert.match(c[1].back, /only them with no background/);
  assert.match(c[2].back, /picture panels/);
  assert.equal(new Set(c.map((x) => x.title)).size, 3, "three different names (the pick is matched by its name)");
  // each option's words fit what the sheet keeps of them (300 letters), and print no words
  for (const x of c) for (const side of ["front", "back"]) assert.ok((x[side] || "").length <= 300 && !/"/.test(x[side] || ""), `${x.title} ${side}`);
});

test("a trend with no scene has no poster: the person alone, three ways", () => {
  const c = trendConcepts({ ...FIRST_TREND, setting: "" });
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.poster.length === 0));
  assert.ok(c.every((x) => !/poster/.test(`${x.front} ${x.back}`)));
  assert.ok(c.every((x) => !x.front && x.back), "backs only");
});

test("a trend's sheet shows each tee once, from the back, and names no front", async () => {
  const { sheetPrompt } = await import("../services/conceptSheets.js");
  const concepts = trendConcepts(FIRST_TREND);
  const p = sheetPrompt({ concepts, teeColour: "Black", teeIsDark: true, backOnly: true });
  assert.match(p, /seen from the BACK only/);
  assert.ok(!/front: nothing/.test(p) && !/from the front and from the back/.test(p));
  assert.match(sheetPrompt({ concepts: [{ title: "A", front: "a star", back: "" }, { title: "B", front: "a moon", back: "" }] }), /from the front and from the back/, "every other sheet is as it was");
});

test("the sheet: the attached photo's people, recognisable, in the trend's look — only in the artwork, with the scene said once", () => {
  const line = trendSheetLine(FIRST_TREND);
  assert.ok(line.includes(FIRST_TREND.look) && line.includes(FIRST_TREND.setting));
  assert.match(line, /customer's own photo/);
  assert.match(line, /recognisable/);
  assert.match(line, /never as a model wearing a tee/);
  NO_GAME(line);
  assert.ok(!trendSheetLine({ ...FIRST_TREND, setting: "" }).includes("scene of every poster"));
});

test("a poster piece is the whole picture: edge to edge, no key colour (it is never cut out), drawn from the sheet and the photo", () => {
  const c = trendConcepts(FIRST_TREND)[0];
  const p = trendPiecePrompt({ trend: FIRST_TREND, concept: c, n: 2, piece: "back", poster: true });
  assert.match(p, /concept 2/);
  assert.match(p, /on the back/);
  assert.match(p, /filling the whole frame edge to edge/);
  assert.ok(!/magenta/i.test(p), "no cut-out background");
  assert.match(p, /second attached image is the customer's own photo/);
  assert.ok(p.includes(FIRST_TREND.look) && p.includes(FIRST_TREND.setting));
  NO_GAME(p);
  assert.equal(trendPiecePrompt({ trend: FIRST_TREND, concept: c, n: 2, piece: "front", poster: false }), null, "the person alone uses the usual piece instruction");
});

test("the person alone: the likeness line, with no pink or purple light (the cut-out's key colour)", () => {
  const line = trendLikenessLine(FIRST_TREND);
  assert.match(line, /recognisable/);
  assert.match(line, /no pink, magenta or purple/i);
  assert.ok(line.includes(FIRST_TREND.look));
});

test("the shop gets the name and pictures of a trend, never the AI's words", () => {
  const pub = publicTrend({ ...FIRST_TREND, example: "/uploads/designs/x.png", _id: "1" });
  assert.deepEqual(pub, { key: "gta", name: "GTA style", example: "/uploads/designs/x.png", before: "", scene: true, colours: ["black", "white"], front: "", backs: [] });
  assert.equal(publicTrend({ ...FIRST_TREND, setting: "" }).scene, false);
});

test("a trend carries its tee colours, its fixed front picture and its ready-made backs", () => {
  assert.deepEqual(FIRST_TREND.colours, ["black", "white"]);
  const pub = publicTrend({ ...FIRST_TREND, front: "/uploads/designs/logo.png", backs: [{ url: "/uploads/designs/b1.png", name: "Duo" }, { name: "no picture" }] });
  assert.equal(pub.front, "/uploads/designs/logo.png");
  assert.deepEqual(pub.backs, [{ url: "/uploads/designs/b1.png", name: "Duo" }]);
});
