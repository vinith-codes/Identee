// Round 8 (11 Nov 2026): the Assistant's new helpers (studio/assistantExtras.js), the shop's Ask bar
// (utils/shopWish.js) and Tamil words on the tee (studio/fonts.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEEDBACK,
  spotWords,
  spotName,
  changeAtSpot,
  tipAt,
  leftLine,
  nextMicLang,
  MIC_LANGS,
  sizeAnswers,
  orderNo,
  ownDesignId,
  findOrder,
  uploadPath,
  voteFromSheet,
  groupLink,
  voteLeader,
  playersFromEntries,
  qtysFromEntries,
} from "../src/studio/assistantExtras.js";
import { parseWish, wishTries, wishExamples } from "../src/utils/shopWish.js";
import { FONTS, TAMIL_FONTS, hasTamil, textFamily, fontChoices, fontsCssUrl } from "../src/studio/fonts.js";

/* ---------- the chat's helpers ---------- */
test("the feedback chips each say something the Assistant understands as 'show others'", () => {
  assert.equal(FEEDBACK.length, 4);
  for (const f of FEEDBACK) assert.ok(f.label && f.say.length > f.label.length);
});

test("a tapped spot becomes words: the place, and how far in it is", () => {
  assert.equal(spotName(spotWords(0.5, 0.5)), "the centre");
  assert.equal(spotName(spotWords(0.9, 0.1)), "the top right");
  assert.equal(spotName(spotWords(0.1, 0.5)), "the left side");
  assert.equal(spotName(spotWords(0.5, 0.95)), "the bottom");
  assert.match(spotWords(0.9, 0.1), /90% from the left, 10% from the top/);
  assert.match(spotWords(7, -3), /100% from the left, 0% from the top/); // never outside the picture
});

test("a change with a spot asks for that spot only; without one it is left as typed", () => {
  assert.equal(changeAtSpot("make it gold", ""), "make it gold");
  const asked = changeAtSpot("make it gold", spotWords(0.9, 0.1));
  assert.match(asked, /^make it gold — only at this spot of the picture: the top right/);
  assert.match(asked, /Keep everything else exactly the same\.$/);
});

test("the waiting tips change every few seconds and go round", () => {
  const tips = ["a", "b", "c"];
  assert.equal(tipAt(tips, 0), "a");
  assert.equal(tipAt(tips, 6), "a");
  assert.equal(tipAt(tips, 7), "b");
  assert.equal(tipAt(tips, 21), "a");
  assert.equal(tipAt(tips, 0, 2), "c");
  assert.equal(tipAt([], 5), "");
});

test("pictures left today: shown to a signed-in customer only, and never more than the day's number", () => {
  assert.equal(leftLine({ loggedIn: true, available: true, left: 14, dailyPerUser: 20 }), "14 of 20 pictures left today");
  assert.equal(leftLine({ loggedIn: true, available: true, left: 25, dailyPerUser: 20 }), "20 of 20 pictures left today");
  assert.match(leftLine({ loggedIn: true, available: true, left: 0, dailyPerUser: 20 }), /No pictures left today/);
  assert.equal(leftLine({ loggedIn: false, available: true, left: 14, dailyPerUser: 20 }), "");
  assert.equal(leftLine({ loggedIn: true, available: false, left: 14, dailyPerUser: 20 }), "");
  assert.equal(leftLine({ loggedIn: true, available: true, left: null, dailyPerUser: 20 }), "");
  assert.equal(leftLine(null), "");
});

test("the mic's language switches between English and Tamil", () => {
  const keys = MIC_LANGS.map((l) => l.key);
  assert.deepEqual(keys, ["en-IN", "ta-IN"]);
  assert.equal(nextMicLang("en-IN"), "ta-IN");
  assert.equal(nextMicLang("ta-IN"), "en-IN");
  assert.equal(nextMicLang("something else"), "en-IN");
});

test("the size card needs a believable height and weight", () => {
  assert.deepEqual(sizeAnswers({ who: "women", heightCm: "160", weightKg: "55" }), { who: "women", heightCm: 160, weightKg: 55 });
  assert.equal(sizeAnswers({ who: "men", heightCm: 175, weightKg: "" }), null);
  assert.equal(sizeAnswers({ who: "men", heightCm: 17, weightKg: 70 }), null); // 17 cm: a typo
  assert.equal(sizeAnswers({ who: "nobody", heightCm: 175, weightKg: 70 }).who, "men");
});

const order = (no, design) => ({ _id: `64f0000000000000000${no}`, invoiceNumber: `IDT-${no}`, orderItems: [design ? { customization: design } : { product: "p1" }] });

test("'the same tee again' finds the order named, else the newest one with a design of their own", () => {
  const orders = [order("0079", null), order("0078", { _id: "d78" }), order("0076", "d76")];
  assert.equal(orderNo(orders[0]), "IDT-0079");
  assert.equal(ownDesignId(orders[0]), "");
  assert.equal(ownDesignId(orders[1]), "d78");
  assert.equal(ownDesignId(orders[2]), "d76");
  assert.equal(findOrder(orders, null), orders[1]); // the ready-made order is passed over
  assert.equal(findOrder(orders, "0076"), orders[2]);
  assert.equal(findOrder(orders, "idt 0076"), orders[2]);
  assert.equal(findOrder(orders, "0079"), null); // no design of their own in it
  assert.equal(findOrder([], null), null);
});

test("a group link's vote comes from the newest concept sheet, kept only when the picture is ours", () => {
  const sheet = { url: "http://localhost:5099/uploads/ai/sheet-1.png", concepts: [{ n: 1, title: "Lion" }, { n: 2, title: "Tiger" }, { n: 3, title: "Eagle" }] };
  assert.equal(uploadPath(sheet.url), "/uploads/ai/sheet-1.png");
  assert.deepEqual(voteFromSheet(sheet), { picture: "/uploads/ai/sheet-1.png", options: [{ n: 1, title: "Lion" }, { n: 2, title: "Tiger" }, { n: 3, title: "Eagle" }] });
  assert.deepEqual(voteFromSheet({ url: "https://elsewhere.example/x.png", concepts: sheet.concepts }), { picture: "", options: [] });
  assert.deepEqual(voteFromSheet(null), { picture: "", options: [] });
  assert.equal(groupLink("https://identee.co.in/", "abc123"), "https://identee.co.in/g/abc123");
});

test("the concept with the most votes leads; a tie or no votes has no leader", () => {
  assert.equal(voteLeader([{ n: 1, votes: 2 }, { n: 2, votes: 5 }, { n: 3, votes: 1 }]).n, 2);
  assert.equal(voteLeader([{ n: 1, votes: 2 }, { n: 2, votes: 2 }]), null);
  assert.equal(voteLeader([{ n: 1, votes: 0 }, { n: 2, votes: 0 }]), null);
  assert.equal(voteLeader([]), null);
});

test("friends' answers become tees: their name, number and size; an unknown size becomes the size chosen now", () => {
  const entries = [{ name: " Arun ", size: "L", number: "7" }, { name: "Priya", size: "4XL", number: "" }, { name: "  ", size: "M" }];
  assert.deepEqual(playersFromEntries(entries, ["S", "M", "L"], "M"), [
    { name: "Arun", number: "7", size: "L" },
    { name: "Priya", number: "", size: "M" },
  ]);
  assert.deepEqual(qtysFromEntries(entries, ["S", "M", "L"]), { qtys: { L: 1, M: 1 }, skipped: 1 });
  assert.deepEqual(qtysFromEntries([], ["S"]), { qtys: {}, skipped: 0 });
});

/* ---------- the shop's Ask bar ---------- */
const FACETS = {
  colors: ["Black", "Navy Blue", "Royal Blue", "Maroon", "Bottle Green"],
  styles: ["Oversized", "Round Neck"],
  genders: [{ name: "Unisex", count: 30 }, { name: "Men", count: 10 }, { name: "Women", count: 19 }],
  sizes: ["S", "M", "L", "XL", "XXL"],
  priceMin: 499,
  priceMax: 699,
};

test("a wish in plain words becomes the shop's filters, and the rest is searched for", () => {
  const w = parseWish("black anime tee under ₹500", FACETS);
  assert.deepEqual(w.filters, { maxPrice: 500, color: "Black" });
  assert.deepEqual(w.words, ["anime"]);
  assert.deepEqual(w.said, ["under ₹500", "Black", "“anime”"]);
});

test("who it is for, the style and the size are understood", () => {
  const w = parseWish("Oversized t-shirt for women in size L below Rs. 700", FACETS);
  assert.deepEqual(w.filters, { maxPrice: 700, gender: "Women", style: "Oversized", size: "L" });
  assert.deepEqual(w.words, []);
  assert.equal(parseWish("round neck tees for men", FACETS).filters.style, "Round Neck");
  assert.equal(parseWish("round neck tees for men", FACETS).filters.gender, "Men");
  assert.equal(parseWish("an extra large marvel tee", FACETS).filters.size, "XL");
  assert.equal(parseWish("2xl batman", FACETS).filters.size, "XXL"); // the shop calls it XXL
  assert.equal(parseWish("a small one", FACETS).filters.size, "S");
});

test("a colour is a filter only when the shop has exactly one colour by that word", () => {
  assert.equal(parseWish("navy blue tee", FACETS).filters.color, "Navy Blue");
  assert.equal(parseWish("green hero tee", FACETS).filters.color, "Bottle Green");
  const blue = parseWish("blue tee", FACETS); // Navy Blue and Royal Blue: the word is searched for instead
  assert.equal(blue.filters.color, undefined);
  assert.deepEqual(blue.words, ["blue"]);
  const pink = parseWish("pink tee", FACETS); // not in the shop: searched for, and nothing is found
  assert.equal(pink.filters.color, undefined);
  assert.deepEqual(pink.words, ["pink"]);
});

test("'cheap' sorts by price; a gender or size the shop doesn't have is not filtered by", () => {
  assert.equal(parseWish("cheapest black tee", FACETS).filters.sort, "price_asc");
  const few = { ...FACETS, genders: [{ name: "Unisex", count: 3 }], sizes: ["M"] };
  assert.equal(parseWish("tee for women", few).filters.gender, undefined);
  assert.equal(parseWish("size xl tee", few).filters.size, undefined);
});

test("the searches go from strict to loose, and a vague wish makes none", () => {
  const two = wishTries(parseWish("black anime dragon tee", FACETS));
  assert.deepEqual(two.map((t) => t.params), [
    { color: "Black", q: "anime dragon" },
    { color: "Black", q: "anime dragon", any: "1" },
    { color: "Black" },
  ]);
  assert.equal(two[0].note, "");
  assert.match(two[2].note, /anime dragon/);
  assert.deepEqual(wishTries(parseWish("anime", FACETS)).map((t) => t.params), [{ q: "anime" }]);
  assert.deepEqual(wishTries(parseWish("under 600", FACETS)).map((t) => t.params), [{ maxPrice: 600 }]);
  assert.deepEqual(wishTries(parseWish("show me a nice tee please", FACETS)), []);
});

test("the example wishes come from what the shop has, and each one finds a filter", () => {
  const ex = wishExamples(FACETS);
  assert.deepEqual(ex, ["Black oversized tee", "Round neck for women", "Under ₹500"]);
  for (const x of ex) assert.ok(Object.keys(parseWish(x, FACETS).filters).length > 0, x);
  assert.deepEqual(wishExamples({}), []);
});

/* ---------- Tamil words on the tee ---------- */
test("Tamil words are known by their letters", () => {
  assert.equal(hasTamil("வணக்கம்"), true);
  assert.equal(hasTamil("Chennai வணக்கம் 2026"), true);
  assert.equal(hasTamil("Vanakkam"), false);
  assert.equal(hasTamil(""), false);
  assert.equal(hasTamil(null), false);
});

test("Tamil words in an English font get a Tamil font behind it; English words and Tamil fonts stay as they are", () => {
  assert.equal(textFamily({ text: "தமிழ்", fontFamily: "Anton" }), "Anton, Noto Sans Tamil");
  assert.equal(textFamily({ text: "தமிழ்", fontFamily: "Baloo Thambi 2" }), "Baloo Thambi 2");
  assert.equal(textFamily({ text: "TAMIL", fontFamily: "Anton" }), "Anton");
  assert.equal(textFamily({ text: "தமிழ்" }), "Arial, Noto Sans Tamil");
});

test("the font list offers the Tamil fonts first for Tamil words, and only then", () => {
  assert.deepEqual(fontChoices("HELLO", "Anton"), FONTS);
  const tamil = fontChoices("தமிழ்", "Anton");
  assert.deepEqual(tamil.slice(0, 1 + TAMIL_FONTS.length), ["Anton", ...TAMIL_FONTS]);
  assert.equal(new Set(tamil).size, tamil.length);
  assert.equal(tamil.length, FONTS.length + TAMIL_FONTS.length);
});

test("the Tamil fonts are fetched with the others, in regular and bold", () => {
  const url = fontsCssUrl();
  for (const f of [...FONTS, ...TAMIL_FONTS]) assert.ok(url.includes(`family=${f.replace(/ /g, "+")}:wght@400;700`), f);
});
