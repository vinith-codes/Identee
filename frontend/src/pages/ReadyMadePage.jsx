// pages/ReadyMadePage.jsx  —  /ready-made  (old /products links come here too)
//
// The ready-made shop: the categories the admin added (Admin → Storefront →
// Categories) as tiles, then every ready-made product with filters.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
import { CategoryGrid } from "../components/CategoryTile";
import ShopPageHeader from "../components/ShopPageHeader";
import ShopGrid from "../components/shop/ShopGrid";

export default function ReadyMadePage() {
  const dispatch = useDispatch();
  const { items: categories, status } = useSelector((s) => s.categories);

  const { hash } = useLocation();

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  // /ready-made#all (old /products links) → jump to the product grid
  useEffect(() => {
    if (hash !== "#all") return;
    const t = setTimeout(() => document.getElementById("all")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 20px 64px" }}>
        <ShopPageHeader
          eyebrow="Ready-made"
          title="Shop by category"
          text="Finished designs, ready to wear."
          switchTo={{ to: "/customizable", label: "Design your own instead →" }}
        />
        <CategoryGrid categories={categories} loading={status === "loading" || status === "idle"} />

        <h2
          style={{
            margin: "44px 0 16px",
            fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(22px, 2.6vw, 30px)",
            color: "#15130F",
          }}
        >
          All ready-made tees
        </h2>
        <ShopGrid id="all" />
      </main>
    </div>
  );
}
