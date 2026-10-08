import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import ProductReviews from "../components/ProductReviews";
import { imageUrl } from "../utils/imageUrl";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function useSWRProduct(id) {
  const [state, setState] = useState({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState({ data: null, isLoading: true, error: null });

    fetch(`${BACKEND_URL}/api/products/${id}/full`)
      .then((res) => {
        if (!res.ok) throw new Error("Product not found");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setState({ data: json, isLoading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, isLoading: false, error: err });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}

const C = {
  bg: "#FFFFFF",
  ink: "#15130F",
  muted: "#71695B",
  border: "#ECE4D2",
  gold: "#C9A24B",
  goldSoft: "#C9A24B14",
  danger: "#B3432B",
};

const SIZE_ORDER = ["S", "M", "L", "XL", "XXL"];

const qtyBtnStyle = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  color: C.ink,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

// Mirrors customizerCatalogController.js's slugify exactly, so the
// key/color built here always matches a real /api/customizer/styles
// entry — every product qualifies, no curated map, no restriction.
function slugify(str = "") {
  return str.toLowerCase().trim().replace(/\s+/g, "-");
}

export default function SingleProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);

  const { data, isLoading, error } = useSWRProduct(id);

  const [activeVariantId, setActiveVariantId] = useState(id);
  const [selectedSize, setSelectedSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [mainImageIdx, setMainImageIdx] = useState(0);
  const [cartMsg, setCartMsg] = useState(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [lensPos, setLensPos] = useState({ x: 0, y: 0 });
  const [isFavorite, setIsFavorite] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  useEffect(() => {
    setActiveVariantId(id);
    setSelectedSize(null);
    setQty(1);
    setMainImageIdx(0);
  }, [id]);

  const variants = data?.variants || [];
  const activeVariant = useMemo(
    () => variants.find((v) => v._id === activeVariantId) || data?.product,
    [variants, activeVariantId, data],
  );

  useEffect(() => {
    if (!user || !activeVariant?._id) return;
    const authToken = user?.token;
    fetch(`${BACKEND_URL}/api/users/getfavorites`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => res.json())
      .then((favs) => {
        const found = Array.isArray(favs)
          ? favs.some((f) => f._id === activeVariant._id)
          : false;
        setIsFavorite(found);
      })
      .catch(() => {});
  }, [user, activeVariant?._id]);

  if (isLoading) {
    return (
      <PageShell>
        <p style={{ color: C.muted }}>Loading product…</p>
      </PageShell>
    );
  }
  if (error || !data?.product) {
    return (
      <PageShell>
        <p style={{ color: C.danger }}>
          Couldn't load this product. It may have been removed.
        </p>
      </PageShell>
    );
  }

  const images = activeVariant?.images || [];
  const stockBySize = activeVariant?.productdetails?.stockBySize || [];
  const stockMap = Object.fromEntries(
    stockBySize.map((s) => [s.size, s.stock]),
  );
  const availableSizes = SIZE_ORDER.filter((s) => s in stockMap);
  const selectedStock = selectedSize ? stockMap[selectedSize] || 0 : 0;
  const totalSelectedQty = selectedSize ? qty : 0;

  // Customizer is now gated ONLY on stock — not on any garment-photo /
  // curated-mapping availability check. Every product with stock in any
  // size can be customized.
  const hasAnyStock = availableSizes.some((s) => (stockMap[s] || 0) > 0);
  const customizerStyle = slugify(
    activeVariant.productdetails?.garmentStyle || "",
  );
  const customizerColor = slugify(activeVariant.productdetails?.color || "");

  const handleSelectSize = (size) => {
    const stock = stockMap[size] || 0;
    if (stock <= 0) return;
    setSelectedSize(size);
    setQty(1);
    setCartMsg(null);
  };

  const incrementQty = () => {
    if (!selectedSize) return;
    setQty((prev) => (prev >= selectedStock ? prev : prev + 1));
    setCartMsg(null);
  };

  const decrementQty = () => {
    setQty((prev) => (prev <= 1 ? prev : prev - 1));
    setCartMsg(null);
  };

  const handleSwitchVariant = (variantId) => {
    setActiveVariantId(variantId);
    setMainImageIdx(0);
    setSelectedSize(null);
    setQty(1);
    setCartMsg(null);
    navigate(`/product/${variantId}`, { replace: true });
  };

  // Only stock blocks customization now. The style/color slug is built
  // client-side (same slugify as customizerCatalogController.js) so it
  // always resolves to a real /api/customizer/styles/:style/colors/:slug
  // entry — no dependency on the separate, more restrictive
  // garmentStyleToKey/colorNameToSlug mapping used elsewhere in the app.
  const handleCustomize = () => {
    if (!hasAnyStock) {
      setCartMsg({
        type: "error",
        text: "This product is currently out of stock.",
      });
      return;
    }
    navigate(`/customize/${customizerStyle}?color=${customizerColor}`);
  };

  const LENS_SIZE = 160;

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const lensX = Math.min(
      Math.max(x - LENS_SIZE / 2, 0),
      rect.width - LENS_SIZE,
    );
    const lensY = Math.min(
      Math.max(y - LENS_SIZE / 2, 0),
      rect.height - LENS_SIZE,
    );
    setLensPos({ x: lensX, y: lensY });

    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;
    setZoomPos({ x: percentX, y: percentY });
  };

  const handleToggleFavorite = async () => {
    if (!user) {
      setCartMsg({ type: "error", text: "Please log in to use favorites." });
      return;
    }
    setFavLoading(true);
    try {
      const authToken = user?.token;
      const res = await fetch(
        `${BACKEND_URL}/api/users/favorites/${activeVariant._id}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.message || "Failed to update favorites");
      setIsFavorite((prev) => !prev);
    } catch (err) {
      setCartMsg({
        type: "error",
        text: err.message || "Something went wrong.",
      });
    } finally {
      setFavLoading(false);
    }
  };

  const handleBuyNow = () => {
    if (!selectedSize || qty <= 0) {
      setCartMsg({ type: "error", text: "Please select a size." });
      return;
    }
    if (!user) {
      setCartMsg({ type: "error", text: "Please log in to buy this item." });
      return;
    }
    navigate(`/buy-now/${activeVariant._id}`, {
      state: {
        product: activeVariant,
        items: [{ size: selectedSize, qty }],
      },
    });
  };

  const handleAddToCart = async () => {
    if (!selectedSize || qty <= 0) {
      setCartMsg({ type: "error", text: "Please select a size." });
      return;
    }
    if (!user) {
      setCartMsg({
        type: "error",
        text: "Please log in to add items to your cart.",
      });
      return;
    }

    setAddingToCart(true);
    setCartMsg(null);
    try {
      const authToken = user?.token;
      const res = await fetch(
        `${BACKEND_URL}/api/products/${activeVariant._id}/addtocart`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ qty, size: selectedSize, action: "set" }),
        },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          json.message || `Could not add size ${selectedSize} to cart`,
        );
      setCartMsg({ type: "ok", text: "Added to cart." });
      setQty(1);
    } catch (err) {
      setCartMsg({
        type: "error",
        text: err.message || "Something went wrong.",
      });
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <PageShell>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
          gap: 48,
        }}
        className="spp-grid"
      >
        {/* ── Images ───────────────────────────────────────────── */}
        <div style={{ position: "relative" }}>
          <div
            onMouseEnter={() => setIsZooming(true)}
            onMouseLeave={() => setIsZooming(false)}
            onMouseMove={handleMouseMove}
            style={{
              position: "relative",
              aspectRatio: "1/1",
              background: "#F3F1EC",
              borderRadius: 16,
              overflow: "hidden",
              border: `1px solid ${C.border}`,
              cursor: "crosshair",
            }}
          >
            {images[mainImageIdx] && (
              <img
                src={imageUrl(images[mainImageIdx])}
                alt={activeVariant.brandname}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                draggable={false}
              />
            )}

            {isZooming && images[mainImageIdx] && (
              <div
                style={{
                  position: "absolute",
                  top: lensPos.y,
                  left: lensPos.x,
                  width: LENS_SIZE,
                  height: LENS_SIZE,
                  background: "rgba(255, 255, 255, 0.1)",
                  border: `2px dashed ${C.gold}`,
                  borderRadius: 10,
                  pointerEvents: "none",
                  boxShadow: "0 0 0 9999px rgba(21,19,15,0.25) inset",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    border: `1.5px solid ${C.gold}`,
                    background: C.bg,
                  }}
                />
              </div>
            )}
          </div>

          {isZooming && images[mainImageIdx] && (
            <div
              className="spp-zoom-panel"
              style={{
                position: "absolute",
                top: 0,
                left: "calc(100% + 20px)",
                width: "60%",
                aspectRatio: "1/1",
                borderRadius: 14,
                border: `1px solid ${C.ink}`,
                boxShadow: "0 12px 32px rgba(21,19,15,0.18)",
                backgroundImage: `url(${imageUrl(images[mainImageIdx])})`,
                backgroundSize: "220%",
                backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
                backgroundRepeat: "no-repeat",
                zIndex: 20,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 6,
                  border: "1.5px dashed rgba(255,255,255,0.55)",
                  borderRadius: 8,
                  pointerEvents: "none",
                }}
              />
            </div>
          )}

          {images.length > 1 && (
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              {images.map((img, i) => (
                <button
                  key={img + i}
                  onClick={() => setMainImageIdx(i)}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    overflow: "hidden",
                    padding: 0,
                    cursor: "pointer",
                    background: "#F3F1EC",
                    border:
                      i === mainImageIdx
                        ? `2px solid ${C.gold}`
                        : `1px solid ${C.border}`,
                  }}
                >
                  <img
                    src={imageUrl(img)}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Details ──────────────────────────────────────────── */}
        <div>
          <h1
            style={{ margin: 0, fontSize: 30, fontWeight: 700, color: C.ink }}
          >
            {activeVariant.brandname}
          </h1>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginTop: 10,
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>
              ₹ {activeVariant.price}
            </span>
            {activeVariant.oldPrice > activeVariant.price && (
              <>
                <span
                  style={{
                    fontSize: 16,
                    color: C.muted,
                    textDecoration: "line-through",
                  }}
                >
                  ₹{activeVariant.oldPrice}
                </span>
                {activeVariant.discount > 0 && (
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: C.gold }}
                  >
                    {activeVariant.discount}% off
                  </span>
                )}
              </>
            )}
          </div>

          <hr
            style={{
              border: "none",
              borderTop: `1px solid ${C.border}`,
              margin: "20px 0",
            }}
          />

          {/* Colour */}
          <p style={sectionLabelStyle}>SELECT COLOR</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {variants.map((v) => (
              <button
                key={v._id}
                onClick={() => handleSwitchVariant(v._id)}
                title={v.productdetails?.color}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#F3F1EC",
                    border:
                      v._id === activeVariant._id
                        ? `2px solid ${C.gold}`
                        : `1px solid ${C.border}`,
                  }}
                >
                  {v.images?.[0] && (
                    <img
                      src={imageUrl(v.images[0])}
                      alt={v.productdetails?.color}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: v._id === activeVariant._id ? C.ink : C.muted,
                    fontWeight: v._id === activeVariant._id ? 700 : 400,
                    maxWidth: 70,
                    textAlign: "center",
                  }}
                >
                  {v.productdetails?.color}
                </span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
            SELECTED COLOR:{" "}
            <strong style={{ color: C.ink }}>
              {activeVariant.productdetails?.color}
            </strong>
          </p>

          <hr
            style={{
              border: "none",
              borderTop: `1px solid ${C.border}`,
              margin: "20px 0",
            }}
          />

          {/* Size */}
          <p style={sectionLabelStyle}>SELECT SIZE</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {SIZE_ORDER.map((size) => {
              const stock = stockMap[size] || 0;
              const inStock = stock > 0;
              const isSelected = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  disabled={!inStock}
                  onClick={() => handleSelectSize(size)}
                  title={!inStock ? "Out of stock" : `${stock} left`}
                  style={{
                    minWidth: 48,
                    height: 44,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? C.gold : C.border}`,
                    background: isSelected ? C.goldSoft : "#fff",
                    color: !inStock ? C.muted : C.ink,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: inStock ? "pointer" : "not-allowed",
                    opacity: inStock ? 1 : 0.45,
                    textDecoration: !inStock ? "line-through" : "none",
                  }}
                >
                  {size}
                </button>
              );
            })}
          </div>
          {selectedSize && (
            <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
              {selectedStock} left in size{" "}
              <strong style={{ color: C.ink }}>{selectedSize}</strong>
            </p>
          )}

          <p style={{ ...sectionLabelStyle, marginTop: 20 }}>QUANTITY</p>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              type="button"
              disabled={!selectedSize || qty <= 1}
              onClick={decrementQty}
              style={{
                ...qtyBtnStyle,
                width: 34,
                height: 34,
                cursor: !selectedSize || qty <= 1 ? "not-allowed" : "pointer",
                opacity: !selectedSize || qty <= 1 ? 0.5 : 1,
              }}
            >
              −
            </button>
            <span
              style={{ minWidth: 24, textAlign: "center", fontWeight: 700 }}
            >
              {selectedSize ? qty : 0}
            </span>
            <button
              type="button"
              disabled={!selectedSize || qty >= selectedStock}
              onClick={incrementQty}
              style={{
                ...qtyBtnStyle,
                width: 34,
                height: 34,
                cursor:
                  !selectedSize || qty >= selectedStock
                    ? "not-allowed"
                    : "pointer",
                opacity: !selectedSize || qty >= selectedStock ? 0.5 : 1,
              }}
            >
              +
            </button>
          </div>

          <hr
            style={{
              border: "none",
              borderTop: `1px solid ${C.border}`,
              margin: "20px 0",
            }}
          />

          {activeVariant.sizeChart && (
            <button
              type="button"
              onClick={() =>
                window.open(
                  imageUrl(activeVariant.sizeChart),
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 999,
                border: `1px solid ${C.border}`,
                background: "#fff",
                textDecoration: "none",
                color: C.ink,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 20,
                cursor: "pointer",
              }}
            >
              📏 Size Chart
            </button>
          )}

          {cartMsg && (
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: cartMsg.type === "ok" ? "#3E7C4A" : C.danger,
                marginBottom: 12,
              }}
            >
              {cartMsg.text}
            </p>
          )}

          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <button
              onClick={handleToggleFavorite}
              disabled={favLoading}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              style={{
                width: 50,
                height: 50,
                borderRadius: "50%",
                border: `2px solid ${isFavorite ? C.danger : C.border}`,
                background: isFavorite ? `${C.danger}14` : "#fff",
                color: isFavorite ? C.danger : C.muted,
                fontSize: 20,
                cursor: favLoading ? "wait" : "pointer",
                flexShrink: 0,
              }}
            >
              {isFavorite ? "♥" : "♡"}
            </button>

            {/* Gated on stock only — every in-stock product can be
                customized. customizerStyle/customizerColor are built
                client-side to match customizerCatalogController.js's
                slugify exactly. */}
            <button
              onClick={handleCustomize}
              disabled={!hasAnyStock}
              title={!hasAnyStock ? "Out of stock" : undefined}
              style={{
                flex: 1,
                padding: "14px 0",
                borderRadius: 999,
                background: hasAnyStock ? "#1A2A4A" : "#B7BDC9",
                color: "#fff",
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: hasAnyStock ? "pointer" : "not-allowed",
              }}
            >
              {hasAnyStock ? "CUSTOMIZE" : "COMING SOON"}
            </button>
            <button
              onClick={handleAddToCart}
              disabled={addingToCart || totalSelectedQty === 0}
              style={{
                flex: 1,
                padding: "14px 0",
                borderRadius: 999,
                background: "#fff",
                color: "#1A2A4A",
                border: "2px solid #1A2A4A",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor:
                  addingToCart || totalSelectedQty === 0
                    ? "not-allowed"
                    : "pointer",
                opacity: addingToCart || totalSelectedQty === 0 ? 0.6 : 1,
              }}
            >
              {addingToCart ? "ADDING…" : "ADD TO CART"}
            </button>
          </div>

          <button
            onClick={handleBuyNow}
            disabled={totalSelectedQty === 0}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "14px 0",
              borderRadius: 999,
              background: C.gold,
              color: C.ink,
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor: totalSelectedQty === 0 ? "not-allowed" : "pointer",
              opacity: totalSelectedQty === 0 ? 0.6 : 1,
            }}
          >
            BUY NOW
          </button>

          <p style={{ marginTop: 24 }}>
            <Link
              to="/"
              style={{
                fontSize: 12,
                color: C.muted,
                textDecoration: "underline",
              }}
            >
              ← Back to shopping
            </Link>
          </p>
        </div>
      </div>

      {/* ── Reviews ──────────────────────────────────────────── */}
      <ProductReviews product={activeVariant} />

      <style>{`
        @media (max-width: 860px) {
          .spp-grid { grid-template-columns: 1fr !important; }
          .spp-zoom-panel { display: none !important; }
        }
      `}</style>
    </PageShell>
  );
}

function PageShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "40px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

const sectionLabelStyle = {
  fontSize: 12,
  letterSpacing: "0.12em",
  color: "#15130F",
  textTransform: "uppercase",
  fontWeight: 700,
  marginBottom: 12,
};
