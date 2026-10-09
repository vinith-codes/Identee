// pages/ReadyMadePage.jsx  —  /ready-made
//
// The ready-made categories the admin added (Admin → Storefront →
// Categories). Each tile opens that category's products.
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
import { CategoryGrid } from "../components/CategoryTile";
import ShopPageHeader from "../components/ShopPageHeader";

export default function ReadyMadePage() {
  const dispatch = useDispatch();
  const { items: categories, status } = useSelector((s) => s.categories);

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  return (
    <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
      <main
        style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 64px" }}
      >
        <ShopPageHeader
          eyebrow="Ready-made"
          title="Shop by category"
          text="Finished designs, ready to wear."
          switchTo={{ to: "/customizable", label: "Design your own instead →" }}
        />
        <CategoryGrid
          categories={categories}
          loading={status === "loading" || status === "idle"}
        />
        {status === "succeeded" && categories.length === 0 && (
          <p style={{ color: "#71695B" }}>
            Ready-made collections are coming soon.
          </p>
        )}
      </main>
    </div>
  );
}
