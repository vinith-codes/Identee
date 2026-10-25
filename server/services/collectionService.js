// services/collectionService.js
//
// The Collection maker (Admin → Collection maker, 25 Oct 2026): ready-made tee designs for Shop your IDENTEE,
// made by a fixed PIPELINE — every run goes through the same steps in the same order:
//
//   1. brief    the admin's prompt (+ an example picture) → a checklist the admin checks and changes  [makeBrief]
//   2. facts    Google Search: the film's / topic's names, dates, famous lines                         [runCollection]
//   3. plan     one plan per tee: idea, one of our tested layouts, tee colour, words, picture
//   4. picture  Nano Banana (Grok only for a real person, when the admin ticked it), cut out, trimmed
//   5. place    the picture and the words on their print areas (true print size)
//   6. finish   in the admin's browser: the words fitted, the print check, the 3D mockup pictures
//   7. review   the admin publishes or rejects each tee
//
// Every picture counts against the run's budget and the monthly caps (Admin → Settings → AI designs).
//
//   AI_TEXT_PROVIDER=mock   the text steps (brief, facts, plan) answer with fixed stand-ins, no Google call —
//                           with AI_IMAGE_PROVIDER=mock the whole pipeline can be tested without spending
import crypto from "crypto";
import sharp from "sharp";
import GarmentType from "../models/garmentTypeModel.js";
import DesignCollection from "../models/designCollectionModel.js";
import ReadyDesign from "../models/readyDesignModel.js";
import AiUsage from "../models/aiUsageModel.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import { askGrounded, askJson, askJsonWithImage, aiTextConfigured } from "./aiTextService.js";
import { AI_STYLES, aiImageConfigured, aiImageModel, generateImage, nearestRatio, newDesignPrompt } from "./aiImageService.js";
import { xaiConfigured, xaiModel, xaiNewImage } from "./xaiImageService.js";
import { cutOutPlainBackground } from "./cutoutService.js";
import { uploadFile } from "../utils/imageStorage.js";
import { positionsForGarment } from "../data/printPositions.js";
import { googleCapped, grokCapped, monthSpend, readSettings } from "../controllers/aiController.js";

export const GARMENT = "oversized-tee"; // the shop launches with the Oversized Tee only
export const MAX_TEES = 10;
export const MAX_BUDGET = 20;
const LAYOUT_SIZE = "M"; // tees are laid out at M; every size prints at its own true print size
const STALE_MS = 10 * 60 * 1000; // a run that hasn't moved for 10 minutes stopped (the server restarted)

// The studio's fonts (frontend/src/studio/fonts.js — keep the two lists the same).
export const FONTS = ["Anton", "Bebas Neue", "Oswald", "Montserrat", "Poppins", "Playfair Display", "Permanent Marker", "Pacifico", "Lobster", "Bangers"];

// The layouts tried and liked in the sample rounds (24–25 Oct 2026). art / words: the print area and how the
// picture sits (top = from the top of the area) or the box the words are fitted into (in % of the area; the
// admin's browser measures the letters). pct: the largest letter size, in % of the area's height. max: letters.
export const LAYOUTS = {
  "back-poster": {
    label: "Tall poster on the back, words down the front strip",
    suits: "a big detailed picture (a person, a scene, a poster); the words are a short collector line (a name, a date)",
    art: { area: "centre-back", valign: "top" },
    words: { area: "front-right-vertical", slot: { x: 10, y: 3, width: 80, height: 94 }, rotation: 90, pct: 12, max: 28 },
  },
  "front-type": {
    label: "Big words on the chest, picture on the full back",
    suits: "a strong line of 1 to 4 words (a famous dialogue, a question, a slogan); a scene or object for the back",
    art: { area: "full-back", valign: "middle" },
    words: { area: "centre-front", slot: { x: 3, y: 6, width: 94, height: 46 }, pct: 24, max: 24 },
  },
  "front-badge": {
    label: "Badge on the chest, words across the top of the back",
    suits: "an emblem, badge, logo-like or round picture; a short funny line for the back",
    art: { area: "centre-front", valign: "middle" },
    words: { area: "top-back", slot: { x: 3, y: 8, width: 94, height: 84 }, pct: 60, max: 22 },
  },
  "back-sleeve": {
    label: "Picture on the full back, a word on the left sleeve",
    suits: "a scene, vehicle or wide picture; one or two small words",
    art: { area: "full-back", valign: "middle" },
    words: { area: "left-sleeve", slot: { x: 5, y: 25, width: 90, height: 50 }, pct: 24, max: 12 },
  },
  "back-chest": {
    label: "Tall picture on the back, a word on the right chest",
    suits: "a tall picture; one short word or name for the chest",
    art: { area: "centre-back", valign: "top" },
    words: { area: "right-chest", slot: { x: 4, y: 22, width: 92, height: 56 }, pct: 28, max: 14 },
  },
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

export async function garmentInfo() {
  const garment = await GarmentType.findOne({ key: GARMENT, isActive: true }).lean();
  if (!garment) throw Object.assign(new Error("The Oversized Tee is not set up (Admin → Customizable)."), { status: 400 });
  const positions = positionsForGarment(garment).positions;
  const colours = (garment.colors || []).map((c) => ({ slug: c.slug, name: c.name, hex: c.hex, dark: isDark(c.hex) }));
  // only the layouts whose print areas this garment offers
  const offered = new Set(positions.map((p) => p.key));
  const layouts = Object.fromEntries(Object.entries(LAYOUTS).filter(([, l]) => offered.has(l.art.area) && offered.has(l.words.area)));
  return { garment, positions, colours, layouts };
}
const cmOf = (positions, key) => positions.find((p) => p.key === key)?.cmBySize?.[LAYOUT_SIZE] || null;

// A text step's cost goes into Google's monthly spend (as the smart Assistant's messages do).
async function chargeText(collection, settings) {
  const cost = Number(settings.chatPricePerMessageInr) || 0;
  collection.spentInr = round2((collection.spentInr || 0) + cost);
  await AiChatUsage.create({ user: collection.createdBy, costInr: cost, model: "collection", kind: "collection" }).catch(() => {});
}

/* ---------- 1. the brief ---------- */
const defaultBudget = (count) => Math.min(MAX_BUDGET, count + Math.ceil(count / 2));

export function cleanBrief(raw, colours) {
  const count = Math.min(MAX_TEES, Math.max(1, Math.round(Number(raw?.count) || 3)));
  const slugs = new Set(colours.map((c) => c.slug));
  const budget = Number(raw?.budget);
  return {
    theme: clean(raw?.theme, 200),
    count,
    style: clean(raw?.style, 300),
    language: clean(raw?.language, 60) || "English",
    colours: [...new Set((Array.isArray(raw?.colours) ? raw.colours : []).map(String).filter((s) => slugs.has(s)))],
    avoid: clean(raw?.avoid, 300),
    realPeople: raw?.realPeople === true,
    budget: Number.isFinite(budget) && budget >= count ? Math.min(MAX_BUDGET, Math.round(budget)) : defaultBudget(count),
    garmentType: GARMENT,
  };
}

/**
 * The admin's prompt → a brief (not yet started). Costs one text call.
 * @param image  optional { data: Buffer, mime } — the example picture
 */
export async function makeBrief({ prompt, image, refImage, userId }) {
  const { colours } = await garmentInfo();
  const settings = await readSettings();
  if (!textMock() && !aiTextConfigured()) throw Object.assign(new Error("Google's AI is not set up."), { status: 503 });
  if (!textMock() && googleCapped(settings, await monthSpend())) throw Object.assign(new Error("This month's Google spending limit is reached (Admin → Settings → AI designs)."), { status: 429 });
  const ask = [
    "You plan a collection of ready-made t-shirt designs for IDENTEE, an Indian t-shirt brand (an oversized tee). The admin wrote a request; turn it into a brief.",
    'Answer with JSON only: {"theme": string, "count": number, "style": string, "language": string, "colours": string[], "avoid": string, "realPeople": boolean, "refNotes": string}.',
    "theme: what the collection is about, short and specific (for a film: its name, the star and the occasion, e.g. \"SCENE — Suriya's film, Diwali 2026\").",
    `count: how many tees they asked for (1 to ${MAX_TEES}); 3 when they didn't say.`,
    "style: the look and mood in a few words (\"retro poster, bold, slightly funny\"); your best suggestion when they didn't say.",
    "language: the language of the words printed on the tees as they asked (English, Tamil, Tanglish …); English when they didn't say.",
    "colours: the tee colours (slugs from this list) they named or that clearly suit; [] = any: " + JSON.stringify(colours.map((c) => ({ slug: c.slug, name: c.name }))),
    "avoid: anything they said to leave out; \"\" if nothing.",
    "realPeople: true ONLY when they clearly want a real person's face or likeness on a tee (an actor, a player, a politician); else false.",
    image ? "refNotes: the attached picture is an example they like — describe its look (layout, art style, colours, lettering, mood) in at most 60 words, without naming people." : 'refNotes: "".',
    "The request: " + JSON.stringify(String(prompt).slice(0, 2000)),
  ].join("\n");
  const out = textMock()
    ? { theme: String(prompt).slice(0, 80), count: 3, style: "bold, retro", language: "English", colours: [], avoid: "", realPeople: false, refNotes: image ? "A test example picture." : "" }
    : image
      ? await askJsonWithImage(ask, image, 0.3)
      : await askJson(ask, 0.3);
  const collection = new DesignCollection({
    createdBy: userId,
    prompt: String(prompt).slice(0, 2000),
    refImage: refImage || "",
    refNotes: clean(out?.refNotes, 600),
    brief: cleanBrief(out, colours),
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
    `The request was: ${JSON.stringify(collection.prompt.slice(0, 600))}.`,
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
async function planTees(collection, info, settings) {
  const { brief, facts } = collection;
  const allowed = brief.colours.length ? info.colours.filter((c) => brief.colours.includes(c.slug)) : info.colours;
  const layouts = Object.entries(info.layouts).map(([key, l]) => ({ key, layout: l.label, suits: l.suits, wordsMaxLetters: l.words.max }));
  const ask = [
    "You are the art director of IDENTEE, an Indian t-shirt brand. Plan ready-made t-shirt designs (an oversized tee) for this brief. Each tee has ONE picture (drawn by an AI picture maker) and ONE line of words (printed in a font).",
    'Answer with JSON only: {"tees": [{"name": string, "blurb": string, "idea": string, "layout": string, "colour": string, "words": string, "font": string, "ink": string, "subject": string, "style": string, "realPerson": boolean}]}.',
    `Make exactly ${brief.count} tees, each clearly different from the others (a different idea, and where possible a different layout and tee colour).`,
    "name: a shop name for the tee, 2 to 4 words. blurb: one line for the shop page, at most 140 characters. idea: the idea in one sentence, for the admin.",
    "layout: the key of one of these layouts, chosen to suit the picture and the words: " + JSON.stringify(layouts),
    "colour: the slug of the tee colour, from: " + JSON.stringify(allowed.map((c) => ({ slug: c.slug, name: c.name, dark: c.dark }))) + ". Light, bright art goes on a dark tee; dark art goes on a light tee — the art must stand out clearly.",
    `words: the words printed on the tee, in ${brief.language}, spelled correctly, at most the layout's wordsMaxLetters letters (2 lines at most, joined with \\n, only for front-type). Use a famous line or name from the facts when one fits. May be "" when the picture says it all.`,
    "font: one of " + JSON.stringify(FONTS) + ". ink: the words' colour as #RRGGBB, clearly visible on the tee colour.",
    "subject: for the picture maker, in English, at most 600 characters: exactly what the picture shows — who or what, pose, objects, composition, the drawing's colours (that stand out on the tee colour). Words in the picture only if one short title word is essential (write it in quotes and add (spelled X-X-X)). Never mention a t-shirt, a mockup, a background or a frame.",
    "style: one of " + JSON.stringify(Object.keys(AI_STYLES)) + ".",
    brief.realPeople
      ? "realPerson: true when the picture shows a real, named person (they may be drawn, realistically, by name). Else false."
      : "realPerson: always false. Never draw or name a real person: use characters, objects, symbols, silhouettes or scenes instead.",
    brief.style ? `The look and mood: ${brief.style}.` : "",
    brief.avoid ? `Leave out: ${brief.avoid}.` : "",
    collection.refNotes ? `The admin's example picture looks like this (take its spirit, make new original artwork): ${collection.refNotes}` : "",
    `Theme: ${brief.theme}.`,
    facts?.summary ? `Facts: ${facts.summary} ${facts.points.join(" · ")}` : "",
    "The admin's request: " + JSON.stringify(collection.prompt.slice(0, 1500)),
  ]
    .filter(Boolean)
    .join("\n");
  const out = textMock()
    ? {
        tees: Array.from({ length: brief.count }, (_, i) => ({
          name: `Test tee ${i + 1}`,
          blurb: "A test design.",
          idea: "A test idea.",
          layout: Object.keys(info.layouts)[i % Object.keys(info.layouts).length],
          colour: allowed[i % allowed.length]?.slug,
          words: ["SCENE", "ON DUTY", "VERA LEVEL"][i % 3],
          font: FONTS[i % FONTS.length],
          ink: "#F2C21B",
          subject: `A test picture about ${brief.theme}`,
          style: "Bold mascot",
          realPerson: false,
        })),
      }
    : await askJson(ask, 0.9, process.env.AI_IDEA_MODEL?.trim() || "gemini-flash-latest");
  if (!textMock()) await chargeText(collection, settings);
  const list = (Array.isArray(out?.tees) ? out.tees : []).slice(0, brief.count);
  if (!list.length) throw Object.assign(new Error("The AI didn't plan any tees. Try again with a clearer prompt."), { status: 502 });
  const layoutKeys = Object.keys(info.layouts);
  return list.map((t, i) => {
    const layout = layoutKeys.includes(t?.layout) ? t.layout : layoutKeys[i % layoutKeys.length];
    const colour = allowed.find((c) => c.slug === t?.colour) || allowed[i % allowed.length];
    let ink = HEX.test(String(t?.ink)) ? String(t.ink).toUpperCase() : null;
    if (!ink || contrast(ink, colour.hex) < 3) ink = colour.dark ? "#FFFFFF" : "#141110";
    const lines = String(t?.words || "").split(/\\n|\n/).map((l) => clean(l, 40)).filter(Boolean).slice(0, layout === "front-type" ? 2 : 1);
    return {
      name: clean(t?.name, 60) || `${brief.theme} tee ${i + 1}`.slice(0, 60),
      blurb: clean(t?.blurb, 300),
      colour,
      plan: {
        idea: clean(t?.idea, 300),
        layout,
        words: lines.join("\n").slice(0, 60), // (the browser fits any length into its box; very long lines get small)
        font: FONTS.includes(t?.font) ? t.font : "Anton",
        ink,
        subject: clean(t?.subject, 700) || clean(t?.idea, 300) || brief.theme,
        style: AI_STYLES[t?.style] ? t.style : "Detailed art",
        realPerson: brief.realPeople && t?.realPerson === true,
      },
    };
  });
}

/* ---------- 4. the picture ---------- */
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

// One picture for a planned tee, within the budget and the monthly caps. Returns the stored, cut-out picture.
async function makePicture(design, collection, info, { ignoreBudget = false } = {}) {
  const settings = await readSettings();
  const colour = info.colours.find((c) => c.slug === design.color) || info.colours[0];
  const layout = info.layouts[design.plan.layout] || Object.values(info.layouts)[0];
  const [wCm, hCm] = cmOf(info.positions, layout.art.area) || [35, 52];
  const ask = { subject: design.plan.subject, style: design.plan.style, teeColour: colour.name.toLowerCase(), teeIsDark: colour.dark };
  const wantGrok = design.plan.realPerson && collection.brief.realPeople;

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
      made = useGrok
        ? await xaiNewImage({ prompt: grokPrompt(ask), ratio: nearestRatio(wCm / hCm) })
        : await generateImage({ prompt: newDesignPrompt({ ...ask, variation: 1, of: 1 }), ratio: nearestRatio(wCm / hCm) });
      byGrok = useGrok;
    } catch (err) {
      lastErr = err;
      const refused = err?.status === 422 || err?.noImage === true;
      // Google refuses real people: Grok makes it, but only when the admin ticked "real people"
      if (refused && !useGrok && collection.brief.realPeople && xaiConfigured() && !grokCapped(settings, month)) {
        try {
          made = await xaiNewImage({ prompt: grokPrompt(ask), ratio: nearestRatio(wCm / hCm) });
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
    prompt: design.plan.subject.slice(0, 2200),
    style: design.plan.style,
    images: 1,
    costInr: round2(cost),
    model: byGrok ? xaiModel() : aiImageModel(),
  });

  // cut out of its plain background, the empty edges trimmed, so it fills its print area
  let cut = await cutOutPlainBackground(made.buffer).catch(() => null);
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
  return { url: stored.url, width, height, service: byGrok ? "grok" : "google", cost };
}

/* ---------- 5. placing ---------- */
// The picture as big as it fits in the area (keeping its shape), centred across; at the top or in the middle.
export function fitArt([wCm, hCm], ratio, valign) {
  let h = 96;
  let w = (ratio * h * hCm) / wCm;
  if (w > 96) {
    w = 96;
    h = (w * wCm) / (ratio * hCm);
  }
  return { x: round2((100 - w) / 2), y: round2(valign === "top" ? 2 : (100 - h) / 2), width: round2(w), height: round2(h) };
}

export function placeElements(design, info) {
  const layout = info.layouts[design.plan.layout];
  const artPos = info.positions.find((p) => p.key === layout.art.area);
  const els = [
    {
      id: "art",
      type: "image",
      src: design.art.url,
      position: artPos.key,
      side: artPos.side,
      ...fitArt(cmOf(info.positions, artPos.key), design.art.width / Math.max(1, design.art.height), layout.art.valign),
      rotation: 0,
      zIndex: 1,
    },
  ];
  if (design.plan.words) {
    const w = layout.words;
    const pos = info.positions.find((p) => p.key === w.area);
    els.push({
      id: "words",
      type: "text",
      text: design.plan.words,
      fontFamily: design.plan.font,
      fontSizePct: w.pct,
      color: design.plan.ink,
      align: "center",
      effect: "straight",
      lineHeight: 1.05,
      position: pos.key,
      side: pos.side,
      ...w.slot,
      rotation: w.rotation || 0,
      zIndex: 2,
      slot: { ...w.slot, rotation: w.rotation || 0 }, // the admin's browser fits the words into this box
    });
  }
  return els;
}

/* ---------- the run ---------- */
async function setStep(collection, step) {
  collection.step = step;
  await collection.save();
}

// Makes the picture for one planned tee and places it. A failure marks that tee failed; a reason to stop the whole
// run (budget, monthly cap) is thrown on.
async function makeOne(design, collection, info, opts) {
  try {
    const art = await makePicture(design, collection, info, opts);
    design.art = { url: art.url, width: art.width, height: art.height };
    design.service = art.service;
    design.costInr = round2((design.costInr || 0) + art.cost);
    design.elements = placeElements(design, info);
    design.mockups = { front: null, back: null, left: null, right: null };
    design.issues = [];
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
 * Runs steps 2–5 for a started collection (in the background — the admin page follows `step`).
 */
export async function runCollection(collectionId) {
  const collection = await DesignCollection.findById(collectionId);
  if (!collection || collection.status !== "running") return;
  try {
    const info = await garmentInfo();
    const settings = await readSettings();

    await setStep(collection, "Looking up facts");
    try {
      collection.facts = await findFacts(collection, settings);
    } catch (err) {
      // the tees can still be made without them
      console.error("[collection] facts step failed:", err?.status || "", err?.message || err);
      collection.facts = { summary: "", points: [], sources: [] };
    }

    await setStep(collection, "Planning the tees");
    const plans = await planTees(collection, info, settings);
    const designs = [];
    for (const [i, p] of plans.entries()) {
      designs.push(
        await ReadyDesign.create({
          collectionId: collection._id,
          name: p.name,
          slug: slugify(p.name),
          blurb: p.blurb,
          garmentType: GARMENT,
          color: p.colour.slug,
          size: LAYOUT_SIZE,
          plan: p.plan,
          order: i,
        }),
      );
    }

    for (const [i, design] of designs.entries()) {
      await setStep(collection, `Making picture ${i + 1} of ${designs.length}`);
      try {
        await makeOne(design, collection, info);
      } catch (err) {
        if (!err.stopRun) throw err;
        // budget or monthly cap: the tees not made yet are marked, the ones made stay
        for (const rest of designs.slice(i + 1)) {
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
    collection.error = String(err?.message || "The run stopped.").slice(0, 300);
    collection.finishedAt = new Date();
    await collection.save().catch(() => {});
  }
}

// A new picture for one tee, the same plan (Redo). Not limited by the run's budget (the admin asked for it),
// still by the monthly caps.
export async function redoPicture(design) {
  const collection = await DesignCollection.findById(design.collectionId);
  if (!collection) throw Object.assign(new Error("Collection not found"), { status: 404 });
  const info = await garmentInfo();
  try {
    await makeOne(design, collection, info, { ignoreBudget: true });
  } catch (err) {
    // (a monthly cap: the tee is marked failed with the reason)
    if (!err.stopRun) throw err;
  }
  return design;
}

// A run that hasn't moved for a while stopped (the server restarted in the middle): say so.
export async function markStale(collection) {
  if (collection.status === "running" && Date.now() - new Date(collection.updatedAt).getTime() > STALE_MS) {
    collection.status = "failed";
    collection.error = "The run stopped (the server restarted). The tees made so far are kept.";
    collection.step = "";
    await collection.save();
  }
  return collection;
}
