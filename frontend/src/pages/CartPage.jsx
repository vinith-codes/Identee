// Route this at: <Route path="/cart" element={<CartPage />} />

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCart,
  updateCartItemQty,
  removeCartItem,
} from "../redux/slices/cartWishlistSlice";
import { imageUrl } from "../utils/imageUrl";
import EmptyState from "../components/EmptyState";
import { useShopOpen } from "../utils/shopOpen";


const C = {
  bg: "#FFFFFF",
  ink: "#15130F",
  muted: "#71695B",
  border: "#ECE4D2",
  gold: "#C9A24B",
  danger: "#DC2626",
};

const qtyBtnStyle = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: "#FAFAF7",
  fontWeight: 700,
  fontSize: 14,
  color: C.ink,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const getUserInfo = () => {
  try {
    const raw = localStorage.getItem("userInfo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function CartPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { cartItems, loading } = useSelector((s) => s.cartWishlist);
  const user = getUserInfo();
  const shop = useShopOpen(); // the empty cart's words follow "Shop your IDENTEE" (coming soon or open)

  useEffect(() => {
    if (user?.token) dispatch(fetchCart(user.token));
  }, [dispatch]);

  const getMaxStock = (item) => {
    if (item.customization) return 99; // custom designs are printed to order
    const stockBySize = item.product?.productdetails?.stockBySize || [];
    const entry = stockBySize.find((s) => s.size === item.size);
    return entry ? entry.stock : 99;
  };

  const handleQtyChange = (item, delta) => {
    const maxStock = getMaxStock(item);
    const newQty = Math.min(Math.max(item.qty + delta, 1), maxStock);
    if (newQty === item.qty) return;
    dispatch(
      updateCartItemQty({
        productId: item.product?._id || null,
        cartItemId: item._id,
        size: item.size,
        qty: newQty,
        token: user.token,
      }),
    );
  };

  const handleRemove = (item) => {
    dispatch(removeCartItem({ cartItemId: item._id, token: user.token }));
  };

  // a team order goes as a whole (every size line of the design), after a Yes
  const [confirmTeam, setConfirmTeam] = useState(null); // the design's id
  const removeTeam = (g) => {
    setConfirmTeam(null);
    dispatch(updateCartItemQty({ productId: null, cartItemId: g.items[0]._id, size: g.items[0].size, qty: 0, token: user.token }));
  };

  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        Please log in to view your cart.
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        Loading…
      </div>
    );
  }
  if (cartItems.length === 0) {
    return <EmptyState title="Your cart is empty" text={shop.open ? "Create a tee of your own, or shop a finished one." : "Create a tee of your own, or one for your whole team."} />;
  }

  const total = cartItems.reduce((sum, item) => sum + item.price, 0);

  // group design lines by design (one card each); keep cart order
  const designGroups = [];
  for (const item of cartItems) {
    if (!item.customization) continue;
    const id = item.customization._id || item.customization;
    let g = designGroups.find((x) => x.design._id === id);
    if (!g) designGroups.push((g = { design: typeof item.customization === "object" ? item.customization : { _id: id }, items: [] }));
    g.items.push(item);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "40px 24px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: C.ink,
            marginBottom: 24,
          }}
        >
          My Cart
        </h1>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, margin: "-12px 0 8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: C.muted }}>
            {designGroups.length ? `${designGroups.length} design${designGroups.length === 1 ? "" : "s"} · ` : ""}
            {cartItems.reduce((n, it) => n + it.qty, 0)} pieces
          </span>
          <Link to="/customizable" style={{ fontSize: 13, fontWeight: 700, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 14px", textDecoration: "none" }}>
            + Add another design
          </Link>
        </div>

        {/* custom designs: one card per design, its sizes listed under it */}
        {designGroups.map((g) => (
          <div
            key={g.design._id}
            style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: `1px solid ${C.border}`, alignItems: "flex-start" }}
          >
            {g.design.mockups?.front ? (
              <img src={g.design.mockups.front} alt={g.design.name || "Your design"} style={{ width: 88, height: 110, borderRadius: 10, objectFit: "cover", background: "#F3F1EC" }} />
            ) : (
              <div style={{ width: 88, height: 110, borderRadius: 10, background: "#F3F1EC" }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, color: C.ink }}>{g.design.name || "Custom design"}</p>
              <p style={{ margin: "2px 0 8px", fontSize: 12.5, color: C.muted, textTransform: "capitalize" }}>
                Your design · {g.design.garmentType?.replace(/-/g, " ")} · {g.design.color?.replace(/-/g, " ")}
              </p>
              {/* a team order: one tee per player, so sizes change in the design, not here */}
              {g.design.players?.length > 0 && (
                <div style={{ padding: "2px 0 4px" }}>
                  <p style={{ margin: 0, fontSize: 13, color: C.ink }}>
                    <b>Team order · {g.design.players.length} player{g.design.players.length === 1 ? "" : "s"}</b>, each with their own name and number
                  </p>
                  <p style={{ margin: "2px 0 6px", fontSize: 12.5, color: C.muted }}>
                    {g.design.players.slice(0, 6).map((p) => [p.number, p.name].filter(Boolean).join(" ")).join(", ")}
                    {g.design.players.length > 6 ? ` and ${g.design.players.length - 6} more` : ""}
                  </p>
                  {g.items.map((item) => (
                    <div key={item._id} style={{ display: "flex", gap: 10, padding: "2px 0", fontSize: 13 }}>
                      <span style={{ color: C.ink, fontWeight: 700, minWidth: 34 }}>{item.size}</span>
                      <span style={{ color: C.muted }}>× {item.qty}</span>
                      <span style={{ marginLeft: "auto", fontWeight: 700, color: C.ink }}>₹ {item.price}</span>
                    </div>
                  ))}
                  {confirmTeam === g.design._id ? (
                    <div role="group" aria-label="Remove this team order?" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12.5 }}>
                      <span style={{ color: C.ink }}>Remove all {g.items.reduce((n, it) => n + (it.qty || 0), 0)} tees of this team order?</span>
                      <button type="button" onClick={() => removeTeam(g)}
                        style={{ border: 0, borderRadius: 999, padding: "5px 12px", background: C.danger, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                        Yes, remove
                      </button>
                      <button type="button" onClick={() => setConfirmTeam(null)}
                        style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 12px", background: "#fff", color: C.ink, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmTeam(g.design._id)}
                      style={{ background: "none", border: "none", color: C.danger, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: 4 }}>
                      Remove this team order
                    </button>
                  )}
                </div>
              )}
              {!g.design.players?.length && g.items.map((item) => (
                <div key={item._id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 700, minWidth: 34 }}>{item.size}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button type="button" disabled={item.qty <= 1} onClick={() => handleQtyChange(item, -1)} aria-label={`One less ${item.size}`}
                      style={{ ...qtyBtnStyle, opacity: item.qty <= 1 ? 0.5 : 1, cursor: item.qty <= 1 ? "not-allowed" : "pointer" }}>−</button>
                    <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700, fontSize: 13 }}>{item.qty}</span>
                    <button type="button" onClick={() => handleQtyChange(item, 1)} aria-label={`One more ${item.size}`} style={qtyBtnStyle}>+</button>
                  </div>
                  <button type="button" onClick={() => handleRemove(item)}
                    style={{ background: "none", border: "none", color: C.danger, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                    Remove
                  </button>
                  <span style={{ marginLeft: "auto", fontWeight: 700, color: C.ink }}>₹ {item.price}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5 }}>
                <Link to={`/customize/${g.design.garmentType}?design=${g.design._id}`} style={{ color: C.gold, fontWeight: 700 }}>
                  {g.design.orderedAt ? "Edit as a new design" : g.design.players?.length ? "Edit design / players" : "Edit design / add sizes"}
                </Link>
                <span style={{ color: C.muted }}>
                  {g.items.reduce((n, it) => n + it.qty, 0)} pcs · ₹ {g.items.reduce((n, it) => n + it.price, 0)}
                </span>
              </div>
            </div>
          </div>
        ))}

        {cartItems.filter((item) => !item.customization).map((item, i) => {
          const maxStock = getMaxStock(item);
          return (
            <div
              key={item._id || i}
              style={{
                display: "flex",
                gap: 16,
                padding: "16px 0",
                borderBottom: `1px solid ${C.border}`,
                alignItems: "center",
              }}
            >
              {(item.product?.images?.[0] || item.customization?.mockups?.front) && (
                <img
                  src={item.customization ? item.customization.mockups.front : imageUrl(item.product.images[0])}
                  alt={item.customization ? item.customization.name || "Your design" : item.product.brandname}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    objectFit: "cover",
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                {item.customization ? (
                  <>
                    <p style={{ margin: 0, fontWeight: 600, color: C.ink }}>
                      {item.customization.name || "Custom design"}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.muted, textTransform: "capitalize" }}>
                      Your design · {item.customization.garmentType?.replace(/-/g, " ")} · {item.customization.color?.replace(/-/g, " ")} ·{" "}
                      <Link to={`/customize/${item.customization.garmentType}?design=${item.customization._id}`} style={{ color: C.gold, fontWeight: 600 }}>
                        Edit design
                      </Link>
                    </p>
                  </>
                ) : (
                  <p style={{ margin: 0, fontWeight: 600, color: C.ink }}>
                    {item.product?.brandname}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 6,
                  }}
                >
                  <span style={{ fontSize: 13, color: C.muted }}>
                    Size: {item.size}
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <button
                      type="button"
                      disabled={item.qty <= 1}
                      onClick={() => handleQtyChange(item, -1)}
                      style={{
                        ...qtyBtnStyle,
                        opacity: item.qty <= 1 ? 0.5 : 1,
                        cursor: item.qty <= 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        minWidth: 18,
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      disabled={item.qty >= maxStock}
                      onClick={() => handleQtyChange(item, 1)}
                      style={{
                        ...qtyBtnStyle,
                        opacity: item.qty >= maxStock ? 0.5 : 1,
                        cursor:
                          item.qty >= maxStock ? "not-allowed" : "pointer",
                      }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.danger,
                      fontSize: 12,
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0,
                      marginLeft: 4,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p style={{ fontWeight: 700, color: C.ink }}>₹ {item.price}</p>
            </div>
          );
        })}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "20px 0",
            fontWeight: 700,
            color: C.ink,
            fontSize: 18,
          }}
        >
          <span>Total</span>
          <span>₹ {total}</span>
        </div>

        <button
          onClick={() => navigate("/checkout")}
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            padding: "14px 0",
            borderRadius: 999,
            background: C.ink,
            color: "#FFFFFF",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          PROCEED TO CHECKOUT
        </button>

        <Link
          to="/"
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 12,
            padding: "14px 0",
            borderRadius: 999,
            background: C.gold,
            color: C.ink,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          CONTINUE SHOPPING
        </Link>
      </div>
    </div>
  );
}

