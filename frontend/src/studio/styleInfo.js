// studio/styleInfo.js — what each AI design style looks like, in a few words, and a colour swatch for its card.
// Used by the chat's plan card (PlanCard.jsx) and the Draw studio. Each style also has a sample picture: the same
// made-up man in that style ("BE YOU" for lettering), made once with Google (frontend/public/styles/<name>.webp). The style names come from the server
// (server/services/aiImageService.js AI_STYLES); a style missing here is still offered, without a description.
export const STYLE_INFO = {
  "Bold mascot": ["Thick outlines, flat colours, sporty", "linear-gradient(135deg,#FFB547,#D85A30)"],
  "Minimal line art": ["A few clean lines, lots of space", "linear-gradient(135deg,#F1EFE8,#888780)"],
  "Retro badge": ["A vintage round emblem", "linear-gradient(135deg,#F0997B,#712B13)"],
  Cartoon: ["Friendly, clean outlines", "linear-gradient(135deg,#AFA9EC,#534AB7)"],
  Watercolour: ["Soft painted edges", "linear-gradient(135deg,#9FE3C7,#F7B2C4)"],
  Realistic: ["Looks like a real photo", "linear-gradient(135deg,#8A9BA8,#1F2A33)"],
  "Detailed art": ["Lifelike, rich detail", "linear-gradient(135deg,#C9A24B,#3A2410)"],
  "Hand lettering": ["Your words as the design", "linear-gradient(135deg,#444441,#C9A24B)"],
};

// the sample picture of a style (public/styles), or null for a style without one
const SAMPLES = new Set(["Bold mascot", "Minimal line art", "Retro badge", "Cartoon", "Watercolour", "Realistic", "Detailed art", "Hand lettering"]);
export const styleSample = (name) => (SAMPLES.has(name) ? `/styles/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webp` : null);

// A style the customer named in their own words ("a realistic tiger", "cartoon of my dog"), else null.
const STYLE_WORDS = [
  ["Realistic", /\b(realistic|real|photo-?real\w*|lifelike|life-like|like a (real )?photo)\b/],
  ["Detailed art", /\b(detailed|digital painting|hyper.?detailed)\b/],
  ["Cartoon", /\b(cartoon\w*|comic|anime)\b/],
  ["Watercolour", /\b(water.?colou?r|painted|painting)\b/],
  ["Minimal line art", /\b(minimal\w*|line art|outline only|simple lines?)\b/],
  ["Retro badge", /\b(retro|vintage|badge|emblem)\b/],
  ["Bold mascot", /\b(mascot|sporty|esports|e-sports)\b/],
  ["Hand lettering", /\b(hand.?lett?e?ring|lettering|typography|calligraphy)\b/],
];
export const styleIn = (text, styles = []) => {
  const low = String(text || "").toLowerCase();
  const hit = STYLE_WORDS.find(([name, re]) => styles.includes(name) && re.test(low));
  return hit ? hit[0] : null;
};
