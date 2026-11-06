// controllers/printFileController.js — print-ready pictures and "Send to print team" (6 Nov 2026).
//
// After an order, the admin opens Orders → Designs & print files:
//   1. "Prepare for print" on a picture: the server enlarges it on Replicate (Real-ESRGAN, the model that made the
//      files the print team approved), then runs the approved recipe (services/printRecipe.js): no see-through, a
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
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import Order from "../models/orderModel.js";
import AiUsage from "../models/aiUsageModel.js";
import { fetchOurImage, isDarkHex, isOurUpload, readSettings } from "./aiController.js";
import { enlargeWithReplicate, replicateConfigured, replicateMock, replicateModel } from "../services/replicateService.js";
import { PRINT_DPI, bleedEdges, runRecipe } from "../services/printRecipe.js";
import { fromAddress, isEmail, mailer } from "../utils/mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(__dirname, "..", "print-work"); // print-ready pictures
const FILES = path.join(__dirname, "..", "print-files"); // ZIPs sent to the print team
const KEEP_DAYS = 14; // how long a sent ZIP's link works
const MAX_PIXELS = 90e6; // the biggest print-ready picture the server will hold in memory
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
  res.json({ enlarger: { configured: replicateConfigured(), mock: replicateMock(), model: replicateModel(), priceInr: replicateMock() ? 0 : settings.replicatePricePerImageInr }, teamEmail: printTeamEmail(), keepDays: KEEP_DAYS, dpi: PRINT_DPI });
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
  const tee = isDarkHex(garment?.colors?.find((c) => c.slug === design.color)?.hex) ? "black" : "white";
  const settings = await readSettings();
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
    log("Fetching the picture…");
    const stored = await fetchOurImage(el.src, { protocol: base.split(":")[0], get: () => base.replace(/^https?:\/\//, "") });
    const meta = await sharp(stored.data, { limitInputPixels: false }).rotate().metadata();
    const W0 = meta.width, H0 = meta.height;
    // how many times bigger: enough for 600 DPI at its print width, at most 4x, and never a picture too big to hold
    let keep = Math.min(4, Math.max(1, (PRINT_DPI * printCm) / 2.54 / W0));
    keep = Math.min(keep, Math.sqrt(MAX_PIXELS / (W0 * H0)));
    keep = Math.max(1, Math.round(keep * 4) / 4);
    const W = Math.round(W0 * keep), H = Math.round(H0 * keep);
    // the colours under the see-through area are extended outward first, so no dark fringe appears at the edge
    const raw = await sharp(stored.data, { limitInputPixels: false }).rotate().ensureAlpha().raw().toBuffer();
    bleedEdges(raw, W0, H0);
    const rgbPng = await sharp(raw, { raw: { width: W0, height: H0, channels: 4 }, limitInputPixels: false }).removeAlpha().png({ compressionLevel: 3 }).toBuffer();
    log(`Enlarging ${keep}× on the graphics-card service (${W0}×${H0} → ${W}×${H})…`);
    const big = await enlargeWithReplicate(rgbPng, keep, log);
    const rgb = await sharp(big, { limitInputPixels: false }).removeAlpha().resize(W, H, { kernel: "lanczos3" }).raw().toBuffer();
    // the design's own see-through shape, resized smoothly (as the approved files were made)
    const alpha = await sharp(stored.data, { limitInputPixels: false }).rotate().ensureAlpha().extractChannel(3).resize(W, H, { kernel: "lanczos3" }).raw().toBuffer();
    log("Cleaning the edge and drawing the vector edge…");
    const made = await runRecipe({ rgb, alpha, W, H, tee, log });
    const key = keyOf(el.src, tee, keep);
    const dir = path.join(WORK, key);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, "picture.flate"), made.flate);
    const preview = await sharp(made.picture, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false }).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await fsp.writeFile(path.join(dir, "preview.webp"), preview);
    const info = { key, width: W, height: H, keep, cm: printCm, tee, src: el.src, dpi: PRINT_DPI, clip: made.clip, shapes: made.shapes, steps: made.steps, bytes: made.flate.length, madeAt: new Date().toISOString() };
    await fsp.writeFile(path.join(dir, "meta.json"), JSON.stringify(info));
    // the design remembers it (read again: the admin may have changed something meanwhile)
    const fresh = await Customization.findById(designId);
    const target = fresh?.elements?.[index];
    if (!fresh || !target) throw new Error("The design changed while the picture was being prepared. Try again.");
    target.printFile = { key, width: W, height: H, keep, cm: printCm, madeAt: new Date() };
    await fresh.save();
    const costInr = replicateMock() ? 0 : Math.round((settings.replicatePricePerImageInr || 0) * 100) / 100;
    await AiUsage.create({ user, kind: "print", prompt: `Print-ready picture (design ${designId}, picture ${index + 1}) · ${keep}× · Replicate`, images: 1, costInr, model: replicateModel() });
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

async function sweepExpired() {
  const orders = await Order.find({ "printFiles.expiresAt": { $lt: new Date() } }).select("printFiles");
  for (const o of orders) {
    const keep = [];
    for (const f of o.printFiles) {
      if (f.expiresAt && f.expiresAt < new Date()) await fsp.rm(path.join(FILES, String(o._id), f.fileName), { force: true }).catch(() => {});
      else keep.push(f);
    }
    o.printFiles = keep;
    await o.save();
  }
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
  const to = printTeamEmail();
  if (!isEmail(to)) {
    res.status(500);
    throw new Error("PRINT_TEAM_EMAIL on the server is not a valid email address.");
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + KEEP_DAYS * 24 * 3600 * 1000);
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const link = `${proto}://${req.get("host")}/api/print-files/dl/${token}`;
  const number = order.invoiceNumber || String(order._id).slice(-8).toUpperCase();
  const customer = order.user?.name || [order.shippingAddress?.firstName, order.shippingAddress?.lastName].filter(Boolean).join(" ") || "";
  const mb = (size / 1e6).toFixed(1);
  const until = expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  await mailer().sendMail({
    from: fromAddress(),
    to,
    cc: isEmail(req.user?.email) ? req.user.email : undefined,
    subject: `IDENTEE print files · order ${number}`,
    text: `Print files for IDENTEE order ${number}${customer ? ` (${customer})` : ""}.\n\nDownload (${mb} MB, link works until ${until}):\n${link}\n\nInside the ZIP: one .ai (and the same as .pdf) per print and size, a PNG of each, the job cards with the measurements, the previews and ORDER-SHEET.txt.\nPictures are at 600 DPI with a vector edge; words are vector shapes. Please print each file at 100%.\n\nIDENTEE · info@identee.co.in`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.5">
<h2 style="color:#8A6F2E;margin:0 0 8px">Print files · order ${number}</h2>
${customer ? `<p style="margin:0 0 12px">${customer}</p>` : ""}
<p><a href="${link}" style="display:inline-block;background:#141110;color:#F0D585;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Download the print files (${mb} MB)</a></p>
<p style="color:#555;font-size:13px">The link works until ${until}.<br>Inside the ZIP: one <b>.ai</b> (and the same as .pdf) per print and size, a PNG of each, the job cards with the measurements, the previews and ORDER-SHEET.txt.<br>Pictures are at 600 DPI with a vector edge; words are vector shapes. Please print each file at 100%.</p>
<p style="color:#999;font-size:12px">IDENTEE · info@identee.co.in</p></div>`,
  });
  const dir = path.join(FILES, String(order._id));
  await fsp.mkdir(dir, { recursive: true });
  await fsp.rename(tmp, path.join(dir, fileName));
  order.printFiles.push({ fileName, bytes: size, token, expiresAt, sentTo: to, sentAt: new Date(), sentBy: req.user._id });
  await order.save();
  sweepExpired().catch((e) => console.error("[print-files] sweep:", e.message));
  res.status(201).json({ sentTo: to, link, expiresAt, fileName, bytes: size });
});

// GET /api/print-files/orders/:id/sent   (admin or seller)
export const listSentPrintZips = asyncHandler(async (req, res) => {
  const order = await orderOr404(req, res);
  res.json({ teamEmail: printTeamEmail(), sent: order.printFiles.map((f) => ({ fileName: f.fileName, bytes: f.bytes, sentTo: f.sentTo, sentAt: f.sentAt, expiresAt: f.expiresAt, expired: f.expiresAt < new Date() })) });
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
