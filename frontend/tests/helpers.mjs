// Shared pieces for the Assistant tests (23 Oct 2026). No AI is called: replyTo() only decides what to say and
// which action to start; the tests check that decision.

export const STYLES = ["Bold mascot", "Minimal line art", "Retro badge", "Cartoon", "Watercolour", "Realistic", "Detailed art", "Hand lettering"];
export const PHOTO_STYLES = ["Cartoon", "Sketch", "Sticker", "Watercolour", "Pop art", "Realistic", "Anime", "Line art"];

export const AREAS = [
  { key: "centre-front", label: "Centre front", side: "front", main: true, free: true },
  { key: "left-chest", label: "Left chest", side: "front", main: false, free: true },
  { key: "full-back", label: "Full back", side: "back", main: true, free: true },
  { key: "top-back", label: "Top back", side: "back", main: false, free: true },
  { key: "left-sleeve", label: "Left sleeve", side: "front", main: false, free: true },
];

const CHART = { S: { chest: 40, length: 27 }, M: { chest: 42, length: 28 }, L: { chest: 44, length: 29 }, XL: { chest: 46, length: 30 } };

// What the design room hands the Assistant (DesignRoomPage.jsx, assistantCtx). ai: the text AI and the picture AI
// are both on and the customer is logged in, unless a test says otherwise.
export const makeCtx = (over = {}) => {
  const { ai, ...rest } = over;
  return {
    areaLabel: "Centre front",
    teeName: "Black",
    hasDesign: false,
    sizes: ["S", "M", "L", "XL"],
    sizeNow: "L",
    chart: (s) => CHART[s] || null,
    areas: AREAS,
    activeKey: "centre-front",
    issues: () => [],
    inks: ["#FFFFFF", "#F0D585"],
    hasText: false,
    hasRoles: false,
    roles: {},
    players: 0,
    photoOnTee: null,
    ...rest,
    ai: { available: true, text: true, loggedIn: true, left: 5, reason: null, styles: STYLES, photoStyles: PHOTO_STYLES, ...(ai || {}) },
  };
};

// The messages as short labels, easy to compare: "bot: …", "chips: a | b", "act: edit", "plan", "slogans", …
export const kinds = (out) =>
  out.map((m) => {
    if (m.act) return `act: ${m.act.type}`;
    if (m.from === "bot") return "bot";
    if (m.chips) return "chips";
    if (m.plan) return "plan";
    if (m.slogans) return "slogans";
    if (m.inks) return "inks";
    if (m.examples) return "examples";
    if (m.issues) return "issues";
    if (m.fill !== undefined) return "fill";
    return Object.keys(m).join(",");
  });

export const actOf = (out) => out.find((m) => m.act)?.act || null;
export const chipsOf = (out) => out.find((m) => m.chips)?.chips || [];
export const botText = (out) => out.filter((m) => m.from === "bot").map((m) => m.text).join(" ");
