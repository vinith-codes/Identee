// Admin → Studio: small shared pieces (25 Oct 2026) — constants and helpers the Studio's components share. (Kept out
// of the component files so Vite's fast refresh keeps working.)
import { areaCm } from "../../../studio/teeModel";

export const INKS = ["#FFFFFF", "#141110", "#C9A24B", "#C2352C", "#2441B5", "#1C5A2B", "#F0C24C", "#B7A2E0", "#F08A24", "#8DC1EC"];
// the tabs of "What to add": [key, label, icon path]
export const ADD_TABS = [
  ["text", "Text", "M5 6V4h14v2M12 4v16M9 20h6"],
  ["upload", "Upload", "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"],
  ["art", "Art", "M4 5h16v14H4zM8 13l3-3 5 5M15 9h.01"],
  ["ai", "AI pictures", "m12 3 1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3Z"], // the pictures the assistant made (26 Oct 2026)
];
export const ICON_AI = "m12 3 1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3Z";
export const ICON_AREAS = "M8 4 4 6.5 2 10l3 1.5V20h14v-8.5L22 10l-2-3.5L16 4a4 4 0 0 1-8 0Z";
export const ICON_ADD = "M12 5v14M5 12h14";

export const quarterTurn = (rotation, by) => {
  let r = Math.round(((rotation || 0) + by) / 90) * 90;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
};

// The shape (width ÷ height) a kind of picture should have for the area it goes on.
export function shapeFor(kind, pos, size) {
  const [w, h] = areaCm(pos, size);
  if (kind === "title") return Math.min(3.2, Math.max(1.6, w / (h * 0.3)));
  if (kind === "hero") return (w * 0.8) / (h * 0.7);
  if (kind === "logo") return 1;
  return w / h;
}

// The tee being worked on, kept in this browser across a reload ("Continue" on the Studio page).
const DRAFT_KEY = "identee:studio:draft:v1";
export const readDraft = () => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
};
export const writeDraft = (draft) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // storage blocked: the tee just isn't kept after a reload
  }
};
export const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing to clear
  }
};
export const isNarrow = () => typeof window !== "undefined" && window.innerWidth <= 760;
