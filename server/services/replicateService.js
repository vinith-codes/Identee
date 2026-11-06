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
    err.status = r.status === 402 ? 402 : r.status === 401 ? 503 : 502;
    throw err;
  }
  return body;
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
  if (replicateMock()) {
    log("mock enlarger (plain resize) — laptop only");
    const m = await sharp(rgbPng, { limitInputPixels: false }).metadata();
    return sharp(rgbPng, { limitInputPixels: false }).resize(Math.round(m.width * scale), Math.round(m.height * scale), { kernel: "lanczos3" }).png({ compressionLevel: 3 }).toBuffer();
  }
  if (!token()) throw Object.assign(new Error("The enlarger (Replicate) is not set up on this server: REPLICATE_API_TOKEN is missing."), { status: 503 });
  const version = await latestVersion();
  const input = { image: `data:image/png;base64,${rgbPng.toString("base64")}`, scale: Math.round(scale * 100) / 100, face_enhance: false };
  let p = await api("/predictions", { method: "POST", body: JSON.stringify({ version, input }) });
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
