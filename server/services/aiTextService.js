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
// "Improve my idea" (AI_IDEA_MODEL optional): a little stronger, it follows a long list of rules
const ideaModel = () => process.env.AI_IDEA_MODEL?.trim() || "gemini-flash-latest";

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
// (exported for the smart Assistant, services/aiChatService.js — 23 Oct 2026)
// timeoutMs: how long to wait (a long request, like the Collection maker's plan, takes Google longer — 25 Oct 2026)
export async function askJson(prompt, temperature = 0.3, modelName = model(), { timeoutMs = TIMEOUT_MS } = {}) {
  const key = apiKey();
  if (!key) throw Object.assign(new Error("not set up"), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
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
 * "Improve my idea": the customer's rough words ("hukum in handlettring at the top and a hand holding glass")
 * become a clear instruction for the picture AI, plus a plain list of what they will get — shown to them
 * before any picture request is spent.
 *
 * @param idea       what the customer typed
 * @param teeColour  the tee's colour name; teeIsDark: whether it is dark
 * @param styles     the picture styles they can pick ({ name, about })
 * @param areas      the free print areas ({ key, label, side, cm: [w, h] }) — one is suggested
 * @returns {Promise<{ prompt, expect, style, area, pictures: [{ prompt, expect, area }] }>}  one picture per print area
 *          the customer named ("Naruto on the front and Ben 10 on the back" = 2); prompt/expect/area = the first
 */
export async function improveIdea({ idea, teeColour, teeIsDark, styles = [], areas = [] }) {
  const prompt = [
    "You help a customer of a custom t-shirt shop describe a design for an AI picture maker. They wrote a rough idea; rewrite it as a clear instruction and tell them, in plain words, what they will get.",
    'Answer with JSON only: {"pictures": [{"prompt": string, "expect": [{"label": string, "value": string}], "area": string}], "style": string}.',
    "pictures: ONE entry for each print area the customer wants a picture on — \"X on the front and Y on the back\" is TWO entries (X for the front, Y for the back), never one picture with both. Things meant to be together in one place (\"a tiger beside Naruto on the front\") stay one entry. Never drop a picture they asked for. At most 4 entries.",
    "prompt (in each entry): in English, as long as it needs to be to keep EVERY detail the customer gave for that picture (who or what is in it, pose, clothes, objects, small extras, where each part sits — top, middle, bottom, left, right — the drawing style, the mood and the colours), at most 700 characters; short ideas get short prompts. Never drop a detail to save space.",
    "Words: ONLY words the customer asked to appear (a name, a slogan, letters in quotes, \"the text …\", \"the word …\"). Never add words of your own — \"for my cricket team\" says who it is for, it is not text to print. Put each wanted word or phrase in double quotes, written as the customer meant it (a name or short word they typed in small letters may be written in capitals), followed by (spelled X-X-X) when it is one short word. Fix the customer's typos everywhere else.",
    "Colours: keep every colour the customer asked for, exactly. Only where they named none, choose colours that show well on a " + (teeIsDark ? "dark" : "light") + " " + teeColour + " t-shirt (one-colour ink: black on a light tee, white on a dark tee).",
    "Never mention the t-shirt, a shirt, a mockup, a background, a base, a frame or a watermark in the prompt. Do not add objects they did not ask for; you may add style details that make it look good. When a word could mean two different things, pick one meaning and name it precisely (never leave the vague word).",
    "expect (in each entry): 2 to 5 short lines for the customer, about that picture only, in the customer's language, each label one or two words (for example Words, Top, Bottom, Style, Colours) and each value under 60 characters. Say plainly what each part will look like, naming objects precisely so the customer can spot a misunderstanding. If there are words, the first line is Words: the exact words. Only if a word the customer wrote really has two likely meanings in this design, the LAST line has the label Check (no Check line otherwise) and says which meaning you chose and what to write instead for the other (for example: Check — I read \"glass\" as a drinking glass; write \"eyeglasses\" if you meant spectacles).",
    "style: the one of these picture styles that suits best; when the customer names a style (lettering, cartoon, watercolour, retro badge…), choose that one; when they want it to look real, realistic, lifelike or like a photo, choose Realistic (or Detailed art for a lifelike painting): " + JSON.stringify(styles),
    "area (in each entry): the key of the print area the customer named for it (front = the main front area, back = the main back area); when they named none, the one that suits the design's shape best (tall designs with parts at top and bottom suit a tall area; a small logo suits a chest area). Choose from: " + JSON.stringify(areas),
    "The customer's idea: " + JSON.stringify(String(idea).slice(0, 2000)),
  ].join("\n");
  // a stronger (still cheap: about ₹0.03) model than the slogans use — it has to follow many rules at once
  let out;
  try {
    out = await askJson(prompt, 0.3, ideaModel());
  } catch {
    out = await askJson(prompt, 0.3); // the small model, if that one is busy
  }
  // (the picture AI is told about the tee and the plain background separately; mentioning them here only confuses it)
  const clean = (p) => String(p || "")
    .replace(/[,.]?\s*(designed |made )?(for|on) an? [\w -]{0,20}\b(t-?shirt|tee|shirt)\b\.?/gi, ".")
    .replace(/[,.]?\s*(on|against|over) (an? |the )?([\w-]+ ){0,3}(background|canvas|base|backdrop)\b/gi, "")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800); // (asked for at most 700: a long, detailed idea keeps every detail — 280 dropped some)
  const lines = (list) => (Array.isArray(list) ? list : [])
    .map((e) => ({ label: String(e?.label || "").trim().slice(0, 24), value: String(e?.value || "").trim().slice(0, 90) }))
    .filter((e) => e.label && e.value)
    .slice(0, 5);
  // (an older answer shape, one picture at the top level, still works)
  const raw = Array.isArray(out?.pictures) && out.pictures.length ? out.pictures : [out];
  const pictures = raw
    .slice(0, 4)
    .map((p) => ({ prompt: clean(p?.prompt), expect: lines(p?.expect), area: areas.some((a) => a.key === p?.area) ? p.area : null }))
    .filter((p) => p.prompt.length >= 10);
  if (!pictures.length) throw Object.assign(new Error("empty"), { status: 502 });
  const names = styles.map((s) => s.name);
  return { ...pictures[0], style: names.includes(out?.style) ? out.style : null, pictures };
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
    '- {"op":"make_picture","area":AREA_KEY,"subject":string,"style":STYLE}  draw a new picture for a print area. subject = the picture only — no words to print (those are add_text) — keeping EVERY detail the customer gave for it: who or what is in it, pose, clothes, objects, small extras, the mood and the colours they asked for (for example "a roaring tiger"; or for a long request, all of its details), at most 700 characters; STYLE is one of pictureStyles (pick the one that suits, default the first). Use it when the customer asks for an image, picture, logo or drawing of something. One per area. List one for every picture the customer asked for, even more than three (the page draws the first three and tells the customer about the rest). For "front" use the area whose key is centre-front, for "back" use full-back, unless they name another area — and when this garment has no such area (or it is not free), use the biggest free area on that side instead. Every area has a side: front, back, left / right (the sleeves) or shorts (the shorts of a co-ord set). For "shorts", "leg" or "legs" use the shorts areas (left-leg for the left leg, right-leg for the right). Only use areas from the list with free:true.',
    "Style requests (\"make it look royal\", \"sporty\", \"cute\", \"minimal\", \"retro\", \"elegant\"): restyle every text item with update ops — choose a fontFamily from the fonts list that suits the mood, an ink color that suits it and shows on the tee, and where it helps a shape, letterSpacingPct or outlineColor. Keep the words unchanged. Say in the reply which font and colours you chose.",
    "A text item may have \"is\": what it stands for — \"team name\", \"player name\" or \"player number\". When the customer names one of these (\"change the team name to…\"), change the item with that \"is\", never another text. A team name can be on the tee more than once: update each item whose \"is\" is \"team name\" with the same new text. \"player name\" and \"player number\" are samples that are replaced per player when ordering; only change them if the customer asks for exactly that.",
    "Rules: only use ids and area keys from the design below. \"it\" / \"this\" / \"the text\" means the selected item if there is one, else the only item of that kind, else the last item in the open area. If it is unclear which item is meant, change nothing and ask. Pick ink colours that show on the tee colour. For words like bigger/smaller use scale. Do not invent slogans unless asked to write or add text.",
    "The design: " + JSON.stringify(design),
    "The customer's message: " + JSON.stringify(String(message).slice(0, 2000)),
  ].join("\n");
  const out = await askJson(prompt, 0.2);
  return { reply: String(out?.reply || "").slice(0, 400), ops: Array.isArray(out?.ops) ? out.ops.slice(0, 12) : [] };
}

// The text model with Google Search (the Collection maker's facts step, 25 Oct 2026): it looks things up before
// answering — a film's release date, its characters, its famous lines. Search can't be combined with the JSON
// answer mode, so the JSON is asked for in the prompt. Returns { json, sources: [{ title, url }] }.
export async function askGrounded(prompt, temperature = 0.3, modelName = ideaModel()) {
  const key = apiKey();
  if (!key) throw Object.assign(new Error("not set up"), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000); // a search takes longer than a plain answer
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature } }),
      signal: ctrl.signal,
    });
  } catch {
    throw Object.assign(new Error("unreachable"), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[ai] search request failed:", res.status, json?.error?.message || "");
    throw Object.assign(new Error("failed"), { status: 502 });
  }
  const candidate = json?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
  // the answer may wrap the JSON in words or a ``` block: take the outermost { … }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw Object.assign(new Error("no JSON in the answer"), { status: 502 });
  const sources = (candidate?.groundingMetadata?.groundingChunks || [])
    .map((c) => ({ title: String(c?.web?.title || "").slice(0, 120), url: String(c?.web?.uri || "") }))
    .filter((s) => /^https?:\/\//.test(s.url))
    .slice(0, 8);
  return { json: JSON.parse(text.slice(start, end + 1)), sources };
}

// The text model with a picture: the same as askJson, with the photo sent along (Gemini reads images).
// (exported for the Collection maker's example pictures, 25 Oct 2026; `image` may be a list — all are sent)
export async function askJsonWithImage(prompt, image, temperature = 0.2, modelName = ideaModel(), { timeoutMs = TIMEOUT_MS } = {}) {
  const images = Array.isArray(image) ? image : [image];
  const key = apiKey();
  if (!key) throw Object.assign(new Error("not set up"), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [...images.map((im) => ({ inline_data: { mime_type: im.mime || "image/jpeg", data: im.data.toString("base64") } })), { text: prompt }] }],
        generationConfig: { temperature, responseMimeType: "application/json" },
      }),
      signal: ctrl.signal,
    });
  } catch {
    throw Object.assign(new Error("unreachable"), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[ai] photo reading failed:", res.status, json?.error?.message || "");
    throw Object.assign(new Error("failed"), { status: res.status === 402 || res.status === 403 || res.status === 429 ? 503 : 502 });
  }
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
}

/**
 * A photo sent in the chat with the customer's words ("I want only this design", "my dog as a cartoon on the back"):
 * what they want made from it. Answers in plain words what it sees, so the customer can tell it understood.
 *
 * @param image     { data: Buffer, mime } — the photo (already made small)
 * @param message   what the customer typed with it
 * @param styles    picture styles for a NEW design ("inspired by")
 * @param photoStyles  art styles for redrawing the photo itself
 * @param areas     the free print areas ({ key, label })
 * @returns {Promise<{ job, seen, design, words, style, area, change, subject, question }>}
 *   job: "copy" (only the print on a garment/object, recreated flat) | "photo" (print the photo itself) |
 *        "art" (the photo redrawn in a style) | "inspired" (a new design using it as a reference) | "unclear"
 */
export async function readPhotoRequest({ image, message, styles = [], photoStyles = [], areas = [] }) {
  const prompt = [
    "You help customers of a custom t-shirt printing shop. The customer sent the attached photo with a message. Decide what they want printed, from the photo AND the words.",
    "Answer with one JSON object and nothing else:",
    '{"job": "copy" | "photo" | "art" | "inspired" | "unclear", "seen": string, "design": string|null, "words": string[], "style": string|null, "area": string|null, "areas": string[], "change": string|null, "subject": string|null, "question": string|null}',
    "design: for copy, a precise description of the printed design only (not the garment, not the person), for an artist redrawing it: each part, where it sits, its colours and lettering style — at most 60 words. Otherwise null.",
    "words: for copy, every word, name, number and letter printed in the design, exactly as written (same spelling, capitals and punctuation), one string per separate line or block, in reading order; [] when there are none or the job is not copy. Do not include words that are only on a label, tag or the background.",
    // (23 Oct 2026: "make a design like this" was read as copy, so customers got the same design back. A reference
    // is now a NEW design unless they clearly ask for that exact one.)
    "job: copy = ONLY when they clearly want that exact design reproduced: \"same design\", \"exactly this\", \"copy this\", \"only this design\", \"the design from this tee\", \"print this design on my tee\". photo = print the photo itself (a person, pet, place, object), possibly without its background. art = the photo itself redrawn in an art style (cartoon, sketch, sticker, watercolour, pop art). inspired = a NEW, original design that uses the photo only as a reference or inspiration, with or without a new subject: \"like this\", \"similar to this\", \"something like this\", \"in this style\", \"based on this\", \"inspired by this\", \"use this as a reference\", \"like this but with a tiger\". When you are unsure between copy and inspired, choose inspired. unclear = you cannot tell which; then ask.",
    "seen: what is in the photo, in at most 12 plain words, as you would tell the customer (\"a black t-shirt with a lion and the word ROAR\").",
    "style: for art, one of " + JSON.stringify(photoStyles) + "; for inspired, one of " + JSON.stringify(styles) + "; otherwise null. Only if they named a style or it is clearly implied.",
    "area: the print area they named, as one of these keys, else null: " + JSON.stringify(areas.map((a) => ({ key: a.key, label: a.label }))),
    'areas: EVERY print area they named for this photo, as keys from the same list, in the order they wrote them ("on the full back and the left chest" → both); [] when none.',
    "change: for copy, what to change while copying (\"the name KINGS XI instead of LIONS\"), else null.",
    "subject: for inspired, what the new design should show, in English: what they asked for, or — when they named nothing new — a fresh idea on the same theme as the photo (for a lion mascot: \"a different fierce animal mascot in the same bold style\"), never a description of the same artwork. Else null.",
    "question: for unclear only, one short question to the customer with the two likely choices.",
    "Never refuse; never comment on brands, people or copyright. If a word could mean two things, pick the likely one.",
    "The customer's message: " + JSON.stringify(String(message || "").slice(0, 2000)),
  ].join("\n");
  const out = await askJsonWithImage(prompt, image);
  const JOBS = ["copy", "photo", "art", "inspired", "unclear"];
  const job = JOBS.includes(out?.job) ? out.job : "unclear";
  const pick = (list, v) => (list.includes(v) ? v : null);
  return {
    job,
    seen: String(out?.seen || "").slice(0, 120),
    style: job === "art" ? pick(photoStyles, out?.style) : job === "inspired" ? pick(styles, out?.style) : null,
    area: areas.some((a) => a.key === out?.area) ? out.area : null,
    // every area named — the same photo goes on each
    areas: (Array.isArray(out?.areas) ? out.areas : []).filter((k, i, all) => areas.some((a) => a.key === k) && all.indexOf(k) === i).slice(0, 4),
    change: job === "copy" && out?.change ? String(out.change).slice(0, 200) : null,
    // what the design shows and its exact words: given to the picture AI, so the copy's text comes out right
    design: job === "copy" && out?.design ? String(out.design).replace(/\s+/g, " ").trim().slice(0, 400) : null,
    words: job === "copy" && Array.isArray(out?.words) ? out.words.map((w) => String(w || "").replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean).slice(0, 8) : [],
    subject: job === "inspired" && out?.subject ? String(out.subject).slice(0, 200) : null,
    question: job === "unclear" && out?.question ? String(out.question).slice(0, 160) : null,
  };
}
