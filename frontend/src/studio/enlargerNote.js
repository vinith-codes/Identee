// studio/enlargerNote.js — which enlarger made a print-ready picture, in words (15 Nov 2026).
//
// Prepare for print enlarges a small picture on Replicate: with Topaz (the sharper one, the default), or with the old
// Real-ESRGAN — chosen in Settings → AI designs, or used on its own as the backup when Topaz fails. The server writes
// which one on the picture's printFile: enlarger = "topaz" | "real-esrgan" | "real-esrgan-backup". No enlarger = the
// picture was big enough already (not enlarged), or it was prepared before 15 Nov 2026: then nothing is said.
// Kept apart from printFiles.js so the tests can load it without the browser-only drawing code.

// the admin's order window: one line under the picture's DPI line (warn = shown in a warning colour)
const ADMIN = {
  topaz: { text: "enlarged with Topaz" },
  "real-esrgan": { text: "enlarged with Real-ESRGAN" },
  "real-esrgan-backup": { text: "Topaz failed — enlarged with the backup enlarger", warn: true },
};
// aiCopy (16 Nov 2026): Prepare for print first had the AI copy the picture at 4K, then enlarged that copy
export const adminEnlarger = (enlarger, aiCopy = false) => {
  const made = ADMIN[enlarger] || null;
  if (!aiCopy) return made;
  return { text: `4K copy by AI, ${made ? made.text : "not enlarged further"}`, ...(made?.warn ? { warn: true } : {}) };
};

// the order sheet and the job card (for the print team)
const SHEET = {
  topaz: "enlarged with Topaz",
  "real-esrgan": "enlarged with Real-ESRGAN",
  "real-esrgan-backup": "enlarged with the backup enlarger (Topaz failed)",
};
export const sheetEnlarger = (enlarger) => SHEET[enlarger] || "";

// several pictures in one print: each different way once, in order ("" when none was enlarged or all are older files)
export const sheetEnlargers = (enlargers) => [...new Set((enlargers || []).map(sheetEnlarger).filter(Boolean))].join("; ");

// the order sheet's line for a print with PRINT-READY pictures (printFiles.js): their real DPI and which enlarger made
// them — "enlarged with Topaz" / "enlarged with the backup enlarger (Topaz failed)" — or nothing for older files
export const readyLine = (at, count, dpis, madeBy = "") =>
  `  ${at}: PRINT-READY picture${count === 1 ? "" : "s"} (${dpis.length ? `${dpis.join(" / ")} DPI` : "enlarged"}, vector edge${madeBy ? `, ${madeBy}` : ""}).`;
