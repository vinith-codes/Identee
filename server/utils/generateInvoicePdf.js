import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

// ⚠️ Copy the EXACT hex values from your frontend theme.js here so the
// PDF matches pixel-for-pixel. These are placeholders based on what's
// visible in your components — replace with the real values.
const THEME = {
  gold: "#C9A24B",
  goldBright: "#E8C878",
  goldDeep: "#8A6F2E",
};

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

function getImageUrl(imgPath) {
  if (!imgPath) return "";
  if (/^https?:\/\//i.test(imgPath)) return imgPath;
  return `${BACKEND_URL}/${imgPath.replace(/^\/+/, "")}`;
}

// Reads the logo once and inlines it as base64 so Puppeteer doesn't
// depend on network access to render it.
function getLogoDataUri() {
  try {
    const logoPath = path.join(__dirname, "../assets/identee-logo.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null; // header still renders fine without a logo
  }
}

function buildInvoiceHtml(invoice) {
  const pricing = invoice.pricing || {};
  const logo = getLogoDataUri();

  const rows = (invoice.orderItems || [])
    .map(
      (item) => `
      <tr>
        <td class="td">
          <div class="item-cell">
            ${
              item.image
                ? `<img src="${getImageUrl(item.image)}" class="item-img" />`
                : ""
            }
            <span>${item.name}</span>
          </div>
        </td>
        <td class="td">${[item.variant, item.color].filter(Boolean).join(" · ") || "—"}</td>
        <td class="td">${item.size || "—"}</td>
        <td class="td" style="text-align:center">${item.qty}</td>
        <td class="td" style="text-align:right">₹${item.unitPrice}</td>
        <td class="td" style="text-align:right;color:${THEME.goldDeep}">
          ${item.discountAmount > 0 ? `− ₹${item.discountAmount}` : "—"}
        </td>
        <td class="td" style="text-align:right;font-weight:700">₹${item.lineTotal}</td>
      </tr>`,
    )
    .join("");

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: 'Inter', Arial, sans-serif; color: #15130F; }
      #invoice { width: 210mm; min-height: 297mm; background: #fff; }
      .header {
        background: #2A2620; padding: 36px 48px; display: flex;
        justify-content: space-between; align-items: flex-start;
        border-bottom: 3px solid ${THEME.gold};
      }
      .header-left { display: flex; align-items: center; gap: 16px; }
      .logo { height: 56px; object-fit: contain; }
      .tagline { margin: 0; font-size: 10px; letter-spacing: 0.14em; color: ${THEME.gold}; font-weight: 700; }
      .addr { margin: 4px 0 0; font-size: 10.5px; color: #D8D2C4; }
      .contact { margin: 2px 0 0; font-size: 10.5px; color: #D8D2C4; }
      .invoice-title { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.08em; color: #fff; text-align: right; }
      .invoice-number { margin: 6px 0 0; font-size: 12px; color: ${THEME.gold}; font-weight: 700; text-align: right; }
      .invoice-date { margin: 2px 0 0; font-size: 11px; color: #D8D2C4; text-align: right; }
      .body { padding: 32px 48px; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 32px; }
      .label { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9C9890; }
      .value { margin: 2px 0 0; font-size: 12px; color: #15130F; }
      table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      .th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; background: #0B0B0C; color: #fff; }
      .td { padding: 10px 12px; font-size: 12px; color: #15130F; border-bottom: 1px solid #ECE4D2; }
      .item-cell { display: flex; align-items: center; gap: 10px; }
      .item-img { width: 34px; height: 34px; object-fit: cover; border-radius: 4px; }
      .summary-wrap { display: flex; justify-content: flex-end; }
      .summary { width: 280px; }
      .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
      .summary-row .k { color: #71695B; }
      .summary-divider { border-top: 2px solid #0B0B0C; margin: 8px 0; }
      .grand-total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; }
      .grand-total .v { color: ${THEME.goldDeep}; }
      .footer { margin-top: 40px; padding: 24px 48px; border-top: 1px solid #ECE4D2; text-align: center; }
      .footer-title { margin: 0; font-size: 13px; font-weight: 700; color: #0B0B0C; }
      .footer-tag { margin: 4px 0 0; font-size: 11px; color: ${THEME.gold}; letter-spacing: 0.06em; }
      .status-pill {
        display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 700;
        padding: 2px 8px; border-radius: 999px;
        background: ${invoice.paymentStatus === "Paid" ? "#10B98120" : "#EF444420"};
        color: ${invoice.paymentStatus === "Paid" ? "#0E9F6E" : "#DC2626"};
      }
    </style>
  </head>
  <body>
    <div id="invoice">
      <div class="header">
        <div class="header-left">
          ${logo ? `<img src="${logo}" class="logo" />` : ""}
          <div>
            <p class="tagline">YOUR STYLE. YOUR STORY. YOUR IDENTITY.</p>
            <p class="addr">12/48, Lakshmi Nagar, 1st Street, Near Post Office, Tirupur - 641602</p>
            <p class="contact">identee.co.in &nbsp;·&nbsp; info@identee.co.in &nbsp;·&nbsp; +91 88700 08311 &nbsp;·&nbsp; @identee.co.in</p>
          </div>
        </div>
        <div>
          <p class="invoice-title">INVOICE</p>
          <p class="invoice-number">${invoice.invoiceNumber}</p>
          <p class="invoice-date">${formatDate(invoice.invoiceDate)}</p>
        </div>
      </div>

      <div class="body">
        <div class="meta-grid">
          <div>
            <p class="label">Billed To</p>
            <p class="value" style="margin-top:6px;font-weight:700;font-size:13px">${invoice.customer?.name || ""}</p>
            <p class="value">${invoice.customer?.email || ""}</p>
            <p class="value">${invoice.customer?.phone || ""}</p>
          </div>
          <div>
            <p class="label">Ship To</p>
            <p class="value" style="margin-top:6px;max-width:200px">${formatAddress(invoice.shippingAddress)}</p>
          </div>
          <div>
            <p class="label">Order Reference</p>
            <p class="value" style="margin-top:6px">${invoice.orderNumber || ""}</p>
            <p class="label">Payment Method</p>
            <p class="value">${invoice.paymentMethod || ""}</p>
            <span class="status-pill">${(invoice.paymentStatus || "").toUpperCase()}</span>
          </div>
        </div>

        <table class="items">
          <thead>
            <tr>
              <th class="th">Item</th>
              <th class="th">Variant / Colour</th>
              <th class="th">Size</th>
              <th class="th" style="text-align:center">Qty</th>
              <th class="th" style="text-align:right">Unit Price</th>
              <th class="th" style="text-align:right">Discount</th>
              <th class="th" style="text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="summary-wrap">
          <div class="summary">
            <div class="summary-row"><span class="k">${pricing.gstIncluded ? "Subtotal (incl. GST)" : "Subtotal"}</span><span>₹${pricing.subtotal ?? 0}</span></div>
            ${
              pricing.gstIncluded
                ? "" // prices include GST: shown under the total instead of being added
                : `<div class="summary-row"><span class="k">CGST (2.5%)</span><span>₹${pricing.cgstPrice ?? 0}</span></div>
            <div class="summary-row"><span class="k">SGST (2.5%)</span><span>₹${pricing.sgstPrice ?? 0}</span></div>`
            }
            ${
              pricing.discountAmount > 0
                ? `<div class="summary-row"><span class="k">Coupon (${invoice.coupon?.code || ""})</span><span style="color:${THEME.gold}">− ₹${pricing.discountAmount}</span></div>`
                : ""
            }
            <div class="summary-row"><span class="k">Shipping</span><span>${
              pricing.shippingPrice === 0 ? "Free" : `₹${pricing.shippingPrice}`
            }</span></div>
            <div class="summary-divider"></div>
            <div class="grand-total"><span>Grand Total</span><span class="v">₹${pricing.totalPrice ?? 0}</span></div>
            ${pricing.gstIncluded ? `<div class="summary-row" style="font-size:11px"><span class="k">Includes GST: CGST 2.5% ₹${pricing.cgstPrice ?? 0} · SGST 2.5% ₹${pricing.sgstPrice ?? 0}</span><span></span></div>` : ""}
          </div>
        </div>
      </div>

      <div class="footer">
        <p class="footer-title">Thank you for shopping with IDENTEE.</p>
        <p class="footer-tag">YOUR STYLE. YOUR STORY. YOUR IDENTITY.</p>
      </div>
    </div>
  </body>
  </html>`;
}

/**
 * Renders the invoice HTML with Puppeteer and returns a PDF Buffer,
 * sized exactly to the content (same trick the frontend does with
 * html2pdf — avoids a leftover blank second page).
 */
export async function generateInvoicePdfBuffer(invoice) {
  const html = buildInvoiceHtml(invoice);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Measure the ACTUAL rendered height of #invoice, then size the PDF
    // page to match exactly — same fix as the frontend's handleDownloadPdf,
    // otherwise Puppeteer defaults to a fixed page height and any content
    // taller than one page (or shorter, leaving trailing whitespace)
    // spills onto a blank second page.
    const { widthPx, heightPx } = await page.evaluate(() => {
      const el = document.getElementById("invoice");
      const rect = el.getBoundingClientRect();
      return { widthPx: rect.width, heightPx: rect.height };
    });

    const pxToMm = (px) => (px * 25.4) / 96;
    const pageWidthMm = pxToMm(widthPx);
    const pageHeightMm = pxToMm(heightPx);

    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: `${pageWidthMm}mm`,
      height: `${pageHeightMm}mm`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: "1", // guarantee a single page even if rounding leaves a hairline overflow
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
