// Route this at: <Route path="/buy-now/:id" element={<BuyNowPage />} />

import { useLocation } from "react-router-dom";
import CheckoutFlow from "../components/checkout/CheckoutFlow";
import { THEME } from "../theme/theme";

export default function BuyNowPage() {
  const { state } = useLocation();

  if (!state?.product) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 40,
          textAlign: "center",
          color: THEME.textMuted,
        }}
      >
        No order details found. Please go back and try again.
      </div>
    );
  }

  const { product } = state;

  // Supports the new multi-size format:
  // state.items = [{ size, qty }, ...]
  // Falls back to the old single-size format:
  // state.size + state.qty
  const sizeItems =
    Array.isArray(state.items) && state.items.length > 0
      ? state.items
      : [
          {
            size: state.size,
            qty: state.qty || 1,
          },
        ];

  // Shape expected by CheckoutFlow / OrderSummaryStep / PaymentStep
  const items = sizeItems.map((si) => ({
    _id: `buynow-${product._id}-${si.size}`,
    product,
    size: si.size,
    qty: si.qty,
    price: product.price * si.qty,
  }));

  // Total quantity across all selected sizes
  const totalQty = sizeItems.reduce((sum, si) => sum + si.qty, 0);

  // Detect if this is a customized product
  // custom designs say so explicitly (they now carry a mockup picture);
  // older links had no images at all
  const isCustomization =
    state.isCustomization ?? (Array.isArray(product.images) && product.images.length === 0);

  return (
    <CheckoutFlow
      items={items}
      buyNow={{
        productId: product._id,
        qty: totalQty,
        isCustomization,
      }}
    />
  );
}
