import { forwardRef } from "react";
import logo from "../../assets/identee-logo.png";
import { useBrandLogo, useStoreText } from "../../utils/brandLogo";
import { LEGAL_ENTITY } from "../../utils/legalEntity";
import { THEME } from "../../theme/theme";
import { imageUrl } from "../../utils/imageUrl";


const GOLD_GRADIENT = `linear-gradient(135deg, #D4AF6A 0%, #C9973F 45%, #9C6F23 100%)`;
const NAVY = "#15130F"; // swap this for a real navy hex if you want it closer to the sample

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAddress(addr) {
  if (!addr) return "—";
  return [
    addr.doorNo,
    addr.street,
    addr.nearestLandmark,
    addr.city,
    addr.state,
    addr.pin,
  ]
    .filter(Boolean)
    .join(", ");
}

function getImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return imageUrl(path.replace(/^\/+/, ""));
}

// (the page that shows this invoice says where "back" goes — it used to be a fixed http://localhost:5173 address,
// which on the live site sent the admin to their own computer; without onBack it goes to the invoices list on
// this same site)
const backToInvoices = () => window.location.assign("/admin/invoices");

function BackArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M19 12H5M5 12L12 19M5 12L12 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const InvoiceDocument = forwardRef(({ invoice, onBack = backToInvoices, backLabel = "Back to Invoices" }, ref) => {
  const brandLogo = useBrandLogo(logo); // Admin → Settings → General, else the built-in file
  const signatory = useStoreText("general.authorisedSignatory", "Sathish Kumar"); // Settings → General
  if (!invoice) return null;

  const { pricing = {} } = invoice;

  return (
    <>
      {/* ── Back Button — hidden on print/PDF export ── */}
      <button
        onClick={onBack}
        className="invoice-back-button"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "16px auto 12px",
          padding: "8px 16px",
          width: "fit-content",
          background: "#FFFFFF",
          border: "1px solid #EEE7D6",
          borderRadius: 8,
          color: "#15130F",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <BackArrowIcon />
        {backLabel}
      </button>

      <div
        ref={ref}
        id="invoice-document"
        style={{
          width: "210mm",
          minHeight: "297mm",
          margin: "0 auto",
          background: "#FFFFFF",
          color: "#15130F",
          fontFamily: "'Inter', sans-serif",
          boxSizing: "border-box",
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ height: 6, background: GOLD_GRADIENT }} />

        {/* ── Header ── */}
        <div
          style={{
            padding: "32px 48px 28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "1px solid #EEE7D6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img
              src={brandLogo || logo}
              alt="IDENTEE"
              style={{ height: 58, objectFit: "contain" }}
            />
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  color: NAVY,
                  fontWeight: 700,
                }}
              >
                YOUR STYLE. YOUR STORY. YOUR IDENTITY.
              </p>
              <p
                style={{ margin: "6px 0 0", fontSize: 10.5, color: "#5B564C" }}
              >
                12/48, Lakshmi Nagar, 1st Street, Near Post Office, Tirupur -
                641602
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <a
                  href="https://identee.co.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={contactLinkStyle}
                >
                  <GlobeIcon /> identee.co.in
                </a>
                <a href="mailto:info@identee.co.in" style={contactLinkStyle}>
                  <MailIcon /> info@identee.co.in
                </a>
                <a href="tel:+918870008311" style={contactLinkStyle}>
                  <PhoneIcon /> +91 88700 08311
                </a>
                <a
                  href="https://instagram.com/identee.co.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={contactLinkStyle}
                >
                  <InstaIcon /> @identee.co.in
                </a>
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <p
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "#15130F",
              }}
            >
              INVOICE
            </p>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12,
                color: "#9C6F23",
                fontWeight: 700,
              }}
            >
              {invoice.invoiceNumber}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A857A" }}>
              {formatDate(invoice.invoiceDate)}
            </p>
          </div>
        </div>

        <div style={{ padding: "32px 48px", flexGrow: 1 }}>
          {/* ── Customer / Order meta ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 24,
              marginBottom: 32,
              padding: "18px 20px",
              background: "#FAF7EE",
              borderRadius: 10,
              border: "1px solid #EEE7D6",
            }}
          >
            <div>
              <p style={labelStyle}>Billed To</p>
              <p style={{ margin: "6px 0 0", fontWeight: 700, fontSize: 13 }}>
                {invoice.customer?.name}
              </p>
              <p style={valueStyle}>{invoice.customer?.email}</p>
              <p style={valueStyle}>{invoice.customer?.phone}</p>
            </div>
            <div>
              <p style={labelStyle}>Ship To</p>
              <p style={{ ...valueStyle, marginTop: 6, maxWidth: 200 }}>
                {formatAddress(invoice.shippingAddress)}
              </p>
            </div>
            <div>
              <p style={labelStyle}>Order Reference</p>
              <p style={{ ...valueStyle, marginTop: 6 }}>
                {invoice.orderNumber}
              </p>
              <p style={labelStyle}>Payment Method</p>
              <p style={valueStyle}>{invoice.paymentMethod}</p>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background:
                    invoice.paymentStatus === "Paid"
                      ? "#10B98120"
                      : "#EF444420",
                  color:
                    invoice.paymentStatus === "Paid" ? "#0E9F6E" : "#DC2626",
                }}
              >
                {invoice.paymentStatus?.toUpperCase()}
              </span>
            </div>
          </div>

          {/* ── Product table ── */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: 24,
            }}
          >
            <thead>
              <tr style={{ background: GOLD_GRADIENT, color: "#FFFFFF" }}>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Variant / Colour</th>
                <th style={thStyle}>Size</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Qty</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Unit Price</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Discount</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.orderItems || []).map((item, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid #EEE7D6",
                    background: i % 2 === 1 ? "#FCFAF3" : "#FFFFFF",
                  }}
                >
                  <td style={tdStyle}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      {item.image && (
                        <img
                          src={getImageUrl(item.image)}
                          alt=""
                          style={{
                            width: 34,
                            height: 34,
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                        />
                      )}
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {[item.variant, item.color].filter(Boolean).join(" · ") ||
                      "—"}
                  </td>
                  <td style={tdStyle}>{item.size}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {item.qty}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    ₹{item.unitPrice}
                  </td>
                  <td
                    style={{ ...tdStyle, textAlign: "right", color: "#9C6F23" }}
                  >
                    {item.discountAmount > 0
                      ? `− ₹${item.discountAmount}`
                      : "—"}
                  </td>
                  <td
                    style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}
                  >
                    ₹{item.lineTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Summary ── */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 32,
            }}
          >
            <div
              style={{
                width: 300,
                border: "1px solid #EEE7D6",
                borderRadius: 10,
                padding: "16px 18px",
                background: "#FAF7EE",
              }}
            >
              <SummaryRow label={pricing.gstIncluded ? "Subtotal (incl. GST)" : "Subtotal"} value={pricing.subtotal} />
              {/* prices that include GST: the tax is shown under the total, not added (orders from 16 Oct 2026) */}
              {!pricing.gstIncluded && pricing.igstPrice > 0 && <SummaryRow label="IGST (5%)" value={pricing.igstPrice} />}
              {!pricing.gstIncluded && !(pricing.igstPrice > 0) && <SummaryRow label="CGST (2.5%)" value={pricing.cgstPrice} />}
              {!pricing.gstIncluded && !(pricing.igstPrice > 0) && <SummaryRow label="SGST (2.5%)" value={pricing.sgstPrice} />}
              {pricing.discountAmount > 0 && (
                <SummaryRow
                  label={`Coupon (${invoice.coupon?.code || ""})`}
                  value={pricing.discountAmount}
                  negative
                />
              )}
              <SummaryRow
                label="Shipping"
                value={
                  pricing.shippingPrice === 0 ? "Free" : pricing.shippingPrice
                }
              />
              <div
                style={{ borderTop: "1.5px dashed #C9973F", margin: "10px 0" }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 17,
                  fontWeight: 800,
                }}
              >
                <span>Grand Total</span>
                <span style={{ color: "#9C6F23" }}>₹{pricing.totalPrice}</span>
              </div>
              {pricing.gstIncluded && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: "#7A7062", lineHeight: 1.5 }}>
                  Includes GST: {pricing.igstPrice > 0 ? `IGST 5% ₹${pricing.igstPrice}` : `CGST 2.5% ₹${pricing.cgstPrice} · SGST 2.5% ₹${pricing.sgstPrice}`}
                </div>
              )}
            </div>
          </div>

          {/* ── Signature ── (the "Payment Info" box with placeholder bank/UPI details was taken off, 21 Oct 2026:
              customers pay online by Razorpay or cash on delivery) */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "flex-end",
              paddingTop: 12,
              borderTop: "1px solid #EEE7D6",
            }}
          >

            {/* the usual GST invoice sign-off: for the business, space to sign, the signatory's name */}
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, color: "#6B6559" }}>
                For {LEGAL_ENTITY.name}
              </p>
              <div
                style={{
                  height: 40,
                  borderBottom: "1px solid #9C9890",
                  width: 180,
                  marginBottom: 6,
                }}
              />
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "#15130F" }}>
                {signatory}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A857A" }}>
                Authorised Signatory
              </p>
            </div>
          </div>
        </div>

        {/* ── Footer — full-bleed band, pinned to the bottom, matches header bg ── */}
        <div>
          <div style={{ height: 3, background: GOLD_GRADIENT }} />
          <div
            style={{
              padding: "26px 48px",
              textAlign: "center",
              background: "#FFFFFF",
              borderTop: "1px solid #EEE7D6",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "#9C6F23",
              }}
            >
              THANK YOU FOR SHOPPING WITH IDENTEE
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "#5B564C" }}>
              <a
                href="https://identee.co.in"
                style={{ color: "#5B564C", textDecoration: "none" }}
              >
                identee.co.in
              </a>
              &nbsp;|&nbsp; Tirupur, Tamil Nadu
            </p>
          </div>
        </div>
      </div>

      {/* Hide the back button when the invoice is printed/exported to PDF */}
      <style>{`
        @media print {
          .invoice-back-button {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
});

function SummaryRow({ label, value, negative }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: "#71695B" }}>{label}</span>
      <span style={{ color: negative ? "#9C6F23" : "#15130F" }}>
        {negative ? "− " : ""}
        {typeof value === "number" ? `₹${value}` : value}
      </span>
    </div>
  );
}

const contactLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10.5,
  color: "#5B564C",
  textDecoration: "none",
};

function GlobeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#9C6F23" strokeWidth="1.6" />
      <path
        d="M3 12h18M12 3c2.5 2.5 3.8 5.8 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.8-3.8-9S9.5 5.5 12 3z"
        stroke="#9C6F23"
        strokeWidth="1.4"
        fill="none"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="#9C6F23"
        strokeWidth="1.6"
      />
      <path
        d="M3.5 6.5L12 13l8.5-6.5"
        stroke="#9C6F23"
        strokeWidth="1.6"
        fill="none"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M6.6 10.8c1.4 2.7 3.9 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1v3.4c0 .6-.4 1-1 1C10.7 21 3 13.3 3 4.7c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z"
        stroke="#9C6F23"
        strokeWidth="1.4"
        fill="none"
      />
    </svg>
  );
}

function InstaIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="#9C6F23"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="4" stroke="#9C6F23" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="#9C6F23" />
    </svg>
  );
}

const labelStyle = {
  margin: 0,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#9C9890",
};
const valueStyle = { margin: "2px 0 0", fontSize: 12, color: "#15130F" };
const thStyle = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
};
const tdStyle = { padding: "10px 12px", fontSize: 12, color: "#15130F" };

export default InvoiceDocument;
