// pages/CustomizablePage.jsx  —  /customizable
//
// Everything a customer can design on, grouped by store category
// (T-Shirts → Oversized Tee, later Polos → Polo …). Garments come from
// Admin → Customizable; only live, sellable ones show. ?category=<slug>
// shows just that category (old /customize/choose-product links land here).
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchAllGarmentImages } from "../redux/slices/garmentImageSlice";
import CustomizableGarments from "../components/CustomizableGarments";
import ShopPageHeader from "../components/ShopPageHeader";
import { categoryOfGarment, isSellable } from "../utils/garments";

export default function CustomizablePage() {
  const dispatch = useDispatch();
  const [params] = useSearchParams();
  const only = params.get("category");
  const { items: categories } = useSelector((s) => s.categories);
  const { items: garments, isLoading } = useSelector((s) => s.garmentType);
  const { items: images, isLoading: imagesLoading } = useSelector(
    (s) => s.garmentImage,
  );

  useEffect(() => {
    dispatch(fetchCategories());
    dispatch(fetchGarmentTypes());
    dispatch(fetchAllGarmentImages());
  }, [dispatch]);

  // Group sellable garments by their store category, in category order.
  const sellable = garments.filter((g) => isSellable(g, images));
  const groups = [];
  for (const g of sellable) {
    const cat = categoryOfGarment(g, categories);
    const key = cat?.slug || "other";
    let group = groups.find((x) => x.key === key);
    if (!group) {
      group = {
        key,
        name: cat?.name || "More to customize",
        order: cat?.displayOrder ?? 999,
        garments: [],
      };
      groups.push(group);
    }
    group.garments.push(g);
  }
  groups.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const shown = only ? groups.filter((g) => g.key === only) : groups;
  const loading = (isLoading || imagesLoading) && !sellable.length;

  return (
    <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
      <main
        style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 64px" }}
      >
        <ShopPageHeader
          eyebrow="Customizable"
          title="Design your own"
          text="Pick a garment and colour, add your text, photos or artwork, and see it true to size before you order."
          switchTo={{ to: "/ready-made", label: "Shop ready-made instead →" }}
        />

        {only && (
          <p style={{ margin: "0 0 18px" }}>
            <Link
              to="/customizable"
              style={{ color: "#7A5B12", fontWeight: 700 }}
            >
              ← All customizable
            </Link>
          </p>
        )}

        {loading && <CustomizableGarments garments={[]} images={[]} loading />}

        {!loading && shown.length === 0 && (
          <p style={{ color: "#71695B" }}>
            {only
              ? "Nothing to customize in this category yet."
              : "Customizable garments are coming soon."}
          </p>
        )}

        {shown.map((group, i) => (
          <section key={group.key} style={{ marginBottom: 40 }}>
            {(groups.length > 1 || only) && (
              <h2
                style={{
                  margin: "0 0 16px",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#15130F",
                }}
              >
                {group.name}
              </h2>
            )}
            <CustomizableGarments
              garments={group.garments}
              images={images}
              howItWorks={i === shown.length - 1}
            />
          </section>
        ))}
      </main>
    </div>
  );
}
