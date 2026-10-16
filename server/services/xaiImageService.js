// services/xaiImageService.js
//
// The second picture service: xAI's Grok Imagine. Used when Google's picture service refuses
// (it refuses well-known people): for "photo to art", a change to a design and a fix (sharpen,
// recolour, enhance) — all edits of a picture — and for a new drawing typed by the customer.
// Off unless XAI_API_KEY is set in .env.
//
// .env:
//   XAI_API_KEY               the key from console.x.ai (the company's account)
//   XAI_IMAGE_MODEL           optional, default grok-imagine-image-2.0
//
// What a Grok picture costs (for the spending figures) is set in Admin → Settings → AI designs.
//
// API: POST https://api.x.ai/v1/images/edits — JSON { model, prompt, image: { type: "image_url", url } };
// the photo goes as a data URI. https://docs.x.ai/developers/model-capabilities/images/editing
// A new drawing: POST https://api.x.ai/v1/images/generations — JSON { model, prompt, n, aspect_ratio }.
const ENDPOINT = "https://api.x.ai/v1/images/edits";
const NEW_ENDPOINT = "https://api.x.ai/v1/images/generations";
const TIMEOUT_MS = 120_000; // a well-known person can take Grok about a minute

const key = () => process.env.XAI_API_KEY?.trim() || "";
export const xaiConfigured = () => Boolean(key());
export const xaiModel = () => process.env.XAI_IMAGE_MODEL?.trim() || "grok-imagine-image-2.0";

/**
 * Restyle a photo with Grok.
 * @param {{ prompt: string, image: { data: Buffer, mime: string } }} args
 * @returns {Promise<{ buffer: Buffer, mime: string }>}
 */
export async function xaiEditImage({ prompt, image }) {
  return askGrok(ENDPOINT, "image edit", {
    model: xaiModel(),
    prompt,
    image: { type: "image_url", url: `data:${image.mime || "image/jpeg"};base64,${image.data.toString("base64")}` },
  });
}

/**
 * A new drawing from the customer's words (no photo).
 * @param {{ prompt: string, ratio?: string }} args  ratio like "1:1", "3:4"
 * @returns {Promise<{ buffer: Buffer, mime: string }>}
 */
export async function xaiNewImage({ prompt, ratio }) {
  const body = { model: xaiModel(), prompt, n: 1 };
  const shape = grokRatio(ratio);
  if (!shape) return askGrok(NEW_ENDPOINT, "new image", body);
  // a shape Grok doesn't take is not a refusal: then ask again without it
  return askGrok(NEW_ENDPOINT, "new image", { ...body, aspect_ratio: shape }).catch((err) =>
    err?.badRequest ? askGrok(NEW_ENDPOINT, "new image", body) : Promise.reject(err),
  );
}

// The picture shapes Grok takes (it has no 4:5 or 5:4): the closest one to the print area's shape.
const GROK_RATIOS = ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "1:2", "2:1", "21:9"];
const ratioValue = (r) => {
  const [w, h] = String(r).split(":").map(Number);
  return w > 0 && h > 0 ? w / h : 0;
};
function grokRatio(ratio) {
  const want = ratioValue(ratio);
  if (!want) return null;
  return GROK_RATIOS.reduce((best, r) => (Math.abs(Math.log(ratioValue(r) / want)) < Math.abs(Math.log(ratioValue(best) / want)) ? r : best));
}

async function askGrok(endpoint, what, body) {
  if (!key()) throw Object.assign(new Error("The second picture service is not set up."), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw Object.assign(new Error("The design maker had a problem. Please try again."), { status: 502, cause: err });
  } finally {
    clearTimeout(timer);
  }
  // (a malformed request gets a plain-text answer, not JSON)
  const raw = await res.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  if (!res.ok) {
    // the reason stays in the server log only
    const why = json?.error?.message || json?.error || json?.message || raw.slice(0, 300);
    console.error(`[ai:xai] ${what} failed:`, res.status, typeof why === "string" ? why : JSON.stringify(why));
    const refused = res.status === 400 && /moderat|policy|safety|content|blocked|prohibited/i.test(raw);
    // 400 / 422 that is not a refusal: Grok didn't take something in the request (e.g. the picture shape)
    const badRequest = !refused && (res.status === 400 || res.status === 422);
    throw Object.assign(new Error("The design maker had a problem. Please try again."), { status: refused ? 422 : 502, badRequest });
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
