import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { getProducts } from "../redux/slices/productSlice";
import { imageUrl } from "../utils/imageUrl";


const C = {
  bg: "#FFFFFF",
  ink: "#15130F",
  muted: "#71695B",
  border: "#ECE4D2",
  gold: "#C9A24B",
};

// 👉 Order in which category sections should appear.
// Round Neck first, then the rest in this order.
// Anything not listed here falls to the bottom, alphabetically.
const CATEGORY_ORDER = [
  "Round Neck",
  "V Neck",
  "Oversized",
  "Hoodies",
  "Sweatshirt",
  "Polo",
];

// 👉 CHANGE THIS if your product's category field is named differently
// e.g. p.category, p.subCategory, p.productdetails?.category, etc.
const getCategoryName = (p) =>
  p.productdetails?.garmentStyle || p.category || "Others";

export default function AllProductsPage() {
  const dispatch = useDispatch();
  const { products, isLoading } = useSelector((s) => s.product);

  useEffect(() => {
    dispatch(getProducts());
  }, [dispatch]);

  // Group products by category, then sort groups by CATEGORY_ORDER
  const groupedSections = useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) return [];

    const groups = {};
    products.forEach((p) => {
      const cat = getCategoryName(p);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });

    const known = CATEGORY_ORDER.filter((cat) => groups[cat]);
    const unknown = Object.keys(groups)
      .filter((cat) => !CATEGORY_ORDER.includes(cat))
      .sort();

    return [...known, ...unknown].map((cat) => ({
      category: cat,
      items: groups[cat],
    }));
  }, [products]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "40px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
       
        <h1
          style={{
            margin: "6px 0 28px",
            fontSize: 32,
            fontWeight: 800,
            color: C.ink,
          }}
        >
          All Products
        </h1>

        {isLoading && <p style={{ color: C.muted }}>Loading products…</p>}

        {!isLoading && groupedSections.length === 0 && (
          <p style={{ color: C.muted }}>No products found yet.</p>
        )}

        {groupedSections.map((section) => (
          <div key={section.category} style={{ marginBottom: 48 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 18,
                paddingBottom: 10,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: C.ink,
                }}
              >
                {section.category}
              </h2>
              <span style={{ fontSize: 13, color: C.muted }}>
                {section.items.length} item
                {section.items.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 20,
              }}
            >
              {section.items.map((p) => (
                <Link
                  key={p._id}
                  to={`/product/${p._id}`}
                  style={{
                    textDecoration: "none",
                    color: C.ink,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    overflow: "hidden",
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      aspectRatio: "4/5",
                      background: "#F3F1EC",
                      overflow: "hidden",
                    }}
                  >
                    {p.images?.[0] && (
                      <img
                        src={imageUrl(p.images[0])}
                        alt={p.brandname}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                      {p.brandname}
                    </p>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: C.muted,
                      }}
                    >
                      {p.productdetails?.color}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 15,
                        fontWeight: 700,
                        color: C.gold,
                      }}
                    >
                      ₹{p.price}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
