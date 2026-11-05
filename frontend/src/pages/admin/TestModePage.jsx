// Admin → Design Studio → Test as a customer (5 Nov 2026)
// The team tries the shop exactly as a customer would — design, cart, checkout, order emails — without placing
// real orders. One button opens the shop (identee.co.in) already logged in, in test mode: a yellow band shows there,
// payment is Cash on Delivery only, and every order placed is a TEST order (server: orderModel isTest) — left out of
// the orders list, the counts and the money pages, with no copy of its emails to the shop inbox. The test orders
// are listed here and can be deleted in one click.
import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import api from "../../../api.js";
import orderService from "../../services/orderService";
import { shopHref } from "../../utils/siteUrls";
import { THEME as theme, getLabelStyle } from "../../theme/theme";

const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const rupees = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const btn = (kind = "light") => ({
  minHeight: 42,
  padding: "0 18px",
  borderRadius: 999,
  border: kind === "light" ? `1.5px solid ${theme.ink}` : "none",
  background: kind === "dark" ? theme.ink : kind === "danger" ? theme.dangerBg : "#fff",
  color: kind === "dark" ? "#F0D585" : kind === "danger" ? theme.danger : theme.ink,
  fontWeight: 600,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: theme.fontBody,
  ...(kind === "danger" ? { border: `1.5px solid ${theme.dangerBorder}` } : {}),
});

const card = { minWidth: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: theme.shadow };

export default function TestModePage() {
  const { user } = useSelector((s) => s.auth);
  const token = user?.token;
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    () =>
      orderService
        .getAllOrders(token, { test: true })
        .then((list) => {
          setOrders([...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
          setError("");
        })
        .catch((e) => setError(e.response?.data?.message || "Couldn't load the test orders.")),
    [token],
  );
  useEffect(() => {
    load();
  }, [load]);

  // the shop opens in a new tab with a one-time code (2 minutes, one use); the tab is opened before the request so
  // the browser doesn't treat it as a pop-up
  const openShop = async () => {
    setOpening(true);
    const tab = window.open("", "_blank");
    try {
      const { data } = await api.post("/users/test-visit", {}, { headers: { Authorization: `Bearer ${token}` } });
      const url = shopHref(`/test-visit?code=${encodeURIComponent(data.code)}`);
      if (tab) tab.location = url;
      else window.location.assign(url);
    } catch (e) {
      if (tab) tab.close();
      toast.error(e.response?.data?.message || "Couldn't open the shop. Please try again.");
    } finally {
      setOpening(false);
    }
  };

  const deleteAll = async () => {
    const ids = (orders || []).map((o) => o._id);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length === 1 ? "this test order" : `all ${ids.length} test orders`}? Stock is put back. This can't be undone.`)) return;
    setDeleting(true);
    try {
      const res = await orderService.deleteOrders({ ids }, token);
      toast.success(res.message || "Deleted.");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Couldn't delete the test orders.");
    } finally {
      setDeleting(false);
    }
  };

  const items = (o) => (o.orderItems || []).reduce((n, i) => n + (i.qty || 0), 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18, maxWidth: 980, minWidth: 0 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontFamily: theme.fontDisplay, color: theme.text }}>Test as a customer</h1>
        <p style={{ margin: "6px 0 0", color: theme.textMuted, fontSize: 14, lineHeight: 1.5 }}>
          Try the shop exactly the way a customer sees it — design a tee, add it to the cart, check out, get the emails — without placing a real order.
        </p>
      </div>

      <div style={card}>
        <p style={{ ...getLabelStyle(theme), margin: "0 0 8px" }}>How it works</p>
        <ol style={{ margin: 0, paddingLeft: 22, listStyle: "decimal", color: theme.text, fontSize: 14, lineHeight: 1.7 }}>
          <li>Press the button. The shop opens in a new tab, already logged in as you, with a yellow <b>Test mode</b> band at the top.</li>
          <li>Do everything a customer would. Payment is <b>Cash on Delivery</b> only, so no real money moves.</li>
          <li>Every order you place there is a <b>test order</b>: it is not counted in sales, it stays out of the orders list, the print sheets and the money pages, and its emails go to you only.</li>
          <li>When you are done, press <b>Leave test mode</b> on the band, or close the tab. The test orders stay listed below until you delete them.</li>
        </ol>
        <p style={{ margin: "12px 0 0", color: "#7A5B12", fontSize: 13, fontWeight: 600 }}>
          AI pictures made while testing cost real money (about the same as for a customer). Pictures from the art library and your own uploads are free.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={btn("dark")} onClick={openShop} disabled={opening}>
            {opening ? "Opening the shop…" : "Open the shop as a test customer →"}
          </button>
          <span style={{ fontSize: 12.5, color: theme.textMuted }}>Opens identee.co.in in a new tab.</span>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <p style={{ ...getLabelStyle(theme), margin: 0, flex: 1 }}>Test orders{orders ? ` · ${orders.length}` : ""}</p>
          <button type="button" style={btn("light")} onClick={load}>Refresh</button>
          <button type="button" style={btn("danger")} onClick={deleteAll} disabled={deleting || !orders?.length}>
            {deleting ? "Deleting…" : "Delete all test orders"}
          </button>
        </div>
        {error && <p style={{ margin: 0, color: theme.danger, fontSize: 13, fontWeight: 600 }}>{error}</p>}
        {!error && orders && orders.length === 0 && <p style={{ margin: 0, color: theme.textMuted, fontSize: 13.5 }}>No test orders yet. They appear here after you place one in test mode.</p>}
        {!error && orders?.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
              <thead>
                <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 12 }}>
                  {["When", "Order", "Placed by", "Tees", "Total", "Status"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${theme.border}`, whiteSpace: "nowrap" }}>{fmt(o.createdAt)}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: "tabular-nums" }}>{o.invoiceNumber || String(o._id).slice(-8).toUpperCase()}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${theme.border}` }}>{o.user?.name || "—"}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${theme.border}` }}>{items(o)}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: "tabular-nums" }}>{rupees(o.totalPrice)}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${theme.border}` }}>{o.orderStatus}{o.isPaid ? " · paid" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: theme.textMuted }}>
          A test order can still be opened from the shop's <b>My orders</b> page while you are in test mode, so you can check the order page and its emails.
        </p>
      </div>
    </div>
  );
}
