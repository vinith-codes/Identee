import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import invoiceService from "../../services/invoiceService";
import { getLabelStyle, THEME } from "../../theme/theme";

export default function AdminInvoicesPage() {
  const { user } = useSelector((s) => s.auth);
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const theme = THEME; // fixed palette (there is no theme switcher)
  const labelStyle = getLabelStyle(theme);

  useEffect(() => {
    invoiceService
      .getAllInvoices(user.token)
      .then(setInvoices)
      .finally(() => setLoading(false));
  }, [user.token]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        padding: "32px 40px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p style={{ ...labelStyle, margin: 0, color: theme.gold }}>
        Admin · Commerce
      </p>
      <h1
        style={{
          margin: "4px 0 20px",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        Invoices
      </h1>

      {loading ? (
        <p style={{ color: theme.textMuted }}>Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p style={{ color: theme.textMuted }}>
          No invoices generated yet. Open an order's details and click "Generate
          Invoice".
        </p>
      ) : (
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: theme.surface2, textAlign: "left" }}>
                {[
                  "Invoice #",
                  "Date",
                  "Customer",
                  "Total",
                  "Payment",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      color: theme.textMuted,
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.orderId}
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <td
                    style={{
                      padding: "12px 16px",
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                  >
                    {inv.invoiceNumber}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {new Date(inv.invoiceDate).toLocaleDateString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 16px" }}>{inv.customerName}</td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontWeight: 700,
                      color: theme.goldDeep,
                    }}
                  >
                    ₹{inv.totalPrice}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {inv.isPaid ? "Paid" : "Unpaid"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>{inv.orderStatus}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => navigate(`/admin/invoices/${inv.orderId}`)}
                      style={{
                        background: "none",
                        border: `1px solid ${theme.gold}`,
                        color: theme.goldDeep,
                        borderRadius: 6,
                        padding: "5px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      View
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
