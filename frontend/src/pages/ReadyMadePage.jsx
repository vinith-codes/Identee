// pages/ReadyMadePage.jsx  —  /ready-made  (old /products links come here too)
//
// The ready-made categories the admin added (Admin → Storefront →
// Categories). Each tile opens that category's products, with filters.
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
import { CategoryGrid } from "../components/CategoryTile";
import ShopPageHeader from "../components/ShopPageHeader";
import { isReadyMade } from "../utils/categoryKinds";
import { SHOPS } from "../utils/shopNames";
import { useShopOpen } from "../utils/shopOpen";
import ShopComingSoon from "../components/ShopComingSoon";
import ReadyDesignGrid from "../components/shop/ReadyDesignGrid";

export default function ReadyMadePage() {
  const dispatch = useDispatch();
  const { items: all, status } = useSelector((s) => s.categories);
  // only the ready-made shop's categories (Design-your-own collections have their own page)
  const categories = all.filter(isReadyMade);

  const shop = useShopOpen();

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  if (!shop.open) return <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>{shop.known && <ShopComingSoon />}</div>;

  return (
    <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 20px 64px" }}>
        <ShopPageHeader
          eyebrow="Ready to wear"
          title={SHOPS.shop.name}
          text="Finished designs, ready to wear. Pick a category."
          switchTo={{ to: SHOPS.create.to, label: `${SHOPS.create.name} instead →` }}
        />
        {/* the IDENTEE designs made with the Collection maker (25 Oct 2026); nothing shows while there are none */}
        <ReadyDesignGrid />
        <CategoryGrid categories={categories} loading={status === "loading" || status === "idle"} />
        {status === "succeeded" && categories.length === 0 && (
          <p style={{ color: "#71695B" }}>New collections are coming soon.</p>
        )}
      </main>
    </div>
  );
}
