// pages/CustomizablePage.jsx  —  /customizable
//
// "Design your own" in two steps, like the IDENTEE catalogue:
//   1. /customizable                    — one card per customizable store category
//                                          (Girls Wear · Unisex & Kids Wear · Boys Wear)
//   2. /customizable?category=<slug>    — the garments of that category
// A category shows when it is customizable and active (Admin → Storefront → Categories)
// and has a live garment, a coming-soon garment, or is marked "coming soon". Garments come
// from Admin → Customizable: live, sellable ones can be designed; drafts marked "coming soon"
// show as cards with their catalogue photo (nothing to click into yet).
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchAllGarmentImages } from "../redux/slices/garmentImageSlice";
import CustomizableGarments from "../components/CustomizableGarments";
import ShopPageHeader from "../components/ShopPageHeader";
import { categoryOfGarment, coverPhoto, isSellable } from "../utils/garments";
import { imageUrl } from "../utils/imageUrl";
import garmentTypeService from "../services/garmentTypeService";

const CSS = `
  .cz-cats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
  .cz-cat { display: flex; flex-direction: column; border: 1px solid #EAE3CF; border-radius: 18px; overflow: hidden; background: #fff; color: #15130F; text-decoration: none; transition: transform .25s, box-shadow .25s, border-color .25s; }
  .cz-cat:hover { transform: translateY(-4px); box-shadow: 0 22px 40px -24px rgba(21,19,15,.35); border-color: #D9C58E; }
  .cz-cat:focus-visible { outline: 2px solid #B8912F; outline-offset: 3px; }
  .cz-img { position: relative; aspect-ratio: 4 / 4.2; max-width: 100%; background: #F4F0E7; display: grid; place-items: center; overflow: hidden; }
  .cz-img img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12%; transition: transform .5s; } /* keep faces and hangers in view */
  .cz-cat:hover .cz-img img { transform: scale(1.04); }
  .cz-ph { width: 100%; height: 100%; display: grid; place-items: center; background: radial-gradient(circle at 30% 20%, #2A251C, #121010 70%); color: #C9A24B; font: 800 clamp(40px, 6vw, 72px)/1 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.03em; }
  .cz-soon { position: absolute; top: 14px; left: 14px; background: #15130F; color: #F0D585; font: 700 11px/1 "Inter", sans-serif; letter-spacing: .14em; text-transform: uppercase; padding: 7px 11px; border-radius: 999px; }
  .cz-body { padding: 18px 20px 20px; display: grid; gap: 6px; }
  .cz-num { font: 700 13px/1 "Inter", sans-serif; letter-spacing: .1em; color: #B8912F; }
  .cz-body h2 { margin: 0; font: 800 clamp(20px, 2vw, 24px)/1.15 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.01em; text-transform: uppercase; }
  .cz-body p { margin: 0; color: #6B6559; font-size: 14px; line-height: 1.5; }
  .cz-go { margin-top: 8px; font-weight: 700; font-size: 14px; color: #7A5B12; }
  .cz-back { display: inline-block; margin: 0 0 18px; color: #7A5B12; font-weight: 700; text-decoration: none; }
  .cz-back:hover { text-decoration: underline; text-underline-offset: 3px; }
  .cz-head { margin: 0 0 6px; font: 800 clamp(24px, 3vw, 30px)/1.1 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; color: #15130F; text-transform: uppercase; }
  .cz-sub { margin: 0 0 20px; color: #6B6559; font-size: 15px; }
  .cz-photo { display: flex; align-items: center; gap: 14px; margin: 0 0 24px; padding: 14px 18px; border: 1px solid #D7B45E; border-radius: 16px; background: linear-gradient(135deg, #FBF3DE, #F4E7C4); color: #15130F; }
  .cz-photo svg { width: 30px; height: 30px; flex-shrink: 0; color: #8C6A1F; }
  .cz-photo div { display: grid; gap: 2px; min-width: 0; }
  .cz-photo b { font-size: 15px; }
  .cz-photo span { font-size: 13.5px; color: #4A3A12; }
  .cz-empty { padding: 36px 24px; border: 1px dashed #D9CFB4; border-radius: 16px; background: #FBF7EE; text-align: center; color: #4A443B; }
  .cz-empty b { display: block; font-size: 17px; color: #15130F; margin-bottom: 6px; }
  @media (max-width: 900px) { .cz-cats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .cz-cats { grid-template-columns: minmax(0, 1fr); } }
`;

export default function CustomizablePage() {
  const dispatch = useDispatch();
  const [params] = useSearchParams();
  const only = params.get("category");
  const { items: categories } = useSelector((s) => s.categories);
  const { items: garments, isLoading } = useSelector((s) => s.garmentType);
  const { items: images, isLoading: imagesLoading } = useSelector((s) => s.garmentImage);
  const [soon, setSoon] = useState([]); // drafts announced as "coming soon"

  useEffect(() => {
    dispatch(fetchCategories());
    dispatch(fetchGarmentTypes());
    dispatch(fetchAllGarmentImages());
    let alive = true;
    garmentTypeService
      .getComingSoon()
      .then((list) => alive && setSoon(Array.isArray(list) ? list : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dispatch]);
  // opening a collection (or going back) starts at the top of the page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [only]);

  // Sellable garments, by their store category.
  const sellable = garments.filter((g) => isSellable(g, images));
  const groups = (categories || [])
    .filter((c) => c.isCustomizable)
    .map((c) => ({
      key: c.slug,
      name: c.name,
      description: c.description,
      image: c.image,
      comingSoon: !!c.comingSoon,
      order: c.displayOrder ?? 999,
      garments: sellable.filter((g) => categoryOfGarment(g, categories)?.slug === c.slug),
      soon: soon.filter((g) => categoryOfGarment(g, categories)?.slug === c.slug),
    }))
    .filter((g) => g.garments.length || g.soon.length || g.comingSoon);
  // a live garment that isn't in any category still shows
  const loose = sellable.filter((g) => !categoryOfGarment(g, categories));
  if (loose.length) groups.push({ key: "other", name: "More to customize", description: "", image: "", comingSoon: false, order: 999, garments: loose, soon: [] });
  groups.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const loading = (isLoading || imagesLoading) && !groups.length;
  const open = only ? groups.find((g) => g.key === only) : null;
  // the card's picture: the category's own image (Admin → Categories), else a garment of it
  const picture = (g) => g.image || (g.garments[0] && coverPhoto(g.garments[0], images)) || g.soon[0]?.catalogueImage || "";

  return (
    <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
      <style>{CSS}</style>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 64px" }}>
        <ShopPageHeader
          eyebrow="Customizable"
          title="Design your own"
          text={only ? "Pick a garment and colour, add your text, photos or artwork, and see it true to size before you order." : "Choose a collection, then the garment you want to design."}
          switchTo={{ to: "/ready-made", label: "Shop ready-made instead →" }}
        />

        {/* the Photo Studio, highlighted: every garment can start from the customer's photo */}
        <div className="cz-photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          </svg>
          <div>
            <b>New · Photo studio</b>
            <span>Turn your photo into art, or keep it a photo, print-ready. Pick a garment, then tap “Start with my photo”.</span>
          </div>
        </div>

        {loading && <CustomizableGarments garments={[]} images={[]} loading />}

        {/* step 1: the collections */}
        {!loading && !only && (
          groups.length ? (
            <div className="cz-cats">
              {groups.map((g, i) => {
                const pic = picture(g);
                const count = g.garments.length;
                const coming = g.soon.length;
                return (
                  <Link key={g.key} to={`/customizable?category=${g.key}`} className="cz-cat">
                    <div className="cz-img">
                      {pic ? <img src={imageUrl(pic, 600)} alt="" loading="lazy" style={pic === g.soon[0]?.catalogueImage ? { objectFit: "contain", background: "#fff" } : undefined} /> : <div className="cz-ph" aria-hidden="true">{g.name.split(/\s+/).map((w) => w[0]).filter((ch) => /[a-z]/i.test(ch)).join("").slice(0, 3)}</div>}
                      {!count && <span className="cz-soon">Coming soon</span>}
                    </div>
                    <div className="cz-body">
                      <span className="cz-num">{String(i + 1).padStart(2, "0")}</span>
                      <h2>{g.name}</h2>
                      {g.description && <p>{g.description}</p>}
                      <span className="cz-go">
                        {count ? `${count} ${count === 1 ? "product" : "products"} to design` : coming ? `${coming} ${coming === 1 ? "product" : "products"} coming soon` : "See what's coming"}
                        {count && coming ? ` · ${coming} coming soon` : ""} →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "#71695B" }}>Customizable garments are coming soon.</p>
          )
        )}

        {/* step 2: the garments of one collection */}
        {!loading && only && (
          <>
            <Link to="/customizable" className="cz-back">← All collections</Link>
            {open ? (
              <section>
                <h2 className="cz-head">{open.name}</h2>
                {open.description && <p className="cz-sub">{open.description}</p>}
                {(open.garments.length > 0 || open.soon.length > 0) && <CustomizableGarments garments={open.garments} soon={open.soon} images={images} />}
                {!open.garments.length && !open.soon.length && (
                  <div className="cz-empty">
                    <b>Coming soon</b>
                    New designs for {open.name} are on the way. Meanwhile, browse our other collections.
                  </div>
                )}
              </section>
            ) : (
              <p style={{ color: "#71695B" }}>Nothing to customize in this collection yet.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
