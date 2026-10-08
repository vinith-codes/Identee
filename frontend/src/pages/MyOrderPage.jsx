import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { THEME } from "../theme/theme";
import { imageUrl } from "../utils/imageUrl";
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
};

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

  useEffect(() => {
    const fetchOrders = async () => {
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
  }, [user.token]);

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
              fontSize: 26,
              fontWeight: 600,
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
          <p style={{ color: THEME.danger, fontFamily: THEME.fontBody }}>
            {error}
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
                  border: `1px solid ${THEME.border}`,
                  background:
                    activeTab === tab.key ? THEME.gold : THEME.surface,
                  color: activeTab === tab.key ? "#0B0B0C" : THEME.textMuted,
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

        {!loading && !error && orders.length === 0 && (
          <div
            style={{
              background: THEME.surface,
              border: `1px solid ${THEME.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
              boxShadow: THEME.shadow,
            }}
          >
            <p
              style={{
                margin: 0,
                color: THEME.textMuted,
                fontFamily: THEME.fontBody,
                marginBottom: 16,
              }}
            >
              You haven't placed any orders yet.
            </p>
            <Link
              to="/products"
              style={{
                display: "inline-block",
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
                color: "#0B0B0C",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: THEME.fontBody,
                textDecoration: "none",
              }}
            >
              Start Shopping
            </Link>
          </div>
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
