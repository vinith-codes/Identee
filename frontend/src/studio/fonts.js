// studio/fonts.js
//
// The Google Fonts the Design Room offers for text. Konva draws text on a
// canvas, so a font must be loaded in the page before it is drawn — both in
// the Design Room and when the admin makes print files.
export const FONTS = ["Anton", "Bebas Neue", "Oswald", "Montserrat", "Poppins", "Playfair Display", "Permanent Marker", "Pacifico", "Lobster", "Bangers"];

export function addStudioFonts() {
  const id = "dr-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700`).join("&")}&display=swap`;
  document.head.appendChild(link);
}

// Waits until the fonts these text elements use are ready (or ~8 s pass).
// @returns the font names that still didn't load
export async function fontsReady(elements) {
  addStudioFonts();
  const wanted = [...new Set(elements.filter((e) => e.type === "text").map((e) => `${e.bold ? "bold " : ""}${e.italic ? "italic " : ""}40px "${e.fontFamily || "Arial"}"`))];
  const timeout = new Promise((r) => setTimeout(r, 8000));
  await Promise.race([Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => null))), timeout]);
  return [...new Set(elements.filter((e) => e.type === "text" && FONTS.includes(e.fontFamily)).map((e) => e.fontFamily))].filter(
    (f) => !document.fonts.check(`40px "${f}"`),
  );
}
