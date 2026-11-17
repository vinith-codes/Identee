// controllers/shareController.js — "Share my tee" to WhatsApp (17 Nov 2026, the owner: "if I click Share my tee
// make it share in WhatsApp").
//
// A web page can't put a picture into a WhatsApp chat by itself, so the tee goes as a LINK: the Design Room uploads its
// share card (front + back of the tee) here, gets back a small public page, and opens WhatsApp with a message and that
// link. WhatsApp reads the page's preview tags (og:image …) and shows the tee picture big in the chat; whoever taps it
// lands on the shop.
//
//   POST /api/share        { image: "data:image/png;base64,…", title? }   → { id, page, image }
//   GET  /api/share/:id    the page WhatsApp (and anyone) opens: preview tags, then on to the shop
import fs from "fs";
import path from "path";
import sharp from "sharp";
import asyncHandler from "express-async-handler";
import { UPLOADS_DIR, uploadFile } from "../utils/imageStorage.js";
import { publicBase } from "./printFileController.js";
import { siteAddress } from "../utils/siteAddress.js";

const FOLDER = "shares";
const MAX_BYTES = 8 * 1024 * 1024; // the card is ~1–3 MB as a PNG
// the stored file's name without ".jpg" is the share's id: "<time>-<10 hex>" (see uploadFile)
export const isShareId = (id) => /^\d{10,15}-[0-9a-f]{10}$/.test(String(id || ""));

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cleanTitle = (t) =>
  String(t || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "My IDENTEE tee";

/** The preview page's HTML (kept apart so it can be tested). */
export function sharePageHtml({ title, image, width, height, shop }) {
  const t = esc(cleanTitle(title));
  const desc = "Designed on IDENTEE — make your own tee at identee.co.in";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="IDENTEE">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:type" content="image/jpeg">
${width ? `<meta property="og:image:width" content="${width}">\n<meta property="og:image:height" content="${height}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<style>body{margin:0;font:16px/1.5 Arial,sans-serif;background:#F5F0E6;color:#15120F;text-align:center}
main{max-width:720px;margin:0 auto;padding:20px 16px 32px}img{max-width:100%;height:auto;border-radius:14px;box-shadow:0 10px 30px -14px rgba(0,0,0,.4)}
h1{font-size:22px;margin:16px 0 6px}a.b{display:inline-block;margin-top:14px;padding:13px 22px;border-radius:999px;background:#15120F;color:#fff;text-decoration:none;font-weight:700}</style>
</head><body><main>
<img src="${esc(image)}" alt="${t}"${width ? ` width="${width}" height="${height}"` : ""}>
<h1>${t}</h1>
<p>Designed on IDENTEE.</p>
<a class="b" href="${esc(shop)}">Design your own tee →</a>
</main></body></html>`;
}

// POST /api/share   (no login needed: a guest may share too; the route is rate limited)
export const createShare = asyncHandler(async (req, res) => {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(req.body?.image || ""));
  if (!m) {
    res.status(400);
    throw new Error("No picture to share.");
  }
  const input = Buffer.from(m[2], "base64");
  if (!input.length || input.length > MAX_BYTES) {
    res.status(413);
    throw new Error("The picture is too big to share.");
  }
  let jpeg;
  let info;
  try {
    // WhatsApp shows previews from small pictures best (~1200 px, a few hundred KB)
    ({ data: jpeg, info } = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .flatten({ background: "#F5F0E6" })
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    res.status(400);
    throw new Error("That picture couldn’t be read.");
  }
  const { url } = await uploadFile(jpeg, "image/jpeg", FOLDER);
  const id = path.basename(url, ".jpg");
  // the title travels in the file's neighbour, so the page needs no database
  await fs.promises.writeFile(path.join(UPLOADS_DIR, FOLDER, `${id}.json`), JSON.stringify({ title: cleanTitle(req.body?.title), width: info.width, height: info.height }));
  const base = publicBase(req);
  res.status(201).json({ id, page: `${base}/api/share/${id}`, image: `${base}${url}` });
});

// GET /api/share/:id   the page behind the WhatsApp link
export const showShare = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const file = path.join(UPLOADS_DIR, FOLDER, `${id}.jpg`);
  const shop = await siteAddress();
  if (!isShareId(id) || !fs.existsSync(file)) return res.redirect(302, shop);
  let meta = {};
  try {
    meta = JSON.parse(await fs.promises.readFile(path.join(UPLOADS_DIR, FOLDER, `${id}.json`), "utf8"));
  } catch {
    /* an old share without its title: the plain title is used */
  }
  const html = sharePageHtml({ title: meta.title, image: `${publicBase(req)}/uploads/${FOLDER}/${id}.jpg`, width: meta.width, height: meta.height, shop });
  res.set("Cache-Control", "public, max-age=3600").type("html").send(html);
});
