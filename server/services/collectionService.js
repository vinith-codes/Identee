// services/collectionService.js
//
// The Collection maker (Admin → Collection maker, 25 Oct 2026): ready-made tee designs for Shop your IDENTEE,
// made by a fixed PIPELINE — every run goes through the same steps in the same order:
//
//   1. brief    the admin's prompt + an example picture (required) → the AI rewrites the prompt as a clear brief
//               and says what it understood; details the prompt didn't give (which products, how many, the
//               words' language) become questions the admin answers before Start                    [makeBrief]
//   2. facts    Google Search: the film's / topic's names, dates, famous lines                         [runCollection]
//   3. plan     one plan per tee: its product, colour and PARTS — any mix of AI pictures, art library pictures and
//               lines of words, each on a print area and a place in it (any design, not one fixed layout;
//               the LAYOUTS below are proven starting points the AI may use)
//   4. pictures Nano Banana (Grok only for a real person, when the admin ticked it), cut out, trimmed;
//               art library pictures are used as they are (free)
//   5. place    every part on its print area at true print size
//   6. finish   in the admin's browser: the words fitted, the print check, the 3D mockup pictures
//   7. review   the admin publishes, rejects, or changes a tee in their own words (changeDesign)
//
// The example picture is only a reference: the AI reads its look into words (refNotes) and the planner is told
// to make new, original artwork. The picture itself never goes to the picture maker.
// Every picture counts against the run's budget and the monthly caps (Admin → Settings → AI designs).
//
//   AI_TEXT_PROVIDER=mock   the text steps (brief, facts, plan, change) answer with fixed stand-ins, no Google call —
//                           with AI_IMAGE_PROVIDER=mock the whole pipeline can be tested without spending
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import GarmentType from "../models/garmentTypeModel.js";
import DesignCollection from "../models/designCollectionModel.js";
import ReadyDesign from "../models/readyDesignModel.js";
import ArtDesign from "../models/artDesignModel.js";
import ArtCategory from "../models/artCategoryModel.js";
import AiUsage from "../models/aiUsageModel.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import { askGrounded, askJson, askJsonWithImage, aiTextConfigured } from "./aiTextService.js";
import { AI_STYLES, aiImageConfigured, aiImageModel, generateImage, nearestRatio, newDesignPrompt } from "./aiImageService.js";
import { xaiConfigured, xaiModel, xaiNewImage } from "./xaiImageService.js";
import { cutOutPlainBackground } from "./cutoutService.js";
import { uploadFile } from "../utils/imageStorage.js";
import { positionsForGarment } from "../data/printPositions.js";
import { googleCapped, grokCapped, monthSpend, readSettings } from "../controllers/aiController.js";

// The products the Collection maker designs for (the client, 25 Oct 2026: "initially oversized and round neck";
// more can be added here — a garment is only used while it is live, Admin → Create your IDENTEE).
export const GARMENTS = ["oversized-tee", "boys-round-neck", "girls-round-neck"];
export const MAX_TEES = 10;
export const MAX_BUDGET = 20;
export const MAX_PARTS = 5; // parts on one tee
export const MAX_AI_PICTURES = 3; // AI pictures on one tee
export const LANGUAGES = ["English", "Tamil", "Tanglish", "No words"];
export const SOURCES = { ai: "AI pictures", art: "Our art library", both: "Both" };
const LAYOUT_SIZE = "M"; // tees are laid out at M; every size prints at its own true print size
const STALE_MS = 10 * 60 * 1000; // a run that hasn't moved for 10 minutes stopped (the server restarted)
const LONG_MS = 90_000; // the brief, plan and change requests are long: Google takes up to a minute to answer them

// The studio's fonts (frontend/src/studio/fonts.js — keep the two lists the same).
export const FONTS = ["Anton", "Bebas Neue", "Oswald", "Montserrat", "Poppins", "Playfair Display", "Permanent Marker", "Pacifico", "Lobster", "Bangers"];

// Where a part sits in its print area: a box in % of the area. Pictures fill their box (keeping their shape); words
// are fitted into it. Two parts can share an area when their boxes don't overlap (top + bottom-band, …).
export const PLACES = {
  full: { box: { x: 0, y: 0, width: 100, height: 100 }, valign: "top", about: "the whole area" },
  top: { box: { x: 0, y: 0, width: 100, height: 64 }, valign: "top", about: "the top two-thirds" },
  middle: { box: { x: 0, y: 18, width: 100, height: 64 }, valign: "middle", about: "the middle" },
  bottom: { box: { x: 0, y: 36, width: 100, height: 64 }, valign: "middle", about: "the bottom two-thirds" },
  small: { box: { x: 22, y: 18, width: 56, height: 56 }, valign: "middle", about: "small, in the centre" },
  "top-band": { box: { x: 0, y: 0, width: 100, height: 28 }, valign: "middle", about: "a band across the top" },
  "bottom-band": { box: { x: 0, y: 72, width: 100, height: 28 }, valign: "middle", about: "a band across the bottom" },
};
const SIZES = { big: 0.9, medium: 0.6, small: 0.38 }; // letter size, as a share of the words' box
const SHAPES = { straight: "straight", "arc-up": "arc-up", "arc-down": "arc-down" };

// Proven starting points (the sample rounds, 24–25 Oct 2026). The AI may use one, change it, or make its own.
const pic = (area, place = "full") => ({ kind: "picture", area, place });
const words = (area, place = "full", size = "big", shape) => ({ kind: "words", area, place, size, ...(shape ? { shape } : {}) });
export const LAYOUTS = {
  "back-poster": { label: "Tall poster on the back, words down the front strip", suits: "a big detailed picture; a short collector line", parts: [pic("centre-back"), words("front-right-vertical")] },
  "front-type": { label: "Big words on the chest, picture on the full back", suits: "a strong line of 1 to 4 words; a scene for the back", parts: [words("centre-front", "top"), pic("full-back")] },
  "front-badge": { label: "Badge on the chest, words across the top of the back", suits: "an emblem or round picture; a short line", parts: [pic("centre-front"), words("top-back")] },
  "back-sleeve": { label: "Picture on the full back, a word on the left sleeve", suits: "a wide picture; one or two small words", parts: [pic("full-back"), words("left-sleeve", "middle", "medium")] },
  "back-chest": { label: "Tall picture on the back, a word on the right chest", suits: "a tall picture; one short word", parts: [pic("centre-back"), words("right-chest", "middle", "medium")] },
  "front-poster": { label: "Big picture over the whole front, a line across the top of the back", suits: "a bold front picture", parts: [pic("full-front"), words("top-back")] },
  "chest-logo": { label: "Small logo on the left chest, big words on the back", suits: "a simple logo; a strong back line", parts: [pic("left-chest"), words("full-back", "middle")] },
  "chest-words": { label: "A word on the left chest, picture on the full back", suits: "a back picture; one short word for the chest", parts: [words("left-chest", "middle", "medium"), pic("full-back")] },
  "vertical-back": { label: "Picture on the chest, words down the middle of the back", suits: "a chest picture; a name that reads running down", parts: [pic("centre-front"), words("vertical-back")] },
  "front-caption": { label: "Picture on the chest with its words underneath", suits: "a picture and its caption together", parts: [pic("centre-front", "top"), words("centre-front", "bottom-band")] },
  "back-caption": { label: "Picture on the full back with its words underneath", suits: "a big back picture with its title", parts: [pic("full-back", "top"), words("full-back", "bottom-band")] },
  "words-only": { label: "Only words: big on the chest, small at the top of the back", suits: "a slogan or dialogue tee, no picture", parts: [words("centre-front", "middle"), words("top-back", "full", "medium")] },
  "logo-and-back": { label: "Small logo on the left chest and a big picture on the back", suits: "a brand-style tee with two pictures", parts: [pic("left-chest"), pic("full-back")] },
  // (25 Oct 2026: 17 more, so there are 30 to pick from)
  "back-only": { label: "One big picture on the back, nothing on the front", suits: "a clean front and a statement back", parts: [pic("full-back")] },
  "front-only": { label: "One picture on the chest, nothing on the back", suits: "a simple everyday tee", parts: [pic("centre-front")] },
  "pocket-logo": { label: "Only a small logo on the left chest", suits: "a minimal, premium look", parts: [pic("left-chest")] },
  "front-and-back": { label: "A picture on the chest and a big picture on the back", suits: "two parts of one story, front and back", parts: [pic("centre-front"), pic("full-back")] },
  "back-and-sleeve-icon": { label: "Big picture on the back, a small icon on the left sleeve", suits: "a back picture with a small matching icon", parts: [pic("full-back"), pic("left-sleeve")] },
  "sleeves-and-chest": { label: "A picture on the chest, a word on each sleeve", suits: "a sporty look; two short words for the sleeves", parts: [pic("centre-front"), words("left-sleeve", "middle", "medium"), words("right-sleeve", "middle", "medium")] },
  "jersey": { label: "Jersey style: a name on the right chest, big words on the back", suits: "a team or fan tee; a name and a big back word or number", parts: [words("right-chest", "middle", "medium"), words("full-back", "full", "big")] },
  "back-title-over-art": { label: "A title across the top of the back, the picture under it", suits: "a movie-poster back: title above the picture", parts: [words("full-back", "top-band"), pic("full-back", "bottom")] },
  "chest-curved-title": { label: "A curved title over a picture on the chest", suits: "a badge or crest look: an arched title over an emblem", parts: [words("centre-front", "top-band", "big", "arc-up"), pic("centre-front", "bottom")] },
  "strip-and-logo": { label: "Words down the middle of the front and a small logo on the left chest", suits: "a modern streetwear front", parts: [words("vertical-front"), pic("left-chest")] },
  "front-poster-caption": { label: "Big picture over the whole front with its title underneath", suits: "a full front movie-poster look", parts: [pic("full-front", "top"), words("full-front", "bottom-band")] },
  "emblem-and-back-words": { label: "A small emblem in the middle of the chest, big words on the back", suits: "a clean emblem front; a strong back line", parts: [pic("centre-front", "small"), words("full-back", "middle")] },
  "two-chests": { label: "A logo on the left chest and a word on the right chest", suits: "a neat front only; a logo and one short word", parts: [pic("left-chest"), words("right-chest", "middle", "medium")] },
  "back-words-only": { label: "Only big words on the back", suits: "a slogan or dialogue on the back, clean front", parts: [words("full-back", "middle")] },
  "words-front-band-back": { label: "Big words on the chest, a wide picture across the top of the back", suits: "a line on the front; a skyline or wide scene on the back", parts: [words("centre-front", "middle"), pic("top-back")] },
  "art-and-sleeve-word": { label: "A picture on the chest and a word on the left sleeve", suits: "a chest picture with a small sleeve detail", parts: [pic("centre-front"), words("left-sleeve", "middle", "medium")] },
  "logo-back-sleeve": { label: "Logo on the left chest, big picture on the back, a word on the right sleeve", suits: "a full brand look with three prints", parts: [pic("left-chest"), pic("full-back"), words("right-sleeve", "middle", "medium")] },
};

/* ---------- small helpers ---------- */
const textMock = () => process.env.AI_TEXT_PROVIDER?.trim() === "mock";
const round2 = (n) => Math.round(n * 100) / 100;
const HEX = /^#[0-9a-f]{6}$/i;
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
// light / dark like the design room (studio/DesignRoomPage.jsx lum)
const lum = (hex) => {
  const n = parseInt(String(hex || "#000000").slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
export const isDark = (hex) => lum(hex) < 0.55;
// contrast between two colours (WCAG), as the design room's print check works it out
const rel = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [rel(a), rel(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const slugify = (name) =>
  `${String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tee"}-${crypto.randomBytes(3).toString("hex")}`;
const boxesOverlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
const cmOf = (positions, key) => positions.find((p) => p.key === key)?.cmBySize?.[LAYOUT_SIZE] || null;
// a strip (10 × 52 cm): words run down it, turned a quarter
const isStrip = ([w, h]) => w / h < 0.35;

/**
 * Checks a list of parts against a product: real areas, real places, areas that don't overlap on the tee, parts in
 * one area that don't overlap each other. The parts that don't fit are left out.
 * @returns {{ parts, dropped: string[] }}
 */
export function checkParts(parts, positions) {
  const byKey = Object.fromEntries(positions.map((p) => [p.key, p]));
  const kept = [];
  const dropped = [];
  for (const part of parts) {
    const pos = byKey[part.area];
    const place = PLACES[part.place] ? part.place : "full";
    if (!pos) {
      dropped.push(`${part.area || "an area"} is not on this product`);
      continue;
    }
    const clash = kept.find((k) => (k.area === part.area ? boxesOverlap(PLACES[k.place].box, PLACES[place].box) : byKey[k.area].conflicts?.includes(part.area)));
    if (clash) {
      dropped.push(`${pos.label} (${PLACES[place].about}) overlaps ${byKey[clash.area].label}`);
      continue;
    }
    kept.push({ ...part, place });
  }
  return { parts: kept, dropped };
}

// The starting layouts a product can use (all their areas offered and not overlapping).
export function layoutsFor(positions) {
  return Object.fromEntries(Object.entries(LAYOUTS).filter(([, l]) => checkParts(l.parts, positions).parts.length === l.parts.length));
}

// Each product the Collection maker can use now: its print areas, colours and starting layouts.
export async function garmentInfos() {
  const docs = await GarmentType.find({ key: { $in: GARMENTS }, isActive: true }).lean();
  const out = [];
  for (const key of GARMENTS) {
    const garment = docs.find((g) => g.key === key);
    if (!garment) continue;
    const positions = positionsForGarment(garment).positions;
    const colours = (garment.colors || []).map((c) => ({ slug: c.slug, name: c.name, hex: c.hex, dark: isDark(c.hex) }));
    out.push({ key, garment, positions, colours, layouts: layoutsFor(positions) });
  }
  if (!out.length) throw Object.assign(new Error("None of the Collection maker's products is live (Admin → Create your IDENTEE)."), { status: 400 });
  return out;
}
const infoOf = (infos, key) => {
  const info = infos.find((i) => i.key === key);
  if (!info) throw Object.assign(new Error("This tee's product is not live any more."), { status: 409 });
  return info;
};

// The art library, for the planner: the names it may use, by group (only active designs).
async function artLibrary() {
  const [designs, groups] = await Promise.all([ArtDesign.find({ isActive: true }).select("name category imageUrl").lean(), ArtCategory.find().select("name").lean()]);
  const groupName = Object.fromEntries(groups.map((g) => [String(g._id), g.name]));
  const byGroup = {};
  for (const d of designs) (byGroup[groupName[String(d.category)] || "Other"] ||= []).push(d.name);
  return { designs, byGroup };
}

// A text step's cost goes into Google's monthly spend (as the smart Assistant's messages do).
async function chargeText(collection, settings) {
  const cost = Number(settings.chatPricePerMessageInr) || 0;
  collection.spentInr = round2((collection.spentInr || 0) + cost);
  await AiChatUsage.create({ user: collection.createdBy, costInr: cost, model: "collection", kind: "collection" }).catch(() => {});
}
// A text answer that doesn't come back as JSON is asked for once more.
async function askTwice(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.status === 503 || err?.status === 429) throw err;
    return fn();
  }
}

/* ---------- 1. the brief ---------- */
const defaultBudget = (count) => Math.min(MAX_BUDGET, count + Math.ceil(count / 2));

// What the run still needs from the admin before it can start.
export const missingIn = (brief) => [!brief.garments?.length && "garments", !brief.count && "count", !brief.language && "language"].filter(Boolean);

/**
 * The brief as the admin left it (or as the AI wrote it), within its limits.
 * count / language may be null (not given yet: a question for the admin).
 */
export function cleanBrief(raw, infos) {
  const n = Math.round(Number(raw?.count));
  const count = Number.isFinite(n) && n >= 1 ? Math.min(MAX_TEES, n) : null;
  const garments = [...new Set((Array.isArray(raw?.garments) ? raw.garments : []).map(String))].filter((k) => infos.some((i) => i.key === k));
  const slugs = new Set(infos.flatMap((i) => i.colours.map((c) => c.slug)));
  const lang = clean(raw?.language, 60);
  const budget = Number(raw?.budget);
  const brief = {
    improved: String(raw?.improved ?? "").trim().slice(0, 3000),
    understood: (Array.isArray(raw?.understood) ? raw.understood : [])
      .map((e) => ({ label: clean(e?.label, 30), value: clean(e?.value, 200) }))
      .filter((e) => e.label && e.value)
      .slice(0, 10),
    theme: clean(raw?.theme, 200),
    count,
    garments,
    style: clean(raw?.style, 300),
    language: lang || null,
    colours: [...new Set((Array.isArray(raw?.colours) ? raw.colours : []).map(String).filter((s) => slugs.has(s)))],
    avoid: clean(raw?.avoid, 300),
    realPeople: raw?.realPeople === true,
    sources: SOURCES[raw?.sources] ? raw.sources : "ai",
    // the layouts the admin picked (each must fit at least one chosen product); [] = the AI chooses
    layouts: [...new Set((Array.isArray(raw?.layouts) ? raw.layouts : []).map(String))].filter((k) =>
      infos.some((i) => (!garments.length || garments.includes(i.key)) && (i.layouts ? i.layouts[k] : LAYOUTS[k])),
    ),
    budget: Number.isFinite(budget) && count && budget >= count ? Math.min(MAX_BUDGET, Math.round(budget)) : defaultBudget(count || 3),
  };
  brief.missing = missingIn(brief);
  return brief;
}

/**
 * The admin's prompt + example picture → the AI's improved brief and what it understood (not started yet).
 * Costs one text call.
 * @param image  { data: Buffer, mime } — the example picture (required)
 */
export async function makeBrief({ prompt, images = [], refImages = [], userId, garments = [], layouts = [] }) {
  if (!images.length) throw Object.assign(new Error("Add an example picture."), { status: 400 });
  // (made small for the AI: it reads the look, not the details — and many big photos would be too much to send)
  const small = await Promise.all(
    images.slice(0, 10).map(async (im) => ({ data: await sharp(im.data).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer().catch(() => im.data), mime: "image/jpeg" })),
  );
  const infos = await garmentInfos();
  const settings = await readSettings();
  if (!textMock() && !aiTextConfigured()) throw Object.assign(new Error("Google's AI is not set up."), { status: 503 });
  if (!textMock() && googleCapped(settings, await monthSpend())) throw Object.assign(new Error("This month's Google spending limit is reached (Admin → Settings → AI designs)."), { status: 429 });
  const colours = [...new Map(infos.flatMap((i) => i.colours).map((c) => [c.slug, { slug: c.slug, name: c.name }])).values()];
  const ask = [
    `You plan a collection of ready-made t-shirt designs for IDENTEE, an Indian t-shirt brand. The admin wrote a short request and attached ${small.length > 1 ? `${small.length} EXAMPLE pictures` : "an EXAMPLE picture"} they like. Improve the request into a clear brief for the designers, and say what you understood.`,
    'Answer with JSON only: {"improved": string, "understood": [{"label": string, "value": string}], "theme": string, "count": number|null, "garments": string[], "style": string, "language": string|null, "colours": string[], "avoid": string, "realPeople": boolean, "sources": "ai"|"art"|"both", "refNotes": string}.',
    "improved: the request rewritten as a clear, specific brief in English, 60 to 150 words: what the collection is about, the mood and look, what the designs should show (pictures, words, or both — any kind of design the admin wants: text-only, picture-only, several prints on one tee, a small chest logo, a big back print…), what to avoid. Keep every wish of the admin; add useful detail (for a film: its star, its character, its mood, the occasion), never change what they asked. The example picture is ONLY a reference for the look and mood: say the designs take its spirit (style, colours, energy) but are new, original artwork — never a copy of its picture, characters, text, logos or layout.",
    "understood: 4 to 8 short lines for the admin, in plain words, of what you understood (labels like Theme, Products, How many, Look, Pictures, Words, Avoid, Example). Each value under 120 characters. Where something was NOT given, say \"not given — please choose\".",
    "theme: what the collection is about, short and specific (e.g. \"SCENE — Suriya's film, Diwali 2026\").",
    `count: how many tees they asked for (1 to ${MAX_TEES}); null when they didn't say.`,
    "garments: the products they named, as keys from this list (\"tees\" or \"t-shirts\" alone names none; \"oversized\" = oversized-tee; \"round neck\" for boys/men = boys-round-neck, for girls/women = girls-round-neck, \"round neck\" alone = both round necks); [] when they named none: " + JSON.stringify(infos.map((i) => ({ key: i.key, name: i.garment.label }))),
    "style: the look and mood in a few words, from their words and the example picture.",
    `language: the language of the words printed on the tees, one of ${JSON.stringify(LANGUAGES)}, when they said it or clearly implied it (Tamil slang = Tanglish; "no text" = No words); null when they didn't say.`,
    "colours: the tee colours (slugs) they named; [] when they named none: " + JSON.stringify(colours),
    "avoid: anything they said to leave out; \"\" if nothing.",
    "realPeople: true ONLY when they clearly want a real person's face or likeness on a tee (an actor, a player); else false.",
    'sources: where the pictures come from — "art" when they want designs from our art library only, "both" when they mention the art library and new pictures, else "ai".',
    small.length > 1
      ? `refNotes: what the ${small.length} example pictures have in common and what stands out in each (layout, art style, colours, lettering, mood), for the designers, in at most 100 words. Describe the style only — do not name the people in them. They are ONLY references: never to be copied.`
      : "refNotes: the example picture's look, for the designers, in at most 60 words: layout, art style, colours, lettering, mood. Describe the style only — do not name the people in it.",
    garments.length ? "The admin already chose the products: " + JSON.stringify(garments) + " — use exactly these for garments." : "",
    layouts.length
      ? "The admin already chose the layouts (where the prints go): " + JSON.stringify(layouts.map((k) => LAYOUTS[k]?.label).filter(Boolean)) + ". Mention them in understood (label Layouts). If the request clearly doesn't suit them (e.g. it asks for a big picture but only words-only layouts were chosen), say so plainly in understood (label Check)."
      : "",
    "The admin's request: " + JSON.stringify(String(prompt).slice(0, 2000)),
  ]
    .filter(Boolean)
    .join("\n");
  const out = textMock()
    ? {
        improved: `A test brief: ${String(prompt).slice(0, 200)}. New, original artwork that takes only the mood of the example picture.`,
        understood: [
          { label: "Theme", value: String(prompt).slice(0, 80) },
          { label: "Products", value: "not given — please choose" },
          { label: "How many", value: "not given — please choose" },
        ],
        theme: String(prompt).slice(0, 80),
        count: null,
        garments: [],
        style: "bold, retro",
        language: null,
        colours: [],
        avoid: "",
        realPeople: false,
        sources: /art library/i.test(prompt) ? "both" : "ai",
        refNotes: `Test example picture${small.length > 1 ? `s (${small.length})` : ""}: a bold poster look.`,
      }
    : await askTwice(() => askJsonWithImage(ask, small, 0.4, undefined, { timeoutMs: LONG_MS }));
  const collection = new DesignCollection({
    createdBy: userId,
    prompt: String(prompt).slice(0, 2000),
    refImage: refImages[0] || "",
    refImages: refImages.slice(0, 10),
    refNotes: clean(out?.refNotes, 900),
    // (the products and layouts the admin picked win over what the AI read in the prompt)
    brief: cleanBrief({ ...out, ...(garments.length ? { garments } : {}), layouts }, infos),
  });
  if (!textMock()) await chargeText(collection, settings);
  await collection.save();
  return collection;
}

/* ---------- 2. facts ---------- */
async function findFacts(collection, settings) {
  const { brief } = collection;
  const ask = [
    `Search the web for up-to-date facts that help design fan t-shirts about: ${brief.theme}.`,
    `The brief: ${JSON.stringify((brief.improved || collection.prompt).slice(0, 800))}.`,
    'Answer with JSON only: {"summary": string, "points": string[]}.',
    "summary: what it is, in at most 50 words.",
    "points: at most 8 short facts a designer can use — names of the characters and who plays them, dates, famous lines or dialogues (exact words, in the language they are known in), symbols, colours, slang, places, visual motifs. Only facts you found; no guesses.",
  ].join("\n");
  if (textMock()) return { summary: `Test facts about ${brief.theme}.`, points: ["A test fact."], sources: [] };
  const { json, sources } = await askGrounded(ask, 0.2);
  await chargeText(collection, settings);
  return {
    summary: clean(json?.summary, 400),
    points: (Array.isArray(json?.points) ? json.points : []).map((p) => clean(p, 200)).filter(Boolean).slice(0, 8),
    sources,
  };
}

/* ---------- 3. plans ---------- */
// What the planner (and the change step) are told about how a tee is built.
function partRules({ brief, language, art }) {
  const noWords = language === "No words";
  return [
    "A tee is made of PARTS (1 to " + MAX_PARTS + "). Any design is allowed: words only, a picture only, a picture and words, several pictures and lines on different areas (a small chest logo and a big back print), a picture with its caption in one area — whatever suits the idea best.",
    'Each part: {"kind": "picture"|"art"|"words", "area": AREA_KEY, "place": PLACE, …}.',
    "- picture: a new picture drawn by the AI picture maker. Add \"subject\" (in English, at most 500 characters: exactly what it shows — who or what, pose, objects, composition, colours that stand out on the tee colour; words in it only if one short title word is essential, in quotes, with (spelled X-X-X); never mention a t-shirt, a mockup, a background or a frame), \"style\" (one of " + JSON.stringify(Object.keys(AI_STYLES)) + ") and \"realPerson\" (" + (brief.realPeople ? "true when it shows a real, named person — allowed" : "always false: never draw or name a real person; use characters, objects, symbols, silhouettes") + `). At most ${MAX_AI_PICTURES} picture parts on one tee.`,
    art?.length
      ? '- art: a ready picture from our art library (free). Add "name": EXACTLY one of these names, by group: ' + JSON.stringify(art)
      : "- art: not available.",
    noWords
      ? "- words: not used (no words on these tees)."
      : `- words: a line of words printed in a font. Add "text" (in ${language}, spelled correctly, short; 2 lines at most, joined with \\n), "font" (one of ${JSON.stringify(FONTS)}), "ink" (#RRGGBB, clearly visible on the tee colour), "size" (big | medium | small) and "shape" (straight | arc-up | arc-down — a curved line over or under a picture).`,
    "place: where in the area — " + JSON.stringify(Object.fromEntries(Object.entries(PLACES).map(([k, p]) => [k, p.about]))) + ". Two parts may share an area only when their places don't overlap (top + bottom-band, top-band + bottom, top-band + bottom-band). Areas listed in an area's conflicts can't both be used on one tee. A narrow strip area (about 10 cm wide) suits words running down it.",
  ].join("\n");
}

// The planner's / change step's parts → checked parts for one product, with everything filled in.
export function cleanParts(rawParts, info, { brief, colour, artNames = new Set(), noWords = false }) {
  const allowAi = brief.sources !== "art";
  const allowArt = brief.sources !== "ai";
  let aiPictures = 0;
  const parts = [];
  for (const raw of Array.isArray(rawParts) ? rawParts : []) {
    if (parts.length >= MAX_PARTS) break;
    const kind = String(raw?.kind || "");
    const base = { area: String(raw?.area || ""), place: String(raw?.place || "full") };
    if (Number.isInteger(raw?.keep)) base.keep = raw.keep; // (the change step: keep an earlier part's picture)
    if (kind === "words") {
      if (noWords) continue;
      const text = String(raw?.text || "").split(/\\n|\n/).map((l) => clean(l, 40)).filter(Boolean).slice(0, 2).join("\n");
      if (!text) continue;
      let ink = HEX.test(String(raw?.ink)) ? String(raw.ink).toUpperCase() : null;
      if (!ink || contrast(ink, colour.hex) < 3) ink = colour.dark ? "#FFFFFF" : "#141110";
      const shape = SHAPES[raw?.shape] ? raw.shape : "straight";
      // (a curve carries one line only: two lines on a curve lost the second one — the real run, 25 Oct 2026)
      parts.push({ kind, ...base, text: shape === "straight" ? text : text.replace(/\n/g, " "), font: FONTS.includes(raw?.font) ? raw.font : "Anton", ink, size: SIZES[raw?.size] ? raw.size : "big", shape });
    } else if (kind === "art" && allowArt && artNames.has(String(raw?.name || "").toLowerCase())) {
      parts.push({ kind, ...base, name: String(raw.name) });
    } else if (kind === "picture" || (kind === "art" && allowAi)) {
      // (an art name that isn't in the library is drawn instead, when AI pictures are allowed)
      if (!allowAi && !Number.isInteger(raw?.keep)) continue;
      if (aiPictures >= MAX_AI_PICTURES && !Number.isInteger(raw?.keep)) continue;
      const subject = clean(raw?.subject || (kind === "art" ? raw?.name : ""), 700);
      if (!subject && !Number.isInteger(raw?.keep)) continue;
      if (!Number.isInteger(raw?.keep)) aiPictures += 1;
      parts.push({ kind: "picture", ...base, subject, style: AI_STYLES[raw?.style] ? raw.style : "Detailed art", realPerson: brief.realPeople && raw?.realPerson === true });
    }
  }
  return checkParts(parts, info.positions);
}

const allowedColours = (info, brief) => {
  const list = brief.colours.length ? info.colours.filter((c) => brief.colours.includes(c.slug)) : info.colours;
  return list.length ? list : info.colours;
};

// The tees for the layouts the admin picked: spread over the layouts (and, for each, over the chosen products that
// have its print areas), in order.
export function assignLayouts(count, layoutKeys, chosen) {
  const out = [];
  const turn = {};
  for (let i = 0; i < count; i++) {
    const key = layoutKeys[i % layoutKeys.length];
    const fits = chosen.filter((c) => c.layouts[key]);
    if (!fits.length) continue;
    const info = fits[(turn[key] = (turn[key] ?? -1) + 1) % fits.length];
    out.push({ key, info });
  }
  return out;
}

// The admin picked the layouts: the AI fills each tee's places — the pictures' subjects and the words — and can't
// move them. The parts it returns are matched to the layout's places one by one.
async function fillLayouts(collection, chosen, settings, { lib, artNames, noWords }) {
  const { brief, facts } = collection;
  // "No words": the layouts made only of words can't be used
  const usable = noWords ? brief.layouts.filter((k) => LAYOUTS[k]?.parts.some((p) => p.kind !== "words")) : brief.layouts;
  if (!usable.length) throw Object.assign(new Error("The picked layouts are only words, but the tees are to have no words. Pick a layout with a picture."), { status: 400 });
  const slots = assignLayouts(brief.count, usable, chosen);
  if (!slots.length) throw Object.assign(new Error("None of the picked layouts fits the chosen products."), { status: 400 });
  const tees = slots.map(({ key, info }, i) => ({
    tee: i + 1,
    product: info.key,
    productName: info.garment.label,
    layout: LAYOUTS[key].label,
    places: LAYOUTS[key].parts.map((p, j) => ({
      place: j,
      kind: p.kind === "words" ? (noWords ? "words (leave out: no words on these tees)" : "words") : "picture",
      area: info.positions.find((x) => x.key === p.area)?.label,
      where: PLACES[p.place].about,
      cm: cmOf(info.positions, p.area),
    })),
    colours: allowedColours(info, brief).map((c) => ({ slug: c.slug, name: c.name, dark: c.dark })),
  }));
  const ask = [
    "You are the art director of IDENTEE, an Indian t-shirt brand. The admin chose the LAYOUT of each tee (what goes where); you fill each tee's places with content that suits the brief.",
    'Answer with JSON only: {"tees": [{"name": string, "blurb": string, "idea": string, "colour": string, "parts": [CONTENT, …]}]} — one entry per tee, in order, and in each, one CONTENT per place, in the places\' order.',
    "Make the tees clearly different from each other (a different idea, and where possible a different tee colour). colour: one of that tee's colours (light, bright art on a dark tee; dark art on a light tee — everything must stand out clearly).",
    "name: a shop name for the tee, 2 to 4 words. blurb: one line for the shop page, at most 140 characters. idea: the idea in one sentence, for the admin.",
    "CONTENT for a picture place: {\"subject\": in English, at most 500 characters, exactly what the picture shows (who or what, pose, objects, composition, colours that stand out on the tee colour) — drawn to fit the place's shape (cm), so a tall place gets a tall composition, a small chest place a simple bold icon; words in it only if one short title word is essential, in quotes, with (spelled X-X-X); never mention a t-shirt, a mockup, a background or a frame, \"style\": one of " +
      JSON.stringify(Object.keys(AI_STYLES)) +
      ", \"realPerson\": " +
      (brief.realPeople ? "true when it shows a real, named person (allowed)" : "always false — never draw or name a real person; use characters, objects, symbols, silhouettes") +
      "}" +
      (lib.designs.length ? ' — or, to use a ready picture from our art library (free), {"art": EXACTLY one of these names}: ' + JSON.stringify(lib.byGroup) : "") +
      ".",
    brief.sources === "art" ? "Pictures: ONLY art library pictures ({\"art\": name}) — no new pictures." : brief.sources === "both" ? "Pictures: use art from our library where it fits, new pictures where it doesn't." : "",
    noWords
      ? "CONTENT for a words place: {} (no words on these tees)."
      : `CONTENT for a words place: {"text": in ${brief.language}, spelled correctly, short enough for the place (2 lines at most, joined with \\n), "font": one of ${JSON.stringify(FONTS)}, "ink": #RRGGBB clearly visible on the tee colour, "shape": straight | arc-up | arc-down}. Use a famous line or name from the facts when one fits.`,
    collection.refNotes
      ? `The admin's example picture (a REFERENCE only): ${collection.refNotes} Take its spirit — style, colours, energy — and make NEW, original artwork; never copy its picture, characters, text, logos or layout.`
      : "",
    brief.style ? `The look and mood: ${brief.style}.` : "",
    brief.avoid ? `Leave out: ${brief.avoid}.` : "",
    `Theme: ${brief.theme}.`,
    `The brief: ${brief.improved || collection.prompt}`,
    facts?.summary ? `Facts (use names and famous lines from these where they fit): ${facts.summary} ${facts.points.join(" · ")}` : "",
    "The tees and their places: " + JSON.stringify(tees),
  ]
    .filter(Boolean)
    .join("\n");
  const out = textMock()
    ? {
        tees: slots.map(({ key, info }, i) => ({
          name: `Test tee ${i + 1}`,
          blurb: "A test design.",
          idea: "A test idea.",
          colour: allowedColours(info, brief)[i % allowedColours(info, brief).length]?.slug,
          parts: LAYOUTS[key].parts.map((p, j) =>
            p.kind === "words"
              ? { text: ["SCENE", "ON DUTY", "VERA LEVEL", "INBARAJ"][(i + j) % 4], font: FONTS[(i + j) % FONTS.length], ink: "#F2C21B" }
              : lib.designs.length && brief.sources !== "ai"
                ? { art: lib.designs[(i + j) % lib.designs.length].name }
                : { subject: `A test picture about ${brief.theme}`, style: "Bold mascot" },
          ),
        })),
      }
    : await askTwice(() => askJson(ask, 0.9, process.env.AI_IDEA_MODEL?.trim() || "gemini-flash-latest", { timeoutMs: LONG_MS }));
  if (!textMock()) await chargeText(collection, settings);
  const list = Array.isArray(out?.tees) ? out.tees : [];
  return slots.map(({ key, info }, i) => {
    const t = list[i] || {};
    const colours = allowedColours(info, brief);
    const colour = colours.find((c) => c.slug === t.colour) || colours[i % colours.length];
    const notes = [];
    // the layout's places, each filled with the AI's content for it (a place left empty gets the theme)
    const raw = LAYOUTS[key].parts.map((slot, j) => {
      const c = (Array.isArray(t.parts) ? t.parts[j] : null) || {};
      if (slot.kind === "words") return { ...slot, text: c.text || (noWords ? "" : brief.theme.split(/[—–-]/)[0].trim().slice(0, 24)), font: c.font, ink: c.ink, shape: c.shape || slot.shape };
      if (c.art && artNames.has(String(c.art).toLowerCase())) return { ...slot, kind: "art", name: String(c.art) };
      return { ...slot, kind: "picture", subject: c.subject || `${brief.theme}, ${brief.style}`, style: c.style, realPerson: c.realPerson };
    });
    const { parts, dropped } = cleanParts(raw, info, { brief, colour, artNames, noWords });
    if (parts.length < raw.length && noWords) notes.push("The layout's words were left out (no words on these tees).");
    return {
      garmentType: info.key,
      name: clean(t.name, 60) || `${brief.theme} tee ${i + 1}`.slice(0, 60),
      blurb: clean(t.blurb, 300),
      colour,
      plan: { idea: clean(t.idea, 300), layout: key, parts, notes: [...notes, ...dropped] },
    };
  });
}

async function planTees(collection, infos, settings) {
  const { brief, facts } = collection;
  const chosen = infos.filter((i) => brief.garments.includes(i.key));
  const lib = brief.sources === "ai" ? { designs: [], byGroup: {} } : await artLibrary();
  const artNames = new Set(lib.designs.map((d) => d.name.toLowerCase()));
  // the admin picked the layouts: the AI only fills them
  if (brief.layouts?.length) return fillLayouts(collection, chosen, settings, { lib, artNames, noWords: brief.language === "No words" });
  const products = chosen.map((i) => ({
    product: i.key,
    name: i.garment.label,
    areas: i.positions.map((p) => ({ key: p.key, label: p.label, side: p.side, cm: p.cmBySize?.[LAYOUT_SIZE], conflicts: p.conflicts })),
    startingLayouts: Object.entries(i.layouts).map(([key, l]) => ({ key, layout: l.label, suits: l.suits, parts: l.parts })),
    colours: allowedColours(i, brief).map((c) => ({ slug: c.slug, name: c.name, dark: c.dark })),
  }));
  const noWords = brief.language === "No words";
  const ask = [
    "You are the art director of IDENTEE, an Indian t-shirt brand. Plan ready-made t-shirt designs for this brief.",
    'Answer with JSON only: {"tees": [{"product": string, "name": string, "blurb": string, "idea": string, "layout": string, "colour": string, "parts": [PART, …]}]}.',
    `Make exactly ${brief.count} tees, each clearly different from the others (a different idea, a different arrangement of parts, and where possible a different tee colour).${chosen.length > 1 ? " Spread them over the products." : ""}`,
    "product: a product key. colour: one of THAT product's colours (light, bright art on a dark tee; dark art on a light tee — everything must stand out clearly). layout: the key of the starting layout you used, or \"custom\". The products, their print areas (cm, and which areas conflict) and their starting layouts: " + JSON.stringify(products),
    "name: a shop name for the tee, 2 to 4 words. blurb: one line for the shop page, at most 140 characters. idea: the idea in one sentence, for the admin.",
    partRules({ brief, language: brief.language, art: lib.byGroup && Object.keys(lib.byGroup).length ? lib.byGroup : null }),
    brief.sources === "art" ? "Pictures: ONLY art parts from our library (no picture parts)." : brief.sources === "both" ? "Pictures: use art from our library where it fits, new AI pictures where it doesn't." : "",
    collection.refNotes
      ? `The admin's example picture (a REFERENCE only): ${collection.refNotes} Take its spirit — style, colours, energy — and make NEW, original artwork: a different composition, different figures and objects; never copy its picture, characters, text, logos or layout.`
      : "",
    brief.style ? `The look and mood: ${brief.style}.` : "",
    brief.avoid ? `Leave out: ${brief.avoid}.` : "",
    `Theme: ${brief.theme}.`,
    `The brief: ${brief.improved || collection.prompt}`,
    facts?.summary ? `Facts (use names and famous lines from these where they fit): ${facts.summary} ${facts.points.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const out = textMock()
    ? {
        tees: Array.from({ length: brief.count }, (_, i) => {
          const info = chosen[i % chosen.length];
          const keys = Object.keys(info.layouts);
          const key = keys[i % keys.length];
          const colours = allowedColours(info, brief);
          return {
            product: info.key,
            name: `Test tee ${i + 1}`,
            blurb: "A test design.",
            idea: "A test idea.",
            layout: key,
            colour: colours[i % colours.length]?.slug,
            parts: info.layouts[key].parts.map((p, j) =>
              p.kind === "words"
                ? { ...p, text: ["SCENE", "ON DUTY", "VERA LEVEL", "INBARAJ"][(i + j) % 4], font: FONTS[(i + j) % FONTS.length], ink: "#F2C21B" }
                : lib.designs.length && j === 0 && brief.sources !== "ai"
                  ? { ...p, kind: "art", name: lib.designs[i % lib.designs.length].name }
                  : { ...p, subject: `A test picture about ${brief.theme}`, style: "Bold mascot" },
            ),
          };
        }),
      }
    : await askTwice(() => askJson(ask, 0.9, process.env.AI_IDEA_MODEL?.trim() || "gemini-flash-latest", { timeoutMs: LONG_MS }));
  if (!textMock()) await chargeText(collection, settings);
  const list = (Array.isArray(out?.tees) ? out.tees : []).slice(0, brief.count);
  if (!list.length) throw Object.assign(new Error("The AI didn't plan any tees. Try again with a clearer prompt."), { status: 502 });
  return list.map((t, i) => {
    const info = chosen.find((c) => c.key === t?.product) || chosen[i % chosen.length];
    const colours = allowedColours(info, brief);
    const colour = colours.find((c) => c.slug === t?.colour) || colours[i % colours.length];
    let { parts, dropped } = cleanParts(t?.parts, info, { brief, colour, artNames, noWords });
    // nothing usable came back: a starting layout with the theme
    if (!parts.length) {
      const key = Object.keys(info.layouts)[i % Object.keys(info.layouts).length];
      ({ parts } = cleanParts(
        LAYOUTS[key].parts.map((p) => (p.kind === "words" ? { ...p, text: brief.theme.slice(0, 24) } : { ...p, subject: `${brief.theme}, ${brief.style}` })),
        info,
        { brief: { ...brief, sources: brief.sources === "art" ? "both" : brief.sources }, colour, noWords },
      ));
      dropped = ["The AI's own parts couldn't be used; a starting layout was used instead."];
    }
    return {
      garmentType: info.key,
      name: clean(t?.name, 60) || `${brief.theme} tee ${i + 1}`.slice(0, 60),
      blurb: clean(t?.blurb, 300),
      colour,
      plan: { idea: clean(t?.idea, 300), layout: LAYOUTS[t?.layout] ? t.layout : "custom", parts, notes: dropped },
    };
  });
}

/* ---------- 4. pictures ---------- */
function grokPrompt({ subject, style, teeColour, teeIsDark }) {
  return [
    "Premium streetwear t-shirt print artwork, highly detailed.",
    `Subject: ${subject}`,
    `Style: ${AI_STYLES[style] || AI_STYLES["Detailed art"]}.`,
    `Use colours that stand out on a ${teeColour} t-shirt.`,
    `The background must be flat pure ${teeIsDark ? "black" : "white"} and nothing else: no scenery, no wall, no texture, no shadow on it.`,
    "Do not draw a t-shirt, a mockup or a person wearing it. No frame, no border, no watermark, no signature.",
  ].join(" ");
}

const stop = (message) => Object.assign(new Error(message), { stopRun: true });

// a stored picture's bytes (Cloudinary or a local /uploads path)
async function readStored(url) {
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("picture not found");
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFile(path.join(process.cwd(), String(url).replace(/^\/+/, "")));
}

// An art library picture for a part (free): its address and size.
async function artPicture(name) {
  const art = await ArtDesign.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), isActive: true }).lean();
  if (!art) throw Object.assign(new Error(`“${name}” is not in the art library.`), { status: 404 });
  const md = await sharp(await readStored(art.imageUrl)).metadata(); // (throws when the file is gone)
  return { url: art.imageUrl, width: md.width || 1000, height: md.height || 1000, service: "art", artDesignId: String(art._id), cost: 0 };
}

// One AI picture for a part, within the budget and the monthly caps. Returns the stored, cut-out picture.
async function aiPicture(part, collection, info, colour, { ignoreBudget = false } = {}) {
  const settings = await readSettings();
  const [wCm, hCm] = cmOf(info.positions, part.area) || [35, 52];
  const box = PLACES[part.place].box;
  const ratio = nearestRatio((wCm * box.width) / (hCm * box.height));
  const ask = { subject: part.subject, style: part.style, teeColour: colour.name.toLowerCase(), teeIsDark: colour.dark };
  const wantGrok = part.realPerson && collection.brief.realPeople;

  let made = null;
  let byGrok = false;
  let lastErr = null;
  // at most 2 tries (a second one only when the first simply failed — not when it was refused)
  for (let attempt = 0; attempt < 2 && !made; attempt++) {
    if (!ignoreBudget && collection.pictures >= collection.brief.budget) throw stop("The picture budget for this run is used up.");
    const month = await monthSpend();
    const useGrok = wantGrok && xaiConfigured();
    if (useGrok && grokCapped(settings, month)) throw stop("This month's Grok spending limit is reached (Admin → Settings → AI designs).");
    if (!useGrok && googleCapped(settings, month)) throw stop("This month's Google spending limit is reached (Admin → Settings → AI designs).");
    if (!useGrok && !aiImageConfigured()) throw stop("Google's picture AI is not set up.");
    try {
      made = useGrok ? await xaiNewImage({ prompt: grokPrompt(ask), ratio }) : await generateImage({ prompt: newDesignPrompt({ ...ask, variation: 1, of: 1 }), ratio });
      byGrok = useGrok;
    } catch (err) {
      lastErr = err;
      const refused = err?.status === 422 || err?.noImage === true;
      // Google refuses real people: Grok makes it, but only when the admin ticked "real people"
      if (refused && !useGrok && collection.brief.realPeople && xaiConfigured() && !grokCapped(settings, month)) {
        try {
          made = await xaiNewImage({ prompt: grokPrompt(ask), ratio });
          byGrok = true;
        } catch (e) {
          lastErr = e;
        }
      }
      if (refused && !made) break;
    }
  }
  if (!made) {
    const refused = lastErr?.status === 422 || lastErr?.noImage === true;
    throw Object.assign(new Error(refused ? "The picture AI refused this idea (it often refuses real people and famous characters)." : lastErr?.message || "The picture could not be made."), { status: lastErr?.status || 502 });
  }

  // (the free stand-in picture maker, AI_IMAGE_PROVIDER=mock, costs nothing)
  const cost = byGrok ? settings.grokPricePerImageInr : aiImageModel() === "mock" ? 0 : settings.pricePerImageInr;
  collection.pictures += 1;
  collection.spentInr = round2((collection.spentInr || 0) + cost);
  await AiUsage.create({
    user: collection.createdBy,
    kind: "collection",
    prompt: part.subject.slice(0, 2200),
    style: part.style,
    images: 1,
    costInr: round2(cost),
    model: byGrok ? xaiModel() : aiImageModel(),
  });

  // cut out of its plain background, the empty edges trimmed, so it fills its box
  const cut = await cutOutPlainBackground(made.buffer).catch(() => null);
  let buffer = cut?.buffer || made.buffer;
  let mime = cut?.mime || made.mime;
  let { width = 1024, height = 1024 } = cut || {};
  if (cut?.cut) {
    try {
      const t = await sharp(buffer).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
      buffer = t.data;
      mime = "image/png";
      width = t.info.width;
      height = t.info.height;
    } catch {
      // keep it untrimmed
    }
  } else if (!cut) {
    const md = await sharp(buffer).metadata().catch(() => ({}));
    width = md.width || width;
    height = md.height || height;
  }
  // (the ai-designs folder: the checkout knows these as AI pictures — utils/aiPricing.js)
  const stored = await uploadFile(buffer, mime, "ai-designs");
  // cut: false = its background wasn't plain, so it prints as a rectangle with its background
  return { url: stored.url, width, height, service: byGrok ? "grok" : "google", cost: round2(cost), cut: !!cut?.cut };
}

/* ---------- 5. placing ---------- */
// The picture as big as it fits in its box (keeping its shape), centred across; at the top or in the middle.
// box: the part of the area it may use, in % of the area (default the whole area).
export function fitArt([wCm, hCm], ratio, valign, box = { x: 0, y: 0, width: 100, height: 100 }) {
  const maxW = box.width - 4;
  const maxH = box.height - 4;
  let h = maxH;
  let w = (ratio * h * hCm) / wCm;
  if (w > maxW) {
    w = maxW;
    h = (w * wCm) / (ratio * hCm);
  }
  return {
    x: round2(box.x + (box.width - w) / 2),
    y: round2(valign === "top" ? box.y + 2 : box.y + (box.height - h) / 2),
    width: round2(w),
    height: round2(h),
  };
}

// The box the words are fitted into (inside their place), and their largest letter size (% of the area's height).
export function wordsSlot(part, cm) {
  const b = PLACES[part.place].box;
  const slot = { x: round2(b.x + 3), y: round2(b.y + b.height * 0.08), width: round2(b.width - 6), height: round2(b.height * 0.84) };
  const strip = isStrip(cm);
  const k = SIZES[part.size] || SIZES.big;
  // a strip: the words run down it, so the letters are as tall as the strip is wide
  const pct = strip ? ((slot.width / 100) * cm[0] * k * 100) / cm[1] : slot.height * k;
  return { slot: { ...slot, rotation: strip ? 90 : 0 }, pct: round2(Math.min(60, pct)) };
}

// Every part of a planned tee as layout v2 elements (a part's picture is in part.art).
export function placeParts(parts, info) {
  const els = [];
  parts.forEach((part, i) => {
    const pos = info.positions.find((p) => p.key === part.area);
    const cm = cmOf(info.positions, part.area);
    if (!pos || !cm) return;
    if (part.kind === "words") {
      const { slot, pct } = wordsSlot(part, cm);
      els.push({
        id: `p${i}`,
        type: "text",
        text: part.text,
        fontFamily: part.font,
        fontSizePct: pct,
        color: part.ink,
        align: "center",
        effect: part.shape || "straight",
        lineHeight: 1.05,
        position: pos.key,
        side: pos.side,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        rotation: slot.rotation,
        zIndex: 10 + i,
        slot, // the admin's browser fits the words into this box
      });
    } else if (part.art?.url) {
      const place = PLACES[part.place];
      els.push({
        id: `p${i}`,
        type: "image",
        src: part.art.url,
        ...(part.art.artDesignId ? { artDesignId: part.art.artDesignId } : {}),
        position: pos.key,
        side: pos.side,
        ...fitArt(cm, part.art.width / Math.max(1, part.art.height), place.valign, place.box),
        rotation: 0,
        zIndex: 1 + i,
      });
    }
  });
  return els;
}
// (the first plans, before parts: one picture + one line of words)
export function placeElements(design, info) {
  return placeParts(partsOf(design), info);
}
export function partsOf(design) {
  if (design.plan?.parts?.length) return design.plan.parts;
  const layout = LAYOUTS[design.plan?.layout];
  if (!layout) return [];
  return layout.parts
    .map((p) => (p.kind === "words" ? (design.plan.words ? { ...p, text: design.plan.words, font: design.plan.font, ink: design.plan.ink } : null) : { ...p, subject: design.plan.subject, style: design.plan.style, art: design.art }))
    .filter(Boolean);
}

/* ---------- the run ---------- */
async function setStep(collection, step) {
  collection.step = step;
  await collection.save();
}

/**
 * Makes the pictures a tee's parts need (kept ones are reused) and places everything. A failure marks the tee
 * failed; a reason to stop the whole run (budget, monthly cap) is thrown on.
 * @param fresh  make every AI picture again (New pictures), keeping the art library ones
 */
async function makeOne(design, collection, info, { ignoreBudget = false, fresh = false } = {}) {
  try {
    const colour = info.colours.find((c) => c.slug === design.color) || info.colours[0];
    const parts = design.plan.parts.map((p) => ({ ...p }));
    let cost = 0;
    for (const part of parts) {
      if (part.kind === "words") continue;
      if (part.art?.url && !(fresh && part.kind === "picture")) continue;
      if (part.kind === "art") {
        try {
          part.art = await artPicture(part.name);
        } catch {
          // the art library picture is missing (deleted from storage): drawn new when AI pictures are allowed
          if (collection.brief.sources === "art") throw Object.assign(new Error(`The art library picture “${part.name}” couldn't be loaded (it may have been deleted). Change the tee or reject it.`), { status: 404 });
          design.plan.notes = [...(design.plan.notes || []), `The art library picture “${part.name}” couldn't be loaded, so a new picture was drawn instead.`];
          Object.assign(part, { kind: "picture", subject: `${part.name}, ${collection.brief.style || "bold t-shirt art"}`, style: "Detailed art", realPerson: false });
          part.art = await aiPicture(part, collection, info, colour, { ignoreBudget });
        }
      } else {
        part.art = await aiPicture(part, collection, info, colour, { ignoreBudget });
      }
      if (part.kind === "picture" && part.art.cut === false) {
        design.plan.notes = [...(design.plan.notes || []), `The picture on ${info.positions.find((p) => p.key === part.area)?.label || part.area} came with its own background, so it prints as a rectangle. Try New pictures for a clean cut-out.`];
      }
      cost += part.art.cost || 0;
      await collection.save();
    }
    design.plan.parts = parts;
    design.markModified("plan");
    const services = [...new Set(parts.filter((p) => p.art).map((p) => p.art.service))];
    const first = parts.find((p) => p.art)?.art;
    design.art = first ? { url: first.url, width: first.width, height: first.height } : { url: "", width: 0, height: 0 };
    design.service = services.length > 1 ? "mixed" : services[0] || "";
    design.costInr = round2((design.costInr || 0) + cost);
    design.elements = placeParts(parts, info);
    design.mockups = { front: null, back: null, left: null, right: null };
    design.issues = [...(design.plan.notes || [])];
    design.status = "drafted";
    design.error = "";
  } catch (err) {
    design.status = "failed";
    design.error = String(err.message || "The picture could not be made.").slice(0, 300);
    if (err.stopRun) {
      await design.save();
      throw err;
    }
  }
  await design.save();
  await collection.save();
}

/**
 * Runs steps 2–5 for a started collection (in the background — the admin page follows `step`). A collection that
 * stopped part-way (Resume) carries on: tees already planned are not planned again, pictures made are kept.
 */
export async function runCollection(collectionId) {
  const collection = await DesignCollection.findById(collectionId);
  if (!collection || collection.status !== "running") return;
  try {
    const infos = await garmentInfos();
    const settings = await readSettings();
    let designs = await ReadyDesign.find({ collectionId: collection._id }).sort({ order: 1 });

    if (!designs.length) {
      await setStep(collection, "Looking up facts");
      try {
        collection.facts = await findFacts(collection, settings);
      } catch (err) {
        // the tees can still be made without them
        console.error("[collection] facts step failed:", err?.status || "", err?.message || err);
        collection.facts = { summary: "", points: [], sources: [] };
      }

      await setStep(collection, "Planning the tees");
      const plans = await planTees(collection, infos, settings);
      for (const [i, p] of plans.entries()) {
        designs.push(
          await ReadyDesign.create({
            collectionId: collection._id,
            name: p.name,
            slug: slugify(p.name),
            blurb: p.blurb,
            garmentType: p.garmentType,
            color: p.colour.slug,
            size: LAYOUT_SIZE,
            plan: p.plan,
            issues: p.plan.notes,
            order: i,
          }),
        );
      }
    }

    const todo = designs.filter((d) => d.status === "planned" || (d.status === "failed" && d.plan?.parts?.length));
    collection.error = "";
    for (const [i, design] of todo.entries()) {
      await setStep(collection, `Making the pictures for tee ${i + 1} of ${todo.length}`);
      try {
        await makeOne(design, collection, infoOf(infos, design.garmentType));
      } catch (err) {
        if (!err.stopRun) throw err;
        // budget or monthly cap: the tees not made yet are marked, the ones made stay
        for (const rest of todo.slice(i + 1)) {
          rest.status = "failed";
          rest.error = err.message;
          await rest.save();
        }
        collection.error = err.message;
        break;
      }
    }
    collection.status = "review";
    collection.step = "";
    collection.finishedAt = new Date();
    await collection.save();
  } catch (err) {
    console.error("[collection] run failed:", err?.message || err);
    collection.status = "failed";
    collection.step = "";
    // (the text AI's own short words — "unreachable", "failed" — said plainly)
    const plain = { unreachable: "Google's AI didn't answer in time.", failed: "Google's AI had a problem.", "not set up": "Google's AI is not set up." }[err?.message];
    collection.error = String(plain ? `${plain} Press Resume to try again — nothing made so far is lost.` : err?.message || "The run stopped.").slice(0, 300);
    collection.finishedAt = new Date();
    await collection.save().catch(() => {});
  }
}

// New pictures for one tee, the same parts (art library pictures stay). Not limited by the run's budget (the admin
// asked for it), still by the monthly caps.
export async function redoPicture(design) {
  const collection = await DesignCollection.findById(design.collectionId);
  if (!collection) throw Object.assign(new Error("Collection not found"), { status: 404 });
  const info = infoOf(await garmentInfos(), design.garmentType);
  if (!design.plan?.parts?.length) {
    design.plan.parts = partsOf(design).map(({ art, ...p }) => p); // eslint-disable-line no-unused-vars
    design.markModified("plan");
  }
  try {
    await makeOne(design, collection, info, { ignoreBudget: true, fresh: true });
  } catch (err) {
    // (a monthly cap: the tee is marked failed with the reason)
    if (!err.stopRun) throw err;
  }
  return design;
}

/**
 * The admin changes a tee in their own words ("make the words bigger", "put the picture on the front", "make it
 * navy", "add a small logo on the left chest"). The AI rebuilds the tee's parts; pictures it keeps are reused, new
 * ones are made (they cost; the monthly caps apply).
 */
export async function changeDesign(design, instruction) {
  const collection = await DesignCollection.findById(design.collectionId);
  if (!collection) throw Object.assign(new Error("Collection not found"), { status: 404 });
  const infos = await garmentInfos();
  const info = infoOf(infos, design.garmentType);
  const settings = await readSettings();
  if (!textMock() && googleCapped(settings, await monthSpend())) throw Object.assign(new Error("This month's Google spending limit is reached (Admin → Settings → AI designs)."), { status: 429 });
  const brief = collection.brief;
  const current = partsOf(design);
  const lib = brief.sources === "ai" ? { designs: [], byGroup: {} } : await artLibrary();
  const artNames = new Set(lib.designs.map((d) => d.name.toLowerCase()));
  const colours = info.colours;
  const ask = [
    "You change one ready-made t-shirt design for IDENTEE, an Indian t-shirt brand, exactly as the admin asks. Change only what they ask; keep everything else the same.",
    'Answer with JSON only: {"colour": string, "parts": [PART, …], "reply": string}.',
    "colour: the tee colour slug (the same unless they ask for another), from " + JSON.stringify(colours.map((c) => ({ slug: c.slug, name: c.name, dark: c.dark }))) + ".",
    "parts: the WHOLE new list of parts. To keep a current picture (moved, resized by its place, or unchanged), give that part with \"keep\": its index in the current list and NO subject — no new picture is made. Give a subject only for a picture that must be drawn new.",
    partRules({ brief, language: brief.language === "No words" ? "the tee's language" : brief.language, art: lib.byGroup && Object.keys(lib.byGroup).length ? lib.byGroup : null }),
    "This product's print areas (cm, conflicts): " + JSON.stringify(info.positions.map((p) => ({ key: p.key, label: p.label, side: p.side, cm: p.cmBySize?.[LAYOUT_SIZE], conflicts: p.conflicts }))),
    "reply: one short sentence for the admin saying what you changed.",
    "The tee now: " + JSON.stringify({ colour: design.color, parts: current.map(({ art, ...p }, i) => ({ index: i, ...p, hasPicture: !!art?.url })) }), // eslint-disable-line no-unused-vars
    "The admin asks: " + JSON.stringify(String(instruction).slice(0, 1000)),
  ].join("\n");
  const out = textMock()
    ? {
        colour: colours[(colours.findIndex((c) => c.slug === design.color) + 1) % colours.length].slug,
        parts: current.map((p, i) => (p.kind === "words" ? { ...p, text: `${p.text}!`, size: "big" } : { kind: p.kind, area: p.area, place: p.place, keep: i, name: p.name })),
        reply: "Test change: the next tee colour and the words a little louder.",
      }
    : await askTwice(() => askJson(ask, 0.3, process.env.AI_IDEA_MODEL?.trim() || "gemini-flash-latest", { timeoutMs: LONG_MS }));
  if (!textMock()) await chargeText(collection, settings);
  const colour = colours.find((c) => c.slug === out?.colour) || colours.find((c) => c.slug === design.color) || colours[0];
  const { parts, dropped } = cleanParts(out?.parts, info, { brief: { ...brief, sources: "both" }, colour, artNames, noWords: false });
  if (!parts.length) throw Object.assign(new Error("The AI couldn't make that change. Try saying it differently."), { status: 422 });
  // kept pictures come from the current parts
  for (const part of parts) {
    if (Number.isInteger(part.keep) && current[part.keep]?.art?.url) {
      const was = current[part.keep];
      part.kind = was.kind;
      part.art = was.art;
      if (was.kind === "art") part.name = was.name;
      else {
        part.subject = part.subject || was.subject;
        part.style = was.style;
        part.realPerson = was.realPerson;
      }
    }
    delete part.keep;
  }
  const ready = parts.filter((p) => p.kind === "words" || p.art?.url || (p.kind === "picture" ? p.subject : p.name));
  design.color = colour.slug;
  design.plan.parts = ready;
  design.plan.layout = "custom";
  design.plan.notes = dropped;
  design.markModified("plan");
  design.changes = [...(design.changes || []), clean(instruction, 300)].slice(-20);
  await makeOne(design, collection, info, { ignoreBudget: true }).catch((err) => {
    if (!err.stopRun) throw err;
  });
  return { design, reply: clean(out?.reply, 200) };
}

// A run that hasn't moved for a while stopped (the server restarted in the middle): say so.
export async function markStale(collection) {
  if (collection.status === "running" && Date.now() - new Date(collection.updatedAt).getTime() > STALE_MS) {
    collection.status = "failed";
    collection.error = "The run stopped (the server restarted). Press Resume to carry on — the tees made so far are kept.";
    collection.step = "";
    await collection.save();
  }
  return collection;
}
