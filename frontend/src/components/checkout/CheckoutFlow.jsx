import { useState, useEffect } from "react";
import { THEME } from "../../theme/theme";
import CheckoutStepper from "./CheckoutStepper";
import AddressStep from "./AddressStep";
import OrderSummaryStep from "./OrderSummaryStep";
import PaymentStep from "./PaymentStep";

// items/buyNow are optional overrides for the "Buy Now" flow.
// Leave both undefined for normal cart checkout (falls back to redux cart).
export default function CheckoutFlow({ items: itemsProp, buyNow: buyNowProp }) {
  const [step, setStep] = useState(1);
  const [shippingAddress, setShippingAddress] = useState(null);
  const [coupon, setCoupon] = useState(null);

  // Local, editable copy of the Buy Now items — this is what lets the +/−
  // quantity controls in OrderSummaryStep actually change something. Cart
  // checkout (itemsProp undefined) is untouched — OrderSummaryStep/
  // PaymentStep still fall back to the redux cart in that case.
  const [items, setItems] = useState(itemsProp || null);

  useEffect(() => {
    setItems(itemsProp || null);
  }, [itemsProp]);

  // What the server should price (it never trusts client prices). Rebuilt
  // from the editable items so the quote always matches what's on screen.
  //   product:       { productId, items: [{ size, qty }] }
  //   custom design: { customizationId, qty, size }
  const buyNow = !buyNowProp
    ? null
    : buyNowProp.isCustomization
      ? {
          customizationId: buyNowProp.productId,
          qty: items
            ? items.reduce((sum, it) => sum + it.qty, 0)
            : buyNowProp.qty,
          size: items?.[0]?.size || "Custom",
        }
      : {
          productId: buyNowProp.productId,
          items: (items || []).map((it) => ({ size: it.size, qty: it.qty })),
        };

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
