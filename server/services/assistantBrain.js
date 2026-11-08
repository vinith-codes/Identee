// services/assistantBrain.js — the Assistant v2 brain (7 Nov 2026, docs/ASSISTANT_V2_PLAN.md)
//
// Every message the customer types is read by Google's text AI together with the tee as it is now, the chat so far,
// its memory note, the shop facts and the concept sheets of this chat. It answers in plain words and with a LIST OF
// STEPS the page runs one after another: ask a question (with suggested answers), make a concept sheet (three numbered
// whole-tee concepts), develop picked concepts into real artwork, draw a picture straight away, change the tee, write
// slogans, open a built-in helper, undo. It never spends a picture itself — the page calls the picture endpoints.
//
// The old brain (aiChatService.js, one tool per message, plan cards) stays for the current page until the v2 chat
// screen replaces it.
//
//   AI_CHAT_MODEL       optional, defaults to gemini-flash-latest (shared with aiChatService)
//   AI_CHAT_PROVIDER    "mock": keyword answers, no Google call (for testing the whole room without cost)
//   AI_CHAT_THINKING    optional: "low" | "medium" | "high" — asks the text model to think before answering
import { askJson, aiTextConfigured } from "./aiTextService.js";
import { chatModel, MENU_ITEMS, TONES, FOLD_AT, MEMORY_MAX } from "./aiChatService.js";

const mock = () => process.env.AI_CHAT_PROVIDER?.trim() === "mock";
export const brainConfigured = () => mock() || aiTextConfigured();
export const thinkingLevel = () => {
  const v = process.env.AI_CHAT_THINKING?.trim().toLowerCase();
  return ["low", "medium", "high"].includes(v) ? v : null;
};

export const STEP_TYPES = ["ask", "concepts", "develop", "match", "draw", "edit", "slogans", "menu", "undo"];
export const PIECES = ["front", "back", "sleeve"];
export const MAX_STEPS = 6;
export const CONCEPTS_PER_SHEET = 3;

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const lines = (v, n) => String(v ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);

/**
 * "3, 6 and 9" / "the second one" / "1-3" / "all" → concept numbers (1-based), in the order said, no repeats.
 * @param text   what the customer typed
 * @param max    how many concepts exist (numbers above it are dropped)
 */
export function parsePicks(text, max = 12) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return [];
  if (/\b(all|every one|all of them)\b/.test(t)) return Array.from({ length: Math.min(max, 12) }, (_, i) => i + 1);
  const words = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5, sixth: 6, "6th": 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: max };
  const out = [];
  const add = (n) => {
    if (Number.isInteger(n) && n >= 1 && n <= max && !out.includes(n)) out.push(n);
  };
  // ranges first ("1-3", "4 to 6")
  for (const m of t.matchAll(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/g)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a <= b && b - a < 12) for (let n = a; n <= b; n++) add(n);
  }
  for (const m of t.replace(/\b\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\b/g, " ").matchAll(/(?<![\d.])(\d{1,2})(?![\d.%:])/g)) add(Number(m[1]));
  // "the second one", "first and third" — only when no digit was said (so "size 2" isn't a pick is the caller's job)
  if (!out.length) for (const [w, n] of Object.entries(words)) if (new RegExp(`\\b${w}\\b`).test(t)) add(n);
  return out;
}

/** Is this message a bare pick ("2", "3 and 6", "the second one")? The page may answer it without the brain. */
export const isBarePick = (text, max) => {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 40) return false;
  const picks = parsePicks(t, max);
  if (!picks.length) return false;
  return /^(the\s+)?(\d{1,2}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|all)(\s*(,|and|&|\+|or|,\s*and)\s*(\d{1,2}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last))*(\s*(one|ones|please|pls|suit me|suits me|is good|are good|looks? good))?[.! ]*$/.test(t);
};

/**
 * @param message  what the customer typed now
 * @param history  latest messages, oldest first: [{ who: "customer"|"assistant", text }]
 * @param earlier  older messages not in the memory note yet
 * @param memory   the chat's memory note
 * @param design   the tee now (studio/aiOps.js describeDesign)
 * @param facts    what the page shows: garment, teeColour, size, sizes, price, picturesLeft, loggedIn …
 * @param areas    print areas [{ key, label, free }]; styles: picture style names
 * @param sheets   concept sheets made in this chat, oldest first: [{ n, brief, concepts: [{ n, title }], developed: [n] }]
 * @returns {Promise<{ reply, steps, chips, memory? }>}
 */
export async function brainReply({ message, history = [], earlier = [], memory = "", design = {}, facts = {}, areas = [], styles = [], sheets = [], attached = null, logo = null, profile = "" }) {
  const said = clip(message, 2000);
  const ctx = { areas, styles, sheets, design };
  const [raw, folded] = await Promise.all([
    mock() ? mockBrain(said, ctx, facts, history, { attached, logo }) : askJson(buildPrompt({ said, history, earlier, memory, design, facts, areas, styles, sheets, attached, logo, profile }), 0.7, chatModel(), { thinking: thinkingLevel(), timeoutMs: 40_000 }),
    earlier.length >= FOLD_AT ? foldNote(memory, earlier, profile).catch(() => null) : null,
  ]);
  const answer = cleanBrainAnswer(raw, ctx);
  // the chat's note, and the customer's profile for later visits (round 5, 8 Nov 2026), when the fold made them
  return { ...answer, ...(folded?.note ? { memory: folded.note } : {}), ...(folded?.profile ? { profile: folded.profile } : {}) };
}
export const PROFILE_MAX = 400;

const asLines = (list) => list.map((h) => `${h.who === "customer" ? "Customer" : "Assistant"}: ${clip(h.text, 500)}`).join("\n");

async function foldNote(memory, earlier, profile = "") {
  if (mock()) {
    const said = earlier.filter((h) => h.who === "customer").map((h) => h.text).join(" / ");
    return { note: clip(`${memory ? `${memory} ` : ""}MOCK NOTE: ${said}`, MEMORY_MAX), profile: clip(`${profile ? `${profile} ` : ""}MOCK PROFILE: ${said}`, PROFILE_MAX) };
  }
  const out = await askJson(
    [
      "You keep the notes for the IDENTEE design assistant (an Indian custom t-shirt shop). Below are the note so far, the customer's profile so far, and the next part of the chat with a customer.",
      `Write the updated note: at most ${MEMORY_MAX - 200} characters, short plain sentences in English. Keep what matters for designing and ordering their tee: what they want, the occasion, names, words, dates and numbers to print, colours, styles, concepts they picked or turned down, answers they gave to questions, decisions made, questions still open. Leave out greetings and small talk. Never invent anything.`,
      `Write the updated profile too: at most ${PROFILE_MAX - 100} characters about this customer for their NEXT visits — who they are (a cafe owner, a college student, a team captain …), the styles, colours and tee colours they like, what they turned down, their language (English / Tamil / Tanglish). Lasting facts only, nothing about today's particular tee. Keep what was in the profile unless the chat contradicts it.`,
      'Answer with ONE JSON object and nothing else: {"note": string, "profile": string}.',
      "The note so far: " + (memory ? JSON.stringify(memory) : "(none)"),
      "The profile so far: " + (profile ? JSON.stringify(profile) : "(none)"),
      "The next part of the chat:\n" + asLines(earlier),
    ].join("\n"),
    0.2,
    chatModel(),
  );
  const note = clip(out?.note, MEMORY_MAX) || null;
  return note ? { note, profile: clip(out?.profile, PROFILE_MAX) || null } : null;
}

function buildPrompt({ said, history, earlier, memory, design, facts, areas, styles, sheets, attached = null, logo = null, profile = "" }) {
  const past = asLines(history.slice(-14));
  return [
    "You are the IDENTEE Assistant: a thoughtful, creative t-shirt designer inside the design room of IDENTEE, an Indian custom t-shirt shop (identee.co.in). The customer talks to you the way they would talk to ChatGPT: in their own words, in any language. You design the whole tee with them.",
    "FIRST THINK: read the new message, the tee as it is now, the chat so far, the notes and the facts. Work out exactly what they mean and everything it needs. THEN ACT: answer with ONE JSON object and nothing else:",
    '{"reply": string, "steps": array, "chips": array}',
    "reply: what you say, in the customer's language (English, Tamil, Tanglish or a mix — match how they wrote). Warm, clear, short: 1 to 3 sentences. Say what you are doing or asking. Never mention JSON, steps, tools, ids, prompts, models or that you are an AI.",
    "steps: the moves to make now, in order (0 to " + MAX_STEPS + "). The page runs them one after another and the tee updates as it goes. Kinds:",
    '- {"type":"ask","question": string,"options": [2 to 4 short suggested answers]} — a question you need answered BEFORE you can continue. Only for what you truly cannot guess: a name, number or date to print, whose photo, which of two prints to replace, the fest/team/company name when the design is built around it. One question per message (two very short ones at most, in the same "question"). An ask must be the LAST step. Never ask what the chat, notes or tee already tell you. If the brief is enough to make something, make it first and ask after, in the reply.',
    '- {"type":"concepts","brief": string,"logo": true|false,"concepts": [exactly ' + CONCEPTS_PER_SHEET + ' objects {"title": up to 5 words,"front": what is printed on the front (null if nothing),"back": the back print (null if nothing),"sleeve": the sleeve print (null if nothing),"colours": the main ink colours,"style": one of the picture styles}]} — each print says WHERE and HOW BIG it goes, in its own text ("small left-chest badge", "large centre-front artwork", "full-back lettering", "small sleeve logo"): the page places and sizes it from those words. logo: true when the tees should carry the customer\'s own logo / artwork (they attached one, or one is on file, and they want it used): then say "logo" in the prints that use it. THE NORMAL ANSWER to any design or picture request: designs, ideas, options, "make me a tee for…", a complete design, AND a single picture ("a lion on the front", "a skull on the back"). The page draws ONE picture showing the three tees numbered 1, 2, 3 (front, back, sleeve) and the customer picks. For a single picture request, the three are three really different takes on THAT picture on THAT area (e.g. a fierce realistic lion, a bold mascot lion, a minimal line lion), the other areas null. Make the three really different from each other and specific to the brief, the tee colour and everything they said. Prints with words must include the exact words. "More options" = another concepts step with three new ones (numbering continues from the sheets listed below). "basis": "tee" (optional) — when the three concepts are versions of the picture ALREADY ON THE TEE ("show this in 3 colourways", "variations of this", "the same in other styles"): the page sends that picture as the reference; each concept then says what changes (the ink colours, the style) and what stays.',
    '- {"type":"develop","picks": [concept numbers],"sheet": the sheet number they are on,"pieces": ["front","back","sleeve"] or a subset or null for all the pieces that concept has,"change": string|null} — when they choose concepts by number or words ("3 and 6", "the second one", "I like 2 but only the front"). Numbers refer to the sheets listed below (sheet 1 has concepts 1-3, sheet 2 has 4-6 …). The page draws the real artwork pieces from the sheet and puts the first pick on the tee. change: a change they want in that concept\'s artwork as it is drawn ("2 but with the text in gold", "2 with the logo bigger", "3 in blue") — in English, null when none. A change INSIDE the artwork (its colours, the words drawn in it, its style) goes in change ONLY — never also as an edit step, because the words in a drawn picture are not text items on the tee. A change to the tee itself (its colour, the size or place of a print) is an edit step after the develop step instead. Mixing concepts ("the front of 1 with the back of 3"): one develop step per concept, each with only its pieces.',
    '- {"type":"match","piece":"back"|"sleeve"|"front","brief": string} — a companion piece drawn FROM the picture already on the tee ("make a matching back", "a sleeve print to go with this"): same style, line quality and ink colours. brief: what the new piece shows, in English, words to print included (a back often carries the name or slogan large). Only when the tee already has a picture (see The tee now); else use concepts.',
    '- {"type":"draw","subject": string,"area": print area key,"style": one of the picture styles} — the SHORTCUT, only when they clearly want one picture drawn straight away without choosing: "just draw it", "quickly", "one picture", "another one like this", "draw it now", or a lettering/text-art request. subject: the picture only, every detail they gave, in English (words to print inside the picture included). Pick the area and style yourself from what they said and what is free. Up to 3 draw steps in one message (one per area).',
    '- {"type":"edit","message": string} — change what is on the tee: add or change text, colours, fonts, size, position, curve, delete, duplicate, the tee colour, restyle. message: their request as one clear instruction in English, naming the exact element and area. One edit step per change.',
    '- {"type":"slogans","about": string,"tone": ' + JSON.stringify(TONES) + " or null} — slogans, quotes, captions, words to print.",
    '- {"type":"menu","item": ITEM} — open a built-in helper: ' + JSON.stringify(MENU_ITEMS),
    '- {"type":"undo"} — take the last move back ("undo", "go back", "no, revert that").',
    "- no steps for questions, small talk, advice and off-topic messages: answer in reply (ideas in words are fine there).",
    "Choices first: when in doubt between concepts and draw, use concepts — customers like to pick from three. Changing a concept before it is made: \"2 but in gold\" = develop 2 with change; \"show me variations of 2\" / \"2 in other styles\" / \"I like 2 but not sure\" = a new concepts step with three takes on concept 2 (keep what they liked, vary the rest). After a concept is made, changes to what is on the tee are edit steps. Rules: do everything the message asks, in order, in one go (a brief with a front picture, a back name and a sleeve logo = concepts, or draw + edit + edit). When the tee itself answers the question (\"make it look better\" on grey art over a black tee), do not ask — make two concrete improvements (edit steps) and say what you changed. Never spend pictures on guesses: ask instead. If picturesLeft is 0 or loggedIn is false, do not use concepts/develop/draw — say so kindly and help with words. Use the customer's exact names, numbers and words, spelled as they wrote them.",
    "chips: 0 to 4 short follow-ups the customer may want to say next, written as they would type them (\"More options\", \"Put it on the back\", \"Make it darker\"). After a concepts step always include \"More options\". After a draw step always include \"Show me 3 options\" (three takes to choose from). After a develop or match step, offer among the chips: \"See it on other colours\", \"Show 3 colourways\", and \"A matching back\" or \"A matching sleeve\" when that area is free. After an ask, the chips are the options.",
    "Tee colours: when they ask which colours suit the design, or want to see it on other colours (\"See it on other colours\"), do NOT use a step: in the reply name 2 or 3 colours from facts.teeColours that suit the inks on the tee (good contrast, the mood of the design) and why, in a few words, and make the chips \"See it on <Colour>\" for them. \"See it on <Colour>\" / \"show it on maroon\" = one edit step: change the tee colour to that colour. Changing the tee colour is free.",
    "Facts — use these exactly and never invent others. Prices are in rupees and include GST: " + JSON.stringify(facts),
    `Today's date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} — use this year for "class of", batch and event years unless the customer gives one.`,
    "If they ask something the facts don't cover (delivery days, returns, payment), don't guess: point them to the Shipping & Delivery page (/shipping-policy), Refunds & Cancellations (/refund-policy) or Contact us (/contact-us).",
    "Stay on topic: their tee, designs, printing and ordering at IDENTEE. For anything else, answer kindly in one sentence and steer back to their design.",
    "Print areas: " + JSON.stringify(areas.map((a) => ({ key: a.key, label: a.label, free: a.free !== false }))) + ". For \"front\" use centre-front and for \"back\" use full-back unless they name another area or that one isn't free. Picture styles: " + JSON.stringify(styles) + ".",
    "The tee now: " + JSON.stringify(design).slice(0, 6000),
    attached ? "The customer attached a picture WITH THIS MESSAGE (their logo, artwork or a photo): " + JSON.stringify(clip(attached.about || "a picture", 200)) + ". If they want it printed as it is or built into designs, use concepts with logo: true (or edit to place it). If they want it redrawn as art (cartoon, sketch …), use menu \"Photo to art\". If unclear, ask." : "",
    !attached && logo ? "The customer's own logo / artwork is on file from earlier in this chat: concepts may use it (logo: true) when they ask for their logo or brand." : "",
    sheets.length ? "Concept sheets in this chat (oldest first; developed = already made into artwork): " + JSON.stringify(sheets.map((s) => ({ sheet: s.n, brief: clip(s.brief, 120), concepts: (s.concepts || []).map((c) => ({ n: c.n, title: c.title })), developed: s.developed || [] }))) : "No concept sheets yet in this chat.",
    memory ? "Notes from earlier in this chat (the customer's own wishes and answers, keep to them): " + JSON.stringify(clip(memory, MEMORY_MAX)) : "",
    profile ? "What we know about this customer from their earlier visits (use it to suggest, never to assume — they may want something new today): " + JSON.stringify(clip(profile, PROFILE_MAX)) : "",
    earlier.length ? "Earlier messages:\n" + asLines(earlier) : "",
    past ? `The chat so far${memory || earlier.length ? " (the latest messages)" : ""}:\n` + past : "",
    "The customer's new message: " + JSON.stringify(said),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Only what the page can use goes back: known step kinds, real areas, styles, pieces, short texts, an ask last. */
export function cleanBrainAnswer(out, { areas = [], styles = [], sheets = [] } = {}) {
  const areaKey = (k) => (areas.some((a) => a.key === k) ? k : null);
  const style = (s) => (styles.includes(s) ? s : null);
  const totalConcepts = sheets.reduce((n, s) => n + (s.concepts || []).length, 0);
  const steps = [];
  for (const raw of Array.isArray(out?.steps) ? out.steps : []) {
    if (steps.length >= MAX_STEPS) break;
    const type = raw?.type;
    if (!STEP_TYPES.includes(type)) continue;
    if (type === "ask") {
      const question = clip(raw.question, 300);
      if (question.length < 2) continue;
      const options = (Array.isArray(raw.options) ? raw.options : []).map((o) => clip(o, 50)).filter((o) => o.length >= 1).slice(0, 4);
      steps.push({ type, question, options });
      break; // an ask is always last
    }
    if (type === "concepts") {
      const concepts = (Array.isArray(raw.concepts) ? raw.concepts : [])
        .map((c) => ({
          title: clip(c?.title, 50),
          front: c?.front ? clip(c.front, 300) : null,
          back: c?.back ? clip(c.back, 300) : null,
          sleeve: c?.sleeve ? clip(c.sleeve, 200) : null,
          colours: clip(c?.colours, 80),
          style: style(c?.style) || styles[0] || null,
        }))
        .filter((c) => c.title && (c.front || c.back || c.sleeve))
        .slice(0, CONCEPTS_PER_SHEET);
      if (concepts.length < 2) continue;
      steps.push({ type, brief: clip(raw.brief, 400) || concepts.map((c) => c.title).join(", "), concepts, logo: raw.logo === true, ...(raw.basis === "tee" ? { basis: "tee" } : {}) });
      continue;
    }
    if (type === "match") {
      const brief = clip(raw.brief, 400);
      if (brief.length >= 2) steps.push({ type, piece: PIECES.includes(raw.piece) ? raw.piece : "back", brief });
      continue;
    }
    if (type === "develop") {
      const picks = (Array.isArray(raw.picks) ? raw.picks : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && (totalConcepts ? n <= totalConcepts : n <= 12));
      if (!picks.length) continue;
      const pieces = Array.isArray(raw.pieces) ? raw.pieces.filter((p) => PIECES.includes(p)) : null;
      steps.push({ type, picks: [...new Set(picks)].slice(0, 4), sheet: Number.isInteger(Number(raw.sheet)) && Number(raw.sheet) >= 1 ? Number(raw.sheet) : null, pieces: pieces && pieces.length ? pieces : null, change: clip(raw.change, 300) || null });
      continue;
    }
    if (type === "draw") {
      const subject = clip(raw.subject, 700);
      if (subject.length < 2) continue;
      steps.push({ type, subject, area: areaKey(raw.area), style: style(raw.style) });
      continue;
    }
    if (type === "edit") {
      const message = clip(raw.message, 500);
      if (message.length >= 2) steps.push({ type, message });
      continue;
    }
    if (type === "slogans") {
      const about = clip(raw.about, 200);
      if (about.length >= 2) steps.push({ type, about, tone: TONES.includes(raw.tone) ? raw.tone : null });
      continue;
    }
    if (type === "menu") {
      if (MENU_ITEMS[raw.item]) steps.push({ type, item: raw.item });
      continue;
    }
    if (type === "undo") steps.push({ type });
  }
  let chips = (Array.isArray(out?.chips) ? out.chips : []).map((c) => clip(c, 40)).filter((c) => c.length >= 1).slice(0, 4); // "1", "2" are chips too
  const ask = steps.find((s) => s.type === "ask");
  if (ask && ask.options.length) chips = ask.options;
  if (steps.some((s) => s.type === "concepts") && !chips.some((c) => /more/i.test(c))) chips = ["More options", ...chips].slice(0, 4);
  const reply = lines(out?.reply, 900);
  return { reply: reply || (steps.length ? "On it." : "How can I help with your tee?"), steps, chips };
}

// AI_CHAT_PROVIDER=mock: keyword answers that exercise every step kind (no Google call, nothing spent)
function mockBrain(said, { areas, styles, sheets }, facts = {}, history = [], { attached = null, logo = null } = {}) {
  const low = said.toLowerCase();
  const front = areas.find((a) => /front/.test(a.key) && a.free !== false)?.key || areas[0]?.key || null;
  const back = areas.find((a) => /back/.test(a.key) && a.free !== false)?.key || null;
  const total = sheets.reduce((n, s) => n + (s.concepts || []).length, 0);
  const picks = parsePicks(low, Math.max(total, 1));
  if (/\bundo\b|go back|revert/.test(low)) return { reply: "MOCK: undone.", steps: [{ type: "undo" }], chips: [] };
  // round 5: colourways of the picture on the tee, a matching piece from it, colours that suit it, "see it on X"
  if (/colourway|colorway|variations? of (this|it)|same in other styles/.test(low)) {
    const base = sheets.length * CONCEPTS_PER_SHEET;
    const concepts = ["gold and white inks", "red, blue and white inks", "white only, single ink"].map((c, i) => ({ title: `Mock colourway ${base + i + 1}`, front: `the same drawing as on the tee, in ${c}`, back: null, sleeve: null, colours: c, style: styles[0] || null }));
    return { reply: "MOCK: three colourways of your picture.", steps: [{ type: "concepts", brief: said, basis: "tee", concepts }], chips: ["More options"] };
  }
  const matchM = low.match(/\bmatching (back|sleeve|front)\b|\b(back|sleeve|front) (print )?to go with (this|it)/);
  if (matchM) {
    const piece = matchM[1] || matchM[2];
    return { reply: `MOCK: a matching ${piece} from your picture.`, steps: [{ type: "match", piece, brief: `a companion ${piece} piece in the same style${/name|words?|slogan/.test(low) ? `: ${said}` : ""}` }], chips: ["Make it bigger", "See it on other colours"] };
  }
  if (/which colou?rs? suit|see it on other colou?rs|other colou?rs/.test(low)) {
    const cols = (facts.teeColours || ["Maroon", "White", "Navy"]).filter((c) => c !== facts.teeColour).slice(0, 3);
    return { reply: `MOCK: ${cols.join(", ")} would suit these inks.`, steps: [], chips: cols.map((c) => `See it on ${c}`) };
  }
  const seeOn = low.match(/^(see|show) it on (\w+)/);
  if (seeOn) return { reply: `MOCK: here it is on ${seeOn[2]}.`, steps: [{ type: "edit", message: `Change the tee colour to ${seeOn[2]}` }], chips: ["Back to my colour", "Looks great!"] };
  // a picture attached (or a logo on file) + "use our logo": three concepts built around it
  if ((attached || logo) && /logo|brand|this picture|this image|use (this|it|our)/.test(low)) {
    const base = sheets.length * CONCEPTS_PER_SHEET;
    const concepts = ["logo big on the chest", "logo small on the left chest, the cafe name on the back", "logo inside a round badge"].map((f, i) => ({ title: `Mock logo concept ${base + i + 1}`, front: f, back: i === 1 ? "the cafe name large" : null, sleeve: null, colours: "as the logo", style: styles[0] || null }));
    return { reply: "MOCK: three concepts with your logo.", steps: [{ type: "concepts", brief: said, logo: true, concepts }], chips: ["More options"] };
  }
  if (attached && /cartoon|sketch|art|redraw/.test(low)) return { reply: "MOCK: let's turn your photo into art.", steps: [{ type: "menu", item: "Photo to art" }], chips: [] };
  // built-in helpers by their words (the real brain reads meaning; the stand-in only keywords)
  const menus = [["photo to art|my photo|from a photo", "Photo to art"], ["upload|my own logo|my logo", "Upload a picture"], ["my pictures|pictures i made|from before", "My pictures"], ["continue to review|go to review|order now|checkout", "Continue to review"], ["good enough to print|check my design|blurry", "Check my design"], ["team order|player list|for my team of", "Team order"], ["template|ready layout", "Start from a template"], ["which colours|colour help|ink colour", "Colour help"]];
  for (const [re, item] of menus) if (new RegExp(re).test(low)) return { reply: `MOCK: opening ${item}.`, steps: [{ type: "menu", item }], chips: [] };
  // "the front of 1 and the back of 3": one develop step per concept, each with its piece
  const mix = total && low.match(/\b(front|back|sleeve) of (\d{1,2})\b.*\b(front|back|sleeve) of (\d{1,2})\b/);
  if (mix) return { reply: `MOCK: the ${mix[1]} of ${mix[2]} with the ${mix[3]} of ${mix[4]}.`, steps: [{ type: "develop", picks: [Number(mix[2])], sheet: null, pieces: [mix[1]], change: null }, { type: "develop", picks: [Number(mix[4])], sheet: null, pieces: [mix[3]], change: null }], chips: ["Make it bigger", "More options"] };
  if (total && picks.length && (isBarePick(low, total) || /like|suit|pick|choose|go with|develop|want|only the|but /.test(low)))
    return { reply: `MOCK: making concept ${picks.join(" and ")} for you.`, steps: [{ type: "develop", picks, sheet: null, pieces: /only the front|front only/.test(low) ? ["front"] : null, change: /\bbut\b|\bwith\b|\bin (gold|blue|red|white)/.test(low) ? said.replace(/^.*?\b(but|with)\b\s*/, "").replace(/^with\s+/, "").trim() || null : null }], chips: ["Make it bigger", "Different style", "More options"] };
  if (/name is|called/.test(low) || /\badd (number|the number|no\.?) ?\d/.test(low) || /\b(tee|t-?shirt) to (black|white|maroon|red|navy|olive|yellow)/.test(low))
    return { reply: "MOCK: done.", steps: [{ type: "edit", message: said }], chips: ["Undo", "Make it bigger"] };
  if (/my name|put (the )?name|with (the )?name/.test(low) && !/name is|called/.test(low) && !/[A-Z]{2,}/.test(said))
    return { reply: "MOCK: what name should I print?", steps: [{ type: "ask", question: "What name should I print?", options: ["Vinith", "Skip"] }], chips: [] };
  if (/\bmore\b|another three|different style|more minimal|don't like any/.test(low) || /concept|design|ideas?|tee for|t-?shirt for|make me a|create|complete|something for|birthday|wedding|fest|avengers/.test(low)) {
    const brief = said;
    const base = sheets.length * CONCEPTS_PER_SHEET;
    const concepts = Array.from({ length: CONCEPTS_PER_SHEET }, (_, i) => ({
      title: `Mock concept ${base + i + 1}`,
      front: `${["a bold emblem", "a comic-panel scene", "a minimal line icon"][i]} for: ${brief.slice(0, 60)}`,
      back: i === 2 ? null : `large lettering across the back (${["ASSEMBLE", "VORTEX", "TEAM"][i]})`,
      sleeve: i === 0 ? "a small matching emblem" : null,
      colours: ["gold and white", "red, blue and white", "white only"][i],
      style: styles[i % Math.max(1, styles.length)] || null,
    }));
    return { reply: `MOCK: here are three concepts for your ${facts.teeColour || ""} tee.`, steps: [{ type: "concepts", brief, concepts }], chips: ["More options", "1", "2", "3"] };
  }
  if (/\b(draw|picture|logo|mascot|illustration|lettering|look like a)\b/.test(low) && !/just draw|quickly|one picture|another one|draw it now|lettering/.test(low)) {
    const area = /\bback\b/.test(low) ? "back" : "front";
    const what = said.replace(/^(please )?(draw|make|put)( me)?( an?| the)?\s+/i, "").replace(/\s+(on|for) the (front|back|sleeve).*$/i, "");
    const base = sheets.length * CONCEPTS_PER_SHEET;
    const takes = ["a fierce realistic", "a bold mascot", "a minimal line"];
    const concepts = takes.map((take, i) => ({ title: `Mock ${take.split(" ").pop()} ${base + i + 1}`, [area]: `${take} ${what}`, [area === "front" ? "back" : "front"]: null, sleeve: null, colours: ["natural colours", "gold and black", "white only"][i], style: styles[i % Math.max(1, styles.length)] || null }));
    return { reply: `MOCK: three takes on ${what} for the ${area} — pick one.`, steps: [{ type: "concepts", brief: said, concepts }], chips: ["More options", "Just draw one"] };
  }
  if (/\b(draw|picture|logo|mascot|illustration|lettering|look like a)\b/.test(low)) {
    const area = /\bback\b/.test(low) && back ? back : front;
    return { reply: "MOCK: drawing it now.", steps: [{ type: "draw", subject: said.replace(/^(please )?(draw|make)( me)?( an?| the)?\s+/i, ""), area, style: styles[0] || null }], chips: ["Show me 3 options", "Different style", "Put it on the back"] };
  }
  if (/\b(bigger|smaller|colou?r|move|gold|red|curve|delete|font|remove)\b/.test(low)) return { reply: "MOCK: done.", steps: [{ type: "edit", message: said }], chips: ["Undo", "Make it bigger"] };
  if (/slogan|quote|caption/.test(low)) return { reply: "MOCK: here you go.", steps: [{ type: "slogans", about: said, tone: null }], chips: [] };
  if (/\bsize\b/.test(low)) return { reply: "MOCK: let me help you pick a size.", steps: [{ type: "menu", item: "Size help" }], chips: [] };
  if (/price|cost|how much/.test(low)) return { reply: `MOCK: this tee is ₹${facts.price || "…"}.`, steps: [], chips: ["Show me designs"] };
  if (/deliver|return|refund/.test(low)) return { reply: "MOCK: see the Shipping & Delivery page (/shipping-policy).", steps: [], chips: [] };
  return { reply: "MOCK: tell me what you'd like on your tee — a design idea, a picture, words, or an occasion.", steps: [], chips: ["Designs for my college fest", "Draw a lion", "A slogan for my team"] };
}
