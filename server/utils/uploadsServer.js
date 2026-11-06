// utils/uploadsServer.js — serves this server's own uploads/ folder, and makes the small copies the website asks for.
//
// The website asks for a picture at a width that suits the screen: /uploads/products/x.png?w=600. Cloudinary used to
// resize on the fly; here the first such request makes a WebP copy that wide (sharp), keeps it under uploads/.sizes/,
// and every later request is served from there. Widths snap to a short list, so one picture never has more than a
// handful of copies. Without ?w= (or for a video, PDF, GIF) the file itself is sent.
//
// Pictures are drawn onto canvases by the design room and the admin's print files, which needs the CORS header; and
// a file's name never changes, so the browser may keep it for a month.
import fs from "fs";
import path from "path";
import express from "express";
import sharp from "sharp";
import { UPLOADS_DIR } from "./imageStorage.js";

export const WIDTHS = [240, 400, 600, 800, 1200, 1600, 2000];
const RESIZABLE = new Set([".jpg", ".jpeg", ".jfif", ".png", ".webp", ".avif"]);
const CACHE = "public, max-age=2592000, immutable"; // 30 days: a changed file always gets a new name

// the width the copy is made at: the first listed width that is at least what was asked for (or the largest)
export const snapWidth = (w) => {
  const n = Number(w);
  if (!Number.isFinite(n) || n <= 0) return null;
  return WIDTHS.find((x) => x >= n) || WIDTHS[WIDTHS.length - 1];
};

// "products/x.png" from the request path, or null when it points outside uploads/
export const safeRel = (urlPath) => {
  let rel;
  try {
    rel = decodeURIComponent(String(urlPath || "")).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (!rel || rel.includes("..") || rel.includes("\\") || rel.startsWith(".") || rel.includes("/.")) return null;
  return rel;
};

const making = new Map(); // copy path -> promise, so two requests at once make one copy

async function sizedCopy(rel, width) {
  const src = path.join(UPLOADS_DIR, rel);
  const out = path.join(UPLOADS_DIR, ".sizes", `${rel}.w${width}.webp`);
  if (fs.existsSync(out)) return out;
  if (making.has(out)) return making.get(out);
  const job = (async () => {
    await fs.promises.mkdir(path.dirname(out), { recursive: true });
    const tmp = `${out}.${process.pid}.tmp`;
    await sharp(src, { limitInputPixels: false }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toFile(tmp);
    await fs.promises.rename(tmp, out);
    return out;
  })().finally(() => making.delete(out));
  making.set(out, job);
  return job;
}

export function uploadsRouter() {
  const router = express.Router();
  router.use((req, res, next) => {
    // the website's own origin is already allowed by the server's CORS setup; anyone else may still show the picture
    if (!res.getHeader("Access-Control-Allow-Origin")) res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", CACHE);
    next();
  });
  // a small copy, when asked for and the file is a picture
  router.get("*", async (req, res, next) => {
    const width = snapWidth(req.query.w);
    if (!width) return next();
    const rel = safeRel(req.path);
    if (!rel || !RESIZABLE.has(path.extname(rel).toLowerCase())) return next();
    if (!fs.existsSync(path.join(UPLOADS_DIR, rel))) return next();
    try {
      const copy = await sizedCopy(rel, width);
      res.type("image/webp");
      res.sendFile(copy);
    } catch (err) {
      console.error("[uploads] small copy failed:", rel, err.message);
      next(); // the full file, then
    }
  });
  router.use(express.static(UPLOADS_DIR, { maxAge: "30d", immutable: true, index: false, dotfiles: "ignore" }));
  return router;
}
