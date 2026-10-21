import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import html2pdf from "html2pdf.js";
import InvoiceDocument from "../admin/InvoiceDocument";
import invoiceService from "../../services/invoiceService";
import { THEME } from "../../theme/theme";

export default function InvoicePreviewPage() {
  const { orderId } = useParams();
  const { user } = useSelector((s) => s.auth);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const printRef = useRef(null);
  // Back goes to the list the invoice was opened from (the client's wish, 21 Oct 2026): opened from Orders →
  // "Back to Orders" (with the filters set there: the browser's own back step keeps them), else → "Back to
  // Invoices". It used to be a fixed http://localhost:5173 address, which on the live site led nowhere.
  const navigate = useNavigate();
  const location = useLocation();
  const fromOrders = location.state?.from === "orders";
  const backLabel = fromOrders ? "Back to Orders" : "Back to Invoices";
  const goBack = () => {
    if (fromOrders) return location.key !== "default" ? navigate(-1) : navigate("/admin/orders");
    return navigate("/admin/invoices");
  };

  // Opening the page only LOOKS for an invoice. Making one assigns the next invoice number and freezes
  // the details, so that is a button the admin presses on purpose.
  const [noInvoice, setNoInvoice] = useState(false);
  useEffect(() => {
    let cancelled = false;
    invoiceService
      .getExistingInvoice(orderId, user.token)
      .then((data) => {
        if (!cancelled) setInvoice(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) setNoInvoice(true);
        else setError(err.response?.data?.message || "Couldn't load this invoice");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, user.token]);
  const generate = () => {
    setLoading(true);
    setError("");
    invoiceService
      .generateInvoice(orderId, user.token)
      .then((data) => {
        setInvoice(data);
        setNoInvoice(false);
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't make the invoice"))
      .finally(() => setLoading(false));
  };

  const handleDownloadPdf = () => {
    if (!printRef.current) return;

    const el = printRef.current;
    const pxHeight = el.offsetHeight;
    const pxWidth = el.offsetWidth;
    // Convert the actual rendered content height to mm at 96dpi,
    // so the PDF page is exactly as tall as the content — no
    // leftover sliver forcing a blank second page.
    const pxToMm = (px) => (px * 25.4) / 96;
    const pageWidthMm = 210; // A4 width, fixed
    const pageHeightMm = pxToMm(pxHeight * (210 / pxToMm(pxWidth)));

    html2pdf()
      .set({
        margin: 0,
        filename: `${invoice.invoiceNumber}.pdf`,
        image: { type: "png" }, // png instead of jpeg — no compression artifacts on the black/gold header
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: {
          unit: "mm",
          format: [pageWidthMm, pageHeightMm],
          orientation: "portrait",
        },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(el)
      .save();
  };

  const handlePrint = async () => {
    if (!printRef.current) return;

    const el = printRef.current;
    const pxToMm = (px) => (px * 25.4) / 96;
    const pageWidthMm = 210;
    const pageHeightMm = pxToMm(
      el.offsetHeight * (210 / pxToMm(el.offsetWidth)),
    );

    const worker = html2pdf()
      .set({
        margin: 0,
        image: { type: "png" },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: {
          unit: "mm",
          format: [pageWidthMm, pageHeightMm],
          orientation: "portrait",
        },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(el);

    const pdfBlob = await worker.outputPdf("blob");
    const blobUrl = URL.createObjectURL(pdfBlob);

    const printWindow = window.open(blobUrl);
    if (!printWindow) {
      toast.error("Please allow pop-ups to print the invoice.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.print();
    });
  };

  const handleEmail = async () => {
    setEmailing(true);
    try {
      const res = await invoiceService.emailInvoice(orderId, user.token);
      toast.success(res.message || "Invoice emailed");
      setShowEmailConfirm(true);
    } catch (err) {
      // Fallback so the button never dead-ends even if backend email
      // isn't wired to your SMTP provider yet.
      toast.error(err.response?.data?.message || "Couldn't send automatically");
      const subject = encodeURIComponent(
        `Your IDENTEE Invoice ${invoice.invoiceNumber}`,
      );
      const body = encodeURIComponent(
        `Hi ${invoice.customer?.name},\n\nYour invoice ${invoice.invoiceNumber} total is ₹${invoice.pricing?.totalPrice}.\n\nThank you for shopping with IDENTEE.`,
      );
      window.open(
        `mailto:${invoice.customer?.email}?subject=${subject}&body=${body}`,
      );
    } finally {
      setEmailing(false);
    }
  };

  const handleWhatsApp = () => {
    const phone = (invoice.customer?.phone || "").replace(/\D/g, "");
    const text = encodeURIComponent(
      `Hi ${invoice.customer?.name}, your IDENTEE invoice ${invoice.invoiceNumber} for ₹${invoice.pricing?.totalPrice} is ready. Thank you for shopping with IDENTEE — Your Style. Your Story. Your Identity.`,
    );
    const url = phone
      ? `https://wa.me/91${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) return <PageWrap>Loading invoice…</PageWrap>;
  if (error)
    return (
      <PageWrap error back={<BackLink onClick={goBack}>{backLabel}</BackLink>}>
        {error}
      </PageWrap>
    );
  if (noInvoice)
    return (
      <PageWrap back={<BackLink onClick={goBack}>{backLabel}</BackLink>}>
        <p style={{ margin: "0 0 6px", fontWeight: 700 }}>No invoice has been made for this order yet.</p>
        <p style={{ margin: "0 0 18px", fontSize: 14, color: "#6B6559" }}>
          Making it assigns the next invoice number (IDT-…) and freezes the invoice details as they are now. That can't be undone.
        </p>
        <ActionButton onClick={generate}>Generate the invoice</ActionButton>
      </PageWrap>
    );

  return (
    <div
      style={{ minHeight: "100vh", background: "#F3F1EC", padding: "32px 0" }}
    >
      <div className="invoice-actions" style={actionsBarStyle}>
        <ActionButton onClick={handleDownloadPdf}>Download PDF</ActionButton>
        <ActionButton onClick={handlePrint}>Print Invoice</ActionButton>
        <ActionButton onClick={handleEmail} disabled={emailing}>
          {emailing ? "Sending…" : "Email Invoice"}
        </ActionButton>
        <ActionButton onClick={handleWhatsApp}>Share via WhatsApp</ActionButton>
      </div>

      <div
        style={{
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
          width: "fit-content",
          margin: "0 auto",
        }}
      >
        <InvoiceDocument ref={printRef} invoice={invoice} onBack={goBack} backLabel={backLabel} />
      </div>

      {showEmailConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowEmailConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "32px 28px",
              width: 340,
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#10B98120",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 24,
              }}
            >
              ✓
            </div>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 16,
                fontWeight: 700,
                color: "#0B0B0C",
              }}
            >
              Invoice Sent
            </p>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#71695B" }}>
              {invoice.invoiceNumber} was emailed to {invoice.customer?.email}.
            </p>
            <button
              type="button"
              onClick={() => setShowEmailConfirm(false)}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
                color: "#0B0B0C",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <style>{`
    @page {
    margin: 12mm;
  }
  @media print {
    body * {
      visibility: hidden;
    }
    #invoice-document, #invoice-document * {
      visibility: visible;
    }
    #invoice-document {
      position: absolute;
      top: 0;
      left: 0;
      width: 210mm;
      box-shadow: none !important;
    }
    .invoice-actions {
      display: none !important;
    }
    body {
      background: #fff !important;
    }
  }
`}</style>
    </div>
  );
}

function ActionButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 18px",
        borderRadius: 8,
        border: `1px solid ${THEME.gold}`,
        background: disabled
          ? "#8A6F2E"
          : `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
        color: "#0B0B0C",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

// back: a way back to the list (no invoice yet, or it couldn't load — never a page without a way out)
function PageWrap({ children, error, back }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "24px 16px",
        boxSizing: "border-box",
        textAlign: "center",
        color: error ? THEME.danger : "#71695B",
      }}
    >
      <div style={{ maxWidth: 520 }}>{children}</div>
      {back}
    </div>
  );
}

function BackLink({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "#FFFFFF", border: "1px solid #EEE7D6", borderRadius: 8, padding: "8px 16px", minHeight: 40, color: "#15130F", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
    >
      ← {children}
    </button>
  );
}

const actionsBarStyle = {
  display: "flex",
  gap: 12,
  justifyContent: "center",
  marginBottom: 20,
  flexWrap: "wrap",
};
