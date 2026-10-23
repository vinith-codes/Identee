// studio/pictureHelpers.js — helpers for "My pictures" (MyPictures.jsx, PlaceSheet.jsx, the Assistant's card)

// pictures matching the customer's words first ("my lion from before" → the ones asked for with "lion"), then the rest
const STOP = new Set(["my", "the", "a", "an", "from", "before", "earlier", "last", "time", "use", "put", "show", "picture", "pictures", "image", "images", "design", "designs", "old", "previous", "again", "that", "this", "one", "on", "of", "with", "me", "i", "made", "drew", "draw"]);
export const matchPictures = (pictures, words) => {
  const want = String(words || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!want.length) return pictures;
  const hits = pictures.filter((p) => want.some((w) => `${p.about} ${p.style}`.toLowerCase().includes(w)));
  return [...hits, ...pictures.filter((p) => !hits.includes(p))];
};

// the list changed (a picture taken off it): every open My pictures list loads again
export const PICTURES_CHANGED = "identee:my-pictures";

export const pictureWhen = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
// what it shows ("Lion with a crown"; a photo by its file name, "College logo"), else what it is
export const pictureLabel = (p) => (p.about ? p.about.charAt(0).toUpperCase() + p.about.slice(1) : p.kind === "photo" ? "Your photo" : "AI picture");
