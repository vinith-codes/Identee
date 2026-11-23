// studio/trends.js — "Trending now" / the GTA Studio (23 Nov 2026).
// The owner: "add the current trends as one feature — if the user uploads a photo it should give the GTA version of
// that", and how it should go: "it should ask to select the t-shirt colour and size, and then there should be upload
// the photo in the assistant; if the user uploads the photo and gives enter it should generate the mockup; if the user
// is satisfied and clicks any one, make that design. Then he can make edits with the help of the assistant. Don't
// confuse the Create your IDENTEE assistant and this assistant."
//
// So a trend has its OWN assistant — the Design Room's chat in "studio" mode (chatState.studio = the trend's key):
// its own chat (and its own tee), its own title, and only what the trend needs:
//   1. "Upload a photo"            → the mockup: one sheet with three tees made from the photo (act "trendSheet")
//   2. a tap on one of the three   → that design is drawn at print size and put on the tee as on the mockup
//   3. changes, by tapping or typing; "Show me 3 more" makes another mockup from the same photo
// (23 Nov 2026, the owner's change: "only the black and [white] colours should be given. In the front side of the
// t-shirt the logo I am giving is fixed for all tees. In the back either they can make the GTA version of their photo
// or we should provide many options for the back.")
//   · the tee: only the trend's colours (trendColours)
//   · the front: the trend's own picture, put on when the studio opens (the customer may still change or remove it)
//   · the back: their photo in the trend's look (the mockup's three options are three BACK designs) — or one of the
//     trend's ready-made backs ("Choose a ready design": a row of pictures, a tap puts one on the back)
// The trends themselves are kept by the team (Admin → Design Studio → Trends) and come with the AI's status
// (ai.trends: [{ key, name, example, before, scene, colours, front, backs }]).

export const TREND_MORE = "Show me 3 more";
export const TREND_UPLOAD = "Upload a photo"; // (the chat's own button for 📎: it opens the photo picker)
export const TREND_READY = "Choose a ready design";

// a trend's ready-made backs, checked: [{ url, name }]
const backsOf = (t) => (Array.isArray(t?.backs) ? t.backs : []).filter((b) => b && typeof b.url === "string" && b.url).map((b) => ({ url: b.url, name: String(b.name || "").slice(0, 40) })).slice(0, 120);
const namesOf = (t) => (Array.isArray(t?.colours) ? t.colours : []).map((c) => String(c || "").toLowerCase().trim()).filter(Boolean).slice(0, 30);

/**
 * The tee colours a trend's studio offers: the garment's colours the trend names (by name or slug). A trend that names
 * none — or none this garment has — offers them all (never an empty list).
 */
export function trendColours(all, trend) {
  const want = namesOf(trend);
  if (!want.length) return all;
  const only = (all || []).filter((c) => want.includes(String(c.slug || "").toLowerCase()) || want.includes(String(c.name || "").toLowerCase()));
  return only.length ? only : all;
}

/** A trend handed over by the home page (router state), checked: { key, name, colours } or null. */
export function trendFromLink(state) {
  const t = state?.trend;
  if (!t || typeof t.key !== "string" || !t.key.trim()) return null;
  return { key: t.key.trim().slice(0, 40), name: String(t.name || "this trend").slice(0, 40), colours: namesOf(t) };
}

/** What the trend's assistant opens with: one line, the upload button and (when the trend has them) the ready designs. */
export const trendHello = (t) => {
  const ready = backsOf(t).length > 0;
  const or = ready ? " — or pick one of our ready designs" : "";
  const text = t.front
    ? `${t.name} — the logo is on the front of your tee. For the back, send me a photo of you and I’ll show you three designs made from it${or}. A clear photo from the waist up works best.`
    : `${t.name} — send me a photo of you and I’ll show you three designs made from it for the back of your tee${or}. A clear photo from the waist up works best.`;
  return [{ from: "bot", text }, { chips: ready ? [TREND_UPLOAD, TREND_READY] : [TREND_UPLOAD] }];
};

/** The chat's memory for a trend's assistant (on top of the chat's first state). */
export const trendState = (t) => ({ studio: t.key, studioName: t.name, studioBacks: backsOf(t), wait: "trendPhoto", photo: null });

/** The request for the mockup: three tees from the photo, in the trend's look. */
export const trendSheetAct = (st, photo) => ({ type: "trendSheet", trend: st.studio, trendName: st.studioName || "your trend", photo });
