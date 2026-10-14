// services/xaiImageService.js
//
// The second picture service: xAI's Grok Imagine. Used only for "photo to art" when Google's
// picture service refuses the customer's photo (it refuses well-known people). Off unless
// XAI_API_KEY is set in .env.
//
// .env:
//   XAI_API_KEY               the key from console.x.ai (the company's account)
//   XAI_IMAGE_MODEL           optional, default grok-imagine-image-2.0
//   XAI_PRICE_PER_IMAGE_INR   optional, what one art version costs in ₹ (photo in + art out), default 7
//
// API: POST https://api.x.ai/v1/images/edits — JSON { model, prompt, image: { type: "image_url", url } };
// the photo goes as a data URI. https://docs.x.ai/developers/model-capabilities/images/editing
const ENDPOINT = "https://api.x.ai/v1/images/edits";
const TIMEOUT_MS = 90_000;

const key = () => process.env.XAI_API_KEY?.trim() || "";
export const xaiConfigured = () => Boolean(key());
export const xaiModel = () => process.env.XAI_IMAGE_MODEL?.trim() || "grok-imagine-image-2.0";
export const xaiPricePerImageInr = () => {
  const n = Number(process.env.XAI_PRICE_PER_IMAGE_INR);
  return Number.isFinite(n) && n >= 0 ? n : 7;
};

/**
 * Restyle a photo with Grok.
 * @param {{ prompt: string, image: { data: Buffer, mime: string } }} args
 * @returns {Promise<{ buffer: Buffer, mime: string }>}
 */
export async function xaiEditImage({ prompt, image }) {
  if (!key()) throw Object.assign(new Error("The second picture service is not set up."), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify({
        model: xaiModel(),
        prompt,
        image: { type: "image_url", url: `data:${image.mime || "image/jpeg"};base64,${image.data.toString("base64")}` },
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw Object.assign(new Error("The design maker had a problem. Please try again."), { status: 502, cause: err });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // the reason stays in the server log only
    const why = json?.error?.message || json?.error || json?.message || "";
    console.error("[ai:xai] image edit failed:", res.status, typeof why === "string" ? why : JSON.stringify(why));
    const refused = res.status === 400 && /moderat|policy|safety|content|blocked|prohibited/i.test(JSON.stringify(json || ""));
    throw Object.assign(new Error("The design maker had a problem. Please try again."), { status: refused ? 422 : 502 });
  }
  // the picture comes back as base64 or as a short-lived link
  const item = json?.data?.[0] || json;
  const b64 = item?.b64_json || item?.base64 || item?.image?.base64;
  if (b64) return { buffer: Buffer.from(b64, "base64"), mime: "image/png" };
  const url = item?.url || item?.image?.url;
  if (url) {
    const img = await fetch(url);
    if (!img.ok) throw Object.assign(new Error("The design maker had a problem. Please try again."), { status: 502 });
    return { buffer: Buffer.from(await img.arrayBuffer()), mime: img.headers.get("content-type") || "image/png" };
  }
  console.error("[ai:xai] no picture in the reply:", JSON.stringify(json || "").slice(0, 300));
  throw Object.assign(new Error("The design maker had a problem. Please try again."), { status: 502 });
}
