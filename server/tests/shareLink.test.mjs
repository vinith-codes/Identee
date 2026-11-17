// "Share my tee" to WhatsApp (17 Nov 2026): the share card is stored as a small JPEG and a public page shows it as the
// link's preview (og:image) for WhatsApp.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createShare, isShareId, sharePageHtml } from "../controllers/shareController.js";
import { UPLOADS_DIR } from "../utils/imageStorage.js";

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}
const fakeReq = (body) => ({ body, protocol: "http", get: (h) => ({ host: "localhost:5198" })[h.toLowerCase()] });
const run = (handler, req) =>
  new Promise((resolve) => {
    const res = fakeRes();
    const origJson = res.json;
    res.json = (b) => {
      origJson(b);
      resolve({ res });
      return res;
    };
    handler(req, res, (err) => resolve({ res, err }));
  });

test("share ids are only the stored file names", () => {
  assert.equal(isShareId("1794893637058-b08863899c"), true);
  for (const bad of ["../x", "abc", "1794893637058-B08863899C", "1794893637058-b08863899c.jpg", ""]) assert.equal(isShareId(bad), false, bad);
});

test("the page carries the WhatsApp preview tags and escapes the title", () => {
  const html = sharePageHtml({ title: 'Oversized <Tee> "Black"', image: "https://backend.example/uploads/shares/1-a.jpg", width: 1200, height: 630, shop: "https://identee.co.in" });
  assert.match(html, /<meta property="og:image" content="https:\/\/backend\.example\/uploads\/shares\/1-a\.jpg">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /og:title" content="Oversized &lt;Tee&gt; &quot;Black&quot;"/);
  assert.ok(!html.includes("<Tee>"));
  assert.match(html, /href="https:\/\/identee\.co\.in"/);
});

test("a share card is stored as a JPEG of at most 1200 px with its title, and the answer has the page link", async () => {
  const png = await sharp({ create: { width: 2400, height: 900, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 0.5 } } }).png().toBuffer();
  const { res, err } = await run(createShare, fakeReq({ image: `data:image/png;base64,${png.toString("base64")}`, title: "Oversized Tee · Black" }));
  assert.equal(err, undefined);
  assert.equal(res.statusCode, 201);
  const { id, page, image } = res.body;
  assert.equal(isShareId(id), true);
  assert.equal(page, `http://localhost:5198/api/share/${id}`);
  assert.equal(image, `http://localhost:5198/uploads/shares/${id}.jpg`);
  const jpg = path.join(UPLOADS_DIR, "shares", `${id}.jpg`);
  const meta = await sharp(jpg).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 1200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(UPLOADS_DIR, "shares", `${id}.json`), "utf8")), { title: "Oversized Tee · Black", width: 1200, height: 450 });
  fs.rmSync(jpg);
  fs.rmSync(path.join(UPLOADS_DIR, "shares", `${id}.json`));
});

test("anything that is not a picture is refused", async () => {
  for (const image of ["", "data:text/html;base64,PGgxPg==", `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`]) {
    const { res, err } = await run(createShare, fakeReq({ image }));
    assert.ok(err, image.slice(0, 30));
    assert.equal(res.statusCode, 400);
  }
});
