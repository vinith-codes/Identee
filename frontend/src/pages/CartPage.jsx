// Route this at: <Route path="/cart" element={<CartPage />} />

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCart,
  updateCartItemQty,
  removeCartItem,
} from "../redux/slices/cartWishlistSlice";
import { imageUrl } from "../utils/imageUrl";


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
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        Your cart is empty.
      </div>
    );
  }

  const total = cartItems.reduce((sum, item) => sum + item.price, 0);

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

        {cartItems.map((item, i) => {
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

