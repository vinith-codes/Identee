// services/aiChatService.js — the smart Assistant (23 Oct 2026)
//
// Every message the customer TYPES in the design room's Assistant is read by Google's text AI, which answers in
// plain words (in the customer's language) and may pick ONE of the Assistant's existing tools: show a drawing plan
// card, change the tee (the edit planner), write slogans, or open one of the built-in helpers (colours, sizes,
// print areas, templates, the design check …). It never draws or spends a picture request itself — "draw" only
// shows the plan card, and the customer presses Draw. Taps on chips never come here (they stay free and instant).
//
// The page falls back to the fixed script (studio/assistantScript.js) when this is off or fails.
//
//   AI_CHAT_MODEL      optional, defaults to AI_IDEA_MODEL or gemini-flash-latest
//   AI_CHAT_PROVIDER   "mock": a fixed stand-in answer, no Google call (for testing without cost)
import { askJson, aiTextConfigured } from "./aiTextService.js";

export const chatModel = () => process.env.AI_CHAT_MODEL?.trim() || process.env.AI_IDEA_MODEL?.trim() || "gemini-flash-latest";
const mock = () => process.env.AI_CHAT_PROVIDER?.trim() === "mock";
export const chatConfigured = () => mock() || aiTextConfigured();

// the built-in helpers the AI may open (the same words as the Assistant's own buttons, studio/assistantScript.js)
export const MENU_ITEMS = {
  "Colour help": "ink colours that stand out on this tee",
  "Where to print": "which print area suits a logo, a big picture, a name",
  "Size help": "which size to pick (this tee is oversized)",
  "Start from a template": "ready layouts: team jersey, birthday, couple, class, trip, office",
  "Check my design": "checks for blurry pictures, tiny text, colours that won't show",
  "Team order": "one design with a different name and number for each player",
  "Remove a background": "how to remove a picture's background (free)",
  "Photo to art": "turn the customer's photo into cartoon / sketch / sticker art",
  "Style it for me": "restyle the text on the tee for a mood",
  "Open the art library": "the free ready-made designs (cars, bikes …)",
  "Upload a picture": "put their own picture on the tee",
  "Continue to review": "go to the review and order step",
};
export const TONES = ["Funny", "Bold", "Emotional", "Simple"];
export const TOOLS = ["draw", "edit", "slogans", "menu"];

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const lines = (v, n) => String(v ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);

/**
 * @param message  what the customer typed now
 * @param history  the chat so far, oldest first: [{ who: "customer" | "assistant", text }]
 * @param design   the tee now (studio/aiOps.js describeDesign: items, areas, tee colour …)
 * @param facts    what the page shows the customer: { garment, teeColour, size, sizes, price, wasPrice, pictureAddOn,
 *                 shipping, offer, loggedIn, picturesLeft, canDraw }
 * @param areas    the print areas [{ key, label, free }]; styles: the picture styles
 * @returns {Promise<{ reply, ideas: [{ title, about, picture, area, words, style }], do: object|null, chips: string[] }>}
 */
export async function chatReply({ message, history = [], design = {}, facts = {}, areas = [], styles = [] }) {
  const said = clip(message, 2000);
  const raw = mock() ? mockAnswer(said, areas, styles) : await askJson(buildPrompt({ said, history, design, facts, areas, styles }), 0.8, chatModel());
  return cleanChatAnswer(raw, { areas, styles });
}

function buildPrompt({ said, history, design, facts, areas, styles }) {
  const past = history
    .slice(-14)
    .map((h) => `${h.who === "customer" ? "Customer" : "Assistant"}: ${clip(h.text, 500)}`)
    .join("\n");
  return [
    "You are the IDENTEE Assistant: a friendly, creative designer inside the design room of IDENTEE, an Indian custom t-shirt shop (identee.co.in). Help the customer design their tee: answer any question about it, give ideas, and act on the design with the tools below.",
    "Answer with ONE JSON object and nothing else: {\"reply\": string, \"ideas\": array, \"do\": object|null, \"chips\": array}.",
    "reply: what you say. Use the customer's language (English, Tamil, Tanglish or a mix — match how they wrote). Warm, clear and short: 1 to 4 sentences, or a few short lines. Never mention JSON, tools, ids, prompts or that you are an AI model.",
    "Always answer the customer's actual message, specifically — whatever they ask, however they write it (short forms, spelling mistakes, mixed languages). Never reply with a general list of what you can do, and never just say \"something else\". If the message is unclear, make your best guess and ask one short question about it.",
    "ideas: [] or 2 to 4 design ideas when the customer asks for ideas, inspiration or suggestions, or is unsure what to make. Each: {\"title\": up to 6 words, \"about\": one sentence (what it shows, colours, where it goes), \"picture\": what to draw for it in English with every detail, or null if the idea is only words, \"area\": a print area key or null, \"words\": the exact words to print if the idea has words, else null, \"style\": one of the picture styles or null}. Make them specific to this customer: the tee colour, the garment, the occasion and everything they said. Fresh and different from each other, never generic.",
    "do: null, or ONE action:",
    '- {"tool":"draw","pictures":[{"subject": string, "area": KEY|null}],"style": STYLE} — only when they clearly ask you to draw or make a picture, logo, mascot or illustration of something. subject: the picture only, with every detail they gave, in English (words to print go in "edit" as text instead). Up to 3 pictures, one per area. This only shows a plan card; nothing is drawn until they press Draw. Do not use it when picturesLeft is 0 or they are not logged in (then say so kindly).',
    '- {"tool":"edit","message": string} — when they ask to change what is on the tee: add or change text, colours, fonts, size, position, curve, delete, duplicate, the tee colour, or restyle. message: their request as one clear instruction in English.',
    '- {"tool":"slogans","about": string,"tone": ' + JSON.stringify(TONES) + " or null} — when they want slogans, quotes, captions or words to print.",
    '- {"tool":"menu","item": ITEM} — open one of these built-in helpers: ' + JSON.stringify(MENU_ITEMS),
    "- null for everything else (questions, ideas, small talk). Prefer ideas and a question over guessing an action.",
    "chips: 0 to 4 short follow-ups the customer may want to say next, written the way the customer would type them (\"Make it more colourful\", \"Ideas for my team\").",
    "Facts — use these exactly and never invent others. Prices are in rupees and include GST: " + JSON.stringify(facts),
    // (without it, "Class of 2024" came back in 2026)
    `Today's date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} — use this year for "class of", batch and event years unless the customer gives one.`,
    "If they ask something the facts don't cover (delivery days, returns, payment), don't guess: point them to the Shipping & Delivery page (/shipping-policy), Refunds & Cancellations (/refund-policy) or Contact us (/contact-us).",
    "Stay on topic: their tee, designs, printing and ordering at IDENTEE. For anything else, answer kindly in one sentence and steer back to their design.",
    "Print areas: " + JSON.stringify(areas.map((a) => ({ key: a.key, label: a.label, free: a.free !== false }))) + ". For \"front\" use centre-front and for \"back\" use full-back (as the rest of the Assistant does), unless they name another area or that one isn't free. Picture styles: " + JSON.stringify(styles) + ".",
    "The tee now: " + JSON.stringify(design).slice(0, 6000),
    past ? "The chat so far:\n" + past : "",
    "The customer's new message: " + JSON.stringify(said),
  ]
    .filter(Boolean)
    .join("\n");
}

// Only what the page can use goes back: known tools, area keys and styles, short texts.
export function cleanChatAnswer(out, { areas, styles }) {
  const areaKey = (k) => (areas.some((a) => a.key === k) ? k : null);
  const style = (s) => (styles.includes(s) ? s : null);
  const ideas = (Array.isArray(out?.ideas) ? out.ideas : [])
    .map((i) => ({
      title: clip(i?.title, 60),
      about: clip(i?.about, 240),
      picture: i?.picture ? clip(i.picture, 700) : null,
      area: areaKey(i?.area),
      words: i?.words ? clip(i.words, 80) : null,
      style: style(i?.style),
    }))
    .filter((i) => i.title && (i.about || i.picture || i.words))
    .slice(0, 4);
  let todo = null;
  const d = out?.do;
  if (d && TOOLS.includes(d.tool)) {
    if (d.tool === "draw") {
      const pictures = (Array.isArray(d.pictures) ? d.pictures : []).map((p) => ({ subject: clip(p?.subject, 700), area: areaKey(p?.area) })).filter((p) => p.subject.length >= 2).slice(0, 3);
      if (pictures.length) todo = { tool: "draw", pictures, style: style(d.style) };
    } else if (d.tool === "edit" && clip(d.message, 500).length >= 2) todo = { tool: "edit", message: clip(d.message, 500) };
    else if (d.tool === "slogans" && clip(d.about, 200).length >= 2) todo = { tool: "slogans", about: clip(d.about, 200), tone: TONES.includes(d.tone) ? d.tone : null };
    else if (d.tool === "menu" && MENU_ITEMS[d.item]) todo = { tool: "menu", item: d.item };
  }
  const chips = (Array.isArray(out?.chips) ? out.chips : []).map((c) => clip(c, 40)).filter((c) => c.length >= 2).slice(0, 4);
  const reply = lines(out?.reply, 900);
  return { reply: reply || (ideas.length ? "Here are a few ideas:" : "How can I help with your tee?"), ideas, do: todo, chips };
}

// AI_CHAT_PROVIDER=mock: a stand-in that answers by keywords (no Google call, nothing spent) — for testing the page
function mockAnswer(said, areas, styles) {
  const low = said.toLowerCase();
  const front = areas.find((a) => /front/.test(a.key) && a.free !== false)?.key || areas[0]?.key || null;
  if (/idea|funky|suggest|inspir|what (should|can) i/.test(low))
    return {
      reply: "Funky works best with bright colours, bold shapes and a bit of humour. Here are a few ideas for your tee:",
      ideas: [
        { title: "Retro sunset", about: "A 70s sunset with wavy orange, pink and yellow stripes, big on the back.", picture: "a retro 70s sunset with wavy orange, pink and yellow stripes", area: null, words: null, style: styles[2] || null },
        { title: "Cool cat in sunglasses", about: "A cartoon cat in sunglasses with a bold outline, on the front.", picture: "a cool cartoon cat wearing sunglasses, bold outline", area: front, words: null, style: styles[3] || null },
        { title: "Bold word art", about: "One funky word in bubbly letters across the front.", picture: null, area: front, words: "VIBE", style: null },
      ],
      do: null,
      chips: ["More ideas", "Something about music", "For my team"],
    };
  if (/\b(bigger|smaller|colou?r|move|gold|red|curve)\b/.test(low)) return { reply: "On it.", ideas: [], do: { tool: "edit", message: said }, chips: [] };
  if (/slogan|quote|caption/.test(low)) return { reply: "Here you go:", ideas: [], do: { tool: "slogans", about: said, tone: null }, chips: [] };
  if (/\b(draw|picture|logo|mascot)\b/.test(low)) return { reply: "Here's the plan for your picture.", ideas: [], do: { tool: "draw", pictures: [{ subject: said.replace(/^(please )?(draw|make)( me)?( an?| the)?\s+/i, ""), area: front }], style: styles[0] || null }, chips: [] };
  if (/\bsize\b/.test(low)) return { reply: "Let me help you pick a size.", ideas: [], do: { tool: "menu", item: "Size help" }, chips: [] };
  if (/price|cost|how much/.test(low)) return { reply: "MOCK: the price answer uses the facts the page sent.", ideas: [], do: null, chips: ["Show me ideas"] };
  return { reply: "MOCK: I can help with ideas, pictures, words, colours and sizes. What would you like on your tee?", ideas: [], do: null, chips: ["Give me ideas", "Help me pick a size"] };
}
