import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
import categoryService from "../services/categoryService";
import GarmentSilhouette from "../components/GarmentSilhouette";
import { imageUrl } from "../utils/imageUrl";

// Outline shown when a category has no photo yet.
const shapeFor = (key = "") =>
  /hood/i.test(key) ? "hoodie" : /polo/i.test(key) ? "polo" : /sweat/i.test(key)
    ? "sweatshirt" : /v-?neck/i.test(key) ? "vneck" : /oversize/i.test(key) ? "tee-oversized" : "tee";

const C = {
  bg: "#FFFFFF",
  title: "#2B2560",
  ink: "#1A1A1A",
  muted: "#8C8C8C",
  border: "#ECE4D2",
};

export default function ChooseProductPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("category") || "";
  const { items: categories, status } = useSelector((s) => s.categories);
  // { [categorySlug]: garmentType[] } — garments the customizer supports
  const [garmentsByCategory, setGarmentsByCategory] = useState(null);

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  const customizable = categories.filter((c) => c.isCustomizable && !c.comingSoon);
  const customizableKey = customizable.map((c) => c.slug).join(",");

  useEffect(() => {
    if (!customizableKey) return;
    let cancelled = false;
    Promise.all(
      customizableKey.split(",").map((slug) =>
        categoryService.getCategoryGarments(slug).then((g) => [slug, g]).catch(() => [slug, []]),
      ),
    ).then((pairs) => !cancelled && setGarmentsByCategory(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [customizableKey]);

  const isLoading = status !== "succeeded" && status !== "failed"
    ? true
    : customizable.length > 0 && !garmentsByCategory;

  const availableGarments = customizable
    .filter((c) => !selected || c.slug === selected)
    .flatMap((c) =>
      (garmentsByCategory?.[c.slug] || []).map((g) => ({ ...g, categoryImage: c.image })),
    );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: C.title,
            textAlign: "center",
            margin: "0 0 48px",
          }}
        >
          CHOOSE A PRODUCT
        </h1>

        {customizable.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, margin: "-28px 0 36px" }}>
            {[{ slug: "", name: "All" }, ...customizable].map((c) => {
              const active = selected === c.slug;
              return (
                <button
                  key={c.slug || "all"}
                  type="button"
                  onClick={() => setSearchParams(c.slug ? { category: c.slug } : {}, { replace: true })}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 999,
                    border: `1px solid ${active ? C.title : C.border}`,
                    background: active ? C.title : "#fff",
                    color: active ? "#fff" : C.ink,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}

        {isLoading && (
          <p style={{ textAlign: "center", color: C.muted }}>
            Loading products…
          </p>
        )}
        {!isLoading && availableGarments.length === 0 && (
          <p style={{ textAlign: "center", color: C.muted }}>
            No products available yet.
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            columnGap: 24,
            rowGap: 40,
          }}
        >
          {availableGarments.map((g) => (
            <button
              key={g.key}
              onClick={() => navigate(`/customize/choose-color/${g.key}`)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                padding: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                transition: "transform 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1/1",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${C.border}`,
                  background: "#F7F5F0",
                }}
              >
                {g.categoryImage ? (
                  <img
                    src={imageUrl(g.categoryImage, 500)}
                    alt={g.label}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ padding: "12%" , height: "100%", boxSizing: "border-box" }}>
                    <GarmentSilhouette shape={shapeFor(g.key)} color="#2B2560" />
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.ink,
                  textAlign: "center",
                }}
              >
                {g.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
