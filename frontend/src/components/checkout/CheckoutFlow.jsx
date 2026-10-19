import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { THEME } from "../../theme/theme";
import { fetchCart } from "../../redux/slices/cartWishlistSlice";
import EmptyState from "../EmptyState";
import CheckoutStepper from "./CheckoutStepper";
import AddressStep from "./AddressStep";
import OrderSummaryStep from "./OrderSummaryStep";
import PaymentStep from "./PaymentStep";

// items/buyNow are optional overrides for the "Buy Now" flow.
// Leave both undefined for normal cart checkout (falls back to redux cart).
// The address and coupon survive a reload (this browser tab only); the step lives in the URL (?step=2), so the
// browser's Back button goes to the previous step instead of leaving checkout. Buy Now isn't kept: its items
// come with the page and are gone after a reload anyway.
const SAVE_KEY = "identee:checkout:v1";
const readSaved = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null") || {};
  } catch {
    return {};
  }
};

export default function CheckoutFlow({ items: itemsProp, buyNow: buyNowProp }) {
  const [params, setParams] = useSearchParams();
  const [saved] = useState(() => (itemsProp ? {} : readSaved()));
  const [shippingAddress, setShippingAddress] = useState(saved.shippingAddress || null);
  const [coupon, setCoupon] = useState(saved.coupon || null);
  const wanted = Math.min(3, Math.max(1, Number(params.get("step")) || 1));
  const step = wanted >= 2 && !shippingAddress ? 1 : wanted; // a later step needs the address first
  const setStep = (n) =>
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set("step", String(n));
      return q;
    });
  useEffect(() => {
    if (itemsProp) return;
    try {
      sessionStorage.setItem(SAVE_KEY, JSON.stringify({ shippingAddress, coupon }));
    } catch {
      /* storage blocked: the form just starts over after a reload */
    }
  }, [itemsProp, shippingAddress, coupon]);

  // Local, editable copy of the Buy Now items — this is what lets the +/−
  // quantity controls in OrderSummaryStep actually change something. Cart
  // checkout (itemsProp undefined) is untouched — OrderSummaryStep/
  // PaymentStep still fall back to the redux cart in that case.
  const [items, setItems] = useState(itemsProp || null);

  useEffect(() => {
    setItems(itemsProp || null);
  }, [itemsProp]);

  // Cart checkout: load the cart fresh, and with nothing in it show a way back
  // to the shop instead of the address form.
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth?.user?.token);
  const cartCount = useSelector((s) => s.cartWishlist?.cartItems?.length || 0);
  const [cartChecked, setCartChecked] = useState(false);
  useEffect(() => {
    if (itemsProp || !token) return;
    Promise.resolve(dispatch(fetchCart(token))).finally(() => setCartChecked(true));
  }, [itemsProp, token, dispatch]);
  const emptyCart = !itemsProp && cartChecked && cartCount === 0 && step < 3;

  // What the server should price (it never trusts client prices). Rebuilt
  // from the editable items so the quote always matches what's on screen.
  //   product:       { productId, items: [{ size, qty }] }
  //   custom design: { customizationId, items: [{ size, qty }] } (one design, many sizes)
  const buyNow = !buyNowProp
    ? null
    : buyNowProp.isCustomization
      ? {
          customizationId: buyNowProp.productId,
          items: (items || []).map((it) => ({ size: it.size, qty: it.qty })),
        }
      : {
          productId: buyNowProp.productId,
          items: (items || []).map((it) => ({ size: it.size, qty: it.qty })),
        };

  if (emptyCart) {
    return (
      <div style={{ minHeight: "60vh", background: THEME.bg }}>
        <EmptyState title="Nothing to check out yet" text="Your cart is empty. Add a tee to your cart, then come back here." />
      </div>
    );
  }

  return (
    <div
      style={{ minHeight: "100vh", background: THEME.bg, padding: "48px 20px" }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <CheckoutStepper currentStep={step} />

        {step === 1 && (
          <AddressStep
            selectedAddress={shippingAddress}
            onContinue={(addr) => {
              setShippingAddress(addr);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <OrderSummaryStep
            items={items}
            onItemsChange={setItems}
            shippingAddress={shippingAddress}
            onChangeAddress={() => setStep(1)}
            coupon={coupon}
            setCoupon={setCoupon}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <PaymentStep
            buyNow={buyNow}
            shippingAddress={shippingAddress}
            coupon={coupon}
            onBack={() => setStep(2)}
          />
        )}
      </div>
    </div>
  );
}
