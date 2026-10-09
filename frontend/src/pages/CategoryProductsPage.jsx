// pages/CategoryProductsPage.jsx  —  /category/:slug
//
// One storefront category: banner header, then its ready-made products with
// filters (components/shop/ShopGrid). Old /category/<style name> links
// redirect to the real category with that style chosen.
import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import categoryService from "../services/categoryService";
import { imageUrl } from "../utils/imageUrl";
import ShopGrid from "../components/shop/ShopGrid";

const C = { ink: "#15130F", gold: "#C9A24B", goldBright: "#F0D585" };

export default function CategoryProductsPage() {
  const { categoryName } = useParams(); // category slug (old links may pass a style name)
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [category, setCategory] = useState(null);
  const [categoryError, setCategoryError] = useState("");

  useEffect(() => {
    let cancelled = false;
    categoryService
      .getCategory(categoryName)
      .then((c) => {
        if (cancelled) return;
        if (c.slug !== categoryName) {
          const qs = new URLSearchParams(searchParams);
          qs.delete("subcategory");
          if (c.matchedStyle) qs.set("style", c.matchedStyle);
          navigate(`/category/${c.slug}?${qs}`, { replace: true });
          return;
        }
        setCategory(c);
        setCategoryError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setCategory(null);
        setCategoryError(err.response?.status === 404 ? "notfound" : "error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryName]);

  if (categoryError) {
    return (
      <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ color: C.ink, margin: "0 0 8px" }}>{categoryError === "notfound" ? "Category not found" : "Something went wrong"}</h1>
          <Link to="/ready-made" style={{ color: "#7A5B12", fontWeight: 700 }}>
            ← All ready-made
          </Link>
        </div>
      </div>
    );
  }

  const header = category?.bannerImage || category?.image;
  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <div
        style={{
          position: "relative",
          minHeight: 200,
          display: "flex",
          alignItems: "flex-end",
          background: header ? C.ink : `linear-gradient(120deg, ${C.ink} 0%, #2A2620 60%, ${C.gold} 140%)`,
          overflow: "hidden",
        }}
      >
        {header && <img src={imageUrl(header, 1600)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }} />}
        <div style={{ position: "relative", maxWidth: 1280, width: "100%", margin: "0 auto", padding: "40px 20px 28px", color: "#fff" }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, opacity: 0.85 }}>
            <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Home</Link> /{" "}
            <Link to="/ready-made" style={{ color: "inherit", textDecoration: "none" }}>Ready-made</Link>
          </nav>
          <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>{category?.name || "…"}</h1>
          {category?.description && <p style={{ margin: 0, fontSize: 14.5, opacity: 0.88, maxWidth: 620 }}>{category.description}</p>}
          {category?.isCustomizable && (
            <button
              type="button"
              onClick={() => navigate(`/customizable?category=${category.slug}`)}
              style={{
                marginTop: 14, padding: "10px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldBright})`, color: C.ink, fontWeight: 700, fontSize: 13,
              }}
            >
              ✎ Design your own {category.name}
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 64px" }}>
        {category && <ShopGrid key={category.slug} category={category.slug} />}
      </div>
    </div>
  );
}
