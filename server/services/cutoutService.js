// services/cutoutService.js
//
// Cuts an AI-made design out of its plain background, on the server, right
// after the picture is made. (The AI is asked for a flat white or black
// background for exactly this.) Doing it here means "Add to tee" in the
// Design Room is instant: the browser no longer has to download the picture,
// clear the background and upload the result every time.
//
// Same method as the browser's remover for plain backgrounds
// (frontend/src/studio/removeBackground.js): the background colour is cleared
// starting from the picture's edges, plus closed-in spots of exactly that
// colour, and the outline is softened.
import sharp from "sharp";

const NEAR = 44; // counts as background
const SOFT = 96; // edge pixels between NEAR and SOFT fade out
const EXACT = 14; // closed-in spots this close to the background colour go too

const dist = (d, i, c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);

/**
 * @param {Buffer} buffer  the picture as the AI returned it
 * @returns {Promise<{ buffer: Buffer, mime: string, width: number, height: number, cut: boolean }>}
 *          cut = false when the background was not plain (the picture is returned unchanged)
 */
export async function cutOutPlainBackground(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const unchanged = async () => ({ buffer, mime: `image/${(await sharp(buffer).metadata()).format === "png" ? "png" : "jpeg"}`, width: w, height: h, cut: false });

  // the picture's edge: is it one flat colour?
  const edge = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  const mid = (k) => edge.map((p) => data[p * 4 + k]).sort((a, b) => a - b)[edge.length >> 1];
  const colour = [mid(0), mid(1), mid(2)];
  const close = edge.filter((p) => dist(data, p * 4, colour) < 36).length;
  if (close < edge.length * 0.94) return unchanged();

  // everything connected to the edges in the background colour
  const gone = new Uint8Array(w * h);
  const stack = [];
  const push = (p) => {
    if (!gone[p] && dist(data, p * 4, colour) < NEAR) {
      gone[p] = 1;
      stack.push(p);
    }
  };
  edge.forEach(push);
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (gone[p] || dist(data, i, colour) < EXACT) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % w;
    const touches = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (p >= w && gone[p - w]) || (p < w * (h - 1) && gone[p + w]);
    if (touches) {
      const d = dist(data, i, colour);
      if (d < SOFT) data[i + 3] = Math.round((255 * (d - NEAR)) / (SOFT - NEAR));
    }
  }
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { buffer: png, mime: "image/png", width: w, height: h, cut: true };
}

// A cut-out put back on a plain background, for sending to the AI to be changed.
export const onPlainBackground = (buffer, dark) =>
  sharp(buffer)
    .flatten({ background: dark ? "#000000" : "#ffffff" })
    .jpeg({ quality: 92 })
    .toBuffer();
