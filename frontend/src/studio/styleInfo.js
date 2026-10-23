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
  // (23 Oct 2026)
  Anime: ["Crisp anime lines, vivid colours", "linear-gradient(135deg,#FF8FB1,#5B5BD6)"],
  Graffiti: ["Spray paint, drips, street style", "linear-gradient(135deg,#7BD389,#F2545B)"],
  "Vintage distressed": ["Faded, cracked, old-tee print", "linear-gradient(135deg,#D9C6A5,#6B4F3A)"],
  "Pop art": ["Comic dots, bold colours", "linear-gradient(135deg,#FFD23F,#EE4266)"],
  Mandala: ["Fine Indian patterns", "linear-gradient(135deg,#F4C095,#7A1F5C)"],
  "Pixel art": ["8-bit video-game pixels", "linear-gradient(135deg,#6EE7F9,#4338CA)"],
};

// the groups under "More styles" on the Draw card (any style not listed here goes under "Drawn")
export const STYLE_GROUPS = [
  ["Drawn", ["Bold mascot", "Cartoon", "Anime", "Minimal line art", "Watercolour", "Pop art", "Pixel art"]],
  ["Real-looking", ["Realistic", "Detailed art"]],
  ["Street & retro", ["Graffiti", "Vintage distressed", "Retro badge"]],
  ["Ethnic & words", ["Mandala", "Hand lettering"]],
];

// the sample picture of a style (public/styles), or null for a style without one
const SAMPLES = new Set(["Bold mascot", "Minimal line art", "Retro badge", "Cartoon", "Watercolour", "Realistic", "Detailed art", "Hand lettering", "Anime", "Graffiti", "Vintage distressed", "Pop art", "Mandala", "Pixel art"]);
export const styleSample = (name) => (SAMPLES.has(name) ? `/styles/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webp` : null);

// A style the customer named in their own words ("a realistic tiger", "cartoon of my dog"), else null.
const STYLE_WORDS = [
  // (the six added on 23 Oct 2026 come first: "anime" used to mean Cartoon, "vintage" Retro badge)
  ["Anime", /\b(anime|manga|naruto|one piece|dragon ball|goku)\b/],
  ["Graffiti", /\b(graffiti|street.?art|spray.?paint\w*)\b/],
  ["Pixel art", /\b(pixel\w*|8.?bit|16.?bit|minecraft|retro game)\b/],
  ["Pop art", /\b(pop.?art|halftone|comic.?book)\b/],
  ["Mandala", /\b(mandala|ethnic|rangoli|paisley|kolam|traditional pattern)\b/],
  ["Vintage distressed", /\b(distressed|faded|worn|grunge|cracked)\b/],
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

// The Draw card's first four styles (StylePicker.jsx, 23 Oct 2026).
// styles that go well with each other: the three shown next to the one picked for the idea
const RELATED = {
  "Bold mascot": ["Cartoon", "Retro badge", "Detailed art"],
  Cartoon: ["Anime", "Bold mascot", "Pop art"],
  Anime: ["Cartoon", "Pop art", "Detailed art"],
  "Minimal line art": ["Hand lettering", "Mandala", "Watercolour"],
  Watercolour: ["Detailed art", "Minimal line art", "Mandala"],
  Realistic: ["Detailed art", "Vintage distressed", "Watercolour"],
  "Detailed art": ["Realistic", "Bold mascot", "Watercolour"],
  "Hand lettering": ["Graffiti", "Vintage distressed", "Minimal line art"],
  "Retro badge": ["Vintage distressed", "Bold mascot", "Pop art"],
  Graffiti: ["Pop art", "Bold mascot", "Hand lettering"],
  "Vintage distressed": ["Retro badge", "Realistic", "Graffiti"],
  "Pop art": ["Cartoon", "Graffiti", "Anime"],
  Mandala: ["Minimal line art", "Watercolour", "Detailed art"],
  "Pixel art": ["Cartoon", "Pop art", "Anime"],
};
const POPULAR = ["Bold mascot", "Cartoon", "Detailed art", "Realistic"];

/** The four styles shown first: the one picked, one named in the idea's words, related ones, popular ones. */
export function topStyles(styles, picked, subject = "") {
  const out = [];
  const add = (s) => {
    if (s && styles.includes(s) && !out.includes(s) && out.length < 4) out.push(s);
  };
  add(picked);
  add(styleIn(subject, styles));
  (RELATED[picked] || []).forEach(add);
  POPULAR.forEach(add);
  styles.forEach(add);
  return out;
}
