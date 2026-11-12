// The group link (Assistant round 8, 11 Nov 2026): what a friend may send, and what anyone with the link may see.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanEntry, cleanGroup, MAX_ENTRIES, publicView, tally } from "../services/groupPoll.js";

const poll = {
  token: "abcDEF123456",
  title: "CSE-B farewell tees",
  garment: "Oversized Tee",
  picture: "/uploads/ai/sheet.png",
  options: [{ n: 1, title: "Night Rider" }, { n: 2, title: "Loud & Proud" }],
  sizes: ["S", "M", "L", "XL"],
  askNumber: true,
  closedAt: null,
  entries: [
    { key: "k1", name: "Arun", size: "M", number: "7", vote: 1 },
    { key: "k2", name: "Divya", size: "S", number: "", vote: 2 },
    { key: "k3", name: "Kavin", size: "L", number: "10", vote: 1 },
  ],
};

test("the votes are counted per choice", () => {
  assert.deepEqual(tally(poll), { count: 3, options: [{ n: 1, title: "Night Rider", votes: 2 }, { n: 2, title: "Loud & Proud", votes: 1 }] });
});

test("the public page never carries the friends' names or their keys", () => {
  const seen = JSON.stringify(publicView(poll));
  for (const secret of ["Arun", "Divya", "Kavin", "k1", "k2", "entries"]) assert.equal(seen.includes(secret), false, secret);
  assert.equal(publicView(poll).count, 3);
  assert.equal(publicView(poll).closed, false);
  assert.equal(publicView({ ...poll, closedAt: new Date() }).closed, true);
  assert.equal(publicView({ ...poll, entries: Array.from({ length: MAX_ENTRIES }, () => ({ vote: 1 })) }).full, true);
});

test("a friend's answer is checked against the link's own sizes and choices", () => {
  assert.deepEqual(cleanEntry({ name: "  Mani   Kumar ", size: "XL", number: "No. 23!", vote: "2" }, poll), {
    entry: { name: "Mani Kumar", size: "XL", number: "23", vote: 2 },
  });
  assert.equal(cleanEntry({ name: " ", size: "M", vote: 1 }, poll).error, "Please type your name.");
  assert.equal(cleanEntry({ name: "Mani", size: "6XL", vote: 1 }, poll).error, "Please pick your size.");
  assert.equal(cleanEntry({ name: "Mani", size: "M", vote: 9 }, poll).error, "Please pick the design you like.");
  // a long name is cut, a long number too
  const long = cleanEntry({ name: "x".repeat(80), size: "M", number: "123456789", vote: 1 }, poll).entry;
  assert.equal(long.name.length, 24);
  assert.equal(long.number, "1234");
  // a link that asks for no number and has nothing to vote on
  const plain = { ...poll, askNumber: false, options: [] };
  assert.deepEqual(cleanEntry({ name: "Mani", size: "M", number: "9", vote: 1 }, plain), { entry: { name: "Mani", size: "M", number: "", vote: null } });
});

test("a new link keeps only our own pictures, and only votes when there is a picture", () => {
  const body = {
    title: "  Class   tees ",
    garment: "Oversized Tee",
    picture: "https://evil.example/x.png",
    options: [{ n: 1, title: "One" }, { n: "x", title: "bad" }, { n: 2, title: "Two" }],
    sizes: ["S", "M", "M", "", "L"],
    askNumber: 1,
  };
  const ours = (url) => url.startsWith("/uploads/");
  const out = cleanGroup(body, { ourUpload: ours });
  assert.equal(out.title, "Class tees");
  assert.equal(out.picture, "");
  assert.deepEqual(out.options, []); // no picture, so nothing to vote on
  assert.deepEqual(out.sizes, ["S", "M", "L"]);
  assert.equal(out.askNumber, true);
  const withPicture = cleanGroup({ ...body, picture: "/uploads/ai/sheet.png" }, { ourUpload: ours });
  assert.equal(withPicture.picture, "/uploads/ai/sheet.png");
  assert.deepEqual(withPicture.options, [{ n: 1, title: "One" }, { n: 2, title: "Two" }]);
});
