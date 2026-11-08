// services/conceptSheets.js — concept sheets and developing a concept into artwork (Assistant v2, 7 Nov 2026)
//
// A concept sheet is ONE picture showing three numbered whole-tee concepts (front, back, sleeve) on the customer's
// garment and colour. "Develop" sends that sheet back to the picture AI as the reference and asks for ONE piece
// (the front, the back or the sleeve artwork) of ONE concept, alone on a plain background — the same reference-picture
// path as "copy a design from a photo". The piece then goes through the usual cut-out and placement.
import sharp from "sharp";

export const SHEET_RATIO = "16:9";
export const SHEET_SIZE = "2K"; // three tees on one picture need the detail (₹4.20 instead of ₹3)
export const SHEET_COST_FACTOR = 1.5; // a 2K picture costs 1.5× a 1K one (Google's price list, 7 Nov 2026)
const PIECE_WORD = { front: "front", back: "back", sleeve: "sleeve" };

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** The words for one concept, as the sheet prompt and the develop prompt describe it. */
export const conceptWords = (c) =>
  [c.front ? `front: ${c.front}` : "front: nothing", c.back ? `back: ${c.back}` : "back: nothing", c.sleeve ? `sleeve: ${c.sleeve}` : "sleeve: nothing", c.colours ? `ink colours: ${c.colours}` : "", c.style ? `style: ${c.style}` : ""].filter(Boolean).join("; ");

/**
 * The picture instruction for a sheet of numbered concepts.
 * @param concepts  [{ title, front, back, sleeve, colours, style }] (2 or 3)
 * @param garment   e.g. "oversized t-shirt"
 * @param teeColour e.g. "black"; teeIsDark for the text about contrast
 * @param numberFrom the number of the first concept on this sheet (4 for the second sheet)
 */
export function sheetPrompt({ concepts, garment = "t-shirt", teeColour = "white", teeIsDark = false, numberFrom = 1, logo = false, basis = false }) {
  const list = concepts.map((c, i) => `${numberFrom + i}) "${clean(c.title, 50)}" — ${conceptWords(c)}`).join(" ");
  return (
    `A clean product concept sheet on a plain light grey studio background, landscape, showing ${concepts.length} different t-shirt design concepts side by side as flat catalogue mockups. ` +
    `Each concept is labelled with a large, bold, black numeral above it (${concepts.map((_, i) => numberFrom + i).join(", ")}) and shows the same ${clean(garment, 40)} in ${clean(teeColour, 30)} from the front and from the back, with the sleeve print as a small inset where the concept has one. ` +
    `The printed artwork must be clearly visible and large on each tee${teeIsDark ? ", in inks that stand out on the dark fabric" : ""}. The concepts: ${list}. ` +
    `Consistent lighting, no people, no hangers, no extra text anywhere except the numerals and the words that are printed on the tees. Every word printed on a tee must be spelled exactly as given.` +
    (logo ? ` The attached image is the customer's own logo / artwork: wherever a concept says "logo", print it on the tee EXACTLY as it is — the same shapes, colours and words, not redrawn, not restyled — sized and placed as that concept describes.` : "") +
    (basis ? ` The attached image is the artwork already on the customer's tee: every concept is a version of THAT artwork — the same drawing, composition and words, changed only as the concept says (its ink colours or its style). Do not invent a different picture.` : "")
  );
}

/**
 * A companion piece drawn from the artwork already on the tee (round 5, 8 Nov 2026): "make a matching back".
 * @param piece   the new piece: "back" | "sleeve" | "front"
 * @param from    the area the reference picture is on, in words ("the front")
 * @param brief   what the new piece shows, words to print included
 */
export function matchPrompt({ piece = "back", from = "the front", brief = "", teeColour = "white", teeIsDark = false }) {
  return (
    `The attached image is the artwork printed on ${clean(from, 40)} of a ${clean(teeColour, 30)} t-shirt. Draw the matching ${PIECE_WORD[piece] || "back"} artwork for the SAME tee: a companion piece in exactly the same style, line quality, level of detail and ink colours, so the two clearly belong together${teeIsDark ? ", in inks that stand out on the dark fabric" : ""}. ` +
    `The new piece shows: ${clean(brief, 400) || "a simpler companion mark in the same style"}. Any words must be spelled exactly as given. ` +
    `Finished, print-ready artwork alone, large and centred, on a flat, solid, pure magenta (#FF00FF) background and nothing else (no magenta, pink or purple in the artwork itself). No t-shirt, no mockup, no frame, no extra text.`
  );
}

/**
 * A lifestyle photo of the finished tee on a person (round 5, 8 Nov 2026): for sharing.
 * The attached image is the tee's own front mock-up (from the Review step).
 */
export function wornPrompt({ garment = "t-shirt", teeColour = "white", setting = "" }) {
  const where = clean(setting, 80) || "outdoors on a college campus in India, soft daylight";
  return (
    `A realistic lifestyle photograph of a young Indian adult wearing this exact ${clean(garment, 40)} in ${clean(teeColour, 30)} — the attached image shows the tee and its printed design. ` +
    `Reproduce the printed design EXACTLY as in the attached image: the same artwork, words, colours, placement and size on the tee, not redrawn, not restyled, nothing added to the print. ` +
    `Setting: ${where}. Relaxed natural pose, facing the camera so the front print is fully visible, natural skin and fabric, shallow depth of field. Photo-real, 3:4 portrait. No text, no logo overlays, no watermark, no frame.`
  );
}

/**
 * The picture instruction for ONE piece of ONE concept, drawn from the sheet (sent as the reference picture).
 * @param piece   "front" | "back" | "sleeve"
 * @param n       the concept's number on the sheet
 */
export function developPrompt({ concept, n, piece, teeIsDark = false, logo = false, change = "" }) {
  const what = clean(concept?.[piece], 300) || clean(concept?.front, 300);
  return (
    `The attached image is a concept sheet with numbered t-shirt designs. Reproduce ONLY the ${PIECE_WORD[piece] || "front"} artwork of concept ${n} ("${clean(concept?.title, 50)}": ${what}${concept?.colours ? `; ink colours ${clean(concept.colours, 80)}` : ""}${concept?.style ? `; style ${clean(concept.style, 40)}` : ""}) as finished, print-ready artwork: the artwork alone, large and centred, on a flat, solid, pure magenta (#FF00FF) background and nothing else (no magenta, pink or purple in the artwork itself). ` +
    `No t-shirt, no mockup, no numerals, no sheet, no shadows, no extra text — only the words that are part of the artwork, spelled exactly as on the sheet. Keep its colours, style and composition as shown on the sheet, with sharper, cleaner detail.` +
    (logo ? ` The second attached image is the customer's own logo: where the artwork uses it, reproduce it EXACTLY (same shapes, colours and words), not redrawn.` : "") +
    (clean(change, 300) ? ` The customer asked for ONE change to this artwork: ${clean(change, 300)}. Apply exactly that change and keep everything else as on the sheet.` : "")
  );
}

/** Which pieces a concept has (the ones with a print). */
export const piecesOf = (concept) => ["front", "back", "sleeve"].filter((p) => concept?.[p]);

/** The shape of a piece's picture: a sleeve print is tall and thin, the others square-ish (the area's ratio decides later). */
export const pieceRatio = (piece, areaRatio) => areaRatio || (piece === "sleeve" ? "3:4" : "1:1");

/** The stand-in sheet for AI_IMAGE_PROVIDER=mock: three numbered tiles on a light background (a real PNG). */
export async function mockSheet(concepts, { teeColour = "white", numberFrom = 1 } = {}) {
  const W = 1536, H = 864, n = Math.max(1, concepts.length), gap = 48, tile = Math.floor((W - gap * (n + 1)) / n);
  const dark = /black|navy|maroon|charcoal|burgundy|bottle|coffee|dark/i.test(teeColour);
  const tiles = concepts
    .map((c, i) => {
      const x = gap + i * (tile + gap);
      return `<rect x="${x}" y="140" width="${tile}" height="${H - 200}" rx="24" fill="${dark ? "#1f1f22" : "#f6f3ec"}" stroke="#c9c2b4" stroke-width="4"/>
        <text x="${x + tile / 2}" y="110" font-family="Arial" font-size="84" font-weight="bold" text-anchor="middle" fill="#111">${numberFrom + i}</text>
        <text x="${x + tile / 2}" y="${H / 2}" font-family="Arial" font-size="34" text-anchor="middle" fill="${dark ? "#f0d585" : "#333"}">${String(c.title || "").replace(/[<>&]/g, "").slice(0, 22)}</text>
        <text x="${x + tile / 2}" y="${H / 2 + 50}" font-family="Arial" font-size="24" text-anchor="middle" fill="${dark ? "#ddd" : "#666"}">front · back · sleeve</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#e9e6df"/>${tiles}</svg>`;
  return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), mime: "image/png" };
}

/**
 * What the admin learns from the concept sheets (round 3, 7 Nov 2026): how many sheets were made, how many concepts
 * were picked and made real, the pick rate (picks ÷ concepts shown), and the styles customers pick most.
 * @param rows  usage rows [{ kind: "sheet" | "develop" | …, style?, images }]
 */
export function conceptSummary(rows = [], perSheet = 3) {
  const sheets = rows.filter((r) => r.kind === "sheet").length;
  const picks = rows.filter((r) => r.kind === "develop");
  const byStyle = new Map();
  for (const r of picks) if (r.style) byStyle.set(r.style, (byStyle.get(r.style) || 0) + 1);
  const styles = [...byStyle.entries()].map(([style, count]) => ({ style, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  const shown = sheets * perSheet;
  return { sheets, picks: picks.length, shown, pickRate: shown ? Math.round((picks.length / shown) * 100) : null, styles };
}

/**
 * Customers who got concept sheets but placed no order since (round 4, 8 Nov 2026) — the admin's follow-up list.
 * @param sheetRows   usage rows of kind "sheet", oldest first, with user populated { _id, name, email, phone }
 * @param developRows usage rows of kind "develop" ({ user })
 * @param orders      orders since the same date ({ user, createdAt })
 */
export function unfinishedDesigns(sheetRows = [], developRows = [], orders = [], max = 30) {
  const byUser = new Map();
  for (const r of sheetRows) {
    const id = String(r.user?._id || r.user || "");
    if (!id) continue;
    const u = byUser.get(id) || { id, who: r.user?.name || r.user?.email || "Customer", email: r.user?.email || "", phone: r.user?.phone || "", first: r.createdAt, last: r.createdAt, sheets: 0, picks: 0, asked: "" };
    u.sheets++;
    if (r.createdAt > u.last) u.last = r.createdAt;
    if (r.createdAt < u.first) u.first = r.createdAt;
    if (r.prompt) u.asked = r.prompt;
    byUser.set(id, u);
  }
  for (const r of developRows) {
    const u = byUser.get(String(r.user?._id || r.user || ""));
    if (u) u.picks++;
  }
  for (const o of orders) {
    const u = byUser.get(String(o.user?._id || o.user || ""));
    if (u && o.createdAt >= u.first) u.ordered = true;
  }
  return [...byUser.values()]
    .filter((u) => !u.ordered)
    .sort((a, b) => new Date(b.last) - new Date(a.last))
    .slice(0, max)
    .map(({ who, email, phone, first, last, sheets, picks, asked }) => ({ who, email, phone, first, last, sheets, picks, asked }));
}

/**
 * "Try it on me" (round 7, 8 Nov 2026): the customer's own photo (first image) with the finished tee (second image)
 * put on them — the person, face, pose and place kept, the print exactly as on the tee.
 */
export function tryOnPrompt({ garment = "t-shirt", teeColour = "white" }) {
  return (
    `Two images are attached. The FIRST is a photo of a person. The SECOND shows a ${clean(garment, 40)} in ${clean(teeColour, 30)} with a printed design. ` +
    `Dress the person in the first photo in that exact ${clean(garment, 40)}: keep their face, hair, body, pose, hands, the lighting and the background exactly as in their photo — change only their upper-body clothing to this tee. ` +
    `The printed design must appear exactly as in the second image: the same artwork, words, colours, placement and size, following the folds of the fabric naturally. Photo-real. No text, no watermark, no frame.`
  );
}
