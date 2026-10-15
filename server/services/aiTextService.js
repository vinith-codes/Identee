// services/aiTextService.js
//
// The text AI behind the Design Room's assistant: slogans written to order,
// and turning a typed request ("make the text gold") into changes to the design. Uses the same Google key as the image maker
// (IDENTEE_GEMINI_API_KEY) with a small, cheap text model; a slogan request
// costs a fraction of a paisa.
//
//   AI_TEXT_MODEL   optional, defaults to gemini-flash-lite-latest

const TIMEOUT_MS = 20_000;
const apiKey = () => process.env.IDENTEE_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
export const aiTextConfigured = () => Boolean(apiKey());
const model = () => process.env.AI_TEXT_MODEL?.trim() || "gemini-flash-lite-latest";

/**
 * @param ask     what the customer wants a slogan about, in their own words
 * @param tone    optional: Funny | Bold | Emotional | Simple
 * @param avoid   lines already shown (so "show more" gives new ones)
 * @param count   how many
 * @returns {Promise<string[]>}
 */
export async function writeSlogans({ ask, tone, avoid = [], count = 5 }) {
  const key = apiKey();
  if (!key) throw Object.assign(new Error("not set up"), { status: 503 });
  const prompt = [
    `Write ${count} slogans to print on a t-shirt.`,
    `The customer asked: "${ask}".`,
    tone ? `Tone: ${tone.toLowerCase()}.` : "Mix the tones: some warm, some witty, some bold.",
    "Each slogan: 2 to 7 words, easy to read from a distance, no hashtags, no emojis, no full stop at the end unless it is two short sentences. Do not wrap a slogan in quotation marks, but keep normal apostrophes (mom's, don't).",
    "Write in the language the customer used (if they wrote in Tamil or Tanglish, answer the same way).",
    "Be specific to what they asked, not generic.",
    avoid.length ? `Do not repeat or closely copy these: ${avoid.slice(-15).join(" | ")}.` : "",
    "Answer with a JSON array of strings and nothing else.",
  ]
    .filter(Boolean)
    .join(" ");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 1, responseMimeType: "application/json" } }),
      signal: ctrl.signal,
    });
  } catch {
    throw Object.assign(new Error("unreachable"), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[ai] slogan request failed:", res.status, json?.error?.message || "");
    throw Object.assign(new Error("failed"), { status: 502 });
  }
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  let list = [];
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.slogans) ? parsed.slogans : [];
  } catch {
    list = text.split("\n");
  }
  const seen = new Set(avoid.map((s) => s.toLowerCase()));
  const out = [];
  for (const raw of list) {
    const s = String(raw || "").replace(/^[\s\-*\d.)"“”]+|["“”\s]+$/g, "").slice(0, 80);
    if (s.length < 2 || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  if (!out.length) throw Object.assign(new Error("empty"), { status: 502 });
  return out.slice(0, count);
}

// A shared way to ask the text model for a JSON answer.
async function askJson(prompt, temperature = 0.3) {
  const key = apiKey();
  if (!key) throw Object.assign(new Error("not set up"), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature, responseMimeType: "application/json" } }),
      signal: ctrl.signal,
    });
  } catch {
    throw Object.assign(new Error("unreachable"), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[ai] text request failed:", res.status, json?.error?.message || "");
    throw Object.assign(new Error("failed"), { status: 502 });
  }
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
}

/**
 * "Edit the tee by chat": turns what the customer typed into a short list of
 * changes to their design. The Design Room checks every change before
 * applying it (studio/aiOps.js) — nothing the model says is trusted blindly.
 *
 * @param message  what the customer typed
 * @param design   { tee, openArea, selectedId, areas: [{ key, label, side, free }], fonts: [..],
 *                   teeColours: [names], pictureStyles: [names],
 *                   items: [{ id, type, is?, area, text?, font?, color?, sizeCm?, shape?, bold?, italic? }] }
 * @returns {Promise<{ reply: string, ops: object[] }>}
 */
export async function planEdit({ message, design }) {
  const prompt = [
    "You are the design assistant inside a custom t-shirt design tool. The customer types a message; decide what to change on their design.",
    "Answer with JSON only: {\"reply\": string, \"ops\": array}.",
    "reply: one or two short friendly sentences in the customer's language, saying what you changed, or answering their question. Never mention JSON, ids or ops.",
    "ops: the changes, in order. Use [] when the message is a question or you cannot do it (then say so in reply and suggest what you can do: slogans, making a picture design, layouts, checking the design, colours, sizes).",
    "Allowed ops:",
    '- {"op":"update","id":ID,"set":{...}} where set may contain: "text" (string), "fontFamily" (one of the fonts listed), "color" (#RRGGBB ink colour), "bold"/"italic"/"underline" (true/false), "shape" ("straight"|"curved-up"|"curved-down"|"vertical"), "align" ("left"|"center"|"right"), "letterSpacingPct" (-5 to 40), "outlineColor" (#RRGGBB or "none"), "scale" (number: 1.3 = 30% bigger, 0.7 = smaller; between 0.3 and 3), "rotation" (degrees -180 to 180), "placeX" ("left"|"center"|"right"), "placeY" ("top"|"middle"|"bottom"). Pictures only accept scale, rotation, placeX, placeY.',
    '- {"op":"move","id":ID,"area":AREA_KEY}  move an item to another print area (only areas with free:true, or the area it is already in)',
    '- {"op":"delete","id":ID}',
    '- {"op":"duplicate","id":ID}',
    '- {"op":"add_text","area":AREA_KEY,"text":string,"color":"#RRGGBB" (optional),"fontFamily":font (optional),"shape":shape (optional),"placeY":"top"|"middle"|"bottom" (optional),"scale":number (optional: 0.5 = small line, 1 = normal heading, 2 = very large)}',
    "You know nothing about the shop's prices, delivery times, returns, offers or policies. If asked, say you can't answer that and point to the Contact page — never guess or invent one.",
    '- {"op":"set_tee_colour","colour":NAME}  change the colour of the t-shirt itself (NAME must be one of teeColours)',
    '- {"op":"make_picture","area":AREA_KEY,"subject":string,"style":STYLE}  draw a new picture for a print area. subject = a short description of the picture only (for example "a roaring tiger"); STYLE is one of pictureStyles (pick the one that suits, default the first). Use it when the customer asks for an image, picture, logo or drawing of something. One per area. List one for every picture the customer asked for, even more than three (the page draws the first three and tells the customer about the rest). For "front" use the area whose key is centre-front, for "back" use full-back, unless they name another area — and when this garment has no such area (or it is not free), use the biggest free area on that side instead. Every area has a side: front, back, left / right (the sleeves) or shorts (the shorts of a co-ord set). For "shorts", "leg" or "legs" use the shorts areas (left-leg for the left leg, right-leg for the right). Only use areas from the list with free:true.',
    "Style requests (\"make it look royal\", \"sporty\", \"cute\", \"minimal\", \"retro\", \"elegant\"): restyle every text item with update ops — choose a fontFamily from the fonts list that suits the mood, an ink color that suits it and shows on the tee, and where it helps a shape, letterSpacingPct or outlineColor. Keep the words unchanged. Say in the reply which font and colours you chose.",
    "A text item may have \"is\": what it stands for — \"team name\", \"player name\" or \"player number\". When the customer names one of these (\"change the team name to…\"), change the item with that \"is\", never another text. A team name can be on the tee more than once: update each item whose \"is\" is \"team name\" with the same new text. \"player name\" and \"player number\" are samples that are replaced per player when ordering; only change them if the customer asks for exactly that.",
    "Rules: only use ids and area keys from the design below. \"it\" / \"this\" / \"the text\" means the selected item if there is one, else the only item of that kind, else the last item in the open area. If it is unclear which item is meant, change nothing and ask. Pick ink colours that show on the tee colour. For words like bigger/smaller use scale. Do not invent slogans unless asked to write or add text.",
    "The design: " + JSON.stringify(design),
    "The customer's message: " + JSON.stringify(String(message).slice(0, 400)),
  ].join("\n");
  const out = await askJson(prompt, 0.2);
  return { reply: String(out?.reply || "").slice(0, 400), ops: Array.isArray(out?.ops) ? out.ops.slice(0, 12) : [] };
}
