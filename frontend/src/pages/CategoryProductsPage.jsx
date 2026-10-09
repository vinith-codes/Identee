import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import categoryService from "../services/categoryService";
import { imageUrl } from "../utils/imageUrl";

const C = {
  bg: "#FFFFFF",
  ink: "#15130F",
  muted: "#71695B",
  border: "#ECE4D2",
  gold: "#C9A24B",
  goldBright: "#F0D585",
  cream: "#FBF7EE",
  danger: "#B42318",
};

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
const PAGE_SIZE = 12;

const chip = (active) => ({
  padding: "7px 14px",
  borderRadius: 999,
  border: `1px solid ${active ? C.ink : C.border}`,
  background: active ? C.ink : "#fff",
  color: active ? "#fff" : C.ink,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const selectStyle = {
  padding: "8px 12px",
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: "#fff",
  color: C.ink,
  fontSize: 13,
};

function ProductCard({ p }) {
  const price = p.subscriptionPrice ?? p.price;
  const showOld = p.oldPrice && p.oldPrice > price;
  const colorCount = p.colors?.filter(Boolean).length || 0;
  return (
    <Link
      to={`/product/${p._id}`}
      style={{
        textDecoration: "none",
        color: C.ink,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "block",
        background: "#fff",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "4/5", background: "#F3F1EC" }}>
        {p.images?.[0] && (
          <img
            src={imageUrl(p.images[0], 500)}
            alt={p.brandname}
            loading="lazy"
            // Missing file (e.g. uploaded on another machine): show the plain tile.
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: p.inStock ? 1 : 0.55 }}
          />
        )}
        {!p.inStock && (
          <span style={{ position: "absolute", top: 10, left: 10, background: C.ink, color: "#fff", fontSize: 10, fontWeight: 800, padding: "4px 8px", borderRadius: 999 }}>
            OUT OF STOCK
          </span>
        )}
        {showOld && p.inStock && (
          <span style={{ position: "absolute", top: 10, left: 10, background: C.gold, color: C.ink, fontSize: 10, fontWeight: 800, padding: "4px 8px", borderRadius: 999 }}>
            {Math.round(((p.oldPrice - price) / p.oldPrice) * 100)}% OFF
          </span>
        )}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{p.brandname}</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted }}>
          {[p.garmentStyle, colorCount > 1 ? `${colorCount} colours` : p.color].filter(Boolean).join(" · ")}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 700 }}>
          ₹{price}
          {showOld && (
            <span style={{ marginLeft: 8, fontSize: 12, color: C.muted, textDecoration: "line-through", fontWeight: 500 }}>
              ₹{p.oldPrice}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

export default function CategoryProductsPage() {
  const { categoryName } = useParams(); // category slug (old links may pass a style name)
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const style = searchParams.get("style") || searchParams.get("subcategory") || "";
  const size = searchParams.get("size") || "";
  const sort = searchParams.get("sort") || "newest";

  const [category, setCategory] = useState(null);
  const [categoryError, setCategoryError] = useState("");
  const [result, setResult] = useState({ key: "", items: [], total: 0, pages: 0, page: 0, styles: [], sizes: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState("");

  // Category header. Old /category/Round%20Neck links redirect to the
  // real category with that style pre-selected.
  useEffect(() => {
    let cancelled = false;
    categoryService
      .getCategory(categoryName)
      .then((c) => {
        if (cancelled) return;
        if (c.slug !== categoryName) {
          const qs = new URLSearchParams(searchParams);
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

  // Products: refetch page 1 whenever the category or a filter changes.
  const queryKey = `${category?.slug}|${style}|${size}|${sort}`;
  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    categoryService
      .getCategoryProducts(category.slug, { style, size, sort, page: 1, limit: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setResult({ key: queryKey, ...data });
        setListError("");
      })
      .catch(() => !cancelled && setListError("Couldn't load products. Please try again."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await categoryService.getCategoryProducts(category.slug, {
        style, size, sort, page: result.page + 1, limit: PAGE_SIZE,
      });
      setResult((r) => ({ ...data, key: r.key, items: [...r.items, ...data.items] }));
    } catch {
      setListError("Couldn't load more products.");
    } finally {
      setLoadingMore(false);
    }
  };

  const setParam = (key, value) => {
    const qs = new URLSearchParams(searchParams);
    qs.delete("subcategory");
    if (value) qs.set(key, value);
    else qs.delete(key);
    setSearchParams(qs, { replace: true });
  };

  if (categoryError) {
    return (
      <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ color: C.ink, margin: "0 0 8px" }}>
            {categoryError === "notfound" ? "Category not found" : "Something went wrong"}
          </h1>
          <Link to="/" style={{ color: C.gold, fontWeight: 700 }}>← Back to home</Link>
        </div>
      </div>
    );
  }

  // Never show a previous category's products while the new one loads.
  const loading = !category || result.key !== queryKey;
  const header = category?.bannerImage || category?.image;

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* Header */}
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
        {header && (
          <img
            src={imageUrl(header, 1600)}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }}
          />
        )}
        <div style={{ position: "relative", maxWidth: 1280, width: "100%", margin: "0 auto", padding: "40px 24px 28px", color: "#fff" }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, opacity: 0.8 }}>
            <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Home</Link> / Shop
          </p>
          <h1 style={{ margin: "6px 0 4px", fontSize: 34, fontWeight: 800 }}>{category?.name || "…"}</h1>
          {category?.description && <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>{category.description}</p>}
          {category?.isCustomizable && (
            <button
              type="button"
              onClick={() => navigate(`/customizable?category=${category.slug}`)}
              style={{
                marginTop: 14, padding: "9px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldBright})`, color: C.ink, fontWeight: 700, fontSize: 13,
              }}
            >
              ✎ Design your own {category.name}
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 64px" }}>
        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {(result.styles.length > 1 || style) && (
              <>
                <button type="button" style={chip(!style)} onClick={() => setParam("style", "")}>All</button>
                {result.styles.map((s) => (
                  <button key={s} type="button" style={chip(style.toLowerCase() === s.toLowerCase())} onClick={() => setParam("style", s)}>
                    {s}
                  </button>
                ))}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {result.sizes.length > 0 && (
              <select aria-label="Size" value={size} onChange={(e) => setParam("size", e.target.value)} style={selectStyle}>
                <option value="">All sizes</option>
                {result.sizes.map((s) => (
                  <option key={s} value={s}>Size {s}</option>
                ))}
              </select>
            )}
            <select aria-label="Sort" value={sort} onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)} style={selectStyle}>
              {SORTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {!loading && (
          <p style={{ margin: "0 0 14px", fontSize: 13, color: C.muted }}>
            {result.total} product{result.total === 1 ? "" : "s"}
          </p>
        )}

        {listError && <p style={{ color: C.danger, fontSize: 14 }}>{listError}</p>}

        {loading && !listError ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ aspectRatio: "4/6", borderRadius: 14, background: "#F3F1EC" }} />
            ))}
          </div>
        ) : result.items.length === 0 && !listError ? (
          <div style={{ textAlign: "center", padding: "48px 16px", background: C.cream, borderRadius: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: C.ink }}>
              {style || size ? "No products match these filters" : "New styles are coming soon"}
            </p>
            {(style || size) && (
              <button type="button" onClick={() => setSearchParams({}, { replace: true })} style={{ ...chip(false), marginTop: 8 }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
            {result.items.map((p) => (
              <ProductCard key={p._id} p={p} />
            ))}
          </div>
        )}

        {!loading && result.page < result.pages && (
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <button type="button" onClick={loadMore} disabled={loadingMore} style={{ ...chip(false), padding: "10px 24px" }}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
