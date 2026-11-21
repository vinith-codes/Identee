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
// sleeve2 (21 Nov 2026): a concept may carry a print on each sleeve — "sleeve" is the left one, "sleeve2" the right
const PIECE_WORD = { front: "front", back: "back", sleeve: "left sleeve", sleeve2: "right sleeve" };

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** The words for one concept, as the sheet prompt and the develop prompt describe it. */
export const conceptWords = (c) =>
  [
    c.front ? `front: ${c.front}` : "front: nothing",
    c.back ? `back: ${c.back}` : "back: nothing",
    c.sleeve2 ? `left sleeve: ${c.sleeve || "nothing"}` : c.sleeve ? `sleeve: ${c.sleeve}` : "sleeve: nothing",
    c.sleeve2 ? `right sleeve: ${c.sleeve2}` : "",
    c.colours ? `ink colours: ${c.colours}` : "",
    c.style ? `style: ${c.style}` : "",
  ]
    .filter(Boolean)
    .join("; ");

/**
 * The picture instruction for a sheet of numbered concepts.
 * @param concepts  [{ title, front, back, sleeve, colours, style }] (2 or 3)
 * @param garment   e.g. "oversized t-shirt"
 * @param teeColour e.g. "black"; teeIsDark for the text about contrast
 * @param numberFrom the number of the first concept on this sheet (4 for the second sheet)
 */
// pictures (17 Nov 2026): how many of the customer's own pictures are attached to be mixed into the concepts (2–6)
// reference (21 Nov 2026): the attached image is a whole tee the customer wants one LIKE — its layout and look are
// copied (each concept says how), within what we can print. inspired: the same picture only as inspiration — three
// NEW designs with its feel, none a copy
export function sheetPrompt({ concepts, garment = "t-shirt", teeColour = "white", teeIsDark = false, numberFrom = 1, logo = false, basis = false, pictures = 0, reference = false, inspired = false }) {
  const list = concepts.map((c, i) => `${numberFrom + i}) "${clean(c.title, 50)}" — ${conceptWords(c)}`).join(" ");
  const twoSleeves = concepts.some((c) => c.sleeve2);
  return (
    `A clean product concept sheet on a plain light grey studio background, landscape, showing ${concepts.length} different t-shirt design concepts side by side as flat catalogue mockups. ` +
    `Each concept shows the same ${clean(garment, 40)} in ${clean(teeColour, 30)} from the front and from the back, with ${twoSleeves ? "each sleeve print as a small inset (left sleeve, right sleeve)" : "the sleeve print as a small inset"} where the concept has one — each sleeve inset shown ONCE per concept, beside its front view, never repeated by the back view. ` +
    // (21 Nov 2026 real test: insets drawn twice; a tiny neck label drawn inside the collar)
    `Draw no neck label, size tag, hem tag or brand tab on the tees — only the printed artwork the concept describes. ` +
    // (21 Nov 2026: the sheet used to give half its height to huge numerals over tiny tees)
    `FILL THE FRAME: the tees are the main subject and take up most of the picture — about 80% of its height, edge to edge with only a small margin. Each concept is labelled with a small, bold, black numeral (${concepts.map((_, i) => numberFrom + i).join(", ")}) in the top-left corner just above its tees, no taller than one-tenth of the picture's height. No big empty space anywhere. ` +
    `The printed artwork must be clearly visible and large on each tee${teeIsDark ? ", in inks that stand out on the dark fabric" : ""}. The concepts: ${list}. ` +
    `Consistent lighting, no people, no hangers, no extra text anywhere except the numerals and the words that are printed on the tees — no titles, no concept names, no captions, no "FRONT" / "BACK" labels${twoSleeves ? " (only a tiny \"L\" and \"R\" beside the two sleeve insets)" : ""}. Every word printed on a tee must be spelled exactly as given. ` +
    // (21 Nov 2026: "stencil typography" was printed as the word STENCIL, "technical box logo" as TECHNICAL LOGO)
    `Only words given in quotes are printed. A print described without quoted words has NO lettering at all (a shape, mark or texture instead) — never print a description, a style name or made-up words.` +
    (logo ? ` The attached image is the customer's own logo / artwork: wherever a concept says "logo", print it on the tee EXACTLY as it is — the same shapes, colours and words, not redrawn, not restyled — sized and placed as that concept describes.` : "") +
    (pictures > 1 ? ` ${picturesLine(pictures, 1)} Wherever a concept names "picture 1", "picture 2" … (or "logo"), use THAT attached picture: a logo or lettering stays EXACTLY as it is (same shapes, colours and words); a person, pet or object is drawn recognisably in the concept's style; a garment's print gives its style and look.` : "") +
    (basis ? ` The attached image is the artwork already on the customer's tee: every concept is a version of THAT artwork — the same drawing, composition and words, changed only as the concept says (its ink colours or its style). Do not invent a different picture.` : "") +
    (reference ? ` ${inspired ? INSPIRED_LINE : REFERENCE_LINE} ${DTF_LINE}` : "")
  );
}

// the reference tee (21 Nov 2026): what the picture AI takes from it, and the printing limits it keeps to
const REFERENCE_LINE =
  "The attached image shows a t-shirt the customer wants a tee LIKE. Copy its layout and look: the same kinds of prints in the same places and at the same sizes, the same lettering style, brush or texture effects, graphic shapes and ink colours — changed only where a concept says so. A logo or lettering in it stays EXACTLY as it is (same shapes and words).";
// "new inspired designs" (21 Nov 2026): the picture is only inspiration — its feel, never its artwork
const INSPIRED_LINE =
  "The attached image shows a t-shirt the customer likes — use it ONLY as inspiration. Take its feel: the kind of layout (where the prints sit and how big they are), the lettering style, brush or texture effects and the colour mood. Each concept is a NEW design made from what that concept says: do not copy the picture's artwork, logo or brand words, and no concept is a copy of it.";
const DTF_LINE =
  "Every print sits on flat fabric, as a direct-to-film transfer is pressed: a print near an edge stops a little short of the collar, the hem and the side seams instead of running over them, and a sleeve band is printed on the outside of the sleeve only, not all the way round. Leave out sewn labels and tags — they are not prints.";

/**
 * A companion piece drawn from the artwork already on the tee (round 5, 8 Nov 2026): "make a matching back".
 * @param piece   the new piece: "back" | "sleeve" | "front"
 * @param from    the area the reference picture is on, in words ("the front")
 * @param brief   what the new piece shows, words to print included
 */
export function matchPrompt({ piece = "back", from = "the front", brief = "", teeColour = "white", teeIsDark = false }) {
  return (
    `The attached image is the artwork printed on ${clean(from, 40)} of a ${clean(teeColour, 30)} t-shirt. Draw the matching ${piece === "sleeve" ? "sleeve" : PIECE_WORD[piece] || "back"} artwork for the SAME tee: a companion piece in exactly the same style, line quality, level of detail and ink colours, so the two clearly belong together${teeIsDark ? ", in inks that stand out on the dark fabric" : ""}. ` +
    `The new piece shows: ${clean(brief, 400) || "a simpler companion mark in the same style"}. Any words must be spelled exactly as given. ` +
    `Finished, print-ready artwork alone, large and centred, on a flat, solid, pure magenta (#FF00FF) background and nothing else (no magenta, pink or purple in the artwork itself). No t-shirt, no mockup, no frame, no extra text.`
  );
}

/**
 * Which side of the tee a worn photo / try-on is about (13 Nov 2026, feedback 7): "back" or "front".
 * Anything else — an older page sends nothing — is the front, as before.
 */
export const teeSide = (side) => (side === "back" ? "back" : "front");

/**
 * A lifestyle photo of the finished tee on a person (round 5, 8 Nov 2026): for sharing.
 * The attached image is the tee's own mock-up from the Review step: its front, or (13 Nov 2026) its back with
 * side "back" — the person then stands with their back to the camera (the pose of the Studio's back model photos).
 */
// Every printed side (17 Nov 2026, the owner: "it must show all sides where the prints are available"): one photo
// per side. How the person stands for each side, and what the tee picture shows.
export const WORN_SIDES = ["front", "back", "left", "right"];
const SIDE_POSE = {
  front: { shows: "the tee and its printed design", pose: "Relaxed natural pose, facing the camera so the front print is fully visible", from: "from the front" },
  back: { shows: "the BACK of the tee and its printed design", pose: "Standing with their back to the camera (head turned slightly to one side), so the back print is fully visible", from: "from behind" },
  left: { shows: "the tee from its LEFT side, with the print on the left sleeve", pose: "Standing side-on with their LEFT side and left sleeve towards the camera, so the sleeve print is fully visible", from: "from their left side" },
  right: { shows: "the tee from its RIGHT side, with the print on the right sleeve", pose: "Standing side-on with their RIGHT side and right sleeve towards the camera, so the sleeve print is fully visible", from: "from their right side" },
};
const sidePose = (side) => SIDE_POSE[side] || SIDE_POSE.front;

/**
 * @param side    "front" | "back" | "left" | "right": the side of the tee in the attached picture (17 Nov 2026)
 * @param sameAs  true when a SECOND image is attached: a photo already made of the person (the first side), so this
 *                side shows the same person, place and light — as if one more shot was taken a moment later
 */
export function wornPrompt({ garment = "t-shirt", teeColour = "white", setting = "", side = "front", sameAs = false }) {
  const where = clean(setting, 80) || "outdoors on a college campus in India, soft daylight";
  const p = sidePose(side);
  return (
    `A realistic lifestyle photograph of a young Indian adult wearing this exact ${clean(garment, 40)} in ${clean(teeColour, 30)}${side === "front" ? "" : `, seen ${p.from}`} — the ${sameAs ? "FIRST " : ""}attached image shows ${p.shows}. ` +
    `Reproduce the printed design EXACTLY as in the ${sameAs ? "first " : ""}attached image: the same artwork, words, colours, placement and size on the tee, not redrawn, not restyled, nothing added to the print. ` +
    (sameAs
      ? `The SECOND attached image is a photo already taken of this person wearing the tee: show the SAME person (same face, hair, skin, build, the same trousers and shoes), in the same place, light and time of day, as if the photographer took one more shot a moment later ${p.from}. Do not copy the print from the second image — the print for this side is the one in the first image. `
      : `Setting: ${where}. `) +
    `${p.pose}, natural skin and fabric, shallow depth of field. Photo-real, 3:4 portrait. No text, no logo overlays, no watermark, no frame.`
  );
}

/**
 * The picture instruction for ONE piece of ONE concept, drawn from the sheet (sent as the reference picture).
 * @param piece   "front" | "back" | "sleeve"
 * @param n       the concept's number on the sheet
 */
// reference (21 Nov 2026): the second attached image is the tee the customer wants one like (its look kept exactly)
// layout (21 Nov 2026, live test): the piece is a whole laid-out side (a chest logo, strokes down the side, a tag near
// the hem …) placed on that side's WHOLE print area — every part stays where it sits on the tee, not "large and centred"
export function developPrompt({ concept, n, piece, teeIsDark = false, logo = false, change = "", pictures = 0, reference = false, layout = false }) {
  const what = clean(concept?.[piece], 300) || clean(concept?.front, 300);
  const word = PIECE_WORD[piece] || "front";
  // a concept with one sleeve print calls it "the sleeve" on the sheet
  const onSheet = piece === "sleeve" && !concept?.sleeve2 ? "sleeve" : word;
  const placed = layout
    ? `the whole ${word} print area of the tee, edge to edge: every part of it exactly where it sits on the ${word} of that tee on the sheet — a chest logo up at the chest on its side, strokes down the side, a tag just above the hem — at the same sizes relative to each other and to the ${word}, with empty space between the parts (do NOT gather them in the middle or enlarge them). The picture's edges are the edges of the ${word} print area (just inside the collar, the side seams and the hem); leave a thin magenta margin all round — no part touches the picture's edges`
    : "the artwork alone, large and centred";
  return (
    `The attached image is a concept sheet with numbered t-shirt designs. Reproduce ONLY the ${onSheet} artwork of concept ${n} ("${clean(concept?.title, 50)}": ${what}${concept?.colours ? `; ink colours ${clean(concept.colours, 80)}` : ""}${concept?.style ? `; style ${clean(concept.style, 40)}` : ""}) as finished, print-ready artwork: ${placed}, on a flat, solid, pure magenta (#FF00FF) background and nothing else (no magenta, pink or purple in the artwork itself). ` +
    `No t-shirt, no mockup, no numerals, no sheet, no shadows, no extra text — only the words that are part of the artwork, spelled exactly as on the sheet. Keep its colours, style and composition as shown on the sheet, with sharper, cleaner detail.` +
    (logo ? ` The second attached image is the customer's own logo: where the artwork uses it, reproduce it EXACTLY (same shapes, colours and words), not redrawn.` : "") +
    (reference && !logo && pictures < 2 ? ` The second attached image is the t-shirt the customer wants theirs to be like: take the look of this ${onSheet} print from the same place on it — its lettering style, brush or texture effects, shapes and ink colours — with any logo or lettering EXACTLY as it is there. Draw it flat, as artwork only.` : "") +
    (pictures > 1 ? ` ${picturesLine(pictures, 2)} Where the artwork uses one of them, keep it as on the sheet: a logo or lettering EXACTLY as it is, a person, pet or object recognisable.` : "") +
    (clean(change, 300) ? ` The customer asked for ONE change to this artwork: ${clean(change, 300)}. Apply exactly that change and keep everything else as on the sheet.` : "")
  );
}

// "The attached images 2 to 4 are the customer's own pictures 1 to 3, in order." (17 Nov 2026)
const picturesLine = (n, first) =>
  first === 1 ? `The ${n} attached images are the customer's own pictures, picture 1 to picture ${n} in order.` : `After the concept sheet, the next ${n} attached images are the customer's own pictures, picture 1 to picture ${n} in order.`;

/** Which pieces a concept has (the ones with a print). */
export const piecesOf = (concept) => ["front", "back", "sleeve", "sleeve2"].filter((p) => concept?.[p]);

/** The shape of a piece's picture: a sleeve print is tall and thin, the others square-ish (the area's ratio decides later). */
export const pieceRatio = (piece, areaRatio) => areaRatio || (/^sleeve/.test(piece) ? "3:4" : "1:1");

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
 * side "back" (13 Nov 2026, feedback 7): the photo shows the customer's back and the second image is the tee's BACK,
 * so the back print goes on their back (it used to be the front print, always). A plain back stays plain.
 */
export function tryOnPrompt({ garment = "t-shirt", teeColour = "white", side = "front" }) {
  // side "back" (13 + 17 Nov 2026): the customer added a photo of their back — it is dressed the same way
  const back = side === "back";
  if (back) {
    const g = clean(garment, 40);
    return (
      `Two images are attached. The FIRST is a photo of a person seen from behind (their back to the camera). The SECOND shows the BACK of a ${g} in ${clean(teeColour, 30)}, with whatever is printed on its back. ` +
      `Dress the person in the first photo in that exact ${g}: keep their hair, head, body, pose, hands, the lighting and the background exactly as in their photo, still seen from behind — do not turn them round — change only their upper-body clothing to this tee. ` +
      `The back of the tee must appear on their back exactly as in the second image: the same artwork, words, colours, placement and size, following the folds of the fabric naturally, the words reading the right way round (not mirrored). If that back is plain, keep it plain. Photo-real. No other text, no watermark, no frame.`
    );
  }
  return (
    `Two images are attached. The FIRST is a photo of a person${back ? " seen from behind" : ""}. The SECOND shows ${back ? "the BACK of " : ""}a ${clean(garment, 40)} in ${clean(teeColour, 30)} with a printed design. ` +
    `Dress the person in the first photo in that exact ${clean(garment, 40)}: keep their face, hair, body, pose, hands, the lighting and the background exactly as in their photo — change only their upper-body clothing to this tee. ` +
    `The printed design must appear exactly as in the second image: the same artwork, words, colours, placement and size, following the folds of the fabric naturally. Photo-real. No text, no watermark, no frame.`
  );
}

/**
 * "Try it on me", the other sides (17 Nov 2026): the customer's photo shows their front, so the back (or a sleeve
 * side) is MADE by the AI — the same person turned round. The first image is the person (their front try-on photo
 * when there is one, else their own photo); the second is the tee from that side. The Review caption says so.
 */
export function tryOnSidePrompt({ garment = "t-shirt", teeColour = "white", side = "back" }) {
  const p = sidePose(side === "front" ? "back" : side);
  const tee = `a ${clean(garment, 40)} in ${clean(teeColour, 30)}`;
  const shows = side === "left" || side === "right" ? `${tee} from its ${side.toUpperCase()} side, with the print on the ${side} sleeve` : `the BACK of ${tee}, with its printed design`;
  return (
    `Two images are attached. The FIRST is a photo of a person. The SECOND shows ${shows}. ` +
    `Make a new photo-real picture of the SAME person seen ${p.from}: the same hair, skin, build and other clothes, in the same place, light and time of day — as if a friend took one more photo of them a moment later ${p.from}. They wear that exact ${clean(garment, 40)}. ` +
    `The printed design must appear exactly as in the second image: the same artwork, words, colours, placement and size, following the folds of the fabric naturally. ${p.pose}. No text, no watermark, no frame.`
  );
}
