// A customer's upload is opened before it is kept (utils/realPicture.js, 12 Nov 2026)
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { isRealPicture } from "../utils/realPicture.js";

const picture = (format) => sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } })[format]().toBuffer();

test("real JPG, PNG and WebP pictures are let in", async () => {
  for (const format of ["jpeg", "png", "webp"]) assert.equal(await isRealPicture(await picture(format)), true, format);
});

test("random bytes with a picture's name are refused", async () => {
  assert.equal(await isRealPicture(randomBytes(4000)), false);
});

test("an empty file and a missing file are refused", async () => {
  assert.equal(await isRealPicture(Buffer.alloc(0)), false);
  assert.equal(await isRealPicture(undefined), false);
});

test("a text file renamed to .jpg is refused", async () => {
  assert.equal(await isRealPicture(Buffer.from("these are my notes, not a picture")), false);
});

test("a picture cut off right after its first bytes is refused", async () => {
  const whole = await picture("png");
  assert.equal(await isRealPicture(whole.subarray(0, 12)), false);
});
