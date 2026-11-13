// controllers/printFileController.js — print-ready pictures and "Send to print team" (6 Nov 2026).
//
// After an order, the admin opens Orders → Designs & print files:
//   1. "Prepare for print" on a picture: the server enlarges it on Replicate (Real-ESRGAN, the model that made the
//      files the print team approved), then runs the approved recipe (services/printRecipe.js): no see-through, a
//      vector edge where solid ink meets the tee, 600 DPI. The result stays on this server (print-work/<key>/) and the
//      design's element remembers it (el.printFile); the admin's browser draws it into the print PDF (.ai).
//      Drawn art (a cartoon, a logo — services/vectorArt.js artKind) is also made into VECTOR SHAPES (12 Nov 2026,
//      the print team OK'd the samples): the shapes sit inside the same vector edge; the admin can switch any picture
//      between shapes and the sharp picture (POST /picture/vector).
//   2. "Send to print team": the browser uploads the ZIP it made (in parts, so no upload limit is hit); the server
//      keeps it for a while (print-files/<order>/) and emails a download link to the print team.
import asyncHandler from "express-async-handler";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import sharp from "sharp";
import zlib from "zlib";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import Order from "../models/orderModel.js";
import AiUsage from "../models/aiUsageModel.js";
import { fetchOurImage, isDarkHex, isOurUpload, readSettings } from "./aiController.js";
import { enlargeWithReplicate, replicateConfigured, replicateMock, replicateModel } from "../services/replicateService.js";
import { PRINT_DPI, bleedEdges, runRecipe, unPaeth } from "../services/printRecipe.js";
import { cleanCutEdge } from "../services/cutoutService.js";
import { artKind, vectorizeChecked } from "../services/vectorArt.js";
import { fromAddress, isEmail, mailer } from "../utils/mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(__dirname, "..", "print-work"); // print-ready pictures
const FILES = path.join(__dirname, "..", "print-files"); // ZIPs sent to the print team
const KEEP_DAYS = 14; // how long a sent ZIP's link works
const KEEP_ZIP_DAYS = 60; // how long a sent ZIP stays on the server, so "Send again" needs no new ZIP (8 Nov 2026)
const REPLY_TO = "info@identee.co.in"; // where the print team's "this file has a problem" replies go
const MAX_PIXELS = 90e6; // the biggest print-ready picture the server will hold in memory
// The address the outside world uses for this backend, for links in emails. Behind the panel's proxy the Host header
// is the inside one (localhost:7854 — the print team got such a link on 6 Nov 2026), so: the proxy's X-Forwarded-Host,
// else PUBLIC_BACKEND_URL from .env, else https://backend.identee.co.in in production (the laptop keeps localhost).
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
// Always https in production: the panel's proxy talks plain http to the backend and says so, and an http link from
// Gmail (an https page) is a download Chrome quietly blocks — the tab flashes and nothing arrives (7 Nov 2026).
export const publicBase = (req) => {
  const first = (v) => String(v || "").split(",")[0].trim();
  const proto = process.env.NODE_ENV === "production" ? "https" : first(req.get("x-forwarded-proto")) || req.protocol;
  for (const host of [first(req.get("x-forwarded-host")), first(req.get("host"))]) if (host && !LOCAL_HOST.test(host)) return `${proto}://${host}`;
  const set = process.env.PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "");
  if (set) return set;
  return process.env.NODE_ENV === "production" ? "https://backend.identee.co.in" : `${proto}://${first(req.get("host"))}`;
};
export const printTeamEmail = () => process.env.PRINT_TEAM_EMAIL?.trim() || "millionmarks16@gmail.com";

const safeName = (s) => String(s || "").replace(/[^\w\-. ]+/g, "").trim().slice(0, 80) || "print-files.zip";
const keyOf = (src, tee, keep) => crypto.createHash("sha1").update(`${src}|${tee}|${keep}`).digest("hex").slice(0, 24);
const isKey = (k) => /^[0-9a-f]{24}$/.test(String(k || ""));

/* ---------- the design's picture ---------- */
async function pictureOf(body) {
  const { designId, index } = body;
  if (!mongoose.isValidObjectId(designId)) throw Object.assign(new Error("Design not found"), { status: 404 });
  const design = await Customization.findById(designId);
  const el = design?.elements?.[Number(index)];
  if (!design || !el || el.type !== "image" || !el.src) throw Object.assign(new Error("That picture is not in this design."), { status: 404 });
  return { design, el };
}

/* ---------- jobs: one picture at a time (each needs a few hundred MB while it runs) ---------- */
const jobs = new Map(); // id -> job
let running = false;
const waiting = [];
function startNext() {
  if (running) return;
  const job = waiting.shift();
  if (!job) return;
  running = true;
  job.status = "running";
  job
    .work()
    .then((result) => {
      job.status = "done";
      job.result = result;
    })
    .catch((err) => {
      job.status = "failed";
      job.error = err?.message || "The picture could not be prepared.";
      console.error("[print-files] job failed:", err);
    })
    .finally(() => {
      job.finishedAt = Date.now();
      running = false;
      startNext();
    });
}
setInterval(() => {
  for (const [id, j] of jobs) if (j.finishedAt && Date.now() - j.finishedAt > 60 * 60 * 1000) jobs.delete(id);
}, 10 * 60 * 1000).unref();

// Disk housekeeping (the account has 100 GB, 6 Nov 2026): print-ready pictures and sent ZIPs older than this are
// deleted — both can be made again from the order. Once a day, and once soon after the server starts.
const KEEP_WORK_DAYS = 60;
async function sweepOld() {
  const limit = Date.now() - KEEP_WORK_DAYS * 24 * 3600 * 1000;
  let n = 0;
  for (const root of [WORK, FILES]) {
    let dirs = [];
    try {
      dirs = await fsp.readdir(root);
    } catch {
      continue;
    }
    for (const d of dirs) {
      const p = path.join(root, d);
      try {
        const st = await fsp.stat(p);
        if (st.isDirectory() && st.mtimeMs < limit) {
          await fsp.rm(p, { recursive: true, force: true });
          n++;
        }
      } catch {
        /* gone already */
      }
    }
  }
  if (n) console.log(`[print-files] removed ${n} folder${n === 1 ? "" : "s"} older than ${KEEP_WORK_DAYS} days`);
  await sweepExpired().catch(() => {});
}
setTimeout(() => sweepOld().catch((e) => console.error("[print-files] sweep:", e.message)), 2 * 60 * 1000).unref();
setInterval(() => sweepOld().catch((e) => console.error("[print-files] sweep:", e.message)), 24 * 3600 * 1000).unref();

// GET /api/print-files/status   (admin or seller)
export const getPrintFileStatus = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  res.json({ enlarger: { configured: replicateConfigured(), mock: replicateMock(), model: replicateModel(), priceInr: replicateMock() ? 0 : settings.replicatePricePerImageInr }, teamEmail: printTeamEmail(), keepDays: KEEP_DAYS, dpi: PRINT_DPI, options: { knockout: Boolean(settings.printKnockout), dropSpecks: settings.printDropSpecks !== false } });
});

// POST /api/print-files/picture  { designId, index, printCm }  -> { jobId }   (admin only)
export const startPrintPicture = asyncHandler(async (req, res) => {
  if (!replicateConfigured()) {
    res.status(503);
    throw new Error("The enlarger is not set up on this server (REPLICATE_API_TOKEN).");
  }
  let found;
  try {
    found = await pictureOf(req.body);
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
  const { design, el } = found;
  if (!isOurUpload(el.src)) {
    res.status(400);
    throw new Error("This picture is not stored with us, so it can't be prepared.");
  }
  const printCm = Math.max(1, Math.min(120, Number(req.body.printCm) || 30));
  const garment = await GarmentType.findOne({ key: design.garmentType }).lean();
  const teeHex = garment?.colors?.find((c) => c.slug === design.color)?.hex;
  const tee = isDarkHex(teeHex) ? "black" : "white";
  const settings = await readSettings();
  // the print team's options (Settings → AI designs → Print files). The tee's own colour is left out only where the
  // tee really is that colour (a navy tee is "dark" too, but black ink on it is not the shirt showing through)
  const knockout = Boolean(settings.printKnockout) && teeIs(teeHex, tee);
  const dropSpecks = settings.printDropSpecks !== false;
  const user = req.user._id;
  const designId = String(design._id);
  const index = Number(req.body.index);
  const base = `${req.protocol}://${req.get("host")}`;
  // vector shapes: "auto" (drawn art yes, photos no), "on", "off" — the admin's switch, kept when prepared again
  const prior = el.printFile?.vector?.made ? (el.printFile.vector.use ? "on" : "off") : "auto";
  const vectorMode = ["auto", "on", "off"].includes(req.body.vector) ? req.body.vector : prior;

  const id = crypto.randomBytes(8).toString("hex");
  const job = { id, status: "queued", step: "Waiting for its turn…", log: [], createdAt: Date.now(), designId, index };
  const log = (t) => {
    job.step = t;
    job.log.push(`${new Date().toISOString().slice(11, 19)} ${t}`);
  };
  job.work = async () => {
    log("Fetching the picture…");
    const stored = await fetchOurImage(el.src, { protocol: base.split(":")[0], get: () => base.replace(/^https?:\/\//, "") });
    // the size from the turned picture itself (13 Nov 2026 review: metadata() gives a phone photo's stored size before
    // its EXIF turn, so a sideways-stored photo was read with width and height swapped — a sheared print file)
    const { data: raw, info: rawInfo } = await sharp(stored.data, { limitInputPixels: false }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W0 = rawInfo.width, H0 = rawInfo.height;
    // how many times bigger: enough for 600 DPI at its print width, at most 4x, and never a picture too big to hold
    let keep = Math.min(4, Math.max(1, (PRINT_DPI * printCm) / 2.54 / W0));
    keep = Math.min(keep, Math.sqrt(MAX_PIXELS / (W0 * H0)));
    keep = Math.max(1, Math.round(keep * 4) / 4);
    const W = Math.round(W0 * keep), H = Math.round(H0 * keep);
    // (below: the colours under the see-through area are extended outward first, so no dark fringe appears at the edge)
    // an older cut-out's light (or magenta) rim: each outline pixel keeps only its artwork share (8 Nov 2026)
    const cleaned = cleanCutEdge(raw, W0, H0);
    if (cleaned) log(`Cleaned the cut edge: ${cleaned.pixels} outline pixels (background was rgb(${cleaned.key.join(", ")}))`);
    // drawn art or a photo? (decides whether it becomes vector shapes by itself)
    const art = await artKind(raw, W0, H0);
    log(`Looks like ${art.kind === "drawn" ? "drawn art" : "a photo"} (edge score ${art.score}, smooth skin ${art.skin} %)`);
    // the design's own see-through shape (after that clean-up), before the colours under it are filled in
    const alphaSmall = await sharp(raw, { raw: { width: W0, height: H0, channels: 4 }, limitInputPixels: false }).extractChannel(3).raw().toBuffer();
    bleedEdges(raw, W0, H0);
    const rgbPng = await sharp(raw, { raw: { width: W0, height: H0, channels: 4 }, limitInputPixels: false }).removeAlpha().png({ compressionLevel: 3 }).toBuffer();
    // the customer's own picture on the tee, as the recipe shows the enlarged one (vector shapes: what the enlarger
    // made up is left out, and the detail check counts only what the customer's picture has too — 13 Nov 2026).
    // Only when it is enlarged: with nothing enlarged there is nothing made up.
    // already big enough for its print size: no enlarging, no Replicate run, no cost (12 Nov 2026)
    const enlarge = keep > 1;
    const teeV = tee === "white" ? 255 : 0;
    const srcRgb = enlarge ? Buffer.alloc(W0 * H0 * 3) : null;
    if (srcRgb)
      for (let i = 0; i < W0 * H0; i++) {
        const a = alphaSmall[i] / 255;
        for (let c = 0; c < 3; c++) srcRgb[i * 3 + c] = Math.round(raw[i * 4 + c] * a + teeV * (1 - a));
      }
    let rgb;
    if (enlarge) {
      log(`Enlarging ${keep}× on the graphics-card service (${W0}×${H0} → ${W}×${H})…`);
      const big = await enlargeWithReplicate(rgbPng, keep, log);
      rgb = await sharp(big, { limitInputPixels: false }).removeAlpha().resize(W, H, { kernel: "lanczos3" }).raw().toBuffer();
    } else {
      log(`Already big enough (${W0}×${H0}): not enlarged`);
      rgb = await sharp(rgbPng, { limitInputPixels: false }).removeAlpha().raw().toBuffer();
    }
    // the design's own see-through shape, resized smoothly (as the approved files were made)
    const alpha = await sharp(alphaSmall, { raw: { width: W0, height: H0, channels: 1 }, limitInputPixels: false }).resize(W, H, { kernel: "lanczos3" }).extractChannel(0).raw().toBuffer(); // (one channel: sharp gives 3 otherwise)
    log("Cleaning the edge and drawing the vector edge…");
    const dpi = Math.round(W / (printCm / 2.54));
    // the edge is traced from the customer's see-through shape, enlarged smoothly: each of its pixels became a
    // (W/W0)-pixel step, and the tracer kept the steps as a staircase on the outline (user, 12 Nov 2026: "the edges
    // need to get more sharper"). Smoothing at about 0.85 of one original pixel (13 Nov: 0.6 left small bumps) rounds the steps off and keeps thin
    // details; a picture not enlarged keeps the approved 0.8.
    const edgeSigma = Math.max(0.8, Math.round(0.85 * (W / W0) * 10) / 10);
    const made = await runRecipe({ rgb, alpha, W, H, tee, knockout, dropSpecks, dpi, edgeSigma, log });
    const key = keyOf(el.src, `${tee}${knockout ? "-ko" : ""}${dropSpecks ? "-sp" : ""}`, keep);
    const dir = path.join(WORK, key);
    await fsp.mkdir(dir, { recursive: true });
    // Several designs can share this folder (every Shop order of one ready design, a copied design): the vector shapes
    // another design uses stay until new ones are written in their place (13 Nov 2026 review: deleting them here left
    // that design's print ZIP without its shapes for minutes — or for good, when this run made none). Each file is
    // written whole and then put in place, so a ZIP made meanwhile never reads half a file.
    await writeWhole(path.join(dir, "picture.flate"), made.flate);
    // the old sheet PNGs are of the old picture
    for (const f of await fsp.readdir(dir)) if (/^sheet-\d+\.png$/.test(f)) await fsp.rm(path.join(dir, f), { force: true });
    if (srcRgb) await writeWhole(path.join(dir, "source.png"), await sharp(srcRgb, { raw: { width: W0, height: H0, channels: 3 }, limitInputPixels: false }).png({ compressionLevel: 6 }).toBuffer());
    else await fsp.rm(path.join(dir, "source.png"), { force: true });
    const preview = await sharp(made.picture, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false }).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await writeWhole(path.join(dir, "preview.webp"), preview);
    // vector shapes (drawn art by itself; a photo only when the admin switched it on)
    let vector = { kind: art.kind, score: art.score, skin: art.skin, made: false, use: false };
    if (vectorMode === "on" || (vectorMode === "auto" && art.kind === "drawn")) {
      const { v, check } = await makeVector(dir, { rgb: made.picture, ink: made.ink, W, H, tee, clip: made.clip, kind: art.kind, printCm, keep, src: srcRgb ? { rgb: srcRgb, W: W0, H: H0 } : null, log });
      // used only when the check found every detail (13 Nov 2026) — otherwise the sharp picture prints
      vector = { ...vector, made: true, use: check.ok, colours: v.colours, shapes: v.shapes, check };
    }
    // (no shapes this time: the folder's shapes from before — another design may use them — are kept in its notes)
    let keptVector = null;
    if (!vector.made && fs.existsSync(path.join(dir, "vector.flate"))) keptVector = await fsp.readFile(path.join(dir, "meta.json"), "utf8").then((t) => JSON.parse(t).vector || null).catch(() => null);
    const info = { key, width: W, height: H, keep, cm: printCm, tee, src: el.src, dpi: PRINT_DPI, realDpi: dpi, clip: made.clip, shapes: made.shapes, steps: made.steps, bytes: made.flate.length, stats: made.stats, vector: keptVector?.made ? keptVector : vector, madeAt: new Date().toISOString() };
    await writeWhole(path.join(dir, "meta.json"), JSON.stringify(info));
    // the design remembers it (read again: the admin may have changed something meanwhile)
    const fresh = await Customization.findById(designId);
    const target = fresh?.elements?.[index];
    if (!fresh || !target) throw new Error("The design changed while the picture was being prepared. Try again.");
    const st = made.stats || {};
    target.printFile = { key, width: W, height: H, keep, cm: printCm, madeAt: new Date(), realDpi: dpi, specks: st.specks || 0, specksDropped: st.specksDropped || 0, thinPct: st.thinPct || 0, knockout: Boolean(st.knockout), vector };
    await fresh.save();
    const costInr = !enlarge || replicateMock() ? 0 : Math.round((settings.replicatePricePerImageInr || 0) * 100) / 100;
    if (enlarge) await AiUsage.create({ user, kind: "print", prompt: `Print-ready picture (design ${designId}, picture ${index + 1}) · ${keep}× · Replicate`, images: 1, costInr, model: replicateModel() });
    log("Done.");
    return { printFile: target.printFile, costInr };
  };
  jobs.set(id, job);
  waiting.push(job);
  startNext();
  res.status(202).json({ jobId: id, queued: waiting.length });
});

// GET /api/print-files/jobs/:id   (admin only)
export const getPrintJob = asyncHandler(async (req, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job) {
    res.status(404);
    throw new Error("That job is not known any more (the server may have restarted). Press Prepare for print again.");
  }
  res.json({ id: job.id, status: job.status, step: job.step, error: job.error || null, result: job.result || null, log: job.log.slice(-6) });
});

/* ---------- vector shapes ---------- */
// the shapes, their packed PDF operators, the SVG (preview, day sheets) and a small preview on the tee's colour.
// Every try is checked at the print size against the print-ready picture (vectorArt.js vectorizeChecked); the files
// kept are the try that lost least, and check.ok says whether it lost nothing.
async function makeVector(dir, { rgb, ink, W, H, tee, clip, kind, printCm, keep, src = null, log }) {
  const { v, check } = await vectorizeChecked({ rgb, ink, W, H, printCm, kind, keep: keep || 1, src, log });
  if (!check.ok) log(`The shapes would lose ${check.lost} small detail${check.lost === 1 ? "" : "s"} (biggest ${check.biggestMm2} mm²) — the sharp picture prints instead.`);
  const s = Math.min(1, 1600 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const png = await sheetPng(await renderVector(v.svg, W, H, w, h, tee), w, h, { width: W, height: H, clip });
  const preview = await sharp(png).flatten({ background: tee === "white" ? "#ffffff" : "#000000" }).webp({ quality: 82 }).toBuffer();
  // (all made first, then put in place one after another: the shapes are never missing while a ZIP is made)
  await writeWhole(path.join(dir, "vector.flate"), v.content);
  await writeWhole(path.join(dir, "vector.svg"), v.svg);
  await writeWhole(path.join(dir, "vector-preview.webp"), preview);
  for (const f of await fsp.readdir(dir)) if (/^sheet-v-\d+\.png$/.test(f)) await fsp.rm(path.join(dir, f), { force: true });
  return { v, check };
}
// a file written whole under a passing name, then put in place (a reader never sees half of it). If the rename is
// refused (Windows, while the old file is being read), it is written in place as before.
async function writeWhole(file, data) {
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString("hex")}`;
  await fsp.writeFile(tmp, data);
  try {
    await fsp.rename(tmp, file);
  } catch {
    await fsp.writeFile(file, data);
    await fsp.rm(tmp, { force: true });
  }
}
// the vector SVG drawn at w × h px (raw RGB, on the tee's colour)
async function renderVector(svg, W, H, w, h, tee) {
  const sized = svg.replace(`width="${W}" height="${H}"`, `width="${w}" height="${h}"`);
  const out = await sharp(Buffer.from(sized), { limitInputPixels: false, unlimited: true }).flatten({ background: tee === "white" ? "#ffffff" : "#000000" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (out.info.width !== w || out.info.height !== h) throw new Error(`vector drawn at ${out.info.width}×${out.info.height}, not ${w}×${h}`);
  return out.data;
}
// where ink prints, from a stored print-ready picture's vector edge (0/1 per pixel)
async function inkFromClip(meta) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}"><path fill="#fff" fill-rule="evenodd" d="${meta.clip}"/></svg>`;
  const a = await sharp(Buffer.from(svg), { limitInputPixels: false, unlimited: true }).ensureAlpha().extractChannel(3).raw().toBuffer();
  const ink = new Uint8Array(meta.width * meta.height);
  for (let i = 0; i < ink.length; i++) ink[i] = a[i] >= 128 ? 1 : 0;
  return ink;
}

// POST /api/print-files/picture/vector  { designId, index, use }  -> { printFile } or { jobId }   (admin only)
// The admin's switch: vector shapes or the sharp picture. Shapes not made yet (a photo, or a picture prepared before
// 12 Nov 2026) are made from the stored print-ready picture — no enlarging again, no cost.
export const setPictureVector = asyncHandler(async (req, res) => {
  let found;
  try {
    found = await pictureOf(req.body);
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
  const { design, el } = found;
  const pf = el.printFile;
  if (!pf?.key || !isKey(pf.key)) {
    res.status(400);
    throw new Error("Prepare this picture for print first.");
  }
  const dir = path.join(WORK, pf.key);
  const use = Boolean(req.body.use);
  // shapes made before the detail check (13 Nov 2026) are made again, so they are checked too
  const have = pf.vector?.made && pf.vector?.check?.checkedAt && fs.existsSync(path.join(dir, "vector.flate"));
  if (!use || have) {
    const old = pf.vector || {};
    // switching on shapes that lost details is the admin's own choice: the row and order sheet say so
    const c = old.check?.checkedAt ? old.check : null;
    pf.vector = { kind: old.kind, score: old.score, skin: old.skin, made: Boolean(old.made), use, colours: old.colours, shapes: old.shapes, ...(c ? { check: { ok: c.ok, lost: c.lost, biggestMm2: c.biggestMm2, matchPct: c.matchPct, level: c.level, repairs: c.repairs, checkedAt: c.checkedAt } } : {}) };
    design.markModified("elements");
    await design.save();
    res.json({ printFile: pf });
    return;
  }
  if (!fs.existsSync(path.join(dir, "picture.flate"))) {
    res.status(410);
    throw new Error("This print-ready picture is no longer on the server. Prepare it again.");
  }
  const designId = String(design._id), index = Number(req.body.index);
  const id = crypto.randomBytes(8).toString("hex");
  const job = { id, status: "queued", step: "Waiting for its turn…", log: [], createdAt: Date.now(), designId, index };
  const log = (t) => {
    job.step = t;
    job.log.push(`${new Date().toISOString().slice(11, 19)} ${t}`);
  };
  job.work = async () => {
    log("Reading the print-ready picture…");
    const meta = JSON.parse(await fsp.readFile(path.join(dir, "meta.json"), "utf8"));
    const rgb = unPaeth(zlib.inflateSync(await fsp.readFile(path.join(dir, "picture.flate"))), meta.width, meta.height);
    const ink = await inkFromClip(meta);
    // a picture prepared before 12 Nov 2026 has no kind yet: measure it on a small copy of the print-ready picture
    let kind = pf.vector?.kind, score = pf.vector?.score, skin = pf.vector?.skin;
    if (!kind) {
      const s = Math.min(1, 1024 / Math.max(meta.width, meta.height));
      const w = Math.max(8, Math.round(meta.width * s)), h = Math.max(8, Math.round(meta.height * s));
      const small = await sharp(rgb, { raw: { width: meta.width, height: meta.height, channels: 3 }, limitInputPixels: false }).resize(w, h).raw().toBuffer();
      const m8 = Buffer.alloc(ink.length);
      for (let i = 0; i < ink.length; i++) m8[i] = ink[i] ? 255 : 0;
      const m = await sharp(m8, { raw: { width: meta.width, height: meta.height, channels: 1 }, limitInputPixels: false }).resize(w, h).extractChannel(0).raw().toBuffer();
      const rgba = Buffer.alloc(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        rgba[i * 4] = small[i * 3];
        rgba[i * 4 + 1] = small[i * 3 + 1];
        rgba[i * 4 + 2] = small[i * 3 + 2];
        rgba[i * 4 + 3] = m[i];
      }
      ({ kind, score, skin } = await artKind(rgba, w, h));
    }
    // the customer's own picture, kept since 13 Nov 2026 (a picture prepared before that: the check as it was)
    let src = null;
    if ((meta.keep || pf.keep || 1) > 1 && fs.existsSync(path.join(dir, "source.png"))) {
      const sp = await sharp(path.join(dir, "source.png"), { limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      src = { rgb: sp.data, W: sp.info.width, H: sp.info.height };
    }
    const { v, check } = await makeVector(dir, { rgb, ink, W: meta.width, H: meta.height, tee: meta.tee, clip: meta.clip, kind, printCm: meta.cm || pf.cm || 30, keep: meta.keep || pf.keep || 1, src, log });
    const vector = { kind, score, skin, made: true, use: check.ok, colours: v.colours, shapes: v.shapes, check };
    meta.vector = vector;
    await writeWhole(path.join(dir, "meta.json"), JSON.stringify(meta));
    const fresh = await Customization.findById(designId);
    const target = fresh?.elements?.[index];
    if (!fresh || !target?.printFile || target.printFile.key !== pf.key) throw new Error("The design changed while the shapes were being made. Try again.");
    target.printFile.vector = vector;
    fresh.markModified("elements");
    await fresh.save();
    log("Done.");
    return { printFile: target.printFile, costInr: 0 };
  };
  jobs.set(id, job);
  waiting.push(job);
  startNext();
  res.status(202).json({ jobId: id, queued: waiting.length });
});

// DELETE /api/print-files/picture  { designId, index }  — print from the plain picture again   (admin only)
export const dropPrintFile = asyncHandler(async (req, res) => {
  let found;
  try {
    found = await pictureOf(req.body);
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
  found.el.printFile = undefined;
  await found.design.save();
  res.json({ ok: true });
});

/* ---------- the print-ready picture's files (admin or seller) ---------- */
const workFile = (req, res, name) => {
  if (!isKey(req.params.key)) {
    res.status(404);
    throw new Error("Not found");
  }
  const p = path.join(WORK, req.params.key, name);
  if (!fs.existsSync(p)) {
    res.status(404);
    throw new Error("This print-ready picture is no longer on the server. Prepare it again.");
  }
  return p;
};
export const getPrintPictureMeta = asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store"); // a picture prepared again keeps its key: never an old answer
  res.json(JSON.parse(await fsp.readFile(workFile(req, res, "meta.json"), "utf8")));
});
export const getPrintPictureStream = asyncHandler(async (req, res) => {
  const p = workFile(req, res, "picture.flate");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String((await fsp.stat(p)).size));
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(p).pipe(res);
});
export const getPrintPictureVector = asyncHandler(async (req, res) => {
  const p = workFile(req, res, "vector.flate");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String((await fsp.stat(p)).size));
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(p).pipe(res);
});
export const getPrintPictureVectorPreview = asyncHandler(async (req, res) => {
  const p = workFile(req, res, "vector-preview.webp");
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(p).pipe(res);
});
export const getPrintPicturePreview = asyncHandler(async (req, res) => {
  const p = workFile(req, res, "preview.webp");
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(p).pipe(res);
});

// GET /api/print-files/picture/:key/sheet.png?w=…  (admin or seller) — the print-ready picture as a PNG at w px wide,
// see-through outside its vector edge: what the day sheets (and a PNG print file) draw, so they print the same picture
// as the .ai (8 Nov 2026 — they used to redraw the customer's original). Made once per width, then kept.
export const getPrintPictureSheet = asyncHandler(async (req, res) => {
  const meta = JSON.parse(await fsp.readFile(workFile(req, res, "meta.json"), "utf8"));
  const w = Math.max(16, Math.min(meta.width, Math.round(Number(req.query.w) || meta.width)));
  const h = Math.max(1, Math.round((meta.height * w) / meta.width));
  // ?v=1: the vector shapes (the picture prints as shapes), else the print-ready picture
  const vec = req.query.v === "1";
  const out = path.join(WORK, req.params.key, `sheet-${vec ? "v-" : ""}${w}.png`);
  if (vec && !fs.existsSync(out)) {
    const svg = await fsp.readFile(workFile(req, res, "vector.svg"), "utf8");
    await fsp.writeFile(out, await sheetPng(await renderVector(svg, meta.width, meta.height, w, h, meta.tee), w, h, meta));
  } else if (!fs.existsSync(out)) {
    const rgb = unPaeth(zlib.inflateSync(await fsp.readFile(workFile(req, res, "picture.flate"))), meta.width, meta.height);
    const small = await sharp(rgb, { raw: { width: meta.width, height: meta.height, channels: 3 }, limitInputPixels: false }).resize(w, h, { kernel: "lanczos3" }).raw().toBuffer();
    await fsp.writeFile(out, await sheetPng(small, w, h, meta));
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(out).pipe(res);
});
// the picture (raw RGB, w × h) with its vector edge drawn in as the see-through (even-odd, as the PDF's clip)
export async function sheetPng(rgb, w, h, meta) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${meta.width} ${meta.height}"><path fill="#fff" fill-rule="evenodd" d="${meta.clip}"/></svg>`;
  const mask = await sharp(Buffer.from(svg), { limitInputPixels: false }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  if (mask.info.width !== w || mask.info.height !== h) throw new Error(`edge drawn at ${mask.info.width}×${mask.info.height}, not ${w}×${h}`);
  return sharp(rgb, { raw: { width: w, height: h, channels: 3 }, limitInputPixels: false }).joinChannel(mask.data, { raw: { width: w, height: h, channels: 1 } }).png({ compressionLevel: 6 }).toBuffer();
}

// is the tee really black (or white), so leaving that colour out shows the same colour? (not navy, not cream)
export const teeIs = (hex, tee) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return tee === "black" ? Math.max(...c) <= 45 : Math.min(...c) >= 225;
};

/* ---------- Send to print team ---------- */
const uploadIdOk = (s) => /^[a-z0-9]{8,32}$/.test(String(s || ""));
const orderOr404 = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404);
    throw new Error("Order not found");
  }
  const order = await Order.findById(req.params.id).populate("user", "name email");
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  return order;
};

// POST /api/print-files/orders/:id/upload   multipart: part (file), uploadId, part (number), total   (admin only)
export const uploadPrintZipPart = asyncHandler(async (req, res) => {
  await orderOr404(req, res);
  const { uploadId } = req.body;
  const n = Number(req.body.part), total = Number(req.body.total);
  if (!uploadIdOk(uploadId) || !req.file?.buffer || !(n >= 0) || !(total >= 1) || n >= total) {
    res.status(400);
    throw new Error("Bad upload part.");
  }
  const tmp = path.join(FILES, "tmp");
  await fsp.mkdir(tmp, { recursive: true });
  const p = path.join(tmp, `${req.params.id}-${uploadId}.part`);
  if (n === 0) await fsp.writeFile(p, req.file.buffer);
  else await fsp.appendFile(p, req.file.buffer);
  res.json({ received: n + 1, of: total, bytes: (await fsp.stat(p)).size });
});

// A sent ZIP's link ends after KEEP_DAYS, but the ZIP itself stays until KEEP_ZIP_DAYS (8 Nov 2026), so the admin can
// "Send again" (a reprint, a lost email) without making it again. Its line goes when the ZIP is deleted.
const keptUntil = (f) => f.keepUntil || f.expiresAt;
async function sweepExpired() {
  const now = new Date();
  const orders = await Order.find({ $or: [{ "printFiles.keepUntil": { $lt: now } }, { printFiles: { $elemMatch: { keepUntil: null, expiresAt: { $lt: now } } } }] }).select("printFiles");
  for (const o of orders) {
    const keep = o.printFiles.filter((f) => !(keptUntil(f) < now));
    for (const f of o.printFiles) {
      // the ZIP goes when no line still keeps it (Send again adds a line for the same ZIP)
      if (keptUntil(f) < now && !keep.some((k) => k.fileName === f.fileName)) await fsp.rm(path.join(FILES, String(o._id), f.fileName), { force: true }).catch(() => {});
    }
    o.printFiles = keep;
    await o.save();
  }
}

// the email with the download link (the first send and Send again)
// A TEST order's files go to the admin who pressed Send only — never to the real print team.
async function emailLink({ req, order, link, size, expiresAt, again = false }) {
  const mine = isEmail(req.user?.email) ? req.user.email : null;
  if (order.isTest && !mine) throw Object.assign(new Error("A test order's print files go to your own email, and your account has none."), { status: 400 });
  const to = order.isTest ? mine : printTeamEmail();
  const number = order.invoiceNumber || String(order._id).slice(-8).toUpperCase();
  const customer = order.user?.name || [order.shippingAddress?.firstName, order.shippingAddress?.lastName].filter(Boolean).join(" ") || "";
  const mb = (size / 1e6).toFixed(1);
  const until = expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const test = order.isTest ? "TEST ORDER — please do not print. (Sent to you only: the print team does not get test orders.)\n\n" : "";
  await mailer().sendMail({
    from: fromAddress(),
    to,
    cc: mine && !order.isTest ? mine : undefined,
    // the print team's "this file has a problem" reply reaches the admin who sent it
    replyTo: mine || REPLY_TO,
    subject: `${order.isTest ? "[TEST - do not print] " : ""}IDENTEE print files · order ${number}${again ? " (sent again)" : ""}`,
    text: `${test}Print files for IDENTEE order ${number}${customer ? ` (${customer})` : ""}${again ? " — sent again" : ""}.\n\nDownload (${mb} MB, link works until ${until}):\n${link}\n\nInside the ZIP: one .ai per print and size, the job cards with the measurements, the previews and ORDER-SHEET.txt — start with its CHECK BEFORE PRINTING part.\nPictures are enlarged (up to 600 DPI, the DPI of each is in ORDER-SHEET.txt) with a vector edge; words are vector shapes; colours are sRGB. Please print each file at 100%.\n\nA problem with a file? Just reply to this email.\n\nIDENTEE · info@identee.co.in`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.5">
${order.isTest ? `<p style="background:#FDECEA;color:#B42318;font-weight:bold;padding:8px 12px;border-radius:8px;margin:0 0 12px">TEST ORDER — please do not print.</p>` : ""}
<h2 style="color:#8A6F2E;margin:0 0 8px">Print files · order ${number}${again ? " (sent again)" : ""}</h2>
${customer ? `<p style="margin:0 0 12px">${customer}</p>` : ""}
<p><a href="${link}" style="display:inline-block;background:#141110;color:#F0D585;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Download the print files (${mb} MB)</a></p>
<p style="color:#555;font-size:13px">The link works until ${until}.<br>Inside the ZIP: one <b>.ai</b> per print and size, the job cards with the measurements, the previews and ORDER-SHEET.txt — start with its <b>CHECK BEFORE PRINTING</b> part.<br>Pictures are enlarged (up to 600 DPI, the DPI of each is in ORDER-SHEET.txt) with a vector edge; words are vector shapes; colours are sRGB. Please print each file at 100%.</p>
<p style="font-size:13px"><b>A problem with a file?</b> Just reply to this email.</p>
<p style="color:#999;font-size:12px">IDENTEE · info@identee.co.in</p></div>`,
  });
  return to;
}

// POST /api/print-files/orders/:id/send  { uploadId, fileName, bytes }  -> { sentTo, link, expiresAt }   (admin only)
export const sendPrintZip = asyncHandler(async (req, res) => {
  const order = await orderOr404(req, res);
  const { uploadId } = req.body;
  const fileName = safeName(req.body.fileName);
  const tmp = path.join(FILES, "tmp", `${req.params.id}-${uploadId}.part`);
  if (!uploadIdOk(uploadId) || !fs.existsSync(tmp)) {
    res.status(400);
    throw new Error("The ZIP was not uploaded. Try again.");
  }
  const size = (await fsp.stat(tmp)).size;
  if (Number(req.body.bytes) && Number(req.body.bytes) !== size) {
    await fsp.rm(tmp, { force: true });
    res.status(400);
    throw new Error("The ZIP arrived incomplete. Try again.");
  }
  if (!isEmail(printTeamEmail())) {
    res.status(500);
    throw new Error("PRINT_TEAM_EMAIL on the server is not a valid email address.");
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + KEEP_DAYS * 24 * 3600 * 1000);
  const keepUntil = new Date(Date.now() + KEEP_ZIP_DAYS * 24 * 3600 * 1000);
  const link = `${publicBase(req)}/api/print-files/dl/${token}`;
  const to = await emailLink({ req, order, link, size, expiresAt });
  const dir = path.join(FILES, String(order._id));
  await fsp.mkdir(dir, { recursive: true });
  await fsp.rename(tmp, path.join(dir, fileName));
  order.printFiles.push({ fileName, bytes: size, token, expiresAt, keepUntil, sentTo: to, sentAt: new Date(), sentBy: req.user._id });
  await order.save();
  sweepExpired().catch((e) => console.error("[print-files] sweep:", e.message));
  res.status(201).json({ sentTo: to, link, expiresAt, fileName, bytes: size });
});

// POST /api/print-files/orders/:id/resend  { fileName }  -> { sentTo, link, expiresAt }   (admin only)
// Send again (8 Nov 2026): a reprint, or the print team lost the email — the same ZIP, a new link for KEEP_DAYS.
export const resendPrintZip = asyncHandler(async (req, res) => {
  const order = await orderOr404(req, res);
  const fileName = safeName(req.body.fileName);
  const p = path.join(FILES, String(order._id), fileName);
  const before = [...order.printFiles].reverse().find((f) => f.fileName === fileName);
  if (!before || !fs.existsSync(p)) {
    res.status(410);
    throw new Error("That ZIP is no longer on the server. Press Send to print team to make it again.");
  }
  const size = (await fsp.stat(p)).size;
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + KEEP_DAYS * 24 * 3600 * 1000);
  const keepUntil = new Date(Math.max(+expiresAt, +(before.keepUntil || before.expiresAt || 0)));
  const link = `${publicBase(req)}/api/print-files/dl/${token}`;
  const to = await emailLink({ req, order, link, size, expiresAt, again: true });
  order.printFiles.push({ fileName, bytes: size, token, expiresAt, keepUntil, sentTo: to, sentAt: new Date(), sentBy: req.user._id });
  await order.save();
  res.status(201).json({ sentTo: to, link, expiresAt, fileName, bytes: size });
});

// PUT /api/print-files/orders/:id/note  { note }   (admin only) — the admin's note for the print team ("logo 2 cm
// lower", what the customer asked on WhatsApp): it goes on the order sheet and every job card of the order.
export const savePrintNote = asyncHandler(async (req, res) => {
  const order = await orderOr404(req, res);
  const note = String(req.body.note || "").trim().slice(0, 1000);
  // only the note is written (an old order with some other odd field still takes a note)
  await Order.updateOne({ _id: order._id }, { $set: { printNote: note } });
  res.json({ note });
});

// GET /api/print-files/orders/:id/sent   (admin or seller)
export const listSentPrintZips = asyncHandler(async (req, res) => {
  const order = await orderOr404(req, res);
  const now = new Date();
  const dir = path.join(FILES, String(order._id));
  res.json({
    teamEmail: printTeamEmail(),
    note: order.printNote || "",
    sent: order.printFiles.map((f) => ({ fileName: f.fileName, bytes: f.bytes, sentTo: f.sentTo, sentAt: f.sentAt, expiresAt: f.expiresAt, expired: f.expiresAt < now, canResend: !(keptUntil(f) < now) && fs.existsSync(path.join(dir, f.fileName)) })),
  });
});

// GET /api/print-files/dl/:token   (no login: the print team's link)
export const downloadPrintZip = asyncHandler(async (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    res.status(404);
    throw new Error("Not found");
  }
  const order = await Order.findOne({ "printFiles.token": token }).select("printFiles");
  const f = order?.printFiles.find((x) => x.token === token);
  if (!f || f.expiresAt < new Date()) {
    res.status(410).type("text/plain").send("This print-files link has expired. Ask IDENTEE to send it again.");
    return;
  }
  const p = path.join(FILES, String(order._id), f.fileName);
  if (!fs.existsSync(p)) {
    res.status(410).type("text/plain").send("This print-files ZIP is no longer on the server. Ask IDENTEE to send it again.");
    return;
  }
  res.download(p, f.fileName);
});
