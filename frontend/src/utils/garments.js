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

const hasFront = (garment, images, slug) =>
  images.some((p) => (p.garmentType === undefined || p.garmentType === garment.key) && p.colorSlug === slug && p.front?.imageUrl);

// The colour shown on cards before the customer chooses: white when it has
// a photo, otherwise the first colour with one.
export const defaultColour = (garment, images) => {
  const colours = garment.colors || [];
  return colours.find((c) => c.slug === "white" && hasFront(garment, images, c.slug)) || colours.find((c) => hasFront(garment, images, c.slug)) || colours[0] || null;
};

// Front photo of the default (white) colour.
export const coverPhoto = (garment, images) => {
  const c = defaultColour(garment, images);
  const doc = c && images.find((p) => p.garmentType === garment.key && p.colorSlug === c.slug);
  return doc?.front?.imageUrl || null;
};
