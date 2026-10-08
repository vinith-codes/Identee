import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { THEME } from "../../theme/theme";
import checkoutService from "../../services/checkoutService";
import orderService from "../../services/orderService";
import { fetchCart } from "../../redux/slices/cartWishlistSlice";

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const PAYMENT_METHODS = [
  { key: "UPI", label: "UPI", desc: "Pay by any UPI app", icon: "📱" },
  {
    key: "CARD",
    label: "Credit / Debit / ATM Card",
    desc: "Add and secure cards as per RBI guidelines",
    icon: "💳",
  },
  {
    key: "COD",
    label: "Cash on Delivery",
    desc: "Pay when your order arrives",
    icon: "💵",
  },
];

function PriceRow({ label, value, bold, negative }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: bold ? THEME.text : THEME.textMuted,
          fontWeight: bold ? 700 : 400,
          fontFamily: THEME.fontBody,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: bold ? 16 : 13,
          color: negative ? THEME.gold : bold ? THEME.goldDeep : THEME.text,
          fontWeight: bold ? 700 : 500,
          fontFamily: THEME.fontBody,
        }}
      >
        {negative ? "− " : ""}₹{value}
      </span>
    </div>
  );
}

// buyNow: optional server-side description of a Buy Now purchase
//   { productId, items: [{ size, qty }] } | { customizationId, qty, size }
// (built by CheckoutFlow). Without it the server prices the user's cart.
// Prices are never sent from here — the server computes every amount.
export default function PaymentStep({ shippingAddress, coupon, onBack, buyNow }) {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quoteError, setQuoteError] = useState("");
  const [method, setMethod] = useState("UPI");
  const [placing, setPlacing] = useState(false);

  const checkout = {
    shippingAddress,
    couponCode: coupon?.code || null,
    buyNow: buyNow || undefined,
  };

  useEffect(() => {
    const fetchQuote = async () => {
      setLoadingQuote(true);
      setQuoteError("");
      try {
        setQuote(await checkoutService.getQuote(checkout, user.token));
      } catch (error) {
        setQuoteError(
          error.response?.data?.message || "Couldn't calculate order total",
        );
      } finally {
        setLoadingQuote(false);
      }
    };
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOrderPlaced = (order) => {
    if (!buyNow) dispatch(fetchCart(user.token)); // server emptied the cart
    toast.success("Order placed successfully!");
    navigate(`/order-success/${order._id}`);
  };

  const placeCodOrder = async () => {
    setPlacing(true);
    try {
      const order = await orderService.createOrder(
        { ...checkout, paymentMethod: "COD" },
        user.token,
      );
      onOrderPlaced(order);
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          "Couldn't place order. Please try again.",
      );
    } finally {
      setPlacing(false);
    }
  };

  const placeOnlineOrder = async () => {
    setPlacing(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error("Failed to load payment gateway. Check your connection.");
        setPlacing(false);
        return;
      }

      // Server re-prices, checks stock and remembers this checkout.
      const rzpOrder = await checkoutService.createRazorpayOrder(
        checkout,
        user.token,
      );

      const options = {
        key: rzpOrder.keyId,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        name: "IDENTEE",
        description: "Order Payment",
        order_id: rzpOrder.id,
        handler: async (response) => {
          try {
            // Server verifies with Razorpay and creates the order.
            const order = await checkoutService.verifyRazorpayPayment(
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              user.token,
            );
            onOrderPlaced(order);
          } catch (err) {
            toast.error(
              err.response?.data?.message ||
                "We received your payment but couldn't confirm the order yet. It will appear in My Orders shortly — contact support if it doesn't.",
              { autoClose: 10000 },
            );
          } finally {
            setPlacing(false);
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: shippingAddress?.phoneNumber,
        },
        theme: { color: "#C9A24B" },
        modal: { ondismiss: () => setPlacing(false) },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Couldn't initiate payment. Please try again.",
      );
      setPlacing(false);
    }
  };

  const handlePlaceOrder = () => {
    if (!quote) return;
    if (method === "COD") placeCodOrder();
    else placeOnlineOrder();
  };

  return (
    <div
      className="payment-step-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 300px",
        gap: 20,
        alignItems: "start",
      }}
    >
      <style>{`
        @media (max-width: 900px) {
          .payment-step-grid {
            grid-template-columns: 1fr !important;
          }
          .payment-sidebar {
            position: static !important;
            order: -1;
          }
        }
        @media (max-width: 480px) {
          .payment-method-label {
            padding: 12px 12px !important;
            gap: 10px !important;
          }
          .payment-method-label p {
            font-size: 13px !important;
          }
        }
      `}</style>
      <div
        style={{
          background: THEME.surface,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          padding: 24,
          boxShadow: THEME.shadow,
        }}
      >
        <h2
          style={{
            margin: "0 0 18px",
            fontSize: 18,
            fontWeight: 600,
            fontFamily: THEME.fontDisplay,
            color: THEME.text,
          }}
        >
          Payment Method
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PAYMENT_METHODS.map((pm) => (
            <label
              key={pm.key}
              className="payment-method-label"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                border: `1.5px solid ${method === pm.key ? THEME.gold : THEME.border}`,
                background: method === pm.key ? THEME.goldBg : THEME.surface2,
                borderRadius: 10,
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="paymentMethod"
                checked={method === pm.key}
                onChange={() => setMethod(pm.key)}
                style={{ accentColor: THEME.gold }}
              />
              <span style={{ fontSize: 18 }}>{pm.icon}</span>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 600,
                    fontSize: 14,
                    color: THEME.text,
                    fontFamily: THEME.fontBody,
                  }}
                >
                  {pm.label}
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: THEME.textMuted,
                    fontFamily: THEME.fontBody,
                  }}
                >
                  {pm.desc}
                </p>
              </div>
            </label>
          ))}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: `1.5px solid ${THEME.border}`,
              borderRadius: 10,
              padding: "14px 16px",
              opacity: 0.5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>🗓️</span>
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  fontSize: 14,
                  color: THEME.text,
                  fontFamily: THEME.fontBody,
                }}
              >
                EMI
              </p>
            </div>
            <span
              style={{
                fontSize: 12,
                color: THEME.textMuted,
                fontFamily: THEME.fontBody,
              }}
            >
              Unavailable
            </span>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "11px 24px",
              borderRadius: 8,
              border: `1px solid ${THEME.border}`,
              background: THEME.surface,
              color: THEME.textMuted,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: THEME.fontBody,
            }}
          >
            ← Back to Order Summary
          </button>
        </div>
      </div>

      <div
        className="payment-sidebar"
        style={{
          position: "sticky",
          top: 20,
          background: THEME.surface,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          padding: 22,
          boxShadow: THEME.shadow,
        }}
      >
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 12,
            fontWeight: 700,
            color: THEME.gold,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Price Details
        </p>

        {loadingQuote && (
          <p
            style={{
              color: THEME.textMuted,
              fontFamily: THEME.fontBody,
              fontSize: 13,
            }}
          >
            Calculating total…
          </p>
        )}
        {quoteError && (
          <p
            style={{
              color: THEME.danger,
              fontSize: 13,
              fontFamily: THEME.fontBody,
            }}
          >
            {quoteError}
          </p>
        )}

        {quote && (
          <>
            <PriceRow label="Subtotal" value={quote.priceBreakdown.subtotal} />
            <PriceRow
              label="CGST (2.5%)"
              value={quote.priceBreakdown.cgstAmount}
            />
            <PriceRow
              label="SGST (2.5%)"
              value={quote.priceBreakdown.sgstAmount}
            />
            {quote.priceBreakdown.discountAmount > 0 && (
              <PriceRow
                label={`Discount (${quote.coupon?.code})`}
                value={quote.priceBreakdown.discountAmount}
                negative
              />
            )}
            <PriceRow
              label="Shipping Fee"
              value={quote.priceBreakdown.shippingAmount}
            />
            <div
              style={{
                borderTop: `1px solid ${THEME.border}`,
                margin: "10px 0",
              }}
            />
            <PriceRow
              label="Total Amount"
              value={quote.priceBreakdown.total}
              bold
            />
          </>
        )}

        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={placing || loadingQuote || !quote}
          style={{
            width: "100%",
            marginTop: 18,
            padding: "13px 0",
            borderRadius: 8,
            border: "none",
            background: placing
              ? "#8A6F2E"
              : `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
            color: "#0B0B0C",
            cursor:
              placing || loadingQuote || !quote ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: THEME.fontBody,
          }}
        >
          {placing ? "Processing…" : "Place Order"}
        </button>
      </div>
    </div>
  );
}
