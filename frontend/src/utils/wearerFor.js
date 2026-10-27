// Who wears a category's tees in its photos (27 Oct 2026, the client: "man photos for the men's category, woman
// photos for the women's"): read from the category's name or slug. Anything else = both.
//   wearerFor("womens-t-shirts") -> "woman"   wearerFor("MEN'S T-SHIRTS") -> "man"   wearerFor("hoodies") -> null
// (the backend has the same rule in services/studioService.js — keep them alike)
export function wearerFor(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(women|woman|womens|ladies|lady|girls?|female)\b/.test(t)) return "woman";
  if (/\b(men|man|mens|boys?|male|gents)\b/.test(t)) return "man";
  return null;
}

// photos with the wearer the category is for first (the rest follow, nothing is hidden)
export const photosFor = (photos, wearer) => (!wearer ? photos : [...photos.filter((p) => p.wearer === wearer), ...photos.filter((p) => p.wearer !== wearer)]);
