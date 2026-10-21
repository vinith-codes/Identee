import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  fetchAllOrders,
  undoOrderStatus,
  updateOrderStatus,
} from "../../redux/slices/orderSlice";
import { THEME, labelStyle } from "../../theme/theme";
import orderService from "../../services/orderService";
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

// ── Filters (all in the page address, ?q=…&status=…, so "Back to Orders" and a reload keep them) ──
const PAY_OPTIONS = [
  ["", "All payments"],
  ["paid", "Paid"],
  ["unpaid", "Unpaid"],
  ["cod", "Cash on delivery"],
  ["online", "Online (Razorpay)"],
];
const DATE_OPTIONS = [
  ["", "Any time"],
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["month", "This month"],
  ["custom", "Custom dates…"],
];
const KIND_OPTIONS = [
  ["", "All orders"],
  ["custom", "With custom designs"],
  ["ready", "Ready-made only"],
];
const FILTER_KEYS = ["q", "status", "pay", "when", "from", "to", "kind"];

// the first moment an order must be from (or null), for the date filter
function dateStart(when, from) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (when === "today") return d;
  if (when === "7d") return new Date(d.getTime() - 6 * 86400000);
  if (when === "30d") return new Date(d.getTime() - 29 * 86400000);
  if (when === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (when === "custom" && from) return new Date(`${from}T00:00:00`);
  return null;
}

// what the search box looks in: order number, customer, email, phone, city, pincode
function matchesSearch(o, q) {
  if (!q) return true;
  const a = o.shippingAddress || {};
  const text = [o.invoiceNumber, o.invoiceDetails?.invoiceNumber, o._id, o.user?.name, `${a.firstName || ""} ${a.lastName || ""}`, a.email, a.city, a.state, a.pin]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes(q.toLowerCase())) return true;
  // phone numbers: digits only ("98400 12345" finds 9840012345)
  const digits = q.replace(/\D/g, "");
  return digits.length >= 4 && [a.phoneNumber, a.secondaryPhone].some((ph) => String(ph || "").replace(/\D/g, "").includes(digits));
}

function applyFilters(orders, f) {
  const start = dateStart(f.when, f.from);
  const end = f.when === "custom" && f.to ? new Date(`${f.to}T23:59:59.999`) : null;
  return orders.filter((o) => {
    if (f.status && o.orderStatus !== f.status) return false;
    if (f.pay === "paid" && !o.isPaid) return false;
    if (f.pay === "unpaid" && o.isPaid) return false;
    if (f.pay === "cod" && o.paymentMethod !== "COD") return false;
    if (f.pay === "online" && o.paymentMethod !== "RAZORPAY") return false;
    const custom = (o.orderItems || []).some((i) => i.customization);
    if (f.kind === "custom" && !custom) return false;
    if (f.kind === "ready" && custom) return false;
    const placed = new Date(o.createdAt);
    if (start && placed < start) return false;
    if (end && placed > end) return false;
    return matchesSearch(o, f.q.trim());
  });
}

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
  if (to === "PACKED" || to === "OUT_FOR_DELIVERY") return `Change to ${to}? The customer is emailed straight away. If you undo it later, they get a short correction email.`;
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

// "Delete selected": what will go, typed DELETE to be sure, and (when every invoice goes) restarting the numbers
function DeleteOrdersDialog({ orders, allInvoicedPicked, onCancel, onDone }) {
  const [typed, setTyped] = useState("");
  const [restart, setRestart] = useState(false);
  const [busy, setBusy] = useState(false);
  const invoiced = orders.filter((o) => o.invoiceDetails).length;
  const label = (o) => o.invoiceNumber || o._id.slice(-8);
  const shown = orders.slice(0, 8).map(label).join(", ") + (orders.length > 8 ? ` and ${orders.length - 8} more` : "");
  const go = async () => {
    setBusy(true);
    try {
      const token = JSON.parse(localStorage.getItem("userInfo") || "{}")?.token;
      const res = await orderService.deleteOrders({ ids: orders.map((o) => o._id), restartInvoiceNumbers: restart && allInvoicedPicked }, token);
      onDone(res);
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't delete the orders. Please try again.");
      setBusy(false);
    }
  };
  return (
    <div role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()} style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 16, background: "rgba(20, 17, 16, .5)" }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="del-orders-h" style={{ width: "min(460px, 100%)", boxSizing: "border-box", background: "#fff", color: "#141110", borderRadius: 16, padding: 22, display: "grid", gap: 12, boxShadow: "0 30px 70px -20px rgba(20,17,16,.55)" }}>
        <h2 id="del-orders-h" style={{ margin: 0, fontSize: 18 }}>
          Delete {orders.length} order{orders.length === 1 ? "" : "s"}?
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#3B342B" }}>{shown}</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "#3B342B" }}>
          <li>{invoiced ? `Their ${invoiced} invoice${invoiced === 1 ? " is" : "s are"} deleted too.` : "None of them has an invoice."}</li>
          <li>Stock is put back (a cancelled order already gave it back).</li>
          <li>The customers&apos; accounts and saved designs stay.</li>
          <li>A copy of each order is kept in a backup, so a mistake can be put back by your developer.</li>
        </ul>
        {invoiced > 0 && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: allInvoicedPicked ? "#141110" : "#A39C8C" }}>
            <input type="checkbox" checked={restart && allInvoicedPicked} disabled={!allInvoicedPicked} onChange={(e) => setRestart(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              Start invoice numbers again from IDT-{new Date().getFullYear()}-000001
              {!allInvoicedPicked && " (only when every invoice is being deleted)"}
            </span>
          </label>
        )}
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          Type DELETE to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #D7CCB3", fontSize: 16 }} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid #D7CCB3", background: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={go} disabled={busy || typed.trim() !== "DELETE"} style={{ padding: "10px 16px", borderRadius: 999, border: 0, background: typed.trim() === "DELETE" ? "#B42318" : "#E8B4AD", color: "#fff", fontWeight: 700, cursor: busy || typed.trim() !== "DELETE" ? "not-allowed" : "pointer" }}>
            {busy ? "Deleting…" : `Delete ${orders.length} order${orders.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allOrders, allOrdersLoading, allOrdersError, updatingStatusId } =
    useSelector((s) => s.orders);
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ""]));
  const setFilter = (key, value) =>
    setParams(
      (cur) => {
        const next = new URLSearchParams(cur);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === "when" && value !== "custom") {
          next.delete("from");
          next.delete("to");
        }
        return next;
      },
      { replace: true },
    );
  const anyFilter = FILTER_KEYS.some((k) => f[k]);
  const clearFilters = () => setParams({}, { replace: true });
  const [designsFor, setDesignsFor] = useState(null); // order id → custom designs + print files
  // "Delete selected" — for clearing the test orders made while checking the site (to be taken out afterwards)
  const [picked, setPicked] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    dispatch(fetchAllOrders());
  }, [dispatch]);

  const handleUndo = async (id) => {
    // undoing an emailed status sends the customer a correction — say so first
    const order = allOrders.find((o) => o._id === id);
    if (["PACKED", "OUT_FOR_DELIVERY"].includes(order?.orderStatus) &&
      !window.confirm(`The customer was already emailed that the order is ${order.orderStatus.replace(/_/g, " ").toLowerCase()}.\n\nUndo it and send them a short correction email?`)) return;
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
  const filtered = applyFilters(sorted, f);
  // (only orders still in the list count as picked — a filter or a reload can hide some)
  const pickedOrders = sorted.filter((o) => picked.has(o._id));
  const allShownPicked = filtered.length > 0 && filtered.every((o) => picked.has(o._id));
  const togglePick = (id) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (allShownPicked) filtered.forEach((o) => next.delete(o._id));
      else filtered.forEach((o) => next.add(o._id));
      return next;
    });
  const control = {
    padding: "8px 12px",
    minHeight: 38,
    borderRadius: 8,
    border: `1px solid ${THEME.border}`,
    background: THEME.surface2,
    color: THEME.text,
    fontSize: 12.5,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: THEME.bg,
        color: THEME.text,
        padding: "32px clamp(16px, 4vw, 40px)",
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
      </div>

      {/* ── Filters ── */}
      <div role="search" aria-label="Filter orders" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input
          type="search"
          value={f.q}
          onChange={(e) => setFilter("q", e.target.value)}
          placeholder="Search order or invoice no., customer, phone, city…"
          aria-label="Search orders"
          style={{ ...control, flex: "1 1 240px", minWidth: 0 }}
        />
        <select value={f.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Status" style={control}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select value={f.pay} onChange={(e) => setFilter("pay", e.target.value)} aria-label="Payment" style={control}>
          {PAY_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select value={f.when} onChange={(e) => setFilter("when", e.target.value)} aria-label="Date placed" style={control}>
          {DATE_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        {f.when === "custom" && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setFilter("from", e.target.value)} aria-label="From date" style={control} />
            <span style={{ color: THEME.textMuted, fontSize: 12 }}>to</span>
            <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setFilter("to", e.target.value)} aria-label="To date" style={control} />
          </span>
        )}
        <select value={f.kind} onChange={(e) => setFilter("kind", e.target.value)} aria-label="Order type" style={control}>
          {KIND_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        {anyFilter && (
          <button type="button" onClick={clearFilters} style={{ ...control, background: "none", cursor: "pointer", fontWeight: 600 }}>
            Clear filters
          </button>
        )}
      </div>
      {pickedOrders.length > 0 && (
        <div role="region" aria-label="Selected orders" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, margin: "0 0 12px", padding: "10px 14px", borderRadius: 10, background: "#FEF3F2", border: "1px solid #F5C2BC" }}>
          <b style={{ fontSize: 13 }}>{pickedOrders.length} order{pickedOrders.length === 1 ? "" : "s"} selected</b>
          <button type="button" onClick={() => setConfirmDelete(true)} style={{ ...control, background: "#B42318", borderColor: "#B42318", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Delete selected
          </button>
          <button type="button" onClick={() => setPicked(new Set())} style={{ ...control, background: "none", cursor: "pointer" }}>
            Clear selection
          </button>
        </div>
      )}
      {!allOrdersLoading && !allOrdersError && (allOrders || []).length > 0 && (
        <p aria-live="polite" style={{ margin: "0 0 14px", fontSize: 12.5, color: THEME.textMuted }}>
          {anyFilter ? `Showing ${filtered.length} of ${(allOrders || []).length} orders` : `${(allOrders || []).length} orders`}
        </p>
      )}

      {allOrdersLoading ? (
        <p style={{ color: THEME.textMuted }}>Loading orders…</p>
      ) : allOrdersError ? (
        <p style={{ color: THEME.danger }}>
          Couldn't load orders: {allOrdersError}
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ color: THEME.textMuted }}>
          {anyFilter ? (
            <>
              No orders match these filters.{" "}
              <button type="button" onClick={clearFilters} style={{ background: "none", border: 0, padding: 0, color: THEME.goldDeep, fontWeight: 700, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
                Clear filters
              </button>
            </>
          ) : (
            "No orders yet."
          )}
        </p>
      ) : (
        <div
          style={{
            border: `1px solid ${THEME.border}`,
            borderRadius: 12,
            // (phones: the table scrolls sideways inside its box instead of being cut off)
            overflowX: "auto",
          }}
        >
          <table
            style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: THEME.surface2, textAlign: "left" }}>
                <th style={{ padding: "10px 0 10px 16px", width: 28 }}>
                  <input type="checkbox" checked={allShownPicked} onChange={toggleAllShown} aria-label={allShownPicked ? "Unselect the orders shown" : "Select all the orders shown"} style={{ width: 17, height: 17, cursor: "pointer" }} />
                </th>
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
                  style={{ borderTop: `1px solid ${THEME.border}`, background: picked.has(order._id) ? "#FEF3F2" : undefined }}
                >
                  <td style={{ padding: "12px 0 12px 16px" }}>
                    <input type="checkbox" checked={picked.has(order._id)} onChange={() => togglePick(order._id)} aria-label={`Select order ${order.invoiceNumber || order._id.slice(-8)}`} style={{ width: 17, height: 17, cursor: "pointer" }} />
                  </td>
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
                    {/* (the account may have been deleted: the order keeps the name it was placed with) */}
                    {order.user?.name || [order.shippingAddress?.firstName, order.shippingAddress?.lastName].filter(Boolean).join(" ") || "Deleted customer"}
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
                    {/* once the invoice is made (order.invoiceDetails, with its IDT-… number), the button only views it —
                        so the list shows at a glance which orders have an invoice */}
                    <button
                      onClick={() => navigate(`/admin/invoices/${order._id}`, { state: { from: "orders" } })}
                      style={{
                        background: order.invoiceDetails ? "none" : THEME.gold,
                        border: `1px solid ${THEME.gold}`,
                        color: order.invoiceDetails ? THEME.goldDeep : "#141110",
                        borderRadius: 6,
                        padding: "5px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: order.invoiceDetails ? 500 : 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {order.invoiceDetails ? "View invoice" : "Generate invoice"}
                    </button>
                    {order.invoiceDetails?.invoiceNumber && (
                      <span style={{ display: "block", marginTop: 4, fontFamily: "monospace", fontSize: 10.5, color: THEME.textMuted, whiteSpace: "nowrap" }}>
                        {order.invoiceDetails.invoiceNumber}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {designsFor && <OrderDesignsModal orderId={designsFor} onClose={() => setDesignsFor(null)} />}
      {confirmDelete && (
        <DeleteOrdersDialog
          orders={pickedOrders}
          allInvoicedPicked={sorted.filter((o) => o.invoiceDetails).every((o) => picked.has(o._id))}
          onCancel={() => setConfirmDelete(false)}
          onDone={(res) => {
            setConfirmDelete(false);
            setPicked(new Set());
            toast.success(res.message, { autoClose: 9000 });
            dispatch(fetchAllOrders());
          }}
        />
      )}
    </div>
  );
}
