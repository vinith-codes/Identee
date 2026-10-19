import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  fetchAllOrders,
  undoOrderStatus,
  updateOrderStatus,
} from "../../redux/slices/orderSlice";
import { THEME, labelStyle } from "../../theme/theme";
import OrderDesignsModal from "./OrderDesignsModal";

const STATUS_COLORS = {
  CREATED: { bg: "#2B2B3020", text: "#8A877F" },
  CONFIRMED: { bg: "#C9A24B20", text: "#F0D585" },
  PACKED: { bg: "#3B82F620", text: "#93C5FD" },
  OUT_FOR_DELIVERY: { bg: "#8B5CF620", text: "#C4B5FD" },
  DELIVERED: { bg: "#10B98120", text: "#6EE7B7" },
  RETURN_APPROVED: { bg: "#F5970020", text: "#FCD34D" },
  RETURN_COMPLETED: { bg: "#EF444420", text: "#FCA5A5" },
  CANCELLED: { bg: "#6B728020", text: "#9CA3AF" },
};

const STATUS_OPTIONS = Object.keys(STATUS_COLORS);

function StatusPill({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.CREATED;
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.text,
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

// Inline, per-row status changer. It offers only the moves the server allows (forward, a cancel
// before dispatch, or the return steps), asks first when a change can't be quietly taken back
// (an email goes out, stock goes back on sale, a COD order counts as paid), and the last change
// can be undone for 15 minutes (server: undoOrderStatus) — except a cancel.
const STATUS_FLOW = ["CREATED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
const canMoveTo = (from, to) => {
  if (from === to) return false;
  if (to === "CANCELLED") return ["CREATED", "CONFIRMED", "PACKED"].includes(from);
  if (to === "RETURN_APPROVED") return from === "DELIVERED";
  if (to === "RETURN_COMPLETED") return from === "RETURN_APPROVED";
  const a = STATUS_FLOW.indexOf(from);
  const b = STATUS_FLOW.indexOf(to);
  return a !== -1 && b !== -1 && b > a;
};
const UNDO_MINUTES = 15;
const canUndo = (order) =>
  Boolean(order.statusUndo?.from && order.statusUndo?.at) &&
  order.orderStatus !== "CANCELLED" &&
  Date.now() - new Date(order.statusUndo.at).getTime() < UNDO_MINUTES * 60_000;
// what the admin is told before a change that has effects outside this page
const warningFor = (order, to) => {
  if (to === "CANCELLED")
    return `Cancel this order? Its stock goes back on sale and it can't be reopened.${order.isPaid ? " It was paid online — refund it from the Razorpay dashboard." : ""}`;
  if (to === "DELIVERED")
    return `Mark as delivered? The customer can then review it${order.paymentMethod === "COD" && !order.isPaid ? ", and this cash-on-delivery order counts as paid" : ""}. You can undo it for ${UNDO_MINUTES} minutes.`;
  if (to === "PACKED" || to === "OUT_FOR_DELIVERY") return `Change to ${to}? The customer is emailed straight away (an email can't be taken back).`;
  if (to.startsWith("RETURN")) return `Change to ${to}?`;
  return null;
};

function StatusEditor({ order, updating, onChange, onUndo }) {
  const options = STATUS_OPTIONS.filter((s) => canMoveTo(order.orderStatus, s));
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(options[0] || order.orderStatus);
  const [confirming, setConfirming] = useState(null); // the warning shown before saving

  const close = () => {
    setEditing(false);
    setConfirming(null);
  };
  const link = { background: "none", border: "none", color: THEME.gold, cursor: updating ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, textDecoration: "underline", padding: 0 };
  const small = { border: `1px solid ${THEME.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", background: "none", color: THEME.textMuted };

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <StatusPill status={order.orderStatus} />
        {options.length > 0 && (
          <button type="button" onClick={() => { setValue(options[0]); setEditing(true); }} disabled={updating} style={link}>
            {updating ? "Saving…" : "Change"}
          </button>
        )}
        {!updating && canUndo(order) && (
          <button type="button" onClick={() => onUndo(order._id)} style={{ ...link, color: THEME.textMuted }} title={`Back to ${order.statusUndo.from}`}>
            Undo
          </button>
        )}
      </div>
    );
  }

  if (confirming) {
    return (
      <div role="group" aria-label="Confirm status change" style={{ display: "grid", gap: 6, maxWidth: 280 }}>
        <span style={{ fontSize: 11.5, color: THEME.text, lineHeight: 1.35 }}>{confirming}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => { onChange(order._id, value); close(); }}
            style={{ background: value === "CANCELLED" ? THEME.danger : THEME.gold, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: value === "CANCELLED" ? "#fff" : "#0B0B0C", cursor: "pointer" }}>
            Yes, {value === "CANCELLED" ? "cancel order" : "change"}
          </button>
          <button type="button" onClick={() => setConfirming(null)} style={small}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus
        style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: THEME.surface2, color: THEME.text, fontSize: 12 }}>
        {options.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button type="button"
        onClick={() => {
          const warning = warningFor(order, value);
          if (warning) setConfirming(warning);
          else {
            onChange(order._id, value);
            close();
          }
        }}
        style={{ background: THEME.gold, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#0B0B0C", cursor: "pointer" }}>
        Save
      </button>
      <button type="button" onClick={close} style={small}>Cancel</button>
    </div>
  );
}

export default function AdminOrdersPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allOrders, allOrdersLoading, allOrdersError, updatingStatusId } =
    useSelector((s) => s.orders);
  const [statusFilter, setStatusFilter] = useState("");
  const [designsFor, setDesignsFor] = useState(null); // order id → custom designs + print files

  useEffect(() => {
    dispatch(fetchAllOrders());
  }, [dispatch]);

  const handleUndo = async (id) => {
    try {
      const res = await dispatch(undoOrderStatus({ id })).unwrap();
      toast.success(res.message || "Change undone");
    } catch (err) {
      toast.error(err || "Couldn't undo the change");
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const res = await dispatch(updateOrderStatus({ id, status })).unwrap();
      if (status === "CANCELLED") {
        // shows the server's refund reminder for a paid order
        toast.success(res.message || "Order cancelled", { autoClose: 9000 });
        return;
      }
      const text = status === "DELIVERED" ? "Marked as delivered — the customer can now write a review." : `Status changed to ${status}.`;
      // a wrong pick can be put back straight from the message
      toast.success(
        ({ closeToast }) => (
          <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {text}
            <button type="button" onClick={() => { closeToast(); handleUndo(id); }}
              style={{ border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Undo
            </button>
          </span>
        ),
        { autoClose: 8000 },
      );
    } catch (err) {
      toast.error(err || "Failed to update order status");
    }
  };

  const sorted = [...(allOrders || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  const filtered = statusFilter
    ? sorted.filter((o) => o.orderStatus === statusFilter)
    : sorted;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: THEME.bg,
        color: THEME.text,
        padding: "32px 40px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p style={{ ...labelStyle, margin: 0, color: THEME.gold }}>
        Admin · Commerce
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h1
          style={{
            margin: "4px 0 20px",
            fontSize: 26,
            fontWeight: 600,
            fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          Orders
        </h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            background: THEME.surface2,
            color: THEME.text,
            fontSize: 12,
          }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {allOrdersLoading ? (
        <p style={{ color: THEME.textMuted }}>Loading orders…</p>
      ) : allOrdersError ? (
        <p style={{ color: THEME.danger }}>
          Couldn't load orders: {allOrdersError}
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ color: THEME.textMuted }}>
          No orders {statusFilter ? `with status ${statusFilter}` : "yet"}.
        </p>
      ) : (
        <div
          style={{
            border: `1px solid ${THEME.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: THEME.surface2, textAlign: "left" }}>
                {[
                  "Order",
                  "Customer",
                  "Items",
                  "Total",
                  "Payment",
                  "Status",
                  "Placed",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      color: THEME.textMuted,
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr
                  key={order._id}
                  style={{ borderTop: `1px solid ${THEME.border}` }}
                >
                  <td
                    style={{
                      padding: "12px 16px",
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: THEME.textMuted,
                    }}
                  >
                    {order.invoiceNumber || order._id.slice(-8)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {order.user?.name || "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {(order.orderItems || []).length} item
                    {(order.orderItems || []).length === 1 ? "" : "s"}
                    {(order.orderItems || []).some((i) => i.customization) && (
                      <button
                        type="button"
                        onClick={() => setDesignsFor(order._id)}
                        style={{
                          display: "block",
                          marginTop: 4,
                          background: THEME.gold,
                          color: "#141110",
                          border: "none",
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: 11.5,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Designs &amp; print files
                      </button>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontWeight: 700,
                      color: THEME.goldDeep,
                    }}
                  >
                    ₹{order.totalPrice}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {order.paymentMethod}
                    {" · "}
                    {order.isPaid ? "Paid" : "Unpaid"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusEditor
                      order={order}
                      updating={updatingStatusId === order._id}
                      onChange={handleStatusChange}
                      onUndo={handleUndo}
                    />
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 12,
                      color: THEME.textMuted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => navigate(`/admin/invoices/${order._id}`)}
                      style={{
                        background: "none",
                        border: `1px solid ${THEME.gold}`,
                        color: THEME.goldDeep,
                        borderRadius: 6,
                        padding: "5px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Generate / View Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {designsFor && <OrderDesignsModal orderId={designsFor} onClose={() => setDesignsFor(null)} />}
    </div>
  );
}
