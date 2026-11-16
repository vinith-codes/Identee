// controllers/printFileController.js — print-ready pictures and "Send to print team" (6 Nov 2026).
//
// After an order, the admin opens Orders → Designs & print files:
//   1. "Prepare for print" on a picture: the server enlarges it on Replicate (Topaz since 15 Nov 2026; Real-ESRGAN —
//      the model that made the files the print team approved — as the admin's other choice and Topaz's backup), then runs the approved recipe (services/printRecipe.js): no see-through, a
//      vector edge where solid ink meets the tee, 600 DPI. The result stays on this server (print-work/<key>/) and the
//      design's element remembers it (el.printFile); the admin's browser draws it into the print PDF (.ai).
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
import { fetchOurImage, isDarkHex, isOurUpload, makeAiPrintCopy, readSettings } from "./aiController.js";
import { ENLARGER_MAX_PIXELS, enlargeWithReplicate, enlargeWithTopaz, replicateConfigured, replicateMock, replicateModel, topazModel } from "../services/replicateService.js";
import { isAiDesignUrl } from "../utils/aiPricing.js";
import { aiTextConfigured, askJsonWithImage } from "../services/aiTextService.js";
import { PRINT_DPI, bleedEdges, runRecipe, unPaeth } from "../services/printRecipe.js";
import { cleanCutEdge } from "../services/cutoutService.js";
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
  // enlarger.choice: "topaz" | "real-esrgan" (Settings → AI designs, 15 Nov 2026); topazPricePerUnitInr: ₹ per Topaz unit
  res.json({ enlarger: { configured: replicateConfigured(), mock: replicateMock(), model: settings.printEnlarger === "real-esrgan" ? replicateModel() : topazModel(), choice: settings.printEnlarger, priceInr: replicateMock() ? 0 : settings.printEnlarger === "real-esrgan" ? settings.replicatePricePerImageInr : settings.topazPricePerUnitInr, /* (16 Nov 2026: the Prepare button showed Real-ESRGAN's ₹1 while Topaz is used — one Topaz unit, up to 24 MP) */ topazPricePerUnitInr: replicateMock() ? 0 : settings.topazPricePerUnitInr }, teamEmail: printTeamEmail(), keepDays: KEEP_DAYS, dpi: PRINT_DPI, options: { knockout: Boolean(settings.printKnockout), dropSpecks: settings.printDropSpecks !== false }, /* (16 Nov 2026) a picture under 4K is copied at 4K by AI first */ aiCopy: { on: settings.printAiCopy !== false, fourK: FOUR_K, priceInr: replicateMock() ? 0 : settings.price4kPerImageInr } });
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
  // the enlarger the admin chose (Settings → AI designs, 15 Nov 2026): Topaz, with Real-ESRGAN as its backup
  const useTopaz = settings.printEnlarger !== "real-esrgan";
  const user = req.user._id;
  const designId = String(design._id);
  const index = Number(req.body.index);
  const base = `${req.protocol}://${req.get("host")}`;

  const id = crypto.randomBytes(8).toString("hex");
  const job = { id, status: "queued", step: "Waiting for its turn…", log: [], createdAt: Date.now(), designId, index };
  const log = (t) => {
    job.step = t;
    job.log.push(`${new Date().toISOString().slice(11, 19)} ${t}`);
  };
  job.work = async () => {
    const ourReq = { protocol: base.split(":")[0], get: () => base.replace(/^https?:\/\//, "") };
    log("Fetching the picture…");
    // (16 Nov 2026) the AI's 4K copy of the picture, when there is one, is what gets enlarged
    let srcUrl = el.printSrc && isOurUpload(el.printSrc) ? el.printSrc : el.src;
    let stored = await fetchOurImage(srcUrl, ourReq);
    let meta = await sharp(stored.data, { limitInputPixels: false }).rotate().metadata();
    // photo or art: judged once, on the picture fetched first (the uploaded one, unless a 4K copy was already made)
    let kind = null;
    const kindOf = async () => (kind ??= await askPictureKind({ src: el.src, artLibrary: Boolean(el.artDesignId), data: stored.data }));
    let aiCost = 0;
    if (srcUrl === el.src) {
      const plan = aiCopyPlan({ on: settings.printAiCopy, off: el.aiCopyOff, width: meta.width, height: meta.height });
      if (plan.copy) {
        log(`Not 4K (${meta.width}×${meta.height}): making a 4K copy with AI first (the same picture, nothing changed) — about a minute…`);
        try {
          // (16 Nov 2026, the owner's rule) Google first; when Google refuses, Grok makes the copy (about 2K), then Topaz
          const made = await makeAiPrintCopy({ designId, index, user, req: ourReq, settings, allowGrok: true });
          srcUrl = made.url;
          aiCost = made.costInr;
          stored = await fetchOurImage(srcUrl, ourReq);
          meta = await sharp(stored.data, { limitInputPixels: false }).rotate().metadata();
          log(made.byGrok ? `Google refused, so Grok made the copy (${meta.width}×${meta.height}) — compare it with the original; Topaz enlarges that` : `4K copy made (${meta.width}×${meta.height}), Topaz enlarges that`);
        } catch (err) {
          // the AI said no, or its budget is used up: the original is enlarged, as before
          log(`No 4K copy (${err.message}) — enlarging the uploaded picture instead`);
        }
      } else if (plan.why) log(plan.why);
    }
    const W0 = meta.width, H0 = meta.height;
    // how many times bigger: enough for 600 DPI at its print width, at most 4x (6x with Topaz, 15 Nov 2026: it has no
    // input limit and draws real detail), and never a picture too big to hold
    let keep = Math.min(useTopaz ? 6 : 4, Math.max(1, (PRINT_DPI * printCm) / 2.54 / W0));
    keep = Math.min(keep, Math.sqrt(MAX_PIXELS / (W0 * H0)));
    keep = Math.max(1, Math.round(keep * 4) / 4);
    const W = Math.round(W0 * keep), H = Math.round(H0 * keep);
    // the colours under the see-through area are extended outward first, so no dark fringe appears at the edge
    const raw = await sharp(stored.data, { limitInputPixels: false }).rotate().ensureAlpha().raw().toBuffer();
    // an older cut-out's light (or magenta) rim: each outline pixel keeps only its artwork share (8 Nov 2026)
    const cleaned = cleanCutEdge(raw, W0, H0);
    if (cleaned) log(`Cleaned the cut edge: ${cleaned.pixels} outline pixels (background was rgb(${cleaned.key.join(", ")}))`);
    // the design's own see-through shape (after that clean-up), before the colours under it are filled in
    const alphaSmall = await sharp(raw, { raw: { width: W0, height: H0, channels: 4 }, limitInputPixels: false }).extractChannel(3).raw().toBuffer();
    bleedEdges(raw, W0, H0);
    const rgbPng = await sharp(raw, { raw: { width: W0, height: H0, channels: 4 }, limitInputPixels: false }).removeAlpha().png({ compressionLevel: 3 }).toBuffer();
    // already big enough for its print size: no enlarging, no Replicate run, no cost (12 Nov 2026)
    const enlarge = keep > 1;
    let rgb;
    // which enlarger made it (15 Nov 2026, shown to the admin): "topaz", "real-esrgan" (the admin's choice) or
    // "real-esrgan-backup" (Topaz failed); none when the picture was not enlarged
    let enlarger = null;
    let units = 0; // Topaz's billing units
    if (enlarge) {
      const made = await enlargeForPrint({ rgbPng, keep, useTopaz, kindOf, log, sizes: `${W0}×${H0} → ${W}×${H}` });
      enlarger = made.enlarger;
      units = made.units;
      // (Topaz gives 2×, 4× or 6×, and Real-ESRGAN may give less than asked: always resized to the exact size)
      rgb = await sharp(made.big, { limitInputPixels: false }).removeAlpha().resize(W, H, { kernel: "lanczos3" }).raw().toBuffer();
    } else {
      log(`Already big enough (${W0}×${H0}): not enlarged`);
      rgb = await sharp(rgbPng, { limitInputPixels: false }).removeAlpha().raw().toBuffer();
    }
    // the design's own see-through shape, resized smoothly (as the approved files were made)
    const alpha = await sharp(alphaSmall, { raw: { width: W0, height: H0, channels: 1 }, limitInputPixels: false }).resize(W, H, { kernel: "lanczos3" }).extractChannel(0).raw().toBuffer(); // (one channel: sharp gives 3 otherwise)
    log("Cleaning the edge and drawing the vector edge…");
    const dpi = Math.round(W / (printCm / 2.54));
    const made = await runRecipe({ rgb, alpha, W, H, tee, knockout, dropSpecks, dpi, scale: keep, log });
    const key = keyOf(srcUrl, `${tee}${knockout ? "-ko" : ""}${dropSpecks ? "-sp" : ""}`, keep);
    const dir = path.join(WORK, key);
    await fsp.mkdir(dir, { recursive: true });
    // made again under the same key: the old sheet PNGs are of the old picture
    for (const f of await fsp.readdir(dir)) if (/^sheet-\d+\.png$/.test(f)) await fsp.rm(path.join(dir, f), { force: true });
    await fsp.writeFile(path.join(dir, "picture.flate"), made.flate);
    const preview = await sharp(made.picture, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false }).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await fsp.writeFile(path.join(dir, "preview.webp"), preview);
    const info = { key, width: W, height: H, keep, cm: printCm, tee, src: srcUrl, ...(srcUrl !== el.src ? { aiCopy: true } : {}), dpi: PRINT_DPI, realDpi: dpi, ...(enlarger ? { enlarger } : {}), clip: made.clip, shapes: made.shapes, steps: made.steps, bytes: made.flate.length, stats: made.stats, madeAt: new Date().toISOString() };
    await fsp.writeFile(path.join(dir, "meta.json"), JSON.stringify(info));
    // the design remembers it (read again: the admin may have changed something meanwhile)
    const fresh = await Customization.findById(designId);
    const target = fresh?.elements?.[index];
    if (!fresh || !target) throw new Error("The design changed while the picture was being prepared. Try again.");
    const st = made.stats || {};
    target.printFile = { key, width: W, height: H, keep, cm: printCm, madeAt: new Date(), realDpi: dpi, ...(enlarger ? { enlarger } : {}), specks: st.specks || 0, specksDropped: st.specksDropped || 0, thinPct: st.thinPct || 0, knockout: Boolean(st.knockout), ...(srcUrl !== el.src ? { aiCopy: true } : {}) };
    await fresh.save();
    const costInr = printCost({ enlarge, enlarger, units, settings, mock: replicateMock() });
    if (enlarge) await AiUsage.create({ user, kind: "print", prompt: `Print-ready picture (design ${designId}, picture ${index + 1}) · ${keep}× · ${ENLARGER_WORDS[enlarger] || "Replicate"}`, images: 1, costInr, model: enlarger === "topaz" ? topazModel() : replicateModel() });
    log("Done.");
    return { printFile: target.printFile, costInr: Math.round((costInr + aiCost) * 100) / 100 };
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
  const out = path.join(WORK, req.params.key, `sheet-${w}.png`);
  if (!fs.existsSync(out)) {
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

// Enlarge one picture for print (15 Nov 2026): Topaz first when chosen, Real-ESRGAN when the admin chose it or when
// Topaz fails in any way (refused, failed, over its time limit). topaz / esrgan: the enlargers (tests pass stand-ins).
// -> { big: PNG, enlarger: "topaz" | "real-esrgan" | "real-esrgan-backup", units: Topaz's billing units (0 otherwise) }
export async function enlargeForPrint({ rgbPng, keep, useTopaz, kindOf, log = () => {}, sizes = "", topaz = enlargeWithTopaz, esrgan = enlargeWithReplicate }) {
  if (useTopaz) {
    try {
      const kind = await Promise.resolve().then(kindOf).catch(() => "art"); // (unsure: art, Topaz's plain model)
      log(`Enlarging ${keep}× with Topaz (${kind === "photo" ? "a photo" : "art"}${sizes ? `, ${sizes}` : ""})…`);
      const t = await topaz(rgbPng, keep, { kind, log });
      return { big: t.png, enlarger: "topaz", units: t.units || 0 };
    } catch (err) {
      // (16 Nov 2026, the user: no picture may be made smaller) the backup's graphics card takes at most about
      // 2 MP, so a bigger picture would be shrunk before enlarging: then nothing is made and the admin tries again
      const m = await sharp(rgbPng, { limitInputPixels: false }).metadata();
      if (m.width * m.height > ENLARGER_MAX_PIXELS) {
        console.error("[print-files] Topaz failed, the picture is too big for the backup:", err?.message || err);
        throw new Error(`Topaz did not work (${err?.message || "no answer"}). The backup enlarger would have to make this ${m.width} × ${m.height} picture smaller first, so nothing was made — press Prepare for print again in a few minutes.`);
      }
      console.error("[print-files] Topaz failed, Real-ESRGAN instead:", err?.message || err);
      log(`Topaz did not work (${err?.message || "no answer"}): Real-ESRGAN instead (the picture is small enough, nothing is shrunk)`);
    }
  }
  log(`Enlarging ${keep}× with Real-ESRGAN on the graphics-card service${sizes ? ` (${sizes})` : ""}…`);
  const big = await esrgan(rgbPng, keep, log);
  return { big, enlarger: useTopaz ? "real-esrgan-backup" : "real-esrgan", units: 0 };
}

// What enlarging one picture cost (15 Nov 2026): Topaz = its billing units × ₹ per unit; Real-ESRGAN (chosen, or as
// Topaz's backup) = its price per picture; nothing when not enlarged or on the laptop's stand-in.
export function printCost({ enlarge, enlarger, units = 0, settings, mock = false }) {
  if (!enlarge || mock) return 0;
  const inr = enlarger === "topaz" ? units * (settings.topazPricePerUnitInr || 0) : settings.replicatePricePerImageInr || 0;
  return Math.round(inr * 100) / 100;
}
// the end of the admin's AI-use line ("Print-ready picture (…) · 2× · Topaz")
const ENLARGER_WORDS = { topaz: "Topaz", "real-esrgan": "Replicate", "real-esrgan-backup": "Replicate (Topaz failed)" };

// Make the AI's 4K copy before Topaz? (16 Nov 2026, the logo tests: a 4K copy enlarged by Topaz printed cleanest.)
// The user's rule: when the admin presses Prepare for print and the picture is not 4K, it is copied at 4K first, then
// Topaz enlarges the copy. 4K = its longest side is at least 3,840 px (4K UHD; the AI's own 4K pictures are 4,096+).
// on: the admin's setting; off: the admin dropped this picture's copy; width/height: the picture's pixels.
export const FOUR_K = 3840;
export function aiCopyPlan({ on, off, width, height }) {
  if (on === false) return { copy: false, why: "" };
  if (off) return { copy: false, why: "The admin chose the uploaded picture: no 4K copy" };
  if (!(Math.max(width, height) < FOUR_K)) return { copy: false, why: Number.isFinite(Math.max(width, height)) ? `Already 4K (${width}×${height}): no AI copy` : "" };
  return { copy: true, why: "" };
}

// Photo or art? (15 Nov 2026) Topaz is told which: a photo gets its faces kept sharp, a drawing the "CGI" model. Main
// had no such decision, so: a picture the design maker made (ai-designs) or one from the art library is art, unless it
// has no see-through at all and its pixels look like a photograph (Photo Studio's enhanced photo is kept uncut); any
// other picture (the customer's upload: a photo or a logo) is judged by its pixels.
export async function pictureKind({ src, artLibrary = false, data }) {
  const { data: px, info } = await sharp(data, { limitInputPixels: false }).rotate().ensureAlpha().resize(256, 256, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  let opaque = true;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 250) {
      opaque = false;
      break;
    }
  }
  const made = artLibrary || isAiDesignUrl(src) || /\/ai-designs\//.test(String(src || ""));
  if (made && !opaque) return "art";
  return looksLikePhoto(px, info.width, info.height) ? "photo" : "art";
}
// Photo or art, asked of the text AI (16 Nov 2026). The pixel rule below is fooled by small JPEG pictures: the user's
// 117 px globe logo looked like a photo (JPEG noise = many colours), and a 1199 px photo of a person looked like art.
// The AI sees what is in it, for a fraction of a paisa. A design-maker or art-library cut-out is art without asking;
// when the AI is not set up or doesn't answer, the pixel rule decides as before.
export async function askPictureKind({ src, artLibrary = false, data }) {
  const made = artLibrary || isAiDesignUrl(src) || /\/ai-designs\//.test(String(src || ""));
  if (made) {
    const { isOpaque } = await sharp(data, { limitInputPixels: false }).stats();
    if (!isOpaque) return "art";
  }
  if (aiTextConfigured()) {
    try {
      const small = await sharp(data, { limitInputPixels: false }).rotate().flatten({ background: "#ffffff" }).resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      const out = await askJsonWithImage(
        'Is this picture a PHOTOGRAPH (taken with a camera: real people, faces, animals, places or things) or ARTWORK (a logo, emblem, badge, lettering, drawing, illustration, painting, cartoon or other digital graphic)? A logo with 3D shading or gradients is still ARTWORK. Answer only {"kind":"photo"} or {"kind":"art"}.',
        { data: small, mime: "image/jpeg" },
        0,
        undefined,
        { timeoutMs: 15_000 },
      );
      if (out?.kind === "photo" || out?.kind === "art") return out.kind;
    } catch {
      /* the pixel rule decides */
    }
  }
  return pictureKind({ src, artLibrary, data });
}

// A photograph has thousands of colours and few neighbouring pixels exactly alike; a logo or a flat drawing has a few
// colours and large flat areas. rgba: a small copy (about 256 px), raw RGBA; only its solid pixels count.
export function looksLikePhoto(rgba, w, h) {
  let solid = 0, pairs = 0, flat = 0;
  const colours = new Set();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 128) continue;
      solid++;
      colours.add(((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3));
      if (x + 1 < w && rgba[i + 7] >= 128) {
        pairs++;
        if (Math.max(Math.abs(rgba[i] - rgba[i + 4]), Math.abs(rgba[i + 1] - rgba[i + 5]), Math.abs(rgba[i + 2] - rgba[i + 6])) <= 2) flat++;
      }
    }
  }
  if (solid < 400) return false;
  return colours.size >= 1200 && flat / Math.max(1, pairs) < 0.6;
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
