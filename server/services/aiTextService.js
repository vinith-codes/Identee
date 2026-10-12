// services/aiTextService.js
//
// Short pieces of writing from the text AI — today: t-shirt slogans for the
// Design Room's assistant. Uses the same Google key as the image maker
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
