// services/trends.js — "Trending now" (23 Nov 2026): the trends the team keeps in Admin → Design Studio → Trends, and
// the words the picture AI gets for one. See models/trendModel.js.
//
// How a trend is made (the owner, 23 Nov 2026: "it should ask to select the t-shirt colour and size, then upload the
// photo in the assistant … it should generate the mockup; if the user is satisfied and clicks any one, make that
// design; then he can make edits with the help of the assistant"): the GTA Studio in the Design Room.
//   1. the MOCKUP — one concept sheet with three tees made from the customer's photo (POST /api/ai/concepts with
//      { trend, photoUrl }): the three options are trendConcepts() below
//   2. the customer picks one — its pieces are drawn at print size from that sheet AND their photo (POST
//      /api/ai/develop with { trend, photoUrl, poster }) and placed on the tee where the mockup has them
// (23 Nov 2026, the owner's change: "only the black and [white] colours should be given. In the front side of the
// t-shirt the logo I am giving is fixed for all tees. In the back either they can make the GTA version of their photo
// or we should provide many options for the back.") So a trend's tee is: its own colours · the trend's FRONT picture on
// every tee (the page puts it on; the customer may change it) · the BACK is the customer's choice — their photo in
// the trend's look (the mockup's three options are three BACK designs; the sheet shows the tees from the back only),
// or one of the ready-made backs the team keeps with the trend.
// A "poster" piece is a whole picture — the people in the trend's scene — kept whole and printed as one block (it is
// never cut out: a sunset sky has the pinks and purples the cut-out's key colour is made of). Any other piece is the
// people alone, cut out like every other Assistant drawing.
import Trend from "../models/trendModel.js";

// the trend the feature starts with: put in once, when there is none yet (the team may then change or remove it).
// The look is the one the owner sent on 23 Nov 2026 (glossy painted game-cover people in a neon beach city at dusk).
export const FIRST_TREND = {
  key: "gta",
  name: "GTA style",
  look:
    "a glossy, painted, near-photoreal illustration like the cover art of a modern open-world crime video game: smooth digital painting with crisp detail, " +
    "cinematic rim light, deep saturated colours and a slightly idealised, larger-than-life finish",
  setting:
    "a neon-lit beach city at dusk: a pink, orange and purple sunset sky, tall palm trees, art-deco hotels with glowing signs that have no readable words, " +
    "a wet street reflecting the lights and a classic car parked behind them",
  example: "",
  before: "",
  colours: ["black", "white"],
  front: "",
  backs: [],
  active: true,
  order: 0,
};

let seeded = false;
/** The trends, in the team's order. all: the switched-off ones too (the admin page). */
export async function listTrends({ all = false } = {}) {
  if (!seeded) {
    seeded = true;
    if (!(await Trend.estimatedDocumentCount())) await Trend.create(FIRST_TREND).catch(() => {});
  }
  return Trend.find(all ? {} : { active: true }).sort({ order: 1, createdAt: 1 }).lean();
}

/** One trend by its key — a switched-off one only for the team (they try it before switching it on). */
export async function findTrend(key, { team = false } = {}) {
  const k = String(key || "").toLowerCase().trim();
  if (!k) return null;
  await listTrends({ all: true });
  const row = await Trend.findOne({ key: k }).lean();
  return row && (row.active || team) ? row : null;
}

/** What the customer sees of a trend (the AI's words stay on the server). */
export const publicTrend = (t) => ({
  key: t.key,
  name: t.name,
  example: t.example || "",
  before: t.before || "",
  scene: Boolean(t.setting),
  colours: Array.isArray(t.colours) ? t.colours : [],
  front: t.front || "",
  backs: (Array.isArray(t.backs) ? t.backs : []).filter((b) => b?.url).map((b) => ({ url: b.url, name: b.name || "" })),
});

// who is in the artwork, said the same way everywhere
const PEOPLE = "the people from the customer's photo";
const RECOGNISABLE = "clearly recognisable as them — the same face, features, skin tone, hair, beard, glasses and build";

/**
 * The three options on a trend's mockup — three BACK designs (the front is the trend's own picture, the same on every
 * tee): [{ title, front: "", back, style, poster: [pieces kept whole] }].
 * A trend with no scene of its own has no poster: its options are the people alone, three ways.
 */
export function trendConcepts(trend) {
  const style = trend.name;
  const alone = `${PEOPLE}, only them with no background`;
  if (!trend.setting)
    return [
      { title: "Big on the back", front: "", back: `${alone}, seen from the waist up, large and centred`, style, poster: [] },
      { title: "Close-up", front: "", back: `${alone}, a close portrait of the head and shoulders, large and centred`, style, poster: [] },
      { title: "Head to toe", front: "", back: `${alone}, their whole figure standing, tall and centred`, style, poster: [] },
    ];
  // (the scene itself is said once for the whole sheet — trendSheetLine — so each option's words stay short)
  return [
    { title: "The poster", front: "", back: `a tall poster picture with sharp straight edges: ${PEOPLE} large in the foreground, seen from the knees or the waist up, in the scene, large across the back`, style, poster: ["back"] },
    { title: "Just you", front: "", back: `${alone}, seen from the waist up, large and centred on the back`, style, poster: [] },
    {
      title: "The cover",
      front: "",
      // (kept under the 300 letters the sheet keeps of an option's words)
      back: `a tall poster with sharp straight edges made of five picture panels with thin white gaps, like a game's cover: each panel shows ${PEOPLE} in another moment in the scene (a close portrait, walking, by the car, the skyline), large across the back`,
      style,
      poster: ["back"],
    },
  ];
}

/** Added to the concept sheet's instruction: the attached picture is the customer's photo, drawn in the trend's look. */
export const trendSheetLine = (trend) =>
  ` The attached image is the customer's own photo. Every concept's artwork shows the people in that photo, ${RECOGNISABLE}, redrawn as ${trend.look}. ` +
  `They appear ONLY inside the printed artwork on the tees — never as a model wearing a tee. No words, titles or logos in the artwork.` +
  (trend.setting ? ` The scene of every poster picture: ${trend.setting}.` : "");

/**
 * The instruction for one piece of the picked option, drawn from the sheet (the first attached image) and the
 * customer's photo (the second). poster: the whole picture, kept whole; else the people alone, on the key colour.
 */
export function trendPiecePrompt({ trend, concept, n, piece, poster }) {
  const side = piece === "back" ? "back" : "front";
  const likeness = ` The second attached image is the customer's own photo: the people in the artwork must be ${RECOGNISABLE}. Draw it as ${trend.look}.`;
  if (poster)
    return (
      `The attached image is a concept sheet with numbered t-shirt designs. Reproduce ONLY the picture printed on the ${side} of concept ${n} ("${String(concept?.title || "").slice(0, 50)}") as a finished poster: ` +
      `the picture alone, filling the whole frame edge to edge as a clean rectangle — the same composition, pose, setting, light and colours as on the sheet, with sharper, richer detail. ` +
      (trend.setting ? `The setting: ${trend.setting}. ` : "") +
      `No t-shirt, no mockup, no numerals, no sheet, no frame, no border, and no text, title or logo anywhere.` +
      likeness
    );
  return null; // (the people alone: the usual piece instruction, with the likeness line added — see assistantController.js)
}
export const trendLikenessLine = (trend) => ` The second attached image is the customer's own photo: the people in the artwork must be ${RECOGNISABLE}, drawn as ${trend.look}. Use no pink, magenta or purple light on them.`;

/* ---------- ready-made backs and their 4K print copy (23 Nov 2026) ----------
 * The owner: "just download and show the image; while they order we can make it 4K and enlarge with Topaz; once the
 * image is made 4K after the order, replace the old one in the shop with it."
 * A ready back is a small picture at first. Prepare for print (printFileController.js) makes its 4K copy when the
 * first tee with it is ordered, and then:
 *   keepReadyBackPrint  the copy takes the small picture's place on the trend (the shop shows and uses the 4K picture
 *                       from then on: no copy is paid for again); the small picture's address is remembered
 *   readyBackPrint      a tee designed BEFORE the swap still carries the small picture: its 4K copy is found here
 */

/** The 4K copy that took this small picture's place as a ready back, or null. */
export async function readyBackPrint(src) {
  if (!src) return null;
  const row = await Trend.findOne({ "backs.small": src }, { backs: 1 }).lean();
  const back = row?.backs?.find((b) => (b.small || []).includes(src));
  return back?.url && back.url !== src ? back.url : null;
}

/**
 * The 4K copy of a ready back takes its place in the shop.
 * @param src   the small picture the back was shown as (the ordered tee's picture)
 * @param copy  the stored 4K copy — a file of its own (the ordered design's own copy can be remade or deleted)
 * @returns true when a trend's back was swapped (false: the picture is no ready back, or it was swapped already)
 */
export async function keepReadyBackPrint(src, copy) {
  if (!src || !copy || src === copy) return false;
  const done = await Trend.updateOne({ "backs.url": src }, { $set: { "backs.$.url": copy }, $addToSet: { "backs.$.small": src } });
  return done.modifiedCount > 0;
}

/** Is this picture a ready back still shown as its small picture (so its 4K copy is worth keeping)? */
export const isSmallReadyBack = async (src) => Boolean(src && (await Trend.exists({ "backs.url": src })));
