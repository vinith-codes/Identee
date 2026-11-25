// pages/admin/shop/newPictures.js — new pictures for a shop tee (Manage the shop → a collection's "New pictures")
//
// (24 Nov 2026, the owner: "make the front image like this for all the tees in Shop your IDENTEE" — the SCENE tees on a
// wooden hanger) a tee in the shop gets its pictures taken again, the way the Studio's Review takes them now: each print
// on the garment's hanger photo, true to size. Every colour on sale is taken again; the design, price and details stay.
// (Moved here from the Studio page on 25 Nov 2026 — the owner: "why this is in design studio".)
// shoot(job) → the four pictures, or null: the page's MockupCamera takes them (it needs to be on the page).
import studioService from "../../../services/studioService";
import customizationService from "../../../services/customizationService";
import { withSpots } from "../../../studio/panelModel";

// about how long a collection takes (6 seconds a tee), for the "keep this page open" question
export const minutesFor = (count) => Math.max(1, Math.round((count * 6) / 60));

// one tee: its pictures again, in every colour it is sold in. where: a Map kept for the whole run (each garment's
// print areas are asked for once).
export async function remakePictures(id, { garments, where, shoot }) {
  const full = await studioService.getDesign(id);
  const garment = garments.find((g) => g.key === full.garmentType);
  if (!garment) throw new Error("its product is not live");
  if (!where.has(garment.key)) where.set(garment.key, await customizationService.getPrintPositions(garment.key));
  const { positions: catalog, maxPrint } = where.get(garment.key);
  const positions = withSpots(catalog, full.elements || [], garment, maxPrint);
  const slugs = (full.colours?.length ? full.colours.map((x) => x.slug) : [full.color]).filter((s) => garment.colours.some((x) => x.slug === s));
  const colours = [];
  for (const slug of slugs) {
    const colour = garment.colours.find((x) => x.slug === slug);
    const job = { garment, positions, size: full.size || "M", colourHex: colour.hex, colourSlug: slug, elements: full.elements || [] };
    const pics = (await shoot(job)) || (await shoot(job)); // (one more try: a picture can fail once)
    if (!pics) throw new Error(`the pictures in ${colour.name} couldn't be taken`);
    colours.push({ slug, mockups: pics });
  }
  return studioService.saveDesign(
    {
      garmentType: full.garmentType,
      color: full.color,
      size: full.size,
      name: full.name,
      blurb: full.blurb,
      elements: full.elements,
      issues: full.issues,
      costInr: full.costInr,
      service: full.service,
      category: full.category,
      sizes: full.sizes,
      priceInr: full.priceInr,
      product: full.product,
      colours,
    },
    full._id,
  );
}
