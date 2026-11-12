// studio/fonts.js
//
// The Google Fonts the Design Room offers for text. Konva draws text on a
// canvas, so a font must be loaded in the page before it is drawn — both in
// the Design Room and when the admin makes print files.
export const FONTS = ["Anton", "Bebas Neue", "Oswald", "Montserrat", "Poppins", "Playfair Display", "Permanent Marker", "Pacifico", "Lobster", "Bangers"];

// Tamil (round 8, 11 Nov 2026). The fonts above have no Tamil letters, so Tamil words were drawn in whatever font the
// phone or laptop happened to have: different on every screen, and different again in the print file.
// These six are Google Fonts with Tamil letters, in regular and bold.
export const TAMIL_FONTS = ["Noto Sans Tamil", "Baloo Thambi 2", "Anek Tamil", "Catamaran", "Arima", "Noto Serif Tamil"];
export const hasTamil = (text) => /[\u0B80-\u0BFF]/.test(String(text || ""));

// The font a text is drawn with. Tamil words in an English font get the first Tamil font behind it: the English
// letters keep their font, the Tamil letters are always drawn by the same one.
export const textFamily = (el) => {
  const family = el?.fontFamily || "Arial";
  return hasTamil(el?.text) && !TAMIL_FONTS.includes(family) ? `${family}, ${TAMIL_FONTS[0]}` : family;
};

// The font list for one text: the Tamil fonts come first when the words are Tamil.
export const fontChoices = (text, current) => [...new Set([current, ...(hasTamil(text) ? TAMIL_FONTS : []), ...FONTS].filter(Boolean))];

export const fontsCssUrl = () => `https://fonts.googleapis.com/css2?${[...FONTS, ...TAMIL_FONTS].map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700`).join("&")}&display=swap`;

// Adds Google's font list to the page.
// @returns a promise: true once the list has arrived, false if it couldn't be fetched (the next call tries again)
let listLoading = null;
export function addStudioFonts() {
  if (listLoading) return listLoading;
  listLoading = new Promise((resolve) => {
    const link = document.createElement("link");
    link.id = "dr-fonts";
    link.rel = "stylesheet";
    link.href = fontsCssUrl();
    link.onload = () => resolve(true);
    link.onerror = () => {
      link.remove();
      listLoading = null;
      resolve(false);
    };
    document.head.appendChild(link);
  });
  return listLoading;
}

// Waits until the fonts these text elements use are ready (or ~8 s pass).
// The list must have arrived first: until then the browser doesn't know these fonts, so it says every one of them is
// "ready", and the text is drawn in another font. (5 Nov 2026: the first design after opening the admin printed so.)
// @returns the font names that still didn't load
export async function fontsReady(elements) {
  const texts = elements.filter((e) => e.type === "text").map((e) => ({ family: e.fontFamily || "Arial", text: e.text || " ", tamil: hasTamil(e.text), font: `${e.bold ? "bold " : ""}${e.italic ? "italic " : ""}40px ${textFamily(e).split(", ").map((f) => `"${f}"`).join(", ")}` }));
  const ours = texts.filter((t) => FONTS.includes(t.family) || TAMIL_FONTS.includes(t.family) || t.tamil);
  const timedOut = new Promise((r) => setTimeout(() => r(false), 8000));
  const listed = await Promise.race([addStudioFonts(), timedOut]);
  if (!listed) return [...new Set(ours.map((t) => t.family))];
  // with the words, so the file holding their alphabet is the one that loads
  await Promise.race([Promise.all(texts.map((t) => document.fonts.load(t.font, t.text).catch(() => null))), timedOut]);
  return [...new Set(ours.filter((t) => !document.fonts.check(t.font, t.text)).map((t) => t.family))];
}
