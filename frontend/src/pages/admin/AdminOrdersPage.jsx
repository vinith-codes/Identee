import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  fetchAllOrders,
  updateOrderStatus,
} from "../../redux/slices/orderSlice";
import { THEME, labelStyle } from "../../theme/theme";

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

// ✅ NEW — inline, per-row status changer. Shows the current status as a
// pill; clicking it swaps in a <select> so admin can move the order
// forward (e.g. CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED).
// This is what makes "DELIVERED" actually reachable — previously the
// only status dropdown on this page was the *filter* at the top, which
// never wrote anything back to the order.
function StatusEditor({ order, updating, onChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.orderStatus);

  useEffect(() => {
    setValue(order.orderStatus);
  }, [order.orderStatus]);

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusPill status={order.orderStatus} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={updating}
          style={{
            background: "none",
            border: "none",
            color: THEME.gold,
            cursor: updating ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 600,
            textDecoration: "underline",
            padding: 0,
          }}
        >
          {updating ? "Saving…" : "Change"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          padding: "5px 8px",
          borderRadius: 6,
          border: `1px solid ${THEME.border}`,
          background: THEME.surface2,
          color: THEME.text,
          fontSize: 12,
        }}
        autoFocus
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          if (value === order.orderStatus) {
            setEditing(false);
            return;
          }
          onChange(order._id, value);
          setEditing(false);
        }}
        style={{
          background: THEME.gold,
          border: "none",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 11,
          fontWeight: 700,
          color: "#0B0B0C",
          cursor: "pointer",
        }}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(order.orderStatus);
          setEditing(false);
        }}
        style={{
          background: "none",
          border: `1px solid ${THEME.border}`,
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 11,
          color: THEME.textMuted,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}

export default function AdminOrdersPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allOrders, allOrdersLoading, allOrdersError, updatingStatusId } =
    useSelector((s) => s.orders);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    dispatch(fetchAllOrders());
  }, [dispatch]);

  const handleStatusChange = async (id, status) => {
    try {
      await dispatch(updateOrderStatus({ id, status })).unwrap();
      toast.success(
        status === "DELIVERED"
          ? "Order marked as delivered — customer can now write a review"
          : `Order status updated to ${status}`,
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
            fontFamily: "'Cormorant Garamond', serif",
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
    </div>
  );
}
