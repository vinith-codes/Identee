// services/backgroundService.js — "Remove the background" for photos, done here on the server.
//
// The Design Room used to run this AI model in the customer's browser; on iPhones the model (about 44 MB) plus the
// 3D tee used more memory than Safari allows a page, and Safari reloaded the page (nothing happened). Here it runs
// on the server instead: free (no AI service, no request used), the same model and quality — ORMBG (Apache-2.0,
// onnx-community/ormbg-ONNX, the 8-bit version), run with onnxruntime-node (MIT).
//
// The model file is downloaded once into server/.cache/ (not kept in git): in the background when the server starts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import ort from "onnxruntime-node";

const MODEL_URL = "https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main/onnx/model_quantized.onnx";
const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".cache");
const MODEL_PATH = path.join(CACHE, "ormbg-quantized.onnx");
const SIZE = 1024; // the model looks at a 1024 × 1024 picture (preprocessor_config.json: resize, ÷255, no normalise)
const MAX_SIDE = 2000; // the cut-out is at most this big (keeps the PNG well under the 10 MB upload limit)

// the model file on disk (downloaded once; shared, so a download already under way is not started twice)
let fetching = null;
function modelFile() {
  if (fs.existsSync(MODEL_PATH)) return Promise.resolve(MODEL_PATH);
  if (!fetching) {
    fetching = (async () => {
      fs.mkdirSync(CACHE, { recursive: true });
      console.log("[background] downloading the background-removal model (once, about 44 MB)…");
      const r = await fetch(MODEL_URL);
      if (!r.ok) throw new Error(`model download failed: ${r.status}`);
      const tmp = `${MODEL_PATH}.part`;
      fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
      fs.renameSync(tmp, MODEL_PATH);
      console.log("[background] model ready");
      return MODEL_PATH;
    })().finally(() => {
      fetching = null;
    });
  }
  return fetching;
}

/**
 * Called when the server starts: the model file is fetched in the background a few seconds later, so the first
 * customer who removes a background doesn't wait for the 44 MB download. (The model itself is only loaded into
 * memory — about 0.3 s — on the first use, so a server where nobody uses it keeps that memory free.)
 */
export function prepareBackgroundRemoval() {
  setTimeout(() => modelFile().catch((err) => console.error("[background] model download failed (will retry on first use):", err.message)), 5000);
}

let ready = null;
async function session() {
  if (!ready) {
    ready = modelFile().then((file) => ort.InferenceSession.create(file));
    ready.catch(() => {
      ready = null; // the next try starts again (the download may have failed)
    });
  }
  return ready;
}

/**
 * The photo without its background.
 * @param {Buffer} buffer  the photo (any format sharp reads)
 * @returns {Promise<{ buffer: Buffer, width: number, height: number }>}  a PNG with a transparent background
 */
export async function removePhotoBackground(buffer) {
  const s = await session();
  // the photo, upright and at most MAX_SIDE, as plain RGB pixels
  const base = await sharp(buffer).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  // the model's input: 1024 × 1024, values 0–1, channels first (R plane, G plane, B plane)
  const small = await sharp(base.data, { raw: { width, height, channels: 3 } }).resize(SIZE, SIZE, { fit: "fill" }).raw().toBuffer();
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = small[i * 3] / 255;
    input[plane + i] = small[i * 3 + 1] / 255;
    input[2 * plane + i] = small[i * 3 + 2] / 255;
  }
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
  const raw = out[s.outputNames[0]].data;
  // the mask: how much of each pixel is the subject (0–1; squashed with a sigmoid if the model gave raw scores)
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < plane; i++) {
    if (raw[i] < lo) lo = raw[i];
    if (raw[i] > hi) hi = raw[i];
  }
  const scores = lo < -0.01 || hi > 1.01;
  const mask = Buffer.alloc(plane);
  for (let i = 0; i < plane; i++) {
    const v = scores ? 1 / (1 + Math.exp(-raw[i])) : raw[i];
    mask[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  // (extractChannel: resizing turns a one-channel picture into three, which put the mask in the wrong places)
  const alpha = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(width, height, { fit: "fill" }).extractChannel(0).raw().toBuffer();
  const png = await sharp(base.data, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
  return { buffer: png, width, height };
}
