// utils/garments.js — helpers for customizable garments on the storefront.

// Only garments that are ready to sell: a price, and at least one colour
// with a front photo. (Drafts never reach the storefront at all.)
export const isSellable = (g, images) =>
  g.basePrice > 0 &&
  (g.colors || []).some((c) =>
    images.some((p) => p.garmentType === g.key && p.colorSlug === c.slug && p.front?.imageUrl),
  );

// The store category a garment belongs to: the one whose styles include
// the garment's style (Admin → Customizable → step 1 "Shown in category").
export const categoryOfGarment = (garment, categories) => {
  const style = String(garment.category || "").trim().toLowerCase();
  return categories.find((c) => (c.styles || []).some((s) => s.trim().toLowerCase() === style)) || null;
};

// Front photo of the garment's first colour that has one.
export const coverPhoto = (garment, images) => {
  for (const c of garment.colors || []) {
    const doc = images.find((p) => p.garmentType === garment.key && p.colorSlug === c.slug);
    if (doc?.front?.imageUrl) return doc.front.imageUrl;
  }
  return null;
};
