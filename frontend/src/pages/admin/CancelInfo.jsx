// The cancel box under an order's status (7 Nov 2026, server services/orderCancel.js), shown on Admin → Orders and on
// Design Studio → Test as a customer (test orders stay out of the Orders list).
import { useState } from "react";
import { toast } from "react-toastify";
import { THEME } from "../../theme/theme";
import orderService from "../../services/orderService";

// Under the status (7 Nov 2026, server services/orderCancel.js): a customer's cancel request with Approve / Decline,
// or who cancelled and what happened to the money
export default function CancelInfo({ order, onAnswered }) {
  const [busy, setBusy] = useState(null);
  const req = order.cancelRequest;
  const r = order.refund;
  const box = { marginTop: 6, padding: "6px 8px", borderRadius: 8, fontSize: 11.5, lineHeight: 1.35, maxWidth: 240 };
  const answer = async (decision) => {
    const ask =
      decision === "approve"
        ? `Cancel this order?${order.isPaid ? ` ₹${order.totalPrice} is refunded through Razorpay straight away.` : ""} The customer is emailed${(order.printFiles || []).some((f) => f.sentAt) ? ", and the print team is told not to print it" : ""}.`
        : "Decline the request? The customer is emailed that the tee is already being made, and the order goes on.";
    if (!window.confirm(ask)) return;
    setBusy(decision);
    try {
      const token = JSON.parse(localStorage.getItem("userInfo") || "{}")?.token;
      const res = await orderService.answerCancelRequest(order._id, decision, token);
      toast.success(res.message, { autoClose: 9000 });
      onAnswered();
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't save the answer. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  if (order.orderStatus !== "CANCELLED" && req?.status === "pending") {
    const btn = { border: "none", borderRadius: 6, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: busy ? "wait" : "pointer" };
    return (
      <div style={{ ...box, background: "#FEF3E2", border: "1px solid #F5C37A", color: "#7A4B00" }}>
        <b>Customer asks to cancel</b> · {new Date(req.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
        {req.reason ? <div style={{ marginTop: 2 }}>“{req.reason}”</div> : null}
        <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
          <button type="button" disabled={!!busy} onClick={() => answer("approve")} style={{ ...btn, background: THEME.danger, color: "#fff" }}>
            {busy === "approve" ? "Cancelling…" : order.isPaid ? "Approve & refund" : "Approve"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => answer("decline")} style={{ ...btn, background: "#fff", color: THEME.text, border: `1px solid ${THEME.border}` }}>
            {busy === "decline" ? "Saving…" : "Decline"}
          </button>
        </div>
      </div>
    );
  }
  if (order.orderStatus === "CANCELLED") {
    const who = order.cancelledBy === "customer" ? "Cancelled by customer" : order.cancelledBy === "admin" ? "Cancelled by shop" : "Cancelled";
    const money = !r
      ? null
      : r.status === "processed"
        ? { text: `refunded ₹${r.amount}`, tone: "#24522F" }
        : r.status === "pending"
          ? { text: `refund of ₹${r.amount} on its way`, tone: "#24522F" }
          : { text: `refund ₹${r.amount} BY HAND in Razorpay`, tone: THEME.danger, why: r.error };
    return (
      <div style={{ ...box, background: THEME.surface2, color: THEME.textMuted }} title={money?.why || ""}>
        {who}
        {money && <span style={{ color: money.tone, fontWeight: 700 }}> · {money.text}</span>}
      </div>
    );
  }
  if (req?.status === "declined") return <div style={{ ...box, color: THEME.textMuted, padding: "2px 0" }}>Cancel request declined</div>;
  return null;
}
