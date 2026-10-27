// services/studioService.js — Admin → Shop your IDENTEE → Studio (25 Oct 2026)
//
// The admin designs one tee at a time BY HAND in the Studio (the design room's engine: 3D tee, true print areas,
// flat editor, text tools). The AI only makes PICTURES for it, one at a time, from the admin's own words — there is
// no planner here (that is the Collection maker, services/collectionService.js). A picture is asked for as one KIND:
//
//   whole       the complete artwork for a print area
//   title       the title / lettering only (the admin places it above or below a hero)
//   hero        the main figure only (a character, a person, a thing), nothing around it
//   background  a texture or backdrop that fills the area behind the other parts (kept as a rectangle, not cut out)
//   logo        a small mark for the chest or a sleeve
//
// Google (Nano Banana) draws everything except a real, named person: that goes to Grok, but only when the admin
// switched "Real person" on (it costs more, and the client wants Google by default). Reference pictures sent along
// are only a REFERENCE for the look (or, with Grok, the likeness) — the AI is told to make new artwork, never a copy.
// Every picture is costed like the Collection maker's (AiUsage, kind "studio") and counts toward the monthly caps.
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import GarmentType from "../models/garmentTypeModel.js";
import AiUsage from "../models/aiUsageModel.js";
import { AI_STYLES, aiImageConfigured, aiImageModel, generateImage, nearestRatio } from "./aiImageService.js";
import { xaiConfigured, xaiEditImage, xaiModel, xaiNewImage } from "./xaiImageService.js";
import { cutOutPlainBackground } from "./cutoutService.js";
import { uploadFile } from "../utils/imageStorage.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import { positionsForGarment } from "../data/printPositions.js";
import { RATIO_VALUES, printPrompt } from "./aiImageService.js";
import { aiTextConfigured, askJson } from "./aiTextService.js";
import { googleCapped, grokCapped, monthSpend, readSettings } from "../controllers/aiController.js";
import { isDark } from "./collectionService.js";
import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import { aiDesignAddOn, hasPaidPicture } from "../utils/aiPricing.js";

export const PROMPT_MAX = 1500;
export const MAX_REFS = 3;

// What each kind of picture is, and what the AI is told to leave out.
export const KINDS = {
  whole: {
    label: "Whole artwork",
    about: "The complete design for one print area",
    rule: "Make ONE complete, centred artwork that fills most of the picture — the full design for a t-shirt print.",
    cut: true,
  },
  title: {
    label: "Title lettering",
    about: "Only the title or words, as lettering",
    rule: "Draw ONLY the lettering: the words below as a bold, stylised title. Spell them exactly as written, in the given language, and draw nothing else — no figures, no scene, no decoration beyond the letters themselves.",
    cut: true,
  },
  hero: {
    label: "Hero figure",
    about: "The main figure only — a character, a person, a thing",
    rule: "Draw ONLY the main figure described below, standing alone on the plain background — no words, no title, no scene, no frame. Leave a little empty space around it.",
    cut: true,
  },
  background: {
    label: "Background texture",
    about: "A texture or backdrop that fills the whole area",
    rule: "Draw a background texture or backdrop that fills the WHOLE picture edge to edge, with no main subject, no words and no empty border — it goes behind the other parts of the design.",
    cut: false,
  },
  logo: {
    label: "Small logo",
    about: "A small mark for the chest or a sleeve",
    rule: "Draw ONE small, simple emblem or logo mark: clean shapes, few colours, readable when printed 8 cm wide. No scene, no long text.",
    cut: true,
  },
};

// The looks the admin can pick from. The first ones are the design room's styles; the rest are what the client's
// example tees look like (bootleg poster, vintage photo print, halftone...). "" = the admin's words decide.
export const LOOKS = {
  ...AI_STYLES,
  "Bootleg poster": "1990s bootleg rap-tee poster: a collage of photo-like portraits with heavy contrast and film grain, bold condensed title lettering, dates or a tracklist in small type, dark moody colours with one bright accent",
  "Vintage photo print": "a faded vintage photo print with washed colours, soft film grain, worn edges and a distressed, cracked-ink feel",
  "Halftone comic": "halftone dot shading like an old comic or screen print, thick black outlines, 3–4 flat spot colours",
  "Movie poster": "a cinematic movie-poster composition with dramatic lighting, layered figures and a strong title treatment",
  "Painted portrait": "a painted portrait with visible brush strokes, rich colour and dramatic light",
  "Chrome Y2K": "glossy chrome lettering and shapes with blue and silver reflections, Y2K style",
  "Retro sports": "a retro college sports-wear look: arched block lettering, varsity numbers, two or three flat colours",
};

export const KIND_KEYS = Object.keys(KINDS);

// The products the Studio can open: every live garment, with its print areas, colours and sizes (the admin's browser
// draws the 3D tee from them; a garment with no 3D model is shown as flat).
export async function studioGarments() {
  const docs = await GarmentType.find({ isActive: true }).lean();
  return docs
    .map((garment) => {
      const positions = positionsForGarment(garment).positions;
      if (!positions.length) return null;
      return {
        key: garment.key,
        label: garment.label,
        category: garment.category,
        fit: garment.fit,
        sizes: garment.sizes,
        sizeChart: garment.sizeChart,
        basePrice: garment.basePrice || 0,
        comparePrice: garment.comparePrice || 0,
        positions,
        colours: (garment.colors || []).map((c) => ({ slug: c.slug, name: c.name, hex: c.hex, dark: isDark(c.hex) })),
        wearers: wearersOf(garment), // who is shown wearing it in the model photos
      };
    })
    .filter(Boolean);
}

const sentence = (text) => {
  const t = String(text || "").trim().replace(/[.\s]+$/, "");
  return /[!?]$/.test(t) ? t : `${t}.`;
};

// What the picture AI is told. refs: how many reference pictures go with it; variation / of: one of several tries.
export function studioPrompt({ kind, prompt, look, teeColour, teeIsDark, realPerson, refs = 0, variation = 1, of = 1 }) {
  const k = KINDS[kind] || KINDS.whole;
  const bg = teeIsDark ? "black" : "white";
  return [
    `Artwork to be printed on a ${teeColour} t-shirt.`,
    k.rule,
    `Description: ${sentence(prompt)}`,
    LOOKS[look] ? `Look: ${LOOKS[look]}.` : "",
    kind === "background"
      ? "No t-shirt, no mockup, no frame, no watermark or signature."
      : `The background must be flat pure ${bg} and nothing else: no scenery, no texture, no shadow on it. Do not draw a t-shirt, a mockup, a person wearing it, a frame or a border. No watermark or signature.`,
    `Use colours that stand out on a ${teeColour} t-shirt.`,
    kind === "title" ? "" : "Only include words if the description asks for them, spelled exactly as written.",
    refs > 0
      ? realPerson
        ? "The attached photo shows the person to draw: keep their likeness (face, hair, build) recognisable, but make a new, original picture in the look above — not a copy of the photo."
        : "The attached picture is only a REFERENCE for the look: take its style, colour palette, mood and composition, and create completely new, original artwork of what is described. Do not copy or trace it; do not reuse its text, names, logos or brand marks."
      : "",
    of > 1 ? `This is option ${variation} of ${of}: make its composition clearly different from the other options.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const round2 = (n) => Math.round(n * 100) / 100;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * One picture for the Studio: made, costed, cut out (unless it is a background), stored.
 * @param {{ userId, prompt, kind, look, realPerson, shape, teeColour, teeIsDark, refs: {data, mime}[] }} args
 *   shape = the box it goes in, width ÷ height (the nearest picture shape the AI takes is used)
 * @returns {{ url, width, height, service, cost, cut }}
 */
export async function makeStudioPicture({ userId, prompt, kind, look, realPerson, shape, teeColour, teeIsDark, refs = [], variation = 1, of = 1 }) {
  const text = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
  if (text.length < 3) throw fail("Describe the picture first.");
  if (!KINDS[kind]) throw fail("Unknown picture kind.");
  const settings = await readSettings();
  const month = await monthSpend();
  const ratio = nearestRatio(Number(shape) > 0 ? Number(shape) : 1);
  const useGrok = !!realPerson;
  if (useGrok && !xaiConfigured()) throw fail("Grok (for real people) is not set up on this server.", 503);
  if (useGrok && grokCapped(settings, month)) throw fail("This month's Grok spending limit is reached (Admin → Settings → AI designs).", 429);
  if (!useGrok && !aiImageConfigured()) throw fail("Google's picture AI is not set up on this server.", 503);
  if (!useGrok && googleCapped(settings, month)) throw fail("This month's Google spending limit is reached (Admin → Settings → AI designs).", 429);

  const ask = studioPrompt({ kind, prompt: text, look, teeColour, teeIsDark, realPerson: useGrok, refs: refs.length, variation, of });
  // the reference pictures are shrunk before they go (a phone photo is 4000 px wide; the AI needs far less)
  const small = [];
  for (const r of refs.slice(0, MAX_REFS)) {
    const data = await sharp(r.data).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    small.push({ data, mime: "image/jpeg" });
  }

  let made;
  try {
    if (useGrok) made = small.length ? await xaiEditImage({ prompt: ask, image: small[0] }) : await xaiNewImage({ prompt: ask, ratio });
    else made = await generateImage({ prompt: ask, image: small[0], ratio });
  } catch (err) {
    const refused = err?.status === 422 || err?.noImage === true;
    if (refused && !useGrok) {
      throw fail(
        xaiConfigured()
          ? "Google refused this picture — it usually refuses real, named people. Switch “Real person” on to draw it with Grok, or describe the figure without the name. You were not charged."
          : "Google refused this picture — it usually refuses real, named people and some well-known characters. Describe the figure without the name. You were not charged.",
        422,
      );
    }
    throw fail(err?.message || "The picture could not be made.", err?.status || 502);
  }

  return finishPicture({ made, useGrok, kind, settings, userId, usage: text, look });
}

// A picture's bytes as stored (a local /uploads path, or Cloudinary)
async function readStored(url) {
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw fail("The picture could not be read.", 404);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFile(path.join(process.cwd(), String(url).replace(/^\/+/, "")));
}

// What every picture goes through once it is made: costed, cut out (unless it is a background), stored.
async function finishPicture({ made, useGrok, kind, settings, userId, usage, look }) {
  // costed like every AI picture (the free stand-in picture maker costs nothing)
  const cost = useGrok ? settings.grokPricePerImageInr : aiImageModel() === "mock" ? 0 : settings.pricePerImageInr;
  await AiUsage.create({ user: userId, kind: "studio", prompt: usage.slice(0, 2200), style: `${kind}${look ? ` · ${look}` : ""}`.slice(0, 60), images: 1, costInr: round2(cost), model: useGrok ? xaiModel() : aiImageModel() });

  // cut out of its plain background and trimmed, so it sits on the tee as a shape (a background stays a rectangle)
  let buffer = made.buffer;
  let mime = made.mime;
  let width = 1024;
  let height = 1024;
  let cut = false;
  if (KINDS[kind].cut) {
    const c = await cutOutPlainBackground(made.buffer).catch(() => null);
    if (c?.cut) {
      cut = true;
      try {
        const t = await sharp(c.buffer).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
        buffer = t.data;
        mime = "image/png";
        width = t.info.width;
        height = t.info.height;
      } catch {
        buffer = c.buffer;
        mime = c.mime;
        width = c.width;
        height = c.height;
      }
    }
  }
  if (!cut) {
    const md = await sharp(buffer).metadata().catch(() => ({}));
    width = md.width || width;
    height = md.height || height;
  }
  // (the ai-designs folder: the checkout knows these as AI pictures — utils/aiPricing.js)
  const stored = await uploadFile(buffer, mime, "ai-designs");
  return { url: stored.url, width, height, service: useGrok ? "grok" : "google", cost: round2(cost), cut };
}

/**
 * "Change this picture": the stored picture goes back to the AI with the admin's instruction (Google's edit, or
 * Grok's when it is a real person). The result is costed, cut and stored like a new picture.
 * @returns {{ url, width, height, service, cost, cut }}
 */
export async function changeStudioPicture({ userId, url, instruction, kind, realPerson, teeColour, teeIsDark }) {
  const text = String(instruction || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
  if (text.length < 3) throw fail("Say what to change first.");
  if (!KINDS[kind]) throw fail("Unknown picture kind.");
  if (!/^(\/uploads\/|https?:\/\/res\.cloudinary\.com\/)/.test(String(url || ""))) throw fail("Only a picture stored on IDENTEE can be changed.");
  const settings = await readSettings();
  const month = await monthSpend();
  const useGrok = !!realPerson;
  if (useGrok && !xaiConfigured()) throw fail("Grok (for real people) is not set up on this server.", 503);
  if (useGrok && grokCapped(settings, month)) throw fail("This month's Grok spending limit is reached (Admin → Settings → AI designs).", 429);
  if (!useGrok && !aiImageConfigured()) throw fail("Google's picture AI is not set up on this server.", 503);
  if (!useGrok && googleCapped(settings, month)) throw fail("This month's Google spending limit is reached (Admin → Settings → AI designs).", 429);
  const raw = await readStored(url);
  const md = await sharp(raw).metadata();
  // a cut-out has a see-through background: the tee's plain colour goes behind it so the AI sees a normal picture
  const flat = await sharp(raw).flatten({ background: teeIsDark ? "#000000" : "#ffffff" }).resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const bg = teeIsDark ? "black" : "white";
  const ask = [
    `Edit this t-shirt artwork: ${text.replace(/[.\s]+$/, "")}.`,
    "Keep everything else the same — the same subject, composition, colours and look.",
    kind === "background" ? "It stays a full-bleed background texture." : `Keep the background flat pure ${bg} and nothing else. No t-shirt, no mockup, no frame, no watermark.`,
  ].join(" ");
  const image = { data: flat, mime: "image/jpeg" };
  let made;
  try {
    made = useGrok ? await xaiEditImage({ prompt: ask, image }) : await generateImage({ prompt: ask, image, ratio: nearestRatio(md.width && md.height ? md.width / md.height : 1) });
  } catch (err) {
    const refused = err?.status === 422 || err?.noImage === true;
    if (refused && !useGrok) {
      throw fail(xaiConfigured() ? "Google refused this change — it usually refuses real, named people. Switch “Real person” on to change it with Grok. You were not charged." : "Google refused this change (it usually refuses real, named people). You were not charged.", 422);
    }
    throw fail(err?.message || "The picture could not be changed.", err?.status || 502);
  }
  return finishPicture({ made, useGrok, kind, settings, userId, usage: `change: ${text}`, look: "" });
}

/* ---------- Step 3 (25 Oct 2026) ---------- */
export const PRINT_COST_FACTOR = 3; // a 4K picture costs about 3 normal ones (as the orders page's enlarge)
const textMock = () => process.env.AI_TEXT_PROVIDER?.trim() === "mock";

/**
 * "Improve my words": the admin's rough description rewritten as a strong picture prompt for its kind, plus what
 * the AI understood (so a wrong reading is caught before paying for a picture). Text only (≈ the chat price).
 * @returns {{ improved: string, understood: string[], cost: number }}
 */
export async function improveStudioPrompt({ userId, prompt, kind, look, teeColour, teeIsDark }) {
  const text = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
  if (text.length < 3) throw fail("Write a few words first.");
  const k = KINDS[kind] || KINDS.whole;
  const settings = await readSettings();
  if (textMock()) {
    return { improved: `${text} — bold, high-contrast, centred, with clean edges and rich colour that stands out on a ${teeColour} tee.`, understood: [`Kind: ${k.label}`, `Subject: ${text.slice(0, 60)}`, look ? `Look: ${look}` : "Look: as described"], cost: 0 };
  }
  if (!aiTextConfigured()) throw fail("The text AI is not set up on this server.", 503);
  const ask = [
    "You write prompts for an AI picture maker that draws t-shirt print artwork. The admin of a custom-tee shop wrote a rough description; rewrite it as one strong, specific prompt, and say what you understood.",
    'Answer with JSON only: {"improved": string, "understood": [string]}.',
    `The picture is of this kind: ${k.label} — ${k.about}. ${k.rule}`,
    "improved: in English, at most 700 characters. Keep EVERY detail the admin gave (who or what, pose, clothes, objects, where each part sits, mood, colours, era). Add only what makes it a better print: composition (centred, filling the frame), lighting, line weight, colour palette, texture. Words: only words the admin asked for, in double quotes, spelled exactly; never add words of your own.",
    "Never mention the t-shirt, a mockup, a background, a frame or a watermark (those are handled separately).",
    look ? `The admin picked this look; write for it: ${look} — ${LOOKS[look] || ""}.` : "No look was picked: choose one that suits and name it in the prompt.",
    `It will be printed on a ${teeIsDark ? "dark" : "light"} ${teeColour} t-shirt: pick colours that stand out on it.`,
    "understood: 2 to 5 short lines (each under 70 characters) saying plainly what will be drawn — subject, pose, style, colours, any words — so a misunderstanding is easy to spot.",
    "The admin's words: " + JSON.stringify(text),
  ].join("\n");
  let out;
  try {
    out = await askJson(ask, 0.3);
  } catch (err) {
    if (err?.status === 503 || err?.status === 429) throw fail("The text AI is busy. Try again in a moment.", err.status);
    throw fail("I couldn't improve that just now. Try again, or use your own words.", 502);
  }
  const improved = String(out?.improved || "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (improved.length < 10) throw fail("I couldn't improve that just now. Try again, or use your own words.", 502);
  const understood = (Array.isArray(out?.understood) ? out.understood : []).map((l) => String(l || "").trim().slice(0, 90)).filter(Boolean).slice(0, 5);
  const cost = round2(Number(settings.chatPricePerMessageInr) || 0);
  await AiChatUsage.create({ user: userId, costInr: cost, model: "studio", kind: "studio" }).catch(() => {});
  return { improved, understood, cost };
}

/**
 * A stored picture enlarged to about 4,000 px for printing (Google's upscaling with printPrompt — the same recipe as
 * the orders page's "Enlarge for print"), stored under print-pictures. The picture keeps its own shape exactly.
 * @returns {{ printSrc, width, height, cost }}
 */
export async function enlargeStudioPicture({ userId, src, teeIsDark, note = "" }) {
  const settings = await readSettings();
  if (!aiImageConfigured()) throw fail("Google's picture AI is not set up on this server.", 503);
  if (googleCapped(settings, await monthSpend())) throw fail("This month's Google spending limit is reached (Admin → Settings → AI designs).", 429);
  const raw = await readStored(src);
  const meta = await sharp(raw).rotate().metadata();
  const hasAlpha = Boolean(meta.hasAlpha) && !(await sharp(raw).stats()).isOpaque;
  const aiCut = /\/ai-designs\//.test(src);
  const bg = teeIsDark ? "#000000" : "#ffffff";
  // the AI only makes a few picture shapes: the picture goes on a sheet of the nearest shape, and the same part is cut back out
  const shape = meta.width / meta.height;
  const [ratio, r] = Object.entries(RATIO_VALUES).sort((a, b) => Math.abs(Math.log(a[1] / shape)) - Math.abs(Math.log(b[1] / shape)))[0];
  const sheetW = r >= shape ? Math.round(meta.height * r) : meta.width;
  const sheetH = r >= shape ? meta.height : Math.round(meta.width / r);
  const small = await sharp(raw).rotate().flatten({ background: bg }).resize(sheetW, sheetH, { fit: "contain", background: bg }).resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer();
  let out;
  let byGrok = false;
  try {
    out = await generateImage({ prompt: printPrompt({ dark: teeIsDark, plain: hasAlpha }), image: { data: small, mime: "image/jpeg" }, ratio, size: "4K" });
  } catch (err) {
    if (!(err?.status === 422 || err?.noImage)) throw fail(err?.message || "The picture could not be enlarged.", err?.status || 502);
    // Google refuses well-known people (the SCENE tees: a film star's face). Then Grok, which drew such pictures in
    // the first place, makes the print copy — at its largest size, "2k" (about 2,000 px: sharp to about 34 cm wide).
    // (26 Oct 2026, the client: "I want it big, same as it is, but the quality improved for printing")
    if (!xaiConfigured()) throw fail("Google won't enlarge this picture (it refuses well-known people) and Grok is not set up on this server. Nothing was charged; it prints from the original.", 422);
    if (grokCapped(settings, await monthSpend())) throw fail("Google won't enlarge this picture (a well-known person) and this month's Grok spending limit is reached. Nothing was charged; it prints from the original.", 429);
    try {
      out = await xaiEditImage({ prompt: `${printPrompt({ dark: teeIsDark, plain: hasAlpha })} Keep the same person, face, pose, colours and composition exactly; only add fine detail and sharpness.`, image: { data: small, mime: "image/jpeg" }, resolution: "2k" });
      byGrok = true;
    } catch (err2) {
      if (err2?.status === 422) throw fail("Neither Google nor Grok would enlarge this picture. Nothing was charged; it prints from the original.", 422);
      throw fail(err2?.message || "The picture could not be enlarged.", err2?.status || 502);
    }
  }
  const big = await sharp(out.buffer).metadata();
  const keepW = Math.min(big.width, Math.round((big.width * meta.width) / sheetW));
  const keepH = Math.min(big.height, Math.round((big.height * meta.height) / sheetH));
  let picture = await sharp(out.buffer).extract({ left: Math.floor((big.width - keepW) / 2), top: Math.floor((big.height - keepH) / 2), width: keepW, height: keepH }).png().toBuffer();
  if (aiCut) picture = (await cutOutPlainBackground(picture)).buffer;
  else if (hasAlpha) {
    const alpha = await sharp(raw).rotate().ensureAlpha().extractChannel("alpha").resize(keepW, keepH, { kernel: "lanczos3" }).toBuffer();
    const colour = await sharp(picture).removeAlpha().png().toBuffer();
    picture = await sharp(colour).joinChannel(alpha).png().toBuffer();
  }
  const webp = await sharp(picture).webp({ quality: 96, alphaQuality: 100, effort: 4 }).toBuffer();
  const { url } = await uploadFile(webp, "image/webp", "print-pictures", "print.webp");
  const cost = byGrok ? round2(settings.grokPricePerImageInr || 0) : aiImageModel() === "mock" ? 0 : round2(settings.pricePerImageInr * PRINT_COST_FACTOR);
  await AiUsage.create({ user: userId, kind: "print", prompt: `Studio: sharpen for print${byGrok ? " (Grok)" : ""}${note ? ` (${note})` : ""}`.slice(0, 2200), images: 1, costInr: cost, model: byGrok ? xaiModel() : aiImageModel() });
  return { printSrc: url, width: keepW, height: keepH, cost, byGrok };
}

/* ---------- the whole tee from one prompt (26 Oct 2026) ---------- */
// The admin writes the tee in one go ("a bootleg poster tee for SCENE: Suriya in dramatic light, the title in cracked
// gold, a date line on the back"). The text AI turns it into a PLAN — the parts of the tee, each a picture of one
// kind (drawn by the assistant) or words (typed, free), on a print area — and says what it understood. The admin
// checks and changes the plan card before anything is drawn; the pictures are then made one by one with the usual
// picture endpoint and placed on the tee, where the admin carries on by hand. Nothing is published by itself.
export const PLAN_FONTS = ["Anton", "Bebas Neue", "Oswald", "Montserrat", "Poppins", "Playfair Display", "Permanent Marker", "Pacifico", "Lobster", "Bangers"];
export const MAX_PLAN_PARTS = 5;
const PLACES = ["top", "middle", "bottom"];

const cleanPlan = (raw, positions, colours) => {
  const keys = new Set(positions.map((p) => p.key));
  const main = positions.find((p) => p.side === "front" && p.main)?.key || positions[0]?.key;
  const parts = (Array.isArray(raw?.parts) ? raw.parts : [])
    .map((x) => {
      const area = keys.has(x?.area) ? x.area : main;
      if (x?.kind === "words") {
        const text = String(x.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
        if (!text) return null;
        return { kind: "words", area, text, font: PLAN_FONTS.includes(x.font) ? x.font : "Anton", place: PLACES.includes(x.place) ? x.place : "bottom", include: true };
      }
      const kind = KINDS[x?.kind] ? x.kind : "whole";
      const prompt = String(x?.prompt || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
      if (prompt.length < 3) return null;
      return { kind, area, prompt, look: LOOKS[x?.look] ? x.look : "", realPerson: x?.realPerson === true, include: true };
    })
    .filter(Boolean)
    .slice(0, MAX_PLAN_PARTS);
  const understood = (Array.isArray(raw?.understood) ? raw.understood : []).map((l) => String(l || "").trim().slice(0, 100)).filter(Boolean).slice(0, 6);
  const colour = colours.find((c) => c.slug === raw?.colour)?.slug || null;
  const name = String(raw?.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { understood, parts, colour, name };
};

/**
 * @param {{ userId, prompt, positions: [{key,label,side,main,cm:[w,h]}], colours: [{slug,name,dark}], colour, teeColour, teeIsDark }} args
 * @returns {{ understood: string[], parts: [...], colour: string|null, name: string, cost: number }}
 */
export async function planStudioTee({ userId, prompt, positions, colours, colour, teeColour, teeIsDark }) {
  const text = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
  if (text.length < 5) throw fail("Describe the tee first — a sentence or two.");
  const settings = await readSettings();
  const main = positions.find((p) => p.side === "front" && p.main)?.key || positions[0]?.key;
  const back = positions.find((p) => p.side === "back" && p.main)?.key || positions.find((p) => p.side === "back")?.key || main;
  if (textMock()) {
    const words = text.split(" ").filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).join(" ").toUpperCase() || "TITLE";
    return {
      understood: [`A ${teeColour} tee with a poster-style front`, `Title: "${words}"`, "One main figure in the middle of the front", "A dark textured background behind it", "A line of words on the back"],
      parts: [
        { kind: "background", area: main, prompt: `dark moody backdrop for: ${text}`, look: "Bootleg poster", realPerson: false, include: true },
        { kind: "hero", area: main, prompt: `the main figure of: ${text}`, look: "Bootleg poster", realPerson: false, include: true },
        { kind: "title", area: main, prompt: `the title "${words}" in heavy condensed capitals, cracked gold`, look: "Bootleg poster", realPerson: false, include: true },
        { kind: "words", area: back, text: words, font: "Bebas Neue", place: "top", include: true },
      ],
      colour: null,
      name: `${words} tee`,
      cost: 0,
    };
  }
  if (!aiTextConfigured()) throw fail("The text AI is not set up on this server.", 503);
  const areas = positions.map((p) => ({ key: p.key, label: p.label, side: p.side, main: !!p.main, cm: p.cm }));
  const ask = [
    "You plan t-shirt prints for the admin of a custom-tee shop. They describe the WHOLE tee in one go; you turn it into a plan of PARTS the shop's tools then make: AI pictures (one kind each) and typed words. The admin checks your plan before anything is drawn, so say plainly what you understood.",
    'Answer with JSON only: {"understood": [string], "name": string, "colour": string|null, "parts": [ {"kind": "whole"|"title"|"hero"|"background"|"logo", "area": string, "prompt": string, "look": string, "realPerson": boolean} | {"kind": "words", "area": string, "text": string, "font": string, "place": "top"|"middle"|"bottom"} ]}.',
    `Picture kinds: ${Object.entries(KINDS).map(([k, v]) => `${k} = ${v.about}`).join("; ")}. A poster-style tee is usually three pictures on ONE front area: background + hero + title (the title drawn as lettering). A simple tee is one "whole" picture, or a picture plus words.`,
    `The print areas of this tee (key, label, side, main, size in cm): ${JSON.stringify(areas)}. Put the main design on the main front area (${main}) unless the admin names another place; the back (${back}) and sleeves only when they ask for them. Parts on the same area: the background first, then the hero, then the title. At most ${MAX_PLAN_PARTS} parts.`,
    `prompt (for a picture part): in English, specific and complete — who or what, pose, clothes, objects, mood, colours, era — at most 600 characters; keep every detail the admin gave; words only if the admin asked for them, in double quotes, spelled exactly. Never mention the t-shirt, a mockup, a background (for the hero and title), a frame or a watermark.`,
    `look: one of ${JSON.stringify(Object.keys(LOOKS))} or "" when the prompt says enough.`,
    "realPerson: true ONLY when the picture must show a real, named person (an actor, a player, a politician) — then it is drawn by a different, costlier AI. Characters, animals, objects and unnamed people: false.",
    `words parts: typed text (free, no AI picture): a slogan, a date line, a name — font from ${JSON.stringify(PLAN_FONTS)} (Anton / Bebas Neue for bold titles, Playfair Display for elegant, Permanent Marker / Bangers for playful), place = where on its area. Use words (not a title picture) for small lines like dates and taglines.`,
    `colour: the tee colour the admin asked for, as a slug from ${JSON.stringify(colours.map((c) => ({ slug: c.slug, name: c.name })))}, or null to keep the current ${teeColour}.`,
    "name: a short shop name for the tee (at most 40 characters).",
    "understood: 3 to 6 short lines (under 90 characters each) saying what the tee will be — product side, each part in plain words, colours, any real person — so a wrong reading is easy to spot.",
    "The admin's description: " + JSON.stringify(text),
  ].join("\n");
  let out;
  try {
    out = await askJson(ask, 0.3, undefined, { timeoutMs: 60_000 });
  } catch (err) {
    if (err?.status === 503 || err?.status === 429) throw fail("The text AI is busy. Try again in a moment.", err.status);
    throw fail("I couldn't plan that just now. Try again, or make the pictures one by one.", 502);
  }
  const plan = cleanPlan(out, positions, colours);
  if (!plan.parts.length) throw fail("I couldn't plan that just now. Try again, or make the pictures one by one.", 502);
  const cost = round2(Number(settings.chatPricePerMessageInr) || 0);
  await AiChatUsage.create({ user: userId, costInr: cost, model: "studio", kind: "studio" }).catch(() => {});
  return { ...plan, cost };
}

/* ---------- model photos: a person wearing the tee (26 Oct 2026) ---------- */
// Who wears it in the photos: a girls' garment → a woman, a boys' / men's → a man, anything else → both.
export const wearersOf = (garment) => {
  const name = `${garment?.key || ""} ${garment?.label || ""} ${garment?.category || ""}`.toLowerCase();
  if (/oversized|unisex/.test(`${garment?.key || ""} ${garment?.label || ""}`.toLowerCase())) return ["man", "woman"]; // the client: worn by both
  if (/girl|women|woman|ladies|crop/.test(name)) return ["woman"];
  if (/\bboy|\bmen\b|\bman\b/.test(name)) return ["man"];
  return ["man", "woman"];
};
export const PHOTO_SETTINGS = {
  studio: "a clean photo studio with a plain light grey backdrop and soft, even light",
  street: "a city street in daylight, slightly blurred behind the person",
  wall: "in front of a plain textured concrete wall, natural light",
};
const WEARER_TEXT = { man: "a young Indian man", woman: "a young Indian woman" };
const POSES = {
  front: "standing relaxed, facing the camera, one hand in a pocket, a slight natural smile",
  back: "standing relaxed with the back to the camera, looking slightly over one shoulder, so the back of the t-shirt is fully visible",
};

/**
 * One photo of a person wearing the tee: the mockup of that side goes to the picture AI with strict "keep the print
 * exactly" instructions. Costed like a Studio picture. @returns {{ url, cost }}
 */
export async function modelPhoto({ userId, mockupUrl, wearer, side, setting, teeColour, garmentLabel, note = "" }) {
  const settings = await readSettings();
  if (!aiImageConfigured()) throw fail("Google's picture AI is not set up on this server.", 503);
  if (googleCapped(settings, await monthSpend())) throw fail("This month's Google spending limit is reached (Admin → Settings → AI designs).", 429);
  const raw = await readStored(mockupUrl);
  const small = await sharp(raw).resize({ width: 1024, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const prompt = [
    `A realistic full-colour photograph of ${WEARER_TEXT[wearer] || WEARER_TEXT.man} wearing EXACTLY the ${teeColour} ${garmentLabel.toLowerCase()} shown in the attached picture.`,
    `The t-shirt, its colour, its fit and the printed design must stay exactly as in the attached picture: the same artwork, the same words spelled the same, the same size and place on the ${side}. Do not redraw, simplify, move or add anything on the print.`,
    `Pose: ${POSES[side] || POSES.front}. The camera sees the ${side} of the t-shirt, head to hips, the whole print visible, sharp and in focus, with natural fabric folds.`,
    `Setting: ${PHOTO_SETTINGS[setting] || PHOTO_SETTINGS.studio}.`,
    "Style: a clean e-commerce fashion photo, natural skin and light, no extra people, no text, no logo, no watermark, no frame.",
  ].join(" ");
  let made;
  try {
    made = await generateImage({ prompt, image: { data: small, mime: "image/jpeg" }, ratio: "3:4" });
  } catch (err) {
    if (err?.status === 422 || err?.noImage) throw fail("The picture AI refused this photo. Nothing was charged — try another setting.", 422);
    throw fail(err?.message || "The photo could not be made.", err?.status || 502);
  }
  const jpg = await sharp(made.buffer).jpeg({ quality: 90 }).toBuffer();
  const stored = await uploadFile(jpg, "image/jpeg", "model-photos");
  const cost = aiImageModel() === "mock" ? 0 : round2(settings.pricePerImageInr);
  await AiUsage.create({ user: userId, kind: "studio", prompt: `model photo: ${wearer}, ${side}, ${setting}${note ? ` (${note})` : ""}`.slice(0, 2200), style: "photo", images: 1, costInr: cost, model: aiImageModel() });
  return { url: stored.url, cost };
}

/* ---------- the tee as a product in the shop (26 Oct 2026) ---------- */
// A published Studio tee is listed like any product: one Product document per colour on sale, in its category and
// style, with its pictures, so the category pages, filters, search and sorting treat it as a product. Buying it goes
// through the design's own page (the product links there). Nothing is kept in stock: the stock figure is a stand-in.
export const POD_STOCK = 9999;
const WASH = ["Machine wash cold", "Hand wash only", "Do not bleach", "Tumble dry low", "Iron on low heat", "Dry clean only", "Do not wring"];
const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const numOr = (v, d = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

// the product details as saved on the design (checked and tidied)
export function cleanProductDetails(raw = {}, before = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  // where it is listed (27 Oct 2026, the client: "publish the same t-shirt to both men and women"): every category
  // it belongs in, each with its style there; the first is the tee's own category
  const rawList = Array.isArray(r.listings) ? r.listings : Array.isArray(before.listings) ? before.listings : [];
  const seen = new Set();
  const listings = rawList
    .map((l) => ({ category: str(l?.category, 60).toLowerCase(), style: str(l?.style, 60) }))
    .filter((l) => l.category && !seen.has(l.category) && seen.add(l.category))
    .slice(0, 8);
  const out = {
    listings,
    style: listings[0]?.style || str(r.style ?? before.style, 60),
    description: str(r.description ?? before.description, 3000),
    gender: ["Unisex", "Men", "Women", "Kids"].includes(r.gender) ? r.gender : before.gender || "Unisex",
    fabric: str(r.fabric ?? before.fabric, 80),
    oldPrice: Math.round(numOr(r.oldPrice ?? before.oldPrice)),
    subcategory: str(r.subcategory ?? before.subcategory, 60),
    sku: str(r.sku ?? before.sku, 20).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    hsnCode: str(r.hsnCode ?? before.hsnCode, 12) || "6109",
    ageRange: ["Adult", "Teen", "Kids", "Infant"].includes(r.ageRange) ? r.ageRange : before.ageRange || "Adult",
    type: ["Casual", "Sports", "Party", "Formal", "Ethnic"].includes(r.type) ? r.type : before.type || "Casual",
    washCare: (Array.isArray(r.washCare) ? r.washCare : before.washCare || []).filter((w) => WASH.includes(w)).slice(0, 12),
    featured: r.featured !== undefined ? !!r.featured : !!before.featured,
    shipping: {
      weight: numOr(r.shipping?.weight ?? before.shipping?.weight),
      length: numOr(r.shipping?.length ?? before.shipping?.length),
      width: numOr(r.shipping?.width ?? before.shipping?.width),
      height: numOr(r.shipping?.height ?? before.shipping?.height),
    },
  };
  return out;
}

// What the tee sells at (the admin's own price, else the garment's + the AI picture add-on) and its "was" price.
export async function studioPrice(design, garment) {
  const addOn = (await hasPaidPicture(design.elements)) ? await aiDesignAddOn() : 0;
  const price = design.priceInr > 0 ? design.priceInr : (garment?.basePrice || 0) + addOn;
  const was = design.product?.oldPrice > price ? design.product.oldPrice : garment?.comparePrice > price ? garment.comparePrice + (design.priceInr > 0 ? 0 : addOn) : 0;
  return { price, oldPrice: was };
}

/**
 * Makes or refreshes the tee's product(s) in the shop — one per colour on sale — and returns the group id.
 * design: a saved ReadyDesign (mongoose doc); garment: from studioGarments(); userId: the admin.
 */
export async function syncStudioProduct(design, garment, userId) {
  const d = design.product || {};
  // every category it is listed in (the first is its own); an older tee has just category + style
  const listings = d.listings?.length ? d.listings : design.category && d.style ? [{ category: design.category, style: d.style }] : [];
  const cats = await Category.find({ slug: { $in: listings.map((l) => l.category) } }).lean();
  const places = listings.map((l) => ({ ...l, cat: cats.find((c) => c.slug === l.category) })).filter((l) => l.cat && l.style);
  if (!places.length) throw fail("Pick at least one category, each with its style, before publishing.", 409);
  const { price, oldPrice } = await studioPrice(design, garment);
  const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const sizes = design.sizes?.length ? design.sizes : garment.sizes;
  const colours = design.colours?.length ? design.colours : [{ slug: design.color, mockups: design.mockups, photos: [] }];
  const groups = { ...(design.productGroups || {}) };
  if (!groups[places[0].category] && design.productGroupId) groups[places[0].category] = design.productGroupId; // from before 27 Oct
  const base = d.sku || (String(design.name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "IDT") + Math.floor(100 + Math.random() * 900);
  const existing = await Product.find({ readyDesign: design._id });
  const keep = new Set();
  for (const place of places) {
    const category = place.cat;
    const groupId = groups[place.category] || (groups[place.category] = new mongoose.Types.ObjectId().toString());
  for (const c of colours) {
    const colour = garment.colours.find((x) => x.slug === c.slug);
    if (!colour) continue;
    const images = [c.mockups?.front, c.mockups?.back, c.mockups?.left, c.mockups?.right, ...(c.photos || []).map((p) => p.url)].filter(Boolean).slice(0, 8);
    const fields = {
      brandname: design.name,
      description: d.description || design.blurb || `${design.name} — printed to order on the ${garment.label}.`,
      hsnCode: d.hsnCode || "6109",
      washCare: d.washCare || [],
      isFeatured: !!d.featured,
      productType: "single",
      comboName: "",
      images,
      price,
      oldPrice: oldPrice || price,
      discount,
      shippingDetails: { weight: d.shipping?.weight || undefined, dimensions: { length: d.shipping?.length || undefined, width: d.shipping?.width || undefined, height: d.shipping?.height || undefined } },
      productdetails: {
        gender: d.gender || "Unisex",
        category: category.name,
        subcategory: d.subcategory || place.style,
        type: d.type || "Casual",
        ageRange: d.ageRange || "Adult",
        color: colour.name,
        garmentStyle: place.style,
        fabric: d.fabric || "100% Cotton",
        sizes,
        stockBySize: sizes.map((size) => ({ size, stock: POD_STOCK })),
      },
      readyDesign: design._id,
      isHidden: design.status !== "published",
      retired: false,
    };
    const doc = existing.find((x) => x.productGroupId === groupId && x.productdetails?.color === colour.name);
    if (doc) {
      doc.set(fields);
      await doc.save();
      keep.add(String(doc._id));
    } else {
      const created = await Product.create({ ...fields, user: userId, productGroupId: groupId, SKU: `${base}-${colour.name.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now().toString(36).toUpperCase()}`, rating: 0, numReviews: 0 });
      keep.add(String(created._id));
    }
  }
  }
  // a colour or category no longer on sale goes (hidden if it was ever ordered: its orders still link to it)
  for (const doc of existing.filter((x) => !keep.has(String(x._id)))) {
    const ordered = await mongoose.model("Order").exists({ "orderItems.product": doc._id });
    if (ordered) await Product.updateOne({ _id: doc._id }, { $set: { isHidden: true, retired: true } });
    else await Product.deleteOne({ _id: doc._id });
  }
  for (const slug of Object.keys(groups)) if (!places.some((p) => p.category === slug)) delete groups[slug];
  design.productGroups = groups;
  design.markModified("productGroups");
  return groups[places[0].category];
}
// shown / hidden with the tee
export const setStudioProductHidden = (designId, hidden) => Product.updateMany({ readyDesign: designId }, { $set: { isHidden: hidden } });
// gone with the tee (an ordered colour stays, hidden)
export async function removeStudioProduct(designId) {
  const docs = await Product.find({ readyDesign: designId }).select("_id").lean();
  for (const doc of docs) {
    const ordered = await mongoose.model("Order").exists({ "orderItems.product": doc._id });
    if (ordered) await Product.updateOne({ _id: doc._id }, { $set: { isHidden: true, retired: true } });
    else await Product.deleteOne({ _id: doc._id });
  }
}

