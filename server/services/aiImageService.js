// services/aiImageService.js
//
// Talks to the image AI that makes t-shirt designs from a description.
// Provider: Google Gemini "Nano Banana" (chosen 10 Oct 2026, see
// docs/AI_PLAN.md). The key lives in server/.env as IDENTEE_GEMINI_API_KEY
// (GEMINI_API_KEY also works) and is never sent to the browser.
//
//   AI_IMAGE_MODEL      optional, defaults to gemini-nano-banana-2.1
//   AI_IMAGE_PROVIDER   "gemini" (default) or "mock" — mock draws a plain
//                       sample picture without calling anyone, for testing
//                       the whole flow without spending money
import zlib from "zlib";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const TIMEOUT_MS = 90_000;

const mock = () => process.env.AI_IMAGE_PROVIDER?.trim() === "mock";
// The shop's own key name comes first. (A computer may already have a
// GEMINI_API_KEY in its system settings for other work; that one would
// otherwise win over the project's .env file.)
const apiKey = () => process.env.IDENTEE_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
export const aiImageConfigured = () => mock() || Boolean(apiKey());
export const aiImageModel = () => (mock() ? "mock" : process.env.AI_IMAGE_MODEL?.trim() || "gemini-nano-banana-2.1");

// The stand-in picture for AI_IMAGE_PROVIDER=mock: a coloured disc with a
// ring on a plain white (or black) background, as a real PNG.
function mockPng(prompt) {
  const N = 512;
  const dark = /pure black/.test(prompt);
  const hue = [...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const rgb = (h) => [0, 120, 240].map((o) => Math.round(127 + 110 * Math.cos(((h + o) * Math.PI) / 180)));
  const [fill, ring, bg] = [rgb(hue), rgb(hue + 150), dark ? [0, 0, 0] : [255, 255, 255]];
  const raw = Buffer.alloc(N * (N * 3 + 1));
  for (let y = 0; y < N; y++) {
    raw[y * (N * 3 + 1)] = 0;
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - N / 2, y - N / 2);
      const c = d < 150 ? fill : d < 190 ? ring : bg;
      raw.set(c, y * (N * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(N, 0);
  head.writeUInt32BE(N, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// How each style is described to the AI.
export const AI_STYLES = {
  "Bold mascot": "bold sports-mascot illustration with thick clean outlines, flat colours and strong simple shapes",
  "Minimal line art": "minimal single-weight line art with very few lines and plenty of empty space",
  "Retro badge": "vintage round badge emblem with a retro screen-print look and a limited palette",
  Cartoon: "friendly cartoon illustration with clean outlines and flat colours",
  Watercolour: "soft watercolour painting with loose, flowing edges",
};

// "Photo to art": the styles a customer's own photo can be redrawn in.
export const PHOTO_STYLES = {
  Cartoon: "a clean cartoon illustration with bold outlines and flat colours",
  Sketch: "a hand-drawn pencil sketch with confident lines and light shading",
  Sticker: "a glossy die-cut sticker illustration with a thick white border around the subject",
  Watercolour: "a soft watercolour painting with loose edges",
  "Pop art": "a bold pop-art poster with halftone dots and strong contrasting colours",
};
export const photoArtPrompt = ({ style, teeColour, teeIsDark, variation, of }) =>
  [
    `Redraw the main subject of this photo as ${PHOTO_STYLES[style] || PHOTO_STYLES.Cartoon}, as artwork to print on a ${teeColour} t-shirt.`,
    "Keep the subject clearly recognisable: same pose, same features, same clothing colours.",
    `Remove the photo's surroundings. The background must be flat pure ${teeIsDark ? "black" : "white"} and nothing else.`,
    "One centred subject that fills most of the picture. Do not draw a t-shirt, a mockup, a frame or a border. No watermark or text.",
    of > 1 ? `This is option ${variation} of ${of}: vary the crop or the line style a little from the other option.` : "",
  ]
    .filter(Boolean)
    .join(" ");

// Fixing a picture that is already on the tee (the customer's upload or an AI design).
export const FIX_KINDS = ["sharpen", "recolour"];
export const fixPrompt = ({ kind, teeColour, teeIsDark }) =>
  kind === "recolour"
    ? `Recolour this design so it stands out clearly when printed on a ${teeColour} t-shirt. Keep exactly the same drawing, shapes, words and layout; change only the colours (for example dark lines become light on a dark t-shirt). The background must be flat pure ${teeIsDark ? "black" : "white"} and nothing else. Do not add a t-shirt, a frame or a watermark.`
    : `Redraw this exact image as clean, sharp, high-resolution artwork ready for printing. Keep the same design, shapes, colours, words and layout exactly as they are; only remove blur, noise, pixel blocks and jagged edges. Spell any words exactly as in the image. The background must be flat pure ${teeIsDark ? "black" : "white"} and nothing else. Do not add a t-shirt, a frame or a watermark.`;

// Picture shapes the AI offers; the closest to the print area is used.
const RATIOS = { "1:1": 1, "4:5": 0.8, "5:4": 1.25, "3:4": 0.75, "4:3": 4 / 3, "2:3": 2 / 3, "3:2": 1.5, "9:16": 9 / 16, "16:9": 16 / 9 };
export const nearestRatio = (wOverH) => {
  const want = Number(wOverH) > 0 ? Number(wOverH) : 1;
  return Object.entries(RATIOS).sort((a, b) => Math.abs(Math.log(a[1] / want)) - Math.abs(Math.log(b[1] / want)))[0][0];
};

// The full instruction for a new design. The plain background (white for
// light tees, black for dark ones) is what lets the Design Room cut the
// design out afterwards.
export function newDesignPrompt({ subject, style, teeColour, teeIsDark, variation, of }) {
  const bg = teeIsDark ? "black" : "white";
  return [
    `Artwork to be printed on a ${teeColour} t-shirt.`,
    `Subject: ${subject}.`,
    `Style: ${AI_STYLES[style] || AI_STYLES["Bold mascot"]}.`,
    `Rules: one centred design that fills most of the picture. The background must be flat pure ${bg} and nothing else: no scenery, no texture, no shadow on it.`,
    "Do not draw a t-shirt, a mockup, a person wearing it, a frame or a border. No watermark or signature.",
    `Use colours that stand out on a ${teeColour} t-shirt.`,
    "Only include words if the subject asks for them, spelled exactly as written.",
    of > 1 ? `This is option ${variation} of ${of}: make its composition clearly different from the other options.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
export const changeDesignPrompt = (change) =>
  `Edit this t-shirt design: ${change}. Keep everything else the same, including the flat plain background. Do not add a t-shirt, a frame or a watermark.`;

// The answer's shape differs a little between models, so the picture is found by looking for it.
function findImage(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (typeof node.data === "string" && node.data.length > 500 && (node.type === "image" || String(node.mime_type || node.mimeType || "").startsWith("image/"))) {
    return { data: node.data, mime: node.mime_type || node.mimeType || "image/jpeg" };
  }
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    const hit = findImage(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Asks the AI for one picture.
 * @param prompt  the full instruction
 * @param image   optional { data: Buffer, mime } — a picture to change
 * @param ratio   e.g. "1:1"
 * @returns { buffer, mime }
 */
export async function generateImage({ prompt, image, ratio = "1:1" }) {
  if (mock()) return { buffer: mockPng(prompt + (image ? "changed" : "")), mime: "image/png" };
  const key = apiKey();
  if (!key) throw Object.assign(new Error("The design maker is not set up yet."), { status: 503 });

  const input = [{ type: "text", text: prompt }];
  if (image) input.push({ type: "image", mime_type: image.mime || "image/png", data: image.data.toString("base64") });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiImageModel(), input, response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: ratio, image_size: "1K" } }),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw Object.assign(new Error(err.name === "AbortError" ? "The design maker took too long. Please try again." : "Could not reach the design maker. Please try again."), { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // keep Google's reason in the server log only — it can mention the account or the key
    console.error("[ai] image request failed:", res.status, json?.error?.message || json?.error?.status || "");
    const refused = res.status === 400 && /safety|policy|blocked|prohibited/i.test(json?.error?.message || "");
    const noBilling = res.status === 403 || res.status === 429;
    throw Object.assign(
      new Error(
        refused
          ? "The design maker couldn’t make that one. Try describing it a little differently. You were not charged for it."
          : noBilling
            ? "The design maker is unavailable right now. Please try again later."
            : "The design maker had a problem. Please try again.",
      ),
      { status: refused ? 422 : 502 },
    );
  }
  const found = findImage(json);
  if (!found) {
    console.error("[ai] no picture in the answer");
    throw Object.assign(new Error("No design came back. Try describing it differently."), { status: 502 });
  }
  return { buffer: Buffer.from(found.data, "base64"), mime: found.mime };
}
