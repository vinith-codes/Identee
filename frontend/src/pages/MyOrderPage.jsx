import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { THEME } from "../theme/theme";
import { imageUrl } from "../utils/imageUrl";
import EmptyState from "../components/EmptyState";
import orderService from "../services/orderService"; // your existing service (getMyOrders → GET /orders/myorders)


// Product/order images are stored as relative paths (e.g. "uploads/xyz.jpg").
// This resolves them against the backend origin instead of the frontend's.
function getImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return imageUrl(path.replace(/^\/+/, ""));
}

const STATUS_TONES = {
  CREATED: "neutral",
  CONFIRMED: "gold",
  PACKED: "gold",
  OUT_FOR_DELIVERY: "gold",
  DELIVERED: "success",
  RETURN_APPROVED: "danger",
  RETURN_COMPLETED: "danger",
  CANCELLED: "neutral",
};

// "Cancel order" (7 Nov 2026): order.cancelMode from the server — "now" cancels straight away, "ask" sends a request
// (the tee may already be printing, or it is packed). Asks first, then says what happens next.
function CancelOrder({ order, token, onDone }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const ask = order.cancelMode === "ask";
  const cancel = async () => {
    setBusy(true);
    try {
      const res = await orderService.cancelMyOrder(order._id, token);
      onDone(res.order || { ...order, orderStatus: res.status || "CANCELLED", cancelMode: null }, res.message);
    } catch (err) {
      setNote(err.response?.data?.message || "Couldn't cancel the order. Please try again or contact us.");
      setAsking(false);
    } finally {
      setBusy(false);
    }
  };
  const small = { border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: THEME.text, fontFamily: THEME.fontBody };
  if (asking) {
    return (
      <div role="group" aria-label={ask ? "Ask to cancel this order?" : "Cancel this order?"} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, fontFamily: THEME.fontBody }}>
        <span>
          {ask
            ? `${order.orderStatus === "PACKED" ? "Your order is already packed" : "Your tee may already be printing"}. Ask the shop to cancel it? We'll email you our answer.`
            : `Cancel this order?${order.isPaid ? ` ₹${order.totalPrice} will be refunded.` : ""}`}
        </span>
        <button type="button" onClick={cancel} disabled={busy} style={{ ...small, background: THEME.danger, color: "#fff", border: 0, fontWeight: 700 }}>
          {busy ? (ask ? "Sending…" : "Cancelling…") : ask ? "Yes, ask to cancel" : "Yes, cancel"}
        </button>
        <button type="button" onClick={() => setAsking(false)} disabled={busy} style={small}>Keep my order</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" onClick={() => { setNote(""); setAsking(true); }} style={{ ...small, color: THEME.danger }}>
        {ask ? "Ask to cancel" : "Cancel order"}
      </button>
      {note && <span style={{ fontSize: 12.5, color: THEME.textMuted, fontFamily: THEME.fontBody }}>{note}</span>}
    </div>
  );
}

// a line about a cancel request or a refund, under the order's heading
function cancelLine(order) {
  if (order.orderStatus === "CANCELLED") {
    const r = order.refund;
    if (!r) return order.cancelledBy === "admin" ? "This order was cancelled by the shop." : "";
    if (r.status === "processed" || r.status === "pending") return `₹${r.amount} refunded to the same payment method — it usually shows in 5–7 working days.`;
    return `₹${r.amount} will be refunded to you within 2 working days.`;
  }
  if (order.cancelRequest?.status === "pending") return "You asked to cancel this order. We'll email you our answer soon.";
  if (order.cancelRequest?.status === "declined") return "Your tee was already being made, so this order couldn't be cancelled. It will reach you as planned.";
  return "";
}

function StatusPill({ status }) {
  const tone = STATUS_TONES[status] || "neutral";
  const colors = {
    gold: { bg: THEME.goldBg, border: THEME.goldBorder, text: THEME.goldDeep },
    danger: {
      bg: THEME.dangerBg,
      border: THEME.dangerBorder,
      text: THEME.danger,
    },
    neutral: {
      bg: THEME.surface2,
      border: THEME.border,
      text: THEME.textMuted,
    },
    success: { bg: THEME.goldBg, border: THEME.gold, text: THEME.goldDeep },
  }[tone];

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: 999,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        fontFamily: THEME.fontBody,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {status?.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

const TABS = [
  { key: "all", label: "All Orders", statuses: null },
  {
    key: "active",
    label: "Active Orders",
    statuses: ["CREATED", "CONFIRMED", "PACKED"],
  },
  {
    key: "dispatched",
    label: "Dispatched",
    statuses: ["OUT_FOR_DELIVERY", "DELIVERED"],
  },
];

export default function MyOrdersPage() {
  const { user } = useSelector((state) => state.auth);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const [reloadKey, setReloadKey] = useState(0); // "Try again" after a failed load
  const [cancelNote, setCancelNote] = useState(null); // { id, text } — what the server said after a cancel / request
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await orderService.getMyOrders(user.token);
        setOrders(data);
      } catch (err) {
        setError(err.response?.data?.message || "Couldn't load your orders");
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [user.token, reloadKey]);

  const activeStatuses = TABS.find((t) => t.key === activeTab)?.statuses;
  const filteredOrders = activeStatuses
    ? orders.filter((o) => activeStatuses.includes(o.orderStatus))
    : orders;

  return (
    <div
      style={{ minHeight: "100vh", background: THEME.bg, padding: "40px 20px" }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: THEME.gold,
              fontFamily: THEME.fontBody,
            }}
          >
            Account
          </p>
          <h1
            style={{
              margin: "4px 0 0",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: THEME.text,
              fontFamily: THEME.fontDisplay,
            }}
          >
            My Orders
          </h1>
        </div>

        {loading && (
          <p style={{ color: THEME.textMuted, fontFamily: THEME.fontBody }}>
            Loading your orders…
          </p>
        )}

        {error && (
          <p style={{ color: THEME.danger, fontFamily: THEME.fontBody, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {error}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={{ border: 0, borderRadius: 999, padding: "7px 16px", background: THEME.ink, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: THEME.fontBody }}>
              Try again
            </button>
          </p>
        )}

        {!loading && !error && orders.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 999,
                  border: `1px solid ${activeTab === tab.key ? THEME.ink : THEME.border}`,
                  background: activeTab === tab.key ? THEME.ink : THEME.surface,
                  color: activeTab === tab.key ? "#FFFFFF" : THEME.textMuted,
                  fontWeight: 700,
                  fontSize: 12,
                  fontFamily: THEME.fontBody,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* the same empty state as the cart (it went to the shop, which may be coming soon) */}
        {!loading && !error && orders.length === 0 && (
          <EmptyState title="No orders yet" text="When you order a tee, you'll find it here with its status." />
        )}

        {!loading &&
          !error &&
          orders.length > 0 &&
          filteredOrders.length === 0 && (
            <p style={{ color: THEME.textMuted, fontFamily: THEME.fontBody }}>
              No orders in this tab.
            </p>
          )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filteredOrders.map((order) => (
            <Link
              key={order._id}
              to={`/order-success/${order._id}`}
              style={{
                textDecoration: "none",
                display: "block",
                background: THEME.surface,
                border: `1px solid ${THEME.border}`,
                borderRadius: 12,
                padding: 20,
                boxShadow: THEME.shadow,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: THEME.text,
                      fontFamily: THEME.fontBody,
                    }}
                  >
                    {order.invoiceNumber ||
                      `Order #${order._id.slice(-8).toUpperCase()}`}
                  </p>
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: 12,
                      color: THEME.textMuted,
                      fontFamily: THEME.fontBody,
                    }}
                  >
                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <StatusPill status={order.orderStatus} />
              </div>
              {["now", "ask"].includes(order.cancelMode) && (
                // the card is a link to the order: a click on these buttons must not open it
                <div style={{ marginBottom: 12 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <CancelOrder
                    order={order}
                    token={user.token}
                    onDone={(next, message) => {
                      setOrders((list) => list.map((o) => (o._id === order._id ? { ...o, ...next, orderItems: o.orderItems } : o)));
                      setCancelNote({ id: order._id, text: message || "Done." });
                    }}
                  />
                </div>
              )}
              {cancelNote?.id === order._id ? (
                <p role="status" style={{ margin: "0 0 12px", fontSize: 13, color: THEME.textMuted, fontFamily: THEME.fontBody }}>{cancelNote.text}</p>
              ) : (
                cancelLine(order) && <p style={{ margin: "0 0 12px", fontSize: 13, color: THEME.textMuted, fontFamily: THEME.fontBody }}>{cancelLine(order)}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                {order.orderItems.slice(0, 4).map((item, i) => (
                  <img
                    key={i}
                    src={getImageUrl(item.image || item.product?.images?.[0])}
                    alt={item.name}
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: `1px solid ${THEME.border}`,
                      background: THEME.surface2,
                    }}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src =
                        "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23f1ede2'/%3E%3C/svg%3E";
                    }}
                  />
                ))}
                {order.orderItems.length > 4 && (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 6,
                      border: `1px solid ${THEME.border}`,
                      background: THEME.surface2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: THEME.textMuted,
                      fontFamily: THEME.fontBody,
                    }}
                  >
                    +{order.orderItems.length - 4}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: THEME.textMuted,
                    fontFamily: THEME.fontBody,
                  }}
                >
                  {order.orderItems.length} item
                  {order.orderItems.length > 1 ? "s" : ""} ·{" "}
                  {order.isPaid ? "Paid" : "Payment Pending"}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: THEME.goldDeep,
                    fontFamily: THEME.fontBody,
                  }}
                >
                  ₹{order.totalPrice}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
