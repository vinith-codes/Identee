// services/replicateService.js — the enlarger (Real-ESRGAN x4plus) run on Replicate's graphics cards (6 Nov 2026).
//
// Our server has no graphics card: this model takes hours per picture on its CPU (measured 6 Nov 2026), seconds on a
// GPU. Replicate charges per run (about ₹0.20–₹1 a picture). The same model made the files the print team approved.
//   REPLICATE_API_TOKEN   from replicate.com → API tokens (the admin pastes it into the server's .env)
//   REPLICATE_MOCK=1      laptop only: a plain smooth resize stands in, so the flow can be tried without paying
import sharp from "sharp";

const API = "https://api.replicate.com/v1";
const MODEL = "nightmareai/real-esrgan"; // Real-ESRGAN x4plus; face enhance stays OFF (it changes faces)
const token = () => process.env.REPLICATE_API_TOKEN?.trim() || "";
export const replicateMock = () => process.env.REPLICATE_MOCK?.trim() === "1";
export const replicateConfigured = () => replicateMock() || Boolean(token());
export const replicateModel = () => (replicateMock() ? "mock-resize" : "real-esrgan-x4plus");

// Replicate's graphics card takes at most 2,096,704 pixels (1448 × 1448) per picture (its error, 12 Nov 2026).
// A bigger picture is first made smaller to fit, a little under the limit; the model then draws it up to 4× and the
// caller resizes the result to the size it wants, so the print size is the same.
export const ENLARGER_MAX_PIXELS = 2_000_000;
/**
 * What to send to the enlarger for a W0×H0 picture that should end up `scale` times bigger.
 * @returns {{ w: number, h: number, scale: number, shrunk: boolean }}  the size sent, and the scale to ask for (≤ 4)
 */
export function fitForEnlarger(W0, H0, scale) {
  const f = Math.min(1, Math.sqrt(ENLARGER_MAX_PIXELS / (W0 * H0)));
  const w = Math.max(1, Math.floor(W0 * f)), h = Math.max(1, Math.floor(H0 * f));
  const want = (W0 * scale) / w; // how many times bigger the sent picture must become
  return { w, h, scale: Math.round(Math.min(4, Math.max(1, want)) * 100) / 100, shrunk: w < W0 || h < H0 };
}

const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

async function api(path, init = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  const text = await r.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }
  if (!r.ok) {
    const err = new Error(body?.detail || body?.error || `Replicate answered ${r.status}`);
    err.status = r.status === 402 ? 402 : r.status === 401 ? 503 : r.status === 429 ? 429 : 502;
    if (r.status === 429) err.retryAfter = waitSeconds(r.headers.get("retry-after"), err.message);
    throw err;
  }
  return body;
}

// "Request was throttled … Your rate limit resets in ~5s." (Replicate allows 6 new runs a minute while the account has
// under $5 credit, 12 Nov 2026): how many seconds to wait before trying again
export function waitSeconds(retryAfterHeader, message = "") {
  const h = Number(retryAfterHeader);
  if (Number.isFinite(h) && h > 0) return Math.min(60, Math.ceil(h));
  const m = /resets in ~?\s*(\d+)\s*s/i.exec(String(message));
  return m ? Math.min(60, Number(m[1]) + 1) : 10;
}

// a new run, tried again (up to 8 times) while Replicate says "throttled"
export async function createPrediction(body, log, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (let tries = 1; ; tries++) {
    try {
      return await api("/predictions", { method: "POST", body: JSON.stringify(body) });
    } catch (err) {
      if (err.status !== 429 || tries >= 8) {
        if (err.status === 429) err.message = `Replicate is busy for this account (too many runs a minute while its credit is under $5). Wait a minute and press Prepare again. (${err.message})`;
        throw err;
      }
      log(`Replicate asked us to wait (too many runs a minute): trying again in ${err.retryAfter} s…`);
      await sleep(err.retryAfter * 1000);
    }
  }
}

let versionId = null;
async function latestVersion() {
  if (versionId) return versionId;
  const m = await api(`/models/${MODEL}`);
  versionId = m?.latest_version?.id;
  if (!versionId) throw Object.assign(new Error("Replicate did not say which version of the enlarger to use."), { status: 502 });
  return versionId;
}

/**
 * Enlarge a picture. The RGB goes through the model exactly as the laptop tool did it (no see-through handed over:
 * the caller resizes the design's own shape smoothly, as the approved files were made).
 * @param {Buffer} rgbPng   a PNG with no alpha
 * @param {number} scale    how many times bigger (1–4; the model draws 4x and Replicate resizes to this)
 * @param {(t:string)=>void} [log]
 * @returns {Promise<Buffer>}  PNG
 */
export async function enlargeWithReplicate(rgbPng, scale, log = () => {}) {
  // too big for the graphics card: made smaller first (the result may then be smaller than asked: the caller resizes it)
  const m0 = await sharp(rgbPng, { limitInputPixels: false }).metadata();
  const fit = fitForEnlarger(m0.width, m0.height, scale);
  let png = rgbPng;
  if (fit.shrunk) {
    log(`Too big for the graphics card (${m0.width}×${m0.height}): sent as ${fit.w}×${fit.h}, enlarged ${fit.scale}×`);
    png = await sharp(rgbPng, { limitInputPixels: false }).resize(fit.w, fit.h, { kernel: "lanczos3" }).png({ compressionLevel: 3 }).toBuffer();
  }
  if (replicateMock()) {
    log("mock enlarger (plain resize) — laptop only");
    return sharp(png, { limitInputPixels: false }).resize(Math.round(fit.w * fit.scale), Math.round(fit.h * fit.scale), { kernel: "lanczos3" }).png({ compressionLevel: 3 }).toBuffer();
  }
  if (!token()) throw Object.assign(new Error("The enlarger (Replicate) is not set up on this server: REPLICATE_API_TOKEN is missing."), { status: 503 });
  const version = await latestVersion();
  const input = { image: `data:image/png;base64,${png.toString("base64")}`, scale: fit.scale, face_enhance: false };
  let p = await createPrediction({ version, input }, log);
  const started = Date.now();
  while (p.status === "starting" || p.status === "processing") {
    if (Date.now() - started > 10 * 60 * 1000) throw Object.assign(new Error("The enlarger took more than 10 minutes."), { status: 504 });
    await new Promise((r) => setTimeout(r, 2500));
    p = await api(`/predictions/${p.id}`);
    log(`enlarger: ${p.status}`);
  }
  if (p.status !== "succeeded") throw Object.assign(new Error(`The enlarger failed: ${p.error || p.status}`), { status: 502 });
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  const r = await fetch(url);
  if (!r.ok) throw Object.assign(new Error("The enlarged picture could not be fetched from Replicate."), { status: 502 });
  const out = Buffer.from(await r.arrayBuffer());
  return sharp(out, { limitInputPixels: false }).png({ compressionLevel: 3 }).toBuffer();
}
